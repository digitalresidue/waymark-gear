import { test, expect, Browser } from '@playwright/test';

import { testRoot } from './utils';
import { registerUser, generateTestUser } from './auth-utils';

// Owner and team: the owner adds admins and moderators; admins work on the
// catalog, brands and trails but deletes and big imports wait for the owner;
// money, scripts, Supporter grants, the members list and the team stay
// owner-only; every change is in the activity log.

const url = (p: string) => new URL(p, testRoot).toString();

async function asOwner(browser: Browser, workerIndex: number) {
    const page = await (await browser.newContext()).newPage();
    const username = `wge2eowner${workerIndex}`;
    const r = await page.request.post(url('/register'), { data: { username, email: `${username}@example.com`, password: 'testtest' } });
    if (r.status() !== 200) expect((await page.request.post(url('/signin'), { data: { username, password: 'testtest' } })).status()).toBe(200);
    return page;
}

async function member(browser: Browser, prefix: string) {
    const page = await (await browser.newContext()).newPage();
    const u = generateTestUser(prefix);
    await registerUser(page, u.username, u.password, u.email);
    await expect(page.getByTestId('item-row').first()).toBeVisible();
    return { page, username: u.username, email: u.email };
}

const csvFor = (brand: string, n: number) => ['sku,name,brand,category,weight,unit,price,status',
    ...Array.from({ length: n }, (_, i) => `${brand}-${i},Thing ${i},${brand},Misc,1,oz,1,published`)].join('\n');

test('an admin works on the catalog, but deletes and big imports wait for the owner', async ({ browser }, testInfo) => {
    test.setTimeout(90_000);
    const owner = await asOwner(browser, testInfo.workerIndex);
    const admin = await member(browser, 'tmadm');
    const tag = `Tm${Date.now().toString(36)}`;

    // Before joining the team: no admin tools.
    expect((await admin.page.request.get(url('/api/admin/catalog'))).status()).toBe(403);

    // The owner adds them as an admin on the Team page.
    await owner.goto(url('/owner/team'));
    await owner.getByTestId('team-username').fill(admin.username);
    await owner.getByTestId('team-role').selectOption('admin');
    await owner.getByTestId('team-save').click();
    await expect(owner.getByTestId('team-row').filter({ hasText: admin.username })).toBeVisible();

    // Admin tools work...
    expect((await admin.page.request.get(url('/api/admin/catalog'))).status()).toBe(200);
    // ...owner-only ones don't.
    for (const path of ['/api/admin/affiliate', '/api/admin/head-tags', '/api/admin/supporters', '/api/owner/users', '/api/owner/team', '/api/owner/activity']) {
        expect((await admin.page.request.get(url(path))).status(), path).toBe(403);
    }
    expect((await admin.page.request.put(url('/api/admin/head-tags'), { data: { text: '<meta name="x" content="y">' } })).status()).toBe(403);
    expect((await admin.page.request.post(url('/api/owner/team'), { data: { username: admin.username, role: 'admin' } })).status()).toBe(403);

    // A small import goes straight in.
    const small = await admin.page.request.post(url('/api/admin/catalog/import/apply'), { data: { csv: csvFor(`${tag}s`, 3) } });
    expect(small.status()).toBe(200);
    expect((await small.json()).summary.new).toBe(3);

    // A big one (25+ rows) waits.
    const big = await admin.page.request.post(url('/api/admin/catalog/import/apply'), { data: { csv: csvFor(`${tag}b`, 26) } });
    expect(big.status()).toBe(202);
    expect((await big.json()).pending).toBe(true);
    const count = async (q: string) => (await (await owner.request.get(url(`/api/admin/catalog?q=${q}&status=all`))).json()).total;
    expect(await count(`${tag}b`)).toBe(0);

    // So does a delete.
    const items = (await (await owner.request.get(url(`/api/admin/catalog?q=${tag}s&status=all`))).json()).items;
    const victim = items[0];
    const del = await admin.page.request.delete(url(`/api/admin/catalog/${victim.id}`));
    expect(del.status()).toBe(202);
    expect(await count(`${tag}s`)).toBe(3);

    // The owner sees both waiting, approves the import and turns down the delete.
    await owner.goto(url('/owner/activity'));
    await expect(owner.getByTestId('owner-nav-pending')).toBeVisible();
    const importReq = owner.getByTestId('activity-request').filter({ hasText: `26 new` });
    const deleteReq = owner.getByTestId('activity-request').filter({ hasText: victim.name });
    await expect(importReq).toContainText(admin.username);
    await importReq.getByTestId('activity-approve').click();
    await expect(importReq).toHaveCount(0);
    await deleteReq.getByTestId('activity-reject').click();
    await expect(deleteReq).toHaveCount(0);
    expect(await count(`${tag}b`)).toBe(26);
    expect(await count(`${tag}s`)).toBe(3);

    // Everything the admin did is in the log.
    const log = (await (await owner.request.get(url('/api/owner/activity?limit=200'))).json()).actions
        .filter((a: { username: string }) => a.username === admin.username);
    expect(log.map((a: { status: string }) => a.status).sort()).toEqual(['approved', 'done', 'rejected']);

    // The owner deletes directly.
    expect((await owner.request.delete(url(`/api/admin/catalog/${victim.id}`))).status()).toBe(200);

    // Off the team: no admin tools again.
    await owner.goto(url('/owner/team'));
    await owner.getByTestId(`team-remove-${admin.username}`).click();
    await expect(owner.getByTestId('team-row').filter({ hasText: admin.username })).toHaveCount(0);
    expect((await admin.page.request.get(url('/api/admin/catalog'))).status()).toBe(403);
});

