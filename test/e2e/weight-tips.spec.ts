import { test, expect, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

import { registerUser, generateTestUser } from './auth-utils';
import { createCategory, addItem, markItemAsWorn, markItemAsConsumable } from './test-helpers';

// ⓘ tips beside Total, Consumable, Worn, Base weight and Total pack weight
// (client/utils/weight-terms.js): hover, keyboard focus and tap show them,
// Escape closes them, and screen readers hear them as the button's
// description.

const saved = (page: Page) => page.waitForResponse((r) => r.url().includes('saveLibrary') && r.status() === 200, { timeout: 20000 });

async function listWithBreakdown(page: Page) {
    const u = generateTestUser('tips');
    await registerUser(page, u.username, u.password, u.email);
    await expect(page.getByText('Add new category', { exact: true })).toBeVisible();
    const category = await createCategory(page, 'Kit');
    await addItem(category, 'Tent', { weight: '20' });
    await markItemAsWorn(await addItem(category, 'Shoes', { weight: '18' }));
    await markItemAsConsumable(await addItem(category, 'Food', { weight: '40' }));
}

test('editor: each total explains itself on hover, focus and tap', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await listWithBreakdown(page);
    const tip = (term: string) => page.locator('.lpTotals').getByTestId(`info-tip-${term}`);
    const text = async (term: string) => page.locator(`#${await tip(term).getAttribute('aria-describedby')}`);

    for (const term of ['total', 'consumable', 'worn', 'base']) await expect(tip(term)).toBeVisible();

    // Screen readers: "About base weight", described by the explanation.
    await expect(tip('base')).toHaveAccessibleName('About base weight');
    await expect(tip('base')).toHaveAccessibleDescription(/without food, water, fuel or anything worn/);

    // Hover shows it; the pointer can move onto the text and it stays.
    const base = await text('base');
    await expect(base).toBeHidden();
    await tip('base').hover();
    await expect(base).toBeVisible();
    await base.hover();
    await expect(base).toBeVisible();
    // Escape hides it even while hovered.
    await page.keyboard.press('Escape');
    await expect(base).toBeHidden();
    await page.mouse.move(5, 5);

    // Keyboard focus shows it; Escape hides it.
    const worn = await text('worn');
    await tip('worn').focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(worn).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(worn).toBeHidden();

    // A click (a tap on a touch screen) opens it; one elsewhere closes it.
    const consumable = await text('consumable');
    await tip('consumable').click();
    await expect(tip('consumable')).toHaveAttribute('aria-expanded', 'true');
    await page.mouse.move(5, 5);
    await expect(consumable).toBeVisible();
    await page.mouse.click(5, 300);
    await expect(consumable).toBeHidden();

    expect((await new AxeBuilder({ page }).include('.lpTotals').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
});

test('shared lists and the phone summary have the same tips', async ({ page, browser }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await listWithBreakdown(page);
    await page.getByText('Share', { exact: true }).first().hover();
    await expect(page.getByLabel('Share your list')).toHaveValue(/\/r\/[a-z0-9]+/, { timeout: 10000 });
    const link = await page.getByLabel('Share your list').inputValue();

    // The shared list (server-rendered): hover, tap and Escape.
    const viewer = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    // Once the worn and consumable marks have saved, there's a base weight.
    await expect.poll(async () => {
        await viewer.goto(link);
        return viewer.getByTestId('info-tip-base').count();
    }, { timeout: 20000 }).toBe(1);
    const tip = viewer.getByTestId('info-tip-base');
    await expect(tip).toHaveAccessibleName('About base weight');
    await expect(tip).toHaveAccessibleDescription(/usual number for comparing packs/);
    const text = viewer.locator('#wgTip-base');
    await tip.hover();
    await expect(text).toBeVisible();
    await viewer.keyboard.press('Escape');
    await expect(text).toBeHidden();
    await viewer.mouse.move(5, 5);
    await tip.click();
    await viewer.mouse.move(5, 5);
    await expect(text).toBeVisible();
    await viewer.mouse.click(5, 600);
    await expect(text).toBeHidden();
    await viewer.context().close();

    // The phone summary's legend.
    const done = saved(page).catch(() => {});
    await page.setViewportSize({ width: 390, height: 844 });
    await done;
    await page.getByTestId('summary-strip').click();
    const phoneTip = page.locator('.lpSummaryMobile').getByTestId('info-tip-base');
    await expect(phoneTip).toBeVisible();
    await phoneTip.tap().catch(() => phoneTip.click());
    await expect(page.locator(`#${await phoneTip.getAttribute('aria-describedby')}`)).toBeVisible();
});
