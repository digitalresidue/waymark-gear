import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { Library } from '../../client/dataTypes.js';
import { defaultGroupFor, CLOTHING_GROUP, SLEEP_GROUP, SHELTER_GROUP } from '../../client/utils/gear-meta.js';

// A list: Shelter, Base Layer, Sleep, Mid Layer, Shells.
function setup() {
    const library = new Library();
    const list = library.getListById(library.defaultListId);
    const first = library.getCategoryById(list.categoryIds[0]);
    first.name = 'Shelter';
    const cats = { Shelter: first };
    for (const name of ['Base Layer', 'Sleep', 'Mid Layer', 'Shells']) {
        const c = library.newCategory({ list });
        c.name = name;
        cats[name] = c;
    }
    return { library, list, cats };
}
const names = (library, list) => list.categoryIds.map((id) => library.getCategoryById(id).name);

describe('category groups', () => {
    test('a group keeps its categories together, where its first one is', () => {
        const { library, list, cats } = setup();
        list.groups = [{ id: 900, name: 'Clothing' }];
        for (const n of ['Base Layer', 'Mid Layer', 'Shells']) cats[n].groupId = 900;
        assert.equal(list.normalizeGroups(), true);
        assert.deepEqual(names(library, list), ['Shelter', 'Base Layer', 'Mid Layer', 'Shells', 'Sleep']);
        assert.equal(list.normalizeGroups(), false, 'already tidy');
        const grouped = list.groupedCategories();
        assert.deepEqual(grouped.map((g) => (g.group ? `${g.group.name}:${g.categories.length}` : g.categories[0].name)), ['Shelter', 'Clothing:3', 'Sleep']);
    });

    test('empty groups and stray group ids are dropped', () => {
        const { list, cats } = setup();
        list.groups = [{ id: 900, name: 'Clothing' }, { id: 901, name: 'Nothing here' }];
        cats.Sleep.groupId = 900;
        cats.Shelter.groupId = 12345;
        list.normalizeGroups();
        assert.deepEqual(list.groups.map((g) => g.name), ['Clothing']);
        assert.equal(cats.Shelter.groupId, undefined);
    });

    test('saved and loaded, copied with new ids, and removing the last category removes the group', () => {
        const { library, list, cats } = setup();
        list.groups = [{ id: 900, name: 'Clothing', collapsed: true }];
        cats['Mid Layer'].groupId = 900;
        cats.Shells.groupId = 900;
        list.normalizeGroups();
        const saved = library.save();
        const again = new Library();
        again.load(JSON.parse(JSON.stringify(saved)));
        const list2 = again.getListById(list.id);
        assert.deepEqual(list2.groups, [{ id: 900, name: 'Clothing', collapsed: true }]);
        assert.equal(again.getCategoryById(cats.Shells.id).groupId, 900);

        const copy = again.copyList(list2.id);
        assert.equal(copy.groups.length, 1);
        assert.notEqual(copy.groups[0].id, 900);
        const copiedShells = copy.categoryIds.map((id) => again.getCategoryById(id)).find((c) => c.name === 'Shells');
        assert.equal(copiedShells.groupId, copy.groups[0].id);

        again.removeCategory(cats['Mid Layer'].id);
        assert.equal(list2.groups.length, 1);
        again.removeCategory(cats.Shells.id);
        assert.equal(list2.groups.length, 0);
    });

    test('lists without groups save in the old shape', () => {
        const { library } = setup();
        const saved = library.save();
        assert.ok(saved.lists.every((l) => !('groups' in l)));
        assert.ok(saved.categories.every((c) => !('groupId' in c)));
    });
});

