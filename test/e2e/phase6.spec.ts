import { test, expect, Page, Browser } from '@playwright/test';

import { registerUser, generateTestUser } from './auth-utils';
import { createCategoryWithItem } from './test-helpers';
import { testRoot } from './utils';

// Phase 6: trip details and calorie estimates, gear lifecycle, trip
// journals, gear reviews.

const url = (p: string) => new URL(p, testRoot).toString();
const saved = (page: Page) => page.waitForResponse((r) => r.url().includes('saveLibrary') && r.status() === 200, { timeout: 20000 });
const PNG_40X30 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAACgAAAAeCAIAAADRv8uKAAAALklEQVR42u3NIQEAMAgAMHgPOuDp3+sRkJitwLKm48KLI2KxWCwWi8VisVgs3n0/ZgDE/KDNNAAAAABJRU5ErkJggg==', 'base64');

async function newUser(browser: Browser, prefix: string) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const u = generateTestUser(prefix);
    await registerUser(page, u.username, u.password, u.email);
    await expect(page.getByTestId('item-row').first()).toBeVisible();
    return { context, page, ...u };
}

// Fixed accounts named in playwright.config.ts, one per worker. They may
// already exist from an earlier test in this worker.
async function signInFixed(page: Page, username: string) {
    const register = await page.request.post(url('/register'), {
        data: { username, email: `${username}@example.com`, password: 'testtest' },
    });
    if (register.status() !== 200) {
        const signin = await page.request.post(url('/signin'), { data: { username, password: 'testtest' } });
        expect(signin.status()).toBe(200);
    }
}

