// Notifications: one place that decides, per person and per kind, whether
// something shows in the app, goes by email, or neither. New kinds are added
// to KINDS and everything else (settings page, bell, email) picks them up.

import config from 'config';

import knex from './db.js';
import { mailEnabled, mailIdentity, sendMail } from './mail.js';
import { logger } from './log.js';

const EMAIL_GAP_MS = 15 * 60 * 1000;

// label: settings page. app/email: defaults. subject/line: email and bell text.
export const KINDS = {
    comment: {
        label: 'Comments on my lists', app: true, email: true,
        subject: (n) => `@${n.actor} commented on “${n.listName}”`,
    },
    suggestion: {
        label: 'Shakedown suggestions on my lists', app: true, email: true,
        subject: (n) => `@${n.actor} suggested a change to “${n.listName}”`,
    },
    reply: {
        label: 'Replies to my comments', app: true, email: true,
        subject: (n) => `@${n.actor} replied to you on “${n.listName}”`,
    },
    follow: {
        label: 'New followers', app: true, email: false,
        subject: (n) => `@${n.actor} started following you`,
    },
    invite: {
        label: 'Invitations to plan a list together', app: true, email: true,
        subject: (n) => `@${n.actor} invited you to plan “${n.listName}”`,
    },
    published: {
        label: 'Hikers I follow publish a list', app: true, email: false,
        subject: (n) => `@${n.actor} published “${n.listName}”`,
    },
};

export function preferences(user) {
    const saved = (user && user.notify_prefs) || {};
    const out = {};
    for (const [kind, spec] of Object.entries(KINDS)) {
        const p = saved[kind] || {};
        out[kind] = {
            app: p.app === undefined ? spec.app : Boolean(p.app),
            // The older single "email me" switch still turns all email off.
            email: user && user.notify_email === false ? false : (p.email === undefined ? spec.email : Boolean(p.email)),
        };
    }
    return out;
}

export function cleanPreferences(input) {
    const out = {};
    for (const kind of Object.keys(KINDS)) {
        const p = (input && input[kind]) || {};
        out[kind] = { app: p.app !== false, email: Boolean(p.email) };
    }
    return out;
}

// item: { recipientId, kind, actor, listName, externalId, commentId, excerpt, url }
// Writes in-app notifications inside `trx`; returns the email jobs to send
// after the transaction commits (see sendNotificationEmails).
export async function notify(trx, items) {
    const jobs = [];
    const ids = [...new Set(items.map((i) => i.recipientId))];
    if (!ids.length) return jobs;
    const users = new Map((await trx('users').whereIn('user_id', ids)
        .select('user_id', 'email', 'notify_email', 'notify_prefs')).map((u) => [u.user_id, u]));
    for (const item of items) {
        const user = users.get(item.recipientId);
        if (!user || !KINDS[item.kind]) continue;
        const prefs = preferences(user)[item.kind];
        if (prefs.app) {
            await trx('notifications').insert({
                user_id: item.recipientId,
                kind: item.kind,
                comment_id: item.commentId || null,
                external_id: item.externalId || '',
                list_name: String(item.listName || '').slice(0, 200),
                actor_username: item.actor,
                url: typeof item.url === 'string' && /^\/[^/]/.test(item.url) ? item.url.slice(0, 300) : '',
            });
        }
        if (prefs.email && user.email) jobs.push(item);
    }
    return jobs;
}

function itemUrl(item) {
    const base = config.get('deployUrl');
    if (item.url) return `${base}${item.url}`;
    if (item.externalId) return `${base}/r/${item.externalId}${item.commentId ? `#comment-${item.commentId}` : ''}`;
    return `${base}/notifications`;
}

// Fire and forget, after commit: email trouble never fails the action.
// At most one notification email per person every 15 minutes.
export function sendNotificationEmails(jobs) {
    if (!mailEnabled() || !jobs.length) return;
    setImmediate(async () => {
        for (const job of jobs) {
            try {
                const user = await knex('users').where({ user_id: job.recipientId }).first();
                if (!user || !user.email) continue;
                const last = user.last_notify_email_at ? new Date(user.last_notify_email_at).getTime() : 0;
                if (Date.now() - last < EMAIL_GAP_MS) continue;
                await knex('users').where({ user_id: user.user_id }).update({ last_notify_email_at: knex.fn.now() });
                const subject = KINDS[job.kind].subject(job);
                await sendMail({
                    ...mailIdentity(),
                    to: user.email,
                    subject,
                    text: `${subject}${job.excerpt ? `:\n\n${job.excerpt}` : '.'}\n\n${itemUrl(job)}\n\nChoose which emails you get: ${config.get('deployUrl')}/notifications\n`,
                });
            } catch (err) {
                logger.error({ message: 'notification email failed', err: { message: err.message } });
            }
        }
    });
}
