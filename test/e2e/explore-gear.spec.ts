import { test, expect, Browser, Page } from '@playwright/test';

import { testRoot } from './utils';

// Explore gear: /explore lists every category under Pack, Shelter, Sleep
// System and Clothing first; /explore/<category> filters its gear by
// checkboxes and sliders, in place, with the filters in the URL.

const url = (p: string) => new URL(p, testRoot).toString();

async function seed(browser: Browser, workerIndex: number, brand: string) {
    const page = await (await browser.newContext()).newPage();
    const username = `wge2eowner${workerIndex}`;
    const r = await page.request.post(url('/register'), { data: { username, email: `${username}@example.com`, password: 'testtest' } });
    if (r.status() !== 200) expect((await page.request.post(url('/signin'), { data: { username, password: 'testtest' } })).status()).toBe(200);
    const head = 'sku,name,brand,category,weight,unit,price,status,capacity,pitch,trail_weight,temp_limit,insulation,fill_power';
    const csv = [head,
        `${brand}-1,Pole tent,${brand},Tent,20,oz,500,published,1P,Trekking pole,20 oz,,,`,
        `${brand}-2,Free tent,${brand},Tent,56,oz,300,published,2P,Freestanding,56 oz,,,`,
        `${brand}-3,Big tarp,${brand},Tarp,10,oz,120,published,,,,,,`,
        `${brand}-4,Warm quilt,${brand},Top Quilt,22,oz,400,published,,,,20F,Down,850,`,
        `${brand}-5,Cheap quilt,${brand},Top Quilt,30,oz,150,published,,,,30F,Down,650,`,
        `${brand}-6,Heavy quilt,${brand},Top Quilt,90,oz,350,published,,,,0F,Down,800,`,
    ].join('\n');
    expect((await page.request.post(url('/api/admin/catalog/import/apply'), { data: { csv } })).ok()).toBe(true);
    await page.context().close();
}

// Move a slider and tell the page, as dragging would.
async function slide(page: Page, testid: string, value: number) {
    await page.getByTestId(testid).evaluate((el, v) => {
        (el as HTMLInputElement).value = String(v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);
}
const names = async (page: Page) => page.getByTestId('explore-item').filter({ visible: true }).locator('.wgGearCardName').allTextContents();

test('the index: Pack, Shelter, Sleep System and Clothing first, then the rest A–Z', async ({ page, browser }, testInfo) => {
    await seed(browser, testInfo.workerIndex, `Ex${Date.now().toString(36)}`);
    await page.goto(url('/explore'));
    const sections = page.getByTestId('explore-section');
    expect((await sections.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.slug))).slice(0, 4)).toEqual(['pack', 'shelter', 'sleep-system', 'clothing']);
    const others = await page.getByTestId('explore-others').locator('a > span:first-child').allTextContents();
    expect(others).toEqual([...others].sort((a, b) => a.localeCompare(b)));
    // A child category opens its parent with that category ticked.
    const shelter = page.locator('[data-slug="shelter"]');
    await shelter.getByTestId('explore-child').filter({ hasText: /^Tent\b/ }).first().click();
    await expect(page).toHaveURL(/\/explore\/shelter\?cat=tent$/);
    await expect(page.getByTestId('explore-title')).toHaveText('Shelter');
    await expect(page.locator('input[name="cat"][value="tent"]')).toBeChecked();
});

