import crypto from 'node:crypto';

import { test, expect, Page, Browser, APIRequestContext } from '@playwright/test';

import { registerUser, generateTestUser } from './auth-utils';
import { createCategoryWithItem, addItem, showCloset } from './test-helpers';
import { testRoot } from './utils';

// Phase 7: gear check, wishlist, comparisons, price history, affiliate
// links, the Supporter plan, API tokens, the REST API, MCP and OAuth.

const url = (p: string) => new URL(p, testRoot).toString();
const saved = (page: Page) => page.waitForResponse((r) => r.url().includes('saveLibrary') && r.status() === 200, { timeout: 20000 });
// The library, once the app has loaded it.
async function lib(page: Page) {
    await page.waitForFunction(() => (window as any).LighterPack && (window as any).LighterPack.$store.state.library);
    return page.evaluate(() => JSON.parse(JSON.stringify((window as any).LighterPack.$store.state.library.save())));
}

async function newUser(browser: Browser, prefix: string, options = {}) {
    const context = await browser.newContext(options);
    const page = await context.newPage();
    const u = generateTestUser(prefix);
    await registerUser(page, u.username, u.password, u.email);
    await expect(page.getByTestId('item-row').first()).toBeVisible();
    return { context, page, ...u };
}

async function signInOwner(browser: Browser, workerIndex: number) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const username = `wge2eowner${workerIndex}`;
    const register = await page.request.post(url('/register'), { data: { username, email: `${username}@example.com`, password: 'testtest' } });
    if (register.status() !== 200) expect((await page.request.post(url('/signin'), { data: { username, password: 'testtest' } })).status()).toBe(200);
    return { context, page, username };
}

const CSV_HEAD = 'sku,name,brand,category,description,weight,unit,price,url,worn_default,consumable_default,tags,status,affiliate_url';

async function importCsv(request: APIRequestContext, rows: string[]) {
    const res = await request.post(url('/api/admin/catalog/import/apply'), { data: { csv: [CSV_HEAD, ...rows].join('\n') } });
    expect(res.status()).toBe(200);
}

async function catalogId(request: APIRequestContext, q: string) {
    // Search ranks loosely: pick the item with exactly this name.
    const found = await (await request.get(url(`/api/catalog?q=${encodeURIComponent(q)}`))).json();
    const hit = found.items.find((i: any) => i.name === q);
    expect(hit).toBeTruthy();
    return hit.id as string;
}

const tag = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

