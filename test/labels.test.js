/**
 * The lettering layer, held to the one rule that matters.
 *
 * There used to be two label engines. The cabin's reserved every symbol's
 * extent and printed anyway when every corner was taken; the plan position
 * indicator's tried four corners against other labels only and DROPPED the
 * label when all four were busy. Measured in a browser on the tree that
 * replaced them, over twelve consecutive frames: 39% of the board's names
 * silently deleted at the commander's seat on The Two Cities, 48% at the
 * district on Four Sectors, 60% on a phone — among them the presidential
 * palace, a formation the player personally directs, and the only surveillance
 * radar still alive.
 *
 * These pin the engine that replaced it. A canvas context is a handful of
 * methods and a font string, so the whole layer can be exercised without a
 * browser: what is asserted is which strings reached the context and where.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { Lettering, withAlpha } from '../src/ui/labels.js';

/** A context that remembers what was drawn on it. Six characters a glyph. */
function surface({ w = 400, h = 300, dpr = 1 } = {}) {
  const printed = [];
  const ctx = {
    font: '', textAlign: 'left', globalAlpha: 1, lineJoin: '', lineWidth: 0,
    strokeStyle: '', fillStyle: '',
    measureText: (t) => ({ width: String(t).length * 6 }),
    fillText: (t, x, y) => printed.push({ text: String(t), x, y }),
    strokeText: () => {},
    save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
  };
  const layer = new Lettering();
  Object.assign(layer, { ctx, dpr, w, h, palette: { bg: '#030a07' } });
  layer.printed = printed;
  return layer;
}

const overlap = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
  * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

describe('the label layer never deletes the board', () => {
  test('a label with nowhere to go is printed anyway', () => {
    const s = surface();
    // Every pixel of the glass is spoken for.
    s.reserved = [{ x: -1000, y: -1000, w: 4000, h: 4000 }];
    s.beginLabels();
    const box = s.place('PRESIDENTIAL PALACE', 200, 150, '#fff');
    assert.ok(box, 'the placer returned nothing');
    assert.deepEqual(s.printed.map((p) => p.text), ['PRESIDENTIAL PALACE']);
  });

  test('thirty labels on one mark all print', () => {
    const s = surface();
    s.reserved = [];
    s.beginLabels();
    for (let i = 0; i < 30; i++) s.place(`T-${String(i).padStart(3, '0')}`, 200, 150, '#fff');
    assert.equal(s.printed.length, 30);
    assert.equal(new Set(s.printed.map((p) => p.text)).size, 30);
  });

  test('only a label that asks to give way gives way', () => {
    const s = surface();
    s.reserved = [{ x: -1000, y: -1000, w: 4000, h: 4000 }];
    s.beginLabels();
    assert.equal(s.place('Mostrograd', 200, 150, '#fff', { optional: true }), null);
    assert.deepEqual(s.printed, []);
  });
});

describe('a symbol owns its pixels', () => {
  test('a reserved extent is not printed through when there is room', () => {
    const s = surface();
    s.reserved = [];
    // The mark at the centre of the glass, twenty pixels across.
    s.reserve(190, 140, 20, 20);
    s.beginLabels();
    const box = s.place('BASTION 8', 200, 150, '#fff');
    assert.equal(overlap(box, { x: 190, y: 140, w: 20, h: 20 }), 0,
      'the name was printed across the symbol it names');
  });

  test('a stamp reserves itself, so a label goes round it', () => {
    const s = surface();
    s.reserved = [];
    s.stamp('RANGE 300 KM', 10, 16, '#fff', { size: 10 });
    s.beginLabels();
    const stamped = s.reserved[0];
    const box = s.place('T-004', 14, 16, '#fff');
    assert.equal(overlap(box, stamped), 0, 'a contact was lettered through the range readout');
  });

  test('two labels on neighbouring marks do not share a box', () => {
    const s = surface();
    s.reserved = [];
    s.beginLabels();
    const a = s.place('T-001', 200, 150, '#fff');
    const b = s.place('T-002', 206, 152, '#fff');
    assert.equal(overlap(a, b), 0);
  });
});

describe('what a block of lines does', () => {
  test('every line is printed, in order, down the block', () => {
    const s = surface();
    s.reserved = [];
    s.beginLabels();
    s.place(['T-004', '065 STRIKE', '→ BASTION'], 200, 150, '#fff',
      { colours: ['#a', '#b', '#c'] });
    assert.deepEqual(s.printed.map((p) => p.text), ['T-004', '065 STRIKE', '→ BASTION']);
    assert.ok(s.printed[1].y > s.printed[0].y && s.printed[2].y > s.printed[1].y,
      'the lines of a block are not stacked downward');
    assert.equal(new Set(s.printed.map((p) => p.x)).size, 1, 'the block is not flush left');
  });

  test('a block is wide enough for its longest line', () => {
    const s = surface();
    s.reserved = [];
    s.beginLabels();
    const box = s.place(['T-004', 'A MUCH LONGER SECOND LINE'], 200, 150, '#fff');
    assert.equal(box.w, 'A MUCH LONGER SECOND LINE'.length * 6);
  });
});

describe('lettering stays on the glass and stays put', () => {
  test('a label at the right-hand edge is pulled back inside it', () => {
    const s = surface({ w: 400 });
    s.reserved = [];
    s.beginLabels();
    const box = s.place('A LONG PLACE NAME', 396, 150, '#fff');
    assert.ok(box.x + box.w <= 400, `the label ran off the tube (right edge ${box.x + box.w})`);
  });

  test('a label at the top of the glass keeps its first line', () => {
    const s = surface({ w: 400, h: 300 });
    s.reserved = [];
    s.beginLabels();
    const box = s.place(['T-004', '065 STRIKE'], 200, 3, '#fff');
    assert.ok(box.y >= 0, `the block was placed above the tube (top ${box.y})`);
    assert.ok(box.y + box.h <= 300);
  });

  test('a line longer than the glass is cut to it, with a mark', () => {
    const s = surface({ w: 120 });
    s.reserved = [];
    s.beginLabels();
    s.place('PRESIDENTIAL PALACE · PRIORITY', 60, 100, '#fff');
    const [printed] = s.printed;
    assert.ok(printed.text.endsWith('…'), `not cut: ${printed.text}`);
    assert.ok(printed.text.length * 6 <= 120, 'the cut line is still wider than the tube');
  });

  test('an unchanged picture letters itself the same way twice', () => {
    const s = surface();
    const frame = () => {
      s.reserved = [];
      s.reserve(190, 140, 20, 20);
      s.beginLabels();
      return [s.place('T-001', 200, 150, '#fff', { key: 'track:1' }),
        s.place('T-002', 240, 150, '#fff', { key: 'track:2' })];
    };
    const first = frame();
    const second = frame();
    assert.deepEqual(second.map((b) => [b.x, b.y]), first.map((b) => [b.x, b.y]),
      'the same board lettered itself differently on the next frame');
  });
});

describe('withAlpha', () => {
  test('six-digit, three-digit and rgb all come back with a channel', () => {
    assert.equal(withAlpha('#ff5b52', 0.5), 'rgba(255, 91, 82, 0.5)');
    assert.equal(withAlpha('#fff', 1), 'rgba(255, 255, 255, 1)');
    assert.equal(withAlpha('rgb(1, 2, 3)', 0.25), 'rgba(1, 2, 3, 0.25)');
  });
});
