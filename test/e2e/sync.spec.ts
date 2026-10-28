import { test, expect, APIRequestContext, Page } from '@playwright/test';

import { registerUser, generateTestUser } from './auth-utils';
import { testRoot } from './utils';

// Saving sends only what changed (client/utils/library-diff.js), and the
// server applies it per item, category and list (server/library-store.js).
// So two tabs or devices editing different things both keep their work, and
// one account can never reach another's rows.

const url = (p: string) => new URL(p, testRoot).toString();

const signinData = async (request: APIRequestContext) => {
    const res = await request.post(url('/signin'), { data: {} });
    expect(res.status()).toBe(200);
    const body = await res.json();
    return { ...body, library: JSON.parse(body.library) };
};

const waitForSave = (page: Page) => page.waitForResponse((r) => r.url().includes('saveLibrary') && r.status() === 200, { timeout: 20000 });

test.describe('Saving from two tabs', () => {
    test('edits to different things in two tabs both persist, and a tab picks up the other on return', async ({ page, context }) => {
        const { username, password, email } = generateTestUser('twotab');
        await registerUser(page, username, password, email);
        const firstRow = page.getByTestId('item-row').first();
        await expect(firstRow).toBeVisible();

        // A second tab of the same account, opened before either edit.
        const other = await context.newPage();
        await other.goto(testRoot);
        await expect(other.getByTestId('item-row').first()).toBeVisible();

        const saveA = waitForSave(page);
        await firstRow.getByPlaceholder('Name', { exact: true }).fill('Edited in tab A');
        await saveA;

        // Tab B never saw that edit. Its own change must not undo it.
        const saveB = waitForSave(other);
        await other.getByText('Add new category', { exact: true }).click();
        await other.getByTestId('category').last().getByPlaceholder('Category Name').fill('Added in tab B');
        await saveB;

        const { library } = await signinData(page.request);
        expect(library.items.map((i: any) => i.name)).toContain('Edited in tab A');
        expect(library.categories.map((c: any) => c.name)).toContain('Added in tab B');

        // Coming back to tab A brings in tab B's category without a reload.
        await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
        await expect(page.locator('input.lpCategoryName[value="Added in tab B"]')).toHaveCount(1);
        await expect(page.getByTestId('item-row').first().getByPlaceholder('Name', { exact: true })).toHaveValue('Edited in tab A');
    });

    test('an incremental save works with an older version token; a whole-library save does not', async ({ playwright }) => {
        const request = await playwright.request.newContext();
        const user = generateTestUser('inc');
        const reg = await request.post(url('/register'), { data: { username: user.username, email: user.email, password: user.password } });
        expect(reg.status()).toBe(200);
        const start = await signinData(request);
        const item = start.library.items[0];

        const first = await request.post(url('/saveLibrary'), {
            data: { username: user.username, sync_token: start.sync_token, changes: { items: { upsert: [{ ...item, name: 'One' }], delete: [] } } },
        });
        expect(first.status()).toBe(200);

        // Same (now stale) token again: merges fine.
        const second = await request.post(url('/saveLibrary'), {
            data: { username: user.username, sync_token: start.sync_token, changes: { items: { upsert: [{ ...item, name: 'Two' }], delete: [] } } },
        });
        expect(second.status()).toBe(200);
        expect((await second.json()).sync_token).toBe(start.sync_token + 2);

        // A whole-library save with the stale token would overwrite everything.
        const whole = await request.post(url('/saveLibrary'), {
            data: { username: user.username, sync_token: start.sync_token, data: JSON.stringify(start.library) },
        });
        expect(whole.status()).toBe(400);
        expect((await signinData(request)).library.items[0].name).toBe('Two');
        await request.dispose();
    });
});

test.describe('Account isolation', () => {
    test('changes that name another account’s items, categories or lists do nothing to that account', async ({ playwright }) => {
        const make = async (prefix: string) => {
            const request = await playwright.request.newContext();
            const user = generateTestUser(prefix);
            expect((await request.post(url('/register'), { data: { username: user.username, email: user.email, password: user.password } })).status()).toBe(200);
            return { request, user };
        };
        const victim = await make('victim');
        const attacker = await make('attacker');

        const v = await signinData(victim.request);
        const vItem = v.library.items[0];
        await victim.request.post(url('/saveLibrary'), {
            data: { username: victim.user.username, sync_token: v.sync_token, changes: { items: { upsert: [{ ...vItem, name: 'Victim tent' }], delete: [] } } },
        });
        const before = await signinData(victim.request);

        const a = await signinData(attacker.request);
        const vCategory = before.library.categories[0];
        const vList = before.library.lists[0];
        const res = await attacker.request.post(url('/saveLibrary'), {
            data: {
                username: attacker.user.username,
                sync_token: a.sync_token,
                changes: {
                    items: { upsert: [{ ...vItem, name: 'Overwritten' }], delete: [vItem.id] },
                    categories: { upsert: [{ ...vCategory, name: 'Overwritten' }], delete: [vCategory.id] },
                    lists: { upsert: [], delete: [vList.id] },
                },
            },
        });
        expect(res.status()).toBe(200);

        // The victim's library is exactly as it was.
        const after = await signinData(victim.request);
        expect(after.library).toEqual(before.library);

        await victim.request.dispose();
        await attacker.request.dispose();
    });

    test('a malformed save is rejected without changing anything', async ({ playwright }) => {
        const request = await playwright.request.newContext();
        const user = generateTestUser('bad');
        await request.post(url('/register'), { data: { username: user.username, email: user.email, password: user.password } });
        const start = await signinData(request);
        const res = await request.post(url('/saveLibrary'), {
            data: { username: user.username, sync_token: start.sync_token, changes: { items: { upsert: [{ id: 'not-a-number', name: 'x' }], delete: [] } } },
        });
        expect(res.status()).toBe(400);
        expect((await signinData(request)).library).toEqual(start.library);
        await request.dispose();
    });
});
