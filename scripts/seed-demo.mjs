// Fill a Waymark Gear instance with a believable demo community: a gear
// catalog, ten hikers with Appalachian Trail, PCT and CDT lists, shakedown
// requests and comments, votes, follows, trip journals with photos, staff
// gear reviews, price drops and a Supporter. For screenshots, demos and
// staging. Never point it at the live site.
//
//   DEMO_URL=http://localhost:3100 DEMO_IMAGES=path/to/jpgs node scripts/seed-demo.mjs
//
// The target server must list "waymark" in `admins` and "trailwise" in
// `reviewers`, and have rate limits off. Everything goes through the public
// API, the same way people would make it. Images are optional (JPEG/PNG files
// named like at-ridges.jpg, banner-pct.jpg; see DEMO_IMAGES below).

import fs from 'node:fs';
import path from 'node:path';

import { Library } from '../client/dataTypes.js';
import weightUtils from '../client/utils/weight.js';

const BASE = process.env.DEMO_URL || 'http://localhost:3100';
const IMAGES = process.env.DEMO_IMAGES || '';
const PASSWORD = process.env.DEMO_PASSWORD || 'demo-hiker';
if (/waymarkgear\.com/.test(BASE) && !process.env.DEMO_FORCE) {
    console.error('Refusing to seed the live site. Set DEMO_FORCE=1 if you really mean it.');
    process.exit(1);
}

// ---- HTTP ---------------------------------------------------------------------

class Client {
    constructor(username) {
        this.username = username;
        this.cookie = '';
        this.syncToken = 0;
    }

    async req(method, p, body, { form, raw } = {}) {
        const headers = { Accept: 'application/json' };
        if (this.cookie) headers.Cookie = this.cookie;
        let payload;
        if (form) payload = form;
        else if (body !== undefined) {
            headers['Content-Type'] = 'application/json';
            payload = JSON.stringify(body);
        }
        const res = await fetch(`${BASE}${p}`, { method, headers, body: payload, redirect: 'manual' });
        const set = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
        for (const c of set) if (c.startsWith('lp=')) this.cookie = c.split(';')[0];
        if (raw) return res;
        const text = await res.text();
        let json = null;
        try {
            json = text ? JSON.parse(text) : null;
        } catch {
            json = text;
        }
        if (!res.ok) throw new Error(`${method} ${p} as ${this.username}: ${res.status} ${typeof json === 'string' ? json.slice(0, 200) : JSON.stringify(json).slice(0, 300)}`);
        return json;
    }

    get(p) { return this.req('GET', p); }
    post(p, b) { return this.req('POST', p, b ?? {}); }
    put(p, b) { return this.req('PUT', p, b ?? {}); }

    async upload(file, kind) {
        const form = new FormData();
        const buf = fs.readFileSync(file);
        form.append('image', new Blob([buf], { type: file.endsWith('.png') ? 'image/png' : 'image/jpeg' }), path.basename(file));
        const r = await this.req('POST', `/api/profile/image?kind=${kind}`, undefined, { form });
        return r.imageUrl;
    }
}

const image = (name) => {
    if (!IMAGES) return null;
    for (const ext of ['.jpg', '.png']) {
        const f = path.join(IMAGES, name + ext);
        if (fs.existsSync(f)) return f;
    }
    return null;
};

// ---- the catalog --------------------------------------------------------------
// Real products with approximate published weights and list prices, for a
// realistic demo. sku, name, brand, category, description, weight, unit, price, url

