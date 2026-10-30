import { test, expect, Page } from '@playwright/test';

import { registerUser, generateTestUser } from './auth-utils';

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

test('what people actually carry: each gear row opens its gear page', async ({ page }) => {
    // Any published catalog item, ranked as if kits carried it.
    const gear = (await (await page.request.get(url('/api/catalog?limit=1'))).json()).items[0];
    expect(gear).toBeTruthy();
    await page.route('**/api/explore/common?*', (route) => route.fulfill({
        json: { kitCount: 4, items: [{ id: gear.id, name: gear.name, brand: gear.brand, category: gear.category, weightMg: 500000, unit: 'oz', kits: 3, share: 0.75 }] },
    }));
    await page.goto(url('/welcome'));
    const link = page.getByTestId('common-gear-link');
    await expect(link).toHaveText(gear.name);
    await expect(link).toHaveAttribute('href', `/g/${gear.id}`);
    // The whole row is the target: a click on the weight, far from the name, opens it.
    const weightCell = page.getByTestId('common-gear').locator('.wgCommonWeight').first();
    await weightCell.scrollIntoViewIfNeeded();
    const weight = await weightCell.boundingBox();
    await page.mouse.click(weight!.x + weight!.width / 2, weight!.y + weight!.height / 2);
    await expect(page).toHaveURL(new RegExp(`/g/${gear.id}$`));
});

const saved = (page: Page) => page.waitForResponse((r) => r.url().includes('saveLibrary') && r.status() === 200, { timeout: 20000 });

test('packs by trail: twelve trails, ranked by packs, each with its weight-class split and average', async ({ browser }) => {
    test.setTimeout(90000);
    // A hiker publishes a PCT list with a 20 oz quilt.
    const page = await (await browser.newContext()).newPage();
    const u = generateTestUser('homtrail');
    await registerUser(page, u.username, u.password, u.email);
    await expect(page.getByTestId('item-row').first()).toBeVisible();
    const title = page.getByPlaceholder('Name your list', { exact: true });
    let done = saved(page);
    await title.fill(`PCT 2026 home ${Date.now()}`);
    await title.blur();
    await done;
    const row = page.getByTestId('item-row').first();
    done = saved(page);
    await row.getByPlaceholder('Name', { exact: true }).fill('Quilt');
    await row.getByTestId('item-weight').fill('20');
    await done;
    done = saved(page);
    await page.getByTestId('trail-tag-suggest').click();
    await done;
    await page.getByText('Share', { exact: true }).hover();
    const toggle = page.getByTestId('publish-toggle');
    await expect(toggle).toBeEnabled({ timeout: 10000 });
    done = saved(page);
    await toggle.check();
    await done;

    // The data: ranked by packs, the split adds up, and an average to show.
    const home = await (await page.request.get(url('/api/home'))).json();
    expect(home.trails).toHaveLength(12);
    const counts = home.trails.map((t: { count: number }) => t.count);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
    const pct = home.trails.find((t: { slug: string }) => t.slug === 'pct');
    expect(pct.count).toBeGreaterThan(0);
    expect(Object.values(pct.classes).reduce((a: number, b) => a + (b as number), 0)).toBe(pct.count);
    expect(pct.avgBaseWeightMg).toBeGreaterThan(0);

    // The cards.
    const visitor = await (await browser.newContext()).newPage();
    await visitor.goto(url('/welcome'));
    const cards = visitor.getByTestId('home-trail');
    await expect(cards).toHaveCount(12);
    const card = visitor.locator('a[data-testid="home-trail"][href="/trails/pct"]');
    await expect(card.getByTestId('home-trail-packs')).toHaveText(`${pct.count.toLocaleString()} ${pct.count === 1 ? 'pack' : 'packs'}`);
    await expect(card.getByTestId('home-trail-tiers')).toHaveAttribute('aria-label', /^PCT packs: \d+ /);
    await expect(card.getByTestId('home-trail-avg')).toContainText('avg base weight');
    await expect(visitor.getByRole('list', { name: 'Weight classes' })).toContainText('Ultralight');
});

test('what people actually carry: the category chips are the ones people carry, most carried first', async ({ page }) => {
    const { categories } = await (await page.request.get(url('/api/explore/common/categories?limit=12'))).json();
    const counts = categories.map((c: { count: number }) => c.count);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
    // Every category in the most-carried list has its chip (while there are 12 or fewer).
    const top = await (await page.request.get(url('/api/explore/common?limit=50'))).json();
    const carried = [...new Set(top.items.map((i: { category: string }) => i.category).filter(Boolean))];
    if (carried.length <= 12) {
        for (const c of carried) expect(categories.map((x: { name: string }) => x.name)).toContain(c);
    }

    // The page shows the chips it's given, in order, after All; Packs isn't
    // lost however late it sorts alphabetically. Picking one asks for it.
    await page.route('**/api/explore/common/categories?*', (route) => route.fulfill({
        json: { categories: [{ name: 'Packs', count: 30 }, { name: 'Shelter', count: 22 }, { name: 'Accessories', count: 3 }] },
    }));
    await page.goto(url('/welcome'));
    const chips = page.getByTestId('common-chips').getByRole('button');
    await expect(chips).toHaveText(['All', 'Packs', 'Shelter', 'Accessories']);
    const asked = page.waitForRequest((r) => r.url().includes('/api/explore/common?') && r.url().includes('category=Packs'));
    await chips.nth(1).click();
    await asked;
    await expect(chips.nth(1)).toHaveAttribute('aria-pressed', 'true');
});

