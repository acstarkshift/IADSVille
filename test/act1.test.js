/**
 * Act one, defended.
 *
 * The holistic gameplay scrub measured the first four watches against a stated
 * bar — first contact, first legal shot, dead air, the length of the night, the
 * ladder from a spectator to an expert — and changed four things about the way
 * a watch talks to the person sitting in it, plus the raids themselves. These
 * tests pin the mechanisms rather than the balance numbers: the balance lives
 * in `tools/playtest.mjs`, which is measured with eight seeds and paired
 * statistics, and pinning a seeded score here would be pinning noise.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/engine/world.js';
import {
  scenarioById, SCENARIOS, raidHuntsRadars, positionCanBeHunted,
} from '../src/engine/scenarios.js';
import { SAM_TYPES, AIR_TYPES } from '../src/engine/config.js';

/** Run to `untilS`, keeping every set the AI owns radiating. */
function run(w, untilS, { crewRadiates = false } = {}) {
  while (w.phase === 'running' && w.t < untilS) {
    if (crewRadiates && w.control.crewedBatteryId) {
      for (const r of w.radarsOf(w.siteById.get(w.control.crewedBatteryId))) {
        if (r.alive) r.on = true;
      }
    }
    w.step(0.1);
  }
  return w;
}

describe('a scripted line is somebody on the radio', () => {
  test('scenario chatter reaches the ticker as comms, not as a machine echo', () => {
    const w = new World(scenarioById('solo-battery'), { role: 'crew', seed: 'chat-1' });
    run(w, 130);
    const scripted = w.events.filter((e) => e.text.startsWith('SECTOR: YOU ARE THE ONLY SET'));
    assert.equal(scripted.length, 1, 'the 52 s line went out exactly once');
    assert.equal(scripted[0].kind, 'comms',
      'the room talking is radio traffic — the dead-air detector counts comms and ignores info');
  });

  test('every scenario chatter line lands as comms unless it asks for another kind', () => {
    for (const scenario of SCENARIOS) {
      for (const line of scenario.chatter ?? []) {
        if (line.kind) continue;
        assert.ok(line.text || line.insteadText,
          `${scenario.id} has a chatter slot at ${line.atS}s with nothing to say`);
      }
    }
  });
});

describe('the teaching watch does not contradict its own lesson', () => {
  test('the radiate lesson is only said while the set is cold', () => {
    const cold = new World(scenarioById('first-light'), { role: 'net', seed: 'fl-cold' });
    run(cold, 40);
    assert.ok(cold.events.some((e) => e.text.includes('THE SET IS NOT RADIATING')),
      'a player who has not found the switch is told where it is');

    const warm = new World(scenarioById('first-light'), { role: 'net', seed: 'fl-warm' });
    for (const r of warm.radars) if (!r.siteId) r.on = true;
    run(warm, 40);
    assert.ok(!warm.events.some((e) => e.text.includes('THE SET IS NOT RADIATING')),
      'a player who found the switch at one second is not told their set is dark at twelve');
    assert.ok(warm.events.some((e) => e.text.includes('WIDE EYE IS RADIATING')),
      'the slot carries the other true sentence rather than falling silent');
  });

  test('the cabin gets its own version of the lesson, about its own antenna', () => {
    const w = new World(scenarioById('first-light'), { role: 'crew', seed: 'fl-cab' });
    run(w, 50);
    assert.ok(w.events.some((e) => e.text.includes('YOUR OWN SET IS COLD')),
      'in the cabin the lesson is the battery you are sitting in, not the sector set');
  });

  test('a set that never ducked does not report an all-clear', () => {
    const w = new World(scenarioById('first-light'), { role: 'crew', seed: 'fl-sky' });
    run(w, 90);
    assert.ok(!w.events.some((e) => e.text.includes('SKY CLEAR')),
      'nothing shot at anything on this watch — there is no all-clear to give');
  });
});

describe('the safety reaches the cabin', () => {
  test('a crewed battery that never radiates is brought up by its own crew', () => {
    const scenario = scenarioById('first-light');
    const w = new World(scenario, { role: 'crew', seed: 'fl-safety' });
    const own = () => w.radarsOf(w.siteById.get(w.control.crewedBatteryId));
    run(w, scenario.radarSafetyAtS - 5);
    assert.ok(!own().some((r) => r.on), 'before the safety, the cabin is dark and that is the lesson');
    run(w, scenario.radarSafetyAtS + 5);
    assert.ok(own().some((r) => r.on), 'the crew does not sit in the dark all night');
    assert.ok(w.events.some((e) => e.text.includes('CREW HAS BROUGHT THE SET UP')),
      'and it says so, so the player knows the switch was theirs');
  });

  test('a crew that has already radiated is never overruled by the safety', () => {
    const scenario = scenarioById('first-light');
    const w = new World(scenario, { role: 'crew', seed: 'fl-own' });
    run(w, scenario.radarSafetyAtS + 20, { crewRadiates: true });
    assert.ok(!w.events.some((e) => e.text.includes('CREW HAS BROUGHT THE SET UP')),
      'the safety is for a cabin that never found the switch');
  });

  test('the emissions watch has no safety at all, on purpose', () => {
    assert.equal(scenarioById('weasel-hour').radarSafetyAtS, undefined,
      'a watch whose subject is going dark must never be brought up by a safety');
  });
});

