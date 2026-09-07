/**
 * The playtesting harness: four scripted operators, every seat, every watch.
 *
 *   node tools/playtest.mjs --mission white-noise --seat all --policy all \
 *     --seeds 8 --jobs 4 --md /tmp/white-noise.md
 *
 * The suite proves the engine is correct. This proves the game is playable —
 * which is a different question, and one nothing in the repository could
 * answer before. A watch can be arithmetically perfect and still hand the
 * operator four minutes with nothing to look at, a battery that never gets a
 * legal shot, or a magazine that runs dry ninety seconds into a raid that
 * lasts eight. Those are the failures this measures, and it measures them by
 * PLAYING: it builds a real `World`, drives it through the same public methods
 * the console drives — assign, fire, setRadar, setSalvo, answer, takeDirect,
 * scoot — and writes down what the watch felt like from that seat.
 *
 * Nothing here is a private mechanic. The harness may only touch what a person
 * with a keyboard could touch, which is why it is worth anything at all.
 *
 * ---------------------------------------------------------------------------
 * THE FOUR OPERATORS
 * ---------------------------------------------------------------------------
 * Four players, not one, because the interesting number is almost never a
 * level — it is a difference. A watch where the expert and the spectator score
 * within noise of each other is a watch with no game in it; a watch where the
 * novice scores below the spectator is a watch that punishes participation.
 *
 *   nothing     Never touches a control. Radars stay as the scenario leaves
 *               them, directives time out unanswered. The floor: what the
 *               night does when nobody is in the chair. Every other figure is
 *               only meaningful against this one.
 *
 *   novice      Notices late and fixates. Brings the sets up forty-five
 *               seconds in (a real person reads the brief, then the panel,
 *               then finds the switch), works ONE contact at a time and only
 *               once it is firm and already well inside somebody's envelope —
 *               eight seconds of reaction after noticing — accepts every
 *               directive twenty seconds after it arrives, and in the cabin
 *               waits six seconds after READY before pressing LAUNCH. Never
 *               displaces, never manages emissions. This is the shape of a
 *               first watch, and the thing to watch for is where it scores
 *               BELOW `nothing`: that is the game punishing a beginner for
 *               joining in.
 *
 *   competent   The obvious correct play, no craft. Radiates at once; every
 *               three seconds hands each firm, non-decoy hostile to the
 *               battery with the best `engagementValue` among those whose
 *               `cannotEngageReason` is null; never double-assigns
 *               (shoot-look-shoot); answers directives inside eight seconds;
 *               in the cabin locks and fires the instant a solution is ready;
 *               shuts a set down with an anti-radiation round inbound on it
 *               and brings it straight back up afterwards. Anything a
 *               competent player cannot do on a watch is a design problem, not
 *               a skill problem.
 *
 *   expert      Competent, plus the four things the game claims to reward:
 *               priority (a global greedy pairing over `engagementValue`,
 *               which already carries the defended-asset weight, so the round
 *               goes where the night's own arithmetic says it should); salvo
 *               sizing (`setSalvo` to two for a critical or civilian place, or
 *               for a shot the edge of the envelope is going to spoil, and one
 *               otherwise); emissions discipline (a duty cycle on the battery's
 *               own set, and RIDE — hold the beam — when the rounds already in
 *               the air land before the enemy's does); and, at district and
 *               national command, standing in the sector under the main effort
 *               — `takeDirect` on the formation carrying the most threat, but
 *               only when it beats the weakest sector already held by half
 *               again, because a handover costs eighteen or twenty-six seconds
 *               of nobody commanding anything. And it answers the command net
 *               from the table below rather than out of politeness.
 *
 * ---------------------------------------------------------------------------
 * THE EXPERT'S ANSWER TABLE
 * ---------------------------------------------------------------------------
 * Every row is a measurement, and the measurement did not say what it was
 * expected to say. Eight seeds a row, expert play, both arms of each hinge,
 * paired by seed — mean score / mean standing / watches held:
 *
 *   directive           watch                  seat  accept          refuse
 *   expenditureFreeze   economy-of-force       net   1258 /89/ 8-8   1258 /68/ 7-8
 *   expenditureFreeze   economy-of-force       crew  1521 /92/ 8-8   1322 /70/ 8-8
 *   borderRestriction   across-the-line        net    865 /99/ 8-8    865 /74/ 8-8
 *   borderRestriction   across-the-line        crew   913 /93/ 8-8    913 /71/ 8-8
 *   withdrawBattalion   reinforce-the-capital  net    602 /24/ 7-8   1242 / 6/ 8-8
 *   palacePriority      two-cities             net   −640 / 3/ 1-8   −640 / 1/ 1-8
 *   engageCivil         ville-under-fire       net    610 /39/ 3-8    610 /24/ 3-8
 *   civilCorridor       white-noise            crew  1486 /92/ 8-8   1386 /85/ 8-8
 *   priority (routine)  white-noise            net   1439 /92/ 8-8   1439 /82/ 8-8
 *   conserve            white-noise            net   1439 /92/ 8-8   1439 /77/ 8-8
 *
 * So the expert refuses exactly one order in the whole campaign, and it is
 * the one that takes equipment off the board:
 *
 *   withdrawBattalion   REFUSE   +640 mean score, ahead on 6 seeds of 8, and
 *                                the district holds 8 of 8 instead of 7. This
 *                                is the only hinge whose acceptance MOVES
 *                                something — `withdrawSite` marches the
 *                                long-range battalion off the board — and it
 *                                costs eighteen points of standing to say no.
 *                                README: obeying costs a district town.
 *
 *   everything else     ACCEPT   because accepting an order binds your
 *                                SUBORDINATES, not you. The freeze and the
 *                                border restriction stand the AI's crews and
 *                                officers down off the struck-off place; they
 *                                do not stop the person at the console from
 *                                defending it, and this player defends it
 *                                anyway. The score is therefore identical to
 *                                the decimal on both arms of four of these
 *                                rows, while refusing costs twenty to
 *                                twenty-five points of standing and a
 *                                referral that stays in the file. That is
 *                                README's own conclusion, arrived at from
 *                                the other end: "Refusing on the net, for the
 *                                identical night's fighting, costs seventeen
 *                                points more than quietly disobeying." Quiet
 *                                insubordination is the score-best play, and
 *                                this table is what it looks like when a
 *                                machine works that out on its own.
 *
 * The two apparent exceptions are worth naming. Accepting the freeze in the
 * CREW seat scores 199 points BETTER than refusing it (1521 vs 1322) — the
 * sector's rounds go somewhere more valuable than the hospital when the AI is
 * told to leave it alone, and the operator in the cabin covers it. And the
 * civil corridor is worth +100 accepted, because a sector that stops shooting
 * inside a twenty-four-degree wedge stops shooting at the transit.
 *
 * Reproduce any row by editing EXPERT_ANSWERS and running the two arms:
 *   node tools/playtest.mjs --mission economy-of-force --seat net \
 *     --policy expert --seeds 8 --md /tmp/freeze.md
 *
 * ---------------------------------------------------------------------------
 * WHAT A HOLE IS
 * ---------------------------------------------------------------------------
 * The watch is sampled once per simulated second. A second is a HOLE when all
 * four of these are true from the player's seat:
 *
 *   - nothing engageable: no live hostile track that any battery of theirs
 *     could legally take (crew seat: their own battery only);
 *   - nothing in flight: not one round alive anywhere, theirs or the enemy's;
 *   - no directive pending on the command net;
 *   - not one line reached the ticker that second — chatter, comms, launch,
 *     command traffic, anything.
 *
 * A hole is thirty consecutive such seconds. That is the length at which a
 * person puts the controller down. `holes.count` counts them, `longestS` is
 * the worst stretch (reported whatever its length) and `shareOver30s` is how
 * much of the watch is inside one. Lines the player's own switches generate
 * count as ticker activity — but the policies only actuate on a change of
 * state, so a policy cannot paper over a hole by flipping a switch it has
 * already flipped.
 *
 * `engageableShare` is the other side of the same coin and reads backwards
 * until you see why: it is the share of the watch on which some contact was
 * legally shootable and NOBODY OF YOURS HAD IT — a battery already engaged has
 * no free channel, so it stops counting. High is not good. `nothing` scores
 * 90% on First Light because it answers none of them; competent scores 40% on
 * the same watch because it answered them. Read it as unanswered opportunity,
 * and read a policy that cannot get it down as a seat that cannot keep up.
 *
 * `magazineOnlyLimiterShare` is the share of the watch with no legal shot
 * where the ONLY thing wrong was an empty rack — the contact in the altitude
 * band, in reach, a channel free, and no round to put on it. It is how you
 * tell a quiet watch from a watch spent watching a reload bar.
 *
 * ---------------------------------------------------------------------------
 * SEEDS, AND WHY THE OUTPUT IS BYTE-IDENTICAL
 * ---------------------------------------------------------------------------
 * Seeds are `p1`, `p2`, ... `p<n>` from `--seed-base`, and nothing else. No
 * clock, no PID, no `Math.random` — the engine draws only from its own seeded
 * generator, so the same tree and the same seed produce the same numbers to
 * the last decimal, on any machine, at any `--jobs`. Results are sorted by
 * (mission, seat, policy, seed) before they are written, so the worker count
 * cannot reorder them either. Only `meta` carries wall-clock timing, and the
 * regression test asserts the rest is identical across two runs.
 *
 * Everything is measured from the seat the argument names. `--seat crew`
 * confines the player to the crewed battery, which the engine does NOT do for
 * you: `commandable()` is true for every battery of a formation under your
 * hand even when you are sitting in a cabin that can only see one of them.
 * And a battery you are not sitting in runs its own emissions — `runAiEmcon`
 * rewrites `radar.on` every tick — so the harness only ever works the switches
 * a person in that seat actually has: the surveillance sets on the net, and
 * the sets of the battery you are crewing.
 */

