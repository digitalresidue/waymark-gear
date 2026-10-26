// Load db/seed/sample-catalog.csv into the gear catalog, for trying the app
// locally. The entries are generic sample gear (brand "Sample", no prices),
// not real products; replace them with your own catalog via Owner → Gear
// catalog → Import CSV. Safe to run twice: rows match on SKU.
//
//   npm run db:seed-sample

import fs from 'node:fs';

import knex from '../server/db.js';
import { applyImport } from '../server/catalog.js';

try {
    await knex.migrate.latest();
    const csv = fs.readFileSync(new URL('../db/seed/sample-catalog.csv', import.meta.url), 'utf8');
    const result = await applyImport(csv);
    if (result.error) throw new Error(result.error);
    const s = result.summary;
    console.log(`Sample catalog: ${s.new} added, ${s.update} updated, ${s.unchanged} unchanged, ${s.error} skipped.`);
} catch (err) {
    console.error(err.message);
    process.exitCode = 1;
} finally {
    await knex.destroy();
}
