/**
 * The playtesting harness, defended.
 *
 * `tools/playtest.mjs` is a measuring instrument, and a measuring instrument
 * that quietly stops agreeing with itself is worse than none: every balance
 * decision this repository makes is a paired comparison across seeds, and a
 * harness whose numbers drift by run, by worker count or by machine turns all
 * of them into anecdotes. So the first test here is not about air defence at
 * all. It is that the same tree and the same seed produce the same bytes.
 *
 * The other two are the properties a playtest is FOR: that working the picture
 * beats leaving the chair empty, and that every seat the campaign offers can
 * actually be driven to the end of its watch.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { availableParallelism } from 'node:os';
import { SCENARIOS } from '../src/engine/scenarios.js';
import {
  playRun, runMatrix, POLICIES, POLICY_ORDER, SEAT_ORDER, EXPERT_ANSWERS,
} from '../tools/playtest.mjs';

describe('the playtest harness', () => {
  test('the same seed twice is the same run, to the byte', () => {
    const job = { mission: 'first-light', seat: 'net', policy: 'competent', seed: 'p1' };
    const a = playRun({ ...job });
    const b = playRun({ ...job });
    assert.equal(JSON.stringify(a.run), JSON.stringify(b.run),
      'a rerun of one seed must be identical — nothing in the harness may read a clock');
    // And nothing in a run record may be a hole in the numbers.
    for (const [key, value] of Object.entries(a.run)) {
      assert.ok(typeof value !== 'number' || Number.isFinite(value), `${key} is not a number`);
    }
    assert.ok(a.run.score !== 0 || a.run.rounds > 0, 'the run actually happened');
  });

  test('the worker count cannot change the answer', async () => {
    const opts = {
      missions: ['first-light'],
      seats: ['net'],
      policies: ['competent', 'nothing'],
      seeds: 2,
      seedBase: 1,
      quiet: true,
    };
    const serial = await runMatrix({ ...opts, jobs: 1 });
    const parallel = await runMatrix({ ...opts, jobs: 2 });
    assert.equal(JSON.stringify(serial.runs), JSON.stringify(parallel.runs),
      'forking must not reorder or perturb a single figure');
    assert.equal(JSON.stringify(serial.aggregates), JSON.stringify(parallel.aggregates));
  });

  test('every policy is a real player and drives only the public surface', () => {
    assert.deepEqual(Object.keys(POLICIES), POLICY_ORDER);
    for (const policy of POLICY_ORDER) {
      assert.equal(typeof POLICIES[policy].tick, 'function', `${policy} has a tick`);
      assert.ok(POLICIES[policy].blurb.length > 10, `${policy} says what it does`);
    }
    // The expert's answers are a measured table, not a mood. Every key must be
    // a real directive answer; the measurement behind each lives in the header.
    for (const answer of Object.values(EXPERT_ANSWERS)) {
      assert.ok(answer === 'accepted' || answer === 'refused');
    }
  });

  /*
   * The load-bearing property of the whole game, restated as a playtest: a
   * commander who works the picture beats an empty chair. First Light is the
   * teaching watch and the cheapest place to assert it (six runs, under two
   * seconds); the same comparison across every watch is one command away and
   * is not the build's job.
   */
  test('on the teaching watch, competent beats nobody at all', () => {
    const seeds = ['p1', 'p2', 'p3'];
    const score = (policy) => seeds
      .map((seed) => playRun({ mission: 'first-light', seat: 'net', policy, seed }).run.score)
      .reduce((a, b) => a + b, 0);
    const competent = score('competent');
    const nothing = score('nothing');
    assert.ok(competent > nothing * 1.2,
      `working the picture must clearly beat an empty chair (${competent} vs ${nothing})`);
  });

  /*
   * And every seat the campaign offers must be playable end to end.
   *
   * Twenty-eight mission x seat combinations, one seed of competent play each,
   * driven to a natural finish. Measured at roughly 0.4 s a run serially, so
   * it is forked across the machine and lands in about ten seconds.
   *
   * Only `competent` is run across the whole matrix. The full 112-cell grid
   * (four policies x twenty-eight combinations) measures at about 100 serial
   * seconds, which is two and a half times this file's entire budget — so the
   * other three players are run on the three short watches only, and the rest
   * of the grid belongs to the command line:
   *
   *   node tools/playtest.mjs --mission all --seat all --policy all \
   *     --seeds 8 --jobs 4 --md /tmp/playtest.md
   */
  test('every seat on every watch can be played to the end', async () => {
    const combos = SCENARIOS.flatMap((s) => s.roles.map((role) => [s.id, role]));
    assert.equal(combos.length, 28, 'the campaign offers 28 mission x seat combinations');

    const result = await runMatrix({
      missions: SCENARIOS.map((s) => s.id),
      seats: SEAT_ORDER,
      policies: ['competent'],
      seeds: 1,
      seedBase: 1,
      jobs: Math.max(2, Math.min(4, availableParallelism())),
      quiet: true,
    });
    assert.equal(result.runs.length, 28);
    for (const run of result.runs) {
      const where = `${run.mission}/${run.seat}`;
      assert.equal(run.capHit, false, `${where}: the watch never ended inside 40 000 ticks`);
      assert.ok(run.watchS > 30, `${where}: the watch lasted ${run.watchS}s`);
      assert.ok(Number.isFinite(run.score), `${where}: no score`);
      assert.ok(run.holes.longestS < run.watchS,
        `${where}: the entire watch was dead air`);
    }
  });

  /*
   * The three short watches, played by all four operators. This is the cell
   * that catches a policy which throws on a seat it never sees otherwise —
   * the cabin's reload path, the epilogue's protected flight, the finale's
   * formation panel.
   */
  test('all four operators can play the short watches', async () => {
    const result = await runMatrix({
      missions: ['first-light', 'solo-battery', 'presidents-flight'],
      seats: SEAT_ORDER,
      policies: POLICY_ORDER,
      seeds: 1,
      seedBase: 1,
      jobs: Math.max(2, Math.min(4, availableParallelism())),
      quiet: true,
    });
    assert.equal(result.runs.length, 24, '(3 + 1 + 2) seats x 4 players');
    for (const run of result.runs) {
      assert.equal(run.capHit, false, `${run.mission}/${run.seat}/${run.policy} ran away`);
    }
    // A player that never fires anywhere is a broken player, not a cautious one.
    for (const policy of ['novice', 'competent', 'expert']) {
      const fired = result.runs.filter((r) => r.policy === policy && r.ownRounds > 0);
      assert.ok(fired.length > 0, `${policy} never fired a round on any short watch`);
    }
    /*
     * The empty chair never answers the net. It is deliberately NOT asserted
     * that it fires nothing: a battery of yours on weapons free self-engages
     * whether or not anybody is in the chair, and on the epilogue's national
     * watch one of them does — which is the delegation ladder working, not the
     * spectator cheating.
     */
    for (const run of result.runs.filter((r) => r.policy === 'nothing')) {
      assert.equal(run.directives.accepted + run.directives.refused, 0,
        `${run.mission}/${run.seat}: the empty chair answered the command net`);
    }
  });

  /*
   * The two verbs no player model had ever pressed.
   *
   * A scrub found `scoot` mentioned only in this file's own header prose and
   * `commitReserve` not mentioned at all — so D4, the line that asks whether
   * skill buys anything on a watch, was being judged on Two Cities,
   * President's Flight and Weasel Hour without the two most expert-flavoured
   * actions on the console. An instrument that cannot press a control cannot
   * report on it, and reported silence as "the watch has no depth".
   */
  test('the expert presses DISPLACE when the position itself is the objective', () => {
    /*
     * The finale's third axis comes for the ground the operator is standing
     * on, and the forward post drives out with the battery. Measured across
     * the finale's eight net seeds: every seed on which this model displaced
     * held the sector, and every seed on which it did not was lost. That is
     * the whole watch in one verb, and no player model had ever pressed it.
     */
    const moved = playRun({ mission: 'two-cities', seat: 'net', policy: 'expert', seed: 'p2' }).run;
    assert.ok(moved.displacements >= 1,
      'a raid tracking the post that travels with your battery is answered by moving');
    const rooted = playRun({ mission: 'two-cities', seat: 'net', policy: 'competent', seed: 'p2' }).run;
    assert.equal(rooted.displacements, 0,
      'and the competent model stays put — displacement is the craft, not the baseline');

    /*
     * Weasel Hour hunts antennas rather than positions, and an intact
     * battalion answers a round with a twenty-five second blink. Three and a
     * half minutes off the air is the worse trade, and measured it cost this
     * model a watch in eight for nothing.
     */
    const ducking = playRun({ mission: 'weasel-hour', seat: 'net', policy: 'expert', seed: 'p1' }).run;
    assert.equal(ducking.displacements, 0,
      'an intact battery ducks a round rather than spending the night driving');

    // First Light has nothing shooting back at all. Nobody moves.
    const quiet = playRun({ mission: 'first-light', seat: 'net', policy: 'expert', seed: 'p1' }).run;
    assert.equal(quiet.displacements, 0, 'and nobody displaces on a watch with no enemy fire');
  });

  test('the expert releases the national reserve, and only where there is one', () => {
    const national = playRun({ mission: 'two-cities', seat: 'net', policy: 'expert', seed: 'p1' }).run;
    assert.ok(national.reserveReleased > 0, 'the finale has a reserve and the expert commits it');
    const baseline = playRun({ mission: 'two-cities', seat: 'net', policy: 'competent', seed: 'p1' }).run;
    assert.equal(baseline.reserveReleased, 0, 'the competent model leaves it in the depot');

    const sector = playRun({ mission: 'weasel-hour', seat: 'net', policy: 'expert', seed: 'p1' }).run;
    assert.equal(sector.reserveReleased, 0,
      'and nobody below national command has one to release');
  });

  /*
   * The hole detector used to count ANY logged line as activity, including
   * the `info` echo of the operator's own switch. Combined with a correlator
   * announcing a fresh contact every few seconds it reported zero holes on
   * all 896 runs of the campaign matrix — on watches the playtesters had
   * described as five silent minutes. It counts what an operator would look
   * up for, and nothing else.
   */
  test('a switch flipping in an empty sky is not something happening', () => {
    const run = playRun({ mission: 'two-cities', seat: 'net', policy: 'competent', seed: 'p1' }).run;
    assert.ok(run.holes.longestS > 0,
      'the finale has quiet stretches and the instrument must be able to see one');
    assert.ok(Number.isFinite(run.firstInEnvelopeS) || run.firstInEnvelopeS === null,
      'the in-envelope companion column is reported');
    assert.ok(run.firstInEnvelopeS === null || run.firstLegalShotS === null
      || run.firstInEnvelopeS >= run.firstLegalShotS - 0.001,
      'a contact cannot be inside the ring before it is claimable');
  });
});
