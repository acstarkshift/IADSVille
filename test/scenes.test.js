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
import { SCENARIOS } from '../src/engine/scenarios.js';
import { LETTERS } from '../src/engine/family.js';
import { REVELATIONS } from '../src/engine/revelations.js';
import { ENDINGS } from '../src/engine/endings.js';
import { HOUSEHOLDS } from '../src/engine/character.js';
import { DIRECTIVES, LEDGER_SUBJECTS } from '../src/engine/command.js';

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

describe('which scenes play', () => {
  test('every watch opens on the printout and goes to the office', () => {
    const { state, result, entry } = stood('first-light');
    const ids = scenesFor(state, result, entry).map((s) => s.id);
    assert.equal(ids[0], 'printout');
    assert.equal(ids[1], 'commissar');
  });

  /*
   * The player: "The letter from home shouldn't be a 3rd party describing the
   * letter. I should be the text of the letter from home. ... the disposition
   * shown as a slip, a stamp or a line on the speaker plate, never narrated."
   * The scene carries the letter and nothing else; how it arrived is on the
   * plate and on the slip.
   */
  test('the first watch brings the letter itself, read in quarters, after the office', () => {
    const { state, result, entry } = stood('first-light');
    const scenes = scenesFor(state, result, entry);
    const letter = scenes.find((s) => s.id === 'letter');
    assert.ok(letter, 'a letter arrives with the first file entry');
    assert.equal(letter.kind, 'quarters');
    assert.ok(scenes.indexOf(letter) > scenes.findIndex((s) => s.id === 'commissar'));
    assert.match(letter.speaker, /LETTER FROM THE VILLE/);
    // The disposition is stencilled on the plate, not read out as a sentence.
    assert.match(letter.speaker, / · (?:DELIVERED UNOPENED|OPENED AND RESEALED|HELD, THEN RELEASED)$/,
      `the plate says how it arrived: "${letter.speaker}"`);
    assert.ok(!letter.lines.some((l) => /envelope has been opened|It was not opened first/.test(l)),
      'and the section\'s docket is a slip, not a line of the letter');
    assert.ok(letter.slip, 'the slip exists for a letter somebody opened');
    // And the letter is a letter: Ksenia writes it, in the first person.
    assert.match(letter.lines[0], /^Dear Yasna,$/, 'it opens on a salutation with your name in it');
    assert.match(letter.lines.at(-1), /Ksenia/, 'and it is signed by the woman who wrote it');
    assert.ok(!letter.lines.some((l) => /Your mother writes/.test(l)),
      'nobody stands between the player and the paper');
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
    assert.match(scenes[1].lines[0], /You left the post at \d\d:\d\d, .* into the watch/);
  });

  test('an ending watch closes on the ending, with the document read before the office', () => {
    const { state, result, entry } = stood('two-cities', { seconds: 900 });
    const ids = scenesFor(state, result, entry).map((s) => s.id);
    assert.equal(ids.at(-1), 'ending', 'the ending is the last thing said');
    // The folder is on the desk while you wait, not between the office and the
    // ending, where it answered a question the ending had already closed.
    if (ids.includes('revelation')) {
      assert.ok(ids.indexOf('revelation') < ids.indexOf('commissar'));
    }
    // The appointment that ends the promotion arc is read on the last watches
    // too — first, before the folder and the office, so it closes on screen
    // without taking the ending's place at the end of the evening.
    if (ids.includes('appointment')) {
      assert.equal(ids.indexOf('appointment'), 1,
        'the order is read straight off the tape, before anything else');
      assert.ok(ids.indexOf('appointment') < ids.indexOf('commissar'));
    }
  });

  test('the teaching watches spare a learner the read-back', () => {
    const { state, result, entry } = stood('first-light');
    result.ledger.push({ t: 100, delta: -6, charged: -6, reason: 'rounds expended outside the freeze, over the district hospital' });
    const office = scenesFor(state, result, entry).find((s) => s.id === 'commissar');
    assert.ok(!office.lines.some((l) => /district hospital/.test(l)),
      'nothing is read back on First Light, Low Riders or Solo Battery');
  });
});