const CATALOG = [
    ['DM-SH-01', 'Duplex', 'Zpacks', 'Shelter', 'Two-person DCF tent pitched with trekking poles', 19.0, 'oz', 699, 'https://zpacks.com/products/duplex-tent'],
    ['DM-SH-02', 'X-Mid 1', 'Durston', 'Shelter', 'One-person trekking pole tent, double wall', 28.0, 'oz', 300, 'https://durstongear.com/products/x-mid-1p'],
    ['DM-SH-03', 'The One', 'Gossamer Gear', 'Shelter', 'One-person single wall trekking pole tent', 17.7, 'oz', 335, 'https://www.gossamergear.com/products/the-one'],
    ['DM-SH-04', 'Notch Li', 'Tarptent', 'Shelter', 'One-person DCF tent, double wall', 19.5, 'oz', 669, 'https://www.tarptent.com/product/notch-li/'],
    ['DM-SH-05', 'Copper Spur HV UL2', 'Big Agnes', 'Shelter', 'Freestanding two-person tent', 50.0, 'oz', 550, 'https://www.bigagnes.com/products/copper-spur-hv-ul2'],
    ['DM-SH-06', 'Lunar Solo', 'Six Moon Designs', 'Shelter', 'One-person single wall tent', 26.0, 'oz', 260, 'https://www.sixmoondesigns.com/products/lunar-solo'],
    ['DM-SH-07', 'Blackbird XLC hammock', 'Warbonnet', 'Shelter', 'Gathered-end hammock with built-in bug net', 21.0, 'oz', 200, 'https://www.warbonnetoutdoors.com/'],
    ['DM-SL-01', 'Enigma 20°F quilt', 'Enlightened Equipment', 'Sleep', '850 fill down quilt, regular/regular', 21.0, 'oz', 360, 'https://enlightenedequipment.com/enigma-quilt/'],
    ['DM-SL-02', 'Revelation 20°F quilt', 'Enlightened Equipment', 'Sleep', 'Down quilt that opens flat', 22.0, 'oz', 340, 'https://enlightenedequipment.com/revelation-quilt/'],
    ['DM-SL-03', 'Flex 22 quilt', 'Katabatic Gear', 'Sleep', '900 fill quilt with pad straps', 23.6, 'oz', 440, 'https://katabaticgear.com/'],
    ['DM-SL-04', 'UltraLite 20°F bag', 'Western Mountaineering', 'Sleep', 'Mummy bag, 850+ down', 29.0, 'oz', 580, 'https://www.westernmountaineering.com/'],
    ['DM-SL-05', 'NeoAir XLite NXT', 'Therm-a-Rest', 'Sleep', 'Inflatable pad, R 4.5, regular', 12.5, 'oz', 230, 'https://www.thermarest.com/'],
    ['DM-SL-06', 'NeoAir XTherm NXT', 'Therm-a-Rest', 'Sleep', 'Inflatable pad, R 7.3, regular', 15.5, 'oz', 260, 'https://www.thermarest.com/'],
    ['DM-SL-07', 'Tensor All-Season', 'NEMO', 'Sleep', 'Quiet insulated pad, R 5.4', 15.0, 'oz', 200, 'https://www.nemoequipment.com/'],
    ['DM-SL-08', 'Thinlight foam pad', 'Gossamer Gear', 'Sleep', '1/8" foam pad, under-pad or sit pad', 2.8, 'oz', 25, 'https://www.gossamergear.com/'],
    ['DM-PK-01', 'Southwest 3400', 'Hyperlite Mountain Gear', 'Packs', '55 L DCF pack', 32.0, 'oz', 379, 'https://www.hyperlitemountaingear.com/'],
    ['DM-PK-02', 'Mariposa 60', 'Gossamer Gear', 'Packs', '60 L frame pack with removable hipbelt', 30.0, 'oz', 315, 'https://www.gossamergear.com/'],
    ['DM-PK-03', 'Circuit', 'ULA Equipment', 'Packs', '68 L pack, carries 30+ lb well', 37.0, 'oz', 280, 'https://www.ula-equipment.com/'],
    ['DM-PK-04', 'Simple Pack', "Pa'lante", 'Packs', '36 L frameless pack', 19.0, 'oz', 300, 'https://palantepacks.com/'],
    ['DM-PK-05', 'Kakwa 55', 'Durston', 'Packs', '55 L frame pack, Ultra 200', 32.0, 'oz', 300, 'https://durstongear.com/'],
    ['DM-PK-06', 'Exos 58', 'Osprey', 'Packs', 'Ventilated mesh back, 58 L', 39.5, 'oz', 220, 'https://www.osprey.com/'],
    ['DM-KT-01', '750 ml titanium pot', 'Toaks', 'Kitchen', 'Pot with lid, fits a fuel canister', 3.6, 'oz', 35, 'https://www.toaksoutdoor.com/'],
    ['DM-KT-02', 'BRS-3000T stove', 'BRS', 'Kitchen', 'Titanium canister stove', 0.9, 'oz', 20, 'https://www.brs-outdoor.com/'],
    ['DM-KT-03', 'Amicus stove', 'Soto', 'Kitchen', 'Canister stove with wind resistance', 2.8, 'oz', 50, 'https://sotooutdoors.com/'],
    ['DM-KT-04', 'Flash cooking system', 'Jetboil', 'Kitchen', 'Integrated stove and 1 L pot', 13.1, 'oz', 125, 'https://www.jetboil.com/'],
    ['DM-KT-05', 'Long handle spoon', 'Toaks', 'Kitchen', 'Titanium, reaches the bottom of a freeze-dried bag', 0.6, 'oz', 11, 'https://www.toaksoutdoor.com/'],
    ['DM-KT-06', 'Ursack Major', 'Ursack', 'Kitchen', 'Bear-resistant bag, approved where canisters aren\'t required', 7.6, 'oz', 110, 'https://www.ursack.com/'],
    ['DM-KT-07', 'BV450 bear canister', 'BearVault', 'Kitchen', 'Required in parts of the Sierra', 33.0, 'oz', 85, 'https://www.bearvault.com/'],
    ['DM-WT-01', 'Squeeze filter', 'Sawyer', 'Water', 'Hollow fiber filter, screws onto bottles', 3.0, 'oz', 40, 'https://www.sawyer.com/'],
    ['DM-WT-02', 'BeFree 1.0 L', 'Katadyn', 'Water', 'Fast flow filter in a soft flask', 2.3, 'oz', 45, 'https://www.katadyn.com/'],
    ['DM-WT-03', 'Vecto 2 L bag', 'CNOC', 'Water', 'Dirty water bag, opens at both ends', 2.6, 'oz', 25, 'https://cnocoutdoors.com/'],
    ['DM-WT-04', 'Aquamira drops', 'Aquamira', 'Water', 'Chlorine dioxide backup treatment', 3.0, 'oz', 15, 'https://aquamira.com/'],
    ['DM-CL-01', 'Nano Puff Hoody', 'Patagonia', 'Clothing', 'Synthetic insulated hoody', 12.0, 'oz', 299, 'https://www.patagonia.com/'],
    ['DM-CL-02', 'Ghost Whisperer/2 Hoody', 'Mountain Hardwear', 'Clothing', '800 fill down jacket', 7.9, 'oz', 350, 'https://www.mountainhardwear.com/'],
    ['DM-CL-03', 'Ultra-Lite 2 rain jacket', 'Frogg Toggs', 'Clothing', 'Cheap, light, not durable', 5.5, 'oz', 25, 'https://www.froggtoggs.com/'],
    ['DM-CL-04', 'Helium Rain Jacket', 'Outdoor Research', 'Clothing', '2.5-layer waterproof shell', 6.3, 'oz', 170, 'https://www.outdoorresearch.com/'],
    ['DM-CL-05', 'Alpha 90 hoodie', 'Senchi Designs', 'Clothing', 'Polartec Alpha active insulation', 4.5, 'oz', 130, 'https://senchidesigns.com/'],
    ['DM-CL-06', 'Echo sun hoody', 'Outdoor Research', 'Clothing', 'UPF 15 sun shirt with hood', 5.0, 'oz', 70, 'https://www.outdoorresearch.com/'],
    ['DM-CL-07', 'Hiker micro crew socks', 'Darn Tough', 'Clothing', 'Merino, lifetime guarantee', 2.5, 'oz', 25, 'https://darntough.com/'],
    ['DM-FW-01', 'Lone Peak 9', 'Altra', 'Footwear', 'Zero drop trail runner, pair', 22.0, 'oz', 150, 'https://www.altrarunning.com/'],
    ['DM-FW-02', 'Speedgoat 6', 'Hoka', 'Footwear', 'Cushioned trail runner, pair', 20.0, 'oz', 155, 'https://www.hoka.com/'],
    ['DM-FW-03', 'X Ultra 4 Mid GTX', 'Salomon', 'Footwear', 'Waterproof hiking boot, pair', 33.0, 'oz', 175, 'https://www.salomon.com/'],
    ['DM-EL-01', 'inReach Mini 2', 'Garmin', 'Electronics', 'Satellite messenger with SOS', 3.5, 'oz', 400, 'https://www.garmin.com/'],
    ['DM-EL-02', 'NU25 UL headlamp', 'Nitecore', 'Electronics', '400 lumen rechargeable headlamp', 1.6, 'oz', 37, 'https://flashlight.nitecore.com/'],
    ['DM-EL-03', 'NB10000 power bank', 'Nitecore', 'Electronics', '10,000 mAh carbon fiber battery', 5.3, 'oz', 56, 'https://flashlight.nitecore.com/'],
    ['DM-EL-04', 'Zoleo', 'Zoleo', 'Electronics', 'Satellite communicator with SOS', 5.3, 'oz', 200, 'https://www.zoleo.com/'],
    ['DM-MS-01', 'Distance Carbon Z poles', 'Black Diamond', 'Misc', 'Folding carbon trekking poles, pair', 10.2, 'oz', 190, 'https://www.blackdiamondequipment.com/'],
    ['DM-MS-02', 'Classic SD', 'Victorinox', 'Misc', 'Small knife with scissors', 0.75, 'oz', 20, 'https://www.victorinox.com/'],
    ['DM-MS-03', 'Deuce #2 trowel', 'TheTentLab', 'Misc', 'Aluminum cathole trowel', 0.6, 'oz', 20, 'https://thetentlab.com/'],
    ['DM-MS-04', 'Microspikes', 'Kahtoola', 'Misc', 'Traction for icy trail and early-season snow', 11.6, 'oz', 75, 'https://kahtoola.com/'],
    ['DM-MS-05', 'Corsa ice axe', 'Camp', 'Misc', '205 g aluminum axe, 60 cm', 7.2, 'oz', 110, 'https://www.camp-usa.com/'],
    ['DM-MS-06', 'Swing Liteflex umbrella', 'Euroschirm', 'Misc', 'Silver hiking umbrella for sun and rain', 8.0, 'oz', 45, 'https://www.euroschirm.com/'],
];
const byName = new Map(CATALOG.map((c) => [c[1], c]));

