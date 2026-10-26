import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import fs from 'fs';
import express from 'express';
import { customAlphabet } from 'nanoid';
import { promisify } from 'util';
import formidable from 'formidable';
import config from 'config';
import knex from './db.js';
import { logWithRequest } from './log.js';
import { applyCatalog } from './catalog.js';
import { syncPublishedKits } from './kits.js';
import { applyChanges, LibraryError, loadLibrary, normalizeLibrary, replaceLibrary } from './library-store.js';
import { authenticateUser, isAdmin, isModerator, verifyPassword, generateSession, startSession, hashSessionToken, sessionCookieOptions, issueResetToken, hashResetToken, resetPasswordUrl, RESET_TOKEN_TTL_MS } from './auth.js';
import { sniffImage, storeImage } from './images.js';
import { deleteUserAccount } from './accounts.js';
import { Library } from '../client/dataTypes.js';

const router = express.Router();

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// Sender identity for password-reset and forgot-username email. Falls back to
// an address on the Mailgun sending domain, which Mailgun will always accept.
function mailIdentity() {
    const from = (config.has('mailFrom') && config.get('mailFrom'))
        || `Waymark Gear <noreply@${config.get('mailgunDomain')}>`;
    const replyTo = (config.has('mailReplyTo') && config.get('mailReplyTo')) || from;
    return { from, replyTo };
}

async function sendMail({ from, to, replyTo, subject, text }) {
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

const randomBytesAsync = promisify(crypto.randomBytes);

// Applies to the public endpoint only. A moderator issuing a link is acting
// because this flow already failed, so that path deliberately skips it.
const RESET_RESEND_COOLDOWN_MS = 5 * 60 * 1000;


router.post('/register', (req, res) => {
    register(req, res);
});

async function register(req, res) {
    const username = String(req.body.username).toLowerCase().trim();
    const password = String(req.body.password);
    let email = String(req.body.email).trim();

    const errors = [];

    if (!username) {
        errors.push({ field: 'username', message: 'Please enter a username.' });
    }

    if (username && (username.length < 3 || username.length > 32)) {
        errors.push({ field: 'username', message: 'Please enter a username between 3 and 32 characters.' });
    }

    if (!email) {
        errors.push({ field: 'email', message: 'Please enter an email.' });
    } else if (!isValidEmail(email)) {
        errors.push({ field: 'email', message: 'Please enter a valid email.' });
    }

    if (!password) {
        errors.push({ field: 'password', message: 'Please enter a password.' });
    }

    if (password && (password.length < 5 || password.length > 60)) {
        errors.push({ field: 'password', message: 'Please enter a password between 5 and 60 characters.' });
    }

    if (errors.length) {
        return res.status(400).json({ errors });
    }

    logWithRequest(req, { message: 'Attempting to register', username });

    try {
        let conflictingUsers = await knex('users')
            .where({ username })
            .orWhere({ email })
            .select();

        if (conflictingUsers.length) {
            if (conflictingUsers.some((u) => u.username === username)) {
                logWithRequest(req, { message: 'User exists', username });
                return res.status(400).json({ errors: [{ field: 'username', message: 'That username already exists, please pick a different username.' }] });
            }
            if (conflictingUsers.some((u) => u.email === email)) {
                logWithRequest(req, { message: 'User email exists', email });
                return res.status(400).json({ errors: [{ field: 'email', message: 'A user with that email already exists.' }] });
            }
            logWithRequest(req, { message: 'User creation failed for unknown reason', conflictingUsers });
            return res.status(500).json({ errors: [{ message: 'An unexpected error occurred.' }] });
        }
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);
        const tokenBuffer = await randomBytesAsync(48);
        const token = tokenBuffer.toString('hex');

        // A library built before registering (saved in the browser) moves
        // into the new account; otherwise the account starts with a blank one.
        let library;
        try {
            library = normalizeLibrary(req.body.library || new Library().save());
        } catch (err) {
            logWithRequest(req, { message: 'Library parsing issue', username, err });
            return res.status(400).json({ errors: [{ message: 'Unable to parse your library. Contact support.' }] });
        }

        const newSyncToken = 0;

        const newUser = {
            username,
            password: hash,
            email,
            token: hashSessionToken(token),
            sync_token: newSyncToken,
            registered: new Date(),
            last_seen: new Date()
        };

        logWithRequest(req, { message: 'Saving new user', username });

        try {
            await knex.transaction(async (trx) => {
                const [created] = await trx('users').insert(newUser).returning('user_id');
                await replaceLibrary(created.user_id, library, trx);
            });
            const out = { username, library: JSON.stringify(library), sync_token: newSyncToken, account: accountInfo(newUser) };
            const opts = sessionCookieOptions();
            res.cookie('lp', token, opts);
            res.cookie('lp_loggedin', '1', { ...opts, httpOnly: false });
            return res.status(200).json(out);
        } catch (err) {
            if (err.code === '23505') {
                // lost a race against a concurrent registration for the same username/email
                logWithRequest(req, { message: 'Register unique violation race', username, email, err });
                return res.status(400).json({ errors: [{ message: 'That username or email already exists, please pick a different one.' }] });
            }
            logWithRequest(req, { message: 'Error inserting user', username, err });
            return res.status(500).json({ errors: [{ message: 'An error occurred when registering.' }] });
        }
    } catch (err) {
        logWithRequest(req, { message: 'Error searching for conflicting users', err });
        return res.status(500).json({ errors: [{ message: 'An error occurred.' }] });
    }
}

