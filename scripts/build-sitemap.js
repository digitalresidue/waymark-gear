// Rebuild the sitemap now (server/sitemap.js). The app does this by itself
// at start-up and once a day.
//
//   npm run sitemap:build
//   On a server installed with INSTALL.md:  waymark sitemap

import config from 'config';

import knex from '../server/db.js';
import { buildSitemap } from '../server/sitemap.js';

try {
    const r = await buildSitemap(knex);
    console.log(`Sitemap rebuilt: ${r.urls} pages in ${r.files} files.`);
    console.log(`Search engines find it at ${config.get('deployUrl').replace(/\/$/, '')}/sitemap.xml`);
} catch (err) {
    console.error(`Sitemap build failed: ${err.message}`);
    process.exitCode = 1;
} finally {
    await knex.destroy();
}