// ---- hikers ---------------------------------------------------------------------

const HIKERS = [
    {
        username: 'sunny_strides', displayName: 'Maya Ortiz', trailName: 'Sunny', banner: 'banner-pct',
        bio: 'PCT 2025 NOBO, AT 2023. I count grams so I can carry snacks. Desert sections are my favorite and I will not apologize for the umbrella.',
        links: { instagram: 'sunny.strides', website: 'https://example.com/sunny' },
        tags: { activities: ['thru-hiking', 'backpacking'], seasons: ['spring', 'summer'], custom: ['ultralight', 'quilt sleeper'] },
    },
    {
        username: 'patchwork', displayName: 'Dev Patel', trailName: 'Patchwork', banner: 'banner-at',
        bio: 'Starting the AT at Springer on March 12, 2026. First thru-hike. Shakedowns very welcome.',
        tags: { activities: ['backpacking', 'thru-hiking'], seasons: ['spring', 'fall'], custom: ['AT class of 2026'] },
    },
    {
        username: 'elkwhisperer', displayName: 'Hannah Lund', trailName: 'Elk', banner: 'banner-cdt',
        bio: 'Triple Crown in 2025 with the CDT. Montana in a snowstorm is a personality test. Now section hiking and packrafting.',
        links: { youtube: '@elkwhisperer' },
        tags: { activities: ['thru-hiking', 'packrafting', 'mountaineering'], seasons: ['summer', 'fall'], custom: ['triple crown'] },
    },
    {
        username: 'slowpoke', displayName: 'Jim Barrett', trailName: 'Slowpoke', banner: 'banner-at',
        bio: 'Section hiking the AT a week at a time since 2019. Virginia done, Maine someday. I like a chair at camp.',
        tags: { activities: ['section hiking', 'backpacking'], seasons: ['fall'], custom: ['comfort over grams'] },
    },
    {
        username: 'kestrel', displayName: 'Aiyana Clark', trailName: 'Kestrel', banner: 'banner-pct',
        bio: 'PCT SOBO 2025. Washington in September is the best month of my life. Wildlife biologist off trail.',
        tags: { activities: ['thru-hiking', 'trail running'], seasons: ['summer', 'fall'] },
    },
    {
        username: 'two_socks', displayName: 'Leo Fischer', trailName: 'Two Socks',
        bio: 'Weekend backpacker in Colorado, saving up vacation for the PCT in 2027.',
        tags: { activities: ['backpacking', 'day hiking'], seasons: ['summer'] },
    },
    {
        username: 'bramble', displayName: 'Chloe Nguyen', trailName: 'Bramble', banner: 'banner-at',
        bio: 'AT flip-flop 2026 from Harpers Ferry. Hammock camper, tea drinker.',
        tags: { activities: ['thru-hiking', 'backpacking'], seasons: ['spring', 'summer'], custom: ['hammock'] },
    },
    {
        username: 'ridgerunner', displayName: 'Marcus Bell', trailName: '', banner: 'banner-cdt',
        bio: 'CDT 2026 NOBO, alternates TBD. Former Army, learning to carry less.',
        tags: { activities: ['thru-hiking', 'backpacking'], seasons: ['spring', 'summer', 'fall'] },
    },
    {
        username: 'trailwise', displayName: 'Rosa Kim', trailName: 'Trailwise',
        bio: 'Gear editor at Waymark Gear. 9,000 trail miles and a closet full of things I tested so you don\'t have to.',
        tags: { activities: ['thru-hiking', 'backpacking', 'fastpacking'], custom: ['Waymark team'] },
    },
    {
        username: 'waymark', displayName: 'Waymark Gear', trailName: '',
        bio: 'The team behind Waymark Gear. Report a problem from any page; we read every ticket.',
        tags: { custom: ['Waymark team'] },
    },
];

// ---- lists ----------------------------------------------------------------------
// Each row: [category, name, weight oz | catalog name, { qty, worn, consumable, desc }]
// A string matching a catalog item name uses the catalog entry.

const C = (name, extra = {}) => ({ catalog: name, ...extra });
const I = (name, oz, extra = {}) => ({ name, oz, ...extra });
const worn = { worn: true };
const cons = { consumable: true };