import { parseArgs } from 'node:util';
import { fork } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { World } from '../src/engine/world.js';
import { SCENARIOS } from '../src/engine/scenarios.js';
import { cannotEngageReason, engagementValue, sortedTracks } from '../src/engine/threat.js';
import { armTimeToImpact, channelsFor } from '../src/engine/doctrine.js';
import { inEnvelope, timeToInRangeS } from '../src/engine/weapons.js';
import { AIR_TYPES, ASSET_TYPES, DETECTION, SAM_TYPES } from '../src/engine/config.js';
import { dist, len } from '../src/engine/math.js';

const THIS_FILE = fileURLToPath(import.meta.url);

/** Ticks before a run is abandoned. 40 000 is sixty-six simulated minutes. */
const MAX_TICKS = 40000;
/** Consecutive empty seconds that make a hole. */
const HOLE_S = 30;
/** Firm enough to shoot at, per the detection model's own bar. */
const FIRM = DETECTION.firmQuality;

export const POLICY_ORDER = ['nothing', 'novice', 'competent', 'expert'];
export const SEAT_ORDER = ['net', 'crew', 'both'];
const MISSION_ORDER = SCENARIOS.map((s) => s.id);

/** Log kinds that count as the watch doing something to you, for dead-air. */
const ACTION_KINDS = new Set(['launch', 'good', 'alert', 'warn', 'command', 'comms']);

/**
 * How the expert answers the command net. See the header for the measurement
 * behind each row; anything not named here is accepted.
 */
export const EXPERT_ANSWERS = {
  /*
   * The only order in the campaign that is worth the standing it costs to
   * refuse: measured 1242 against 602 over eight seeds, ahead on six of them,
   * because it is the only one whose acceptance physically removes a battalion
   * from the board. Every other order binds your subordinates rather than you,
   * and the expert accepts it and defends the place anyway.
   */
  withdrawBattalion: 'refused',
};

/* ------------------------------------------------------------------ *
 * What the seat can touch
 * ------------------------------------------------------------------ */

/**
 * The batteries this seat may give orders to.
 *
 * In the cabin that is one battery — and the engine will not enforce it, so
 * this does. `commandable()` answers a question about the FORMATION, and a
 * crewed battery's formation is under your appointment's hand whether or not
 * you can see any of it from where you are sitting.
 */
function ownSites(w, seat) {
  if (seat === 'crew') {
    const site = w.siteById.get(w.control.crewedBatteryId);
    return site && site.alive ? [site] : [];
  }
  return w.sites.filter((s) => s.alive && w.commandable(s.id));
}

/**
 * The emissions switches this seat actually has, grouped by the battery they
 * belong to — because a battery has one emissions posture, not one per
 * antenna, and `setRadar` on any of its sets moves all of them.
 *
 * Surveillance sets answer to the net. A battery's own sets answer to whoever
 * is sitting in it, and every battery nobody is sitting in is on AI emissions
 * discipline that rewrites `radar.on` every tick — so the harness does not
 * pretend to control those, any more than the console does.
 */
