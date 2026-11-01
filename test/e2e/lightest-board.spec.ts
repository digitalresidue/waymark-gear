import { test, expect, Page } from '@playwright/test';
import crypto from 'crypto';

import { testRoot } from './utils';
import { registerUser, generateTestUser } from './auth-utils';

// The Lightest board slides lists that go untouched or get downvoted, and
// leaves out lists without the basics (client/utils/board-rules.js).

const url = (p: string) => new URL(p, testRoot).toString();
const LB = 453592;
const saved = (page: Page) => page.waitForResponse((r) => r.url().includes('saveLibrary') && r.status() === 200, { timeout: 20000 });

let knex: any;
test.beforeAll(async () => {
    const Knex = (await import('knex')).default;
    const { connectionConfig } = await import('../../server/db-config.js');
    knex = Knex({ client: 'pg', connection: connectionConfig() });
});
test.afterAll(async () => {
    await knex?.destroy();
});

async function makeUser(name: string) {
    const [u] = await knex('users').insert({
        username: name, email: `${name}@example.com`, token: crypto.randomBytes(16).toString('hex'),
        registered: knex.fn.now(), last_seen: knex.fn.now(),
    }).returning(['user_id', 'username']);
    return u;
}

// A published list straight into public_kits, its gear clock set `days` ago.
async function kit(owner: { user_id: string; username: string }, name: string, lb: number, days: number, boardOk = true) {
    const id = `t${crypto.randomBytes(5).toString('hex')}`;
    await knex('list').insert({ external_id: id, user_id: owner.user_id });
    await knex('public_kits').insert({
        external_id: id, user_id: owner.user_id, username: owner.username, name,
        base_weight_mg: Math.round(lb * LB), total_weight_mg: Math.round(lb * LB), weight_class: 'ul',
        board_ok: boardOk, board_checked: true,
    });
    await knex('kit_clock').insert({ external_id: id, gear_hash: 'x', gear_changed_at: knex.raw(`now() - interval '${days} days'`) });
    return id;
}

const board = async (page: Page, tag: string) => {
    const r = await page.request.get(url(`/api/explore/kits?sort=light&limit=50&q=${tag}&_=${Date.now()}`));
    return (await r.json()).kits.map((k: { name: string }) => k.name.replace(` ${tag}`, ''));
};

test('lists slide after 3 months untouched, leave after a year, and drop on downvotes or a failed Gear check', async ({ page }) => {
    const tag = `lb${Date.now().toString(36)}`;
    const owner = await makeUser(`own${tag}`);
    await kit(owner, `Fresh 9 ${tag}`, 9.0, 10);
    await kit(owner, `Old 8 ${tag}`, 8.0, 200); // month 4 of padding: ranks as 9.6 lb
    await kit(owner, `Older 8.5 ${tag}`, 8.5, 100); // month 1: ranks as 8.925 lb
    await kit(owner, `Stale 5 ${tag}`, 5.0, 400);
    await kit(owner, `No shelter 4 ${tag}`, 4.0, 1, false);
    const voted = await kit(owner, `Voted 8.8 ${tag}`, 8.8, 5);
    const sunk = await kit(owner, `Sunk 7 ${tag}`, 7.0, 5);

    // Ranking weights: 7, 8.8, 8.925, 9, 9.6. Stale and no-shelter are left out.
    expect(await board(page, tag)).toEqual(['Sunk 7', 'Voted 8.8', 'Older 8.5', 'Fresh 9', 'Old 8']);

    // Downvotes: 3 net down on a 8.8 lb list → +15% = 10.12 lb, below Old 8.
    // Five net down takes a list off the board.
    const voters = await Promise.all([1, 2, 3, 4, 5].map((n) => makeUser(`v${n}${tag}`)));
    await knex('list_votes').insert(voters.slice(0, 3).map((v) => ({ external_id: voted, user_id: v.user_id, value: -1 })));
    await knex('list_votes').insert(voters.map((v) => ({ external_id: sunk, user_id: v.user_id, value: -1 })));
    expect(await board(page, tag)).toEqual(['Older 8.5', 'Fresh 9', 'Old 8', 'Voted 8.8']);
});

test('"Still carrying this" brings a stale list back; renaming does not reset the clock, changing gear does', async ({ page }) => {
    test.setTimeout(120_000);
    const u = generateTestUser('lbown');
    await registerUser(page, u.username, u.password, u.email);
    await expect(page.getByTestId('item-row').first()).toBeVisible();
    const tag = `lc${Date.now().toString(36)}`;

    // A list that passes the board's Gear check.
    const title = page.getByPlaceholder('Name your list', { exact: true });
    await title.fill(`Carry ${tag}`);
    await title.blur();
    const gear = ['Duplex tent', 'Down quilt', 'Puffy jacket', 'Sawyer filter', 'Phone', 'Headlamp', 'First aid kit', 'Rain jacket'];
    for (let i = 0; i < gear.length; i++) {
        if (i > 0) await page.locator('.lpAddItem').first().click();
        const row = page.getByTestId('item-row').nth(i);
        await row.getByPlaceholder('Name', { exact: true }).fill(gear[i]);
        await row.getByTestId('item-weight').fill('5');
    }
    await page.getByText('Share', { exact: true }).hover();
    await expect(page.getByLabel('Share your list')).toHaveValue(/\/r\/[a-z0-9]+/, { timeout: 10000 });
    const id = (await page.getByLabel('Share your list').inputValue()).split('/r/')[1];
    let done = saved(page);
    await page.getByTestId('publish-toggle').check();
    await done;
    await expect.poll(async () => (await knex('public_kits').where({ external_id: id }).first())?.board_ok).toBe(true);
    expect(await board(page, tag)).toEqual(['Carry']);

    // A year and a half untouched: off the board, and the owner is told why.
    await knex('kit_clock').where({ external_id: id }).update({ gear_changed_at: knex.raw("now() - interval '540 days'") });
    expect(await board(page, tag)).toEqual([]);
    await page.mouse.move(5, 600);
    await page.getByText('Share', { exact: true }).hover();
    await expect(page.getByTestId('board-status')).toContainText('off the board after a year');

    // Renaming the list is not a gear change.
    await page.mouse.move(5, 600);
    done = saved(page);
    await title.fill(`Carry ${tag} renamed`);
    await title.blur();
    await done;
    expect(await board(page, tag)).toEqual([]);

    // "Still carrying this" puts it back.
    await page.getByText('Share', { exact: true }).hover();
    await page.getByTestId('still-carrying').click();
    await expect(page.getByTestId('board-status')).toContainText('listed.');
    expect(await board(page, tag)).toEqual(['Carry renamed']);

    // Changing a weight restarts the gear clock too.
    await knex('kit_clock').where({ external_id: id }).update({ gear_changed_at: knex.raw("now() - interval '540 days'"), confirmed_at: null });
    expect(await board(page, tag)).toEqual([]);
    await page.mouse.move(5, 600);
    done = saved(page);
    await page.getByTestId('item-row').first().getByTestId('item-weight').fill('6');
    await done;
    await expect.poll(() => board(page, tag)).toEqual(['Carry renamed']);

    // Leaderboard: how it works, and when each list was updated.
    await page.goto(url('/leaderboard'));
    await page.getByTestId('board-how').locator('summary').click();
    await expect(page.getByTestId('board-how')).toContainText('keeps its full spot for 3 months');
});
