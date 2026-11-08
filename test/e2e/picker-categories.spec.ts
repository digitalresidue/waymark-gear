import { test, expect } from '@playwright/test';

import { testRoot } from './utils';
import { registerUser, generateTestUser } from './auth-utils';

// Add from catalog: every category is reachable. The panel used to show the
// first 14 categories A–Z, so Quilt, Sleeping Bag, Tent, Top Quilt and
// Underquilt (all after "P") never appeared. Now the six parent groups come
// first, each opening a row of its categories, then everything else.

const url = (p: string) => new URL(p, testRoot).toString();

// The owner's real list of categories, plus the ones that went missing.
const CATS = ['Accessories', 'Base Layer', 'Bug Net', 'Cooking', 'Fanny', 'Footwear', 'Hammock', 'Hat', 'Lights and Electronics',
    'Mid Layer', 'Outer Layer', 'Pack', 'Pants', 'Pets', 'Quilt', 'Sleeping Bag', 'Tent', 'Top Quilt', 'Underquilt', 'Trekking Poles'];

async function seed(browser, workerIndex: number) {
    const owner = await (await browser.newContext()).newPage();
    const username = `wge2eowner${workerIndex}`;
    const r = await owner.request.post(url('/register'), { data: { username, email: `${username}@example.com`, password: 'testtest' } });
    if (r.status() !== 200) expect((await owner.request.post(url('/signin'), { data: { username, password: 'testtest' } })).status()).toBe(200);
    const b = `Pc${Date.now().toString(36)}${workerIndex}`;
    const cats = CATS;
    const csv = ['sku,name,brand,category,weight,unit,price,status',
        ...cats.map((c, i) => `${b}-${i},${c} ${b},${b},${c},10,oz,100,published`)].join('\n');
    expect((await owner.request.post(url('/api/admin/catalog/import/apply'), { data: { csv } })).ok()).toBe(true);
    await owner.context().close();
    return b;
}

test('every catalog category can be picked, grouped like Explore', async ({ page, browser }, testInfo) => {
    const b = await seed(browser, testInfo.workerIndex);
    const cats = CATS;
    const u = generateTestUser('pick');
    await registerUser(page, u.username, u.password, u.email);
    await expect(page.getByTestId('item-row').first()).toBeVisible();
    await page.getByTestId('add-from-catalog').first().click();
    const picker = page.getByTestId('catalog-picker');
    const names = () => picker.getByTestId('catalog-result').locator('.wgPickerName').allTextContents();

    // Parents first, then the rest, including those after "P".
    const sections = picker.getByTestId('picker-sections');
    await expect(sections.getByTestId('picker-section-sleep-system')).toBeVisible();
    await expect(sections.getByTestId('picker-section-shelter')).toBeAttached();
    await expect(sections.getByTestId('picker-section-trekking-poles')).toBeAttached();

    // Sleep System opens its categories; each narrows the results.
    await sections.getByTestId('picker-section-sleep-system').click();
    const children = picker.getByTestId('picker-children');
    for (const c of ['topquilt', 'underquilt', 'sleepingbag', 'quilt']) await expect(children.getByTestId(`picker-child-${c}`)).toBeAttached();
    await picker.getByTestId('catalog-picker-search').fill(b);
    await expect.poll(async () => (await names()).sort()).toEqual([`Quilt ${b}`, `Sleeping Bag ${b}`, `Top Quilt ${b}`, `Underquilt ${b}`]);
    await children.getByTestId('picker-child-underquilt').click();
    await expect.poll(names).toEqual([`Underquilt ${b}`]);

    // Shelter: tents, hammocks and bug nets.
    await sections.getByTestId('picker-section-shelter').click();
    await expect.poll(async () => (await names()).sort()).toEqual([`Bug Net ${b}`, `Hammock ${b}`, `Tent ${b}`]);
    // All: everything again.
    await sections.getByRole('button', { name: 'All', exact: true }).click();
    await expect.poll(async () => (await names()).length).toBe(cats.length);
});

test('the editor\'s Catalog panel reaches every category too', async ({ page, browser }, testInfo) => {
    const b = await seed(browser, testInfo.workerIndex);
    await page.setViewportSize({ width: 1440, height: 900 });
    const u = generateTestUser('cpcat');
    await registerUser(page, u.username, u.password, u.email);
    await expect(page.getByTestId('item-row').first()).toBeVisible();
    await page.getByTestId('rail-catalog').click();
    const panel = page.getByTestId('panel-catalog');
    const names = () => panel.getByTestId('catalog-panel-result').locator('.wgCatalogName span:first-child').allTextContents();
    await panel.getByTestId('catalog-panel-search').fill(b);

    // Parents first; the categories after "Pets" are there.
    const chips = panel.getByTestId('catalog-panel-chips');
    await expect(chips.getByTestId('catalog-panel-section-sleep-system')).toBeVisible();
    await expect(chips.getByTestId('catalog-panel-section-trekking-poles')).toBeAttached();

    await chips.getByTestId('catalog-panel-section-sleep-system').click();
    await expect.poll(async () => (await names()).sort()).toEqual([`Quilt ${b}`, `Sleeping Bag ${b}`, `Top Quilt ${b}`, `Underquilt ${b}`]);
    await panel.getByTestId('catalog-panel-children').getByTestId('catalog-panel-child-topquilt').click();
    await expect.poll(names).toEqual([`Top Quilt ${b}`]);
    await chips.getByTestId('catalog-panel-section-shelter').click();
    await expect.poll(async () => (await names()).sort()).toEqual([`Bug Net ${b}`, `Hammock ${b}`, `Tent ${b}`]);
});
