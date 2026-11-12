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

test('a new account sees the one-time offer once, then its first pack; / is then their lists', async ({ page }) => {
    const u = generateTestUser('land');
    await openPage(page, 'register');
    // The sign-up page promises it, since the offer is set up.
    await expect(page.getByText("Next you'll see a welcome offer you won't get again")).toBeVisible();
    await fillRegisterForm(page, u);
    await expect(page).toHaveURL(/\/start$/);

    const offer = page.getByTestId('signup-offer');
    await expect(offer).toBeVisible();
    await expect(page.getByTestId('offer-price')).toHaveText('$24');
    await page.getByTestId('offer-monthly').click();
    await expect(page.getByTestId('offer-price')).toHaveText('$2.50');
    await expect(page.getByTestId('offer-claim')).toHaveText(/Claim \$2\.50 a month for life/);

    // No thanks: gone for good, even on coming back.
    await page.getByTestId('offer-skip').click();
    await expect(page.getByTestId('first-pack')).toBeVisible();
    await expect(page.getByTestId('start-import')).toHaveAttribute('href', '/?import=1');
    await page.reload();
    await expect(page.getByTestId('first-pack')).toBeVisible();
    await expect(offer).toHaveCount(0);
    expect((await (await page.request.get(url('/api/signup-offer'))).json()).open).toBe(false);

    await page.getByTestId('start-blank').click();
    await expect(page.getByTestId('item-row').first()).toBeVisible();
    // Signed in, / is the app, on a fresh load too.
    await page.goto(url('/'));
    await expect(page.getByTestId('item-row').first()).toBeVisible();
    await expect(page.getByTestId('landing-h1')).toHaveCount(0);
});

test('claiming the offer checks out at half price for life (the coupon), and makes them a Supporter', async ({ page }) => {
    const u = generateTestUser('offer');
    await openPage(page, 'register');
    await fillRegisterForm(page, u);
    await expect(page.getByTestId('signup-offer')).toBeVisible();

    // Note the checkout Stripe was asked for on the way through.
    let session = '';
    page.on('request', (r) => {
        const m = /\/pay\/(cs_[^/?#]+)/.exec(r.url());
        if (m) session = m[1];
    });
    await page.getByTestId('offer-claim').click();
    await expect(page).toHaveURL(/\/start\?supporter=1$/);
    await expect(page.getByTestId('start-supporter-thanks')).toBeVisible();
    await expect(page.getByTestId('first-pack')).toBeVisible();

    const made = await (await page.request.get(`http://127.0.0.1:3998/v1/checkout/sessions/${session}`, { headers: { Authorization: 'Bearer sk_test_fake' } })).json();
    expect(made.coupon).toBe('coupon_signup50');
    expect(made.price).toBe('price_year');
    await expect.poll(async () => (await (await page.request.get(url('/api/plan'))).json()).supporter).toBe(true);
    // A Supporter is never offered it again.
    expect((await (await page.request.get(url('/api/signup-offer'))).json()).open).toBe(false);
});

test('an account that already existed is never offered it', async ({ page }) => {
    const u = generateTestUser('old');
    expect((await page.request.post(url('/register'), { data: u })).status()).toBe(200);
    // Opened while signed in, the checkout refuses without an open offer.
    const res = await page.request.post(url('/api/signup-offer/skip'), { data: {} });
    expect(res.status()).toBe(200);
    const checkout = await page.request.post(url('/api/signup-offer/checkout'), { data: { interval: 'month' } });
    expect(checkout.status()).toBe(410);
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
