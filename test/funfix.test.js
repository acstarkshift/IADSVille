/**
 * The fun fixes, defended.
 *
 * A five-agent assessment measured the game and found one structural defect —
 * at sector level, walking away on weapons free statistically matched hand
 * play — plus dead bookends, feel-dead kills, an onboarding ambush, directive
 * spam, and four outright bugs. These tests pin the fixes so none of them
 * regresses to a number nobody is watching.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/engine/world.js';
import { scenarioById, SCENARIOS } from '../src/engine/scenarios.js';
import { sortedTracks, engagementValue, predictedTarget, cannotEngageReason } from '../src/engine/threat.js';
import { dist } from '../src/engine/math.js';
import { DETECTION, ENGAGEMENT, COMMAND, SAM_TYPES } from '../src/engine/config.js';
import { timeToInRangeS } from '../src/engine/weapons.js';
import { DIRECTIVES } from '../src/engine/command.js';
import { railLoadS } from '../src/engine/doctrine.js';

/** Drive a watch with the AI's radars up and directives answered. */
function drive(w, { onTick = null, maxTicks = 40000, answer = 'accepted' } = {}) {
  let n = 0;
  while (w.phase === 'running' && n < maxTicks) {
    for (const radar of w.radars) if (radar.alive && !radar.siteId) radar.on = true;
    w.step(0.1);
    if (w.command.pending) w.answer(answer);
    onTick?.(w);
    n++;
  }
  return w;
}

/** The scripted hand player: assign, discriminate, per the game's own hints. */
function handTick(w) {
  for (const track of sortedTracks(w)) {
    if (track.hostility !== 'hostile' || track.destroyed || track.assignedTo.length) continue;
    if (track.quality < DETECTION.firmQuality || track.threat < 1) continue;
    if (track.classification === 'decoy') continue;
    let best = null;
    let bestValue = -Infinity;
    for (const site of w.sites) {
      if (!w.commandable(site.id)) continue;
      const evaluation = engagementValue(w, site, track);
      if (evaluation && evaluation.value > bestValue) {
        bestValue = evaluation.value;
        best = site;
      }
    }
    if (best) w.assign(track.id, best.id);
  }
}

