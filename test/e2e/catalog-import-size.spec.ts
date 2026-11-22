import { test, expect, Browser } from '@playwright/test';

import { testRoot } from './utils';

// A catalog import takes up to 25,000 rows in one go (MAX_IMPORT_ROWS in
// server/catalog.js), past the usual 10 MB request limit. The rows are
// drafts, removed afterwards, so the rest of the suite doesn't see them.

const url = (p: string) => new URL(p, testRoot).toString();
const ROWS = 25000;

let knex: any;
test.beforeAll(async () => {
    const Knex = (await import('knex')).default;
    const { connectionConfig } = await import('../../server/db-config.js');
    knex = Knex({ client: 'pg', connection: connectionConfig() });
});
test.afterAll(async () => {
    await knex?.destroy();
});

async function owner(browser: Browser, workerIndex: number) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const username = `wge2eowner${workerIndex}`;
    const r = await page.request.post(url('/register'), { data: { username, email: `${username}@example.com`, password: 'testtest' } });
    if (r.status() !== 200) expect((await page.request.post(url('/signin'), { data: { username, password: 'testtest' } })).status()).toBe(200);
    return { context, page };
}

test('a 25,000-row catalog import previews and applies; one more row is refused', async ({ browser }, testInfo) => {
    test.setTimeout(180000);
    const o = await owner(browser, testInfo.workerIndex);
    const tag = `big${Date.now().toString(36)}`;
    // About 500 bytes a row, so the request is past the usual 10 MB.
    const note = 'A long description, as shops write them, to make this import as big as a real one. '.repeat(5);
    const head = 'sku,name,brand,category,description,weight,unit,price,status';
    const rows = (n: number, price = 100) => Array.from({ length: n }, (_, i) => `${tag}-${i},Bulk tent ${tag} ${i},Trailco,Shelter,"${note}",${20 + (i % 10)},oz,${price + (i % 50)},draft`);
    const csv = [head, ...rows(ROWS)].join('\n');
    expect(csv.length).toBeGreaterThan(10 * 1024 * 1024);
    try {
        const plan = await o.page.request.post(url('/api/admin/catalog/import/preview'), { data: { csv }, timeout: 120000 });
        expect(plan.status()).toBe(200);
        expect((await plan.json()).summary).toMatchObject({ new: ROWS, error: 0 });

        const applied = await o.page.request.post(url('/api/admin/catalog/import/apply'), { data: { csv }, timeout: 120000 });
        expect(applied.status()).toBe(200);
        expect((await applied.json()).summary).toMatchObject({ new: ROWS, error: 0 });
        const [{ count }] = await knex('catalog_items').where('sku', 'like', `${tag}-%`).count();
        expect(Number(count)).toBe(ROWS);

        // Again with new prices: every row an update.
        const again = await o.page.request.post(url('/api/admin/catalog/import/apply'), { data: { csv: [head, ...rows(ROWS, 90)].join('\n') }, timeout: 120000 });
        expect(again.status()).toBe(200);
        expect((await again.json()).summary).toMatchObject({ update: ROWS, error: 0 });

        const tooMany = await o.page.request.post(url('/api/admin/catalog/import/preview'), { data: { csv: [head, ...rows(ROWS + 1)].join('\n') }, timeout: 120000 });
        expect(tooMany.status()).toBe(400);
        expect((await tooMany.json()).message).toContain('25,000 rows');
    } finally {
        await knex('catalog_items').where('sku', 'like', `${tag}-%`).del();
        await o.context.close();
    }
});
