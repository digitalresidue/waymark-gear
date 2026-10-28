import { test, expect } from '@playwright/test';

import { registerUser, generateTestUser } from './auth-utils';
import { createCategory, addItem, enableSetting } from './test-helpers';

// Item rows in the desktop editor: the photo column is a 25px thumbnail and
// only exists when the category has a photo; name and description share the
// room; the drag handle and remove ✕ sit inside the category card.

// A valid 8x8 png (see image-upload.spec.ts).
const PNG_8X8 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAD0lEQVR4nGM4gwMwDC0JAMg9mQEkEhIxAAAAAElFTkSuQmCC', 'base64');

test.describe('List rows', () => {
    test('no photos, no photo column; a photo is a small thumbnail; the row controls stay in the card', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        const u = generateTestUser('rows');
        await registerUser(page, u.username, u.password, u.email);
        await expect(page.getByText('Add new category', { exact: true })).toBeVisible();
        const category = await createCategory(page, 'Clothing');
        const row = await addItem(category, 'Triple Crown Button Down Long Sleeve Shirt', { description: 'Evergreen sun shirt, size M', weight: '10', unit: 'oz' });
        await enableSetting(page, 'Item images');

        // Images on, nothing to show: the name starts at the card's content edge.
        await expect(row.locator('.lpImageCell')).toBeHidden();
        const card = await category.boundingBox();
        const name = (await row.getByPlaceholder('Name', { exact: true }).boundingBox())!;
        expect(name.x - card!.x).toBeLessThan(40);

        // Name and description both get real room.
        const desc = (await row.getByPlaceholder('Description', { exact: true }).boundingBox())!;
        expect(name.width).toBeGreaterThan(160);
        expect(desc.width).toBeGreaterThan(160);

        // The ✕ and the drag handle are inside the card.
        await row.hover();
        const remove = (await row.locator('.lpRemoveItem').boundingBox())!;
        const handle = (await row.locator('.lpItemHandle').boundingBox())!;
        expect(remove.x + remove.width).toBeLessThanOrEqual(card!.x + card!.width - 4);
        expect(handle.x).toBeGreaterThanOrEqual(card!.x + 4);

        // A photo: a 25px thumbnail that opens the full one.
        await row.getByTitle('Upload a photo or use a photo from the web').click();
        await page.locator('#image').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: PNG_8X8 });
        const thumb = row.getByTestId('item-thumb');
        await expect(thumb).toBeVisible();
        const t = (await thumb.boundingBox())!;
        expect(Math.round(t.width)).toBe(25);
        expect(Math.round(t.height)).toBe(25);
        expect((await row.getByPlaceholder('Name', { exact: true }).boundingBox())!.x).toBeGreaterThan(t.x + 25);
        await thumb.click();
        await expect(page.locator('#lpImageDialog img')).toBeVisible();
    });
});
