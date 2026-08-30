/**
 * The letters that do or do not arrive.
 *
 * Three claims are defended. First, the post is deterministic and follows the
 * file: the same campaign produces the same letters in the same order, with no
 * dice anywhere, and there is no lever a player could pull to farm one.
 * Second, every thread the system opens, it closes — a withheld letter is
 * released or counted at the finale, and the residence-permit review the
 * condemned tier threatens is concluded on every path. Third, the surfaces
 * exist: the debrief card payload, the dossier record, the briefing lines, and
 * the finale clause.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  LETTERS, letterById, emptyFamily, recordFamily, briefLine, familyBriefingNote, familyClause,
} from '../src/engine/family.js';
import {
  emptyCampaign, enlist, recordMission, loadCampaign, saveCampaign, memoryStore, briefingNote,
} from '../src/engine/campaign.js';
import { HOUSEHOLDS } from '../src/engine/character.js';
import { SCENARIOS, FINALE_ID } from '../src/engine/scenarios.js';
import { composeEnding } from '../src/engine/endings.js';
import { World } from '../src/engine/world.js';
import { scenarioById } from '../src/engine/scenarios.js';
import { damageAsset } from '../src/engine/damage.js';
import { createCharacter } from '../src/engine/character.js';

/* ------------------------------------------------------------ the walks */

/**
 * Stand the whole campaign with a scripted standing per watch. Standing is
 * pinned before each record so the blend lands exactly on the target and the
 * tier is the tier we asked for.
 */
function walk(household, standingFor = () => 60) {
  const campaign = emptyCampaign();
  enlist(campaign, { name: 'Тест', background: 'factory', household });
  const sequence = [];
  for (const scenario of SCENARIOS) {
    const target = standingFor(scenario.id);
    campaign.standing = target;
    const entry = recordMission(campaign, {
      missionId: scenario.id,
      role: 'net',
      score: 900,
      standing: target,
      stats: { leakers: 0, kills: 4, assetsLost: 0 },
    });
    if (entry.letter) {
      sequence.push({ id: entry.letter.id, disposition: entry.letter.disposition });
    }
  }
  return { campaign, sequence };
}

/** Ordinary file all campaign: everything arrives, resealed. */
const CLEAN = () => 60;

/**
 * The rough road: flagged on the hospital watch, condemned on the border
 * watch, then a recovered file. Exercises withholding, the release queue, the
 * permit machine end to end, and the one-card precedence rules.
 */
const ROUGH = (id) => ({ 'economy-of-force': 20, 'across-the-line': 5 }[id] ?? 60);

describe('the letters themselves', () => {
  test('every letter is keyed to a watch that exists, in campaign order', () => {
    const order = SCENARIOS.map((s) => s.id);
    let last = -1;
    for (const letter of LETTERS) {
      const ats = [].concat(letter.after).map((m) => order.indexOf(m));
      for (const at of ats) assert.ok(at >= 0, `${letter.id} is keyed to a real watch`);
      const first = Math.min(...ats);
      assert.ok(first > last, `${letter.id} comes after the letter before it`);
      last = Math.max(...ats);
    }
  });

  test('every heading is stencilled in both languages, like everything else', () => {
    for (const letter of LETTERS) {
      assert.match(letter.tm, /[А-Яа-яЁё]/, `${letter.id} has a Cyrillic heading`);
      assert.match(letter.title, /[A-Z]/, `${letter.id} has its English beside it`);
    }
    for (const hh of Object.values(HOUSEHOLDS)) {
      assert.match(hh.tm, /[А-Яа-яЁё]/, `${hh.id} household is stencilled`);
      assert.ok(hh.en, `${hh.id} household has its English`);
    }
  });

  test('every household has a voice in every lettered slot', () => {
    const ctx = { hit: false, permit: 'standing', watch: 3 };
    for (const letter of LETTERS) {
      for (const hh of Object.keys(HOUSEHOLDS)) {
        const lines = letter.lines(hh, ctx);
        assert.ok(Array.isArray(lines) && lines.length >= 2,
          `${letter.id} must be written for ${hh}, not summarised`);
        for (const line of lines) assert.equal(typeof line, 'string');
      }
    }
  });

  test('the aftermath letter knows whether their quarter is on the returns', () => {
    const hit = LETTERS.find((l) => l.id === 'aftermath')
      .lines('mother', { hit: true, permit: 'standing', watch: 8 }).join(' ');
    const spared = LETTERS.find((l) => l.id === 'aftermath')
      .lines('mother', { hit: false, permit: 'standing', watch: 8 }).join(' ');
    assert.notEqual(hit, spared);
    assert.match(hit, /repairs/i);
    assert.match(spared, /asks nothing|not-asking/i);
  });
});

