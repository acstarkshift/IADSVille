/**
 * The last watch.
 *
 * The final scenario is the campaign's argument: two raids a hundred and
 * seventeen kilometres apart, one set of rails with no resupply behind it, and
 * an order about which of the two places is allowed to matter. These tests
 * defend three properties — that every ending is reachable, that the game reads
 * your choice off what you actually shot at rather than asking you to declare
 * it, and that none of the endings is clean.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/engine/world.js';
import { scenarioById, SCENARIOS, FINALE_ID, isFinale } from '../src/engine/scenarios.js';
import { ENDINGS, endingFor, readFinale, composeEnding, endingSummary } from '../src/engine/endings.js';
import { createCharacter, districtOf, householdOf } from '../src/engine/character.js';
import { DIRECTIVES, issueDirective, answerDirective } from '../src/engine/command.js';
import { emptyCampaign, enlist, recordMission } from '../src/engine/campaign.js';
import { SAM_TYPES, ASSET_TYPES } from '../src/engine/config.js';
import { dist } from '../src/engine/math.js';

/** A finished result, shaped the way World produces one. */
const outcome = (villePct, palacePct, over = {}) => ({
  missionId: FINALE_ID,
  reason: 'raid-spent',
  finale: true,
  assets: [
    { type: 'town', label: 'THE VILLE', destroyed: villePct >= 100, damagePct: villePct, districtsHit: [] },
    { type: 'palace', label: 'PRESIDENTIAL PALACE', destroyed: palacePct >= 100, damagePct: palacePct },
  ],
  stats: {
    civilianCasualties: 200, homeDistrictHit: false,
    roundsByCluster: { ville: 8, capital: 14 }, roundsByAsset: {},
    roundsAgainstOrder: 0, postOverrun: false, displacedToSurvive: false,
    ...(over.stats ?? {}),
  },
  constraints: over.constraints ?? { palaceOrderAccepted: true },
});

describe('the scenario itself', () => {
  const finale = scenarioById(FINALE_ID);

  test('it is the last watch on the roster and it knows it', () => {
    // Everything unconditional ends here. The only scenario after it is the
    // epilogue, which does not appear at all unless the palace was held.
    const unconditional = SCENARIOS.filter((s) => !s.requiresEnding);
    assert.equal(unconditional.at(-1).id, FINALE_ID);
    assert.ok(isFinale(finale));
    assert.equal(finale.finale, true);
  });

  test('the two cities are far enough apart that no medium battery covers both', () => {
    const ville = finale.assets.find((a) => a.type === 'town').pos;
    const palace = finale.assets.find((a) => a.type === 'palace').pos;
    assert.ok(dist(ville, palace) > 100, 'the choice has to be geographic, not notional');

    for (const site of finale.sites) {
      const type = SAM_TYPES[site.type];
      if (type.id === 'bastion') continue;
      const coversBoth = dist(site.pos, ville) <= type.maxRangeKm
        && dist(site.pos, palace) <= type.maxRangeKm;
      assert.ok(!coversBoth, `${site.name} must not cover both cities`);
    }
  });

  test('exactly one battery can reach both, and it cannot hold both', () => {
    const ville = finale.assets.find((a) => a.type === 'town').pos;
    const palace = finale.assets.find((a) => a.type === 'palace').pos;
    const reachBoth = finale.sites.filter((s) => {
      const type = SAM_TYPES[s.type];
      return dist(s.pos, ville) <= type.maxRangeKm && dist(s.pos, palace) <= type.maxRangeKm;
    });
    assert.equal(reachBoth.length, 1, 'the tease is that there is one, and only one');

    const type = SAM_TYPES[reachBoth[0].type];
    const sorties = finale.waves.reduce((n, w) => n + (w.count ?? 1), 0);
    assert.ok(type.channels < sorties / 2,
      'and it has nowhere near the channels to fight both raids');
  });

  test('point defence is sited forward on the threat axes, not on the targets', () => {
    // A strike aircraft releases 18 km out. A 12 km section sitting on the
    // target covers to 16 and never gets a shot at anything before it drops.
    const ville = finale.assets.find((a) => a.type === 'town').pos;
    const palace = finale.assets.find((a) => a.type === 'palace').pos;
    const release = 18;
    for (const site of finale.sites.filter((s) => s.type === 'thistle')) {
      const type = SAM_TYPES[site.type];
      const covers = (target) => {
        const d = dist(site.pos, target);
        return d - type.maxRangeKm <= release && d + type.maxRangeKm >= release;
      };
      assert.ok(covers(ville) || covers(palace),
        `${site.name} must cover a release point for somewhere`);
    }
  });

  test('there is no resupply, so the rails are the whole allowance', () => {
    assert.equal(finale.supply.reloadsAllowed, false);
    const world = new World(finale, { role: 'net' });
    assert.ok(world.sites.every((s) => s.magazine === 0));
    assert.equal(world.reload(world.sites[0].id), false);
  });

  test('the scenario supply only ever tightens what the campaign granted', () => {
    const spoiled = new World(finale, {
      role: 'net',
      modifiers: { roundsMult: 1.3, reloadsAllowed: true },
    });
    assert.equal(spoiled.modifiers.reloadsAllowed, false,
      'a favoured operator still gets no resupply on this watch');
  });
});

