import { test, expect, Browser, Page } from '@playwright/test';

import { testRoot } from './utils';
import { registerUser, generateTestUser } from './auth-utils';

// Follow (/follow, server/activity.js): a timeline of the hikers you follow.
// Owner only while it's tried out; the owner opens it to everyone.

const url = (p: string) => new URL(p, testRoot).toString();
const saved = (page: Page) => page.waitForResponse((r) => r.url().includes('saveLibrary') && r.status() === 200, { timeout: 20000 });

// One file, in order: the switch is site-wide.
test.describe.configure({ mode: 'serial' });

async function asOwner(browser: Browser, workerIndex: number) {
    const page = await (await browser.newContext()).newPage();
    const username = `wge2eowner${workerIndex}`;
    const r = await page.request.post(url('/register'), { data: { username, email: `${username}@example.com`, password: 'testtest' } });
    if (r.status() !== 200) expect((await page.request.post(url('/signin'), { data: { username, password: 'testtest' } })).status()).toBe(200);
    // Start each test with Follow closed to everyone else, following nobody
    // (the owner account is shared with other runs and tests).
    expect((await page.request.put(url('/api/owner/follow-feed'), { data: { open: false } })).status()).toBe(200);
    const { following } = await (await page.request.get(url('/api/following'))).json();
    for (const f of following) await page.request.delete(url(`/api/users/${f.username}/follow`));
    return page;
}

async function member(browser: Browser, prefix: string) {
    const page = await (await browser.newContext()).newPage();
    const u = generateTestUser(prefix);
    await registerUser(page, u.username, u.password, u.email);
    await expect(page.getByTestId('item-row').first()).toBeVisible();
    return { page, username: u.username };
}

test('only the owner has Follow, until the owner opens it to everyone', async ({ browser }, testInfo) => {
    const owner = await asOwner(browser, testInfo.workerIndex);
    const m = await member(browser, 'fwm');

    // The owner: in the menu, and the page works.
    await owner.goto(url('/follow'));
    await expect(owner.getByTestId('nav-follow')).toBeVisible();
    await expect(owner.getByTestId('follow-owner')).toContainText('Owner only');

    // A member: not in the menu, the API says there's nothing here.
    await m.page.goto(url('/kits'));
    await expect(m.page.locator('.wgSiteHeader')).toBeVisible();
    await expect(m.page.getByTestId('nav-follow')).toBeHidden();
    expect((await m.page.request.get(url('/api/activity'))).status()).toBe(404);
    await m.page.goto(url('/follow'));
    await expect(m.page.getByTestId('follow-unavailable')).toBeVisible();

    // Opened: everyone gets it.
    await owner.getByTestId('follow-stage-everyone').check();
    await expect(owner.getByTestId('follow-owner')).toContainText('Open to every member');
    expect((await m.page.request.get(url('/api/activity'))).status()).toBe(200);
    await m.page.goto(url('/follow'));
    await expect(m.page.getByTestId('nav-follow')).toBeVisible();
    await expect(m.page.getByTestId('follow-terms')).toBeVisible();

    await owner.request.put(url('/api/owner/follow-feed'), { data: { open: false } });
    expect((await m.page.request.get(url('/api/activity'))).status()).toBe(404);
});

test('Supporters first: early access for Supporters, before every member', async ({ browser }, testInfo) => {
    const owner = await asOwner(browser, testInfo.workerIndex);
    const m = await member(browser, 'fwe');

    await owner.goto(url('/follow'));
    await owner.getByTestId('follow-stage-supporters').check();
    await expect(owner.getByTestId('follow-owner')).toContainText('Early access for Supporters');

    // Not a Supporter: not yet.
    expect((await m.page.request.get(url('/api/activity'))).status()).toBe(404);

    // A Supporter: in, and told it's early.
    await m.page.goto(url('/supporter'));
    await m.page.getByTestId('supporter-monthly').click();
    await expect(m.page.getByTestId('supporter-welcome')).toBeVisible({ timeout: 20000 });
    expect((await m.page.request.get(url('/api/activity'))).status()).toBe(200);
    await m.page.goto(url('/follow'));
    await expect(m.page.getByTestId('nav-follow')).toBeVisible();
    await expect(m.page.getByTestId('follow-early')).toContainText("You're trying Follow before everyone else");

    await owner.request.put(url('/api/owner/follow-feed'), { data: { open: false } });
    expect((await m.page.request.get(url('/api/activity'))).status()).toBe(404);
});

