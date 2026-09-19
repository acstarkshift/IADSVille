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
import {
  scenesFor, standingsDisagree, DISMISSAL_CONSEQUENCE, OFFICER, FAVOUR_BY_KIND,
} from '../src/ui/scenes.js';
import { SCENARIOS } from '../src/engine/scenarios.js';
import { LETTERS } from '../src/engine/family.js';
import { REVELATIONS } from '../src/engine/revelations.js';
import { ENDINGS } from '../src/engine/endings.js';
import { HOUSEHOLDS } from '../src/engine/character.js';
import { DIRECTIVES, LEDGER_SUBJECTS } from '../src/engine/command.js';
import { ASSET_TYPES } from '../src/engine/config.js';

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
    /*
     * The disposition is SHOWN, on the section's own slip clipped to the
     * sheet, and it is shown exactly once: the plate above the paper used to
     * stencil OPENED AND RESEALED and the slip then said the envelope had been
     * opened and resealed, which is one fact printed twice on one screen.
     */
    assert.equal(letter.speaker, 'A LETTER FROM THE VILLE',
      `the plate is the letter's own title and nothing else: "${letter.speaker}"`);
    assert.match(letter.slip, /opened and resealed|not opened first|not the original seal/,
      `the slip says how it arrived: "${letter.slip}"`);
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
    /*
     * And the third figure about aircraft is in the same words as the first
     * two. It used to print LEAKERS, which is service jargon on a tape that
     * spells out everything else — one line under a headline that had already
     * said it in English. The word is gone from every screen; the debrief
     * tiles say GOT THROUGH as well, and no surface a player reads uses it.
     */
    assert.ok(tape.lines.some((l) => /^GOT THROUGH \d+ · ROUNDS EXPENDED \d+$/.test(l)));
    assert.ok(!tape.lines.some((l) => /LEAKER/i.test(l)), 'the tape does not print jargon');
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
    // A rank and a surname on the plate, from the first evening: he is a man
    // doing this, not a department with a face.
    assert.equal(office.speaker, OFFICER.plate);
    assert.match(OFFICER.plate, /^[A-Z]+\. [A-Z]+ · POLITICAL SECTION$/);
    assert.ok(OFFICER.rank && OFFICER.surname && OFFICER.plate.includes(OFFICER.surname.toUpperCase()));
    // Spoken sentences, not the ledger's own lowercase fragment after a colon.
    const hospital = office.lines.findIndex((l) => /district hospital/.test(l));
    // The favour is one of four sentences for that kind, taken by the watch,
    // not one phrase locked to the kind for the campaign.
    const campFavours = FAVOUR_BY_KIND['held-border'].map((f) => f({}));
    const camp = office.lines.findIndex((l) => campFavours.includes(l));
    assert.ok(hospital >= 0, 'the hospital is read back');
    assert.match(office.lines[hospital], /^You put .* over the district hospital/);
    assert.ok(camp >= 0, `and so is the encampment: ${office.lines.join(' | ')}`);
    assert.match(office.lines[camp], /border/);
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
    assert.ok(['You may go.', 'Dismissed.', 'That will be all.', 'Sign here. And here.', 'You will be told where to report.']
      .includes(office.lines.at(-1)), `a dismissal closes the scene: "${office.lines.at(-1)}"`);
    // And the dismissal has something behind it: the line before it costs you
    // something or withholds something. Four to a tier, taken in turn by the
    // watch, so the same man does not say the same thing before every
    // dismissal of the campaign.
    assert.ok(Object.values(DISMISSAL_CONSEQUENCE).flat().includes(office.lines.at(-2)),
      `the dismissal carries a consequence: "${office.lines.at(-2)}"`);
    for (const [tierId, said] of Object.entries(DISMISSAL_CONSEQUENCE)) {
      assert.ok(said.length >= 4, `${tierId} has more than one thing to say`);
      assert.equal(new Set(said).size, said.length, `${tierId} says four different things`);
    }
  });

  /*
   * The one recurring character in the game does not read a stencil label out
   * loud, and he debriefs the watch that was actually about something.
   */
  test('he says the place aloud, and it is the place the watch was about', () => {
    const { state, result, entry } = stood('economy-of-force');
    // Two places lost: the one the scenario's list happens to hold first, and
    // the one the whole watch is built around.
    result.assets = [
      { id: 'a_airbase', type: 'airbase', label: 'AIRBASE', destroyed: true, damagePct: 100, casualties: 0, districtsHit: [] },
      { id: 'a_hospital', type: 'hospital', label: 'DISTRICT HOSPITAL', destroyed: true, damagePct: 100, casualties: 31, districtsHit: [] },
    ];
    const office = scenesFor(state, result, entry).find((s) => s.id === 'commissar');
    assert.match(office.lines[0], /the district hospital/,
      `the watch about the hospital is debriefed about the hospital: "${office.lines[0]}"`);
    const SHOUTED = /\b(AIRBASE|SECTOR OPS|DISTRICT HOSPITAL|THE VILLE|REFUGEE ENCAMPMENT|PRESIDENTIAL PALACE|DEMOBODEDOVO)\b/;
    for (const line of office.lines) {
      assert.ok(!SHOUTED.test(line), `nobody speaks in stencil capitals: "${line}"`);
    }
  });

  /*
   * And every place on every board has a spoken name, so a scenario adding a
   * building cannot put a stencil label back in his mouth.
   */
  test('every place the raid can take has a name he can say out loud', () => {
    const { state, result, entry } = stood('economy-of-force');
    const seen = new Map();
    for (const sc of SCENARIOS) {
      for (const a of sc.assets ?? []) {
        seen.set(a.label ?? ASSET_TYPES[a.type]?.label ?? '', a.type);
      }
    }
    assert.ok(seen.size >= 10, 'the campaign has a board to check');
    for (const [label, type] of seen) {
      const r = { ...result, reason: 'raid-spent', assets: [{ id: 'x', type, label, destroyed: true, damagePct: 100, casualties: 0, districtsHit: [] }] };
      const line = scenesFor(state, r, entry).find((s) => s.id === 'commissar').lines[0];
      assert.ok(!/\b[A-Z][A-Z0-9]{2,}\b/.test(line),
        `"${label}" is read out as a stencil label: "${line}"`);
      assert.ok(!line.includes(label.toLowerCase()) || label.length < 5
        || /the |at |Kubin|Lozan|Brasov/.test(line),
        `"${label}" needs a spoken form: "${line}"`);
    }
  });

  /*
   * And he does not open every evening of the campaign on one sentence. The
   * round that gave him a line about the night installed exactly one per
   * outcome shape, so ten watches in a row began identically.
   */
  test('the office does not open on the same sentence watch after watch', () => {
    const { state, result, entry } = stood('economy-of-force');
    const openings = new Set();
    for (let i = 0; i < 6; i++) {
      state.campaign.history.push({ tier: 'satisfactory', missionId: `filler-${i}` });
      openings.add(scenesFor(state, result, entry).find((s) => s.id === 'commissar').lines[0]);
    }
    assert.ok(openings.size >= 3,
      `the same night on six watches opens more than one way: ${[...openings].join(' / ')}`);
  });

  /*
   * The evening after the post itself was struck. The operator was not at the
   * console for the end of that watch — the engine plays the rest of it out
   * without them and marks the record wounded — so there is nobody to
   * interview, and the ending three minutes later says so out loud.
   */
  test('a night the post was struck arrives as a written finding, not an interview', () => {
    const { state, result, entry } = stood('economy-of-force');
    result.reason = 'site-lost';
    const office = scenesFor(state, result, entry).find((s) => s.id === 'commissar');
    assert.equal(office.written, true, 'the picture is told it is a document');
    /*
     * And it is its own kind of scene, because the office drawer puts a man
     * across the desk with the file open in both hands — under a first line
     * that says the finding is sent rather than read. Same room, nobody in it.
     */
    assert.equal(office.kind, 'finding',
      'the finding is drawn as a finding, not as an interview');
    assert.match(office.speaker, /FINDING/, `the plate says what it is: "${office.speaker}"`);
    assert.match(office.lines[0], /sent to you rather than read to you/);
    // It closes on the paper, not on the condemned dismissal's own sentence,
    // which three different nights used to end on.
    assert.match(office.lines.at(-1), /This finding is signed/);
    assert.ok(!office.lines.some((l) => /The post was struck at/.test(l)),
      'the striking of the post is left to the ending, which needs it');
    assert.ok(!office.lines.some((l) => /^Dismissed\.$|^You may go\.$/.test(l)),
      'nobody is dismissed from a room they were never in');
    /*
     * And it is written throughout. It used to borrow the desk's own clauses —
     * the file entry as he reads it out, the household roll he looked up this
     * afternoon, the standings reconciled at you — so the register broke in the
     * middle of the one beat whose whole point is that nobody is talking.
     */
    for (const line of office.lines.slice(1)) {
      assert.ok(!/\bI (have|had|looked|opened|am|would|will|countersigned)\b|, to me,/.test(line),
        `a signed finding does not speak in the first person: "${line}"`);
    }
    // And on a night the household's own quarter is on the returns, the roll is
    // consulted the way a document consults one, not the way a man mentions it.
    const hit = { ...result, stats: { ...result.stats, homeDistrictHit: true } };
    const written = scenesFor(state, hit, entry).find((s) => s.id === 'commissar');
    assert.ok(written.lines.some((l) => /roll was consulted before this finding was written/.test(l)),
      `the roll is consulted the way a document says it: ${JSON.stringify(written.lines)}`);
    for (const line of written.lines.slice(1)) {
      assert.ok(!/\bI (have|had|looked|opened|am|would|will|countersigned)\b|, to me,/.test(line),
        `a signed finding does not speak in the first person: "${line}"`);
    }
  });

  /*
   * The rare-case clause is rare again. It used to fire on every evening where
   * the watch and the file differed at all, which is most of them, three
   * seconds after the tape had printed both figures. And it says which way they
   * parted, in words, rather than setting two bureaucratic labels beside each
   * other and leaving a new player to rank them.
   */
  test('the two standings are only reconciled aloud when they are far apart', () => {
    const { state, result, entry } = stood('economy-of-force');
    const said = (standing, tier) => {
      state.campaign.standing = standing;
      result.tier = tier;
      const clause = standingsDisagree(result, state.campaign,
        state.campaign.history?.length ?? 0);
      const office = scenesFor(state, result, entry).find((s) => s.id === 'commissar');
      // Whatever it says, the scene says exactly that and nothing else about it.
      assert.equal(office.lines.includes(clause), clause !== null,
        'the clause the helper composes is the clause the office speaks');
      return clause;
    };
    assert.equal(said(60, 'satisfactory'), null, 'the file and the watch agree');
    assert.equal(said(60, 'noted'), null, 'one step apart is not worth a sentence');
    const worse = said(60, 'condemned');
    assert.ok(worse, 'three steps apart is');
    assert.match(worse, /worse|deserves/, `it names which way they parted: "${worse}"`);
    const better = said(10, 'commended');
    assert.ok(better, 'and so is three steps the other way');
    assert.match(better, /better|best/, `it names which way they parted: "${better}"`);
    assert.ok(!/under review|referred/i.test(`${worse} ${better}`),
      'and it does not set two bureaucratic labels against each other');
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
    /*
     * Stand the two radar watches, which is what the first promotion in the
     * game is now for: the order that moves a recruit off the set and into the
     * cabin. It is the battalion's own paper, not the Chief of Air Defence's —
     * nobody in Mostrograd appoints a man to a launcher — and it is the first
     * order the player is ever handed, so it is the one that writes the
     * service out in full.
     */
    const campaign = enlisted();
    for (const id of ['first-light', 'low-riders']) {
      const { entry, state, result } = stood(id, { campaign, role: 'radar' });
      if (entry.appointment) {
        const order = scenesFor(state, result, entry).find((s) => s.id === 'appointment');
        assert.ok(order, 'the order is read on its own');
        // One spelling for the job, here and on the briefing, the roster and
        // the personnel file: Missile Operator, capitalised as a title.
        assert.match(order.lines[0],
          /^By order of the battalion, you are appointed Missile Operator\.$/);
        assert.equal(order.kind, 'appointment', 'the promotion gets its own shot');
        // The first order the player is ever handed writes the service out.
        // The stamp on it, the stamp on the report and the plate on the card
        // are all the short form, and nothing had ever expanded it.
        assert.ok(order.lines.some((l) => /Air Defence Forces of Trans Mordovia/.test(l)),
          'the service is spelled out where its stamp first appears');
        // And the sheet is signed by an office above the one it appoints to,
        // which for a launcher crew is the orderly room down the track.
        assert.equal(order.office, 'BATTALION ORDERLY ROOM');

        /*
         * The order knows what kind of night it was issued on. It used to read
         * the CARRIED file only, so the worst night in the campaign — the post
         * lost under a record whose carried tier happened to be noted — was
         * gazetted perfectly clean.
         */
        // With the carried file settled at satisfactory, the caveat can only
        // be coming from the night itself.
        state.campaign.standing = 60;
        const clean = scenesFor(state, { ...result, tier: 'satisfactory' }, entry)
          .find((s) => s.id === 'appointment');
        assert.ok(!clean.lines.some((l) => /Nobody has withdrawn it|will sit in the same file/.test(l)),
          'a decent night gets the order without a caveat');
        const bad = scenesFor(state, { ...result, tier: 'condemned' }, entry)
          .find((s) => s.id === 'appointment');
        assert.ok(bad.lines.some((l) => /will sit in the same file/.test(l)),
          `a referred night is on the order: ${JSON.stringify(bad.lines)}`);
        const lost = scenesFor(state, { ...result, reason: 'site-lost' }, entry)
          .find((s) => s.id === 'appointment');
        assert.ok(lost.lines.some((l) => /the position no longer exists/.test(l)),
          `and a lost post outranks whatever the file was carrying: ${JSON.stringify(lost.lines)}`);
        return;
      }
    }
    assert.fail('the two radar watches should have ended in an appointment');
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
