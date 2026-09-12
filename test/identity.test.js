/**
 * Who you are, on the card and on the file.
 *
 * The player: "Generate distinct rank insignias for use throughout the game.
 * Replace the garbage looking console boxes with something that looks like a
 * military ID card placed in the console that reads the rank and title of the
 * user" — and, of the first attempt, "it looks like an Atari cartridge. It
 * should look more like this", with a photograph of a white smart card pushed
 * halfway into a black card reader. The card's face, its photograph, its
 * number and its insignia are data before they are pixels, so they are pinned
 * here without a browser.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { RANKS, createCharacter, serviceNumber } from '../src/engine/character.js';
import { ECHELONS } from '../src/engine/echelon.js';
import { rankInsignia, rankBadge } from '../src/ui/insignia.js';
import { portraitCells, portraitFeatures, PORTRAIT_W, PORTRAIT_H } from '../src/ui/portrait.js';
import { idCardHtml } from '../src/ui/panels.js';

const count = (s, re) => (s.match(re) || []).length;
const sameBoard = (svg) => svg.replace(/rk\d+/g, 'rk');

describe('rank insignia', () => {
  test('sixteen ranks, sixteen different boards', () => {
    const boards = new Set(RANKS.map((_, i) => sameBoard(rankInsignia(i))));
    assert.equal(boards.size, RANKS.length);
  });

  test('bars for the enlisted, stripes and stars for the commissioned, braid for the generals', () => {
    const bars = (i) => count(rankInsignia(i), /rx="\.4"/g);
    const stars = (i) => count(rankInsignia(i), /<polygon/g);
    assert.equal(bars(0), 0, 'a recruit has earned no bar');
    assert.equal(bars(1), 1); assert.equal(bars(5), 5);
    assert.equal(stars(5), 0, 'no stars below a commission');
    assert.equal(stars(6), 0, 'a warrant officer has the stripe and no star');
    assert.match(rankInsignia(6), /height="26"/, 'the longitudinal stripe');
    assert.equal(stars(7), 1); assert.equal(stars(10), 4, 'a captain: four small stars');
    assert.equal(stars(11), 1); assert.equal(stars(13), 3, 'a colonel: three');
    assert.equal(stars(14), 1); assert.equal(stars(15), 2, 'a lieutenant general: two large');
    assert.match(rankInsignia(14), /l4\.5 2\.2/, 'a general officer’s board is braided');
    assert.doesNotMatch(rankInsignia(3), /l4\.5 2\.2/);
  });

  test('a board scales to where it is printed, and can name its rank', () => {
    assert.match(rankInsignia(4, { size: 40 }), /height="40"/);
    assert.match(rankInsignia(4, { size: 40 }), /width="28"/);
    assert.match(rankInsignia(4, { title: 'Sergeant' }), /aria-label="Sergeant"/);
    assert.match(rankBadge(4), /Sergeant/);
    assert.match(rankBadge(4), /<svg/);
  });

  test('the board keeps its own colours on every theme', () => {
    // Cloth, brass and enamel: no theme token, so it does not turn green
    // because the tube did.
    for (let i = 0; i < RANKS.length; i++) assert.doesNotMatch(rankInsignia(i), /var\(--/);
  });
});

describe('the photograph', () => {
  const names = ['Вук Тавров', 'Ясна Ленко', 'Огнян Брасов', 'Лада Тавров', 'Тихомир Раду',
    'Веся Матич', 'Мила Ковач', 'Данко Гарин', 'Ирина Дулов', 'Сава Волох', 'Нада Ясень', 'Боян Кубин'];

  test('a name always gets the same face', () => {
    assert.deepEqual(portraitCells('Вук Тавров'), portraitCells('Вук Тавров'));
    assert.deepEqual(portraitFeatures('Ясна Ленко'), portraitFeatures('Ясна Ленко'));
  });

  test('two names never share one by accident', () => {
    for (let a = 0; a < names.length; a++) {
      for (let b = a + 1; b < names.length; b++) {
        const ca = portraitCells(names[a]);
        const cb = portraitCells(names[b]);
        let differ = 0;
        for (let y = 0; y < PORTRAIT_H; y++) for (let x = 0; x < PORTRAIT_W; x++) if (ca[y][x] !== cb[y][x]) differ++;
        assert.ok(differ >= 20, `${names[a]} and ${names[b]} differ in ${differ} cells`);
      }
    }
  });

  test('the picture is the size the card expects, and every cell is a colour', () => {
    const cells = portraitCells('Веся Матич');
    assert.equal(cells.length, PORTRAIT_H);
    for (const row of cells) {
      assert.equal(row.length, PORTRAIT_W);
      for (const c of row) assert.match(c, /^#[0-9a-f]{6}$/);
    }
    // A tunic under every face: the bottom row is cloth, not backdrop.
    assert.equal(cells[PORTRAIT_H - 1][2], '#3d4b33');
  });
});

describe('the identity card', () => {
  test('the number on the card is the name’s, and does not change with the watches stood', () => {
    const c = createCharacter({ name: 'Ясна Ленко' });
    const n = serviceNumber(c);
    assert.match(n, /^\d{4}-\d{2}-Б$/);
    c.watches = 7; c.rankIndex = 4;
    assert.equal(serviceNumber(c), n);
    assert.notEqual(n, serviceNumber(createCharacter({ name: 'Вук Тавров' })));
  });

  test('the face reads surname first, then the rank with its board, the appointment and the number', () => {
    const c = createCharacter({ name: 'Ясна Ленко' });
    c.rankIndex = 9;
    const html = idCardHtml(c, ECHELONS.sector);
    assert.match(html, /ЛЕНКО, ЯСНА/, 'SURNAME, GIVEN NAME');
    assert.match(html, /SENIOR LIEUTENANT/);
    assert.match(html, /SECTOR COMMANDER/);
    assert.match(html, /SERVICE NO\. \d{4}-\d{2}-Б/);
    assert.match(html, /class="rank-board"/, 'the insignia is printed beside the rank');
    assert.match(html, /idc-photo/, 'and there is a photograph');
    // Nothing the operator reads to know who they are is in Cyrillic except
    // their own name and the service's stencil on the band.
    assert.match(html, /AIR DEFENCE FORCES · IDENTITY/);
  });

  test('a one-word name is printed as it is', () => {
    const c = createCharacter({ name: 'Радо' });
    assert.match(idCardHtml(c, ECHELONS.battalion), /idc-name">РАДО</);
  });
});
