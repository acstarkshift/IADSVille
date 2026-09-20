/**
 * The two sets a long-range battalion runs, and the arc one of them lives in.
 *
 * A battalion searches with an acquisition set that turns through the circle
 * and guides with a fire-control set on a mount covering a hundred and twenty
 * degrees at five degrees a second. Nothing is guided that the mount is not
 * pointing at, so which way it points is a decision — and these tests pin the
 * decision's cost, because a constraint that quietly stops biting is worse
 * than no constraint at all.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/engine/world.js';
import { SEARCH } from '../src/engine/config.js';
import { scenarioById } from '../src/engine/scenarios.js';
import { fcRadarOf, fcBearsOn, stepFireControl } from '../src/engine/doctrine.js';
import { effectiveRangeKm, sweepRadar } from '../src/engine/detection.js';
import { absDeltaDeg } from '../src/engine/math.js';
import { makeRng } from '../src/engine/rng.js';

/** A minimal track object at a bearing and range from a point. */
function trackAt(from, bearingDeg, rangeKm, extra = {}) {
  const rad = (90 - bearingDeg) * Math.PI / 180;
  return {
    id: `t_${bearingDeg}`,
    tn: `T-${bearingDeg}`,
    pos: { x: from.x + Math.cos(rad) * rangeKm, y: from.y + Math.sin(rad) * rangeKm },
    vel: { x: 0, y: 0 },
    altM: 6000,
    quality: 1,
    threat: 10,
    hostility: 'hostile',
    destroyed: false,
    sources: [],
    assignedTo: [],
    engagedBy: [],
    ...extra,
  };
}

/**
 * THE SEAT'S SECOND VERB.
 *
 * The balance critic on the first hour of the campaign: "a two-state skill
 * model: you touched the button or you did not. There is nothing above
 * 'competent' to reach for, and on the teaching watch there is nothing below
 * it either" — at sixteen seeds the expert and the competent operator
 * produced BYTE-IDENTICAL runs on both radar watches, nought of thirty-two
 * paired seeds separating them.
 *
 * So a surveillance set can be held on a bearing: sixty degrees, rastered,
 * which is six crossings for every one the circle gives — and nothing outside
 * the sector is looked at at all while that is true.
 */
describe('the set can be pointed, and that is the seat\'s resource', () => {
  const searchSet = (w) => w.radars.find((r) => r.alive && !r.siteId);

  test('holding a sector narrows the beam and starts it at the edge', () => {
    const w = new World(scenarioById('low-riders'), { role: 'radar', seed: 'stare-1' });
    const set = searchSet(w);
    assert.equal(set.fovDeg, null, 'a surveillance set turns through the circle');
    assert.equal(w.isStaring(set), false);
    assert.equal(w.setRadarSector(set.id, 340), true);
    assert.equal(set.fovDeg, SEARCH.stareFovDeg);
    assert.equal(set.boresightDeg, 340);
    assert.equal(Math.round(set.az), Math.round(340 - SEARCH.stareFovDeg / 2),
      'the first pass is a whole pass, not the remainder of wherever the circle had got to');
    assert.ok(w.events.some((e) => /HOLDING 340/.test(e.text)), 'and it is said');
    assert.equal(w.isStaring(set), true);
    assert.equal(w.setRadarSector(set.id, null), true);
    assert.equal(set.fovDeg, null, 'and the circle can be given back');
    assert.equal(w.isStaring(set), false);
  });

  test('a switch that does not move says nothing', () => {
    const w = new World(scenarioById('low-riders'), { role: 'radar', seed: 'stare-2' });
    const set = searchSet(w);
    assert.equal(w.setRadarSector(set.id, null), false, 'already all round');
    w.setRadarSector(set.id, 100);
    assert.equal(w.setRadarSector(set.id, 100), false, 'already on that bearing');
  });

  test('a battery\'s own set is not the sector\'s to point', () => {
    const w = new World(scenarioById('low-riders'), { role: 'radar', seed: 'stare-3' });
    const own = w.radars.find((r) => r.siteId);
    assert.ok(own, 'the batteries have their own antennas');
    assert.equal(w.setRadarSector(own.id, 200), false,
      'a fire-control set already holds a boresight and its pointing is the crew\'s');
  });

  /*
   * THE THING THE VERB IS FOR, COUNTED.
   *
   * The whole claim the control makes — to the player in the tutorial card, in
   * the handbook and on the cap's own tooltip — is "six looks for every one,
   * and nothing outside the sector is swept". A control whose price is a
   * sentence nobody checks is a control that quietly stops costing anything,
   * so the sentence is counted here rather than described.
   *
   * Ten minutes of watch, one contact 020 and one 200, the same set and the
   * same rolls: all round paints each of them 50 times (600 s over a 12 s
   * turn); held on 020 it paints the first 300 times and the second never.
   * Exactly six, because the sector is a sixth of the circle and the beam
   * still runs at the set's own rate. If `stareFovDeg` moves, the ratio moves
   * with it and this test says so.
   */
  test('the sector is six looks for one, and nothing outside it is looked at at all', () => {
    const at = (from, bDeg, km) => {
      const rad = (90 - bDeg) * Math.PI / 180;
      return { x: from.x + Math.cos(rad) * km, y: from.y + Math.sin(rad) * km };
    };
    const look = (hold) => {
      const w = new World(scenarioById('low-riders'), { role: 'radar', seed: 'stare-4' });
      const set = searchSet(w);
      set.on = true;
      set.state = 'radiating';
      const targets = [
        { id: 'ahead', alive: true, type: 'striker', rcs: 5, altM: 4000, jamming: false,
          pos: at(set.pos, 20, 60) },
        { id: 'abeam', alive: true, type: 'striker', rcs: 5, altM: 4000, jamming: false,
          pos: at(set.pos, 200, 60) },
      ];
      if (hold !== null) assert.equal(w.setRadarSector(set.id, hold), true);
      const rng = makeRng('sector');
      const counts = { ahead: 0, abeam: 0 };
      for (let i = 0; i < 6000; i++) {
        for (const plot of sweepRadar(set, targets, [], rng, 0.1)) counts[plot.truthId]++;
      }
      return counts;
    };

    const sweeping = look(null);
    assert.equal(sweeping.ahead, 50, 'the circle is one look every twelve seconds');
    assert.equal(sweeping.abeam, 50, 'and it is the same look for everything in the sky');

    const held = look(20);
    assert.equal(held.abeam, 0,
      'nothing outside the sector is looked at at all — that is the price');
    assert.equal(held.ahead, sweeping.ahead * (360 / SEARCH.stareFovDeg),
      `a contact in the sector is painted ${360 / SEARCH.stareFovDeg} times as often`);
  });
});

