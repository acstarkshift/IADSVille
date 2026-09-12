/**
 * The operator's photograph, drawn rather than stored.
 *
 * The identity card in the console carries a picture of its holder, and the
 * scenes between watches put the same face at the console and in the
 * commissar's office. Nothing in this game is loaded from an image file —
 * everything is drawn — so the face is a small piece of pixel art composed
 * from the operator's name: the same name always gets the same face, two
 * names never share one by accident, and it costs nothing to load.
 *
 * Twenty-four cells by thirty, in a dozen inks: a photo-booth grey behind, a
 * service tunic with a collar tab below, and a head that owes its shape,
 * hair, brows, eyes and mouth to the hash of the name. The cells are the
 * truth and the drawing is a scale of them, so the card, the cutscene and a
 * test all see the same face.
 */

import { makeRng } from '../engine/rng.js';

export const PORTRAIT_W = 24;
export const PORTRAIT_H = 30;

/** Skin as [lit, shaded]; the right-hand side of the face takes the shade. */
const SKIN = [
  ['#e9c4a0', '#cda07a'], ['#d9aa80', '#b98860'], ['#b97f55', '#93603c'],
  ['#f1d6ba', '#d4b394'], ['#c99468', '#a5754d'],
];
const HAIR = ['#1c1613', '#3a2a1d', '#6a4a2c', '#a5894f', '#4b4b4b', '#8d8d8d', '#7a3b22'];
const BACK = ['#6d736f', '#5f6a66', '#78716b'];
const TUNIC = '#3d4b33';
const TUNIC_DARK = '#2c3725';
const COLLAR = '#4a5a3d';
const TAB = ['#b53a34', '#2f5f9e', '#a08a2c'];
const INK = '#1a1614';
const WHITE = '#f4f1ea';

/**
 * Everything about the face that the name decides, as plain data.
 *
 * Read by the drawing below and by nothing else that needs to agree with it;
 * a test can ask for two names' features and confirm they differ.
 */
export function portraitFeatures(seed) {
  const rng = makeRng(String(seed ?? 'nobody'));
  const pick = (list) => list[Math.floor(rng.next() * list.length)];
  const chance = (p) => rng.next() < p;
  return {
    skin: pick(SKIN),
    hair: pick(HAIR),
    back: pick(BACK),
    /** 0 cropped, 1 side part, 2 buzz, 3 fringe, 4 bald, 5 curly. */
    style: Math.floor(rng.next() * 6),
    /** 0 round, 1 long, 2 square. */
    face: Math.floor(rng.next() * 3),
    browHeavy: chance(0.4),
    browAngled: chance(0.35),
    eyesNarrow: chance(0.3),
    eyesWide: chance(0.25),
    /** 0 line, 1 slight smile, 2 thin, 3 down. */
    mouth: Math.floor(rng.next() * 4),
    moustache: chance(0.18),
    glasses: chance(0.16),
    scar: chance(0.08),
    tab: pick(TAB),
    earsOut: chance(0.3),
  };
}

/**
 * The picture as a grid of colours, PORTRAIT_H rows of PORTRAIT_W cells.
 * Every cell is a colour string; nothing is transparent, because a photograph
 * is not.
 */