describe('the post follows the file', () => {
  test('an ordinary campaign receives all six letters, opened and resealed', () => {
    const { campaign, sequence } = walk('mother', CLEAN);
    assert.deepEqual(sequence, [
      { id: 'first-post', disposition: 'resealed' },
      { id: 'dispensary', disposition: 'resealed' },
      { id: 'hospital-road', disposition: 'resealed' },
      { id: 'aftermath', disposition: 'resealed' },
      { id: 'shorter', disposition: 'resealed' },
      { id: 'last-before', disposition: 'resealed' },
    ]);
    assert.equal(campaign.family.withheld.length, 0);
    assert.equal(campaign.family.permit, 'standing');
    assert.equal(familyClause(campaign.family), null, 'nothing left unresolved');
  });

  test('a commended file gets its letters unopened — the tier line made literal', () => {
    const { sequence } = walk('sister', () => 85);
    assert.ok(sequence.length >= 6);
    for (const s of sequence) assert.equal(s.disposition, 'unopened');
  });

  test('the rough road: withholding, release, and the permit, all closed by the end', () => {
    const { campaign, sequence } = walk('brother', ROUGH);
    assert.deepEqual(sequence, [
      { id: 'first-post', disposition: 'resealed' },
      { id: 'dispensary', disposition: 'resealed' },
      // The hospital watch is flagged: its letter exists, has a postmark, and
      // is somewhere in the sector office. You get the notice.
      { id: 'withheld-notice', disposition: 'withheld' },
      // A new watch's own letter outranks the release of a held one...
      { id: 'aftermath', disposition: 'resealed' },
      { id: 'shorter', disposition: 'resealed' },
      { id: 'last-before', disposition: 'resealed' },
      // ...so the held letter comes back on the first quiet clean watch,
      // under the wrong seal.
      { id: 'hospital-road', disposition: 'released' },
      // And the review the condemned watch opened is concluded: no action,
      // and the review remains in the file.
      { id: 'permit-close', disposition: 'notice' },
    ]);
    assert.equal(campaign.family.permit, 'closed');
    assert.equal(campaign.family.withheld.length, 0);
    assert.equal(familyClause(campaign.family), null, 'every thread closed');
  });

  test('the walk is deterministic: the same campaign twice is the same post twice', () => {
    const a = walk('grandmother', ROUGH).sequence;
    const b = walk('grandmother', ROUGH).sequence;
    assert.deepEqual(a, b);
  });

  test('replays never deliver the same letter twice', () => {
    const { campaign } = walk('mother', CLEAN);
    const delivered = campaign.family.delivered.length;
    campaign.standing = 60;
    const entry = recordMission(campaign, {
      missionId: 'first-light', role: 'net', score: 500, standing: 60,
      stats: { leakers: 0, kills: 2, assetsLost: 0 },
    });
    assert.equal(entry.letter, null);
    assert.equal(campaign.family.delivered.length, delivered);
  });

  test('what is still held at the finale becomes a clause, not a loose end', () => {
    // A file that goes condemned at the promotion and never recovers: the last
    // letter is withheld and the permit review has no clean watches to close
    // on. The machine must NOT quietly resolve either — that is the clause's
    // job at the finale.
    const late = (id) => (['reinforce-the-capital', 'two-cities', 'presidents-flight']
      .includes(id) ? 5 : 60);
    const { campaign } = walk('mother', late);
    assert.equal(campaign.family.permit, 'review');
    assert.equal(campaign.family.withheld.length, 1);
    const clause = familyClause(campaign.family);
    assert.match(clause, /One letter/);
    assert.match(clause, /overtaken by events/);
  });
});