const LISTS = {
    sunny_strides: [
        {
            name: 'PCT 2025: the whole thing', tripType: 'thru', trail: { name: 'Pacific Crest Trail', year: 2025, direction: 'nobo' },  published: true, featured: true,
            description: 'What I carried from Campo to Manning Park, April 14 to September 22. Bear can only for the Sierra (Kennedy Meadows to Sonora Pass); microspikes from KM to Tuolumne. Umbrella the whole desert.',
            trip: { days: 6, foodPerDayMg: 793787, waterLiters: 4, distanceKm: 4265, elevationM: 149000, terrain: 'trail', tempLowC: -4, tempHighC: 35, bodyKg: 61 },
            items: [
                ['Shelter', C('Duplex'), C('Thinlight foam pad'), I('Stakes (8, MSR Mini Groundhog)', 3.2)],
                ['Sleep', C('Enigma 20°F quilt'), C('NeoAir XLite NXT'), I('Inflatable pillow', 2.1)],
                ['Pack', C('Southwest 3400'), I('Pack liner (trash compactor bag)', 2.0)],
                ['Kitchen', C('BRS-3000T stove'), C('750 ml titanium pot'), C('Long handle spoon'), I('Fuel canister 110 g', 7.0, cons), C('BV450 bear canister', { desc: 'Sierra only' })],
                ['Water', C('Squeeze filter'), I('Smartwater 1 L bottles', 1.3, { qty: 3 }), C('Vecto 2 L bag')],
                ['Clothing', C('Ghost Whisperer/2 Hoody'), C('Helium Rain Jacket'), C('Echo sun hoody', worn), I('Running shorts', 3.5, worn), C('Hiker micro crew socks', { qty: 2 }), I('Sleep leggings', 5.0), I('Sun hat', 2.5, worn)],
                ['Electronics', C('inReach Mini 2'), C('NU25 UL headlamp'), C('NB10000 power bank'), I('Phone (FarOut)', 7.0, worn), I('Cables and charger', 2.4)],
                ['Misc', C('Swing Liteflex umbrella'), C('Distance Carbon Z poles', worn), C('Microspikes', { desc: 'Kennedy Meadows to Tuolumne' }), I('First aid kit (Leukotape, ibuprofen, Benadryl)', 3.0), C('Classic SD'), C('Deuce #2 trowel'), I('Toiletries (sunscreen, toothbrush, Dr. Bronner\'s)', 5.5)],
                ['Footwear', C('Speedgoat 6', worn)],
            ],
        },
        {
            name: 'AT 2023 (summer, warm)', tripType: 'thru', trail: { name: 'AT', year: 2023, direction: 'nobo' },  published: true,
            description: 'NOBO, March to August. Lighter quilt after Damascus, Frogg Toggs because everything gets wet anyway.',
            trip: { days: 5, foodPerDayMg: 793787, waterLiters: 2, distanceKm: 3530, elevationM: 140000, terrain: 'trail', tempLowC: 4, tempHighC: 30, bodyKg: 61 },
            items: [
                ['Shelter', C('The One'), I('Stakes (6)', 2.4)],
                ['Sleep', C('Enigma 20°F quilt'), C('NeoAir XLite NXT')],
                ['Pack', C('Mariposa 60'), I('Pack liner', 2.0)],
                ['Kitchen', I('Cold soak jar (Talenti)', 1.5), C('Long handle spoon'), C('Ursack Major')],
                ['Water', C('Squeeze filter'), I('Smartwater 1 L bottles', 1.3, { qty: 2 })],
                ['Clothing', C('Alpha 90 hoodie'), C('Ultra-Lite 2 rain jacket'), I('Running shorts', 3.5, worn), I('Tech tee', 4.0, worn), C('Hiker micro crew socks', { qty: 2 })],
                ['Electronics', C('NU25 UL headlamp'), C('NB10000 power bank'), I('Phone', 7.0, worn)],
                ['Misc', I('First aid kit', 3.0), C('Classic SD'), C('Deuce #2 trowel'), I('Toiletries', 4.5), C('Distance Carbon Z poles', worn)],
                ['Footwear', C('Lone Peak 9', worn)],
            ],
        },
    ],
    patchwork: [
        {
            name: 'AT NOBO 2026, first draft', tripType: 'thru', trail: { name: 'Appalachian Trail', year: 2026, direction: 'nobo' },  published: true, shakedown: true, featured: true,
            description: 'Leaving Springer March 12. Base weight feels high but I\'d rather be warm in the Smokies. What would you cut?',
            trip: { days: 4, foodPerDayMg: 907185, waterLiters: 2, distanceKm: 3530, elevationM: 140000, terrain: 'trail', tempLowC: -6, tempHighC: 18, bodyKg: 82 },
            items: [
                ['Shelter', C('Copper Spur HV UL2'), I('Footprint', 6.0)],
                ['Sleep', C('UltraLite 20°F bag'), C('Tensor All-Season'), I('Camp pillow', 3.0)],
                ['Pack', C('Exos 58'), I('Rain cover', 3.5)],
                ['Kitchen', C('Flash cooking system'), I('Fuel canister 230 g', 13.0, cons), I('Spork', 0.6), I('Food bag + rope', 4.0)],
                ['Water', C('BeFree 1.0 L'), I('Nalgene 1 L', 6.2, { qty: 2 })],
                ['Clothing', C('Nano Puff Hoody'), C('Helium Rain Jacket'), I('Fleece pullover', 11.0), I('Rain pants', 7.0), I('Hiking pants', 9.0, worn), I('Long-sleeve shirt', 6.0, worn), C('Hiker micro crew socks', { qty: 3 }), I('Beanie', 1.5), I('Gloves', 2.0)],
                ['Electronics', I('Phone', 7.2, worn), C('NB10000 power bank'), I('Headlamp (Petzl Actik)', 3.1), I('Earbuds', 1.5)],
                ['Misc', I('First aid kit (store-bought)', 9.0), I('Knife (Leatherman Skeletool)', 5.0), I('Trowel (orange plastic)', 3.0), I('Toiletries', 8.0), I('Camp shoes (Crocs)', 13.0), I('Trekking poles (aluminum)', 18.0, worn)],
                ['Footwear', C('X Ultra 4 Mid GTX', worn)],
            ],
        },
    ],
    elkwhisperer: [
        {
            name: 'CDT 2025: Glacier to Crazy Cook', tripType: 'thru', trail: { name: 'CDT', year: 2025, direction: 'sobo' },  published: true, featured: true,
            description: 'SOBO, June 18 to October 30. Ice axe for Glacier, snow in the San Juans in September, 4+ liters through the Great Basin. The inReach got used for real once.',
            trip: { days: 6, foodPerDayMg: 907185, waterLiters: 5, distanceKm: 4900, elevationM: 140000, terrain: 'offtrail', tempLowC: -10, tempHighC: 32, bodyKg: 68 },
            items: [
                ['Shelter', C('Notch Li'), I('Stakes (8)', 3.6)],
                ['Sleep', C('Flex 22 quilt'), C('NeoAir XTherm NXT'), I('Down booties', 3.0)],
                ['Pack', C('Kakwa 55'), I('Pack liner', 2.0)],
                ['Kitchen', C('Amicus stove'), C('750 ml titanium pot'), C('Long handle spoon'), I('Fuel canister 110 g', 7.0, cons), C('Ursack Major')],
                ['Water', C('BeFree 1.0 L'), C('Aquamira drops'), I('Smartwater 1 L bottles', 1.3, { qty: 2 }), C('Vecto 2 L bag'), I('Platypus 2 L', 1.3)],
                ['Clothing', C('Ghost Whisperer/2 Hoody'), C('Alpha 90 hoodie'), C('Helium Rain Jacket'), I('Rain pants (Frogg Toggs)', 5.0), I('Wind pants', 3.0), I('Fleece gloves + shells', 3.5), I('Beanie', 1.5), I('Sun hoody', 5.0, worn), I('Shorts', 3.5, worn), C('Hiker micro crew socks', { qty: 3 })],
                ['Navigation', I('Paper maps (Ley, by section)', 4.0, cons), I('Compass', 1.0), C('inReach Mini 2'), I('Phone (FarOut + Gaia)', 7.0, worn)],
                ['Electronics', C('NU25 UL headlamp'), C('NB10000 power bank', { qty: 2 })],
                ['Snow', C('Corsa ice axe'), C('Microspikes')],
                ['Misc', I('First aid kit', 4.0), C('Classic SD'), C('Deuce #2 trowel'), I('Toiletries', 5.0), C('Distance Carbon Z poles', worn)],
                ['Footwear', C('Lone Peak 9', worn)],
            ],
        },
        {
            name: 'Wind River High Route (7 days)', tripType: 'backpacking', trail: { name: 'Wind River High Route', year: 2025 },  published: true,
            description: 'Mostly off trail, Class 3 in spots. Tested what I\'ll carry on the next CDT alternates.',
            trip: { days: 7, foodPerDayMg: 793787, waterLiters: 1, distanceKm: 150, elevationM: 9000, terrain: 'offtrail', tempLowC: -2, tempHighC: 20, bodyKg: 68 },
            items: [
                ['Shelter', C('The One')],
                ['Sleep', C('Enigma 20°F quilt'), C('NeoAir XTherm NXT')],
                ['Pack', C('Southwest 3400')],
                ['Kitchen', C('BRS-3000T stove'), C('750 ml titanium pot'), I('Fuel', 7.0, cons), C('Ursack Major')],
                ['Water', C('BeFree 1.0 L')],
                ['Clothing', C('Ghost Whisperer/2 Hoody'), C('Helium Rain Jacket'), I('Beanie', 1.5)],
                ['Misc', C('inReach Mini 2'), C('NU25 UL headlamp'), C('Microspikes'), I('First aid kit', 4.0), I('Helmet', 10.0)],
                ['Footwear', C('Speedgoat 6', worn)],
            ],
        },
    ],
    slowpoke: [
        {
            name: 'AT sections, fall', tripType: 'section', trail: { name: 'A.T.', year: 2026, direction: 'section' },  published: true,
            description: 'A week at a time. I bring the chair. I bring the good coffee. I am in no hurry.',
            trip: { days: 7, foodPerDayMg: 1020580, waterLiters: 2, distanceKm: 130, elevationM: 6000, terrain: 'trail', tempLowC: 2, tempHighC: 20, bodyKg: 95 },
            items: [
                ['Shelter', C('Copper Spur HV UL2')],
                ['Sleep', C('UltraLite 20°F bag'), C('Tensor All-Season'), I('Pillow', 4.0)],
                ['Pack', C('Circuit')],
                ['Kitchen', C('Flash cooking system'), I('Fuel 230 g', 13.0, cons), I('AeroPress Go', 11.0), I('Coffee', 8.0, cons), I('Mug', 3.0)],
                ['Water', C('Squeeze filter'), I('Nalgene 1 L', 6.2, { qty: 2 })],
                ['Clothing', C('Nano Puff Hoody'), C('Helium Rain Jacket'), I('Fleece', 11.0), I('Camp pants', 8.0)],
                ['Comfort', I('Helinox Chair Zero', 18.0), I('Kindle', 6.0)],
                ['Misc', I('First aid kit', 8.0), I('Headlamp', 3.0), I('Trekking poles', 18.0, worn)],
                ['Footwear', C('X Ultra 4 Mid GTX', worn)],
            ],
        },
    ],
    kestrel: [
        {
            name: 'PCT SOBO 2025', tripType: 'thru', trail: { name: 'PCT', year: 2025, direction: 'sobo' },  published: true,
            description: 'Rainy Pass to Campo, July 2 to November 9. Washington was wet, the Sierra was cold and empty, SoCal was hot in October.',
            trip: { days: 5, foodPerDayMg: 793787, waterLiters: 3, distanceKm: 4265, elevationM: 149000, terrain: 'trail', tempLowC: -6, tempHighC: 33, bodyKg: 57 },
            items: [
                ['Shelter', C('X-Mid 1'), I('Stakes (6)', 2.4)],
                ['Sleep', C('Revelation 20°F quilt'), C('NeoAir XLite NXT')],
                ['Pack', C('Kakwa 55')],
                ['Kitchen', I('Cold soak jar', 1.5), C('Long handle spoon'), C('BV450 bear canister', { desc: 'Sierra' })],
                ['Water', C('BeFree 1.0 L'), I('Smartwater 1 L', 1.3, { qty: 3 })],
                ['Clothing', C('Nano Puff Hoody'), C('Ultra-Lite 2 rain jacket'), C('Echo sun hoody', worn), I('Leggings', 6.0, worn), C('Hiker micro crew socks', { qty: 2 })],
                ['Electronics', C('Zoleo'), C('NU25 UL headlamp'), C('NB10000 power bank')],
                ['Misc', I('First aid', 3.0), C('Classic SD'), C('Deuce #2 trowel'), C('Distance Carbon Z poles', worn), I('Binoculars (birds!)', 9.0)],
                ['Footwear', C('Lone Peak 9', worn)],
            ],
        },
    ],
    two_socks: [
        {
            name: 'Colorado weekend', tripType: 'backpacking', trail: { name: 'Indian Peaks Loop' },  published: true,
            description: 'Two nights in the Indian Peaks. Heavy, I know. Slowly replacing things.',
            trip: { days: 2, foodPerDayMg: 680389, waterLiters: 2, distanceKm: 30, elevationM: 1500, terrain: 'trail', tempLowC: 2, tempHighC: 22, bodyKg: 78 },
            items: [
                ['Shelter', C('Copper Spur HV UL2')],
                ['Sleep', I('Synthetic bag 30°F', 48.0), I('Foam pad (Z Lite)', 14.0)],
                ['Pack', C('Exos 58')],
                ['Kitchen', C('Flash cooking system'), I('Fuel', 13.0, cons)],
                ['Water', C('Squeeze filter'), I('Nalgene', 6.2, { qty: 2 })],
                ['Clothing', I('Fleece', 11.0), C('Ultra-Lite 2 rain jacket')],
                ['Misc', I('Headlamp', 3.0), I('First aid', 6.0)],
            ],
        },
    ],
    bramble: [
        {
            name: 'AT flip-flop 2026 (hammock)', tripType: 'thru', trail: { name: 'Appalachian Trail', year: 2026, direction: 'flip' },  published: true, shakedown: true,
            description: 'Harpers Ferry north to Katahdin, then back to Springer. Hammock the whole way. Underquilt question: do I need one in Maine in August?',
            trip: { days: 4, foodPerDayMg: 793787, waterLiters: 2, distanceKm: 3530, elevationM: 140000, terrain: 'trail', tempLowC: 0, tempHighC: 28, bodyKg: 60 },
            items: [
                ['Shelter', C('Blackbird XLC hammock'), I('Tarp (Hammock Gear Journey)', 12.0), I('Suspension (whoopie slings)', 3.0)],
                ['Sleep', I('Underquilt 20°F', 18.0), C('Enigma 20°F quilt')],
                ['Pack', C('Mariposa 60')],
                ['Kitchen', C('Amicus stove'), C('750 ml titanium pot'), I('Fuel', 7.0, cons), I('Tea kit', 3.0, cons)],
                ['Water', C('Squeeze filter'), I('Smartwater', 1.3, { qty: 2 })],
                ['Clothing', C('Ghost Whisperer/2 Hoody'), C('Helium Rain Jacket'), I('Hiking dress', 6.0, worn)],
                ['Misc', C('NU25 UL headlamp'), I('First aid', 4.0), C('Deuce #2 trowel')],
                ['Footwear', C('Lone Peak 9', worn)],
            ],
        },
    ],
    ridgerunner: [
        {
            name: 'CDT 2026 NOBO plan', tripType: 'thru', trail: { name: 'Continental Divide Trail', year: 2026, direction: 'nobo' },  published: true, shakedown: true,
            description: 'Crazy Cook April 20. Coming from 50 lb rucks, so this already feels light. Is the ice axe overkill for a normal snow year?',
            trip: { days: 6, foodPerDayMg: 1020580, waterLiters: 6, distanceKm: 4900, elevationM: 140000, terrain: 'offtrail', tempLowC: -8, tempHighC: 34, bodyKg: 88 },
            items: [
                ['Shelter', C('Lunar Solo')],
                ['Sleep', C('UltraLite 20°F bag'), C('NeoAir XTherm NXT')],
                ['Pack', C('Circuit')],
                ['Kitchen', C('Amicus stove'), C('750 ml titanium pot'), I('Fuel', 7.0, cons), C('Ursack Major')],
                ['Water', C('Squeeze filter'), C('Aquamira drops'), I('Smartwater', 1.3, { qty: 4 }), I('Platypus 2 L', 1.3)],
                ['Clothing', C('Nano Puff Hoody'), C('Helium Rain Jacket'), I('Fleece', 11.0), I('Rain pants', 7.0)],
                ['Navigation', C('inReach Mini 2'), I('Paper maps', 4.0, cons), I('Compass', 1.0)],
                ['Snow', C('Corsa ice axe'), C('Microspikes')],
                ['Misc', C('NU25 UL headlamp'), I('First aid (IFAK)', 9.0), I('Knife (fixed blade)', 6.0)],
                ['Footwear', C('Speedgoat 6', worn)],
            ],
        },
    ],
    trailwise: [
        {
            name: 'Gear editor\'s 3-season kit', tripType: 'backpacking', published: true,
            description: 'What I reach for when I\'m not testing something. Every item here has at least 1,000 miles on it.',
            trip: { days: 4, foodPerDayMg: 793787, waterLiters: 2, distanceKm: 120, elevationM: 6000, terrain: 'trail', tempLowC: 0, tempHighC: 26, bodyKg: 64 },
            items: [
                ['Shelter', C('X-Mid 1')],
                ['Sleep', C('Enigma 20°F quilt'), C('NeoAir XLite NXT')],
                ['Pack', C('Kakwa 55')],
                ['Kitchen', C('BRS-3000T stove'), C('750 ml titanium pot'), C('Long handle spoon'), I('Fuel', 7.0, cons)],
                ['Water', C('Squeeze filter'), I('Smartwater', 1.3, { qty: 2 })],
                ['Clothing', C('Ghost Whisperer/2 Hoody'), C('Helium Rain Jacket'), C('Echo sun hoody', worn)],
                ['Misc', C('inReach Mini 2'), C('NU25 UL headlamp'), I('First aid', 3.0), C('Classic SD'), C('Distance Carbon Z poles', worn)],
                ['Footwear', C('Lone Peak 9', worn)],
            ],
        },
    ],
    waymark: [],
};