describe('the order', () => {
  const world = () => new World(scenarioById(FINALE_ID), { role: 'net' });

  test('it arrives before the western axis could possibly be detected', () => {
    const w = world();
    const westernSpawn = Math.min(...w.pendingWaves
      .filter((p) => p.bearingDeg > 250 && p.bearingDeg < 320).map((p) => p.atS));
    assert.ok(DIRECTIVES.palacePriority.trigger({ ...w, t: 60 }));
    assert.ok(westernSpawn > 60,
      'you are asked to commit before you know what committing costs');
  });

  test('accepting it binds fires to the capital', () => {
    const w = world();
    issueDirective(w, DIRECTIVES.palacePriority);
    answerDirective(w, 'accepted');
    const palace = w.assets.find((a) => a.type === 'palace');
    assert.equal(w.command.constraints.priorityOfFiresId, palace.id);
    assert.equal(w.command.constraints.palaceOrderAccepted, true);
  });

  test('firing on the valley afterwards is recorded, and said out loud once', () => {
    const w = world();
    issueDirective(w, DIRECTIVES.palacePriority);
    answerDirective(w, 'accepted');

    w.registerRoundsSpent({ predictedAssetId: 'a_town' }, 2);
    assert.equal(w.stats.roundsAgainstOrder, 2);
    const shouted = w.events.filter((e) => /PRIORITY OF FIRES|DESIGNATED PRIORITY/.test(e.text)).length;
    assert.equal(shouted, 1);

    w.registerRoundsSpent({ predictedAssetId: 'a_town' }, 3);
    assert.equal(w.stats.roundsAgainstOrder, 5, 'the tally keeps running');
    assert.equal(w.events.filter((e) => /PRIORITY OF FIRES/.test(e.text)).length, 1,
      'but it is only announced once');
  });

  test('defending the capital’s other buildings is not a breach', () => {
    const w = world();
    issueDirective(w, DIRECTIVES.palacePriority);
    answerDirective(w, 'accepted');
    w.registerRoundsSpent({ predictedAssetId: 'a_ministry' }, 4);
    assert.equal(w.stats.roundsAgainstOrder, 0, 'the order names a place but means a side');
  });

  test('rounds are attributed by side, because the two are eleven km apart', () => {
    const w = world();
    w.registerRoundsSpent({ predictedAssetId: 'a_town' }, 3);
    w.registerRoundsSpent({ predictedAssetId: 'a_c2' }, 2);
    w.registerRoundsSpent({ predictedAssetId: 'a_palace' }, 5);
    assert.equal(w.stats.roundsByCluster.ville, 5, 'sector ops stands in the valley');
    assert.equal(w.stats.roundsByCluster.capital, 5);
  });

  test('saying nothing to this one costs more than saying nothing to a radio check', () => {
    const hinge = world();
    issueDirective(hinge, DIRECTIVES.palacePriority);
    const before = hinge.command.standing;
    hinge.t = hinge.command.pending.deadlineS + 1;
    hinge.step(0.1);
    const hingeCost = before - hinge.command.standing;

    const routine = world();
    issueDirective(routine, DIRECTIVES.explain);
    const routineBefore = routine.command.standing;
    routine.t = routine.command.pending.deadlineS + 1;
    routine.step(0.1);
    assert.ok(hingeCost > routineBefore - routine.command.standing);
  });
});