describe('attention matters at sector level', () => {
  /*
   * The structural fix, measured. Over twelve seeds the hand player beats
   * set-free-and-walk-away by 20.0% mean score on White Noise, winning eleven
   * seeds of twelve, on 79% of the rounds, 47% of the decoys, no leakers
   * against eleven and no ground lost against two. Per-seed noise makes a small-sample score
   * assertion flappy, so this test pins the STABLE part of the dividend — no
   * worse a defence on far fewer rounds and half the decoys — plus a loose
   * guard on the score itself. Before the fix the two strategies were
   * statistically identical in every column.
   *
   * Twelve seeds and not the six that stood here: at six the round ratio
   * measured 0.753 against a 0.75 bar it had comfortably cleared before the
   * civil corridor started standing free crews down inside the wedge, which
   * spends the walk-away arm's rounds more frugally too. The six-seed sample
   * was measuring the sample.
   *
   * The round and decoy bars were re-anchored when the ready rack started
   * refilling a rail at a time (`stepLoading`): a hand player's batteries are
   * no longer rationed by a ninety-five-second reload either, so hand play
   * spends a few more rounds and takes more of its shots before a decoy has
   * given itself away. Paired, same seeds, before and after — rounds 0.712 →
   * 0.785 over twelve seeds and 0.713 → 0.753 over twenty-four; decoys 0.325
   * → 0.467 and 0.292 → 0.427. The bars below sit clear of both rather than
   * shaving either. The dividend itself went UP, which is the point: 16.0% →
   * 17.7% over twenty-four seeds, 16.4% → 22.3% over sixteen, 14.0% → 20.0%
   * over twelve. A battery that is back in the fight in eight seconds is
   * worth more to a commander who is choosing its targets than to a crew
   * left on free, because the free crew spends the extra rounds at the edge
   * of its envelope on whatever it can see.
   */
  const seeds = Array.from({ length: 12 }, (_, i) => `g${i + 1}`);
  const totals = { free: null, hand: null };

  function playAll(strategy) {
    const agg = { score: 0, rounds: 0, decoys: 0, leak: 0, assetsLost: 0 };
    for (const seed of seeds) {
      const w = new World(scenarioById('white-noise'), { role: 'net', seed });
      for (const site of w.sites) {
        w.setWeaponsState(site.id, strategy === 'free' ? 'free' : 'tight');
      }
      drive(w, { onTick: strategy === 'hand' ? handTick : null });
      agg.score += w.outcome.score;
      agg.rounds += w.outcome.stats.roundsFired;
      agg.decoys += w.outcome.stats.decoysEngaged;
      agg.leak += w.outcome.stats.leakers;
      agg.assetsLost += w.outcome.stats.assetsLost;
    }
    return agg;
  }

  test('hand play beats delegation where the net lives, on far fewer rounds', () => {
    totals.free = playAll('free');
    totals.hand = playAll('hand');

    assert.ok(totals.hand.leak <= totals.free.leak, 'no more leakers than the walk-away');
    assert.ok(totals.hand.assetsLost <= totals.free.assetsLost, 'no more ground lost');
    assert.ok(totals.hand.rounds < totals.free.rounds * 0.80,
      `a fifth fewer rounds at least (${totals.hand.rounds} vs ${totals.free.rounds})`);
    assert.ok(totals.hand.decoys < totals.free.decoys * 0.55,
      `discrimination is real (${totals.hand.decoys} vs ${totals.free.decoys} decoys engaged)`);
    // Measured +22.3% mean over 16 seeds winning 15 of them; asserted at +5%
    // so seed noise cannot flap the build while a real regression still fails.
    assert.ok(totals.hand.score > totals.free.score * 1.05,
      `working the picture must clearly beat walking away (${totals.hand.score} vs ${totals.free.score})`);
  });

  test('the ladder is monotone: an AI net over free crews adds value, never drag', () => {
    // Measured before the fix: laying the AI battle manager over free crews
    // SUBTRACTED ~12% — assignments stole tracks crews already had and
    // re-paid the reaction each time. Now the net assigns only what no crew
    // covers, and a netted battery re-engages after a miss.
    /*
     * Twenty-four seeds, not the six the other tests share, and not the twelve
     * that stood here before. Per-seed score variance on this watch is several
     * times the effect being measured: across twenty-four the ladder sits at
     * 1.044 with the net taking half the nights (12/24), while individual
     * twelve-seed windows of the same run range widely purely on which twelve.
     * A twelve-seed sample was pinning the sample. (It measured 0.997 before
     * the ready rack began refilling a rail at a time, and 1.044 after: the
     * net gained more from batteries that come back quickly than free crews
     * did, which is the right direction for a ladder to move.)
     * Forty seconds of build time is the price of the campaign's load-bearing
     * property being measured rather than sampled.
     */
    const ladderSeeds = Array.from({ length: 24 }, (_, i) => `g${i + 1}`);
    let aiScore = 0;
    let freeScore = 0;
    for (const seed of ladderSeeds) {
      const netted = new World(scenarioById('white-noise'), { role: 'net', seed });
      netted.control.netIsHuman = false;
      for (const f of netted.formations) netted.setPosture(f.id, 'free');
      drive(netted);
      aiScore += netted.outcome.score;

      const alone = new World(scenarioById('white-noise'), { role: 'net', seed });
      for (const site of alone.sites) alone.setWeaponsState(site.id, 'free');
      drive(alone);
      freeScore += alone.outcome.score;
    }
    assert.ok(aiScore > freeScore * 0.95,
      `the AI net must not tax its own crews (${aiScore} vs crews alone ${freeScore})`);
  });

  test('the decapitation watch is nobody\'s dominant strategy — by design', () => {
    /*
     * Ville Under Fire kills the sector operations centre mid-watch, and its
     * brief says the lesson out loud: cueing stops, anything you delegated
     * becomes nobody's job, only sets on weapons free keep fighting. Measured
     * over sixteen seeds the released crews take the mean and the two
     * postures trade per-seed wins — the opposite shape from White Noise,
     * which is the point: no posture is right twice. Guarded two-sided,
     * because the fun defect this pins is COLLAPSE — the state where one
     * arm is simply wrong (hand play once lost this watch by half, its
     * assignments pinning C2-bound tracks to batteries that could never
     * reach them).
     */
    let free = 0;
    let hand = 0;
    let freeWins = 0;
    let handWins = 0;
    for (const seed of ['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7', 'g8']) {
      const bySeed = {};
      for (const arm of ['free', 'hand']) {
        const w = new World(scenarioById('ville-under-fire'), { role: 'net', seed });
        for (const site of w.sites) w.setWeaponsState(site.id, arm === 'free' ? 'free' : 'tight');
        drive(w, { onTick: arm === 'hand' ? handTick : null });
        bySeed[arm] = w.outcome.score;
        if (arm === 'free') free += w.outcome.score; else hand += w.outcome.score;
      }
      if (bySeed.free > bySeed.hand) freeWins++; else handWins++;
    }
    // Collapse — the pinned defect — is an arm that is simply wrong: a
    // negative total across the eight nights, or an arm that never takes a
    // seed. Per-seed variance on this watch is enormous in both directions
    // (each arm has nights around -1000 and nights around +1000), so a
    // ratio-of-sums bound over few seeds pins the noise, not the design.
    assert.ok(free > 0 && hand > 0,
      `neither posture may collapse on the climax (free ${Math.round(free)} vs hand ${Math.round(hand)})`);
    assert.ok(freeWins >= 1 && handWins >= 1,
      `the postures must trade nights (free ${freeWins} wins, hand ${handWins})`);
  });

  test('a weapons-hold watch still ends: loitering escorts go home', () => {
    // The soft-lock, pinned: jammers waited on the SEAD and the SEAD waited
    // on the jammers, and a hold-posture sector ran to the step cap forever.
    const w = new World(scenarioById('ville-under-fire'), { role: 'net', seed: 'lock1' });
    for (const site of w.sites) w.setWeaponsState(site.id, 'hold');
    drive(w, { maxTicks: 60000 });
    assert.equal(w.phase, 'complete', 'the watch must end even if nobody fires');
  });

  test('doing nothing at all is still ruinous — delegation stays viable, absence does not', () => {
    const w = new World(scenarioById('white-noise'), { role: 'net', seed: 'g1' });
    for (const site of w.sites) w.setWeaponsState(site.id, 'hold');
    drive(w);
    assert.ok(totals.free.score / seeds.length > w.outcome.score + 500,
      `weapons free must beat weapons hold decisively (${Math.round(totals.free.score / seeds.length)} vs ${w.outcome.score})`);
  });

  test('free crews snap the earliest shot; net assignments hold for a better one', () => {
    // The mechanism, unit-level: an assigned engagement against a distant
    // closing target with time to spare is holdable; a free self-engagement
    // never is. The constants the doctrine reads must exist and stay ordered.
    assert.ok(ENGAGEMENT.holdFireFraction > 0.6 && ENGAGEMENT.holdFireFraction < 1);
    assert.ok(ENGAGEMENT.holdFireMaxS >= 20);
    assert.ok(ENGAGEMENT.edgeLaunchPk < 1, 'an edge launch costs Pk at intercept');
    assert.ok(ENGAGEMENT.crediblePk > 0, 'and a bad launch cannot break nerve');
  });

  test('a launch warning distinguishes evasion from broken nerve', () => {
    const w = new World(scenarioById('first-light'), { role: 'net' });
    const target = { threatenedAtS: -999, crediblyThreatenedAtS: undefined };
    w.warnTargetOfLaunch(target, false);
    assert.equal(target.threatenedAtS, w.t, 'any launch makes the target defensive');
    assert.equal(target.crediblyThreatenedAtS, undefined, 'a poor one cannot break it');
    w.warnTargetOfLaunch(target, true);
    assert.equal(target.crediblyThreatenedAtS, w.t);
  });
});