// ---- build a library ------------------------------------------------------------------

function buildLibrary(lists, catalogByName) {
    const lib = new Library();
    lib.totalUnit = 'lb';
    lib.itemUnit = 'oz';
    const defaultList = lib.lists[0];
    const defaultItems = [...lib.items];
    const closet = new Map(); // one closet item per gear name, shared between lists
    const made = [];
    for (const spec of [...lists].reverse()) {
        const list = lib.newList();
        list.name = spec.name;
        list.description = spec.description || '';
        if (spec.tripType) list.tripType = spec.tripType;
        if (spec.trip) list.trip = spec.trip;
        if (spec.shakedown) list.shakedown = true;
        if (spec.trail) list.trail = spec.trail;
        for (const [catName, ...rows] of spec.items) {
            const category = lib.newCategory({ list });
            category.name = catName;
            for (const row of rows) {
                const key = row.catalog || row.name;
                let item = closet.get(key);
                if (!item) {
                    if (row.catalog) {
                        const entry = catalogByName.get(row.catalog);
                        if (!entry) throw new Error(`No catalog item ${row.catalog}`);
                        item = lib.newItemFromCatalog({ category: null, entry });
                    } else {
                        item = lib.newItem({});
                        item.name = row.name;
                        item.weight = Math.round(weightUtils.WeightToMg(row.oz, 'oz'));
                        item.authorUnit = 'oz';
                    }
                    if (row.desc) item.description = row.desc;
                    closet.set(key, item);
                }
                category.addItem({ itemId: item.id, qty: row.qty || 1, worn: row.worn ? 1 : 0, consumable: Boolean(row.consumable) });
            }
        }
        made.unshift({ list, spec });
    }
    if (lib.lists.length > 1) lib.removeList(defaultList.id);
    for (const i of defaultItems) if (lib.getItemById(i.id)) lib.removeItem(i.id);
    lib.defaultListId = made.length ? made[0].list.id : lib.lists[0].id;
    return { lib, made };
}

