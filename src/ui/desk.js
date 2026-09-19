/**
 * The desk: the evening between two watches, as a place rather than a queue.
 *
 * The player asked for the scenes between watches — the tape, the political
 * section, the letter — and then measured what they cost: three to five
 * full-screen scenes typed out a line at a time, advanced by hand, 338 presses
 * of Enter across a campaign, and one Escape that threw the letter away with
 * the tape. So the evening is a desk now. The night's paper is on it: the tape
 * still hanging out of the printer, the section's chit, the order of
 * appointment, a folder that may or may not be yours, the envelope from home.
 * The player picks up what they want, in any order, reads it at their own
 * speed and puts it down. What they do not pick up they do not see. Standing up
 * is always one click away and costs nothing.
 *
 * Nothing that was drawn for the scenes is redrawn here. Picking up the tape
 * plays the printout scene exactly as it plays today, out of the same machine;
 * opening the envelope is still the letter, on the same sheet, in the same
 * room. `scenesFor` still decides what is on the desk and what each thing says.
 * This file decides only how the player reaches it — and draws the desk itself,
 * which is the one picture the game did not have.
 *
 * It lives in the scene host (index.html's #scene) as a scene kind of its own,
 * so the picture is scaled the way every other picture is, the phone gets the
 * same treatment the scenes get, and a key that advanced the old evening still
 * advances this one: Enter picks up whatever is next, and once everything has
 * been read it stands you up.
 */

import { scenesFor, officeReply, SCENE_W, SCENE_H, OFFICER } from './scenes.js';
import { consequenceFor } from '../engine/campaign.js';
import { REVELATIONS, readFolder } from '../engine/revelations.js';
import { COMMAND } from '../engine/config.js';

/* ------------------------------------------------------------- what is on it */

/**
 * The paper on the desk tonight, and the ending if there is one.
 *
 * One item per scene, in the order the scenes used to play — the tape, the
 * section, the order, the folder, the letter — because that order carries
 * meaning (the machine, then the man, then home) and the desk keeps it by
 * lighting the items in that order while letting the player deviate. The
 * ending is not paper: it is the night, and it plays when the player stands
 * up. `opened` is what has been picked up so far, so that the office can know
 * whether the folder was open before the player walked in.
 */
export function deskFor(state, result, entry, { opened = [] } = {}) {
  const scenes = scenesFor(state, result, entry, { opened });
  const items = [];
  let ending = null;
  // What plays on the way out: the ending, and the telephone call it promises.
  const outro = [];
  for (const scene of scenes) {
    if (scene.id === 'ending' || scene.id === 'call') {
      if (scene.id === 'ending') ending = scene;
      outro.push(scene);
      continue;
    }
    items.push(itemFor(scene, state, result, entry, items.length + 1));
  }
  return { items, ending, outro };
}

/**
 * One thing on the desk: what it is called on the plate, what a glance at it
 * tells you, and the stamp on it. The rule for the gist is that it says what
 * the paper says about itself from across the room — the headline on the
 * tape, the tier on the section's chit, the post on the order — and never a
 * word of what is inside. A player on their second campaign should be able to
 * read the desk in two seconds and leave; a player on their first should want
 * to pick everything up.
 */
function itemFor(scene, state, result, entry, n) {
  const key = String(n);
  const base = { id: scene.id, kind: scene.kind, scene, key, box: BOXES[scene.id] ?? BOXES.printout };
  switch (scene.id) {
    case 'printout':
      return {
        ...base,
        plate: 'THE TAPE',
        gist: result.abandoned
          ? 'NOT SCORED. THE WATCH WAS NOT STOOD.'
          : `${String(result.headline ?? '').toUpperCase()} · SCORE ${result.score}`,
        stamp: null,
      };
    case 'commissar': {
      const pressure = state.narrativePressure !== false;
      const tier = consequenceFor(state.campaign, { narrativePressure: pressure }).tier;
      if (!pressure) {
        return { ...base, plate: 'SECTOR COMMAND', gist: 'The assessment, typed.', stamp: tier.label };
      }
      if (scene.empty) {
        return {
          ...base,
          plate: 'THE SECTION',
          gist: scene.locked ? 'The door is locked and the lamp is off.'
            : 'The door is open and nobody is in.',
          stamp: null,
        };
      }
      if (scene.kind === 'finding') {
        return {
          ...base,
          plate: 'A FINDING FROM THE SECTION',
          gist: 'Signed and sent. Nobody read it to you.',
          stamp: tier.label,
        };
      }
      return {
        ...base,
        plate: 'THE SECTION',
        gist: result.abandoned
          ? `A chit: ${OFFICER.rank} ${OFFICER.surname} will see you now.`
          : `A chit: report to ${OFFICER.rank} ${OFFICER.surname} before you turn in.`,
        stamp: tier.label,
      };
    }
    case 'appointment':
      return {
        ...base,
        plate: 'ORDER OF APPOINTMENT',
        gist: `You are appointed ${scene.post}.`,
        stamp: scene.ref ?? 'ORDER 12-4',
      };
    case 'revelation': {
      const desk = REVELATIONS[scene.revelationId]?.desk ?? {};
      return {
        ...base,
        revelationId: scene.revelationId ?? null,
        yours: desk.yours !== false,
        plate: desk.plate ?? 'A FOLDER',
        gist: desk.gist ?? 'It was left on the desk.',
        stamp: scene.ref ?? null,
      };
    }
    case 'letter': {
      const letter = entry?.letter ?? {};
      const redirected = !result.abandoned && result.reason === 'site-lost';
      return {
        ...base,
        plate: letter.title ?? 'THE POST',
        gist: letter.isLetter === false
          ? 'From the sector political section, where a letter should be.'
          : `${DISPOSITION_GIST[letter.disposition] ?? 'From the Ville.'}${redirected
            ? ' Redirected to Kubin.' : ''}`,
        stamp: letter.isLetter === false ? null : (letter.plate ?? PLATE_OF[letter.disposition] ?? null),
      };
    }
    default:
      return { ...base, plate: String(scene.speaker ?? '').toUpperCase(), gist: '', stamp: null };
  }
}

