/**
 * The console's controls: what they answer to, and what leaving costs.
 *
 * Three rules the interface used to break, all of them reachable without a
 * browser because the rules themselves are data:
 *
 *  - a watch that was walked out of is not a watch that was won;
 *  - a number key means the number printed on the cap;
 *  - a control a watch has removed is removed from the key map too.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { World } from '../src/engine/world.js';
import { scenarioById, consoleCaps } from '../src/engine/scenarios.js';
import { emptyCampaign, enlist, recordMission } from '../src/engine/campaign.js';
import { SPEED_BY_KEY, digitPressed } from '../src/ui/keymap.js';

const watch = (id, opts = {}) => new World(scenarioById(id), { role: 'net', seed: 5, ...opts });

describe('leaving the post', () => {
  test('an abandoned watch is not a victory, and pays nothing', () => {
    const world = watch('first-light');
    world.step(0.1);
    world.finish('aborted');

    const r = world.outcome;
    assert.equal(r.abandoned, true);
    assert.equal(r.success, false, 'walking out must not read as SECTOR HELD');
    assert.equal(r.headline, 'WATCH ABANDONED');
    assert.ok(r.score <= 0, `an abandoned watch scores nothing, got ${r.score}`);
    assert.equal(r.breakdown.assets, 0, 'the ground-preserved award is for ground defended');
    assert.equal(r.breakdown.turnedBack, 0);
    assert.match(r.cause, /LEFT THE POST/);
  });

  test('the file records the abandonment and banks nothing else', () => {
    const campaign = emptyCampaign();
    enlist(campaign, { name: 'Test', background: 'academy', household: 'mother' });
    const before = { xp: campaign.character.xp, rank: campaign.character.rankIndex };

    const world = watch('first-light');
    world.step(0.1);
    world.finish('aborted');
    const entry = recordMission(campaign, world.outcome);

    assert.equal(campaign.character.xp, before.xp, 'no experience for a watch not stood');
    assert.equal(campaign.character.rankIndex, before.rank);
    assert.equal(campaign.completed['first-light'], undefined,
      'an abandoned watch must not open the next echelon');
    assert.equal(entry.service, null);
    assert.equal(entry.letter, null);
    assert.equal(entry.appointment, null);
    assert.equal(campaign.history.length, 1, 'it is still written down');
    assert.equal(campaign.history[0].abandoned, true);
  });

  test('repeating it never opens the roster', () => {
    const campaign = emptyCampaign();
    enlist(campaign, { name: 'Test', background: 'academy', household: 'mother' });
    for (let i = 0; i < 3; i++) {
      const world = watch('first-light');
      world.step(0.1);
      world.finish('aborted');
      recordMission(campaign, world.outcome);
    }
    assert.deepEqual(Object.keys(campaign.completed), []);
    assert.equal(campaign.character.xp, 0);
    assert.equal(campaign.appointment, 'battalion');
  });

  test('abandoning the finale composes no ending at all', () => {
    const world = watch('two-cities');
    world.step(0.1);
    world.finish('aborted');

    assert.equal(world.outcome.finale, false, 'the ending is read off a night that happened');
    assert.equal(world.outcome.endingId, null);
    assert.equal(world.endingId ?? null, null);

    const campaign = emptyCampaign();
    enlist(campaign, { name: 'Test' });
    recordMission(campaign, world.outcome);
    assert.equal(campaign.ending, null, 'the campaign must not end because somebody left');
  });

  test('a watch fought to its end is unaffected', () => {
    const world = watch('first-light');
    world.finish('raid-spent');
    assert.equal(world.outcome.abandoned, false);
    assert.equal(world.outcome.success, true);
    assert.ok(world.outcome.score > 0);
  });
});

describe('the number row', () => {
  test('a digit is read off the physical key, shifted or not', () => {
    assert.equal(digitPressed({ key: '1', code: 'Digit1' }), 1);
    // The one that mattered: Shift+1 on a US board delivers '!'.
    assert.equal(digitPressed({ key: '!', code: 'Digit1' }), 1);
    assert.equal(digitPressed({ key: '$', code: 'Digit4' }), 4);
    assert.equal(digitPressed({ key: '3', code: 'Numpad3' }), 3);
    // And still works when only the character survives the trip.
    assert.equal(digitPressed({ key: '!' }), 1);
    assert.equal(digitPressed({ key: 'x', code: 'KeyX' }), null);
  });

  test('the key selects the speed printed on its cap', () => {
    assert.equal(SPEED_BY_KEY[1], 1);
    assert.equal(SPEED_BY_KEY[2], 2);
    assert.equal(SPEED_BY_KEY[4], 4, 'pressing 4 must select 4×, not stop the raid');
    assert.equal(SPEED_BY_KEY[0], 0);
    assert.equal(SPEED_BY_KEY[3], undefined, 'there is no 3× speed, so there is no 3 key');
  });
});

describe('the console a watch actually fits', () => {
  test('the teaching watch carries none of the three optional caps', () => {
    const caps = consoleCaps(scenarioById('first-light'));
    assert.deepEqual(
      { salvo: caps.salvo, ride: caps.ride, displace: caps.displace },
      { salvo: false, ride: false, displace: false },
    );
  });

  test('displacement appears where something hunts the position', () => {
    assert.equal(consoleCaps(scenarioById('weasel-hour')).displace, true);
    assert.equal(consoleCaps(scenarioById('solo-battery')).displace, false,
      'nothing in that raid carries an anti-radiation round');
  });

  test('a scenario with no console notes still answers', () => {
    const caps = consoleCaps(undefined);
    assert.equal(caps.salvo, true);
    assert.equal(caps.displace, false);
  });
});
