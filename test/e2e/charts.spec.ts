import { test, expect, Page } from '@playwright/test';

import { registerUser, generateTestUser } from './auth-utils';
import { addItem } from './test-helpers';

// The weight chart's style (client/charts.js): donut, bars or treemap. The
// choice follows the account and carries over to shared lists in the same
// browser; other visitors see the donut until they pick.

const saved = (page: Page) => page.waitForResponse((r) => r.url().includes('saveLibrary') && r.status() === 200, { timeout: 20000 });

test.describe('Chart styles', () => {
    test('pick bars or a treemap; it sticks, and shared lists use it', async ({ page, browser }) => {
        const u = generateTestUser('chart');
        await registerUser(page, u.username, u.password, u.email);
        await expect(page.getByTestId('item-row').first()).toBeVisible();
        // Weight in two categories, so there's something to draw.
        let done = saved(page);
        await addItem(page.getByTestId('category').first(), 'Tent', { weight: '28', unit: 'oz' });
        await done;
        const chart = page.getByTestId('chart').first();
        await expect(chart).toHaveAttribute('data-style', 'donut');
        await expect(chart.locator('canvas')).toBeVisible();

        done = saved(page);
        await page.getByTestId('chart-style-bars').first().click();
        await done;
        await expect(chart).toHaveAttribute('data-style', 'bars');
        await expect(chart.locator('.wgChartBar').first()).toBeVisible();
        await expect(page.getByTestId('chart-style-bars').first()).toHaveAttribute('aria-pressed', 'true');

        // Treemap: tiles; a tile opens to that category's items, and back.
        done = saved(page);
        await page.getByTestId('chart-style-treemap').first().click();
        await done;
        await chart.locator('.wgChartTile').first().click();
        await expect(chart.locator('.wgChartBack')).toBeVisible();
        await chart.locator('.wgChartBack').click();
        await expect(chart.locator('.wgChartBack')).toHaveCount(0);

        // It sticks.
        await page.reload();
        await expect(page.getByTestId('chart').first()).toHaveAttribute('data-style', 'treemap');

        // A shared list, in the same browser, draws the same way.
        // Opening Share makes the link, and saves it.
        done = saved(page);
        await page.getByText('Share', { exact: true }).hover();
        const shareInput = page.getByLabel('Share your list');
        await expect(shareInput).toHaveValue(/\/r\/[a-z0-9]+/, { timeout: 10000 });
        const link = await shareInput.inputValue();
        await done;
        await page.goto(link);
        await expect(page.getByTestId('chart')).toHaveAttribute('data-style', 'treemap');
        // And can be switched there too.
        await page.getByTestId('chart-style-bars').click();
        await expect(page.getByTestId('chart')).toHaveAttribute('data-style', 'bars');

        // Someone else sees the donut.
        const other = await browser.newPage();
        await other.goto(link);
        await expect(other.getByTestId('chart')).toHaveAttribute('data-style', 'donut');
        await other.close();
    });
});
