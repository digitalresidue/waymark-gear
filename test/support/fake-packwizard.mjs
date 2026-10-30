// A stand-in for PackWizard's shared-pack endpoint, for tests only.
//
// Serves /api/packs/getSharedPackWithId?shareableId=<id> in PackWizard's own
// shape (see client/utils/packwizard-import.js) for the pack below, a photo
// for its items, and 404 for anything else.
//
//   node test/support/fake-packwizard.mjs        (FAKE_PACKWIZARD_PORT, default 3997)

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const port = Number(process.env.FAKE_PACKWIZARD_PORT || 3997);
const here = path.dirname(fileURLToPath(import.meta.url));
const photo = fs.readFileSync(path.join(here, '../../public/images/icon-192.png'));
const base = `http://127.0.0.1:${port}`;

const PACKS = {
    TestPk1: {
        packName: 'Wind River High Route',
        packDescription: 'Five days above treeline.',
        packCurrency: 'USD',
        shareableId: 'TestPk1',
        tableData: [
            {
                title: 'Big 3',
                subtitle: 'Pack, Tent, Sleep System',
                defaultCategory: 'Big 3',
                rows: {
                    row_a: { item: 'Plex Solo Tent', brand: 'Zpacks', weight: 394, unit: 'g', quantity: 1, price: 599, weightType: 0, url: 'https://zpacks.example/plex', imageUrl: `${base}/photo.png`, description: 'Single wall.' },
                    row_b: { item: 'Zpacks Arc Haul', brand: 'Zpacks', weight: 1.5, unit: 'lb', quantity: 1, price: 0, weightType: 0, url: 'javascript:alert(1)', imageUrl: '' },
                },
            },
            {
                title: '',
                defaultCategory: 'Clothing',
                rows: {
                    row_c: { item: 'Wind shirt', brand: '', weight: 2.1, unit: 'oz', quantity: 1, weightType: 1, url: '', imageUrl: `${base}/photo.png` },
                    row_d: { item: 'Dinners', weight: 120, unit: 'g', quantity: 4, weightType: 2 },
                    row_e: { item: '', weight: 50, unit: 'g', quantity: 1, weightType: 0 },
                },
            },
        ],
    },
};

http.createServer((req, res) => {
    const url = new URL(req.url, base);
    if (url.pathname === '/') return res.end('fake packwizard');
    if (url.pathname === '/photo.png') {
        res.writeHead(200, { 'Content-Type': 'image/png' });
        return res.end(photo);
    }
    if (url.pathname === '/api/packs/getSharedPackWithId') {
        const pack = PACKS[url.searchParams.get('shareableId')];
        if (pack) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(pack));
        }
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end('{"error":"not found"}');
}).listen(port, '127.0.0.1');
