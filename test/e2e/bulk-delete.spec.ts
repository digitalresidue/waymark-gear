import { test, expect, Page } from '@playwright/test';

import { testRoot } from './utils';
import { registerUser, generateTestUser } from './auth-utils';
import { createCategory, addItem } from './test-helpers';

// The closet's Select: tick several pieces of gear, then delete or retire
// them all with one "are you sure" (utils/closet.js, confirmBulkRemoval).

const saved = (page: Page) => page.waitForResponse((r) => r.url().includes('saveLibrary') && r.status() === 200, { timeout: 20000 });

test('desktop: select gear, then retire or delete it all with one confirmation', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const u = generateTestUser('bulkdel');
    await registerUser(page, u.username, u.password, u.email);
    await expect(page.getByText('Add new category', { exact: true })).toBeVisible();
    const category = await createCategory(page, 'Kitchen');
    for (const name of ['Pot', 'Stove', 'Lighter']) await addItem(category, name, { weight: '3' });
    const spoon = await addItem(category, 'Spoon', { weight: '1' });
    // The spoon comes off the list: still in the closet, in no list.
    await spoon.hover();
    await spoon.locator('.lpRemoveItem').click();

    const closet = page.getByTestId('panel-closet');
    if (!(await closet.isVisible())) await page.getByTestId('rail-closet').click();
    const items = closet.getByTestId('closet-item');
    const row = (name: string) => items.filter({ hasText: name });
    await expect(row('Spoon')).toHaveCount(1);

    // Select: a checkbox per row; a click anywhere on the row ticks it too.
    await closet.getByTestId('closet-select').click();
    await expect(closet.getByTestId('closet-delete-selected')).toBeDisabled();
    await row('Lighter').getByTestId('closet-check').check();
    await row('Spoon').locator('.lpName').click();
    await expect(closet.getByTestId('closet-selected-count')).toHaveText('2 selected');

    // One confirmation for both; Cancel changes nothing.
    await closet.getByTestId('closet-delete-selected').click();
    const dialog = page.locator('#speedbump');
    await expect(dialog).toContainText('Delete 2 pieces of gear?');
    await expect(dialog).toContainText('Lighter, Spoon');
    await expect(dialog).toContainText('1 of them are in your lists');
    await dialog.getByTestId('speedbump-cancel').click();
    await expect(row('Lighter')).toHaveCount(1);

    // Retire both: gone from the closet, the list keeps its lighter.
    await closet.getByTestId('closet-delete-selected').click();
    await expect(dialog.getByTestId('speedbump-alternate')).toHaveText('Retire all 2');
    let done = saved(page);
    await dialog.getByTestId('speedbump-alternate').click();
    await done;
    await expect(closet.getByTestId('closet-select-bar')).toHaveCount(0);
    await expect(row('Lighter')).toHaveCount(0);
    await expect(closet.getByTestId('closet-show-retired')).toHaveText('Retired (2)');
    const names = () => category.locator('input.lpName').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
    expect(await names()).toContain('Lighter');

    // Select all (what's shown), delete: out of the closet and the list.
    await closet.getByTestId('closet-select').click();
    await closet.getByTestId('closet-select-all').click();
    await expect(closet.getByTestId('closet-selected-count')).toHaveText('2 selected');
    await expect(closet.getByTestId('closet-select-all')).toHaveText('Clear');
    await closet.getByTestId('closet-delete-selected').click();
    await expect(dialog).toContainText('Pot, Stove');
    await expect(dialog.getByTestId('speedbump-confirm')).toHaveText('Delete 2');
    done = saved(page);
    await dialog.getByTestId('speedbump-confirm').click();
    await done;
    await expect(row('Pot')).toHaveCount(0);
    await expect(row('Stove')).toHaveCount(0);
    expect(await names()).not.toContain('Pot');
    expect(await names()).toContain('Lighter');

    // Saved: still so after a reload.
    await page.reload();
    if (!(await closet.isVisible())) await page.getByTestId('rail-closet').click();
    await expect(row('Pot')).toHaveCount(0);
    await expect(closet.getByTestId('closet-show-retired')).toHaveText('Retired (2)');
});

test('phone: select gear on the Gear screen and delete it', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const u = generateTestUser('bulkph');
    await registerUser(page, u.username, u.password, u.email);
    await expect(page.getByTestId('item-row').first()).toBeVisible();
    // Three pieces of gear, made on the desktop layout's rows.
    await page.setViewportSize({ width: 1440, height: 900 });
    const category = await createCategory(page, 'Water');
    for (const name of ['Bottle', 'Filter', 'Bladder']) await addItem(category, name, { weight: '2' });
    // Saved on the server before the page reloads.
    await expect.poll(async () => {
        const r = await page.request.post(new URL('/signin', testRoot).toString(), { data: {} });
        return JSON.stringify(await r.json().catch(() => ({})));
    }, { timeout: 20000 }).toContain('Bladder');
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto(new URL('/gear', testRoot).toString());
    const rows = page.getByTestId('gear-row');
    await expect(rows.filter({ hasText: 'Bladder' })).toHaveCount(1);
    await page.getByTestId('closet-select').click();
    await rows.filter({ hasText: 'Bottle' }).getByTestId('closet-check').check();
    await rows.filter({ hasText: 'Bladder' }).locator('.lpGearName').click();
    await expect(page.getByTestId('closet-selected-count')).toHaveText('2 selected');
    // The bar sits in thumb reach at the bottom of the screen.
    const bar = await page.getByTestId('closet-select-bar').boundingBox();
    expect(bar!.y + bar!.height).toBeGreaterThan(844 - 2);

    await page.getByTestId('closet-delete-selected').click();
    const done = saved(page);
    await page.locator('#speedbump').getByTestId('speedbump-confirm').click();
    await done;
    await expect(rows.filter({ hasText: 'Bottle' })).toHaveCount(0);
    await expect(rows.filter({ hasText: 'Bladder' })).toHaveCount(0);
    await expect(rows.filter({ hasText: 'Filter' })).toHaveCount(1);
});