describe('an order about a fight waits for the fight', () => {
  test('routine traffic holds until the contact grace has run from first contact', () => {
    for (const id of ['first-light', 'low-riders', 'solo-battery', 'weasel-hour', 'four-sectors', 'ville-under-fire']) {
      const scenario = scenarioById(id);
      const grace = scenario.directiveContactGraceS;
      assert.ok(grace >= 60, `${id} owes the operator a clear minute of fighting`);
      const w = new World(scenario, { role: scenario.roles[0], seed: `grace-${id}` });
      let firstOrderAtS = null;
      while (w.phase === 'running' && w.t < 400) {
        w.step(0.1);
        for (const r of w.radars) if (r.alive) r.on = true;
        if (w.command.pending && firstOrderAtS === null) firstOrderAtS = w.t;
        if (w.command.pending) w.answer('accepted');
      }
      assert.ok(w.firstContactAtS !== null, `${id} painted nothing in four hundred seconds`);
      if (firstOrderAtS === null) continue;      // a watch that stayed quiet is fine
      assert.ok(firstOrderAtS >= w.firstContactAtS + grace - 1,
        `${id}: first order at ${firstOrderAtS.toFixed(0)}s, contact at `
          + `${w.firstContactAtS.toFixed(0)}s — that is under the ${grace}s grace`);
    }
  });

  test('a scenario that sets no contact grace behaves exactly as before', () => {
    for (const scenario of SCENARIOS) {
      const measured = ['first-light', 'low-riders', 'solo-battery', 'weasel-hour',
        'four-sectors', 'ville-under-fire'];
      if (measured.includes(scenario.id)) continue;
      assert.equal(scenario.directiveContactGraceS, undefined,
        `${scenario.id} has not been measured with a contact grace — it must not carry one`);
    }
  });
});

describe('the net measures silence the way the bar does', () => {
  test('the machinery narrating itself does not count as the watch talking', () => {
    const w = new World(scenarioById('low-riders'), { role: 'crew', seed: 'lull-1' });
    run(w, 60);
    w._lastActionAtS = 0;
    w.log('info', 'BASTION ACQ — RADIATING');
    assert.equal(w._lastActionAtS, 0,
      'an antenna reporting itself is an echo of the machinery, not a thing to do');
    w.log('comms', 'SECTOR: SOMETHING AN OPERATOR WOULD LOOK UP FOR');
    assert.equal(w._lastActionAtS, w.t, 'the radio is the watch talking to you');
  });

  test('a scripted chatter line resets the silence clock', () => {
    const w = new World(scenarioById('low-riders'), { role: 'net', seed: 'lull-2' });
    // The 26 s line is the first scripted one on this watch.
    run(w, 20);
    w._lastActionAtS = 0;
    run(w, 30);
    assert.ok(w._lastActionAtS > 0, 'the room talking is activity');
  });

  test('an empty plot is not narrated on a metronome', () => {
    const w = new World(scenarioById('first-light'), { role: 'net', seed: 'lull-3' });
    const clears = [];
    const real = w.log.bind(w);
    w.log = (kind, text, meta) => {
      if (/PLOT CLEAR|NOTHING AIRBORNE|THAT APPEARS TO BE ALL OF IT/.test(text)) clears.push(w.t);
      return real(kind, text, meta);
    };
    while (w.phase === 'running') w.step(0.1);
    for (let i = 1; i < clears.length; i++) {
      assert.ok(clears[i] - clears[i - 1] >= 89,
        `reassurance repeated is not reassurance: ${clears[i - 1].toFixed(0)}s then `
          + `${clears[i].toFixed(0)}s`);
    }
  });
});

describe('the raid the cabin owns', () => {
  test('Low Riders flies twenty-eight aircraft in seven packages, as its file says', () => {
    const scenario = scenarioById('low-riders');
    const total = scenario.waves.reduce((n, wave) => n + wave.count, 0);
    // Thirty until the curve scrub, when a cruise missile that arrives became
    // a leaker the file counts. Six of them at fifty metres on the one axis
    // BASTION cannot see under were the largest single source of arrivals on
    // the watch and had been free; at four the beat is unchanged and the
    // allowance means what it says.
    assert.equal(total, 28, 'the count in the scenario comment must match the table');
    assert.equal(scenario.waves.length, 7, 'seven packages');
    // Five distinct axes: 350 / 340 / 330 out of the north-west, about 20 out
    // of the north-east (three packages share it), and 255 from the west. The
    // file's comment says five, and it had been eleven aircraft and an axis
    // out for three passes before the scrub counted them.
    const axes = new Set(scenario.waves.map((wave) => (wave.bearingDeg < 45 ? 'ne' : wave.bearingDeg)));
    assert.equal(axes.size, 5, [...axes].join(','));
  });

  test('the high package is the one thing only the long-range battalion reaches', () => {
    const scenario = scenarioById('low-riders');
    const high = scenario.waves.filter((wave) => wave.altM > 6000);
    assert.ok(high.length >= 2, 'there is work above the horizon');
    const w = new World(scenario, { role: 'crew', seed: 'lr-floor' });
    const bastion = w.siteById.get(scenario.playerBatteryId);
    const floor = SAM_TYPES[bastion.type].minAltM;
    const under = scenario.waves
      .filter((wave) => wave.altM !== undefined && wave.altM < floor)
      .reduce((n, wave) => n + wave.count, 0);
    assert.ok(under >= 14,
      `most of this raid must be under the crewed battery's ${floor} m floor, got ${under}`);
  });
});

