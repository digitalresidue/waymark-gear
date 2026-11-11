import { test, expect, Browser } from '@playwright/test';

import { testRoot } from './utils';

// Gear specs: a tent's pitch and size, a quilt's ratings... from the import
// sheet or the owner's editor, shown on gear pages, filterable in the API.

const url = (p: string) => new URL(p, testRoot).toString();

async function owner(browser: Browser, workerIndex: number) {
    const page = await (await browser.newContext()).newPage();
    const username = `wge2eowner${workerIndex}`;
    const r = await page.request.post(url('/register'), { data: { username, email: `${username}@example.com`, password: 'testtest' } });
    if (r.status() !== 200) expect((await page.request.post(url('/signin'), { data: { username, password: 'testtest' } })).status()).toBe(200);
    return page;
}

test('specs from the import sheet: stored, filterable, on the gear page, editable', async ({ browser }, testInfo) => {
    test.setTimeout(90000);
    const page = await owner(browser, testInfo.workerIndex);
    const tag = `sp${Date.now().toString(36)}`;
    const head = 'sku,name,brand,category,weight,unit,status,capacity,pitch,trail_weight,double_wall,vestibules,floor_length,packed_size,temp_comfort,temp_limit,insulation,fill_power,footbox,rds';
    const csv = [
        head,
        `${tag}-t,Spec tent ${tag},Trailco,Tent,26,oz,published,2P,Semi Freestanding,26 oz,yes,2,84 in,18 x 5 x 5 in,,,,,,`,
        `${tag}-f,Free tent ${tag},Trailco,Tents,40,oz,published,1P,Freestanding,40 oz,yes,1,,,,,,,,`,
        `${tag}-q,Spec quilt ${tag},Trailco,Top Quilt,21,oz,published,,,,,,,,30F,20F,Down,850,Zipper,yes`,
        `${tag}-x,Bad quilt ${tag},Trailco,Top Quilt,21,oz,published,,,,,,,,toasty,,,,,`,
    ].join('\n');
    const plan = await (await page.request.post(url('/api/admin/catalog/import/preview'), { data: { csv } })).json();
    expect(plan.summary).toMatchObject({ new: 3, error: 1 });
    expect(JSON.stringify(plan.rows.find((r: { action: string }) => r.action === 'error').errors)).toContain('Comfort rating');
    expect((await page.request.post(url('/api/admin/catalog/import/apply'), { data: { csv } })).ok()).toBe(true);

    const find = async (name: string) => (await (await page.request.get(url(`/api/admin/catalog?q=${encodeURIComponent(name)}`))).json()).items[0];
    const tent = await find(`Spec tent ${tag}`);
    expect(tent.specs).toMatchObject({ capacity: '2p', pitch: 'semi_freestanding', double_wall: true, vestibules: 2, floor_length: 213.4, packed_size: [45.7, 12.7, 12.7] });
    // Quilt-only columns on a tent's row are ignored.
    expect(tent.specs.temp_comfort).toBeUndefined();
    const quilt = await find(`Spec quilt ${tag}`);
    expect(quilt.specs).toMatchObject({ temp_comfort: -1.1, temp_limit: -6.7, insulation: 'down', fill_power: 850, footbox: 'zippered', rds: 'yes' });

    // Filters, in either unit.
    const names = async (q: string) => (await (await page.request.get(url(`/api/catalog?q=${tag}&${q}`))).json()).items.map((i: { name: string }) => i.name).sort();
    expect(await names('spec_pitch=freestanding,semi-freestanding')).toEqual([`Free tent ${tag}`, `Spec tent ${tag}`]);
    expect(await names('spec_pitch=freestanding')).toEqual([`Free tent ${tag}`]);
    expect(await names('spec_trail_weight_max=2lb')).toEqual([`Spec tent ${tag}`]);
    expect(await names('spec_temp_limit_max=-5C')).toEqual([`Spec quilt ${tag}`]);
    expect(await names('spec_fill_power_min=800')).toEqual([`Spec quilt ${tag}`]);
    expect(await names('spec_double_wall=yes')).toEqual([`Free tent ${tag}`, `Spec tent ${tag}`]);

    // The gear page.
    // In the reader's units only.
    const metric = await (await browser.newContext({ locale: 'de-DE' })).newPage();
    await metric.goto(url(`/g/${quilt.id}`));
    await expect(metric.getByTestId('gear-specs').locator('[data-spec="temp_comfort"] dd')).toHaveText('−1°C');
    await metric.context().close();
    const visitor = await (await browser.newContext({ locale: 'en-US' })).newPage();
    await visitor.goto(url(`/g/${quilt.id}`));
    const specs = visitor.getByTestId('gear-specs');
    await expect(specs.locator('[data-spec="temp_comfort"] dd')).toHaveText('30°F');
    await expect(specs.locator('[data-spec="fill_power"] dd')).toHaveText('850 fill');
    await expect(specs.locator('[data-spec="footbox"] dd')).toHaveText('Zippered');

    // Export carries them back out as typed values.
    const exported = await (await page.request.get(url('/api/admin/catalog/export.csv'))).text();
    expect(exported.split('\n')[0]).toContain(',capacity,pitch,');
    expect(exported).toContain('Semi-freestanding');

    // The owner's editor: the tent's specs, changed and saved.
    await page.goto(url('/owner/catalog'));
    await page.getByPlaceholder('Search name, brand, SKU').fill(`Spec tent ${tag}`);
    await page.getByRole('button', { name: `Edit Spec tent ${tag}`, exact: true }).click();
    const editor = page.getByTestId('catalog-specs');
    await expect(editor).toContainText('Tent specs');
    await expect(page.getByTestId('spec-pitch')).toHaveValue('Semi-freestanding');
    await expect(page.getByTestId('spec-floor_length')).toHaveValue('84 in');
    await page.getByTestId('spec-pitch').selectOption('Trekking pole');
    await page.getByTestId('spec-peak_height').fill('120 cm');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(`Saved “Spec tent ${tag}”`)).toBeVisible();
    expect((await find(`Spec tent ${tag}`)).specs).toMatchObject({ pitch: 'trekking_pole', peak_height: 120, capacity: '2p' });

    // A category without specs says which ones have them.
    await page.getByRole('button', { name: `Edit Spec tent ${tag}`, exact: true }).click();
    await page.getByTestId('field-category').fill('Cooking');
    await expect(page.getByTestId('catalog-specs-none')).toContainText('Specs come with these categories');
    await visitor.context().close();
});

