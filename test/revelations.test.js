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

  test('the ledger does not grieve for a place the freeze has struck off', () => {
    /*
     * The inversion this guards against, measured before the fix: obeying the
     * freeze scored WORSE standing than defending, because every weapon that
     * arrived at the hospital was billed at the full leaker rate — the state
     * charging its own ledger for a place it had just declared undesignated.
     * A leaker now bills in proportion to the state's valuation, and a
     * freeze-excluded place bills nothing at all, loss included.
     */
    const w = world();
    issueDirective(w, DIRECTIVES.expenditureFreeze);
    answerDirective(w, 'accepted');
    const hospital = w.assets.find((a) => a.type === 'hospital');
    const before = w.command.standing;
    w.registerLeaker({ name: 'R-101' }, hospital);
    w.registerLeaker({ name: 'R-102' }, hospital);
    assert.equal(w.command.standing, before, 'weapons on the struck-off place cost the file nothing');
    assert.equal(w.stats.leakers, 2, 'the score still counts every one of them');

    w.damageAsset(hospital, ASSET_TYPES.hospital.hp + 1, null);
    assert.equal(w.command.standing, before, 'and losing it outright costs the file nothing either');

    // The bridge is a designated place; releasing on it still costs full rate.
    const bridge = w.assets.find((a) => a.type === 'bridge');
    if (bridge) {
      w.registerLeaker({ name: 'R-103' }, bridge);
      assert.ok(w.command.standing < before, 'a designated place is still billed');
    }
  });

  test('the freeze prices the three roads with the right signs', () => {
    // The campaign's central table depends on these signs: obeying must be
    // free, quiet defence billed, and the word "no" billed hardest. Settle
    // credits are the same night-to-night noise on every road, so this pins
    // the road-specific charges themselves; the full-sim margin is measured
    // separately and written into the README table.
    const charges = (w, keep) => w.command.ledger
      .filter((l) => keep(l.reason)).reduce((n, l) => n + l.charged, 0);

    const obeyed = world();
    issueDirective(obeyed, DIRECTIVES.expenditureFreeze);
    answerDirective(obeyed, 'accepted');
    const hospital = obeyed.assets.find((a) => a.type === 'hospital');
    for (let i = 0; i < 4; i++) obeyed.registerLeaker({ name: `R-${i}` }, hospital);
    obeyed.damageAsset(hospital, 500, null);
    settleDirectives(obeyed);
    assert.equal(charges(obeyed, (r) => /hospital|released on|civilian area/i.test(r)), 0,
      'obedience costs the file nothing at all');

    const defended = world();
    issueDirective(defended, DIRECTIVES.expenditureFreeze);
    answerDirective(defended, 'accepted');
    defended.registerRoundsSpent({ predictedAssetId: 'a_hospital' }, 6);
    settleDirectives(defended);
    const breach = charges(defended, (r) => /outside the freeze/i.test(r));
    assert.ok(breach < 0, 'quiet defence is billed');

    const refused = world();
    issueDirective(refused, DIRECTIVES.expenditureFreeze);
    answerDirective(refused, 'refused');
    settleDirectives(refused);
    const refusal = charges(refused, (r) => /refus/i.test(r) && /freeze/i.test(r));
    assert.ok(refusal < breach, 'and the word "no" costs more than the deed');
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
    learn(campaign, 'reinforce-the-capital');
    const district = standing(campaign);
    learn(campaign, 'two-cities');
    const final = standing(campaign);

    assert.notEqual(early, later);
    assert.notEqual(later, district);
    assert.notEqual(district, final);
    assert.match(district, /household effects/);
    assert.match(final, /where the rounds went/);
    assert.equal(knownRevelations(campaign).length, 4);
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

  test('the movement order re-reads both watches about the capital', () => {
    // The freight left before the threat was written down. An operator who has
    // read that order hears "priority of fires: the palace" as an address, and
    // watches the loading at Demobodedovo as the completion of paperwork.
    const movement = REVELATIONS.movement;
    assert.equal(movement.after, 'reinforce-the-capital',
      'it is learned on the watch that took the battalion');
    assert.match(movement.lines.join(' '), /dated two days after the freight left/);
    assert.match(scenarioById('two-cities').briefIfKnown.movement.join(' '), /the address/);
    assert.match(scenarioById('presidents-flight').briefIfKnown.movement.join(' '), /schedule/);
  });
});

