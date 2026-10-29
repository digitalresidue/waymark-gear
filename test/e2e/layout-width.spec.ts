import { test, expect } from '@playwright/test';

import { registerUser, generateTestUser } from './auth-utils';
import { testRoot } from './utils';

// The site column is 1366px; the editor's side panel is 380px wide on a big
// screen; rows of chips that scroll sideways say so.

test('a 1366px site, a roomy side panel, and chip rows that show they scroll', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    const u = generateTestUser('width');
    await registerUser(page, u.username, u.password, u.email);
    await expect(page.getByTestId('item-row').first()).toBeVisible();

    const header = (await page.locator('.wgSiteHeaderInner').boundingBox())!;
    expect(Math.round(header.width)).toBe(1366);

    await page.getByTestId('rail-catalog').click();
    const panel = page.locator('.wgSidebarPanel');
    await expect(page.getByTestId('panel-catalog')).toBeVisible();
    expect(Math.round((await panel.boundingBox())!.width)).toBe(380);

    // Catalog categories in one row: if it overflows, the › button shows,
    // and it scrolls the row.
    const chips = page.getByTestId('catalog-panel-chips');
    await expect(chips).toBeVisible();
    const overflows = await chips.evaluate((el) => el.scrollWidth > el.clientWidth + 2);
    const more = page.getByTestId('panel-catalog').getByTestId('scroll-more');
    if (overflows) {
        await expect(more).toBeVisible();
        await more.click();
        await expect.poll(() => chips.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
        await expect(page.getByTestId('panel-catalog').getByRole('button', { name: 'Scroll left' })).toBeVisible();
    } else {
        await expect(more).toBeHidden();
    }

    // Same column on a server page.
    await page.goto(new URL('/brands', testRoot).toString());
    expect(Math.round((await page.locator('.wgSiteHeaderInner').boundingBox())!.width)).toBe(1366);
});

test('phone: the Trails chips show a › when there are more', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(new URL('/trails/pct', testRoot).toString());
    const row = page.locator('.wgTrailPicker .wgScrollRow');
    await expect(row).toBeVisible();
    const overflows = await page.locator('.wgTrailChips').evaluate((el) => el.scrollWidth > el.clientWidth + 2);
    if (overflows) await expect(row.locator('.wgScrollBtnRight')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('wide pages share the header\'s column: Trails, all trails, Compare, Brands, profiles', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    const kits = await (await page.request.get(new URL('/api/explore/kits?limit=1', testRoot).toString())).json();
    const pages = ['/trails/pct', '/trails/all', '/compare', '/brands'];
    if (kits.kits[0]) pages.push(`/@${kits.kits[0].username}`);
    for (const p of pages) {
        await page.goto(new URL(p, testRoot).toString());
        const e = await page.evaluate(() => {
            const edges = (el: Element) => {
                const b = el.getBoundingClientRect();
                const cs = getComputedStyle(el);
                return [Math.round(b.left + parseFloat(cs.paddingLeft)), Math.round(b.right - parseFloat(cs.paddingRight))];
            };
            return { header: edges(document.querySelector('.wgSiteHeaderInner')!), main: edges(document.querySelector('main')!) };
        });
        expect(e.main, p).toEqual(e.header);
    }
});