test('the timeline shows the packs, gear changes and trips of people you follow, newest first', async ({ browser }, testInfo) => {
    test.setTimeout(120_000);
    const owner = await asOwner(browser, testInfo.workerIndex);
    const hiker = await member(browser, 'fwh');
    const tag = Date.now().toString(36);

    // The hiker publishes a list...
    const title = hiker.page.getByPlaceholder('Name your list', { exact: true });
    await title.fill(`PCT kit ${tag}`);
    await title.blur();
    const first = hiker.page.getByTestId('item-row').first();
    await first.getByPlaceholder('Name', { exact: true }).fill('Durston X-Mid 1');
    await first.getByTestId('item-weight').fill('28');
    await hiker.page.getByText('Share', { exact: true }).first().hover();
    await expect(hiker.page.getByLabel('Share your list')).toHaveValue(/\/r\/[a-z0-9]+/, { timeout: 10000 });
    let done = saved(hiker.page);
    await hiker.page.getByTestId('publish-toggle').check();
    await done;
    await hiker.page.mouse.move(5, 600);

    // ...then adds gear to it: a pack update.
    await hiker.page.locator('.lpAddItem').first().click();
    const second = hiker.page.getByTestId('item-row').nth(1);
    await second.getByPlaceholder('Name', { exact: true }).fill('Nitecore NU25');
    done = saved(hiker.page);
    await second.getByTestId('item-weight').fill('1');
    await done;

    // A public trip with a day written, and a private one.
    const trip = await (await hiker.page.request.post(url('/api/trips'), { data: { title: `Sierra loop ${tag}`, visibility: 'public', startDate: '2026-08-01' } })).json();
    expect((await hiker.page.request.post(url(`/api/trips/${trip.id}/entries`), { data: { title: 'Over Forester Pass', body: 'Snow at the top, sun on the way down.', date: '2026-08-02' } })).ok()).toBe(true);
    await hiker.page.request.post(url('/api/trips'), { data: { title: `Secret trip ${tag}`, visibility: 'private' } });

    // The owner finds the hiker on Discover and follows them.
    await owner.goto(url('/follow?tab=discover'));
    await owner.getByTestId('discover-search').fill(hiker.username);
    await owner.getByTestId('discover-search').press('Enter');
    await owner.getByTestId(`follow-${hiker.username}`).click();
    await expect(owner.getByTestId(`following-${hiker.username}`)).toBeVisible();

    // The timeline: newest first, all of it from the hiker.
    await owner.getByTestId('follow-tab-timeline').click();
    const items = owner.getByTestId('activity');
    await expect(items.first()).toBeVisible();
    const kinds = await items.evaluateAll((els) => els.map((e) => e.getAttribute('data-kind')));
    expect(kinds).toEqual(['entry', 'trip', 'pack', 'published']);
    await expect(owner.locator('[data-kind="published"]')).toContainText(`PCT kit ${tag}`);
    await expect(owner.locator('[data-kind="pack"]').getByTestId('activity-added')).toContainText('Nitecore NU25');
    await expect(owner.locator('[data-kind="pack"]').getByTestId('activity-weight')).toContainText('→');
    await expect(owner.locator('[data-kind="trip"]')).toContainText(`Sierra loop ${tag}`);
    await expect(owner.locator('[data-kind="entry"]')).toContainText('Over Forester Pass');
    await expect(owner.locator('#follow-panel-timeline')).not.toContainText('Secret trip');
    await expect(owner.locator('.wgFollowDayHead').first()).toHaveText('Today');

    // Making the trip private takes it off at once.
    await hiker.page.request.put(url(`/api/trips/${trip.id}`), { data: { title: `Sierra loop ${tag}`, visibility: 'private' } });
    const kindsNow = async () => (await (await owner.request.get(url('/api/activity'))).json()).items.map((i: { kind: string }) => i.kind);
    expect(await kindsNow()).toEqual(['pack', 'published']);

    // On their terms: the hiker keeps their updates out of timelines (once
    // Follow is open to them).
    await owner.request.put(url('/api/owner/follow-feed'), { data: { open: true } });
    expect((await hiker.page.request.put(url('/api/activity/settings'), { data: { shareActivity: false } })).status()).toBe(200);
    expect(await kindsNow()).toEqual([]);
    await hiker.page.request.put(url('/api/activity/settings'), { data: { shareActivity: true } });
    expect(await kindsNow()).toEqual(['pack', 'published']);
    await owner.request.put(url('/api/owner/follow-feed'), { data: { open: false } });

    // Unfollowing empties it.
    await owner.goto(url('/follow?tab=following'));
    await owner.getByTestId(`unfollow-${hiker.username}`).click();
    await expect(owner.getByTestId(`unfollow-${hiker.username}`)).toHaveCount(0);
    await expect.poll(kindsNow).toEqual([]);
});
