/**
 * Rounds in flight, and what happens when they arrive.
 *
 * This module owns the mechanics — envelopes, guidance, kill probability — but
 * not the decisions. Who shoots at what lives in doctrine.js, so both the AI and
 * the player go through exactly the same rules.
 *
 * The rule that matters most: a surface-to-air round is only as alive as the
 * radar that is guiding it. Shut the radar down to dodge an anti-radiation
 * missile and your own rounds go stupid in mid-air. That single dependency is
 * the game's central dilemma, and it is enforced here in stepMissile().
 */

import { SAM_TYPES, AIR_TYPES, ENGAGEMENT, ARM, DAMAGE, FLIGHT } from './config.js';
import { addEffect } from './damage.js';
import {
  dist, sub, add, scale, bearing, headingVec, turnToward, leadPoint, clamp,
  clamp01, invLerp, lerp, len, absDeltaDeg } from './math.js';

/** Turn rates by round type, degrees per second. */
const TURN_RATE = { sam: 26, arm: 16, strike: 9, aam: 30 };

/**
 * Minimum separation between a moving round and a moving target over one step.
 * Rounds cover ~135 m per step and lethal radius is ~120 m, so checking only the
 * endpoints would let missiles tunnel straight through their targets.
 */
export function closestApproachKm(p0, p1, q0, q1) {
  const r0 = sub(p0, q0);
  const dr = sub(sub(p1, p0), sub(q1, q0));
  const denom = dr.x * dr.x + dr.y * dr.y;
  if (denom < 1e-12) return len(r0);
  const t = clamp01(-(r0.x * dr.x + r0.y * dr.y) / denom);
  return len(add(r0, scale(dr, t)));
}

/**
 * The run a shot taken now expects to fly: the ground distance from the rail to
 * the point where the round and its target will meet.
 *
 * This is the one authoritative number the whole vertical profile is paced
 * against, and it is computed once, at launch. Not the range to where the
 * target is standing — a round fired head-on at a striker meets it well short
 * of that, and a climb paced against the launch range arrives underneath.
 */
export function launchSolution(sitePos, target, missileSpeed) {
  const vel = target.vel ?? (target.hdg != null && target.speed != null
    ? scale(headingVec(target.hdg), target.speed) : null);
  const meetAt = vel ? leadPoint(sitePos, target.pos, vel, missileSpeed) : { ...target.pos };
  return { meetAt: { ...meetAt }, runKm: Math.max(dist(sitePos, meetAt), 0.1) };
}

/** Just the run, for the callers that only want the number. */
export const launchRunKm = (sitePos, target, missileSpeed) =>
  launchSolution(sitePos, target, missileSpeed).runKm;

/** Is `pos` at `altM` a valid engagement for this site right now? */
export function inEnvelope(site, pos, altM) {
  const type = SAM_TYPES[site.type];
  const r = dist(site.pos, pos);
  if (!site.alive) return { ok: false, reason: 'SITE DOWN', rangeKm: r };
  if (r > type.maxRangeKm) return { ok: false, reason: 'OUT OF RANGE', rangeKm: r };
  if (r < type.minRangeKm) return { ok: false, reason: 'TOO CLOSE', rangeKm: r };
  if (altM > type.maxAltM) return { ok: false, reason: 'TOO HIGH', rangeKm: r };
  if (altM < type.minAltM) return { ok: false, reason: 'TOO LOW', rangeKm: r };
  return { ok: true, reason: 'IN ENVELOPE', rangeKm: r };
}

/**
 * Seconds until a track enters this site's envelope, for the launch-acceptability
 * readout on the operator console. Infinity means it never will on this course.
 */
export function timeToInRangeS(site, track, horizonS = 600) {
  const type = SAM_TYPES[site.type];
  if (inEnvelope(site, track.pos, track.altM).ok) return 0;

  // A track detected once has no velocity estimate yet. That is "we do not know",
  // not "it will never get here" — answering Infinity here would have batteries
  // abandoning fresh assignments a few seconds after receiving them.
  const speed = len(track.vel);
  if (speed < 1e-6) return NaN;

  // Walk the track forward on its current course. Cheap, and honest about the
  // fact that a manoeuvring target invalidates the answer anyway.
  const stepS = 2;
  for (let t = stepS; t <= horizonS; t += stepS) {
    const p = add(track.pos, scale(track.vel, t));
    const r = dist(site.pos, p);
    if (r <= type.maxRangeKm && r >= type.minRangeKm) return t;
    if (r > type.maxRangeKm && t > stepS && r > dist(site.pos, add(track.pos, scale(track.vel, t - stepS)))) {
      return Infinity; // opening, and it was never going to get inside
    }
  }
  return Infinity;
}

/**
 * Kill probability for one surface-to-air round at the moment of intercept.
 *
 * Every term is a lever the player can pull: shoot inside the sweet spot, shoot
 * before the target is defensive, keep the radar up, and don't waste long-range
 * rounds on cruise missiles.
 */