export function portraitCells(seed) {
  const f = portraitFeatures(seed);
  const W = PORTRAIT_W;
  const H = PORTRAIT_H;
  const g = Array.from({ length: H }, () => Array(W).fill(f.back));
  const put = (x, y, c) => { if (x >= 0 && x < W && y >= 0 && y < H) g[y][x] = c; };
  const rect = (x0, y0, x1, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, c); };

  // A booth backdrop that darkens toward the edges, like a lamp on the wall.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = Math.abs(x - 11.5) / 11.5;
      const dy = Math.abs(y - 12) / 16;
      if (dx * dx + dy * dy > 0.95) g[y][x] = shade(f.back, -18);
    }
  }

  // The tunic: shoulders up to the collar, the collar open at the throat, a
  // tab on the left collar, three buttons down the front.
  rect(0, 24, W - 1, H - 1, TUNIC);
  rect(0, 24, 2, 25, f.back); rect(W - 3, 24, W - 1, 25, f.back);
  rect(0, 26, 0, 26, f.back); rect(W - 1, 26, W - 1, 26, f.back);
  rect(7, 23, 16, 23, COLLAR);
  rect(6, 24, 8, 26, COLLAR); rect(15, 24, 17, 26, COLLAR);
  rect(9, 24, 14, 25, shade(f.skin[1], -10));
  rect(11, 26, 12, H - 1, TUNIC_DARK);
  put(11, 27, '#c9b45e'); put(12, 29, '#c9b45e');
  rect(6, 25, 7, 26, f.tab);

  // The neck.
  rect(9, 19, 14, 24, f.skin[1]);
  rect(9, 19, 11, 23, f.skin[0]);

  // The head. Three shapes, all wider at the cheekbone than the jaw.
  const top = 5;
  const jaw = f.face === 1 ? 20 : 19;
  for (let y = top; y <= jaw; y++) {
    const t = (y - top) / (jaw - top);
    let half;
    if (f.face === 0) half = 6.2 * Math.sin(Math.PI * Math.min(1, t * 1.05 + 0.02)) ** 0.55;
    else if (f.face === 1) half = 5.6 * Math.sin(Math.PI * Math.min(1, t * 1.05 + 0.02)) ** 0.45;
    else half = t < 0.85 ? 6.2 * Math.sin(Math.PI * Math.min(1, t * 0.7 + 0.15)) ** 0.35 : 6.2 * (1 - (t - 0.85) * 4);
    const w = Math.max(1, Math.round(half));
    for (let x = 12 - w; x <= 11 + w; x++) put(x, y, x > 14 ? f.skin[1] : f.skin[0]);
  }
  // Ears, at the level of the eyes.
  const earX = f.earsOut ? 1 : 0;
  put(5 - earX, 12, f.skin[1]); put(5 - earX, 13, f.skin[1]);
  put(18 + earX, 12, f.skin[1]); put(18 + earX, 13, f.skin[1]);

  // Hair, over the top of the head, by style.
  const hair = f.hair;
  if (f.style !== 4) {
    for (let x = 6; x <= 17; x++) {
      const edge = x === 6 || x === 17;
      const depth = f.style === 3 ? 4 : f.style === 1 ? 3 : f.style === 2 ? 1 : 2;
      for (let y = top; y < top + depth + (edge ? 1 : 0); y++) put(x, y, hair);
      if (f.style === 5 && (x % 2 === 0)) put(x, top - 1, hair);
      if (f.style === 5) put(x, top + depth, x % 3 === 0 ? hair : g[top + depth][x]);
    }
    if (f.style === 1) { rect(6, top, 9, top + 4, hair); rect(15, top + 1, 17, top + 3, hair); put(12, top, f.skin[0]); }
    if (f.style === 0 || f.style === 1 || f.style === 3 || f.style === 5) {
      rect(6, top + 2, 6, 11, hair); rect(17, top + 2, 17, 11, hair);
    }
    if (f.style === 2) { for (let x = 7; x <= 16; x += 2) put(x, top + 1, hair); }
  } else {
    // Bald, with a shine and a little at the sides.
    put(10, top + 1, WHITE); put(11, top + 1, WHITE);
    rect(6, 9, 6, 12, hair); rect(17, 9, 17, 12, hair);
  }

  // Brows.
  const browY = 10;
  const browC = shade(hair, -20);
  for (const [x0, x1, side] of [[8, 10, -1], [14, 16, 1]]) {
    for (let x = x0; x <= x1; x++) {
      const lift = f.browAngled ? (side < 0 ? (x - x0) : (x1 - x)) === 2 ? -1 : 0 : 0;
      put(x, browY + lift, browC);
      // A heavy brow thickens upward, so it never runs into the eye below it.
      if (f.browHeavy) put(x, browY + lift - 1, browC);
    }
  }

  // Eyes: whites, iris, a highlight; narrow eyes lose the white row.
  const eyeY = 12;
  for (const x0 of [8, 14]) {
    if (!f.eyesNarrow) { rect(x0, eyeY, x0 + 2, eyeY, WHITE); }
    put(x0 + 1, eyeY, INK);
    if (f.eyesWide && !f.eyesNarrow) { rect(x0, eyeY - 1, x0 + 2, eyeY - 1, WHITE); put(x0 + 1, eyeY - 1, INK); }
    put(x0, eyeY - (f.eyesWide ? 1 : 0), f.eyesNarrow ? INK : WHITE);
    put(x0 + 2, eyeY + (f.eyesNarrow ? 0 : 1), f.eyesNarrow ? INK : shade(f.skin[1], -14));
  }
  if (f.glasses) {
    for (const x0 of [7, 13]) {
      for (let x = x0; x <= x0 + 4; x++) { put(x, eyeY - 1, INK); put(x, eyeY + 1, INK); }
      put(x0, eyeY, INK); put(x0 + 4, eyeY, INK);
    }
    put(12, eyeY, INK);
  }

  // Nose, down the middle, shaded on the right.
  rect(12, 13, 12, 15, shade(f.skin[0], -12));
  put(13, 15, shade(f.skin[1], -18));
  put(11, 16, shade(f.skin[0], -8)); put(13, 16, shade(f.skin[1], -8));

  // Mouth.
  const mY = 18;
  const lip = shade(f.skin[1], -30);
  if (f.mouth === 0) rect(10, mY, 14, mY, lip);
  else if (f.mouth === 1) { rect(10, mY, 14, mY, lip); put(9, mY - 1, lip); put(15, mY - 1, lip); }
  else if (f.mouth === 2) rect(11, mY, 13, mY, lip);
  else { rect(10, mY, 14, mY, lip); put(9, mY + 1, lip); put(15, mY + 1, lip); }
  if (f.moustache) rect(9, 17, 15, 17, shade(hair, -10));
  if (f.scar) { put(15, 14, shade(f.skin[1], -24)); put(16, 15, shade(f.skin[1], -24)); }

  return g;
}

/**
 * Draw the portrait into a box on a canvas.
 *
 * Cells are scaled to fill the box exactly; a fraction of a pixel is added to
 * every cell so the scale never leaves hairline seams between them.
 */
export function drawPortrait(ctx, x, y, w, h, seed) {
  const cells = portraitCells(seed);
  const cw = w / PORTRAIT_W;
  const ch = h / PORTRAIT_H;
  for (let j = 0; j < PORTRAIT_H; j++) {
    for (let i = 0; i < PORTRAIT_W; i++) {
      ctx.fillStyle = cells[j][i];
      ctx.fillRect(x + i * cw, y + j * ch, cw + 0.4, ch + 0.4);
    }
  }
}

/** Lighten (positive) or darken (negative) a hex colour by a number of steps. */
function shade(hex, by) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    .map((v) => Math.max(0, Math.min(255, v + by)));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
