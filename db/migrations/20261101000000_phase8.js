// Phase 8: trails. A curated list of trails (with nicknames, regions and
// sections), the trail tag on pack lists, and the per-pack gear features the
// Trails page counts. Seeded with well-known long-distance trails; the owner
// adds more and approves hikers' suggestions at Owner → Trails.

// slug, name, short, aliases, region, country, length km, notes
const TRAILS = [
    ['at', 'Appalachian Trail', 'AT', ['A.T.', 'Appalachian', 'App Trail'], 'Georgia to Maine · 14 states', 'US', 3540, [
        'Rain most weeks: pack for wet, not cold',
        'Shelters every 8–10 miles; many sleep in hammocks',
        'Water is close together; carry 1–2 L',
        'Bear hangs or an Ursack; canisters only in a few places',
    ]],
    ['pct', 'Pacific Crest Trail', 'PCT', ['Pacific Crest'], 'California, Oregon, Washington', 'US', 4265, [
        'Bear canister required in the Sierra',
        '20–30 mile dry stretches in the desert; 4–6 L capacity',
        'Snow travel in the High Sierra early in the season',
        'Sun all day in Southern California',
    ]],
    ['cdt', 'Continental Divide Trail', 'CDT', ['Continental Divide', 'CDNST'], 'New Mexico to Montana', 'US', 4990, [
        'Navigation is on you: maps, compass, a GPS app, alternates',
        'Ice axe and spikes for the San Juans and Glacier',
        'Long carries in the Great Divide Basin',
        'Lightning and early-season snow above 12,000 ft',
    ]],
    ['colorado-trail', 'Colorado Trail', 'CT', ['Colorado Trl'], 'Denver to Durango, Colorado', 'US', 782, [
        'Most of it above 10,000 ft: cold nights even in July',
        'Afternoon thunderstorms most days; be off ridges by noon',
        'Water is generally easy; carry 2 L',
    ]],
    ['jmt', 'John Muir Trail', 'JMT', ['John Muir', 'Muir Trail'], 'Yosemite to Mount Whitney, California', 'US', 344, [
        'Bear canister required the whole way',
        'Long resupply gaps: often 7–10 days of food',
        'Passes above 11,000 ft; cold mornings',
    ]],
    ['azt', 'Arizona Trail', 'AZT', ['Arizona Trl'], 'Mexico to Utah, Arizona', 'US', 1288, [
        'Water is the planning problem: 6+ L capacity in places',
        'Snow on the Mogollon Rim and Kaibab in spring',
        'The Grand Canyon needs a permit and a plan',
    ]],
    ['long-trail', 'Long Trail', 'LT', ['Long Trl', 'Vermont Long Trail'], 'Massachusetts to Canada, Vermont', 'US', 438, [
        'Steep, rooty and often muddy',
        'Shelters along the whole trail',
    ]],
    ['wonderland', 'Wonderland Trail', '', ['Wonderland'], 'Around Mount Rainier, Washington', 'US', 150, ['Permits for every camp', 'Glacial rivers and big daily climbs']],
    ['tahoe-rim', 'Tahoe Rim Trail', 'TRT', ['Tahoe Rim'], 'Around Lake Tahoe, California and Nevada', 'US', 265, []],
    ['pnt', 'Pacific Northwest Trail', 'PNT', ['Pacific Northwest'], 'Montana to the Washington coast', 'US', 1930, []],
    ['nct', 'North Country Trail', 'NCT', ['North Country'], 'North Dakota to Vermont · 8 states', 'US', 7600, []],
    ['ice-age', 'Ice Age Trail', 'IAT', ['Ice Age'], 'Wisconsin', 'US', 1931, []],
    ['florida-trail', 'Florida Trail', 'FT', ['Florida Scenic Trail'], 'Florida', 'US', 2400, ['Swamp walking: shoes that drain', 'Bugs: a bug net or a tent with mesh']],
    ['superior', 'Superior Hiking Trail', 'SHT', ['Superior Trail'], 'Minnesota', 'US', 499, []],
    ['benton-mackaye', 'Benton MacKaye Trail', 'BMT', ['Benton MacKaye'], 'Georgia, Tennessee, North Carolina', 'US', 462, []],
    ['sheltowee', 'Sheltowee Trace', '', ['Sheltowee'], 'Kentucky and Tennessee', 'US', 550, []],
    ['mst', 'Mountains-to-Sea Trail', 'MST', ['Mountains to Sea'], 'North Carolina', 'US', 1880, []],
    ['hayduke', 'Hayduke Trail', '', ['Hayduke'], 'Utah and Arizona', 'US', 1300, ['Route, not trail: navigation skills required', 'Long water carries']],
    ['uinta-highline', 'Uinta Highline Trail', '', ['Highline Trail', 'Uinta Highline'], 'Utah', 'US', 166, []],
    ['wind-river-high-route', 'Wind River High Route', 'WRHR', ['Wind River', 'Winds High Route'], 'Wyoming', 'US', 130, ['Off trail, Class 3 in places', 'Snow and talus; a helmet for some passes']],
    ['sierra-high-route', 'Sierra High Route', 'SHR', ['Sierra High'], 'California', 'US', 314, ['Off trail; bear canister required']],
    ['get', 'Grand Enchantment Trail', 'GET', ['Grand Enchantment'], 'Arizona and New Mexico', 'US', 1240, []],
    ['odt', 'Oregon Desert Trail', 'ODT', ['Oregon Desert'], 'Oregon', 'US', 1210, []],
    ['gdt', 'Great Divide Trail', 'GDT', ['Great Divide'], 'Alberta and British Columbia', 'CA', 1130, ['Grizzly country: bear spray', 'Snow and fords early in the season']],
    ['west-coast-trail', 'West Coast Trail', 'WCT', [], 'Vancouver Island, British Columbia', 'CA', 75, ['Mud, ladders and tides']],
    ['te-araroa', 'Te Araroa', 'TA', ['Te Araroa Trail'], 'New Zealand, end to end', 'NZ', 3000, ['River crossings and changeable alpine weather', 'Sandflies: cover up']],
    ['gr20', 'GR20', 'GR20', ['GR 20'], 'Corsica', 'FR', 180, ['Rocky, steep and exposed; light pack, sturdy shoes']],
    ['tmb', 'Tour du Mont Blanc', 'TMB', ['Mont Blanc'], 'France, Italy, Switzerland', 'FR', 170, ['Refuges make a light pack easy', 'Snow on high passes into July']],
    ['haute-route', "Walker's Haute Route", '', ['Haute Route'], 'Chamonix to Zermatt', 'CH', 200, []],
    ['hrp', 'Haute Randonnée Pyrénéenne', 'HRP', ['Pyrenean Haute Route'], 'Pyrenees, France and Spain', 'FR', 800, []],
    ['gr11', 'GR11', 'GR11', ['GR 11', 'Senda Pirenaica'], 'Pyrenees, Spain', 'ES', 820, []],
    ['west-highland-way', 'West Highland Way', 'WHW', ['West Highland'], 'Glasgow to Fort William, Scotland', 'GB', 154, ['Midges in summer: a head net', 'Rain gear you trust']],
    ['camino-frances', 'Camino de Santiago (Francés)', 'Camino', ['Camino Frances', 'Camino de Santiago', 'Camino'], 'Saint-Jean-Pied-de-Port to Santiago', 'ES', 780, ['Albergues: no tent needed', 'Light sleeping bag or liner']],
    ['kungsleden', 'Kungsleden', '', ["King's Trail"], 'Lapland, Sweden', 'SE', 440, []],
    ['lycian-way', 'Lycian Way', '', ['Lycian'], 'Turkey', 'TR', 540, []],
    ['larapinta', 'Larapinta Trail', '', ['Larapinta'], 'Northern Territory, Australia', 'AU', 223, ['Hot days, cold nights, water tanks']],
    ['overland-track', 'Overland Track', '', ['Overland'], 'Tasmania, Australia', 'AU', 65, []],
    ['bibbulmun', 'Bibbulmun Track', '', ['Bibbulmun'], 'Western Australia', 'AU', 1000, []],
    ['annapurna-circuit', 'Annapurna Circuit', '', ['Annapurna'], 'Nepal', 'NP', 200, ['Thorong La at 5,416 m: warm layers, acclimatize']],
];

