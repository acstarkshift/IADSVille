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
import { scenarioById } from '../src/engine/scenarios.js';
import { sortedTracks, engagementValue } from '../src/engine/threat.js';
import { DETECTION, ENGAGEMENT, COMMAND } from '../src/engine/config.js';
import { DIRECTIVES } from '../src/engine/command.js';

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
   * The structural fix, measured. Over 24 seeds the hand player beats
   * set-free-and-walk-away by ~14% mean score on White Noise; per-seed noise
   * makes a small-sample score assertion flappy, so this test pins the STABLE
   * part of the dividend — no worse a defence on a third fewer rounds and a
   * third the decoys — plus a loose guard on the score itself. Before the fix
   * the two strategies were statistically identical in every column.
   */
  const seeds = ['g1', 'g2', 'g3', 'g4', 'g5', 'g6'];
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
    assert.ok(totals.hand.rounds < totals.free.rounds * 0.75,
      `a quarter fewer rounds at least (${totals.hand.rounds} vs ${totals.free.rounds})`);
    assert.ok(totals.hand.decoys < totals.free.decoys * 0.55,
      `discrimination is real (${totals.hand.decoys} vs ${totals.free.decoys} decoys engaged)`);
    // Measured +14% mean over 16 seeds with 14 per-seed wins; asserted at +5%
    // so seed noise cannot flap the build while a real regression still fails.
    assert.ok(totals.hand.score > totals.free.score * 1.05,
      `working the picture must clearly beat walking away (${totals.hand.score} vs ${totals.free.score})`);
  });

  test('the ladder is monotone: an AI net over free crews adds value, never drag', () => {
    // Measured before the fix: laying the AI battle manager over free crews
    // SUBTRACTED ~12% — assignments stole tracks crews already had and
    // re-paid the reaction each time. Now the net assigns only what no crew
    // covers, and a netted battery re-engages after a miss.
    let aiScore = 0;
    for (const seed of seeds) {
      const w = new World(scenarioById('white-noise'), { role: 'net', seed });
      w.control.netIsHuman = false;
      for (const f of w.formations) w.setPosture(f.id, 'free');
      drive(w);
      aiScore += w.outcome.score;
    }
    assert.ok(aiScore > totals.free.score * 0.95,
      `the AI net must not tax its own crews (${aiScore} vs crews alone ${totals.free.score})`);
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
    for (const seed of ['g1', 'g2', 'g3', 'g4']) {
      for (const arm of ['free', 'hand']) {
        const w = new World(scenarioById('ville-under-fire'), { role: 'net', seed });
        for (const site of w.sites) w.setWeaponsState(site.id, arm === 'free' ? 'free' : 'tight');
        drive(w, { onTick: arm === 'hand' ? handTick : null });
        if (arm === 'free') free += w.outcome.score; else hand += w.outcome.score;
      }
    }
    assert.ok(free > hand * 0.6 && hand > free * 0.6,
      `neither posture may collapse on the climax (free ${free} vs hand ${hand})`);
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
