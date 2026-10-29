import { test, expect } from '@playwright/test';

import { registerUser, generateTestUser } from './auth-utils';
import { testRoot } from './utils';

// With a profile picture, the header shows it instead of the initial, in
// the app and on server-rendered pages.

const url = (p: string) => new URL(p, testRoot).toString();
const AVATAR_40X30 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAACgAAAAeCAIAAADRv8uKAAAALklEQVR42u3NIQEAMAgAMHgPOuDp3+sRkJitwLKm48KLI2KxWCwWi8VisVgs3n0/ZgDE/KDNNAAAAABJRU5ErkJggg==', 'base64');

test('the header shows your picture once you add one', async ({ page }) => {
    const u = generateTestUser('hdravatar');
    await registerUser(page, u.username, u.password, u.email);
    await expect(page.getByTestId('item-row').first()).toBeVisible();

    // The initial, to start with.
    const avatar = page.locator('.wgSiteHeader').getByTestId('header-avatar');
    await expect(avatar).toHaveText(new RegExp(`^\\s*${u.username.charAt(0)}\\s*$`, 'i'));
    await expect(avatar.getByTestId('header-avatar-img')).toHaveCount(0);

    await page.goto(url('/profile'));
    await page.getByTestId('profile-avatar-file').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: AVATAR_40X30 });
    await expect(page.getByTestId('profile-avatar-preview')).toHaveAttribute('src', /_avatar\.webp$/);
    await page.getByTestId('profile-save').click();
    await expect(page.getByTestId('profile-saved')).toBeVisible();

    // Straight away, after a reload, and on a server-rendered page.
    await expect(avatar.getByTestId('header-avatar-img')).toHaveAttribute('src', /_avatar\.webp$/);
    await page.reload();
    await expect(page.locator('.wgSiteHeader').getByTestId('header-avatar-img')).toHaveAttribute('src', /_avatar\.webp$/);
    await page.goto(url('/trails/pct'));
    await expect(page.getByTestId('account-menu').getByTestId('header-avatar-img')).toHaveAttribute('src', /_avatar\.webp$/);
    const box = (await page.getByTestId('account-menu').boundingBox())!;
    expect(Math.round(box.width)).toBe(Math.round(box.height));

    // Removing the picture brings the initial back.
    await page.goto(url('/profile'));
    await page.getByRole('button', { name: 'Remove' }).first().click();
    await page.getByTestId('profile-save').click();
    await expect(page.getByTestId('profile-saved')).toBeVisible();
    await expect(page.locator('.wgSiteHeader').getByTestId('header-avatar').getByTestId('header-avatar-img')).toHaveCount(0);
});