test('lights, power banks and pack fit: from the sheet, side by side on /compare, kept by swaps', async ({ browser }, testInfo) => {
    test.setTimeout(90000);
    const page = await owner(browser, testInfo.workerIndex);
    const tag = `sq${Date.now().toString(36)}`;
    const head = 'sku,name,brand,category,weight,unit,status,lumens,runtime,battery,charge_port,capacity_mah,output_w,gender,hip_belt';
    const csv = [
        head,
        `${tag}-h1,Bright lamp ${tag},Trailco,Headlamp,3,oz,published,400 lumens,40 h,Rechargeable,USB-C,,,,`,
        `${tag}-h2,Dim lamp ${tag},Trailco,Headlamp,2,oz,published,250,120 hours,AAA,none,,,,`,
        `${tag}-p1,Old power bank ${tag},Heavyco,Power Bank,10,oz,published,,,,,"10,000 mAh",18 W,,`,
        `${tag}-p2,Light power bank ${tag},Trailco,Power Bank,6,oz,published,,,,,10000,20,,`,
        `${tag}-p3,Small power bank ${tag},Trailco,Power Bank,4,oz,published,,,,,5000 mAh,10,,`,
        `${tag}-k,Fit pack ${tag},Trailco,Backpack,20,oz,published,,,,,,,Women's,Removable`,
    ].join('\n');
    const plan = await (await page.request.post(url('/api/admin/catalog/import/preview'), { data: { csv } })).json();
    expect(plan.summary).toMatchObject({ new: 6, error: 0 });
    expect((await page.request.post(url('/api/admin/catalog/import/apply'), { data: { csv } })).ok()).toBe(true);
    const find = async (name: string) => (await (await page.request.get(url(`/api/admin/catalog?q=${encodeURIComponent(name)}`))).json()).items[0];
    const bright = await find(`Bright lamp ${tag}`);
    const dim = await find(`Dim lamp ${tag}`);
    expect(bright.specs).toMatchObject({ lumens: 400, runtime: 40, battery: 'built_in', charge_port: 'usb_c' });
    expect((await find(`Old power bank ${tag}`)).specs).toMatchObject({ capacity_mah: 10000, output_w: 18 });
    expect((await find(`Fit pack ${tag}`)).specs).toMatchObject({ gender: 'womens', hip_belt: 'removable' });

    // The gear page.
    await page.goto(url(`/g/${bright.id}`));
    await expect(page.getByTestId('gear-specs').locator('[data-spec="lumens"] dd')).toHaveText('400 lm');
    await expect(page.getByTestId('gear-specs').locator('[data-spec="battery"] dd')).toHaveText('Built-in rechargeable');

    // Side by side: the brighter lamp and the longer runtime marked best.
    await page.goto(url(`/compare?ids=${bright.id},${dim.id}`));
    const row = (key: string) => page.locator(`[data-testid="compare-spec"][data-key="${key}"] td`);
    await expect(row('lumens')).toHaveText(['400 lm best', '250 lm']);
    await expect(row('runtime')).toHaveText(['40 h', '120 h best']);
    await expect(row('battery')).toHaveText(['Built-in rechargeable', 'AAA']);
    await expect(row('charge_port')).toHaveText(['USB-C', 'None']);

    // The gear check: a lighter power bank with the same capacity, never one
    // with half of it.
    const list = (await page.request.post(url('/api/insights'), { data: { items: [
        { name: `Old power bank ${tag}`, category: 'Power Bank', weightMg: 283495, catalogId: (await find(`Old power bank ${tag}`)).id },
    ] } }));
    expect(list.ok()).toBe(true);
    const alts = (await list.json()).alternatives.flatMap((a: { options: { name: string }[] }) => a.options.map((o) => o.name));
    expect(alts).toContain(`Light power bank ${tag}`);
    expect(alts).not.toContain(`Small power bank ${tag}`);
});