describe('defaultGroupFor', () => {
    test('layers and shells go under Clothing; other types stay on their own', () => {
        for (const t of ['Base Layer', 'Mid Layer', 'mid-layers', 'Outer Layer', 'Shells', 'Rain Gear', 'Insulation']) {
            assert.equal(defaultGroupFor(t), CLOTHING_GROUP, t);
        }
        // A category named like a group itself (Shelter) stays a category.
        for (const t of ['Shelter', 'Sleep', 'Footwear', 'Accessories', 'Cooking', 'Backpack', '']) {
            assert.equal(defaultGroupFor(t), '', t);
        }
    });
    test('pads, quilts, underquilts and bags go under Sleep System', () => {
        for (const t of ['Sleeping Pad', 'Sleeping Pads', 'sleep pad', 'Top Quilt', 'Top Quilts', 'Backpacking Quilt',
            'Backpacking Quilts', 'Underquilt', 'Under Quilt', 'Under-quilts', 'Sleeping Bag', 'Sleeping Bags', 'Quilt']) {
            assert.equal(defaultGroupFor(t), SLEEP_GROUP, t);
        }
    });
    test('tents, bivies, hammocks and tarps go under Shelter', () => {
        for (const t of ['Tent', 'Tents', 'Bivy', 'Bivies', 'Bivys', 'Bivvy', 'Bivy Sack', 'Hammock', 'Hammocks', 'Tarp', 'Tarps']) {
            assert.equal(defaultGroupFor(t), SHELTER_GROUP, t);
        }
    });
});

describe('groups travel through CSV and kit summaries', async () => {
    const { listToCsv } = await import('../../server/csv.js');
    const { parseGearCsv } = await import('../../client/utils/lighterpack-import.js');
    const { publishedKits } = await import('../../server/kits.js');

    function grouped() {
        const { library, list, cats } = setup();
        list.groups = [{ id: 900, name: 'Clothing' }];
        cats['Base Layer'].groupId = 900;
        cats['Mid Layer'].groupId = 900;
        list.normalizeGroups();
        for (const [name, weight] of [['Shelter', 500000], ['Base Layer', 200000], ['Mid Layer', 250000], ['Sleep', 600000]]) {
            const item = library.newItem({ category: cats[name] });
            item.name = `${name} thing`;
            item.weight = weight;
            item.authorUnit = 'g';
        }
        list.calculateTotals();
        return { library, list };
    }

    test('export adds a group column; importing it back rebuilds the group', () => {
        const { library, list } = grouped();
        const csv = listToCsv(library, list);
        assert.match(csv.split('\n')[0], /,consumable,group$/);
        const parsed = parseGearCsv(csv, { name: 'Back again' });
        assert.equal(parsed.categories.find((c) => c.name === 'Mid Layer').group, 'Clothing');
        const again = new Library();
        const { list: imported } = again.importGearList(parsed);
        assert.deepEqual(imported.groups.map((g) => g.name), ['Clothing']);
        const blocks = imported.groupedCategories().map((b) => (b.group ? `${b.group.name}:${b.categories.map((c) => c.name).join('+')}` : b.categories[0].name));
        assert.deepEqual(blocks, ['Shelter', 'Clothing:Base Layer+Mid Layer', 'Sleep']);
    });

    test('a list without groups exports exactly LighterPack\'s columns', () => {
        const { library, list } = setup();
        assert.match(listToCsv(library, list).split('\n')[0], /,consumable$/);
    });

    test('a sheet with only a Group column still means categories', () => {
        const out = parseGearCsv('Name,Group,Weight,Unit\nTent,Shelter,20,oz');
        assert.equal(out.categories[0].name, 'Shelter');
        assert.equal(out.categories[0].group, undefined);
    });

    test('published kit summaries show a group as one entry', () => {
        const { library, list } = grouped();
        list.published = true;
        list.externalId = 'abc123';
        const [kit] = publishedKits(library.save());
        assert.deepEqual(kit.categories.map((c) => c.name), ['Shelter', 'Clothing', 'Sleep', 'Shells']);
        assert.equal(kit.categories[1].weightMg, 450000);
    });
});

describe('placeInDefaultGroup', () => {
    test('a new layer category joins (or starts) Clothing; other types are left alone', () => {
        const { library, list, cats } = setup();
        list.placeInDefaultGroup(cats['Mid Layer'], 'Mid Layer');
        assert.deepEqual(list.groups.map((g) => g.name), ['Clothing']);
        list.placeInDefaultGroup(cats['Base Layer'], 'Base Layer');
        list.placeInDefaultGroup(cats.Sleep, 'Sleep');
        assert.equal(cats.Sleep.groupId, undefined);
        const blocks = list.groupedCategories().map((b) => (b.group ? `${b.group.name}:${b.categories.map((c) => c.name).join('+')}` : b.categories[0].name));
        assert.deepEqual(blocks, ['Shelter', 'Sleep', 'Clothing:Mid Layer+Base Layer', 'Shells']);
        assert.ok(library);
    });
});