describe('the endings', () => {
  test('each outcome maps to its ending', () => {
    assert.equal(endingFor(outcome(90, 5)).id, 'obedient');
    assert.equal(endingFor(outcome(5, 90)).id, 'defiant');
    assert.equal(endingFor(outcome(55, 55)).id, 'divided');
    assert.equal(endingFor(outcome(10, 10)).id, 'exemplary');
    assert.equal(endingFor(outcome(95, 95)).id, 'collapse');
  });

  test('you cannot displace to survive and still be credited with both cities', () => {
    // The battery that reaches both is the one you moved. Whatever the damage
    // returns say, you were not there through the window that mattered.
    assert.equal(endingFor(outcome(10, 10, { stats: { displacedToSurvive: false } })).id, 'exemplary');
    assert.equal(endingFor(outcome(10, 10, { stats: { displacedToSurvive: true } })).id, 'divided');
  });

  test('every ending is reachable and distinct', () => {
    const ids = new Set(Object.values(ENDINGS).map((e) => e.id));
    assert.equal(ids.size, 7);
    for (const id of ids) assert.ok(endingSummary(id), `${id} has a summary`);
  });

  test('being overrun outranks everything else that happened', () => {
    // Nothing about the night matters to somebody who was not there for the end
    // of it, so the post falling decides the ending whatever the cities did.
    assert.equal(endingFor(outcome(0, 0, { stats: { postOverrun: true } })).id, 'overrun');
    assert.equal(endingFor(outcome(99, 99, { stats: { postOverrun: true } })).id, 'overrun');
  });

  test('saving only yourself is distinguished from simply failing', () => {
    const deliberate = outcome(95, 95, { stats: { displacedToSurvive: true } });
    const passive = outcome(95, 95, { stats: { displacedToSurvive: false } });
    assert.equal(endingFor(deliberate).id, 'survivor');
    assert.equal(endingFor(passive).id, 'collapse');
    // They produce identical damage returns and they are not the same act.
    assert.notEqual(ENDINGS.survivor.title, ENDINGS.collapse.title);
  });

  test('none of them is clean', () => {
    const character = createCharacter({ name: 'Тест', household: 'sister' });
    for (const ending of Object.values(ENDINGS)) {
      const composed = composeEnding(
        outcome(ending.id === 'defiant' || ending.id === 'exemplary' ? 5 : 90,
          ending.id === 'obedient' || ending.id === 'exemplary' ? 5 : 90),
        character,
      );
      assert.ok(composed.lines.length >= 4, `${composed.id} says enough`);
    }
    // The two that look like wins both carry a cost in the text itself.
    assert.ok(ENDINGS.obedient.lines(readFinale(outcome(90, 5)), character)
      .some((l) => /Ville|valley|lists/.test(l)), 'obedience is priced in the village');
    assert.ok(ENDINGS.exemplary.lines(readFinale(outcome(10, 10)), character)
      .some((l) => /political section|annotat/.test(l)), 'holding both draws suspicion');
  });

  test('the ending speaks to this soldier’s own household and quarter', () => {
    const character = createCharacter({ name: 'Тест', household: 'grandmother' });
    const composed = composeEnding(
      outcome(90, 5, { stats: { homeDistrictHit: true, roundsByCluster: {}, civilianCasualties: 300 } }),
      character,
    );
    const text = composed.lines.join(' ');
    assert.ok(text.includes(householdOf(character).en), 'it names who is there');
    assert.ok(text.includes(districtOf(character).en), 'and which quarter they are in');
  });

  test('turning narrative pressure off leaves a plain result, not a story', () => {
    const character = createCharacter({ name: 'Тест' });
    const plain = composeEnding(outcome(90, 5), character, { narrativePressure: false });
    assert.equal(plain.lines.length, 1);
    assert.match(plain.title, /^RESULT:/);
    assert.equal(plain.id, 'obedient');
  });

  test('obedience is rewarded and defiance is not, in the state’s arithmetic', () => {
    assert.ok(ENDINGS.obedient.standing > 0);
    assert.ok(ENDINGS.defiant.standing < -20);
    assert.ok(ENDINGS.collapse.standing < ENDINGS.defiant.standing);
  });
});