describe('what is said', () => {
  test('the tape prints the night as figures, in capitals, and ends', () => {
    const { state, result, entry } = stood('first-light');
    const tape = scenesFor(state, result, entry)[0];
    assert.equal(tape.kind, 'printout');
    assert.match(tape.lines[0], /^FIRST LIGHT · BATTLE MANAGER$/);
    // Both figures, each on its own labelled line, the way the rest of the tape
    // prints. They used to be chained onto one line with a middot, and before
    // that the run was printed in the shape of a wall clock.
    assert.match(tape.lines[1], /^WATCH ENDED \d\d:\d\d$/);
    assert.equal(tape.lines[1].slice(12, 17), result.watchClock);
    assert.match(tape.lines[2], /^WATCH RAN \d+ MIN \d+ SEC$/);
    assert.ok(tape.lines.includes(result.headline));
    assert.ok(tape.lines.some((l) => l === `SCORE ${result.score}`));
    assert.ok(tape.lines.some((l) => /^AIRCRAFT DESTROYED \d+ · TURNED BACK \d+$/.test(l)));
    assert.ok(tape.lines.some((l) => /^LEAKERS \d+ · ROUNDS EXPENDED \d+$/.test(l)));
    assert.ok(tape.lines.some((l) => /^GROUND LOST: /.test(l)));
    // The watch's own standing and the standing the file now carries, named.
    // Both are named STANDING: a bare 3 and a bare 49 are not figures a new
    // player can read, and the briefing's file entry says what the scale is.
    assert.ok(tape.lines.some((l) => /^STANDING THIS WATCH -?\d+ — [A-Z ]+$/.test(l)));
    assert.ok(tape.lines.some((l) => /^STANDING IN THE FILE -?\d+ — [A-Z ]+$/.test(l)));
    // A dot-matrix head does not double-space; no blank lines on the sheet.
    assert.ok(tape.lines.every((l) => l.trim().length > 0), 'no blank lines on the tape');
    assert.equal(tape.lines.at(-1), 'END OF TAPE');
    for (const l of tape.lines) assert.equal(l, l.toUpperCase(), `a dot-matrix head prints capitals: "${l}"`);
  });

  test('the commissar reads the log back before the file entry, and dismisses you by tier', () => {
    // Not a teaching watch: the political section has nothing to accuse a
    // learner of on the first three, and says nothing there.
    const { state, result, entry } = stood('economy-of-force');
    result.ledger.push({ t: 100, delta: -6, charged: -6, reason: 'rounds expended outside the freeze, over the district hospital' });
    result.ledger.push({ t: 200, delta: 4, charged: 4, reason: 'held fire on the encampment as ordered' });
    const office = scenesFor(state, result, entry).find((s) => s.id === 'commissar');
    assert.equal(office.kind, 'office');
    assert.equal(office.speaker, 'THE POLITICAL SECTION');
    // Spoken sentences, not the ledger's own lowercase fragment after a colon.
    const hospital = office.lines.findIndex((l) => /district hospital/.test(l));
    const camp = office.lines.findIndex((l) => /border/.test(l) && /in your favour/.test(l));
    assert.ok(hospital >= 0, 'the hospital is read back');
    assert.match(office.lines[hospital], /^You put .* over the district hospital/);
    assert.ok(camp >= 0, 'and so is the encampment');
    assert.match(office.lines[camp], /in your favour/);
    assert.ok(!office.lines.some((l) => l.startsWith('The log says')),
      'nobody says "The log says:" out loud');
    // The file entry comes after the log, and its supply line is a sentence
    // now: nobody says "SUPPLY: Allocation reduced to 95%." out loud either.
    const entryAt = office.lines.findIndex((l) => /Sector command|Your conduct|A discrepancy|You are referred/.test(l));
    assert.ok(entryAt >= 0, 'the file entry is read out');
    assert.ok(hospital < entryAt && camp < entryAt, 'the log is read before the file entry');
    assert.ok(!office.lines.some((l) => /^[A-Z]+:/.test(l)),
      `nothing in his mouth is a label and a colon: "${office.lines.find((l) => /^[A-Z]+:/.test(l))}"`);
    assert.ok(office.lines.some((l) => /allocation of rounds/i.test(l)),
      'the supply line from the file entry is said as a sentence');
    assert.ok(['You may go.', 'Dismissed.', 'That will be all. For now.', 'Sign here. And here.', 'You will be told where to report.']
      .includes(office.lines.at(-1)), `a dismissal closes the scene: "${office.lines.at(-1)}"`);
    // And the dismissal has something behind it: the line before it costs you
    // something or withholds something.
    assert.ok(Object.values({
      commended: 'One of your crews will be interviewed this week. It is not about tonight.',
      satisfactory: 'I will read the tape again in the morning, when the office is quieter.',
      noted: 'The review is minuted, and the minute goes up to the district with the rest of the post.',
      flagged: 'There are two copies. One goes to the district and one stays in this room.',
      condemned: 'The transport leaves before the mess opens.',
    }).includes(office.lines.at(-2)),
    `the dismissal carries a consequence: "${office.lines.at(-2)}"`);
  });

  /*
   * The rare-case clause is rare again. It used to fire on every evening where
   * the watch and the file differed at all, which is most of them, three
   * seconds after the tape had printed both figures.
   */
  test('the two standings are only reconciled aloud when they are far apart', () => {
    const { state, result, entry } = stood('economy-of-force');
    const said = (standing, tier) => {
      state.campaign.standing = standing;
      result.tier = tier;
      return scenesFor(state, result, entry).find((s) => s.id === 'commissar').lines
        .some((l) => /what your next allocation of rounds is set against/.test(l));
    };
    assert.equal(said(60, 'satisfactory'), false, 'the file and the watch agree');
    assert.equal(said(60, 'noted'), false, 'one step apart is not worth a sentence');
    assert.equal(said(60, 'condemned'), true, 'three steps apart is');
  });

  /*
   * Renaming a directive used to empty a table with no error anywhere.
   *
   * "the priority of fires" became "the designation of a defended place" and
   * the report's divergence filter went on testing for `designated`, which
   * does not match `designation`, so every row about that order silently
   * vanished from the one screen built to show them.
   */
  test('every directive the log can name is recognised by the surfaces that read it back', () => {
    for (const [id, directive] of Object.entries(DIRECTIVES)) {
      if (!directive.label) continue;
      const reason = `no reply to ${directive.label}`;
      assert.ok(LEDGER_SUBJECTS.test(reason),
        `the report's divergence table would drop "${reason}" (${id})`);
    }
  });

  test('a promotion is read as an order of appointment', () => {
    // Stand the whole battalion act so the file reaches the sector.
    const campaign = enlisted();
    for (const id of ['first-light', 'low-riders', 'solo-battery']) {
      const { entry, state, result } = stood(id, { campaign, role: id === 'solo-battery' ? 'crew' : 'net' });
      if (entry.appointment) {
        const order = scenesFor(state, result, entry).find((s) => s.id === 'appointment');
        assert.ok(order, 'the order is read on its own');
        assert.match(order.lines[0],
          /^By order of the Chief of Air Defence, you are appointed Sector commander\.$/);
        assert.equal(order.kind, 'appointment', 'the promotion gets its own shot');
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


/*
 * The house rule, as a lint.
 *
 * Everything the player reads as prose renders one array entry as one
 * paragraph, so every entry has to be a finished sentence. The briefs used to
 * carry three that were one sentence chopped in half mid-clause and set as two
 * paragraphs — "...for about sixty kilometres, and" / "not one metre further."
 */
describe('every paragraph is a finished sentence', () => {
  const finished = (line, where) => {
    assert.equal(typeof line, 'string', `${where} is a string`);
    assert.ok(line.trim().length > 0, `${where} is not empty`);
    assert.match(line.trim(), /[.!?)'"\u201d]$/, `${where} ends a sentence: "${line.slice(-42)}"`);
    assert.match(line.trim(), /^[A-Z"'\u201c(]/, `${where} starts a sentence: "${line.slice(0, 42)}"`);
  };

  test('the briefs, what each watch is for, and the lines a revelation unlocks', () => {
    for (const sc of SCENARIOS) {
      sc.brief.forEach((l, i) => finished(l, `${sc.id} brief[${i}]`));
      finished(sc.teaches, `${sc.id} teaches`);
      for (const [id, lines] of Object.entries(sc.briefIfKnown ?? {})) {
        lines.forEach((l, i) => finished(l, `${sc.id} briefIfKnown.${id}[${i}]`));
      }
    }
  });

  /*
   * A letter has a shape of its own: a salutation, then finished sentences,
   * then a signature. The rule is not loosened for it — it is stated. The
   * salutation ends on a comma and the signature names the writer; every
   * paragraph between them is a whole sentence like everything else.
   */
  test('the letters, in every household branch', () => {
    for (const letter of LETTERS) {
      for (const hh of Object.keys(HOUSEHOLDS)) {
        for (const hit of [true, false]) {
          const lines = letter.lines(hh, {
            hit, permit: 'standing', watch: 8, name: 'Dragan Krushev', rank: 'Sergeant',
          });
          const where = `${letter.id}/${hh}`;
          assert.match(lines[0], /^[A-Z][^.!?]*,$/, `${where} opens on a salutation: "${lines[0]}"`);
          assert.match(lines.at(-1), /^[A-Z].*[.)]$/,
            `${where} closes on a signature: "${lines.at(-1)}"`);
          lines.slice(1, -1).forEach((l, i) => finished(l, `${where}[${i + 1}]`));
        }
      }
    }
  });

  test('the documents', () => {
    for (const [id, r] of Object.entries(REVELATIONS)) {
      r.lines.forEach((l, i) => finished(l, `${id}[${i}]`));
      if (r.linesFor) {
        r.linesFor({ stats: { roundsAgainstFreeze: 0, roundsAgainstOrder: 0 } })
          .forEach((l, i) => finished(l, `${id} obedient[${i}]`));
      }
    }
  });

  test('none of the four banned shapes survives anywhere a player can read', () => {
    const surfaces = [];
    for (const sc of SCENARIOS) surfaces.push(...sc.brief, sc.teaches, sc.subtitle);
    for (const letter of LETTERS) {
      for (const hh of Object.keys(HOUSEHOLDS)) {
        for (const hit of [true, false]) surfaces.push(...letter.lines(hh, { hit, permit: 'standing', watch: 8 }));
      }
    }
    for (const r of Object.values(REVELATIONS)) surfaces.push(...r.lines);
    const text = surfaces.join('\n');
    for (const banned of [
      /pick two/i,
      /you keep|the thing you|you have not been able|the detail you/i,
      /you knew what you were doing|you have not disputed|which of those/i,
      /the not-asking/i,
    ]) {
      assert.ok(!banned.test(text), `a banned shape is back: ${banned}`);
    }
    for (const ending of Object.values(ENDINGS)) {
      assert.ok(!/pick two/i.test(String(ending.subtitle)), 'no slogans in an ending title');
    }
  });
});
