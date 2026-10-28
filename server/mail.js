// Outgoing email through Mailgun's API. Password resets, forgot-username
// and comment notifications all go through here.

import config from 'config';

export function mailEnabled() {
    return Boolean(config.get('mailgunAPIKey') && config.get('mailgunDomain'));
}

// Sender identity for password-reset and forgot-username email. Falls back to
// an address on the Mailgun sending domain, which Mailgun will always accept.
export function mailIdentity() {
    const from = (config.has('mailFrom') && config.get('mailFrom'))
        || `Waymark Gear <noreply@${config.get('mailgunDomain')}>`;
    const replyTo = (config.has('mailReplyTo') && config.get('mailReplyTo')) || from;
    return { from, replyTo };
}

export async function sendMail({ from, to, replyTo, subject, text }) {
    const apiKey = config.get('mailgunAPIKey');
    const domain = config.get('mailgunDomain');
    const body = new URLSearchParams({ from, to, subject, text, 'h:Reply-To': replyTo });
    const response = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
        method: 'POST',
        headers: { Authorization: `Basic ${Buffer.from(`api:${apiKey}`).toString('base64')}` },
        body,
    });
    if (!response.ok) throw new Error(`Mailgun error: ${response.status} ${await response.text()}`);
    return response.json();
}

