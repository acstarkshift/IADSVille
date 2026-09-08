/**
 * Sector command, standing, and the campaign file.
 *
 * The pressure from above is a mechanic, so it gets tested like one: accepting
 * an order has to bind you, refusing has to cost, silence has to cost more, and
 * the consequences have to survive the mission and change the next one.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/engine/world.js';
import { scenarioById } from '../src/engine/scenarios.js';
import {
  DIRECTIVES, issueDirective, answerDirective, stepCommand, standingDelta,
  tierFor, settleDirectives,
} from '../src/engine/command.js';
import { COMMAND } from '../src/engine/config.js';
import { commanderWillEngage } from '../src/engine/doctrine.js';
import { createAircraft } from '../src/engine/ai.js';
import {
  emptyCampaign, recordMission, consequenceFor, briefingNote,
  memoryStore, saveCampaign, loadCampaign,
} from '../src/engine/campaign.js';

const world = (options = {}) => new World(scenarioById('weasel-hour'), { role: 'net', ...options });

describe('standing', () => {
  test('moves and is recorded with a reason', () => {
    const w = world();
    const before = w.command.standing;
    w.standingDelta(-5, 'test entry');
    assert.equal(w.command.standing, before - 5);
    assert.equal(w.command.ledger.at(-1).reason, 'test entry');
  });

  test('is bounded at both ends', () => {
    const w = world();
    w.standingDelta(-999, 'catastrophe');
    assert.equal(w.command.standing, COMMAND.minStanding);
    w.standingDelta(999, 'miracle');
    assert.equal(w.command.standing, COMMAND.maxStanding);
  });

  test('difficulty amplifies losses but not gains', () => {
    const easy = world({ difficulty: 'rookie' });
    const hard = world({ difficulty: 'nightmare' });
    easy.standingDelta(-10, 'x');
    hard.standingDelta(-10, 'x');
    assert.ok(easy.command.standing > hard.command.standing);

    const easyGain = world({ difficulty: 'rookie' });
    const hardGain = world({ difficulty: 'nightmare' });
    easyGain.standingDelta(10, 'x');
    hardGain.standingDelta(10, 'x');
    assert.equal(easyGain.command.standing, hardGain.command.standing);
  });

  test('tiers cover the whole scale in order', () => {
    assert.equal(tierFor(100).id, 'commended');
    assert.equal(tierFor(60).id, 'satisfactory');
    assert.equal(tierFor(40).id, 'noted');
    assert.equal(tierFor(20).id, 'flagged');
    assert.equal(tierFor(0).id, 'condemned');
  });
});

describe('directives', () => {
  test('accepting costs nothing and binds you', () => {
    const w = world();
    issueDirective(w, DIRECTIVES.radiate);
    assert.ok(w.command.pending);
    const before = w.command.standing;
    answerDirective(w, 'accepted');
    assert.equal(w.command.pending, null);
    assert.ok(w.command.standing > before, 'compliance is rewarded');
    assert.ok(w.command.constraints.mustRadiateUntilS > w.t, 'and it binds');
  });

  test('refusing costs standing immediately', () => {
    const w = world();
    issueDirective(w, DIRECTIVES.radiate);
    const before = w.command.standing;
    answerDirective(w, 'refused');
    assert.ok(w.command.standing < before);
    assert.equal(w.command.log.at(-1).state, 'refused');
  });

  test('saying nothing costs more than refusing', () => {
    const refuse = world();
    issueDirective(refuse, DIRECTIVES.radiate);
    const refuseBefore = refuse.command.standing;
    answerDirective(refuse, 'refused');
    const refuseCost = refuseBefore - refuse.command.standing;

    const ignore = world();
    issueDirective(ignore, DIRECTIVES.radiate);
    const ignoreBefore = ignore.command.standing;
    ignore.t = ignore.command.pending.deadlineS + 1;
    stepCommand(ignore, 0.1);
    const ignoreCost = ignoreBefore - ignore.command.standing;

    assert.ok(ignoreCost > refuseCost, 'silence on the net is its own answer');
    assert.equal(ignore.command.log.at(-1).state, 'ignored');
  });

  test('only one directive is pending at a time', () => {
    const w = world();
    issueDirective(w, DIRECTIVES.radiate);
    const second = issueDirective(w, DIRECTIVES.noLeakers);
    assert.equal(second, null, 'sector command does not talk over itself');
  });

  test('an accepted emissions order is enforced later, once', () => {
    const w = world();
    issueDirective(w, DIRECTIVES.radiate);
    answerDirective(w, 'accepted');
    for (const radar of w.radars) radar.on = false;

    const before = w.command.standing;
    for (let i = 0; i < 200; i++) { w.t += 0.1; stepCommand(w, 0.1); }
    assert.ok(w.command.standing < before, 'going dark against the order is caught');

    const afterFirst = w.command.standing;
    for (let i = 0; i < 200; i++) { w.t += 0.1; stepCommand(w, 0.1); }
    assert.equal(w.command.standing, afterFirst, 'and charged once, not every tick');
  });

  test('narrative pressure only changes the wording, never the mechanics', () => {
    const loud = world({ narrativePressure: true });
    const plain = world({ narrativePressure: false });
    issueDirective(loud, DIRECTIVES.radiate);
    issueDirective(plain, DIRECTIVES.radiate);
    assert.notEqual(loud.command.pending.text, plain.command.pending.text);

    answerDirective(loud, 'accepted');
    answerDirective(plain, 'accepted');
    assert.equal(loud.command.standing, plain.command.standing);
    assert.equal(
      loud.command.constraints.mustRadiateUntilS,
      plain.command.constraints.mustRadiateUntilS,
    );
  });

  test('a conserve order actually restricts salvo size', () => {
    const w = world();
    for (const site of w.sites) w.setSalvo(site.id, 2);
    issueDirective(w, DIRECTIVES.conserve);
    answerDirective(w, 'accepted');
    assert.ok(w.sites.every((s) => s.salvoSize === 1));
    w.setSalvo(w.sites[0].id, 2);
    assert.equal(w.sites[0].salvoSize, 1, 'and keeps restricting it afterwards');
  });

  /*
   * Four orders were, at one point or another, written into the constraints
   * and read by nothing at all — a pulsing red banner with a timer on it that
   * could be neither obeyed nor violated. Each of these pins the wire, not the
   * balance: does accepting this order reach the mechanism it names?
   */
  test('a routine priority of fires writes the key the engine reads', () => {
    const w = world();
    const target = DIRECTIVES.priority.pick(w);
    issueDirective(w, DIRECTIVES.priority);
    answerDirective(w, 'accepted');
    assert.equal(w.command.constraints.priorityOfFiresId, target.id,
      'the officers, the reserve and the round accounting all read this one key');
  });

  test('an order that names a place stamps when it named it, so the map can say so', () => {
    const w = world();
    w.t = 210;
    issueDirective(w, DIRECTIVES.priority);
    answerDirective(w, 'accepted');
    assert.equal(w.command.constraints.priorityDesignatedAtS, 210,
      'the scope flashes the designated place for ten seconds from here, then holds it red');

    issueDirective(w, DIRECTIVES.noLeakers);
    answerDirective(w, 'accepted');
    assert.equal(w.command.constraints.riverLineAtS, 210,
      'and the river line the order names is marked on the map from the same moment');
  });

  test('an accepted border restriction stands the subordinates down, not just the tally', () => {
    const w = new World(scenarioById('across-the-line'), { role: 'net' });
    const camp = w.assets.find((a) => a.type === 'camp');
    const formation = w.formations.find((f) => !f.hq) ?? w.formations[0];
    const onTheCamp = { predictedAssetId: camp.id, pos: { x: 0, y: 60 }, hostility: 'hostile' };
    assert.equal(commanderWillEngage(w, formation, onTheCamp), true, 'before the order, it is a target');
    issueDirective(w, DIRECTIVES.borderRestriction);
    answerDirective(w, 'accepted');
    assert.equal(commanderWillEngage(w, formation, onTheCamp), false,
      'after it, defending the camp is the commander\'s own decision or nobody\'s');
  });

  test('an accepted civil corridor closes a wedge, and firing into it is counted', () => {
    const w = new World(scenarioById('white-noise'), { role: 'net' });
    // Put a transit and a hostile on the same bearing, and a third well off it.
    const transit = createAircraft({
      type: 'civil', seq: 900, pos: { x: 0, y: 120 }, hdg: 180, altM: 10200, name: 'TRANSIT 118',
    });
    w.aircraft.push(transit);
    w.aircraftById.set(transit.id, transit);
    const behindIt = { pos: { x: 4, y: 150 } };
    const elsewhere = { pos: { x: 140, y: 10 } };
    assert.equal(w.inCivilCorridor(behindIt), false, 'no corridor until one is accepted');

    issueDirective(w, DIRECTIVES.civilCorridor);
    answerDirective(w, 'accepted');
    assert.equal(w.command.constraints.civilCorridorId, transit.id);
    assert.equal(w.inCivilCorridor(behindIt), true, 'the wedge is about the transit\'s bearing');
    assert.equal(w.inCivilCorridor(elsewhere), false, 'and it is a wedge, not the whole sky');

    w.registerRoundsSpent({ ...behindIt, predictedAssetId: null }, 2, 'assigned');
    assert.equal(w.stats.roundsInCorridor, 2,
      'a round into the corridor is billed on where it was fired, attributed or not');
  });

  test('refusing the political section is not the cheapest word on the net', () => {
    const w = world();
    w.command.constraints.civilOrderRefused = true;
    const before = w.command.standing;
    settleDirectives(w);
    const refused = w.command.standing - before;

    const control = world();
    const controlBefore = control.command.standing;
    settleDirectives(control);
    assert.ok(refused < control.command.standing - controlBefore,
      'the refusal is referred, like every other refusal of a hinge');
  });
});

