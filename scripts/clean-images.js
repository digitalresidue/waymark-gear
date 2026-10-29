// Delete stored images nothing refers to any more (server/image-gc.js).
// The app does this by itself once a day; this runs it now.
//
//   npm run images:clean                 delete unused images
//   npm run images:clean -- --dry-run    only say what would go
//   npm run images:clean -- --force      allow deleting more than half
//
// On a server installed with INSTALL.md:  waymark clean-images [--dry-run]

import knex from '../server/db.js';
import { cleanUpImages } from '../server/image-gc.js';

const dryRun = process.argv.includes('--dry-run');
const force = process.argv.includes('--force');
const mb = (b) => `${(b / 1024 / 1024).toFixed(1)} MB`;

try {
    const r = await cleanUpImages(knex, { dryRun, force, log: (m) => console.log(m) });
    if (r.aborted) {
        console.log(r.aborted);
        process.exitCode = 2;
    } else {
        console.log(`${r.files} images stored; ${r.referenced} in use.`);
        console.log(dryRun
            ? `Would delete ${r.unused} unused files (${mb(r.bytes)}).`
            : `Deleted ${r.deleted} unused files (${mb(r.bytes)}).`);
        if (r.skippedYoung) console.log(`${r.skippedYoung} unused files are less than a day old; they're left for now (maybe still being saved).`);
    }
} catch (err) {
    console.error(`Image clean-up failed: ${err.message}`);
    process.exitCode = 1;
} finally {
    await knex.destroy();
}
