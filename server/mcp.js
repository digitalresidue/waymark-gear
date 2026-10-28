// MCP server: lets AI assistants (Claude, ChatGPT, Cursor...) read your
// closet and lists, run the gear check, search the catalog and, with write
// access, add and change gear.
//
// Streamable HTTP transport, stateless: every POST /mcp carries JSON-RPC and
// gets a JSON reply. Authorization is a bearer token: a personal token from
// the API page, or one issued when the assistant connects through sign-in
// (server/oauth.js), which is what the WWW-Authenticate header points to.

import express from 'express';
import config from 'config';
import rateLimit from 'express-rate-limit';

import * as gear from './gear-api.js';
import { bearer, userForToken } from './tokens.js';
import { logWithRequest } from './log.js';

const router = express.Router();
const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const SERVER_VERSION = '7.0.0';

const id = { type: 'integer', description: 'Id from get_lists or get_closet' };
const tool = (name, title, description, properties = {}, required = [], write = false) => ({
    name,
    title,
    description,
    inputSchema: { type: 'object', properties, required, additionalProperties: false },
    annotations: { title, readOnlyHint: !write, destructiveHint: false, idempotentHint: !write, openWorldHint: false },
    write,
});

export const TOOLS = [
    tool('get_profile', 'Profile summary', 'Who is signed in, their weight unit, and how many lists, gear items and wishlist items they have.'),
    tool('get_closet', 'Gear closet', "The user's gear closet: every item they own with weight, category, condition. Use include=wishlist for gear they want, retired for gear they no longer use.", {
        include: { type: 'string', enum: ['owned', 'wishlist', 'retired', 'all'], default: 'owned' },
        query: { type: 'string', description: 'Only items whose name, description or closet category contain this' },
    }),
    tool('get_lists', 'Pack lists', 'All of the user\'s pack lists with base, worn, consumable and total weight.'),
    tool('get_list', 'One pack list', 'A pack list in full: categories, items, quantities, worn/consumable flags, trip settings.', { list_id: id }, ['list_id']),
    tool('check_list', 'Gear check', 'Shakedown data for a list: readiness score, missing essentials, lighter catalog options with weight saved, what other hikers carry, and the calorie estimate if trip details are set.', { list_id: id }, ['list_id']),
    tool('search_catalog', 'Search gear catalog', 'Search the Waymark gear catalog by name or brand. Returns catalog ids, weights, prices.', {
        query: { type: 'string' },
        category: { type: 'string', description: 'e.g. Shelter, Sleep, Kitchen' },
        limit: { type: 'integer', minimum: 1, maximum: 25, default: 10 },
    }, ['query']),
    tool('add_gear', 'Add gear to closet', 'Add gear to the closet (or wishlist): give catalog_id from search_catalog, or a name with weight and unit.', {
        catalog_id: { type: 'string' },
        name: { type: 'string' },
        weight: { type: 'number' },
        unit: { type: 'string', enum: ['g', 'kg', 'oz', 'lb'] },
        description: { type: 'string' },
        closet_category: { type: 'string' },
        wishlist: { type: 'boolean', description: 'Add to the wishlist instead of the closet' },
    }, [], true),
    tool('update_gear', 'Update gear', 'Change a closet item: name, description, weight, closet category, condition (new, good, worn, replace), retired, wishlist.', {
        gear_id: id,
        name: { type: 'string' },
        description: { type: 'string' },
        weight: { type: 'number' },
        unit: { type: 'string', enum: ['g', 'kg', 'oz', 'lb'] },
        closet_category: { type: 'string' },
        condition: { type: 'string', enum: ['new', 'good', 'worn', 'replace', ''] },
        retired: { type: 'boolean' },
        wishlist: { type: 'boolean' },
    }, ['gear_id'], true),
    tool('create_list', 'Create pack list', 'Make a new pack list with optional category names.', {
        name: { type: 'string' },
        description: { type: 'string' },
        categories: { type: 'array', items: { type: 'string' } },
    }, ['name'], true),
    tool('add_to_list', 'Add gear to list', 'Put gear in a list category (made if missing): gear_id from the closet, catalog_id from the catalog, or a new item by name/weight/unit.', {
        list_id: id,
        category: { type: 'string' },
        gear_id: id,
        catalog_id: { type: 'string' },
        name: { type: 'string' },
        weight: { type: 'number' },
        unit: { type: 'string', enum: ['g', 'kg', 'oz', 'lb'] },
        qty: { type: 'integer', minimum: 1 },
        worn: { type: 'boolean' },
        consumable: { type: 'boolean' },
    }, ['list_id'], true),
    tool('remove_from_list', 'Remove gear from list', 'Take gear out of a list. It stays in the closet.', { list_id: id, gear_id: id }, ['list_id', 'gear_id'], true),
];

