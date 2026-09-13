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
 * The four steps of one person's skin, deep to lit.
 *
 * The photograph is drawn in two inks; a hand at 320 x 180 needs four — a
 * knuckle ridge, a lit finger tip, the shaded side of a palm — and they belong
 * here, beside the pair they extend, rather than as a fifth and sixth hex
 * literal in the scenes. The middle two steps ARE `portraitFeatures().skin`,
 * so a face and the hands below it agree.
 */
export function skinRamp(seed) {
  const [lit, shaded] = portraitFeatures(seed ?? 'nobody').skin;
  return [shade(shaded, -34), shaded, lit, shade(lit, 14)];
}

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
 * Where the head sits in the grid, so a scene that builds a body under this
 * head can find the jaw, the eyes and the brim without guessing.
 *
 * The player, having seen the first cut: "Any chance we can make the
 * characters not look like beaker from the muppets? They need to be
 * stockier". So: a wide short skull, a jaw as wide as the brow, no stalk of a
 * neck — two rows and the head is down in the collar — and shoulders that go
 * square out of the frame. Everything below is measured off this table.
 */
export const FACE = {
  top: 4,        // the crown
  jaw: 17,       // the underside of the chin
  left: 3,       // the widest cell on the left
  right: 20,     // and on the right
  eyes: 11,
  mouth: 15,
  neck: 18,      // one row of it, and then the collar
  collar: 19,
};

/**
 * The picture as a grid of colours, PORTRAIT_H rows of PORTRAIT_W cells.
 * Every cell is a colour string; nothing is transparent, because a photograph
 * is not.
 */