/** What the envelope says about itself before it is opened. */
const DISPOSITION_GIST = {
  unopened: 'From the Ville. The seal is the original seal.',
  resealed: 'From the Ville. Somebody has opened it before you.',
  released: 'From the Ville, by way of the section. The postmark is old.',
};
const PLATE_OF = {
  unopened: 'DELIVERED UNOPENED',
  resealed: 'OPENED AND RESEALED',
  released: 'HELD, THEN RELEASED',
};

/* ------------------------------------------------------------------ the desk */

/**
 * Where each thing lies, in scene pixels: the box the drawing fills and the
 * plate hangs under. The tape at the back left under the printer, the
 * section's chit in the middle of the lamp's light, the order at the back
 * right, the folder in front of the chit, the envelope at the near right
 * corner, where post is put down on a desk by somebody who did not sit at it.
 */
const BOXES = {
  printout: { x: 60, y: 40, w: 68, h: 92 },
  commissar: { x: 140, y: 78, w: 40, h: 26 },
  appointment: { x: 206, y: 58, w: 62, h: 48 },
  revelation: { x: 150, y: 122, w: 72, h: 40 },
  letter: { x: 232, y: 124, w: 54, h: 34 },
};

/**
 * The scene palette, by name. The desk is drawn in the same seven ramps and
 * five accents the scenes are drawn in (see the table at the head of the
 * pictures in scenes.js, and test/palette.test.js, which reads this file too),
 * so it is the same room as the office and the quarters and not a sixth
 * illustration with its own inks.
 */
const PAPER = ['#6f6552', '#b2a482', '#ded3b8', '#f4efe2'];
const WOOD = ['#2b1f14', '#4e3620', '#8a6236', '#a3874f'];
const NIGHT = ['#141824', '#3a4258', '#8a93ad', '#e8ecf5'];
const STEEL = ['#23261f', '#4a4f48', '#8d938a', '#d9dcd4'];
const AMBER = '#ffb43c';
const TUBE = '#45e874';
const RED = '#9a2b26';
const INK = '#0a0d0a';

const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];

/** One rectangle of one ink, on whole pixels. Nothing here is anti-aliased. */
function px(ctx, x, y, w, h, c) {
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/** A box outlined in its own darkest step, over a fill. */
function box(ctx, x, y, w, h, fill, edge) {
  px(ctx, x, y, w, h, fill);
  px(ctx, x, y, w, 1, edge);
  px(ctx, x, y + h - 1, w, 1, edge);
  px(ctx, x, y, 1, h, edge);
  px(ctx, x + w - 1, y, 1, h, edge);
}

/** An ordered dither between two inks, `level` of sixteen cells in `hi`. */
function dither(ctx, x, y, w, h, lo, hi, level) {
  if (lo) px(ctx, x, y, w, h, lo);
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      if (BAYER[(y + yy) & 3][(x + xx) & 3] < level) px(ctx, x + xx, y + yy, 1, 1, hi);
    }
  }
}

/**
 * A pool of light: the lamp on the desk, falling off to nothing at the edge
 * of an ellipse, dithered rather than blended, because there is no lit step
 * in the palette and a gradient would fringe.
 */
function pool(ctx, cx, cy, rx, ry, hi, clip) {
  const [x0, y0, x1, y1] = clip;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      const v = 1 - (dx * dx + dy * dy);
      if (v <= 0) continue;
      if (BAYER[y & 3][x & 3] < Math.min(16, Math.round(v * 22))) px(ctx, x, y, 1, 1, hi);
    }
  }
}

/** The shadow a thing casts on the desk: one row under it and one cell out. */
function shadow(ctx, x, y, w, h) {
  px(ctx, x + 1, y + h, w, 1, WOOD[0]);
  px(ctx, x + w, y + 1, 1, h, WOOD[0]);
}

const FAR_EDGE = 56;
const NEAR_EDGE = 166;

/**
 * The desk, from the chair.
 *
 * The room is dark above the far edge; a lamp at the left throws its light
 * across the middle of the desk and the paper lies in it. Every item is drawn
 * twice over — as it arrived, and as it lies once it has been read: the tape
 * torn off and lying flat, the chit face down, the folder open, the flap of
 * the envelope up — so that a glance says what is left without a word.
 */
