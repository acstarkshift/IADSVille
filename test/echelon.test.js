/**
 * The promotion.
 *
 * The campaign moves an operator from a battalion to a country, and every step
 * of it takes something away: at battalion command every battery is yours, and
 * by national command you may stand in one place and must say everything else
 * in advance, to somebody you cannot see, about a raid that has not happened.
 *
 * These tests defend that shape. They check that the appointment gates what you
 * are offered, that a battalion or sector watch is unchanged by any of this,
 * that holding a formation is a real and limited thing with a real cost to
 * changing your mind, and that the standing order you leave behind is a weapon
 * that actually fires.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/engine/world.js';
import {
  ECHELONS, ECHELON_ORDER, echelonOf, echelonForScenario, reachedEchelon, withinAppointment,
} from '../src/engine/echelon.js';
import { SCENARIOS, scenarioById, rosterFor, appointmentOf, watchesAt } from '../src/engine/scenarios.js';
import { emptyCampaign, appointTo } from '../src/engine/campaign.js';
import { createCharacter, RANKS, rankIndexOf } from '../src/engine/character.js';
import { DIRECTIVES, issueDirective, answerDirective } from '../src/engine/command.js';
import { sortedTracks, engagementValue } from '../src/engine/threat.js';
import { commanderWillEngage, spanLimit, spanLoad } from '../src/engine/doctrine.js';
import { DETECTION } from '../src/engine/config.js';

/** A record that has stood every watch at or below the given echelon. */
function served(echelonId) {
  const campaign = emptyCampaign(createCharacter({ name: 'Тест' }));
  const order = echelonOf(echelonId).order;
  for (const scenario of SCENARIOS) {
    if (echelonOf(scenario.echelon).order <= order) {
      campaign.completed[scenario.id] = { score: 1, tier: 'satisfactory', role: 'net' };
    }
  }
  return campaign;
}

describe('the four appointments', () => {
  test('they run from a battalion to a country, and each one takes something away', () => {
    assert.deepEqual(ECHELON_ORDER.map((e) => e.id), ['battalion', 'sector', 'region', 'national']);
    // The whole argument of the promotion, as a monotonic sequence.
    let previous = Infinity;
    for (const echelon of ECHELON_ORDER) {
      assert.ok(echelon.directLimit <= previous,
        `${echelon.id} must not let you hold more than the appointment below it`);
      previous = echelon.directLimit;
    }
    assert.equal(ECHELONS.national.directLimit, 1, 'the country is yours and you may be in one place');
  });

  test('the higher the appointment, the more of the map and the longer the handover', () => {
    for (let i = 1; i < ECHELON_ORDER.length; i++) {
      assert.ok(ECHELON_ORDER[i].scopeRangeKm >= ECHELON_ORDER[i - 1].scopeRangeKm);
      assert.ok(ECHELON_ORDER[i].handoverS >= ECHELON_ORDER[i - 1].handoverS);
    }
  });

  test('every watch is fought at a named echelon, and every echelon has watches', () => {
    for (const scenario of SCENARIOS) {
      assert.ok(ECHELONS[scenario.echelon], `${scenario.id} has no echelon`);
    }
    for (const echelon of ECHELON_ORDER) {
      assert.ok(watchesAt(echelon.id).length > 0, `${echelon.id} has nothing to command`);
    }
  });

  test('the promotion costs you the console', () => {
    // You start able to sit in a launcher and you end unable to. That is not a
    // missing feature; it is the shape of the whole campaign.
    assert.ok(ECHELONS.battalion.roles.includes('crew'));
    assert.ok(!ECHELONS.region.roles.includes('crew'));
    assert.deepEqual(ECHELONS.region.roles, ['net']);
    assert.ok(!ECHELONS.national.roles.includes('crew'));
  });

  test('no watch offers a seat its appointment does not have', () => {
    for (const scenario of SCENARIOS) {
      const allowed = ECHELONS[scenario.echelon].roles;
      for (const role of scenario.roles) {
        assert.ok(allowed.includes(role),
          `${scenario.id} offers ${role}, which ${scenario.echelon} command does not have`);
      }
    }
  });

  test('the rank floors climb, and the appointment carries the rank', () => {
    let previous = -1;
    for (const echelon of ECHELON_ORDER) {
      const index = rankIndexOf(echelon.rankFloor);
      assert.ok(index > previous, `${echelon.id} should outrank the appointment below it`);
      previous = index;
    }
    assert.equal(RANKS[rankIndexOf(ECHELONS.national.rankFloor)].en, 'Major General');
  });
});