router.post('/signin', (req, res) => {
    authenticateUser(req, res, signin);
});

async function signin(req, res, user) {
    logWithRequest(req, { message: 'signed in', username: user.username });
    await knex('users')
        .where({ user_id: user.user_id })
        .update({
            last_seen: new Date()
        });
    const library = await applyCatalog(await loadLibrary(user.user_id) || new Library().save());
    return res.json({
        username: user.username,
        library: JSON.stringify(library),
        sync_token: user.sync_token,
        account: accountInfo(user),
    });
}

// What the client needs to know about the signed-in account.
function accountInfo(user) {
    return {
        email: user.email,
        hasPassword: Boolean(user.password),
        googleLinked: Boolean(user.google_sub),
        isAdmin: isAdmin(user.username),
        isModerator: isModerator(user.username),
    };
}

router.post('/saveLibrary', (req, res) => {
    authenticateUser(req, res, saveLibrary);
});

// Two ways to save:
//   { changes }  what changed since this browser last saved (see
//                client/utils/library-diff.js). Merges with other tabs and
//                devices, so it doesn't need an up-to-date sync_token.
//   { data }     the whole library, replacing everything. Only accepted when
//                sync_token matches, so a stale tab can't wipe newer work.
// Either way the response carries the new sync_token, the library's version.
async function saveLibrary(req, res, user) {
    if (typeof req.body.sync_token === 'undefined') {
        logWithRequest(req, { message: 'Missing syncToken', username: user.username });
        return res.status(400).send('Please refresh this page to upgrade to the latest version of Waymark Gear.');
    }
    if (!req.body.username || (!req.body.data && !req.body.changes)) {
        logWithRequest(req, { message: 'bad save: missing username or data', username: user.username });
        return res.status(400).json({ message: 'An error occurred while saving your data. Please refresh your browser and try again.' });
    }

    if (req.body.username != user.username) {
        logWithRequest(req, { message: 'bad save: bad username', initatedby: user.username, initiatedfor: req.body.username });
        return res.status(401).json({ message: 'An error occurred while saving your data. Please refresh your browser and login again.' });
    }

    const incremental = Boolean(req.body.changes);
    if (!incremental && req.body.sync_token != user.sync_token) {
        logWithRequest(req, { message: 'out of date syncToken', username: user.username });
        return res.status(400).json({ message: 'Your list is out of date - please refresh your browser.' });
    }

    let library = null;
    if (!incremental) {
        try {
            library = normalizeLibrary(req.body.data);
        } catch (e) {
            logWithRequest(req, { message: 'Library parsing issue', username: user.username, err: e });
            return res.status(400).json({ errors: [{ message: 'An error occurred while saving your data - unable to parse library.' }] });
        }
    }

    let newSyncToken;
    try {
        newSyncToken = await knex.transaction(async (trx) => {
            if (incremental) {
                await applyChanges(user.user_id, req.body.changes, trx);
                const [row] = await trx('users').where({ user_id: user.user_id })
                    .update({ sync_token: trx.raw('sync_token + 1'), last_seen: new Date() }).returning('sync_token');
                return row.sync_token;
            }
            // Guard against a lost update from a concurrent full save: only
            // write if the stored sync_token still matches what we read.
            const updated = await trx('users')
                .where({ user_id: user.user_id, sync_token: user.sync_token })
                .update({ sync_token: user.sync_token + 1, last_seen: new Date() });
            if (!updated) return null;
            await replaceLibrary(user.user_id, library, trx);
            return user.sync_token + 1;
        });
    } catch (err) {
        if (err instanceof LibraryError) {
            logWithRequest(req, { message: 'Library rejected', username: user.username, err: err.message });
            return res.status(400).json({ errors: [{ message: `An error occurred while saving your data: ${err.message}` }] });
        }
        logWithRequest(req, { message: 'Library saving error', username: user.username, err });
        return res.status(500).json({ errors: [{ message: 'An error occurred while saving your data.' }] });
    }

    if (newSyncToken === null) {
        logWithRequest(req, { message: 'out of date syncToken (concurrent save)', username: user.username });
        return res.status(400).json({ message: 'Your list is out of date - please refresh your browser.' });
    }

    logWithRequest(req, { message: incremental ? 'saved library changes' : 'saved library', username: user.username });

    // Keep the public copies of published lists current. The save itself
    // has succeeded either way, so a failure here is logged, not returned.
    try {
        await syncPublishedKits(user, await loadLibrary(user.user_id));
    } catch (err) {
        logWithRequest(req, { message: 'published kit sync failed', username: user.username, err });
    }

    return res.status(200).json({ message: 'success', sync_token: newSyncToken });
}

