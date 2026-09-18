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

  test('the pixel font is hand-authored, and covers what the scenes print', () => {
    for (const ch of ['R', 'E', 'A', 'D', 'Y', '0', '5']) {
      assert.match(source, new RegExp(`\\b${ch}: '\\d{5}'`), `the 3x5 font has no glyph for ${ch}`);
    }
    // and the colon, which the hour on the panel counter needs
    assert.match(source, /':': '\d{5}'/);
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
