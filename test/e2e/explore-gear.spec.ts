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
    const head = 'sku,name,brand,category,weight,unit,price,status,capacity,pitch,trail_weight,temp_limit,insulation,fill_power,tarp_shape';
    const csv = [head,
        `${brand}-1,Pole tent,${brand},Tent,20,oz,500,published,1P,Trekking pole,20 oz,,,,`,
        `${brand}-2,Free tent,${brand},Tent,56,oz,300,published,2P,Freestanding,56 oz,,,,`,
        `${brand}-3,Big tarp,${brand},Tarp,10,oz,120,published,,,,,,,Flat`,
        `${brand}-4,Warm quilt,${brand},Top Quilt,22,oz,400,published,,,,20F,Down,850,,`,
        `${brand}-5,Cheap quilt,${brand},Top Quilt,30,oz,150,published,,,,30F,Down,650,,`,
        `${brand}-6,Heavy quilt,${brand},Top Quilt,90,oz,350,published,,,,0F,Down,800,,`,
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

test('the index: Pack, Shelter, Sleep System, Clothing, Cook Kit and Water first, then the rest A–Z', async ({ page, browser }, testInfo) => {
    await seed(browser, testInfo.workerIndex, `Ex${Date.now().toString(36)}`);
    await page.goto(url('/explore'));
    const sections = page.getByTestId('explore-section');
    expect((await sections.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.slug))).slice(0, 7)).toEqual(['pack', 'shelter', 'sleep-system', 'clothing', 'cook-kit', 'water', 'lights-electronics']);
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

test('packs offer pack weight, max carry, volume, straps, frame, roll top and adjustable torso, in that order, and only options some pack has', async ({ browser }, testInfo) => {
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
    // In this order: weight, price and the specs. (No category
    // box: Pack's type chips over the results stand in for it.) Other tests'
    // packs may add filters (fit, hip belt), so check the order of ours.
    const labels = await page.locator('#wgGearFilters .wgFilter').evaluateAll((els) => els.map((e) => (e.querySelector('legend, .wgFilterLabel') || {}).textContent?.trim()));
    const ours = ['Pack weight', 'Price', 'Volume', 'Max carry weight', 'Pack type', 'Frame', 'Shoulder straps', 'Roll top', 'Adjustable torso', 'Fabric'];
    expect(labels.filter((l) => ours.includes(l!))).toEqual(ours);
    // Only strap styles some pack has: none greyed out at 0.
    const straps = page.getByTestId('filter-strap_type');
    await expect(straps.locator('input[value="j_curve"]')).toBeEnabled();
    await expect(straps.locator('input:disabled')).toHaveCount(0);

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
    // Back to just this brand by link: with one brand in the catalog there's no Brand box.
    await page.goto(url(`/explore/pack?brand=${brand.toLowerCase()}`));
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

test('Sleep System: filters keep every kind of gear they should; spec filters only judge the gear they are about', async ({ page, browser }, testInfo) => {
    const owner = await (await browser.newContext()).newPage();
    const username = `wge2eowner${testInfo.workerIndex}`;
    const r = await owner.request.post(url('/register'), { data: { username, email: `${username}@example.com`, password: 'testtest' } });
    if (r.status() !== 200) expect((await owner.request.post(url('/signin'), { data: { username, password: 'testtest' } })).status()).toBe(200);
    const b = `Ss${Date.now().toString(36)}`;
    // Thickness 2.5 in / 3 in: a range whose end, worked out in floating
    // point, was 7.6000000000000005 cm, so the slider read as moved.
    const csv = ['sku,name,brand,category,weight,unit,price,status,r_value,thickness,temp_limit,fill_power',
        `${b}-1,Pad A,${b},Sleeping Pad,12,oz,150,published,2.3,2.5 in,,`,
        `${b}-2,Pad B,${b},Sleeping Pad,15,oz,200,published,4.2,3 in,,`,
        `${b}-3,Quilt A,${b},Top Quilt,19.4,oz,300,published,,,20F,850`,
        `${b}-4,Quilt B,${b},Top Quilt,23.7,oz,350,published,,,10F,950`,
        `${b}-5,Bag A,${b},Sleeping Bag,31,oz,400,published,,,15F,800`,
        `${b}-6,Pillow A,${b},Pillow,2.1,oz,40,published,,,,`].join('\n');
    expect((await owner.request.post(url('/api/admin/catalog/import/apply'), { data: { csv } })).ok()).toBe(true);
    await owner.context().close();

    await page.goto(url('/explore/sleep-system'));
    // Brand sits right under Category.
    const order = await page.locator('#wgGearFilters .wgFilter').evaluateAll((els) => els.slice(0, 2).map((e) => e.querySelector('legend')?.firstChild?.textContent?.trim()));
    expect(order).toEqual(['Category', 'Brand']);
    // No slider ends with floating-point noise.
    for (const end of await page.locator('.wgRange').evaluateAll((els) => els.flatMap((e) => [(e as HTMLElement).dataset.min, (e as HTMLElement).dataset.max]))) {
        expect(String(end).length, String(end)).toBeLessThan(10);
    }

    // A brand: all six, not just the pads.
    await page.locator(`input[name="brand"][value="${b.toLowerCase()}"]`).check();
    expect((await names(page)).sort()).toEqual(['Bag A', 'Pad A', 'Pad B', 'Pillow A', 'Quilt A', 'Quilt B']);
    expect(page.url()).toMatch(new RegExp(`/explore/sleep-system\\?brand=${b.toLowerCase()}$`));

    // Spec filters say what they're about, and only narrow that gear.
    await expect(page.getByTestId('range-r_value')).toContainText('R-value · sleeping pads');
    await expect(page.getByTestId('range-temp_limit')).toContainText('quilts and sleeping bags');
    await slide(page, 'range-r_value-min', 4);
    expect((await names(page)).sort()).toEqual(['Bag A', 'Pad B', 'Pillow A', 'Quilt A', 'Quilt B']);
    // Pads only: tick the category.
    await page.locator('input[name="cat"][value="sleepingpad"]').check();
    expect(await names(page)).toEqual(['Pad B']);
});

test('spec filters follow the ticked categories: Tent in Shelter drops the tarp filters; none ticked, all are back', async ({ page, browser }, testInfo) => {
    const b = `Sf${Date.now().toString(36)}`;
    await seed(browser, testInfo.workerIndex, b);
    await page.goto(url('/explore/shelter'));
    const tent = page.getByTestId('filter-capacity');
    const tarp = page.getByTestId('filter-tarp_shape');
    // Shelter as a whole: a tent's and a tarp's filters.
    await expect(tent).toBeVisible();
    await expect(tarp).toBeVisible();

    // A tarp filter set, then Tent ticked: only a tent's filters, and the
    // tarp one is gone from the link.
    await tarp.locator('input[value="rectangular"]').check();
    expect(page.url()).toContain('tarp_shape=rectangular');
    await page.locator('input[name="cat"][value="tent"]').check();
    await expect(tarp).toBeHidden();
    await expect(tent).toBeVisible();
    await expect(page.getByTestId('filter-pitch')).toBeVisible();
    expect(page.url()).not.toContain('tarp_shape');
    expect(page.url()).toContain('cat=tent');
    expect(await names(page)).toEqual(expect.arrayContaining(['Pole tent', 'Free tent']));
    // Both ticked: both kinds' filters; none ticked: all of Shelter's.
    await page.locator('input[name="cat"][value="tarp"]').check();
    await expect(tarp).toBeVisible();
    await page.locator('input[name="cat"]:checked').evaluateAll((els) => els.forEach((e) => (e as HTMLInputElement).click()));
    await expect(tarp).toBeVisible();
    await expect(tent).toBeVisible();

    // A link with Tent ticked opens that way, and drops a tarp spec it carries.
    await page.goto(url('/explore/shelter?cat=tent&tarp_shape=rectangular'));
    await expect(tarp).toBeHidden();
    await expect(tent).toBeVisible();
    await expect(page.locator('[data-filter-count]')).toHaveText('(1)');
});

test('brands follow the ticked categories: Pad in Sleep System lists only the brands that make pads', async ({ page, browser }, testInfo) => {
    const owner = await (await browser.newContext()).newPage();
    const username = `wge2eowner${testInfo.workerIndex}`;
    const r = await owner.request.post(url('/register'), { data: { username, email: `${username}@example.com`, password: 'testtest' } });
    if (r.status() !== 200) expect((await owner.request.post(url('/signin'), { data: { username, password: 'testtest' } })).status()).toBe(200);
    const id = Date.now().toString(36);
    const both = `Bp${id}`; // pads and quilts
    const quilts = `Bq${id}`; // quilts only
    const csv = ['sku,name,brand,category,weight,unit,price,status',
        `${both}-1,Pad one,${both},Sleeping Pad,12,oz,150,published`,
        `${both}-2,Pad two,${both},Sleeping Pad,14,oz,170,published`,
        `${both}-3,Quilt one,${both},Top Quilt,20,oz,300,published`,
        `${quilts}-1,Quilt two,${quilts},Top Quilt,22,oz,320,published`].join('\n');
    expect((await owner.request.post(url('/api/admin/catalog/import/apply'), { data: { csv } })).ok()).toBe(true);
    await owner.context().close();

    const brand = (b: string) => page.locator(`[data-brand-option="${b.toLowerCase()}"]`);
    await page.goto(url('/explore/sleep-system'));
    // The whole section: both brands, counted over all its gear.
    await expect(brand(both)).toBeVisible();
    await expect(brand(both).locator('[data-brand-count]')).toHaveText('3');
    await expect(brand(quilts)).toBeVisible();

    // Pads ticked: the quilt-only brand goes, and counts are pads only.
    await page.locator('input[name="cat"][value="sleepingpad"]').check();
    await expect(brand(quilts)).toBeHidden();
    await expect(brand(both).locator('[data-brand-count]')).toHaveText('2');
    // Unticked: everyone's back.
    await page.locator('input[name="cat"][value="sleepingpad"]').uncheck();
    await expect(brand(quilts)).toBeVisible();
    await expect(brand(both).locator('[data-brand-count]')).toHaveText('3');

    // A link with pads ticked opens that way.
    await page.goto(url('/explore/sleep-system?cat=sleepingpad'));
    await expect(brand(quilts)).toBeHidden();
    await expect(brand(both)).toBeVisible();
    // A brand already ticked stays, so it can be unticked.
    await page.goto(url(`/explore/sleep-system?cat=sleepingpad&brand=${quilts.toLowerCase()}`));
    await expect(brand(quilts)).toBeVisible();
    await expect(brand(quilts).locator('input')).toBeChecked();
});

test('Pack lists its pack types as sub-items: on the Explore page and over the Pack results', async ({ page, browser }, testInfo) => {
    const owner = await (await browser.newContext()).newPage();
    const username = `wge2eowner${testInfo.workerIndex}`;
    const r = await owner.request.post(url('/register'), { data: { username, email: `${username}@example.com`, password: 'testtest' } });
    if (r.status() !== 200) expect((await owner.request.post(url('/signin'), { data: { username, password: 'testtest' } })).status()).toBe(200);
    const b = `Pk${Date.now().toString(36)}`;
    // A pack with no type set counts as a pack; "Fastpack" gear as a fastpack.
    const csv = ['sku,name,brand,category,weight,unit,price,status,pack_type',
        `${b}-1,${b} Trail pack,${b},Pack,30,oz,250,published,`,
        `${b}-2,${b} Fast one,${b},Fastpack,14,oz,180,published,`,
        `${b}-3,${b} Race vest,${b},Pack,8,oz,150,published,Hydration vest`].join('\n');
    expect((await owner.request.post(url('/api/admin/catalog/import/apply'), { data: { csv } })).ok()).toBe(true);
    await owner.context().close();

    // The Explore page: Pack's sub-items are the types, linked to that filter.
    await page.goto(url('/explore'));
    const packCard = page.locator('[data-testid="explore-section"][data-slug="pack"]');
    const kids = packCard.getByTestId('explore-child');
    await expect(kids.nth(0)).toContainText('Packs');
    await expect(kids.nth(1)).toContainText('Fastpacks');
    await expect(kids.nth(2)).toContainText('Hydration vests');
    await expect(kids.nth(1)).toHaveAttribute('href', '/explore/pack?pack_type=fastpack');

    // Following one opens Pack with just that type.
    await kids.nth(1).click();
    await expect(page).toHaveURL(/\/explore\/pack\?pack_type=fastpack$/);
    const card = (name: string) => page.getByTestId('explore-item').filter({ hasText: name });
    await expect(page.getByTestId('subtype-fastpack')).toHaveAttribute('aria-current', 'true');
    await expect(card(`${b} Fast one`)).toBeVisible();
    await expect(card(`${b} Trail pack`)).toBeHidden();

    // The chips filter in place, ticking just that box in the filter column.
    await page.getByTestId('subtype-hydration_vest').click();
    await expect(page).toHaveURL(/pack_type=hydration_vest$/);
    await expect(card(`${b} Race vest`)).toBeVisible();
    await expect(card(`${b} Fast one`)).toBeHidden();
    await expect(page.locator('input[name="pack_type"][value="hydration_vest"]')).toBeChecked();
    await expect(page.locator('input[name="pack_type"][value="fastpack"]')).not.toBeChecked();

    await page.getByTestId('subtype-all').click();
    await expect(page).toHaveURL(/\/explore\/pack$/);
    await expect(page.getByTestId('subtype-all')).toHaveAttribute('aria-current', 'true');
    for (const n of ['Trail pack', 'Fast one', 'Race vest']) await expect(card(`${b} ${n}`)).toBeVisible();

    // The chips stand in for the category checkboxes, which would repeat them.
    await expect(page.locator('#wgGearFilters input[name="cat"]')).toHaveCount(0);

    // Ticking two types in the filter column: no single chip is current.
    await page.locator('input[name="pack_type"][value="pack"]').check();
    await page.locator('input[name="pack_type"][value="fastpack"]').check();
    await expect(page.locator('[data-subtype][aria-current="true"]')).toHaveCount(0);
});

test('shoes carry their upper and sole: imported, filtered on Explore, shown on the gear page', async ({ page, browser }, testInfo) => {
    const owner = await (await browser.newContext()).newPage();
    const username = `wge2eowner${testInfo.workerIndex}`;
    const r = await owner.request.post(url('/register'), { data: { username, email: `${username}@example.com`, password: 'testtest' } });
    if (r.status() !== 200) expect((await owner.request.post(url('/signin'), { data: { username, password: 'testtest' } })).status()).toBe(200);
    const b = `Sh${Date.now().toString(36)}`;
    const csv = ['sku,name,brand,category,weight,unit,price,status,upper,outsole',
        `${b}-1,${b} Mesh runner,${b},Shoes,10,oz,140,published,Engineered mesh,Vibram Megagrip`,
        `${b}-2,${b} Leather boot,${b},Shoes,24,oz,220,published,Nubuck,Contagrip`].join('\n');
    const res = await owner.request.post(url('/api/admin/catalog/import/apply'), { data: { csv } });
    expect(res.ok()).toBe(true);
    await owner.context().close();

    await page.goto(url('/explore/shoes'));
    const card = (name: string) => page.getByTestId('explore-item').filter({ hasText: name });
    await expect(card(`${b} Mesh runner`)).toBeVisible();
    // Upper is a choice: tick Leather, and only the leather boot stays.
    await page.locator('input[name="upper"][value="leather"]').check();
    await expect(card(`${b} Leather boot`)).toBeVisible();
    await expect(card(`${b} Mesh runner`)).toBeHidden();
    await expect(page).toHaveURL(/upper=leather/);

    // The gear page lists both.
    await card(`${b} Leather boot`).getByRole('link').first().click();
    const specs = page.getByTestId('gear-specs');
    await expect(specs).toContainText('Upper');
    await expect(specs).toContainText('Leather');
    await expect(specs).toContainText('Sole');
    await expect(specs).toContainText('Contagrip');
});

test('daypacks are one of Pack\'s sub-items, by their category or their pack type, apart from Packs', async ({ page, browser }, testInfo) => {
    const owner = await (await browser.newContext()).newPage();
    const username = `wge2eowner${testInfo.workerIndex}`;
    const r = await owner.request.post(url('/register'), { data: { username, email: `${username}@example.com`, password: 'testtest' } });
    if (r.status() !== 200) expect((await owner.request.post(url('/signin'), { data: { username, password: 'testtest' } })).status()).toBe(200);
    const b = `Dp${Date.now().toString(36)}`;
    const csv = ['sku,name,brand,category,weight,unit,price,status,pack_type',
        `${b}-1,${b} Thru pack,${b},Pack,30,oz,250,published,`,
        `${b}-2,${b} Summit bag,${b},Daypack,12,oz,90,published,`,
        `${b}-3,${b} Day tripper,${b},Pack,16,oz,120,published,Daypack`].join('\n');
    expect((await owner.request.post(url('/api/admin/catalog/import/apply'), { data: { csv } })).ok()).toBe(true);
    await owner.context().close();

    // On the Explore page: Daypacks is Pack's last sub-item.
    await page.goto(url('/explore'));
    const kids = page.locator('[data-testid="explore-section"][data-slug="pack"]').getByTestId('explore-child');
    await expect(kids.last()).toContainText('Daypacks');
    await expect(kids.last()).toHaveAttribute('href', '/explore/pack?pack_type=daypack');
    await expect(page.locator('[data-slug="daypack"]')).toHaveCount(0);

    const card = (name: string) => page.getByTestId('explore-item').filter({ hasText: name });
    await page.goto(url(`/explore/pack?brand=${b.toLowerCase()}`));
    await page.getByTestId('subtype-daypack').click();
    await expect(page).toHaveURL(/pack_type=daypack/);
    await expect(card(`${b} Summit bag`)).toBeVisible();
    await expect(card(`${b} Day tripper`)).toBeVisible();
    await expect(card(`${b} Thru pack`)).toBeHidden();
    await page.getByTestId('subtype-pack').click();
    await expect(card(`${b} Thru pack`)).toBeVisible();
    await expect(card(`${b} Summit bag`)).toBeHidden();
    await expect(card(`${b} Day tripper`)).toBeHidden();
});
