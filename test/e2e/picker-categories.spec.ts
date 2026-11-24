import { test, expect } from '@playwright/test';

import { testRoot } from './utils';
import { registerUser, generateTestUser } from './auth-utils';

// Add from catalog: every category is reachable. The panel used to show the
// first 14 categories A–Z, so Quilt, Sleeping Bag, Tent, Top Quilt and
// Underquilt (all after "P") never appeared. Now the parent groups come
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
    // Lights & Electronics is a group of its own now.
    await expect(sections.getByTestId('picker-section-lights-electronics')).toBeAttached();

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

test('Pack opens its pack types in both pickers, as on Explore: Packs, Fastpacks, Hydration vests, Daypacks', async ({ page, browser }, testInfo) => {
    const owner = await (await browser.newContext()).newPage();
    const username = `wge2eowner${testInfo.workerIndex}`;
    const r = await owner.request.post(url('/register'), { data: { username, email: `${username}@example.com`, password: 'testtest' } });
    if (r.status() !== 200) expect((await owner.request.post(url('/signin'), { data: { username, password: 'testtest' } })).status()).toBe(200);
    const b = `Pt${Date.now().toString(36)}${testInfo.workerIndex}`;
    // No pack type: the category says (a Fastpack, a Daypack), else a pack.
    const csv = ['sku,name,brand,category,weight,unit,price,status,pack_type',
        `${b}-1,Thru ${b},${b},Pack,30,oz,250,published,`,
        `${b}-2,Fast ${b},${b},Fastpack,14,oz,180,published,`,
        `${b}-3,Vest ${b},${b},Pack,8,oz,150,published,Hydration vest`,
        `${b}-4,Summit ${b},${b},Daypack,12,oz,90,published,`,
        `${b}-5,Tripper ${b},${b},Pack,16,oz,120,published,Daypack`].join('\n');
    expect((await owner.request.post(url('/api/admin/catalog/import/apply'), { data: { csv } })).ok()).toBe(true);
    await owner.context().close();

    await page.setViewportSize({ width: 1440, height: 900 });
    const u = generateTestUser('pktype');
    await registerUser(page, u.username, u.password, u.email);
    await expect(page.getByTestId('item-row').first()).toBeVisible();

    // Add from catalog.
    await page.getByTestId('add-from-catalog').first().click();
    const picker = page.getByTestId('catalog-picker');
    const names = () => picker.getByTestId('catalog-result').locator('.wgPickerName').allTextContents();
    await picker.getByTestId('catalog-picker-search').fill(b);
    await picker.getByTestId('picker-sections').getByTestId('picker-section-pack').click();
    const children = picker.getByTestId('picker-children');
    await expect(children.getByRole('button')).toHaveText([/^\s*All Pack/, /^Packs/, /^Fastpacks/, /^Hydration vests/, /^Daypacks/]);
    await expect.poll(async () => (await names()).length).toBe(5);
    await children.getByTestId('picker-child-pack_type:daypack').click();
    await expect.poll(async () => (await names()).sort()).toEqual([`Summit ${b}`, `Tripper ${b}`]);
    await expect(picker.getByTestId('picker-section-pack')).toHaveAttribute('aria-pressed', 'true');
    await children.getByTestId('picker-child-pack_type:pack').click();
    await expect.poll(names).toEqual([`Thru ${b}`]);
    await children.getByTestId('picker-child-pack_type:fastpack').click();
    await expect.poll(names).toEqual([`Fast ${b}`]);
    await page.keyboard.press('Escape');

    // The editor's Catalog panel.
    await page.getByTestId('rail-catalog').click();
    const panel = page.getByTestId('panel-catalog');
    const panelNames = () => panel.getByTestId('catalog-panel-result').locator('.wgCatalogName span:first-child').allTextContents();
    await panel.getByTestId('catalog-panel-search').fill(b);
    await panel.getByTestId('catalog-panel-chips').getByTestId('catalog-panel-section-pack').click();
    await panel.getByTestId('catalog-panel-children').getByTestId('catalog-panel-child-pack_type:hydration_vest').click();
    await expect.poll(panelNames).toEqual([`Vest ${b}`]);
});
