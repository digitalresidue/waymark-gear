import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { registerUser, generateTestUser } from './auth-utils';
import { createCategory, addItem } from './test-helpers';

// The daily image clean-up (server/image-gc.js, scripts/clean-images.js):
// images nothing refers to are deleted once they're a day old; images in use
// are kept. Here the two images are aged by hand and the script is run.

const PNG_8X8 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAD0lEQVR4nGM4gwMwDC0JAMg9mQEkEhIxAAAAAElFTkSuQmCC', 'base64');
const PNG_40X30 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAACgAAAAeCAIAAADRv8uKAAAALklEQVR42u3NIQEAMAgAMHgPOuDp3+sRkJitwLKm48KLI2KxWCwWi8VisVgs3n0/ZgDE/KDNNAAAAABJRU5ErkJggg==', 'base64');
const onDisk = (url: string) => path.join(process.cwd(), 'public', url);
const age = (file: string) => {
    const old = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    fs.utimesSync(file, old, old);
};
const clean = (...args: string[]) => execFileSync('node', ['scripts/clean-images.js', ...args], { encoding: 'utf8', env: { ...process.env } });

test('unused images are cleaned up; images in use are kept', async ({ page }) => {
    test.setTimeout(90000);
    const u = generateTestUser('imgclean');
    await registerUser(page, u.username, u.password, u.email);
    await expect(page.getByText('Add new category', { exact: true })).toBeVisible();

    // In use: a list item's photo.
    const category = await createCategory(page, 'Camera');
    const row = await addItem(category, 'Camera', { weight: '12' });
    await row.hover();
    await row.getByTitle('Upload a photo or use a photo from the web').click();
    await page.locator('#image').setInputFiles({ name: 'kept.png', mimeType: 'image/png', buffer: PNG_8X8 });
    const thumb = row.locator('img.lpItemImage');
    await expect(thumb).toBeVisible();
    const keptThumb = (await thumb.getAttribute('src'))!;
    const kept = keptThumb.replace('_t.webp', '.webp');
    await page.waitForResponse((r) => r.url().includes('saveLibrary') && r.status() === 200);

    // Not in use: uploaded, never saved anywhere.
    const r = await page.request.post(new URL('/api/profile/image?kind=photo', page.url()).toString(), {
        multipart: { image: { name: 'orphan.png', mimeType: 'image/png', buffer: PNG_40X30 } },
    });
    expect(r.ok()).toBe(true);
    const orphan = (await r.json()).imageUrl as string;

    for (const f of [kept, keptThumb, orphan]) {
        expect(fs.existsSync(onDisk(f)), f).toBe(true);
        age(onDisk(f));
    }

    // A dry run only reports.
    const dry = clean('--dry-run', '--force');
    expect(dry).toMatch(/Would delete \d+ unused files/);
    expect(fs.existsSync(onDisk(orphan))).toBe(true);

    clean('--force');
    expect(fs.existsSync(onDisk(orphan))).toBe(false);
    expect(fs.existsSync(onDisk(kept))).toBe(true);
    expect(fs.existsSync(onDisk(keptThumb))).toBe(true);

    // Remove the photo from the item: next time round, it goes too.
    await row.hover();
    await row.getByTitle('Upload a photo or use a photo from the web').click();
    await page.locator('#itemImageDialog').getByRole('button', { name: 'Remove Image' }).click();
    await page.waitForResponse((resp) => resp.url().includes('saveLibrary') && resp.status() === 200);
    clean('--force');
    expect(fs.existsSync(onDisk(kept))).toBe(false);
    expect(fs.existsSync(onDisk(keptThumb))).toBe(false);
});
