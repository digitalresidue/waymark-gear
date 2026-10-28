import { test, expect, Page } from '@playwright/test';

import { registerUser, generateTestUser } from './auth-utils';
import { createCategoryWithItem, addItem, markItemAsWorn, showLists } from './test-helpers';
import { testRoot } from './utils';

// Phase 3.4: bring a list over from LighterPack by link or CSV. In the suite
// "LighterPack" is this app itself (playwright.config.ts lighterpackUrl),
// which serves /r/:id and /csv/:id in the same format.

const url = (p: string) => new URL(p, testRoot).toString();

async function openImport(page: Page) {
    await showLists(page);
    await page.getByTestId('new-list').hover();
    await showLists(page);
    await page.getByTestId('new-list-import').click();
    await expect(page.getByTestId('import-link')).toBeVisible();
}

async function shareLink(page: Page): Promise<string> {
    await page.getByText('Share', { exact: true }).hover();
    const shareInput = page.getByLabel('Share your list');
    await expect(shareInput).toHaveValue(/\/r\/[a-z0-9]+/, { timeout: 10000 });
    const link = await shareInput.inputValue();
    const id = link.split('/r/')[1];
    await expect.poll(async () => (await page.request.get(url(`/csv/${id}`))).status(), { timeout: 20000 }).toBe(200);
    return link;
}

test.describe('Import from LighterPack', () => {
    test('a pasted share link becomes a new list with worn gear kept', async ({ page, browser }) => {
        const owner = generateTestUser('lpsrc');
        await registerUser(page, owner.username, owner.password, owner.email);
        const title = page.getByPlaceholder('Name your list', { exact: true });
        await title.fill('Sierra loop');
        await title.blur();
        const { category } = await createCategoryWithItem(page, 'Shelter', 'Solo tent', { weight: '24', unit: 'oz' });
        const jacket = await addItem(category, 'Rain jacket', { weight: '6', unit: 'oz' });
        await markItemAsWorn(jacket);
        await page.waitForResponse((r) => r.url().includes('saveLibrary') && r.status() === 200, { timeout: 20000 });
        const link = await shareLink(page);

        const context = await browser.newContext();
        const visitor = await context.newPage();
        const me = generateTestUser('lpdst');
        await registerUser(visitor, me.username, me.password, me.email);
        await expect(visitor.getByTestId('item-row').first()).toBeVisible();
        await openImport(visitor);

        await visitor.getByTestId('import-link').fill(link);
        await visitor.getByTestId('import-fetch').click();
        await expect(visitor.getByTestId('import-preview')).toBeVisible();
        await expect(visitor.getByTestId('import-name')).toHaveValue('Sierra loop');
        await expect(visitor.getByTestId('import-summary')).toContainText('2 items in 1 category');

        await visitor.getByTestId('import-confirm').click();
        await expect(visitor.locator('#lpListName')).toHaveValue('Sierra loop');
        const names = visitor.getByTestId('item-row').getByPlaceholder('Name', { exact: true });
        await expect(names).toHaveCount(2);
        await expect(names.nth(0)).toHaveValue('Solo tent');
        await expect(visitor.getByTestId('item-row').nth(1).locator('.lpWorn')).toHaveClass(/lpActive/);
        await context.close();
    });

    test('links to other sites are refused without a request', async ({ page }) => {
        const me = generateTestUser('lpbad');
        await registerUser(page, me.username, me.password, me.email);
        await expect(page.getByTestId('item-row').first()).toBeVisible();
        await openImport(page);
        await page.getByTestId('import-link').fill('https://example.com/r/abc123');
        await page.getByTestId('import-fetch').click();
        await expect(page.getByTestId('import-error')).toContainText('Paste a LighterPack share link');
        await expect(page.getByTestId('import-preview')).toHaveCount(0);

        const res = await page.request.post(url('/api/import/lighterpack'), { data: { url: 'http://169.254.169.254/r/abc' } });
        expect(res.status()).toBe(400);
    });

    test('a CSV file imports, and importing it again reuses the closet', async ({ page }) => {
        const me = generateTestUser('lpcsv');
        await registerUser(page, me.username, me.password, me.email);
        await expect(page.getByTestId('item-row').first()).toBeVisible();
        const csv = Buffer.from([
            'Item Name,Category,desc,qty,weight,unit,url,price,worn,consumable',
            'Quilt,Sleep,20F,1,21,ounce,,,,',
            'Fleece,Clothing,,1,9,ounce,,,Worn,',
            'Oats,Food,,4,3,ounce,,,,Consumable',
            'Bad row,Food,,1,lots,ounce,,,,',
        ].join('\n'));

        for (const round of [1, 2]) {
            await openImport(page);
            await page.getByTestId('import-file').setInputFiles({ name: 'Desolation_overnight.csv', mimeType: 'text/csv', buffer: csv });
            await expect(page.getByTestId('import-summary')).toContainText('3 items in 3 categories');
            await expect(page.getByTestId('import-preview')).toContainText("1 row couldn't be read");
            await expect(page.getByTestId('import-name')).toHaveValue('Desolation overnight');
            await page.getByTestId('import-confirm').click();
            await expect(page.locator('#lpListName')).toHaveValue('Desolation overnight');
            if (round === 2) await expect(page.getByText('3 already in your closet')).toBeVisible();
        }
    });

    test('the homepage sends LighterPack users straight to the import', async ({ page }) => {
        await page.goto(url('/welcome'));
        await page.getByTestId('hero-import').click();
        await expect(page.getByTestId('import-link')).toBeVisible();
    });
});
