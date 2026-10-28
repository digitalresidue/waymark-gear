// A stand-in for Stripe, for tests only.
//
// Enough of Stripe for server/billing.js: Checkout sessions, the customer
// portal, retrieving a subscription, and signed webhooks. Opening a checkout
// URL "pays" at once: it sends checkout.session.completed to the app and
// redirects to the success URL. Opening a portal URL cancels the
// subscription (customer.subscription.deleted) and goes back.
//
//   node test/support/fake-stripe.mjs   (FAKE_STRIPE_PORT, default 3998;
//   FAKE_STRIPE_APP, the app's base URL; FAKE_STRIPE_WEBHOOK_SECRET)

import crypto from 'node:crypto';
import http from 'node:http';

const port = Number(process.env.FAKE_STRIPE_PORT || 3998);
const base = `http://127.0.0.1:${port}`;
const app = process.env.FAKE_STRIPE_APP || 'http://127.0.0.1:3000';
const secret = process.env.FAKE_STRIPE_WEBHOOK_SECRET || 'whsec_test';
const apiKey = process.env.FAKE_STRIPE_KEY || 'sk_test_fake';

const sessions = new Map();
const subscriptions = new Map();
const portals = new Map();
const id = (prefix) => `${prefix}_${crypto.randomBytes(8).toString('hex')}`;

function readForm(req) {
    return new Promise((resolve) => {
        let data = '';
        req.on('data', (c) => { data += c; });
        req.on('end', () => resolve(Object.fromEntries(new URLSearchParams(data))));
    });
}

async function sendEvent(type, object) {
    const payload = JSON.stringify({ id: id('evt'), type, data: { object } });
    const t = Math.floor(Date.now() / 1000);
    const sig = crypto.createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
    const res = await fetch(`${app}/stripe/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Stripe-Signature': `t=${t},v1=${sig}` },
        body: payload,
    });
    if (!res.ok) throw new Error(`webhook ${type} -> ${res.status}`);
}

const json = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
};

http.createServer(async (req, res) => {
    const url = new URL(req.url, base);
    try {
        if (url.pathname === '/') return json(res, 200, { ok: true });

        if (url.pathname.startsWith('/v1/')) {
            if (req.headers.authorization !== `Bearer ${apiKey}`) return json(res, 401, { error: { message: 'Invalid API key' } });
            if (req.method === 'POST' && url.pathname === '/v1/checkout/sessions') {
                const f = await readForm(req);
                if (!f['line_items[0][price]']) return json(res, 400, { error: { message: 'Missing price' } });
                const s = { id: id('cs'), customer: f.customer || id('cus'), client_reference_id: f.client_reference_id, price: f['line_items[0][price]'], success_url: f.success_url };
                sessions.set(s.id, s);
                return json(res, 200, { id: s.id, url: `${base}/pay/${s.id}` });
            }
            if (req.method === 'POST' && url.pathname === '/v1/billing_portal/sessions') {
                const f = await readForm(req);
                const p = id('bps');
                portals.set(p, { customer: f.customer, return_url: f.return_url });
                return json(res, 200, { id: p, url: `${base}/portal/${p}` });
            }
            const m = /^\/v1\/subscriptions\/(.+)$/.exec(url.pathname);
            if (req.method === 'GET' && m && subscriptions.has(m[1])) return json(res, 200, subscriptions.get(m[1]));
            return json(res, 404, { error: { message: 'Not found' } });
        }

        const pay = /^\/pay\/(.+)$/.exec(url.pathname);
        if (pay && sessions.has(pay[1])) {
            const s = sessions.get(pay[1]);
            const yearly = /year/.test(s.price);
            const sub = {
                id: id('sub'),
                object: 'subscription',
                customer: s.customer,
                status: 'active',
                // Newer API versions: the period lives on the item.
                items: { data: [{ current_period_end: Math.floor(Date.now() / 1000) + (yearly ? 365 : 30) * 86400 }] },
            };
            subscriptions.set(sub.id, sub);
            await sendEvent('checkout.session.completed', { id: s.id, customer: s.customer, client_reference_id: s.client_reference_id, subscription: sub.id, mode: 'subscription' });
            res.writeHead(303, { Location: s.success_url });
            return res.end();
        }

        const portal = /^\/portal\/(.+)$/.exec(url.pathname);
        if (portal && portals.has(portal[1])) {
            const p = portals.get(portal[1]);
            for (const sub of subscriptions.values()) {
                if (sub.customer === p.customer && sub.status === 'active') {
                    sub.status = 'canceled';
                    await sendEvent('customer.subscription.deleted', sub);
                }
            }
            res.writeHead(303, { Location: p.return_url });
            return res.end();
        }
        json(res, 404, { error: { message: 'Not found' } });
    } catch (err) {
        json(res, 500, { error: { message: err.message } });
    }
}).listen(port, '127.0.0.1', () => {
    console.log(`fake stripe on ${base}`);
});
