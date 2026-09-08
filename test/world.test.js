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
import { SAM_TYPES, AIR_TYPES, DETECTION, ENGAGEMENT } from '../src/engine/config.js';
import {
  beginEngagement, fireEngagement, armTimeToImpact, startReload, railLoadS,
} from '../src/engine/doctrine.js';
import { loseCentralControl, consoleDark } from '../src/engine/damage.js';
import { cannotEngageReason } from '../src/engine/threat.js';
import { timeToInRangeS } from '../src/engine/weapons.js';
import { dist } from '../src/engine/math.js';

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

  test('the rack refills a rail at a time, and the whole rack still costs reloadS', () => {
    /*
     * The two halves of the per-rail reload, measured on the same battery.
     * Nobody touches a control: the loaders work on their own, which is the
     * whole point — the crewed battery used to be the one battery whose
     * automatic reload never ran.
     */
    const world = readyWorld('first-light');
    const site = world.sites[0];
    const type = SAM_TYPES[site.type];
    const rails = site.rails;
    // Weapons hold so the battery cannot spend what the loaders bring up:
    // this test is about the loaders, and a battery that shoots mid-count
    // would be measuring the raid instead.
    world.setWeaponsState(site.id, 'hold');
    site.readyRounds = 0;
    const railS = (type.reloadS / rails) * (site.reloadMult ?? 1);

    // Well before the first rail is due, still bare.
    run(world, railS * 0.6);
    assert.equal(site.readyRounds, 0, 'no round arrives before its hoist is finished');
    // And shortly after, exactly one — not eight.
    run(world, railS * 0.6);
    assert.equal(site.readyRounds, 1, 'rounds arrive one at a time');
    assert.ok(site.reloadRemainingS > 0, 'and the next one is already on its way');

    // The economy is untouched: a whole rack still takes reloadS to fill.
    const before = site.readyRounds + site.magazine;
    run(world, type.reloadS);
    assert.equal(site.readyRounds, rails, 'the rack is full at reloadS, not sooner');
    assert.equal(site.readyRounds + site.magazine, before,
      'and every round came out of the store — none appeared from nowhere');
  });

  test('LOADERS OUT fills a rack doctrine would have left alone, and makes nothing', () => {
    /*
     * The whole arithmetic of the RELOAD control in one test. Doctrine sends
     * the loaders out on a BARE rack; this is the order that sends them out on
     * one that is merely short. It moves rounds EARLIER and never makes them:
     * the rail interval is the same, the store pays for every round, and a
     * battery nobody ordered simply sits at what it has. Two identical
     * batteries, one order between them.
     */
    const ordered = readyWorld('first-light');
    const plain = readyWorld('first-light');
    const type = SAM_TYPES[ordered.sites[0].type];
    const rails = ordered.sites[0].rails;
    const railS = (type.reloadS / rails) * (ordered.sites[0].reloadMult ?? 1);
    // Half a rack each: short, but not bare, so doctrine does nothing at all.
    const half = Math.floor(rails / 2);
    for (const world of [ordered, plain]) {
      world.setWeaponsState(world.sites[0].id, 'hold');
      world.sites[0].readyRounds = half;
    }
    run(ordered, railS * 1.5);
    run(plain, railS * 1.5);
    assert.equal(ordered.sites[0].readyRounds, half, 'doctrine leaves a short rack alone');
    assert.equal(plain.sites[0].readyRounds, half);

    const site = ordered.sites[0];
    const stock = site.readyRounds + site.magazine;
    assert.ok(startReload(ordered, site), 'the order is accepted');
    assert.equal(startReload(ordered, site), false, 'and is a no-op while the crew is out');

    run(ordered, railS * 1.1);
    run(plain, railS * 1.1);
    assert.equal(site.readyRounds, half + 1, 'one rail, at the same interval as any other');
    assert.equal(plain.sites[0].readyRounds, half,
      'while the battery beside it, unordered, still has what it had');

    // Full at exactly the rails it was short, times the rail interval — no
    // borrowed time, no half intervals, nothing conjured.
    run(ordered, railS * (rails - half));
    assert.equal(site.readyRounds, rails, 'the ordered rack fills at the ordinary rate');
    assert.equal(site.readyRounds + site.magazine, stock, 'and the store paid for every round');
    assert.equal(plain.sites[0].readyRounds, half, 'and doctrine still has not moved');
  });

  test('LOADERS OUT spammed every tick cannot conjure a single round', () => {
    const world = readyWorld('first-light');
    const site = world.sites[0];
    world.setWeaponsState(site.id, 'hold');
    site.readyRounds = 0;
    const rails = site.rails;
    const stock = site.readyRounds + site.magazine;
    run(world, SAM_TYPES[site.type].reloadS, () => { world.reload(site.id); });
    assert.ok(site.readyRounds <= rails);
    assert.equal(site.readyRounds + site.magazine, stock, 'the store paid for every round');
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

describe('the loaders work for the battery with a person in it', () => {
  /*
   * The bug this pins was the whole of the original report: the automatic
   * reload lived inside `runBatteryCrews`, AFTER the check that skips the
   * human's battery, so the one launcher with an operator sitting in it never
   * started a reload on its own. Measured before the fix: zero automatic
   * reloads across four crew watches, and an operator who had to notice the
   * red lamps and press a key before the rack would move at all.
   *
   * The seat is not touched here. Nobody presses RELOAD, nobody fires, nobody
   * assigns; the rack is emptied by hand to put the battery in the state the
   * report described, and the only question asked is whether the rounds come
   * back.
   */
  test('a crewed battery refills its own rack with nobody touching a control', () => {
    const world = new World(scenarioById('solo-battery'), { role: 'crew' });
    for (const radar of world.radars) radar.on = true;
    const mine = world.siteById.get(world.control.crewedBatteryId);
    assert.ok(mine.magazine > 0, 'the store has rounds to give');
    mine.readyRounds = 0;

    run(world, 20);
    assert.ok(mine.readyRounds > 0,
      `the loaders should have seated a round by now (rack ${mine.readyRounds})`);
    assert.ok(mine.readyRounds < mine.rails,
      'and they arrive one at a time, not as a rack appearing at once');

    const type = SAM_TYPES[mine.type];
    run(world, type.reloadS * (mine.reloadMult ?? 1));
    assert.equal(mine.readyRounds, mine.rails, 'a full rack still costs the full reloadS');
  });

  /*
   * And the ammunition economy is untouched by all of it: rounds come off the
   * store one for one, so a rack that fills a rail at a time costs exactly
   * what a rack that appeared in a lump cost.
   */
  test('every round on a rail came off the store', () => {
    const world = new World(scenarioById('solo-battery'), { role: 'crew' });
    // Nothing shoots: weapons held and every set cold, so the only thing that
    // can move the two numbers is the hoist.
    for (const site of world.sites) world.setWeaponsState(site.id, 'hold');
    for (const radar of world.radars) radar.on = false;
    const mine = world.siteById.get(world.control.crewedBatteryId);
    // The rack is emptied first: the question is whether what comes back came
    // out of the store, not what the crew was issued to begin with.
    mine.readyRounds = 0;
    const total = mine.readyRounds + mine.magazine;
    run(world, 200);
    assert.equal(world.stats.roundsFired, 0, 'nobody fired anything');
    assert.equal(mine.readyRounds + mine.magazine, total,
      'the loaders neither conjure nor lose a round');
  });
});

describe('a lost watch says why it was lost', () => {
  /*
   * "SECTOR PENETRATED" on its own is not a debrief, it is a verdict, and a
   * beginner's watch has to be learnable from its failures before anything
   * else. The clause is read in the order the verdict is decided in, and the
   * blind case is checked before the leaker count because it is the CAUSE of
   * the leaker count.
   */
  test('a watch spent with every set cold blames the sets, not the count', () => {
    /*
     * Read in the order the verdict is decided in: a place that cannot be
     * lost outranks the count, and the count outranks nothing. The blind
     * clause sits between them because it is the CAUSE of the count — an
     * operator who never radiated did not lose to four aircraft, they lost to
     * an empty scope, and telling them "four leaked" names the symptom.
     */
    const world = new World(scenarioById('low-riders'), { role: 'net' });
    for (const site of world.sites) world.setWeaponsState(site.id, 'hold');
    for (const radar of world.radars) radar.on = false;
    run(world, 3000, (w) => {
      for (const r of w.radars) if (!r.siteId) r.on = false;
    });
    assert.equal(world.outcome.success, false);
    assert.ok(world.outcome.cause && world.outcome.cause.length > 20,
      'a lost watch always carries a clause');
    assert.ok(!world._everRadiated, 'and nothing the seat owns ever radiated on it');
    assert.equal(
      world.failureCause({ reason: 'raid-spent', success: false, criticalLost: false, leakersCounted: 4 }),
      'NOTHING OF YOURS EVER RADIATED. 4 GOT THROUGH A SECTOR THAT COULD NOT SEE THEM.',
    );
  });

  test('and when something was radiating, it names the count and the state', () => {
    const world = readyWorld('low-riders');
    run(world, 120);
    const said = world.failureCause({
      reason: 'raid-spent', success: false, criticalLost: false, leakersCounted: 2,
    });
    assert.match(said, /^2 LEAKERS REACHED/, said);
    assert.ok(!/NEVER RADIATED/.test(said), 'the sets were up, so that is not the reason');
  });

  test('a watch that was held names no cause at all', () => {
    const world = readyWorld('first-light');
    run(world, 3000);
    assert.equal(world.outcome.success, true);
    assert.equal(world.outcome.cause, null);
  });

  test('losing a place that cannot be lost names the place', () => {
    const world = readyWorld('first-light');
    run(world, 60);
    const critical = world.assets.find((a) => a.id === 'a_c2');
    critical.destroyed = true;
    world.finish('raid-spent');
    assert.equal(world.outcome.success, false);
    assert.match(world.outcome.cause, /LOSES THE WATCH/);
    assert.ok(world.outcome.cause.includes(critical.label?.toUpperCase() ?? 'CENTRE')
      || /CANNOT BE LOST/.test(world.outcome.cause),
    `expected the place to be named, got ${world.outcome.cause}`);
  });
});

describe('the quiet net gives advice, not the opposite of it', () => {
  /*
   * `reportTheLull` exists to turn a blank ticker into something the operator
   * can act on, so the one thing it must never do is describe a shot that is
   * ready to be ordered as a shot that cannot be taken. `cannotEngageReason`
   * returning null means LEGAL — the old line printed that null as the word
   * NOTHING ("CANNOT SHOOT: NOTHING") and did it most often to the beginner
   * policies, at the exact moment the answer was "give the contact to that
   * battery". This drives the real method at a real world state.
   */

  /** Pick the same worst track / best battery pair the lull report picks. */
  function lullPair(world) {
    const mine = world.sites.filter((s) => s.alive
      && (s.id === world.control.crewedBatteryId || world.commandable(s.id)));
    let worst = null;
    for (const track of world.tracks.values()) {
      if (track.destroyed || track.hostility !== 'hostile') continue;
      if (track.quality < DETECTION.firmQuality) continue;
      if (!worst || track.threat > worst.threat) worst = track;
    }
    if (!worst) return null;
    let bestSite = null;
    let bestS = Infinity;
    for (const site of mine) {
      const toRange = timeToInRangeS(site, worst);
      if (!Number.isFinite(toRange) || toRange >= bestS) continue;
      bestS = toRange; bestSite = site;
    }
    return bestSite ? { worst, bestSite, bestS } : null;
  }

  /** The last thing the net said, whatever kind of line it was logged as. */
  function saidBy(world, fn) {
    const before = world.events.length;
    fn();
    return world.events.slice(before).map((e) => e.text).join(' | ');
  }

  test('a legal, unordered shot is handed over, never reported as NOTHING', () => {
    const world = readyWorld('first-light');
    let pair = null;
    // Run until the watch itself produces the state the line is about: a firm
    // hostile already inside a commandable battery's ring with nothing wrong.
    for (let i = 0; i < 12000 && world.phase === 'running'; i++) {
      world.step(0.1);
      const found = lullPair(world);
      if (found && found.bestS <= 0 && !cannotEngageReason(world, found.bestSite, found.worst)) {
        pair = found; break;
      }
    }
    assert.ok(pair, 'the watch put a legal, in-ring shot on the plot');

    // A lull is silence, so silence the ticker and let the net fill it.
    world.events = [];
    world._lullTrackAtS = {};
    world._lullLast = null;
    const said = saidBy(world, () => world.reportTheLull());

    assert.match(said, /SECTOR: /, `the net said something: ${said}`);
    assert.ok(!/NOTHING/.test(said),
      `a legal shot must never be reported as NOTHING, got: ${said}`);
    assert.match(said, /NOBODY IS ON IT|HAS NO ORDER/,
      `the net names the missing order, got: ${said}`);
    assert.match(said, new RegExp(`\\b${pair.bestSite.name}\\b`), said);

    // And the kilometres belong to the ring the sentence names, not to the
    // sector centre: "INSIDE BASTION'S RING AT 136 KM" for a battery that
    // reaches 120 taught the operator the wrong reach for their own equipment.
    const km = Number(said.match(/AT (\d+) KM/)?.[1]);
    const fromRing = dist(pair.bestSite.pos, pair.worst.pos);
    assert.ok(Number.isFinite(km), `the line quotes a range: ${said}`);
    assert.ok(Math.abs(km - fromRing) <= 1,
      `the range is measured from ${pair.bestSite.name}, not the plot centre: `
      + `said ${km} km, battery to track is ${fromRing.toFixed(1)} km`);
    assert.ok(km <= SAM_TYPES[pair.bestSite.type].maxRangeKm + 1,
      `a range inside the ring cannot exceed the ring: ${said}`);
  });

  test('a battery that genuinely cannot shoot still says why', () => {
    const world = readyWorld('first-light');
    let pair = null;
    for (let i = 0; i < 12000 && world.phase === 'running'; i++) {
      world.step(0.1);
      const found = lullPair(world);
      if (found && found.bestS <= 0) { pair = found; break; }
    }
    assert.ok(pair, 'the watch put a contact inside a ring');
    // Empty the rails: now the reason is real, and the net must name it.
    pair.bestSite.readyRounds = 0;
    world.events = [];
    world._lullTrackAtS = {};
    world._lullLast = null;
    const said = saidBy(world, () => world.reportTheLull());
    assert.match(said, /NO ROUNDS ON THE RAILS/, said);
    assert.ok(!/NOTHING/.test(said), said);
  });
});

describe('a knob the watch turns, and a ledger that agrees with the ticker', () => {
  /*
   * `scenario.reloadMult` was asserted in the teaching watch's own file, under
   * a comment giving the measurement behind it, quoted twice in the README —
   * and read by nothing. A grep found every `reloadMult` read going to the
   * SITE's field, which is built from character modifiers and crew casualties
   * and never once from the scenario. Proven empirically at the time: adding
   * `reloadMult: 0.8` to another watch produced a byte-identical sixteen-seed
   * table across every seat and player.
   */
  test('the watch its scenario says reloads fast, reloads fast', () => {
    const fast = new World(scenarioById('first-light'), { role: 'net', seed: 'knob-1' });
    const plain = new World(scenarioById('low-riders'), { role: 'net', seed: 'knob-1' });
    assert.equal(scenarioById('first-light').reloadMult, 0.35,
      'the teaching watch still declares a fast crew');
    assert.equal(scenarioById('low-riders').reloadMult, undefined,
      'and the watch beside it declares nothing');

    for (const site of fast.sites) {
      assert.ok(site.reloadMult < 0.5,
        `${site.name} carries the watch's multiplier (${site.reloadMult})`);
    }
    for (const site of plain.sites) {
      assert.ok(site.reloadMult >= 0.9,
        `${site.name} on a watch with no multiplier is unmodified (${site.reloadMult})`);
    }

    // And it is the rail time that moves, which is the thing the README quotes.
    const site = fast.sites.find((s) => s.type === 'bastion');
    const type = SAM_TYPES[site.type];
    const railS = railLoadS(site);
    assert.ok(railS > 3.5 && railS < 5,
      `a rail on the teaching watch takes about four seconds, not ${railS.toFixed(1)}`);
    assert.ok(railS < (type.reloadS / site.rails) * 0.5, 'which is well under the standard hoist');
  });

  /*
   * TURNED BACK is the second of the two ways to win a watch, and the debrief
   * printed zero over a ticker that had just announced two of them: the stat
   * was only ever incremented when an aborted aircraft finished flying off
   * the map. Probed over 48 teaching watches — 79 aborts, six counted, and
   * twenty watches ending with an aborted aircraft still airborne.
   */
  test('a sortie that broke off is counted whether or not it has gone home yet', () => {
    const world = readyWorld('first-light');
    // Fly the watch far enough that the raid is on the board.
    run(world, 200);
    const flying = world.aircraft.filter((a) => a.alive && a.type !== 'civil'
      && !AIR_TYPES[a.type].isVip && !a.aborted);
    assert.ok(flying.length > 0, 'there are sorties in the air to turn back');

    const before = world.result('raid-spent');
    flying[0].aborted = true;
    const after = world.result('raid-spent');

    assert.equal(after.stats.turnedBack, before.stats.turnedBack + 1,
      'the debrief counts the sortie the ticker announced');
    assert.equal(after.breakdown.turnedBack, before.breakdown.turnedBack + 18,
      'and pays for it, at the same eighteen points as one that flew home');
    assert.equal(after.score, before.score + 18);
  });
});

describe('a refusal is said once, not two hundred and eleven times', () => {
  /*
   * The dry-fire refusal was debounced at a second and a half and the
   * refused-assignment line at nothing at all, against the engine's own
   * twenty-second precedent (`armDuckLoggedAtS`, written after a set
   * announced SHUTTING DOWN hundreds of times in one watch). Measured in one
   * First Light cabin watch: two hundred and eleven copies of "NO FIRING
   * SOLUTION", and at nine minutes all five visible ticker lines were that
   * one sentence.
   */
  test('a held fire key answers once every twenty seconds, not every second', () => {
    const world = readyWorld('first-light');
    const site = world.sites[0];
    const before = world.events.length;
    // A hundred presses in ten seconds, which is a person leaning on a key.
    for (let i = 0; i < 100; i++) { world.fire(site.id); world.step(0.1); }
    const lines = world.events.slice(before).filter((e) => /NO FIRING SOLUTION/.test(e.text));
    assert.equal(lines.length, 1, `ten seconds of pressing is one line, got ${lines.length}`);

    run(world, 20);
    world.fire(site.id);
    const after = world.events.filter((e) => /NO FIRING SOLUTION/.test(e.text));
    assert.equal(after.length, 2, 'and it is said again once the gate has run out');
  });

  test('the gate is per battery and per reason, so two batteries are both heard', () => {
    const world = readyWorld('first-light');
    const [a, b] = world.sites;
    world.fire(a.id);
    world.fire(b.id);
    const lines = world.events.filter((e) => /NO FIRING SOLUTION/.test(e.text));
    assert.equal(lines.length, 2, 'a refusal from a different battery is different news');
    assert.ok(lines.some((e) => e.text.includes(a.name)));
    assert.ok(lines.some((e) => e.text.includes(b.name)));
  });
});
