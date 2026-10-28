import { test, expect, Browser } from '@playwright/test';

import { registerUser, generateTestUser } from './auth-utils';
import { testRoot } from './utils';

// The Brands directory (/brands) and Owner → Brands.

const url = (p: string) => new URL(p, testRoot).toString();
// A valid 8x8 png (see image-upload.spec.ts).
const PNG_8X8 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAD0lEQVR4nGM4gwMwDC0JAMg9mQEkEhIxAAAAAElFTkSuQmCC', 'base64');

async function owner(browser: Browser, workerIndex: number) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const username = `wge2eowner${workerIndex}`;
    const r = await page.request.post(url('/register'), { data: { username, email: `${username}@example.com`, password: 'testtest' } });
    if (r.status() !== 200) expect((await page.request.post(url('/signin'), { data: { username, password: 'testtest' } })).status()).toBe(200);
    return { context, page };
}

test.describe('Brands', () => {
    test('the owner adds brands; people find them by name, cottage and gear type; Visit uses the affiliate link', async ({ browser }, testInfo) => {
        test.setTimeout(60000);
        const o = await owner(browser, testInfo.workerIndex);
        const tag = `b${Date.now().toString(36)}`;

        // One through the editor, with an uploaded logo.
        await o.page.goto(url('/owner/brands'));
        await o.page.getByTestId('brand-add').click();
        await o.page.getByTestId('brand-form-name').fill(`Ridgeline ${tag}`);
        await o.page.getByTestId('brand-form-logo-file').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG_8X8 });
        await expect(o.page.getByTestId('brand-form-logo-preview')).toHaveAttribute('src', /_photo\.webp$/);
        await o.page.getByTestId('brand-form-description').fill('Dyneema shelters and frameless packs, made to order in Colorado.');
        await o.page.getByTestId('brand-form-url').fill('https://ridgeline.example/');
        await expect(o.page.getByTestId('brand-form-route')).toContainText('Visit goes to the website.');
        await o.page.getByTestId('brand-form-affiliate').fill('https://ridgeline.sjv.io/c/1/2/3');
        await expect(o.page.getByTestId('brand-form-route')).toContainText('except Supporters');
        await o.page.getByTestId('brand-form-cottage').check();
        await o.page.getByTestId('brand-form-type-shelter').check();
        await o.page.getByTestId('brand-form-type-packs').check();
        await o.page.getByTestId('brand-form-save').click();
        await expect(o.page.getByTestId('brands-notice')).toContainText(`Saved Ridgeline ${tag}`);
        await expect(o.page.getByTestId('brand-row').filter({ hasText: `Ridgeline ${tag}` })).toContainText('Cottage');

        // Two more over the API: a big brand, and a draft.
        const add = async (data: object) => expect((await o.page.request.post(url('/api/admin/brands'), { data })).status()).toBe(201);
        await add({ name: `Summit Supply ${tag}`, description: 'Sleeping bags and pads.', url: 'https://summit.example/', gearTypes: ['sleep'], status: 'published' });
        await add({ name: `Secret ${tag}`, url: 'https://secret.example/', status: 'draft' });
        // The same name twice is refused.
        expect((await o.page.request.post(url('/api/admin/brands'), { data: { name: `summit supply ${tag}` } })).status()).toBe(409);

        // A visitor, filtering in place.
        const visitor = await browser.newPage();
        await visitor.goto(url('/brands'));
        await expect(visitor.getByTestId('brands-heading')).toBeVisible();
        await visitor.getByTestId('brand-search').fill(tag);
        const cards = visitor.getByTestId('brand-card').filter({ visible: true });
        await expect(cards).toHaveCount(2);
        await expect(visitor.getByText(`Secret ${tag}`)).toHaveCount(0);
        await visitor.getByTestId('brand-cottage').check();
        await expect(cards).toHaveCount(1);
        await expect(cards.first()).toContainText(`Ridgeline ${tag}`);
        await expect(cards.first()).toContainText('Cottage');
        await expect(cards.first()).toContainText('Shelters');
        await expect(cards.first().locator('img.wgMakerLogo')).toHaveAttribute('src', /_photo\.webp$/);
        await expect(visitor).toHaveURL(new RegExp(`/brands\\?q=${tag}&cottage=1$`));
        await visitor.getByTestId('brand-cottage').uncheck();
        await visitor.getByTestId('brand-type-sleep').click();
        await expect(cards).toHaveCount(1);
        await expect(cards.first()).toContainText(`Summit Supply ${tag}`);
        await expect(visitor.getByTestId('brand-type-sleep')).toHaveAttribute('aria-pressed', 'true');
        await visitor.getByTestId('brand-search').fill(`nothing-${tag}`);
        await expect(visitor.getByTestId('brand-empty')).toBeVisible();

        // The URL works on its own (and without JavaScript).
        await visitor.goto(url(`/brands?q=${tag}&type=packs`));
        await expect(cards).toHaveCount(1);
        await expect(cards.first()).toContainText(`Ridgeline ${tag}`);

        // Visit: the affiliate link for visitors, the website for Supporters.
        const visit = await cards.first().getByTestId('brand-visit').getAttribute('href');
        const viaVisitor = await visitor.request.get(url(visit!), { maxRedirects: 0 });
        expect(viaVisitor.status()).toBe(302);
        expect(viaVisitor.headers().location).toBe('https://ridgeline.sjv.io/c/1/2/3');
        await visitor.close();

        const supporterContext = await browser.newContext();
        const supporter = await supporterContext.newPage();
        const s = generateTestUser('brandsup');
        await registerUser(supporter, s.username, s.password, s.email);
        await expect(supporter.getByTestId('item-row').first()).toBeVisible();
        const grant = await o.page.request.post(url('/api/admin/supporters'), { data: { username: s.username, months: 1 } });
        expect(grant.status(), await grant.text()).toBe(200);
        const viaSupporter = await supporter.request.get(url(visit!), { maxRedirects: 0 });
        expect(viaSupporter.headers().location).toBe('https://ridgeline.example/');
        await supporterContext.close();

        // The owner sees the visits.
        await o.page.goto(url('/owner/brands'));
        await expect(o.page.getByTestId('brand-row').filter({ hasText: `Ridgeline ${tag}` })).toContainText('2');

        // And can delete a brand.
        await o.page.getByTestId('brand-row').filter({ hasText: `Summit Supply ${tag}` }).getByTestId('brand-edit').click();
        await o.page.getByTestId('brand-form-delete').click();
        await expect(o.page.getByTestId('brands-notice')).toContainText(`Deleted Summit Supply ${tag}`);
        await o.context.close();
    });

    test('in the Explore menu, and owner-only to edit', async ({ page }) => {
        await page.goto(url('/welcome'));
        await page.getByTestId('nav-explore').click();
        await page.getByTestId('nav-brands').click();
        await expect(page).toHaveURL(/\/brands$/);
        expect((await page.request.post(url('/api/admin/brands'), { data: { name: 'Nope' } })).status()).toBeGreaterThanOrEqual(400);
    });
});
