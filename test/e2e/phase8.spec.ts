import { test, expect, Page, Browser } from '@playwright/test';

import { registerUser, generateTestUser } from './auth-utils';
import { testRoot } from './utils';

// Phase 8: trails (tagging lists, the Trails page and picker, the owner's
// suggestion queue) and the phone menus.

const url = (p: string) => new URL(p, testRoot).toString();
const saved = (page: Page) => page.waitForResponse((r) => r.url().includes('saveLibrary') && r.status() === 200, { timeout: 20000 });

async function newUser(browser: Browser, prefix: string, options = {}) {
    const context = await browser.newContext(options);
    const page = await context.newPage();
    const u = generateTestUser(prefix);
    await registerUser(page, u.username, u.password, u.email);
    await expect(page.getByTestId('item-row').first()).toBeVisible();
    return { context, page, ...u };
}

async function nameList(page: Page, name: string, item = 'Quilt') {
    const title = page.getByPlaceholder('Name your list', { exact: true });
    let done = saved(page);
    await title.fill(name);
    await title.blur();
    await done;
    const row = page.getByTestId('item-row').first();
    done = saved(page);
    await row.getByPlaceholder('Name', { exact: true }).fill(item);
    await row.getByTestId('item-weight').fill('20');
    await done;
}

async function publish(page: Page) {
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

test.describe('Phase 8: trails', () => {
    test('a list named for a trail gets tagged in one tap, and shows up on that trail', async ({ browser }) => {
        const u = await newUser(browser, 'p8tag');
        const { page } = u;
        const listName = `PCT 2026 plan ${Date.now()}`;
        await nameList(page, listName, 'Duplex tent');

        // "PCT" in the name: the editor offers the tag, with the year.
        const suggest = page.getByTestId('trail-tag-suggest');
        await expect(suggest).toHaveText(/Tag as PCT/);
        let done = saved(page);
        await suggest.click();
        await done;
        await expect(page.getByTestId('trail-tag-name').or(page.getByTestId('trail-tag-link'))).toHaveText('Pacific Crest Trail');
        await expect(page.getByTestId('trail-tag-year')).toHaveValue('2026');
        done = saved(page);
        await page.getByTestId('trail-tag-direction').selectOption('nobo');
        await done;

        const link = await publish(page);

        // The shared list links to the trail.
        await page.goto(link);
        await expect(page.getByTestId('share-trail')).toHaveText('PCT 2026 NOBO');
        await page.getByTestId('share-trail').click();
        await expect(page).toHaveURL(/\/trails\/pct$/);
        await expect(page.getByTestId('trail-name')).toHaveText('Pacific Crest Trail');
        await expect(page.getByTestId('trail-pack').filter({ hasText: listName })).toContainText('2026 NOBO');
        await page.getByTestId('trail-sort-year').click();
        await expect(page.getByTestId('trail-pack').filter({ hasText: listName })).toBeVisible();

        // And it's yours: a starred chip.
        await page.goto(url('/trails/at'));
        await expect(page.getByTestId('trail-chip-pct')).toHaveClass(/wgTrailChipMine/);

        // After a reload the tag is still there, now linked to the trail page.
        await page.goto(url('/'));
        await expect(page.getByTestId('trail-tag-link')).toHaveAttribute('href', '/trails/pct');
        await u.context.close();
    });

    test('the picker switches trails in place, and search reaches every trail', async ({ page }) => {
        await page.goto(url('/trails/pct'));
        await expect(page.getByTestId('trails-heading')).toContainText('PCT');
        // Mark the page: a full reload would lose it.
        await page.evaluate(() => { (window as any).stayed = true; });

        await page.getByTestId('trail-chip-at').click();
        await expect(page).toHaveURL(/\/trails\/at$/);
        await expect(page.getByTestId('trail-name')).toHaveText('Appalachian Trail');
        await expect(page.getByTestId('trails-heading')).toContainText('AT');
        await expect(page.getByTestId('trail-chip-at')).toHaveAttribute('aria-current', 'true');
        expect(await page.evaluate(() => (window as any).stayed)).toBe(true);

        // Search by a place, not just a name.
        await page.getByTestId('trail-search').fill('corsica');
        await expect(page.getByTestId('trail-result').first()).toContainText('GR20');
        await page.getByTestId('trail-search').fill('colorado');
        await page.getByTestId('trail-result').filter({ hasText: 'Colorado Trail' }).click();
        await expect(page).toHaveURL(/\/trails\/colorado-trail$/);
        await expect(page.getByTestId('trail-name')).toHaveText('Colorado Trail');
        await expect(page.getByTestId('trail-chip-colorado-trail')).toHaveAttribute('aria-current', 'true');
        expect(await page.evaluate(() => (window as any).stayed)).toBe(true);

        // Back goes back.
        await page.goBack();
        await expect(page.getByTestId('trail-name')).toHaveText('Appalachian Trail');

        // Every trail, for browsing.
        await page.goto(url('/trails/all?q=pyrenees'));
        // Pyrenees: trails in Spain and France, in two groups.
        await expect(page.getByTestId('trail-directory')).toHaveCount(2);
        await expect(page.locator('main')).toContainText('GR11');
        await expect(page.locator('main')).toContainText('Haute Randonnée Pyrénéenne');
        await expect(page.locator('main')).not.toContainText('Appalachian');
        expect((await page.request.get(url('/trails?t=jmt'), { maxRedirects: 0 })).headers().location).toBe('/trails/jmt');
        expect((await page.request.get(url('/trails/no-such-trail'))).status()).toBe(404);
    });

    test('a trail hikers type that we don\'t have goes to the owner, who adds it', async ({ browser }, testInfo) => {
        const tag = `${Date.now().toString(36)}`;
        const typed = `Zigzag Ridge Loop ${tag}`;
        const u = await newUser(browser, 'p8sug');
        await nameList(u.page, `Weekend ${tag}`);
        await u.page.getByTestId('trail-tag-input').fill(typed);
        await expect(u.page.getByTestId('trail-tag-own')).toContainText(typed);
        const done = saved(u.page);
        await u.page.getByTestId('trail-tag-own').click();
        await done;
        await expect(u.page.getByTestId('trail-tag-name')).toHaveText(typed);
        await publish(u.page);

        const oc = await browser.newContext();
        const owner = await oc.newPage();
        const username = `wge2eowner${testInfo.workerIndex}`;
        const r = await owner.request.post(url('/register'), { data: { username, email: `${username}@example.com`, password: 'testtest' } });
        if (r.status() !== 200) expect((await owner.request.post(url('/signin'), { data: { username, password: 'testtest' } })).status()).toBe(200);
        await owner.goto(url('/owner/trails'));
        const row = owner.getByTestId('trail-suggestion').filter({ hasText: typed });
        await expect(row).toContainText('1 hiker');
        await row.getByTestId('suggestion-approve').click();
        await owner.getByTestId('trail-form-name').fill(`Zigzag Ridge ${tag}`);
        await owner.getByTestId('trail-form-short').fill(`ZR${tag}`.slice(0, 18));
        await owner.getByTestId('trail-form-save').click();
        await expect(owner.getByTestId('trails-notice')).toContainText(`Zigzag Ridge ${tag}`);
        await expect(owner.getByTestId('trail-suggestion').filter({ hasText: typed })).toHaveCount(0);

        // The hiker's published list now counts toward the new trail.
        const slug = `zr${tag}`.slice(0, 18).toLowerCase();
        await owner.goto(url(`/trails/${slug}`));
        await expect(owner.getByTestId('trail-name')).toHaveText(`Zigzag Ridge ${tag}`);
        await expect(owner.getByTestId('trail-packs')).toHaveText('1');
        for (const c of [u.context, oc]) await c.close();
    });
});

test.describe('Phase 8: phone menus', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test('one header row with a menu, in the app and on public pages', async ({ page }) => {
        await page.goto(url('/explore'));
        const header = page.locator('.wgSiteHeader');
        const box = await header.boundingBox();
        expect(box!.height).toBeLessThan(70);
        // The logo shrinks without squashing: same 843:127 ratio.
        const ratio = async (sel: string) => page.locator(sel).locator('visible=true').first().evaluate((e) => { const r = e.getBoundingClientRect(); return r.width / r.height; });
        expect(await ratio('.wgSiteHeader .wgLogo')).toBeCloseTo(843 / 127, 1);
        await expect(page.getByTestId('header-signin')).toBeHidden();
        await expect(page.getByTestId('nav-leaderboard')).toBeHidden();
        await page.getByTestId('site-menu').click();
        // On a phone the dropdowns open out as labelled sections.
        await expect(page.getByTestId('nav-leaderboard')).toBeVisible();
        await expect(page.getByTestId('menu-signin')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.getByTestId('nav-leaderboard')).toBeHidden();
        await page.getByTestId('site-menu').click();
        await page.getByTestId('nav-leaderboard').click();
        await expect(page).toHaveURL(/\/leaderboard$/);
        await expect(page.getByTestId('nav-leaderboard')).toBeHidden();

        // The server-rendered Trails page has the same header and menu.
        await page.goto(url('/trails/pct'));
        const bar = await page.locator('.wgSiteHeader').boundingBox();
        expect(bar!.height).toBeLessThan(70);
        expect(await ratio('.wgSiteHeader .wgLogo')).toBeCloseTo(843 / 127, 1);
        await page.getByTestId('site-menu').click();
        await expect(page.getByTestId('nav-kits')).toBeVisible();
        await expect(page.getByTestId('menu-signin')).toBeVisible();
        await page.mouse.click(200, 760);
        await expect(page.getByTestId('nav-kits')).toBeHidden();
        // Against the 390px screen, not window.innerWidth: Chromium's phone
        // emulation zooms out to fit wide content, which would hide overflow.
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    });
});
