import { test, expect, Browser, BrowserContextOptions } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'fs';

import { testRoot } from './utils';
import { createCategory, addItem } from './test-helpers';

// Full accessibility sweep (WCAG 2.1 AA via axe): every page type, light and
// dark, desktop and phone, signed out and in. Writes test-results/a11y.json.
// Run by hand: A11Y_AUDIT=1 npx playwright test a11y-audit --project=chromium

test.skip(!process.env.A11Y_AUDIT, 'audit runs on request');
test.setTimeout(900_000);

const url = (p: string) => new URL(p, testRoot).toString();
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

type Hit = { page: string; variant: string; id: string; impact: string; help: string; targets: string[] };

async function scan(browser: Browser, opts: BrowserContextOptions, pages: string[], variant: string, hits: Hit[]) {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    for (const p of pages) {
        await page.goto(url(p));
        await page.waitForLoadState('networkidle').catch(() => {});
        await page.waitForTimeout(400);
        const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
        // Keyboard: every stop shows where focus is.
        await page.mouse.click(1, 1).catch(() => {});
        for (let i = 0; i < 40; i++) {
            await page.keyboard.press('Tab');
            const f = await page.evaluate(() => {
                const el = document.activeElement as HTMLElement | null;
                if (!el || el === document.body) return null;
                const cs = getComputedStyle(el);
                const shows = (s: CSSStyleDeclaration) => (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== 'none';
                // A transparent control over a swatch shows its focus on the wrapper.
                const ring = shows(cs) || (cs.opacity === '0' && !!el.parentElement && shows(getComputedStyle(el.parentElement)));
                // A date field's own picker button holds focus inside its shadow root.
                if (!el.matches(':focus')) return null;
                const r = el.getBoundingClientRect();
                const desc = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '') + ' "' + (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30) + '"';
                return { ring, desc, hidden: r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || (cs.opacity === '0' && !ring) };
            });
            if (f && (!f.ring || f.hidden)) hits.push({ page: p, variant, id: f.hidden ? 'focus-on-hidden' : 'focus-not-visible', impact: 'serious', help: 'Keyboard focus', targets: [f.desc] });
        }
        for (const v of r.violations) {
            hits.push({ page: p, variant, id: v.id, impact: v.impact || '', help: v.help, targets: v.nodes.slice(0, 6).map((n) => `${n.target.join(' ')} :: ${(n.failureSummary || '').split('\n').slice(1, 2).join('')}`) });
        }
    }
    await ctx.close();
}

