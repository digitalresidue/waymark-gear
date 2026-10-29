import { test, expect, Page, APIRequestContext } from '@playwright/test';

import { registerUser, generateTestUser } from './auth-utils';
import { testRoot } from './utils';
import { showLists } from './test-helpers';

// Waymark Gear features: homepage, catalog (owner CSV + picker), drawers,
// list switcher, publishing to Explore, copying a list, Google sign-in.

const url = (p: string) => new URL(p, testRoot).toString();
const ownerName = (workerIndex: number) => `wge2eowner${workerIndex}`;

// The owner list is fixed at startup (playwright.config.ts), one per worker.
// The account may already exist from an earlier test in this worker.
async function signInOwner(page: Page, workerIndex: number) {
    const username = ownerName(workerIndex);
    const register = await page.request.post(url('/register'), {
        data: { username, email: `${username}@example.com`, password: 'testtest' },
    });
    if (register.status() !== 200) {
        const signin = await page.request.post(url('/signin'), { data: { username, password: 'testtest' } });
        expect(signin.status()).toBe(200);
    }
    return username;
}

// A CSV with SKUs unique to this run, so parallel workers never collide in
// the shared catalog.
function catalogCsv(tag: string) {
    return [
        'sku,name,brand,category,description,weight,unit,price,url,worn_default,consumable_default,tags,status',
        `${tag}-1,Test tent ${tag},Trailco,Shelter,Single wall,28,oz,399,https://example.com/tent,false,false,tent,published`,
        `${tag}-2,Test quilt ${tag},Trailco,Sleep,20F,21,oz,,,false,false,,published`,
        `${tag}-3,Test fuel ${tag},Trailco,Kitchen,,7,oz,,,false,true,,published`,
        `${tag}-4,Bad row ${tag},Trailco,Sleep,,abc,oz,,,false,false,,published`,
        `${tag}-5,Draft item ${tag},Trailco,Sleep,,5,oz,,,false,false,,draft`,
    ].join('\n');
}

async function importCatalog(request: APIRequestContext, tag: string) {
    const res = await request.post(url('/api/admin/catalog/import/apply'), { data: { csv: catalogCsv(tag) } });
    expect(res.status()).toBe(200);
}

test.describe('Homepage and Explore', () => {
    test('a visitor sees the homepage and can start a list without an account', async ({ page }) => {
        await page.goto(url('/'));
        await expect(page).toHaveURL(/\/welcome$/);
        await expect(page.getByRole('heading', { name: 'Know every ounce before you go.' })).toBeVisible();
        await expect(page.getByRole('img', { name: /Waymark Gear/ }).first()).toBeVisible();
        await expect(page.getByTestId('google-signin').first()).toBeVisible();

        await page.getByTestId('hero-start').click();
        await expect(page).toHaveURL(url('/'));
        await expect(page.locator('#lpListName')).toBeVisible();
    });

    test('weight class tabs switch the featured kits', async ({ page }) => {
        await page.goto(url('/welcome'));
        await page.getByTestId('class-trad').click();
        await expect(page.getByTestId('class-trad')).toHaveAttribute('aria-selected', 'true');
        await expect(page.getByText('See all traditional kits →')).toBeVisible();
    });

    test('Explore lists published kits', async ({ page }) => {
        await page.goto(url('/explore'));
        await expect(page.getByRole('heading', { name: 'Explore kits' })).toBeVisible();
        await expect(page.getByText(/\d+ kits?|Loading/)).toBeVisible();
    });
});

