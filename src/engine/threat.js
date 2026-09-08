/**
 * Threat evaluation — the sort order of the fight.
 *
 * The player's real enemy is not the raid, it is time. Sixteen contacts, four
 * batteries and ninety seconds means most of the job is deciding what to ignore.
 * This module answers "what is about to hurt me most", and the same numbers feed
 * both the player's sorted track list and the AI battle manager, so the two are
 * never working from different pictures.
 */

import {
  AIR_TYPES, ASSET_TYPES, SAM_TYPES, DETECTION,
} from './config.js';
import {
  dist, timeToGo, len, clamp, clamp01, invLerp, closureRate, absDeltaDeg, bearing,
} from './math.js';
import { inEnvelope, timeToInRangeS } from './weapons.js';
import { channelsFor } from './doctrine.js';

/**
 * Which asset does this track appear to be going for?
 *
 * Overwhelmingly a question about the aircraft's flight path, and only
 * marginally about what the place is worth. Value used to dominate this, which
 * produced a genuinely wrong answer: a contact flying straight down the Kubin
 * road at the district hospital was predicted to be going for the airbase,
 * because the ministry values an airbase at thirty and a hospital at eight.
 *
 * An aeroplane does not know what anything is worth. Closest approach decides
 * it; value only breaks ties between places the track passes equally near.
 * At half a point per point of value that "tiebreak" was still worth over a
 * kilometre of geometry, and on a ray that passes through the hospital and on
 * toward sector operations, a kilometre is the whole question: measured, three
 * quarters of the rounds fired at hospital-bound raiders were billed to
 * whatever stood behind it. Every ledger downstream — the expenditure freeze,
 * the finale's account of what you personally defended — reads this field at
 * the launch instant, so it has to mean what it says.
 *
 * The answer is also sticky. Track velocity is a noisy estimate; re-deciding
 * from scratch every tick made the prediction wander between neighbours and
 * billed a salvo to whichever answer the noise held at release. The incumbent
 * keeps its seat until a challenger beats it by a clear margin of geometry;
 * a genuine course change moves the miss distance by kilometres and unseats
 * it within a couple of seconds.
 */
export function predictedTarget(world, track) {
  let best = null;
  let bestScore = -Infinity;
  const speed = len(track.vel);
  const held = track.predictedAssetId ?? null;

  for (const asset of world.assets) {
    if (asset.destroyed) continue;
    const type = ASSET_TYPES[asset.type];
    const tti = speed > 1e-6 ? timeToGo(track.pos, track.vel, asset.pos) : Infinity;
    if (!Number.isFinite(tti)) continue;
    // Penalise assets the track would have to turn a long way to reach.
    const closest = closestApproachToPoint(track, asset.pos);
    let score = -closest * 12 - tti * 0.04 + type.value * 0.06;
    if (asset.id === held) score += 6;
    if (score > bestScore) { bestScore = score; best = { asset, ttiS: tti, missKm: closest }; }
  }
  /*
   * A winner by default is not a destination. A freshly smoothed velocity can
   * point a track at empty sky, where every asset is receding except one it
   * would "reach" in ninety minutes and miss by fifty kilometres — and that
   * one used to take the field, get remembered, and bill a ledger. If the
   * best answer is not even half-plausible, the honest answer is that this
   * track is not discernibly going anywhere yet.
   */
  if (best && (best.missKm > 60 || best.ttiS > 1500)) return null;
  return best;
}

/** How near will this track pass to a point if it holds its present course? */
export function closestApproachToPoint(track, point) {
  const speed = len(track.vel);
  if (speed < 1e-6) return dist(track.pos, point);
  const tti = timeToGo(track.pos, track.vel, point);
  if (!Number.isFinite(tti)) return dist(track.pos, point);
  const cpa = { x: track.pos.x + track.vel.x * tti, y: track.pos.y + track.vel.y * tti };
  return dist(cpa, point);
}