export function computeSamPk(site, target, missile, difficulty) {
  const type = SAM_TYPES[site.type];
  let pk = type.pkBase * (difficulty?.friendlyPkMult ?? 1);

  /*
   * Geometry: where the round was fired from, and where it caught up.
   *
   * These were two separate multipliers and they were charged one after the
   * other, which double-billed a single fact. A shot taken at the edge of the
   * envelope usually intercepts near the edge too — the two terms are
   * measuring the same bad geometry, and multiplying them took a medium
   * battery's realised kill probability from a stated 0.70 to a measured
   * 0.367 across five watches. Four independent terms each shaving a fifth,
   * none of them obviously wrong on its own, is how a battery ends up needing
   * three rounds a kill while its data plate claims seven in ten.
   *
   * A shot is now as bad as its worst aspect rather than the product of its
   * aspects. Launch discipline still bites — firing from the edge caps the
   * shot however nicely it converges, which is the whole craft of the
   * assignment — but it is no longer charged twice.
   */
  const r = dist(site.pos, target.pos);
  const sweet = type.maxRangeKm * ENGAGEMENT.sweetSpotFraction;
  let geometry = 1;
  if (r > sweet) {
    geometry = Math.min(geometry,
      lerp(1, ENGAGEMENT.edgeRangePk, invLerp(sweet, type.maxRangeKm, r)));
  }
  if (missile?.launchRangeKm > sweet) {
    geometry = Math.min(geometry,
      lerp(1, ENGAGEMENT.edgeLaunchPk, invLerp(sweet, type.maxRangeKm, missile.launchRangeKm)));
  }
  if (r < type.minRangeKm * 1.6) {
    // Snapped off inside the minimum range: the round has no time to settle.
    geometry = Math.min(geometry,
      lerp(ENGAGEMENT.edgeRangePk, 1, invLerp(type.minRangeKm, type.minRangeKm * 1.6, r)));
  }
  pk *= geometry;

  /*
   * Altitude: engaging down low is genuinely hard — but it was a cliff, not a
   * slope. A target at 251 metres paid nothing and one at 249 paid the full
   * penalty, and the band was the same 250 metres for a point-defence section
   * built for low work as for a battalion built for high. It is now a slope,
   * from the system's own floor up to a band scaled to that floor.
   */
  const lowBand = Math.max(type.minAltM * 3, 200);
  if (target.altM < lowBand) {
    pk *= lerp(ENGAGEMENT.lowAltPk, 1, invLerp(type.minAltM, lowBand, target.altM));
  }

  const airType = AIR_TYPES[target.type];
  if (airType) {
    if (target.evadingUntilS > (target.worldTimeS ?? 0)) pk *= airType.evadeFactor;
    if (airType.rcs < 0.5) pk *= ENGAGEMENT.smallTargetPk;
  }

  // The round is only as good as the radar behind it.
  if (missile?.unguidedS > 0) pk *= ENGAGEMENT.unguidedPk;

  return clamp01(pk);
}

/**
 * Kill probability for an anti-radiation round against a radar.
 *
 * Shut down early and it mostly misses. Shut down late and it still has a good
 * chance — it flies to where the radar was, and radars are not small.
 */
export function computeArmPk(radar, missile, difficulty) {
  const mult = difficulty?.armAccuracyMult ?? 1;
  if (radar.state === 'radiating') return clamp01(ARM.pkEmitting * mult);
  const darkFor = missile.targetDarkS ?? 0;
  const pk = darkFor >= ARM.earlyShutdownS ? ARM.pkShutdownEarly : ARM.pkMemory;
  return clamp01(pk * mult);
}

/**
 * Build a round. The caller supplies the sequence number, because id counters
 * belong to a world rather than to this module — two worlds running in the same
 * process (a test comparing seeds, say) must not share a counter, or they stop
 * being reproducible.
 */
export function createMissile(spec) {
  return {
    id: `msl${spec.seq}`,
    seq: spec.seq,
    kind: spec.kind,                 // 'sam' | 'arm' | 'strike'
    pos: { ...spec.pos },
    altM: spec.altM ?? 0,
    speed: spec.speed,
    hdg: spec.hdg ?? 0,
    targetKind: spec.targetKind,     // 'aircraft' | 'radar' | 'asset'
    targetId: spec.targetId,
    siteId: spec.siteId ?? null,
    radarId: spec.radarId ?? null,
    shooterId: spec.shooterId ?? null,
    trackId: spec.trackId ?? null,
    tofS: 0,
    maxFlightS: spec.maxFlightS ?? ENGAGEMENT.maxFlightS,
    unguidedS: 0,
    targetDarkS: 0,
    /** Last commanded aim point, kept so an unguided round flies on stupidly. */
    aimPos: { ...spec.pos },
    alive: true,
    trail: [],
    /**
     * What the picture would call this, if the picture can hold it.
     *
     * Set only on the enemy's rounds — an anti-radiation round or a released
     * weapon — because those are the two things in the air that the operator
     * can be given a chance to shoot at. Our own rounds are not targets and
     * carry nothing here, which is also what keeps them off the scope's
     * track list.
     */
    contactType: spec.contactType ?? null,
    rcs: spec.contactType ? AIR_TYPES[spec.contactType].rcs : null,
    /** Height it came off the aircraft at, for the descent along its run. */
    launchAltM: spec.altM ?? 0,
    runKm: null,
    /** Ground distance actually flown, which is what the climb is flown along. */
    flownKm: 0,
    /**
     * Has anybody ever given this round an aim point?
     *
     * Until they have, `aimPos` is still the round's own launcher — which is
     * why a round that has never been guided crawls around its own rail rather
     * than flying on — and the flight tests read this so that they measure the
     * salvo gap on rounds that are actually being steered.
     */
    hadSolution: false,
    /**
     * How much of the run is behind it, for the climb — see arcAltitude. Kept
     * on the round rather than recomputed because it is not allowed to go
     * backwards: a target that turns away must not pull the round back up.
     */
    arcF: 0,
  };
}

