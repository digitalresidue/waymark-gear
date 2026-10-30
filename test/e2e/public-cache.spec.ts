import { test, expect } from '@playwright/test';

import { registerUser, generateTestUser } from './auth-utils';
import { testRoot } from './utils';

// Phase 3.8: public pages are cached briefly on the server and are
// CDN-friendly, without serving stale pages to their owners or reusing a
// CSP nonce.

const url = (p: string) => new URL(p, testRoot).toString();
const nonceOf = (csp: string) => (csp.match(/'nonce-([^']+)'/) || [])[1];

test('shared lists are cached, revalidate cheaply, and update the moment the owner saves', async ({ page }) => {
    const { username, password, email } = generateTestUser('pcache');
    await registerUser(page, username, password, email);
    await expect(page.getByTestId('item-row').first()).toBeVisible();
    const title = page.getByPlaceholder('Name your list', { exact: true });
    await title.fill('Cached kit');
    await title.blur();
    await page.getByText('Share', { exact: true }).hover();
    const shareInput = page.getByLabel('Share your list');
    await expect(shareInput).toHaveValue(/\/r\/[a-z0-9]+/, { timeout: 10000 });
    const link = await shareInput.inputValue();
    const toggle = page.getByTestId('publish-toggle');
    await expect(toggle).toBeEnabled({ timeout: 10000 });
    await toggle.check();
    await page.waitForResponse((r) => r.url().includes('saveLibrary') && r.status() === 200);

    const a = await page.request.get(link);
    const b = await page.request.get(link);
    expect(a.status()).toBe(200);
    expect(a.headers()['cache-control']).toContain('s-maxage=60');
    expect(a.headers().etag).toBeTruthy();
    expect(b.headers().etag).toBe(a.headers().etag);

    // Every response gets its own nonce, and the page's scripts carry it.
    const nonceA = nonceOf(a.headers()['content-security-policy']);
    const nonceB = nonceOf(b.headers()['content-security-policy']);
    expect(nonceA).toBeTruthy();
    expect(nonceA).not.toBe(nonceB);
    expect(await b.text()).toContain(`nonce="${nonceB}"`);
    expect(await b.text()).not.toContain('__WG_CSP_NONCE__');

    const notModified = await page.request.get(link, { headers: { 'If-None-Match': a.headers().etag } });
    expect(notModified.status()).toBe(304);

    // The owner renames the list: the shared page shows it straight away.
    await title.fill('Renamed kit');
    await title.blur();
    await page.waitForResponse((r) => r.url().includes('saveLibrary') && r.status() === 200, { timeout: 20000 });
    const after = await page.request.get(link);
    expect(await after.text()).toContain('Renamed kit');
    expect(after.headers().etag).not.toBe(a.headers().etag);

    // And the theme script still runs under CSP on a cached copy.
    await page.goto(link);
    await expect(page.locator('h1.lpListName')).toHaveText('Renamed kit');

    const robots = await (await page.request.get(url('/robots.txt'))).text();
    expect(robots).toContain('Sitemap:');
    expect(robots).toContain('Disallow: /api/');
    const sitemap = await page.request.get(url('/sitemap.xml'));
    expect(sitemap.headers()['content-type']).toContain('xml');
    expect(await sitemap.text()).toContain('<sitemapindex');
});
