import { test, expect, devices, Page } from '@playwright/test';

import { registerUser, generateTestUser } from './auth-utils';

// With the sidebar's panel put away, Share and Settings still open from the
// rail, and their menus must show over the list. The put-away column used
// to be clipped to the rail, so the menus opened under the list, out of sight.

async function railMenus(page: Page, tap: boolean) {
    const u = generateTestUser('rail');
    await registerUser(page, u.username, u.password, u.email);
    await expect(page.getByTestId('item-row').first()).toBeVisible();
    // Put the panel away if it's out.
    if (await page.locator('#main.lpHasSidebar').count()) {
        await page.locator('.wgRail [aria-expanded="true"]').first().click();
    }
    await expect(page.locator('#main')).not.toHaveClass(/lpHasSidebar/);

    for (const id of ['share', 'settings']) {
        const target = page.locator(`.wgRail #${id} .lpTarget`).first();
        if (tap) await target.tap();
        else await target.click();
        const menu = page.locator(`.wgRail #${id} .lpContent`);
        await expect(menu).toBeVisible();
        // On top: the point a little inside the menu is the menu, not the list.
        const onTop = await menu.evaluate((el) => {
            const r = el.getBoundingClientRect();
            const hit = document.elementFromPoint(r.left + 40, r.top + 20);
            return !!hit && el.contains(hit);
        });
        expect(onTop, `${id} menu is under the list`).toBe(true);
        await page.keyboard.press('Escape');
        await expect(page.locator('.lpPopoverShown')).toHaveCount(0);
    }

    // The hidden panel doesn't catch clicks meant for the list beside the rail.
    const name = page.getByTestId('item-row').first().getByPlaceholder('Name', { exact: true });
    await name.click();
    await expect(name).toBeFocused();
}

test('desktop: Share and Settings show over the list with the panel put away', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await railMenus(page, false);
});

test.describe('tablet', () => {
    const { defaultBrowserType: _browser, ...iPadMini } = devices['iPad Mini'];
    test.use(iPadMini);
    test('Share and Settings show over the list with the panel put away', async ({ page }) => {
        await railMenus(page, true);
    });
});