describe('the battalion has two sets', () => {
  test('long-range batteries carry an acquisition set and a sectored fire-control set', () => {
    const w = new World(scenarioById('economy-of-force'), { role: 'net', seed: 'two-sets' });
    const bastion = w.sites.find((s) => s.type === 'bastion');
    const sets = w.radarsOf(bastion);
    assert.equal(sets.length, 2, 'a battalion runs two antennas');
    const acq = w.radarById.get(bastion.radarId);
    const fc = w.radarById.get(bastion.fcRadarId);
    assert.notEqual(acq.id, fc.id, 'search and guidance are different machines');
    assert.equal(acq.fovDeg, null, 'the acquisition set turns through the circle');
    assert.equal(fc.fovDeg, 120);
    assert.equal(fc.slewRateDegPerS, 5);
    assert.ok(fc.rangeKm >= 120, 'the guidance set must reach as far as the rounds do');
  });

  test('every other class keeps its single omnidirectional set', () => {
    const w = new World(scenarioById('economy-of-force'), { role: 'net', seed: 'one-set' });
    for (const site of w.sites) {
      if (site.type === 'bastion') continue;
      assert.equal(w.radarsOf(site).length, 1, `${site.name} should run one set`);
      assert.equal(site.fcRadarId, site.radarId);
      assert.equal(fcBearsOn(w, site, trackAt(site.pos, 180, 20)), true,
        'an omnidirectional set always bears');
    }
  });

  test('one switch still runs the whole battery', () => {
    const w = new World(scenarioById('economy-of-force'), { role: 'net', seed: 'switch' });
    const bastion = w.sites.find((s) => s.type === 'bastion');
    w.setRadar(bastion.radarId, true);
    assert.ok(w.radarsOf(bastion).every((r) => r.on),
      'radiating the battery brings both antennas up');
    w.setRadar(bastion.fcRadarId, false);
    assert.ok(w.radarsOf(bastion).every((r) => !r.on),
      'and silencing it takes both down — ducking with one is not ducking');
  });
});