describe('the last watch, played', () => {
  /** Run the finale with everything free — the raid fights, nobody chooses. */
  function play({ answer = 'accepted' } = {}) {
    const character = createCharacter({ name: 'Тест', household: 'mother' });
    const campaign = emptyCampaign(character);
    const world = new World(scenarioById(FINALE_ID), { role: 'net', character });
    world.control.netIsHuman = false;
    for (const site of world.sites) world.setWeaponsState(site.id, 'free');
    let n = 0;
    while (world.phase === 'running' && n < 30000) {
      for (const radar of world.radars) if (radar.alive && !radar.siteId) radar.on = true;
      world.step(0.1);
      if (world.command.pending) world.answer(answer);
      n++;
    }
    return { world, campaign };
  }

  test('it terminates, scores, and produces an ending', () => {
    const { world } = play();
    assert.equal(world.phase, 'complete');
    assert.ok(world.outcome.finale);
    assert.ok(ENDINGS[world.outcome.endingId], `got ending ${world.outcome.endingId}`);
  });

  test('the ending is recorded in the campaign file', () => {
    const { world, campaign } = play();
    recordMission(campaign, world.outcome);
    assert.equal(campaign.ending, world.outcome.endingId);
  });

  test('doing nothing loses everything, including you', () => {
    const character = createCharacter({ name: 'Тест' });
    const world = new World(scenarioById(FINALE_ID), { role: 'net', character });
    for (const site of world.sites) world.setWeaponsState(site.id, 'hold');
    let n = 0;
    while (world.phase === 'running' && n < 40000) {
      for (const site of world.sites) {
        if (site.weaponsState !== 'hold') world.setWeaponsState(site.id, 'hold');
      }
      world.step(0.1);
      n++;
    }
    const read = readFinale(world.outcome);
    assert.ok(['collapse', 'overrun'].includes(world.outcome.endingId),
      `expected a total loss, got ${world.outcome.endingId}`);
    assert.ok(read.villeLost && read.palaceLost);
    assert.ok(read.casualties > 0);
  });

  test('being overrun does not spare the cities the rest of the raid', () => {
    // If the watch simply stopped when the post fell, losing your position
    // would protect everything else. The remainder is played out without you.
    const character = createCharacter({ name: 'Тест' });
    const world = new World(scenarioById(FINALE_ID), { role: 'net', character });
    for (const site of world.sites) world.setWeaponsState(site.id, 'hold');
    let n = 0;
    while (world.phase === 'running' && n < 40000) { world.step(0.1); n++; }
    if (world.outcome.endingId === 'overrun') {
      assert.equal(world.pendingWaves.length, 0, 'every wave was flown');
      // The engine's own predicate: an aircraft that is running, unchased, and
      // beyond everything that could still reach it is no longer in the fight.
      const stillFighting = world.aircraft.some((a) => world.holdsWatchOpen(a));
      assert.ok(!stillFighting, 'and the raid finished its work');
    }
  });

  test('saving all three stays the exception, not the way the watch normally goes', () => {
    /*
     * The load-bearing property of this scenario, and the one that is easiest
     * to break by accident: three things ask for the same rounds and there is
     * no arrangement of them that reliably serves all three.
     *
     * It is deliberately not asserted as "never". Both cities held and the post
     * still standing is a real outcome with a real ending written for it — an
     * ending that pointedly refuses to call it a victory. What must not happen
     * is that it becomes the ordinary result of delegating everything, which is
     * exactly what happened once when an unrelated fix stopped batteries
     * wasting a channel re-engaging tracks whose aircraft were already down.
     */
    let allThree = 0;
    const seeds = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'];
    for (const seed of seeds) {
      const world = new World(scenarioById(FINALE_ID), { role: 'net', seed });
      world.control.netIsHuman = false;
      for (const site of world.sites) world.setWeaponsState(site.id, 'free');
      let n = 0;
      while (world.phase === 'running' && n < 40000) {
        for (const radar of world.radars) if (radar.alive && !radar.siteId) radar.on = true;
        world.step(0.1);
        if (world.command.pending) world.answer('accepted');
        n++;
      }
      if (world.outcome.endingId === 'exemplary') allThree++;
    }
    assert.ok(allThree <= seeds.length / 3,
      `both cities and the post came through on ${allThree} of ${seeds.length} seeds with everything`
      + ' delegated; the raid is no longer big enough for the choice to be a choice');
  });

  test('the sector reports which quarter of the Ville was struck', () => {
    const { world } = play();
    const ville = world.assets.find((a) => a.type === 'town');
    if (ville.damage > 0) {
      assert.ok(ville.districtsHit.length > 0, 'damage is located, not just totalled');
      assert.ok(world.events.some((e) => /КВАРТАЛ|STRUCK/.test(e.text)));
    }
  });
});
