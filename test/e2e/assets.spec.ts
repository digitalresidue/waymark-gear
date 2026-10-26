import { test, expect } from '@playwright/test';

import { testRoot } from './utils';

// Built CSS and lazy chunks must point at /dist/, where the server serves
// them. They once pointed at /assets/ and every web font quietly 404'd.

test('the app and its fonts load from /dist', async ({ page }) => {
    const missing: string[] = [];
    page.on('response', (r) => {
        if (r.status() === 404 && new URL(r.url()).origin === new URL(testRoot).origin) missing.push(r.url());
    });
    await page.goto(new URL('/welcome', testRoot).toString());
    await expect(page.getByTestId('hero-start')).toBeVisible();
    const loaded = await page.evaluate(async () => {
        await document.fonts.ready;
        return [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family);
    });
    expect(loaded.join(' ')).toMatch(/Geist/);
    expect(missing).toEqual([]);
});
