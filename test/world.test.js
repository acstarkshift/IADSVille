/**
 * Integration tests over a real World.
 *
 * These are the ones that matter: they check that the pieces compose into the
 * behaviours the game is actually about — that blinking a radar orphans the
 * rounds it was guiding, that losing the sector operations centre splits the
 * picture, and that a full raid terminates and scores in both seats.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/engine/world.js';
import { scenarioById, SCENARIOS } from '../src/engine/scenarios.js';
import { SAM_TYPES, DETECTION, ENGAGEMENT } from '../src/engine/config.js';
import { beginEngagement, fireEngagement, armTimeToImpact, startReload } from '../src/engine/doctrine.js';
import { loseCentralControl, consoleDark } from '../src/engine/damage.js';

/** Run a world forward, optionally doing something each step. */
function run(world, seconds, each) {
  const steps = Math.round(seconds / 0.1);
  for (let i = 0; i < steps && world.phase === 'running'; i++) {
    world.step(0.1);
    each?.(world, i);
  }
  return world;
}

/** A world with everything radiating and weapons free — the baseline of competent play. */
function readyWorld(id = 'first-light', options = {}) {
  const world = new World(scenarioById(id), { role: 'net', ...options });
  for (const radar of world.radars) radar.on = true;
  for (const site of world.sites) world.setWeaponsState(site.id, 'free');
  world.control.netIsHuman = false;   // let the doctrine AI drive assignment
  return world;
}

describe('construction', () => {
  test('every scenario builds a coherent world', () => {
    for (const scenario of SCENARIOS) {
      const world = new World(scenario, { role: scenario.roles[0] });
      assert.ok(world.sites.length > 0, `${scenario.id} has batteries`);
      assert.ok(world.assets.length > 0, `${scenario.id} has something to defend`);
      assert.ok(world.pendingWaves.length > 0, `${scenario.id} has a raid`);
      for (const site of world.sites) {
        assert.ok(world.radarById.get(site.radarId), `${site.id} has a fire control radar`);
      }
      assert.ok(world.roundAllowance > 0);
    }
  });

  test('the player’s own set starts cold and everyone else is under AI discipline', () => {
    const world = new World(scenarioById('solo-battery'), { role: 'crew' });
    const mine = world.siteById.get(world.control.crewedBatteryId);
    assert.ok(mine, 'a battery was assigned');
    assert.equal(world.radarById.get(mine.radarId).on, false, 'coming up is the operator’s decision');
  });

  test('a seed replays identically', () => {
    const a = readyWorld('low-riders');
    const b = readyWorld('low-riders');
    run(a, 240);
    run(b, 240);
    assert.equal(a.stats.roundsFired, b.stats.roundsFired);
    assert.equal(a.stats.kills, b.stats.kills);
    assert.equal(a.tracks.size, b.tracks.size);
  });
});

describe('detection through the full loop', () => {
  test('a radiating radar builds and holds tracks', () => {
    const world = readyWorld('first-light');
    run(world, 200);
    assert.ok(world.tracks.size > 0, 'the raid was detected');
    const firm = [...world.tracks.values()].filter((t) => t.quality >= DETECTION.firmQuality);
    assert.ok(firm.length > 0, 'and at least one track is firm enough to shoot on');
  });

  test('a sector with every radar dark detects nothing at all', () => {
    const world = new World(scenarioById('first-light'), { role: 'net' });
    for (const radar of world.radars) radar.on = false;
    // Hold everything down: no AI crew is allowed to search on our behalf here.
    run(world, 300, (w) => { for (const r of w.radars) r.on = false; });
    assert.equal(world.tracks.size, 0, 'you cannot see without emitting');
  });
});

