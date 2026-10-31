import weightUtils from '../client/utils/weight.js';

const fullUnits = {
    oz: 'ounce', lb: 'pound', g: 'gram', kg: 'kilogram',
};

const escapeField = function (field) {
    let str = field === null || typeof field === 'undefined' ? '' : `${field}`;
    // A cell starting with = + - @ runs as a formula when the file is opened
    // in a spreadsheet. Lists are shared publicly, so neutralize it.
    if (/^[=+\-@\t\r]/.test(str)) {
        str = `'${str}`;
    }
    if (/[",\n\r]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
};

const listToCsv = function (library, list) {
    // LighterPack's ten columns; a list with category groups adds "group"
    // after them (LighterPack ignores it; our import reads it back).
    const grouped = Boolean(list.groups && list.groups.length);
    let out = `Item Name,Category,desc,qty,weight,unit,url,price,worn,consumable${grouped ? ',group' : ''}\n`;

    for (const categoryId of list.categoryIds) {
        const category = library.getCategoryById(categoryId);
        if (!category) {
            continue;
        }

        for (const categoryItem of category.categoryItems) {
            if (!categoryItem) {
                continue;
            }

            const item = library.getItemById(categoryItem.itemId);
            if (!item) {
                continue;
            }

            const itemRow = [
                item.name,
                category.name,
                item.description,
                categoryItem.qty,
                weightUtils.MgToWeight(item.weight, item.authorUnit),
                fullUnits[item.authorUnit],
                item.url,
                item.price,
                categoryItem.worn ? 'Worn' : '',
                categoryItem.consumable ? 'Consumable' : '',
            ];
            if (grouped) itemRow.push(category.groupId ? ((list.getGroupById(category.groupId) || {}).name || '') : '');

            out += `${itemRow.map(escapeField).join(',')}\n`;
        }
    }

    return out;
};

export { listToCsv, escapeField };