function radarGroups(w, seat) {
  const groups = [];
  if (seat !== 'crew') {
    for (const radar of w.radars) {
      if (radar.alive && !radar.siteId) groups.push({ siteId: null, radars: [radar] });
    }
  }
  const crewedId = w.control.crewedBatteryId;
  const crewed = crewedId ? w.siteById.get(crewedId) : null;
  if (crewed?.alive) {
    const sets = w.radars.filter((r) => r.alive && r.siteId === crewed.id);
    if (sets.length) groups.push({ siteId: crewed.id, radars: sets });
  }
  return groups;
}

/** Bring a group of sets up or down, and say so — but only on a change. */
function setGroup(ctx, group, on) {
  if (group.radars.every((r) => r.on === on)) return false;
  ctx.w.setRadar(group.radars[0].id, on);
  ctx.act(`${on ? 'RADIATE' : 'SILENCE'} ${group.radars[0].label}`);
  return true;
}

/** Seconds until an anti-radiation round reaches any set of this group. */
function armEtaFor(w, group) {
  let soonest = Infinity;
  for (const radar of group.radars) soonest = Math.min(soonest, armTimeToImpact(w, radar));
  return soonest;
}

/**
 * Seconds until this battery's own rounds finish their work.
 *
 * The same arithmetic the crew does when it decides whether to take the hit:
 * a set that shuts down drops the rounds it is guiding, so the question is
 * only ever which arrives first.
 */
function ownRoundEta(w, site) {
  let soonest = Infinity;
  for (const missile of w.missiles) {
    if (!missile.alive || missile.siteId !== site.id) continue;
    const target = w.aircraftById.get(missile.targetId);
    if (!target?.alive) continue;
    const eta = dist(missile.pos, target.pos)
      / Math.max(missile.speed - len(target.vel) * 0.5, 0.2);
    if (eta < soonest) soonest = eta;
  }
  return soonest;
}

/* ------------------------------------------------------------------ *
 * Shared pieces of play
 * ------------------------------------------------------------------ */

/** Is this a contact worth a round at all? */
function shootable(track) {
  return track.hostility === 'hostile'
    && !track.destroyed
    && track.quality >= FIRM
    && track.classification !== 'decoy';
}

/** Answer whatever is on the net, once it has been there long enough. */
function answerAfter(ctx, delayS, chooser) {
  const pending = ctx.w.command.pending;
  if (!pending) return;
  if (ctx.w.t - pending.issuedS < delayS) return;
  const reply = chooser ? chooser(pending.id) : 'accepted';
  ctx.w.answer(reply);
  ctx.act(`${reply.toUpperCase()} ${pending.id}`);
}

/**
 * Hand out targets, best battery first.
 *
 * `flat` is the competent player's pass: walk the threat list, give each
 * unclaimed contact to whichever of your batteries scores highest on it.
 * `greedy` is the expert's: score every (contact, battery) pair the sector
 * can offer and take them best-first, so the highest-value shot in the sector
 * gets the battery it wants rather than whichever contact happened to be
 * higher up the list.
 */
function assignPass(ctx, { greedy = false, salvo = false } = {}) {
  const { w } = ctx;
  const pairs = [];
  for (const track of sortedTracks(w)) {
    if (!shootable(track) || track.threat < 1) continue;
    if (track.assignedTo.length > 0) continue;      // shoot-look-shoot
    let best = null;
    for (const site of ctx.own) {
      if (cannotEngageReason(w, site, track)) continue;
      const evaluation = engagementValue(w, site, track);
      if (!evaluation) continue;
      if (greedy) pairs.push({ track, site, value: evaluation.value });
      else if (!best || evaluation.value > best.value) {
        best = { track, site, value: evaluation.value };
      }
    }
    if (best) pairs.push(best);
  }
  if (greedy) pairs.sort((a, b) => b.value - a.value);

  const taken = new Set();
  for (const pair of pairs) {
    if (taken.has(pair.track.id)) continue;
    // Re-check: a channel filled by an earlier assignment in this same pass.
    if (cannotEngageReason(w, pair.site, pair.track)) continue;
    if (salvo) sizeSalvo(ctx, pair.site, pair.track);
    if (w.assign(pair.track.id, pair.site.id)) {
      taken.add(pair.track.id);
      ctx.act(`ASSIGN ${pair.track.tn} → ${pair.site.name}`);
    }
  }
}

/**
 * Two rounds or one.
 *
 * Rounds cost five points each and a kill is worth twenty-two, so a pair is
 * only ever right when the shot is bad or the place behind it is expensive.
 * Both halves of that are checkable from the seat: what the contact is going
 * for is on the shootlist, and how good the shot is, is the range ring.
 */
function sizeSalvo(ctx, site, track) {
  const type = SAM_TYPES[site.type];
  const env = inEnvelope(site, track.pos, track.altM);
  const threatened = track.predictedAssetId ? ctx.w.assetById.get(track.predictedAssetId) : null;
  const assetType = threatened && !threatened.destroyed ? ASSET_TYPES[threatened.type] : null;
  const precious = !!assetType && (assetType.critical || assetType.civilian);
  const awkward = env.rangeKm > type.maxRangeKm * 0.75 || track.altM < type.minAltM * 3;
  const want = (precious || awkward) && site.readyRounds >= 4 ? 2 : 1;
  if (site.salvoSize !== want) {
    ctx.w.setSalvo(site.id, want);
    ctx.act(`SALVO ${site.salvoSize} ${site.name}`);
  }
}

/**
 * The cabin: lock what the battery can take, fire what is ready, reload when
 * the rails are bare. `fireDelayS` is how long the operator takes to react to
 * the READY lamp — zero for a drilled crew, six seconds for a first watch.
 *
 * Two rules that are not in the net-seat pass, and are the difference between
 * a crew seat that shoots and one that watches. A battery has two or four
 * channels, not a sector's worth: `cannotEngageReason` will happily bless a
 * lock on something a minute out (the claim horizon is forty-five seconds plus
 * what the battery's reach entitles it to plan), and measured, the cabin then
 * pinned both LANCE channels on distant contacts from 125 s and did not fire
 * a round until 700 s. So the cabin locks what is in the envelope or nearly
 * in it, and lets go of a claim the geometry has taken away.
 */
