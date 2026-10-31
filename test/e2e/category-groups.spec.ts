import { test, expect, Browser, Page } from '@playwright/test';

import { registerUser, generateTestUser } from './auth-utils';
import { createCategoryWithItem } from './test-helpers';
import { testRoot } from './utils';

// Category groups: one level of headings over categories (Clothing over
// Base Layer, Mid Layer...). Made from a category's group button, kept
// together, folded, renamed, ungrouped; catalog layers land in Clothing.

const url = (p: string) => new URL(p, testRoot).toString();
const saved = (page: Page) => page.waitForResponse((r) => r.url().includes('saveLibrary') && r.status() === 200, { timeout: 20000 });
const catNames = (page: Page) => page.getByTestId('category').locator('input.lpCategoryName')
    .evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));

async function seedLayers(browser: Browser, workerIndex: number, tag: string) {
    const page = await (await browser.newContext()).newPage();
    const username = `wge2eowner${workerIndex}`;
    const r = await page.request.post(url('/register'), { data: { username, email: `${username}@example.com`, password: 'testtest' } });
    if (r.status() !== 200) expect((await page.request.post(url('/signin'), { data: { username, password: 'testtest' } })).status()).toBe(200);
    const csv = ['sku,name,brand,category,description,weight,unit,price,url,worn_default,consumable_default,tags,status',
        `${tag}-b,Merino top ${tag},Trailco,Base Layer,,7,oz,,,false,false,,published`,
        `${tag}-m,Grid fleece ${tag},Trailco,Mid Layer,,9,oz,,,false,false,,published`,
        `${tag}-t,Trekking poles ${tag},Trailco,Accessories,,10,oz,,,false,false,,published`,
        `${tag}-q,Summit quilt ${tag},Trailco,Top Quilt,,20,oz,,,false,false,,published`,
        `${tag}-p,Air pad ${tag},Trailco,Sleeping Pad,,13,oz,,,false,false,,published`].join('\n');
    expect((await page.request.post(url('/api/admin/catalog/import/apply'), { data: { csv } })).ok()).toBe(true);
    await page.context().close();
}

test('make a group, add to it, fold, rename, drag out, ungroup; it all survives a reload', async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    const u = generateTestUser('groups');
    await registerUser(page, u.username, u.password, u.email);
    await createCategoryWithItem(page, 'Base Layer', 'Merino top', { weight: '7', unit: 'oz' });
    await createCategoryWithItem(page, 'Sleep', 'Quilt', { weight: '20', unit: 'oz' });
    await createCategoryWithItem(page, 'Mid Layer', 'Fleece', { weight: '9', unit: 'oz' });
    const category = (name: string) => page.getByTestId('category').filter({ has: page.locator(`input.lpCategoryName[value="${name}"]`) });

    // Base Layer starts "Clothing".
    await category('Base Layer').hover();
    await category('Base Layer').getByTestId('category-group-button').click();
    await page.getByTestId('category-group-new').fill('Clothing');
    await page.getByTestId('category-group-create').click();
    const head = page.getByTestId('group-head');
    await expect(head).toHaveCount(1);
    await expect(head.getByTestId('group-name')).toHaveValue('Clothing');

    // Mid Layer joins it, and moves up next to Base Layer.
    await category('Mid Layer').hover();
    await category('Mid Layer').getByTestId('category-group-button').click();
    await page.getByTestId('category-group-option').filter({ hasText: 'Clothing' }).click();
    await expect(head.getByTestId('group-meta')).toHaveText('2 categories');
    await expect(head.getByTestId('group-weight')).toHaveText(/^16(\.0+)? oz$/);
    const order = await catNames(page);
    expect(order.indexOf('Mid Layer')).toBe(order.indexOf('Base Layer') + 1);
    await expect(category('Mid Layer')).toHaveClass(/wgInGroup/);
    await expect(category('Sleep')).not.toHaveClass(/wgInGroup/);

    // Fold and rename; both kept after a reload.
    let done = saved(page);
    await head.getByTestId('group-toggle').click();
    await expect(category('Base Layer')).toBeHidden();
    await head.getByTestId('group-name').fill('Clothes');
    await done;
    await page.waitForTimeout(1200);
    await page.reload();
    await expect(page.getByTestId('group-name')).toHaveValue('Clothes');
    await expect(category('Base Layer')).toBeHidden();
    await page.getByTestId('group-toggle').click();
    await expect(category('Base Layer')).toBeVisible();

    // Taken out from its menu, a category leaves; the group stays with one.
    await category('Mid Layer').hover();
    await category('Mid Layer').getByTestId('category-group-button').click();
    await page.getByTestId('category-group-none').click();
    await expect(page.getByTestId('group-meta')).toHaveText('1 category');
    await expect(category('Mid Layer')).not.toHaveClass(/wgInGroup/);

    // Ungroup: the heading goes, the categories stay.
    await page.getByTestId('group-head').hover();
    await page.getByTestId('group-ungroup').click();
    await expect(page.getByTestId('group-head')).toHaveCount(0);
    expect(await catNames(page)).toEqual(expect.arrayContaining(['Base Layer', 'Sleep', 'Mid Layer']));
});

