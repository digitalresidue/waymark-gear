import { test, expect, Page } from '@playwright/test';

import { registerUser, generateTestUser } from './auth-utils';
import { createCategoryWithItem, addItem } from './test-helpers';

const waitForSave = (page: Page) => page.waitForResponse((r) => r.url().includes('saveLibrary') && r.status() === 200, { timeout: 20000 });

test.describe('Trip planner', () => {
    test('shows Day 1 and last-day pack weight, keeps base weight, and remembers the trip', async ({ page }) => {
        const { username, password, email } = generateTestUser('trip');
        await registerUser(page, username, password, email);
        await createCategoryWithItem(page, 'Shelter', 'Tent', { weight: '16', unit: 'oz' });

        const planner = page.getByTestId('trip-planner');
        await planner.getByTestId('trip-toggle').click();

        // Defaults: 3 days, 1.5 lb food a day, 2 L water.
        // Day 1: 1 lb gear + 4.5 lb food + 4.41 lb water. Day 3: one day of food.
        await expect(planner.getByTestId('trip-day1')).toHaveText('9.91 lb');
        await expect(planner.getByTestId('trip-last')).toHaveText('6.91 lb');

        const saved = waitForSave(page);
        await planner.getByTestId('trip-days').fill('5');
        await saved;
        await expect(planner.getByTestId('trip-day1')).toHaveText('12.9 lb');
        await expect(planner.getByTestId('trip-last')).toHaveText('6.91 lb');
        await expect(planner).toContainText('Base weight');
        await expect(planner).toContainText('1.00 lb');

        await page.reload();
        const again = page.getByTestId('trip-planner');
        await expect(again).toContainText('5 days');
        await again.getByTestId('trip-toggle').click();
        await expect(again.getByTestId('trip-days')).toHaveValue('5');

        const cleared = waitForSave(page);
        await again.getByTestId('trip-clear').click();
        await cleared;
        await expect(again.getByTestId('trip-clear')).toHaveCount(0);
    });
});

test.describe('Pack mode', () => {
    test('check off gear, hide what is packed, and start over', async ({ page }) => {
        const { username, password, email } = generateTestUser('pack');
        await registerUser(page, username, password, email);
        const { category } = await createCategoryWithItem(page, 'Shelter', 'Tent', { weight: '16', unit: 'oz' });
        await addItem(category, 'Stakes', { weight: '2', unit: 'oz' });
        await expect(category.getByPlaceholder('Name', { exact: true }).last()).toHaveValue('Stakes');

        await page.getByTestId('open-pack').click();
        await expect(page).toHaveURL(/\/pack$/);
        const progress = page.getByTestId('pack-progress');
        await expect(progress).toHaveText(/0\s+of 2 packed/);

        const saved = waitForSave(page);
        await page.getByLabel('Packed: Tent').check();
        await saved;
        await expect(progress).toHaveText(/1\s+of 2 packed/);

        await page.getByTestId('pack-hide').click();
        await expect(page.getByTestId('pack-row')).toHaveCount(1);
        await expect(page.getByTestId('pack-row')).toContainText('Stakes');
        await page.getByTestId('pack-hide').click();

        // Packed state is saved with the list.
        await page.reload();
        await expect(page.getByTestId('pack-progress')).toHaveText(/1\s+of 2 packed/);
        await expect(page.getByLabel('Packed: Tent')).toBeChecked();

        await page.getByLabel('Packed: Stakes').check();
        await expect(page.getByTestId('pack-done')).toBeVisible();

        await page.getByTestId('pack-reset').click();
        await expect(page.getByTestId('pack-progress')).toHaveText(/0\s+of 2 packed/);
        await expect(page.getByLabel('Packed: Tent')).not.toBeChecked();

        // Swipe right with a finger to check a row off.
        const row = page.getByTestId('pack-row').filter({ hasText: 'Stakes' });
        const box = (await row.boundingBox())!;
        const y = box.y + box.height / 2;
        const touch = { pointerType: 'touch', pointerId: 7, isPrimary: true, bubbles: true };
        await row.dispatchEvent('pointerdown', { ...touch, clientX: box.x + 20, clientY: y });
        await row.dispatchEvent('pointermove', { ...touch, clientX: box.x + 60, clientY: y });
        await row.dispatchEvent('pointermove', { ...touch, clientX: box.x + 120, clientY: y });
        await row.dispatchEvent('pointerup', { ...touch, clientX: box.x + 120, clientY: y });
        await expect(page.getByLabel('Packed: Stakes')).toBeChecked();
        await expect(page.getByTestId('pack-progress')).toHaveText(/1\s+of 2 packed/);
    });

    test('a phone can open Pack from the app bar and tap whole rows', async ({ browser }) => {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
        const page = await context.newPage();
        const { username, password, email } = generateTestUser('packm');
        await registerUser(page, username, password, email);
        await expect(page.getByTestId('item-row').first()).toBeVisible();
        await page.goto(new URL('/pack', page.url()).toString());

        // The new list's starter row is a blank placeholder, so nothing to pack.
        await expect(page.getByTestId('pack-progress')).toHaveText(/0\s+of 0 packed/);
        await page.getByLabel('Back to editing').click();
        await expect(page.getByTestId('open-pack')).toBeVisible();
        const box = await page.getByTestId('open-pack').boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(44);
        await context.close();
    });
});