/** Resolve where the round should be steering this instant. */
function aimPointFor(world, missile) {
  if (missile.targetKind === 'aircraft') {
    const target = world.aircraftById.get(missile.targetId);
    if (!target || !target.alive) return null;

    if (missile.kind === 'sam') {
      const radar = world.radarById.get(missile.radarId);
      const site = world.siteById.get(missile.siteId);
      /*
       * The round is only as good as the antenna behind it — and an antenna
       * on a limited mount has to still be pointing at the target. A crew
       * that slews away to answer something else drops what it was guiding,
       * which is exactly the trade a hundred-and-twenty-degree arc imposes.
       */
      const inArc = !radar?.fovDeg
        || absDeltaDeg(radar.boresightDeg, bearing(radar.pos, target.pos)) <= radar.fovDeg / 2;
      const guided = radar && radar.state === 'radiating' && inArc && site && site.alive;
      if (!guided) {
        missile.unguidedS += world.dt;
        return missile.aimPos; // fly on, blind
      }
      missile.unguidedS = 0;
      missile.hadSolution = true;
      return leadPoint(missile.pos, target.pos, target.vel, missile.speed);
    }
    missile.hadSolution = true;
    return leadPoint(missile.pos, target.pos, target.vel, missile.speed);
  }

  /*
   * One of ours, chasing one of theirs. Guided by the same antenna under the
   * same rules as any other shot — a crew that goes dark drops this round too.
   */
  if (missile.targetKind === 'missile') {
    const target = world.missiles.find((m) => m.id === missile.targetId);
    if (!target || !target.alive) return null;
    const radar = world.radarById.get(missile.radarId);
    const site = world.siteById.get(missile.siteId);
    const inArc = !radar?.fovDeg
      || absDeltaDeg(radar.boresightDeg, bearing(radar.pos, target.pos)) <= radar.fovDeg / 2;
    if (!(radar && radar.state === 'radiating' && inArc && site && site.alive)) {
      missile.unguidedS += world.dt;
      return missile.aimPos;
    }
    missile.unguidedS = 0;
    missile.hadSolution = true;
    return leadPoint(missile.pos, target.pos, scale(headingVec(target.hdg), target.speed), missile.speed);
  }

  if (missile.targetKind === 'radar') {
    const radar = world.radarById.get(missile.targetId);
    if (!radar || !radar.alive) return null;
    if (radar.state === 'radiating') {
      missile.targetDarkS = 0;
      missile.aimPos = { ...radar.pos };
    } else {
      // Home-on-memory: it keeps flying to the last place the radar shouted from,
      // with a growing aim error the longer that was ago.
      missile.targetDarkS += world.dt;
    }
    return missile.aimPos;
  }

  const asset = world.assetById.get(missile.targetId);
  if (!asset || asset.destroyed) return null;
  // A released weapon flies to its briefed coordinates and cannot be retasked.
  return missile.briefedPos ?? asset.pos;
}

/**
 * Where one of our rounds is in the vertical, this instant.
 *
 * The old answer was that it was wherever the aeroplane was: the round left the
 * rail at twenty metres and slid onto the target's height within about three
 * seconds, then held that height all the way in. On the cabin's height
 * indicator that read as a flat line crossing the board at nine thousand
 * metres, which is not how anything flies.
 *
 * A round now climbs along its run, and how it climbs depends on the class of
 * battery that fired it — a lofted arc for a battalion's long shot, a straight
 * climbing line for a point-defence round, a flat one for a shell. FLIGHT in
 * config.js holds the three numbers per class and explains them. The shape is a
 * climb along the straight line from the rail to the intercept, plus a half
 * sine bent so its top lands where the profile puts the apex; the sine is zero
 * at both ends, so the round leaves the rail on the line and arrives on it.
 *
 * The intercept reads this height as well as the ground plane — see
 * `resolveIntercept` and ENGAGEMENT.verticalLethalMult — so what the operator
 * is shown and what the night comes to are the same arithmetic.
 */
