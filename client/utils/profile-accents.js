// Profile accent colours, a Supporter extra: the plain banner, the ring
// round the picture and the tab underline take the colour. A fixed set, so
// white text on each passes contrast (all 5:1 or better) in both themes.

export const PROFILE_ACCENTS = [
    { id: 'forest', label: 'Forest', hex: '#1D3B30' },
    { id: 'moss', label: 'Moss', hex: '#3F6B52' },
    { id: 'ember', label: 'Ember', hex: '#B04E1B' },
    { id: 'lake', label: 'Lake', hex: '#2F5D7C' },
    { id: 'dusk', label: 'Dusk', hex: '#5A4A7E' },
    { id: 'granite', label: 'Granite', hex: '#3F4A52' },
    { id: 'heather', label: 'Heather', hex: '#7A3E5E' },
];

export const isAccent = (id) => PROFILE_ACCENTS.some((a) => a.id === id);
