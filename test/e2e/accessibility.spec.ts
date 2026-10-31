import { test, expect, Browser, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

import { testRoot } from './utils';

// Accessibility guard (WCAG 2.1 AA, checked with axe-core): the main page
// types in light and dark and on a phone must have no violations, and the
// keyboard basics must keep working. The full sweep across every page lives
// in a11y-audit.spec.ts (run by hand).

const url = (p: string) => new URL(p, testRoot).toString();
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function violations(page: Page, include?: string) {
    let axe = new AxeBuilder({ page }).withTags(TAGS);
    if (include) axe = axe.include(include);
    const r = await axe.analyze();
    return r.violations.map((v) => `${v.id}: ${v.help} → ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
}

async function signIn(browser: Browser, workerIndex: number) {
    const ctx = await browser.newContext();
    const username = `wge2eowner${workerIndex}`;
    const r = await ctx.request.post(url('/register'), { data: { username, email: `${username}@example.com`, password: 'testtest' } });
    if (r.status() !== 200) expect((await ctx.request.post(url('/signin'), { data: { username, password: 'testtest' } })).status()).toBe(200);
    return { ctx, username };
}

const PUBLIC = ['/welcome', '/explore', '/explore/pack', '/kits', '/trails/all', '/brands', '/reviews', '/signin', '/register', '/accessibility'];

for (const colorScheme of ['light', 'dark'] as const) {
    test(`public pages pass axe (${colorScheme})`, async ({ browser }) => {
        test.setTimeout(120_000);
        const page = await (await browser.newContext({ colorScheme })).newPage();
        const found: string[] = [];
        for (const p of PUBLIC) {
            await page.goto(url(p));
            await page.waitForLoadState('networkidle').catch(() => {});
            found.push(...(await violations(page)).map((v) => `${p} ${v}`));
        }
        expect(found).toEqual([]);
        await page.context().close();
    });
}

test('public pages pass axe on a phone and fit without sideways scrolling', async ({ browser }) => {
    test.setTimeout(120_000);
    const page = await (await browser.newContext({ viewport: { width: 320, height: 720 }, isMobile: true, hasTouch: true })).newPage();
    const found: string[] = [];
    for (const p of PUBLIC) {
        await page.goto(url(p));
        await page.waitForLoadState('networkidle').catch(() => {});
        found.push(...(await violations(page)).map((v) => `${p} ${v}`));
        const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (wide > 1) found.push(`${p} scrolls sideways by ${wide}px at 320px wide`);
    }
    expect(found).toEqual([]);
    await page.context().close();
});

test('signed-in pages pass axe in both themes', async ({ browser }, testInfo) => {
    test.setTimeout(120_000);
    const { ctx } = await signIn(browser, testInfo.workerIndex);
    const storageState = await ctx.storageState();
    await ctx.close();
    const found: string[] = [];
    for (const colorScheme of ['light', 'dark'] as const) {
        const page = await (await browser.newContext({ colorScheme, storageState })).newPage();
        for (const p of ['/', '/gear', '/pack', '/profile', '/trips', '/owner/catalog']) {
            await page.goto(url(p));
            await page.waitForLoadState('networkidle').catch(() => {});
            await page.waitForTimeout(300);
            found.push(...(await violations(page)).map((v) => `${p} [${colorScheme}] ${v}`));
        }
        await page.context().close();
    }
    expect(found).toEqual([]);
});

test('skip link: first Tab stop, lands on the main content', async ({ page }) => {
    for (const p of ['/explore', '/kits']) {
        await page.goto(url(p));
        await page.keyboard.press('Tab');
        const skip = page.getByText('Skip to content');
        await expect(skip).toBeFocused();
        await expect(skip).toBeInViewport();
        await page.keyboard.press('Enter');
        await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('main'))).toBe(true);
    }
});

test('editor menus and dialogs work from the keyboard', async ({ browser }, testInfo) => {
    const { ctx } = await signIn(browser, testInfo.workerIndex);
    const page = await ctx.newPage();
    await page.goto(url('/'));
    await expect(page.getByText('Add new category', { exact: true })).toBeVisible();

    // A closed menu is out of the tab order; Enter opens it, Escape closes it
    // and hands focus back.
    const share = page.locator('.lpTarget[role="button"]', { hasText: 'Share' }).first();
    await expect(page.locator('#lpListUrl')).toBeHidden();
    await share.focus();
    await expect(share).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('Enter');
    await expect(share).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#lpListUrl')).toBeVisible();
    expect(await violations(page, '.lpPopoverShown')).toEqual([]);
    await page.locator('#lpListUrl').focus();
    await page.keyboard.press('Escape');
    await expect(page.locator('#lpListUrl')).toBeHidden();
    await expect(share).toBeFocused();

    // Item controls written as links answer the keyboard.
    const remove = page.locator('.lpRemoveCategory').first();
    await expect(remove).toHaveAttribute('role', 'button');
    await expect(remove).toHaveAttribute('tabindex', '0');

    // A dialog takes focus, keeps it, and gives it back.
    const account = page.locator('.lpTarget[role="button"]', { has: page.getByTestId('header-avatar') }).first();
    await account.focus();
    await page.keyboard.press('Enter');
    const opener = page.locator('.lpPopoverShown').getByText('Help', { exact: true });
    await expect(opener).toBeVisible();
    await opener.focus();
    await expect(opener).toBeFocused();
    await page.keyboard.press('Enter');
    const dialog = page.locator('.lpModal[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('.lpModal'))).toBe(true);
    for (let i = 0; i < 15; i++) {
        await page.keyboard.press('Tab');
        expect(await page.evaluate(() => !!document.activeElement?.closest('.lpModal'))).toBe(true);
    }
    expect(await violations(page, '.lpModal')).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await ctx.close();
});