test.describe('Gear catalog', () => {
    test('owner imports a CSV with a review step, then exports it', async ({ page }, testInfo) => {
        await signInOwner(page, testInfo.workerIndex);
        const tag = `UI${Date.now()}${testInfo.workerIndex}`;
        await page.goto(url('/owner/catalog'));
        await expect(page.getByRole('heading', { name: 'Gear catalog' })).toBeVisible();

        await page.getByTestId('catalog-import').setInputFiles({
            name: 'gear.csv', mimeType: 'text/csv', buffer: Buffer.from(catalogCsv(tag)),
        });
        const review = page.getByTestId('import-review');
        await expect(review).toContainText('4 new');
        await expect(review).toContainText('1 need fixing');
        await expect(review).toContainText('Row 5');

        await page.getByTestId('import-apply').click();
        await expect(page.getByTestId('catalog-notice')).toContainText('4 added');

        await page.getByPlaceholder('Search name, brand, SKU').fill(tag);
        await expect(page.getByTestId('catalog-row')).toHaveCount(4);

        const csv = await (await page.request.get(url('/api/admin/catalog/export.csv'))).text();
        expect(csv).toContain(`Test tent ${tag}`);
        const shopColumns = [1, 2, 3, 4].map((n) => `shop${n}_name,shop${n}_badge,shop${n}_url,shop${n}_affiliate_url`).join(',');
        expect(csv.split('\n')[0]).toBe(`sku,name,brand,category,description,weight,unit,price,currency,url,image_url,worn_default,consumable_default,tags,status,affiliate_url,${shopColumns}`);
    });

    test('owner adds and edits an item by hand', async ({ page }, testInfo) => {
        await signInOwner(page, testInfo.workerIndex);
        const name = `Hand item ${Date.now()}${testInfo.workerIndex}`;
        await page.goto(url('/owner/catalog'));
        await page.getByTestId('catalog-add').click();
        const editor = page.getByTestId('catalog-editor');
        await editor.getByTestId('field-name').fill(name);
        await editor.getByTestId('field-category').fill('Water');
        await editor.getByTestId('field-weight').fill('3');
        await editor.getByTestId('catalog-save').click();
        await expect(page.getByTestId('catalog-notice')).toContainText(name);

        await page.getByPlaceholder('Search name, brand, SKU').fill(name);
        await page.getByRole('button', { name: `Edit ${name}` }).click();
        await editor.getByTestId('field-weight').fill('3.5');
        await editor.getByTestId('catalog-save').click();
        await expect(page.getByTestId('catalog-row').first()).toContainText('3.5 oz');
    });

    test('people who are not owners are kept out', async ({ page }) => {
        const { username, password, email } = generateTestUser('notowner');
        await registerUser(page, username, password, email);
        await expect(page.locator('#lpListName')).toBeVisible();
        expect((await page.request.get(url('/api/admin/catalog'))).status()).toBe(403);
        await page.goto(url('/owner/catalog'));
        await expect(page.getByText('Owner access only.')).toBeVisible();
    });

    test('the picker adds catalog gear to a category, linked to the catalog', async ({ page }, testInfo) => {
        await signInOwner(page, testInfo.workerIndex);
        const tag = `PK${Date.now()}${testInfo.workerIndex}`;
        await importCatalog(page.request, tag);

        const { username, password, email } = generateTestUser('picker');
        await page.context().clearCookies();
        await registerUser(page, username, password, email);
        await expect(page.locator('#lpListName')).toBeVisible();

        await page.getByTestId('add-from-catalog').first().click();
        const picker = page.getByTestId('catalog-picker');
        await expect(picker).toBeVisible();
        await picker.getByTestId('catalog-picker-search').fill(tag);
        await expect(picker.getByTestId('catalog-result')).toHaveCount(3); // the draft stays hidden
        await picker.getByRole('button', { name: `Add Test tent ${tag}` }).click();
        await picker.getByRole('button', { name: `Add Test fuel ${tag}` }).click();
        await picker.getByTestId('catalog-picker-close').click();

        const category = page.getByTestId('category').first();
        await expect(category.getByPlaceholder('Name', { exact: true }).nth(1)).toHaveValue(`Test tent ${tag}`);
        await expect(category.getByPlaceholder('Name', { exact: true }).nth(2)).toHaveValue(`Test fuel ${tag}`);

        // Saved with the catalog link, and the fuel arrives as a consumable.
        await page.waitForResponse((r) => r.url().includes('saveLibrary') && r.status() === 200);
        const signin = await (await page.request.post(url('/signin'), { data: {} })).json();
        const library = JSON.parse(signin.library);
        const tent = library.items.find((i: any) => i.name === `Test tent ${tag}`);
        expect(tent.catalogId).toBeTruthy();
        expect(tent.catalogSync).toBe(true);
        const fuel = library.items.find((i: any) => i.name === `Test fuel ${tag}`);
        const fuelCi = library.categories.flatMap((c: any) => c.categoryItems).find((ci: any) => ci.itemId === fuel.id);
        expect(fuelCi.consumable).toBe(true);
    });

    test('“Create a custom item” adds a blank item to edit', async ({ page }) => {
        const { username, password, email } = generateTestUser('custom');
        await registerUser(page, username, password, email);
        const category = page.getByTestId('category').first();
        await expect(category.getByTestId('item-row').first()).toBeVisible();
        const before = await category.getByTestId('item-row').count();
        await page.getByTestId('add-from-catalog').first().click();
        await page.getByTestId('catalog-custom').click();
        await expect(page.getByTestId('catalog-picker')).toBeHidden();
        await expect(category.getByTestId('item-row')).toHaveCount(before + 1);
    });
});

