import { test, expect, Page, Browser } from '@playwright/test';

import { registerUser, generateTestUser, loginUser } from './auth-utils';
import { testRoot } from './utils';

// Phase 4: trip types, votes and leaderboards, follows and the notifications
// page, the shakedown board, gear details (closet categories, photos, review
// videos), print view, problem reports and tickets, account theme, tags.

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

async function nameListWithItem(page: Page, name: string, item: string, weight = '12') {
    const title = page.getByPlaceholder('Name your list', { exact: true });
    await title.fill(name);
    await title.blur();
    const row = page.getByTestId('item-row').first();
    await row.getByPlaceholder('Name', { exact: true }).fill(item);
    await row.getByTestId('item-weight').fill(weight);
}

async function publish(page: Page, { shakedown = false } = {}) {
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

test.describe('Phase 4', () => {
    test('trip types, votes, Explore filters and leaderboards', async ({ browser }) => {
        const owner = await newUser(browser, 'p4own');
        const name = `Thru kit ${Date.now()}`;
        await nameListWithItem(owner.page, name, 'Trail runners');
        let done = saved(owner.page);
        await owner.page.getByTestId('trip-type-thru').click();
        await done;
        await expect(owner.page.getByTestId('trip-type-thru')).toHaveAttribute('aria-pressed', 'true');
        const link = await publish(owner.page);
        const id = link.split('/r/')[1];
        expect((await owner.page.request.post(url(`/api/kits/${id}/vote`), { data: { value: 1 } })).status()).toBe(400);

        const voter = await newUser(browser, 'p4vot');
        await voter.page.goto(link);
        await expect(voter.page.getByTestId('share-trip-type')).toHaveText('Thru-hike');
        await expect(voter.page.getByTestId('vote-score')).toHaveText('0');
        await voter.page.getByTestId('vote-up').click();
        await expect(voter.page.getByTestId('vote-score')).toHaveText('1');
        await expect(voter.page.getByTestId('vote-up')).toHaveAttribute('aria-pressed', 'true');
        // Clicking again takes the vote back.
        await voter.page.getByTestId('vote-up').click();
        await expect(voter.page.getByTestId('vote-score')).toHaveText('0');
        await voter.page.getByTestId('vote-up').click();
        await expect(voter.page.getByTestId('vote-score')).toHaveText('1');

        const top = await (await voter.page.request.get(url(`/api/explore/kits?trip=thru&sort=top&q=${encodeURIComponent(name)}`))).json();
        expect(top.kits[0].score).toBe(1);
        expect(top.kits[0].tripType).toBe('thru');
        const other = await (await voter.page.request.get(url(`/api/explore/kits?trip=dayhike&q=${encodeURIComponent(name)}`))).json();
        expect(other.total).toBe(0);

        await voter.page.goto(url('/explore'));
        await voter.page.getByTestId('trip-filter-thru').click();
        await voter.page.getByTestId('explore-search').fill(name);
        await expect(voter.page.getByTestId('kit-card').filter({ hasText: name })).toContainText('Thru-hike');

        await voter.page.goto(url('/leaderboard'));
        await voter.page.getByTestId('board-thru').click();
        await expect(voter.page.getByTestId('board-light')).toContainText(name);
        await owner.context.close();
        await voter.context.close();
    });

    test('follow a hiker, see their new lists, and choose notifications', async ({ browser }) => {
        const author = await newUser(browser, 'p4aut');
        const fan = await newUser(browser, 'p4fan');

        await fan.page.goto(url(`/@${author.username}`));
        await fan.page.getByTestId('follow-button').click();
        await expect(fan.page.getByTestId('follow-button')).toHaveText(/Following/);
        await expect(fan.page.getByTestId('follower-count')).toHaveText('1 follower');

        const authorInbox = await (await author.page.request.get(url('/api/notifications'))).json();
        expect(authorInbox.items[0].kind).toBe('follow');
        expect(authorInbox.items[0].url).toBe(`/@${fan.username}`);

        const name = `Fresh list ${Date.now()}`;
        await nameListWithItem(author.page, name, 'Quilt');
        await publish(author.page);

        await expect.poll(async () => (await (await fan.page.request.get(url('/api/notifications'))).json()).items.map((n: any) => n.kind), { timeout: 10000 }).toContain('published');
        const feed = await (await fan.page.request.get(url('/api/explore/kits?following=1'))).json();
        expect(feed.kits.map((k: any) => k.name)).toContain(name);
        expect((await (await browser.newContext()).request.get(url('/api/explore/kits?following=1'))).status()).toBe(401);

        await fan.page.goto(url('/notifications'));
        await expect(fan.page.getByTestId('notice').first()).toContainText(`@${author.username} published ${name}`);
        await expect(fan.page.getByTestId('following-list')).toContainText(author.username);
        await fan.page.getByTestId('pref-published-app').uncheck();
        await fan.page.getByTestId('prefs-save').click();
        await expect(fan.page.getByTestId('prefs-saved')).toBeVisible();
        const settings = await (await fan.page.request.get(url('/api/notifications/settings'))).json();
        expect(settings.kinds.find((k: any) => k.kind === 'published').app).toBe(false);
        await author.context.close();
        await fan.context.close();
    });

    test('shakedown requests show on the homepage board', async ({ browser }) => {
        const asker = await newUser(browser, 'p4ask');
        const name = `Help me cut ${Date.now()}`;
        await nameListWithItem(asker.page, name, 'Big tent', '64');
        await publish(asker.page, { shakedown: true });
        const visitor = await (await browser.newContext()).newPage();
        await visitor.goto(url('/welcome'));
        const card = visitor.getByTestId('shakedown-card').filter({ hasText: name });
        await expect(card).toBeVisible();
        await expect(card).toContainText('No suggestions yet');
        await card.click();
        await expect(visitor).toHaveURL(/#wgComments$/);
        await asker.context.close();
    });

    test('gear details: closet category, photos and a review video, shown as links in a lightbox', async ({ browser }) => {
        const u = await newUser(browser, 'p4gear');
        const { page } = u;
        await nameListWithItem(page, 'Media kit', 'Puffy jacket');
        await page.getByTestId('item-row').first().hover();
        await page.getByTestId('item-details').first().click();
        await expect(page.getByTestId('gear-details')).toBeVisible();
        await page.getByTestId('gear-closet-category').fill('Insulation');
        await page.getByTestId('gear-photo-file').setInputFiles({ name: 'puffy.png', mimeType: 'image/png', buffer: PNG_40X30 });
        await expect(page.getByTestId('gear-photo-thumb')).toHaveCount(1);
        await page.getByTestId('gear-video-link').fill('https://example.com/not-a-video');
        await expect(page.getByTestId('gear-details-save')).toBeDisabled();
        await page.getByTestId('gear-video-link').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
        const done = saved(page);
        await page.getByTestId('gear-details-save').click();
        await done;
        await expect(page.getByTestId('item-details').first()).toHaveClass(/wgHasMedia/);

        // The closet can be filtered by its categories.
        await expect(page.getByTestId('closet-filter-Insulation')).toBeVisible();
        await page.getByTestId('closet-filter-Insulation').click();
        await expect(page.getByTestId('closet-item')).toHaveCount(1);

        const link = await publish(page);
        await page.goto(link);
        await page.getByTestId('item-photos').click();
        await expect(page.getByTestId('lightbox-photo')).toHaveAttribute('src', /_photo\.webp$/);
        await page.getByTestId('lightbox-close').click();
        await expect(page.getByTestId('lightbox')).toHaveCount(0);
        await page.getByTestId('item-video').click();
        await expect(page.getByTestId('lightbox-video')).toHaveAttribute('src', /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/);
        await expect(page.getByTestId('lightbox')).toContainText(/\d+ views? on Waymark Gear/);
        const csp = (await page.request.get(link)).headers()['content-security-policy'];
        expect(csp).toContain('frame-src https://www.youtube-nocookie.com');
        await u.context.close();
    });

    test('print view: a compact paper checklist', async ({ page }) => {
        const u = generateTestUser('p4prn');
        await registerUser(page, u.username, u.password, u.email);
        await expect(page.getByTestId('item-row').first()).toBeVisible();
        await nameListWithItem(page, 'Paper list', 'Headlamp', '3');
        await page.evaluate(() => { (window as any).printed = 0; window.print = () => { (window as any).printed += 1; }; });
        await page.getByTestId('open-print').click();
        await expect(page).toHaveURL(/\/print$/);
        await page.evaluate(() => { (window as any).printed = 0; window.print = () => { (window as any).printed += 1; }; });
        const sheet = page.getByTestId('print-sheet');
        await expect(sheet.getByRole('heading', { level: 1 })).toHaveText('Paper list');
        await expect(page.getByTestId('print-row')).toHaveCount(1);
        await expect(sheet).toContainText('Headlamp');
        await expect(sheet).not.toContainText('oz');
        await page.getByTestId('print-columns').selectOption('1');
        await page.getByTestId('print-now').click();
        expect(await page.evaluate(() => (window as any).printed)).toBe(1);
    });

    test('a problem report becomes a ticket staff can prioritize', async ({ page, browser }, testInfo) => {
        await page.goto(url('/report?kind=catalog&label=Zpacks%20Duplex'));
        await expect(page.getByTestId('report-kind')).toHaveValue('catalog');
        await expect(page.getByTestId('report-label')).toHaveValue('Zpacks Duplex');
        const marker = `Weight is wrong ${Date.now()}`;
        await page.getByTestId('report-body').fill(marker);
        await page.getByTestId('report-send').click();
        await expect(page.getByTestId('report-sent')).toContainText('Ticket #');

        expect((await page.request.get(url('/api/staff/tickets'))).status()).not.toBe(200);

        const staffContext = await browser.newContext();
        const staff = await staffContext.newPage();
        const name = `wge2eowner${testInfo.workerIndex}`;
        const reg = await staff.request.post(url('/register'), { data: { username: name, email: `${name}@example.com`, password: 'testtest' } });
        if (reg.status() !== 200) expect((await staff.request.post(url('/signin'), { data: { username: name, password: 'testtest' } })).status()).toBe(200);
        await staff.goto(url('/staff/tickets'));
        const ticket = staff.getByTestId('ticket').filter({ hasText: marker });
        await expect(ticket).toContainText('Gear catalog error');
        await ticket.getByTestId('ticket-priority').selectOption('urgent');
        await expect(ticket).toHaveClass(/wgPri-urgent/);
        const updated = staff.waitForResponse((r) => r.url().includes('/api/staff/tickets/') && r.status() === 200);
        await ticket.getByTestId('ticket-status').selectOption('resolved');
        await updated;
        await staff.reload();
        await expect(staff.getByTestId('ticket').filter({ hasText: marker })).toHaveCount(0);
        await staffContext.close();
    });

    test('theme choice follows the account to another browser; profile tags show publicly', async ({ page, browser }) => {
        const u = generateTestUser('p4thm');
        await registerUser(page, u.username, u.password, u.email);
        await expect(page.getByTestId('item-row').first()).toBeVisible();
        const before = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
        const want = before === 'dark' ? 'light' : 'dark';
        await page.getByTestId('account-menu').hover();
        const savedPref = page.waitForResponse((r) => r.url().includes('/api/preferences') && r.status() === 200);
        await page.getByTestId('dark-mode-toggle').click();
        await savedPref;

        // (Each account has one session, so do this before signing in elsewhere.)
        await page.goto(url('/profile'));
        await page.getByTestId('tag-thru-hiking').click();
        await page.getByTestId('tag-winter').click();
        await page.getByTestId('profile-custom-tags').fill('AT 2024, dog hiker');
        await page.getByTestId('profile-save').click();
        await expect(page.getByTestId('profile-saved')).toBeVisible();
        await page.goto(url(`/@${u.username}`));
        const tags = page.getByTestId('profile-tags');
        for (const t of ['thru-hiking', 'winter', 'AT 2024', 'dog hiker']) await expect(tags).toContainText(t);

        const other = await browser.newContext();
        const second = await other.newPage();
        await loginUser(second, u.username, u.password);
        await expect(second.getByTestId('item-row').first()).toBeVisible();
        await expect.poll(() => second.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe(want);
        await other.close();

    });
});
