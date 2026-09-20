/**
 * The desk between watches: what is on it, in what order, and what picking a
 * thing up does to the file.
 *
 * The player asked for the scenes between watches and then measured what they
 * cost — three to five full-screen scenes advanced by hand, 338 presses of
 * Enter across a campaign — and asked for a desk instead: the night's paper
 * laid out, picked up in any order or not at all, and standing up always one
 * click away. The picture needs a browser; what lies on the desk and what it
 * says about itself is data, and it is pinned here.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { World } from '../src/engine/world.js';
import { scenarioById } from '../src/engine/scenarios.js';
import { emptyCampaign, enlist, recordMission } from '../src/engine/campaign.js';
import { scenesFor, OFFICER } from '../src/ui/scenes.js';
import { deskFor } from '../src/ui/desk.js';
import { REVELATIONS, readFolder } from '../src/engine/revelations.js';

function stood(missionId, { seed = 5, role = 'net', reason = 'raid-spent', campaign = null, seconds = 600 } = {}) {
  const c = campaign ?? enlisted();
  const mission = scenarioById(missionId);
  const w = new World(mission, { role, seed });
  for (const r of w.radars) w.setRadar(r.id, true);
  for (const s of w.sites) w.setWeaponsState(s.id, 'free');
  for (let i = 0; i < seconds * 4; i++) w.step(0.25);
  const result = w.result(reason);
  const entry = recordMission(c, result);
  return { campaign: c, mission, result, entry, state: { campaign: c, mission, narrativePressure: true } };
}

function enlisted() {
  const c = emptyCampaign();
  enlist(c, { name: 'Yasna Petrina', background: 'academy', household: 'mother' });
  return c;
}

describe('what is on the desk', () => {
  test('an ordinary evening: the tape, then the section, then the rest, each with a plate', () => {
    const { state, result, entry } = stood('economy-of-force');
    const { items, ending } = deskFor(state, result, entry);
    assert.equal(ending, null, 'an ordinary night has no ending to play on the way out');
    assert.equal(items[0].id, 'printout');
    assert.equal(items[1].id, 'commissar');
    assert.ok(items.some((i) => i.id === 'revelation'), 'the folder is on the desk');
    assert.ok(items.some((i) => i.id === 'letter'), 'and so is the envelope');
    items.forEach((item, i) => {
      assert.equal(item.key, String(i + 1), `${item.id} is numbered in the order it lies`);
      assert.ok(item.plate && item.plate === item.plate.toUpperCase(), `${item.id} has a stencilled plate`);
      assert.ok(typeof item.gist === 'string', `${item.id} says something about itself`);
      assert.ok(item.scene?.lines?.length, `${item.id} plays the scene it always was`);
      assert.ok(item.box && item.box.w > 0, `${item.id} lies somewhere on the desk`);
    });
    // The section's chit names the man, and carries the tier as its stamp.
    const chit = items.find((i) => i.id === 'commissar');
    assert.match(chit.gist, new RegExp(`${OFFICER.rank} ${OFFICER.surname}`));
    assert.ok(chit.stamp, 'the tier is stamped on the chit');
    // The tape says the headline and the score, and nothing from inside the office.
    const tape = items.find((i) => i.id === 'printout');
    assert.match(tape.gist, /SCORE \d+/);
  });

  test('the folder says whose it is and never what is in it', () => {
    const { state, result, entry } = stood('economy-of-force');
    const folder = deskFor(state, result, entry).items.find((i) => i.id === 'revelation');
    assert.equal(folder.revelationId, 'freeze');
    assert.equal(folder.yours, true, 'the query from signals is addressed to you');
    assert.equal(folder.plate, REVELATIONS.freeze.desk.plate);
    for (const line of folder.scene.lines) {
      assert.ok(!folder.gist.includes(line.slice(0, 30)), 'the plate does not quote the document');
    }
    /*
     * THE BORDER FOLDER MOVED, AND IT MOVED ONTO A DESK THAT ALREADY HAD ONE.
     *
     * The twelve-to-ten cut put both hinges on the merged watch and the
     * writer's decision was that the sector target folder is read on the
     * evening AFTER it, so one desk does not carry two folders on the night
     * the expenditure query arrives. There is no third evening to give it —
     * see the note on REVELATIONS.border — so Ville Under Fire's evening
     * carries this one and the depot return, and the test checks both slots.
     */
    const evening = stood('ville-under-fire');
    const laid = deskFor(evening.state, evening.result, evening.entry).items;
    const target = laid.find((i) => i.revelationId === 'border');
    assert.ok(target, 'the sector target folder is on the desk the evening after');
    assert.equal(target.yours, false, 'the sector target folder is not yours');
    assert.match(target.gist, /not yours/i);
    const depot = laid.find((i) => i.revelationId === 'ledger');
    assert.ok(depot, 'and so is the depot return, which was already keyed here');
    assert.notEqual(target.id, depot.id, 'two folders, two slots, two things to pick up');
  });

  test('the finale keeps the ending off the desk: it plays on the way out', () => {
    const { state, result, entry } = stood('two-cities', { seconds: 900 });
    assert.ok(result.finale);
    const { items, ending } = deskFor(state, result, entry);
    assert.ok(ending, 'the ending exists');
    assert.equal(ending.kind, 'ending');
    assert.ok(!items.some((i) => i.id === 'ending'), 'and it is not a thing you pick up');
    const ids = items.map((i) => i.id);
    if (ids.includes('appointment')) assert.equal(ids.indexOf('appointment'), 1, 'the order is read off the tape');
    if (ids.includes('revelation')) assert.ok(ids.indexOf('revelation') < ids.indexOf('commissar'));
  });

  test('an abandoned watch is a short desk: the tape and the chit', () => {
    const { state, result, entry } = stood('first-light', { reason: 'aborted', seconds: 60 });
    const { items, ending } = deskFor(state, result, entry);
    assert.deepEqual(items.map((i) => i.id), ['printout', 'commissar']);
    assert.equal(ending, null);
    assert.match(items[0].gist, /NOT SCORED/);
  });

  test('with the narrative pressure off there is the tape and the assessment', () => {
    const { state, result, entry } = stood('economy-of-force');
    const { items } = deskFor({ ...state, narrativePressure: false }, result, entry);
    assert.deepEqual(items.map((i) => i.id), ['printout', 'commissar']);
    assert.equal(items[1].plate, 'SECTOR COMMAND');
  });
});

