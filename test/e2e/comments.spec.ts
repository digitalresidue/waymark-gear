import { test, expect, Page, Browser } from '@playwright/test';

import { registerUser, generateTestUser } from './auth-utils';
import { testRoot } from './utils';

// Phase 3.6: comments on published lists, shakedown requests,
// notifications, reports and moderation.

const url = (p: string) => new URL(p, testRoot).toString();
const saved = (page: Page) => page.waitForResponse((r) => r.url().includes('saveLibrary') && r.status() === 200, { timeout: 20000 });

async function publishList(page: Page, { name, item, shakedown }: { name: string; item: string; shakedown?: boolean }) {
    const title = page.getByPlaceholder('Name your list', { exact: true });
    await title.fill(name);
    await title.blur();
    const row = page.getByTestId('item-row').first();
    await row.getByPlaceholder('Name', { exact: true }).fill(item);
    await row.getByTestId('item-weight').fill('12');
    await page.getByText('Share', { exact: true }).hover();
    const shareInput = page.getByLabel('Share your list');
    await expect(shareInput).toHaveValue(/\/r\/[a-z0-9]+/, { timeout: 10000 });
    const link = await shareInput.inputValue();
    const toggle = page.getByTestId('publish-toggle');
    await expect(toggle).toBeEnabled({ timeout: 10000 });
    let done = saved(page);
    await toggle.check();
    await done;
    if (shakedown) {
        done = saved(page);
        await page.getByTestId('shakedown-toggle').check();
        await done;
    }
    await page.mouse.move(5, 600);
    return link;
}

async function newUser(browser: Browser, prefix: string) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const u = generateTestUser(prefix);
    await registerUser(page, u.username, u.password, u.email);
    await expect(page.getByTestId('item-row').first()).toBeVisible();
    return { context, page, username: u.username };
}

