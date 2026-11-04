import config from 'config';
import { promisify } from 'util';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import knex from './db.js';
import { logWithRequest } from './log.js';

const moderatorList = config.get('moderators');
// Roles, most to least:
// - Owners: the `admins` server setting. Everything, including money, site
//   scripts, Supporter grants, the users list and the team itself.
// - Admins: added by an owner on the Team page. The catalog, brands,
//   trails, featured kits and moderation. Deletes and big imports wait for
//   an owner's OK (server/team.js).
// - Moderators: the `moderators` setting or the Team page. Comments,
//   reports and account help.
const adminList = config.has('admins') ? config.get('admins') : [];

// Team roles from the database, kept in memory so the checks below stay
// synchronous. Refreshed on every change here and every 30 seconds, so
// another server instance catches up quickly.
let teamRoles = new Map();
async function refreshTeam() {
    try {
        const rows = await knex('team_members as t').join('users as u', 'u.user_id', 't.user_id').select('u.username', 't.role');
        teamRoles = new Map(rows.map((r) => [r.username, r.role]));
    } catch {
        // Before the migration runs, or the database is briefly away: keep what we had.
    }
    return teamRoles;
}
refreshTeam();
setInterval(refreshTeam, 30_000).unref();

function isOwner(username) {
    return adminList.indexOf(username) > -1;
}

// 'owner' | 'admin' | 'moderator' | null
function roleOf(username) {
    if (!username) return null;
    if (isOwner(username)) return 'owner';
    const team = teamRoles.get(username);
    if (team) return team;
    return moderatorList.indexOf(username) > -1 ? 'moderator' : null;
}

// Every change made with admin powers goes in the activity log.
function logChanges(req, res, user) {
    if (req.method === 'GET' || req.method === 'HEAD') return;
    res.on('finish', () => {
        if (res.statusCode >= 400 || res.locals.loggedAction) return;
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const what = body.name || body.username || body.title || '';
        knex('admin_actions').insert({
            username: user.username,
            action: `${req.method} ${req.originalUrl.split('?')[0]}`.slice(0, 300),
            summary: String(what).slice(0, 200),
            status: res.statusCode === 202 ? 'pending' : 'done',
        }).catch(() => {});
    });
}

const sessionCookieOptions = () => ({
    path: '/',
    maxAge: Number(config.get('sessionDays')) * 24 * 60 * 60 * 1000,
    httpOnly: true,
    secure: config.get('environment') === 'production',
    sameSite: 'lax',
});

const randomBytesAsync = promisify(crypto.randomBytes);

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

// Only the hash is stored, so a leaked database dump can't be used to reset
// anyone's password - the same reasoning that applies to the password column.
const hashResetToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

// Session tokens get the same treatment: users.token holds the hash, and the
// raw value only ever exists in the user's cookie. Migration
// 20261025000100_hash_session_tokens converted the tokens already stored.
const hashSessionToken = hashResetToken;

// Mint a session token, store its hash and set the cookies. Shared by signin,
// registration and anything that rotates the session (password change/reset).
const startSession = async function (res, userId) {
    const tokenBuffer = await randomBytesAsync(48);
    const token = tokenBuffer.toString('hex');

    await knex('users').where({ user_id: userId }).update({ token: hashSessionToken(token) });

    const opts = sessionCookieOptions();
    res.cookie('lp', token, opts);
    res.cookie('lp_loggedin', '1', { ...opts, httpOnly: false });
    // Signing in on a new device brings the language they chose with them.
    const { language, units } = (await knex('users').where({ user_id: userId }).first('language', 'units').catch(() => null)) || {};
    if (language) res.cookie('wg_lang', language, { path: '/', maxAge: 365 * 24 * 60 * 60 * 1000, sameSite: 'lax' });
    // ...and their units.
    if (units) res.cookie('wg_units', units, { path: '/', maxAge: 365 * 24 * 60 * 60 * 1000, sameSite: 'lax' });
    return token;
};

// The raw token is the only copy that ever leaves the server. How it reaches
// the user is the caller's business: the public flow emails it, moderation
// hands it back for a human to relay when email is the thing that's broken.
const issueResetToken = async function (user) {
    const tokenBuffer = await randomBytesAsync(32);
    const token = tokenBuffer.toString('hex');

    await knex('users').where({user_id: user.user_id}).update({
        reset_token_hash: hashResetToken(token),
        reset_token_expires: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    });

    return token;
};

const resetPasswordUrl = (token) => `${config.get('deployUrl')}/reset-password/${token}`;

const authenticateModerator = async function (req, res, callback) {
    authenticateUser(req, res, (req, res, user) => {
        if (!isModerator(user.username)) {
            return res.status(403).json({ message: 'Denied.' });
        }
        callback(req, res, user);
    });
};

