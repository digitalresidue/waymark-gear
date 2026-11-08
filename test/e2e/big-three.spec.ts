import { test, expect, Browser, Page } from '@playwright/test';

import { testRoot } from './utils';
import { registerUser, generateTestUser } from './auth-utils';

// The gear check's big three (client/utils/big-three.js, server/insights.js):
// shelter, sleep system and pack first; swaps only of the same kind (a
// hammock sleeper never gets tents or sleeping bags), at least 20% lighter,
// and like for like (as warm, as well insulated, the same volume and size).

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
        // Reported: a brand isn't a kind of gear, and accessories aren't swaps,
        // even filed under Hammock, Tarp or Underquilt.
        [`${t}-12`, `Old tarp ${t}`, 'Heavyco', 'Tarp', 40, '', ''],
        [`${t}-13`, `Old underquilt ${t}`, 'Heavyco', 'Underquilt', 40, '', ''],
        [`${t}-14`, `Bottom Entry Bugnet ${t}`, 'Heavyco', 'Hammock', 40, '', ''],
        [`${t}-15`, `Hammock Gear Dyneema Hammock Ground Cloth ${t}`, 'Hammock Gear', 'Hammock', 1, '', ''],
        [`${t}-16`, `Hammock Gear Mesh Tarp Sleeve ${t}`, 'Hammock Gear', 'Tarp', 1, '', ''],
        [`${t}-17`, `Hammock Gear Underquilt Protector ${t}`, 'Hammock Gear', 'Underquilt', 1, '', ''],
        [`${t}-18`, `Hammock Gear Dyneema Hammock Tarp ${t}`, 'Hammock Gear', 'Accessories', 1, '', ''],
        [`${t}-19`, `Light tarp ${t}`, 'Trailco', 'Tarp', 2, '', ''],
        [`${t}-20`, `Light underquilt ${t}`, 'Trailco', 'Underquilt', 2, '', ''],
        // Reported: a hoodie named like a pack is never a pack swap.
        [`${t}-21`, `Nero Classic 50L (Vest Straps) ${t}`, 'Heavyco', 'Pack', 40, '', ''],
        [`${t}-22`, `Town Shirt Desert Mariposa Sun Hoodie ${t}`, 'Town Shirt', 'Sun Hoodie', 1, '', ''],
        // Packs stay about the same volume: a 50 L pack gets a 46 L one,
        // never a 36 L or a 60 L.
        [`${t}-23`, `Murmur 36 ${t}`, 'Gossamer Gear', 'Pack', 2, '', ''],
        [`${t}-24`, `Kumo 46L ${t}`, 'Gossamer Gear', 'Pack', 3, '', ''],
        [`${t}-25`, `Mariposa 60 ${t}`, 'Gossamer Gear', 'Pack', 3, '', ''],
        // Clothing stays the same size: an XL rain jacket never gets a Small
        // or a Medium.
        [`${t}-26`, `Old rain jacket ${t} (XL)`, 'Heavyco', 'Rain Gear', 20, '', ''],
        [`${t}-27`, `Light rain jacket ${t} (X-Large)`, 'Trailco', 'Rain Gear', 5, '', ''],
        [`${t}-28`, `Tiny rain jacket ${t} (Small)`, 'Trailco', 'Rain Gear', 4, '', ''],
        [`${t}-29`, `Mid rain jacket ${t} (M)`, 'Trailco', 'Rain Gear', 4, '', ''],
    ].map(([sku, name, brand, cat, oz, temp, r]) => `${sku},${name},${brand},${cat},${oz},oz,published,${temp},${r},${r ? 'inflatable' : ''}`);
    expect((await owner.request.post(url('/api/admin/catalog/import/apply'), { data: { csv: [head, ...rows].join('\n') } })).ok()).toBe(true);
    const find = async (name: string) => {
        const res = await (await owner.request.get(url(`/api/catalog?q=${encodeURIComponent(name)}`))).json();
        return res.items.find((i: { name: string }) => i.name === name);
    };
    const mine = await Promise.all([`Old hammock ${t}`, `Old quilt ${t}`, `Old pad ${t}`, `Old tarp ${t}`, `Old underquilt ${t}`, `Bottom Entry Bugnet ${t}`, `Nero Classic 50L (Vest Straps) ${t}`, `Old rain jacket ${t} (XL)`].map(find));

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
    // Gear is compared in ounces (or grams), not pounds: 40 oz → 2 oz saves 38 oz.
    await expect(quilt.getByTestId('big-three-option').filter({ hasText: `Warm quilt ${t}` })).toContainText(/2 oz.*saves 38 oz \(95%\)/);
    const pad = sleep.getByTestId('big-three-item').filter({ hasText: `Old pad ${t}` });
    await expect(pad).toContainText(`Good pad ${t}`);
    for (const never of [`Light tent ${t}`, `Light bag ${t}`, `Summer quilt ${t}`, `Thin pad ${t}`]) {
        await expect(panel, never).not.toContainText(never);
    }

    // Reported: a tarp gets a lighter tarp, an underquilt a lighter
    // underquilt; never Hammock Gear's ground cloth, tarp sleeve or
    // underquilt protector, and a bug net isn't a hammock to swap.
    await expect(shelter.getByTestId('big-three-item').filter({ hasText: `Old tarp ${t}` })).toContainText(`Light tarp ${t}`);
    await expect(sleep.getByTestId('big-three-item').filter({ hasText: `Old underquilt ${t}` })).toContainText(`Light underquilt ${t}`);
    await expect(panel.getByTestId('big-three-item').filter({ hasText: `Bottom Entry Bugnet ${t}` })).toHaveCount(0);
    const pack = panel.getByTestId('big-three-pack').getByTestId('big-three-item').filter({ hasText: `Nero Classic 50L` });
    await expect(pack).toContainText(`Kumo 46L ${t}`);
    await expect(pack).not.toContainText(`Murmur 36 ${t}`);
    await expect(pack).not.toContainText(`Mariposa 60 ${t}`);
    // An XL rain jacket: the X-Large, never the Small or the Medium.
    const jacket = panel.getByTestId('alternative').filter({ hasText: `Old rain jacket ${t}` });
    await expect(jacket).toContainText(`Light rain jacket ${t}`);
    await expect(jacket).not.toContainText(`Tiny rain jacket ${t}`);
    await expect(jacket).not.toContainText(`Mid rain jacket ${t}`);
    for (const never of ['Ground Cloth', 'Tarp Sleeve', 'Underquilt Protector', `Dyneema Hammock Tarp ${t}`, 'Sun Hoodie']) {
        await expect(panel.locator('[data-testid="big-three-option"]').filter({ hasText: never }), never).toHaveCount(0);
    }
    // The summary adds it up.
    await expect(panel.getByTestId('big-three-summary')).toContainText('could save up to');
    await expect(panel.getByTestId('big-three-summary')).toContainText(/ oz/);

    // Metric readers get grams.
    await page.request.post(url('/api/units'), { data: { system: 'metric' } });
    await page.reload();
    await page.getByTestId('gear-insights').getByTestId('insights-toggle').click();
    await expect(page.getByTestId('big-three-sleep').getByTestId('big-three-option').filter({ hasText: `Warm quilt ${t}` })).toContainText(/57 g.*saves 1077 g/);
});