export function drawDesk(ctx, { items = [], opened = [], next = null } = {}) {
  const read = (id) => opened.includes(id);
  const has = (id) => items.some((i) => i.id === id);

  // the room, and the light on the wall behind the lamp
  px(ctx, 0, 0, SCENE_W, SCENE_H, NIGHT[0]);
  pool(ctx, 40, 46, 70, 34, NIGHT[1], [0, 0, SCENE_W, FAR_EDGE]);
  px(ctx, 0, FAR_EDGE - 6, SCENE_W, 1, INK);
  // the desk top, the far edge and the near lip
  px(ctx, 0, FAR_EDGE, SCENE_W, NEAR_EDGE - FAR_EDGE, WOOD[1]);
  px(ctx, 0, FAR_EDGE, SCENE_W, 1, WOOD[0]);
  pool(ctx, 150, 104, 178, 78, WOOD[2], [0, FAR_EDGE + 1, SCENE_W, NEAR_EDGE]);
  px(ctx, 0, NEAR_EDGE, SCENE_W, SCENE_H - NEAR_EDGE, WOOD[0]);
  px(ctx, 0, NEAR_EDGE, SCENE_W, 1, WOOD[2]);
  // the grain, faintly, across the lit middle
  for (let y = FAR_EDGE + 9; y < NEAR_EDGE; y += 11) px(ctx, 12 + (y % 5) * 7, y, 90, 1, WOOD[1]);

  drawLamp(ctx);
  drawMug(ctx, 22, 128);
  if (has('printout')) drawPrinter(ctx, BOXES.printout, read('printout'), items.find((i) => i.id === 'printout'));
  if (has('appointment')) drawOrder(ctx, BOXES.appointment, read('appointment'));
  if (has('commissar')) drawChit(ctx, BOXES.commissar, items.find((i) => i.id === 'commissar'), read('commissar'));
  if (has('revelation')) drawFolder(ctx, BOXES.revelation, items.find((i) => i.id === 'revelation'), read('revelation'));
  if (has('letter')) drawEnvelope(ctx, BOXES.letter, items.find((i) => i.id === 'letter'), read('letter'));
  drawPencil(ctx, 270, 108);

  // the thing the lamp is on: a chevron on the desk beside what is next
  if (next) {
    const b = BOXES[next] ?? BOXES.printout;
    const cx = b.x - 6;
    const cy = b.y + Math.round(b.h / 2);
    px(ctx, cx, cy - 2, 1, 5, AMBER);
    px(ctx, cx + 1, cy - 1, 1, 3, AMBER);
    px(ctx, cx + 2, cy, 1, 1, AMBER);
  }
}

function drawLamp(ctx) {
  // the base, the stem, the shade, and the bulb under it
  px(ctx, 14, 56, 30, 4, STEEL[0]);
  px(ctx, 16, 55, 26, 1, STEEL[2]);
  px(ctx, 28, 30, 3, 26, STEEL[1]);
  px(ctx, 12, 24, 36, 2, STEEL[2]);
  px(ctx, 10, 26, 40, 8, STEEL[1]);
  px(ctx, 10, 33, 40, 1, STEEL[0]);
  px(ctx, 16, 34, 28, 1, AMBER);
  dither(ctx, 18, 35, 24, 3, null, AMBER, 6);
}

function drawMug(ctx, x, y) {
  shadow(ctx, x, y, 14, 14);
  box(ctx, x, y, 14, 14, STEEL[2], STEEL[0]);
  px(ctx, x + 1, y + 1, 12, 2, STEEL[3]);
  px(ctx, x + 14, y + 3, 4, 8, STEEL[0]);
  px(ctx, x + 15, y + 4, 2, 6, WOOD[1]);
}

function drawPencil(ctx, x, y) {
  px(ctx, x, y, 22, 2, WOOD[3]);
  px(ctx, x + 22, y, 3, 2, PAPER[2]);
  px(ctx, x + 25, y, 1, 2, INK);
  px(ctx, x - 2, y, 2, 2, RED);
}

/**
 * The printer with the tape hanging out of it, or, once it has been read,
 * the tape torn off and lying under the machine's mouth.
 */