describe('end-of-mission settlement', () => {
  test('a clean watch is rewarded', () => {
    const w = world();
    const before = w.command.standing;
    settleDirectives(w);
    assert.ok(w.command.standing > before, 'nothing lost, nothing damaged');
  });

  test('a civil shoot-down caps the assessment however well the rest went', () => {
    const w = world();
    w.command.standing = 95;
    w.stats.civilianAircraftShot = 1;
    settleDirectives(w);
    assert.ok(w.command.standing <= 12, `expected a capped assessment, got ${w.command.standing}`);
    assert.ok(w.command.ledger.some((l) => /civil aircraft/.test(l.reason)));
  });

  test('bonuses cannot launder a shoot-down off the bottom of the scale', () => {
    const w = world();
    w.command.standing = 4;          // already in trouble
    w.stats.civilianAircraftShot = 1;
    settleDirectives(w);
    assert.ok(w.command.standing < 4, 'it can only make things worse, never better');
  });

  test('overspending the allocation is charged', () => {
    const w = world();
    w.stats.roundsFired = w.roundAllowance + 20;
    const before = w.command.standing;
    settleDirectives(w);
    assert.ok(w.command.ledger.some((l) => /over allocation/.test(l.reason)));
  });
});

describe('the campaign file', () => {
  test('standing carries forward, weighted toward the latest watch', () => {
    const campaign = emptyCampaign();
    recordMission(campaign, {
      missionId: 'first-light', role: 'net', score: 400, standing: 90,
      stats: { leakers: 0, kills: 4, assetsLost: 0 },
    });
    assert.ok(campaign.standing > 50 && campaign.standing < 90,
      `expected a blend, got ${campaign.standing}`);
    assert.equal(campaign.history.length, 1);
  });

  test('a bad watch marks the file and a good one commends it', () => {
    // From the second watch onward, the file is the file. (The first entry is
    // written kindly — see the clemency test below.)
    const opener = { missionId: 'm0', role: 'net', score: 100, standing: 55, stats: { leakers: 1, kills: 2, assetsLost: 0 } };

    const bad = emptyCampaign();
    recordMission(bad, opener);
    recordMission(bad, { missionId: 'm', role: 'net', score: -100, standing: 5, stats: { leakers: 6, kills: 0, assetsLost: 3 } });
    assert.equal(bad.fileMarks, 1);
    assert.equal(bad.commendations, 0);

    const good = emptyCampaign();
    recordMission(good, opener);
    recordMission(good, { missionId: 'm', role: 'net', score: 900, standing: 98, stats: { leakers: 0, kills: 9, assetsLost: 0 } });
    assert.equal(good.commendations, 1);
    assert.equal(good.fileMarks, 0);
  });

  test('the first entry in a new file is written kindly', () => {
    /*
     * A fumbled LEARNING watch must not brand the campaign: it used to land
     * the brand-new player at FLAGGED — political section in the corridor,
     * ammunition cut for watch two — for a night spent finding the radiate
     * switch. The first watch carries at quarter weight and floors at "noted";
     * the second one counts in full.
     */
    const campaign = emptyCampaign();
    recordMission(campaign, {
      missionId: 'first-light', role: 'net', score: -400, standing: 3,
      stats: { leakers: 4, kills: 0, assetsLost: 2 },
    });
    assert.ok(campaign.standing >= 34, `first-watch floor held: ${campaign.standing}`);
    assert.equal(campaign.fileMarks, 0, 'no mark for a first night');

    recordMission(campaign, {
      missionId: 'low-riders', role: 'net', score: -400, standing: 3,
      stats: { leakers: 4, kills: 0, assetsLost: 2 },
    });
    assert.ok(campaign.standing < 34, 'the second disaster counts in full');
    assert.equal(campaign.fileMarks, 1);
  });

  test('only a better score replaces the recorded best', () => {
    const campaign = emptyCampaign();
    const entry = (score) => ({ missionId: 'm', role: 'net', score, standing: 60, stats: { leakers: 0, kills: 1, assetsLost: 0 } });
    recordMission(campaign, entry(500));
    recordMission(campaign, entry(200));
    assert.equal(campaign.completed.m.score, 500);
    recordMission(campaign, entry(800));
    assert.equal(campaign.completed.m.score, 800);
  });

  test('a failing file takes away resupply, which is a real handicap', () => {
    const campaign = emptyCampaign();
    campaign.standing = 5;
    const consequence = consequenceFor(campaign);
    assert.equal(consequence.tier.id, 'condemned');
    assert.equal(consequence.modifiers.reloadsAllowed, false);
    assert.ok(consequence.modifiers.roundsMult < 1);

    // And the world honours it: no magazine, so no reloads.
    const w = new World(scenarioById('first-light'), { role: 'net', modifiers: consequence.modifiers });
    assert.equal(w.sites[0].magazine, 0);
    assert.equal(w.reload(w.sites[0].id), false);
  });

  test('a commended file is rewarded with a deeper magazine', () => {
    const campaign = emptyCampaign();
    campaign.standing = 90;
    const consequence = consequenceFor(campaign);
    assert.ok(consequence.modifiers.roundsMult > 1);
    assert.equal(consequence.modifiers.reloadsAllowed, true);
  });

  test('turning narrative pressure off leaves the mechanics but drops the file entries', () => {
    const campaign = emptyCampaign();
    campaign.standing = 5;
    const loud = consequenceFor(campaign, { narrativePressure: true });
    const plain = consequenceFor(campaign, { narrativePressure: false });
    assert.deepEqual(loud.modifiers, plain.modifiers, 'the handicap is identical');
    assert.ok(loud.lines.length > plain.lines.length, 'only the file entry is muted');
    assert.equal(briefingNote(campaign, { narrativePressure: false }), null);
  });

  test('the file survives a save and reload, and a corrupt one does not crash', () => {
    const store = memoryStore();
    const campaign = emptyCampaign();
    campaign.standing = 71;
    campaign.fileMarks = 2;
    saveCampaign(store, campaign);
    const loaded = loadCampaign(store);
    assert.equal(loaded.standing, 71);
    assert.equal(loaded.fileMarks, 2);

    store.set('iadsville.campaign.v1', '{not json');
    assert.equal(loadCampaign(store).standing, COMMAND.startingStanding);
  });
});

