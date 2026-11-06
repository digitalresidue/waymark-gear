import { test, expect, devices } from '@playwright/test';

import { registerUser, generateTestUser } from './auth-utils';

// Tablets (an iPad in portrait): wider than a phone, so the desktop editor,
// but too narrow for the sidebar's panel beside the list, and touch only.
// A report from Safari on an iPad: the list was cramped to ~420px (names cut
// to two letters), row controls that wait for a mouse hover never showed,
// and menus didn't close when tapping elsewhere.

const { defaultBrowserType: _browser, ...iPadMini } = devices['iPad Mini'];
test.use(iPadMini);

test('the list gets the width; the panel floats over it, put away to start', async ({ page }) => {
    const u = generateTestUser('tab');
    await registerUser(page, u.username, u.password, u.email);
    const row = page.getByTestId('item-row').first();
    await expect(row).toBeVisible();
    await row.getByPlaceholder('Name', { exact: true }).fill('Durston X-Mid 1');

    // The panel starts put away (even though a new account's saved choice
    // is open), so the list has the width beside the rail.
    const width = (s: string) => page.locator(s).first().evaluate((e) => Math.round(e.getBoundingClientRect().width));
    await expect(page.locator('#main')).not.toHaveClass(/lpHasSidebar/);
    expect(await width('.lpContentCol')).toBeGreaterThan(600);
    expect(await width('.lpItem input[placeholder="Name"]')).toBeGreaterThan(100);

    // Opening the closet floats it over the list: the list keeps its width.
    const before = await width('.lpContentCol');
    await page.getByTestId('rail-closet').tap();
    await expect(page.locator('#main')).toHaveClass(/lpHasSidebar/);
    await expect(page.getByTestId('panel-closet')).toBeVisible();
    expect(await width('.lpContentCol')).toBe(before);
    // Put away again from the rail. Not saved: the desktop keeps its choice.
    await page.getByTestId('rail-closet').tap();
    await expect(page.locator('#main')).not.toHaveClass(/lpHasSidebar/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});

test('row controls show without a hover, and menus close on a tap elsewhere', async ({ page }) => {
    const u = generateTestUser('tab2');
    await registerUser(page, u.username, u.password, u.email);
    const row = page.getByTestId('item-row').first();
    await expect(row).toBeVisible();

    // Nothing hovered or focused: the remove ✕, drag handle and star are there.
    await page.locator('#lpListName').evaluate((e) => (e as HTMLElement).blur());
    for (const s of ['.lpRemove', '.lpHandle', '.lpStar']) {
        await expect(row.locator(s).first(), s).toHaveCSS('visibility', 'visible');
    }
    // ...and a tap on the ✕ removes the item.
    const count = await page.getByTestId('item-row').count();
    await row.locator('.lpRemove').first().tap();
    await expect(page.getByTestId('item-row')).toHaveCount(count - 1);

    // Share opens from the rail. Safari on an iPad sends no click for a tap
    // on the page's background, only the touch itself: that's enough to close.
    await page.locator('.wgRail #share .lpTarget, .wgRail [data-testid="rail-share"]').first().tap();
    await expect(page.locator('.lpPopoverShown')).toHaveCount(1);
    await page.locator('.lpContentCol').evaluate((e) => {
        e.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }));
    });
    await expect(page.locator('.lpPopoverShown')).toHaveCount(0);
});
