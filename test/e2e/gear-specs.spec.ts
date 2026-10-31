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
    const visitor = await (await browser.newContext()).newPage();
    await visitor.goto(url(`/g/${quilt.id}`));
    const specs = visitor.getByTestId('gear-specs');
    await expect(specs.locator('[data-spec="temp_comfort"] dd')).toHaveText('30°F (−1°C)');
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
