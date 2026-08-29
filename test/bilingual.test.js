/**
 * Nothing on this console speaks only Cyrillic.
 *
 * The rule is that every Cyrillic string a player can see carries its English
 * counterpart *beside* it — not in a tooltip, not on hover, beside it. Export
 * equipment is genuinely stencilled that way, and it means somebody who cannot
 * read the Cyrillic never has to guess what a switch does, what a lamp is
 * telling them, or what a place is called.
 *
 * This test walks the data the interface is built from and fails on any entry
 * that has Cyrillic without a gloss, so the rule survives the next person who
 * adds a control.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { STATE, CONTROLS, STATUS, EQUIPMENT, PLATES, pair, pairHtml, legendText } from '../src/ui/lexicon.js';
import { RANKS, BACKGROUNDS, SKILLS, DECORATIONS, DISTRICTS } from '../src/engine/character.js';
import { DEFENCE_CLASSES } from '../src/engine/config.js';
import { MAP } from '../src/engine/geography.js';
import { ENDINGS } from '../src/engine/endings.js';
import { FLIGHT_ENDINGS } from '../src/engine/epilogue.js';
import { REVELATIONS } from '../src/engine/revelations.js';

const CYRILLIC = /[Ѐ-ӿ]/;
const hasCyrillic = (v) => typeof v === 'string' && CYRILLIC.test(v);

/** Every entry in a table must pair its Cyrillic with an English field. */
function assertPaired(table, label, glossKeys = ['en']) {
  for (const [key, entry] of Object.entries(table)) {
    const cyrillicFields = Object.entries(entry)
      .filter(([, v]) => hasCyrillic(v))
      .map(([k]) => k);
    if (cyrillicFields.length === 0) continue;
    const gloss = glossKeys.find((g) => typeof entry[g] === 'string' && entry[g].length > 0);
    assert.ok(gloss, `${label}.${key} has Cyrillic (${cyrillicFields.join(', ')}) with no English`);
    assert.ok(!CYRILLIC.test(entry[gloss]),
      `${label}.${key}.${gloss} should be the English counterpart, not more Cyrillic`);
  }
}

describe('the nomenclature tables', () => {
  test('the state, its controls and its status legends are all paired', () => {
    assertPaired(STATE, 'STATE');
    assertPaired(CONTROLS, 'CONTROLS');
    assertPaired(STATUS, 'STATUS');
    assertPaired(EQUIPMENT, 'EQUIPMENT');
    assertPaired(PLATES, 'PLATES');
  });

  test('every plate — including the type and works numbers — carries a gloss', () => {
    for (const [key, plate] of Object.entries(PLATES)) {
      assert.ok(plate.tm && plate.en, `PLATES.${key} needs both`);
    }
  });
});

describe('the service record', () => {
  test('ranks, backgrounds, qualifications and decorations are paired', () => {
    assertPaired(Object.fromEntries(RANKS.map((r) => [r.id, r])), 'RANKS');
    assertPaired(BACKGROUNDS, 'BACKGROUNDS');
    assertPaired(SKILLS, 'SKILLS');
    assertPaired(DECORATIONS, 'DECORATIONS');
    assertPaired(Object.fromEntries(DISTRICTS.map((d) => [d.id, d])), 'DISTRICTS');
  });

  test('the four classes of air defence are paired', () => {
    assertPaired(DEFENCE_CLASSES, 'DEFENCE_CLASSES');
  });
});

describe('the country', () => {
  test('every named feature on the map has an English name', () => {
    const named = [
      ...MAP.rivers, ...MAP.highGround, ...MAP.lakes, ...MAP.roads, ...MAP.settlements,
    ];
    for (const feature of named) {
      assert.ok(hasCyrillic(feature.name), `${feature.en} should have a Trans-Mordovian name`);
      assert.ok(feature.en && !CYRILLIC.test(feature.en),
        `${feature.name} has no English counterpart`);
    }
  });
});

