import { test, expect, Browser, Page } from '@playwright/test';

import { testRoot } from './utils';
import { registerUser, generateTestUser } from './auth-utils';

// The gear check's big three (client/utils/big-three.js, server/insights.js):
// shelter, sleep system and pack first; swaps only of the same kind (a
// hammock sleeper never gets tents or sleeping bags), at least 20% lighter,
// and like for like (as warm, as well insulated).

const url = (p: string) => new URL(p, testRoot).toString();
const saved = (page: Page) => page.waitForResponse((r) => r.url().includes('saveLibrary') && r.status() === 200, { timeout: 20000 });

async function asOwner(browser: Browser, workerIndex: number) {
    const page = await (await browser.newContext()).newPage();
    const username = `wge2eowner${workerIndex}`;
    const r = await page.request.post(url('/register'), { data: { username, email: `${username}@example.com`, password: 'testtest' } });
    if (r.status() !== 200) expect((await page.request.post(url('/signin'), { data: { username, password: 'testtest' } })).status()).toBe(200);
    return page;
}

test('a hammock and top quilt get hammocks and quilts: 20% lighter, as warm, never tents or bags', async ({ browser, page }, testInfo) => {
    test.setTimeout(90_000);
    const t = `B3${Date.now().toString(36)}`;
    const owner = await asOwner(browser, testInfo.workerIndex);
    const head = 'sku,name,brand,category,weight,unit,status,temp_comfort,r_value,pad_type';
    const rows = [
        // What the hiker carries.
        [`${t}-1`, `Old hammock ${t}`, 'Heavyco', 'Hammock', 40, '', ''],
        [`${t}-2`, `Old quilt ${t}`, 'Heavyco', 'Top Quilt', 40, '20F', ''],
        [`${t}-3`, `Old pad ${t}`, 'Heavyco', 'Sleeping Pad', 40, '', '4'],
        // Good swaps.
        [`${t}-4`, `Light hammock ${t}`, 'Trailco', 'Hammock', 1, '', ''],
        [`${t}-5`, `Warm quilt ${t}`, 'Trailco', 'Top Quilt', 2, '20F', ''],
        [`${t}-6`, `Good pad ${t}`, 'Trailco', 'Sleeping Pad', 2, '', '4.2'],
        // Not swaps: under 20% lighter, another system, warmer-rated, thinner.
        [`${t}-7`, `Slight hammock ${t}`, 'Trailco', 'Hammock', 35, '', ''],
        [`${t}-8`, `Light tent ${t}`, 'Trailco', 'Tent', 1, '', ''],
        [`${t}-9`, `Light bag ${t}`, 'Trailco', 'Sleeping Bag', 1, '20F', ''],
        [`${t}-10`, `Summer quilt ${t}`, 'Trailco', 'Top Quilt', 1, '50F', ''],
        [`${t}-11`, `Thin pad ${t}`, 'Trailco', 'Sleeping Pad', 1, '', '1.5'],
    ].map(([sku, name, brand, cat, oz, temp, r]) => `${sku},${name},${brand},${cat},${oz},oz,published,${temp},${r},${r ? 'inflatable' : ''}`);
    expect((await owner.request.post(url('/api/admin/catalog/import/apply'), { data: { csv: [head, ...rows].join('\n') } })).ok()).toBe(true);
    const find = async (name: string) => {
        const res = await (await owner.request.get(url(`/api/catalog?q=${encodeURIComponent(name)}`))).json();
        return res.items.find((i: { name: string }) => i.name === name);
    };
    const mine = await Promise.all([`Old hammock ${t}`, `Old quilt ${t}`, `Old pad ${t}`].map(find));

    // A hiker with the hammock, quilt and pad on their list (from the catalog).
    await page.setViewportSize({ width: 1440, height: 900 });
    const u = generateTestUser('b3');
    await registerUser(page, u.username, u.password, u.email);
    await expect(page.getByTestId('item-row').first()).toBeVisible();
    const done = saved(page);
    await page.evaluate((entries) => {
        const s = (window as any).LighterPack.$store;
        const list = s.state.library.getListById(s.state.library.defaultListId);
        const cat = s.state.library.getCategoryById(list.categoryIds[0]);
        for (const entry of entries) s.commit('addCatalogItem', { categoryId: cat.id, entry });
    }, mine);
    await done;

    const panel = page.getByTestId('gear-insights');
    await panel.getByTestId('insights-toggle').click();
    const shelter = panel.getByTestId('big-three-shelter');
    const sleep = panel.getByTestId('big-three-sleep');
    await expect(shelter).toContainText(`Old hammock ${t}`);
    await expect(shelter.getByTestId('big-three-item').first()).toHaveAttribute('data-kind', 'hammock');

    // Hammock: a hammock at least 20% lighter, not one 12% lighter, never a tent.
    await expect(shelter).toContainText(`Light hammock ${t}`);
    await expect(shelter).not.toContainText(`Slight hammock ${t}`);
    // Sleep: a quilt as warm, a pad as warm; not a warmer-rated quilt, a
    // thinner pad, or a sleeping bag.
    const quilt = sleep.getByTestId('big-three-item').filter({ hasText: `Old quilt ${t}` });
    await expect(quilt).toContainText(`Warm quilt ${t}`);
    await expect(quilt).toContainText('saves');
    const pad = sleep.getByTestId('big-three-item').filter({ hasText: `Old pad ${t}` });
    await expect(pad).toContainText(`Good pad ${t}`);
    for (const never of [`Light tent ${t}`, `Light bag ${t}`, `Summer quilt ${t}`, `Thin pad ${t}`]) {
        await expect(panel, never).not.toContainText(never);
    }
    // The summary adds it up.
    await expect(panel.getByTestId('big-three-summary')).toContainText('could save up to');
});
