import { test, expect, Page } from '@playwright/test';

import { registerUser, generateTestUser } from './auth-utils';
import { testRoot } from './utils';

// Phase 3.5: public @profiles.

const url = (p: string) => new URL(p, testRoot).toString();
const BANNER_60X20 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAADwAAAAUCAIAAABeYcl+AAAAL0lEQVR42u3OMQ0AMAgAMJgPPPDj39dsQNIqaNZ0XPPiIGlpaWlpaWlpaWlp6f0+q2kAsFc7SkQAAAAASUVORK5CYII=', 'base64');
const AVATAR_40X30 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAACgAAAAeCAIAAADRv8uKAAAALklEQVR42u3NIQEAMAgAMHgPOuDp3+sRkJitwLKm48KLI2KxWCwWi8VisVgs3n0/ZgDE/KDNNAAAAABJRU5ErkJggg==', 'base64');

async function publishFirstList(page: Page, listName: string, itemName: string) {
    const title = page.getByPlaceholder('Name your list', { exact: true });
    await title.fill(listName);
    await title.blur();
    const row = page.getByTestId('item-row').first();
    await row.getByPlaceholder('Name', { exact: true }).fill(itemName);
    await row.getByTestId('item-weight').fill('20');
    await page.getByText('Share', { exact: true }).hover();
    const toggle = page.getByTestId('publish-toggle');
    await expect(toggle).toBeEnabled({ timeout: 10000 });
    await toggle.check();
    await page.waitForResponse((r) => r.url().includes('saveLibrary') && r.status() === 200);
}

test.describe('Public profiles', () => {
    test('fill in a profile and see it at /@username', async ({ page }) => {
        // Long: signs up, publishes a list, uploads two images and visits
        // four pages; slower browsers on CI were right at 30s.
        test.setTimeout(60000);
        const { username, password, email } = generateTestUser('prof');
        await registerUser(page, username, password, email);
        await expect(page.getByTestId('item-row').first()).toBeVisible();
        await publishFirstList(page, 'JMT in 14 days', 'Trekking poles');

        await page.goto(url('/profile'));
        await expect(page.getByTestId('profile-form')).toBeVisible();
        await page.getByTestId('profile-display-name').fill('Robin Ridge');
        await page.getByTestId('profile-trail-name').fill('Switchback');
        await page.getByTestId('profile-bio').fill('Thru-hiked the **PCT** in 2025.\n\n- Next: CDT');
        await page.getByTestId('profile-bio-preview').click();
        await expect(page.locator('.wgProfileBioPreview strong')).toHaveText('PCT');
        await page.getByTestId('profile-link-x').fill('@switchback');
        await page.getByTestId('profile-link-website').fill('switchback.example');

        await page.getByTestId('profile-avatar-file').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: AVATAR_40X30 });
        await expect(page.getByTestId('profile-avatar-preview')).toHaveAttribute('src', /_avatar\.webp$/);
        await page.getByTestId('profile-banner-file').setInputFiles({ name: 'ridge.png', mimeType: 'image/png', buffer: BANNER_60X20 });
        await expect(page.locator('.wgProfileBannerEdit')).toHaveAttribute('style', /_banner\.webp/);

        await page.locator('[data-testid^="profile-feature-"]').first().check();
        await page.getByTestId('profile-save').click();
        await expect(page.getByTestId('profile-saved')).toBeVisible();

        // Avatars are cropped square, banners 3:1.
        const avatarSrc = await page.getByTestId('profile-avatar-preview').getAttribute('src');
        const avatar = await page.request.get(url(avatarSrc!));
        expect(avatar.headers()['content-type']).toContain('image/webp');

        await page.goto(url(`/@${username}`));
        await expect(page.getByTestId('profile-name')).toHaveText('Robin Ridge');
        await expect(page.getByTestId('profile-trail')).toContainText('Switchback');
        await expect(page.getByTestId('profile-bio').locator('strong')).toHaveText('PCT');
        await expect(page.getByTestId('profile-link-x')).toHaveAttribute('href', 'https://x.com/switchback');
        await expect(page.getByTestId('profile-link-website')).toHaveAttribute('href', 'https://switchback.example/');
        await expect(page.getByTestId('profile-avatar')).toHaveAttribute('src', /_avatar\.webp$/);
        await expect(page.getByTestId('profile-featured')).toContainText('JMT in 14 days');
        await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', /Robin Ridge/);

        await page.getByTestId('profile-tab-gear').click();
        await expect(page.getByTestId('profile-gear')).toContainText('Trekking poles');

        // The shared list links back to its author's profile.
        await page.goto(url(`/@${username}`));
        await page.getByTestId('profile-featured').getByRole('link').first().click();
        // Check the link, then follow it.
        const back = page.getByTestId('share-profile-link');
        await expect(back).toHaveAttribute('href', `/@${username}`);
        // Open it in a fresh tab: leaving the shared list mid-load lost the
        // navigation in Firefox's automation.
        const profileTab = await page.context().newPage();
        await profileTab.goto(url((await back.getAttribute('href'))!));
        await expect(profileTab.getByTestId('profile-name')).toHaveText('Robin Ridge');
        await profileTab.close();
    });

    test('bad links are refused, hidden profiles 404, unpublished lists never show', async ({ page }) => {
        const { username, password, email } = generateTestUser('profh');
        await registerUser(page, username, password, email);
        await expect(page.getByTestId('item-row').first()).toBeVisible();
        const title = page.getByPlaceholder('Name your list', { exact: true });
        await title.fill('Private scouting list');
        await title.blur();
        await page.waitForResponse((r) => r.url().includes('saveLibrary') && r.status() === 200, { timeout: 20000 });

        await page.goto(url('/profile'));
        await expect(page.getByTestId('profile-no-kits')).toBeVisible();
        await page.getByTestId('profile-link-instagram').fill('https://evil.example/me');
        await page.getByTestId('profile-save').click();
        await expect(page.getByTestId('profile-error')).toContainText("That link isn't on Instagram");
        await page.getByTestId('profile-link-instagram').fill('');

        const visible = await page.request.get(url(`/@${username}`));
        expect(visible.status()).toBe(200);
        expect(await visible.text()).not.toContain('Private scouting list');

        await page.getByTestId('profile-hidden').check();
        await page.getByTestId('profile-save').click();
        await expect(page.getByTestId('profile-saved')).toBeVisible();
        expect((await page.request.get(url(`/@${username}`))).status()).toBe(404);
        expect((await page.request.get(url('/@nobody-by-this-name-xyz'))).status()).toBe(404);

        // Someone else's upload can't be used as your picture.
        const res = await page.request.put(url('/api/profile'), { data: { avatarUrl: 'https://tracker.example/pixel.png' } });
        expect(res.status()).toBe(400);
    });

    test('signed-out visitors are asked to make an account', async ({ page }) => {
        await page.goto(url('/welcome'));
        await page.getByTestId('hero-start').click();
        await page.goto(url('/profile'));
        await expect(page.getByText('Public profiles need an account')).toBeVisible();
    });
});
