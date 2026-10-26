import config from 'config';

// DATABASE_URL (config key databaseUrl) wins when set, which is what hosted
// Postgres providers and docker-compose hand you. Otherwise fall back to the
// discrete host/user/password/database object in config/*.json.
//
// Kept separate from db.js so tests and scripts can open their own short-lived
// connection with the same settings without importing the app's pool.
export function connectionConfig() {
    const url = config.has('databaseUrl') ? String(config.get('databaseUrl') || '').trim() : '';
    if (url) {
        return { connectionString: url };
    }
    return JSON.parse(JSON.stringify(config.get('pgDatabase')));
}