describe('the surfaces', () => {
  test('the finale ending carries the clause when letters are still held', () => {
    const finaleOutcome = (over = {}) => ({
      missionId: FINALE_ID,
      reason: 'raid-spent',
      finale: true,
      assets: [
        { type: 'town', label: 'THE VILLE', destroyed: false, damagePct: 90, districtsHit: [] },
        { type: 'palace', label: 'PRESIDENTIAL PALACE', destroyed: false, damagePct: 5 },
      ],
      stats: {
        civilianCasualties: 200, homeDistrictHit: false,
        roundsByCluster: { ville: 2, capital: 16 }, roundsByAsset: {},
        roundsAgainstOrder: 0, postOverrun: false, displacedToSurvive: false,
      },
      constraints: { palaceOrderAccepted: true },
      ...over,
    });
    const character = createCharacter({ name: 'Тест', household: 'mother' });
    const family = { ...emptyFamily(), withheld: [{ id: 'hospital-road', sinceWatch: 6 }] };

    const withClause = composeEnding(finaleOutcome(), character, { family });
    assert.equal(withClause.id, 'obedient');
    assert.match(withClause.lines.join(' '), /political section, to be forwarded/);

    const without = composeEnding(finaleOutcome(), character, { family: emptyFamily() });
    assert.ok(!/to be forwarded/.test(without.lines.join(' ')), 'no clause when nothing is held');

    const twoArg = composeEnding(finaleOutcome(), character);
    assert.equal(twoArg.id, 'obedient', 'the old signature still works');
  });

  test('the briefing lines exist and know their place', () => {
    const { campaign } = walk('sister', CLEAN);
    const ville = briefLine(campaign, 'ville-under-fire');
    assert.match(ville, /the mill quarter/, "the sister's household lives in the mill quarter");
    assert.equal(briefLine(campaign, 'white-noise'), null, 'quiet when there is nothing to say');

    campaign.family.permit = 'review';
    assert.match(briefLine(campaign, 'white-noise'), /residence permit/);
  });

  test('a withholding colours the next briefing note, and the epilogue silences the office', () => {
    const { campaign } = walk('brother', ROUGH);
    // Reconstruct the moment after the flagged watch: the note leans on it.
    campaign.family.lastDisposition = {
      id: 'withheld-notice', disposition: 'withheld', watch: campaign.history.length,
    };
    assert.match(familyBriefingNote(campaign), /letter addressed to you/);
    assert.match(briefingNote(campaign), /letter addressed to you/,
      'the campaign note consults the post first');

    campaign.ending = 'obedient';
    assert.match(familyBriefingNote(campaign), /stopped reading anything/);
    assert.equal(briefingNote(campaign, { narrativePressure: false }), null,
      'and none of it exists with the pressure off');
  });

  test('deliveries are entered on the record of service', () => {
    const { campaign } = walk('mother', ROUGH);
    const kinds = campaign.character.record.filter((r) => r.kind === 'family');
    assert.ok(kinds.some((r) => r.disposition === 'withheld'));
    assert.ok(kinds.some((r) => r.disposition === 'released'));
    assert.ok(kinds.some((r) => r.disposition === 'resealed'));
  });

  test('a save from before the post existed loads with an empty mailbag', () => {
    const { campaign } = walk('mother', CLEAN);
    const store = memoryStore();

    const stripped = JSON.parse(JSON.stringify(campaign));
    delete stripped.family;
    saveCampaign(store, stripped);
    const loaded = loadCampaign(store);
    assert.deepEqual(loaded.family, emptyFamily());

    const partial = JSON.parse(JSON.stringify(campaign));
    partial.family = { permit: 'review' };
    saveCampaign(store, partial);
    const rehydrated = loadCampaign(store);
    assert.equal(rehydrated.family.permit, 'review');
    assert.deepEqual(rehydrated.family.delivered, [], 'missing fields fill from defaults');
  });
});

describe('the quarter on the returns', () => {
  test('a hit on the home quarter is followed by the trunk-lines line, once, flagged personal', () => {
    const character = createCharacter({ name: 'Тест', household: 'mother' });
    const world = new World(scenarioById('ville-under-fire'), {
      role: 'net', seed: 'trunks', character,
    });
    const town = world.assets.find((a) => a.type === 'town');
    // The struck quarter is drawn per hit; keep hitting until it is theirs.
    for (let i = 0; i < 60 && !world.stats.homeDistrictHit; i++) {
      damageAsset(world, town, 2, null);
    }
    assert.ok(world.stats.homeDistrictHit, 'their quarter is on the returns');

    for (let i = 0; i < 100; i++) world.step(0.1);
    const personal = world.events.filter((e) => e.personal);
    assert.ok(personal.some((e) => /TRUNK LINES/.test(e.text)), 'the follow-up line arrives');
    assert.equal(personal.filter((e) => /TRUNK LINES/.test(e.text)).length, 1, 'and only once');

    // More hits on the same quarter do not repeat it.
    for (let i = 0; i < 60; i++) damageAsset(world, town, 2, null);
    for (let i = 0; i < 100; i++) world.step(0.1);
    assert.equal(world.events.filter((e) => /TRUNK LINES/.test(e.text)).length, 1);
  });

  test('letterById covers everything the record can reference', () => {
    for (const id of ['first-post', 'dispensary', 'hospital-road', 'aftermath', 'shorter', 'last-before']) {
      assert.ok(letterById(id), id);
    }
    assert.equal(letterById('nonesuch'), null);
  });
});