describe('the bookends', () => {
  test('a watch opens with a live net, not a blank tube', () => {
    for (const id of ['first-light', 'white-noise', 'two-cities']) {
      const w = new World(scenarioById(id), { role: 'net', seed: 'open' });
      w.control.netIsHuman = false;
      for (const f of w.formations) w.setPosture(f.id, 'free');
      let firstEventAt = null;
      drive(w, {
        maxTicks: 300,
        onTick: (world) => {
          if (firstEventAt === null && world.events.length) firstEventAt = world.events[0].t;
        },
      });
      assert.ok(firstEventAt !== null && firstEventAt < 15,
        `${id} first event at ${firstEventAt}s — the handover chatter opens every watch`);
    }
  });

  test('no long watch ends on minutes of egress dead air', () => {
    // The old rule held the watch open until survivors flew past an arbitrary
    // line: 91-159s of terminal silence on every long watch, 152s closing the
    // finale. An unengaged egressor nothing can reach no longer holds it.
    for (const id of ['ville-under-fire', 'two-cities']) {
      const w = new World(scenarioById(id), { role: 'net', seed: 'tail' });
      w.control.netIsHuman = false;
      for (const f of w.formations) w.setPosture(f.id, 'free');
      let lastEventT = 0;
      const orig = w.log.bind(w);
      w.log = (k, t, m) => { lastEventT = w.t; return orig(k, t, m); };
      drive(w);
      assert.equal(w.phase, 'complete');
      assert.ok(w.t - lastEventT < 60,
        `${id} terminal gap ${Math.round(w.t - lastEventT)}s — the debrief must not arrive minutes after the outcome`);
    }
  });
});

