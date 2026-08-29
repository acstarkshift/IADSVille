/**
 * Radar physics and the track picture.
 *
 * Two ideas carry the whole module:
 *
 *  1. A radar only learns about a target when its beam sweeps past that target's
 *     bearing. Tracks therefore update in steps at the scan rate, not smoothly,
 *     and a fast mover can cross a lot of ground between looks. This is why a
 *     twelve-second early-warning scan feels so different from a three-second
 *     point-defence scan.
 *
 *  2. Individual radar plots are worthless until something correlates them into
 *     numbered tracks. That correlation is the "integrated" in integrated air
 *     defence — and it runs in the sector operations centre, so it is the first
 *     thing the raid takes away from you.
 */

import { DETECTION, AIR_TYPES } from './config.js';
import {
  bearing, dist, radarHorizonKm, absDeltaDeg, sweptPast, clamp, clamp01,
  wrapDeg, sub, scale, add, len, norm,
} from './math.js';

/** Radars only see the air breathers and cruise missiles; ARMs are too small and too fast. */
const DETECTABLE = new Set(['striker', 'cruise', 'sead', 'jammer', 'decoy', 'civil']);

/**
 * Nominal detection range for one radar against one target, after RCS scaling,
 * jamming, battle damage and the radio horizon.
 *
 * Returns the effective range in km. Zero means "cannot see it at all from here",
 * which is what a dead scope sector or a horizon-masked low flier produces.
 */
export function effectiveRangeKm(radar, target, jammers = []) {
  const az = bearing(radar.pos, target.pos);

  // A wedge burned out by battle damage is simply blind.
  for (const sector of radar.deadSectors || []) {
    if (absDeltaDeg(sector.az, az) <= sector.halfWidthDeg) return 0;
  }

  // Radar cross-section scales range as the fourth root: small helps, but less
  // than people expect. A tenth of the RCS is a bit over half the range.
  let range = radar.rangeKm * Math.pow(Math.max(target.rcs, 1e-4), 0.25);

  // Battle damage raises the noise floor across the board.
  range *= radar.noiseFactor ?? 1;

  for (const jammer of jammers) {
    const jamAz = bearing(radar.pos, jammer.pos);
    const jamDistKm = dist(radar.pos, jammer.pos);
    const type = AIR_TYPES.jammer;
    if (absDeltaDeg(jamAz, az) <= type.lobeHalfWidthDeg) {
      // Main lobe: the radar is looking straight into the noise and only sees
      // inside its burnthrough range. Push the jammer back and burnthrough grows.
      const burnThrough = type.burnThroughAt100Km * (jamDistKm / 100);
      range = Math.min(range, burnThrough);
    } else {
      // Sidelobes: everything gets a little worse everywhere.
      range *= type.sidelobeFactor;
    }
  }

  // Nothing beats the horizon. This is the low-altitude ingress in one line.
  const horizon = radarHorizonKm(radar.heightM, target.altM);
  return Math.max(0, Math.min(range, horizon));
}

/**
 * Probability of a detection on a single scan.
 *
 * s = (Reff/r)^4 is the signal-to-noise ratio relative to the threshold, and
 * Pd = s/(1+s) turns that into a smooth curve: 50% exactly at nominal range,
 * ~94% at 70% of it, ~6% at 140% of it.
 */
export function detectionProbability(effRangeKm, rangeKm, targetAltM) {
  if (effRangeKm <= 0 || rangeKm <= 0) return 0;
  const s = Math.pow(effRangeKm / rangeKm, DETECTION.pdExponent);
  let pd = s / (1 + s);

  // Ground clutter: down low and far out, the return competes with the terrain.
  if (targetAltM < DETECTION.clutterAltM && rangeKm > effRangeKm * DETECTION.clutterOnsetFraction) {
    const depth = clamp01(targetAltM / DETECTION.clutterAltM);
    pd *= DETECTION.clutterPenalty + (1 - DETECTION.clutterPenalty) * depth;
  }
  return clamp01(pd);
}

/** Radars that are actually radiating right now. */
export function radiating(radar) {
  return radar.alive && radar.state === 'radiating';
}

/**
 * Advance a radar's emission state machine. Warmup is why EMCON is a decision
 * rather than a reflex: coming back up is not instant, so blinking to dodge an
 * anti-radiation round costs you the next several seconds of picture too.
 */