describe('the roster', () => {
  test('a new record is given a battalion and nothing else', () => {
    const fresh = rosterFor(emptyCampaign());
    assert.ok(fresh.length > 0);
    assert.ok(fresh.every((s) => s.echelon === 'battalion'));
    assert.equal(appointmentOf(emptyCampaign()).id, 'battalion');
  });

  test('standing every watch at one level opens the next', () => {
    assert.equal(reachedEchelon(served('battalion'), SCENARIOS).id, 'sector');
    assert.equal(reachedEchelon(served('sector'), SCENARIOS).id, 'region');
    assert.equal(reachedEchelon(served('region'), SCENARIOS).id, 'national');
  });

  test('progress opens it, not marks — a bad night is still a night stood', () => {
    const campaign = emptyCampaign(createCharacter({ name: 'Тест' }));
    for (const scenario of watchesAt('battalion')) {
      campaign.completed[scenario.id] = { score: -2000, tier: 'condemned', role: 'net' };
    }
    assert.equal(reachedEchelon(campaign, SCENARIOS).id, 'sector');
  });

  test('one missing watch holds the appointment', () => {
    const campaign = served('battalion');
    delete campaign.completed[watchesAt('battalion')[0].id];
    assert.equal(reachedEchelon(campaign, SCENARIOS).id, 'battalion');
  });

  test('a watch above your appointment is not offered', () => {
    const campaign = emptyCampaign();
    assert.equal(withinAppointment(scenarioById('two-cities'), campaign, SCENARIOS), false);
    assert.ok(withinAppointment(scenarioById('first-light'), campaign, SCENARIOS));
  });

  test('being appointed gazettes the rank on the same order', () => {
    const campaign = served('sector');
    campaign.appointment = 'sector';
    const appointment = appointTo(campaign);
    assert.equal(appointment.echelon.id, 'region');
    assert.equal(campaign.appointment, 'region');
    assert.equal(campaign.character.rankIndex, rankIndexOf(ECHELONS.region.rankFloor));
    assert.ok(appointment.note.length > 0);
    // And it is not handed out twice.
    assert.equal(appointTo(campaign), null);
  });

  test('an appointment never demotes a record that has outrun it', () => {
    const campaign = served('battalion');
    campaign.appointment = 'battalion';
    campaign.character.rankIndex = RANKS.length - 1;
    appointTo(campaign);
    assert.equal(campaign.character.rankIndex, RANKS.length - 1);
  });
});

describe('a battalion watch is unchanged by any of this', () => {
  const world = () => new World(scenarioById('first-light'), { role: 'net' });

  test('one formation, containing everything, and it is yours', () => {
    const w = world();
    assert.equal(w.echelon.id, 'battalion');
    assert.equal(w.formations.length, 1);
    assert.ok(w.formations[0].direct);
    for (const site of w.sites) {
      assert.equal(w.formationOf(site.id), w.formations[0]);
      assert.ok(w.commandable(site.id), 'every battery takes your orders');
    }
  });

  test('there is no reserve to release at this level', () => {
    assert.equal(world().reserve.rounds, 0);
  });
});

