// The Supporter plan (Phase 7): $5 a month or $48 a year through Stripe.
// Supporters get plain product links (no affiliate tracking) and a badge.
// The site owner can also grant it, for any length of time or for good.
//
// Stripe does the paying: Checkout to subscribe, the customer portal to
// change or cancel. Its webhooks keep users.plan / plan_until current.
// Nothing here runs until the stripe settings are filled in (DEPLOY.md).

import crypto from 'node:crypto';

import express from 'express';
import config from 'config';

import knex from './db.js';
import { authenticateUser, authenticateAdmin } from './auth.js';
import { logWithRequest, logger } from './log.js';
import { forgetUserPages } from './page-cache.js';

const router = express.Router();
const GRACE_MS = 3 * 86400000; // a late renewal doesn't drop the badge at once
const ACTIVE = ['active', 'trialing', 'past_due'];

const stripe = () => (config.has('stripe') ? config.get('stripe') : {});
export const billingEnabled = () => Boolean(stripe().secretKey && stripe().priceMonthly);

export function isSupporter(user, now = Date.now()) {
    if (!user || user.plan !== 'supporter') return false;
    return !user.plan_until || new Date(user.plan_until).getTime() > now;
}

// Stripe takes form-encoded bodies with bracketed keys.
function form(obj, prefix = '', out = new URLSearchParams()) {
    for (const [k, v] of Object.entries(obj)) {
        if (v === undefined || v === null) continue;
        const key = prefix ? `${prefix}[${k}]` : k;
        if (typeof v === 'object') form(v, key, out);
        else out.append(key, String(v));
    }
    return out;
}

