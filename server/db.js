import config from 'config';
import Knex from 'knex';

import { connectionConfig } from './db-config.js';

// One pool for the whole process. Every server module used to build its own
// Knex instance, which meant five pools of up to ten connections each against
// a single Postgres.
const knex = Knex({
    client: 'pg',
    connection: connectionConfig(),
    pool: { min: 0, max: config.has('dbPoolMax') ? Number(config.get('dbPoolMax')) : 10 },
    migrations: {
        directory: new URL('../db/migrations', import.meta.url).pathname,
        loadExtensions: ['.js'],
    },
});

export default knex;
