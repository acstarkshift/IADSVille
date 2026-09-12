/**
 * The scenes between watches: which play after which watch, and what is said.
 *
 * The player: "The little displays and summaries between watches is cluttered
 * and overwhelming. It should be replaced with slick, 16-bit style animated
 * cut scenes which start with the user holding a dot-matrix printed summary
 * of the watch, followed by debriefs with the political commissar, then a
 * chance to read letters from home. Include relevant dialog and cutscenes as
 * the story progresses." The pictures need a browser; the sequence and the
 * dialogue are data, and they are pinned here.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { World } from '../src/engine/world.js';
import { scenarioById } from '../src/engine/scenarios.js';
import { emptyCampaign, enlist, recordMission } from '../src/engine/campaign.js';
import { scenesFor } from '../src/ui/scenes.js';

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
  enlist(c, { name: 'Ясна Ленко', background: 'academy', household: 'mother' });
  return c;
}

describe('which scenes play', () => {
  test('every watch opens on the printout and goes to the office', () => {
    const { state, result, entry } = stood('first-light');
    const ids = scenesFor(state, result, entry).map((s) => s.id);
    assert.equal(ids[0], 'printout');
    assert.equal(ids[1], 'commissar');
  });

  test('the first watch brings the letter from home, read in quarters, after the office', () => {
    const { state, result, entry } = stood('first-light');
    const scenes = scenesFor(state, result, entry);
    const letter = scenes.find((s) => s.id === 'letter');
    assert.ok(letter, 'a letter arrives with the first file entry');
    assert.equal(letter.kind, 'quarters');
    assert.ok(scenes.indexOf(letter) > scenes.findIndex((s) => s.id === 'commissar'));
    assert.match(letter.speaker, /LETTER FROM THE VILLE/);
    assert.ok(letter.lines.some((l) => /Your mother writes/.test(l)), 'the household chosen at enlistment writes');
  });

  test('with the narrative pressure off, the letters and the documents stay in the file', () => {
    const { state, result, entry } = stood('first-light');
    const scenes = scenesFor({ ...state, narrativePressure: false }, result, entry);
    assert.deepEqual(scenes.map((s) => s.id), ['printout', 'commissar']);
    assert.equal(scenes[1].speaker, 'SECTOR COMMAND');
    assert.ok(scenes[1].lines[0].startsWith('ASSESSMENT') || /SUPPLY/.test(scenes[1].lines.at(-1)));
  });

  test('a watch that teaches you something puts the folder on the desk', () => {
    const { state, result, entry } = stood('economy-of-force');
    const scenes = scenesFor(state, result, entry);
    const folder = scenes.find((s) => s.id === 'revelation');
    assert.ok(folder, 'Economy of Force ends on the allocation');
    assert.equal(folder.kind, 'folder');
    assert.equal(folder.speaker, 'THE ALLOCATION');
    assert.ok(folder.lines.length >= 3);
  });

  test('the ending is the last scene of the last watch', () => {
    const { state, result, entry } = stood('two-cities', { seconds: 900 });
    assert.ok(result.finale, 'Two Cities is the finale');
    const scenes = scenesFor(state, result, entry);
    assert.equal(scenes.at(-1).id, 'ending');
    assert.equal(scenes.at(-1).kind, 'ending');
    assert.ok(scenes.at(-1).lines.length >= 2);
    assert.equal(typeof scenes.at(-1).held, 'boolean');
  });

  test('an abandoned watch is a short evening: the tape, and the section, and no post', () => {
    const { state, result, entry } = stood('first-light', { reason: 'aborted', seconds: 60 });
    const scenes = scenesFor(state, result, entry);
    assert.deepEqual(scenes.map((s) => s.id), ['printout', 'commissar']);
    assert.ok(scenes[0].lines.includes('WATCH ABANDONED'));
    assert.ok(scenes[0].lines.some((l) => /NOT SCORED/.test(l)));
    assert.match(scenes[1].lines[0], /You left the post/);
  });
});

describe('what is said', () => {
  test('the tape prints the night as figures, in capitals, and ends', () => {
    const { state, result, entry } = stood('first-light');
    const tape = scenesFor(state, result, entry)[0];
    assert.equal(tape.kind, 'printout');
    assert.match(tape.lines[0], /^FIRST LIGHT · BATTLE MANAGER$/);
    assert.ok(tape.lines.includes(result.headline));
    assert.ok(tape.lines.some((l) => l === `SCORE ${result.score}`));
    assert.ok(tape.lines.some((l) => /^AIRCRAFT DESTROYED \d+ · TURNED BACK \d+$/.test(l)));
    assert.ok(tape.lines.some((l) => /^LEAKERS \d+ · ROUNDS EXPENDED \d+$/.test(l)));
    assert.ok(tape.lines.some((l) => /^GROUND LOST: /.test(l)));
    assert.equal(tape.lines.at(-1), 'END OF TAPE');
    for (const l of tape.lines) assert.equal(l, l.toUpperCase(), `a dot-matrix head prints capitals: "${l}"`);
  });

  test('the commissar reads the log back before the file entry, and dismisses you by tier', () => {
    const { state, result, entry } = stood('first-light');
    result.ledger.push({ t: 100, delta: -6, charged: -6, reason: 'rounds expended outside the freeze, over the district hospital' });
    result.ledger.push({ t: 200, delta: 4, charged: 4, reason: 'held fire on the encampment as ordered' });
    const office = scenesFor(state, result, entry).find((s) => s.id === 'commissar');
    assert.equal(office.kind, 'office');
    assert.equal(office.speaker, 'THE POLITICAL SECTION');
    const hospital = office.lines.findIndex((l) => l.startsWith('The log says: rounds expended outside the freeze'));
    const camp = office.lines.findIndex((l) => l.startsWith('The log says: held fire on the encampment'));
    assert.ok(hospital >= 0, 'the hospital is read back');
    assert.match(office.lines[hospital], /The section notes it\.$/);
    assert.ok(camp >= 0, 'and so is the encampment');
    assert.match(office.lines[camp], /in your favour/);
    const supply = office.lines.findIndex((l) => /^SUPPLY:/.test(l));
    assert.ok(hospital < supply && camp < supply, 'the log is read before the file entry');
    assert.ok(['You may go.', 'Dismissed.', 'That will be all. For now.', 'Sign here. And here.', 'You will be told where to report.']
      .includes(office.lines.at(-1)), `a dismissal closes the scene: "${office.lines.at(-1)}"`);
    assert.ok(office.lines.some((l) => /^SUPPLY:/.test(l)), 'the supply line from the file entry is read out');
  });

  test('a promotion is read as an order of appointment', () => {
    // Stand the whole battalion act so the file reaches the sector.
    const campaign = enlisted();
    for (const id of ['first-light', 'low-riders', 'solo-battery']) {
      const { entry, state, result } = stood(id, { campaign, role: id === 'solo-battery' ? 'crew' : 'net' });
      if (entry.appointment) {
        const order = scenesFor(state, result, entry).find((s) => s.id === 'appointment');
        assert.ok(order, 'the order is read in the office');
        assert.equal(order.kind, 'office');
        assert.match(order.lines[0], /you are appointed Sector commander/);
        return;
      }
    }
    assert.fail('the battalion act should have ended in an appointment');
  });
});

describe('the opening of a watch', () => {
  /*
   * The player: "Each watch should begin with a first person view of the
   * operator sitting down at the console, taking a deep breath and inserting
   * the ID card whereupon the system boots and the watch begins." Five
   * wordless beats in that order, each with a length so it goes on by itself,
   * the boot carrying the console's own sound; the clock is held by the app
   * (the smoke checks it in the browser).
   */
  test('five beats, in the order the player described, each timed and wordless', async () => {
    const { openingScenes, openingTotalS } = await import('../src/ui/scenes.js');
    const scenes = openingScenes({ mission: { hour: '05:10' } });
    assert.deepEqual(scenes.map((s) => s.id), ['approach', 'sit', 'breath', 'card', 'boot']);
    for (const s of scenes) {
      assert.equal(s.silent, true, `${s.id} has no words`);
      assert.ok(s.durationS > 0.5 && s.durationS < 5, `${s.id} runs its own length`);
      assert.equal(s.lines, undefined);
    }
    assert.equal(scenes[0].hour, '05:10', 'the walk in carries the watch\'s own hour');
    assert.equal(scenes[4].sound, 'boot', 'the set makes the console\'s boot sound');
    const total = openingTotalS({ mission: { hour: '05:10' } });
    assert.ok(total >= 8 && total <= 14, `the whole opening is a breath under a quarter minute (${total} s)`);
  });
});