/**
 * Closest approach between two things that are both moving.
 *
 * The single-point version above is fine for a ground target, which stays where
 * it is. It is useless against an aircraft under lead pursuit, where the
 * fighter is deliberately pointing at empty sky twenty kilometres ahead of what
 * it is chasing and the point-wise miss distance is therefore enormous right up
 * until the launch.
 */
export function closestApproachBetween(track, mover) {
  const rel = { x: mover.pos.x - track.pos.x, y: mover.pos.y - track.pos.y };
  const relVel = { x: (mover.vel?.x ?? 0) - track.vel.x, y: (mover.vel?.y ?? 0) - track.vel.y };
  const speed2 = relVel.x * relVel.x + relVel.y * relVel.y;
  const range = Math.hypot(rel.x, rel.y);
  if (speed2 < 1e-9) return { missKm: range, ttiS: Infinity, rangeKm: range };
  const t = Math.max(0, -(rel.x * relVel.x + rel.y * relVel.y) / speed2);
  const miss = Math.hypot(rel.x + relVel.x * t, rel.y + relVel.y * t);
  return { missKm: miss, ttiS: t, rangeKm: range };
}

/**
 * What a defended place is worth when it has wings.
 *
 * Set just above the palace. On the one watch this applies, sector command's
 * order is "at all cost", and the threat list is where that order becomes a
 * number: a fighter closing on the state aircraft outranks a strike package
 * over the capital, which is exactly the trade the operator has been told to
 * make and exactly the one they may not want to.
 */
const PROTECTED_FLIGHT_VALUE = 82;

/**
 * How badly does this track threaten the aircraft the watch is about?
 *
 * Zero on every other watch in the game, because there is no such aircraft on
 * any of them. Where there is one, it is scored the way a defended place is
 * scored — by how near this contact will pass and how soon — so the same sort
 * order that serves the operator serves the batteries.
 */
/**
 * Is this contact hunting the aircraft, rather than merely airborne near it?
 *
 * `flightThreat` is a continuous number and is non-zero for anything at all
 * while the state aircraft is up, which makes it a sort key and not a fact. A
 * fact is what the console prints and what a player decides on: this contact
 * will pass within twenty-five kilometres of STATE 01, and inside five minutes.
 * Every fighter on the escort watch answers it and nothing else does.
 */
export function huntsTheFlight(world, track) {
  const vip = world.vipAircraft?.();
  if (!vip) return false;
  const cpa = closestApproachBetween(track, vip);
  return Number.isFinite(cpa.ttiS) && cpa.missKm < 25 && cpa.ttiS < 300;
}

/**
 * Seconds until this contact can shoot at the aircraft the watch is about.
 *
 * A DEADLINE IS A DEADLINE, AND ONE OF THEM HAS WINGS. Every battery in the
 * game decides whether to hold for a better shot by asking how long the thing
 * in front of it has before it arrives at what it is going for — and a fighter
 * hunting an aeroplane is going for nothing on the ground, so `ttiS` came back
 * Infinity and every crew in the corridor concluded it had all the time in the
 * world. Measured on the escort watch, sixteen seeds from both seats: an
 * expert crewing the battalion by hand held 9 watches against a competent
 * player's 12, because the model was patiently aiming at fighters that get one
 * pass from twenty kilometres and then leave.
 *
 * The launch range is the fighter's own, out of `AIR_TYPES`, so a contact the
 * picture has not classified yet returns Infinity and nothing changes — you do
 * not get to react to a fighter you have not identified.
 */
export function timeToFlightRelease(world, track) {
  const vip = world.vipAircraft?.();
  if (!vip) return Infinity;
  const releaseKm = AIR_TYPES[track.classification]?.airToAirRangeKm;
  if (!releaseKm) return Infinity;
  const cpa = closestApproachBetween(track, vip);
  if (!Number.isFinite(cpa.ttiS) || cpa.missKm >= releaseKm) return Infinity;
  if (cpa.rangeKm <= releaseKm) return 0;
  // Closing speed along the line, read off the geometry the CPA already has.
  const closing = (cpa.rangeKm - cpa.missKm) / Math.max(cpa.ttiS, 0.1);
  if (closing <= 0) return Infinity;
  return (cpa.rangeKm - releaseKm) / closing;
}