test('an admin sees the admin tools, not the owner ones; the owner sees every member', async ({ browser }, testInfo) => {
    const owner = await asOwner(browser, testInfo.workerIndex);
    const admin = await member(browser, 'tmad2');
    const fan = await member(browser, 'tmfan');
    expect((await owner.request.post(url('/api/owner/team'), { data: { username: admin.username, role: 'admin' } })).status()).toBe(200);
    expect((await owner.request.post(url('/api/admin/supporters'), { data: { username: fan.username, months: 12 } })).status()).toBe(200);

    // The admin's tools bar: Admin, catalog and friends, no Revenue/Members/Team.
    await admin.page.goto(url('/owner/catalog'));
    await expect(admin.page.getByTestId('owner-role')).toHaveText('Admin');
    await expect(admin.page.getByTestId('owner-nav-brands')).toBeVisible();
    await expect(admin.page.getByTestId('owner-nav-revenue')).toHaveCount(0);
    await expect(admin.page.getByTestId('owner-nav-members')).toHaveCount(0);
    await admin.page.goto(url('/owner/revenue'));
    await expect(admin.page.getByText('Site owner only.').or(admin.page.getByText('Owner access only.'))).toBeVisible();

    // Members: the owner finds the Supporter, with their email.
    await owner.goto(url('/owner/members'));
    await owner.getByTestId('members-search').fill(fan.username);
    await owner.getByTestId('members-search').press('Enter');
    const row = owner.getByTestId('member-row').filter({ hasText: fan.username });
    await expect(row).toContainText(fan.email);
    await expect(row.getByTestId('member-plan')).toContainText('Supporter');
    await owner.getByTestId('members-supporter').selectOption('no');
    await expect(owner.getByTestId('member-row').filter({ hasText: fan.username })).toHaveCount(0);
    // The admin's role shows next to their name.
    await owner.getByTestId('members-supporter').selectOption('');
    await owner.getByTestId('members-search').fill(admin.username);
    await owner.getByTestId('members-search').press('Enter');
    await expect(owner.getByTestId('member-row').filter({ hasText: admin.username })).toContainText('admin');

    await owner.request.delete(url(`/api/owner/team/${admin.username}`));
});
