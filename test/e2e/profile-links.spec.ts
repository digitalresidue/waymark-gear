import { test, expect, Page } from '@playwright/test';

import { registerUser, generateTestUser } from './auth-utils';
import { testRoot } from './utils';

// "@name" on kit cards goes to that hiker's profile; the rest of the card
// still opens the list.

const url = (p: string) => new URL(p, testRoot).toString();

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

test('a kit card links its author to their profile, and the card to the list', async ({ page, browser }) => {
    const u = generateTestUser('plink');
    await registerUser(page, u.username, u.password, u.email);
    await expect(page.getByTestId('item-row').first()).toBeVisible();
    const name = `Goodwater Loop ${Date.now()}`;
    await publishFirstList(page, name, 'Tarp');

    const visitor = await (await browser.newContext()).newPage();
    await visitor.goto(url('/explore'));
    await visitor.getByTestId('explore-search').fill(name);
    const card = visitor.getByTestId('kit-card').filter({ hasText: name });
    await expect(card).toBeVisible();

    // The name: the profile.
    const author = card.getByTestId('kit-card-author');
    await expect(author).toHaveText(`@${u.username}`);
    await author.click();
    await expect(visitor).toHaveURL(new RegExp(`/@${u.username}$`));
    await expect(visitor.getByTestId('profile-featured').or(visitor.getByTestId('profile-kits'))).toContainText(name);

    // Anywhere else on the card: the list.
    await visitor.goBack();
    await expect(card).toBeVisible();
    const box = (await card.boundingBox())!;
    await visitor.mouse.click(box.x + box.width - 20, box.y + box.height - 12);
    await expect(visitor).toHaveURL(/\/r\/[a-zA-Z0-9]+$/);
    await expect(visitor.locator('.lpListName')).toHaveText(name);
});