test.describe('Category drawers', () => {
    test('categories collapse, remember it, and expand all at once', async ({ page }) => {
        const { username, password, email } = generateTestUser('drawer');
        await registerUser(page, username, password, email);
        await page.getByText('Add new category', { exact: true }).click();
        const categories = page.getByTestId('category');
        await expect(categories).toHaveCount(2);

        await categories.first().getByTestId('category-toggle').click();
        await expect(categories.first().getByTestId('category-toggle')).toHaveAttribute('aria-expanded', 'false');
        await expect(categories.first().getByTestId('item-row')).toHaveCount(0);
        await expect(categories.first().getByTestId('category-count')).toHaveText('1 item');

        await page.waitForResponse((r) => r.url().includes('saveLibrary') && r.status() === 200);
        await page.reload();
        await expect(page.getByTestId('category').first().getByTestId('category-toggle')).toHaveAttribute('aria-expanded', 'false');

        await page.getByTestId('collapse-all').click();
        await expect(page.getByTestId('item-row')).toHaveCount(0);
        await page.getByTestId('expand-all').click();
        await expect(page.getByTestId('item-row')).toHaveCount(2);
    });
});

test.describe('List switcher', () => {
    test('new lists go to the top; search and pinning help find them', async ({ page }) => {
        const { username, password, email } = generateTestUser('switch');
        await registerUser(page, username, password, email);
        const title = page.getByPlaceholder('Name your list', { exact: true });
        await title.fill('First list');
        await title.blur();

        for (const name of ['Second', 'Third', 'Fourth', 'Fifth']) {
            await showLists(page);
            await page.getByTestId('new-list').click();
            await title.fill(name);
            await title.blur();
        }
        await showLists(page);
        await expect(page.locator('#lists .lpListName').first()).toHaveText('Fifth');
        await showLists(page);
        await expect(page.locator('#lists .lpListName').last()).toHaveText('First list');

        await showLists(page);
        await page.getByTestId('list-search').fill('thi');
        await showLists(page);
        await expect(page.locator('#lists .lpListName')).toHaveText(['Third']);
        await showLists(page);
        await page.getByTestId('list-search').fill('');

        await showLists(page);
        await page.locator('#lists li').filter({ hasText: 'First list' }).hover();
        await page.getByRole('button', { name: 'Pin First list' }).click();
        await showLists(page);
        await expect(page.locator('#pinnedLists .lpListName')).toHaveText(['First list']);
        await showLists(page);
        await expect(page.locator('#lists .lpListName')).toHaveCount(4);
    });
});

test.describe('Publishing and copying', () => {
    test('a published list appears on Explore, can be featured, and unpublishing removes it', async ({ page }, testInfo) => {
        const { username, password, email } = generateTestUser('pub');
        await registerUser(page, username, password, email);
        const listName = `Published kit ${Date.now()}`;
        const title = page.getByPlaceholder('Name your list', { exact: true });
        await title.fill(listName);
        await title.blur();
        const row = page.getByTestId('item-row').first();
        await row.getByPlaceholder('Name', { exact: true }).fill('Tent');
        await row.getByTestId('item-weight').fill('20');

        await page.getByText('Share', { exact: true }).hover();
        const toggle = page.getByTestId('publish-toggle');
        await expect(toggle).toBeEnabled({ timeout: 10000 });
        await toggle.check();
        await page.waitForResponse((r) => r.url().includes('saveLibrary') && r.status() === 200);

        const found = await (await page.request.get(url(`/api/explore/kits?q=${encodeURIComponent(listName)}`))).json();
        expect(found.total).toBe(1);
        const kit = found.kits[0];
        expect(kit.username).toBe(username);

        // The owner features it from their screen.
        const owner = await page.context().browser()!.newContext();
        const ownerPage = await owner.newPage();
        await signInOwner(ownerPage, testInfo.workerIndex);
        await ownerPage.goto(url('/owner/kits'));
        await ownerPage.getByPlaceholder('Search by name or hiker').fill(listName);
        await ownerPage.getByTestId(`feature-${kit.externalId}`).check();
        await expect.poll(async () => (await (await ownerPage.request.get(url(`/api/explore/kits?q=${encodeURIComponent(listName)}`))).json()).kits[0].featured).toBe(true);
        await owner.close();

        await toggle.uncheck();
        await page.waitForResponse((r) => r.url().includes('saveLibrary') && r.status() === 200);
        expect((await (await page.request.get(url(`/api/explore/kits?q=${encodeURIComponent(listName)}`))).json()).total).toBe(0);
    });

    test('anyone can copy a shared list into their own lists', async ({ page, browser }) => {
        const { username, password, email } = generateTestUser('src');
        await registerUser(page, username, password, email);
        const title = page.getByPlaceholder('Name your list', { exact: true });
        await title.fill('Source kit');
        await title.blur();
        const named = page.waitForResponse((r) => r.url().includes('saveLibrary') && r.status() === 200, { timeout: 20000 });
        await page.getByTestId('item-row').first().getByPlaceholder('Name', { exact: true }).fill('Original quilt');
        await named;
        await page.getByText('Share', { exact: true }).hover();
        const shareInput = page.getByLabel('Share your list');
        await expect(shareInput).toHaveValue(/\/r\/[a-z0-9]+/, { timeout: 10000 });
        const shareUrl = await shareInput.inputValue();
        await expect.poll(async () => (await page.request.get(shareUrl)).status(), { timeout: 15000 }).toBe(200);

        const visitor = await (await browser.newContext()).newPage();
        await visitor.goto(shareUrl);
        await expect(visitor.getByText(`@${username}`)).toBeVisible();
        await visitor.getByTestId('copy-list').click();
        await expect(visitor.locator('#lpListName')).toHaveValue(`Source kit (from @${username})`);
        await expect(visitor.getByTestId('item-row').first().getByPlaceholder('Name', { exact: true })).toHaveValue('Original quilt');

        // The copy is the visitor's own: editing it leaves the source alone.
        await visitor.getByTestId('item-row').first().getByPlaceholder('Name', { exact: true }).fill('My quilt');
        await page.reload();
        await expect(page.getByTestId('item-row').first().getByPlaceholder('Name', { exact: true })).toHaveValue('Original quilt');
    });
});

