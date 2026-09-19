/**
 * The scenes are drawn in one palette, in whole pixels.
 *
 * Three rules, and all three are about why the cutscenes used to read as five
 * unrelated illustrations rather than as one game:
 *
 * 1. Every ink in `scenes.js` comes from the table at the top of it — seven
 *    ramps of four and five accents — so a new surface cannot quietly invent a
 *    thirty-fourth colour. There were a hundred and eleven hex literals in
 *    that file and no table at all.
 * 2. Nothing on the pixel canvas is drawn with a path primitive or a system
 *    font. `imageSmoothingEnabled = false` does nothing to fills and strokes:
 *    an arc or a `fillText` is anti-aliased and then magnified five times, and
 *    the grey fringe on it is the clearest tell that a picture is not pixel
 *    art.
 * 3. Where a ramp is too short for a surface, the two nearest steps are
 *    dithered with an ordered matrix rather than a colour being added.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hasGlyph } from '../src/ui/bitfont.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '..', 'src', 'ui', 'scenes.js'), 'utf8');
/*
 * The crest cast into the desk lip is pixel art drawn by code, exactly like
 * the cutscenes, so it answers to the same table and the same primitives. It
 * lives in its own file because it is furniture on the console rather than a
 * scene, and a second file is precisely how a thirty-fourth colour would get
 * into the game without anybody noticing.
 */
const crest = readFileSync(join(here, '..', 'src', 'ui', 'crest.js'), 'utf8');

/** The table, as the file itself declares it — seven ramps and five accents. */
const PALETTE = new Set([
  // SKIN
  '#9d7052', '#cda07a', '#e9c4a0', '#f0cfa8',
  // CLOTH
  '#262f20', '#3d4b33', '#4b5537', '#6b7a58',
  // PAPER
  '#6f6552', '#b2a482', '#ded3b8', '#f4efe2',
  // WOOD
  '#2b1f14', '#4e3620', '#8a6236', '#a3874f',
  // NIGHT
  '#141824', '#3a4258', '#8a93ad', '#e8ecf5',
  // STEEL
  '#23261f', '#4a4f48', '#8d938a', '#d9dcd4',
  // DAWN
  '#7a4f6a', '#c07a5a', '#e8a86a', '#ffd08a',
  // the accents
  '#ffb43c', '#45e874', '#9a2b26', '#5aa9ff', '#0a0d0a',
  /*
   * AND THE LIGHT.
   *
   * The graphics reviewer, on the table above: "seven MATERIAL ramps and not
   * one LIGHT ramp, so no drawer has a lit step of paper, wood, skin or steel
   * to deposit; that is why the lamp cone has to be painted in the wall's own
   * green, why it has to stop at the dado, and why the only shadow ink in the
   * game is pure black and is therefore never used." Thirteen inks answer it,
   * and not one of them was chosen by eye: the top of a ramp mixed 45% toward
   * AMBER is what a warm lamp does to that material, the bottom mixed 45%
   * toward INK is what its own shadow does, and the third step mixed 38%
   * toward TUBE is what a cathode-ray tube does to a hand in front of it. The
   * list is longer and it is still derived, still countable and still closed.
   */
  // warm-lit: SKIN, CLOTH, PAPER, WOOD, STEEL
  '#f7c377', '#ae944b', '#f9d497', '#cc9b46', '#eaca90',
  // shadowed: the same five
  '#5b4332', '#192016', '#423d32', '#1c1710', '#181b16',
  // and what the tube does to skin, paper and steel
  '#abd28f', '#a4db9e', '#72b382',
]);

