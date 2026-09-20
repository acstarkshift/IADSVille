/**
 * The campaign file: what it accepts, what it refuses, and what it will never
 * take away from a player who has earned it.
 *
 * Two findings live here. The key has said `v1` since the beginning and nothing
 * inside the payload ever did, so a save whose `history` was a number or whose
 * `completed` was a string loaded without complaint, drew the menu, let a whole
 * watch be played, and then threw inside `recordMission` at the end of it —
 * with the frame loop already past the point of no return, so the console froze
 * with no debrief and no way out but a reload. And the roster kept a player's
 * best score while the two fields that gate the epilogue kept their last, so
 * pressing REPLAY THIS ONE on the finale and having a bad night deleted the
 * twelfth watch of the campaign from the menu with no explanation.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyCampaign, enlist, recordMission, memoryStore, saveCampaign, loadCampaign,
  migrate, SAVE_VERSION,
} from '../src/engine/campaign.js';
import { SCENARIOS, isUnlocked, scenarioById } from '../src/engine/scenarios.js';
import { COMMAND } from '../src/engine/config.js';

const seeded = (payload) => {
  const store = memoryStore();
  store.set('iadsville.campaign.v1', JSON.stringify(payload));
  return loadCampaign(store);
};

describe('reading a file', () => {
  test('a round trip keeps everything and stamps the version', () => {
    const store = memoryStore();
    const campaign = emptyCampaign();
    enlist(campaign, { name: 'Vesya Ivkova', background: 'factory', household: 'mother' });
    campaign.standing = 63;
    campaign.completed['first-light'] = { score: 1200, tier: 'commended', role: 'radar' };
    saveCampaign(store, campaign);
    assert.equal(JSON.parse(store.get('iadsville.campaign.v1')).version, SAVE_VERSION);

    const loaded = loadCampaign(store);
    assert.equal(loaded.standing, 63);
    assert.equal(loaded.character.name, 'Vesya Ivkova');
    assert.deepEqual(loaded.completed['first-light'], { score: 1200, tier: 'commended', role: 'radar' });
  });

  test('a wrong-typed field is replaced, and the rest of the file survives', () => {
    for (const wrong of [
      { history: 7 }, { history: 'two' }, { completed: 'first-light' }, { completed: 4 },
      { standing: 'high' }, { standing: NaN }, { fileMarks: 'many' }, { revelations: 3 },
      { family: 9 }, { endingFacts: 'held' }, { appointment: 12 },
    ]) {
      const loaded = seeded({ standing: 58, completed: {}, history: [], ...wrong });
      assert.ok(Array.isArray(loaded.history), `history is an array after ${JSON.stringify(wrong)}`);
      assert.equal(typeof loaded.completed, 'object');
      assert.ok(Number.isFinite(loaded.standing));
      assert.ok(Number.isFinite(loaded.fileMarks));
      assert.ok(Array.isArray(loaded.revelations));
      assert.equal(typeof loaded.appointment, 'string');
      // And the watch can be recorded at the end of it, which is the whole point.
      assert.doesNotThrow(() => recordMission(loaded, {
        missionId: 'first-light', role: 'radar', score: 700, standing: 55,
        stats: { leakers: 0, kills: 2, assetsLost: 0 },
      }));
    }
  });

  test('a roster entry for a watch that does not exist is dropped', () => {
    const loaded = seeded({
      completed: { 'first-light': { score: 9, tier: 'noted', role: 'radar' }, 'moon-patrol': { score: 9 } },
    });
    assert.ok(loaded.completed['first-light']);
    assert.equal(loaded.completed['moon-patrol'], undefined);
  });

  test('a roster entry with a nonsense tier or seat is corrected rather than kept', () => {
    const loaded = seeded({ completed: { 'first-light': { score: 12, tier: 'glorious', role: 'admiral' } } });
    assert.equal(loaded.completed['first-light'].score, 12);
    assert.ok(['commended', 'satisfactory', 'noted', 'flagged', 'condemned', 'abandoned']
      .includes(loaded.completed['first-light'].tier));
    assert.ok(SCENARIOS.some((s) => s.roles.includes(loaded.completed['first-light'].role)));
  });

  test('standing out of range is brought back inside it', () => {
    assert.equal(seeded({ standing: 5000 }).standing, COMMAND.maxStanding);
    assert.equal(seeded({ standing: -40 }).standing, COMMAND.minStanding);
  });

  test('a payload that is not a file at all is refused rather than half-loaded', () => {
    for (const junk of ['null', '"a string"', '[1,2,3]', '42']) {
      const store = memoryStore();
      store.set('iadsville.campaign.v1', junk);
      const loaded = loadCampaign(store);
      assert.equal(loaded.character, null);
      assert.deepEqual(loaded.completed, {});
      assert.equal(loaded.loadFailed, true, `${junk} is reported as unreadable`);
    }
  });

  test('unparseable text is refused, and says so', () => {
    const store = memoryStore();
    store.set('iadsville.campaign.v1', '{not json');
    assert.equal(loadCampaign(store).loadFailed, true);
  });

  test('a file saved before the version existed still opens', () => {
    const loaded = seeded({ standing: 61, history: [], completed: {} });
    assert.equal(loaded.standing, 61);
    assert.equal(loaded.character, null);
    assert.ok(!loaded.loadFailed);
  });

  test('the unreadable flag is a fact about one read and is never written back', () => {
    const store = memoryStore();
    const campaign = emptyCampaign();
    campaign.loadFailed = true;
    saveCampaign(store, campaign);
    assert.equal(JSON.parse(store.get('iadsville.campaign.v1')).loadFailed, undefined);
  });

  test('migrate is a pure function of its argument', () => {
    assert.equal(migrate(null), null);
    assert.equal(migrate([]), null);
    assert.equal(migrate('x'), null);
    assert.equal(migrate({}).version, SAVE_VERSION);
  });
});

describe('replaying the finale cannot delete the watch after it', () => {
  const finale = (held) => ({
    missionId: 'two-cities', role: 'net', score: held ? 2000 : 200, standing: held ? 70 : 20,
    stats: { leakers: held ? 1 : 9, kills: 6, assetsLost: held ? 0 : 4 },
    finale: true, endingId: held ? 'exemplary' : 'collapse',
    assets: [
      { type: 'palace', destroyed: !held, damagePct: held ? 0 : 100 },
      { type: 'town', destroyed: !held, damagePct: held ? 0 : 100 },
    ],
  });

  test('a good finale then a bad one keeps the epilogue on the roster', () => {
    const campaign = emptyCampaign();
    enlist(campaign, { name: 'A. Tomina', background: 'academy', household: 'sister' });
    for (const s of SCENARIOS) {
      if (s.id === 'presidents-flight') continue;
      campaign.completed[s.id] = { score: 1000, tier: 'satisfactory', role: s.roles[0] };
    }
    recordMission(campaign, finale(true));
    assert.equal(isUnlocked(scenarioById('presidents-flight'), campaign), true, 'earned');

    recordMission(campaign, finale(false));
    assert.equal(isUnlocked(scenarioById('presidents-flight'), campaign), true,
      'a replayed bad night must not take the earned watch away');
    // The prose reads the night that was just stood; the gate reads the best.
    assert.equal(campaign.endingFacts.palaceHeld, false, 'the last night is recorded honestly');
    assert.equal(campaign.bestEndingFacts.palaceHeld, true, 'and the best night is kept');
  });

  test('a file that only ever had a bad finale does not open it', () => {
    const campaign = emptyCampaign();
    enlist(campaign, { name: 'A. Tomina', background: 'academy', household: 'sister' });
    for (const s of SCENARIOS) {
      if (s.id === 'presidents-flight') continue;
      campaign.completed[s.id] = { score: 1000, tier: 'satisfactory', role: s.roles[0] };
    }
    recordMission(campaign, finale(false));
    assert.equal(isUnlocked(scenarioById('presidents-flight'), campaign), false);
  });

  test('an older file with no best-of field is read from the field it has', () => {
    const campaign = { ...emptyCampaign(), endingFacts: { palaceHeld: true, villeHeld: true } };
    for (const s of SCENARIOS) campaign.completed[s.id] = { score: 1, tier: 'noted', role: s.roles[0] };
    assert.equal(isUnlocked(scenarioById('presidents-flight'), campaign), true);
  });
});
