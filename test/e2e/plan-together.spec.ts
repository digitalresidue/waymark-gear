import { test, expect, Page, Browser } from '@playwright/test';

import { registerUser, generateTestUser } from './auth-utils';
import { addItem, showLists } from './test-helpers';
import { testRoot } from './utils';

// Phase 5: planning a list together, live.

const url = (p: string) => new URL(p, testRoot).toString();
const saved = (page: Page) => page.waitForResponse((r) => (r.url().includes('saveLibrary') || r.url().includes('/changes')) && r.status() === 200, { timeout: 20000 });
const storeState = (page: Page) => page.evaluate(() => {
    const s = (window as any).LighterPack.$store.state;
    return { listId: s.library.defaultListId, saveType: s.saveType };
});

async function newUser(browser: Browser, prefix: string) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const u = generateTestUser(prefix);
    await registerUser(page, u.username, u.password, u.email);
    await expect(page.getByTestId('item-row').first()).toBeVisible();
    return { context, page, ...u };
}

const names = (page: Page) => page.getByTestId('item-row').getByPlaceholder('Name', { exact: true });

test.describe('Planning together', () => {
    test('partners edit one list live, see who is here, and split the gear', async ({ browser }) => {
        const owner = await newUser(browser, 'plown');
        const partner = await newUser(browser, 'plmate');

        // The owner names the list and adds a tent.
        const title = owner.page.getByPlaceholder('Name your list', { exact: true });
        await title.fill('Group trip');
        await title.blur();
        const category = owner.page.getByTestId('category').first();
        let done = saved(owner.page);
        await category.getByTestId('item-row').first().getByPlaceholder('Name', { exact: true }).fill('Tent');
        await done;
        const { listId } = await storeState(owner.page);

        // Invite the partner.
        await owner.page.getByTestId('open-team').click();
        await owner.page.getByTestId('team-invite-name').fill(partner.username);
        await owner.page.getByTestId('team-invite-send').click();
        await expect(owner.page.getByTestId('team-members')).toContainText(partner.username);
        await expect(owner.page.getByTestId('team-link')).toHaveValue(new RegExp(`/plan/${owner.username}/${listId}$`));
        await owner.page.keyboard.press('Escape');

        const inbox = await (await partner.page.request.get(url('/api/notifications'))).json();
        expect(inbox.items[0].kind).toBe('invite');
        expect(inbox.items[0].url).toBe(`/plan/${owner.username}/${listId}`);

        // The partner finds it under "Shared with you" and opens it.
        await partner.page.reload();
        await showLists(partner.page);
        await partner.page.getByTestId('shared-list').filter({ hasText: 'Group trip' }).click();
        await expect(partner.page.getByTestId('plan-sidebar')).toBeVisible();
        await expect(partner.page.locator('#lpListName')).toHaveValue('Group trip');
        await expect(names(partner.page).filter({ hasNotText: 'x' }).first()).toBeVisible();
        expect((await storeState(partner.page)).saveType).toBe('shared');
        // Publishing and sharing stay with the owner.
        await expect(partner.page.getByText('Share', { exact: true })).toHaveCount(0);

        // Each sees the other is here.
        await expect(partner.page.getByTestId('presence')).toBeVisible();
        await expect(owner.page.getByTestId('presence')).toBeVisible();

        // The partner adds a stove; it shows up for the owner without a reload.
        done = saved(partner.page);
        await addItem(partner.page.getByTestId('category').first(), 'Stove', { weight: '3', unit: 'oz' });
        await done;
        await expect.poll(async () => (await names(owner.page).evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))), { timeout: 15000 }).toContain('Stove');

        // And the owner's edit reaches the partner.
        done = saved(owner.page);
        await title.fill('Group trip: Wind Rivers');
        await title.blur();
        await done;
        await expect(partner.page.locator('#lpListName')).toHaveValue('Group trip: Wind Rivers', { timeout: 15000 });

        // Who carries what.
        const panel = owner.page.getByTestId('group-gear');
        await expect(panel).toBeVisible();
        await panel.getByTestId('group-gear-toggle').click();
        done = saved(owner.page);
        await panel.getByTestId('carry-row').filter({ hasText: 'Stove' }).getByTestId('carrier-select').selectOption(partner.username);
        await done;
        await expect(panel.getByTestId('carry-totals')).toContainText(partner.username);

        // In Pack mode the partner can see just what they carry.
        await expect.poll(async () => partner.page.evaluate(() => {
            const s = (window as any).LighterPack.$store.state;
            return s.library.categories.flatMap((c: any) => c.categoryItems).some((ci: any) => ci.carrier);
        }), { timeout: 15000 }).toBe(true);
        await partner.page.getByTestId('open-pack').click();
        await partner.page.getByTestId('pack-mine').click();
        await expect(partner.page.getByTestId('pack-row')).toHaveCount(1);
        await expect(partner.page.getByTestId('pack-row')).toContainText('Stove');
        await partner.page.getByLabel('Back to editing').click();
        expect((await storeState(partner.page)).saveType).toBe('shared');

        // Going back to "My lists" brings the partner's own library back.
        await partner.page.getByTestId('plan-back').click();
        await expect.poll(async () => (await storeState(partner.page)).saveType).toBe('remote');
        await expect(partner.page.getByTestId('plan-sidebar')).toHaveCount(0);

        await owner.context.close();
        await partner.context.close();
    });

    test('a member can only touch the shared list', async ({ browser }) => {
        const owner = await newUser(browser, 'plsec');
        const member = await newUser(browser, 'plmem');
        const stranger = await newUser(browser, 'plstr');
        const state = async () => owner.page.evaluate(() => JSON.parse(JSON.stringify((window as any).LighterPack.$store.state.library.save())));

        // Two lists; only the first is shared.
        const done = saved(owner.page);
        await owner.page.getByTestId('item-row').first().getByPlaceholder('Name', { exact: true }).fill('Shared tent');
        await done;
        const lib = await state();
        const sharedId = lib.defaultListId;
        await showLists(owner.page);
        await owner.page.getByTestId('new-list').hover();
        await showLists(owner.page);
        await owner.page.getByTestId('new-list-blank').click();
        const done2 = saved(owner.page);
        await owner.page.getByTestId('item-row').first().getByPlaceholder('Name', { exact: true }).fill('Secret quilt');
        await done2;
        const lib2 = await state();
        const privateList = lib2.lists.find((l: any) => l.id !== sharedId);
        const secret = lib2.items.find((i: any) => i.name === 'Secret quilt');

        const invite = await owner.page.request.post(url(`/api/plan/${owner.username}/${sharedId}/members`), { data: { username: member.username } });
        expect(invite.status()).toBe(200);

        // Strangers and other lists are off limits.
        expect((await stranger.page.request.get(url(`/api/plan/${owner.username}/${sharedId}`))).status()).toBe(403);
        expect((await member.page.request.get(url(`/api/plan/${owner.username}/${privateList.id}`))).status()).toBe(403);

        // The plan only shows the shared list and its gear.
        const plan = await (await member.page.request.get(url(`/api/plan/${owner.username}/${sharedId}`))).json();
        expect(plan.library.lists.map((l: any) => l.id)).toEqual([sharedId]);
        expect(plan.library.items.map((i: any) => i.name)).not.toContain('Secret quilt');

        // Sneaking the owner's other gear in, renaming it, or deleting it does nothing.
        const category = plan.library.categories[0];
        const res = await member.page.request.post(url(`/api/plan/${owner.username}/${sharedId}/changes`), {
            data: {
                changes: {
                    items: { upsert: [{ ...secret, name: 'Stolen' }], delete: [secret.id] },
                    categories: { upsert: [{ ...category, categoryItems: [...category.categoryItems, { itemId: secret.id, qty: 1, worn: 0, consumable: false, star: 0 }] }], delete: [] },
                    lists: { upsert: [{ ...plan.library.lists[0], published: true }], delete: [privateList.id] },
                },
            },
        });
        expect(res.status()).toBe(200);
        const after = await (await owner.page.request.post(url('/signin'), { data: {} })).json();
        const ownerLib = JSON.parse(after.library);
        expect(ownerLib.items.find((i: any) => i.id === secret.id).name).toBe('Secret quilt');
        expect(ownerLib.lists.map((l: any) => l.id)).toContain(privateList.id);
        expect(ownerLib.lists.find((l: any) => l.id === sharedId).published).toBeFalsy();
        const sharedCat = ownerLib.categories.find((c: any) => c.id === category.id);
        expect(sharedCat.categoryItems.map((ci: any) => ci.itemId)).not.toContain(secret.id);

        // The owner can remove the member, who then loses access.
        const removed = await owner.page.request.delete(url(`/api/plan/${owner.username}/${sharedId}/members/${member.username}`));
        expect(removed.status()).toBe(200);
        expect((await member.page.request.get(url(`/api/plan/${owner.username}/${sharedId}`))).status()).toBe(403);
        for (const u of [owner, member, stranger]) await u.context.close();
    });
});
