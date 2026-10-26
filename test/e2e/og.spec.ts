import { test, expect } from '@playwright/test';

import { registerUser, generateTestUser } from './auth-utils';
import { testRoot } from './utils';

// Phase 3.7: link-preview images drawn on our own server.

const url = (p: string) => new URL(p, testRoot).toString();
const PNG_SIGNATURE = '89504e470d0a1a0a';

test('shared lists and profiles get their own preview images', async ({ page }) => {
    const { username, password, email } = generateTestUser('ogimg');
    await registerUser(page, username, password, email);
    await expect(page.getByTestId('item-row').first()).toBeVisible();
    const title = page.getByPlaceholder('Name your list', { exact: true });
    await title.fill('Preview kit');
    await title.blur();
    const row = page.getByTestId('item-row').first();
    await row.getByPlaceholder('Name', { exact: true }).fill('Tent');
    await row.getByTestId('item-weight').fill('20');
    await page.getByText('Share', { exact: true }).hover();
    const shareInput = page.getByLabel('Share your list');
    await expect(shareInput).toHaveValue(/\/r\/[a-z0-9]+/, { timeout: 10000 });
    const link = await shareInput.inputValue();
    const id = link.split('/r/')[1];
    await expect.poll(async () => (await page.request.get(link)).status(), { timeout: 20000 }).toBe(200);

    const ogImage = async () => {
        const html = await (await page.request.get(link)).text();
        return (html.match(/<meta property="og:image" content="([^"]+)"/) || [])[1];
    };
    const first = await ogImage();
    expect(first).toMatch(new RegExp(`/og/r/${id}\\.png\\?v=[0-9a-f]{10}$`));

    const res = await page.request.get(first);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('image/png');
    const body = await res.body();
    expect(body.subarray(0, 8).toString('hex')).toBe(PNG_SIGNATURE);
    expect(body.readUInt32BE(16)).toBe(1200);
    expect(body.readUInt32BE(20)).toBe(630);

    const again = await page.request.get(first, { headers: { 'If-None-Match': res.headers().etag } });
    expect(again.status()).toBe(304);

    // A heavier list gets a new image address, so social sites refetch it.
    await page.goto(url('/'));
    await page.getByTestId('item-row').first().getByTestId('item-weight').fill('30');
    await page.waitForResponse((r) => r.url().includes('saveLibrary') && r.status() === 200, { timeout: 20000 });
    await expect.poll(ogImage, { timeout: 20000 }).not.toBe(first);

    const profileImage = await page.request.get(url(`/og/@${username}.png`));
    expect(profileImage.status()).toBe(200);
    expect((await profileImage.body()).subarray(0, 8).toString('hex')).toBe(PNG_SIGNATURE);
    expect((await page.request.get(url('/og/@no-such-hiker-zz.png'))).status()).toBe(404);
    expect((await page.request.get(url('/og/r/nope0000.png'))).status()).toBe(404);
});