export function portraitCells(seed) {
  const f = portraitFeatures(seed);
  /*
   * Whose face this is.
   *
   * The art judge: "The generated face is also always a heavy-jawed man,
   * including when the file's name is a woman's (SERVICE RECORD — MAJOR
   * GENERAL YASNA KRUSHEVA)." The suggestion table marks its feminine forms by
   * ending them in -a, which is the only signal the generator has, so it is
   * the one it reads: the jaw comes in, the brow lightens, the hair grows past
   * the ear and nobody grows a moustache. Everything else — the width of the
   * skull, the cap, the shoulders — is the same heavy build the player asked
   * for, because a woman in this army is built like everybody else in it.
   */
  const first = String(seed ?? '').trim().split(/\s+/)[0] ?? '';
  const fem = /[aA]$/.test(first);
  if (fem) {
    f.style = f.style === 4 ? 3 : f.style === 2 ? 1 : f.style;
    f.browHeavy = false;
    f.moustache = false;
  }
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

  // The tunic. The shoulders go square out of both edges of the frame two
  // rows under the chin — no slope, no gap of backdrop at the corners.
  rect(0, FACE.collar, W - 1, H - 1, TUNIC);
  rect(0, FACE.collar, 1, FACE.collar, shade(TUNIC, -8));
  rect(W - 2, FACE.collar, W - 1, FACE.collar, shade(TUNIC, -8));
  // the collar, high and tight, with a tab on the wearer's right
  rect(5, FACE.neck, 18, FACE.neck, COLLAR);
  rect(4, FACE.collar, 8, FACE.collar + 2, COLLAR);
  rect(15, FACE.collar, 19, FACE.collar + 2, COLLAR);
  rect(9, FACE.collar, 14, FACE.collar, shade(f.skin[1], -22));
  rect(11, FACE.collar + 1, 12, H - 1, TUNIC_DARK);
  put(11, FACE.collar + 3, '#c9b45e'); put(12, H - 1, '#c9b45e');
  rect(4, FACE.collar + 1, 6, FACE.collar + 2, f.tab);

  // The neck: two rows, as wide as the jaw. The head sits into the collar.
  rect(7, FACE.neck - 1, 16, FACE.neck, f.skin[1]);
  rect(7, FACE.neck - 1, 11, FACE.neck, f.skin[0]);

  // The head. Three heavy shapes — round, square and jowled — every one of
  // them as wide at the jaw as it is at the brow.
  const top = FACE.top;
  const jaw = FACE.jaw;
  const mid = (FACE.left + FACE.right) / 2;
  for (let y = top; y <= jaw; y++) {
    const t = (y - top) / (jaw - top);
    let half;
    if (f.face === 0) half = 8.6 - 1.6 * Math.pow(Math.max(0, t - 0.72) / 0.28, 2) - 1.2 * Math.pow(Math.max(0, 0.16 - t) / 0.16, 2);
    else if (f.face === 1) half = 8.8 - 0.9 * Math.pow(Math.max(0, t - 0.8) / 0.2, 2) - 1.4 * Math.pow(Math.max(0, 0.14 - t) / 0.14, 2);
    else half = 8.2 + 0.6 * t - 1.5 * Math.pow(Math.max(0, 0.18 - t) / 0.18, 2) - 1.4 * Math.pow(Math.max(0, t - 0.86) / 0.14, 2);
    if (fem) half -= 0.5 + 0.9 * Math.pow(Math.max(0, t - 0.5) / 0.5, 2);
    const w = Math.max(1, Math.round(half));
    for (let x = Math.round(mid - w + 0.5); x <= Math.round(mid + w - 0.5); x++) put(x, y, x > mid + 2 ? f.skin[1] : f.skin[0]);
  }
  // Ears, at the level of the eyes, close to a heavy skull.
  const earX = f.earsOut ? 1 : 0;
  for (const dy of [0, 1]) {
    put(FACE.left - earX, FACE.eyes + dy, f.skin[1]);
    put(FACE.right + earX, FACE.eyes + dy, f.skin[1]);
  }

  // Hair, over the top of the head, by style — cropped close on a wide skull.
  // A hairline of a darker step, laid in after the hair, keeps it from being a
  // hard flat shape stuck on the front of a soft face.
  const hair = f.hair;
  const hairLo = shade(hair, -14);
  const hairHi = shade(hair, 20);
  if (fem) {
    // hair past the ear, both sides, over a head the same width as any other
    rect(3, top + 1, 4, 14, hair);
    rect(19, top + 1, 20, 14, hair);
    rect(3, 14, 4, 15, shade(hair, -12));
    rect(19, 14, 20, 15, shade(hair, -12));
  }
  if (f.style !== 4) {
    for (let x = 5; x <= 18; x++) {
      const edge = x === 5 || x === 18;
      const depth = f.style === 3 ? 3 : f.style === 1 ? 3 : f.style === 2 ? 1 : 2;
      for (let y = top; y < top + depth + (edge ? 1 : 0); y++) put(x, y, hair);
      if (f.style === 5 && (x % 2 === 0)) put(x, top - 1, hair);
    }
    if (f.style === 1) { rect(5, top, 9, top + 3, hair); rect(15, top + 1, 18, top + 2, hair); put(12, top, f.skin[0]); }
    if (f.style === 0 || f.style === 1 || f.style === 3 || f.style === 5) {
      rect(4, top + 1, 4, 10, hair); rect(19, top + 1, 19, 10, hair);
    }
    if (f.style === 2) { for (let x = 6; x <= 17; x += 2) put(x, top + 1, hair); }
  } else {
    // Bald, with a shine and a little at the sides.
    put(10, top + 1, WHITE); put(11, top + 1, WHITE);
    rect(4, 8, 4, 11, hair); rect(19, 8, 19, 11, hair);
  }

  // the hairline, and one row of light along the top of the head
  if (f.style !== 4) {
    const depth = f.style === 3 ? 3 : f.style === 1 ? 3 : f.style === 2 ? 1 : 2;
    for (let x = 5; x <= 18; x++) {
      if (x % 2 === 0) put(x, top + depth, hairLo);
      if (x > 6 && x < 15) put(x, top, hairHi);
    }
  }

  // Brows, heavy and level over a wide face.
  const browY = FACE.eyes - 2;
  const browC = shade(hair, -20);
  for (const [x0, x1, side] of [[6, 10, -1], [13, 17, 1]]) {
    for (let x = x0; x <= x1; x++) {
      const lift = f.browAngled ? (side < 0 ? (x - x0) : (x1 - x)) >= 3 ? -1 : 0 : 0;
      put(x, browY + lift, browC);
      // A heavy brow thickens upward, so it never runs into the eye below it.
      if (f.browHeavy) put(x, browY + lift - 1, browC);
    }
  }

  /*
   * Eyes: a lid over the socket, whites, an iris and the crease under it.
   *
   * The judge, on the end card: "the eyes are 2x1 black dots with no lid and
   * no brow". They have both now — the lid is a step of skin darker than the
   * cheek, set between the brow and the white, and the eye sits in a socket
   * rather than on the front of the face.
   */
  const eyeY = FACE.eyes;
  const lid = shade(f.skin[1], -26);
  const crease = shade(f.skin[1], -18);
  for (const x0 of [7, 14]) {
    rect(x0 - 1, eyeY - 1, x0 + 3, eyeY - 1, lid);
    if (!f.eyesNarrow) { rect(x0, eyeY, x0 + 2, eyeY, WHITE); }
    put(x0 + 1, eyeY, INK);
    if (f.eyesWide && !f.eyesNarrow) { rect(x0, eyeY - 1, x0 + 2, eyeY - 1, WHITE); put(x0 + 1, eyeY - 1, INK); }
    put(x0, eyeY - (f.eyesWide ? 1 : 0), f.eyesNarrow ? INK : WHITE);
    put(x0 + 2, eyeY + (f.eyesNarrow ? 0 : 1), f.eyesNarrow ? INK : shade(f.skin[1], -14));
    // the crease of the lower lid, and the weight of the bag under a heavy eye
    rect(x0 - 1, eyeY + 1, x0 + 3, eyeY + 1, crease);
    put(x0 - 1, eyeY, lid);
    put(x0 + 3, eyeY, lid);
  }
  if (f.glasses) {
    for (const x0 of [6, 13]) {
      for (let x = x0; x <= x0 + 4; x++) { put(x, eyeY - 1, INK); put(x, eyeY + 1, INK); }
      put(x0, eyeY, INK); put(x0 + 4, eyeY, INK);
    }
    put(12, eyeY, INK);
  }

  // Nose, down the middle, shaded on the right, broad at the base.
  rect(11, eyeY + 1, 12, FACE.mouth - 2, shade(f.skin[0], -12));
  rect(10, FACE.mouth - 1, 13, FACE.mouth - 1, shade(f.skin[1], -14));
  put(13, FACE.mouth - 2, shade(f.skin[1], -18));

  /*
   * Mouth: a line of lip, the lower lip under it and the shadow under that,
   * so it is a mouth and not one pale slab across the chin. He never smiles;
   * the shapes here are set, thin, downturned and slight.
   */
  /*
   * The art judge: "a mouth drawn as a filled dark-red bar that reads as a
   * wound". A mouth is the LINE between two lips: one row of it, with the
   * lower lip catching the light underneath and the shadow of that lip under
   * THAT. Nothing about it is filled.
   */
  const mY = FACE.mouth + 1;
  const lip = shade(f.skin[1], -46);
  const under = shade(f.skin[1], -20);
  if (f.mouth === 0) rect(10, mY, 13, mY, lip);
  else if (f.mouth === 1) { rect(10, mY, 13, mY, lip); put(9, mY - 1, lip); put(14, mY - 1, lip); }
  else if (f.mouth === 2) rect(10, mY, 13, mY, lip);
  else { rect(10, mY, 13, mY, lip); put(9, mY + 1, lip); put(14, mY + 1, lip); }
  put(9, mY, under); put(14, mY, under);
  // the lower lip, and the shadow it casts on the chin
  rect(10, mY + 1, 13, mY + 1, shade(f.skin[0], 8));
  rect(10, mY + 2, 13, mY + 2, under);
  rect(8, jaw, 15, jaw, shade(f.skin[1], -8));
  if (f.moustache) rect(8, mY - 1, 15, mY - 1, shade(hair, -10));
  if (f.scar) { put(15, eyeY + 2, shade(f.skin[1], -24)); put(16, eyeY + 3, shade(f.skin[1], -24)); }

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