describe('the four bugs stay dead', () => {
  test('the event seq outlives the capped list', () => {
    const w = new World(scenarioById('first-light'), { role: 'net' });
    for (let i = 0; i < 350; i++) w.log('info', `filler ${i}`);
    assert.equal(w.events.length, 300, 'the list caps');
    const last = w.events[w.events.length - 1];
    assert.ok(last.seq > 350, 'but the seq keeps counting');
    // Consumers keyed on seq see exactly the fresh entries, cap or no cap.
    const seen = w.events.filter((e) => e.seq > last.seq - 5).length;
    assert.equal(seen, 5);
  });

  test('nothing engages the track of a dead aircraft, whatever killed it', () => {
    // The churn: cruise impacts, decoy expiries and map exits set alive=false
    // without flagging tracks, so batteries re-engaged ghosts once a second —
    // measured at 366 ENGAGING lines against dead targets in one climax.
    const w = new World(scenarioById('presidents-flight'), { role: 'net', seed: 'churn' });
    w.control.netIsHuman = false;
    for (const f of w.formations) w.setPosture(f.id, 'free');
    const engaging = new Map();
    const orig = w.log.bind(w);
    w.log = (k, t, m) => {
      if (/ENGAGING/.test(t)) engaging.set(t, (engaging.get(t) ?? 0) + 1);
      return orig(k, t, m);
    };
    drive(w);
    const worst = Math.max(0, ...engaging.values());
    assert.ok(worst <= 8, `worst repeat ${worst} — re-engagement after misses is fine, churn is not`);
  });

  test('routine priority traffic cannot overwrite a hinge designation', () => {
    const finale = new World(scenarioById('two-cities'), { role: 'net' });
    finale.command.constraints.priorityIsHinge = true;
    assert.equal(DIRECTIVES.priority.trigger(finale), false,
      'no routine priority order on a hinge watch');
    const sector = new World(scenarioById('white-noise'), { role: 'net' });
    sector.command.constraints.priorityIsHinge = true;
    assert.equal(DIRECTIVES.priority.trigger(sector), false,
      'nor anywhere a hinge has already designated');
  });

  test('flown routes belong to the aircraft, not to the scenario', () => {
    // One playthrough used to shift() the scenario module's own waypoint
    // arrays empty — a replay in the same session gave the civil transit and
    // the state aircraft no route at all.
    const epilogue = scenarioById('presidents-flight');
    const before = epilogue.waves.find((wave) => wave.type === 'vip').waypoints.length;
    const w = new World(epilogue, { role: 'net', seed: 'routes' });
    w.control.netIsHuman = false;
    drive(w, { maxTicks: 8000 });
    const after = epilogue.waves.find((wave) => wave.type === 'vip').waypoints.length;
    assert.equal(after, before, 'the filed route survives being flown');
  });
});

describe('the command net has a cadence', () => {
  test('routine directives are capped and spaced; the teaching watch gets its grace', () => {
    const w = new World(scenarioById('white-noise'), { role: 'net', seed: 'cadence' });
    w.control.netIsHuman = false;
    for (const f of w.formations) w.setPosture(f.id, 'free');
    const issuedAt = [];
    const orig = w.log.bind(w);
    w.log = (k, t, m) => { if (k === 'command') issuedAt.push(w.t); return orig(k, t, m); };
    drive(w);
    for (const [id, count] of Object.entries(w.command.issuedCount)) {
      const cap = DIRECTIVES[id]?.maxPerWatch ?? 3;
      assert.ok(count <= cap, `${id} fired ${count} times against a cap of ${cap}`);
    }
    assert.ok(issuedAt.length <= 10,
      `${issuedAt.length} directives — seventeen a watch was a doorbell, not a menace`);
  });

  test('first-light holds its fire on the net until the lesson has started', () => {
    const w = new World(scenarioById('first-light'), { role: 'net', seed: 'grace' });
    w.control.netIsHuman = false;
    let firstDirectiveAt = null;
    drive(w, {
      maxTicks: 3000,
      onTick: (world) => {
        if (firstDirectiveAt === null && world.command.pending) firstDirectiveAt = world.t;
      },
    });
    if (firstDirectiveAt !== null) {
      assert.ok(firstDirectiveAt >= (w.scenario.directiveGraceS ?? 0),
        `first directive at ${firstDirectiveAt}s, grace is ${w.scenario.directiveGraceS}s`);
    }
  });
});

describe('the two ledgers are genuinely two', () => {
  test('the state does not grieve for places it refuses to recognise', () => {
    // The camp's value is zero because the ledger will not know it; billing
    // fourteen points for losing it contradicted the campaign's own thesis.
    const w = new World(scenarioById('across-the-line'), { role: 'net' });
    const camp = w.assets.find((a) => a.type === 'camp');
    assert.ok(camp, 'the encampment is on this board');
    const before = w.command.standing;
    w.damageAsset(camp, 10000, null);
    assert.equal(camp.destroyed, true);
    assert.equal(w.command.standing, before,
      'losing the camp moves the file not at all — the score is where it counts');

    const town = w.assets.find((a) => a.type === 'town');
    w.damageAsset(town, 10000, null);
    assert.ok(w.command.standing < before, 'a designated place still charges in full');
  });

  test('the ledger records what was charged even at the floor', () => {
    const w = new World(scenarioById('first-light'), { role: 'net' });
    w.command.standing = COMMAND.minStanding;
    w.standingDelta(-30, 'a charge the account cannot pay');
    const entry = w.command.ledger[w.command.ledger.length - 1];
    assert.equal(entry.delta, 0, 'nothing left to collect');
    assert.ok(entry.charged <= -30, 'but the bill is on the page');
    assert.equal(entry.atFloor, true);
  });
});