describe('the arc is a real constraint', () => {
  test('a contact behind the antenna is neither seen nor guided on', () => {
    const w = new World(scenarioById('economy-of-force'), { role: 'net', seed: 'arc' });
    const bastion = w.sites.find((s) => s.type === 'bastion');
    const fc = fcRadarOf(w, bastion);
    fc.boresightDeg = 0;

    const ahead = trackAt(fc.pos, 10, 60);
    const behind = trackAt(fc.pos, 180, 60);
    assert.equal(fcBearsOn(w, bastion, ahead), true);
    assert.equal(fcBearsOn(w, bastion, behind), false);

    // And the detection model agrees: outside the arc the set is simply blind.
    assert.ok(effectiveRangeKm(fc, { pos: ahead.pos, altM: 6000, rcs: 5 }) > 0);
    assert.equal(effectiveRangeKm(fc, { pos: behind.pos, altM: 6000, rcs: 5 }), 0);
  });

  test('the mount traverses at five degrees a second and no faster', () => {
    const w = new World(scenarioById('economy-of-force'), { role: 'net', seed: 'slew' });
    const bastion = w.sites.find((s) => s.type === 'bastion');
    const fc = fcRadarOf(w, bastion);
    fc.boresightDeg = 0;
    const target = trackAt(fc.pos, 90, 60);
    w.tracks.set(target.id, target);

    let t = 0;
    while (absDeltaDeg(fc.boresightDeg, 90) > 1 && t < 120) { stepFireControl(w, 0.1); t += 0.1; }
    // Ninety degrees at five a second is eighteen; allow the last degree.
    assert.ok(t > 16 && t < 20, `a 90° traverse took ${t.toFixed(1)}s, expected ~18s`);
  });

  test('the crew covers both targets when they fit, and the worst when they do not', () => {
    const w = new World(scenarioById('economy-of-force'), { role: 'net', seed: 'cover' });
    const bastion = w.sites.find((s) => s.type === 'bastion');
    const fc = fcRadarOf(w, bastion);

    // Two contacts eighty degrees apart: inside a 120° arc, so one boresight
    // holds both, and it sits between them.
    const a = trackAt(fc.pos, 20, 60, { id: 'a', threat: 10 });
    const b = trackAt(fc.pos, 100, 60, { id: 'b', threat: 10 });
    w.tracks.set('a', a);
    w.tracks.set('b', b);
    bastion.engagements = [{ trackId: 'a' }, { trackId: 'b' }];
    fc.boresightDeg = 60;
    for (let i = 0; i < 400; i++) stepFireControl(w, 0.1);
    assert.ok(fcBearsOn(w, bastion, a) && fcBearsOn(w, bastion, b),
      `both should be inside the arc, boresight ended at ${Math.round(fc.boresightDeg)}`);

    // Move one to a hundred and eighty degrees away and make it the urgent
    // one: the crew takes the threat and the other waits.
    const far = trackAt(fc.pos, 220, 60, { id: 'b', threat: 99 });
    w.tracks.set('b', far);
    bastion.engagements = [{ trackId: 'a' }, { trackId: 'b' }];
    for (let i = 0; i < 900; i++) stepFireControl(w, 0.1);
    assert.equal(fcBearsOn(w, bastion, far), true, 'the urgent one is covered');
    assert.equal(fcBearsOn(w, bastion, a), false, 'and the other one is not — that is the cost');
  });

  test('a sectored set still detects: it rasters inside its wedge', () => {
    const w = new World(scenarioById('economy-of-force'), { role: 'net', seed: 'raster' });
    const bastion = w.sites.find((s) => s.type === 'bastion');
    const fc = fcRadarOf(w, bastion);
    fc.boresightDeg = 0;
    fc.on = true;
    fc.state = 'radiating';

    const target = {
      id: 'air1', alive: true, type: 'striker', rcs: 5, altM: 6000,
      pos: trackAt(fc.pos, 15, 40).pos, jamming: false,
    };
    const rng = makeRng('raster');
    let plots = 0;
    for (let i = 0; i < 600; i++) plots += sweepRadar(fc, [target], [], rng, 0.1).length;
    assert.ok(plots > 0, 'a parked sectored set must still paint what is in front of it');

    // And nothing behind it, however long it looks.
    const behind = { ...target, id: 'air2', pos: trackAt(fc.pos, 200, 40).pos };
    let blind = 0;
    for (let i = 0; i < 600; i++) blind += sweepRadar(fc, [behind], [], rng, 0.1).length;
    assert.equal(blind, 0);
  });

  test('the sequence waits for the antenna, and the wait is the arc', () => {
    const w = new World(scenarioById('economy-of-force'), { role: 'net', seed: 'wait' });
    w.control.netIsHuman = true;
    const bastion = w.sites.find((s) => s.type === 'bastion');
    const fc = fcRadarOf(w, bastion);
    for (const r of w.radarsOf(bastion)) { r.on = true; r.state = 'radiating'; }

    const behind = trackAt(fc.pos, 180, 60, { id: 'behind' });
    w.tracks.set('behind', behind);
    fc.boresightDeg = 0;

    const engagement = w.assign('behind', bastion.id);
    assert.ok(engagement, 'the order is accepted — the battery can reach it');
    const startedAt = engagement.timerS;
    // A few seconds pass with the antenna still coming round: the reaction
    // sequence has not started, because the crew has nothing to look at yet.
    for (let i = 0; i < 30; i++) stepFireControl(w, 0.1);
    assert.equal(engagement.timerS, startedAt,
      'the reaction timer must not run while the mount is still traversing');
  });
});
