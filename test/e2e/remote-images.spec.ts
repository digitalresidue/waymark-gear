import { test, expect, Browser } from '@playwright/test';

import { registerUser, generateTestUser } from './auth-utils';
import { createCategory, addItem } from './test-helpers';
import { testRoot } from './utils';

// Image links people paste are copied here (fit within 512×512), so pages
// never load them from the original site. The suite's server may fetch from
// itself (remoteImages.allowPrivate); production only fetches public sites.

const url = (p: string) => new URL(p, testRoot).toString();
// 1200×630, served by the app itself.
const BIG = () => url('/images/og-image.png');

async function owner(browser: Browser, workerIndex: number) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const username = `wge2eowner${workerIndex}`;
    const r = await page.request.post(url('/register'), { data: { username, email: `${username}@example.com`, password: 'testtest' } });
    if (r.status() !== 200) expect((await page.request.post(url('/signin'), { data: { username, password: 'testtest' } })).status()).toBe(200);
    return { context, page };
}

test.describe('Image links are copied, not hotlinked', () => {
    test('a list item photo by link becomes our own copy, at most 512px', async ({ page }) => {
        const u = generateTestUser('imgcopy');
        await registerUser(page, u.username, u.password, u.email);
        await expect(page.getByText('Add new category', { exact: true })).toBeVisible();
        const category = await createCategory(page, 'Shelter');
        const row = await addItem(category, 'Tent', { weight: '20' });

        // Not an image: refused, with the reason.
        await row.hover();
        await row.getByTitle('Upload a photo or use a photo from the web').click();
        await page.getByTestId('item-image-url').fill(url('/welcome'));
        await page.locator('#itemImageUrlForm').getByRole('button', { name: 'Save' }).or(page.locator('#itemImageUrlForm input[type=submit]')).click();
        await expect(page.getByTestId('item-image-url-error')).toContainText('JPEG, PNG or WebP');

        await page.getByTestId('item-image-url').fill(BIG());
        await page.locator('#itemImageUrlForm input[type=submit]').click();
        const thumb = row.locator('img.lpItemImage');
        await expect(thumb).toBeVisible();
        await expect(thumb).toHaveAttribute('src', /^\/userimages\/.+_t\.webp$/);

        // The full copy fits within 512×512.
        const full = (await thumb.getAttribute('src'))!.replace('_t.webp', '.webp');
        const size = await page.evaluate(async (src) => {
            const img = new Image();
            img.src = src;
            await img.decode();
            return { w: img.naturalWidth, h: img.naturalHeight };
        }, full);
        expect(size.w).toBe(512);
        expect(size.h).toBeLessThanOrEqual(512);
    });

    test('catalog photos are copied on save and after an import; ones that fail are listed', async ({ browser }, testInfo) => {
        test.setTimeout(60000);
        const o = await owner(browser, testInfo.workerIndex);
        const tag = `ri${Date.now().toString(36)}`;

        // Editor / API: copied before it's saved.
        const created = await o.page.request.post(url('/api/admin/catalog'), { data: { name: `Photo tent ${tag}`, category: 'Shelter', weight: '20', unit: 'oz', status: 'published', imageUrl: BIG() } });
        expect(created.status()).toBe(201);
        expect((await created.json()).item.imageUrl).toMatch(/^\/userimages\/.+\.webp$/);
        const bad = await o.page.request.post(url('/api/admin/catalog'), { data: { name: `Bad photo ${tag}`, category: 'Shelter', weight: '1', unit: 'oz', imageUrl: url('/no-such-image.png') } });
        expect(bad.status()).toBe(400);
        expect(JSON.stringify(await bad.json())).toContain('Couldn\'t copy the photo');

        // Import: copied in the background; a dead link stays listed.
        const csv = [
            'sku,name,brand,category,description,weight,unit,price,url,image_url,worn_default,consumable_default,tags,status',
            `${tag}-a,Import quilt ${tag},Trailco,Sleep,,21,oz,,,${BIG()},false,false,,published`,
            `${tag}-b,Dead link pad ${tag},Trailco,Sleep,,12,oz,,,${url(`/gone-${tag}.png`)},false,false,,published`,
        ].join('\n');
        expect((await o.page.request.post(url('/api/admin/catalog/import/apply'), { data: { csv } })).ok()).toBe(true);
        const find = async (name: string) => (await (await o.page.request.get(url(`/api/admin/catalog?q=${encodeURIComponent(name)}`))).json()).items[0];
        // The owner's list shows copies as full links to this site.
        await expect.poll(async () => (await find(`Import quilt ${tag}`)).imageUrl, { timeout: 20000 }).toMatch(/^https?:\/\/[^/]+\/userimages\//);

        await o.page.goto(url('/owner/catalog'));
        await expect(o.page.getByTestId('remote-images')).toContainText(/still loads? from other websites/);
        await o.page.getByTestId('remote-images-copy').click();
        await expect(o.page.getByTestId('remote-images-result')).toContainText('couldn\'t be copied');
        await expect(o.page.getByTestId('remote-images')).toContainText(`Dead link pad ${tag}`);
        await o.context.close();
    });

    test('a copied photo shows as a full link, saves again as is, and exports and re-imports unchanged', async ({ browser }, testInfo) => {
        test.setTimeout(60000);
        const o = await owner(browser, testInfo.workerIndex);
        const tag = `rl${Date.now().toString(36)}`;
        const created = await (await o.page.request.post(url('/api/admin/catalog'), { data: { name: `Linked tent ${tag}`, category: 'Shelter', weight: '20', unit: 'oz', status: 'published', imageUrl: BIG(), sku: `${tag}-1` } })).json();
        const stored = created.item.imageUrl;
        expect(stored).toMatch(/^\/userimages\//);
        const full = new URL(stored, testRoot).toString();

        // The editor shows the full link and saves it without complaint.
        await o.page.goto(url('/owner/catalog'));
        await o.page.getByPlaceholder('Search name, brand, SKU').fill(`Linked tent ${tag}`);
        await o.page.getByRole('button', { name: `Edit Linked tent ${tag}`, exact: true }).click();
        await expect(o.page.getByTestId('catalog-image-url')).toHaveValue(full);
        await o.page.getByTestId('field-weight').fill('21');
        await o.page.getByRole('button', { name: 'Save' }).click();
        await expect(o.page.getByText(`Saved “Linked tent ${tag}”`)).toBeVisible();
        const after = (await (await o.page.request.get(url(`/api/catalog?q=${encodeURIComponent(`Linked tent ${tag}`)}`))).json()).items[0];
        expect(after.imageUrl).toBe(stored);

        // Export: the full link. Importing the export changes nothing.
        const exported = await (await o.page.request.get(url('/api/admin/catalog/export.csv'))).text();
        const line = exported.split('\n').find((l) => l.includes(`Linked tent ${tag}`))!;
        expect(line).toContain(full);
        const head = exported.split('\n')[0];
        const plan = await (await o.page.request.post(url('/api/admin/catalog/import/preview'), { data: { csv: `${head}\n${line}` } })).json();
        expect(plan.summary).toMatchObject({ unchanged: 1, error: 0 });

        // Pasting that full link onto a list item reuses the copy.
        const reused = await (await o.page.request.post(url('/api/images/copy'), { data: { url: full } })).json();
        expect(reused.imageUrl).toBe(stored);
        await o.context.close();
    });

    test('the copy endpoint needs an account', async ({ request }) => {
        const r = await request.post(url('/api/images/copy'), { data: { url: BIG() } });
        expect(r.status()).toBe(401);
    });
});