test('filter a category in place: brand, category, spec checkboxes and sliders; the URL keeps it', async ({ page, browser }, testInfo) => {
    const brand = `Ex${Date.now().toString(36)}`;
    await seed(browser, testInfo.workerIndex, brand);
    await page.setViewportSize({ width: 1366, height: 1000 });
    await page.goto(url('/explore/shelter'));
    await page.locator(`input[name="brand"][value="${brand.toLowerCase()}"]`).check();
    expect((await names(page)).sort()).toEqual(['Big tarp', 'Free tent', 'Pole tent']);
    // Sorted lightest first.
    expect(await names(page)).toEqual(['Big tarp', 'Pole tent', 'Free tent']);
    await page.locator('input[name="cat"][value="tent"]').check();
    await page.getByTestId('filter-pitch').locator('input[value="freestanding"]').check();
    expect(await names(page)).toEqual(['Free tent']);
    await expect(page.getByTestId('explore-count')).toContainText('1 of');
    await expect(page).toHaveURL(new RegExp(`cat=tent&brand=${brand.toLowerCase()}&pitch=freestanding`));
    await page.getByTestId('explore-clear').click();
    await expect(page.locator('input[name="cat"]:checked')).toHaveCount(0);

    // Sleep System: over 750 fill and under 5 lb.
    await page.goto(url(`/explore/sleep-system?brand=${brand.toLowerCase()}`));
    expect((await names(page)).sort()).toEqual(['Cheap quilt', 'Heavy quilt', 'Warm quilt']);
    await slide(page, 'range-fill_power-min', 750);
    expect((await names(page)).sort()).toEqual(['Heavy quilt', 'Warm quilt']);
    await expect(page.getByTestId('range-fill_power').locator('output')).toContainText('At least 750 fill');
    await slide(page, 'range-weight-max', 2268); // 5 lb in grams
    expect(await names(page)).toEqual(['Warm quilt']);
    await expect(page.getByTestId('range-weight').locator('output')).toContainText('Up to');

    // The link reproduces it on the server, before any script runs.
    const link = page.url();
    expect(link).toMatch(/fill_power_min=750/);
    const fresh = await (await browser.newContext({ javaScriptEnabled: false })).newPage();
    await fresh.goto(link);
    expect(await names(fresh)).toEqual(['Warm quilt']);
    await fresh.context().close();

    // Sort by price.
    await page.getByTestId('explore-clear').click();
    await page.locator(`input[name="brand"][value="${brand.toLowerCase()}"]`).check();
    await page.getByTestId('explore-sort').selectOption('price');
    expect(await names(page)).toEqual(['Cheap quilt', 'Heavy quilt', 'Warm quilt']);
});

test('kits moved to /kits; old Explore kit links still land there', async ({ page }) => {
    await page.goto(url('/explore?class=ul'));
    await expect(page).toHaveURL(/\/kits\?class=ul$/);
    await expect(page.getByRole('heading', { name: 'Explore kits' })).toBeVisible();
    await page.goto(url('/explore/not-a-category'));
    await expect(page).toHaveURL(/\/explore$/);
    await page.getByTestId('nav-explore').click();
    await expect(page.getByTestId('nav-gear')).toHaveAttribute('href', '/explore');
    await expect(page.getByTestId('nav-kits')).toHaveAttribute('href', '/kits');
});

