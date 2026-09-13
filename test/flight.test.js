/**
 * How a round flies, in the vertical.
 *
 * A surface-to-air missile does not travel to its target at the height of its
 * target. These pin the two shapes the game claims to draw — a lofted arc from
 * a battalion, a straight climb from a point-defence section — and the rule
 * that keeps both honest: nothing climbs at an angle it could not hold.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createMissile, stepMissiles } from '../src/engine/weapons.js';
import { SAM_TYPES, FLIGHT, ENGAGEMENT } from '../src/engine/config.js';

/**
 * Fly one round and record what it did. A bare world: enough of the shape for
 * the missile step, nothing else, so the profile is measured on its own.
 */
function fly({ siteType = 'bastion', rangeKm = 100, targetAltM = 9000,
  closingKmS = -0.22, turnAwayAtS = null, steps = 4000 } = {}) {
  const type = SAM_TYPES[siteType];
  const site = { id: 's1', type: siteType, alive: true, pos: { x: 0, y: 0 } };
  const radar = { id: 'r1', pos: site.pos, state: 'radiating', alive: true };
  const target = {
    id: 'a1', alive: true, type: 'striker', pos: { x: 0, y: rangeKm }, altM: targetAltM,
    vel: { x: 0, y: closingKmS }, evadingUntilS: -1, worldTimeS: 0,
  };
  const world = {
    t: 0, dt: 0.1, missiles: [], effects: [],
    aircraftById: new Map([[target.id, target]]),
    siteById: new Map([[site.id, site]]),
    radarById: new Map([[radar.id, radar]]),
    assetById: new Map(),
    rng: { chance: () => false },
    difficulty: {},
    stats: {},
    killMissile(m, why) { m.alive = false; m.why = why; },
    killAircraft() {},
    log() {}, comms() {}, onMissileMiss() {}, markTracksDown() {},
  };
  const missile = createMissile({
    seq: 1, kind: 'sam', pos: site.pos, altM: 20, speed: type.missileSpeed,
    hdg: 0, targetKind: 'aircraft', targetId: target.id,
    siteId: site.id, radarId: radar.id,
  });
  missile.launchRangeKm = rangeKm;
  world.missiles.push(missile);

  const series = [];
  for (let i = 0; i < steps && missile.alive; i++) {
    if (turnAwayAtS != null && world.t >= turnAwayAtS) target.vel.y = 0.24;
    target.pos.y += target.vel.y * world.dt;
    world.t += world.dt;
    stepMissiles(world, world.dt);
    if (!missile.alive) break;
    series.push({
      t: world.t,
      km: Math.hypot(missile.pos.x, missile.pos.y),
      altM: missile.altM,
      f: missile.arcF,
    });
  }
  const apex = series.reduce((a, b) => (b.altM > a.altM ? b : a), series[0]);
  return { series, apex, last: series[series.length - 1], missile, target, type };
}