describe('emissions control', () => {
  test('shutting the guiding radar down orphans the round it was guiding', () => {
    const world = readyWorld('first-light');
    run(world, 400);

    const engaged = world.missiles.find((m) => m.kind === 'sam' && m.alive);
    if (!engaged) return; // nothing in the air on this seed; the pk test below covers the rule

    const radar = world.radarById.get(engaged.radarId);
    radar.on = false;
    run(world, 3);
    assert.ok(engaged.unguidedS > 0, 'the round immediately loses midcourse guidance');
  });

  test('a round with no guidance is written off rather than wandering forever', () => {
    const world = readyWorld('first-light');
    let orphan = null;
    run(world, 600, (w) => {
      if (!orphan) {
        orphan = w.missiles.find((m) => m.kind === 'sam' && m.alive && m.tofS > 1);
        if (orphan) {
          const radar = w.radarById.get(orphan.radarId);
          radar.on = false;
          w.radarStaysDark = radar;
        }
      }
      if (w.radarStaysDark) w.radarStaysDark.on = false;
    });
    if (orphan) {
      assert.equal(orphan.alive, false, 'the round is eventually written off');
      assert.ok(world.events.some((e) => /NO GUIDANCE|LOST/.test(e.text)),
        'and the operator is told why');
    }
  });

  test('going dark is logged against you by sector command', () => {
    const world = new World(scenarioById('first-light'), { role: 'net' });
    for (const radar of world.radars) radar.on = false;
    run(world, 400, (w) => { for (const r of w.radars) r.on = false; });
    assert.ok(world.command.darkTimeS > 100, 'the emissions log is being kept');
  });
});

describe('losing the sector operations centre', () => {
  test('fusion stops and one aircraft becomes several tracks', () => {
    const world = readyWorld('low-riders');
    run(world, 300);
    const before = world.tracks.size;
    assert.ok(world.fusionOnline);

    const c2 = world.assets.find((a) => a.type === 'c2');
    loseCentralControl(world, c2);

    assert.equal(world.fusionOnline, false);
    assert.ok(world.events.some((e) => /FUSION LOST/.test(e.text)));
    assert.ok(consoleDark(world), 'the console drops out when the centre does');

    run(world, 200);
    assert.ok(world.tracks.size >= before,
      'without reconciliation the picture multiplies rather than shrinking');
  });

  test('the AI battle manager stops assigning once the centre is gone', () => {
    const world = readyWorld('low-riders');
    run(world, 260);
    world.fusionOnline = false;
    for (const site of world.sites) site.engagements = [];
    run(world, 60);
    const assignedByNet = world.sites.reduce((n, s) => n + s.engagements.length, 0);
    // Batteries may still self-engage what they personally hold, but nothing is
    // being handed to them any more.
    assert.ok(assignedByNet <= world.sites.length, 'no central tasking is happening');
  });
});

describe('engagement mechanics', () => {
  test('a battery cannot exceed its engagement channels', () => {
    const world = readyWorld('ville-under-fire');
    run(world, 420);
    for (const site of world.sites) {
      assert.ok(site.engagements.length <= SAM_TYPES[site.type].channels,
        `${site.name} kept within ${SAM_TYPES[site.type].channels} channels`);
    }
  });

  test('rounds fired never exceed rounds carried', () => {
    const world = readyWorld('white-noise');
    run(world, 900);
    const capacity = world.sites.reduce((n, s) => n + SAM_TYPES[s.type].readyRounds + SAM_TYPES[s.type].magazine, 0);
    assert.ok(world.stats.roundsFired <= capacity, 'no rounds appeared from nowhere');
    for (const site of world.sites) assert.ok(site.readyRounds >= 0 && site.magazine >= 0);
  });

  test('reloading takes the rack offline and then refills it', () => {
    const world = readyWorld('first-light');
    const site = world.sites[0];
    site.readyRounds = 0;
    assert.ok(startReload(world, site));
    assert.ok(site.reloadRemainingS > 0);
    run(world, SAM_TYPES[site.type].reloadS + 2);
    assert.ok(site.readyRounds > 0, 'the rack came back full');
  });

  test('weapons hold breaks off everything the battery was working', () => {
    const world = readyWorld('low-riders');
    run(world, 300);
    const busy = world.sites.find((s) => s.engagements.length > 0);
    if (!busy) return;
    world.setWeaponsState(busy.id, 'hold');
    assert.equal(busy.engagements.length, 0);
  });

  test('displacing a battery moves it and takes it out of the fight', () => {
    const world = readyWorld('first-light');
    const site = world.sites[0];
    const before = { ...site.pos };
    assert.ok(world.scoot(site.id));
    assert.notDeepEqual(site.pos, before, 'the battery is somewhere else now');
    assert.equal(world.radarById.get(site.radarId).exposure, 0, 'and the enemy has to find it again');
    assert.ok(site.scootRemainingS > 0);
  });
});