describe('a gauge with nothing behind it is dead weight', () => {
  test('the raid predicates agree with what the waves actually carry', () => {
    for (const scenario of SCENARIOS) {
      const carried = (scenario.waves ?? [])
        .some((wave) => (AIR_TYPES[wave.type]?.arms ?? 0) > 0);
      assert.equal(raidHuntsRadars(scenario), carried, `${scenario.id} arms`);
      const travels = (scenario.assets ?? []).some((a) => a.follows);
      assert.equal(positionCanBeHunted(scenario), carried || travels, `${scenario.id} position`);
    }
  });

  test('Solo Battery has nothing to expose and nowhere to drive to', () => {
    assert.equal(raidHuntsRadars(scenarioById('solo-battery')), false,
      'not one of its sixteen aircraft carries an anti-radiation round');
    assert.equal(positionCanBeHunted(scenarioById('solo-battery')), false);
    assert.equal(raidHuntsRadars(scenarioById('weasel-hour')), true,
      'the suppression watch is the one where the exposure gauge means something');
  });

  test('and the wave table it is measured on has not moved', () => {
    const waves = scenarioById('solo-battery').waves;
    assert.deepEqual(waves.map((w) => [w.atS, w.type, w.count, w.distanceKm]), [
      [25, 'striker', 3, 70],
      [180, 'striker', 4, 80],
      [330, 'cruise', 5, 85],
      [470, 'striker', 4, 60],
    ], 'seven alternatives were measured at thirty-two seeds and every one is worse');
  });
});

describe('the act-one examination', () => {
  test('Weasel Hour flies twenty-two aircraft, and its comment says so', () => {
    const scenario = scenarioById('weasel-hour');
    const total = scenario.waves.reduce((n, wave) => n + wave.count, 0);
    // Fifteen could not be failed by a beginner; twenty-one could not be
    // failed by a competent net once arriving cruise missiles were counted
    // (88% held at sixteen seeds, above act one's hardest watch). The
    // twenty-second is one more missile on the late run at the operations
    // centre — the package that arrives after the allocation is spent.
    assert.equal(total, 22,
      'fifteen aircraft against four batteries could not be failed by a beginner');
  });

  test('the strike package that walks home comes in inside the ring it walks out of', () => {
    const scenario = scenarioById('weasel-hour');
    const homeward = scenario.waves.find((wave) => wave.bearingDeg === 15);
    assert.equal(homeward.distanceKm, 80,
      'at ninety-five its egress was five minutes of shooting at an empty aeroplane');
  });

  test('the middle of the watch has something in it', () => {
    const scenario = scenarioById('weasel-hour');
    const spawns = scenario.waves.map((wave) => wave.atS).sort((a, b) => a - b);
    for (let i = 1; i < spawns.length; i++) {
      assert.ok(spawns[i] - spawns[i - 1] <= 130,
        `a ${spawns[i] - spawns[i - 1]}s gap between packages at ${spawns[i - 1]}s`);
    }
  });

  test('the suppression aircraft still stand off outside the battalion', () => {
    const scenario = scenarioById('weasel-hour');
    for (const wave of scenario.waves.filter((w) => w.type === 'sead')) {
      assert.ok(wave.distanceKm >= 120,
        'a weasel inside the ring is a weasel the battalion simply shoots');
    }
  });
});

describe('the console does not echo a switch that did not move', () => {
  test('setting a radar to the state it is already in says nothing', () => {
    const w = new World(scenarioById('first-light'), { role: 'crew', seed: 'echo-1' });
    const said = [];
    const real = w.log.bind(w);
    w.log = (kind, text, meta) => {
      if (/— (RADIATING|SILENT)$/.test(text)) said.push(text);
      return real(kind, text, meta);
    };
    const radar = w.radars.find((r) => r.siteId === w.control.crewedBatteryId);
    for (let i = 0; i < 40; i++) w.setRadar(radar.id, true);
    assert.equal(said.length, 1, `one order, one line — got ${said.length}`);
    w.setRadar(radar.id, false);
    assert.equal(said.length, 2, 'and the order that moves it does say so');
  });
});
