import { test, expect, Page, Browser } from '@playwright/test';

import { registerUser, generateTestUser } from './auth-utils';
import { testRoot } from './utils';

// The site menu (client/nav.js): one short row with dropdowns, the same in
// the app and on server-rendered pages, which also get the site footer.
// Plus: the homepage stays reachable when signed in, the owner pages share
// one layout, and catalog gear keeps its product and affiliate links apart.

const url = (p: string) => new URL(p, testRoot).toString();

async function owner(browser: Browser, workerIndex: number) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const username = `wge2eowner${workerIndex}`;
    const r = await page.request.post(url('/register'), { data: { username, email: `${username}@example.com`, password: 'testtest' } });
    if (r.status() !== 200) expect((await page.request.post(url('/signin'), { data: { username, password: 'testtest' } })).status()).toBe(200);
    return { context, page, username };
}

async function openDropdown(page: Page, id: string) {
    await page.getByTestId(`nav-${id}`).click();
    await expect(page.locator(`#wgNavDrop-${id}`)).toBeVisible();
}

test.describe('Site menu', () => {
    test('a short top row; related pages in dropdowns; nothing owner-only for visitors', async ({ page }) => {
        await page.goto(url('/welcome'));
        const nav = page.locator('#wgSiteNav');
        // Visitors: Explore only (no lists, trips or owner tools).
        await expect(page.getByTestId('nav-owner')).toHaveCount(0);
        await expect(page.getByTestId('nav-trips')).toHaveCount(0);
        await expect(page.getByTestId('nav-kits')).toBeHidden();
        await openDropdown(page, 'explore');
        for (const id of ['kits', 'trails', 'leaderboard', 'reviews']) await expect(nav.getByTestId(`nav-${id}`)).toBeVisible();
        // Escape closes it (hover still opens it with a mouse over it).
        await page.keyboard.press('Escape');
        await page.mouse.move(5, 700);
        await expect(page.getByTestId('nav-kits')).toBeHidden();

        // In-app pages switch without a reload; Trails is a server page.
        await page.evaluate(() => { (window as any).stayed = true; });
        await openDropdown(page, 'explore');
        await page.getByTestId('nav-leaderboard').click();
        await expect(page).toHaveURL(/\/leaderboard$/);
        expect(await page.evaluate(() => (window as any).stayed)).toBe(true);
        await openDropdown(page, 'explore');
        await page.getByTestId('nav-trails').click();
        await expect(page).toHaveURL(/\/trails\/[a-z0-9-]+$/);
        await expect(page.getByTestId('nav-explore')).toHaveClass(/wgActive/);
    });

    test('server pages carry the same header and the footer; signed-in parts appear for the viewer', async ({ browser }, testInfo) => {
        // A visitor.
        const guest = await browser.newPage();
        await guest.goto(url('/trails/pct'));
        await expect(guest.locator('[data-site-header]')).toBeVisible();
        await expect(guest.locator('.wgSiteFooter')).toBeVisible();
        await expect(guest.getByTestId('header-signin')).toBeVisible();
        await expect(guest.getByTestId('nav-owner')).toBeHidden();
        await expect(guest.getByTestId('nav-trips')).toBeHidden();
        await expect(guest.getByTestId('header-lists')).toHaveAttribute('href', '/?start=1');
        await guest.getByTestId('nav-explore').click();
        await expect(guest.getByTestId('nav-kits')).toBeVisible();
        await guest.close();

        // The site owner, on the same cached page.
        const o = await owner(browser, testInfo.workerIndex);
        await o.page.goto(url('/trails/pct'));
        await expect(o.page.getByTestId('nav-owner')).toBeVisible();
        await expect(o.page.getByTestId('nav-trips')).toBeVisible();
        await expect(o.page.getByTestId('nav-lists')).toBeVisible();
        await expect(o.page.getByTestId('header-signin')).toBeHidden();
        // Bell and account menu, top right; My lists is inside it.
        await expect(o.page.getByTestId('header-lists')).toBeHidden();
        await expect(o.page.getByTestId('notification-bell')).toBeVisible();
        await expect(o.page.locator('[data-viewer-initial]')).toHaveText(new RegExp(`^${o.username.charAt(0)}$`, 'i'));
        await o.page.getByTestId('account-menu').click();
        await expect(o.page.getByTestId('menu-lists')).toHaveAttribute('href', '/');
        await o.page.keyboard.press('Escape');
        await o.page.getByTestId('nav-owner').click();
        await o.page.getByTestId('nav-owner-users').click();
        await expect(o.page).toHaveURL(/\/moderation$/);

        // The Users page: site header, owner tabs and footer, like the rest.
        await expect(o.page.locator('.wgSiteHeader')).toBeVisible();
        await expect(o.page.getByTestId('owner-nav-users')).toHaveClass(/wgActive/);
        await expect(o.page.getByRole('heading', { name: 'Users', exact: true })).toBeVisible();
        await expect(o.page.locator('.wgSiteFooter')).toBeVisible();
        for (const path of ['/owner/catalog', '/owner/trails']) {
            await o.page.goto(url(path));
            await expect(o.page.locator('.wgSiteFooter')).toBeVisible();
        }
        await o.context.close();
    });

    test('signed in, the logo goes to the homepage, not back to your lists', async ({ page }) => {
        const u = generateTestUser('menuhome');
        await registerUser(page, u.username, u.password, u.email);
        await expect(page.getByTestId('item-row').first()).toBeVisible();
        await page.getByTestId('site-logo').click();
        await expect(page).toHaveURL(/\/welcome$/);
        await expect(page.getByRole('heading', { name: 'Know every ounce before you go.' })).toBeVisible();
        // And back to the lists from the menu.
        await page.getByTestId('nav-lists').click();
        await expect(page.getByTestId('item-row').first()).toBeVisible();
    });

    test('"Start a list" on a server page starts one, and never replaces existing lists', async ({ page }) => {
        await page.goto(url('/?start=1'));
        await expect(page.getByTestId('item-row').first()).toBeVisible();
        await expect(page).toHaveURL(/\/$/);
        const before = await page.evaluate(() => localStorage.getItem('library'));
        await page.goto(url('/?start=1'));
        await expect(page.getByTestId('item-row').first()).toBeVisible();
        expect(await page.evaluate(() => localStorage.getItem('library'))).toBe(before);
    });
});

