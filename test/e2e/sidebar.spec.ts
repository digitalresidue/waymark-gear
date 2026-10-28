import { test, expect, Page } from '@playwright/test';

import { registerUser, generateTestUser } from './auth-utils';

// The desktop sidebar: an icon rail with one panel beside it, either your
// lists or your gear closet. Choosing a list puts the lists away and gives
// the closet the column; the rail opens the lists again, or puts the panel
// away entirely.

const saved = (page: Page) => page.waitForResponse((r) => r.url().includes('saveLibrary') && r.status() === 200, { timeout: 20000 });

async function twoLists(page: Page) {
    const u = generateTestUser('rail');
    await registerUser(page, u.username, u.password, u.email);
    await expect(page.getByTestId('item-row').first()).toBeVisible();
    const title = page.getByPlaceholder('Name your list', { exact: true });
    let done = saved(page);
    await title.fill('Summer weekend');
    await title.blur();
    await done;
    await page.getByTestId('rail-lists').click();
    done = saved(page);
    await page.getByTestId('new-list').click();
    await done;
    done = saved(page);
    await title.fill('Winter overnight');
    await title.blur();
    await done;
}

test.describe('Sidebar rail', () => {
    test('the closet has the column; the lists open from the rail and put themselves away on a choice', async ({ page }) => {
        await twoLists(page);
        const lists = page.getByTestId('panel-lists');
        const closet = page.getByTestId('panel-closet');

        // Making the new list was a choice too: the closet's back.
        await expect(closet).toBeVisible();
        await expect(lists).toBeHidden();
        await expect(page.getByTestId('current-list')).toContainText('Winter overnight');
        await expect(page.getByTestId('rail-closet')).toHaveAttribute('aria-pressed', 'true');

        // Open the lists; choose the other one.
        await page.getByTestId('current-list').click();
        await expect(lists).toBeVisible();
        await expect(closet).toBeHidden();
        await expect(page.getByTestId('rail-lists')).toHaveAttribute('aria-pressed', 'true');
        await expect(page.getByTestId('rail-lists')).toContainText('2');
        await lists.locator('.lpLibraryList', { hasText: 'Summer weekend' }).click();
        await expect(closet).toBeVisible();
        await expect(page.getByTestId('current-list')).toContainText('Summer weekend');
        await expect(page.getByPlaceholder('Name your list', { exact: true })).toHaveValue('Summer weekend');
    });

    test('the open panel\'s icon puts it away, leaving the rail; it stays that way after a reload', async ({ page }) => {
        test.setTimeout(60000);
        await twoLists(page);
        const main = page.locator('#main');
        const sidebar = page.locator('#sidebar');
        const wide = (await sidebar.boundingBox())!.width;

        let done = saved(page);
        await page.getByTestId('rail-closet').click();
        await done;
        await expect(main).not.toHaveClass(/lpHasSidebar/);
        await expect(page.getByTestId('rail-lists')).toBeVisible();
        await expect.poll(async () => (await sidebar.boundingBox())!.width).toBeLessThan(80);
        expect(wide).toBeGreaterThan(300);

        await page.reload();
        await expect(page.getByTestId('item-row').first()).toBeVisible();
        await expect(main).not.toHaveClass(/lpHasSidebar/);

        // Any rail icon brings it back, showing that panel.
        done = saved(page);
        await page.getByTestId('rail-lists').click();
        await done;
        await expect(main).toHaveClass(/lpHasSidebar/);
        await expect(page.getByTestId('panel-lists')).toBeVisible();

        // The collapse button at the top of the rail does the same.
        await page.getByTestId('rail-collapse').click();
        await expect(main).not.toHaveClass(/lpHasSidebar/);
        await page.getByTestId('rail-collapse').click();
        await expect(main).toHaveClass(/lpHasSidebar/);
    });

    test('which panel was showing is remembered in this browser', async ({ page }) => {
        await twoLists(page);
        await page.getByTestId('rail-lists').click();
        await expect(page.getByTestId('panel-lists')).toBeVisible();
        await page.reload();
        await expect(page.getByTestId('panel-lists')).toBeVisible();
        await expect(page.getByTestId('panel-closet')).toBeHidden();
    });
});
