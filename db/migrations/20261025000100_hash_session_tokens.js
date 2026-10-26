// Session tokens used to sit in users.token exactly as they appear in the
// browser cookie, so anyone holding a copy of the database could sign in as
// any user. From here on the column holds sha256(token) in hex, the same
// treatment reset tokens already get (server/auth.js).
//
// Hashing the existing values in place keeps everyone signed in across the
// upgrade. Empty strings mark a signed-out user and are left alone.

export async function up(knex) {
    await knex.raw(`
        update users
        set token = encode(sha256(convert_to(token, 'UTF8')), 'hex')
        where token <> ''
    `);
}

export async function down() {
    throw new Error('Session token hashing cannot be reversed. Restore from backup instead.');
}
