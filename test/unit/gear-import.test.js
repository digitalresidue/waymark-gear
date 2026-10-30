import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { parseGearCsv, readWeight, sniffDelimiter } from '../../client/utils/lighterpack-import.js';
import { packWizardId, packWizardToList } from '../../client/utils/packwizard-import.js';
import { Library } from '../../client/dataTypes.js';

const items = (out) => out.categories.flatMap((c) => c.items);

describe('other apps and spreadsheets', () => {
    test('column names in other spellings, with a brand column and the unit in the header', () => {
        const out = parseGearCsv([
            'Gear,Brand,Group,Notes,Quantity,Weight (g),Product URL,Cost,Type',
            'Plex Solo,Zpacks,Shelter,DCF,1,394,https://zpacks.example/plex,$599.00,Base',
            'Zpacks Arc Haul,Zpacks,Pack,,1,680,,,',
            'Wind shirt,,Clothing,,1,60,,,Worn',
            'Dinners,,Food,,4,120,,,Consumable',
        ].join('\n'));
        assert.equal(out.itemCount, 4);
        assert.equal(out.unitAssumed, false);
        const [plex, arc, shirt, dinners] = items(out);
        assert.equal(plex.name, 'Zpacks Plex Solo');
        assert.equal(arc.name, 'Zpacks Arc Haul', "the brand isn't repeated");
        assert.equal(plex.unit, 'g');
        assert.equal(plex.weightMg, 394000);
        assert.equal(plex.price, 599);
        assert.equal(plex.description, 'DCF');
        assert.equal(plex.url, 'https://zpacks.example/plex');
        assert.equal(shirt.worn, true);
        assert.equal(dinners.consumable, true);
        assert.equal(dinners.qty, 4);
        assert.deepEqual(out.columns.find((c) => c.field === 'weight'), { field: 'weight', label: 'Weight', from: 'Weight (g)' });
    });

    test('semicolons with decimal commas (European Excel) and tabs (pasted cells)', () => {
        const semi = parseGearCsv('Name;Category;Weight;Unit\nQuilt;Sleep;1,2;kg\nStove;Kitchen;"25,5";g');
        assert.equal(semi.itemCount, 2);
        assert.equal(items(semi)[0].weightMg, 1200000);
        assert.equal(items(semi)[1].weightMg, 25500);
        const tabs = parseGearCsv('Item\tCategory\tWeight\nTent\tShelter\t1 lb 4 oz\nCup\tKitchen\t80g');
        assert.equal(tabs.itemCount, 2);
        assert.equal(items(tabs)[0].weightMg, Math.round(20 * 28349.523125));
        assert.equal(items(tabs)[1].unit, 'g');
    });

    test('weights with no unit anywhere use the chosen unit, and say so', () => {
        const text = 'Name,Weight\nTent,500\nStakes,0';
        const oz = parseGearCsv(text);
        assert.equal(oz.unitAssumed, true);
        assert.equal(items(oz)[0].unit, 'oz');
        const g = parseGearCsv(text, { unit: 'g' });
        assert.equal(items(g)[0].weightMg, 500000);
    });

    test('readWeight and sniffDelimiter', () => {
        assert.deepEqual(readWeight('13.9oz'), { value: 13.9, unit: 'oz' });
        assert.deepEqual(readWeight('2 lbs'), { value: 2, unit: 'lb' });
        assert.deepEqual(readWeight('1,5 kg', true), { value: 1.5, unit: 'kg' });
        assert.deepEqual(readWeight('42'), { value: 42, unit: null });
        assert.equal(readWeight('heavy'), null);
        assert.equal(readWeight('3 stone'), null);
        assert.equal(sniffDelimiter('a;b;"c,d"\n1;2;3'), ';');
        assert.equal(sniffDelimiter('a\tb\tc'), '\t');
        assert.equal(sniffDelimiter('just one column'), ',');
    });
});

const PACK = {
    packName: 'Wind River High Route',
    packDescription: 'Five days above treeline.',
    tableData: [
        { title: 'Big 3', defaultCategory: 'Big 3', rows: {
            a: { item: 'Plex Solo Tent', brand: 'Zpacks', weight: 394, unit: 'g', quantity: 1, price: 599, weightType: 0, url: 'https://zpacks.example/plex', imageUrl: 'https://img.example/plex.jpg', description: 'Single wall.' },
            b: { item: 'Arc Haul', brand: 'Zpacks', weight: 1.5, unit: 'lb', quantity: 1, weightType: 0, url: 'javascript:alert(1)' },
        } },
        { title: '', defaultCategory: 'Clothing', rows: {
            c: { item: 'Wind shirt', weight: 2.1, unit: 'oz', quantity: 1, weightType: 1 },
            d: { item: 'Dinners', weight: 120, unit: 'g', quantity: 4, weightType: 2 },
            e: { item: '', weight: 50, unit: 'g', quantity: 1 },
            f: { item: 'Mystery', weight: 50, unit: 'stone', quantity: 1 },
        } },
        { title: 'Empty', rows: {} },
    ],
};

describe('PackWizard', () => {
    test('share links', () => {
        for (const link of ['https://www.packwizard.com/s/ylp5VSZ', 'packwizard.com/s/ylp5VSZ', 'http://packwizard.com/s/ylp5VSZ/']) {
            assert.equal(packWizardId(link), 'ylp5VSZ', link);
        }
        for (const link of ['https://evil.com/s/ylp5VSZ', 'https://packwizard.com.evil.com/s/x123', 'https://www.packwizard.com/packs', 'https://www.packwizard.com/s/../api', '']) {
            assert.equal(packWizardId(link), null, link);
        }
        assert.equal(packWizardId('http://127.0.0.1:3997/s/TestPk1', '127.0.0.1:3997'), 'TestPk1');
    });

    test('a pack becomes a list: brands, units, worn and consumable, photos', () => {
        const out = packWizardToList(PACK);
        assert.equal(out.name, 'Wind River High Route');
        assert.equal(out.description, 'Five days above treeline.');
        assert.deepEqual(out.categories.map((c) => c.name), ['Big 3', 'Clothing']);
        assert.equal(out.itemCount, 4);
        assert.equal(out.skipped, 2);
        const [tent, pack, shirt, dinners] = items(out);
        assert.equal(tent.name, 'Zpacks Plex Solo Tent');
        assert.equal(tent.weightMg, 394000);
        assert.equal(tent.price, 599);
        assert.equal(tent.imageUrl, 'https://img.example/plex.jpg');
        assert.equal(pack.name, 'Zpacks Arc Haul');
        assert.equal(pack.unit, 'lb');
        assert.equal(pack.url, '');
        assert.equal(shirt.worn, true);
        assert.equal(dinners.consumable, true);
        assert.equal(dinners.qty, 4);
        assert.equal(packWizardToList({ nope: 1 }), null);
    });

    test('the library keeps only photos already copied here', () => {
        const out = packWizardToList(PACK);
        items(out)[0].imageUrl = '/userimages/ab/cd/x.webp';
        const library = new Library();
        const { list } = library.importGearList(out);
        const imported = library.items.filter((i) => i.name);
        assert.equal(list.name, 'Wind River High Route');
        assert.equal(imported.find((i) => i.name === 'Zpacks Plex Solo Tent').imageUrl, '/userimages/ab/cd/x.webp');
        assert.equal(imported.find((i) => i.name === 'Zpacks Arc Haul').imageUrl, '');
    });
});
