import { test, expect, Page } from '@playwright/test';

import { registerUser, generateTestUser } from './auth-utils';
import { testRoot } from './utils';

// What Supporters get: the perks list, a badge on their published lists and
// shakedown comments, and a place on the Supporters wall if they want one.

const url = (p: string) => new URL(p, testRoot).toString();
const saved = (page: Page) => page.waitForResponse((r) => r.url().includes('saveLibrary') && r.status() === 200, { timeout: 20000 });

async function publish(page: Page, name: string) {
    const title = page.getByPlaceholder('Name your list', { exact: true });
    await title.fill(name);
    await title.blur();
    const row = page.getByTestId('item-row').first();
    await row.getByPlaceholder('Name', { exact: true }).fill('Quilt');
    await row.getByTestId('item-weight').fill('20');
    await page.getByText('Share', { exact: true }).hover();
    const shareInput = page.getByLabel('Share your list');
    await expect(shareInput).toHaveValue(/\/r\/[a-z0-9]+/, { timeout: 10000 });
    const link = await shareInput.inputValue();
    const toggle = page.getByTestId('publish-toggle');
    await expect(toggle).toBeEnabled({ timeout: 10000 });
    const done = saved(page);
    await toggle.check();
    await done;
    await page.mouse.move(5, 600);
    return link;
}

async function subscribe(page: Page) {
    await page.goto(url('/supporter'));
    await page.getByTestId('supporter-monthly').click();
    await expect(page.getByTestId('supporter-welcome')).toBeVisible({ timeout: 20000 });
}

test('the Supporter page lists the perks, signed out too', async ({ page }) => {
    await page.goto(url('/supporter'));
    const perks = page.getByTestId('supporter-perks');
    await expect(perks).toContainText('Plain shop links everywhere');
    await expect(perks).toContainText('A Supporter badge on your profile, your published lists and your shakedown comments.');
    await expect(perks).toContainText('Supporters wall');
});

test('a Supporter chooses to be on the wall, and is thanked there', async ({ page }) => {
    const u = generateTestUser('wall');
    await registerUser(page, u.username, u.password, u.email);
    await expect(page.getByTestId('item-row').first()).toBeVisible();

    // Not before they're a Supporter, and not until they say so.
    await page.goto(url('/supporter'));
    await expect(page.getByTestId('supporter-wall-toggle')).toHaveCount(0);
    await subscribe(page);
    const toggle = page.getByTestId('supporter-wall-toggle');
    await expect(toggle).not.toBeChecked();
    await page.goto(url('/supporters'));
    await expect(page.getByTestId('supporters-heading')).toBeVisible();
    await expect(page.locator(`a[href="/@${u.username}"]`)).toHaveCount(0);

    await page.goto(url('/supporter'));
    await toggle.check();
    await expect.poll(async () => (await (await page.request.get(url('/api/plan'))).json()).onWall).toBe(true);
    await page.goto(url('/supporters'));
    await expect(page.getByTestId('supporters-wall').locator(`a[href="/@${u.username}"]`)).toBeVisible();

    // And off again.
    await page.goto(url('/supporter'));
    await toggle.uncheck();
    await expect.poll(async () => (await (await page.request.get(url('/api/plan'))).json()).onWall).toBe(false);
    await page.goto(url('/supporters'));
    await expect(page.locator(`a[href="/@${u.username}"]`)).toHaveCount(0);
});

test('a Supporter has the badge on their published lists and their comments', async ({ page }) => {
    const u = generateTestUser('flair');
    await registerUser(page, u.username, u.password, u.email);
    await expect(page.getByTestId('item-row').first()).toBeVisible();
    const link = await publish(page, `Flair ${Date.now()}`);
    const externalId = link.split('/r/')[1];

    // Not yet a Supporter: no badge.
    await page.goto(link);
    await expect(page.getByTestId('share-profile-link')).toBeVisible();
    await expect(page.getByTestId('share-supporter')).toHaveCount(0);

    await subscribe(page);
    expect((await page.request.post(url(`/api/kits/${externalId}/comments`), { data: { body: 'Thanks for looking!' } })).status()).toBe(201);
    // A new address: the page may be served stale for up to a minute
    // (stale-while-revalidate), and Firefox takes it up on that.
    await page.goto(`${link}?after=subscribing`);
    await expect(page.getByTestId('share-supporter')).toBeVisible();
    await expect(page.getByTestId('comment').first().getByTestId('comment-supporter')).toBeVisible();
});
