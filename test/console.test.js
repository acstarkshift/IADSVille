/**
 * The console's controls: what they answer to, and what leaving costs.
 *
 * Three rules the interface used to break, all of them reachable without a
 * browser because the rules themselves are data:
 *
 *  - a watch that was walked out of is not a watch that was won;
 *  - a number key means the number printed on the cap;
 *  - a control a watch has removed is removed from the key map too.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { World } from '../src/engine/world.js';
import { scenarioById, consoleCaps } from '../src/engine/scenarios.js';
import { emptyCampaign, enlist, recordMission, briefingNote } from '../src/engine/campaign.js';
import { SPEED_BY_KEY, digitPressed } from '../src/ui/keymap.js';
import { CONTROLS, POSTURE_CYCLE, legend, keycap } from '../src/ui/lexicon.js';

const watch = (id, opts = {}) => new World(scenarioById(id), { role: 'net', seed: 5, ...opts });

describe('leaving the post', () => {
  test('an abandoned watch is not a victory, and pays nothing', () => {
    const world = watch('first-light');
    world.step(0.1);
    world.finish('aborted');

    const r = world.outcome;
    assert.equal(r.abandoned, true);
    assert.equal(r.success, false, 'walking out must not read as SECTOR HELD');
    assert.equal(r.headline, 'WATCH ABANDONED');
    assert.ok(r.score <= 0, `an abandoned watch scores nothing, got ${r.score}`);
    assert.equal(r.breakdown.assets, 0, 'the ground-preserved award is for ground defended');
    assert.equal(r.breakdown.turnedBack, 0);
    assert.match(r.cause, /LEFT THE POST/);
  });

  test('the file records the abandonment and banks nothing else', () => {
    const campaign = emptyCampaign();
    enlist(campaign, { name: 'Test', background: 'academy', household: 'mother' });
    const before = { xp: campaign.character.xp, rank: campaign.character.rankIndex };

    const world = watch('first-light');
    world.step(0.1);
    world.finish('aborted');
    const entry = recordMission(campaign, world.outcome);

    assert.equal(campaign.character.xp, before.xp, 'no experience for a watch not stood');
    assert.equal(campaign.character.rankIndex, before.rank);
    assert.equal(campaign.completed['first-light'], undefined,
      'an abandoned watch must not open the next echelon');
    assert.equal(entry.service, null);
    assert.equal(entry.letter, null);
    assert.equal(entry.appointment, null);
    assert.equal(campaign.history.length, 1, 'it is still written down');
    assert.equal(campaign.history[0].abandoned, true);
  });

  test('repeating it never opens the roster', () => {
    const campaign = emptyCampaign();
    enlist(campaign, { name: 'Test', background: 'academy', household: 'mother' });
    for (let i = 0; i < 3; i++) {
      const world = watch('first-light');
      world.step(0.1);
      world.finish('aborted');
      recordMission(campaign, world.outcome);
    }
    assert.deepEqual(Object.keys(campaign.completed), []);
    assert.equal(campaign.character.xp, 0);
    assert.equal(campaign.appointment, 'battalion');
  });

  test('abandoning the finale composes no ending at all', () => {
    const world = watch('two-cities');
    world.step(0.1);
    world.finish('aborted');

    assert.equal(world.outcome.finale, false, 'the ending is read off a night that happened');
    assert.equal(world.outcome.endingId, null);
    assert.equal(world.endingId ?? null, null);

    const campaign = emptyCampaign();
    enlist(campaign, { name: 'Test' });
    recordMission(campaign, world.outcome);
    assert.equal(campaign.ending, null, 'the campaign must not end because somebody left');
  });

  test('a watch fought to its end is unaffected', () => {
    const world = watch('first-light');
    world.finish('raid-spent');
    assert.equal(world.outcome.abandoned, false);
    assert.equal(world.outcome.success, true);
    assert.ok(world.outcome.score > 0);
  });

  test('the file files it as abandoned, not as satisfactory', () => {
    const campaign = emptyCampaign();
    enlist(campaign, { name: 'Test', background: 'academy', household: 'mother' });
    const world = watch('first-light');
    world.step(0.1);
    world.finish('aborted');
    recordMission(campaign, world.outcome);

    // The history line used to read tier 'satisfactory', and the debrief read
    // that word back under a headline that said the post had been left.
    assert.equal(campaign.history[0].tier, 'abandoned');
    // And the file has something of its own to say about it next time.
    assert.match(briefingNote(campaign), /signed for you/);
  });

  test('the cause clause is one clause, with the clock in it', () => {
    const world = watch('first-light');
    world.step(45);
    world.finish('aborted');
    assert.match(world.outcome.cause, /^YOU LEFT THE POST AT \d+:\d\d\.$/);
    assert.ok(world.outcome.cause.length <= 46,
      `the deck line is set as a headline and must fit like one: "${world.outcome.cause}"`);
    assert.equal(world.outcome.clock, world.outcome.cause.match(/(\d+:\d\d)/)[1]);
  });
});

describe('the number row', () => {
  test('a digit is read off the physical key, shifted or not', () => {
    assert.equal(digitPressed({ key: '1', code: 'Digit1' }), 1);
    // The one that mattered: Shift+1 on a US board delivers '!'.
    assert.equal(digitPressed({ key: '!', code: 'Digit1' }), 1);
    assert.equal(digitPressed({ key: '$', code: 'Digit4' }), 4);
    assert.equal(digitPressed({ key: '3', code: 'Numpad3' }), 3);
    // And still works when only the character survives the trip.
    assert.equal(digitPressed({ key: '!' }), 1);
    assert.equal(digitPressed({ key: 'x', code: 'KeyX' }), null);
  });

  test('the key selects the speed printed on its cap', () => {
    assert.equal(SPEED_BY_KEY[1], 1);
    assert.equal(SPEED_BY_KEY[2], 2);
    assert.equal(SPEED_BY_KEY[4], 4, 'pressing 4 must select 4×, not stop the raid');
    assert.equal(SPEED_BY_KEY[0], 0);
    assert.equal(SPEED_BY_KEY[3], undefined, 'there is no 3× speed, so there is no 3 key');
  });
});

describe('one control, one key, one legend', () => {
  test('a key is stamped as a chip, never appended to the legend', () => {
    const html = legend(CONTROLS.reload, { key: 'R' });
    // The face carries the word and nothing else: appending "· R" to it is
    // what widened every cap until only two fitted on a rack row.
    assert.match(html, /<b>RELOAD<\/b>/);
    assert.doesNotMatch(html, /RELOAD · R/);
    assert.match(html, /<em class="kc">R<\/em>/);
    assert.equal(legend(CONTROLS.reload), '<span class="lg lg-stack"><b>RELOAD</b></span>');
  });

  test('a control legend is English, and one line of it', () => {
    /*
     * The plates carry the Cyrillic; the controls do not. Two languages
     * stacked inside a 45px switch is four lines of 8px type, which is what
     * the emissions switch was — measured, a smear at 100% — and a cap that
     * puts the Cyrillic on the bright line and the English small underneath
     * it is the wrong way round for a player who reads one of them.
     */
    const CYRILLIC = /[Ѐ-ӿ]/;
    for (const entry of Object.values(CONTROLS)) {
      const html = legend(entry, { key: 'Q' });
      assert.ok(!CYRILLIC.test(html.replace(/<em class="kc">.*?<\/em>/, '')),
        `the ${entry.en} control legend still carries Cyrillic`);
    }
    /*
     * And it is ONE line. The speed rack used to carry a dim REAL / FAST / MAX
     * under its figure, which built three caps in a six-cap rail to a
     * different height from the other three and put their key chips somewhere
     * else — four control treatments in four hundred pixels, on the one strip
     * that has to read as a single piece of hardware. The word said nothing
     * the figure did not.
     */
    assert.equal(legend(CONTROLS.speedFast), '<span class="lg lg-stack"><b>2×</b></span>');
    assert.equal(legend(CONTROLS.speedHold), '<span class="lg lg-stack"><b>HOLD</b></span>');
    for (const entry of Object.values(CONTROLS)) {
      assert.doesNotMatch(legend(entry), /<i>/,
        `the ${entry.en} cap carries a second line it did not ask for`);
    }
    // A caller may still hand a cap a state line — the launch cap says what it
    // is waiting for under its verb — and that is a decision at the call site,
    // not a property of the nomenclature.
    assert.match(legend(CONTROLS.launch, { sub: 'RAILS EMPTY' }), /<i>RAILS EMPTY<\/i>/);
  });

  test('every key chip is printed in capitals', () => {
    // 'STAY AT THE POST · Esc' was the one mixed-case hint in the build.
    assert.match(keycap('Esc'), />ESC</);
    assert.equal(keycap(''), '');
    // A chip of more than two glyphs reserves more of the cap's corner for
    // itself, or it is drawn across the legend it belongs to.
    assert.match(keycap('Alt1'), /class="kc kc-wide"/);
    assert.doesNotMatch(keycap('R'), /kc-wide/);
  });

  test('the weapons states are three positions, in one order', () => {
    assert.deepEqual(POSTURE_CYCLE, ['hold', 'tight', 'free']);
    for (const state of POSTURE_CYCLE) {
      assert.ok(CONTROLS[state]?.tm && CONTROLS[state]?.en,
        `the ${state} cap needs both halves of its legend`);
    }
  });

  test('a switch legend is short enough to be printed permanently', () => {
    // Both positions of a switch are engraved beside the lever all night, so
    // neither may be a sentence: RIDE — HOLD THE BEAM did not fit a rack third.
    for (const entry of [CONTROLS.radiate, CONTROLS.silence, CONTROLS.ride, CONTROLS.perDoctrine]) {
      assert.ok(entry.en.length <= 13, `"${entry.en}" is too long for a switch position`);
      assert.ok(entry.tm.length <= 13, `"${entry.tm}" is too long for a switch position`);
    }
  });
});

describe('the console a watch actually fits', () => {
  test('the teaching watch carries none of the three optional caps', () => {
    const caps = consoleCaps(scenarioById('first-light'));
    assert.deepEqual(
      { salvo: caps.salvo, ride: caps.ride, displace: caps.displace },
      { salvo: false, ride: false, displace: false },
    );
  });

  test('displacement appears where something hunts the position', () => {
    assert.equal(consoleCaps(scenarioById('weasel-hour')).displace, true);
    assert.equal(consoleCaps(scenarioById('solo-battery')).displace, false,
      'nothing in that raid carries an anti-radiation round');
  });

  test('a scenario with no console notes still answers', () => {
    const caps = consoleCaps(undefined);
    assert.equal(caps.salvo, true);
    assert.equal(caps.displace, false);
  });
});
