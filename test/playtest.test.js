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
    const job = { mission: 'first-light', seat: 'radar', policy: 'competent', seed: 'p1' };
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
      seats: ['radar'],
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
      .map((seed) => playRun({ mission: 'first-light', seat: 'radar', policy, seed }).run.score)
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
    /*
     * THIRTEEN, and it was fifteen, and twenty-eight before that.
     *
     * The drop from twenty-eight to fifteen was the ladder: every watch used
     * to advertise every seat its formation had — the first night of the war
     * offered all three — and a watch now offers only the seats the rung it
     * sits on allows, one apiece for the watches below command and the
     * net-and-console pair for the four that are command.
     *
     * The drop from fifteen to thirteen is the twelve-to-ten cut: White Noise
     * is dissolved and Across the Line is merged into Economy of Force, and a
     * seat goes with each. RE-ANCHORED DELIBERATELY —
     * a campaign that quietly loses a seat should fail this, so the number is
     * written down rather than derived.
     */
    const combos = SCENARIOS.flatMap((s) => s.roles.map((role) => [s.id, role]));
    assert.equal(combos.length, 13, 'the campaign offers 13 mission x seat combinations');

    const result = await runMatrix({
      missions: SCENARIOS.map((s) => s.id),
      seats: SEAT_ORDER,
      policies: ['competent'],
      seeds: 1,
      seedBase: 1,
      jobs: Math.max(2, Math.min(4, availableParallelism())),
      quiet: true,
    });
    assert.equal(result.runs.length, 13);
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
    assert.equal(result.runs.length, 16, '(1 + 1 + 2) seats x 4 players');
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
   * THE FIRST RUNG, AND THAT IT IS A JOB.
   *
   * The radar seat can be measured like every other seat because it has a
   * scripted operator (`reportPass` in the harness), and these are the three
   * properties that seat has to have: it does its own work inside the watch
   * and in bounded time, the shooting follows from the work, and the shooting
   * is somebody else's.
   *
   * ANCHORED TO SIXTEEN SEEDS A WATCH, competently played — the assertions
   * below run four of them, which is what this file can afford, and the bounds
   * they use are the full sixteen-seed envelope, reproduced with:
   *
   *   node tools/playtest.mjs --mission first-light,low-riders --seat radar \
   *     --policy competent --seeds 16
   *
   *                first contact   first call   first round away   calls   held
   *   First Light     23-39 s        47-62 s       74-122 s          6-7    16/16
   *   Low Riders      16-27 s        20-38 s        56-95 s         28-39   12/16
   *
   * FIRST CALL is the seat's own clock and FIRST ROUND AWAY is the officer's
   * answer to it, so the pair is the whole chain: the set up, something held
   * firm on it, the contact read across, and a round off a rail.
   *
   * The tempo is craft and not decoration. On the same sixteen seeds the
   * novice — who holds two contacts at a time and takes eight seconds to say
   * either of them — calls first at 36-54 s on Low Riders against the
   * competent operator's 20-38, and holds 9 of 16 where the competent operator
   * holds 12.
   *
   * And the floor underneath all of them, an operator who touches nothing:
   * 0 of 16 held on both watches, ZERO rounds fired by anybody, and a mean of
   * 5.3 arrivals conceded on the teaching watch and 17.3 on the second. That
   * gap IS the post. Nothing on either watch is fired at anything the set has
   * not called.
   */
  const RADAR_BOUNDS = {
    // mission: [calls at least, first call by, first round away by]
    'first-light': [5, 75, 135],
    'low-riders': [20, 50, 105],
  };

  test('the radar seat does its job inside the watch, and nothing shoots without it', () => {
    for (const [mission, [calls, byCallS, byLaunchS]] of Object.entries(RADAR_BOUNDS)) {
      for (const seed of ['p1', 'p2', 'p3', 'p4']) {
        const called = playRun({ mission, seat: 'radar', policy: 'competent', seed }).run;
        assert.ok(called.handovers >= calls,
          `${mission}/${seed}: the operator called ${called.handovers} contacts`);
        // The seat's own work, in bounded time: a cold set, a contact held
        // firm on it, and the contact across to the officer.
        assert.ok(called.firstHandoverS !== null && called.firstHandoverS <= byCallS,
          `${mission}/${seed}: the first contact went across at ${called.firstHandoverS}s`);
        assert.ok(called.firstLaunchS !== null && called.firstLaunchS <= byLaunchS,
          `${mission}/${seed}: nothing left a rail until ${called.firstLaunchS}s`);
        // And the shooting follows the calling, rather than happening beside
        // it: the officer's first round is never ahead of the first report.
        assert.ok(called.firstHandoverS <= called.firstLaunchS,
          `${mission}/${seed}: a round went at ${called.firstLaunchS}s against a first call `
          + `at ${called.firstHandoverS}s`);
        assert.equal(called.capHit, false, `${mission}/${seed}: the watch never ended`);

        const silent = playRun({ mission, seat: 'radar', policy: 'nothing', seed }).run;
        assert.equal(silent.handovers, 0, 'the empty chair calls nothing');
        assert.equal(silent.firstHandoverS, null, 'and its clock never starts');
        assert.equal(silent.rounds, 0,
          `${mission}/${seed}: the launch officer fired ${silent.rounds} rounds at contacts `
          + 'nobody reported — the seat has to be the reason anything is engaged');
        assert.ok(called.score > silent.score,
          `${mission}/${seed}: working the set must beat watching it `
          + `(${called.score} against ${silent.score})`);
      }
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
  test('the expert presses DISPLACE when the position cannot be answered by fire', () => {
    /*
     * The finale's third axis comes for the ground the operator is standing
     * on, and the forward post drives out with the battery.
     *
     * RE-ANCHORED, and tightened rather than loosened. This used to assert a
     * displacement on one named seed, and the measurement behind it was made
     * on a watch whose third axis released at about ten minutes against a
     * battery that had been dry since five and a half: driving away was free,
     * because there was nothing left to shoot with. The acts three and four
     * scrub brought that package in to two and a half minutes with rounds
     * still on the rails, and a player who can shoot it shoots it — three and
     * a half minutes off the air is three and a half minutes the two cities do
     * not have. Measured in the cabin before the guard existed, two seeds of
     * eight conceded eleven leakers apiece to a displacement taken with a full
     * rack and the package inside the ring.
     *
     * So the property is now the judgement rather than the reflex: the verb is
     * still reached, and it is not reached often.
     *
     * WIDENED, and the reason is the sample rather than the model. The residue
     * pass put four decoys on the capital's axis, which puts more of this
     * player's own rounds in the air, and the guard that will not pack a set up
     * while it is guiding is therefore satisfied less often. Counted over
     * thirty-two seeds afterwards: the verb fires on 10 of 32 from the net seat
     * and 2 of 32 from both, so the property holds and the old eight-seed
     * window simply no longer contains one. The net seat at sixteen seeds is
     * where it is now read, because that is the seat with enough of them to
     * measure a rate rather than an accident.
     */
    const seeds = Array.from({ length: 16 }, (_, i) => `p${i + 1}`);
    const expert = seeds.map((seed) => playRun({
      mission: 'two-cities', seat: 'net', policy: 'expert', seed,
    }).run);
    const moved = expert.filter((r) => r.displacements >= 1).length;
    assert.ok(moved >= 1,
      'the verb is still reached on a watch whose third axis comes for the position');
    assert.ok(moved <= 8,
      `and it is a judgement, not a reflex (${moved} of 16 seeds displaced)`);
    const rooted = seeds.map((seed) => playRun({
      mission: 'two-cities', seat: 'net', policy: 'competent', seed,
    }).run);
    assert.ok(rooted.every((r) => r.displacements === 0),
      'and the competent model stays put — displacement is the craft, not the baseline');

    /*
     * Weasel Hour hunts antennas rather than positions, and an intact
     * battalion answers a round with a twenty-five second blink. Three and a
     * half minutes off the air is the worse trade, and measured it cost this
     * model a watch in eight for nothing.
     */
    const ducking = playRun({ mission: 'weasel-hour', seat: 'crew', policy: 'expert', seed: 'p1' }).run;
    assert.equal(ducking.displacements, 0,
      'an intact battery ducks a round rather than spending the night driving');

    // First Light has nothing shooting back at all. Nobody moves.
    const quiet = playRun({ mission: 'first-light', seat: 'radar', policy: 'expert', seed: 'p1' }).run;
    assert.equal(quiet.displacements, 0, 'and nobody displaces on a watch with no enemy fire');
  });

  test('the expert releases the national reserve, and only where there is one', () => {
    const national = playRun({ mission: 'two-cities', seat: 'net', policy: 'expert', seed: 'p1' }).run;
    assert.ok(national.reserveReleased > 0, 'the finale has a reserve and the expert commits it');
    const baseline = playRun({ mission: 'two-cities', seat: 'net', policy: 'competent', seed: 'p1' }).run;
    assert.equal(baseline.reserveReleased, 0, 'the competent model leaves it in the depot');

    const sector = playRun({ mission: 'weasel-hour', seat: 'crew', policy: 'expert', seed: 'p1' }).run;
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
  /*
   * THE CURVE, PUBLISHED AND HELD.
   *
   * The campaign is four acts and it is supposed to get harder. It did not:
   * the balance critic measured from watch four to watch twelve every night
   * the same difficulty, acts three and four identical to the decimal at
   * 71.9 per cent, and said why the old assertion could not see it — "it
   * compares act MEANS with one seed of slack (6.25 points) and the observed
   * act-1-to-act-2 difference is 0.6 points. A contract that cannot fail is
   * not a contract."
   *
   * So this is a contract. Four published bands, one per act, and a staircase
   * between the means, measured on each watch's primary seat at competent
   * play. Their asked-for shape was 88 / 78 / 70 / 62; what the campaign
   * measures, at twenty-four seeds, is 85.5 / 76.3 / 71.0 / 62.5.
   *
   * TWENTY-FOUR SEEDS AND NOT SIXTEEN, and it costs the suite about eighty
   * seconds. At sixteen a held rate is a multiple of 6.25 against bands two
   * to four rungs wide, and the tuning below chases differences of one and
   * two nights — the sample was the thing being measured. At twenty-four a
   * rung is 4.17 points. The evidence that this mattered: Economy of Force
   * read 63 per cent over sixteen seeds and 92 over twenty-four on trees that
   * differed by one gate.
   *
   * THE RE-TUNE THIS ANCHORS, AND WHAT CAUSED IT. Every surveillance set the
   * player owns now starts the watch COLD — the game's signature decision,
   * which eleven of twelve watches used to ship already answered — and coming
   * up costs the EWR twenty seconds of warming. The campaign fell fifteen to
   * thirty points of held rate the day that landed. Twenty-four seeds,
   * competent, primary seat, before the cold start and after the re-tune:
   *
   *   watch                    hot   cold   tuned   envelope   what moved
   *   Low Riders                75     54     83       79       allowance 2->3,
   *                                                             one cruise off 435 s
   *   Solo Battery              88     81     88       88       one cruise off 330 s
   *   Weasel Hour               88     79     79       79       nothing
   *   Economy of Force          69     79     79       79       nothing
   *   Ville Under Fire          63     54     71       67       allowance 3->5
   *   Four Sectors              75     63     71       67       one cruise off the
   *                                                             210 s stream, then
   *                                                             one striker off the
   *                                                             265 s package
   *   Reinforce the Capital     63     71     71       67       nothing
   *   The Two Cities            63     54     67       58       allowance 4->5
   *   The President's Flight    88     58     58       63       nothing
   *
   * The last column is the second difficulty change in the same pass: a round
   * climbs six hundred metres for every kilometre of ground it covers, and
   * the ENVELOPE did not know it, so a target high and close read as a legal
   * shot and the round arrived underneath the aeroplane. That shot is refused
   * at the press now and the drawn lens is cut back to agree, and it costs
   * the campaign seven to thirteen points wherever the raid comes in high and
   * close. Four Sectors is the watch it hurt most and the watch whose
   * allowance could not answer — eight reads 58 and nine reads 83.
   *
   * NOT ONE BAND WAS WIDENED TO FIT A NUMBER. Where a watch would not come
   * into its act's band on the allowance dial it was the aeroplanes that
   * moved, which is the only way to tune a dial whose adjacent settings are
   * twenty points apart.
   *
   * First Light is the documented exception and is asserted separately: a
   * teaching watch that fails a learner has failed.
   */
  /*
   * IN NIGHTS OUT OF TWENTY-FOUR, not in per cent, because that is what the
   * instrument actually produces and a band expressed as a decimal is a band
   * with a rounding error on each edge: sixteen of twenty-four is 66.7 per
   * cent and was failing a floor written as 0.67.
   */
  const SEEDS = 24;
  const ACT_BANDS = {
    1: { lo: 19, hi: 24, target: 21 },   //  79-100%, aiming at 88
    2: { lo: 16, hi: 21, target: 19 },   //  67- 88%, aiming at 78
    3: { lo: 15, hi: 19, target: 17 },   //  63- 79%, aiming at 70
    4: { lo: 12, hi: 17, target: 15 },   //  50- 71%, aiming at 62
  };
  /** How far apart two acts' means must be, in nights, for a step to be a step. */
  const STEP = 1;

  test('the campaign gets harder act by act, and it is measured not asserted', async () => {
    const ACT = { battalion: 1, sector: 2, region: 3, national: 4 };
    const held = new Map();
    for (const scenario of SCENARIOS) {
      const seat = scenario.roles[0];
      let n = 0;
      for (let i = 1; i <= SEEDS; i++) {
        if (playRun({ mission: scenario.id, seat, policy: 'competent', seed: `p${i}` }).run.held) n++;
      }
      held.set(scenario.id, n);
    }
    const acts = [1, 2, 3, 4].map((a) => SCENARIOS
      .filter((s) => ACT[s.echelon] === a && s.id !== 'first-light')
      .map((s) => [s.id, held.get(s.id)]));
    const pc = (nights) => `${Math.round((nights / SEEDS) * 100)}%`;

    assert.equal(held.get('first-light'), SEEDS,
      'the tutorial is held by everyone who plays it');

    for (const [i, act] of acts.entries()) {
      const band = ACT_BANDS[i + 1];
      for (const [id, nights] of act) {
        assert.ok(nights >= band.lo && nights <= band.hi,
          `${id} held ${nights} of ${SEEDS} (${pc(nights)}), outside act ${i + 1}'s `
          + `published band of ${band.lo}-${band.hi} nights (${pc(band.lo)}-${pc(band.hi)})`);
      }
    }

    const mean = (list) => list.reduce((x, [, n]) => x + n, 0) / list.length;
    for (let i = 1; i < acts.length; i++) {
      assert.ok(mean(acts[i]) <= mean(acts[i - 1]) - STEP + 1e-9,
        `act ${i + 1} (${pc(mean(acts[i]))}) must be at least one night of twenty-four `
        + `harder than act ${i} (${pc(mean(acts[i - 1]))}), and it is a staircase or it `
        + 'is a floor');
    }
    // And the whole thing must actually descend from the top of the ladder to
    // the bottom: a campaign that is flat in the middle and steep at the ends
    // passes the pairwise test above and is not a curve. Measured at six
    // nights of twenty-four; asserted at four.
    assert.ok(mean(acts[0]) - mean(acts[3]) >= 4 - 1e-9,
      'the campaign must fall at least four nights of twenty-four from act one to act '
      + `four (${pc(mean(acts[0]))} to ${pc(mean(acts[3]))})`);
  });

  /*
   * THE RADAR RUNG HAS A LADDER NOW, AND IT IS MEASURED.
   *
   * The balance critic, on the first hour of the campaign: "a two-state skill
   * model: you touched the button or you did not. There is nothing above
   * 'competent' to reach for, and on the teaching watch there is nothing
   * below it either." At sixteen seeds the expert and the competent operator
   * produced BYTE-IDENTICAL runs on both radar watches — nought of
   * thirty-two paired seeds separating them, which is not a small difference,
   * it is no difference at all.
   *
   * The set can be held on a bearing now: sixty degrees rastered, six
   * crossings for every one the circle gives, and nothing outside the sector
   * swept while it is. Measured after, at TWENTY-FOUR seeds — sixteen is not
   * enough to tune anything on this game and it read the expert a full rung
   * high:
   *
   *   First Light   nothing 92%  novice 100%  competent 100%  expert 100%
   *   Low Riders    nothing  0%  novice  58%  competent  83%  expert  92%
   *
   * First Light is held by everybody who plays, which is what a teaching
   * watch is for and is asserted elsewhere; below competent there is now an
   * operator who loses two seeds in twenty-four, which is the floor the
   * critic said the teaching watch did not have. Low Riders is where the
   * ceiling lives: a ladder from an empty chair to an expert with three rungs
   * between, and expert takes ten of twenty-four paired seeds off competent
   * for a mean of +7.5%. Only the `expert` policy stares; every published
   * band is measured at `competent`, so the curve is exactly where the
   * re-tune left it.
   */
  test('the radar seat has something to be good at, and the ladder is monotone', () => {
    const SEEDS = 24;
    const rung = (mission, policy) => {
      let held = 0;
      const runs = [];
      for (let i = 1; i <= SEEDS; i++) {
        const { run } = playRun({ mission, seat: 'radar', policy, seed: `p${i}` });
        if (run.held) held++;
        runs.push(JSON.stringify(run));
      }
      return { held, runs };
    };

    const nothing = rung('low-riders', 'nothing');
    const novice = rung('low-riders', 'novice');
    const competent = rung('low-riders', 'competent');
    const expert = rung('low-riders', 'expert');

    assert.ok(novice.held > nothing.held,
      `an operator who joins in must beat an empty chair (${novice.held} vs ${nothing.held})`);
    assert.ok(competent.held >= novice.held,
      `and competence must beat fixation (${competent.held} vs ${novice.held})`);
    assert.ok(expert.held >= competent.held,
      `and there must be something above competent to reach for `
      + `(${expert.held} vs ${competent.held})`);

    /*
     * And the property the critic actually measured, stated directly: the two
     * top players must not be the same player. Their words were "expert beats
     * competent on 0 of 32 paired seeds; rounds 7.9 vs 7.9, kills 4.7 vs 4.7,
     * first launch 100.4 s vs 100.4 s" — two names for one script. A run is
     * the harness's whole record of a watch, so identical JSON is identical
     * play.
     */
    const identical = competent.runs.filter((r, i) => r === expert.runs[i]).length;
    assert.equal(identical, 0,
      `expert and competent produced identical runs on ${identical} of ${SEEDS} seeds`);
    assert.ok(expert.held > novice.held,
      `and the top of the ladder must be clear of the bottom of it `
      + `(${expert.held} vs ${novice.held})`);
  });

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