export function flightThreat(world, track) {
  const vip = world.vipAircraft?.();
  if (!vip) return 0;
  const cpa = closestApproachBetween(track, vip);
  if (!Number.isFinite(cpa.ttiS)) return 0;
  const urgency = 1 - clamp01(cpa.ttiS / 240);
  const proximity = 1 - clamp01(cpa.missKm / 45);
  return PROTECTED_FLIGHT_VALUE * (0.35 + urgency * urgency * 2.2) * (0.4 + proximity);
}

/**
 * Threat score. Higher is more urgent.
 *
 * The dominant term is time — a cruise missile ninety seconds from the power
 * station outranks a bomber ten minutes out, every time.
 */
export function threatScore(world, track) {
  if (track.hostility === 'friendly') return 0;
  if (track.quality <= 0) return 0;

  const known = track.classification !== 'unknown' ? AIR_TYPES[track.classification] : null;
  // A REVEALED decoy is plywood: it can hurt nothing, and the entire value of
  // having worked out what it is lies in not spending another second or round
  // on it. It keeps a whisper of score so it stays on the sorted list at all.
  const typeWeight = track.classification === 'decoy' ? 0.02 : known?.threatWeight ?? 1;

  const againstFlight = typeWeight * flightThreat(world, track);

  const prediction = predictedTarget(world, track);
  // Loitering over somebody else's country, but still hostile — and possibly
  // loitering exactly where an aircraft of ours is about to fly.
  if (!prediction) return Math.max(typeWeight * 4, againstFlight);

  const assetType = ASSET_TYPES[prediction.asset.type];
  // Urgency ramps hard inside five minutes and is near-total inside one.
  const urgency = 1 - clamp01(prediction.ttiS / 300);
  const proximity = 1 - clamp01(prediction.missKm / 40);

  let score = Math.max(
    typeWeight * assetType.value * (0.35 + urgency * urgency * 2.2) * (0.4 + proximity),
    againstFlight,
  );

  // A contact already being shot at is less urgent than one nobody has answered.
  if (track.engagedBy.length > 0) score *= 0.35;
  else if (track.assignedTo.length > 0) score *= 0.6;

  // A firm track you cannot classify is worse than one you can: it might be the
  // thing that ruins your day.
  if (track.classification === 'unknown' && track.quality > 0.6) score *= 1.1;

  // Something inside a battery's minimum range or under everyone's floor is a
  // problem you may not be able to solve — surface it loudly.
  if (track.altM < 200) score *= 1.15;

  return score;
}

/**
 * Refresh every track's threat score, and publish where it is going.
 *
 * The threat score itself reads the raw geometry every tick, because the sort
 * order has to react the instant something turns toward a town. The
 * PUBLISHED destination is a different promise and is held to a stricter
 * standard, because it is not a hint — it is a fact the rest of the game
 * acts on. Doctrine stands whole formations down off it when an order
 * excludes a place; the freeze and the border restriction are settled on it;
 * the finale's account of what you personally defended reads it at the launch
 * instant; and the operator is invited to break an order over it.
 *
 * Measured before this gate, over the first two hundred seconds of the two
 * watches where the label is the decision: one hundred and twenty-five label
 * changes across forty-five tracks on Economy of Force, one track changing
 * its mind sixteen times, and a wave-one striker bound for the power station
 * reading camp, bridge, camp, nowhere, camp, bridge inside twenty-five
 * seconds. Two gates fix it and neither invents information. A track with no
 * settled course publishes NOTHING, which is honest and which the code
 * already has a sentence for. And a challenger has to be the better answer
 * for a dwell before it takes the field from the incumbent.
 */