test.describe('Account menu everywhere', () => {
    test('signed in, every app page has the bell and account menu; My lists and Account Settings work from anywhere', async ({ page }) => {
        const u = generateTestUser('acctmenu');
        await registerUser(page, u.username, u.password, u.email);
        await expect(page.getByTestId('item-row').first()).toBeVisible();
        await page.goto(url('/explore'));
        const header = page.locator('.wgSiteHeader');
        await expect(header.locator('.lpAvatar')).toHaveText(new RegExp(`^${u.username.charAt(0)}$`, 'i'));
        await expect(header.getByText('Open my lists')).toHaveCount(0);
        // Account Settings opens here, away from the list editor.
        await header.locator('#accountPopover').hover();
        await header.locator('.accountSettings').click();
        await expect(page.locator('#accountSettings')).toBeVisible();
        await page.keyboard.press('Escape');
        // My lists from the menu.
        await header.locator('#accountPopover').hover();
        await header.getByTestId('menu-lists').click();
        await expect(page.getByTestId('item-row').first()).toBeVisible();
    });
});

test.describe('Catalog links', () => {
    test('an affiliate link needs the product link; the editor says who gets which', async ({ browser }, testInfo) => {
        const o = await owner(browser, testInfo.workerIndex);
        const name = `Link test ${Date.now()}`;
        const base = { name, category: 'Shelter', weight: '19', unit: 'oz', status: 'draft' };
        const bad = await o.page.request.post(url('/api/admin/catalog'), { data: { ...base, affiliateUrl: 'https://www.avantlink.com/click.php?tt=cl&mi=1&pw=2' } });
        expect(bad.status()).toBe(400);
        expect(JSON.stringify(await bad.json())).toMatch(/product link/);
        const good = await o.page.request.post(url('/api/admin/catalog'), { data: { ...base, url: 'https://example.com/tent', affiliateUrl: 'https://brand.sjv.io/c/1/2/3' } });
        expect(good.ok()).toBe(true);

        await o.page.goto(url('/owner/catalog'));
        await o.page.getByPlaceholder('Search name, brand, SKU').fill(name);
        const row = o.page.getByTestId('catalog-row').filter({ hasText: name });
        await expect(row.getByTestId('catalog-affiliate-badge')).toBeVisible();
        await row.getByRole('button', { name: 'Edit' }).click();
        await expect(o.page.getByTestId('catalog-buy-route')).toContainText('except Supporters, who get the product link');
        await o.page.getByTestId('catalog-affiliate-url').fill('');
        await expect(o.page.getByTestId('catalog-buy-route')).toContainText('the product link');
        await o.context.close();
    });
});
