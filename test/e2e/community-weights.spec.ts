import { test, expect, Browser, APIRequestContext } from '@playwright/test';

import { generateTestUser } from './auth-utils';
import { testRoot, openExplore } from './utils';

// Community weights (server/community-weights.js): when ten or more members
// set their own weight for the same catalog gear and agree, the catalog shows
// their weight on the gear page, Compare and Explore, and new gear starts
// from it. Nobody's own gear changes. Gear check calls out list weights far
// from the catalog's.

const url = (p: string) => new URL(p, testRoot).toString();

async function owner(browser: Browser, workerIndex: number) {
    const page = await (await browser.newContext()).newPage();
    const username = `wge2eowner${workerIndex}`;
    const r = await page.request.post(url('/register'), { data: { username, email: `${username}@example.com`, password: 'testtest' } });
    if (r.status() !== 200) expect((await page.request.post(url('/signin'), { data: { username, password: 'testtest' } })).status()).toBe(200);
    return page;
}

async function signinData(request: APIRequestContext) {
    const res = await request.post(url('/signin'), { data: {} });
    expect(res.status()).toBe(200);
    const body = await res.json();
    return { ...body, library: JSON.parse(body.library) };
}

// A member with this catalog gear in their closet at their own weight
// (weightOwn), or at the catalog's as added (synced, not their own).
async function member(playwright: any, tag: string, n: number, catalogId: string, grams: number, own = true) {
    const request: APIRequestContext = await playwright.request.newContext();
    const user = generateTestUser(`cw${n}`);
    expect((await request.post(url('/register'), { data: { username: user.username, email: user.email, password: user.password } })).status()).toBe(200);
    const start = await signinData(request);
    const item = {
        id: 9000 + n, name: `Trail pack ${tag}`, description: '', weight: Math.round(grams * 1000), authorUnit: 'g', price: 0, image: '', imageUrl: '', url: '',
        catalogId, catalogSync: !own, ...(own ? { weightOwn: true } : {}),
    };
    const save = await request.post(url('/saveLibrary'), {
        data: { username: user.username, sync_token: start.sync_token, changes: { items: { upsert: [item], delete: [] } } },
    });
    expect(save.status()).toBe(200);
    return { request, user };
}

test('ten members agreeing set the catalog\'s weight; nobody\'s own gear changes; Gear check calls out a far-off weight', async ({ browser, page, playwright }, testInfo) => {
    test.setTimeout(120000);
    const ownerPage = await owner(browser, testInfo.workerIndex);
    const tag = `cw${Date.now().toString(36)}${testInfo.workerIndex}`;
    // The brand says 20 oz (567 g).
    const csv = ['sku,name,brand,category,weight,unit,status', `${tag}-1,Trail pack ${tag},${tag},Backpack,20,oz,published`].join('\n');
    expect((await ownerPage.request.post(url('/api/admin/catalog/import/apply'), { data: { csv } })).ok()).toBe(true);
    const admin = async () => (await (await ownerPage.request.get(url(`/api/admin/catalog?q=${encodeURIComponent(`Trail pack ${tag}`)}`))).json()).items[0];
    const id = (await admin()).id;

    // Nine weigh it: not enough yet. One more only has the catalog's weight
    // (synced, never set by them): that doesn't count.
    const weights = [598, 601, 603, 600, 597, 605, 602, 599, 600];
    const members = [];
    for (const [n, w] of weights.entries()) members.push(await member(playwright, tag, n, id, w));
    const synced = await member(playwright, tag, 50, id, 567, false);
    await expect.poll(async () => (await admin()).community, { timeout: 15000 }).toMatchObject({ status: 'waiting', total: 9 });
    await page.goto(url(`/g/${id}`));
    await expect(page.getByTestId('gear-weight')).toHaveText('20 oz');
    await expect(page.getByTestId('gear-weighed')).toHaveCount(0);

    // The tenth, and one who typed ounces as grams (left out).
    members.push(await member(playwright, tag, 9, id, 604));
    members.push(await member(playwright, tag, 10, id, 21.2));
    await expect.poll(async () => (await admin()).community, { timeout: 15000 }).toMatchObject({ status: 'ready', count: 10, total: 11, weightMg: 600500 });
    const entry = await admin();
    expect(entry.brandWeightMg).toBe(Math.round(20 * 28349.5));
    expect(entry.weightMg).toBe(600500);
    // The owner's form still edits the brand's weight.
    expect(entry.weight).toBe(20);

    // The gear page: members' weight, who weighed it, and what the brand says.
    await page.goto(url(`/g/${id}`));
    await expect(page.getByTestId('gear-weight')).toHaveText(/^21\.(18|2) oz$/);
    await expect(page.getByTestId('gear-weighed')).toContainText('Weighed by 10 hikers');
    await expect(page.getByTestId('gear-brand-weight')).toHaveText('Brand says 20 oz');

    // Compare and Explore show it too; the public API gives no count before ten.
    await page.goto(url(`/compare?ids=${id}`));
    await expect(page.getByTestId('compare-weight')).toContainText(/21\.(18|2) oz/);
    await expect(page.getByTestId('compare-weighed')).toContainText('Weighed by 10 hikers');
    const pub = (await (await page.request.get(url(`/api/catalog?ids=${id}`))).json()).items[0];
    expect(pub).toMatchObject({ weightMg: 600500, community: { weightMg: 600500, count: 10 } });
    await openExplore(page, url(`/explore/pack?brand=${tag}`));
    await expect(page.getByTestId('explore-item').filter({ hasText: tag })).toContainText(/21\.(18|2) oz/);

    // Nobody's own gear changed: not the members', not the one with the catalog's weight.
    const lib = async (r: APIRequestContext) => (await signinData(r)).library.items.find((i: any) => i.name === `Trail pack ${tag}`);
    expect((await lib(members[0].request)).weight).toBe(598000);
    expect((await lib(members[10].request)).weight).toBe(21200);
    const kept = await lib(synced.request);
    expect(kept.weight).toBe(567000);
    expect(kept.weightOwn).toBeUndefined();

    // Gear check: the 21.2 g one looks like ounces typed as grams.
    const check = await (await members[10].request.post(url('/api/insights'), {
        data: { items: [{ itemId: 9010, name: `Trail pack ${tag}`, category: 'Pack', weightMg: 21200, catalogId: id }] },
    })).json();
    expect(check.weightChecks).toEqual([expect.objectContaining({ itemId: 9010, yoursMg: 21200, catalogMg: 600500, weighedBy: 10, slip: { typed: 'g', meant: 'oz' } })]);
    // Close to the catalog: nothing to check.
    const fine = await (await members[0].request.post(url('/api/insights'), {
        data: { items: [{ itemId: 9000, name: `Trail pack ${tag}`, category: 'Pack', weightMg: 598000, catalogId: id }] },
    })).json();
    expect(fine.weightChecks).toEqual([]);

    // The owner's catalog says where it stands.
    await ownerPage.goto(url('/owner/catalog'));
    await ownerPage.getByPlaceholder('Search name, brand, SKU').fill(`Trail pack ${tag}`);
    await expect(ownerPage.getByTestId(`community-${id}`)).toHaveText(/Members: 21\.2 oz, 10 of 11 agree/);

    for (const m of [...members, synced]) await m.request.dispose();
    await ownerPage.context().close();
});