test.describe('Phase 7: gear check, wishlist, compare, prices', () => {
    test('the gear check scores essentials, remembers "not needed", and suggests lighter gear', async ({ browser }, testInfo) => {
        const t = tag();
        const owner = await signInOwner(browser, testInfo.workerIndex);
        await importCsv(owner.page.request, [
            `${t}-h,Heavy tent ${t},Bigco,Cat${t},,60,oz,200,https://shop.example.com/heavy,false,false,,published,`,
            `${t}-l,Light tent ${t},Trailco,Cat${t},,14,oz,450,https://shop.example.com/light,false,false,,published,`,
        ]);
        const heavy = await (await owner.page.request.get(url(`/api/catalog?q=Heavy tent ${t}`))).json();

        const u = await newUser(browser, 'p7chk');
        const { page } = u;
        const { category } = await createCategoryWithItem(page, `Cat${t}`, 'First aid kit', { weight: '3', unit: 'oz' });
        await addItem(category, 'Sawyer Squeeze filter', { weight: '3', unit: 'oz' });
        let done = saved(page);
        await page.evaluate(({ entry }) => {
            const s = (window as any).LighterPack.$store;
            const list = s.state.library.getListById(s.state.library.defaultListId);
            const cat = list.categoryIds.map((id: number) => s.state.library.getCategoryById(id)).find((c: any) => c.name.startsWith('Cat'));
            s.commit('addCatalogItem', { categoryId: cat.id, entry });
        }, { entry: heavy.items[0] });
        await done;

        const panel = page.getByTestId('gear-insights');
        await panel.getByTestId('insights-toggle').click();
        await expect(panel.getByTestId('covered-firstaid')).toBeVisible();
        await expect(panel.getByTestId('covered-water')).toBeVisible();
        await expect(panel.getByTestId('covered-shelter')).toBeVisible();
        await expect(panel.getByTestId('missing-light')).toBeVisible();
        const before = Number(await panel.getByTestId('insights-score').innerText());

        done = saved(page);
        await panel.getByTestId('not-needed-rain').click();
        await done;
        await expect(panel.getByTestId('skipped-rain')).toBeVisible();
        expect(Number(await panel.getByTestId('insights-score').innerText())).toBeGreaterThan(before);

        // A lighter tent from the catalog, with the weight it saves.
        const alt = panel.getByTestId('alternative').filter({ hasText: `Heavy tent ${t}` });
        await expect(alt).toContainText(`Light tent ${t}`);
        await expect(alt).toContainText('saves');
        done = saved(page);
        await alt.getByTestId('alternative-wish').first().click();
        await done;
        await expect(alt.getByTestId('alternative-wish').first()).toHaveText('On wishlist');

        await page.reload();
        const l = await lib(page);
        expect(l.lists.find((x: any) => x.id === l.defaultListId).notNeeded).toEqual(['rain']);
        const wish = l.items.find((i: any) => i.name === `Light tent ${t}`);
        expect(wish.wishlist).toBe(true);

        // The wishlist sits apart in the closet; "Got it" moves it in.
        await page.goto(url('/gear'));
        await page.getByTestId('gear-filter-wishlist').click();
        await expect(page.getByTestId('gear-row')).toHaveCount(1);
        done = saved(page);
        await showCloset(page);
        await page.getByTestId('closet-got-it').click();
        await done;
        await expect(page.getByTestId('gear-filter-wishlist')).toHaveCount(0);
        for (const c of [owner.context, u.context]) await c.close();
    });

    test('price history, a wishlist price-drop alert, and comparing gear side by side', async ({ browser }, testInfo) => {
        const t = tag();
        const owner = await signInOwner(browser, testInfo.workerIndex);
        await importCsv(owner.page.request, [
            `${t}-a,Quilt A ${t},Trailco,Sleep,,21,oz,320,https://shop.example.com/a,false,false,,published,`,
            `${t}-b,Quilt B ${t},Packco,Sleep,,24,oz,260,https://shop.example.com/b,false,false,,published,`,
        ]);
        const a = await catalogId(owner.page.request, `Quilt A ${t}`);
        const b = await catalogId(owner.page.request, `Quilt B ${t}`);

        // A hiker wishlists quilt A from its gear page.
        const u = await newUser(browser, 'p7price');
        await u.page.goto(url(`/g/${a}`));
        await u.page.getByTestId('gear-wish').click();
        await expect(u.page).toHaveURL(/\/gear$/);
        await expect(u.page.getByTestId('gear-row')).toContainText(`Quilt A ${t}`);
        await expect.poll(async () => (await lib(u.page)).items.some((i: any) => i.catalogId === a && i.wishlist), { timeout: 15000 }).toBe(true);
        await u.page.waitForResponse((r) => r.url().includes('saveLibrary') && r.status() === 200, { timeout: 20000 }).catch(() => {});

        // The price drops: history and a notification.
        const item = (await (await owner.page.request.get(url(`/api/admin/catalog?q=Quilt A ${t}&status=all`))).json()).items[0];
        const put = await owner.page.request.put(url(`/api/admin/catalog/${a}`), { data: { ...item, price: '279' } });
        expect(put.status()).toBe(200);
        await expect.poll(async () => {
            const inbox = await (await u.page.request.get(url('/api/notifications'))).json();
            return inbox.items.map((n: any) => n.kind);
        }, { timeout: 15000 }).toContain('price');
        const inbox = await (await u.page.request.get(url('/api/notifications'))).json();
        const drop = inbox.items.find((n: any) => n.kind === 'price');
        expect(drop.listName).toContain('$279');
        expect(drop.listName).toContain('was $320');
        expect(drop.url).toBe(`/g/${a}`);

        await u.page.goto(url(`/g/${a}`));
        await expect(u.page.getByTestId('price-history')).toBeVisible();
        await expect(u.page.getByTestId('price-lowest')).toHaveText('$279');

        // Compare: A is lighter, B is cheaper.
        await u.page.goto(url(`/compare?ids=${a},${b}`));
        await expect(u.page.getByTestId('compare-col')).toHaveCount(2);
        const weights = u.page.getByTestId('compare-weight');
        await expect(weights.first()).toContainText('lightest');
        await expect(u.page.getByTestId('compare-table')).toContainText('cheapest');
        // Search adds a column.
        await u.page.goto(url(`/compare?ids=${a}`));
        await u.page.getByTestId('compare-search').fill(`Quilt B ${t}`);
        await u.page.getByTestId('compare-result').first().click();
        await expect(u.page.getByTestId('compare-col')).toHaveCount(2);
        for (const c of [owner.context, u.context]) await c.close();
    });
});