describe('district command', () => {
  const district = () => new World(scenarioById('four-sectors'), { role: 'net' });

  test('four sectors and a headquarters battalion, and you open holding one of the four', () => {
    const w = district();
    assert.equal(w.echelon.id, 'region');
    const subordinate = w.formations.filter((f) => !f.hq);
    assert.equal(subordinate.length, 4);
    assert.equal(w.formations.filter((f) => f.hq).length, 1);
    assert.equal(subordinate.filter((f) => f.direct).length, 1,
      'the scenario opens you in one of them; the rest are already fighting');
  });

  test('your own battalion is always yours and never counts against the limit', () => {
    const w = district();
    const hq = w.formations.find((f) => f.hq);
    assert.ok(w.isDirect(hq.id));
    assert.equal(w.releaseDirect(hq.id), false, 'there is nobody to hand it to');
    // Fill the limit; the headquarters battalion is still yours.
    const others = w.formations.filter((f) => !f.hq).map((f) => f.id);
    for (const id of others) w.takeDirect(id);
    assert.ok(w.isDirect(hq.id));
  });

  test('taking a third sector hands back the one you have held longest', () => {
    const w = district();
    const [a, b, c] = w.formations.filter((f) => !f.hq).map((f) => f.id);
    w.formations.forEach((f) => { if (!f.hq) { f.direct = false; f.handoverUntilS = 0; } });

    w.takeDirect(a);
    w.t = 10;
    w.takeDirect(b);
    assert.equal(w.formations.filter((f) => f.direct && !f.hq).length, 2);

    w.t = 20;
    w.takeDirect(c);
    const held = w.formations.filter((f) => f.direct && !f.hq).map((f) => f.id);
    assert.equal(held.length, 2, 'the appointment allows two');
    assert.ok(!held.includes(a), 'and the oldest is the one that goes back');
  });

  test('a handover is seconds in which nobody at all is commanding it', () => {
    const w = district();
    const target = w.formations.find((f) => !f.hq && !f.direct);
    w.t = 100;
    w.takeDirect(target.id);
    assert.ok(target.handoverUntilS > w.t, 'it is not instantaneous');
    assert.equal(w.isDirect(target.id), false, 'you do not have it yet');
    assert.equal(w.formationIsHumanRun(target), false);

    w.t = target.handoverUntilS + 0.1;
    assert.ok(w.isDirect(target.id), 'and then you do');
  });

  test('a battery in somebody else’s command does not take your orders', () => {
    const w = district();
    const detached = w.formations.find((f) => !f.hq && !f.direct);
    const site = w.sitesOf(detached)[0];
    assert.equal(w.commandable(site.id), false);

    // Give the world a track and prove the assignment is actually refused.
    w.tracks.set('t1', {
      id: 't1', tn: 'T-001', pos: { ...site.pos }, vel: { x: 0, y: 0 }, altM: 5000,
      hostility: 'hostile', quality: 1, assignedTo: [], engagedBy: [], threat: 50,
      classification: 'striker', truthId: null, sources: [],
    });
    assert.equal(w.assign('t1', site.id), null);

    // Nor can you call off an engagement its own commander started.
    assert.equal(w.unassign('t1', site.id), false);

    w.takeDirect(detached.id);
    w.t = detached.handoverUntilS + 0.1;
    assert.ok(w.commandable(site.id), 'and takes them again once you have it');
  });

  test('the standing order you leave reaches every battery in the formation', () => {
    const w = district();
    const formation = w.formations.find((f) => !f.hq);
    w.setPosture(formation.id, 'free');
    assert.equal(formation.posture, 'free');
    for (const site of w.sitesOf(formation)) assert.equal(site.weaponsState, 'free');

    w.setPosture(formation.id, 'hold');
    for (const site of w.sitesOf(formation)) assert.equal(site.weaponsState, 'hold');
  });

  test('a formation left on hold does not fight, and one left free does', () => {
    // The point of the whole appointment: what you said before you left is what
    // happens while you are somewhere else.
    const results = {};
    for (const posture of ['hold', 'free']) {
      const w = new World(scenarioById('four-sectors'), { role: 'net', seed: 'posture' });
      w.control.netIsHuman = false;
      for (const formation of w.formations) w.setPosture(formation.id, posture);
      let n = 0;
      while (w.phase === 'running' && n < 40000) {
        for (const radar of w.radars) if (radar.alive && !radar.siteId) radar.on = true;
        w.step(0.1);
        if (w.command.pending) w.answer('accepted');
        n++;
      }
      results[posture] = w.outcome;
    }
    assert.equal(results.hold.stats.roundsFired, 0, 'weapons hold means weapons hold');
    assert.ok(results.free.stats.roundsFired > 0);
    assert.ok(results.free.score > results.hold.score,
      'and a district that fought beats a district that did not');
  });

  test('an officer runs three engagements at a time, and the fourth waits', () => {
    /*
     * Span of control, which is the load-bearing half of what an appointment
     * takes away from you. Competence is a rate — how often he looks at his
     * board, and how dangerous a contact must be before he spends a round —
     * and a rate does not care how much is coming, so a sector answered a
     * two-aircraft raid and a six-aircraft raid equally well and the officers
     * out-fought the seat exactly where the weight was.
     *
     * One officer, one radio, one map: three at once. The assertion is on what
     * HE directed (`origin: 'formation'`), because crews on WEAPONS FREE fight
     * on their own initiative and are not on his radio — that is the other way
     * out of a saturated sector and the reason the standing order is worth
     * pressing.
     */
    const w = new World(scenarioById('four-sectors'), { role: 'net', seed: 'span' });
    w.formations.forEach((f) => { if (!f.hq) { f.direct = false; f.handoverUntilS = 0; } });
    for (const formation of w.formations) w.setPosture(formation.id, 'tight');

    const officers = w.formations.filter((f) => Number.isFinite(spanLimit(f)));
    assert.ok(officers.length >= 3, 'the district watch declares spans for its officers');

    let sawSaturation = false;
    let n = 0;
    while (w.phase === 'running' && n < 40000) {
      for (const radar of w.radars) if (radar.alive && !radar.siteId) radar.on = true;
      w.step(0.1);
      if (w.command.pending) w.answer('accepted');
      for (const formation of officers) {
        const load = spanLoad(w, formation);
        assert.ok(load <= spanLimit(formation),
          `${formation.name} is directing ${load} of ${spanLimit(formation)}`);
        if (load === spanLimit(formation)) sawSaturation = true;
      }
      n++;
    }
    assert.ok(sawSaturation,
      'and the raid is heavy enough that at least one of them runs out of hands');
  });

  test('standing in the sector lifts that limit, because you are the radio', () => {
    const w = new World(scenarioById('four-sectors'), { role: 'net', seed: 'span-direct' });
    const formation = w.formationById.get('f_lozan');
    assert.ok(Number.isFinite(spanLimit(formation)), 'the officer has a span');
    w.takeDirect('f_lozan');
    w.t = formation.handoverUntilS + 0.1;
    assert.ok(w.formationIsHumanRun(formation), 'and you are standing in it');

    // Nothing the officer would have started is started, because he is not
    // running it — every engagement in a held sector is the player's.
    let n = 0;
    while (w.phase === 'running' && n < 6000) {
      for (const radar of w.radars) if (radar.alive && !radar.siteId) radar.on = true;
      w.step(0.1);
      if (w.command.pending) w.answer('accepted');
      for (const site of w.sitesOf(formation)) {
        assert.ok(site.engagements.every((e) => e.origin !== 'formation'),
          'a sector under your hand takes no orders from its officer');
      }
      n++;
    }
  });

  test('a politically reliable officer’s crews read the same order he does', () => {
    /*
     * The district act's device, and it used to be a button away from not
     * existing: WEAPONS FREE put his crews on their own authority and they
     * engaged whatever came, priority of fires or no. His sector is his sector.
     */
    const w = new World(scenarioById('four-sectors'), { role: 'net', seed: 'political' });
    const formation = w.formations.find((f) => f.commander?.political);
    assert.ok(formation, 'the district has one');
    w.setPosture(formation.id, 'free');
    const other = w.assets.find((a) => a.cluster && a.cluster !== 'brasov' && a.type !== 'c2');
    w.command.constraints.priorityOfFiresId = w.assets.find((a) => a.cluster === 'lozan').id;

    const track = {
      id: 't1', tn: 'T-001', hostility: 'hostile', destroyed: false, quality: 1,
      pos: { ...formation.pos }, vel: { x: 0, y: -0.2 }, altM: 4000, assignedTo: [], sources: [],
      predictedAssetId: other.id,
    };
    assert.equal(commanderWillEngage(w, formation, track), false,
      'he will not spend a round outside the order');
    track.predictedAssetId = w.command.constraints.priorityOfFiresId;
    assert.equal(commanderWillEngage(w, formation, track), true,
      'and he will spend every round he has inside it');
  });

  test('your hands are faster than your subordinates’ — measured, not asserted', () => {
    /*
     * The load-bearing property of district command, tested at the mechanism
     * rather than through twenty minutes of compounding kill-probability
     * rolls. Deciding WHICH sectors to stand in matters because the sector you
     * stand in answers its tracks in seconds while the one you left to a slow
     * officer answers in minutes — his think rate is low, and his engagement
     * threshold means marginal contacts wait until they are close enough to
     * frighten him. This watch measures the two latencies side by side in the
     * same raid: firm hostile track to first assignment, in the sector the
     * player holds versus the sector under Kubin's 0.72-competence officer.
     *
     * (A mean-score comparison over a handful of seeds used to live here. It
     * flapped: per-seed score swings on a district watch are several times the
     * effect, so the test measured the seed, not the design.)
     *
     * The delays are pooled across eight watches rather than read off one. A
     * single watch offers three to eight answered tracks per sector, and the
     * held sector's few are bimodal — most answered on the tick they became
     * legal, a couple firm for minutes first because nothing could reach them
     * yet. A median of six samples flips on which kind the seed happened to
     * deal; forty samples does not.
     *
     * RE-ANCHORED when the correlator stopped churning track numbers. The old
     * bound was "the held sector answers in under fifteen seconds", and it was
     * measured against a picture in which a track sitting firm and
     * unanswerable for a minute was quietly dropped and re-born under a new
     * number — which restarted this clock and hid the wait entirely. Those
     * tracks now keep their numbers, so the long half of the bimodal
     * distribution finally reaches the sample. Measured after the fix, pooled
     * across fifteen seeds: held sector median 21.7 s (p25 0.1, p75 61.5), the
     * officer's 124.4 s, ratio 5.7. Across the eight this test runs: 23.0 s
     * against 120.3 s, ratio 5.2. The bound below is that measurement with
     * room for seed noise. It is not a loosening: the property this test
     * exists for is the RATIO, and the ratio got stronger.
     */
    const delays = { lozan: [], kubin: [] };
    for (const seed of ['latency-1', 'latency-2', 'latency-3', 'latency-4',
      'latency-5', 'latency-6', 'latency-7', 'latency-8']) {
      const w = new World(scenarioById('four-sectors'), { role: 'net', seed });
      w.formations.forEach((f) => { if (!f.hq) { f.direct = false; f.handoverUntilS = 0; } });
      w.takeDirect('f_lozan');
      for (const formation of w.formations) w.setPosture(formation.id, 'tight');

      const firmAt = new Map();
      const assignedAt = new Map();
      const clusterOf = new Map();
      let n = 0;
      while (w.phase === 'running' && n < 40000) {
        for (const radar of w.radars) if (radar.alive && !radar.siteId) radar.on = true;
        w.step(0.1);
        if (w.command.pending) w.answer('accepted');

        for (const track of w.tracks.values()) {
          if (track.hostility !== 'hostile' || track.destroyed) continue;
          // Aircraft only. The enemy's rounds are tracked and engageable too,
          // but answering one is a different problem with a different clock —
          // it waits on a low section getting into reach, not on a commander
          // making up their mind, which is the latency this test is about.
          if (w.truthOf(track)?.contactType) continue;
          if (track.quality >= DETECTION.firmQuality && !firmAt.has(track.id)) {
            firmAt.set(track.id, w.t);
          }
          /*
           * Whose sector's problem is this? Taken the first time the picture
           * will say — not at the instant the track goes firm, which is
           * before there is a course to read a destination off. The
           * destination label is published only once a track has flown
           * straight for long enough to have one, so asking at first-firm
           * used to get `null` and file three quarters of the raid under
           * nobody's sector.
           */
          if (firmAt.has(track.id) && !clusterOf.has(track.id) && track.predictedAssetId) {
            clusterOf.set(track.id, w.assetById.get(track.predictedAssetId)?.cluster ?? 'none');
          }
          if (firmAt.has(track.id) && track.assignedTo.length && !assignedAt.has(track.id)) {
            assignedAt.set(track.id, w.t);
          }
        }

        // The player, working only their own sector — the officer's own job
        // description, done with human immediacy.
        for (const track of w.tracks.values()) {
          if (track.hostility !== 'hostile' || track.destroyed || track.assignedTo.length) continue;
          if (w.truthOf(track)?.contactType) continue;
          if (track.quality < DETECTION.firmQuality || clusterOf.get(track.id) !== 'lozan') continue;
          let best = null;
          let bestValue = -Infinity;
          for (const site of w.sitesOf(w.formationById.get('f_lozan'))) {
            const evaluation = engagementValue(w, site, track);
            if (evaluation && evaluation.value > bestValue) {
              bestValue = evaluation.value;
              best = site;
            }
          }
          if (best) w.assign(track.id, best.id);
        }
        n++;
      }

      for (const [id, t0] of firmAt) {
        const cluster = clusterOf.get(id);
        if (delays[cluster] && assignedAt.has(id)) delays[cluster].push(assignedAt.get(id) - t0);
      }
    }
    const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

    assert.ok(delays.lozan.length >= 15, 'the held sector answered its raids');
    assert.ok(delays.kubin.length >= 5, 'the officer eventually answered something');
    assert.ok(median(delays.lozan) < 40,
      `your sector answers in seconds (median ${median(delays.lozan).toFixed(1)}s)`);
    assert.ok(median(delays.kubin) > median(delays.lozan) * 3,
      `the officer's sector waits (you ${median(delays.lozan).toFixed(1)}s, `
      + `him ${median(delays.kubin).toFixed(1)}s) — if these are close, standing somewhere is not a decision`);
  });

  test('the watch terminates and scores', () => {
    const w = new World(scenarioById('four-sectors'), { role: 'net', seed: 'terminates' });
    w.control.netIsHuman = false;
    for (const formation of w.formations) w.setPosture(formation.id, 'free');
    let n = 0;
    while (w.phase === 'running' && n < 40000) {
      for (const radar of w.radars) if (radar.alive && !radar.siteId) radar.on = true;
      w.step(0.1);
      if (w.command.pending) w.answer('accepted');
      n++;
    }
    assert.equal(w.phase, 'complete');
    assert.ok(w.t < 1500, `the night has to end: ${Math.round(w.t)}s`);
    assert.ok(w.outcome.stats.kills > 0);
  });
});

