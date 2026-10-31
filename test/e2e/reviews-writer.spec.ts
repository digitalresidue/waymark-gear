import { test, expect, Browser } from '@playwright/test';

import { registerUser, generateTestUser } from './auth-utils';
import { testRoot } from './utils';

// Writing a gear review has a way in: the Gear reviews page shows reviewers
// a "Write a review" panel (search the catalog, or pick from the most-carried
// gear they haven't reviewed), the Owner menu links to it, and the owner's
// catalog has a Review link per item. Each lands on the gear page with the
// review form open.

const url = (p: string) => new URL(p, testRoot).toString();

async function owner(browser: Browser, workerIndex: number) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const username = `wge2eowner${workerIndex}`;
    const r = await page.request.post(url('/register'), { data: { username, email: `${username}@example.com`, password: 'testtest' } });
    if (r.status() !== 200) expect((await page.request.post(url('/signin'), { data: { username, password: 'testtest' } })).status()).toBe(200);
    return { context, page };
}

test.describe('Writing a gear review', () => {
    test('a reviewer finds gear from the reviews page, writes it up, and it shows there', async ({ browser }, testInfo) => {
        const o = await owner(browser, testInfo.workerIndex);
        const page = o.page;
        const tag = `wr${Date.now().toString(36)}`;
        const csv = [
            'sku,name,brand,category,description,weight,unit,price,url,worn_default,consumable_default,tags,status',
            `${tag},Writer tarp ${tag},Trailco,Shelter,Flat tarp,9,oz,120,https://example.com/t,false,false,,published`,
        ].join('\n');
        expect((await page.request.post(url('/api/admin/catalog/import/apply'), { data: { csv } })).status()).toBe(200);

        // From the Owner menu.
        await page.goto(url('/kits'));
        await page.getByTestId('nav-owner').click();
        await page.getByTestId('nav-owner-review').click();
        await expect(page).toHaveURL(/\/reviews#write$/);
        const writer = page.getByTestId('review-writer');
        await expect(writer).toBeVisible();
        await expect(page.getByTestId('review-find')).toBeFocused();
        await expect(page.getByTestId('review-suggestions').locator('a').first()).toBeVisible();

        // Search, pick, and the form is open on the gear page.
        await page.getByTestId('review-find').fill(tag);
        const pick = writer.getByTestId('review-pick').filter({ hasText: `Writer tarp ${tag}` });
        await expect(pick).toBeVisible();
        await pick.click();
        await expect(page).toHaveURL(/\/g\/[^#]+#write-review$/);
        await expect(page.getByTestId('review-form')).toBeVisible();
        await expect(page.getByTestId('review-rating-1')).toBeFocused();
        await page.getByTestId('review-rating-5').check();
        await page.getByTestId('review-title').fill('Light and simple');
        await page.getByTestId('review-body').fill('Pitched it forty nights on the Arizona Trail; it never let water in.');
        await page.getByTestId('review-submit').click();
        await expect(page.getByTestId('review')).toHaveCount(1);

        // On the reviews page; and gone from "not reviewed by you yet".
        await page.goto(url('/reviews'));
        await expect(page.getByTestId('latest-reviews')).toContainText(`Writer tarp ${tag}`);
        await expect(page.getByTestId('review-suggestions')).not.toContainText(`Writer tarp ${tag}`);

        // The owner's catalog has a Review link per published item.
        await page.goto(url('/owner/catalog'));
        await page.getByPlaceholder('Search name, brand, SKU').fill(tag);
        const row = page.getByTestId('catalog-row').filter({ hasText: tag });
        await expect(row.getByTestId('catalog-review')).toHaveAttribute('href', /\/g\/.+#write-review$/);
        await o.context.close();
    });

    test('members and visitors don\'t see the panel', async ({ page, browser }) => {
        await page.goto(url('/reviews'));
        await expect(page.getByRole('heading', { name: "What's worth carrying" })).toBeVisible();
        await expect(page.getByTestId('review-writer')).toBeHidden();

        const context = await browser.newContext();
        const member = await context.newPage();
        const u = generateTestUser('wrmem');
        await registerUser(member, u.username, u.password, u.email);
        await expect(member.getByTestId('item-row').first()).toBeVisible();
        expect((await member.request.get(url('/api/reviews/suggestions'))).ok()).toBe(true);
        expect((await (await member.request.get(url('/api/reviews/suggestions'))).json()).items).toEqual([]);
        await member.goto(url('/reviews'));
        await expect(member.locator('.wgSiteHeader')).toBeVisible();
        await expect(member.getByTestId('notification-bell')).toBeVisible();
        await expect(member.getByTestId('review-writer')).toBeHidden();
        await context.close();
    });
});