export function stepRadarPower(radar, dt) {
  if (!radar.alive) {
    radar.state = 'off';
    return;
  }
  if (radar.rebootRemainingS > 0) {
    radar.rebootRemainingS = Math.max(0, radar.rebootRemainingS - dt);
    radar.state = 'off';
    return;
  }
  if (radar.on) {
    if (radar.state === 'off' || radar.state === 'cooling') {
      radar.state = 'warming';
      radar.warmRemainingS = radar.warmupS;
    }
    if (radar.state === 'warming') {
      radar.warmRemainingS -= dt;
      if (radar.warmRemainingS <= 0) {
        radar.state = 'radiating';
        radar.warmRemainingS = 0;
      }
    }
  } else if (radar.state !== 'off') {
    radar.state = 'off';
    radar.warmRemainingS = 0;
  }

  if (radar.state === 'radiating') {
    radar.emitS += dt;
    // ELINT exposure builds while radiating and fades slowly when dark: a set
    // that came up for ten seconds once is not as pinned as one that has been
    // radiating all morning.
    radar.exposure = Math.min(1, radar.exposure + dt * 0.0055 * radar.elintGain);
  } else {
    radar.exposure = Math.max(0, radar.exposure - dt * 0.0035);
  }
}

/**
 * Sweep one radar for dt seconds and return the plots it produced.
 * A target is rolled exactly once per beam crossing, which is what makes track
 * updates arrive at the scan rate.
 */
export function sweepRadar(radar, targets, jammers, rng, dt) {
  const plots = [];
  if (!radiating(radar)) return plots;

  const az0 = radar.az;
  const degrees = (360 / radar.scanPeriodS) * dt;
  radar.az = wrapDeg(az0 + degrees);
  const az1 = radar.az;

  for (const target of targets) {
    if (!target.alive || !DETECTABLE.has(target.type)) continue;

    const az = bearing(radar.pos, target.pos);
    if (!sweptPast(az0, az1, az)) continue;

    const r = dist(radar.pos, target.pos);
    if (r < (radar.minRangeKm ?? 0.5)) continue; // overhead cone of silence

    const eff = effectiveRangeKm(radar, target, jammers);
    const pd = detectionProbability(eff, r, target.altM);
    if (!rng.chance(pd)) continue;

    // Measurement error grows with range: a plot at 200 km is a smudge.
    const sigma = 0.12 + r * 0.004;
    plots.push({
      radarId: radar.id,
      truthId: target.id,
      pos: { x: target.pos.x + rng.gauss(0, sigma), y: target.pos.y + rng.gauss(0, sigma) },
      altM: Math.max(0, target.altM + rng.gauss(0, 60 + r * 1.5)),
      rangeKm: r,
      strength: clamp01(eff / Math.max(r, 1e-3) - 0.4),
    });
  }
  return plots;
}

/** A fresh track built from a first plot. */
function newTrack(world, plot, truth) {
  const tn = world.nextTn++;
  return {
    id: `trk${tn}`,
    tn: `T-${String(tn).padStart(3, '0')}`,
    pos: { ...plot.pos },
    vel: { x: 0, y: 0 },
    altM: plot.altM,
    quality: DETECTION.qualityGain,
    firstSeenS: world.t,
    lastUpdateS: world.t,
    sources: [plot.radarId],
    truthId: plot.truthId,
    /** What the operator is allowed to know, as opposed to what is true. */
    classification: 'unknown',
    idProgressS: 0,
    hostility: 'pending',
    assignedTo: [],
    engagedBy: [],
    threat: 0,
    coasting: false,
    /** Set once the track has ever been firm, for the "it was here" ghost. */
    everFirm: false,
  };
}

/**
 * Fold this tick's plots into the track picture.
 *
 * With the sector operations centre alive, plots from every radar correlate into
 * a single track per aircraft. With it gone, a plot can only join a track its own
 * radar already contributed to — so the same aircraft grows a separate track
 * number on every radar that can see it, and nobody reconciles them. That is
 * what losing fusion feels like from the scope: the raid appears to triple.
 */
export function correlatePlots(world, plots) {
  const fused = world.fusionOnline;
  const radius = fused ? DETECTION.correlationRadiusKm : DETECTION.degradedCorrelationRadiusKm;

  for (const plot of plots) {
    let best = null;
    let bestDist = radius;

    for (const track of world.tracks.values()) {
      if (!fused && !track.sources.includes(plot.radarId)) continue;
      // Correlate against where the track is predicted to be right now.
      const d = dist(track.pos, plot.pos);
      if (d < bestDist) {
        bestDist = d;
        best = track;
      }
    }

    if (!best) {
      const track = newTrack(world, plot);
      world.tracks.set(track.id, track);
      continue;
    }

    const dtSince = Math.max(0.1, world.t - best.lastUpdateS);
    const measuredVel = scale(sub(plot.pos, best.pos), 1 / dtSince);

    // Alpha-beta smoothing: trust the new plot for position, blend for velocity.
    best.pos = { x: plot.pos.x, y: plot.pos.y };
    best.vel = {
      x: best.vel.x + (measuredVel.x - best.vel.x) * 0.45,
      y: best.vel.y + (measuredVel.y - best.vel.y) * 0.45,
    };
    best.altM = best.altM + (plot.altM - best.altM) * 0.5;
    best.quality = clamp01(best.quality + DETECTION.qualityGain);
    best.lastUpdateS = world.t;
    best.coasting = false;
    if (best.truthId !== plot.truthId && fused) {
      // Two aircraft flying formation can swap which one owns the track; the
      // operator never sees this, but it keeps the truth link honest.
      best.truthId = plot.truthId;
    }
    if (!best.sources.includes(plot.radarId)) best.sources.push(plot.radarId);
    if (best.quality >= DETECTION.firmQuality) best.everFirm = true;
  }
}

