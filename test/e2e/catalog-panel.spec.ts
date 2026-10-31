import { test, expect, Browser } from '@playwright/test';

import { registerUser, generateTestUser } from './auth-utils';
import { testRoot } from './utils';

// The editor's left rail: Catalog sits beside Closet. Search the catalog
// and add gear to the list; by default it goes under the category of its
// type, made if the list hasn't got one.

const url = (p: string) => new URL(p, testRoot).toString();

async function seedCatalog(browser: Browser, workerIndex: number, tag: string) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const username = `wge2eowner${workerIndex}`;
    const r = await page.request.post(url('/register'), { data: { username, email: `${username}@example.com`, password: 'testtest' } });
    if (r.status() !== 200) expect((await page.request.post(url('/signin'), { data: { username, password: 'testtest' } })).status()).toBe(200);
    const csv = [
        'sku,name,brand,category,description,weight,unit,price,url,worn_default,consumable_default,tags,status',
        `${tag}-t,Panel tent ${tag},Trailco,Shelter,,19,oz,,,false,false,,published`,
        `${tag}-q,Panel quilt ${tag},Trailco,Sleep,,21,oz,,,false,false,,published`,
        `${tag}-s,Panel stove ${tag},Trailco,Cooking,,3,oz,,,false,false,,published`,
    ].join('\n');
    expect((await page.request.post(url('/api/admin/catalog/import/apply'), { data: { csv } })).ok()).toBe(true);
    await context.close();
}

test('Catalog beside Closet: search and add gear, by type or to a chosen category', async ({ page, browser }, testInfo) => {
    const tag = `cp${Date.now().toString(36)}`;
    await seedCatalog(browser, testInfo.workerIndex, tag);
    await page.setViewportSize({ width: 1440, height: 900 });
    const u = generateTestUser('catpanel');
    await registerUser(page, u.username, u.password, u.email);
    await expect(page.getByTestId('item-row').first()).toBeVisible();

    await page.getByTestId('rail-catalog').click();
    const panel = page.getByTestId('panel-catalog');
    await expect(panel).toBeVisible();
    await expect(page.getByTestId('rail-catalog')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('panel-closet')).toBeHidden();

    // By type: the starter category becomes "Shelter".
    await panel.getByTestId('catalog-panel-search').fill(tag);
    const tent = panel.getByTestId('catalog-panel-result').filter({ hasText: `Panel tent ${tag}` });
    await expect(tent).toBeVisible();
    await tent.getByTestId('catalog-panel-add').click();
    await expect(panel.getByTestId('catalog-panel-notice')).toContainText(`Added Panel tent ${tag} to Shelter`);
    const categories = page.getByTestId('category');
    await expect(categories).toHaveCount(1);
    await expect(categories.first().locator('input.lpCategoryName')).toHaveValue('Shelter');
    await expect(categories.first().getByTestId('item-row')).toHaveCount(1);

    // Another type: a new category.
    await panel.getByTestId('catalog-panel-result').filter({ hasText: `Panel quilt ${tag}` }).getByTestId('catalog-panel-add').click();
    await expect(categories).toHaveCount(2);
    await expect(categories.nth(1).locator('input.lpCategoryName')).toHaveValue('Sleep');

    // The person's own spelling of a type still counts as that type: no
    // near-duplicate "Sleep" next to their "Sleeps".
    const sleepName = categories.nth(1).locator('input.lpCategoryName');
    await sleepName.fill('sleeps');
    await sleepName.blur();
    await panel.getByTestId('catalog-panel-result').filter({ hasText: `Panel quilt ${tag}` }).getByTestId('catalog-panel-add').click();
    await expect(categories).toHaveCount(2);
    await expect(categories.nth(1).getByTestId('item-row')).toHaveCount(2);

    // A chosen category instead.
    await panel.getByTestId('catalog-panel-target').selectOption({ label: 'Shelter' });
    await panel.getByTestId('catalog-panel-result').filter({ hasText: `Panel stove ${tag}` }).getByTestId('catalog-panel-add').click();
    await expect(categories).toHaveCount(2);
    await expect(categories.first().getByTestId('item-row')).toHaveCount(2);
    await expect(categories.first().locator('input.lpName').nth(1)).toHaveValue(`Panel stove ${tag}`);

    // Stays the open panel after a reload.
    await page.waitForResponse((r) => r.url().includes('saveLibrary') && r.status() === 200).catch(() => {});
    await page.reload();
    await expect(page.getByTestId('panel-catalog')).toBeVisible();

    // Switching lists comes back to the catalog.
    await page.getByTestId('panel-catalog').getByRole('button', { name: /Switch/ }).click();
    await expect(page.getByTestId('panel-lists')).toBeVisible();
    await page.getByTestId('panel-lists').locator('.lpLibraryList').first().click();
    await expect(page.getByTestId('panel-catalog')).toBeVisible();
});