test('hammocks: from the sheet, on the gear page, and their own filters in Shelter', async ({ browser, page }, testInfo) => {
    const ownerPage = await owner(browser, testInfo.workerIndex);
    const tag = `hm${Date.now().toString(36)}`;
    const csv = [
        'sku,name,brand,category,weight,unit,status,hammock_length,hammock_width,hammock_shape,lay_direction,bug_net,ridgeline,hammock_layers,wide,fabric',
        `${tag}-1,Asym hammock ${tag},Trailco,Hammock,20,oz,published,11 ft,60 in,Asymmetrical,Head left,yes,yes,Double,no,1.0 Hexon`,
        `${tag}-2,Gathered hammock ${tag},Trailco,Hammock,14,oz,published,10 ft,58,Symmetrical,,no,yes,single,no,1.0 Hexon`,
        `${tag}-3,Pole tent ${tag},Trailco,Tent,28,oz,published,,,,,,,,,`,
    ].join('\n');
    const plan = await (await ownerPage.request.post(url('/api/admin/catalog/import/preview'), { data: { csv } })).json();
    expect(plan.summary).toMatchObject({ new: 3, error: 0 });
    expect((await ownerPage.request.post(url('/api/admin/catalog/import/apply'), { data: { csv } })).ok()).toBe(true);
    const asym = (await (await ownerPage.request.get(url(`/api/admin/catalog?q=${encodeURIComponent(`Asym hammock ${tag}`)}`))).json()).items[0];
    expect(asym.specs).toMatchObject({ hammock_shape: 'asymmetrical', lay_direction: 'head_left', bug_net: true, ridgeline: true, hammock_layers: 'double', wide: false });

    await page.goto(url(`/g/${asym.id}`));
    const specs = page.getByTestId('gear-specs');
    await expect(specs.locator('[data-spec="hammock_length"] dd')).toContainText('11 ft');
    await expect(specs.locator('[data-spec="lay_direction"] dd')).toHaveText('Head left, foot right');
    await expect(specs.locator('[data-spec="bug_net"] dd')).toHaveText('Yes');

    // Explore → Shelter: hammock filters.
    await page.goto(url('/explore/shelter'));
    await expect(page.getByTestId('filter-hammock_shape')).toBeVisible();
    await expect(page.getByTestId('filter-bug_net')).toBeVisible();
    await page.locator('input[name="cat"][value="hammock"]').check();
    await page.getByTestId('filter-hammock_shape').locator('input[value="asymmetrical"]').check();
    await expect(page.getByTestId('explore-item').filter({ visible: true }).filter({ hasText: tag })).toHaveText([new RegExp(`Asym hammock ${tag}`)]);
    await ownerPage.context().close();
});