function drawPrinter(ctx, b, read, item) {
  const x = b.x;
  const y = b.y;
  // the machine
  shadow(ctx, x, y, 68, 30);
  box(ctx, x, y, 68, 30, STEEL[1], STEEL[0]);
  px(ctx, x + 1, y + 1, 66, 3, STEEL[2]);
  px(ctx, x + 6, y + 22, 56, 3, INK);
  px(ctx, x + 60, y + 7, 3, 3, read ? STEEL[0] : TUBE);
  px(ctx, x + 6, y + 8, 14, 6, STEEL[0]);
  const lines = Math.min(11, item?.scene?.lines?.length ?? 8);
  if (!read) {
    // the sheet, out of the slot and down onto the desk
    const sx = x + 10;
    const sw = 48;
    // as long as what is printed on it, and never past the plate under it
    const bottom = Math.min(y + b.h - 2, y + 30 + 40 + lines * 2);
    px(ctx, sx, y + 25, sw, bottom - (y + 25), PAPER[3]);
    px(ctx, sx + sw, y + 26, 1, bottom - (y + 26), PAPER[0]);
    px(ctx, sx + 1, bottom, sw, 1, WOOD[0]);
    for (let r = y + 29; r < bottom - 2; r += 4) {
      px(ctx, sx + 2, r, 1, 1, INK);
      px(ctx, sx + sw - 3, r, 1, 1, INK);
    }
    for (let i = 0; i < lines; i++) {
      const r = y + 32 + i * 5;
      if (r > bottom - 4) break;
      px(ctx, sx + 7, r, 8 + ((i * 13) % 26), 1, STEEL[0]);
    }
    // the perforation where the next sheet would start
    px(ctx, sx, bottom - 2, sw, 1, PAPER[1]);
  } else {
    // torn off and lying flat, with a stub still in the mouth
    px(ctx, x + 10, y + 25, 48, 3, PAPER[3]);
    const sx = x + 4;
    const sy = y + 44;
    shadow(ctx, sx, sy, 60, 34);
    px(ctx, sx, sy, 60, 34, PAPER[3]);
    px(ctx, sx, sy, 60, 1, PAPER[1]);
    for (let r = sy + 4; r < sy + 32; r += 4) {
      px(ctx, sx + 2, r, 1, 1, INK);
      px(ctx, sx + 57, r, 1, 1, INK);
    }
    for (let i = 0; i < 6; i++) px(ctx, sx + 7, sy + 5 + i * 5, 10 + ((i * 11) % 30), 1, STEEL[0]);
  }
}

/**
 * The section's chit: a slip with the section's stamp on it. Face down once
 * you have been. On a night the post was struck it is a long envelope with
 * the finding inside; on a night the office is empty it is the clerk's note.
 */
function drawChit(ctx, b, item, read) {
  const { x, y, w, h } = b;
  if (item?.kind === 'finding' && !item.scene?.empty) {
    shadow(ctx, x - 6, y, w + 14, h - 4);
    box(ctx, x - 6, y, w + 14, h - 4, PAPER[1], PAPER[0]);
    px(ctx, x - 2, y + 4, 12, 5, RED);
    px(ctx, x + 14, y + 6, 26, 1, STEEL[1]);
    px(ctx, x + 14, y + 10, 22, 1, STEEL[1]);
    px(ctx, x + 14, y + 14, 24, 1, STEEL[1]);
    if (read) px(ctx, x - 6, y - 3, w + 14, 3, PAPER[0]);
    return;
  }
  shadow(ctx, x, y, w, h);
  if (read) {
    px(ctx, x, y, w, h, PAPER[1]);
    px(ctx, x, y, w, 1, PAPER[0]);
    return;
  }
  px(ctx, x, y, w, h, PAPER[2]);
  px(ctx, x, y + h - 1, w, 1, PAPER[0]);
  if (item?.scene?.empty) {
    px(ctx, x + 4, y + 6, 26, 1, STEEL[1]);
    px(ctx, x + 4, y + 11, 18, 1, STEEL[1]);
    px(ctx, x + 4, y + 16, 22, 1, STEEL[1]);
    return;
  }
  px(ctx, x + 3, y + 3, 10, 4, RED);
  px(ctx, x + 16, y + 5, 18, 1, STEEL[1]);
  px(ctx, x + 4, y + 11, 30, 1, STEEL[1]);
  px(ctx, x + 4, y + 15, 24, 1, STEEL[1]);
  px(ctx, x + 4, y + 19, 12, 1, STEEL[1]);
}

/**
 * The order of appointment: a sheet with the heavy stencilled heading the
 * appointment scene sets, and the stamp at the foot. A read order has been
 * squared away with a corner turned.
 */
function drawOrder(ctx, b, read) {
  const { x, y, w, h } = b;
  shadow(ctx, x, y, w, h);
  px(ctx, x, y, w, h, PAPER[3]);
  px(ctx, x, y + h - 1, w, 1, PAPER[1]);
  px(ctx, x + w - 1, y, 1, h, PAPER[1]);
  // the stencil block
  px(ctx, x + 6, y + 6, 36, 3, INK);
  px(ctx, x + 6, y + 11, 24, 3, INK);
  // the ruled particulars
  for (let i = 0; i < 4; i++) px(ctx, x + 6, y + 20 + i * 5, 20 + ((i * 17) % 28), 1, STEEL[1]);
  // the stamp
  px(ctx, x + w - 18, y + h - 14, 12, 8, RED);
  px(ctx, x + w - 16, y + h - 12, 8, 4, PAPER[3]);
  px(ctx, x + w - 15, y + h - 11, 6, 2, RED);
  if (read) {
    px(ctx, x, y, 7, 7, WOOD[1]);
    px(ctx, x, y + 7, 7, 1, PAPER[1]);
    px(ctx, x + 7, y, 1, 7, PAPER[1]);
    px(ctx, x + 1, y + 1, 6, 6, PAPER[1]);
  }
}