describe('the narrative tables', () => {
  test('endings pair their Cyrillic title with an English subtitle', () => {
    for (const [id, ending] of Object.entries(ENDINGS)) {
      assert.ok(hasCyrillic(ending.title), `${id} should have a Trans-Mordovian title`);
      assert.ok(ending.subtitle && !CYRILLIC.test(ending.subtitle), `${id} needs an English subtitle`);
      assert.ok(ending.plainTitle && !CYRILLIC.test(ending.plainTitle),
        `${id} needs a plain title for the pressure-off setting`);
    }
  });

  test('the epilogue endings pair theirs the same way', () => {
    for (const [id, ending] of Object.entries(FLIGHT_ENDINGS)) {
      assert.ok(hasCyrillic(ending.title), `${id} should have a Trans-Mordovian title`);
      assert.ok(ending.subtitle && !CYRILLIC.test(ending.subtitle), `${id} needs an English subtitle`);
      assert.ok(ending.plainTitle && !CYRILLIC.test(ending.plainTitle),
        `${id} needs a plain title for the pressure-off setting`);
    }
  });

  test('revelations pair their heading', () => {
    for (const [id, revelation] of Object.entries(REVELATIONS)) {
      assert.ok(hasCyrillic(revelation.tm), `${id} should have a Trans-Mordovian heading`);
      assert.ok(revelation.title && !CYRILLIC.test(revelation.title), `${id} needs an English heading`);
    }
  });

  test('the prose itself is in English throughout', () => {
    // The documents are read, not glanced at. They are written in English so
    // they can be, with Cyrillic reserved for the things stencilled on hardware.
    for (const [id, revelation] of Object.entries(REVELATIONS)) {
      for (const line of revelation.lines) {
        assert.ok(!CYRILLIC.test(line), `${id} prose should be readable: "${line.slice(0, 40)}"`);
      }
    }
  });
});

describe('the pairing helpers', () => {
  test('pair renders both halves, from an entry or from two strings', () => {
    assert.equal(pair(CONTROLS.radiate), 'ИЗЛУЧЕНЬ · RADIATE');
    assert.equal(pair('ЗАЛП', 'SALVO'), 'ЗАЛП · SALVO');
    assert.equal(pair('ЗАЛП'), 'ЗАЛП');
    assert.equal(pair(null), '');
  });

  test('pairHtml puts the gloss under the stencil and escapes both', () => {
    const html = pairHtml({ tm: 'ПУСК', en: 'LAUNCH' });
    assert.match(html, /<b>ПУСК<\/b>/);
    assert.match(html, /<i>LAUNCH<\/i>/);
    assert.match(pairHtml({ tm: 'X', en: '<b>' }), /&lt;b&gt;/);
  });

  test('legendText keeps both halves for canvas and tooltips', () => {
    assert.match(legendText(STATUS.armWarning), /ОБЛУЧЕНЬЕ · INBOUND ARM/);
  });
});

describe('the interface source', () => {
  /**
   * A blunt backstop: no Cyrillic literal may be emitted into markup without
   * some English on the same line. It cannot catch everything, but it does catch
   * the common mistake of dropping a bare `.tm` into a template.
   */
  test('no template line emits Cyrillic without any Latin text beside it', () => {
    const offenders = [];
    for (const file of readdirSync('src/ui').filter((f) => f.endsWith('.js'))) {
      const source = readFileSync(`src/ui/${file}`, 'utf8');
      source.split('\n').forEach((line, i) => {
        const code = line.replace(/^\s*(\/\/|\*).*$/, '');
        if (!CYRILLIC.test(code)) return;
        // A line that also carries Latin letters is presumed to be paired,
        // labelled, or a lookup key; a line of pure Cyrillic markup is not.
        if (/[A-Za-z]/.test(code)) return;
        offenders.push(`${file}:${i + 1}  ${line.trim()}`);
      });
    }
    assert.deepEqual(offenders, [], `unpaired Cyrillic:\n${offenders.join('\n')}`);
  });
});