test.describe('Comments and shakedowns', () => {
    test('a shakedown suggestion notifies the owner, and their reply notifies the hiker', async ({ page, browser }) => {
        const owner = generateTestUser('cmown');
        await registerUser(page, owner.username, owner.password, owner.email);
        await expect(page.getByTestId('item-row').first()).toBeVisible();
        const listName = `Shakedown me ${Date.now()}`;
        const link = await publishList(page, { name: listName, item: 'Canister stove', shakedown: true });

        const found = await (await page.request.get(url(`/api/explore/kits?shakedown=1&q=${encodeURIComponent(listName)}`))).json();
        expect(found.total).toBe(1);
        expect(found.kits[0].shakedown).toBe(true);

        const hiker = await newUser(browser, 'cmhik');
        await hiker.page.goto(link);
        await expect(hiker.page.getByTestId('shakedown-banner')).toBeVisible();
        await hiker.page.locator('#wgComments').scrollIntoViewIfNeeded();
        await expect(hiker.page.getByTestId('comment-kind-suggestion')).toBeChecked();
        await hiker.page.getByTestId('comment-item').selectOption('Canister stove');
        await hiker.page.getByTestId('comment-body').fill('Swap it for an alcohol stove and save 3 oz.');
        await hiker.page.getByTestId('comment-submit').click();
        const suggestion = hiker.page.getByTestId('comment').first();
        await expect(suggestion.getByTestId('comment-suggestion')).toHaveText(/Suggestion: Canister stove/);
        await expect(suggestion.getByTestId('comment-text')).toHaveText('Swap it for an alcohol stove and save 3 oz.');

        // The owner sees it in their notifications.
        await page.reload();
        await expect(page.getByTestId('notifications-count')).toHaveText('1');
        await page.getByTestId('notifications').click();
        const note = page.getByTestId('notification').first();
        await expect(note).toContainText(`@${hiker.username} suggested a change to`);
        await note.click();
        await expect(page).toHaveURL(/#comment-\d+$/);
        await page.getByTestId('comment').first().getByTestId('comment-reply').click();
        await page.getByTestId('reply-body').fill('Good call, ordering one.');
        await page.getByTestId('reply-submit').click();
        await expect(page.getByTestId('comment').nth(1)).toContainText('Author');
        await expect(page.getByTestId('comment').nth(1)).toContainText('Good call, ordering one.');

        const inbox = await (await hiker.page.request.get(url('/api/notifications'))).json();
        expect(inbox.unread).toBe(1);
        expect(inbox.items[0].kind).toBe('reply');
        expect(inbox.items[0].actor).toBe(owner.username);
        await hiker.context.close();
    });

    test('only published lists take comments; readers must sign in to post', async ({ page, browser }) => {
        const owner = generateTestUser('cmpriv');
        await registerUser(page, owner.username, owner.password, owner.email);
        await expect(page.getByTestId('item-row').first()).toBeVisible();
        const title = page.getByPlaceholder('Name your list', { exact: true });
        await title.fill('Unlisted');
        await title.blur();
        await page.getByText('Share', { exact: true }).hover();
        const shareInput = page.getByLabel('Share your list');
        await expect(shareInput).toHaveValue(/\/r\/[a-z0-9]+/, { timeout: 10000 });
        const link = await shareInput.inputValue();
        const id = link.split('/r/')[1];
        await expect.poll(async () => (await page.request.get(link)).status(), { timeout: 20000 }).toBe(200);
        await page.goto(link);
        await expect(page.locator('#wgComments')).toHaveCount(0);
        expect((await page.request.get(url(`/api/kits/${id}/comments`))).status()).toBe(404);
        expect((await page.request.post(url(`/api/kits/${id}/comments`), { data: { body: 'hi' } })).status()).toBe(404);

        await page.goto(url('/'));
        await expect(page.getByTestId('item-row').first()).toBeVisible();
        const publicLink = await publishList(page, { name: 'Open for comments', item: 'Quilt' });
        const context = await browser.newContext();
        const stranger = await context.newPage();
        await stranger.goto(publicLink);
        await stranger.locator('#wgComments').scrollIntoViewIfNeeded();
        await expect(stranger.getByTestId('comment-signin')).toBeVisible();
        await context.close();
    });

    test('reported comments can be hidden by a moderator; authors can delete their own', async ({ page, browser }, testInfo) => {
        const owner = generateTestUser('cmmod');
        await registerUser(page, owner.username, owner.password, owner.email);
        await expect(page.getByTestId('item-row').first()).toBeVisible();
        const link = await publishList(page, { name: 'Moderated kit', item: 'Tarp' });

        const troll = await newUser(browser, 'cmtrl');
        await troll.page.goto(link);
        await troll.page.locator('#wgComments').scrollIntoViewIfNeeded();
        await troll.page.getByTestId('comment-body').fill('Buy cheap pills at example.biz');
        await troll.page.getByTestId('comment-submit').click();
        await expect(troll.page.getByTestId('comment')).toHaveCount(1);
        await troll.page.getByTestId('comment-body').fill('Oops, double post');
        await troll.page.getByTestId('comment-submit').click();
        await expect(troll.page.getByTestId('comment')).toHaveCount(2);
        troll.page.once('dialog', (d) => d.accept());
        await troll.page.getByTestId('comment').nth(1).getByTestId('comment-delete').click();
        await expect(troll.page.getByTestId('comment').nth(1)).toContainText('This comment was deleted');

        const reader = await newUser(browser, 'cmrdr');
        await reader.page.goto(link);
        await reader.page.locator('#wgComments').scrollIntoViewIfNeeded();
        // A deleted comment with no replies is gone for everyone else.
        await expect(reader.page.getByTestId('comment')).toHaveCount(1);
        await reader.page.getByTestId('comment-report').click();
        await reader.page.getByTestId('report-reason').selectOption('Spam');
        await reader.page.getByTestId('report-submit').click();
        await expect(reader.page.getByTestId('comment-reported')).toBeVisible();

        // The site owner (a moderator) hides it from the moderation screen.
        const modContext = await browser.newContext();
        const mod = await modContext.newPage();
        const modName = `wge2eowner${testInfo.workerIndex}`;
        const reg = await mod.request.post(url('/register'), { data: { username: modName, email: `${modName}@example.com`, password: 'testtest' } });
        if (reg.status() !== 200) expect((await mod.request.post(url('/signin'), { data: { username: modName, password: 'testtest' } })).status()).toBe(200);
        await mod.goto(url('/moderation'));
        const queued = mod.getByTestId('reported-comment').filter({ hasText: 'Buy cheap pills' });
        await expect(queued).toContainText('Spam');
        await queued.getByTestId('report-hide').click();
        await expect(queued).toHaveCount(0);

        await reader.page.reload();
        await reader.page.locator('#wgComments').scrollIntoViewIfNeeded();
        await expect(reader.page.getByTestId('comment').first()).toContainText('Hidden by a moderator');
        await expect(reader.page.getByTestId('comment').first()).not.toContainText('cheap pills');

        for (const ctx of [troll.context, reader.context, modContext]) await ctx.close();
    });
});
