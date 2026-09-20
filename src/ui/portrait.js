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
 * Forty-eight cells by sixty, in some forty steps of a dozen inks: a photo-booth
 * grey behind, a service tunic with a collar tab below, and a head that owes
 * its shape, hair, brows, eyes and mouth to the hash of the name. The cells are
 * the truth and the drawing is a scale of them, so the card, the cutscene and a
 * test all see the same face.
 */

import { makeRng } from '../engine/rng.js';

/*
 * FORTY-EIGHT BY SIXTY, AND IT WAS TWENTY-FOUR BY THIRTY.
 *
 * The graphics reviewer, three panels running, on the same defect: "Every face
 * in the game reads as a man wearing black sunglasses. A solid dark bar runs
 * the full width of the brow and directly under it sit two pure-white
 * rectangles with a black block in each. It is not one unlucky seed." Three
 * passes tried to fix it in the arithmetic and all three failed, and the
 * reviewer's diagnosis of why is exactly right:
 *
 *   "The grid is the problem, not the arithmetic. PORTRAIT_H = 30 with
 *   FACE.eyes = 11 and FACE.jaw = 17 leaves SIX rows for everything between
 *   brow and chin: one for a brow, one for a lid, one for an eye, one for a
 *   nose, one for a mouth, one for a chin. That is why the brow is a solid bar
 *   and the eye is a white block — there is nowhere else for them to go."
 *
 * At forty-eight by sixty there are sixteen rows between brow and chin, and the
 * same generative scheme has room for a lid that cuts the iris, a socket, a
 * nostril, a lip corner and a jaw plane. `portraitFeatures(seed)` is untouched,
 * so the property the codebase values — the same name always gets the same
 * face, two names never collide — survives exactly.
 */
export const PORTRAIT_W = 48;
export const PORTRAIT_H = 60;

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
/*
 * There is no white in a face. The sclera used to be `#f4f1ea` and the graphics
 * reviewer's note on it is the reason the ink is gone rather than merely
 * unused: "drop the pure-white sclera to one step above the lit skin (never
 * WHITE)". It is one step above this face's own lit skin now, so the whitest
 * thing in the picture is a catchlight one cell across.
 */

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
  top: 8,        // the crown
  jaw: 34,       // the underside of the chin
  left: 6,       // the widest cell on the left
  right: 41,     // and on the right
  eyes: 22,
  mouth: 30,
  neck: 36,      // two rows of it, and then the collar
  collar: 38,
};

/**
 * The two eye openings' bounding columns, left first.
 *
 * Exported because a scene that lights this face has to find its eyes, and the
 * office used to find them by drawing its own — a three-cell block of a light
 * skin with an ink dot in it, laid over the photograph's. That overpaint is
 * where the officer's "welding goggles" came from: whatever the photograph does
 * with lids and irises, the scene put a tile back on top of it. Now the scene
 * lifts these columns out of the shadow and the eye underneath is the eye.
 */
