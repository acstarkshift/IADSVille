/**
 * The arc, and the watch it turns on.
 *
 * Two claims are defended here. First, that the hospital watch produces a real
 * divergence between what sector command's ledger records and what the operator
 * can see is true — obeying the freeze must be nearly free in standing and
 * expensive in everything else, or the moral point is just text. Second, that
 * the revelations arrive in order, once each, and change what later briefings
 * say.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/engine/world.js';
import { scenarioById, SCENARIOS } from '../src/engine/scenarios.js';
import { ASSET_TYPES, DEFENCE_CLASSES, SAM_TYPES, COMMAND } from '../src/engine/config.js';
import { DIRECTIVES, issueDirective, answerDirective, settleDirectives } from '../src/engine/command.js';
import { REVELATIONS, revelationAfter, learn, knownRevelations, standing } from '../src/engine/revelations.js';
import { emptyCampaign, enlist, recordMission } from '../src/engine/campaign.js';
import { predictedTarget } from '../src/engine/threat.js';
import { MAP } from '../src/engine/geography.js';
import { dist } from '../src/engine/math.js';

describe('the four classes of air defence', () => {
  test('one system of each class is fielded, and they layer', () => {
    const byClass = Object.values(SAM_TYPES).reduce((m, t) => ({ ...m, [t.class]: t }), {});
    assert.deepEqual(Object.keys(DEFENCE_CLASSES).sort(), Object.keys(byClass).sort());

    const ranges = ['guns', 'short', 'medium', 'long'].map((c) => byClass[c].maxRangeKm);
    for (let i = 1; i < ranges.length; i++) {
      assert.ok(ranges[i] > ranges[i - 1], 'each class reaches further than the last');
    }
    // Each class covers inside the next one up's minimum, or there is a gap.
    assert.ok(byClass.guns.minRangeKm < byClass.short.minRangeKm);
    assert.ok(byClass.short.maxRangeKm > byClass.medium.minRangeKm);
    assert.ok(byClass.medium.maxRangeKm > byClass.long.minRangeKm);
  });

  test('only the guns can engage something directly overhead', () => {
    assert.ok(SAM_TYPES.hammer.minRangeKm < 0.5);
    assert.ok(SAM_TYPES.thistle.minRangeKm >= 0.5);
  });
});

describe('the map', () => {
  test('the river passes under the bridge the raids keep attacking', () => {
    const bridge = { x: 23, y: -9 };
    const nearest = Math.min(...MAP.rivers[0].points.map((p) => dist(p, bridge)));
    assert.ok(nearest < 0.5, `the crossing has to be on the river, got ${nearest} km`);
  });

  test('the trunk road is longer than the direct distance, as roads are', () => {
    const road = MAP.roads[0].points;
    const along = road.slice(1).reduce((n, p, i) => n + dist(road[i], p), 0);
    const direct = dist(road[0], road.at(-1));
    assert.ok(along > direct, 'a road that is shorter than a straight line is not a road');
    assert.ok(along < direct * 1.4, 'nor is it a detour');
  });

  test('the capital on the map is where the capital is in the scenario', () => {
    const mapped = MAP.settlements.find((s) => s.capital);
    const scenario = scenarioById('two-cities').assets.find((a) => a.type === 'palace');
    assert.ok(dist(mapped.pos, scenario.pos) < 1, 'the map and the sector agree where Mostrograd is');
  });
});

describe('where a contact is going', () => {
  test('is decided by its course, not by what the ministry values', () => {
    const world = new World(scenarioById('economy-of-force'), { role: 'net' });
    const hospital = world.assets.find((a) => a.type === 'hospital');
    const airbase = world.assets.find((a) => a.type === 'airbase');
    assert.ok(ASSET_TYPES.airbase.value > ASSET_TYPES.hospital.value,
      'the airbase is worth more on paper — that is the trap this guards against');

    // A track flying straight down the Kubin road at the hospital.
    const heading = {
      pos: { x: hospital.pos.x - 60, y: hospital.pos.y + 24 },
      vel: { x: 0.24 * 0.93, y: -0.24 * 0.37 },
    };
    const prediction = predictedTarget(world, heading);
    assert.equal(prediction.asset.id, hospital.id,
      `expected the hospital, got ${prediction.asset.label}`);
    assert.notEqual(prediction.asset.id, airbase.id);
  });
});

describe('the expenditure freeze', () => {
  const world = () => new World(scenarioById('economy-of-force'), { role: 'net' });

  test('it holds the net on its own watch, ahead of routine traffic', () => {
    const w = world();
    for (const radar of w.radars) radar.on = true;
    let first = null;
    for (let i = 0; i < 3000 && !first; i++) {
      w.step(0.1);
      if (w.command.pending) first = w.command.pending;
    }
    assert.equal(first.id, 'expenditureFreeze',
      'an order about leakers must not sit ahead of the one this watch is about');
  });

  test('accepting it excludes the hospital by name', () => {
    const w = world();
    issueDirective(w, DIRECTIVES.expenditureFreeze);
    answerDirective(w, 'accepted');
    const hospital = w.assets.find((a) => a.type === 'hospital');
    assert.equal(w.command.constraints.freezeExcludedId, hospital.id);
  });

  test('rounds spent on it are counted, and announced exactly once', () => {
    const w = world();
    issueDirective(w, DIRECTIVES.expenditureFreeze);
    answerDirective(w, 'accepted');

    w.registerRoundsSpent({ predictedAssetId: 'a_hospital' }, 2);
    w.registerRoundsSpent({ predictedAssetId: 'a_hospital' }, 2);
    assert.equal(w.stats.roundsAgainstFreeze, 4);
    assert.equal(w.events.filter((e) => /FREEZE/.test(e.text)).length, 1);
  });

  test('defending the hospital is nearly free, and refusing the order is not', () => {
    // This asymmetry is the entire watch: the state does not punish what you
    // did, it punishes having said no.
    const defied = world();
    issueDirective(defied, DIRECTIVES.expenditureFreeze);
    answerDirective(defied, 'accepted');
    defied.registerRoundsSpent({ predictedAssetId: 'a_hospital' }, 6);
    const beforeSettle = defied.command.standing;
    settleDirectives(defied);
    const costOfDefending = beforeSettle - defied.command.standing;

    const refused = world();
    issueDirective(refused, DIRECTIVES.expenditureFreeze);
    const beforeRefusal = refused.command.standing;
    answerDirective(refused, 'refused');
    const costOfRefusing = beforeRefusal - refused.command.standing;

    assert.ok(costOfRefusing > costOfDefending,
      `refusing (${costOfRefusing}) must cost more than quietly doing it (${costOfDefending})`);
  });

  test('the hospital is worth almost nothing to the ledger and a great deal to the score', () => {
    const type = ASSET_TYPES.hospital;
    assert.ok(type.scoreValue > type.value * 5,
      'the two valuations must visibly disagree');
    assert.ok(type.value < ASSET_TYPES.bridge.value,
      'sector command rates it below a river crossing');
  });

  test('losing it wrecks the score without troubling the standing', () => {
    const kept = world();
    const lost = world();
    const hospital = lost.assets.find((a) => a.type === 'hospital');
    lost.damageAsset(hospital, ASSET_TYPES.hospital.hp + 1, null);

    kept.finish('raid-spent');
    lost.finish('raid-spent');

    assert.ok(lost.outcome.score < kept.outcome.score - 400, 'the score notices');
    assert.ok(kept.command.standing - lost.command.standing < 30,
      'the file barely does');
  });
});

describe('the revelations', () => {
  test('each is keyed to a watch that exists, in campaign order', () => {
    const order = SCENARIOS.map((s) => s.id);
    let last = -1;
    for (const revelation of Object.values(REVELATIONS)) {
      const at = order.indexOf(revelation.after);
      assert.ok(at >= 0, `${revelation.id} is keyed to a real watch`);
      assert.ok(at > last, `${revelation.id} comes after the one before it`);
      last = at;
    }
  });

  test('they are learned once each, on finishing the right watch', () => {
    const campaign = emptyCampaign();
    assert.equal(learn(campaign, 'first-light'), null, 'most watches teach you nothing');

    const first = learn(campaign, 'economy-of-force');
    assert.equal(first.id, 'freeze');
    assert.equal(learn(campaign, 'economy-of-force'), null, 'and never twice');
    assert.deepEqual(campaign.revelations, ['freeze']);
  });

  test('what the operator understands changes as they accumulate', () => {
    const campaign = emptyCampaign();
    assert.equal(standing(campaign), null, 'at the start there is nothing to know');

    learn(campaign, 'economy-of-force');
    const early = standing(campaign);
    learn(campaign, 'ville-under-fire');
    const later = standing(campaign);
    learn(campaign, 'two-cities');
    const final = standing(campaign);

    assert.notEqual(early, later);
    assert.notEqual(later, final);
    assert.match(final, /where the rounds went/);
    assert.equal(knownRevelations(campaign).length, 3);
  });

  test('the arc lands through the campaign, not beside it', () => {
    const campaign = emptyCampaign();
    enlist(campaign, { name: 'Тест', background: 'factory' });
    const entry = recordMission(campaign, {
      missionId: 'economy-of-force', role: 'net', score: 900, standing: 70,
      stats: { leakers: 1, kills: 5, assetsLost: 0 },
    });
    assert.equal(entry.revelation.id, 'freeze', 'the debrief is handed it to show');
    assert.deepEqual(campaign.revelations, ['freeze']);
  });

  test('the last watch reads differently once you have seen the returns', () => {
    const finale = scenarioById('two-cities');
    assert.ok(finale.briefIfKnown.ledger, 'the depots line has a second reading');
    assert.match(finale.briefIfKnown.ledger.join(' '), /depot returns/);
  });
});