describe('what picking a thing up does', () => {
  test('the office knows whether the folder was open before you came in', () => {
    const { state, result, entry } = stood('economy-of-force');
    const office = (opened) => scenesFor(state, result, entry, { opened }).find((s) => s.id === 'commissar');
    const line = /signed out to me/;
    assert.ok(office(['printout', 'revelation']).lines.some((l) => line.test(l)),
      'the folder opened first: he has written down how long you were alone with it');
    assert.ok(!office(['printout']).lines.some((l) => line.test(l)),
      'the folder still closed: he says nothing about it');
    assert.ok(!office([]).lines.some((l) => line.test(l)));
    // And the desk composes the same office the old sequence did on a closing
    // watch, where the document played before the man.
    const finale = stood('two-cities', { seconds: 900 });
    const legacy = scenesFor(finale.state, finale.result, finale.entry).find((s) => s.id === 'commissar');
    if (finale.entry.revelation) {
      assert.ok(legacy.lines.some((l) => line.test(l)), 'without a desk the old rule stands');
    }
  });

  test('the folder is handed over on the desk and learned when it is opened', () => {
    const { campaign, entry } = stood('economy-of-force');
    assert.equal(entry.revelation?.id, 'freeze', 'the watch puts the folder on the desk');
    assert.deepEqual(campaign.revelations, [], 'leaving it where it lies teaches the file nothing');
    readFolder(campaign, entry.revelation.id);
    assert.deepEqual(campaign.revelations, ['freeze'], 'opening it is what the file records');
  });
});

describe('the morning the office is empty', () => {
  /*
   * The campaign's most dramatic ending contradicted itself: after the
   * aircraft came down by this sector's own hand, the evening sat the man at
   * his desk and had him say "Dismissed", and the ending ninety seconds later
   * said his office had been open all morning with nobody in it.
   */
  const flight = (endingId) => {
    const { state, result, entry } = stood('presidents-flight', { seconds: 400 });
    assert.ok(result.epilogue, 'the flight is the epilogue');
    result.endingId = endingId;
    return { state, result, entry, scenes: scenesFor(state, result, entry) };
  };

  test('after a decision taken at the console, nobody is in the chair', () => {
    const { scenes } = flight('judgement');
    const office = scenes.find((s) => s.id === 'commissar');
    assert.equal(office.kind, 'finding', 'the room is drawn the way the finding draws it: empty');
    assert.equal(office.empty, true);
    assert.match(office.speaker, /NOBODY IN/);
    assert.ok(office.lines.some((l) => /\bat five\b|since five/.test(l)), 'the note agrees with the ending about the hour');
    assert.ok(!office.lines.some((l) => /^Dismissed\.$|^You may go\.$|^Sign here/.test(l)),
      'nobody is dismissed by an empty room');
    assert.ok(office.lines.length >= 2 && office.lines.length <= 3, 'two or three lines of paper the clerk left');
  });

  test('after the watch was broken off, the door is locked', () => {
    const { scenes } = flight('unwatched');
    const office = scenes.find((s) => s.id === 'commissar');
    assert.equal(office.empty, true);
    assert.equal(office.locked, true);
    assert.ok(office.lines.some((l) => new RegExp(OFFICER.surname).test(l)), 'the chit on the door names him');
  });

  test('on the mornings he is at his desk, he is at his desk', () => {
    for (const id of ['escorted', 'abandoned']) {
      const office = flight(id).scenes.find((s) => s.id === 'commissar');
      assert.equal(office.kind, 'office', `${id}: the ordinary office`);
      assert.equal(office.speaker, OFFICER.plate);
      assert.ok(!office.empty);
    }
  });

  test('the desk lays the empty office out as a door, not a chit', () => {
    const { state, result, entry } = flight('judgement');
    const chit = deskFor(state, result, entry).items.find((i) => i.id === 'commissar');
    assert.match(chit.gist, /nobody is in/i);
    assert.equal(chit.stamp, null, 'no tier is stamped on a night nobody entered one');
  });
});
