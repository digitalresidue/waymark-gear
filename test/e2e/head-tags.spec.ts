import { test, expect } from '@playwright/test';

import { testRoot } from './utils';

// Owner → Revenue → Header tags: verification <meta> tags on every page.

const url = (p: string) => new URL(p, testRoot).toString();
const IMPACT = "<meta name='impact-site-verification' value='c4eca0bc-65f6-43e0-941f-c660435ef990'>";

test.describe('Header tags', () => {
    test('the owner adds a verification tag and every page carries it; scripts are refused', async ({ browser }, testInfo) => {
        const context = await browser.newContext();
        const page = await context.newPage();
        const username = `wge2eowner${testInfo.workerIndex}`;
        const r = await page.request.post(url('/register'), { data: { username, email: `${username}@example.com`, password: 'testtest' } });
        if (r.status() !== 200) expect((await page.request.post(url('/signin'), { data: { username, password: 'testtest' } })).status()).toBe(200);

        try {
            await page.goto(url('/owner/revenue'));
            const input = page.getByTestId('head-tags-input');
            await expect(input).toBeVisible();

            // A script is turned away, with the reason.
            await input.fill('<script>alert(1)</script>');
            await page.getByTestId('head-tags-save').click();
            await expect(page.getByTestId('head-tags-error')).toContainText('only <meta');

            await input.fill(IMPACT);
            await page.getByTestId('head-tags-save').click();
            await expect(page.getByTestId('head-tags-saved')).toContainText('1 tag is on every page');
            await expect(input).toHaveValue('<meta name="impact-site-verification" value="c4eca0bc-65f6-43e0-941f-c660435ef990">');

            // In the head of the app, server pages and docs, as a crawler sees them.
            for (const path of ['/', '/welcome', '/trails/pct', '/privacy', '/reviews']) {
                const html = await (await page.request.get(url(path), { headers: { cookie: '' } })).text();
                const head = html.split('</head>')[0];
                expect(head, path).toContain('<meta name="impact-site-verification" value="c4eca0bc-65f6-43e0-941f-c660435ef990">');
            }
            await page.goto(url('/welcome'));
            await expect(page.locator('meta[name="impact-site-verification"]')).toHaveAttribute('value', 'c4eca0bc-65f6-43e0-941f-c660435ef990');

            // Members can't change them.
            const guest = await browser.newContext();
            expect((await guest.request.put(url('/api/admin/head-tags'), { data: { text: '' } })).status()).toBeGreaterThanOrEqual(400);
            await guest.close();
        } finally {
            // Leave the site as the other tests expect it.
            expect((await page.request.put(url('/api/admin/head-tags'), { data: { text: '' } })).ok()).toBe(true);
            await context.close();
        }
    });
});