/**
 * Age every track: decay quality, dead-reckon the ones that have gone quiet,
 * drop the ones that are gone, and advance identification on the ones being held.
 */
export function ageTracks(world, dt) {
  for (const [id, track] of world.tracks) {
    const since = world.t - track.lastUpdateS;

    if (since > 0.01) {
      track.quality = Math.max(0, track.quality - DETECTION.qualityDecayPerS * dt);
    }

    if (since > DETECTION.coastAfterS) {
      track.coasting = true;
      // Dead reckoning: the symbol keeps flying the last known course, and is
      // wrong in exactly the way that gets operators killed.
      track.pos = add(track.pos, scale(track.vel, dt));
    }

    if (since > DETECTION.dropAfterS || track.quality <= 0) {
      world.dropTrack(id, since > DETECTION.dropAfterS ? 'lost' : 'faded');
      continue;
    }

    advanceIdentification(world, track, dt);
  }
}

/**
 * Identification resolves with sustained, good-quality observation — which is
 * exactly the thing the enemy is trying to deny you. Until it resolves you have
 * kinematics and a guess.
 */
function advanceIdentification(world, track, dt) {
  if (track.quality < DETECTION.firmQuality) return;
  const truth = world.aircraftById.get(track.truthId);
  if (!truth) return;

  const type = AIR_TYPES[truth.type];
  const speedMult = type.idSpeedMult ?? 1;
  track.idProgressS += dt * speedMult * (world.fusionOnline ? 1 : 0.55);

  if (track.hostility === 'pending' && track.idProgressS > DETECTION.idTimeS * 0.4) {
    // Identification friend or foe: co-operative traffic answers, everyone else
    // is assumed hostile because of where they are and what they are doing.
    track.hostility = type.friendly ? 'friendly' : 'hostile';
  }

  if (track.idProgressS < DETECTION.idTimeS) return;

  if (truth.type === 'decoy') {
    // A decoy is built to read as a striker and it does — right up until it is
    // close enough that its impossibly steady flight gives it away.
    const rangeToCentre = len(track.pos);
    track.classification = rangeToCentre < AIR_TYPES.decoy.tellRangeKm ? 'decoy' : 'striker';
  } else {
    track.classification = truth.type;
  }
}

/** Kinematic shorthand shown before identification resolves: "LOW/FAST". */
export function trackProfile(track) {
  const band = track.altM < 500 ? 'LOW' : track.altM < 4000 ? 'MED' : 'HIGH';
  const speedKts = len(track.vel) * 1943.8;
  const pace = speedKts > 520 ? 'FAST' : speedKts > 300 ? 'MED' : 'SLOW';
  return `${band}/${pace}`;
}

/** Bearing and range of a track from a point, formatted for a readout. */
export function trackBRA(track, from = { x: 0, y: 0 }) {
  return {
    bearing: Math.round(bearing(from, track.pos)),
    rangeKm: dist(from, track.pos),
    altM: track.altM,
    speedKts: len(track.vel) * 1943.8,
    headingDeg: len(track.vel) > 1e-6 ? Math.round(bearing({ x: 0, y: 0 }, track.vel)) : 0,
  };
}

/**
 * Run every radar for one step and update the picture.
 * Returns the plots generated, which the UI uses to paint fresh paint on the scope.
 */
export function stepDetection(world, dt) {
  const jammers = world.aircraft.filter((a) => a.alive && a.type === 'jammer' && a.jamming);
  const allPlots = [];

  for (const radar of world.radars) {
    stepRadarPower(radar, dt);
    const plots = sweepRadar(radar, world.aircraft, jammers, world.rng, dt);
    for (const p of plots) allPlots.push(p);
  }

  correlatePlots(world, allPlots);
  ageTracks(world, dt);
  return allPlots;
}