describe('a kill is an event', () => {
  test('the destroyed track leaves the picture in seconds, not most of a minute', () => {
    const w = new World(scenarioById('first-light'), { role: 'net', seed: 'kill' });
    w.control.netIsHuman = false;
    for (const f of w.formations) w.setPosture(f.id, 'free');
    let sawDestroyed = false;
    let lingered = 0;
    drive(w, {
      onTick: (world) => {
        for (const track of world.tracks.values()) {
          if (!track.destroyed) continue;
          sawDestroyed = true;
          lingered = Math.max(lingered, world.t - (track.destroyedAtS ?? world.t));
        }
      },
    });
    if (sawDestroyed) {
      assert.ok(lingered < 6.5, `a corpse track lingered ${lingered.toFixed(1)}s`);
    }
  });

  test('the ride order exists, is the commander’s alone, and is honoured by the setter', () => {
    const w = new World(scenarioById('weasel-hour'), { role: 'net' });
    const site = w.sites[0];
    assert.equal(site.emconOrder, 'doctrine', 'crews start on their own arithmetic');
    assert.ok(w.setEmconOrder(site.id, 'ride'));
    assert.equal(site.emconOrder, 'ride');
    assert.equal(w.setEmconOrder(site.id, 'nonsense'), false);

    // And a battery outside your command refuses the order like any other.
    const national = new World(scenarioById('two-cities'), { role: 'net' });
    const detached = national.sites.find((s) => !national.commandable(s.id));
    assert.ok(detached, 'somebody else runs part of the country');
    assert.equal(national.setEmconOrder(detached.id, 'ride'), false);
  });
});

describe('the file bills what you decided', () => {
  /*
   * Round-4 finding: predictedTarget's value term was worth over a kilometre
   * of geometry, so a raider flying straight at the district hospital was
   * predicted at whatever valuable building stood behind it on the same ray —
   * and every ledger that samples that field (the expenditure freeze, the
   * finale's account of what you personally defended) billed the wrong story.
   * Measured before the fix: 0/59 hospital predictions at engagement time,
   * phantom freeze rounds for obedient players, and a valley-defending hand
   * whose file read "capital 17, ville 0".
   */

  test('a collinear ray reads the near target, not the valuable one behind it', () => {
    const world = {
      assets: [
        { id: 'a_h', type: 'hospital', destroyed: false, pos: { x: 0, y: 0 } },
        { id: 'a_c2', type: 'c2', destroyed: false, pos: { x: 22, y: 0 } },
      ],
    };
    const track = { pos: { x: -40, y: 0 }, vel: { x: 0.2, y: 0 }, predictedAssetId: null };
    assert.equal(predictedTarget(world, track).asset.id, 'a_h',
      'value 40 behind value 8 on the same ray must not steal the prediction');
  });

  test('the prediction is sticky against noise and honest about a real turn', () => {
    const world = {
      assets: [
        { id: 'a_h', type: 'hospital', destroyed: false, pos: { x: 0, y: 0 } },
        { id: 'a_c2', type: 'c2', destroyed: false, pos: { x: 10, y: 14 } },
      ],
    };
    // A wobble: the ray now favours the c2 by a whisker of geometry.
    const wobble = { pos: { x: -40, y: 0 }, vel: { x: 0.19754, y: 0.03129 }, predictedAssetId: 'a_h' };
    assert.equal(predictedTarget(world, wobble).asset.id, 'a_h',
      'a marginal challenger must not unseat the incumbent');
    // The same geometry with no incumbent picks the c2 — the bonus is the
    // only difference.
    const fresh = { pos: { x: -40, y: 0 }, vel: { x: 0.19754, y: 0.03129 }, predictedAssetId: null };
    assert.equal(predictedTarget(world, fresh).asset.id, 'a_c2');
    // A genuine course change — the ray swings onto the c2 — unseats it at once.
    const turned = { pos: { x: -40, y: 0 }, vel: { x: 0.19259, y: 0.05392 }, predictedAssetId: 'a_h' };
    assert.equal(predictedTarget(world, turned).asset.id, 'a_c2',
      'stickiness must not survive kilometres of new geometry');
  });

  test('obeying the freeze is not billed for it; defending it is', () => {
    function freezeWatch(mode) {
      const w = new World(scenarioById('economy-of-force'), { role: 'net', seed: 'bill-1' });
      w.control.netIsHuman = true;
      const hospital = w.assets.find((a) => a.type === 'hospital');
      drive(w, {
        onTick: (world) => {
          for (const t of world.tracks.values()) {
            if (t.destroyed || t.hostility !== 'hostile') continue;
            if ((t.quality ?? 0) < 0.5 || t.assignedTo.length) continue;
            // The obedient road declines the struck-off place and anything
            // whose destination the picture cannot yet name.
            if (mode === 'obey'
              && (!t.predictedAssetId || t.predictedAssetId === hospital.id)) continue;
            let best = null;
            let bestValue = -Infinity;
            for (const site of world.sites) {
              if (!world.commandable(site.id)) continue;
              const evaluation = engagementValue(world, site, t);
              if (evaluation && evaluation.value > bestValue) {
                bestValue = evaluation.value;
                best = site;
              }
            }
            if (best) world.assign(t.id, best.id);
          }
        },
      });
      return w.stats.roundsAgainstFreeze;
    }
    const obeyed = freezeWatch('obey');
    const defended = freezeWatch('defend');
    assert.ok(obeyed <= 2,
      `an obedient watch was billed ${obeyed} rounds against the freeze`);
    assert.ok(defended >= 3,
      `a deliberate defence was billed only ${defended} rounds — the breach went unseen`);
    assert.ok(defended > obeyed, 'the two roads must read differently in the file');
  });

  test('a valley defence is filed under the valley, not under the officers', () => {
    const w = new World(scenarioById('two-cities'), { role: 'net', seed: 'bill-2' });
    w.control.netIsHuman = true;
    drive(w, {
      onTick: (world) => {
        for (const t of world.tracks.values()) {
          if (t.destroyed || t.hostility !== 'hostile') continue;
          if ((t.quality ?? 0) < 0.5 || t.assignedTo.length) continue;
          if (world.assetById.get(t.predictedAssetId)?.cluster !== 'ville') continue;
          const site = world.sites
            .filter((s) => s.alive && s.readyRounds > 0 && world.commandable(s.id))
            .sort((a, b) => dist(a.pos, t.pos) - dist(b.pos, t.pos))[0];
          if (site) world.assign(t.id, site.id);
        }
      },
    });
    const yours = w.stats.yourRoundsByCluster;
    assert.ok((yours.ville ?? 0) > 0, 'the valley rounds are yours');
    assert.equal(yours.capital ?? 0, 0,
      `subordinate officers' capital rounds were filed as yours: ${JSON.stringify(yours)}`);
  });
});

