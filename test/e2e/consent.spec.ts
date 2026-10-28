import { test, expect, Browser } from '@playwright/test';

import { testRoot } from './utils';

// Google Analytics consent (client/utils/analytics.js). The suite's server
// runs without GA_MEASUREMENT_ID, so these tests switch it on for their own
// pages: the meta tag the server would add goes into each page, and Google's
// script is answered locally and counted.

const url = (p: string) => new URL(p, testRoot).toString();
const GTAG = 'https://www.googletagmanager.com/**';

async function withAnalytics(browser: Browser, timezoneId: string) {
    // The app's service worker would answer page loads itself, past the rewrite.
    const context = await browser.newContext({ timezoneId, serviceWorkers: 'block' });
    const gtag: string[] = [];
    await context.route(GTAG, (route) => {
        gtag.push(route.request().url());
        return route.fulfill({ status: 200, contentType: 'application/javascript', body: '/* gtag */' });
    });
    await context.route(`${new URL(testRoot).origin}/**`, async (route) => {
        if (route.request().resourceType() !== 'document') return route.continue();
        const response = await route.fetch();
        const headers = { ...response.headers() };
        // The real server allows Google's hosts in its policy when GA is on.
        delete headers['content-security-policy'];
        const body = (await response.text()).replace('</head>', '<meta name="wg-analytics" content="G-TEST12345"></head>');
        return route.fulfill({ response, headers, body });
    });
    const page = await context.newPage();
    return { context, page, gtag };
}

const consentCookie = async (page: import('@playwright/test').Page) => (await page.context().cookies()).find((c) => c.name === 'wg_consent')?.value;

test.describe('Cookie consent', () => {
    test('in an opt-in region nothing loads until yes; no is as easy as yes, and it sticks', async ({ browser }) => {
        test.setTimeout(60000);
        const { context, page, gtag } = await withAnalytics(browser, 'Europe/Berlin');
        for (const path of ['/welcome', '/trails/pct']) {
            await page.goto(url(path));
            const banner = page.getByTestId('consent-banner');
            await expect(banner).toBeVisible();
            await expect(banner.getByTestId('consent-analytics')).not.toBeChecked();
            const sizes = await Promise.all(['consent-reject', 'consent-save', 'consent-accept'].map(async (id) => (await banner.getByTestId(id).boundingBox())!));
            expect(sizes[0].width).toBe(sizes[2].width);
            expect(sizes[0].height).toBe(sizes[2].height);
        }
        await page.waitForTimeout(2500);
        expect(gtag).toHaveLength(0);

        // No.
        await page.getByTestId('consent-reject').click();
        await expect(page.getByTestId('consent-banner')).toHaveCount(0);
        expect(await consentCookie(page)).toBe('denied');
        await page.goto(url('/welcome'));
        await expect(page.locator('.wgSiteFooter')).toBeVisible();
        await page.waitForTimeout(2500);
        await expect(page.getByTestId('consent-banner')).toHaveCount(0);
        expect(gtag).toHaveLength(0);

        // Changed my mind: Cookie settings in the footer, tick Analytics, save.
        await page.locator('.wgSiteFooter [data-cookie-settings]').click();
        await expect(page.getByTestId('consent-analytics')).toBeFocused();
        await page.getByTestId('consent-analytics').check();
        await page.getByTestId('consent-save').click();
        expect(await consentCookie(page)).toBe('granted');
        await expect.poll(() => gtag.length, { timeout: 10000 }).toBe(1);
        expect(gtag[0]).toContain('id=G-TEST12345');
        await page.goto(url('/trails/pct'));
        await expect.poll(() => gtag.length, { timeout: 10000 }).toBe(2);
        await expect(page.getByTestId('consent-banner')).toHaveCount(0);
        await context.close();
    });

    test('elsewhere it\'s on after the page loads, with a way to turn it off', async ({ browser }) => {
        const { context, page, gtag } = await withAnalytics(browser, 'America/New_York');
        await page.goto(url('/welcome'));
        await expect.poll(() => gtag.length, { timeout: 10000 }).toBe(1);
        await expect(page.getByTestId('consent-banner')).toHaveCount(0);
        await page.locator('.wgSiteFooter [data-cookie-settings]').click();
        await page.getByTestId('consent-reject').click();
        expect(await consentCookie(page)).toBe('denied');
        await page.goto(url('/welcome'));
        await expect(page.locator('.wgSiteFooter')).toBeVisible();
        await page.waitForTimeout(2500);
        expect(gtag).toHaveLength(1);
        await context.close();
    });

    test('Global Privacy Control: no Analytics, no banner', async ({ browser }) => {
        const { context, page, gtag } = await withAnalytics(browser, 'Europe/Paris');
        await context.addInitScript(() => Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: () => true }));
        await page.goto(url('/welcome'));
        await expect(page.locator('.wgSiteFooter')).toBeVisible();
        await page.waitForTimeout(2500);
        await expect(page.getByTestId('consent-banner')).toHaveCount(0);
        expect(gtag).toHaveLength(0);
        await context.close();
    });

    test('with Analytics off (the default) there is no banner and no Cookie settings link', async ({ browser }) => {
        const context = await browser.newContext({ timezoneId: 'Europe/Berlin' });
        const page = await context.newPage();
        await page.goto(url('/welcome'));
        await expect(page.locator('.wgSiteFooter')).toBeVisible();
        await expect(page.locator('.wgSiteFooter [data-cookie-settings]')).toBeHidden();
        await expect(page.getByTestId('consent-banner')).toHaveCount(0);
        await context.close();
    });
});
