import { testRoot } from './utils';

/**
 * Generate unique test credentials to avoid collisions in parallel test execution.
 * Combines timestamp with random suffix for guaranteed uniqueness.
 * Username is truncated to 32 characters (the max allowed).
 */
export function generateTestUser(prefix = 'test') {
    const now = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const fullUsername = `${prefix}${now}${random}`;
    const username = fullUsername.substring(0, 32); // Max 32 chars allowed
    const email = `${prefix}+${now}${random}@example.com`;
    const password = 'testtest';
    return { username, email, password };
}

/**
 * Open a page of the app and wait for its HTML, not the browser's full
 * "load" event: the forms the tests use are ready long before. In CI,
 * Firefox now and then held "load" open for 30s+ on /register. If even the
 * HTML doesn't arrive, the error lists the requests still in flight, so the
 * cause shows up in the CI annotation.
 */
export async function openPage(page, path) {
    const pending = new Map();
    const started = (r) => pending.set(r, Date.now());
    const done = (r) => pending.delete(r);
    page.on('request', started);
    page.on('requestfinished', done);
    page.on('requestfailed', done);
    try {
        await page.goto(`${testRoot}${path}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    } catch (err) {
        const now = Date.now();
        const list = [...pending].map(([r, t]) => `${r.method()} ${r.url()} (${now - t}ms)`).join('\n  ');
        err.message += `\nRequests still in flight:\n  ${list || '(none)'}`;
        throw err;
    } finally {
        page.off('request', started);
        page.off('requestfinished', done);
        page.off('requestfailed', done);
    }
}

export async function registerUser(page, username, password, email) {
    await openPage(page, 'register');

    const registerForm = page.getByTestId('register-form');
    await registerForm.getByPlaceholder('Username', { exact: true }).fill(username);
    await registerForm.getByPlaceholder('Email', { exact: true }).fill(email);
    await registerForm.getByPlaceholder('Password', { exact: true }).fill(password);
    await registerForm.getByPlaceholder('Confirm password', { exact: true }).fill(password);
    await registerForm.getByRole('button', { name: 'Register' }).click();
}

export async function loginUser(page, username, password) {
    await openPage(page, 'signin');

    const signinForm = page.getByTestId('signin-form');
    await signinForm.getByPlaceholder('Username', { exact: true }).fill(username);
    await signinForm.getByPlaceholder('Password', { exact: true }).fill(password);
    await signinForm.getByRole('button', { name: 'Sign in' }).click();
}

export async function logoutUser(page) {
    await page.getByTestId('account-menu').hover();
    await Promise.all([
        page.waitForURL('**/signin'),
        page.getByText('Sign out').click(),
    ]);
}