async function stripeCall(method, path, body) {
    const s = stripe();
    const res = await fetch(`${s.apiBase || 'https://api.stripe.com'}${path}`, {
        method,
        headers: { Authorization: `Bearer ${s.secretKey}`, ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
        body: body ? form(body).toString() : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((json.error && json.error.message) || `Stripe error ${res.status}`);
    return json;
}

function planInfo(user) {
    const s = stripe();
    return {
        available: billingEnabled(),
        monthly: s.monthlyLabel || '$5',
        yearly: s.priceYearly ? (s.yearlyLabel || '$48') : null,
        supporter: isSupporter(user),
        until: user && user.plan_until ? user.plan_until : null,
        source: user ? user.plan_source || '' : '',
        canManage: Boolean(user && user.stripe_customer_id && billingEnabled()),
    };
}

// JSON only: a cross-site form can't send it without a preflight.
function requireJson(req, res, next) {
    if (!req.is('application/json')) return res.status(415).json({ message: 'Send JSON.' });
    next();
}

const signedIn = (handler) => (req, res) => authenticateUser(req, res, async (req, res, user) => {
    try {
        await handler(req, res, user);
    } catch (err) {
        logWithRequest(req, { message: 'billing error', err });
        if (!res.headersSent) res.status(502).json({ message: "Payments aren't working right now. Try again in a few minutes." });
    }
});

router.get('/api/plan', signedIn(async (req, res, user) => {
    res.set('Cache-Control', 'no-store');
    res.json(planInfo(user));
}));

router.post('/api/plan/checkout', requireJson, signedIn(async (req, res, user) => {
    if (!billingEnabled()) return res.status(404).json({ message: "The Supporter plan isn't available yet." });
    if (isSupporter(user) && user.plan_source === 'stripe') return res.status(400).json({ message: "You're already a Supporter. Thank you!" });
    const s = stripe();
    const yearly = req.body && req.body.interval === 'year' && s.priceYearly;
    const base = config.get('deployUrl');
    const session = await stripeCall('POST', '/v1/checkout/sessions', {
        mode: 'subscription',
        line_items: { 0: { price: yearly ? s.priceYearly : s.priceMonthly, quantity: 1 } },
        success_url: `${base}/supporter?welcome=1`,
        cancel_url: `${base}/supporter`,
        client_reference_id: user.user_id,
        ...(user.stripe_customer_id ? { customer: user.stripe_customer_id } : { customer_email: user.email || undefined }),
        allow_promotion_codes: 'true',
    });
    res.json({ url: session.url });
}));

router.post('/api/plan/portal', requireJson, signedIn(async (req, res, user) => {
    if (!billingEnabled() || !user.stripe_customer_id) return res.status(404).json({ message: 'No subscription to manage.' });
    const session = await stripeCall('POST', '/v1/billing_portal/sessions', {
        customer: user.stripe_customer_id,
        return_url: `${config.get('deployUrl')}/supporter`,
    });
    res.json({ url: session.url });
}));

// ---- webhooks ---------------------------------------------------------------

export function verifySignature(raw, header, secret, now = Date.now()) {
    if (!secret || !header) return false;
    const parts = Object.fromEntries(String(header).split(',').map((p) => p.split('=')).filter((p) => p.length === 2).map(([k, v]) => [k, v]));
    const signatures = String(header).split(',').filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
    const t = Number(parts.t);
    if (!t || Math.abs(now / 1000 - t) > 300 || !signatures.length) return false;
    const expected = crypto.createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
    return signatures.some((sig) => sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)));
}

// Newer Stripe API versions keep the period on the subscription item.
const periodEnd = (sub) => sub.current_period_end || (sub.items && sub.items.data && sub.items.data[0] && sub.items.data[0].current_period_end) || null;

async function applySubscription(sub) {
    const user = await knex('users').where({ stripe_customer_id: String(sub.customer) }).first();
    if (!user) return;
    if (ACTIVE.includes(sub.status)) {
        const end = periodEnd(sub);
        await knex('users').where({ user_id: user.user_id }).update({
            plan: 'supporter',
            plan_source: 'stripe',
            plan_until: end ? new Date(end * 1000 + GRACE_MS) : null,
        });
    } else if (user.plan_source === 'stripe') {
        await knex('users').where({ user_id: user.user_id }).update({ plan: 'free', plan_until: null, plan_source: '' });
    }
    forgetUserPages(user.user_id); // the profile badge
}

export async function webhookHandler(req, res) {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    if (!verifySignature(raw, req.get('stripe-signature'), stripe().webhookSecret)) {
        return res.status(400).json({ message: 'Bad signature.' });
    }
    let event;
    try {
        event = JSON.parse(raw);
    } catch {
        return res.status(400).json({ message: 'Bad JSON.' });
    }
    try {
        const obj = event.data && event.data.object;
        if (event.type === 'checkout.session.completed' && obj && obj.client_reference_id && obj.customer) {
            await knex('users').where({ user_id: obj.client_reference_id }).update({ stripe_customer_id: String(obj.customer) });
            if (obj.subscription) await applySubscription(await stripeCall('GET', `/v1/subscriptions/${encodeURIComponent(obj.subscription)}`));
        } else if (/^customer\.subscription\.(created|updated|deleted)$/.test(event.type) && obj) {
            await applySubscription(obj);
        }
        res.json({ received: true });
    } catch (err) {
        logger.error({ message: 'stripe webhook failed', type: event.type, err: { message: err.message } });
        // Stripe retries on errors.
        res.status(500).json({ message: 'Try again.' });
    }
}

// ---- owner: grant or end Supporter by hand ------------------------------------

const admin = (handler) => (req, res) => authenticateAdmin(req, res, async (req, res, user) => {
    try {
        await handler(req, res, user);
    } catch (err) {
        logWithRequest(req, { message: 'supporters admin error', err });
        if (!res.headersSent) res.status(500).json({ message: 'An error occurred.' });
    }
});

router.get('/api/admin/supporters', admin(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const rows = await knex('users').where({ plan: 'supporter' }).orderBy('username')
        .select('username', 'plan_until', 'plan_source');
    res.json({ supporters: rows.map((r) => ({ username: r.username, until: r.plan_until, source: r.plan_source, active: isSupporter({ plan: 'supporter', plan_until: r.plan_until }) })) });
}));

router.post('/api/admin/supporters', requireJson, admin(async (req, res) => {
    const username = String((req.body && req.body.username) || '').trim().toLowerCase();
    const months = Number(req.body && req.body.months);
    const user = await knex('users').whereRaw('lower(username) = ?', [username]).first();
    if (!user) return res.status(404).json({ message: 'No such user.' });
    if (user.plan_source === 'stripe' && isSupporter(user)) return res.status(400).json({ message: 'They already pay through Stripe.' });
    const until = Number.isFinite(months) && months > 0 ? new Date(Date.now() + Math.min(months, 1200) * 30 * 86400000) : null;
    await knex('users').where({ user_id: user.user_id }).update({ plan: 'supporter', plan_source: 'granted', plan_until: until });
    forgetUserPages(user.user_id);
    res.json({ username: user.username, until });
}));

router.delete('/api/admin/supporters/:username', admin(async (req, res) => {
    const rows = await knex('users').whereRaw('lower(username) = ?', [String(req.params.username).toLowerCase()])
        .where({ plan_source: 'granted' }).update({ plan: 'free', plan_until: null, plan_source: '' }).returning('user_id');
    rows.forEach((r) => forgetUserPages(r.user_id));
    if (!rows.length) return res.status(404).json({ message: 'No granted Supporter by that name (Stripe subscriptions are cancelled in Stripe).' });
    res.json({ ok: true });
}));

export default router;