router.post('/externalId', (req, res) => {
    authenticateUser(req, res, externalId);
});

async function externalId(req, res, user) {
    const id = customAlphabet('1234567890abcdefghijklmnopqrstuvwxyz', 6)();
    logWithRequest(req, { message: 'Id generated', id });

    try {
        const lists = await knex('list').where({ external_id: id });

        if (lists.length) {
            logWithRequest(req, { message: 'Id collision detected', id });
            externalId(req, res, user);
            return;
        }

        try {
            await knex('list').insert({
                external_id: id,
                user_id: user.user_id
            });
        } catch (err) {
            logWithRequest(req, { message: 'Error inserting externalID', err });
            return res.status(500).json({ errors: [{ message: 'An error occurred.' }] });
        }

        logWithRequest(req, { message: 'Id saved', id, username: user.username });
        res.status(200).json({ externalId: id });
    } catch (err) {
        logWithRequest(req, { message: 'Id lookup error', id, err });
        return res.status(500).send('An error occurred.');
    }
}

router.post('/forgotPassword', (req, res) => {
    forgotPassword(req, res);
});

async function forgotPassword(req, res) {
    logWithRequest(req);

    const username = String(req.body.username).toLowerCase().trim();
    if (!username || username.length < 1 || username.length > 32) {
        logWithRequest(req, { message: 'Bad forgot password', username });
        return res.status(400).json({ errors: [{ message: 'Please enter a username.' }] });
    }

    try {
        const users = await knex('users').where({username});

        if (!users.length) {
            logWithRequest(req, { message: 'Forgot password for unknown user', username });
            return res.status(400).json({ message: 'An error occurred.' });
        }

        const user = users[0];

        // A link sent minutes ago is still sitting in the user's inbox, so send
        // nothing and let them use it - otherwise anyone can point this endpoint
        // at a username and flood that address. Throttling the recipient rather
        // than the caller is what makes this hold up against rotating IPs.
        // reset_token_expires is always the issue time plus the TTL, so it
        // doubles as a record of when the last link went out.
        const resendAllowedBelow = new Date(Date.now() + RESET_TOKEN_TTL_MS - RESET_RESEND_COOLDOWN_MS);
        if (user.reset_token_expires && new Date(user.reset_token_expires) > resendAllowedBelow) {
            // Reported as success: whether a mail actually went out this time is
            // not something the caller needs to distinguish.
            logWithRequest(req, { message: 'Password reset link already sent recently, not resending', username });
            return res.status(200).json({ username });
        }

        // The existing password is deliberately left alone until the token is
        // redeemed. Changing it here would let anyone who knows a username lock
        // that account out, and a failed send would strand the user entirely.
        // Minting before sending also means the link we email is always one
        // that can actually be redeemed.
        let token;
        try {
            token = await issueResetToken(user);
        } catch (err) {
            logWithRequest(req, { message: 'Error saving reset token', err });
            return res.status(500).json({ message: 'An error occurred' });
        }

        const email = user.email;

        const message = `Hello ${username},\n It looks like you forgot your password. Follow the link below to choose a new one: \n\n ${resetPasswordUrl(token)}\n\n This link expires in one hour and can only be used once. If you didn't ask to reset your password, you can ignore this email - your current password still works.\n\n If you continue to have problems, please reply to this email with details.\n\n Thanks!`;

        logWithRequest(req, { message: 'Attempting to send password reset link', email });
        try {
            const mailgunResponse = await sendMail({
                ...mailIdentity(),
                to: email,
                subject: 'Reset your Waymark Gear password',
                text: message,
            });
            logWithRequest(req, { message: 'Message sent', response: mailgunResponse.message });
        } catch (err) {
            logWithRequest(req, err);
            return res.status(500).json({ message: 'An error occurred' });
        }

        logWithRequest(req, { message: 'password reset link sent for user', username });
        return res.status(200).json({ username });
    } catch (err) {
        logWithRequest(req, { message: 'Forgot password lookup error', username, err });
        return res.status(500).json({ message: 'An error occurred' });
    }
}