function arcAltitude(world, missile, targetAlt) {
  const site = missile.siteId ? world.siteById.get(missile.siteId) : null;
  const profile = FLIGHT[SAM_TYPES[site?.type]?.class] ?? FLIGHT.short;

  /*
   * The run is measured once, at launch, from the range the shot was taken at
   * — `launchSalvo` stamps it — and progress along it never goes backwards. A
   * target that turns away extends the cruise; it does not haul the round back
   * up into the climb it has already flown.
   *
   * It used to be measured lazily here instead, from the round's own aim
   * point, and that was wrong in one ordinary case with a spectacular result.
   * A round that is unguided on its very first step — the mount still slewing,
   * or the crew ducking an anti-radiation round, which is the trade the whole
   * game is built on — has an aim point that is still its own launch position,
   * so the run latched at one step of travel, a tenth of a kilometre. `arcF`
   * was then pinned at zero for the rest of the flight and the round flew the
   * whole engagement at rail height, twenty metres, under the horizon line the
   * cabin's own indicator prints, at a target seven kilometres up. It happened
   * to 3.8% of every round fired and those rounds still killed.
   *
   * So the run is stamped at launch, and progress along it is measured by the
   * ground the round has actually covered rather than by how far it still is
   * from an aim point that may be stale, may be its own launch position, or may
   * have walked away from it. A round that has flown its run is at the height
   * its target is at and cruises there; a round that has flown none of it is on
   * the rail. Neither depends on anybody guiding it.
   */
  if (missile.runKm == null) {
    const toGo = dist(missile.pos, missile.aimPos);
    if (missile.unguidedS > 0) return missile.altM;
    missile.runKm = Math.max(toGo, 0.1);
  }
  missile.arcF = Math.max(missile.arcF ?? 0, clamp01(missile.flownKm / missile.runKm));
  const f = missile.arcF;

  const line = missile.launchAltM
    + (targetAlt - missile.launchAltM) * Math.pow(f, profile.climbBias);
  let wanted = line;
  if (profile.loftFraction) {
    // sin(pi * f^k) peaks where f^k is a half, so this k puts the top of the
    // arc exactly at the profile's apex.
    const k = Math.log(0.5) / Math.log(profile.apexAt);
    wanted += missile.runKm * profile.loftFraction * 1000
      * Math.sin(Math.PI * Math.pow(f, k));
  }
  wanted = clamp(wanted, 0, FLIGHT.ceilingM);

  /*
   * Held to an angle a missile can actually fly. The round covers `travelled`
   * metres of ground this step; the slopes are the tangent of the steepest
   * flight path it is allowed to be on while doing it. This is what keeps a
   * long shot's opening climb from outrunning the round's own speed.
   */
  const travelled = missile.speed * 1000 * world.dt;
  return clamp(wanted,
    missile.altM - travelled * FLIGHT.maxDiveSlope,
    missile.altM + travelled * FLIGHT.maxClimbSlope);
}

/** Move one round and resolve any intercept it achieves this step. */
function stepMissile(world, missile, dt) {
  const aim = aimPointFor(world, missile);
  if (!aim) {
    // Target gone before arrival: the round has nothing to hit.
    world.killMissile(missile, 'target gone');
    return;
  }
  missile.aimPos = aim;

  const desired = bearing(missile.pos, aim);
  // Rounds against a fixed point stop flying a turn-limited course once they are
  // close, for the same reason a cruise missile does: a turn radius larger than
  // the lethal radius lets a round orbit what it is supposed to hit.
  const terminal = missile.targetKind !== 'aircraft' && dist(missile.pos, aim) < 3;
  missile.hdg = terminal
    ? desired
    : turnToward(missile.hdg, desired, TURN_RATE[missile.kind] * dt);

  const before = { ...missile.pos };
  const step = scale(headingVec(missile.hdg), missile.speed * dt);
  missile.pos = add(missile.pos, step);
  missile.flownKm += missile.speed * dt;
  missile.tofS += dt;

  /*
   * Altitude.
   *
   * Two cases, and they are different problems.
   *
   * The enemy's rounds — a released weapon, an anti-radiation missile — descend
   * along their run, from the height they came off the aircraft at to the
   * height of what they are aimed at. This used to be a fast exponential onto
   * the target's height, which for anything aimed at the ground put the round
   * at zero metres within a couple of seconds of release. That was harmless
   * while rounds were invisible. Once the enemy's could be tracked and shot at
   * it was the whole game: a weapon at zero metres is under every radar horizon
   * on the board, so it could never be held, never announced and never
   * engaged. Descending along the run is both what one does and what gives the
   * defence the twenty or thirty seconds the idea needs.
   *
   * Ours climb, which is arcAltitude above.
   */
  /*
   * The height it is trying to reach. A round shot at another round used to
   * find nothing in the aircraft list and fall back to its own height, so a gun
   * section defending itself against a weapon coming down on it fired shells
   * that stayed at twenty metres the whole way. It looks its target up in the
   * right list now.
   */
  const targetAlt = missile.targetKind === 'aircraft'
    ? (world.aircraftById.get(missile.targetId)?.altM ?? missile.altM)
    : missile.targetKind === 'missile'
      ? (world.missiles.find((m) => m.id === missile.targetId)?.altM ?? missile.altM)
      : 0;
  if (missile.contactType) {
    /*
     * Distance still to run, against the distance the run started at. The
     * point it is running to is the briefed one for a released weapon and the
     * radar's position for an anti-radiation round — `aimPos` starts life as
     * the launch point, which would make the descent a no-op.
     */
    const goingTo = missile.briefedPos ?? missile.aimPos;
    const toGo = dist(missile.pos, goingTo);
    missile.runKm = missile.runKm ?? Math.max(toGo, 0.1);
    const fraction = clamp01(1 - toGo / missile.runKm);
    missile.altM = missile.launchAltM + (targetAlt - missile.launchAltM) * fraction;
  } else {
    missile.altM = arcAltitude(world, missile, targetAlt);
  }

  missile.trail.push({ x: before.x, y: before.y, t: world.t });
  if (missile.trail.length > 40) missile.trail.shift();

  // A round that has been blind too long is written off rather than left to
  // wander the map forever.
  if (missile.kind === 'sam' && missile.unguidedS > ENGAGEMENT.unguidedGraceS * 2.4) {
    world.killMissile(missile, 'guidance lost');
    world.log('warn', `${missile.trackLabel ?? 'ROUND'} LOST — NO GUIDANCE`, { missileId: missile.id });
    return;
  }
  if (missile.tofS > missile.maxFlightS) {
    world.killMissile(missile, 'timed out');
    return;
  }

  resolveIntercept(world, missile, before);
}