describe('the teaching watch teaches', () => {
  /*
   * Round-4 onboarding findings. The brief promised "a radar has to be
   * radiating to see" over an early-warning set that started lit; one leaker
   * failed the watch while the player was still reading the interface; an
   * assignment a battery could not honour printed a cheerful ENGAGING; and
   * nothing ever said a firm inbound was going unanswered.
   */

  test('WIDE EYE starts cold, and sector brings it up at one minute', () => {
    const w = new World(scenarioById('first-light'), { role: 'net', seed: 'cold-1' });
    const ewr = w.radars.find((r) => !r.siteId);
    assert.equal(ewr.on, false, 'the lesson requires a cold set');
    // Nobody touches anything.
    let n = 0;
    while (w.t < 70 && n < 800) { w.step(0.1); n++; }
    assert.equal(ewr.on, true, 'the safety must bring the set up');
    assert.ok(w.events.some((e) => /SURVEILLANCE SET UP REMOTELY/.test(e.text)),
      'and say that it did');
  });

  test('a slow reader still holds the sector', () => {
    // Ninety-plus seconds of reading the interface, then ordinary play on
    // the safety-lit picture. Tolerance two exists for exactly this player.
    const w = new World(scenarioById('first-light'), { role: 'net', seed: 'slow-1' });
    drive(w, {
      onTick: (world) => {
        if (world.t < 110) return;
        for (const t of world.tracks.values()) {
          if (t.destroyed || t.hostility !== 'hostile') continue;
          if ((t.quality ?? 0) < DETECTION.firmQuality || t.assignedTo.length) continue;
          let best = null;
          let bestValue = -Infinity;
          for (const site of world.sites) {
            const evaluation = engagementValue(world, site, t);
            if (evaluation && evaluation.value > bestValue) {
              bestValue = evaluation.value;
              best = site;
            }
          }
          if (best) world.assign(t.id, best.id);
        }
      },
    });
    assert.equal(w.outcome.success, true,
      `the teaching watch must forgive a slow start (leakers ${w.outcome.stats.leakers})`);
  });

  test('an order a battery cannot honour is refused at the moment it is given', () => {
    const w = new World(scenarioById('first-light'), { role: 'net', seed: 'refuse-1' });
    let checked = false;
    drive(w, {
      onTick: (world) => {
        if (checked) return;
        for (const t of world.tracks.values()) {
          if (t.destroyed || t.hostility !== 'hostile' || t.quality < 0.5) continue;
          for (const site of world.sites) {
            // Beyond any battery's claim horizon (45 s + 0.4 s per km of reach).
            const toRange = timeToInRangeS(site, t);
            if (Number.isFinite(toRange) && toRange > 150) {
              assert.match(cannotEngageReason(world, site, t) ?? '', /out of reach/);
              assert.equal(world.assign(t.id, site.id), null,
                'the assignment must be declined, not accepted and abandoned');
              checked = true;
              return;
            }
          }
        }
      },
    });
    assert.ok(checked, 'the watch must have offered a far shot to refuse');
  });

  test('an egressor doctrine has declined no longer holds the watch open', () => {
    const w = new World(scenarioById('first-light'), { role: 'net', seed: 'egress-1' });
    const longest = w.sites.map((s) => SAM_TYPES[s.type].maxRangeKm).sort((a, b) => b - a)[0];
    const site = w.sites.find((s) => SAM_TYPES[s.type].maxRangeKm === longest);
    const aircraft = {
      alive: true, type: 'striker', state: 'egress', altM: 6000,
      pos: { x: site.pos.x + longest * 0.8, y: site.pos.y },
    };
    assert.equal(w.holdsWatchOpen(aircraft), false,
      'inside the envelope but beyond the shot any crew would take — released');
    aircraft.pos = { x: site.pos.x + longest * 0.5, y: site.pos.y };
    assert.equal(w.holdsWatchOpen(aircraft), true,
      'still inside six tenths of an armed envelope — somebody may yet shoot');
  });

  /*
   * Every seat the game offers has to have something to do in it.
   *
   * A player reported that the SAM-operator watch took five minutes before
   * anything happened. Measured, it was seven — the raid spawned at the
   * engine's 155 km default against a battery reaching forty-two, with no
   * early-warning radar — and the neighbouring watch was worse still: its
   * crew seat was pointed at a twelve-kilometre section the raid never came
   * within thirty-three kilometres of, so the first legal shot was NEVER on
   * half the seeds. Both were invisible to the suite, because nothing had
   * ever asserted the most basic property a playable seat has: that you can
   * eventually fire the gun you were sat down in front of.
   *
   * The bound is deliberately loose. This is not a pacing test — it is the
   * floor beneath one, and it should only ever fail on a seat that is broken.
   */
  test('every crew seat gets a legal shot, and gets it before the watch is half gone', () => {
    const crewWatches = SCENARIOS.filter((s) => s.roles.includes('crew') || s.roles.includes('both'));
    assert.ok(crewWatches.length >= 3, 'the campaign offers a console on several watches');

    for (const scenario of crewWatches) {
      const firsts = [];
      for (const seed of ['seat-1', 'seat-2', 'seat-3']) {
        const w = new World(scenario, { role: 'crew', seed });
        const site = w.siteById.get(w.control.crewedBatteryId);
        assert.ok(site, `${scenario.id}: the crew seat resolves to a battery`);

        let first = null;
        let n = 0;
        while (w.phase === 'running' && n < 20000) {
          // The one thing the watch asks of you before anything else.
          for (const radar of w.radars) if (radar.alive) w.setRadar(radar.id, true);
          w.step(0.1);
          if (w.command.pending) w.answer('accepted');
          if (first === null && n % 10 === 0) {
            for (const track of w.tracks.values()) {
              if (track.destroyed || track.hostility !== 'hostile') continue;
              if (!cannotEngageReason(w, site, track)) { first = w.t; break; }
            }
          }
          n++;
        }

        assert.ok(first !== null,
          `${scenario.id}: the crewed battery (${site.name}) was never able to take a shot `
          + 'in the whole watch — that seat cannot be played');
        firsts.push(first);
      }
      const median = [...firsts].sort((a, b) => a - b)[1];
      assert.ok(median <= 180,
        `${scenario.id}: the console waits ${Math.round(median)}s for its first legal shot `
        + `(seeds ${firsts.map((f) => Math.round(f)).join('/')}s) — a seat is not a spectator stand`);
    }
  });

  /*
   * And the gun has to reload itself.
   *
   * The automatic reload used to live inside `runBatteryCrews`, after
   * `if (human) continue` — so the one battery in the sector with a person in
   * it was the one battery whose loaders never worked. Measured across four
   * crew watches: zero reloads, ever. The operator had to notice the red
   * lamps and press a button, and then watch a bar for up to ninety-five
   * seconds at zero ready rounds.
   *
   * Two properties, and the test touches no control at all to prove them:
   * the rack refills on its own in the crewed seat, and it refills a rail at
   * a time so the battery is shootable long before it is full.
   */
  test('the crewed battery loads itself, a rail at a time, with nobody pressing anything', () => {
    for (const id of ['solo-battery', 'low-riders', 'weasel-hour']) {
      const w = new World(scenarioById(id), { role: 'crew', seed: 'load-1' });
      const site = w.siteById.get(w.control.crewedBatteryId);
      const rails = site.rails;
      const railS = railLoadS(site);
      // Weapons hold: nothing this battery does may spend what arrives, so
      // what we measure is the loaders and only the loaders.
      w.setWeaponsState(site.id, 'hold');
      site.readyRounds = 0;
      const stock = site.magazine;

      // One rail, and only one, by the time the first hoist is done.
      let n = 0;
      while (w.phase === 'running' && n < Math.round((railS * 1.2) / 0.1)) { w.step(0.1); n++; }
      assert.equal(site.readyRounds, 1,
        `${id}: the crewed battery is back in the fight one round in, unbidden`);

      // And full at reloadS — the economy is exactly what it was.
      while (w.phase === 'running' && n < Math.round((SAM_TYPES[site.type].reloadS + 1) / 0.1)) {
        w.step(0.1); n++;
      }
      assert.equal(site.readyRounds, rails, `${id}: a full rack still costs the full reload`);
      assert.equal(site.magazine, stock - rails, `${id}: every round came out of the store`);
      assert.ok(!w.events.some((e) => /LOADERS OUT/.test(e.text)),
        `${id}: and nobody ordered anything`);
    }
  });

  /*
   * And somebody has to be audibly on the other end of it.
   *
   * In the cabin the net above you fills your shootlist, but the only
   * acknowledgement in the engine was gated on the NET seat, so from a console
   * a target simply appeared, from nobody. A player asked, in as many words,
   * who was assigning their shootlist. These pin the answer: the net has a
   * voice, it uses it in the cabin, and it stays quiet in the seat where the
   * player IS the net.
   */
  test('the net that fills a crewed battery\'s shootlist says so, and says who it is', () => {
    const w = new World(scenarioById('solo-battery'), { role: 'crew', seed: 'cue-1' });
    const site = w.siteById.get(w.control.crewedBatteryId);
    const voice = w.netVoice(site.formationId);
    assert.ok(voice, 'the command post above a crewed battery has a callsign');

    // The events list is capped, and these watches outrun it — read at source.
    const cues = [];
    const log = w.log.bind(w);
    w.log = (kind, text, meta) => {
      if (kind === 'comms' && text.includes(`TAKE`)) cues.push(text);
      return log(kind, text, meta);
    };

    let n = 0;
    while (w.phase === 'running' && n < 30000) {
      for (const radar of w.radars) if (radar.alive) w.setRadar(radar.id, true);
      w.step(0.1);
      if (w.command.pending) w.answer('accepted');
      n++;
    }

    assert.ok(cues.length > 0, 'the net cued the battery at least once and said so out loud');
    assert.match(cues[0], new RegExp(`^${voice}: ${site.name}, TAKE T-\\d+, BEARING \\d{3}\\.$`),
      `the cue names the sender, the battery, the track and a bearing (got: ${cues[0]})`);
    // A voice, not a doorbell: measured at roughly one cue a minute or less.
    assert.ok(cues.length / (w.t / 60) < 3,
      `${cues.length} cues over ${Math.round(w.t)}s is a doorbell, not a net`);
  });

  test('the net does not transmit cues to the seat where the player is the net', () => {
    const w = new World(scenarioById('white-noise'), { role: 'net', seed: 'cue-2' });
    let said = 0;
    const log = w.log.bind(w);
    w.log = (kind, text, meta) => {
      if (kind === 'comms' && text.includes('TAKE T-')) said++;
      return log(kind, text, meta);
    };
    drive(w, { onTick: handTick });
    assert.equal(said, 0, 'nobody transmits your own decisions back to you');
  });

  test('a cue is marked as one; a lock you made yourself is not', () => {
    const w = new World(scenarioById('solo-battery'), { role: 'crew', seed: 'cue-3' });
    const site = w.siteById.get(w.control.crewedBatteryId);

    // Run until the player can legally take something, then take it by hand.
    let n = 0;
    let target = null;
    while (w.phase === 'running' && n < 30000 && !target) {
      for (const radar of w.radars) if (radar.alive) w.setRadar(radar.id, true);
      w.step(0.1);
      if (w.command.pending) w.answer('accepted');
      for (const track of w.tracks.values()) {
        if (track.destroyed || track.hostility !== 'hostile') continue;
        if (site.engagements.some((e) => e.trackId === track.id)) continue;
        if (!cannotEngageReason(w, site, track)) { target = track; break; }
      }
      n++;
    }
    assert.ok(target, 'the watch offered the operator a shot to take');
    w.assign(target.id, site.id);
    const mine = site.engagements.find((e) => e.trackId === target.id);
    assert.ok(mine, 'the hand assignment took');
    assert.equal(mine.cued, false,
      'a target you locked yourself is not marked as one the net called to you');
  });
});