describe('the scenes are drawn in one palette', () => {
  test('every ink in scenes.js is in the table', () => {
    const found = source.match(/#[0-9a-fA-F]{6}\b/g) ?? [];
    const strays = [...new Set(found.map((c) => c.toLowerCase()))].filter((c) => !PALETTE.has(c));
    assert.deepEqual(strays, [], `ink outside the palette table: ${strays.join(', ')}`);
  });

  test('each ink is declared once and used by name after that', () => {
    const found = (source.match(/#[0-9a-fA-F]{6}\b/g) ?? []).map((c) => c.toLowerCase());
    const counts = new Map();
    for (const c of found) counts.set(c, (counts.get(c) ?? 0) + 1);
    const repeated = [...counts].filter(([, n]) => n > 1).map(([c, n]) => `${c} x${n}`);
    assert.deepEqual(repeated, [], `literal repeated instead of named: ${repeated.join(', ')}`);
  });

  test('the tunic ink the identity test pins is in the table', () => {
    // `test/identity.test.js` asserts portraitCells[PORTRAIT_H - 1][2] is this
    // colour, and the scenes draw the same tunic; CLOTH-2 is that ink.
    assert.ok(PALETTE.has('#3d4b33'));
  });
});

describe('nothing on the pixel canvas is anti-aliased', () => {
  for (const primitive of ['arc(', 'ellipse(', 'lineTo(', 'moveTo(', 'stroke(', 'fillText(', 'beginPath(']) {
    test(`no ${primitive.replace('(', '')}`, () => {
      assert.equal(source.includes(`.${primitive}`), false,
        `${primitive} on the scene canvas: draw it with px(), circlePx(), linePx() or glyphs() instead`);
    });
  }

  test('the pixel font is hand-authored, and covers every character the scenes print', () => {
    /*
     * RE-ANCHORED FROM THE 3x5 TABLE TO A REAL FACE.
     *
     * What this used to assert was that seven letters existed in a table of
     * octal digits in `scenes.js`. What it could not assert — and what the
     * graphics reviewer found — was whether those letters were the letters
     * they claimed to be: "N is '65555', which plots as a top-left corner with
     * two uprights. Readers see DAПILOV, RAПK, AППEX." The face lives in
     * `bitfont.js` now and is authored as rows of # and . precisely so that a
     * wrong letter is visible in the source.
     *
     * So this asserts the thing that actually matters instead: every character
     * the scenes can print has a glyph, checked against the strings in the
     * file rather than against a list somebody remembered to keep up to date.
     * A missing one renders as an empty box, which is visible, but a test is
     * better than a box.
     */
    const printed = [...source.matchAll(/glyphs\(\s*[A-Za-z.]+\s*,\s*'([^']*)'/g)]
      .map((m) => m[1]);
    assert.ok(printed.length > 10, 'the scenes print nothing at all?');
    const missing = new Set();
    for (const s2 of printed) {
      for (const ch of s2.toUpperCase()) if (!hasGlyph(ch)) missing.add(ch);
    }
    assert.deepEqual([...missing], [], `the face cannot set: ${[...missing].join(' ')}`);
    // and the characters the dynamic strings need: the clock, the plates and
    // the operator's own name, which is set in Cyrillic capitals
    for (const ch of [...'0123456789:·— ', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      ...'abcdefghijklmnopqrstuvwxyz', ...'АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ']) {
      assert.ok(hasGlyph(ch), `the face has no glyph for ${ch}`);
    }
  });

  test('every letter in the face is the letter it claims to be', () => {
    /*
     * The two the reviewer caught by reading the bitmaps, pinned by reading
     * them the same way: an N has a diagonal that starts at the top left and
     * finishes at the bottom right, and a K has an arm that leaves the stem.
     */
    const face = readFileSync(join(here, '..', 'src', 'ui', 'bitfont.js'), 'utf8');
    const rowsOf = (ch) => {
      const m = face.match(new RegExp(`\n  ${ch}: '\\d\\|([^']*)'`));
      assert.ok(m, `no glyph authored for ${ch}`);
      return m[1].split('/');
    };
    const n = rowsOf('N');
    assert.equal(n.length, 7, 'N is a full-height capital');
    assert.ok(n.every((r) => r[0] === '#' && r[4] === '#'), 'N has both uprights');
    const diagonal = n.map((r) => r.indexOf('#', 1)).filter((i) => i > 0 && i < 4);
    assert.ok(diagonal.length >= 2 && diagonal[0] < diagonal[diagonal.length - 1],
      'N has a diagonal that descends from left to right');
    const k = rowsOf('K');
    assert.ok(k.some((r) => r[1] === '#' || r[2] === '#'), 'K has an arm off its stem');
    assert.ok(!k.every((r) => r[4] === '#'), 'K is not an H');
  });
});

describe('the crest is cast from the same palette as the scenes', () => {
  test('every ink in crest.js is in the table', () => {
    const found = crest.match(/#[0-9a-fA-F]{6}\b/g) ?? [];
    const strays = [...new Set(found.map((c) => c.toLowerCase()))].filter((c) => !PALETTE.has(c));
    assert.deepEqual(strays, [], `ink outside the palette table: ${strays.join(', ')}`);
  });

  test('each ink is declared once and used by name after that', () => {
    const found = (crest.match(/#[0-9a-fA-F]{6}\b/g) ?? []).map((c) => c.toLowerCase());
    const counts = new Map();
    for (const c of found) counts.set(c, (counts.get(c) ?? 0) + 1);
    const repeated = [...counts].filter(([, n]) => n > 1).map(([c, n]) => `${c} x${n}`);
    assert.deepEqual(repeated, [], `literal repeated instead of named: ${repeated.join(', ')}`);
  });

  test('the device is the one on the flag in the office', () => {
    // The office draws its flag from RED with a DAWN block on it; the crest
    // has to use the same two inks or the country has two flags.
    assert.ok(crest.includes("'#9a2b26'"), 'the crest field is not the flag red');
    assert.ok(crest.includes("'#e8a86a'"), 'the crest device is not the flag gold');
    assert.match(source, /px\(ctx, wallX\(9\), 16, 14, 44, .*RED/,
      'the office flag no longer flies the red field the crest copies');
  });

  for (const primitive of ['arc(', 'ellipse(', 'lineTo(', 'moveTo(', 'stroke(', 'fillText(', 'beginPath(']) {
    test(`no ${primitive.replace('(', '')} on the crest either`, () => {
      assert.equal(crest.includes(`.${primitive}`), false,
        `${primitive} on the crest canvas: it is magnified two whole steps and would fringe`);
    });
  }

  test('it is magnified by a whole number of steps', () => {
    assert.match(crest, /CREST_SCALE = \d+;/);
    const scale = Number(crest.match(/CREST_SCALE = (\d+);/)[1]);
    assert.equal(scale, Math.round(scale));
    assert.ok(scale >= 2, 'a crest drawn at 1x is not pixel art, it is small');
  });
});

describe('short ramps are dithered rather than extended', () => {
  test('the ordered matrix is the 4x4 Bayer one', () => {
    assert.match(source, /BAYER = \[\[0, 8, 2, 10\], \[12, 4, 14, 6\], \[3, 11, 1, 9\], \[15, 7, 13, 5\]\]/);
  });

  test('at least four surfaces are dithered', () => {
    const calls = (source.match(/\bdither(Band)?\(/g) ?? []).length;
    assert.ok(calls >= 4, `only ${calls} dithered surfaces`);
  });
});