router.post('/resetPassword', (req, res) => {
    resetPassword(req, res);
});

const invalidTokenError = { errors: [{ message: 'This password reset link is invalid or has expired. Please request a new one.' }] };

async function resetPassword(req, res) {
    logWithRequest(req);

    const token = String(req.body.token || '');
    const password = String(req.body.password || '');

    if (!token) {
        return res.status(400).json(invalidTokenError);
    }

    if (password.length < 5 || password.length > 60) {
        return res.status(400).json({ errors: [{ field: 'password', message: 'Please enter a password between 5 and 60 characters.' }] });
    }

    try {
        // An expired token matches nothing: `reset_token_expires > now` is also
        // false when the column is NULL, which is how a redeemed token looks.
        const users = await knex('users')
            .where({ reset_token_hash: hashResetToken(token) })
            .where('reset_token_expires', '>', new Date());

        if (!users.length) {
            logWithRequest(req, { message: 'Password reset with invalid or expired token' });
            return res.status(400).json(invalidTokenError);
        }

        const user = users[0];

        const salt = await bcrypt.genSalt(10);
        const newPasswordHash = await bcrypt.hash(password, salt);

        // Clearing the token in the same update makes the link single-use.
        await knex('users').where({user_id: user.user_id}).update({
            password: newPasswordHash,
            reset_token_hash: null,
            reset_token_expires: null,
        });

        logWithRequest(req, { message: 'password reset for user', username: user.username });

        // Signs this browser in. generateSession also overwrites users.token,
        // which invalidates every other session - the point of a reset.
        return generateSession(req, res, user, signin);
    } catch (err) {
        logWithRequest(req, { message: 'Password reset error', err });
        return res.status(500).json({ errors: [{ message: 'An error occurred, please try again later.' }] });
    }
}

router.post('/forgotUsername', (req, res) => {
    forgotUsername(req, res);
});