describe('the order to release the district battalion', () => {
  /**
   * A commander who USES the battalion: postures free for coverage, and puts
   * assigned (held, sweet-spot) shots on what the picture offers. The
   * obey/refuse comparison is only honest with the battalion fought properly —
   * released to snap-shoot on its own at a hundred and twenty kilometres, it
   * is worth less than the obedience bonus, which is an indictment of that
   * commander rather than of the order.
   */
  function play(answer, seed = 'withdraw') {
    const w = new World(scenarioById('reinforce-the-capital'), { role: 'net', seed });
    w.control.netIsHuman = false;
    for (const formation of w.formations) w.setPosture(formation.id, 'free');
    let n = 0;
    while (w.phase === 'running' && n < 40000) {
      for (const radar of w.radars) if (radar.alive && !radar.siteId) radar.on = true;
      w.step(0.1);
      if (w.command.pending) w.answer(answer);
      for (const track of sortedTracks(w)) {
        if (track.hostility !== 'hostile' || track.destroyed) continue;
        if (track.assignedTo.length || track.quality < 0.5) continue;
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
      n++;
    }
    return w;
  }

  test('obeying takes the battalion off the board, and it is not a casualty', () => {
    const w = play('accepted');
    const battalion = w.siteById.get(w.scenario.playerBatteryId);
    assert.equal(battalion.alive, false);
    assert.equal(battalion.withdrawn, true);
    assert.equal(w.outcome.stats.sitesWithdrawn, 1);
    assert.equal(w.outcome.stats.sitesLost, 0, 'a redeployment is a different column');
  });

  test('refusing keeps it, and the file keeps the refusal', () => {
    const w = play('refused');
    assert.equal(w.siteById.get(w.scenario.playerBatteryId).withdrawn, undefined);
    assert.equal(w.command.constraints.battalionRefused, true);
    const reasons = w.outcome.ledger.map((l) => l.reason).join(' | ');
    assert.match(reasons, /refused a movement order/);
  });

  test('the two arithmetics disagree: obedience keeps the file and costs the town', () => {
    /*
     * Eight seeds, the mean, and a paired count of what the district actually
     * took — because those are the parts of this that are measurement rather
     * than sampling.
     *
     * Three seeds used to stand here and it flapped the moment the engagement
     * model was retuned. Eight with a paired count of SCORE wins replaced them,
     * and that has now gone the same way: per-rail loading (`stepLoading`) lets
     * the district's remaining batteries recover in eight seconds instead of
     * sixty-two, so obedience is no longer the catastrophe it was on its worst
     * nights, and its mean rose from 806 to 1203 while refusal's rose from 1335
     * to 1662. The GAP is intact — refusal is ahead by 38% on the mean — but
     * the per-seed score count fell from 6/8 to 4/8 on a statistic whose own
     * baseline is barely distinguishable from a coin.
     *
     * What did not move an inch is the physical thing the README is about:
     * weapons arriving on the district. Refusal leaks fewer on 8 of 8 seeds
     * now and 7 of 8 before (never more, on any seed of either tree): 23
     * leakers against obedience's 43, and 7 places lost against 10. Obedience
     * costs the district MORE ground than it used to, not less. So the paired
     * statistic is the leaker count, which is the sentence "obeying costs a
     * district town" written as arithmetic, and the score claim stands on the
     * mean.
     */
    const seeds = Array.from({ length: 8 }, (_, i) => `w${i + 1}`);
    let obeyed = { standing: 0, score: 0, leakers: 0, lost: 0 };
    let refused = { standing: 0, score: 0, leakers: 0, lost: 0 };
    let refusalKeptMoreOut = 0;
    for (const seed of seeds) {
      const o = play('accepted', seed).outcome;
      const r = play('refused', seed).outcome;
      obeyed.standing += o.standing; obeyed.score += o.score;
      obeyed.leakers += o.stats.leakers; obeyed.lost += o.stats.assetsLost;
      refused.standing += r.standing; refused.score += r.score;
      refused.leakers += r.stats.leakers; refused.lost += r.stats.assetsLost;
      if (r.stats.leakers <= o.stats.leakers) refusalKeptMoreOut++;
    }
    assert.ok(obeyed.standing > refused.standing,
      'the state rewards the officer who complied');
    assert.ok(refused.score > obeyed.score,
      `and the district is measurably better off for the officer who did not `
      + `(refused ${Math.round(refused.score / seeds.length)} vs obeyed ${Math.round(obeyed.score / seeds.length)})`);
    assert.ok(refused.leakers < obeyed.leakers,
      `and it is better off in weapons, not only in points `
      + `(${refused.leakers} leakers against ${obeyed.leakers})`);
    assert.ok(refused.lost <= obeyed.lost,
      `and in ground (${refused.lost} places lost against ${obeyed.lost})`);
    assert.ok(refusalKeptMoreOut >= 7,
      `and on night after night, not on average alone (${refusalKeptMoreOut}/${seeds.length})`);
  });

  test('an order can be about a unit, not only a place or an aircraft', () => {
    // A regression: the subject of a directive was looked up in the asset and
    // aircraft tables only, so an order about a battery reached its handler
    // with no battery and quietly did nothing at all.
    const w = new World(scenarioById('reinforce-the-capital'), { role: 'net' });
    issueDirective(w, DIRECTIVES.withdrawBattalion);
    assert.equal(w.command.pending.subjectId, w.scenario.playerBatteryId);
    answerDirective(w, 'accepted');
    assert.equal(w.siteById.get(w.scenario.playerBatteryId).alive, false);
  });
});

describe('the strategic reserve', () => {
  const finale = () => new World(scenarioById('two-cities'), { role: 'net', seed: 'reserve' });

  test('only national command has one', () => {
    assert.equal(new World(scenarioById('four-sectors'), { role: 'net' }).reserve.rounds, 0);
    assert.ok(finale().reserve.rounds > 0);
  });

  test('rounds take four minutes of road and then reach a rail', () => {
    const w = finale();
    const formation = w.formations.find((f) => !f.hq);
    const before = w.sitesOf(formation).reduce((n, s) => n + s.magazine, 0);
    const sent = w.commitReserve(formation.id, 4);

    assert.equal(sent, 4);
    assert.equal(w.reserve.rounds, 4);
    assert.equal(w.sitesOf(formation).reduce((n, s) => n + s.magazine, 0), before,
      'nothing arrives the moment you say so');

    w.t = 100;
    w.stepReserve();
    assert.equal(w.sitesOf(formation).reduce((n, s) => n + s.magazine, 0), before);

    w.t = 400;
    w.stepReserve();
    assert.equal(w.sitesOf(formation).reduce((n, s) => n + s.magazine, 0), before + 4);
  });

  test('you cannot send what you do not have', () => {
    const w = finale();
    const formation = w.formations.find((f) => !f.hq);
    w.commitReserve(formation.id, 99);
    assert.equal(w.reserve.rounds, 0);
    assert.equal(w.commitReserve(formation.id, 4), 0);
  });

  test('sending it outside the priority of fires is logged like any other fires', () => {
    const w = finale();
    const valley = w.formationById.get('f_valley');
    const palace = w.assets.find((a) => a.type === 'palace');
    w.command.constraints.priorityOfFiresId = palace.id;

    w.commitReserve(valley.id, 4);
    assert.equal(w.stats.roundsAgainstOrder, 4,
      'the largest single act of disobedience in the game is still just a number in a column');
    assert.ok(w.command.constraints.priorityBreachLogged);
  });

  test('a frozen reserve does not move', () => {
    const w = finale();
    w.reserve.frozen = true;
    assert.equal(w.commitReserve(w.formations.find((f) => !f.hq).id, 4), 0);
    assert.equal(w.reserve.rounds, 8);
  });
});

describe('national command', () => {
  const world = () => new World(scenarioById('two-cities'), { role: 'net' });

  test('two cities, two commanders, and one pair of hands', () => {
    const w = world();
    assert.equal(w.echelon.id, 'national');
    assert.equal(w.echelon.directLimit, 1);
    const subordinate = w.formations.filter((f) => !f.hq);
    assert.equal(subordinate.length, 2, 'the valley and the capital');
    assert.equal(subordinate.filter((f) => f.direct).length, 1,
      'you may stand in one of them');
  });

  test('the battery that reaches both cities is your own and is never handed away', () => {
    const w = world();
    const hq = w.formations.find((f) => f.hq);
    const sites = w.sitesOf(hq);
    assert.equal(sites.length, 1);
    assert.ok(w.commandable(sites[0].id));
    assert.equal(w.releaseDirect(hq.id), false);
  });

  test('one of the two sector commanders will not fire outside the order', () => {
    // The corruption arc, at the level where it stops being about you: the
    // capital is held by an officer who has read the priority of fires and has
    // never once considered not obeying it.
    const w = world();
    const capital = w.formationById.get('f_capital');
    assert.equal(capital.commander.political, true);
    const valley = w.formationById.get('f_valley');
    assert.ok(!valley.commander.political);
  });

  test('standing in the valley means the capital is run by somebody else', () => {
    const w = world();
    w.formations.forEach((f) => { if (!f.hq) { f.direct = false; f.handoverUntilS = 0; } });
    w.takeDirect('f_valley');
    w.t = 60;
    assert.ok(w.formationIsHumanRun(w.formationById.get('f_valley')));
    assert.equal(w.formationIsHumanRun(w.formationById.get('f_capital')), false);
    for (const site of w.sitesOf(w.formationById.get('f_capital'))) {
      assert.equal(w.commandable(site.id), false);
    }
  });
});