/**
 * How far off its target's height a round may be and still have its fuze see
 * anything — and whether this round is inside that.
 *
 * The horizontal miss distance is computed along the two segments both objects
 * flew this step, which is the right arithmetic for a closing geometry. The
 * vertical one does not need that: a round and an aeroplane a kilometre apart
 * in height at the closest point of approach were a kilometre apart the whole
 * step. Returns null when the round is close enough, or the signed separation
 * in metres when it is not.
 */
function verticalMiss(missile, targetAltM) {
  const lethal = (missile.kind === 'arm' ? ARM.lethalRadiusKm : ENGAGEMENT.lethalRadiusKm)
    * 1000 * ENGAGEMENT.verticalLethalMult;
  const dz = (missile.altM ?? 0) - (targetAltM ?? 0);
  return Math.abs(dz) > lethal ? dz : null;
}

/** Check for arrival and, if it arrived, roll for effect. */
function resolveIntercept(world, missile, prevPos) {
  const lethal = missile.kind === 'arm' ? ARM.lethalRadiusKm : ENGAGEMENT.lethalRadiusKm;

  if (missile.targetKind === 'aircraft') {
    const target = world.aircraftById.get(missile.targetId);
    if (!target || !target.alive) return;
    const prevTarget = sub(target.pos, scale(target.vel, world.dt));
    const miss = closestApproachKm(prevPos, missile.pos, prevTarget, target.pos);
    if (miss > Math.max(lethal, 0.35)) return;

    /*
     * Over the ground, and not at the height. A steep close shot runs out of
     * climb slope — FLIGHT.maxClimbSlope is honest and should stay — and
     * arrives underneath the aeroplane it was fired at. It does not get to
     * destroy it from there: the round goes past, and the cabin's height
     * indicator, which drew both of them, is telling the truth about why.
     */
    const dz = verticalMiss(missile, target.altM);
    if (dz != null) {
      const site = world.siteById.get(missile.siteId);
      world.killMissile(missile, 'passed by');
      world.log('warn', `${missile.trackLabel ?? 'TRACK'} — MISS`, { trackId: missile.trackId });
      if (site) {
        world.comms(site.name, `NO JOY ON ${missile.trackLabel ?? 'THAT TRACK'} — WE WENT ${dz < 0 ? 'UNDER' : 'OVER'} IT.`,
          { siteId: site.id, trackId: missile.trackId });
      }
      addEffect(world, { kind: 'puff', pos: { ...missile.pos }, durationS: 1.8 });
      world.onMissileMiss(target, missile);
      return;
    }

    const site = world.siteById.get(missile.siteId);
    // An air-to-air round has no battery behind it and no envelope to be at the
    // edge of; it is simply fired from a fighter at close range.
    const evading = target.evadingUntilS > (target.worldTimeS ?? 0);
    const pk = missile.kind === 'aam'
      ? clamp01((missile.pk ?? AIR_TYPES.interceptor.airToAirPk)
        * (evading ? AIR_TYPES[target.type]?.evadeFactor ?? 1 : 1)
        * (world.difficulty?.enemyPkMult ?? 1))
      : site ? computeSamPk(site, target, missile, world.difficulty) : 0.3;
    world.killMissile(missile, 'detonated');

    if (world.rng.chance(pk)) {
      world.killAircraft(target, missile);
    } else {
      // 'warn', not 'info': the miss is the game's shoot-again decision point,
      // and it used to render in the dimmest colour the log has and make no
      // sound at all.
      world.log('warn', `${missile.trackLabel ?? 'TRACK'} — MISS`, { trackId: missile.trackId });
      if (site) {
        world.comms(site.name, `NO JOY ON ${missile.trackLabel ?? 'THAT TRACK'}.`,
          { siteId: site.id, trackId: missile.trackId });
      }
      // And it gets a pixel: the round detonating wide, a puff that dissipates
      // where the dot used to be. Misses outnumber kills on the hard watches;
      // the majority outcome cannot be the absence of a pixel.
      addEffect(world, { kind: 'puff', pos: { ...missile.pos }, durationS: 1.8 });
      world.onMissileMiss(target, missile);
    }
    return;
  }

  /*
   * Shooting down one of theirs. Harder than an aircraft and honestly so: the
   * thing is a fraction of the size, it is quick, and there is no second
   * attempt — but it is the only counter to a round already in the air, and a
   * gun section sited where the weapons come down earns its place doing it.
   */
  if (missile.targetKind === 'missile') {
    const target = world.missiles.find((m) => m.id === missile.targetId);
    if (!target || !target.alive) return;
    const prevTarget = sub(target.pos, scale(headingVec(target.hdg), target.speed * world.dt));
    const miss = closestApproachKm(prevPos, missile.pos, prevTarget, target.pos);
    if (miss > Math.max(lethal, 0.35)) return;
    if (verticalMiss(missile, target.altM) != null) {
      world.killMissile(missile, 'passed by');
      world.log('warn', `${missile.trackLabel ?? 'ROUND'} — MISS`, { trackId: missile.trackId });
      addEffect(world, { kind: 'puff', pos: { ...missile.pos }, durationS: 1.8 });
      return;
    }

    const site = world.siteById.get(missile.siteId);
    world.killMissile(missile, 'detonated');
    const pk = site
      ? computeSamPk(site, { pos: target.pos, altM: target.altM, type: target.contactType },
        missile, world.difficulty) * ENGAGEMENT.versusRoundPk
      : 0.2;
    if (world.rng.chance(pk)) {
      world.killMissile(target, 'intercepted');
      world.markTracksDown(target.id);
      world.stats.roundsIntercepted = (world.stats.roundsIntercepted ?? 0) + 1;
      const label = AIR_TYPES[target.contactType]?.label ?? 'ROUND';
      world.log('good', `${label} DESTROYED IN FLIGHT — ${missile.trackLabel ?? ''}`.trim(),
        { severity: 'good', missileId: target.id });
      if (site) {
        world.comms(site.name, 'SPLASH — ROUND KILLED IN THE AIR.',
          { urgent: true, siteId: site.id });
      }
      addEffect(world, { kind: 'flash', magnitude: 0.3, durationS: 0.5 });
    } else {
      world.log('warn', `${missile.trackLabel ?? 'ROUND'} — MISS`, { trackId: missile.trackId });
      addEffect(world, { kind: 'puff', pos: { ...missile.pos }, durationS: 1.8 });
    }
    return;
  }

  if (missile.targetKind === 'radar') {
    const radar = world.radarById.get(missile.targetId);
    if (!radar || !radar.alive) return;
    const miss = closestApproachKm(prevPos, missile.pos, radar.pos, radar.pos);
    if (miss > lethal) return;
    world.killMissile(missile, 'detonated');
    const pk = computeArmPk(radar, missile, world.difficulty);
    if (world.rng.chance(pk)) {
      world.damageRadar(radar, ARM.damage, 'anti-radiation hit');
    } else {
      world.onArmMiss(radar, missile, miss);
    }
    return;
  }

  const asset = world.assetById.get(missile.targetId);
  if (!asset || asset.destroyed) return;

  // Detonate at the briefed point regardless; hurt the asset only if it is
  // still standing there.
  const aim = missile.briefedPos ?? asset.pos;
  const arrived = closestApproachKm(prevPos, missile.pos, aim, aim);
  if (arrived > 0.45) return;
  world.killMissile(missile, 'impact');
  if (dist(missile.pos, asset.pos) <= 0.75) {
    world.damageAsset(asset, missile.damage ?? AIR_TYPES.striker.weaponDamage, missile);
  } else {
    world.log('good', `WEAPONS IMPACT — ${asset.label} NOT AT BRIEFED POSITION`, { assetId: asset.id });
  }
}

