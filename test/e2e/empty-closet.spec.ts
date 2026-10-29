import { test, expect } from '@playwright/test';

import { registerUser, generateTestUser } from './auth-utils';
import { createCategory, addItem } from './test-helpers';

// "Empty" on the closet: asks first, and offers to delete only the gear no
// list uses, or everything (which also empties the lists).

test('emptying the closet asks first: just unused gear, or everything', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const u = generateTestUser('emptycl');
    await registerUser(page, u.username, u.password, u.email);
    await expect(page.getByText('Add new category', { exact: true })).toBeVisible();
    const category = await createCategory(page, 'Kitchen');
    await addItem(category, 'Pot', { weight: '4' });
    const stove = await addItem(category, 'Old stove', { weight: '6' });
    // Take the stove off the list: it stays in the closet, unused.
    await stove.hover();
    await stove.locator('.lpRemoveItem').click();
    const closet = page.getByTestId('panel-closet');
    if (!(await closet.isVisible())) await page.getByTestId('rail-closet').click();
    const items = closet.getByTestId('closet-item');
    await expect(items.filter({ hasText: 'Old stove' })).toHaveCount(1);
    await expect(items.filter({ hasText: 'Pot' })).toHaveCount(1);

    // Cancel changes nothing.
    await closet.getByTestId('closet-empty').click();
    const dialog = page.locator('#speedbump');
    await expect(dialog).toContainText('Empty your closet?');
    await expect(dialog).toContainText('1 not in any list, and 1 in your lists');
    await dialog.getByTestId('speedbump-cancel').click();
    await expect(items.filter({ hasText: 'Old stove' })).toHaveCount(1);

    // Only the unused gear: the list keeps its pot (and its rows).
    const rows = await category.getByTestId('item-row').count();
    await closet.getByTestId('closet-empty').click();
    await expect(dialog.getByTestId('speedbump-alternate')).toHaveText('Only the 1 not in a list');
    await dialog.getByTestId('speedbump-alternate').click();
    await expect(items.filter({ hasText: 'Old stove' })).toHaveCount(0);
    await expect(items.filter({ hasText: 'Pot' })).toHaveCount(1);
    await expect(category.getByTestId('item-row')).toHaveCount(rows);
    const names = await category.locator('input.lpName').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
    expect(names).toContain('Pot');

    // Everything: the closet and the list are emptied; the category stays.
    await closet.getByTestId('closet-empty').click();
    await expect(dialog.getByTestId('speedbump-confirm')).toHaveText('Delete all 1');
    await dialog.getByTestId('speedbump-confirm').click();
    await expect(items).toHaveCount(0);
    await expect(category.getByTestId('item-row')).toHaveCount(0);
    await expect(category.locator('input.lpCategoryName')).toHaveValue('Kitchen');
    await expect(closet.getByTestId('closet-empty')).toHaveCount(0);
});