test.describe('Phase 7: affiliate links and the Supporter plan', () => {
    test('buy links carry the affiliate code, except for Supporters; clicks are counted', async ({ browser }, testInfo) => {
        const t = tag();
        const owner = await signInOwner(browser, testInfo.workerIndex);
        await importCsv(owner.page.request, [
            `${t}-r,Ruled pack ${t},Trailco,Packs,,30,oz,250,https://www.ruled-${t}.example.com/pack?id=1,false,false,,published,`,
            `${t}-o,Own-link stove ${t},Trailco,Kitchen,,3,oz,40,https://shop.example.com/stove,false,false,,published,https://partner.example.com/track?u=stove-${t}`,
        ]);
        const ruled = await catalogId(owner.page.request, `Ruled pack ${t}`);
        const own = await catalogId(owner.page.request, `Own-link stove ${t}`);
        // The affiliate link never shows in the public catalog.
        const pub = await (await owner.page.request.get(url(`/api/catalog?ids=${own}`))).json();
        expect(pub.items[0].affiliateUrl).toBeUndefined();

        const rules = await (await owner.page.request.get(url('/api/admin/affiliate'))).json();
        const others = rules.settings.rules.filter((r: any) => !r.domain.startsWith('ruled-'));
        const put = await owner.page.request.put(url('/api/admin/affiliate'), {
            data: { enabled: true, rules: [...others, { domain: `ruled-${t}.example.com`, param: 'tag', value: 'waymark-20' }] },
        });
        expect(put.status()).toBe(200);

        const visitor = await browser.newContext();
        const go = async (ctx: APIRequestContext, id: string) => (await ctx.get(url(`/go/${id}?from=gear`), { maxRedirects: 0 })).headers().location;
        expect(await go(visitor.request, ruled)).toBe(`https://www.ruled-${t}.example.com/pack?id=1&tag=waymark-20`);
        expect(await go(visitor.request, own)).toBe(`https://partner.example.com/track?u=stove-${t}`);

        // The gear page shows the Buy link and says it may earn a commission.
        const vp = await visitor.newPage();
        await vp.goto(url(`/g/${own}`));
        await expect(vp.getByTestId('gear-buy')).toHaveAttribute('href', `/go/${own}?from=gear`);
        await expect(vp.getByTestId('gear-buy')).toHaveAttribute('rel', /sponsored/);
        await expect(vp.locator('.wgDisclosure')).toContainText('commission');

        // A Supporter gets the plain link.
        const fan = await newUser(browser, 'p7sup');
        const grant = await owner.page.request.post(url('/api/admin/supporters'), { data: { username: fan.username, months: 12 } });
        expect(grant.status()).toBe(200);
        expect(await go(fan.page.request, ruled)).toBe(`https://www.ruled-${t}.example.com/pack?id=1`);
        expect(await go(fan.page.request, own)).toBe('https://shop.example.com/stove');
        await fan.page.goto(url(`/@${fan.username}`));
        await expect(fan.page.getByTestId('supporter-badge')).toBeVisible();

        const report = await (await owner.page.request.get(url('/api/admin/affiliate'))).json();
        const row = report.clicks.items.find((i: any) => i.id === own);
        expect(row.clicks).toBe(2);
        expect(row.affiliateClicks).toBe(1);
        for (const c of [owner.context, visitor, fan.context]) await c.close();
    });

    test('subscribe through Stripe Checkout, then cancel in the portal', async ({ browser }) => {
        const u = await newUser(browser, 'p7pay');
        const { page } = u;
        await page.goto(url('/supporter'));
        await page.getByTestId('supporter-monthly').click();
        await expect(page).toHaveURL(/\/supporter\?welcome=1$/);
        await expect(page.getByTestId('supporter-welcome')).toBeVisible({ timeout: 20000 });
        await expect(page.getByTestId('supporter-status')).toContainText('through');
        const plan = await (await page.request.get(url('/api/plan'))).json();
        expect(plan.supporter).toBe(true);
        expect(plan.source).toBe('stripe');
        // About a month, plus a few days' grace.
        const days = (new Date(plan.until).getTime() - Date.now()) / 86400000;
        expect(days).toBeGreaterThan(30);
        expect(days).toBeLessThan(35);

        await page.getByTestId('supporter-manage').click();
        await expect(page).toHaveURL(/\/supporter$/);
        await expect.poll(async () => (await (await page.request.get(url('/api/plan'))).json()).supporter, { timeout: 15000 }).toBe(false);

        // Webhooks must be signed by Stripe.
        const forged = await page.request.post(url('/stripe/webhook'), {
            headers: { 'Content-Type': 'application/json', 'Stripe-Signature': `t=${Math.floor(Date.now() / 1000)},v1=${'0'.repeat(64)}` },
            data: JSON.stringify({ type: 'customer.subscription.updated', data: { object: { customer: 'x', status: 'active' } } }),
        });
        expect(forged.status()).toBe(400);
        await u.context.close();
    });
});

