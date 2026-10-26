import config from 'config';
import Knex from 'knex';
import pg from 'pg';

import { connectionConfig } from './db-config.js';

// bigint (int8) columns come back from pg as strings by default. Ids and
// counts here stay far below 2^53, so numbers are exact and much easier to
// work with.
pg.types.setTypeParser(20, (value) => (value === null ? null : Number(value)));

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
