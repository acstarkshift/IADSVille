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
import { dist, timeToGo, len, clamp, clamp01, invLerp } from './math.js';
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
 */
export function predictedTarget(world, track) {
  let best = null;
  let bestScore = -Infinity;
  const speed = len(track.vel);

  for (const asset of world.assets) {
    if (asset.destroyed) continue;
    const type = ASSET_TYPES[asset.type];
    const tti = speed > 1e-6 ? timeToGo(track.pos, track.vel, asset.pos) : Infinity;
    if (!Number.isFinite(tti)) continue;
    // Penalise assets the track would have to turn a long way to reach.
    const closest = closestApproachToPoint(track, asset.pos);
    const score = -closest * 12 - tti * 0.04 + type.value * 0.5;
    if (score > bestScore) { bestScore = score; best = { asset, ttiS: tti, missKm: closest }; }
  }
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
 * Threat score. Higher is more urgent.
 *
 * The dominant term is time — a cruise missile ninety seconds from the power
 * station outranks a bomber ten minutes out, every time.
 */
export function threatScore(world, track) {
  if (track.hostility === 'friendly') return 0;
  if (track.quality <= 0) return 0;

  const known = track.classification !== 'unknown' ? AIR_TYPES[track.classification] : null;
  const typeWeight = known?.threatWeight ?? 1;

  const prediction = predictedTarget(world, track);
  if (!prediction) return typeWeight * 4; // loitering, but still hostile

  const assetType = ASSET_TYPES[prediction.asset.type];
  // Urgency ramps hard inside five minutes and is near-total inside one.
  const urgency = 1 - clamp01(prediction.ttiS / 300);
  const proximity = 1 - clamp01(prediction.missKm / 40);

  let score = typeWeight * assetType.value * (0.35 + urgency * urgency * 2.2) * (0.4 + proximity);

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

  // Prefer the smallest system that can do the job: spending a long-range round
  // on a light aircraft at 20 km is how you run out before the second wave.
  const overkill = type.maxRangeKm / Math.max(env.rangeKm, 4);
  const sweetness = 1 - clamp01(Math.abs(env.rangeKm - type.maxRangeKm * 0.5) / type.maxRangeKm);

  let value = 100 * sweetness;
  value -= timeToRange * 0.8;          // shots you can take now beat shots you might take
  value -= Math.max(0, overkill - 3) * 6;
  value += site.readyRounds * 0.4;      // spread the load across full racks
  if (!env.ok) value -= 20;

  return { value, timeToRangeS: timeToRange, rangeKm: env.rangeKm, inEnvelope: env.ok };
}