async function forgotUsername(req, res) {
    logWithRequest(req);

    const email = String(req.body.email).toLowerCase().trim();

    if (!email || email.length < 1) {
        logWithRequest(req, { message: 'Bad forgot username', email });
        return res.status(400).json({ errors: [{ message: 'Please enter a valid email.' }] });
    }

    try {
        // Emails are stored as-typed, so match case-insensitively — otherwise a
        // user whose stored email has any uppercase letter can never recover it.
        const users = await knex('users').whereRaw('lower(email) = ?', [email]);

        if (!users.length) {
            logWithRequest(req, { message: 'Forgot email for unknown user', email });
            return res.status(400).json({ message: 'An error occurred' });
        }

        const user = users[0];
        const username = user.username;

        const message = `Hello ${username},\n It looks like you forgot your username. Here it is: \n\n Username: ${username}\n\n If you continue to have problems, please reply to this email with details.\n\n Thanks!`;

        logWithRequest(req, { message: 'Attempting to send username', email, username });
        try {
            const mailgunResponse = await sendMail({
                ...mailIdentity(),
                to: email,
                subject: 'Your Waymark Gear username',
                text: message,
            });
            logWithRequest(req, { message: 'Message sent', response: mailgunResponse.message });
        } catch (err) {
            logWithRequest(req, err);
            return res.status(500).json({ message: 'An error occurred' });
        }
        logWithRequest(req, { message: 'sent username message for user', username, email });
        return res.status(200).json({ email });
    } catch (err) {
        logWithRequest(req, { message: 'Forgot email lookup error', email, err });
        return res.status(500).json({ message: 'An error occurred' });
    }
}

router.post('/account', (req, res) => {
    authenticateUser(req, res, account);
});

async function account(req, res, user) {
    logWithRequest(req, { message: 'Starting account changes', username: user.username });

    // A Google-only account has no password to confirm with; the session
    // is the proof. Everyone else confirms with their current password.
    if (user.password) {
        try {
            await verifyPassword(user.username, String(req.body.currentPassword));
        } catch (err) {
            logWithRequest(req, { message: 'Account bad current password', username: user.username, err });
            if (err.code === 500) {
                return res.status(500).json({ errors: [{ message: err.message }] });
            }
            return res.status(400).json({ errors: [{ field: 'currentPassword', message: 'Your current password is incorrect.' }] });
        }
    }

    try {
        if (req.body.newPassword) {
            const newPassword = String(req.body.newPassword);
            const errors = [];

            if (newPassword.length < 5 || newPassword.length > 60) {
                errors.push({ field: 'newPassword', message: 'Please enter a password between 5 and 60 characters.' });
            }

            if (errors.length) {
                return res.status(400).json({ errors });
            }

            const salt = await bcrypt.genSalt(10);
            const newPasswordHash = await bcrypt.hash(newPassword, salt);

            logWithRequest(req, { message: 'Changing PW', username: user.username });

            await knex('users').where({user_id: user.user_id}).update({
                password: newPasswordHash
            });

            // A new password should sign out every other device. Re-issuing
            // the session replaces users.token, and this browser gets the new
            // cookie so it stays signed in.
            await startSession(res, user.user_id);
        }

        if (req.body.newEmail) {
            let email = String(req.body.newEmail).trim();

            if (!isValidEmail(email)) {
                return res.status(400).json({ errors: [{ field: 'email', message: 'Please enter a valid email.' }] });
            }

            let conflictingUsers = await knex('users')
                .where({ email })
                .whereNot({ user_id: user.user_id })
                .select();

            if (conflictingUsers.length) {
                logWithRequest(req, { message: 'User email exists', email });
                return res.status(400).json({ errors: [{ field: 'email', message: 'A user with that email already exists.' }] });
            }

            logWithRequest(req, { message: 'Changing Email', username: user.username });

            await knex('users').where({user_id: user.user_id}).update({
                email
            });
        }

        return res.status(200).json({ message: 'success' });
    } catch (err) {
        logWithRequest(req, { message: 'Account update error', username: user.username, err });
        return res.status(500).json({ errors: [{ message: 'An error occurred while updating your account.' }] });
    }
}