export function scoreAllTracks(world) {
  for (const track of world.tracks.values()) {
    track.threat = threatScore(world, track);
    const prediction = predictedTarget(world, track);
    // The sooner of the two clocks: arrival at whatever place it is going for,
    // and the moment it can shoot at the aircraft this watch is about.
    track.ttiS = Math.min(prediction?.ttiS ?? Infinity, timeToFlightRelease(world, track));
    /*
     * The raw geometric answer, refreshed every tick and never smoothed.
     *
     * Two different questions wear the same words. "Which place is this
     * aeroplane's course pointing at RIGHT NOW" is a kinematic fact and the
     * choosers want it fresh — `threatScore` has always used it that way, and
     * `engagementValue` weighs a shot by what it defends. "Which place is
     * this contact GOING FOR" is a claim the game acts on, and it gets the
     * settled answer below. Keeping the chooser on the settled label was
     * measured and rejected: it re-routed fire enough to leave Economy of
     * Force's crewed battery without a single hostile in its envelope on one
     * seed in three.
     */
    track.headingForAssetId = prediction?.asset.id ?? null;

    const settled = (track.courseSettledS ?? 0) >= DETECTION.courseSettleS;
    if (!settled) {
      /*
       * Before there is a course there is nothing to say, and saying it
       * anyway is what produced camp / bridge / camp / nowhere / camp /
       * bridge in twenty-five seconds. But a wobble in an established track
       * is not new information either — blanking the label every time the
       * estimate twitched would have replaced one flicker with another, and
       * would have starved every consumer that reads it: the freeze
       * accounting, the border stand-down, the ledger the finale reads.
       * An answer already given is kept until a better one earns its place.
       */
      if (!track.predictedAssetId) {
        track.predictedCandidateId = null;
        track.predictedCandidateSinceS = world.t;
      }
      continue;
    }
    const wanted = prediction?.asset.id ?? null;
    if (wanted !== track.predictedCandidateId) {
      track.predictedCandidateId = wanted;
      track.predictedCandidateSinceS = world.t;
    }
    if (wanted === track.predictedAssetId) continue;
    const dwelt = world.t - (track.predictedCandidateSinceS ?? world.t);
    if (dwelt >= DETECTION.predictionDwellS) track.predictedAssetId = wanted;
  }
}

/** Tracks worth showing, most urgent first. */
export function sortedTracks(world) {
  return [...world.tracks.values()].sort((a, b) => b.threat - a.threat);
}

/**
 * Why a battery cannot take a track — in words, for the operator.
 *
 * `engagementValue` answers with a silent null, which is the right interface
 * for the AI and the wrong one for a person: on the first watch of the game
 * the recommended battery could not reach any contact in the mission (their
 * altitude is above its ceiling), assignment printed a cheerful ENGAGING, and
 * the refusal arrived fifteen seconds later as a dim log line. Returns null
 * when the battery CAN engage.
 */
