import { test, expect } from '@playwright/test';

import { testRoot } from './utils';
import { registerUser, generateTestUser } from './auth-utils';

// Languages (TRANSLATING.md): the browser's language by default, the footer
// picker or the profile setting to choose, and the choice following a member
// to another device.

const url = (p: string) => new URL(p, testRoot).toString();

test('a visitor gets their browser\'s language; English when we don\'t have it', async ({ browser }) => {
    const es = await (await browser.newContext({ locale: 'es-MX' })).newPage();
    const res = await es.goto(url('/explore'));
    expect(res!.headers().vary).toMatch(/Accept-Language/i);
    await expect(es.locator('html')).toHaveAttribute('lang', 'es');
    await expect(es.getByRole('heading', { level: 1 })).toHaveText('Explorar equipo');
    await expect(es.getByTestId('explore-section').first()).toContainText('Mochila');
    await expect(es.getByTestId('header-signin')).toHaveText('Iniciar sesión');
    await expect(es.getByTestId('language-picker')).toHaveValue('es');

    const tw = await (await browser.newContext({ locale: 'zh-TW' })).newPage();
    await tw.goto(url('/explore'));
    await expect(tw.locator('html')).toHaveAttribute('lang', 'en');
    await expect(tw.getByRole('heading', { level: 1 })).toHaveText('Explore gear');
    await es.context().close();
    await tw.context().close();
});

test('the footer picker switches the language and remembers it, on server pages and in the app', async ({ browser }) => {
    const page = await (await browser.newContext({ locale: 'en-US' })).newPage();
    await page.goto(url('/explore/sleep-system'));
    await page.getByTestId('language-picker').selectOption('de');
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    await expect(page.getByTestId('explore-filters-box').locator('summary')).toContainText('Filter');
    await expect(page.locator('#wgGearFilters legend').first()).toHaveText('Kategorie');
    // German plurals in the count, after filtering in the page.
    await expect(page.getByTestId('explore-count')).toContainText('Artikel');
    // The app (Vue) follows the same choice.
    await page.goto(url('/signin'));
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    await expect(page.locator('.wgAuthTitle')).toHaveText('Anmelden');
    await expect(page.getByPlaceholder('Benutzername')).toBeVisible();
    // ...and switches back from the app's own footer.
    await page.goto(url('/register'));
    await page.getByTestId('language-picker').selectOption('ja');
    await expect(page.locator('.wgAuthTitle')).toHaveText('アカウントを作成');
    await page.goto(url('/explore'));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('ギアを探す');
    await page.context().close();
});

test('a member\'s language follows them to another device, and cached pages keep each language apart', async ({ browser }) => {
    const page = await (await browser.newContext({ locale: 'en-US' })).newPage();
    const u = generateTestUser('lang');
    await registerUser(page, u.username, u.password, u.email);
    await expect(page.getByTestId('item-row').first()).toBeVisible();
    await expect(page.getByText('Add new category', { exact: true })).toBeVisible();

    // Profile → Language: the app switches at once.
    await page.goto(url('/profile'));
    await page.getByTestId('profile-language-select').selectOption('fr');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page.getByTestId('profile-language').locator('h2')).toHaveText('Langue');
    await page.goto(url('/'));
    await expect(page.getByText('Ajouter une catégorie', { exact: true })).toBeVisible();

    // A new device: sign in, and it's French there too.
    const other = await (await browser.newContext({ locale: 'en-US' })).newPage();
    expect((await other.request.post(url('/signin'), { data: { username: u.username, password: u.password } })).status()).toBe(200);
    await other.goto(url('/explore'));
    await expect(other.getByRole('heading', { level: 1 })).toHaveText("Explorer l'équipement");

    // The same cached page in two languages: a profile page, rendered once each.
    const visitorEs = await (await browser.newContext({ locale: 'es' })).newPage();
    const visitorEn = await (await browser.newContext({ locale: 'en' })).newPage();
    await visitorEs.goto(url(`/@${u.username}`));
    await visitorEn.goto(url(`/@${u.username}`));
    await visitorEs.goto(url(`/@${u.username}`));
    await expect(visitorEs.getByTestId('header-signin')).toHaveText('Iniciar sesión');
    await expect(visitorEn.getByTestId('header-signin')).toHaveText('Sign in');

    for (const p of [page, other, visitorEs, visitorEn]) await p.context().close();
});