export function eyeBoxes(seed) {
  const f = portraitFeatures(seed);
  const w = f.eyesWide ? 8 : f.eyesNarrow ? 6 : 7;
  const l = 16 - Math.floor(w / 2);
  return [[l, l + w - 1], [PORTRAIT_W - 1 - (l + w - 1), PORTRAIT_W - 1 - l]];
}

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
  /**
   * Take the cell that is ALREADY there up or down a step.
   *
   * A hollow — a socket, the shadow beside the nose — has to be the face's own
   * colours darkened, because a rectangle of one flat ink laid over a graded
   * cheek has a corner and reads as a sticker. Every rectangle in the eye region
   * was one of those, and together they were the goggles.
   */
  const step = (x, y, by) => { if (x >= 0 && x < W && y >= 0 && y < H) g[y][x] = shade(g[y][x], by); };
  /** One cell of a skin ramp built from this person's own two steps. */
  const mid = f.skin[0];                       // the lit plane of the face
  const turn = f.skin[1];                      // where it turns away
  const deep = shade(f.skin[1], -22);          // sockets, under the jaw
  const deeper = shade(f.skin[1], -38);        // the lip line, the nostril

  // A booth backdrop that darkens toward the edges, like a lamp on the wall.
  const backLo = shade(f.back, -18);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = Math.abs(x - 23.5) / 23.5;
      const dy = Math.abs(y - 24) / 32;
      if (dx * dx + dy * dy > 0.95) g[y][x] = backLo;
    }
  }

  // The tunic. The shoulders go square out of both edges of the frame two
  // rows under the chin — no slope, no gap of backdrop at the corners.
  rect(0, FACE.collar, W - 1, H - 1, TUNIC);
  rect(0, FACE.collar, 3, FACE.collar + 1, shade(TUNIC, -8));
  rect(W - 4, FACE.collar, W - 1, FACE.collar + 1, shade(TUNIC, -8));
  // the collar, high and tight, with a tab on the wearer's right
  rect(10, FACE.neck, 37, FACE.neck + 1, COLLAR);
  rect(8, FACE.collar, 17, FACE.collar + 5, COLLAR);
  rect(30, FACE.collar, 39, FACE.collar + 5, COLLAR);
  rect(18, FACE.collar, 29, FACE.collar + 1, deep);
  rect(22, FACE.collar + 2, 25, H - 1, TUNIC_DARK);
  // two buttons on the placket, both ON it — the lower one used to be drawn two
  // cells to the right of the fly it was supposed to be fastening
  rect(22, FACE.collar + 7, 25, FACE.collar + 8, '#c9b45e');
  rect(22, H - 5, 25, H - 4, '#c9b45e');
  // and a collar tab on each side, because a tunic with one is a tunic missing one
  rect(8, FACE.collar + 2, 14, FACE.collar + 5, f.tab);
  rect(33, FACE.collar + 2, 39, FACE.collar + 5, f.tab);

  // The neck: as wide as the jaw, in shadow under the chin where it belongs.
  rect(14, FACE.jaw - 1, 33, FACE.neck + 1, turn);
  rect(14, FACE.jaw - 1, 33, FACE.jaw + 1, deep);
  rect(15, FACE.jaw + 2, 22, FACE.neck + 1, shade(turn, -10));

  /*
   * The head. Three heavy shapes — round, long and square — each with a LIT
   * side and a turned side rather than a hard half-and-half split.
   *
   * THE JAW TAPERS NOW. The old curves came off the cheekbone by a tenth
   * between the eyes and the chin, so the head was a slab thirty-six cells wide
   * top to bottom and the ten-cell mouth sat in the middle of an acre of it.
   * A head narrows by about a third from cheekbone to chin; these do. The
   * player's note that started this shape — "they need to be stockier" — is
   * about the WIDTH at the cheekbone and the absence of a neck, and both of
   * those are untouched.
   */
  const top = FACE.top;
  const jaw = FACE.jaw;
  const midX = (FACE.left + FACE.right) / 2;
  const halfAt = [];
  for (let y = top; y <= jaw; y++) {
    const u = (y - top) / (jaw - top);
    const crown = (a, b) => a * Math.pow(Math.max(0, b - u) / b, 2);
    let half;
    if (f.face === 0) half = 17.2 - 5.6 * Math.pow(Math.max(0, u - 0.62) / 0.38, 1.7) - crown(2.4, 0.16);
    else if (f.face === 1) half = 17.4 - 6.4 * Math.pow(Math.max(0, u - 0.56) / 0.44, 1.8) - crown(2.8, 0.14);
    else half = 16.6 + 1.0 * u - 4.6 * Math.pow(Math.max(0, u - 0.70) / 0.30, 2) - crown(2.8, 0.18);
    if (fem) half -= 0.8 + 1.2 * Math.pow(Math.max(0, u - 0.5) / 0.5, 2);
    const w = Math.max(2, Math.round(half));
    halfAt[y] = w;
    const x0 = Math.round(midX - w + 0.5);
    const x1 = Math.round(midX + w - 0.5);
    for (let x = x0; x <= x1; x++) {
      /*
       * Where the light is. The lamp is up and to the wearer's right (screen
       * left), so the plane turns over about two thirds of the way across and
       * the last columns before the silhouette are the turn itself.
       *
       * FOUR STEPS, NOT TWO. With three zones the near two thirds of every face
       * was one flat ink — the "flat two-tone" note in every scene this face
       * appears in — so there is a fourth band where the cheek begins to go
       * away from the lamp before it turns, and the column nearest the lamp
       * takes a step up.
       */
      const across = (x - x0) / Math.max(1, x1 - x0);
      /*
       * And the terminator BOWS, because the front of a head is a cylinder: it
       * comes forward over the cheekbone and goes back at the temple and under
       * the jaw. Ruled straight, as it was, the boundary between the two middle
       * steps is a dead vertical line down the middle of every face.
       */
      const b = (y - FACE.eyes) / 9;
      const bow = 0.06 * (1 - b * b) - 0.05 * Math.max(0, b);
      put(x, y,
        across > 0.86 + bow * 0.6 ? deep
          : across > 0.66 + bow ? turn
            : across > 0.42 + bow ? shade(mid, -9)
              : across > 0.06 ? mid : shade(mid, 12));
    }
  }
  /*
   * The brow ridge on the lamp's side takes a little more of it — an OVAL over
   * the eye, not a bar across the forehead. The first cut of this was three
   * rows ruled from the temple to the middle of the face, which put a pale
   * horizontal band between hairline and brows on every portrait: the same
   * mistake as the goggles, one row lower.
   */
  for (let y = FACE.eyes - 10; y <= FACE.eyes - 5; y++) {
    for (let x = 7; x <= 25; x++) {
      const dx = (x - 15) / 9;
      const dy = (y - (FACE.eyes - 8)) / 3.2;
      const r = dx * dx + dy * dy;
      if (r <= 1) step(x, y, r > 0.5 ? 5 : 10);
    }
  }
  // Ears, at the level of the eyes, close to a heavy skull: a lobe that comes
  // in at the top and the bottom rather than a two-by-five brick.
  const earOut = f.earsOut ? 2 : 1;
  for (let dy = -2; dy <= 4; dy++) {
    const reach = dy === -2 || dy === 4 ? earOut : earOut + 1;
    for (let e = 0; e < reach; e++) {
      const rim = e === reach - 1 || dy >= 3;
      put(FACE.left - e, FACE.eyes + dy, rim ? deep : turn);
      put(FACE.right + e, FACE.eyes + dy, rim ? deeper : deep);
    }
  }

  /*
   * Hair. The old hairline was `if (x % 2 === 0) put(x, top + depth, hairLo)`,
   * which plots literal battlements across the forehead; this one is a curve
   * with a peak and two temples, and the parting is a shape rather than a
   * rectangle laid on.
   */
  const hair = f.hair;
  const hairLo = shade(hair, -14);
  const hairHi = shade(hair, 20);
  const depth = f.style === 3 ? 7 : f.style === 1 ? 6 : f.style === 2 ? 3 : 5;
  if (fem) {
    // hair past the ear, both sides, over a head the same width as any other,
    // with a little more of it at the cheek than at the temple so the mass has
    // a shape rather than being two rectangles hung off a skull
    for (let y = top + 2; y <= 32; y++) {
      const v = (y - top - 2) / (32 - top - 2);
      const out = 4 + Math.round(1.8 * Math.sin(v * Math.PI));
      const ink = y > 28 ? hairLo : hair;
      rect(9 - out, y, 9, y, ink);
      rect(38, y, 38 + out, y, ink);
    }
  }
  if (f.style !== 4) {
    /*
     * THE CROWN IS A DOME. The hair's top edge was one straight row across
     * thirty cells, which at this size reads as a flat cap of felt set on a
     * head rather than as hair growing out of one: every portrait in the game
     * had the same ruled line along the top of it.
     */
    for (let x = 8; x <= 39; x++) {
      const t2 = (x - 23.5) / 15.5;
      const curl = f.style === 5 ? [1, 0, 1, 1, 0, 1, 0][((x % 7) + 7) % 7] : 0;
      const dome = Math.round(3.4 * Math.sqrt(Math.max(0, 1 - t2 * t2))) + curl;
      const y0 = top - 1 - dome;
      /*
       * A hairline that falls at the temples and rises over the brow, and on a
       * side part falls FURTHER on the side the hair is swept to. It used to
       * tilt the other way and then have a rectangle of hair pasted over the
       * left half to compensate, which left a three-row step of bare forehead
       * down the middle of every parted head — a crack, not a parting.
       */
      const fall = Math.round(depth - 2.4 * (1 - t2 * t2) - (f.style === 1 ? t2 * 1.6 : 0));
      const lit = y0 + (f.style === 5 ? 1 : 2);
      for (let y = y0; y < top + Math.max(1, fall); y++) put(x, y, y < lit ? hairHi : hair);
      put(x, top + Math.max(1, fall), hairLo);
    }
    /*
     * The sides, down past the ear, FOLLOWING THE SKULL. These were two ruled
     * columns at x=8 and x=38; once the jaw tapers, a straight column of hair
     * hangs off the side of a head that has gone in behind it.
     */
    for (let y = top + 1; y <= FACE.eyes - 1; y++) {
      const hw = halfAt[y] ?? halfAt[top];
      const xl = Math.round(midX - hw + 0.5);
      const xr = Math.round(midX + hw - 0.5);
      rect(xl, y, xl + 1, y, hair);
      rect(xr - 1, y, xr, y, hairLo);
    }
    // the parting itself: a line of the darkest step running back from the
    // hairline, on the high side of the sweep
    if (f.style === 1) {
      for (let y = top - 4; y <= top + 4; y++) put(30 - Math.round((y - top) * 0.4), y, shade(hair, -18));
    }
    if (f.style === 2) {
      // a crop: the scalp showing through, scattered rather than every third cell
      for (let x = 11; x <= 36; x++) if ((x * 7) % 5 < 2) put(x, top + 2 + (x % 2), hairLo);
    }
  } else {
    // Bald: the crown takes the lamp in an oval of its own cells lifted, not in
    // a six-by-two bar of a colour the head is not made of.
    for (let y = top - 1; y <= top + 7; y++) {
      for (let x = 13; x <= 31; x++) {
        const dx = (x - 20) / 7.5;
        const dy = (y - (top + 3)) / 3.8;
        const r = dx * dx + dy * dy;
        if (r <= 1) step(x, y, r > 0.45 ? 9 : 20);
      }
    }
    // and what is left of it: a horseshoe hugging the skull, two cells wide and
    // thinning at the bottom. It used to be two nine-row bars ruled at x=8 and
    // x=38, which on a bald head at this size sit ON the cheek and read as the
    // bars of a cage rather than as hair.
    for (let y = top + 6; y <= FACE.eyes + 3; y++) {
      const hw = halfAt[y] ?? halfAt[top];
      const xl = Math.round(midX - hw + 0.5);
      const xr = Math.round(midX + hw - 0.5);
      const wide = y > top + 8 && y < FACE.eyes ? 1 : 0;
      rect(xl, y, xl + wide, y, hair);
      rect(xr - wide, y, xr, y, hairLo);
    }
  }

  /*
   * WHERE THE EYES ARE, so the brow, the socket and the lid all agree.
   *
   * The left eye is measured and the right one is its mirror about the middle
   * of the grid; rounding each independently put the pair half a cell off
   * centre on every even width, which is visible at this size as a face
   * looking slightly to one side.
   */
  const eyeY = FACE.eyes;
  const eyeW = f.eyesWide ? 8 : f.eyesNarrow ? 6 : 7;
  const eyes = eyeBoxes(seed).map(([a, b], i) => [a, b, i === 0 ? -1 : 1]);

  /*
   * BROWS: two steps of hair with a broken lower edge, not one flat ink bar.
   *
   * The reviewer: "A brow bar that is one ink, full width, one row above a
   * white block is the goggle shape; nothing else has to change for it to stop
   * being one." So the brow has a body and a lower edge a step lighter, it
   * tapers at both ends, and it is the HAIR's colour rather than a single
   * darkened slab. It is also keyed to the eye under it and stops a cell short
   * of the nose: the pair used to span twenty-four of the thirty-six cells of
   * the face with a four-cell gap, which at a glance is still one bar.
   */
  const browY = eyeY - 5;
  const browBody = shade(hair, -6);
  const browEdge = shade(hair, 12);
  for (const [ex0, ex1, side] of eyes) {
    const x0 = ex0 - (side < 0 ? 1 : 0);
    const x1 = ex1 + (side < 0 ? 0 : 1);
    for (let x = x0; x <= x1; x++) {
      const u = side < 0 ? (x - x0) / (x1 - x0) : (x1 - x) / (x1 - x0);
      const lift = f.browAngled ? Math.round((1 - u) * -2) : 0;
      const thick = f.browHeavy ? 3 : 2;
      // thinner at the outer end, which is what makes it a brow and not a bar
      const rows = Math.max(1, thick - (u > 0.78 ? 1 : 0));
      for (let r = 0; r < rows; r++) put(x, browY + lift + r, browBody);
      if (u > 0.1 && u < 0.92) put(x, browY + lift + rows, browEdge);
    }
  }

  /*
   * EYES: a socket that is a hollow, an almond opening, a sclera ONE STEP above
   * the lit skin, an iris the lid cuts the top off, a pupil and a catchlight.
   *
   * The reviewer: "drop the pure-white sclera to one step above the lit skin
   * (never WHITE), give the iris a lid that cuts its top". Their diagnosis of
   * the shape was the other half of it: the goggle is a RECTANGLE. Every part
   * of the old eye was one — a socket rect seven rows deep in one flat ink, a
   * lid rect, a sclera rect three rows by seven, an iris rect — so the region
   * read as a tile stuck on a cheek. Here the socket is the cheek's own cells
   * taken down inside an ellipse, and the opening is an almond that comes to a
   * corner at each end. There is no WHITE anywhere in this face.
   */
  const sclera = shade(f.skin[0], 34);
  const lidInk = shade(f.skin[1], -30);
  for (const [x0, x1, side] of eyes) {
    const cx = (x0 + x1) / 2;
    // the socket: an ellipse, two steps down in the hollow and one at its edge.
    // It starts one row under the brow: reaching into the brow's own rows put a
    // single stepped cell in the middle of each eyebrow, which at this size is
    // not a shadow, it is a speck.
    for (let y = eyeY - 4; y <= eyeY + 4; y++) {
      for (let x = x0 - 3; x <= x1 + 3; x++) {
        const dx = (x - cx) / (eyeW / 2 + 2.6);
        const dy = (y - eyeY + 0.4) / 4.4;
        const r = dx * dx + dy * dy;
        if (r > 1) continue;
        step(x, y, r > 0.46 ? -6 : -14);
      }
    }
    // the opening, an almond: full width on the eye line, inset by one above
    // and by two below, so both ends of it come to a corner
    const open = f.eyesNarrow
      ? [[eyeY - 1, x0 + 2, x1 - 2], [eyeY, x0, x1]]
      : [[eyeY - 1, x0 + 1, x1 - 1], [eyeY, x0, x1], [eyeY + 1, x0 + 2, x1 - 2]];
    const lidTop = new Map();
    const lidBot = new Map();
    for (const [y, a, b] of open) {
      for (let x = a; x <= b; x++) {
        lidTop.set(x, Math.min(lidTop.get(x) ?? 99, y));
        lidBot.set(x, Math.max(lidBot.get(x) ?? -99, y));
      }
    }
    // the lid follows the almond rather than ruling across it
    for (const [x, y] of lidTop) {
      put(x, y - 1, lidInk);
      step(x, y - 2, -8);                       // the fold over the lid
    }
    for (const [x, y] of lidBot) {
      put(x, y + 1, shade(f.skin[1], -12));     // the lash line
      step(x, y + 2, -7);                       // and the weight under it
    }
    const inOpen = new Set();
    for (const [y, a, b] of open) {
      for (let x = a; x <= b; x++) { inOpen.add(`${x},${y}`); put(x, y, sclera); }
    }
    const has = (x, y) => inOpen.has(`${x},${y}`);
    // the iris: three cells across, centred, the lid cutting its top row, with
    // a pupil of one cell and a catchlight on the lamp's side of it. The two
    // are rounded AWAY from each other so that on an even eye width they stay
    // mirror images: rounding both the same way put one iris a cell off its
    // opening, which at this size is a man looking sideways.
    const ix = (side < 0 ? Math.floor(cx) : Math.ceil(cx)) - 1;
    for (let y = eyeY - 1; y <= eyeY + 1; y++) {
      for (let x = ix; x <= ix + 2; x++) {
        if (!has(x, y)) continue;
        put(x, y, y < eyeY ? shade(hair, -8) : y > eyeY ? shade(hair, -2) : shade(hair, 10));
      }
    }
    if (has(ix + 1, eyeY)) put(ix + 1, eyeY, INK);
    if (has(ix, eyeY)) put(ix, eyeY, shade(sclera, 16));
    // the corners, which is what stops it reading as a tile
    put(x0 - 1, eyeY, side < 0 ? deep : deeper);
    put(x1 + 1, eyeY, side < 0 ? deeper : deep);
  }
  if (f.glasses) {
    /*
     * A WIRE FRAME, NOT A BLACK BOX.
     *
     * The frames used to be a nine-row rectangle of pure ink from above the
     * brow to below the cheekbone — which is the goggle the reviewer described,
     * drawn deliberately. A lens is a ring around an eye: it clears the brow,
     * it stops at the cheek, its corners are cut, and it is a dark step of the
     * hair rather than the blackest ink in the picture.
     */
    const wire = shade(hair, -10);
    for (const [x0, x1] of eyes) {
      rect(x0 - 1, eyeY - 3, x1 + 1, eyeY - 3, wire);
      rect(x0 - 1, eyeY + 3, x1 + 1, eyeY + 3, wire);
      rect(x0 - 2, eyeY - 2, x0 - 2, eyeY + 2, wire);
      rect(x1 + 2, eyeY - 2, x1 + 2, eyeY + 2, wire);
    }
    // the bridge over the nose, and an arm back to each temple
    rect(eyes[0][1] + 3, eyeY - 2, eyes[1][0] - 3, eyeY - 2, wire);
    rect(FACE.left + 1, eyeY - 2, eyes[0][0] - 3, eyeY - 2, wire);
    rect(eyes[1][1] + 3, eyeY - 2, FACE.right - 1, eyeY - 2, wire);
  }

  /*
   * The nose: a bridge down the middle, a tip, and a nostril at each side —
   * which is a thing there was no room at all for on the old grid.
   */
  /*
   * The nose: a bridge down the middle with the lamp on one side of it, a ball,
   * two wings and a nostril in each — which is a thing there was no room at all
   * for on the old grid. It is centred on the grid's middle, twenty-three and a
   * half, and so are the eyes and the mouth; the old one was drawn half a cell
   * to the right of all three.
   */
  const noseTop = eyeY + 1;
  const noseY = FACE.mouth - 4;                 // the base of it
  rect(22, noseTop, 25, noseY - 2, shade(mid, -7));
  rect(22, noseTop, 22, noseY - 2, shade(mid, 6));    // the lamp down one side
  rect(25, noseTop, 26, noseY - 1, turn);             // and the shade down the other
  rect(21, noseY - 1, 26, noseY - 1, shade(f.skin[1], -8));
  rect(22, noseY - 1, 25, noseY - 1, shade(mid, 11)); // the tip catches it
  rect(22, noseY, 25, noseY, shade(f.skin[1], -16));  // under the septum
  put(20, noseY, deep); put(27, noseY, deep);         // the wings
  put(21, noseY, deeper); put(26, noseY, deeper);     // and a nostril in each
  rect(20, noseY + 1, 27, noseY + 1, shade(f.skin[1], -4));

  /*
   * Mouth: the LINE between two lips, the lower lip catching the light under
   * it, the shadow of that lip under THAT, and a corner at each end. He never
   * smiles; the shapes here are set, thin, downturned and slight.
   *
   * THE LINE USED TO BE PAINTED OVER. `mY` was `FACE.mouth + 1` and the chin
   * highlight was at `jaw - 3`, which on this grid is the same row: every face
   * in the game had its mouth erased by its own chin one statement later, and
   * what was left was two pale bands. The five rows below the nose are now one
   * thing each — lip line, lower lip, the shadow under it, the chin, the
   * underside of the jaw — and nothing is written twice.
   */
  const mY = FACE.mouth;
  const lip = deeper;
  const lowerLip = shade(f.skin[0], 10);
  const under = shade(f.skin[1], -16);
  const m0 = 19;
  const m1 = 28;
  rect(m0 + 1, mY - 1, m1 - 1, mY - 1, shade(f.skin[1], -2));   // the upper lip
  if (f.mouth === 0) rect(m0, mY, m1, mY, lip);
  else if (f.mouth === 1) { rect(m0, mY, m1, mY, lip); put(m0 - 1, mY - 1, lip); put(m1 + 1, mY - 1, lip); }
  else if (f.mouth === 2) { rect(m0 + 1, mY, m1 - 1, mY, lip); }
  else { rect(m0, mY, m1, mY, lip); put(m0 - 1, mY + 1, lip); put(m1 + 1, mY + 1, lip); }
  // the corners: one cell of the deepest step at each end of the line, which is
  // what tells a reader this is a mouth and not a ruled line
  put(m0 - 1, mY, under);
  put(m1 + 1, mY, under);
  rect(m0 + 1, mY + 1, m1 - 1, mY + 1, lowerLip);
  rect(m0 + 2, mY + 2, m1 - 2, mY + 2, under);
  /*
   * The point of the chin, and the underside of the jaw below it — STEPPED off
   * the cells already there rather than painted in one ink, so the light that
   * crosses the rest of the face crosses these too. Five flat rectangles
   * stacked between the nose and the throat read as five stripes, which is
   * what the first cut of this looked like.
   */
  for (let x = m0 + 1; x <= m1 - 1; x++) step(x, jaw - 1, 6);
  for (let x = m0 - 2; x <= m1 + 2; x++) step(x, jaw, -9);
  if (f.moustache) rect(m0 - 2, mY - 2, m1 + 2, mY - 1, shade(hair, -6));
  if (f.scar) { rect(32, eyeY + 4, 33, eyeY + 5, deep); rect(33, eyeY + 6, 34, eyeY + 8, deep); }

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
