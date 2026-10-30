import { test, expect } from '@playwright/test';

import { testRoot } from './utils';

// The homepage has a short section for each part of the site in the menu:
// trails, the latest reviews, brands and the leaderboards, each with a link
// to the rest. Sections with nothing in them yet don't show.

const url = (p: string) => new URL(p, testRoot).toString();

test('homepage: trails, latest reviews, brands and leaderboards, each leading on', async ({ browser }, testInfo) => {
    test.setTimeout(60000);
    // The site owner reviews a catalog item and adds a brand.
    const context = await browser.newContext();
    const owner = await context.newPage();
    const username = `wge2eowner${testInfo.workerIndex}`;
    const r = await owner.request.post(url('/register'), { data: { username, email: `${username}@example.com`, password: 'testtest' } });
    if (r.status() !== 200) expect((await owner.request.post(url('/signin'), { data: { username, password: 'testtest' } })).status()).toBe(200);
    const tag = `hs${Date.now().toString(36)}`;
    const csv = ['sku,name,brand,category,weight,unit,status', `${tag},Home quilt ${tag},Trailco,Sleep,21,oz,published`].join('\n');
    expect((await owner.request.post(url('/api/admin/catalog/import/apply'), { data: { csv } })).ok()).toBe(true);
    const item = (await (await owner.request.get(url(`/api/catalog?q=${tag}`))).json()).items[0];
    expect((await owner.request.post(url(`/api/catalog/${item.id}/reviews`), { data: { rating: 4, title: `Warm enough ${tag}`, body: 'Took it to 25F with a puffy and slept fine; the straps are fiddly.' } })).ok()).toBe(true);
    expect((await owner.request.post(url('/api/admin/brands'), { data: { name: `Home Brand ${tag}`, url: 'https://brand.example/', cottage: true, status: 'published' } })).status()).toBe(201);
    await context.close();

    const visitor = await (await browser.newContext()).newPage();
    await visitor.setViewportSize({ width: 1440, height: 900 });
    await visitor.goto(url('/welcome'));

    // Trails.
    const trails = visitor.getByTestId('home-trails');
    await expect(trails).toBeVisible();
    await expect(trails.getByTestId('home-trail').first()).toHaveAttribute('href', /^\/trails\//);
    await expect(trails.getByRole('link', { name: 'All trails →' })).toHaveAttribute('href', '/trails/all');

    // Latest reviews: at most six, ours first; the card opens the gear page.
    const reviews = visitor.getByTestId('home-reviews');
    await expect(reviews).toBeVisible();
    expect(await reviews.getByTestId('home-review').count()).toBeLessThanOrEqual(6);
    const card = reviews.getByTestId('home-review').filter({ hasText: `Warm enough ${tag}` });
    await expect(card).toContainText(`Trailco Home quilt ${tag}`);
    await expect(card.getByLabel('4 out of 5')).toBeVisible();
    await expect(reviews.getByRole('link', { name: 'Read all reviews →' })).toHaveAttribute('href', '/reviews');

    // Brands.
    const brands = visitor.getByTestId('home-brands');
    await expect(brands).toBeVisible();
    await expect(brands.getByTestId('home-brand').filter({ hasText: `Home Brand ${tag}` })).toContainText('Cottage');

    // Leaderboards link on.
    await expect(visitor.getByRole('link', { name: 'Full leaderboards →' }).or(visitor.getByRole('link', { name: 'Leaderboards →' })).first()).toBeVisible();

    // Order: trails before reviews before shakedowns before brands.
    const order = await visitor.evaluate(() => ['trails', 'reviews', 'shakedowns', 'brands', 'common'].map((id) => document.getElementById(id)?.getBoundingClientRect().top ?? -1));
    expect(order).toEqual([...order].sort((a, b) => a - b));

    await card.getByRole('link', { name: `Trailco Home quilt ${tag}` }).click();
    await expect(visitor).toHaveURL(new RegExp(`/g/${item.id}$`));
});
