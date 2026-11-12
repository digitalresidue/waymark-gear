// The one-time Supporter offer: half price, recurring for as long as the
// subscription lasts, shown to a new account right after it signs up
// (client/views/start.vue) and never again.
//
// - A new account (email or Google) gets users.signup_offer_until, a day out.
// - "No thanks" closes it at once; so does the day running out. Subscribing
//   makes them a Supporter, which closes it too.
// - Checkout applies a Stripe coupon made for this (50% off, duration
//   "forever"): its id is stripe.signupCoupon. Without one, or without
//   Stripe set up, there's no offer and new accounts go straight to their
//   first pack.
//
// Half price for life means for the life of that subscription: Stripe keeps
// a "forever" coupon on it through every renewal, and drops it with the
// subscription if they cancel.

import config from 'config';
import express from 'express';

import knex from './db.js';
import { authenticateUser } from './auth.js';
import { logWithRequest } from './log.js';
import { billingEnabled, isSupporter, stripe, stripeCall, perks } from './billing.js';

const router = express.Router();

export const SIGNUP_OFFER_MS = 24 * 60 * 60 * 1000;

const coupon = () => String(stripe().signupCoupon || '').trim();

/** Is the offer open for this account right now? */
export function offerOpen(user, now = Date.now()) {
    if (!user || !billingEnabled() || !coupon()) return false;
    if (isSupporter(user)) return false;
    if (!user.signup_offer_until) return false;
    return new Date(user.signup_offer_until).getTime() > now;
}

/** What the offer screen shows: prices before and after. */
export function offerInfo(user, now = Date.now()) {
    const s = stripe();
    if (!offerOpen(user, now)) return { open: false };
    return {
        open: true,
        perks: perks(),
        until: new Date(user.signup_offer_until).toISOString(),
        monthly: s.signupMonthlyLabel || '$2.50',
        monthlyFull: s.monthlyLabel || '$5',
        yearly: s.priceYearly ? (s.signupYearlyLabel || '$24') : null,
        yearlyFull: s.priceYearly ? (s.yearlyLabel || '$48') : null,
    };
}

function requireJson(req, res, next) {
    if (!req.is('application/json')) return res.status(415).json({ message: 'Send JSON.' });
    next();
}

const signedIn = (handler) => (req, res) => authenticateUser(req, res, async (req, res, user) => {
    try {
        await handler(req, res, user);
    } catch (err) {
        logWithRequest(req, { message: 'signup offer error', err });
        if (!res.headersSent) res.status(502).json({ message: "Payments aren't working right now. Try again in a few minutes." });
    }
});

// Whether new accounts get the offer at all (the sign-up page mentions it).
router.get('/api/signup-offer/available', (req, res) => {
    res.set('Cache-Control', 'public, max-age=300');
    res.json({ available: Boolean(billingEnabled() && coupon()) });
});

router.get('/api/signup-offer', signedIn(async (req, res, user) => {
    res.set('Cache-Control', 'no-store');
    res.json(offerInfo(user));
}));

// "No thanks": it's gone for good.
router.post('/api/signup-offer/skip', requireJson, signedIn(async (req, res, user) => {
    if (user.signup_offer_until) await knex('users').where({ user_id: user.user_id }).update({ signup_offer_until: new Date() });
    res.json({ open: false });
}));

router.post('/api/signup-offer/checkout', requireJson, signedIn(async (req, res, user) => {
    if (!offerOpen(user)) return res.status(410).json({ message: 'That offer has ended. The Supporter plan is still on the Supporter page.' });
    const s = stripe();
    const yearly = req.body && req.body.interval === 'year' && s.priceYearly;
    const base = config.get('deployUrl');
    const session = await stripeCall('POST', '/v1/checkout/sessions', {
        mode: 'subscription',
        line_items: { 0: { price: yearly ? s.priceYearly : s.priceMonthly, quantity: 1 } },
        // Stripe doesn't take promotion codes alongside a discount.
        discounts: { 0: { coupon: coupon() } },
        success_url: `${base}/start?supporter=1`,
        cancel_url: `${base}/start`,
        client_reference_id: user.user_id,
        ...(user.stripe_customer_id ? { customer: user.stripe_customer_id } : { customer_email: user.email || undefined }),
        subscription_data: { metadata: { offer: 'signup' } },
    });
    logWithRequest(req, { message: 'signup offer checkout', interval: yearly ? 'year' : 'month' });
    res.json({ url: session.url });
}));

export default router;
