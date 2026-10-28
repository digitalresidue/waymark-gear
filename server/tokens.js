// Personal API tokens, for the REST API (/api/v1) and the MCP server (/mcp).
//
// A token is "wg_" + 32 random bytes. Only its sha256 is stored; the token
// itself is shown once when it's made. Scope "read" can look, "write" can
// also add and change gear and lists. Tokens made by an AI assistant's
// sign-in (server/oauth.js) are listed here too and revoked the same way.

import crypto from 'node:crypto';

import knex from './db.js';

export const MAX_TOKENS = 20;
export const SCOPES = ['read', 'write'];

export class TokenError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.status = status;
    }
}

export const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

function present(t) {
    return {
        id: Number(t.id),
        name: t.name,
        prefix: t.prefix,
        scope: t.scope,
        createdAt: t.created_at,
        lastUsedAt: t.last_used_at,
        expiresAt: t.expires_at || null,
        viaApp: t.client_id ? true : false,
    };
}

export async function listTokens(user) {
    const rows = await knex('api_tokens').where({ user_id: user.user_id }).orderBy('created_at', 'desc');
    return rows.map(present);
}

// { name, scope } -> { token, ...summary }. The raw token is returned once.
export async function createToken(user, { name, scope, clientId = null, expiresAt = null } = {}, db = knex) {
    const label = String(name || '').trim().slice(0, 80);
    if (!label) throw new TokenError('Give the token a name, like "Claude on my laptop".');
    if (!SCOPES.includes(scope)) throw new TokenError('Scope is read or write.');
    const count = await db('api_tokens').where({ user_id: user.user_id }).count({ n: '*' }).first();
    if (Number(count.n) >= MAX_TOKENS) throw new TokenError(`You can have up to ${MAX_TOKENS} tokens. Revoke one you don't use.`);
    const token = `wg_${crypto.randomBytes(32).toString('base64url')}`;
    const [row] = await db('api_tokens').insert({
        user_id: user.user_id,
        name: label,
        token_hash: hashToken(token),
        prefix: token.slice(0, 10),
        scope,
        client_id: clientId,
        expires_at: expiresAt,
    }).returning('*');
    return { token, ...present(row) };
}

export async function revokeToken(user, id) {
    const n = await knex('api_tokens').where({ id: Number(id) || 0, user_id: user.user_id }).del();
    if (!n) throw new TokenError('No such token.', 404);
    return { ok: true };
}

// Bearer token -> { user, scope }, or null. Last use is recorded at most
// once a minute per token.
export async function userForToken(raw) {
    if (typeof raw !== 'string' || !raw.startsWith('wg_') || raw.length > 100) return null;
    const row = await knex('api_tokens').where({ token_hash: hashToken(raw) }).first();
    if (!row) return null;
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return null;
    const user = await knex('users').where({ user_id: row.user_id }).first();
    if (!user) return null;
    if (!row.last_used_at || Date.now() - new Date(row.last_used_at).getTime() > 60000) {
        knex('api_tokens').where({ id: row.id }).update({ last_used_at: knex.fn.now() }).catch(() => {});
    }
    return { user, scope: row.scope, tokenId: Number(row.id) };
}

export function bearer(req) {
    const h = req.get('authorization') || '';
    const m = /^Bearer\s+(\S+)$/i.exec(h);
    return m ? m[1] : null;
}
