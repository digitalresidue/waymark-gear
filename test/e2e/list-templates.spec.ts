import { test, expect, Page } from '@playwright/test';

import { testRoot } from './utils';
import { registerUser, generateTestUser } from './auth-utils';
import { createCategory, addItem } from './test-helpers';

// List templates: mark a list as a template in its Settings, then start new
// lists from it in one click (New list → From a template) or from a trip.
// Copies use the same closet gear.

const url = (p: string) => new URL(p, testRoot).toString();

// What the server has saved (signing in again returns the library).
async function savedLibrary(page: Page) {
    const r = await page.request.post(url('/signin'), { data: {} });
    return JSON.parse((await r.json()).library);
}

test('a template starts new lists and trips\' lists in one click, with the same gear', async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    const u = generateTestUser('tmpl');
    await registerUser(page, u.username, u.password, u.email);
    await expect(page.getByText('Add new category', { exact: true })).toBeVisible();

    // An "Overnighter" list, marked as a template.
    const title = page.getByPlaceholder('Name your list', { exact: true });
    await title.fill('Overnighter');
    await title.blur();
    const shelter = await createCategory(page, 'Shelter');
    await addItem(shelter, 'Durston X-Mid 1', { weight: '28' });
    const sleep = await createCategory(page, 'Sleep');
    await addItem(sleep, 'EE Revelation 20', { weight: '20' });

    // No templates yet: the New list menu says how to make one.
    await page.getByTestId('rail-lists').click();
    await page.getByTestId('new-list').hover();
    await expect(page.getByTestId('new-list-templates')).toContainText('Use as a template');
    await page.mouse.move(900, 700);

    await page.locator('.wgRail #settings .lpTarget').first().click();
    await page.getByTestId('list-template-toggle').click();
    await page.keyboard.press('Escape');
    await expect(page.locator('#lists, #pinnedLists').getByTestId('list-template-tag')).toHaveCount(1);
    await expect.poll(async () => (await savedLibrary(page)).lists.filter((l: { template?: boolean }) => l.template).length, { timeout: 20000 }).toBe(1);

    // New list → From a template: a copy, opened, named after the template.
    await page.getByTestId('new-list').hover();
    const lib0 = await savedLibrary(page);
    const templateId = lib0.lists.find((l: { template?: boolean }) => l.template).id;
    await page.getByTestId(`new-from-template-${templateId}`).click();
    await expect(title).toHaveValue('Overnighter');
    await expect(page.locator('input.lpName')).toHaveCount(await page.locator('input.lpName').count());
    const names = await page.locator('input.lpName').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
    expect(names).toEqual(expect.arrayContaining(['Durston X-Mid 1', 'EE Revelation 20']));
    // The copy isn't a template itself.
    await expect(page.locator('#lists, #pinnedLists').getByTestId('list-template-tag')).toHaveCount(1);

    // Same closet gear: the copy's items are the template's items.
    await expect.poll(async () => (await savedLibrary(page)).lists.length, { timeout: 20000 }).toBe(lib0.lists.length + 1);
    const lib1 = await savedLibrary(page);
    const itemsOf = (listId: number) => lib1.lists.find((l: { id: number }) => l.id === listId).categoryIds
        .flatMap((cid: number) => lib1.categories.find((c: { id: number }) => c.id === cid).categoryItems.map((ci: { itemId: number }) => ci.itemId)).sort();
    const copy = lib1.lists.find((l: { id: number; template?: boolean }) => !l.template && l.id !== templateId && l.name === 'Overnighter');
    expect(itemsOf(copy.id)).toEqual(itemsOf(templateId));

    // A trip with no list: start one from the template, named after the trip.
    const trip = await (await page.request.post(url('/api/trips'), { data: { title: 'Grayson Highlands', visibility: 'private' } })).json();
    await page.goto(url(`/trips/${trip.id}`));
    await expect(page.getByTestId('trip-template')).toBeVisible();
    await page.getByTestId('trip-template-use').click();
    await expect(page.getByTestId('trip-template-made')).toContainText('Grayson Highlands');
    await expect(page.getByTestId('trip-template')).toHaveCount(0);
    await expect.poll(async () => (await (await page.request.get(url(`/api/trips/${trip.id}`))).json()).list?.name ?? null, { timeout: 20000 }).toBe('Grayson Highlands');
});