router.post('/delete-account', (req, res) => {
    authenticateUser(req, res, deleteAccount);
});

async function deleteAccount(req, res, user) {
    logWithRequest(req, { message: 'Starting account delete', username: user.username });

    if (user.password) {
        try {
            await verifyPassword(user.username, String(req.body.password));
        } catch (err) {
            logWithRequest(req, { message: 'Bad account deletion - invalid password', username: req.body.username, err });
            if (err.code === 500) {
                return res.status(500).json({ errors: [{ message: err.message }] });
            }
            return res.status(400).json({ errors: [{ field: 'currentPassword', message: 'Your current password is incorrect.' }] });
        }
    }
    // Google-only accounts confirm by typing their username, checked below.

    if (req.body.username !== user.username) {
        logWithRequest(req, { message: 'Bad account deletion - wrong user', requestedUsername: req.body.username, initiatedby: user.username });
        return res.status(400).json({ message: 'An error occurred, please try logging out and in again.' });
    }

    try {
        const { removedImages, imageError } = await deleteUserAccount(user);

        logWithRequest(req, { message: 'Completed account delete', username: user.username });
        if (imageError) {
            logWithRequest(req, { message: 'Account image cleanup failed', username: user.username, err: imageError });
        } else {
            logWithRequest(req, { message: 'Deleted account images', username: user.username, removed: removedImages });
        }

        return res.status(200).json({ message: 'success' });
    } catch (err) {
        logWithRequest(req, { message: 'Account delete failed', username: user.username, err });
        res.status(500).json({ errors: [{ message: 'An error occurred, please try again later.' }] });
    }
}

router.post('/signout', async (req, res) => {
    if (req.cookies.lp) {
        try {
            await knex('users').where({ token: hashSessionToken(String(req.cookies.lp)) }).update({ token: '' });
        } catch (err) {
            logWithRequest(req, { message: 'Error invalidating token on signout', err });
        }
    }
    const opts = sessionCookieOptions();
    res.clearCookie('lp', opts);
    res.clearCookie('lp_loggedin', { ...opts, httpOnly: false });
    return res.status(200).json({ message: 'success' });
});

router.post('/imageUpload', (req, res) => {
    authenticateUser(req, res, imageUpload);
});

const maxImageUploadBytes = 5 * 1024 * 1024;

async function imageUpload(req, res, user) {
    let files;
    try {
        [, files] = await formidable({ maxFileSize: maxImageUploadBytes }).parse(req);
    } catch (err) {
        logWithRequest(req, { message: 'form parse error', err });
        if (err.httpCode === 413) { // formidable flags an over-size upload with httpCode 413
            return res.status(413).json({ message: 'Image is too large (5MB max).' });
        }
        return res.status(500).json({ message: 'An error occurred' });
    }

    const upload = files?.image?.[0];
    if (!upload) {
        logWithRequest(req, { message: 'No image in upload' });
        return res.status(400).json({ message: 'No image provided.' });
    }

    try {
        const buf = fs.readFileSync(upload.filepath);
        const sniffed = sniffImage(buf);
        if (!sniffed) {
            logWithRequest(req, { message: 'unsupported image upload', username: user.username, name: upload.originalFilename });
            return res.status(400).json({ message: 'Please upload a JPEG, PNG, or WebP image.' });
        }

        const { imageUrl } = await storeImage(upload.filepath, buf, sniffed.width, user.user_id);
        logWithRequest(req, {
            message: 'image stored', username: user.username, imageUrl, type: sniffed.type, width: sniffed.width, height: sniffed.height,
        });
        return res.json({ imageUrl });
    } catch (err) {
        const hint = err.code === 'ENOENT' ? ' (is cwebp installed? apt install webp)' : '';
        logWithRequest(req, { message: `image conversion failed${hint}`, username: user.username, err: { message: err.message } });
        return res.status(500).json({ message: 'An error occurred while processing the image.' });
    } finally {
        fs.rmSync(upload.filepath, { force: true });
    }
}

export default router;
