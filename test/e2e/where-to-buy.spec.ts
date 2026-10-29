import { test, expect, Browser } from '@playwright/test';

import { testRoot } from './utils';

// Where to buy: a catalog item can list up to four shops besides its own
// product link. Buy opens a menu of them, with each shop's badge (copied
// here) or its initial; every link goes through /go and its affiliate rule.

const url = (p: string) => new URL(p, testRoot).toString();
const BADGE = () => url('/images/icon-192.png');

async function owner(browser: Browser, workerIndex: number) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const username = `wge2eowner${workerIndex}`;
    const r = await page.request.post(url('/register'), { data: { username, email: `${username}@example.com`, password: 'testtest' } });
    if (r.status() !== 200) expect((await page.request.post(url('/signin'), { data: { username, password: 'testtest' } })).status()).toBe(200);
    return { context, page };
}

test('shops from the import sheet: a Buy menu with badges, each link through its own affiliate rule', async ({ browser }, testInfo) => {
    test.setTimeout(90000);
    const o = await owner(browser, testInfo.workerIndex);
    const tag = `wtb${Date.now().toString(36)}`;
    const header = 'sku,name,brand,category,description,weight,unit,price,url,worn_default,consumable_default,tags,status,affiliate_url,shop1_name,shop1_badge,shop1_url,shop1_affiliate_url,shop2_name,shop2_badge,shop2_url,shop2_affiliate_url';
    const csv = [
        header,
        `${tag}-a,Multi shop tent ${tag},Trailco,Shelter,,20,oz,350,https://trailco-${tag}.example/tent,false,false,,published,,Backcountry ${tag},${BADGE()},https://backcountry-${tag}.example/p/tent,https://bc-${tag}.example/aff,,,https://ggg-${tag}.example/p/tent,`,
        `${tag}-b,One shop quilt ${tag},Trailco,Sleep,,20,oz,350,https://trailco-${tag}.example/quilt,false,false,,published,,,,,,,,,`,
    ].join('\n');
    expect((await o.page.request.post(url('/api/admin/catalog/import/apply'), { data: { csv } })).ok()).toBe(true);
    const find = async (name: string) => (await (await o.page.request.get(url(`/api/admin/catalog?q=${encodeURIComponent(name)}`))).json()).items[0];
    const tent = await find(`Multi shop tent ${tag}`);
    expect(tent.shops.map((s: { domain: string }) => s.domain)).toEqual([`backcountry-${tag}.example`, `ggg-${tag}.example`]);
    // The badge is copied in the background.
    await expect.poll(async () => (await find(`Multi shop tent ${tag}`)).shops[0].badgeUrl, { timeout: 20000 }).toMatch(/^\/userimages\//);

    // Public API: no affiliate links.
    const pub = await (await o.page.request.get(url(`/api/catalog?q=${encodeURIComponent(`Multi shop tent ${tag}`)}`))).json();
    expect(JSON.stringify(pub)).not.toContain('/aff');

    // A visitor on the gear page.
    const visitor = await (await browser.newContext()).newPage();
    await visitor.goto(url(`/g/${tent.id}`));
    const buy = visitor.getByTestId('gear-buy');
    await expect(buy).toContainText('3 shops');
    await buy.click();
    const options = visitor.getByTestId('buy-option');
    await expect(options).toHaveCount(3);
    await expect(options.nth(0)).toContainText('Trailco');
    await expect(options.nth(1)).toContainText(`Backcountry ${tag}`);
    await expect(options.nth(1).locator('img.wgBuyBadge')).toHaveAttribute('src', /^\/userimages\//);
    await expect(options.nth(2)).toContainText(`ggg-${tag}.example`);
    await expect(options.nth(2).locator('.wgBuyInitial')).toHaveText('G');
    // Escape closes it.
    await visitor.keyboard.press('Escape');
    await expect(options.first()).toBeHidden();

    // Each link: the shop's affiliate link if it has one, else its plain link.
    const go = async (i: number) => (await visitor.request.get(url(`/go/${tent.id}?from=gear&shop=${i}`), { maxRedirects: 0 })).headers().location;
    expect(await go(1)).toBe(`https://bc-${tag}.example/aff`);
    expect(await go(2)).toBe(`https://ggg-${tag}.example/p/tent`);
    expect((await visitor.request.get(url(`/go/${tent.id}?shop=9`), { maxRedirects: 0 })).headers().location).toBe(`/g/${tent.id}`);

    // One place to buy: a plain Buy link, as before.
    const quilt = await find(`One shop quilt ${tag}`);
    await visitor.goto(url(`/g/${quilt.id}`));
    await expect(visitor.getByTestId('gear-buy')).toHaveAttribute('href', `/go/${quilt.id}?from=gear`);
    await expect(visitor.getByTestId('buy-menu')).toHaveCount(0);

    // The compare page has the menu too.
    await visitor.goto(url(`/compare?ids=${tent.id},${quilt.id}`));
    await visitor.getByTestId('compare-buy').first().click();
    await expect(visitor.getByTestId('buy-option')).toHaveCount(3);

    // Export carries the shops back out.
    const exported = await (await o.page.request.get(url('/api/admin/catalog/export.csv'))).text();
    expect(exported.split('\n')[0]).toContain('shop1_name,shop1_badge,shop1_url,shop1_affiliate_url');
    expect(exported).toContain(`Backcountry ${tag}`);

    // The owner adds a third shop in the editor.
    await o.page.goto(url('/owner/catalog'));
    await o.page.getByPlaceholder('Search name, brand, SKU').fill(`Multi shop tent ${tag}`);
    await o.page.getByTestId('catalog-row').filter({ hasText: tag }).getByRole('button', { name: 'Edit' }).click();
    const shops = o.page.getByTestId('catalog-shop');
    await expect(shops).toHaveCount(2);
    await expect(shops.first().locator('img.wgShopBadge')).toBeVisible();
    await o.page.getByTestId('catalog-shop-add').click();
    await shops.nth(2).getByTestId('catalog-shop-name').fill('REI');
    await shops.nth(2).getByTestId('catalog-shop-url').fill(`https://rei-${tag}.example/p/tent`);
    await o.page.getByRole('button', { name: 'Save' }).click();
    await expect(o.page.getByText(`Saved “Multi shop tent ${tag}”`)).toBeVisible();
    expect((await find(`Multi shop tent ${tag}`)).shops).toHaveLength(3);
    await o.context.close();
});