// ---- go -------------------------------------------------------------------------------

const log = (...a) => console.log(...a);
const clients = new Map();

async function account(h) {
    const c = new Client(h.username);
    try {
        await c.post('/register', { username: h.username, password: PASSWORD, email: `${h.username}@example.com` });
    } catch (err) {
        if (!/already exists/.test(err.message)) throw err;
        await c.post('/signin', { username: h.username, password: PASSWORD });
    }
    clients.set(h.username, c);
    return c;
}

async function main() {
    log(`Seeding ${BASE}`);
    // Accounts first, so the owner can load the catalog.
    for (const h of HIKERS) await account(h);
    const owner = clients.get('waymark');

    const csv = ['sku,name,brand,category,description,weight,unit,price,url,worn_default,consumable_default,tags,status',
        ...CATALOG.map(([sku, name, brand, cat, desc, w, unit, price, url]) => [sku, name, brand, cat, desc, w, unit, price.toFixed(2), url,
            cat === 'Footwear' ? 'true' : 'false', 'false', '', 'published'].map((v) => (/[",]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v)).join(','))].join('\n');
    const imp = await owner.post('/api/admin/catalog/import/apply', { csv });
    log('catalog:', JSON.stringify(imp.summary));
    const all = [];
    for (let offset = 0; ; offset += 200) {
        const page = await owner.get(`/api/admin/catalog?status=published&limit=200&offset=${offset}`);
        all.push(...page.items);
        if (page.items.length < 200) break;
    }
    const catalogByName = new Map(all.filter((i) => i.sku && i.sku.startsWith('DM-')).map((i) => [i.name, i]));

    // Profiles, banners and libraries.
    const shareIds = {};
    for (const h of HIKERS) {
        const c = clients.get(h.username);
        let bannerUrl = '';
        if (h.banner && image(h.banner)) bannerUrl = await c.upload(image(h.banner), 'banner');
        const specs = LISTS[h.username] || [];
        const { lib, made } = buildLibrary(specs, catalogByName);
        for (const m of made) {
            if (m.spec.published) {
                const { externalId } = await c.post('/externalId', {});
                m.list.externalId = externalId;
                m.list.published = true;
                shareIds[`${h.username}/${m.spec.name}`] = externalId;
            }
        }
        const me = await c.post('/signin', {});
        await c.post('/saveLibrary', { username: h.username, data: JSON.stringify(lib.save()), sync_token: me.sync_token });
        const profile = await c.get('/api/profile');
        await c.put('/api/profile', {
            ...profile,
            displayName: h.displayName,
            trailName: h.trailName,
            bio: h.bio,
            links: h.links || {},
            tags: h.tags || {},
            bannerUrl: bannerUrl || profile.bannerUrl || '',
            featured: made.filter((m) => m.spec.featured).map((m) => m.list.externalId),
        });
        log(`@${h.username}: ${made.length} lists`);
    }
    const sid = (user, name) => shareIds[`${user}/${name}`];

    // Feature the best lists on the homepage.
    for (const key of ['sunny_strides/PCT 2025: the whole thing', 'elkwhisperer/CDT 2025: Glacier to Crazy Cook', 'trailwise/Gear editor\'s 3-season kit']) {
        await owner.put(`/api/admin/kits/${shareIds[key]}`, { featured: true }).catch((e) => log('feature:', e.message));
    }

    // Follows.
    const follows = [
        ['patchwork', 'sunny_strides'], ['patchwork', 'elkwhisperer'], ['patchwork', 'trailwise'], ['kestrel', 'sunny_strides'],
        ['two_socks', 'sunny_strides'], ['two_socks', 'kestrel'], ['bramble', 'sunny_strides'], ['bramble', 'slowpoke'],
        ['ridgerunner', 'elkwhisperer'], ['ridgerunner', 'trailwise'], ['slowpoke', 'bramble'], ['elkwhisperer', 'sunny_strides'],
        ['sunny_strides', 'elkwhisperer'], ['sunny_strides', 'kestrel'], ['trailwise', 'elkwhisperer'],
    ];
    for (const [a, b] of follows) await clients.get(a).post(`/api/users/${b}/follow`, {});

    // Votes.
    const votes = {
        [sid('sunny_strides', 'PCT 2025: the whole thing')]: ['patchwork', 'kestrel', 'two_socks', 'bramble', 'elkwhisperer', 'ridgerunner', 'trailwise'],
        [sid('elkwhisperer', 'CDT 2025: Glacier to Crazy Cook')]: ['ridgerunner', 'sunny_strides', 'patchwork', 'trailwise', 'kestrel'],
        [sid('kestrel', 'PCT SOBO 2025')]: ['sunny_strides', 'two_socks', 'bramble'],
        [sid('trailwise', 'Gear editor\'s 3-season kit')]: ['patchwork', 'two_socks', 'bramble', 'ridgerunner'],
        [sid('sunny_strides', 'AT 2023 (summer, warm)')]: ['bramble', 'patchwork'],
        [sid('elkwhisperer', 'Wind River High Route (7 days)')]: ['two_socks', 'sunny_strides'],
        [sid('slowpoke', 'AT sections, fall')]: ['bramble'],
        [sid('patchwork', 'AT NOBO 2026, first draft')]: ['bramble'],
    };
    for (const [id, users] of Object.entries(votes)) for (const u of users) await clients.get(u).post(`/api/kits/${id}/vote`, { value: 1 });

    // Shakedown threads.
    const say = (u, id, body, extra = {}) => clients.get(u).post(`/api/kits/${id}/comments`, { body, ...extra });
    const at = sid('patchwork', 'AT NOBO 2026, first draft');
    const c1 = await say('sunny_strides', at, 'The Crocs are 13 oz. Most people send them home at Neels Gap. A pair of $5 foam sandals or just your shoes untied at camp works fine.', { kind: 'suggestion', itemName: 'Camp shoes (Crocs)' });
    await say('patchwork', at, 'Fair. I mostly wanted them for river crossings, but I guess the AT barely has any.', { parentId: c1.id });
    await say('elkwhisperer', at, 'Swap the Jetboil (13.1 oz) for a BRS and a Toaks pot (4.5 oz together). You\'ll boil slower but save half a pound every day for 2,200 miles.', { kind: 'suggestion', itemName: 'Flash cooking system' });
    await say('trailwise', at, 'Your bag and pad are a great choice for March in the Smokies; I wouldn\'t touch those. Biggest easy wins: the rain cover (use the liner instead), the footprint, and the 9 oz first aid kit. That\'s about a pound.', { kind: 'suggestion', itemName: 'Rain cover' });
    await say('bramble', at, 'See you out there! I\'m starting from Harpers Ferry in May so maybe we cross paths in Virginia.');
    const br = sid('bramble', 'AT flip-flop 2026 (hammock)');
    await say('slowpoke', br, 'Maine in August got down to 45°F at night when I was there. I\'d keep a light underquilt, or at least a foam pad you can slip into the hammock.', { kind: 'suggestion', itemName: 'Underquilt 20°F' });
    await say('sunny_strides', br, 'Love this list. Tea kit is non-negotiable.');
    const cdt = sid('ridgerunner', 'CDT 2026 NOBO plan');
    await say('elkwhisperer', cdt, 'Starting April 20 NOBO you\'ll hit the San Juans in mid June. In a normal year that\'s still serious snow; keep the axe and the spikes, and practice self-arrest before you go.', { kind: 'suggestion', itemName: 'Corsa ice axe' });
    await say('trailwise', cdt, 'The fixed blade is 6 oz; a Classic SD does 95% of the job at 0.75 oz.', { kind: 'suggestion', itemName: 'Knife (fixed blade)' });
    const pct = sid('sunny_strides', 'PCT 2025: the whole thing');
    await say('kestrel', pct, 'The umbrella converted me too. Did you carry it through Washington?');
    await say('two_socks', pct, 'Saving this for 2027. How was the Duplex in the wind in the desert?');

    // Gear reviews.
    const tw = clients.get('trailwise');
    const review = (name, r) => tw.post(`/api/catalog/${catalogByName.get(name).id}/reviews`, r);
    await review('Duplex', { rating: 5, title: 'Still the thru-hiker benchmark', usedFor: '2,650 miles on the PCT', body: 'Pitches tight in under three minutes once you have the stake order down, sheds wind better than its shape suggests, and two doors mean nobody climbs over anyone. DCF needs a little care around sharp rocks.\n\nAt 19 oz for two people, nothing else in this price range comes close.', pros: 'Weight, space, two doors', cons: 'Price; condensation on still nights' });
    await review('X-Mid 1', { rating: 5, title: 'The best value in shelters', usedFor: '900 miles, Colorado Trail + Sierra', body: 'Double wall, huge vestibules, a rectangle footprint that fits small sites, and half the price of DCF. The 28 oz is honest and worth it for the condensation management alone.', pros: 'Price, livability, pitch', cons: 'Heavier than DCF single walls' });
    await review('Enigma 20°F quilt', { rating: 5, title: 'The quilt everyone ends up with', usedFor: 'Three thru-hikes', body: 'Sewn footbox, enough width options to fit anyone, and EE\'s temperature ratings are honest limits rather than comfort ratings. Add pad straps on the first night.', pros: 'Warmth for weight, custom sizes', cons: 'Drafty until you learn the straps' });
    await review('NeoAir XLite NXT', { rating: 4, title: 'Warm and light, still a bit crinkly', usedFor: '1,500 miles', body: 'The NXT version is much quieter than the old one and the R 4.5 covers three seasons. Carry a patch kit; I punctured one on the CDT.', pros: 'R-value per ounce', cons: 'Puncture risk, price' });
    await review('Squeeze filter', { rating: 4, title: 'Reliable, but backflush it', usedFor: 'Every trip since 2016', body: 'Fits Smartwater bottles, lasts forever if you backflush and keep it from freezing. The included bags are bad; use a CNOC.', pros: 'Cheap, durable, fits bottles', cons: 'Slows down as it clogs; freeze risk' });
    await review('Lone Peak 9', { rating: 4, title: 'The default thru-hiking shoe for a reason', usedFor: '600 miles per pair', body: 'Wide toe box, grippy enough, drains fast. The 9 lasts a little longer than the 7 did. Zero drop takes a few weeks to get used to.', pros: 'Fit, drainage', cons: 'Durability ~500 miles' });
    await clients.get('waymark').post(`/api/catalog/${catalogByName.get('Southwest 3400').id}/reviews`, { rating: 4, title: 'Carries 30 lb like it\'s nothing', usedFor: 'Desert water carries', body: 'Stays comfortable with six liters on board, which is exactly when frameless packs fall apart. Pricey, and the side pockets are snug for 1.5 L bottles.', pros: 'Load carry, weatherproof', cons: 'Side pockets, price' });

    // Wishlists, then price drops (alerts land in the notifications).
    for (const [u, items] of [['patchwork', ['Duplex', 'BRS-3000T stove', 'Enigma 20°F quilt']], ['two_socks', ['X-Mid 1', 'Enigma 20°F quilt', 'Kakwa 55']], ['ridgerunner', ['Classic SD']]]) {
        const c = clients.get(u);
        const me = await c.post('/signin', {});
        const lib = new Library();
        lib.load(JSON.parse(me.library));
        for (const n of items) {
            const it = lib.newItemFromCatalog({ category: null, entry: catalogByName.get(n) });
            it.wishlist = true;
        }
        await c.post('/saveLibrary', { username: u, data: JSON.stringify(lib.save()), sync_token: me.sync_token });
    }
    for (const [n, prices] of [['Duplex', [699, 649]], ['Enigma 20°F quilt', [360, 335, 324]], ['NeoAir XLite NXT', [230, 199]], ['X-Mid 1', [300, 280]]]) {
        const item = catalogByName.get(n);
        for (const p of prices.slice(1)) await owner.put(`/api/admin/catalog/${item.id}`, { ...item, price: String(p) });
    }

    // Trip journals with photos.
    const journal = async (u, trip, entries) => {
        const c = clients.get(u);
        const t = await c.post('/api/trips', trip);
        let cover = '';
        for (const e of entries) {
            const photos = [];
            for (const p of e.photos || []) if (image(p)) photos.push(await c.upload(image(p), 'photo'));
            if (!cover && photos.length) cover = photos[0];
            const after = await c.post(`/api/trips/${t.id}/entries`, {});
            const entry = after.entries[after.entries.length - 1];
            await c.put(`/api/trips/${t.id}/entries/${entry.id}`, { date: e.date, title: e.title, body: e.body, distanceKm: e.km, photos });
        }
        await c.put(`/api/trips/${t.id}`, { ...trip, coverUrl: cover });
        return t.id;
    };
    const libFor = async (u, name) => {
        const c = clients.get(u);
        const me = await c.post('/signin', {});
        const lib = JSON.parse(me.library);
        return lib.lists.find((l) => l.name === name)?.id ?? null;
    };
    const tripIds = {};
    tripIds.pct = await journal('sunny_strides', {
        title: 'PCT 2025: Mexico to Canada', startDate: '2025-04-14', endDate: '2025-09-22', visibility: 'public',
        listId: await libFor('sunny_strides', 'PCT 2025: the whole thing'),
        summary: '2,650 miles, 161 days, one umbrella. Highlights from the journal I kept on my phone.',
    }, [
        { date: '2025-04-14', title: 'Campo: the fence and the first 20', km: 32.2, photos: ['pct-desert'], body: 'Started at 6:10 am with four liters. Hauser Creek at noon was already 31°C. **The umbrella paid for itself on day one.**' },
        { date: '2025-05-28', title: 'Kennedy Meadows: the Sierra starts', km: 0, photos: [], body: 'Zero day. Picked up the bear can, microspikes and the warmer socks. Pack weight jumped 3.5 lb and I felt every ounce up to Chicken Spring Lake.' },
        { date: '2025-06-09', title: 'Forester Pass', km: 27.4, photos: ['pct-sierra', 'pct-lake'], body: 'Highest point on the trail at 13,153 ft. Snow chute was soft by 10 am; spikes were enough. Rae Lakes in the evening light made me cry a little.' },
        { date: '2025-08-30', title: 'Goat Rocks in the fog', km: 36.0, photos: ['pct-cascades'], body: 'Knife Edge with zero visibility, then the clouds broke at Old Snowy. Washington is wet and I do not care.' },
        { date: '2025-09-22', title: 'Monument 78', km: 14.5, photos: ['at-sunset'], body: '161 days. Thank you to every trail angel between here and Campo.' },
    ]);
    tripIds.cdt = await journal('elkwhisperer', {
        title: 'CDT 2025 SOBO', startDate: '2025-06-18', endDate: '2025-10-30', visibility: 'public',
        listId: await libFor('elkwhisperer', 'CDT 2025: Glacier to Crazy Cook'),
        summary: 'The third leg of the Triple Crown. Snow at both ends and a lot of sky in between.',
    }, [
        { date: '2025-06-18', title: 'Chief Mountain', km: 19.0, photos: ['cdt-storm'], body: 'Started in sleet. Ice axe out on Triple Divide Pass on day 3.' },
        { date: '2025-08-02', title: 'The Great Divide Basin', km: 48.3, photos: ['cdt-plains'], body: 'Fifty kilometers, two water sources, one pronghorn that followed me for an hour.' },
        { date: '2025-09-14', title: 'San Juans: first snow', km: 24.1, photos: ['cdt-divide'], body: 'Eight inches overnight above 12,000 ft. Waited a day in Lake City. Worth it.' },
    ]);
    tripIds.at = await journal('slowpoke', {
        title: 'AT section: Shenandoah in October', startDate: '2026-10-03', endDate: '2026-10-09', visibility: 'public',
        listId: await libFor('slowpoke', 'AT sections, fall'),
        summary: 'Rockfish Gap to Front Royal, 108 miles of leaves, waysides and blackberry milkshakes.',
    }, [
        { date: '2026-10-03', title: 'Rockfish Gap', km: 21.0, photos: ['at-ridges'], body: 'Cool and clear. Set up the chair at Calf Mountain Shelter by 3.' },
        { date: '2026-10-05', title: 'Wayside day', km: 18.5, photos: ['at-forest'], body: 'Blackberry milkshake at Loft Mountain. Two, actually.' },
    ]);
    await clients.get('patchwork').post('/api/trips', { title: 'AT 2026 planning notes', startDate: '2026-03-12', endDate: '2026-08-30', visibility: 'private', summary: 'Resupply plan and permits.' });

    // A Supporter, an affiliate rule, a ticket, and a few clicks.
    await owner.post('/api/admin/supporters', { username: 'sunny_strides', months: 12 });
    await owner.put('/api/admin/affiliate', { enabled: true, rules: [{ domain: 'rei.com', param: 'avad', value: 'waymark-demo' }, { domain: 'amazon.com', param: 'tag', value: 'waymarkgear-20' }] });
    await clients.get('two_socks').post('/api/tickets', { kind: 'catalog', targetLabel: 'Osprey Exos 58', body: 'The catalog says 39.5 oz but the 2024 version is 2 lb 9 oz (41 oz) on Osprey\'s site.' });
    await clients.get('kestrel').post('/api/tickets', { kind: 'bug', body: 'Pack mode swipe sometimes checks the item below on my Pixel 7.' });
    for (const [n, times] of [['Duplex', 9], ['Enigma 20°F quilt', 6], ['Lone Peak 9', 5], ['X-Mid 1', 4], ['Squeeze filter', 3]]) {
        for (let i = 0; i < times; i++) await new Client('anon').req('GET', `/go/${catalogByName.get(n).id}?from=gear`, undefined, { raw: true });
    }

    const out = {
        base: BASE,
        password: PASSWORD,
        shareIds,
        tripIds,
        catalog: Object.fromEntries([...catalogByName].map(([n, i]) => [n, i.id])),
    };
    fs.writeFileSync(process.env.DEMO_OUT || 'demo-seed.json', JSON.stringify(out, null, 2));
    log('done; wrote', process.env.DEMO_OUT || 'demo-seed.json');
}

main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
