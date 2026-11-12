import { test, expect } from '@playwright/test';

import { testRoot } from './utils';
import { generateTestUser, openPage, fillRegisterForm } from './auth-utils';

// The homepage: rendered on the server for visitors, the app for members.

const url = (p: string) => new URL(p, testRoot).toString();

test('a visitor at / gets the server-rendered homepage, keywords in the headings', async ({ request }) => {
    const res = await request.get(url('/'));
    expect(res.status()).toBe(200);
    const html = await res.text();
    // In the HTML itself, not added by JavaScript: what a search engine reads.
    expect(html).toContain('<title>Backpacking Gear Lists, Ultralight to Traditional | Waymark Gear</title>');
    expect(html).toMatch(/<meta name="description" content="Build your backpacking gear list/);
    expect(html).toMatch(/<link rel="canonical" href="[^"]+\/">/);
    expect(html).toContain('Plan your backpacking gear, from traditional to super ultralight.');
    const h2s = [...html.matchAll(/<h2[^>]*>([^<]+)<\/h2>/g)].map((m) => m[1]);
    for (const words of ['Ultralight, super ultralight and traditional backpacking gear lists', 'Backpacking gear checklist', 'Backpacking gear lists by trail', 'Ultralight backpacking gear list FAQ']) {
        expect(h2s.some((h) => h.includes(words)), words).toBe(true);
    }
    // Structured data: valid JSON with the FAQ the page shows.
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json"[^>]*>([^<]+)<\/script>/)![1]);
    const faq = ld.find((d: { '@type': string }) => d['@type'] === 'FAQPage');
    expect(faq.mainEntity.length).toBeGreaterThanOrEqual(5);
    expect(html).toContain(faq.mainEntity[0].name);
});

test('the homepage sends visitors to sign up, with the email they typed', async ({ page }) => {
    await page.goto(url('/'));
    await expect(page.getByTestId('landing-h1')).toBeVisible();
    await expect(page.getByTestId('header-signup')).toHaveAttribute('href', '/register');
    await page.getByTestId('landing-email').fill('new.hiker@example.com');
    await page.getByTestId('landing-email-submit').click();
    await expect(page).toHaveURL(/\/register\?email=new\.hiker%40example\.com$/);
    await expect(page.getByTestId('register-form').getByPlaceholder('Email', { exact: true })).toHaveValue('new.hiker@example.com');
    // What an account gets you, beside the form.
    await expect(page.getByTestId('register-why')).toContainText('Things your old gear list never did for you');
});

test('a new account goes through the welcome steps, then / is their lists', async ({ page }) => {
    const u = generateTestUser('land');
    await openPage(page, 'register');
    await fillRegisterForm(page, u);
    await expect(page).toHaveURL(/\/start$/);
    // No Stripe in tests, so no offer: straight to the first pack.
    await expect(page.getByTestId('signup-offer')).toHaveCount(0);
    await expect(page.getByTestId('first-pack')).toBeVisible();
    await expect(page.getByTestId('start-import')).toHaveAttribute('href', '/?import=1');
    await page.getByTestId('start-blank').click();
    await expect(page.getByTestId('item-row').first()).toBeVisible();

    // Signed in, / is the app, on a fresh load too.
    await page.goto(url('/'));
    await expect(page.getByTestId('item-row').first()).toBeVisible();
    await expect(page.getByTestId('landing-h1')).toHaveCount(0);
});

test('lists kept in this browser without an account open at /, not the homepage', async ({ page }) => {
    await openPage(page, 'register');
    await page.getByText('Try it without an account', { exact: true }).click();
    await expect(page.getByText('Welcome to Waymark Gear!')).toBeVisible();
    await page.waitForFunction(() => {
        const store = (window as any).LighterPack && (window as any).LighterPack.$store;
        return store && store.state.library && typeof store.state.library.save === 'function';
    });
    await page.evaluate(() => {
        localStorage.library = JSON.stringify((window as any).LighterPack.$store.state.library.save());
        // As if this browser had never been told: the homepage notices.
        document.cookie = 'wg_local=; path=/; max-age=0';
    });
    await page.goto(url('/'));
    await expect(page.getByText('Welcome to Waymark Gear!')).toBeVisible();
    await expect(page.getByTestId('landing-h1')).toHaveCount(0);
});

test('/start sends anyone signed out to sign up', async ({ page }) => {
    await page.goto(url('/start'));
    await expect(page).toHaveURL(/\/register$/);
});

test('the sitemap lists the homepage', async ({ request }) => {
    const index = await (await request.get(url('/sitemap.xml'))).text();
    const files = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    const bodies = await Promise.all(files.map(async (f) => (await request.get(f.replace(/^https?:\/\/[^/]+/, testRoot.replace(/\/$/, '')))).text()));
    expect(bodies.some((b) => /<loc>[^<]+\/<\/loc>/.test(b))).toBe(true);
});