/**
 * Let go of any round of a salvo whose turn on the rail has come.
 *
 * A salvo used to be two rounds created on the same step at the same point on
 * the same heading, with the gap between them modelled as a negative
 * time-of-flight counter. They therefore occupied the same pixel for the whole
 * flight — measured over twenty-four watches, 225,003 samples of two rounds of
 * one salvo alive together and not one of them separated on the ground by more
 * than fifty metres — and both renderers skipped a round whose counter was
 * still negative, so for two and a half seconds after every salvo the console
 * was showing one round while two were in the air.
 *
 * Now the later rounds wait on the rail. The store was debited when the order
 * was given, so a battery that is destroyed or displaces before its second
 * round goes gets it back rather than firing it from a wreck.
 */
function releaseRailQueue(world) {
  if (!world.railQueue?.length) return;
  const held = [];
  for (const entry of world.railQueue) {
    if (world.t < entry.atS) { held.push(entry); continue; }
    const site = world.siteById.get(entry.missile.siteId);
    if (!site || !site.alive || site.scootRemainingS > 0) {
      // Back on the rack: the rail never fired.
      if (site) site.readyRounds++;
      world.stats.roundsFired = Math.max(0, world.stats.roundsFired - 1);
      continue;
    }
    const target = entry.targetKind === 'missile'
      ? world.missiles.find((m) => m.id === entry.missile.targetId)
      : world.aircraftById.get(entry.missile.targetId);
    const missile = entry.missile;
    missile.pos = { ...site.pos };
    missile.aimPos = target && target.alive ? { ...target.pos } : { ...site.pos };
    /*
     * A round whose target died while it was waiting still leaves the rail —
     * the order was given, the rail was committed and the store was debited at
     * the order. It is written off on its first step as 'target gone', which is
     * what it did before the gap was modelled, and the expenditure it cost is
     * the expenditure a two-round salvo has always cost.
     */
    if (target && target.alive) {
      missile.hdg = bearing(site.pos, target.pos);
      missile.launchRangeKm = dist(site.pos, target.pos);
      missile.runKm = Math.max(missile.launchRangeKm, 0.1);
    }
    world.missiles.push(missile);
  }
  world.railQueue = held;
}

