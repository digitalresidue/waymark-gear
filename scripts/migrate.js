// Run database migrations from the command line.
//
//   npm run db:migrate            apply everything pending
//   npm run db:migrate -- status  list applied and pending migrations
//   npm run db:migrate -- down    roll back the most recent batch
//
// The server also applies pending migrations at startup unless
// migrateOnStart / MIGRATE_ON_START is false. Knex holds a lock table while
// it runs, so several instances starting at once won't race each other.

import knex from '../server/db.js';

const command = process.argv[2] || 'latest';

try {
    if (command === 'latest') {
        const [batch, applied] = await knex.migrate.latest();
        console.log(applied.length ? `Batch ${batch}: applied ${applied.join(', ')}` : 'Already up to date.');
    } else if (command === 'down') {
        const [batch, rolledBack] = await knex.migrate.rollback();
        console.log(rolledBack.length ? `Batch ${batch}: rolled back ${rolledBack.join(', ')}` : 'Nothing to roll back.');
    } else if (command === 'status') {
        const [done, pending] = await knex.migrate.list();
        for (const m of done) console.log(`applied  ${m.name}`);
        for (const m of pending) console.log(`pending  ${m.file}`);
    } else {
        console.error(`Unknown command "${command}". Use latest, status or down.`);
        process.exitCode = 1;
    }
} catch (err) {
    console.error(err.message);
    process.exitCode = 1;
} finally {
    await knex.destroy();
}
