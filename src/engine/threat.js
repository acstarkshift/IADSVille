/**
 * Threat evaluation — the sort order of the fight.
 *
 * The player's real enemy is not the raid, it is time. Sixteen contacts, four
 * batteries and ninety seconds means most of the job is deciding what to ignore.
 * This module answers "what is about to hurt me most", and the same numbers feed
 * both the player's sorted track list and the AI battle manager, so the two are
 * never working from different pictures.
 */

import { AIR_TYPES, ASSET_TYPES, SAM_TYPES } from './config.js';
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
function flightThreat(world, track) {
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

/** Refresh every track's threat score. Called once per tick. */
export function scoreAllTracks(world) {
  for (const track of world.tracks.values()) {
    track.threat = threatScore(world, track);
    const prediction = predictedTarget(world, track);
    track.predictedAssetId = prediction?.asset.id ?? null;
    track.ttiS = prediction?.ttiS ?? Infinity;
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
  return null;
}

/**
 * How good a shot would this site get at this track?
 * Returns null when the site cannot engage at all. Used for assignment by both
 * the AI and the player's "best battery" hint.
 */
export function engagementValue(world, site, track) {
  if (!site.alive || site.weaponsState === 'hold') return null;
  if (site.readyRounds <= 0) return null;
  if (site.engagements.length >= channelsFor(site)) return null;

  const type = SAM_TYPES[site.type];
  const env = inEnvelope(site, track.pos, track.altM);
  const rawTimeToRange = env.ok ? 0 : timeToInRangeS(site, track);
  if (rawTimeToRange === Infinity) return null;
  // NaN means the track's course is not established yet; assume it is worth
  // taking rather than declining a target that has only been seen once.
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
  const threatened = track.predictedAssetId ? world.assetById.get(track.predictedAssetId) : null;
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