test('a weight you set on catalog gear is your own: it stays when the catalog changes, and Gear check shows the gap', async ({ browser, page }, testInfo) => {
    test.setTimeout(90000);
    const ownerPage = await owner(browser, testInfo.workerIndex);
    const tag = `cv${Date.now().toString(36)}${testInfo.workerIndex}`;
    const csv = ['sku,name,brand,category,weight,unit,status,price', `${tag}-1,Sleep pad ${tag},${tag},Sleeping Pad,12,oz,published,100`].join('\n');
    expect((await ownerPage.request.post(url('/api/admin/catalog/import/apply'), { data: { csv } })).ok()).toBe(true);

    const user = generateTestUser('cwui');
    await page.setViewportSize({ width: 1440, height: 900 });
    const { registerUser } = await import('./auth-utils');
    await registerUser(page, user.username, user.password, user.email);
    await expect(page.getByTestId('item-row').first()).toBeVisible();

    // Add it from the catalog: it arrives at the catalog's weight, synced.
    await page.getByTestId('add-from-catalog').first().click();
    const picker = page.getByTestId('catalog-picker');
    await picker.getByTestId('catalog-picker-search').fill(tag);
    await picker.getByRole('button', { name: `Add Sleep pad ${tag}` }).click();
    await picker.getByTestId('catalog-picker-close').click();
    const rows = page.getByTestId('item-row');
    await expect.poll(() => rows.evaluateAll((els, name) => els.findIndex((e) => (e.querySelector('input[placeholder="Name"]') as HTMLInputElement)?.value === name), `Sleep pad ${tag}`)).toBeGreaterThan(-1);
    const at = await rows.evaluateAll((els, name) => els.findIndex((e) => (e.querySelector('input[placeholder="Name"]') as HTMLInputElement)?.value === name), `Sleep pad ${tag}`);
    const row = rows.nth(at);

    // Type their own weight: it's theirs now (weightOwn), and price and name still sync.
    const weight = row.locator('input.lpWeight');
    await weight.fill('16');
    await weight.press('Tab');
    await page.waitForResponse((r) => r.url().includes('saveLibrary') && r.status() === 200);
    const signin = async () => JSON.parse((await (await page.request.post(url('/signin'), { data: {} })).json()).library).items.find((i: any) => i.name.includes(tag));
    const mine = await signin();
    expect(mine).toMatchObject({ weight: Math.round(16 * 28349.5), weightOwn: true, catalogSync: true });

    // The owner corrects the catalog: new price and weight. The price reaches
    // the list; the weight doesn't.
    const csv2 = ['sku,name,brand,category,weight,unit,status,price', `${tag}-1,Sleep pad ${tag},${tag},Sleeping Pad,11,oz,published,90`].join('\n');
    expect((await ownerPage.request.post(url('/api/admin/catalog/import/apply'), { data: { csv: csv2 } })).ok()).toBe(true);
    const after = await signin();
    expect(after.weight).toBe(Math.round(16 * 28349.5));
    expect(after.price).toBe(90);

    // Gear check: 16 oz against the catalog's 11 oz.
    await page.reload();
    await page.getByTestId('insights-toggle').click();
    const checks = page.getByTestId('insights-weights');
    await expect(checks).toContainText(`Sleep pad ${tag}`);
    await expect(checks).toContainText('the brand says');
    await expect(checks).toContainText('+45%');
    await ownerPage.context().close();
});
