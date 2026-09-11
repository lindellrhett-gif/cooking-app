// A single light palette. The app is pinned to light in app.json rather than
// shipping a half-finished dark mode.

export const colors = {
  bg: '#FBF7F2',
  surface: '#FFFFFF',
  surfaceAlt: '#F5EEE4',
  text: '#1F1B16',
  textMuted: '#7A6E62',
  textFaint: '#A79B8D',
  border: '#EAE0D2',
  borderStrong: '#D8CAB6',

  primary: '#C2410C',
  primarySoft: '#FDEBE1',
  primaryText: '#FFFFFF',

  // "Ready to cook" versus "almost there". These two carry real meaning in
  // the Cook screen, so they are named for the state, not the colour.
  ready: '#15803D',
  readySoft: '#E7F5EC',
  almost: '#B45309',
  almostSoft: '#FDF3E3',

  danger: '#B91C1C',
  dangerSoft: '#FDECEC',
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const type = {
  display: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.5 },
  title: { fontSize: 20, fontWeight: '700' as const, letterSpacing: -0.3 },
  heading: { fontSize: 17, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  bodyStrong: { fontSize: 15, fontWeight: '600' as const },
  small: { fontSize: 13, fontWeight: '400' as const },
  smallStrong: { fontSize: 13, fontWeight: '600' as const },
  tiny: { fontSize: 11, fontWeight: '600' as const, letterSpacing: 0.4 },
} as const;

export const shadow = {
  card: {
    shadowColor: '#4A3B2A',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
} as const;

/** Category display order for grouped pantry and shopping lists. */
export const categoryOrder = [
  'produce',
  'meat',
  'seafood',
  'dairy',
  'bakery',
  'grains',
  'pasta',
  'canned',
  'protein',
  'frozen',
  'condiments',
  'oils',
  'spices',
  'baking',
  'nuts',
  'pantry',
  'staples',
];

export const categoryLabel = (c: string) =>
  ({
    produce: 'Produce',
    meat: 'Meat',
    seafood: 'Seafood',
    dairy: 'Dairy & eggs',
    bakery: 'Bakery',
    grains: 'Grains',
    pasta: 'Pasta',
    canned: 'Cans & jars',
    protein: 'Protein',
    frozen: 'Frozen',
    condiments: 'Condiments',
    oils: 'Oils',
    spices: 'Spices',
    baking: 'Baking',
    nuts: 'Nuts & seeds',
    pantry: 'Pantry',
    staples: 'Staples',
  })[c] ?? c;

export const sortByCategory = (a: string, b: string) => {
  const ia = categoryOrder.indexOf(a);
  const ib = categoryOrder.indexOf(b);
  return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
};
