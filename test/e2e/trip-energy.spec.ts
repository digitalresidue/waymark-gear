import { test, expect } from '@playwright/test';

import { testRoot } from './utils';
import { registerUser, generateTestUser } from './auth-utils';

// Calorie, food and water estimates (client/utils/energy.js): body stats in
// Your profile (private) plus a trip's plan on its page, with the days
// between town stops giving the food and pack weight for each stretch.

const url = (p: string) => new URL(p, testRoot).toString();

test('body stats and a trip plan give calories, food per stretch and water to carry', async ({ page, browser }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1280, height: 900 });
    const u = generateTestUser('energy');
    await registerUser(page, u.username, u.password, u.email);
    await expect(page.getByTestId('item-row').first()).toBeVisible();
    const lib = JSON.parse((await (await page.request.post(url('/signin'), { data: {} })).json()).library);
    const listId = lib.defaultListId;

    // A trip with the list linked; no body stats yet: the plan says where to add them.
    const trip = await (await page.request.post(url('/api/trips'), { data: { title: 'Sierra resupply test', visibility: 'public', listId } })).json();
    await page.goto(url(`/trips/${trip.id}`));
    await expect(page.getByTestId('trip-plan-no-body')).toBeVisible();
    await expect(page.getByTestId('plan-estimate')).toHaveCount(0);

    // Body stats, in Your profile (imperial for this reader).
    await page.goto(url('/profile'));
    const body = page.getByTestId('body-stats');
    await body.getByTestId('body-weight').fill('165');
    await body.getByTestId('body-feet').fill('5');
    await body.getByTestId('body-inches').fill('10');
    await body.getByTestId('body-born').fill('1990');
    await body.getByTestId('body-sex').selectOption('male');
    await body.getByTestId('body-build').selectOption('average');
    await body.getByTestId('body-save').click();
    await expect(body.getByTestId('body-status')).toHaveText('Saved.');
    const saved = await (await page.request.get(url('/api/body-stats'))).json();
    expect(saved).toMatchObject({ kg: 74.8, heightCm: 178, birthYear: 1990, sex: 'male', build: 'average' });

    // Private: nowhere on the public profile.
    const visitor = await (await browser.newContext()).newPage();
    const publicHtml = await (await visitor.request.get(url(`/@${u.username}`))).text();
    for (const leak of ['1990', 'body_stats', 'Average build', '74.8']) expect(publicHtml, leak).not.toContain(leak);
    expect((await visitor.request.get(url('/api/body-stats'))).status()).toBe(401);
    await visitor.context().close();

    // The trip's plan: 18 mi and 4,000 ft a day, 4/5/3 days between towns,
    // water every 10 mi.
    await page.goto(url(`/trips/${trip.id}`));
    const plan = page.getByTestId('trip-plan');
    await expect(plan.getByTestId('trip-plan-body')).toContainText('165 lb');
    await plan.getByTestId('plan-distance').fill('18');
    await plan.getByTestId('plan-gain').fill('4000');
    await plan.getByTestId('plan-pace').fill('2.2');
    await plan.getByTestId('plan-low').fill('40');
    await plan.getByTestId('plan-high').fill('75');
    await plan.getByTestId('plan-stretches').fill('4, 5, 3');
    await plan.getByTestId('plan-water-every').fill('10');

    const kcal = Number((await plan.getByTestId('plan-kcal').innerText()).replace(/[^\d]/g, ''));
    expect(kcal).toBeGreaterThan(3500);
    expect(kcal).toBeLessThan(6500);
    await expect(plan.getByTestId('plan-food-day')).toContainText('oz');
    await expect(plan.getByTestId('plan-breakdown')).toContainText('Mifflin–St Jeor and Katch–McArdle');
    await expect(plan.getByTestId('plan-water-carry')).toContainText('L');
    // Three stretches; the five-day one is the heaviest pack out of town.
    const rows = plan.getByTestId('plan-stretch');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(1)).toContainText('Heaviest');
    const packs = await plan.getByTestId('plan-stretch-pack').allInnerTexts();
    const lb = packs.map((t) => parseFloat(t));
    expect(lb[1]).toBeGreaterThan(lb[0]);
    expect(lb[0]).toBeGreaterThan(lb[2]);

    // Saved with the trip.
    await page.getByTestId('trip-form').getByRole('button', { name: /save/i }).first().click();
    await expect.poll(async () => (await (await page.request.get(url(`/api/trips/${trip.id}`))).json()).trip.plan.stretches, { timeout: 10000 }).toEqual([4, 5, 3]);
    await page.reload();
    await expect(page.getByTestId('plan-stretches')).toHaveValue('4, 5, 3');
    await expect(page.getByTestId('plan-distance')).toHaveValue('18');
    await expect(page.getByTestId('plan-stretch')).toHaveCount(3);
});
