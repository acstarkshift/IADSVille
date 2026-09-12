/**
 * The contact's menu: which batteries it offers, and what each row says.
 *
 * The player: "there should be a right click context menu that is available
 * for each target which shows a list of SAMs to which the target can be
 * assigned (including stats about range-to-target, missiles available,
 * etc.)." The list is data before it is a menu, and it is pinned here.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { World } from '../src/engine/world.js';
import { scenarioById } from '../src/engine/scenarios.js';
import { SAM_TYPES } from '../src/engine/config.js';
import { menuRowsFor, rowText } from '../src/ui/contextmenu.js';

function firstContact(id = 'first-light', { role = 'net', seconds = 120 } = {}) {
  const w = new World(scenarioById(id), { role, seed: 5 });
  for (const r of w.radars) w.setRadar(r.id, true);
  for (const s of w.sites) w.setWeaponsState(s.id, 'tight');
  let track = null;
  for (let i = 0; i < seconds * 10 && !track; i++) {
    w.step(0.1);
    track = [...w.tracks.values()].find((t) => t.hostility === 'hostile') ?? null;
  }
  assert.ok(track, 'a hostile contact appeared');
  return { w, track };
}

describe('the rows', () => {
  test('every battery is listed, the ones that can take the contact first, with the figures', () => {
    const { w, track } = firstContact();
    const rows = menuRowsFor(w, track);
    assert.equal(rows.length, w.sites.length, 'one row per battery');
    for (const r of rows) {
      assert.ok(typeof r.name === 'string' && r.name.length);
      assert.ok(Number.isInteger(r.rangeKm) && r.rangeKm >= 0, 'range to target');
      assert.ok(r.toRangeS === null || r.toRangeS === Infinity || r.toRangeS >= 0, 'time to in-range');
      assert.ok(Number.isInteger(r.rails) && Number.isInteger(r.store), 'rounds on the rails and in store');
      assert.ok(r.pk === null || (r.pk >= 0 && r.pk <= 1), 'an estimate of the shot, or none');
      assert.equal(typeof r.mine, 'boolean', 'whether it answers to you');
      assert.equal(r.reachKm, SAM_TYPES[w.siteById.get(r.siteId).type].maxRangeKm);
      if (!r.can && !r.already) assert.ok(r.reason, `${r.name} says why it cannot: ${r.reason}`);
    }
    const firstDead = rows.findIndex((r) => !r.can && !r.already);
    const lastLive = rows.map((r) => r.can || r.already).lastIndexOf(true);
    assert.ok(firstDead === -1 || lastLive < firstDead, 'the batteries that can take it come first');
    // On First Light the first contact is far out: the battalion reaches it, the sections do not yet.
    const bastion = rows.find((r) => r.name === 'BASTION');
    assert.ok(bastion.can, `the battalion can take the first contact: ${bastion.reason ?? 'yes'}`);
    assert.ok(rows.filter((r) => !r.can).length >= 1, 'and at least one section cannot, yet');
  });

  test('a row reads as words a person can act on', () => {
    const { w, track } = firstContact();
    const rows = menuRowsFor(w, track);
    const bastion = rows.find((r) => r.name === 'BASTION');
    const t = rowText(bastion);
    assert.match(t.when, /^(IN RANGE|IN RANGE IN \d+ s|NO COURSE YET)$/);
    assert.match(t.range, /^\d+ km$/);
    assert.match(t.rounds, /^\d+ on the rails · \d+ in store$/);
    assert.match(t.pk, /^(—|\d+%)$/);
    assert.equal(t.command, 'under your command');
    assert.equal(t.note, 'Pick to hand it over.');
    const dead = rows.find((r) => !r.can && !r.already);
    assert.match(rowText(dead).note, /^Cannot take it: /);
  });

  test('the battery a contact is already on offers to release it', () => {
    const { w, track } = firstContact();
    const bastion = w.sites.find((s) => s.name === 'BASTION');
    assert.ok(w.assign(track.id, bastion.id), 'the handover is accepted');
    const rows = menuRowsFor(w, track);
    assert.equal(rows[0].siteId, bastion.id, 'the holder is listed first');
    assert.equal(rows[0].already, true);
    assert.equal(rowText(rows[0]).when, 'ON IT');
    assert.equal(rowText(rows[0]).note, 'Pick to release it.');
  });

  test('a battery outside your command says so, and is not offered', () => {
    const { w, track } = firstContact('four-sectors', { seconds: 240 });
    const rows = menuRowsFor(w, track);
    const theirs = rows.filter((r) => !r.mine);
    assert.ok(theirs.length >= 1, 'a district watch has batteries on somebody else’s net');
    for (const r of theirs) {
      assert.equal(r.can, false);
      assert.match(r.reason, /not under your command/);
      assert.equal(rowText(r).command, 'not yours to order');
    }
  });
});