function crewLoop(ctx, fireDelayS) {
  const { w } = ctx;
  const site = ctx.crewed;
  if (!site?.alive || site.scootRemainingS > 0) return;

  for (const engagement of [...site.engagements]) {
    if (engagement.state !== 'ready') continue;
    if (w.t - (engagement.readyAtS ?? w.t) < fireDelayS) continue;
    const launched = w.fire(site.id, engagement.trackId);
    if (launched > 0) ctx.act(`FIRE ${launched} on ${engagement.trackId}`);
  }

  for (const engagement of [...site.engagements]) {
    if (engagement.state === 'guiding') continue;
    if (w.t - engagement.startedS < 20) continue;
    const track = w.tracks.get(engagement.trackId);
    // NaN is a course not yet established, and that one the crew takes on
    // faith — the same call `cannotEngageReason` makes.
    const toRange = track ? timeToInRangeS(site, track) : Infinity;
    const coming = Number.isNaN(toRange) || toRange <= 45;
    const stale = !track || (!inEnvelope(site, track.pos, track.altM).ok && !coming);
    if (stale && w.unassign(engagement.trackId, site.id)) ctx.act(`BREAK OFF ${engagement.trackId}`);
  }

  if (site.engagements.length < channelsFor(site) && site.readyRounds > 0) {
    let best = null;
    let bestValue = -Infinity;
    for (const track of sortedTracks(w)) {
      if (!shootable(track)) continue;
      if (site.engagements.some((e) => e.trackId === track.id)) continue;
      if (cannotEngageReason(w, site, track)) continue;
      const evaluation = engagementValue(w, site, track);
      if (!evaluation) continue;
      if (!evaluation.inEnvelope && !(evaluation.timeToRangeS <= 30)) continue;
      if (evaluation.value > bestValue) { bestValue = evaluation.value; best = track; }
    }
    if (best && w.assign(best.id, site.id)) ctx.act(`LOCK ${best.tn}`);
  }

  if (site.readyRounds <= 0 && site.reloadRemainingS <= 0 && site.magazine > 0
    && site.engagements.length === 0) {
    if (w.reload(site.id)) ctx.act('RELOAD');
  }
}

/* ------------------------------------------------------------------ *
 * The four operators
 * ------------------------------------------------------------------ */

export const POLICIES = {
  nothing: {
    id: 'nothing',
    blurb: 'never touches a control; directives time out',
    tick() {},
  },

  novice: {
    id: 'novice',
    blurb: 'radiates at 45s, one target at a time, 8s to react, 20s to answer',
    tick(ctx) {
      const { w, mem } = ctx;
      if (w.t >= 45 && !mem.radiated) {
        mem.radiated = true;
        for (const group of ctx.groups) setGroup(ctx, group, true);
      }
      answerAfter(ctx, 20);

      // One contact at a time, and it holds the attention until it is gone.
      const focus = mem.focusId ? w.tracks.get(mem.focusId) : null;
      const spent = !focus || focus.destroyed
        || (mem.assigned && focus.assignedTo.length === 0)
        // Patience is not infinite: a contact that will not become assignable
        // is eventually forgotten rather than fixated on for the whole watch.
        || (!mem.assigned && w.t - mem.noticedAtS > 45);
      if (spent) { mem.focusId = null; mem.assigned = false; }

      if (!mem.focusId) {
        for (const track of sortedTracks(w)) {
          if (!shootable(track) || track.assignedTo.length > 0) continue;
          if (!ctx.own.some((s) => wellInside(s, track))) continue;
          mem.focusId = track.id;
          mem.noticedAtS = w.t;
          mem.assigned = false;
          ctx.act(`NOTICES ${track.tn}`);
          break;
        }
      } else if (!mem.assigned && w.t - mem.noticedAtS >= 8) {
        const track = w.tracks.get(mem.focusId);
        const site = ctx.own
          .filter((s) => wellInside(s, track) && !cannotEngageReason(w, s, track))
          .sort((a, b) => dist(a.pos, track.pos) - dist(b.pos, track.pos))[0];
        if (site && w.assign(track.id, site.id)) {
          mem.assigned = true;
          ctx.act(`ASSIGN ${track.tn} → ${site.name}`);
        }
      }

      if (ctx.crewed) {
        crewLoopNovice(ctx);
      }
    },
  },

  competent: {
    id: 'competent',
    blurb: 'radiates at once, assigns every 3s by engagementValue, blinks under ARM',
    tick(ctx) {
      const { w, mem } = ctx;
      for (const group of ctx.groups) setGroup(ctx, group, armEtaFor(w, group) >= 18);
      answerAfter(ctx, 6);
      if (ctx.seat !== 'crew' && w.t - (mem.lastPassS ?? -99) >= 3) {
        mem.lastPassS = w.t;
        assignPass(ctx, {});
      }
      if (ctx.crewed) crewLoop(ctx, 0);
    },
  },

  expert: {
    id: 'expert',
    blurb: 'greedy priority, salvo sizing, EMCON discipline, stands in the main effort',
    tick(ctx) {
      const { w, mem } = ctx;
      expertEmcon(ctx);
      answerAfter(ctx, 6, (id) => EXPERT_ANSWERS[id] ?? 'accepted');
      if (ctx.seat !== 'crew' && w.t - (mem.lastPassS ?? -99) >= 3) {
        mem.lastPassS = w.t;
        assignPass(ctx, { greedy: true, salvo: true });
      }
      if (ctx.crewed) crewLoop(ctx, 0);
      if (ctx.seat !== 'crew') standInTheMainEffort(ctx);
    },
  },
};

/** A novice's cabin: the same loop, six seconds slower, and a late reload. */
function crewLoopNovice(ctx) {
  const { w, mem } = ctx;
  const site = ctx.crewed;
  if (!site?.alive) return;
  for (const engagement of [...site.engagements]) {
    if (engagement.state !== 'ready') continue;
    if (w.t - (engagement.readyAtS ?? w.t) < 6) continue;
    const launched = w.fire(site.id, engagement.trackId);
    if (launched > 0) ctx.act(`FIRE ${launched} on ${engagement.trackId}`);
  }
  if (site.readyRounds <= 0 && site.reloadRemainingS <= 0 && site.magazine > 0) {
    mem.dryAtS = mem.dryAtS ?? w.t;
    if (w.t - mem.dryAtS >= 20 && w.reload(site.id)) { mem.dryAtS = null; ctx.act('RELOAD'); }
  } else if (site.readyRounds > 0) {
    mem.dryAtS = null;
  }
}