test.describe('Phase 7: API, MCP and AI assistant sign-in', () => {
    const rpc = (request: APIRequestContext, token: string | null, body: any) => request.post(url('/mcp'), {
        headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        data: body,
    });

    test('personal tokens: read and write scopes on the REST API and MCP', async ({ browser }) => {
        const u = await newUser(browser, 'p7api');
        const { page } = u;
        const title = page.getByPlaceholder('Name your list', { exact: true });
        const named = saved(page);
        await title.fill('API kit');
        await title.blur();
        await named;

        await page.goto(url('/developers'));
        await expect(page.getByTestId('mcp-url')).toHaveValue(/\/mcp$/);
        await page.getByTestId('token-name').fill('Scripts');
        await page.getByTestId('token-create').click();
        const read = await page.getByTestId('token-value').inputValue();
        expect(read).toMatch(/^wg_/);
        await expect(page.getByTestId('token-row')).toHaveCount(1);

        const api = await browser.newContext();
        const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
        expect((await api.request.get(url('/api/v1/lists'))).status()).toBe(401);
        const lists = await (await api.request.get(url('/api/v1/lists'), { headers: auth(read) })).json();
        expect(lists.lists.map((l: any) => l.name)).toContain('API kit');
        const listId = lists.lists.find((l: any) => l.name === 'API kit').id;
        expect((await api.request.post(url('/api/v1/gear'), { headers: auth(read), data: { name: 'Nope' } })).status()).toBe(403);

        const write = (await (await page.request.post(url('/api/tokens'), { data: { name: 'Writer', scope: 'write' } })).json()).token;
        const added = await api.request.post(url(`/api/v1/lists/${listId}/items`), { headers: auth(write), data: { category: 'Sleep', name: 'API quilt', weight: 20, unit: 'oz' } });
        expect(added.status()).toBe(200);
        expect((await added.json()).added.name).toBe('API quilt');
        const check = await (await api.request.get(url(`/api/v1/lists/${listId}/check`), { headers: auth(read) })).json();
        expect(check.covered.map((c: any) => c.id)).toContain('sleep');
        expect(typeof check.readiness.score).toBe('number');

        // The open editor hears about it and shows the new gear.
        await page.goto(url('/'));
        await expect(page.getByTestId('item-row').first()).toBeVisible();
        await expect.poll(async () => (await lib(page)).items.some((i: any) => i.name === 'API quilt'), { timeout: 15000 }).toBe(true);

        // MCP: no token, a read token, a write token.
        const anon = await rpc(api.request, null, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
        expect(anon.status()).toBe(401);
        expect(anon.headers()['www-authenticate']).toContain('resource_metadata=');
        const init = await (await rpc(api.request, read, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } })).json();
        expect(init.result.protocolVersion).toBe('2025-06-18');
        expect(init.result.serverInfo.name).toBe('waymark-gear');
        expect((await rpc(api.request, read, { jsonrpc: '2.0', method: 'notifications/initialized' })).status()).toBe(202);
        const tools = await (await rpc(api.request, read, { jsonrpc: '2.0', id: 2, method: 'tools/list' })).json();
        expect(tools.result.tools.map((x: any) => x.name)).toEqual(expect.arrayContaining(['get_lists', 'check_list', 'add_to_list']));
        const got = await (await rpc(api.request, read, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_list', arguments: { list_id: listId } } })).json();
        expect(got.result.structuredContent.name).toBe('API kit');
        const denied = await (await rpc(api.request, read, { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'add_gear', arguments: { name: 'X' } } })).json();
        expect(denied.result.isError).toBe(true);
        const wrote = await (await rpc(api.request, write, { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'add_gear', arguments: { name: 'MCP spork', weight: 0.4, unit: 'oz', wishlist: true } } })).json();
        expect(wrote.result.structuredContent.wishlist).toBe(true);

        // Revoking a token stops it at once.
        await page.goto(url('/developers'));
        await page.getByTestId('token-row').filter({ hasText: 'Scripts' }).getByTestId('token-revoke').click();
        await expect(page.getByTestId('token-row')).toHaveCount(1);
        expect((await api.request.get(url('/api/v1/me'), { headers: auth(read) })).status()).toBe(401);
        for (const c of [u.context, api]) await c.close();
    });

    test('an AI assistant connects through sign-in (OAuth with PKCE)', async ({ browser }) => {
        const u = await newUser(browser, 'p7oauth');
        const { page } = u;
        const app = await browser.newContext();

        const meta = await (await app.request.get(url('/.well-known/oauth-protected-resource/mcp'))).json();
        expect(meta.resource).toMatch(/\/mcp$/);
        const as = await (await app.request.get(url('/.well-known/oauth-authorization-server'))).json();
        expect(as.code_challenge_methods_supported).toEqual(['S256']);

        const callback = 'http://localhost:4567/callback';
        expect((await app.request.post(url('/oauth/register'), { data: { client_name: 'Evil', redirect_uris: ['http://evil.example.com/cb'] } })).status()).toBe(400);
        const reg = await (await app.request.post(url('/oauth/register'), { data: { client_name: 'Test Assistant', redirect_uris: [callback] } })).json();

        const verifier = crypto.randomBytes(32).toString('base64url');
        const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
        const authorize = `/oauth/authorize?response_type=code&client_id=${reg.client_id}&redirect_uri=${encodeURIComponent(callback)}&code_challenge=${challenge}&code_challenge_method=S256&state=xyz&scope=read%20write`;

        // Signed out: sign in first, then straight back to the consent page.
        const stranger = await browser.newContext();
        const sp = await stranger.newPage();
        await sp.goto(url(authorize));
        await expect(sp).toHaveURL(/\/signin\?next=/);
        await stranger.close();

        // Nothing listens on the callback; the browser trying to go there is
        // what we're after (page.route doesn't see redirect targets).
        let landed = '';
        page.on('request', (r) => {
            if (r.url().startsWith('http://localhost:4567/')) landed = r.url();
        });
        await page.goto(url(authorize));
        await expect(page.getByTestId('oauth-consent')).toContainText('Test Assistant');
        await expect(page.getByTestId('oauth-destination')).toContainText('localhost:4567');
        await expect(page.getByTestId('oauth-write')).toBeChecked();
        await page.getByTestId('oauth-allow').click();
        await expect.poll(() => landed).toContain('code=');
        const back = new URL(landed);
        expect(back.searchParams.get('state')).toBe('xyz');
        const code = back.searchParams.get('code')!;

        // Wrong verifier fails, and burns the code.
        const token = async (v: string) => app.request.post(url('/oauth/token'), {
            form: { grant_type: 'authorization_code', code, redirect_uri: callback, client_id: reg.client_id, code_verifier: v },
        });
        const good = await token(verifier);
        expect(good.status()).toBe(200);
        const { access_token: access, scope } = await good.json();
        expect(scope).toBe('write');
        expect((await token(verifier)).status()).toBe(400);

        const res = await (await rpc(app.request, access, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_profile', arguments: {} } })).json();
        expect(res.result.structuredContent.username).toBe(u.username);

        // A fresh tab: the first one is stuck on the unreachable callback,
        // which Firefox never finishes loading.
        const dev = await u.context.newPage();
        await dev.goto(url('/developers'));
        await expect(dev.getByTestId('token-row').filter({ hasText: 'Test Assistant' })).toContainText('connected app');
        for (const c of [u.context, app]) await c.close();
    });
});