describe('the border order', () => {
  const world = () => new World(scenarioById('across-the-line'), { role: 'net' });

  test('the camp is inside a battery envelope, so refusing is a real option', () => {
    // The brief says you could have stopped it. That has to be true, or the
    // watch is asking the player to feel bad about a foregone conclusion.
    const scenario = scenarioById('across-the-line');
    const camp = scenario.assets.find((a) => a.type === 'camp');
    const canReach = scenario.sites.filter((s) =>
      dist(s.pos, camp.pos) <= SAM_TYPES[s.type].maxRangeKm);
    assert.ok(canReach.length >= 2, `expected at least two batteries to hold it, got ${canReach.length}`);
  });

  test('and both batteries can reach the HEIGHT the strays come in at', () => {
    /*
     * The half of "you could have stopped it" that nobody had ever asserted,
     * and that the shipped table failed.
     *
     * An envelope is a shell, not a circle. The strays used to fly at 110 m and
     * 95 m; BASTION's floor is 120 m. So the battery the briefing names in the
     * same breath as "reaches it with sixty to spare" could not legally engage
     * either one at any range, ever, and the only seconds in which the console
     * said otherwise were the altitude estimate's own noise lifting the target
     * over a floor it was under. The watch's whole moral hinge — that this is a
     * decision and not a physics problem — was false in the range column's
     * blind spot.
     */
    const scenario = scenarioById('across-the-line');
    const camp = scenario.assets.find((a) => a.type === 'camp');
    for (const wave of scenario.waves.filter((w) => w.targetAssetId === camp.id)) {
      const altM = wave.altM ?? 0;
      const canTake = scenario.sites.filter((s) => {
        const type = SAM_TYPES[s.type];
        return dist(s.pos, camp.pos) <= type.maxRangeKm
          && altM >= type.minAltM && altM <= type.maxAltM;
      });
      assert.ok(canTake.length >= 2,
        `${wave.name ?? wave.type} comes in at ${altM} m, which only ${canTake.length}`
        + ' battery/batteries can legally engage over the camp');
    }
  });

  test('the camp is on the far side of the border', () => {
    const camp = scenarioById('across-the-line').assets.find((a) => a.type === 'camp');
    const nearest = MAP.border.reduce((best, b) =>
      Math.abs(b.y - camp.pos.y) < Math.abs(best.y - camp.pos.y) ? b : best);
    assert.ok(camp.pos.x < nearest.x, 'the whole watch depends on it being outside the country');
  });

  test('sector command values it at nothing and the score values it most', () => {
    assert.equal(ASSET_TYPES.camp.value, 0, 'the ledger does not recognise it at all');
    assert.ok(ASSET_TYPES.camp.scoreValue >= ASSET_TYPES.palace.value,
      'and it is worth as much as anything on the board');
  });

  test('firing across the border costs less than refusing to be told not to', () => {
    const fired = world();
    issueDirective(fired, DIRECTIVES.borderRestriction);
    answerDirective(fired, 'accepted');
    fired.registerRoundsSpent({ predictedAssetId: 'a_camp' }, 4);
    const beforeSettle = fired.command.standing;
    settleDirectives(fired);
    const costOfFiring = beforeSettle - fired.command.standing;

    const refused = world();
    issueDirective(refused, DIRECTIVES.borderRestriction);
    const beforeRefusal = refused.command.standing;
    answerDirective(refused, 'refused');
    assert.ok(beforeRefusal - refused.command.standing > costOfFiring,
      'again: they punish saying no, not doing it');
  });

  test('the engagement across the border is announced exactly once', () => {
    const w = world();
    issueDirective(w, DIRECTIVES.borderRestriction);
    answerDirective(w, 'accepted');
    w.registerRoundsSpent({ predictedAssetId: 'a_camp' }, 2);
    w.registerRoundsSpent({ predictedAssetId: 'a_camp' }, 2);
    assert.equal(w.stats.roundsAcrossBorder, 4);
    assert.equal(w.events.filter((e) => /NATIONAL TERRITORY/.test(e.text)).length, 1);
  });
});

