import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { diffLibrary } from '../../client/utils/library-diff.js';
import { Library } from '../../client/dataTypes.js';

const snapshot = (library) => JSON.parse(JSON.stringify(library.save()));

describe('diffLibrary', () => {
    test('nothing changed is null', () => {
        const library = new Library();
        assert.equal(diffLibrary(snapshot(library), snapshot(library)), null);
    });

    test('editing one item sends just that item', () => {
        const library = new Library();
        const before = snapshot(library);
        library.items[0].name = 'Tent';
        const changes = diffLibrary(before, snapshot(library));
        assert.deepEqual(Object.keys(changes), ['items']);
        assert.equal(changes.items.upsert.length, 1);
        assert.equal(changes.items.upsert[0].name, 'Tent');
        assert.deepEqual(changes.items.delete, []);
    });

    test('a new list sends the list, its category and item, and the new order', () => {
        const library = new Library();
        const before = snapshot(library);
        const list = library.newList();
        const category = library.newCategory({ list });
        library.newItem({ category });
        const changes = diffLibrary(before, snapshot(library));
        assert.equal(changes.lists.upsert.length, 1);
        assert.equal(changes.categories.upsert.length, 1);
        assert.equal(changes.items.upsert.length, 1);
        assert.deepEqual(changes.listOrder, [list.id, before.lists[0].id]);
        assert.ok('sequence' in changes.settings);
    });

    test('removing a list deletes it and its categories', () => {
        const library = new Library();
        library.newList();
        const before = snapshot(library);
        const removed = library.lists[1];
        const removedCategories = removed.categoryIds.slice();
        library.removeList(removed.id);
        const changes = diffLibrary(before, snapshot(library));
        assert.deepEqual(changes.lists.delete, [removed.id]);
        assert.deepEqual(changes.categories.delete, removedCategories);
    });
});

describe('Library ids', () => {
    test('new ids are unique across two copies of the same library', () => {
        // Two tabs share one library and add things at the same moment; their
        // new ids must not collide, or one tab's item would overwrite the other's.
        const a = new Library();
        const b = new Library();
        b.load(snapshot(a));
        const idsA = new Set(Array.from({ length: 200 }, () => a.newItem({}).id));
        const idsB = Array.from({ length: 200 }, () => b.newItem({}).id);
        assert.equal(idsB.filter((id) => idsA.has(id)).length, 0);
        for (const id of [...idsA, ...idsB]) assert.ok(Number.isSafeInteger(id) && id > 0);
    });
});
