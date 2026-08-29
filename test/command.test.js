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
    const bad = emptyCampaign();
    recordMission(bad, { missionId: 'm', role: 'net', score: -100, standing: 5, stats: { leakers: 6, kills: 0, assetsLost: 3 } });
    assert.equal(bad.fileMarks, 1);
    assert.equal(bad.commendations, 0);

    const good = emptyCampaign();
    recordMission(good, { missionId: 'm', role: 'net', score: 900, standing: 98, stats: { leakers: 0, kills: 9, assetsLost: 0 } });
    assert.equal(good.commendations, 1);
    assert.equal(good.fileMarks, 0);
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
