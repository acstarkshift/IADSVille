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
  enlist(campaign, { name: 'Dragan Krushev', background: 'factory', household });
  const sequence = [];
  const payloads = [];
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
      payloads.push(entry.letter);
    }
  }
  return { campaign, sequence, payloads };
}

/** Ordinary file all campaign: everything arrives, resealed. */
const CLEAN = () => 60;

/**
 * The rough road: flagged on the hospital watch, condemned on the border
 * watch, then a recovered file. Exercises withholding, the release queue, the
 * permit machine end to end, and the one-card precedence rules.
 */
const ROUGH = (id) => ({ 'weasel-hour': 20, 'economy-of-force': 5 }[id] ?? 60);

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
    const ctx = {
      hit: false, permit: 'standing', watch: 3, name: 'Dragan Krushev', rank: 'Sergeant',
    };
    for (const letter of LETTERS) {
      for (const hh of Object.keys(HOUSEHOLDS)) {
        const lines = letter.lines(hh, ctx);
        assert.ok(Array.isArray(lines) && lines.length >= 2,
          `${letter.id} must be written for ${hh}, not summarised`);
        for (const line of lines) assert.equal(typeof line, 'string');
      }
    }
  });

  /*
   * The player: "The letter from home shouldn't be a 3rd party describing the
   * letter. I should be the text of the letter from home." So every branch of
   * every letter is a letter: it opens with a salutation, it is written in the
   * first person, it is signed by somebody with a name, and nowhere in it does
   * a narrator explain the post to the man holding it.
   */
  test('every letter is the letter itself, in the first person of the one who wrote it', () => {
    const WRITERS = {
      mother: /Ksenia/, sister: /Nata/, grandmother: /Vera/, brother: /Ilya/,
    };
    for (const letter of LETTERS) {
      for (const hh of Object.keys(HOUSEHOLDS)) {
        for (const hit of [true, false]) {
          const lines = letter.lines(hh, {
            hit, permit: 'standing', watch: 8, name: 'Dragan Krushev', rank: 'Sergeant',
          });
          const where = `${letter.id}/${hh}${hit ? '/hit' : ''}`;
          assert.ok(lines.length >= 3, `${where} has a salutation, a body and a signature`);
          assert.match(lines[0], /,$/, `${where} opens on a salutation: "${lines[0]}"`);
          assert.match(lines.at(-1), WRITERS[hh],
            `${where} is signed by the person who wrote it: "${lines.at(-1)}"`);
          const body = lines.slice(1, -1).join(' ');
          assert.match(body, /\b(?:I|me|my|we|us|our)\b/i,
            `${where} is written in the first person`);
          assert.ok(!/\b(?:writes|reports|adds|remarks) that\b/.test(body),
            `${where} has no narrator standing between the player and the paper`);
          assert.ok(!/^(?:Your|The) (?:mother|sister|grandmother|brother|letter)\b/.test(body),
            `${where} does not describe itself`);
          assert.ok(!/[А-Яа-яЁё]/.test(lines.join(' ')), `${where} is in Latin letters`);
        }
      }
    }
  });

  /* The salutation is the player's own given name, and one letter is not. */
  test('the letters are addressed to you, and the shorter one is addressed to your rank', () => {
    const ctx = {
      hit: false, permit: 'standing', watch: 9, name: 'Dragan Krushev', rank: 'Junior Lieutenant',
    };
    for (const hh of Object.keys(HOUSEHOLDS)) {
      assert.match(LETTERS.find((l) => l.id === 'first-post').lines(hh, ctx)[0], /Dragan/,
        `the first letter greets ${hh}'s soldier by name`);
      const shorter = LETTERS.find((l) => l.id === 'shorter').lines(hh, ctx);
      assert.equal(shorter[0], 'To Junior Lieutenant Krushev,',
        'the shorter letter is addressed to the rank and the surname, which is the point of it');
    }
  });

  test('the aftermath letter knows whether their quarter is on the returns', () => {
    const ctx = { permit: 'standing', watch: 8, name: 'Dragan Krushev', rank: 'Sergeant' };
    const hit = LETTERS.find((l) => l.id === 'aftermath')
      .lines('mother', { ...ctx, hit: true }).join(' ');
    const spared = LETTERS.find((l) => l.id === 'aftermath')
      .lines('mother', { ...ctx, hit: false }).join(' ');
    assert.notEqual(hit, spared);
    // Her quarter was struck: the letter is the repairs, and one sentence about
    // the night that she then refuses to expand on.
    assert.match(hit, /glazier/i);
    assert.match(hit, /some excitement here/i);
    // It was not: she names the quarters that were, and stops asking questions.
    assert.match(spared, /stopped asking you questions/i);
  });
});