test('packs offer pack weight, max carry, volume, straps, frame, roll top and adjustable torso, even before specs are filled in', async ({ browser }, testInfo) => {
    const page = await (await browser.newContext()).newPage();
    const username = `wge2eowner${testInfo.workerIndex}`;
    const r = await page.request.post(url('/register'), { data: { username, email: `${username}@example.com`, password: 'testtest' } });
    if (r.status() !== 200) expect((await page.request.post(url('/signin'), { data: { username, password: 'testtest' } })).status()).toBe(200);
    const brand = `Pk${Date.now().toString(36)}`;
    const csv = ['sku,name,brand,category,weight,unit,price,status,volume,max_carry,strap_type,frame,roll_top,adjustable_torso,pack_type,fabric',
        `${brand}-1,Frameless 40,${brand},Packs,20,oz,250,published,40 L,25 lb,J-curve,Frameless,yes,no,Pack,Ultra 200`,
        `${brand}-2,Framed 55,${brand},Packs,36,oz,320,published,55 L,40 lb,S-curve,Framed,no,yes,Pack,Robic 210D`,
        `${brand}-3,Mystery pack,${brand},Packs,28,oz,200,published,,,,,,,,`,
        `${brand}-4,Trail vest 12,${brand},Hydration Vest,9,oz,160,published,12 L,,Vest,Frameless,no,no,Hydration vest,ultra 200`].join('\n');
    expect((await page.request.post(url('/api/admin/catalog/import/apply'), { data: { csv } })).ok()).toBe(true);

    await page.goto(url(`/explore/pack?brand=${brand.toLowerCase()}`));
    // In this order, after the category.
    const labels = await page.locator('#wgGearFilters .wgFilter').evaluateAll((els) => els.map((e) => (e.querySelector('legend, .wgFilterLabel') || {}).textContent?.trim()));
    expect(labels.slice(0, 11)).toEqual(['Category', 'Pack weight', 'Price', 'Max carry weight', 'Volume', 'Pack type', 'Shoulder straps', 'Frame', 'Roll top', 'Adjustable torso', 'Fabric']);
    // Every strap style is listed; ones nothing has yet can't be picked.
    const straps = page.getByTestId('filter-strap_type');
    await expect(straps.locator('input')).toHaveCount(4);
    await expect(straps.locator('input[value="other"]')).toBeDisabled();

    // Hydration vests sit under Pack, with a pack type of their own.
    await page.getByTestId('filter-pack_type').locator('input[value="hydration_vest"]').check();
    expect(await names(page)).toEqual(['Trail vest 12']);
    await page.getByTestId('filter-pack_type').locator('input[value="hydration_vest"]').uncheck();
    // Fabric: the ones the catalog has, whatever their capitals.
    await page.getByTestId('filter-fabric').locator('input[value="ultra 200"]').check();
    expect(await names(page)).toEqual(['Trail vest 12', 'Frameless 40']);
    await page.getByTestId('filter-fabric').locator('input[value="ultra 200"]').uncheck();

    await straps.locator('input[value="j_curve"]').check();
    expect(await names(page)).toEqual(['Frameless 40']);
    await straps.locator('input[value="j_curve"]').uncheck();
    await page.getByTestId('filter-frame').locator('input[value="framed"]').check();
    expect(await names(page)).toEqual(['Framed 55']);
    await page.getByTestId('filter-frame').locator('input[value="framed"]').uncheck();
    await slide(page, 'range-volume-min', 50);
    expect(await names(page)).toEqual(['Framed 55']);
    await expect(page.getByTestId('range-volume').locator('output')).toContainText('At least 50 L');
    await page.getByTestId('explore-clear').click();
    await page.locator(`input[name="brand"][value="${brand.toLowerCase()}"]`).check();
    await page.getByTestId('filter-roll_top').locator('input[value="true"]').check();
    expect(await names(page)).toEqual(['Frameless 40']);
    await page.context().close();
});

test('a long filter column scrolls on its own, without scrolling the page', async ({ browser }) => {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 600 } })).newPage();
    await page.goto(url('/explore/pack'));
    const box = page.getByTestId('explore-filters-box');
    const m = await box.evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight, overflow: getComputedStyle(el).overflowY }));
    expect(m.overflow).toBe('auto');
    expect(m.scroll).toBeGreaterThan(m.client);
    expect(m.client).toBeLessThanOrEqual(600);

    // The wheel over the filters moves the filters, not the page.
    const b = (await box.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + Math.min(b.height, 400) / 2);
    await page.mouse.wheel(0, 300);
    await expect.poll(() => box.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    // The last filter can be reached.
    await box.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await expect(page.getByTestId('explore-clear')).toBeInViewport();

    // On a phone the filters are part of the page.
    await page.setViewportSize({ width: 390, height: 800 });
    expect(await box.evaluate((el) => getComputedStyle(el).overflowY)).toBe('visible');
    await page.context().close();
});