/** Advance every round in flight. */
export function stepMissiles(world, dt) {
  releaseRailQueue(world);
  for (const missile of world.missiles) {
    if (missile.alive) stepMissile(world, missile, dt);
  }
  world.missiles = world.missiles.filter((m) => m.alive);
}

/**
 * Put rounds in the air against a track. Returns the number actually launched,
 * which can be fewer than requested when the ready rack runs dry mid-salvo.
 */
export function launchSalvo(world, site, track, count, origin = null) {
  const type = SAM_TYPES[site.type];
  const target = world.truthOf(track);
  if (!target || !target.alive) return 0;

  let launched = 0;
  for (let i = 0; i < count; i++) {
    if (site.readyRounds <= 0) break;
    site.readyRounds--;
    launched++;

    const missile = createMissile({
      seq: world.nextMissileSeq(),
      kind: 'sam',
      pos: site.pos,
      altM: 20,
      speed: type.missileSpeed,
      hdg: bearing(site.pos, target.pos),
      targetKind: target.contactType ? 'missile' : 'aircraft',
      targetId: target.id,
      siteId: site.id,
      radarId: site.fcRadarId ?? site.radarId,
      trackId: track.id,
    });
    missile.trackLabel = track.tn;
    // The geometry the shot was TAKEN at, for the launch-discipline Pk term.
    // Intercept range alone forgives an edge launch against a closing target.
    missile.launchRangeKm = dist(site.pos, target.pos);
    /*
     * And the run the climb is flown along, stamped here rather than latched on
     * the first step — see arcAltitude for what the lazy version cost. It is
     * the distance to the INTERCEPT, not to where the target is standing now:
     * a round fired head-on at a striker meets it well short of its launch
     * range, and a climb paced against the launch range arrives underneath.
     */
    const solution = launchSolution(site.pos, target, type.missileSpeed);
    missile.runKm = solution.runKm;
    if (i === 0) {
      world.missiles.push(missile);
    } else {
      // The second round of a salvo waits its turn on the rail, and leaves it
      // as a second dot. See releaseRailQueue.
      world.railQueue.push({
        atS: world.t + i * type.salvoGapS,
        targetKind: missile.targetKind,
        missile,
      });
    }
    world.stats.roundsFired++;
    if (!track.engagedBy.includes(missile.id)) track.engagedBy.push(missile.id);
  }

  if (launched > 0) {
    // A round in flight names its type differently from an aircraft; every
    // type-table lookup below goes through the same normalisation.
    const targetType = AIR_TYPES[target.contactType ?? target.type];
    world.log('launch', `${site.name} — ${launched} AWAY ON ${track.tn}`, {
      siteId: site.id, trackId: track.id,
    });
    world.comms(site.name, launched > 1
      ? `MISSILES AWAY, ${launched} ROUNDS ON ${track.tn}.`
      : `MISSILE AWAY ON ${track.tn}.`, { urgent: true, siteId: site.id, trackId: track.id });
    // The rail flares on the scope — see drawMissiles. Cosmetic.
    addEffect(world, { kind: 'launchflash', pos: { ...site.pos }, durationS: 0.5 });
    /*
     * And in the cabin, the launch is a physical event. Only the battery the
     * player is actually sitting in shakes their console — a rail going off
     * three sectors away is a line on the net, not a jolt through the floor.
     */
    if (world.control.crewedBatteryId === site.id) {
      addEffect(world, { kind: 'shake', magnitude: 0.35, durationS: 0.9 });
    }
    /*
     * Whether this launch can break the target's nerve depends on how good a
     * shot it actually was. A snap launch from the very edge of the envelope
     * reads as a light in the sky, not a death sentence — the pilot evades and
     * presses on. Estimated with the same Pk arithmetic the intercept will use,
     * at the launch geometry.
     */
    const launchQuality = computeSamPk(site,
      { pos: target.pos, altM: target.altM, type: target.contactType ?? target.type,
        evadingUntilS: target.evadingUntilS, worldTimeS: target.worldTimeS },
      { launchRangeKm: dist(site.pos, target.pos) }, world.difficulty);
    world.warnTargetOfLaunch(target, launchQuality >= ENGAGEMENT.crediblePk);
    // Bill the salvo to the engagement's purpose — the prediction that
    // justified the decision — not to wherever the noisy track estimate has
    // wandered by the release instant. A stamp still empty (the track's course
    // was not established when the engagement began) takes the best answer
    // available now.
    const engagement = site.engagements.find((e) => e.trackId === track.id);
    if (engagement && engagement.purposeAssetId == null) {
      engagement.purposeAssetId = track.predictedAssetId ?? null;
    }
    world.registerRoundsSpent(track, launched, origin, engagement?.purposeAssetId);
    // Firing on the state aircraft is recorded whether or not it works. The act
    // is the fire order, not the result of it.
    if (targetType?.isVip) world.registerVipFires(site, launched);
  }
  return launched;
}

