import { test, expect, Page } from '@playwright/test';

import { registerUser, generateTestUser } from './auth-utils';
import { createCategory, addItem } from './test-helpers';
import { testRoot } from './utils';

// The Content-Security-Policy (server/security.js) is enforced against built
// assets, which is what this suite runs. A violation doesn't fail a request -
// the browser just silently refuses to run the script or load the image - so
// watch the console for the report on every kind of page the site serves.

const url = (p: string) => new URL(p, testRoot).toString();

function collectCspViolations(page: Page): string[] {
    const violations: string[] = [];
    page.on('console', (msg) => {
        if (/Content Security Policy/i.test(msg.text())) violations.push(msg.text());
    });
    return violations;
}

test.describe('Content Security Policy', () => {
    test('app, share page and docs load without violations', async ({ page }) => {
        const violations = collectCspViolations(page);

        await page.goto(url('/welcome'));
        await expect(page.locator('#lp')).not.toBeEmpty();

        const { username, password, email } = generateTestUser('csp');
        await registerUser(page, username, password, email);
        const category = await createCategory(page, 'Shelter');
        await addItem(category, 'Tent', { weight: '24' });

        await page.getByText('Share', { exact: true }).hover();
        const shareUrlInput = page.getByLabel('Share your list');
        await expect(shareUrlInput).toHaveValue(/\/r\/[a-zA-Z0-9]+/, { timeout: 10000 });
        const shareUrl = await shareUrlInput.inputValue();

        // Wait for the autosave that records the share link before leaving.
        await expect.poll(async () => (await page.request.get(shareUrl)).status(), { timeout: 15000 }).toBe(200);

        // The share page is server-rendered with two inline scripts that only
        // run if their nonce matches the header's.
        await page.goto(shareUrl);
        await expect(page.locator('.lpTotalValue')).toBeVisible();
        expect(await page.evaluate(() => typeof (window as any).chartData)).toBe('string');

        await page.goto(url('/privacy'));
        await expect(page.locator('h1').first()).toBeVisible();

        expect(violations).toEqual([]);
    });

    test('pages carry the expected security headers', async ({ request }) => {
        const res = await request.get(url('/welcome'));
        const h = res.headers();
        expect(h['content-security-policy']).toContain("default-src 'self'");
        expect(h['content-security-policy']).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+'/);
        expect(h['x-content-type-options']).toBe('nosniff');
        expect(h['x-frame-options']).toBe('SAMEORIGIN');
        // Embeds load this site's styles and images into other people's pages.
        expect(h['cross-origin-resource-policy']).toBe('cross-origin');
        expect(h['x-powered-by']).toBeUndefined();
    });

    test('each response gets a fresh nonce', async ({ request }) => {
        const nonce = async () => (await request.get(url('/welcome'))).headers()['content-security-policy']
            .match(/'nonce-([^']+)'/)![1];
        expect(await nonce()).not.toBe(await nonce());
    });

    test('health check reports the database', async ({ request }) => {
        const res = await request.get(url('/healthz'));
        expect(res.status()).toBe(200);
        expect(await res.json()).toEqual({ status: 'ok' });
    });
});