describe('the order to engage the civil transit', () => {
  /** Get a world with the transit airborne and identified. */
  function withTransit() {
    const w = new World(scenarioById('ville-under-fire'), { role: 'net' });
    for (const radar of w.radars) radar.on = true;
    for (let i = 0; i < 3000; i++) w.step(0.1);
    return { w, civ: w.aircraft.find((a) => a.alive && a.type === 'civil') };
  }

  test('it only exists on a watch that declares it', () => {
    assert.equal(scenarioById('ville-under-fire').civilOrder, true);
    assert.notEqual(scenarioById('first-light').civilOrder, true);
  });

  test('sector command stops telling you to keep clear of it once it has told you to shoot it', () => {
    const w = new World(scenarioById('ville-under-fire'), { role: 'net' });
    w.command.issuedOnce.engageCivil = true;
    assert.equal(DIRECTIVES.civilCorridor.trigger(w), false,
      'an order to hold fire around an aircraft you were told to destroy is command arguing with itself');
  });

  test('complying raises your standing and wrecks the score', () => {
    const { w, civ } = withTransit();
    assert.ok(civ, 'the transit is airborne');
    issueDirective(w, DIRECTIVES.engageCivil);
    answerDirective(w, 'accepted');
    const before = w.command.standing;
    w.killAircraft(civ, null);
    w.finish('raid-spent');

    assert.ok(w.command.standing >= before,
      'the file does not merely forgive it, it approves');
    assert.notEqual(w.outcome.tierLabel, 'REFERRED', 'no referral, because you were told to');
    assert.ok(w.outcome.breakdown.civilian <= -400, 'the score is unmoved by any of that');
  });

  test('refusing costs standing and nothing else', () => {
    /*
     * Read off the LEDGER, not off the balance.
     *
     * `withTransit` flies five minutes of the main-effort watch with every set
     * up and nobody assigning anything, which is a night bad enough to put the
     * account on its floor before the political section transmits — and at the
     * floor every further charge clamps to zero, so the balance stops moving
     * while the state goes on billing. That is deliberate engine behaviour
     * (`standingDelta` keeps the un-floored figure as `charged` for exactly
     * this reason, and the debrief shows it). The property under test is that
     * refusal is CHARGED; asserting it against the balance was asserting that
     * this particular scripted night happens not to end in disgrace.
     */
    const { w } = withTransit();
    issueDirective(w, DIRECTIVES.engageCivil);
    const before = w.command.standing;
    const entries = w.command.ledger.length;
    answerDirective(w, 'refused');
    const charged = w.command.ledger.slice(entries).reduce((n, e) => n + e.charged, 0);
    assert.ok(charged < 0, 'refusing the order is billed');
    assert.ok(w.command.standing <= before);
    w.finish('raid-spent');
    assert.equal(w.stats.civilianAircraftShot, 0);
    /*
     * "Nothing else" means no SHOOT-DOWN. The civilian column also carries the
     * town's dead at two points a head, and this scripted night — five minutes
     * of the main-effort watch with nobody assigning anything — now has some,
     * because the watch opens with three missiles on the deck aimed at the
     * town. Asserting the whole column was nought was asserting that the raid
     * never reaches the Ville, which is a claim about the wave table and not
     * about the order. The four-hundred-point term is the one this test is
     * for, and it is checked exactly.
     */
    assert.equal(w.outcome.breakdown.civilian, -2 * w.stats.civilianCasualties,
      'the penalty is the dead on the ground and nothing from a round of ours');
  });

  test('acknowledging and then not doing it is noticed', () => {
    const { w } = withTransit();
    issueDirective(w, DIRECTIVES.engageCivil);
    answerDirective(w, 'accepted');
    const before = w.command.standing;
    w.finish('raid-spent');
    assert.ok(w.command.standing < before,
      'saying yes and quietly not doing it is its own entry');
  });

  test('an unordered shoot-down is still unforgivable', () => {
    // The rule has not been softened. It has been shown to be conditional.
    const { w, civ } = withTransit();
    w.command.standing = 95;
    w.killAircraft(civ, null);
    w.finish('raid-spent');
    assert.ok(w.command.standing <= 12, 'without the order, the ceiling still falls');
  });
});