/**
 * A fighter shoots at another aircraft.
 *
 * The only air-to-air engagement in the game, and it reuses the whole rest of
 * the missile pipeline — the round is guided by nothing on the ground, so
 * blinking a radar does not save the aircraft it is chasing.
 */
export function launchAirToAir(world, shooter, target) {
  const type = AIR_TYPES[shooter.type];
  const missile = createMissile({
    seq: world.nextMissileSeq(),
    kind: 'aam',
    pos: shooter.pos,
    altM: shooter.altM,
    speed: 0.85,
    hdg: bearing(shooter.pos, target.pos),
    targetKind: 'aircraft',
    targetId: target.id,
    shooterId: shooter.id,
    maxFlightS: 90,
  });
  missile.pk = type.airToAirPk;
  missile.trackLabel = target.name;
  world.missiles.push(missile);
  shooter.airToAirLeft--;
  world.warnTargetOfLaunch(target);
  world.log('alert', `${shooter.name} — LAUNCH ON ${target.name}`, { severity: 'high' });
  return missile;
}

/** An anti-radiation round leaves a suppression aircraft. */
export function launchArm(world, shooter, radar) {
  const missile = createMissile({
    seq: world.nextMissileSeq(),
    kind: 'arm',
    pos: shooter.pos,
    altM: shooter.altM,
    speed: ARM.speed,
    hdg: bearing(shooter.pos, radar.pos),
    targetKind: 'radar',
    targetId: radar.id,
    shooterId: shooter.id,
    maxFlightS: ARM.maxFlightS,
    contactType: 'arm',
  });
  missile.aimPos = { ...radar.pos };
  world.missiles.push(missile);
  shooter.armsLeft--;
  world.stats.armsIncoming++;
  world.onArmLaunch(radar, missile, shooter);
  return missile;
}

/**
 * A striker releases on its assigned asset — or, more precisely, on the point it
 * was briefed to attack. Weapons are given that point and fly to it.
 */
export function releaseWeapons(world, aircraft, asset, aimPoint = null) {
  const type = AIR_TYPES[aircraft.type];
  const count = Math.max(1, aircraft.weaponsLeft);
  for (let i = 0; i < count; i++) {
    const aim = aimPoint ?? asset.pos;
    const missile = createMissile({
      seq: world.nextMissileSeq(),
      kind: 'strike',
      pos: aircraft.pos,
      altM: aircraft.altM,
      speed: 0.31,
      hdg: bearing(aircraft.pos, aim),
      targetKind: 'asset',
      targetId: asset.id,
      shooterId: aircraft.id,
      maxFlightS: 140,
      contactType: 'glide',
    });
    missile.damage = type.weaponDamage;
    missile.briefedPos = { ...aim };
    world.missiles.push(missile);
  }
  aircraft.weaponsLeft = 0;
  aircraft.released = true;
  world.registerLeaker(aircraft, asset);
  world.log('alert', `${asset.label} — WEAPONS RELEASE DETECTED`, { assetId: asset.id });
}