/** Firm, in the altitude band, and already well inside the ring — a beginner's bar. */
function wellInside(site, track) {
  if (!track) return false;
  const type = SAM_TYPES[site.type];
  if (track.altM > type.maxAltM || track.altM < type.minAltM) return false;
  return dist(site.pos, track.pos) <= type.maxRangeKm * 0.8;
}

/**
 * The expert's emissions.
 *
 * Surveillance stays up unless something is homing on it. The battery's own
 * set is the interesting one, and it is the whole game in one switch: up when
 * there is anything to look at or anything to guide, a duty cycle otherwise so
 * the enemy's direction-finders never get a steady bearing, and — with an
 * anti-radiation round inbound — the RIDE order when the rounds already in the
 * air will land first, because a set that ducks drops what it is guiding.
 */
function expertEmcon(ctx) {
  const { w } = ctx;
  for (const group of ctx.groups) {
    const armEta = armEtaFor(w, group);
    if (!group.siteId) { setGroup(ctx, group, armEta >= 18); continue; }

    const site = w.siteById.get(group.siteId);
    if (!site?.alive) continue;
    if (armEta < 18) {
      const roundEta = ownRoundEta(w, site);
      if (roundEta + 2 < armEta) {
        if (w.setEmconOrder(site.id, 'ride')) ctx.act('RIDE — HOLD THE BEAM');
        setGroup(ctx, group, true);
      } else {
        w.setEmconOrder(site.id, 'doctrine');
        setGroup(ctx, group, false);
      }
      ctx.mem.blinkUntilS = w.t + 25;
      continue;
    }
    w.setEmconOrder(site.id, 'doctrine');
    if (w.t < (ctx.mem.blinkUntilS ?? 0)) continue;

    const type = SAM_TYPES[site.type];
    const work = site.engagements.length > 0
      || [...w.tracks.values()].some((t) => t.hostility !== 'friendly' && t.quality > 0.3
        && dist(site.pos, t.pos) < type.maxRangeKm * 1.3);
    if (work) { setGroup(ctx, group, true); ctx.mem.searchUntilS = 0; continue; }
    if (w.t < (ctx.mem.searchUntilS ?? 0)) { setGroup(ctx, group, true); continue; }
    if (w.t > (ctx.mem.nextSearchS ?? 0)) {
      ctx.mem.searchUntilS = w.t + 18;
      ctx.mem.nextSearchS = w.t + 18 + 40;
      setGroup(ctx, group, true);
      continue;
    }
    setGroup(ctx, group, false);
  }
}

/**
 * Stand where the fight is.
 *
 * Only means anything from district command up, where the appointment holds
 * fewer sectors than it owns. Threat mass is summed per formation by which
 * formation each hostile is nearest, and the hand only moves when the loose
 * sector beats the weakest held one by half again — a handover is eighteen
 * seconds at district and twenty-six at national, during which nobody is
 * commanding either of them, so thrashing is worse than being in the wrong
 * place.
 */
function standInTheMainEffort(ctx) {
  const { w, mem } = ctx;
  if (!Number.isFinite(w.echelon.directLimit)) return;
  if (w.t - (mem.lastLookS ?? -99) < 45) return;
  mem.lastLookS = w.t;

  const subordinate = w.formations.filter((f) => !f.hq);
  if (subordinate.length <= w.echelon.directLimit) return;

  const centreOf = (formation) => {
    if (formation.pos) return formation.pos;
    const sites = w.sitesOf(formation);
    if (!sites.length) return null;
    return {
      x: sites.reduce((n, s) => n + s.pos.x, 0) / sites.length,
      y: sites.reduce((n, s) => n + s.pos.y, 0) / sites.length,
    };
  };
  const mass = new Map(subordinate.map((f) => [f.id, 0]));
  for (const track of w.tracks.values()) {
    if (track.hostility !== 'hostile' || track.destroyed || !(track.threat > 0)) continue;
    let nearest = null;
    let best = Infinity;
    for (const formation of subordinate) {
      const centre = centreOf(formation);
      if (!centre) continue;
      const d = dist(centre, track.pos);
      if (d < best) { best = d; nearest = formation; }
    }
    if (nearest) mass.set(nearest.id, mass.get(nearest.id) + track.threat);
  }

  const held = subordinate.filter((f) => f.direct);
  const loose = subordinate.filter((f) => !f.direct);
  const top = loose.sort((a, b) => mass.get(b.id) - mass.get(a.id))[0];
  if (!top || mass.get(top.id) <= 0) return;
  const weakest = held.sort((a, b) => mass.get(a.id) - mass.get(b.id))[0];
  const room = held.length < w.echelon.directLimit;
  if (!room && (!weakest || mass.get(top.id) < mass.get(weakest.id) * 1.5)) return;
  if (w.takeDirect(top.id)) ctx.act(`TAKE ${top.name}`);
}

/* ------------------------------------------------------------------ *
 * One run
 * ------------------------------------------------------------------ */

/**
 * Could this battery shoot this contact if only it had a round on the rail?
 *
 * `cannotEngageReason` answers with the FIRST thing that is wrong, and an
 * empty rack is checked before reach and channels — so "no rounds" alone does
 * not mean the magazine is the binding constraint. This asks the rest of the
 * question, and it is the difference between a watch that is quiet and a watch
 * whose player is watching a reload bar.
 */
function magazineIsTheOnlyLimit(w, site, track) {
  if (site.readyRounds > 0) return false;
  const type = SAM_TYPES[site.type];
  if (track.altM > type.maxAltM || track.altM < type.minAltM) return false;
  if (site.engagements.length >= channelsFor(site)) return false;
  const toRange = timeToInRangeS(site, track);
  if (toRange === Infinity) return false;
  if (Number.isFinite(toRange) && toRange > 45 + type.maxRangeKm * 0.4) return false;
  return true;
}

const r1 = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : null);
const r3 = (x) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null);

