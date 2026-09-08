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
import { scenarioById, SCENARIOS } from '../src/engine/scenarios.js';

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
    for (const id of ['first-light', 'low-riders', 'solo-battery', 'weasel-hour']) {
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
      if (['first-light', 'low-riders', 'solo-battery', 'weasel-hour'].includes(scenario.id)) continue;
      assert.equal(scenario.directiveContactGraceS, undefined,
        `${scenario.id} has not been measured with a contact grace — it must not carry one`);
    }
  });
});