describe('the net says something new, and stops before the watch does', () => {
  /** Play a whole watch with the sets up and every order accepted. */
  const playOut = (mission, seed) => {
    const w = new World(scenarioById(mission), { role: 'net', seed });
    let n = 0;
    while (w.phase === 'running' && n < 40000) {
      for (const radar of w.radars) if (radar.alive) radar.on = true;
      w.step(0.1);
      if (w.command.pending) w.answer('accepted');
      n++;
    }
    return w;
  };

  /*
   * Cadence passed everywhere; content did not. Eight orders a watch drawn
   * from three sentences, because the loop walked the directive table in
   * declaration order and the first thing that triggered always won.
   * Measured on one weasel watch: no-leakers at 96s, priority of fires at
   * 188, logistics at 280, the political section at 372, priority of fires
   * AGAIN at 489, logistics again at 580, the political section again at 697
   * — three of the four repeated verbatim.
   */
  test('no routine order is transmitted twice in the same words', () => {
    for (const mission of ['weasel-hour', 'four-sectors', 'reinforce-the-capital', 'white-noise']) {
      for (const seed of ['net-1', 'net-2', 'net-3']) {
        const w = playOut(mission, seed);
        const seen = new Map();
        for (const directive of w.command.log) {
          seen.set(directive.text, (seen.get(directive.text) ?? 0) + 1);
        }
        const repeated = [...seen.entries()].filter(([, n]) => n > 1);
        assert.equal(repeated.length, 0,
          `${mission}/${seed}: "${repeated[0]?.[0].slice(0, 60)}" went out ${repeated[0]?.[1]} times`);
      }
    }
  });

  /*
   * Seven of two hundred and one First Light directives were transmitted
   * inside twelve seconds of the end and three inside two, every one still
   * PENDING at the debrief — one at 291.6s of a 293.1s watch. An order
   * nobody can answer is not menace, it is litter. The guard draws the same
   * random number and consumes the same slot as a transmission would, so a
   * withheld order cannot shift a seeded score by skipping the draw, which
   * is exactly how the first attempt at this failed.
   */
  test('nothing routine goes out over a watch that is already over', () => {
    for (const mission of ['first-light', 'weasel-hour', 'two-cities']) {
      for (const seed of ['late-1', 'late-2', 'late-3']) {
        const w = playOut(mission, seed);
        for (const directive of w.command.log) {
          assert.ok(w.t - directive.issuedS >= 30,
            `${mission}/${seed}: ${directive.id} was transmitted ${(w.t - directive.issuedS).toFixed(1)}s `
            + 'before the debrief');
        }
        assert.equal(w.command.log.filter((d) => d.state === 'pending').length, 0,
          `${mission}/${seed}: an order was still on the net when the watch ended`);
      }
    }
  });

  test('an expenditure order does not come back with the figure it already quoted', () => {
    const w = new World(scenarioById('white-noise'), { role: 'net', seed: 'conserve-1' });
    w.stats.roundsFired = Math.ceil(w.roundAllowance * 0.7);
    assert.ok(DIRECTIVES.conserve.trigger(w), 'expenditure is over the line');
    issueDirective(w, DIRECTIVES.conserve);
    answerDirective(w, 'accepted');
    assert.equal(DIRECTIVES.conserve.trigger(w), false,
      'nothing has been fired since, so logistics has nothing to say');
    w.stats.roundsFired += 5;
    assert.ok(DIRECTIVES.conserve.trigger(w), 'and something to say again once you spend more');
  });

  /*
   * The mirror of the order to keep radiating, and the reason the emissions
   * switch had to start working first: this one is only answerable because
   * an order to a battery now sticks instead of being undone by doctrine on
   * the next tick.
   */
  test('the emissions restriction darkens the sector that accepts it', () => {
    const w = new World(scenarioById('weasel-hour'), { role: 'net', seed: 'emcon-1' });
    for (const radar of w.radars) if (radar.alive) radar.on = true;
    let n = 0;
    while (w.phase === 'running' && n < 20000 && !w.command.constraints.silentUnlessEngaged) {
      w.step(0.1);
      if (w.command.pending?.id === 'emconDiscipline') w.answer('accepted');
      else if (w.command.pending) w.answer('accepted');
      n++;
    }
    assert.ok(w.command.constraints.silentUnlessEngaged,
      'the weasel watch offers the emissions restriction');

    // A battery with nothing near it and nothing to guide goes dark on its own.
    const quiet = w.sites.filter((s) => s.alive && !s.engagements.length
      && ![...w.tracks.values()].some((t) => t.hostility !== 'friendly' && t.quality > 0.3
        && Math.hypot(t.pos.x - s.pos.x, t.pos.y - s.pos.y) < 60));
    for (let i = 0; i < 30; i++) w.step(0.1);
    for (const site of quiet) {
      if (site.emconHold) continue;              // the operator's own order wins
      assert.equal(w.radarsOf(site).some((r) => r.on), false,
        `${site.name} kept radiating with nothing near it, against an accepted order`);
    }
  });

  test('and bills the operator who holds one up by hand anyway', () => {
    const w = new World(scenarioById('weasel-hour'), { role: 'net', seed: 'emcon-2' });
    w.command.constraints.silentUnlessEngaged = true;
    const site = w.sites.find((s) => s.alive);
    // Hold it up by hand with nothing anywhere near it, from a standing start.
    w.setRadar(site.radarId, true);
    const before = w.command.standing;
    for (let i = 0; i < 400; i++) stepCommand(w, 0.1);
    assert.ok(w.command.standing < before,
      'a battery held radiating against the restriction is charged for it');
    assert.ok(w.command.ledger.some((e) => /emissions restriction/.test(e.reason)),
      'and the ledger names the order it broke');
  });
});
