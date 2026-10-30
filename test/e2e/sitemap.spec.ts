import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';

import { testRoot } from './utils';

// sitemap.xml: an index of sitemap files covering every public page, built
// from the database daily (server/sitemap.js); `waymark sitemap` rebuilds it.

// Both tests rebuild the one sitemap folder: one at a time.
test.describe.configure({ mode: 'serial' });

const url = (p: string) => new URL(p, testRoot).toString();
// The rebuild script uses the same folder as the test server (it's keyed by
// the server's port).
const rebuild = (extra = {}) => execFileSync('node', ['scripts/build-sitemap.js'], {
    encoding: 'utf8',
    env: { ...process.env, NODE_CONFIG: JSON.stringify({ port: Number(new URL(testRoot).port || 80), deployUrl: new URL(testRoot).origin, ...extra }) },
});

test('the sitemap lists the fixed pages, trails, gear, lists and profiles, and a rebuild adds new ones', async ({ page }, testInfo) => {
    test.setTimeout(60000);
    const username = `wge2eowner${testInfo.workerIndex}`;
    const r = await page.request.post(url('/register'), { data: { username, email: `${username}@example.com`, password: 'testtest' } });
    if (r.status() !== 200) expect((await page.request.post(url('/signin'), { data: { username, password: 'testtest' } })).status()).toBe(200);
    const tag = `sm${Date.now().toString(36)}`;
    const csv = ['sku,name,brand,category,weight,unit,status', `${tag},Sitemap stove ${tag},Trailco,Cooking,3,oz,published`, `${tag}-d,Draft stove ${tag},Trailco,Cooking,3,oz,draft`].join('\n');
    expect((await page.request.post(url('/api/admin/catalog/import/apply'), { data: { csv } })).ok()).toBe(true);
    const items = (await (await page.request.get(url(`/api/admin/catalog?q=${tag}`))).json()).items;
    const published = items.find((i: { status: string }) => i.status === 'published');
    const draft = items.find((i: { status: string }) => i.status === 'draft');

    expect(rebuild()).toMatch(/Sitemap rebuilt: \d+ pages in \d+ files/);

    const index = await page.request.get(url('/sitemap.xml'));
    expect(index.headers()['content-type']).toContain('xml');
    const indexXml = await index.text();
    expect(indexXml).toContain('<sitemapindex');
    const files = [...indexXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
    expect(files).toContain('/sitemaps/pages.xml');
    expect(files).toContain('/sitemaps/gear-1.xml');

    const all = (await Promise.all(files.map(async (f) => (await page.request.get(url(f))).text()))).join('\n');
    for (const p of ['/welcome', '/explore', '/brands', '/reviews', '/leaderboard', '/trails/all', '/trails/pct']) {
        expect(all, p).toContain(`<loc>${new URL(p, testRoot).toString()}</loc>`);
    }
    expect(all).toContain(`/g/${published.id}</loc>`);
    expect(all).not.toContain(`/g/${draft.id}</loc>`);
    expect(all).toMatch(/\/r\/[A-Za-z0-9]+<\/loc>/);
    // Private pages never.
    for (const p of ['/owner/', '/moderation', '/profile<', '/api/']) expect(all).not.toContain(p);

    // Only sitemap files are served from there.
    expect((await page.request.get(url('/sitemaps/../package.xml'))).status()).toBeGreaterThanOrEqual(400);
    expect((await page.request.get(url('/sitemaps/secrets.xml'))).status()).toBe(404);
});

test('a big site is split into numbered files under the per-file limit', async ({ page }) => {
    // 5 links a file instead of 40,000.
    rebuild({ sitemap: { perFile: 5 } });
    const indexXml = await (await page.request.get(url('/sitemap.xml'))).text();
    const gear = [...indexXml.matchAll(/\/sitemaps\/(gear-\d+)\.xml/g)].map((m) => m[1]);
    expect(gear.length).toBeGreaterThan(1);
    for (const name of gear) {
        const xml = await (await page.request.get(url(`/sitemaps/${name}.xml`))).text();
        expect((xml.match(/<url>/g) || []).length).toBeLessThanOrEqual(5);
    }
    rebuild();
});