/**
 * The folder: buff card with a tab, and a red band across the corner when it
 * is not yours. Open, it shows the first sheet inside.
 */
function drawFolder(ctx, b, item, read) {
  const { x, y, w, h } = b;
  shadow(ctx, x, y, w, h);
  // the tab
  px(ctx, x + 4, y - 4, 24, 5, PAPER[2]);
  px(ctx, x + 4, y - 4, 24, 1, PAPER[0]);
  px(ctx, x + 8, y - 2, 12, 1, STEEL[1]);
  box(ctx, x, y, w, h, PAPER[1], PAPER[0]);
  if (!item?.yours && !read) {
    // a band across the top right corner, stepped rather than drawn
    for (let i = 0; i < 16; i++) px(ctx, x + w - 18 + i, y + 1 + i, 3, 1, RED);
  }
  if (read) {
    // the first sheet pulled half out from under the cover, its heading showing
    px(ctx, x + 10, y - 7, w - 8, 9, PAPER[3]);
    px(ctx, x + 10, y - 7, w - 8, 1, PAPER[1]);
    px(ctx, x + w + 1, y - 6, 1, h - 2, PAPER[3]);
    px(ctx, x + 14, y - 4, 26, 2, INK);
    px(ctx, x + 44, y - 4, 12, 1, STEEL[1]);
    box(ctx, x, y, w, h, PAPER[1], PAPER[0]);
    px(ctx, x + 8, y + h - 12, 26, 1, STEEL[1]);
    px(ctx, x + 8, y + h - 8, 18, 1, STEEL[1]);
  } else {
    px(ctx, x + 8, y + h - 12, 26, 1, STEEL[1]);
    px(ctx, x + 8, y + h - 8, 18, 1, STEEL[1]);
  }
}

/**
 * The envelope from home — the postmark, the section's slip clipped to it —
 * or the notice that stands where a letter should be. Opened, the flap is up
 * and the sheet is out.
 */
function drawEnvelope(ctx, b, item, read) {
  const { x, y, w, h } = b;
  const notice = item?.scene?.notice;
  shadow(ctx, x, y, w, h);
  if (notice) {
    px(ctx, x, y, w, h, PAPER[2]);
    px(ctx, x, y + h - 1, w, 1, PAPER[0]);
    px(ctx, x + 5, y + 5, w - 10, 3, INK);
    for (let i = 0; i < 4; i++) px(ctx, x + 5, y + 13 + i * 4, w - 14 - ((i * 7) % 12), 1, STEEL[1]);
    px(ctx, x + w - 16, y + h - 10, 10, 5, RED);
    if (read) px(ctx, x, y, 6, 6, PAPER[1]);
    return;
  }
  px(ctx, x, y, w, h, PAPER[2]);
  px(ctx, x, y + h - 1, w, 1, PAPER[0]);
  px(ctx, x + w - 1, y, 1, h, PAPER[1]);
  if (read) {
    // the flap up — widest at the fold, narrowing to its tip — and the
    // letter's edge showing under it
    px(ctx, x + 4, y - 3, w - 8, 5, PAPER[3]);
    px(ctx, x + 8, y - 1, 20, 1, NIGHT[1]);
    for (let i = 0; i < 9; i++) px(ctx, x + i * 3, y - 4 - i, w - i * 6, 1, PAPER[1]);
  } else {
    // the flap, closed
    for (let i = 0; i < 8; i++) px(ctx, x + i * 3, y + i, w - i * 6, 1, PAPER[1]);
    // the postmark, and the stamp under it
    px(ctx, x + w - 15, y + 10, 8, 6, DAWN_STAMP);
    ring(ctx, x + w - 10, y + 15, STEEL[0]);
    // the address
    px(ctx, x + 8, y + 18, 24, 1, NIGHT[1]);
    px(ctx, x + 8, y + 22, 30, 1, NIGHT[1]);
    px(ctx, x + 8, y + 26, 18, 1, NIGHT[1]);
  }
  if (item?.scene?.slip) {
    // the section's docket, clipped to the corner
    px(ctx, x - 4, y + h - 14, 22, 11, PAPER[1]);
    px(ctx, x - 4, y + h - 14, 22, 1, PAPER[0]);
    px(ctx, x - 1, y + h - 10, 14, 1, STEEL[1]);
    px(ctx, x - 1, y + h - 7, 10, 1, STEEL[1]);
    px(ctx, x + 2, y + h - 16, 6, 3, STEEL[2]);
  }
}

/** The stamp on the envelope is the flag's gold, which the crest uses too. */
const DAWN_STAMP = '#e8a86a';

/** A seven-cell postmark ring, on whole pixels. */
function ring(ctx, cx, cy, c) {
  px(ctx, cx - 2, cy - 4, 5, 1, c);
  px(ctx, cx - 2, cy + 4, 5, 1, c);
  px(ctx, cx - 4, cy - 2, 1, 5, c);
  px(ctx, cx + 4, cy - 2, 1, 5, c);
  px(ctx, cx - 3, cy - 3, 1, 1, c);
  px(ctx, cx + 3, cy - 3, 1, 1, c);
  px(ctx, cx - 3, cy + 3, 1, 1, c);
  px(ctx, cx + 3, cy + 3, 1, 1, c);
}

