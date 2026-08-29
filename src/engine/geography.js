/**
 * The map of Trans Mordovia.
 *
 * Everything here is invented, but it is invented *consistently* with the
 * scenarios: the river runs under the bridge the raids keep trying to drop, the
 * valley the western axis comes down is a real valley between real hills, and
 * the frontier is where the frontier has to be for the ingress bearings in
 * scenarios.js to make sense. The Ville sits at the origin because the sector
 * was drawn around the crossing, and the crossing is why the village is there.
 *
 * Coordinates are the same kilometre grid the simulation uses: +x east, +y
 * north, origin at the Ville. Distances are honest — the trunk road really is
 * 117 km, and a truck on it takes two hours.
 *
 * This is drawn as an underlay beneath the radar picture, so it is deliberately
 * low-detail: enough to tell an operator where the ground is, not so much that
 * it competes with the tracks.
 */

/** National frontier, running across the north and west. The raids cross this. */
export const FRONTIER = [
  { x: -190, y: 40 }, { x: -150, y: 92 }, { x: -96, y: 126 }, { x: -40, y: 148 },
  { x: 26, y: 160 }, { x: 92, y: 156 }, { x: 146, y: 138 }, { x: 188, y: 108 },
];

/**
 * The Mordava, from the northern hills to the southern marshes. It passes the
 * Ville and goes under the crossing at (23, -9) — the bridge in every scenario.
 */
export const RIVERS = [
  {
    name: 'МОРДАВА',
    en: 'River Mordava',
    points: [
      { x: -54, y: 104 }, { x: -40, y: 74 }, { x: -34, y: 48 }, { x: -22, y: 26 },
      { x: -9, y: 11 }, { x: 2, y: 2 }, { x: 12, y: -4 }, { x: 23, y: -9 },
      { x: 38, y: -22 }, { x: 52, y: -44 }, { x: 63, y: -74 }, { x: 70, y: -108 },
    ],
  },
  {
    name: 'ЛОЗАНКА',
    en: 'Lozanka',
    points: [
      { x: 104, y: 96 }, { x: 96, y: 78 }, { x: 88, y: 62 }, { x: 74, y: 44 },
      { x: 58, y: 26 }, { x: 44, y: 4 }, { x: 38, y: -22 },
    ],
  },
];

/**
 * High ground. The western axis comes down the gap between the Kubin ridge and
 * the northern hills, which is why low-level ingress from that bearing works so
 * well — the radar horizon is not the only thing in the way.
 */
export const HIGH_GROUND = [
  {
    name: 'КУБИНСКИЙ ХРЕБЕТ',
    en: 'Kubin ridge',
    points: [
      { x: -96, y: 52 }, { x: -70, y: 74 }, { x: -44, y: 78 }, { x: -30, y: 60 },
      { x: -38, y: 34 }, { x: -62, y: 22 }, { x: -88, y: 28 },
    ],
  },
  {
    name: 'СЕВЕРНЫЕ ХОЛМЫ',
    en: 'Northern hills',
    points: [
      { x: 4, y: 106 }, { x: 44, y: 118 }, { x: 82, y: 110 }, { x: 96, y: 88 },
      { x: 72, y: 74 }, { x: 34, y: 76 }, { x: 8, y: 86 },
    ],
  },
  {
    name: 'ТАВРОВСКИЕ ВЫСОТЫ',
    en: 'Tavrov heights',
    points: [
      { x: 118, y: 6 }, { x: 146, y: 18 }, { x: 160, y: -10 },
      { x: 142, y: -34 }, { x: 116, y: -24 },
    ],
  },
];

/** Lake Yasen, east of the capital. Flat, wet, and useless to everybody. */
export const LAKES = [
  {
    name: 'ОЗЕРО ЯСЕНЬ',
    en: 'Lake Yasen',
    points: [
      { x: 132, y: 74 }, { x: 158, y: 66 }, { x: 166, y: 44 }, { x: 150, y: 30 },
      { x: 126, y: 38 }, { x: 118, y: 58 },
    ],
  },
];

/** Trunk roads. The Ville–Mostrograd road is the one everything moves on. */
export const ROADS = [
  {
    name: 'ТРАКТ ВИЛЛА — МОСТРОГРАД',
    en: 'Ville–Mostrograd trunk road',
    points: [{ x: 0, y: 0 }, { x: 23, y: -9 }, { x: 52, y: 12 }, { x: 78, y: 34 }, { x: 100, y: 60 }],
  },
  {
    name: 'КУБИНСКАЯ ДОРОГА',
    en: 'Kubin road',
    points: [{ x: 0, y: 0 }, { x: -24, y: 14 }, { x: -50, y: 22 }, { x: -74, y: 18 }],
  },
  {
    name: 'ЮЖНАЯ ДОРОГА',
    en: 'Southern road',
    points: [{ x: 0, y: 0 }, { x: 8, y: -30 }, { x: 22, y: -58 }, { x: 30, y: -92 }],
  },
];

/**
 * Settlements. The Ville is not on this list because it is a defended asset in
 * every scenario and the scope draws it as one; these are the places that exist
 * around it and are never defended by anybody.
 */
export const SETTLEMENTS = [
  { name: 'МОСТРОГРАД', en: 'Mostrograd', pos: { x: 100, y: 60 }, capital: true },
  { name: 'КУБИН', en: 'Kubin', pos: { x: -74, y: 18 } },
  { name: 'ЛОЗАН', en: 'Lozan', pos: { x: 62, y: 88 } },
  { name: 'БРАСОВ', en: 'Brasov', pos: { x: 30, y: -92 } },
  { name: 'ТАВРОВ', en: 'Tavrov', pos: { x: 128, y: -14 } },
  { name: 'МИРЧА', en: 'Mircha', pos: { x: -44, y: -52 } },
  { name: 'ЯСЕНЬ', en: 'Yasen', pos: { x: 118, y: 76 } },
];

/**
 * Everything, in draw order: ground first, then water, then the things people
 * built, then the frontier over the top of all of it.
 */
export const MAP = {
  name: 'ТРАНС-МОРДОВИЯ',
  en: 'Trans Mordovia',
  frontier: FRONTIER,
  highGround: HIGH_GROUND,
  lakes: LAKES,
  rivers: RIVERS,
  roads: ROADS,
  settlements: SETTLEMENTS,
};