describe('the vertical profile of a round', () => {
  test('every class of battery has a profile to fly', () => {
    for (const type of Object.values(SAM_TYPES)) {
      assert.ok(FLIGHT[type.class], `${type.label} has no flight profile for class ${type.class}`);
    }
  });

  test('a battalion round is lofted: it tops out far above both ends of its flight', () => {
    const { apex, series } = fly({ siteType: 'bastion', rangeKm: 100, targetAltM: 9000 });
    assert.ok(apex.altM > 14000, `apex ${Math.round(apex.altM)} m is not a loft`);
    assert.ok(apex.altM > 9000 * 1.5, 'the apex is well above the target it is shot at');
    // And the top of the arc is behind it by the time it arrives.
    assert.ok(apex.f < 0.75, `the apex sits at ${(apex.f * 100).toFixed(0)}% of the run, too late for a loft`);
    // It really comes down again, rather than arriving high.
    const arrival = series[series.length - 1];
    assert.ok(arrival.altM < apex.altM - 6000, 'the round descends onto the target');
  });

  test('a battalion round shot close in lofts less, in proportion', () => {
    const far = fly({ siteType: 'bastion', rangeKm: 100, targetAltM: 9000 }).apex.altM;
    const near = fly({ siteType: 'bastion', rangeKm: 25, targetAltM: 3000 }).apex.altM;
    assert.ok(near < far / 2.5, `a 25 km shot tops out at ${Math.round(near)} m against ${Math.round(far)} m at 100 km`);
  });

  test('a point-defence round climbs straight at its target and never above it', () => {
    const { series, apex, target } = fly({ siteType: 'thistle', rangeKm: 10, targetAltM: 900, closingKmS: -0.18 });
    assert.ok(apex.altM <= target.altM + 5, `it tops out at ${Math.round(apex.altM)} m for a target at ${target.altM} m`);
    // Direct ascent: the height only ever goes up, all the way in.
    for (let i = 1; i < series.length; i++) {
      assert.ok(series[i].altM >= series[i - 1].altM - 1e-9,
        `the climb reverses at ${series[i].t.toFixed(1)} s`);
    }
    assert.ok(apex.f > 0.9, 'the highest point of a direct ascent is the end of it');
  });

  test('a gun section lays its shells on a flat arc', () => {
    const { apex, target } = fly({ siteType: 'hammer', rangeKm: 3.5, targetAltM: 600, closingKmS: -0.16 });
    assert.ok(apex.altM < target.altM * 1.2, 'a shell does not loft');
  });

  test('a round arrives at the height of what it is shooting at', () => {
    for (const [siteType, rangeKm, targetAltM] of [
      ['bastion', 100, 9000], ['bastion', 40, 12000], ['lance', 35, 7000],
      ['thistle', 10, 900], ['hammer', 3.5, 600],
    ]) {
      const { last, target } = fly({ siteType, rangeKm, targetAltM });
      const gap = Math.abs(last.altM - target.altM);
      // Within the radius the round would fuze at: it detonates beside the
      // aeroplane, not a kilometre under it.
      assert.ok(gap <= ENGAGEMENT.lethalRadiusKm * 1000,
        `${siteType} at ${rangeKm} km arrives ${Math.round(gap)} m off the target's height`);
    }
  });

  test('nothing climbs at an angle it could not hold', () => {
    for (const [siteType, rangeKm, targetAltM] of [
      ['bastion', 100, 9000], ['bastion', 20, 15000], ['lance', 35, 7000], ['thistle', 10, 900],
    ]) {
      const { series, type } = fly({ siteType, rangeKm, targetAltM });
      const perStepM = type.missileSpeed * 1000 * 0.1;
      for (let i = 1; i < series.length; i++) {
        const climb = series[i].altM - series[i - 1].altM;
        assert.ok(climb <= perStepM * FLIGHT.maxClimbSlope + 1e-6,
          `${siteType} climbs ${climb.toFixed(0)} m in one step, past its limit`);
        assert.ok(-climb <= perStepM * FLIGHT.maxDiveSlope + 1e-6,
          `${siteType} dives ${(-climb).toFixed(0)} m in one step, past its limit`);
      }
    }
  });

  test('a target that turns away does not pull the round back up', () => {
    // The arc is flown against ground covered, so a target extending the chase
    // must extend the round's cruise, not rewind its climb.
    const { series } = fly({ siteType: 'bastion', rangeKm: 90, targetAltM: 9000, turnAwayAtS: 30 });
    const apexAt = series.reduce((best, p, i) => (p.altM > series[best].altM ? i : best), 0);
    for (let i = apexAt + 1; i < series.length; i++) {
      assert.ok(series[i].altM <= series[i - 1].altM + 1e-9,
        `the round climbs again at ${series[i].t.toFixed(1)} s, after its apex`);
    }
  });

  test('a round shot at another round climbs to meet it', () => {
    // A weapon coming down on the position, and a section shooting back at it.
    const site = { id: 's1', type: 'hammer', alive: true, pos: { x: 0, y: 0 } };
    const radar = { id: 'r1', pos: site.pos, state: 'radiating', alive: true };
    const world = {
      t: 0, dt: 0.1, missiles: [], effects: [],
      aircraftById: new Map(), siteById: new Map([[site.id, site]]),
      radarById: new Map([[radar.id, radar]]),
      // The weapon is aimed at something, or it is written off before it flies.
      assetById: new Map([['x1', { id: 'x1', label: 'DEPOT', pos: { x: 0, y: 0 }, destroyed: false }]]),
      rng: { chance: () => false }, difficulty: {}, stats: {},
      killMissile(m, why) { m.alive = false; m.why = why; },
      killAircraft() {}, log() {}, comms() {}, onMissileMiss() {}, markTracksDown() {},
      damageAsset() {},
    };
    const incoming = createMissile({
      seq: 1, kind: 'strike', pos: { x: 0, y: 3 }, altM: 1800, speed: 0.31,
      hdg: 180, targetKind: 'asset', targetId: 'x1', contactType: 'glide',
    });
    incoming.briefedPos = { x: 0, y: 0 };
    world.missiles.push(incoming);
    const shell = createMissile({
      seq: 2, kind: 'sam', pos: site.pos, altM: 20, speed: SAM_TYPES.hammer.missileSpeed,
      hdg: 0, targetKind: 'missile', targetId: incoming.id, siteId: site.id, radarId: radar.id,
    });
    world.missiles.push(shell);

    let highest = 0;
    for (let i = 0; i < 400 && shell.alive; i++) {
      world.t += world.dt;
      stepMissiles(world, world.dt);
      if (shell.alive) highest = Math.max(highest, shell.altM);
    }
    assert.ok(highest > 400, `the shell only reached ${Math.round(highest)} m against a weapon at 1800 m`);
  });

  test('the profile is deterministic', () => {
    const a = fly({ siteType: 'bastion', rangeKm: 80, targetAltM: 8000 });
    const b = fly({ siteType: 'bastion', rangeKm: 80, targetAltM: 8000 });
    assert.deepEqual(a.series.map((p) => p.altM), b.series.map((p) => p.altM));
  });
});
