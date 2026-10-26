import { test, expect, Page } from '@playwright/test';

import { registerUser, generateTestUser } from './auth-utils';
import { testRoot } from './utils';

// Phase 3.2: the app opens and keeps edits with no signal, then syncs.

const url = (p: string) => new URL(p, testRoot).toString();
const nameOf = (page: Page) => page.getByTestId('item-row').first().getByPlaceholder('Name', { exact: true });

test.describe('Offline', () => {
    test('installable: manifest, icons and service worker are served', async ({ request }) => {
        const manifest = await (await request.get(url('/manifest.webmanifest'))).json();
        expect(manifest.display).toBe('standalone');
        expect(manifest.start_url).toBe('/');
        for (const icon of manifest.icons) {
            expect((await request.get(url(icon.src))).status()).toBe(200);
        }
        const sw = await request.get(url('/sw.js'));
        expect(sw.status()).toBe(200);
        expect(sw.headers()['content-type']).toContain('javascript');
    });

    test('edits made offline survive a reload with no signal and sync when back online', async ({ page, context, browserName }) => {
        test.skip(browserName !== 'chromium', 'Service worker offline emulation is Chromium-only in Playwright');
        const { username, password, email } = generateTestUser('offline');
        await registerUser(page, username, password, email);
        await expect(page.getByTestId('item-row').first()).toBeVisible();

        // Wait for the service worker, then reload so it controls the page.
        await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
        await page.reload();
        await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
        await expect(nameOf(page)).toBeVisible();

        await context.setOffline(true);
        await expect(page.getByTestId('offline-banner')).toBeVisible();
        await nameOf(page).fill('Edited at the trailhead');
        await nameOf(page).blur();

        // Closing and reopening with no signal: the app shell and the edit both come back.
        await page.reload();
        await expect(page.getByTestId('offline-banner')).toBeVisible();
        await expect(nameOf(page)).toHaveValue('Edited at the trailhead');

        // Signal returns: the edit is sent without anyone doing anything.
        const saved = page.waitForResponse((r) => r.url().includes('saveLibrary') && r.status() === 200, { timeout: 20000 });
        await context.setOffline(false);
        await saved;
        await expect(page.getByTestId('offline-banner')).toHaveCount(0);

        const body = await (await page.request.post(url('/signin'), { data: {} })).json();
        expect(JSON.parse(body.library).items.map((i: any) => i.name)).toContain('Edited at the trailhead');
    });

    test('signing out removes the copy kept on the device', async ({ page }) => {
        const { username, password, email } = generateTestUser('offout');
        await registerUser(page, username, password, email);
        await expect(page.getByTestId('item-row').first()).toBeVisible();
        expect(await page.evaluate(() => localStorage.getItem('wgOfflineLibrary'))).not.toBeNull();
        await page.evaluate(() => (window as any).LighterPack.$store.dispatch('signout'));
        expect(await page.evaluate(() => localStorage.getItem('wgOfflineLibrary'))).toBeNull();
    });
});