test('catalog gear added by type lands in its parent group: layers in Clothing, pads and quilts in Sleep System', async ({ page, browser }, testInfo) => {
    const tag = `cg${Date.now().toString(36)}`;
    await seedLayers(browser, testInfo.workerIndex, tag);
    await page.setViewportSize({ width: 1440, height: 1000 });
    const u = generateTestUser('grpcat');
    await registerUser(page, u.username, u.password, u.email);
    await expect(page.getByTestId('item-row').first()).toBeVisible();
    await page.getByTestId('rail-catalog').click();
    const panel = page.getByTestId('panel-catalog');
    await panel.getByTestId('catalog-panel-search').fill(tag);
    for (const name of ['Trekking poles', 'Merino top', 'Summit quilt', 'Grid fleece', 'Air pad']) {
        await panel.getByTestId('catalog-panel-result').filter({ hasText: `${name} ${tag}` }).getByTestId('catalog-panel-add').click();
    }
    const heads = page.getByTestId('group-head');
    await expect(heads).toHaveCount(2);
    await expect(heads.nth(0).getByTestId('group-name')).toHaveValue('Clothing');
    await expect(heads.nth(0).getByTestId('group-meta')).toHaveText('2 categories');
    await expect(heads.nth(1).getByTestId('group-name')).toHaveValue('Sleep System');
    await expect(heads.nth(1).getByTestId('group-meta')).toHaveText('2 categories');
    expect(await catNames(page)).toEqual(['Accessories', 'Base Layer', 'Mid Layer', 'Top Quilt', 'Sleeping Pad']);
    await expect(page.getByTestId('category').first()).not.toHaveClass(/wgInGroup/);
});

test('a shared list shows the group: its heading, its categories indented, one row in the totals', async ({ page, browser }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    const u = generateTestUser('grpshare');
    await registerUser(page, u.username, u.password, u.email);
    await createCategoryWithItem(page, 'Base Layer', 'Merino top', { weight: '7', unit: 'oz' });
    await createCategoryWithItem(page, 'Mid Layer', 'Fleece', { weight: '9', unit: 'oz' });
    await createCategoryWithItem(page, 'Sleep', 'Quilt', { weight: '20', unit: 'oz' });
    const category = (name: string) => page.getByTestId('category').filter({ has: page.locator(`input.lpCategoryName[value="${name}"]`) });
    for (const [i, n] of ['Base Layer', 'Mid Layer'].entries()) {
        await category(n).hover();
        await category(n).getByTestId('category-group-button').click();
        if (i === 0) {
            await page.getByTestId('category-group-new').fill('Clothing');
            await page.getByTestId('category-group-create').click();
        } else {
            await page.getByTestId('category-group-option').filter({ hasText: 'Clothing' }).click();
        }
    }
    await page.waitForResponse((r) => r.url().includes('saveLibrary') && r.status() === 200, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await page.getByText('Share', { exact: true }).hover();
    const shareInput = page.getByLabel('Share your list');
    await expect(shareInput).toHaveValue(/\/r\/[a-z0-9]+/, { timeout: 10000 });
    const link = await shareInput.inputValue();

    // The editor saves a moment after the last change: wait until the page has it.
    const visitor = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
    await expect.poll(async () => (await visitor.request.get(link)).text(), { timeout: 30000, intervals: [500, 1000, 2000] }).toContain('wgGroupHeadShare');
    await visitor.goto(link);
    const head = visitor.locator('.wgGroupHeadShare');
    await expect(head).toHaveCount(1);
    await expect(head.locator('h2')).toHaveText('Clothing');
    await expect(head).toContainText('2 categories');
    await expect(visitor.locator('.lpCategory.wgInGroup')).toHaveCount(2);
    await expect(visitor.locator('.lpTotals .wgTotalGroup')).toContainText('Clothing');
    await expect(visitor.locator('.lpTotals .wgTotalInGroup')).toHaveCount(2);
    await visitor.context().close();
});

