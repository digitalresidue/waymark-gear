import { test, expect } from '@playwright/test';

import { testRoot } from './utils';
import { registerUser, generateTestUser } from './auth-utils';

// Imperial or metric (client/utils/units.js): the browser's region by
// default, the footer picker or Your profile → Units to choose; a member's
// choice switches their lists too and follows them to another device.

const url = (p: string) => new URL(p, testRoot).toString();
const facts = (page) => page.locator('[data-testid="explore-item"] .wgGearCardFacts .wgMono');

test('visitors get their region\'s units, and the footer picker switches them', async ({ browser }) => {
    const uk = await (await browser.newContext({ locale: 'en-GB' })).newPage();
    await uk.goto(url('/explore/pack'));
    await expect(uk.locator('html')).toHaveAttribute('data-units', 'metric');
    await expect(uk.getByTestId('units-picker')).toHaveValue('metric');
    const first = facts(uk).first();
    if (await first.count()) {
        await expect(first).toHaveText(/\d (g|kg)$/);
    }

    // Imperial from the footer: the page comes back in oz/lb.
    await uk.getByTestId('units-picker').selectOption('imperial');
    await expect(uk.locator('html')).toHaveAttribute('data-units', 'imperial');
    if (await first.count()) {
        await expect(first).toHaveText(/\d (oz|lb)$/);
    }
    // The app pages follow the same choice.
    await uk.goto(url('/signin'));
    await expect(uk.getByTestId('units-picker')).toHaveValue('imperial');
    await uk.context().close();

    const us = await (await browser.newContext({ locale: 'en-US' })).newPage();
    await us.goto(url('/explore'));
    await expect(us.locator('html')).toHaveAttribute('data-units', 'imperial');
    await us.context().close();
});

test('a member switching to metric switches their lists, and it follows them', async ({ browser }) => {
    const page = await (await browser.newContext({ locale: 'en-US' })).newPage();
    const u = generateTestUser('units');
    await registerUser(page, u.username, u.password, u.email);
    const row = page.getByTestId('item-row').first();
    await expect(row).toBeVisible();
    const first = page.waitForResponse((r) => r.url().includes('saveLibrary') && r.status() === 200, { timeout: 20000 });
    await row.getByTestId('item-weight').fill('10');
    await first;
    await expect(row.locator('.lpUnitSelect .lpDisplay')).toHaveText('oz');

    // Profile → Units → Metric.
    await page.goto(url('/profile'));
    const saved = page.waitForResponse((r) => r.url().includes('saveLibrary') && r.status() === 200, { timeout: 20000 });
    await page.getByTestId('profile-units-select').selectOption('metric');
    await saved;
    await expect(page.locator('html')).toHaveAttribute('data-units', 'metric');

    // The list now shows grams; the weight is the same (10 oz = 283.5 g).
    await page.goto(url('/'));
    await expect(row.locator('.lpUnitSelect .lpDisplay')).toHaveText('g');
    await expect(row.getByTestId('item-weight')).toHaveValue(/^283\.5/);
    // Totals switch too (a new list totals in oz, so now g).
    await expect(page.locator('.lpTotalUnit .lpDisplay')).toHaveText('g');

    // Another device: signing in brings metric with it.
    const other = await (await browser.newContext({ locale: 'en-US' })).newPage();
    expect((await other.request.post(url('/signin'), { data: { username: u.username, password: u.password } })).status()).toBe(200);
    await other.goto(url('/explore'));
    await expect(other.locator('html')).toHaveAttribute('data-units', 'metric');
    await other.context().close();
    await page.context().close();
});
