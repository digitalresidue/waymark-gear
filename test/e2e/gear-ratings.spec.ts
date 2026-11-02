import { test, expect, Browser, APIRequestContext } from '@playwright/test';

import { testRoot } from './utils';
import { registerUser, generateTestUser } from './auth-utils';

// Star ratings on catalog gear: one per person, changeable; well-rated gear
// comes first in searches, the picker and Explore.

const url = (p: string) => new URL(p, testRoot).toString();

async function rater(browser: Browser, n: number, tag: string) {
    const ctx = await browser.newContext();
    const username = `rt${n}${tag}`.toLowerCase().slice(0, 30);
    const r = await ctx.request.post(url('/register'), { data: { username, email: `${username}@example.com`, password: 'testtest1' } });
    expect(r.status()).toBe(200);
    return ctx.request;
}
const rate = async (req: APIRequestContext, id: string, stars: number) => {
    const r = await req.post(url(`/api/catalog/${id}/rating`), { data: { stars } });
    expect(r.status()).toBe(200);
    return r.json();
};

test('one rating per person, changeable; searches put well-rated gear first', async ({ browser }, testInfo) => {
    test.setTimeout(90_000);
    const owner = await (await browser.newContext()).newPage();
    const ownerName = `wge2eowner${testInfo.workerIndex}`;
    const reg = await owner.request.post(url('/register'), { data: { username: ownerName, email: `${ownerName}@example.com`, password: 'testtest' } });
    if (reg.status() !== 200) expect((await owner.request.post(url('/signin'), { data: { username: ownerName, password: 'testtest' } })).status()).toBe(200);

    const tag = `Rt${Date.now().toString(36)}`;
    const csv = ['sku,name,brand,category,weight,unit,price,status',
        `${tag}-1,Meh tent,${tag},Tent,20,oz,100,published`,
        `${tag}-2,Unrated tent,${tag},Tent,21,oz,100,published`,
        `${tag}-3,Loved tent,${tag},Tent,22,oz,100,published`,
        `${tag}-4,One-vote tent,${tag},Tent,23,oz,100,published`].join('\n');
    expect((await owner.request.post(url('/api/admin/catalog/import/apply'), { data: { csv } })).ok()).toBe(true);
    const items = (await (await owner.request.get(url(`/api/catalog?q=${tag}&sort=name`))).json()).items;
    const id = (name: string) => items.find((i: { name: string }) => i.name === name).id;

    // Signed out: can't rate.
    const anon = await browser.newContext();
    expect((await anon.request.post(url(`/api/catalog/${id('Loved tent')}/rating`), { data: { stars: 5 } })).status()).toBe(401);

    const raters = await Promise.all([1, 2, 3, 4, 5].map((n) => rater(browser, n, tag)));
    // One person, changing their mind: still one rating.
    expect(await rate(raters[0], id('One-vote tent'), 2)).toMatchObject({ average: 2, count: 1, mine: 2 });
    expect(await rate(raters[0], id('One-vote tent'), 4)).toMatchObject({ average: 4, count: 1, mine: 4 });
    expect(await rate(raters[0], id('One-vote tent'), 5)).toMatchObject({ average: 5, count: 1, mine: 5 });
    expect((await raters[0].post(url(`/api/catalog/${id('One-vote tent')}/rating`), { data: { stars: 6 } })).status()).toBe(400);
    for (const r of raters) await rate(r, id('Loved tent'), 5);
    await rate(raters[1], id('Meh tent'), 1);

    // Five 5s (4.25) beat one 5 (3.75); unrated (3.5) before a 1 (3.08).
    const order = (await (await anon.request.get(url(`/api/catalog?q=${tag}`))).json()).items.map((i: { name: string }) => i.name);
    expect(order).toEqual(['Loved tent', 'One-vote tent', 'Unrated tent', 'Meh tent']);
    const loved = (await (await anon.request.get(url(`/api/catalog?q=${tag}`))).json()).items[0];
    expect(loved.rating).toEqual({ average: 5, count: 5 });

    // Taking a rating back.
    expect(await rate(raters[1], id('Meh tent'), 0)).toMatchObject({ count: 0, mine: null });

    // Explore: top rated is the default order, with stars on the cards.
    await anon.newPage().then(async (p) => {
        await p.goto(url(`/explore/tent?brand=${tag.toLowerCase()}`));
        const names = await p.getByTestId('explore-item').filter({ visible: true }).locator('.wgGearCardName').allTextContents();
        expect(names.slice(0, 2)).toEqual(['Loved tent', 'One-vote tent']);
        await expect(p.getByTestId('explore-item').filter({ visible: true }).filter({ hasText: 'Loved tent' }).getByTestId('explore-rating')).toContainText('5 (5)');
        await p.close();
    });
});

test('rating from the gear page: pick, change, remove', async ({ browser }, testInfo) => {
    test.setTimeout(60_000);
    const owner = await (await browser.newContext()).newPage();
    const ownerName = `wge2eowner${testInfo.workerIndex}`;
    const reg = await owner.request.post(url('/register'), { data: { username: ownerName, email: `${ownerName}@example.com`, password: 'testtest' } });
    if (reg.status() !== 200) expect((await owner.request.post(url('/signin'), { data: { username: ownerName, password: 'testtest' } })).status()).toBe(200);
    const tag = `Rg${Date.now().toString(36)}`;
    const csv = ['sku,name,brand,category,weight,unit,price,status', `${tag}-1,Page quilt,${tag},Quilt,20,oz,300,published`].join('\n');
    expect((await owner.request.post(url('/api/admin/catalog/import/apply'), { data: { csv } })).ok()).toBe(true);
    const gear = (await (await owner.request.get(url(`/api/catalog?q=${tag}`))).json()).items[0];

    // Signed out: a sign-in link, no stars to click.
    const visitor = await (await browser.newContext()).newPage();
    await visitor.goto(url(`/g/${gear.id}`));
    await expect(visitor.getByTestId('gear-rating')).toContainText('No ratings yet');
    await expect(visitor.getByTestId('rate-mine')).toHaveCount(0);

    const page = await (await browser.newContext()).newPage();
    const u = generateTestUser('rtpg');
    await registerUser(page, u.username, u.password, u.email);
    await expect(page.getByTestId('item-row').first()).toBeVisible();
    await page.goto(url(`/g/${gear.id}`));
    const mine = page.getByTestId('rate-mine');
    await mine.locator('label').nth(3).click(); // 4 stars
    await expect(mine).toContainText('Saved: 4 stars');
    await expect(page.getByTestId('gear-rating')).toContainText('4 / 5 from 1 rating');
    // Keyboard works too: arrow to 5.
    await page.getByTestId('rate-4').focus();
    await page.keyboard.press('ArrowRight');
    await expect(mine).toContainText('Saved: 5 stars');
    await expect(page.getByTestId('gear-rating')).toContainText('5 / 5 from 1 rating');

    // It's remembered.
    await page.reload();
    await expect(page.getByTestId('rate-5')).toBeChecked();
    await expect(mine).toContainText('You gave it 5 stars');
    await page.getByTestId('rate-clear').click();
    await expect(mine).toContainText('removed');
    await expect(page.getByTestId('gear-rating')).toContainText('No ratings yet');
});