/** Play one watch and write down what it was like. Deterministic in `job`. */
export function playRun(job) {
  const { mission, seat, policy: policyId, seed } = job;
  const scenario = SCENARIOS.find((s) => s.id === mission);
  if (!scenario) throw new Error(`no such mission: ${mission}`);
  if (!scenario.roles.includes(seat)) throw new Error(`${mission} has no ${seat} seat`);
  const model = POLICIES[policyId];
  if (!model) throw new Error(`no such policy: ${policyId}`);

  const w = new World(scenario, { role: seat, seed });
  const trace = job.trace ? [`### ${mission} · ${seat} · ${policyId} · ${seed}`] : null;
  const lastHostileSpawnS = w.pendingWaves
    .filter((wave) => !AIR_TYPES[wave.type]?.friendly)
    .reduce((m, wave) => Math.max(m, wave.atS), 0);

  const isOwn = (siteId) => {
    if (!siteId) return false;
    if (seat === 'crew') return siteId === w.control.crewedBatteryId;
    return w.commandable(siteId);
  };

  let sawLine = false;
  let lastActionS = 0;
  let firstLaunchS = null;
  let ownRounds = 0;
  const realLog = w.log.bind(w);
  w.log = (kind, text, meta = {}) => {
    sawLine = true;
    // Everything except the debrief's own headline, which is logged AFTER the
    // last thing that happened and would otherwise report every watch as
    // ending on the beat. `endAfterLastActionS` is exactly the dead coda the
    // "bookends are alive" work went after, so it must not measure itself.
    if (ACTION_KINDS.has(kind) && !text.startsWith('WATCH ENDS')) lastActionS = w.t;
    if (kind === 'launch' && isOwn(meta.siteId)) {
      if (firstLaunchS === null) firstLaunchS = w.t;
      const away = /— (\d+) AWAY ON/.exec(text);
      ownRounds += away ? Number(away[1]) : 1;
    }
    if (trace && trace.length < 40000) trace.push(`${w.t.toFixed(1)} ${kind} ${text}`);
    return realLog(kind, text, meta);
  };

  const mem = {};
  const act = trace
    ? (text) => { if (trace.length < 40000) trace.push(`${w.t.toFixed(1)} play ${text}`); }
    : () => {};

  const holeFlags = [];
  const opportunities = new Set();
  let samples = 0;
  let engageableS = 0;
  let magOnlyS = 0;
  let firstContactS = null;
  let firstLegalShotS = null;
  let ticks = 0;
  let capHit = false;

  while (w.phase === 'running') {
    if (ticks >= MAX_TICKS) { capHit = true; break; }
    w.step(0.1);
    ticks++;
    if (ticks % 10 !== 0) continue;

    const own = ownSites(w, seat);
    let engageable = false;
    let magOnly = false;
    for (const track of w.tracks.values()) {
      if (track.destroyed || track.hostility !== 'hostile') continue;
      for (const site of own) {
        if (cannotEngageReason(w, site, track) === null) {
          engageable = true;
          opportunities.add(track.id);
        } else if (magazineIsTheOnlyLimit(w, site, track)) {
          magOnly = true;
        }
      }
    }
    if (firstContactS === null && w.tracks.size > 0) firstContactS = w.t;
    if (firstLegalShotS === null && engageable) firstLegalShotS = w.t;
    samples++;
    if (engageable) engageableS++;
    else if (magOnly) magOnlyS++;
    holeFlags.push(!engageable
      && !w.missiles.some((m) => m.alive)
      && !w.command.pending
      && !sawLine);
    sawLine = false;

    model.tick({
      w,
      seat,
      mem,
      act,
      own,
      groups: radarGroups(w, seat),
      crewed: w.control.crewedBatteryId ? w.siteById.get(w.control.crewedBatteryId) : null,
    });
  }

  const outcome = w.outcome ?? w.result('raid-spent');
  const watchS = w.t;
  const holes = holeStats(holeFlags, watchS);
  const directives = { issued: 0, accepted: 0, refused: 0, timedOut: 0 };
  for (const entry of w.command.log) {
    directives.issued++;
    if (entry.state === 'accepted') directives.accepted++;
    else if (entry.state === 'refused') directives.refused++;
    else if (entry.state === 'ignored') directives.timedOut++;
  }

  const run = {
    mission,
    seat,
    policy: policyId,
    seed,
    watchS: r1(watchS),
    capHit,
    firstContactS: r1(firstContactS),
    firstLegalShotS: r1(firstLegalShotS),
    firstLaunchS: r1(firstLaunchS),
    lastHostileSpawnS: r1(lastHostileSpawnS),
    endAfterLastActionS: r1(Math.max(0, watchS - lastActionS)),
    holes,
    engageableShare: r3(samples ? engageableS / samples : 0),
    legalShotOpportunities: opportunities.size,
    magazineOnlyLimiterShare: r3(samples ? magOnlyS / samples : 0),
    rounds: outcome.stats.roundsFired,
    ownRounds,
    kills: outcome.stats.kills,
    leakers: outcome.stats.leakers,
    assetsLost: outcome.stats.assetsLost,
    score: outcome.score,
    standing: outcome.standing,
    held: outcome.success,
    headline: outcome.headline,
    tier: outcome.tier,
    directives,
    ending: outcome.endingId ?? null,
  };
  return trace ? { run, trace } : { run };
}

function holeStats(flags, watchS) {
  let count = 0;
  let longestS = 0;
  let insideS = 0;
  let run = 0;
  const close = () => {
    if (run > longestS) longestS = run;
    if (run >= HOLE_S) { count++; insideS += run; }
    run = 0;
  };
  for (const flag of flags) { if (flag) run++; else close(); }
  close();
  return { count, longestS, shareOver30s: r3(watchS > 0 ? insideS / watchS : 0) };
}

/* ------------------------------------------------------------------ *
 * The matrix
 * ------------------------------------------------------------------ */

export function buildJobs({ missions, seats, policies, seeds, seedBase, trace }) {
  const jobs = [];
  for (const mission of missions) {
    const scenario = SCENARIOS.find((s) => s.id === mission);
    if (!scenario) throw new Error(`no such mission: ${mission}`);
    for (const seat of SEAT_ORDER) {
      if (!seats.includes(seat) || !scenario.roles.includes(seat)) continue;
      for (const policy of POLICY_ORDER) {
        if (!policies.includes(policy)) continue;
        for (let i = 0; i < seeds; i++) {
          jobs.push({
            mission,
            seat,
            policy,
            seed: `p${seedBase + i}`,
            trace: trace && i === 0,
          });
        }
      }
    }
  }
  return jobs;
}

const sortKey = (job) => [
  MISSION_ORDER.indexOf(job.mission),
  SEAT_ORDER.indexOf(job.seat),
  POLICY_ORDER.indexOf(job.policy),
  job.seed,
];