describe('the post follows the file', () => {
  test('an ordinary campaign receives all seven letters, opened and resealed', () => {
    const { campaign, sequence } = walk('mother', CLEAN);
    assert.deepEqual(sequence, [
      { id: 'first-post', disposition: 'resealed' },
      { id: 'dispensary', disposition: 'resealed' },
      { id: 'hospital-road', disposition: 'resealed' },
      { id: 'aftermath', disposition: 'resealed' },
      { id: 'shorter', disposition: 'resealed' },
      { id: 'last-before', disposition: 'resealed' },
      // and one on the desk before the last watch, from a house the column passed
      { id: 'column-south', disposition: 'resealed' },
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
    const { campaign, sequence, payloads } = walk('brother', ROUGH);
    assert.deepEqual(sequence, [
      { id: 'first-post', disposition: 'resealed' },
      { id: 'dispensary', disposition: 'resealed' },
      // The hospital watch is flagged: its letter exists, has a postmark, and
      // is somewhere in the sector office. You get the notice.
      { id: 'withheld-notice', disposition: 'withheld' },
      // A new watch's own letter outranks the release of a held one, and the
      // household now writes on every one of the last four watches...
      { id: 'aftermath', disposition: 'resealed' },
      { id: 'shorter', disposition: 'resealed' },
      { id: 'last-before', disposition: 'resealed' },
      { id: 'column-south', disposition: 'resealed' },
      // ...so the held letter comes back on the first quiet clean watch,
      // which is the last one, under the wrong seal.
      { id: 'hospital-road', disposition: 'released' },
    ]);
    // The review the condemned watch opened was concluded two clean watches
    // later, and with no quiet evening left for a sheet of its own, the
    // section's one line about it goes out on the released letter's docket.
    const release = payloads.find((p) => p.id === 'hospital-road');
    assert.match(release.note, /Released without comment/);
    assert.match(release.note, /residence permit is concluded\. No action is taken/);
    const file = campaign.character.record.filter((r) => r.kind === 'family');
    const released = file.find((r) => r.id === 'hospital-road' && r.disposition === 'released');
    const closed = file.find((r) => r.id === 'permit' && r.disposition === 'closed');
    assert.ok(released && closed, 'both the release and the conclusion are entered on the file');
    assert.equal(closed.at, released.at, 'on the same evening, as one docket');
    assert.equal(campaign.family.permit, 'closed');
    assert.equal(campaign.family.permitNoticeDue, false, 'the section owes nothing further');
    assert.equal(campaign.family.withheld.length, 0);
    assert.equal(familyClause(campaign.family), null, 'every thread closed');
  });

  test('a review that concludes with a quiet evening to spare still gets its own sheet', () => {
    // Condemned on a watch with nothing to withhold; the review opens, two
    // clean watches close it, and the watch it closes on has no letter of its
    // own, so the notice arrives as paper in its own right.
    //
    // RE-KEYED FOR THE TWELVE-TO-TEN CUT: this was the fifth watch, which was
    // White Noise and carried no letter. The fifth watch is now Economy of
    // Force, which carries the road letter, so condemning there withholds it
    // and the walk measures a release instead of a notice. Weasel Hour is the
    // watch that has the shape this test is about now.
    const early = (id) => (id === 'weasel-hour' ? 5 : 60);
    const { sequence, payloads } = walk('sister', early);
    const notice = sequence.find((s) => s.id === 'permit-close');
    assert.deepEqual(notice, { id: 'permit-close', disposition: 'notice' });
    assert.equal(payloads.find((p) => p.id === 'permit-close').isLetter, false);
    assert.equal(sequence.filter((s) => s.disposition === 'released').length, 0);
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
    // two letters are withheld and the permit review has no clean watches to
    // close on. The machine must NOT quietly resolve either — that is the
    // clause's job at the finale.
    const late = (id) => (['reinforce-the-capital', 'two-cities', 'presidents-flight']
      .includes(id) ? 5 : 60);
    const { campaign } = walk('mother', late);
    assert.equal(campaign.family.permit, 'review');
    assert.equal(campaign.family.withheld.length, 2);
    const clause = familyClause(campaign.family);
    assert.match(clause, /Two letters addressed to you remain/);
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
    const character = createCharacter({ name: 'Dragan Krushev', household: 'mother' });
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
    assert.equal(briefLine(campaign, 'economy-of-force'), null, 'quiet when there is nothing to say');

    campaign.family.permit = 'review';
    assert.match(briefLine(campaign, 'economy-of-force'), /residence permit/);
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
    // Only on the watch after the campaign ended. It used to print on every
    // briefing once an ending existed, including a replayed First Light.
    assert.ok(!/stopped reading anything/.test(familyBriefingNote(campaign, 'first-light')),
      'not on a replayed early watch, where the office is still open');
    assert.match(familyBriefingNote(campaign, 'presidents-flight'), /stopped reading anything/);
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
    const character = createCharacter({ name: 'Dragan Krushev', household: 'mother' });
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