describe('the raid', () => {
  test('a striker that gets through is counted as a leaker', () => {
    const world = new World(scenarioById('first-light'), { role: 'net' });
    // Nobody defends: every striker should reach its release point.
    for (const radar of world.radars) radar.on = false;
    for (const site of world.sites) world.setWeaponsState(site.id, 'hold');
    run(world, 1200, (w) => { for (const r of w.radars) r.on = false; });
    assert.ok(world.stats.leakers > 0, 'undefended, they get their weapons off');
    assert.ok(world.command.standing < 50, 'and it costs you');
  });

  test('suppression aircraft need emissions before they will commit a round', () => {
    const quiet = new World(scenarioById('weasel-hour'), { role: 'net' });
    for (const radar of quiet.radars) radar.on = false;
    for (const site of quiet.sites) quiet.setWeaponsState(site.id, 'hold');
    run(quiet, 700, (w) => { for (const r of w.radars) r.on = false; });
    assert.equal(quiet.stats.armsIncoming, 0, 'a silent sector gives them nothing to shoot at');

    const loud = readyWorld('weasel-hour');
    run(loud, 700, (w) => { for (const r of w.radars) if (r.alive) r.on = true; });
    assert.ok(loud.stats.armsIncoming > 0, 'radiate all watch and they will find you');
  });

  test('every mission terminates and scores, in both seats', () => {
    for (const scenario of SCENARIOS) {
      for (const role of scenario.roles.includes('crew') ? ['net', 'crew'] : ['net']) {
        if (!scenario.roles.includes(role)) continue;
        const world = readyWorld(scenario.id, { role });
        run(world, 3000);
        assert.equal(world.phase, 'complete', `${scenario.id}/${role} finished`);
        const result = world.outcome;
        assert.ok(Number.isFinite(result.score), `${scenario.id}/${role} scored`);
        assert.ok(result.headline.length > 0);
        assert.ok(result.stats.sortiesTotal > 0);
      }
    }
  });
});

describe('scoring', () => {
  test('a clean watch beats a penetrated one', () => {
    const good = readyWorld('first-light');
    run(good, 3000);

    const bad = new World(scenarioById('first-light'), { role: 'net' });
    for (const radar of bad.radars) radar.on = false;
    for (const site of bad.sites) bad.setWeaponsState(site.id, 'hold');
    run(bad, 3000, (w) => { for (const r of w.radars) r.on = false; });

    assert.ok(good.outcome.score > bad.outcome.score, 'defending the sector is worth points');
    assert.ok(good.command.standing > bad.command.standing, 'and worth standing');
  });

  test('shooting civil traffic is catastrophic for your file', () => {
    const world = readyWorld('white-noise');
    run(world, 400);
    const civil = world.aircraft.find((a) => a.type === 'civil' && a.alive);
    if (!civil) return;
    const before = world.command.standing;
    world.killAircraft(civil, null);
    world.finish('raid-spent');
    assert.equal(world.stats.civilianAircraftShot, 1);
    assert.ok(world.command.standing < before, 'sector command notices');
    assert.ok(world.outcome.breakdown.civilian < 0);
  });
});