export async function up(knex) {
    await knex.raw(`
        create table if not exists trails (
            id serial primary key,
            slug text not null unique,
            name text not null,
            short_name text not null default '',
            aliases text[] not null default '{}',
            region text not null default '',
            country text not null default '',
            length_km real,
            notes jsonb not null default '[]',
            -- A section of a longer trail (PCT Section J is part of the PCT).
            parent_id integer references trails (id) on delete set null,
            status text not null default 'published' check (status in ('published', 'draft')),
            created_at timestamptz not null default now(),
            updated_at timestamptz not null default now()
        );
        create index if not exists trails_parent_idx on trails (parent_id);

        -- Trail names hikers typed that the owner chose to ignore.
        create table if not exists trail_ignored (
            name_lower text primary key,
            created_at timestamptz not null default now()
        );

        alter table pack_lists add column if not exists trail_text text not null default '';
        -- No foreign key: the relational migration creates this column before
        -- trails exists. Deleting a trail clears it (server/trails.js).
        alter table pack_lists add column if not exists trail_id integer;
        alter table pack_lists add column if not exists trail_year smallint;
        alter table pack_lists add column if not exists trail_direction text not null default '';
        create index if not exists pack_lists_trail_text_idx on pack_lists (lower(trail_text)) where trail_text <> '';

        alter table public_kits add column if not exists trail_id integer references trails (id) on delete set null;
        alter table public_kits add column if not exists trail_year smallint;
        alter table public_kits add column if not exists trail_direction text not null default '';
        alter table public_kits add column if not exists features text[] not null default '{}';
        create index if not exists public_kits_trail_idx on public_kits (trail_id);
    `);
    for (const [slug, name, short, aliases, region, country, km, notes] of TRAILS) {
        await knex('trails').insert({ slug, name, short_name: short, aliases, region, country, length_km: km, notes: JSON.stringify(notes) })
            .onConflict('slug').ignore();
    }
}

export async function down(knex) {
    await knex.raw(`
        drop index if exists public_kits_trail_idx;
        alter table public_kits drop column if exists features;
        alter table public_kits drop column if exists trail_direction;
        alter table public_kits drop column if exists trail_year;
        alter table public_kits drop column if exists trail_id;
        drop index if exists pack_lists_trail_text_idx;
        alter table pack_lists drop column if exists trail_direction;
        alter table pack_lists drop column if exists trail_year;
        alter table pack_lists drop column if exists trail_id;
        alter table pack_lists drop column if exists trail_text;
        drop table if exists trail_ignored;
        drop table if exists trails;
    `);
}
