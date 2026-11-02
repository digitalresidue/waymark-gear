import { test, expect } from '@playwright/test';

import { testRoot } from './utils';

// Links that aren't affiliate links tell the shop we sent the visitor
// (utm_source/utm_medium), and the owner gets a monthly report per brand.

const url = (p: string) => new URL(p, testRoot).toString();

test('non-affiliate buy links carry referral tags; the brand report counts the visits', async ({ browser }, testInfo) => {
    const owner = await (await browser.newContext()).newPage();
    const username = `wge2eowner${testInfo.workerIndex}`;
    const r = await owner.request.post(url('/register'), { data: { username, email: `${username}@example.com`, password: 'testtest' } });
    if (r.status() !== 200) expect((await owner.request.post(url('/signin'), { data: { username, password: 'testtest' } })).status()).toBe(200);

    const brand = `Rf${Date.now().toString(36)}`;
    const csv = ['sku,name,brand,category,weight,unit,price,status,url',
        `${brand}-1,Plain pack,${brand},Packs,20,oz,250,published,https://plain-${brand}.example/pack?size=m`,
        `${brand}-2,Campaign quilt,${brand},Quilts,20,oz,300,published,https://camp-${brand}.example/quilt?utm_source=brandmail`].join('\n');
    expect((await owner.request.post(url('/api/admin/catalog/import/apply'), { data: { csv } })).ok()).toBe(true);
    const items = (await (await owner.request.get(url(`/api/catalog?q=${brand}`))).json()).items;
    const id = (name: string) => items.find((i: { name: string }) => i.name === name).id;

    const visitor = await browser.newContext();
    const go = async (gear: string, from: string) => (await visitor.request.get(url(`/go/${id(gear)}?from=${from}`), { maxRedirects: 0 })).headers().location;
    expect(await go('Plain pack', 'list')).toBe(`https://plain-${brand.toLowerCase()}.example/pack?size=m&utm_source=localhost&utm_medium=referral`);
    expect(await go('Plain pack', 'list')).toContain('utm_medium=referral');
    // The brand's own campaign tags win.
    expect(await go('Campaign quilt', 'gear')).toBe(`https://camp-${brand}.example/quilt?utm_source=brandmail`);

    // This month's report: the brand, its visits, and a summary to send.
    const month = new Date().toISOString().slice(0, 7);
    const report = await (await owner.request.get(url(`/api/admin/brand-report?month=${month}`))).json();
    const row = report.brands.find((b: { name: string }) => b.name === brand);
    expect(row).toMatchObject({ total: 3, productVisits: 3, siteVisits: 0 });
    expect(row.items[0]).toMatchObject({ name: 'Plain pack', clicks: 2 });
    expect(row.summary).toContain(`sent ${brand} 3 visitors in`);
    expect(row.summary).toContain('Most came from shared gear lists and gear pages.');

    // Not for everyone.
    const anon = await visitor.request.get(url(`/api/admin/brand-report?month=${month}`));
    expect(anon.status()).toBe(401);

    // The revenue page shows it, with a summary to copy.
    await owner.goto(url('/owner/revenue'));
    await owner.getByTestId('brand-report-month').selectOption(month);
    const line = owner.getByTestId('brand-report-row').filter({ hasText: brand });
    await expect(line).toContainText('3');
    await line.getByTestId('brand-report-copy').click();
    await expect(owner.getByTestId('brand-report-summary')).toContainText(`sent ${brand} 3 visitors`);
    await owner.context().close();
    await visitor.close();
});