test('accessibility audit', async ({ browser }, testInfo) => {
    // Seed: an account with a shared list and some catalog gear.
    const setup = await browser.newPage();
    // An admin account (see playwright.config), so the owner pages open too.
    const username = `wge2eowner${testInfo.workerIndex}`;
    if ((await setup.request.post(url('/register'), { data: { username, email: `${username}@example.com`, password: 'testtest' } })).status() !== 200) {
        expect((await setup.request.post(url('/signin'), { data: { username, password: 'testtest' } })).status()).toBe(200);
    }
    await setup.goto(url('/'));
    await expect(setup.getByText('Add new category', { exact: true })).toBeVisible();
    await setup.getByPlaceholder('Name your list', { exact: true }).fill('Audit list');
    await setup.getByPlaceholder('Name your list', { exact: true }).blur();
    const cat = await createCategory(setup, 'Shelter');
    await addItem(cat, 'Tent', { weight: '20' });
    await setup.getByText('Share', { exact: true }).hover();
    const share = await setup.getByLabel('Share your list').inputValue();
    const rid = share.split('/r/')[1];
    await expect.poll(async () => (await setup.request.get(share)).status(), { timeout: 30_000 }).toBe(200);
    const brand = `A11y${Date.now().toString(36)}`;
    const csv = ['sku,name,brand,category,weight,unit,price,status,volume,strap_type,frame',
        `${brand}-1,Audit pack,${brand},Packs,20,oz,250,published,40 L,J-curve,Frameless`].join('\n');
    expect((await setup.request.post(url('/api/admin/catalog/import/apply'), { data: { csv } })).ok()).toBe(true);
    const gear = (await (await setup.request.get(url(`/api/catalog?q=${brand}`))).json()).items[0];
    const storage = await setup.context().storageState();
    await setup.close();

    const publicPages = ['/welcome', '/explore', '/explore/pack', `/g/${gear.id}`, '/kits', `/r/${rid}`, '/trails', '/trails/all', '/trails/pct', '/brands', '/reviews',
        `/@${username}`, '/signin', '/register', '/forgot-password', '/privacy', '/terms', '/developers', '/supporter', '/leaderboard', '/compare'];
    const privatePages = ['/', '/gear', '/pack', '/profile', '/notifications', '/trips', '/report', '/owner/catalog', '/owner/kits', '/owner/trails', '/owner/brands', '/owner/revenue', '/moderation', '/staff/tickets'];

    const hits: Hit[] = [];
    const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
    await scan(browser, { colorScheme: 'light' }, publicPages, 'light desktop', hits);
    await scan(browser, { colorScheme: 'dark' }, publicPages, 'dark desktop', hits);
    await scan(browser, { colorScheme: 'light', ...phone }, publicPages, 'light phone', hits);
    await scan(browser, { colorScheme: 'light', storageState: storage }, [...privatePages, ...publicPages.slice(0, 6)], 'light signed-in', hits);
    await scan(browser, { colorScheme: 'dark', storageState: storage }, privatePages, 'dark signed-in', hits);
    // Menus and dialogs, opened from the keyboard, scanned while open.
    const ctx = await browser.newContext({ storageState: storage });
    const page = await ctx.newPage();
    await page.goto(url('/'));
    await expect(page.getByText('Add new category', { exact: true })).toBeVisible();
    for (const name of ['Share', 'Settings']) {
        const target = page.locator('.lpTarget[role="button"]', { hasText: name }).first();
        if (!(await target.count())) { hits.push({ page: '/', variant: 'menu', id: 'menu-missing', impact: 'serious', help: name, targets: [] }); continue; }
        await target.focus();
        await page.keyboard.press('Enter');
        await expect(page.locator('.lpPopoverShown')).toHaveCount(1);
        const r = await new AxeBuilder({ page }).include('.lpPopoverShown').withTags(TAGS).analyze();
        for (const v of r.violations) hits.push({ page: '/', variant: `${name} menu`, id: v.id, impact: v.impact || '', help: v.help, targets: v.nodes.slice(0, 6).map((n) => n.target.join(' ')) });
        await page.keyboard.press('Escape');
        await expect(page.locator('.lpPopoverShown')).toHaveCount(0);
    }
    for (const [label, opener] of [['Help', 'Help'], ['Account', 'Account settings']]) {
        await page.goto(url('/'));
        await page.getByTestId('header-avatar').click().catch(() => {});
        const item = page.getByText(opener, { exact: true }).first();
        if (!(await item.isVisible().catch(() => false))) continue;
        await item.click();
        const dlg = page.locator('.lpModal[role="dialog"]');
        await expect(dlg).toBeVisible();
        const r = await new AxeBuilder({ page }).include('.lpModal').withTags(TAGS).analyze();
        for (const v of r.violations) hits.push({ page: '/', variant: `${label} dialog`, id: v.id, impact: v.impact || '', help: v.help, targets: v.nodes.slice(0, 6).map((n) => n.target.join(' ')) });
        const inside = await page.evaluate(() => !!document.activeElement?.closest('.lpModal'));
        if (!inside) hits.push({ page: '/', variant: `${label} dialog`, id: 'dialog-focus', impact: 'serious', help: 'Focus moves into the dialog', targets: [] });
        await page.keyboard.press('Escape');
    }
    await ctx.close();
    fs.writeFileSync('test-results/a11y.json', JSON.stringify(hits, null, 1));
});