const RUN = {
    get_profile: (u) => gear.me(u),
    get_closet: (u, a) => gear.closet(u, { include: a.include, q: a.query }).then((g) => ({ gear: g })),
    get_lists: (u) => gear.lists(u).then((l) => ({ lists: l })),
    get_list: (u, a) => gear.listDetail(u, a.list_id),
    check_list: (u, a) => gear.checkList(u, a.list_id),
    search_catalog: (u, a) => gear.searchCatalog({ q: a.query, category: a.category, limit: a.limit }).then((c) => ({ items: c })),
    add_gear: (u, a) => gear.addGear(u, { catalogId: a.catalog_id, name: a.name, weight: a.weight, unit: a.unit, description: a.description, closetCategory: a.closet_category, wishlist: a.wishlist }),
    update_gear: (u, a) => gear.updateGear(u, a.gear_id, { name: a.name, description: a.description, weight: a.weight, unit: a.unit, closetCategory: a.closet_category, condition: a.condition, retired: a.retired, wishlist: a.wishlist }),
    create_list: (u, a) => gear.createList(u, a),
    add_to_list: (u, a) => gear.addToList(u, a.list_id, { category: a.category, gearId: a.gear_id, catalogId: a.catalog_id, name: a.name, weight: a.weight, unit: a.unit, qty: a.qty, worn: a.worn, consumable: a.consumable }),
    remove_from_list: (u, a) => gear.removeFromList(u, a.list_id, a.gear_id),
};

const ok = (rpcId, result) => ({ jsonrpc: '2.0', id: rpcId, result });
const fail = (rpcId, code, message) => ({ jsonrpc: '2.0', id: rpcId, error: { code, message } });
const toolResult = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], structuredContent: data });
const toolError = (message) => ({ content: [{ type: 'text', text: message }], isError: true });

async function handleMessage(msg, auth, req) {
    if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
        return fail(msg && msg.id !== undefined ? msg.id : null, -32600, 'Invalid request');
    }
    const isNotification = msg.id === undefined || msg.id === null;
    if (isNotification) return null;
    const params = msg.params || {};
    switch (msg.method) {
    case 'initialize':
        return ok(msg.id, {
            protocolVersion: PROTOCOL_VERSIONS.includes(params.protocolVersion) ? params.protocolVersion : PROTOCOL_VERSIONS[0],
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: 'waymark-gear', title: 'Waymark Gear', version: SERVER_VERSION },
            instructions: `Backpacking gear for @${auth.user.username} on Waymark Gear. Weights come as { mg, display }; quote the display value. `
                + 'Use check_list for shakedowns: it gives missing essentials and lighter catalog options. '
                + (auth.scope === 'write' ? 'This connection can change gear and lists; confirm with the user before changing anything.' : 'This connection is read-only.'),
        });
    case 'ping':
        return ok(msg.id, {});
    case 'tools/list':
        return ok(msg.id, { tools: TOOLS.map(({ write, ...t }) => t) }); // eslint-disable-line no-unused-vars
    case 'tools/call': {
        const t = TOOLS.find((x) => x.name === params.name);
        if (!t) return fail(msg.id, -32602, `Unknown tool: ${params.name}`);
        if (t.write && auth.scope !== 'write') {
            return ok(msg.id, toolError('This connection is read-only. Reconnect Waymark Gear with write access (or use a write token) to change gear.'));
        }
        try {
            return ok(msg.id, toolResult(await RUN[t.name](auth.user, params.arguments || {})));
        } catch (err) {
            if (err instanceof gear.GearApiError) return ok(msg.id, toolError(err.message));
            logWithRequest(req, { message: 'mcp tool error', tool: t.name, err });
            return ok(msg.id, toolError('Something went wrong on the server.'));
        }
    }
    default:
        return fail(msg.id, -32601, `Method not found: ${msg.method}`);
    }
}

const limit = config.get('rateLimit').enabled
    ? rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false, keyGenerator: (req) => bearer(req) || req.ip })
    : (_req, _res, next) => next();

export const resourceMetadataUrl = () => `${config.get('deployUrl')}/.well-known/oauth-protected-resource`;

router.post('/mcp', limit, async (req, res) => {
    const auth = await userForToken(bearer(req)).catch(() => null);
    if (!auth) {
        res.set('WWW-Authenticate', `Bearer resource_metadata="${resourceMetadataUrl()}"`);
        return res.status(401).json(fail(null, -32001, 'Sign in to Waymark Gear to connect.'));
    }
    const body = req.body;
    const batch = Array.isArray(body);
    const replies = (await Promise.all((batch ? body : [body]).map((m) => handleMessage(m, auth, req)))).filter(Boolean);
    if (!replies.length) return res.status(202).end();
    res.set('Cache-Control', 'no-store');
    res.json(batch ? replies : replies[0]);
});

// No server-to-client stream and no sessions.
router.get('/mcp', (req, res) => res.status(405).set('Allow', 'POST').end());
router.delete('/mcp', (req, res) => res.status(405).set('Allow', 'POST').end());

export default router;