test.describe('Google sign-in', () => {
    async function googleSignIn(page: Page, { sub, email }: { sub: string; email: string }) {
        await page.getByTestId('google-signin').first().click();
        await expect(page.getByRole('heading', { name: 'Fake Google sign-in' })).toBeVisible();
        await page.getByLabel('Subject', { exact: true }).fill(sub);
        await page.getByLabel('Email', { exact: true }).fill(email);
        await page.getByRole('button', { name: 'Continue' }).click();
    }

    test('a new Google user lands in their lists, signed in', async ({ page }) => {
        const stamp = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
        await page.goto(url('/signin'));
        await googleSignIn(page, { sub: `g-${stamp}`, email: `g${stamp}@example.com` });
        await expect(page.locator('#lpListName')).toBeVisible();
        await expect(page.getByTestId('account-menu')).toBeVisible();

        // Signing in again with the same Google account finds the same user.
        const first = await (await page.request.post(url('/signin'), { data: {} })).json();
        await page.context().clearCookies();
        await page.goto(url('/signin'));
        await googleSignIn(page, { sub: `g-${stamp}`, email: `g${stamp}@example.com` });
        await expect(page.locator('#lpListName')).toBeVisible();
        const second = await (await page.request.post(url('/signin'), { data: {} })).json();
        expect(second.username).toBe(first.username);
        expect(second.account.hasPassword).toBe(false);
    });

    test('a Google email that belongs to a password account is refused, with directions', async ({ page }) => {
        const { username, password, email } = generateTestUser('gclash');
        await registerUser(page, username, password, email);
        await expect(page.locator('#lpListName')).toBeVisible();
        await page.context().clearCookies();
        await page.goto(url('/signin'));
        await googleSignIn(page, { sub: `g-clash-${Date.now()}`, email });
        await expect(page.getByTestId('google-error')).toContainText('connect Google from Account settings');
    });

    test('a library built before signing up moves into the new Google account', async ({ page }) => {
        await page.goto(url('/welcome'));
        await page.getByTestId('hero-start').click();
        const title = page.getByPlaceholder('Name your list', { exact: true });
        await title.fill('Built before signing up');
        await title.blur();
        // Local mode autosaves after a few seconds of quiet.
        await expect.poll(() => page.evaluate(() => localStorage.library || ''), { timeout: 25000 }).toContain('Built before signing up');

        const stamp = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
        await page.goto(url('/signin'));
        await googleSignIn(page, { sub: `g-local-${stamp}`, email: `local${stamp}@example.com` });
        await expect(page.locator('#lpListName')).toHaveValue('Built before signing up');
        expect(await page.evaluate(() => localStorage.library)).toBeUndefined();
    });
});
