import { test, expect, Page } from '@playwright/test';

import { testRoot } from './utils';

// "Find us" in the site footer: the same three accounts on the app's pages
// and on pages the server renders.

const url = (p: string) => new URL(p, testRoot).toString();
const ACCOUNTS = [
    ['Waymark Gear group on Facebook', 'https://facebook.com/groups/waymarkgear/'],
    ['Waymark Gear on YouTube', 'https://www.youtube.com/@WaymarkGear'],
    ['Waymark Gear on Instagram', 'https://instagram.com/waymarkgear'],
];

async function check(page: Page) {
    const social = page.getByTestId('footer-social');
    await social.scrollIntoViewIfNeeded();
    await expect(social).toContainText('Find us');
    const links = social.getByTestId('footer-social-link');
    await expect(links).toHaveCount(ACCOUNTS.length);
    for (const [i, [label, href]] of ACCOUNTS.entries()) {
        await expect(links.nth(i)).toHaveAttribute('href', href);
        await expect(links.nth(i)).toHaveAttribute('aria-label', label);
        await expect(links.nth(i)).toHaveAttribute('target', '_blank');
        await expect(links.nth(i)).toHaveAttribute('rel', /noopener/);
        await expect(links.nth(i).locator('svg')).toBeVisible();
    }
}

test('the footer links to Waymark on Facebook, YouTube and Instagram, on app and server pages', async ({ page }) => {
    await page.goto(url('/welcome'));
    await check(page);
    await page.goto(url('/trails/all'));
    await check(page);
});