/** Run a job list, in this process or across `jobs` children. Order-stable. */
export async function runMatrix(opts) {
  const jobs = buildJobs(opts);
  if (!jobs.length) {
    throw new Error('nothing to play — every mission asked for refuses every seat asked for '
      + `(seats ${opts.seats.join(',')}; the roster's seats come from each scenario's roles)`);
  }
  const workers = Math.max(1, Math.min(opts.jobs ?? 1, jobs.length));
  const started = Date.now();
  const results = new Array(jobs.length);
  let done = 0;
  const progress = (index) => {
    done++;
    if (!opts.quiet) {
      const job = jobs[index];
      process.stderr.write(`[${String(done).padStart(4)}/${jobs.length}] `
        + `${job.mission} ${job.seat} ${job.policy} ${job.seed}\n`);
    }
  };

  if (workers === 1) {
    for (let i = 0; i < jobs.length; i++) { results[i] = playRun(jobs[i]); progress(i); }
  } else {
    await new Promise((done_, fail) => {
      let next = 0;
      let live = workers;
      for (let n = 0; n < workers; n++) {
        const child = fork(THIS_FILE, ['--worker'], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
        let current = -1;
        const feed = () => {
          if (next >= jobs.length) { child.disconnect(); return; }
          current = next++;
          child.send(jobs[current]);
        };
        child.on('message', (message) => {
          if (message.error) { fail(new Error(message.error)); return; }
          results[current] = message.result;
          progress(current);
          feed();
        });
        child.on('exit', () => { if (--live === 0) done_(); });
        child.on('error', fail);
        feed();
      }
    });
  }

  const order = jobs.map((job, i) => i)
    .sort((a, b) => {
      const ka = sortKey(jobs[a]);
      const kb = sortKey(jobs[b]);
      for (let i = 0; i < ka.length; i++) {
        if (ka[i] < kb[i]) return -1;
        if (ka[i] > kb[i]) return 1;
      }
      return 0;
    });
  const runs = order.map((i) => results[i].run);
  const traces = order.filter((i) => results[i].trace).map((i) => results[i].trace);
  const wallS = (Date.now() - started) / 1000;

  return {
    meta: {
      runs: runs.length,
      workers,
      wallS: Math.round(wallS * 10) / 10,
      secondsPerRun: Math.round((wallS / Math.max(1, runs.length)) * 1000) / 1000,
    },
    runs,
    aggregates: aggregate(runs),
    traces,
  };
}

/* ------------------------------------------------------------------ *
 * Aggregation
 * ------------------------------------------------------------------ */

const median = (xs) => {
  const clean = xs.filter((x) => x !== null && Number.isFinite(x)).sort((a, b) => a - b);
  if (!clean.length) return null;
  const mid = clean.length >> 1;
  return r1(clean.length % 2 ? clean[mid] : (clean[mid - 1] + clean[mid]) / 2);
};
const mean = (xs) => {
  const clean = xs.filter((x) => x !== null && Number.isFinite(x));
  return clean.length ? clean.reduce((a, b) => a + b, 0) / clean.length : null;
};

const TIMINGS = ['watchS', 'firstContactS', 'firstLegalShotS', 'firstLaunchS',
  'endAfterLastActionS', 'engageableShare', 'magazineOnlyLimiterShare',
  'legalShotOpportunities', 'rounds', 'ownRounds', 'kills', 'leakers', 'assetsLost'];

export function aggregate(runs) {
  const cells = new Map();
  for (const run of runs) {
    const key = `${run.mission}|${run.seat}|${run.policy}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(run);
  }

  const rows = [];
  for (const [key, group] of cells) {
    const [mission, seat, policy] = key.split('|');
    const scores = group.map((r) => r.score);
    const m = mean(scores);
    const variance = scores.length > 1
      ? scores.reduce((a, s) => a + (s - m) ** 2, 0) / (scores.length - 1)
      : 0;
    const row = {
      mission,
      seat,
      policy,
      n: group.length,
      heldRate: r3(group.filter((r) => r.held).length / group.length),
      meanScore: r1(m),
      medianScore: median(scores),
      scoreCV: m === 0 ? null : r3(Math.sqrt(variance) / Math.abs(m)),
      capHits: group.filter((r) => r.capHit).length,
      holeCount: median(group.map((r) => r.holes.count)),
      longestHoleS: median(group.map((r) => r.holes.longestS)),
      holeShare: r3(mean(group.map((r) => r.holes.shareOver30s)) ?? 0),
      directives: {
        issued: median(group.map((r) => r.directives.issued)),
        accepted: median(group.map((r) => r.directives.accepted)),
        refused: median(group.map((r) => r.directives.refused)),
        timedOut: median(group.map((r) => r.directives.timedOut)),
      },
    };
    for (const field of TIMINGS) row[field] = median(group.map((r) => r[field]));
    rows.push(row);
  }
  rows.sort((a, b) => MISSION_ORDER.indexOf(a.mission) - MISSION_ORDER.indexOf(b.mission)
    || SEAT_ORDER.indexOf(a.seat) - SEAT_ORDER.indexOf(b.seat)
    || POLICY_ORDER.indexOf(a.policy) - POLICY_ORDER.indexOf(b.policy));

  return { cells: rows, paired: pairedComparisons(runs) };
}

/**
 * The only numbers that mean anything on their own: the same seed, the same
 * watch, two different players. Per-seed score variance on a busy watch is
 * several times the effect any policy has, so a mean over unpaired runs is
 * measuring the sample.
 */
function pairedComparisons(runs) {
  const byKey = new Map();
  for (const run of runs) byKey.set(`${run.mission}|${run.seat}|${run.policy}|${run.seed}`, run);

  const out = [];
  const combos = new Map();
  for (const run of runs) combos.set(`${run.mission}|${run.seat}`, [run.mission, run.seat]);

  for (const [, [mission, seat]] of combos) {
    for (const [better, worse] of [['competent', 'nothing'], ['expert', 'competent']]) {
      const deltas = [];
      let won = 0;
      let heldBetter = 0;
      let heldWorse = 0;
      for (const run of runs) {
        if (run.mission !== mission || run.seat !== seat || run.policy !== better) continue;
        const other = byKey.get(`${mission}|${seat}|${worse}|${run.seed}`);
        if (!other) continue;
        if (run.score > other.score) won++;
        if (run.held) heldBetter++;
        if (other.held) heldWorse++;
        const base = Math.abs(other.score);
        deltas.push(base > 1 ? ((run.score - other.score) / base) * 100 : null);
      }
      if (!deltas.length) continue;
      out.push({
        mission,
        seat,
        comparison: `${better}-vs-${worse}`,
        n: deltas.length,
        seedsWon: won,
        meanDeltaPct: r1(mean(deltas)),
        heldBetter,
        heldWorse,
      });
    }
  }
  out.sort((a, b) => MISSION_ORDER.indexOf(a.mission) - MISSION_ORDER.indexOf(b.mission)
    || SEAT_ORDER.indexOf(a.seat) - SEAT_ORDER.indexOf(b.seat)
    || a.comparison.localeCompare(b.comparison));
  return out;
}

/* ------------------------------------------------------------------ *
 * Output
 * ------------------------------------------------------------------ */

const cell = (x) => (x === null || x === undefined ? '—' : String(x));
const pct = (x) => (x === null || x === undefined ? '—' : `${Math.round(x * 100)}%`);

export function toMarkdown(result, opts) {
  const lines = [];
  lines.push('# IADSVille playtest');
  lines.push('');
  lines.push(`${result.meta.runs} runs, ${result.meta.workers} worker(s), `
    + `${result.meta.wallS}s wall, ${result.meta.secondsPerRun}s a run.`);
  const capped = result.runs.filter((r) => r.capHit);
  if (capped.length) {
    lines.push('');
    lines.push(`**${capped.length} run(s) hit the 40 000-tick cap and never finished: `
      + `${capped.map((r) => `${r.mission}/${r.seat}/${r.policy}/${r.seed}`).join(', ')}.** `
      + 'Their figures are provisional.');
  }
  if (opts?.command) lines.push('');
  if (opts?.command) lines.push(`\`${opts.command}\``);
  lines.push('');
  lines.push('| watch | seat | player | n | held | score | med | CV | 1st legal | 1st away'
    + ' | eng% | mag% | holes | worst | dead end | rnds | kills | leak | lost | dir a/r/t |');
  lines.push('|---|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|---|');
  for (const row of result.aggregates.cells) {
    lines.push(`| ${row.mission} | ${row.seat} | ${row.policy} | ${row.n}`
      + ` | ${pct(row.heldRate)} | ${cell(row.meanScore)} | ${cell(row.medianScore)}`
      + ` | ${cell(row.scoreCV)} | ${cell(row.firstLegalShotS)} | ${cell(row.firstLaunchS)}`
      + ` | ${pct(row.engageableShare)} | ${pct(row.magazineOnlyLimiterShare)}`
      + ` | ${cell(row.holeCount)} | ${cell(row.longestHoleS)} | ${cell(row.endAfterLastActionS)}`
      + ` | ${cell(row.rounds)} | ${cell(row.kills)} | ${cell(row.leakers)} | ${cell(row.assetsLost)}`
      + ` | ${cell(row.directives.accepted)}/${cell(row.directives.refused)}/`
      + `${cell(row.directives.timedOut)} |`);
  }
  if (result.aggregates.paired.length) {
    lines.push('');
    lines.push('## Paired, seed by seed');
    lines.push('');
    lines.push('| watch | seat | comparison | n | seeds won | mean Δ% | held |');
    lines.push('|---|---|---|--:|--:|--:|---|');
    for (const row of result.aggregates.paired) {
      lines.push(`| ${row.mission} | ${row.seat} | ${row.comparison} | ${row.n}`
        + ` | ${row.seedsWon} | ${cell(row.meanDeltaPct)} | ${row.heldBetter} vs ${row.heldWorse} |`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

function write(path, text) {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(resolve(path), text);
}

/* ------------------------------------------------------------------ *
 * CLI
 * ------------------------------------------------------------------ */

export function parseCli(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      mission: { type: 'string', default: 'all' },
      seat: { type: 'string', default: 'all' },
      policy: { type: 'string', default: 'competent' },
      seeds: { type: 'string', default: '8' },
      'seed-base': { type: 'string', default: '1' },
      json: { type: 'string' },
      md: { type: 'string' },
      trace: { type: 'string' },
      jobs: { type: 'string', default: '1' },
      quiet: { type: 'boolean', default: false },
      worker: { type: 'boolean', default: false },
    },
    allowPositionals: false,
  });

  const missions = values.mission === 'all' ? MISSION_ORDER : values.mission.split(',');
  const seats = values.seat === 'all' ? SEAT_ORDER : values.seat.split(',');
  const policies = values.policy === 'all' ? POLICY_ORDER : values.policy.split(',');
  for (const seat of seats) {
    if (!SEAT_ORDER.includes(seat)) throw new Error(`no such seat: ${seat}`);
  }
  for (const policy of policies) {
    if (!POLICY_ORDER.includes(policy)) throw new Error(`no such policy: ${policy}`);
  }
  return {
    missions,
    seats,
    policies,
    seeds: Number(values.seeds),
    seedBase: Number(values['seed-base']),
    jobs: Number(values.jobs),
    json: values.json ?? null,
    md: values.md ?? null,
    trace: values.trace ?? null,
    quiet: values.quiet,
  };
}

async function main() {
  const opts = parseCli(process.argv.slice(2));
  const result = await runMatrix({ ...opts, trace: !!opts.trace });
  const command = `node tools/playtest.mjs ${process.argv.slice(2).join(' ')}`;
  const markdown = toMarkdown(result, { command });

  if (opts.json) {
    write(opts.json, `${JSON.stringify({
      meta: result.meta, runs: result.runs, aggregates: result.aggregates,
    }, null, 2)}\n`);
  }
  if (opts.md) write(opts.md, markdown);
  else process.stdout.write(markdown);
  if (opts.trace) write(opts.trace, `${result.traces.map((t) => t.join('\n')).join('\n\n')}\n`);

  process.stderr.write(`\n${result.meta.runs} runs in ${result.meta.wallS}s `
    + `(${result.meta.secondsPerRun}s a run, ${result.meta.workers} worker(s))\n`);
}

if (process.argv.includes('--worker')) {
  process.on('message', (job) => {
    try {
      process.send({ result: playRun(job) });
    } catch (error) {
      process.send({ error: `${job.mission}/${job.seat}/${job.policy}/${job.seed}: ${error.message}` });
    }
  });
} else if (process.argv[1] && resolve(process.argv[1]) === resolve(THIS_FILE)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack}\n`);
    process.exitCode = 1;
  });
}