/* -------------------------------------------------------------- the screen */

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * The desk on the scene host.
 *
 * It takes the host over between scenes: the picture on the canvas, the
 * items as plates laid over the paper they name, STAND UP in the corner. To
 * read something it hands the host to the scene player for exactly one scene
 * and takes it back when the player is done with it. The player's SKIP cap is
 * PUT IT DOWN while a thing is being read, because that is what it does.
 */
export class Desk {
  constructor(host, { player, audio = null, save = null } = {}) {
    this.host = host;
    this.player = player;
    this.audio = audio;
    this.save = save;
    this.canvas = host.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.textBox = host.querySelector('.scene-text');
    this.skipBtn = host.querySelector('.scene-skip');
    this.headEl = host.querySelector('.desk-head');
    this.itemsEl = host.querySelector('.desk-items');
    this.leaveBtn = host.querySelector('.desk-leave');
    this.repliesEl = host.querySelector('.desk-replies');
    this.showing = false;
    this.result = null;
    this.items = [];
    this.opened = [];
    this.ending = null;
    this.outro = [];
    this.endingSeen = false;
    this.onDone = null;
    /** The office scene waiting on an answer, while it is. */
    this.asking = null;

    /*
     * The keys while he waits: 1, 2 and 3 are the replies in the order they
     * are offered; Enter and Space say nothing, which is what a player who
     * is pressing Enter through the evening has been saying all along;
     * Escape says nothing and puts the scene down.
     */
    this.onAskKey = (e) => {
      if (!this.asking) return;
      if ((e.key === 'Enter' || e.key === ' ') && e.target.closest?.('button')) return;
      if (e.key === 'Escape') { e.preventDefault(); this.answer('nothing', { skipRest: true }); return; }
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.answer('nothing'); return; }
      if (/^[1-3]$/.test(e.key)) {
        const reply = this.asking.ask?.replies[Number(e.key) - 1];
        if (reply) { e.preventDefault(); this.answer(reply.id); }
      }
    };
    this.onAskResize = () => { if (this.asking) this.placeReplies(); };
    if (this.repliesEl) {
      this.repliesEl.addEventListener('click', (e) => {
        const btn = e.target.closest?.('[data-reply]');
        if (btn) this.answer(btn.dataset.reply);
      });
    }