export function cannotEngageReason(world, site, track) {
  if (!site.alive) return 'battery destroyed';
  if (world.commandable && !world.commandable(site.id)) return 'not under your command';
  /*
   * A round is guided by an antenna on the ground, and this function never
   * once looked to see whether the battery still had one. A battalion whose
   * fire-control set was wreckage went on reporting legal shots — to the AI
   * chooser, to the measurement harness, and to the cabin, whose preflight
   * line answered "NO TARGET SELECTED" while the honest answer was that the
   * operator's antennas were scrap. It is checked before the ammunition and
   * the channels because it outranks both: with no guidance there is nothing
   * a full rack could do.
   */
  const fc = world.radarById?.get(site.fcRadarId ?? site.radarId);
  if (fc && !fc.alive) return 'fire control destroyed';
  const type = SAM_TYPES[site.type];
  if (track.altM > type.maxAltM) {
    return `above its ceiling (${Math.round(type.maxAltM / 1000)}km)`;
  }
  if (track.altM < type.minAltM) return `below its floor (${type.minAltM}m)`;
  if (site.readyRounds <= 0) return 'no rounds on the rails';
  if (site.engagements.length >= channelsFor(site)) return 'all channels engaged';
  const toRange = timeToInRangeS(site, track);
  if (toRange === Infinity) return 'will never be in reach';
  // A target the battery could only reach in minutes is not an assignment,
  // it is a bookmark — the crew would sit on the claim while nearer
  // batteries watched "their" track sail past. The horizon scales with the
  // battery's reach: a point-defence section plans forty-five seconds ahead,
  // a long-range battalion is EXPECTED to set up an intercept a minute and a
  // half out, and refusing it that was measured to erase most of what
  // keeping a battalion is worth. NaN is a course not yet established, and
  // that one the crew will take on faith.
  const claimHorizonS = 45 + type.maxRangeKm * 0.4;
  if (Number.isFinite(toRange) && toRange > claimHorizonS) {
    return `out of reach for ${Math.round(toRange)}s`;
  }
  /*
   * NaN is a course not yet established, and the crew will take that on faith
   * — but only inside a band where faith could possibly pay. The guard above
   * is written for a finite answer, so NaN fell straight through to "the shot
   * is legal", and the console, the AI and the measurement harness all
   * believed it: a 42 km section reported a legal shot against a contact
   * 147 km away, and the cabin on Economy of Force was recorded as busy from
   * 90 s on a watch whose first hostile inside its envelope arrived at 526 s
   * or never. Faith reaches as far as the fastest thing on the board could
   * fly inside the battery's own planning horizon, and no further.
   */
  if (Number.isNaN(toRange) && !inEnvelope(site, track.pos, track.altM).ok) {
    const gapKm = dist(site.pos, track.pos) - type.maxRangeKm;
    if (gapKm > claimHorizonS * DETECTION.maxTargetSpeedKmS) {
      return `out of reach at ${Math.round(dist(site.pos, track.pos))}km`;
    }
  }
  return null;
}

/**
 * How good a shot would this site get at this track?
 * Returns null when the site cannot engage at all. Used for assignment by both
 * the AI and the player's "best battery" hint.
 */
