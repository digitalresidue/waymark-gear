import { test, expect, Page } from '@playwright/test';

import { registerUser, generateTestUser } from './auth-utils';
import { createCategoryWithItem, addItem } from './test-helpers';

// Phase 5: gear kits, packed-vs-used, only what I carry, quantity owned.

const saved = (page: Page) => page.waitForResponse((r) => r.url().includes('saveLibrary') && r.status() === 200, { timeout: 20000 });
const lib = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as any).LighterPack.$store.state.library.save())));

async function signUp(page: Page, prefix: string) {
    const u = generateTestUser(prefix);
    await registerUser(page, u.username, u.password, u.email);
    await expect(page.getByTestId('item-row').first()).toBeVisible();
    return u;
}

test.describe('Phase 5', () => {
    test('save a category as a kit and add it to another category in one click', async ({ page }) => {
        await signUp(page, 'p5kit');
        const { category } = await createCategoryWithItem(page, 'Kitchen', 'Stove', { weight: '3', unit: 'oz' });
        await addItem(category, 'Pot', { weight: '4', unit: 'oz' });
        let done = saved(page);
        await category.getByTestId('kit-menu').click();
        await category.getByTestId('kit-name').fill('Cook kit');
        await category.getByTestId('kit-save').click();
        await done;
        expect((await lib(page)).kits.map((k: any) => k.name)).toEqual(['Cook kit']);
        await page.keyboard.press('Escape');
        await page.mouse.click(5, 5);

        await page.getByText('Add new category', { exact: true }).click();
        const empty = page.getByTestId('category').last();
        done = saved(page);
        await empty.getByTestId('kit-menu').click();
        await empty.getByTestId('kit-add-Cook kit').click();
        await done;
        const names = await empty.getByTestId('item-row').getByPlaceholder('Name', { exact: true }).evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
        expect(names).toEqual(expect.arrayContaining(['Stove', 'Pot']));
        // Kits survive a reload.
        await page.reload();
        await expect(page.getByTestId('item-row').first()).toBeVisible();
        expect((await lib(page)).kits).toHaveLength(1);
    });

    test('after the trip: mark what you did not use', async ({ page }) => {
        await signUp(page, 'p5used');
        const { category } = await createCategoryWithItem(page, 'Camp', 'Camp shoes', { weight: '10', unit: 'oz' });
        await addItem(category, 'Headlamp', { weight: '2', unit: 'oz' });
        await saved(page);
        await page.getByTestId('open-pack').click();
        await page.getByTestId('mode-review').click();
        await expect(page.getByTestId('review-summary')).toContainText('Used everything?');
        const done = saved(page);
        await page.getByLabel('Used: Camp shoes').uncheck();
        await done;
        await expect(page.getByTestId('review-summary')).toContainText("1 thing you didn't use");
        await expect(page.getByTestId('unused-weight')).toHaveText('0.63 lb');
        await page.reload();
        await page.getByTestId('mode-review').click();
        await expect(page.getByLabel('Used: Camp shoes')).not.toBeChecked();
        await expect(page.getByLabel('Used: Headlamp')).toBeChecked();
    });

    test('lists warn when they use more than you own', async ({ page }) => {
        await signUp(page, 'p5own');
        const { itemRow } = await createCategoryWithItem(page, 'Water', 'Smartwater bottle', { weight: '1.3', unit: 'oz', quantity: '3' });
        await itemRow.hover();
        await itemRow.getByTestId('item-details').click();
        await page.getByTestId('gear-qty-owned').fill('2');
        const done = saved(page);
        await page.getByTestId('gear-details-save').click();
        await done;
        await expect(itemRow.getByTestId('item-qty')).toHaveAttribute('data-owned-short', 'true');
        await expect(itemRow.getByTestId('item-qty')).toHaveAttribute('title', 'More than you own (2)');
        await itemRow.getByTestId('item-qty').fill('2');
        await expect(itemRow.getByTestId('item-qty')).not.toHaveAttribute('data-owned-short', 'true');
    });
});