    this.onKey = (e) => {
      if (!this.showing) return;
      // A control with the focus ring gets Enter and Space to itself.
      if ((e.key === 'Enter' || e.key === ' ') && e.target.closest?.('button')) return;
      if (e.key === 'Escape') { e.preventDefault(); this.leave(); return; }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const next = this.next();
        if (next) this.pickUp(next.id);
        else this.leave();
        return;
      }
      if (/^[1-9]$/.test(e.key)) {
        const item = this.items[Number(e.key) - 1];
        if (item) { e.preventDefault(); this.pickUp(item.id); }
      }
    };
    this.onResize = () => { if (this.showing) this.layout(); };
    // A tap on the paper itself, not only on its plate.
    this.onCanvasTap = (e) => {
      if (!this.showing) return;
      const rect = this.canvas.getBoundingClientRect();
      if (!rect.width) return;
      const sx = (e.clientX - rect.left) / (rect.width / SCENE_W);
      const sy = (e.clientY - rect.top) / (rect.height / SCENE_H);
      const hit = [...this.items].reverse().find((i) => sx >= i.box.x - 4 && sx <= i.box.x + i.box.w + 4
        && sy >= i.box.y - 12 && sy <= i.box.y + i.box.h + 4);
      if (hit) this.pickUp(hit.id);
    };
    this.canvas.addEventListener('click', this.onCanvasTap);
    if (this.itemsEl) {
      this.itemsEl.addEventListener('click', (e) => {
        const btn = e.target.closest?.('[data-item]');
        if (btn) this.pickUp(btn.dataset.item);
      });
    }
    if (this.leaveBtn) this.leaveBtn.addEventListener('click', () => this.leave());
  }

  /**
   * Sit down at it. The same night opened twice — from the card at the end,
   * to read what was left — is the same desk with the same things read.
   */
  open(state, result, entry, { onDone = null } = {}) {
    if (this.result !== result) {
      this.state = state;
      this.result = result;
      this.entry = entry;
      this.opened = [];
      this.endingSeen = false;
      this.build();
      /*
       * With the narrative pressure off the documents stay in the file and
       * nothing is on the desk to pick up, so the file takes them as it did
       * before there was a desk.
       */
      if (state.narrativePressure === false && entry?.revelation?.id) {
        readFolder(state.campaign, entry.revelation.id);
        this.save?.();
      }
    }
    this.onDone = onDone;
    this.show();
  }

  build() {
    const { items, ending, outro } = deskFor(this.state, this.result, this.entry, { opened: this.opened });
    this.items = items;
    this.ending = ending;
    this.outro = outro;
  }

  /** What the lamp is on: the first thing not yet picked up. */
  next() {
    return this.items.find((i) => !this.opened.includes(i.id)) ?? null;
  }

  show() {
    this.showing = true;
    this.host.hidden = false;
    this.host.dataset.kind = 'desk';
    if (this.textBox) this.textBox.hidden = true;
    if (this.skipBtn) this.skipBtn.hidden = true;
    if (this.headEl) this.headEl.hidden = false;
    if (this.itemsEl) this.itemsEl.hidden = false;
    if (this.leaveBtn) this.leaveBtn.hidden = false;
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('resize', this.onResize);
    this.renderItems();
    this.layout();
    this.draw();
    // The ring goes on what is next, so Enter and Space read the desk in order.
    const next = this.next();
    const focus = next ? this.itemsEl?.querySelector(`[data-item="${next.id}"]`) : this.leaveBtn;
    focus?.focus?.({ preventScroll: true });
  }

  hide() {
    this.showing = false;
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('resize', this.onResize);
    if (this.headEl) this.headEl.hidden = true;
    if (this.itemsEl) this.itemsEl.hidden = true;
    if (this.leaveBtn) this.leaveBtn.hidden = true;
    if (this.repliesEl) this.repliesEl.hidden = true;
    if (this.skipBtn) this.skipBtn.hidden = false;
  }

  /** Pick a thing up: it is read, and then it is back on the desk. */
  pickUp(id) {
    const item = this.items.find((i) => i.id === id);
    if (!item || !this.showing) return;
    if (!this.opened.includes(id)) {
      this.opened.push(id);
      /*
       * Opening the folder is the act the document describes. It goes on the
       * file the moment the cover comes up — and if the folder was not yours,
       * so does what that cost.
       */
      if (item.revelationId && this.state?.campaign) {
        readFolder(this.state.campaign, item.revelationId);
        this.save?.();
      }
    }
    this.audio?.tick?.();
    // Composed again now, so the office knows what was open before you came in.
    this.build();
    const scene = this.items.find((i) => i.id === id)?.scene ?? item.scene;
    this.hide();
    if (this.skipBtn) this.skipBtn.textContent = 'PUT IT DOWN ▸▸';
    const character = this.state?.campaign?.character ?? null;
    /*
     * The office, in two halves: up to the line he waits after, then the
     * three replies, then the rest with his next line knowing which it was.
     */
    if (scene.ask && scene.ask.at >= 0 && scene.ask.at < scene.lines.length - 1) {
      const first = { ...scene, lines: scene.lines.slice(0, scene.ask.at + 1), ask: null };
      this.player.play([first], { character, onDone: () => this.askReply(scene) });
      return;
    }
    this.player.play([scene], {
      character,
      onDone: () => {
        if (this.skipBtn) this.skipBtn.textContent = 'SKIP ▸▸';
        this.show();
      },
    });
  }

  /**
   * He waits. The last frame of the office stays on the canvas, his last line
   * stays on the desk front, and the three replies stand above it.
   */
  askReply(scene) {
    this.asking = scene;
    this.host.hidden = false;
    if (this.skipBtn) this.skipBtn.hidden = true;
    if (this.repliesEl) {
      this.repliesEl.hidden = false;
      this.repliesEl.innerHTML = scene.ask.replies.map((r, i) => `<button type="button"
          class="desk-reply" data-reply="${esc(r.id)}" title="${esc(r.label)} (${i + 1})">
          <i class="desk-key">${i + 1}</i><b>${esc(r.label)}</b></button>`).join('');
      this.placeReplies();
      this.repliesEl.querySelector('[data-reply]')?.focus?.({ preventScroll: true });
    }
    window.addEventListener('keydown', this.onAskKey);
    window.addEventListener('resize', this.onAskResize);
  }

  /** Above the box his line is in; under it on a phone, where there is room. */
  placeReplies() {
    const el = this.repliesEl;
    const box = this.textBox?.getBoundingClientRect?.();
    if (!el || !box || !box.height) return;
    const host = this.host.getBoundingClientRect();
    const stacked = this.host.classList.contains('is-stacked');
    el.style.left = `${Math.round(box.left - host.left)}px`;
    el.style.width = `${Math.round(box.width)}px`;
    el.style.top = stacked
      ? `${Math.round(box.bottom - host.top + 8)}px`
      : `${Math.max(8, Math.round(box.top - host.top - el.offsetHeight - 8))}px`;
  }

  /**
   * The reply: written on the file, charged or credited on the file's own
   * standing, and answered by the rest of the scene.
   */
  answer(replyId, { skipRest = false } = {}) {
    const scene = this.asking;
    if (!scene) return;
    this.asking = null;
    window.removeEventListener('keydown', this.onAskKey);
    window.removeEventListener('resize', this.onAskResize);
    if (this.repliesEl) { this.repliesEl.hidden = true; this.repliesEl.innerHTML = ''; }
    const { lines, cost, record } = officeReply(scene, replyId);
    const campaign = this.state?.campaign;
    if (campaign) {
      if (cost && typeof campaign.standing === 'number') {
        campaign.standing = Math.max(COMMAND.minStanding,
          Math.min(COMMAND.maxStanding, campaign.standing + cost));
      }
      if (record && campaign.character?.record) {
        campaign.character.record.push({ ...record, at: campaign.character.watches ?? 0 });
      }
      this.save?.();
    }
    this.audio?.tick?.();
    if (this.skipBtn) { this.skipBtn.hidden = false; this.skipBtn.textContent = 'PUT IT DOWN ▸▸'; }
    this.player.play([{ ...scene, lines, ask: null }], {
      character: this.state?.campaign?.character ?? null,
      onDone: () => {
        if (this.skipBtn) this.skipBtn.textContent = 'SKIP ▸▸';
        this.show();
      },
    });
    if (skipRest) this.player.skipAll();
  }

  /**
   * Stand up. On a closing watch the ending plays on the way out, once, and
   * it is still the last thing said; otherwise the card is next.
   */
  leave() {
    if (!this.showing) return;
    this.hide();
    const done = this.onDone;
    if (this.skipBtn) this.skipBtn.textContent = 'SKIP ▸▸';
    if (this.outro?.length && !this.endingSeen) {
      this.endingSeen = true;
      this.player.play(this.outro, {
        character: this.state?.campaign?.character ?? null,
        onDone: () => { this.host.hidden = true; done?.(); },
      });
      return;
    }
    this.host.hidden = true;
    done?.();
  }

  renderItems() {
    if (!this.itemsEl) return;
    const next = this.next();
    this.itemsEl.innerHTML = this.items.map((item) => {
      const read = this.opened.includes(item.id);
      const cls = ['desk-item', read ? 'is-read' : '', next?.id === item.id ? 'is-next' : ''].filter(Boolean).join(' ');
      return `<button type="button" class="${cls}" data-item="${esc(item.id)}"
          title="${esc(read ? 'Read it again' : 'Pick it up')} (${esc(item.key)})">
        <i class="desk-key">${esc(item.key)}</i>
        <b class="desk-plate">${esc(item.plate)}</b>
        ${item.stamp ? `<em class="desk-stamp">${esc(item.stamp)}</em>` : ''}
        <small class="desk-gist">${esc(item.gist)}</small>
      </button>`;
    }).join('');
    if (this.leaveBtn) {
      this.leaveBtn.classList.toggle('is-next', !next);
      const unread = this.items.filter((i) => !this.opened.includes(i.id)).length;
      this.leaveBtn.title = unread
        ? `Leave the rest on the desk (Esc) — ${unread} unread`
        : 'Stand up (Esc)';
    }
  }

  /**
   * The picture at a whole-pixel scale, centred; the plates laid under the
   * paper they name. On a phone the picture takes the top of the window and
   * the plates become a list under it, on the desk's own wood.
   */
  layout() {
    const vw = this.host.clientWidth || window.innerWidth;
    const vh = this.host.clientHeight || window.innerHeight;
    const k = Math.max(1, Math.floor(Math.min(vw / SCENE_W, vh / SCENE_H)));
    const stacked = k < 2 && vh >= SCENE_H * k + 140;
    const pad = 8;
    this.stacked = stacked;
    this.host.classList.toggle('is-stacked', stacked);
    this.host.style.setProperty('--scene-scale', stacked ? '3' : String(k));
    const superSample = stacked ? 2 : 1;
    const cw = SCENE_W * superSample;
    const ch = SCENE_H * superSample;
    if (this.canvas.width !== cw || this.canvas.height !== ch) {
      this.canvas.width = cw;
      this.canvas.height = ch;
    }
    const w = stacked ? vw - pad * 2 : SCENE_W * k;
    const h = stacked ? Math.round((vw - pad * 2) * SCENE_H / SCENE_W) : SCENE_H * k;
    const left = stacked ? pad : Math.floor((vw - w) / 2);
    const top = stacked ? pad + (this.headEl?.offsetHeight ?? 0) + 6 : Math.floor((vh - h) / 2);
    this.scale = k;
    this.superSample = superSample;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.canvas.style.left = `${left}px`;
    this.canvas.style.top = `${top}px`;
    if (!this.itemsEl) return;
    if (stacked) {
      this.itemsEl.style.top = `${top + h + 8}px`;
      for (const btn of this.itemsEl.querySelectorAll('[data-item]')) btn.style.cssText = '';
      return;
    }
    this.itemsEl.style.top = '';
    for (const btn of this.itemsEl.querySelectorAll('[data-item]')) {
      const item = this.items.find((i) => i.id === btn.dataset.item);
      if (!item) continue;
      const b = item.box;
      const x = left + b.x * k;
      const y = top + (b.y + b.h + 3) * k;
      btn.style.left = `${Math.min(x, vw - btn.offsetWidth - 8)}px`;
      btn.style.top = `${Math.min(y, vh - btn.offsetHeight - 8)}px`;
    }
  }

  draw() {
    const ctx = this.ctx;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    const s = this.superSample ?? 1;
    if (s !== 1) ctx.setTransform(s, 0, 0, s, 0, 0);
    drawDesk(ctx, { items: this.items, opened: this.opened, next: this.next()?.id ?? null });
    ctx.restore();
  }
}
