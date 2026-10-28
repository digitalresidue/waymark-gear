// What a brand makes, for the Brands directory filters. Shared by the server
// (server/brands.js, which only accepts these ids) and the owner's editor.
// `id` is stored; `label` is shown.

export const GEAR_TYPES = [
    { id: 'shelter', label: 'Shelters' },
    { id: 'sleep', label: 'Sleep systems' },
    { id: 'packs', label: 'Packs' },
    { id: 'insulation', label: 'Insulation' },
    { id: 'shell', label: 'Rain and wind shells' },
    { id: 'clothing', label: 'Clothing' },
    { id: 'footwear', label: 'Footwear' },
    { id: 'cooking', label: 'Cooking' },
    { id: 'water', label: 'Water' },
    { id: 'electronics', label: 'Lights and electronics' },
    { id: 'poles', label: 'Trekking poles' },
    { id: 'navigation', label: 'Navigation and safety' },
    { id: 'accessories', label: 'Accessories' },
];

export const GEAR_TYPE_IDS = new Set(GEAR_TYPES.map((t) => t.id));

export const gearTypeLabel = (id) => (GEAR_TYPES.find((t) => t.id === id) || { label: id }).label;
