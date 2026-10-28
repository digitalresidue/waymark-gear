import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { parseCsv, parseGearCsv, lighterPackId } from '../../client/utils/lighterpack-import.js';

const LIGHTERPACK_CSV = [
    'Item Name,Category,desc,qty,weight,unit,url,price,worn,consumable',
    'Duplex,Shelter,"Zpacks, DCF",1,19,ounce,https://zpacks.com/duplex,699,,',
    'Stakes,Shelter,,6,0.2,ounce,,,,',
    'Puffy,Clothing,"He said ""warm""",1,280,gram,,,Worn,',
    'Dinner,Food,,3,0.25,pound,,,,Consumable',
    "'=SUM(A1),Other,,1,1,ounce,,,,",
].join('\r\n');

describe('parseCsv', () => {
    test('handles quotes, commas and newlines inside fields', () => {
        assert.deepEqual(parseCsv('a,"b,c","d\n""e"""\n1,2,3'), [['a', 'b,c', 'd\n"e"'], ['1', '2', '3']]);
    });
});

describe('parseGearCsv', () => {
    test('reads a LighterPack export with every column', () => {
        const out = parseGearCsv(LIGHTERPACK_CSV, { name: 'PCT 2026' });
        assert.equal(out.name, 'PCT 2026');
        assert.deepEqual(out.categories.map((c) => c.name), ['Shelter', 'Clothing', 'Food', 'Other']);
        assert.equal(out.itemCount, 5);
        assert.equal(out.skipped, 0);
        const [duplex, stakes] = out.categories[0].items;
        assert.equal(duplex.description, 'Zpacks, DCF');
        assert.equal(duplex.weightMg, 538641);
        assert.equal(duplex.url, 'https://zpacks.com/duplex');
        assert.equal(duplex.price, 699);
        assert.equal(stakes.qty, 6);
        const puffy = out.categories[1].items[0];
        assert.equal(puffy.description, 'He said "warm"');
        assert.equal(puffy.unit, 'g');
        assert.equal(puffy.worn, true);
        assert.equal(out.categories[2].items[0].consumable, true);
        assert.equal(out.categories[3].items[0].name, '=SUM(A1)');
    });

    test('accepts the short six-column format and skips rows it cannot read', () => {
        const out = parseGearCsv('Item Name,Category,Description,Qty,Weight,Unit\nTent,Shelter,,1,2,lb\nRock,Misc,,1,2,stone\n,Misc,,1,1,oz');
        assert.equal(out.itemCount, 1);
        assert.equal(out.skipped, 2);
        assert.equal(out.categories[0].items[0].weightMg, 907184);
    });

    test('ignores javascript: links', () => {
        const out = parseGearCsv('Item Name,Category,desc,qty,weight,unit,url\nX,Y,,1,1,oz,javascript:alert(1)');
        assert.equal(out.categories[0].items[0].url, '');
    });
});

describe('lighterPackId', () => {
    test('finds the list id in the usual link shapes', () => {
        for (const link of ['https://lighterpack.com/r/ab12cd', 'lighterpack.com/r/ab12cd', 'http://www.lighterpack.com/r/ab12cd/', 'https://lighterpack.com/csv/ab12cd']) {
            assert.equal(lighterPackId(link), 'ab12cd', link);
        }
    });

    test('refuses other sites and paths', () => {
        for (const link of ['https://evil.com/r/ab12cd', 'https://lighterpack.com.evil.com/r/x', 'https://lighterpack.com/signin', 'https://lighterpack.com/r/../../x', '']) {
            assert.equal(lighterPackId(link), null, link);
        }
    });
});

describe('Library.importGearList', async () => {
    const { Library } = await import('../../client/dataTypes.js');

    test('adds a new list at the top and reuses matching closet gear', () => {
        const library = new Library();
        const first = parseGearCsv(LIGHTERPACK_CSV, { name: 'Trip one' });
        const one = library.importGearList(first);
        const itemsAfterFirst = library.items.length;
        assert.equal(library.lists[0].id, one.list.id);
        assert.equal(library.defaultListId, one.list.id);
        assert.equal(one.reused, 0);

        const two = library.importGearList(parseGearCsv(LIGHTERPACK_CSV, { name: 'Trip two' }));
        assert.equal(two.reused, 5);
        assert.equal(library.items.length, itemsAfterFirst);
        const puffyCategory = library.getCategoryById(two.list.categoryIds[1]);
        assert.equal(puffyCategory.categoryItems[0].worn, 1);
        assert.ok(two.list.totalWornWeight > 0);
    });
});