// The browser is holding a session this server won't honour. /signout was the
// only thing that ever cleared these, so without this the client keeps booting
// off lp_loggedin, gets rejected again, and every reload lands in the same
// broken state - including on the password-reset page, which is exactly where
// someone with a dead session ends up.
const clearStaleSessionCookies = function (req, res) {
    if (!req.cookies.lp && !req.cookies.lp_loggedin) return;
    const opts = sessionCookieOptions();
    res.clearCookie('lp', opts);
    res.clearCookie('lp_loggedin', { ...opts, httpOnly: false });
};

const authenticateUser = async function (req, res, callback) {
    if (!req.body) req.body = {}; // GETs and multipart requests arrive with no parsed body
    if (!req.cookies.lp && (!req.body.username || !req.body.password)) {
        clearStaleSessionCookies(req, res);
        return res.status(401).json({ message: 'Please log in.' });
    }

    if (req.body.username && req.body.password) {
        const username = String(req.body.username).toLowerCase().trim();
        const password = String(req.body.password);

        try {
            const user = await verifyPassword(username, password);

            await generateSession(req, res, user, callback);
        } catch (err) {
            if (res.headersSent) return;
            logWithRequest(req, err);
            if (err instanceof AuthError) {
                logWithRequest(req, { message: `error on verifyPassword for: ${username}`, error: err.message });
                res.status(err.code).json({ message: err.message });
            } else {
                res.status(500).json({ message: 'An error occurred, please try again later.' });
            }
        }
    } else {
        const token = String(req.cookies.lp);

        try {
            const users = await knex('users').select().where({ token: hashSessionToken(token) });

            if (!users.length) {
                logWithRequest(req, { message: 'bad cookie!' });
                clearStaleSessionCookies(req, res);
                return res.status(404).json({ message: 'Please log in again.' });
            }

            const user = users[0];

            req.lighterpackusername = user.username || 'UNKNOWN';
            await callback(req, res, user);
        } catch (err) {
            if (res.headersSent) return;
            logWithRequest(req, { message: 'Error on authenticateUser else', error: err });
            return res.status(500).json({ message: 'An error occurred, please try again later.' });
        }
    }
};

class AuthError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}

const verifyPassword = async function (username, password) {
    try {
        const users = await knex('users').select().where({username});

        if (!users.length) {
            throw new AuthError(404, 'Invalid username and/or password.');
        }

        const user = users[0];
        if (!user.password) {
            // Google-only account: there is no password to check.
            throw new AuthError(404, 'Invalid username and/or password.');
        }
        const match = await bcrypt.compare(password, user.password);

        if (match) {
            return user;
        }

        throw new AuthError(404, 'Invalid username and/or password.');
    } catch (err) {
        if (err instanceof AuthError) {
            throw err;
        }
        logWithRequest(null, { message: 'verifyPassword DB error', err });
        throw new AuthError(500, 'An error occurred, please try again later.');
    }
};

const generateSession = async function (req, res, user, callback) {
    await startSession(res, user.user_id);
    await callback(req, res, user);
};

// Owners and admins: anyone who can use the admin tools.
function isAdmin(username) {
    const role = roleOf(username);
    return role === 'owner' || role === 'admin';
}

// The signed-in user behind this request's session cookie, or null. For
// public pages that show a little more to a signed-in reader; never sends a
// response or touches cookies.
async function optionalUser(req) {
    const token = req.cookies && req.cookies.lp;
    if (!token) return null;
    try {
        return (await knex('users').where({ token: hashSessionToken(String(token)) }).first()) || null;
    } catch {
        return null;
    }
}

function isModerator(username) {
    return Boolean(roleOf(username));
}

const authenticateAdmin = async function (req, res, callback) {
    authenticateUser(req, res, (req, res, user) => {
        if (!isAdmin(user.username)) {
            return res.status(403).json({ message: 'Denied.' });
        }
        logChanges(req, res, user);
        callback(req, res, user);
    });
};

const authenticateOwner = async function (req, res, callback) {
    authenticateUser(req, res, (req, res, user) => {
        if (!isOwner(user.username)) {
            return res.status(403).json({ message: 'Only the site owner can do that.' });
        }
        logChanges(req, res, user);
        callback(req, res, user);
    });
};

export { optionalUser, authenticateAdmin, authenticateOwner, isOwner, roleOf, refreshTeam, isAdmin, authenticateModerator, authenticateUser, verifyPassword, generateSession, startSession, hashSessionToken, isModerator, sessionCookieOptions, issueResetToken, hashResetToken, resetPasswordUrl, RESET_TOKEN_TTL_MS };