test.describe('Phase 6', () => {
    test('trip details give a calorie and water estimate you can use for food', async ({ page }) => {
        const u = generateTestUser('p6kcal');
        await registerUser(page, u.username, u.password, u.email);
        await createCategoryWithItem(page, 'Shelter', 'Tent', { weight: '16', unit: 'oz' });
        const planner = page.getByTestId('trip-planner');
        await planner.getByTestId('trip-toggle').click();
        await planner.getByTestId('trip-details').locator('summary').click();

        // No body weight yet: no estimate.
        await expect(planner.getByTestId('trip-estimate')).toHaveCount(0);
        await planner.getByTestId('trip-distance').fill('45');
        await planner.getByTestId('trip-elevation').fill('9000');
        await planner.getByTestId('trip-terrain').selectOption('offtrail');
        await planner.getByTestId('trip-low').fill('30');
        let done = saved(page);
        await planner.getByTestId('trip-body').fill('165');
        await done;

        await expect(planner.getByTestId('trip-estimate')).toBeVisible();
        const kcal = Number((await planner.getByTestId('trip-kcal').innerText()).replace(/[^\d]/g, ''));
        expect(kcal).toBeGreaterThan(3000);
        expect(kcal).toBeLessThan(6000);

        const before = await planner.getByTestId('trip-food').inputValue();
        done = saved(page);
        await planner.getByTestId('trip-use-estimate').click();
        await done;
        expect(await planner.getByTestId('trip-food').inputValue()).not.toBe(before);
        await expect(planner.getByTestId('trip-use-estimate')).toBeDisabled();

        await page.reload();
        const again = page.getByTestId('trip-planner');
        await again.getByTestId('trip-toggle').click();
        await expect(again.getByTestId('trip-distance')).toHaveValue('45');
        await expect(again.getByTestId('trip-body')).toHaveValue('165');
    });

    test('gear lifecycle: an old item past its expected life says replace soon', async ({ page }) => {
        const u = generateTestUser('p6life');
        await registerUser(page, u.username, u.password, u.email);
        const { itemRow } = await createCategoryWithItem(page, 'Shelter', 'Old tent', { weight: '30', unit: 'oz' });
        await itemRow.hover();
        await itemRow.getByTestId('item-details').click();
        const year = new Date().getFullYear() - 6;
        await page.getByTestId('gear-bought').fill(`${year}-03`);
        await page.getByTestId('gear-condition').selectOption('worn');
        await page.getByTestId('gear-life').fill('5');
        await expect(page.getByTestId('gear-life-note')).toContainText('Replace soon');
        const done = saved(page);
        await page.getByTestId('gear-details-save').click();
        await done;
        await expect(page.getByTestId('replace-soon')).toBeVisible();

        await page.reload();
        await expect(page.getByTestId('replace-soon')).toBeVisible();
        const item = await page.evaluate(() => (window as any).LighterPack.$store.state.library.items.find((i: any) => i.name === 'Old tent'));
        expect(item.purchasedOn).toBe(`${year}-03`);
        expect(item.condition).toBe('worn');
        expect(item.lifeYears).toBe(5);
    });

    test('trip journal: days with photos, followers-only, then public', async ({ browser }) => {
        const author = await newUser(browser, 'p6trip');
        const fan = await newUser(browser, 'p6fan');
        const stranger = await newUser(browser, 'p6str');
        const { page } = author;

        const title = page.getByPlaceholder('Name your list', { exact: true });
        const named = saved(page);
        await title.fill('Winds kit');
        await title.blur();
        await named;

        await page.goto(url('/trips'));
        await page.getByTestId('trip-new-title').fill('Wind River High Route');
        await page.getByTestId('trip-new-start').fill('2026-08-01');
        await page.getByTestId('trip-new-end').fill('2026-08-07');
        await page.getByTestId('trip-new-create').click();
        await expect(page).toHaveURL(/\/trips\/\d+$/);
        const tripId = page.url().split('/').pop();

        // Day 1 lands on the start date.
        await page.getByTestId('entry-add').click();
        const day = page.getByTestId('entry').first();
        await expect(day).toContainText('Day 1');
        await expect(day.getByTestId('entry-date')).toHaveValue('2026-08-01');
        await day.getByTestId('entry-title').fill('Big Sandy to Temple Pass');
        await day.getByTestId('entry-body').fill('Smoke in the morning, **clear** by noon.');
        await day.getByTestId('entry-distance').fill('12');
        await day.getByTestId('entry-photo-file').setInputFiles({ name: 'pass.png', mimeType: 'image/png', buffer: PNG_40X30 });
        await expect(day.getByTestId('entry-photo')).toHaveCount(1);
        await day.getByTestId('entry-save').click();
        await expect(page.getByTestId('trip-saved')).toBeVisible();

        // A second day follows the first.
        await page.getByTestId('entry-add').click();
        await expect(page.getByTestId('entry').nth(1).getByTestId('entry-date')).toHaveValue('2026-08-02');

        await page.getByTestId('trip-visibility').selectOption('followers');
        await page.getByTestId('trip-list').selectOption({ label: 'Winds kit' });
        await page.getByTestId('trip-summary').fill('Seven days, mostly off trail.');
        await page.getByTestId('trip-cover-pick').first().click();
        await page.getByTestId('trip-save').click();
        await expect(page.getByTestId('trip-saved')).toBeVisible();

        // Followers only: hidden from strangers and signed-out readers.
        expect((await stranger.page.request.get(url(`/t/${tripId}`))).status()).toBe(404);
        const anon = await browser.newContext();
        expect((await anon.request.get(url(`/t/${tripId}`))).status()).toBe(404);

        await fan.page.request.post(url(`/api/users/${author.username}/follow`), { data: {} });
        await fan.page.goto(url(`/t/${tripId}`));
        await expect(fan.page.getByTestId('trip-title')).toHaveText('Wind River High Route');
        await expect(fan.page.getByTestId('trip-visibility')).toHaveText('Followers only');
        await expect(fan.page.getByTestId('trip-entry').first()).toContainText('Day 1');
        await expect(fan.page.getByTestId('trip-entry').first()).toContainText('Big Sandy to Temple Pass');
        await expect(fan.page.getByTestId('trip-entry').first().locator('strong')).toHaveText('clear');
        await expect(fan.page.getByTestId('trip-distance-total')).toHaveText('12.0 mi');
        await expect(fan.page.getByTestId('trip-list')).toContainText('Winds kit');
        await fan.page.getByTestId('trip-entry').first().locator('.wgJournalPhotos a').click();
        await expect(fan.page.getByTestId('lightbox-photo')).toHaveAttribute('src', /_photo\.webp$/);

        await fan.page.goto(url(`/@${author.username}?view=trips`));
        await expect(fan.page.getByTestId('profile-trip')).toHaveCount(1);
        await stranger.page.goto(url(`/@${author.username}?view=trips`));
        await expect(stranger.page.getByTestId('profile-trip')).toHaveCount(0);

        // Someone else's photo can't be pulled into the journal.
        const upload = await stranger.page.request.post(url('/api/profile/image?kind=photo'), {
            multipart: { image: { name: 'x.png', mimeType: 'image/png', buffer: PNG_40X30 } },
        });
        const { imageUrl: theirs } = await upload.json();
        const trip = await (await page.request.get(url(`/api/trips/${tripId}`))).json();
        const second = trip.trip.entries[1];
        const res = await page.request.put(url(`/api/trips/${tripId}/entries/${second.id}`), { data: { title: 'Day 2', photos: [theirs] } });
        expect((await res.json()).entries[1].photos).toEqual([]);
        // And only the owner can change it.
        expect((await stranger.page.request.put(url(`/api/trips/${tripId}`), { data: { title: 'Mine now' } })).status()).toBe(404);

        // Public: anyone can read it.
        await page.getByTestId('trip-visibility').selectOption('public');
        await page.getByTestId('trip-save').click();
        await expect.poll(async () => (await anon.request.get(url(`/t/${tripId}`))).status()).toBe(200);
        const anonPage = await anon.newPage();
        await anonPage.goto(url(`/t/${tripId}`));
        await expect(anonPage.getByTestId('trip-entry')).toHaveCount(2);
        await expect(anonPage.getByTestId('trip-edit-link')).toHaveCount(0);
        await page.goto(url(`/t/${tripId}`));
        await expect(page.getByTestId('trip-edit-link')).toBeVisible();

        for (const c of [author.context, fan.context, stranger.context, anon]) await c.close();
    });

    test('gear reviews: staff write them, members cannot, moderators can hide them', async ({ browser }, testInfo) => {
        // The owner adds a catalog item.
        const ownerCtx = await browser.newContext();
        const owner = await ownerCtx.newPage();
        await signInFixed(owner, `wge2eowner${testInfo.workerIndex}`);
        const tag = `rv${Date.now().toString(36)}`;
        const csv = [
            'sku,name,brand,category,description,weight,unit,price,url,worn_default,consumable_default,tags,status',
            `${tag},Review quilt ${tag},Trailco,Sleep,20F quilt,21,oz,320,https://example.com/q,false,false,,published`,
        ].join('\n');
        expect((await owner.request.post(url('/api/admin/catalog/import/apply'), { data: { csv } })).status()).toBe(200);
        const found = await (await owner.request.get(url(`/api/catalog?q=${tag}`))).json();
        const id = found.items[0].id;

        // A named reviewer writes one.
        const reviewerCtx = await browser.newContext();
        const reviewer = await reviewerCtx.newPage();
        await signInFixed(reviewer, `wge2ereviewer${testInfo.workerIndex}`);
        await reviewer.goto(url(`/g/${id}`));
        await expect(reviewer.getByTestId('gear-name')).toHaveText(`Review quilt ${tag}`);
        await expect(reviewer.getByTestId('gear-rating')).toContainText('No reviews yet');
        await reviewer.getByTestId('review-rating-4').check();
        await reviewer.getByTestId('review-title').fill('Warm for the weight');
        await reviewer.getByTestId('review-used-for').fill('A month on the Colorado Trail');
        await reviewer.getByTestId('review-body').fill('Kept me warm to about 25F with a puffy. The pad straps are fiddly.');
        await reviewer.getByTestId('review-cons').fill('Pad straps');
        await reviewer.getByTestId('review-submit').click();
        await expect(reviewer.getByTestId('review')).toHaveCount(1);
        await expect(reviewer.getByTestId('review-staff')).toBeVisible();
        await expect(reviewer.getByTestId('gear-rating')).toContainText('4 / 5 from 1 review');
        await expect(reviewer.getByTestId('review-toggle')).toHaveText('Edit your review');

        // Too short is refused.
        const short = await reviewer.request.post(url(`/api/catalog/${id}/reviews`), { data: { rating: 5, body: 'Great' } });
        expect(short.status()).toBe(400);

        // Members can't review (openReviews is off), and see no form.
        const member = await newUser(browser, 'p6mem');
        const denied = await member.page.request.post(url(`/api/catalog/${id}/reviews`), { data: { rating: 1, body: 'This is a long enough review to pass the length check.' } });
        expect(denied.status()).toBe(403);
        await member.page.goto(url(`/g/${id}`));
        await expect(member.page.getByTestId('review')).toHaveCount(1);
        await expect(member.page.getByTestId('review-form')).toHaveCount(0);

        // It shows on the latest reviews page.
        await member.page.goto(url('/reviews'));
        await expect(member.page.getByTestId('latest-reviews')).toContainText(`Review quilt ${tag}`);

        // The owner (a moderator too) hides it; it drops out for everyone else.
        await owner.goto(url(`/g/${id}`));
        await owner.getByTestId('review-moderate').click();
        await expect(owner.getByTestId('review-moderate')).toHaveText('Restore');
        const after = await (await member.page.request.get(url(`/api/catalog/${id}/reviews`))).json();
        expect(after.reviews).toHaveLength(0);
        expect(after.summary.count).toBe(0);

        for (const c of [ownerCtx, reviewerCtx, member.context]) await c.close();
    });
});