export function engagementValue(world, site, track) {
  if (!site.alive || site.weaponsState === 'hold') return null;
  // No antenna to guide with, no shot — the same gate `cannotEngageReason`
  // states in words, because the AI and the console read one picture.
  const guidance = world.radarById?.get(site.fcRadarId ?? site.radarId);
  if (guidance && !guidance.alive) return null;
  if (site.readyRounds <= 0) return null;
  if (site.engagements.length >= channelsFor(site)) return null;

  const type = SAM_TYPES[site.type];
  const env = inEnvelope(site, track.pos, track.altM);
  const rawTimeToRange = env.ok ? 0 : timeToInRangeS(site, track);
  if (rawTimeToRange === Infinity) return null;
  /*
   * NaN means the track's course is not established yet; assume it is worth
   * taking rather than declining a target that has only been seen once — but
   * only inside the same plausible band `cannotEngageReason` keeps faith in,
   * or the chooser routes a battalion onto a contact a hundred kilometres
   * outside its ring and pins the channel there. The two have to agree: the
   * AI and the player's hint are supposed to be reading one picture.
   */
  if (Number.isNaN(rawTimeToRange) && !env.ok) {
    const horizonS = 45 + type.maxRangeKm * 0.4;
    if (dist(site.pos, track.pos) - type.maxRangeKm > horizonS * DETECTION.maxTargetSpeedKmS) {
      return null;
    }
  }
  const timeToRange = Number.isNaN(rawTimeToRange) ? 90 : rawTimeToRange;
  if (track.altM > type.maxAltM || track.altM < type.minAltM) return null;
  // A target opening the range with no shot on the board is not this site's
  // target, whatever it is worth. Claiming it pins the track — measured, a
  // C2-bound striker spent fifty seconds assigned to a battery it was flying
  // away from while the batteries that could reach it had no right to it.
  if (!env.ok && closureRate(track.pos, track.vel, site.pos) < -0.002) return null;

  // Prefer the smallest system that can do the job: spending a long-range round
  // on a light aircraft at 20 km is how you run out before the second wave.
  const overkill = type.maxRangeKm / Math.max(env.rangeKm, 4);
  const sweetness = 1 - clamp01(Math.abs(env.rangeKm - type.maxRangeKm * 0.5) / type.maxRangeKm);

  let value = 100 * sweetness;
  value -= timeToRange * 0.8;          // shots you can take now beat shots you might take

  /*
   * And the seconds the guidance antenna needs to come round, which are
   * exactly as real as the seconds a target needs to fly into range. Without
   * this term the chooser handed battalions targets behind their own mounts
   * and paid a silent traverse for it — measured, an AI net laid over free
   * crews went from adding value to costing eighteen per cent, because the
   * crews only ever self-engaged what was already in front of them. A shot
   * that needs half a minute of slew first is a worse shot, and now says so.
   */
  const fc = world.radarById?.get(site.fcRadarId ?? site.radarId);
  if (fc?.fovDeg) {
    const off = absDeltaDeg(fc.boresightDeg, bearing(fc.pos, track.pos));
    const slewS = Math.max(0, (off - fc.fovDeg / 2) / (fc.slewRateDegPerS || 1));
    value -= slewS * 0.8;
  }
  value -= Math.max(0, overkill - 3) * 6;
  value += site.readyRounds * 0.4;      // spread the load across full racks
  if (!env.ok) value -= 20;

  /*
   * And what the shot is FOR. Two identical firing solutions are not equal
   * when one defends the sector operations centre and the other a bridge —
   * yet this function scored only the shot's sweetness, so every chooser
   * built on it (the AI net, the scripted measurement players, the console's
   * own best-battery hint) routed fire by geometry and let the C2 burn
   * behind a beautiful launch. Measured: SECTOR OPS died in six of six
   * hand-played climax watches. Weighted by the night's own valuation
   * (scoreValue), because that is the arithmetic a defence answers to.
   */
  const heading = track.headingForAssetId ?? track.predictedAssetId;
  const threatened = heading ? world.assetById.get(heading) : null;
  if (threatened && !threatened.destroyed) {
    const assetType = ASSET_TYPES[threatened.type];
    let worth = assetType.scoreValue ?? assetType.value ?? 0;
    // A civilian area's worth to the night is counted in people, not in the
    // structure figure. Measured without this line, the hint priced the town
    // below a depot and value-led play traded the village — double the
    // casualties — for the paperwork buildings.
    if (assetType.civilian) worth = Math.max(worth, 55);
    value += worth * 1.1;
    if (assetType.critical) value += 25;
  }

  /*
   * ...AND THE ONE DEFENDED THING IN THIS GAME WITH WINGS.
   *
   * The block above prices a shot by the place it protects, and a fighter
   * closing on the state aircraft protects no place, so on the one watch whose
   * whole subject is an aeroplane every chooser in the game — the AI net, the
   * cabin, the console's best-battery hint, the measurement players — scored
   * the fighters as bare geometry and preferred a pretty solution on a bomber
   * over the contact about to shoot down the thing the brief calls the only
   * thing that matters. `threatScore` had the number the whole time and
   * nothing that PAIRS a battery to a contact ever read it.
   *
   * Zero on eleven watches of twelve, because `flightThreat` is zero wherever
   * there is no state aircraft, and priced on the same scale as a defended
   * place — `PROTECTED_FLIGHT_VALUE` is set just above the palace on purpose.
   */
  const flight = flightThreat(world, track);
  if (flight > 0) value += flight * 1.1;

  /*
   * Urgency reshapes the whole calculus. With the target's arrival imminent
   * there is no second shot and no luxury of sweetness: the right battery is
   * the closest one that can fire soonest — which is what a crew does by
   * instinct, and what this hint therefore has to say too. Measured before
   * this term: assignment-led play on the climax watch routed terminal cruise
   * missiles to distant sites with prettier geometry and lost the sector
   * operations centre more often than crews left alone.
   */
  if (Number.isFinite(track.ttiS) && track.ttiS < 75) {
    value += 45 * (1 - clamp01(env.rangeKm / type.maxRangeKm));
    value -= timeToRange * 2.2;
  }

  return { value, timeToRangeS: timeToRange, rangeKm: env.rangeKm, inEnvelope: env.ok };
}
