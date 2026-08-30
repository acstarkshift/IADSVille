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

import { SAM_TYPES, AIR_TYPES, ENGAGEMENT, ARM, DAMAGE } from './config.js';
import { addEffect } from './damage.js';
import {
  dist, sub, add, scale, bearing, headingVec, turnToward, leadPoint, clamp,
  clamp01, invLerp, lerp, len,
} from './math.js';

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

  // Range: full value out to the sweet spot, decaying to the envelope edge.
  const r = dist(site.pos, target.pos);
  const sweet = type.maxRangeKm * ENGAGEMENT.sweetSpotFraction;
  if (r > sweet) {
    pk *= lerp(1, ENGAGEMENT.edgeRangePk, invLerp(sweet, type.maxRangeKm, r));
  }

  // Launch discipline: a round fired at the edge of the envelope pays for it
  // at intercept whatever the target did in between — no energy left, worst
  // opening basket. This is the term that makes holding for a proper shot a
  // skill rather than a superstition.
  if (missile?.launchRangeKm > sweet) {
    pk *= lerp(1, ENGAGEMENT.edgeLaunchPk,
      invLerp(sweet, type.maxRangeKm, missile.launchRangeKm));
  }
  if (r < type.minRangeKm * 1.6) {
    // Snapped off inside the minimum range: the round has no time to settle.
    pk *= lerp(ENGAGEMENT.edgeRangePk, 1, invLerp(type.minRangeKm, type.minRangeKm * 1.6, r));
  }

  // Altitude: engaging down low is genuinely hard.
  if (target.altM < Math.max(type.minAltM * 2, 250)) {
    pk *= ENGAGEMENT.lowAltPk;
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
      const guided = radar && radar.state === 'radiating' && site && site.alive;
      if (!guided) {
        missile.unguidedS += world.dt;
        return missile.aimPos; // fly on, blind
      }
      missile.unguidedS = 0;
      return leadPoint(missile.pos, target.pos, target.vel, missile.speed);
    }
    return leadPoint(missile.pos, target.pos, target.vel, missile.speed);
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
  missile.tofS += dt;

  // Altitude is cosmetic for the round itself but drives the side-view display.
  const targetAlt = missile.targetKind === 'aircraft'
    ? (world.aircraftById.get(missile.targetId)?.altM ?? missile.altM)
    : 0;
  missile.altM += (targetAlt - missile.altM) * clamp01(dt * 0.6);

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

/** Check for arrival and, if it arrived, roll for effect. */
function resolveIntercept(world, missile, prevPos) {
  const lethal = missile.kind === 'arm' ? ARM.lethalRadiusKm : ENGAGEMENT.lethalRadiusKm;

  if (missile.targetKind === 'aircraft') {
    const target = world.aircraftById.get(missile.targetId);
    if (!target || !target.alive) return;
    const prevTarget = sub(target.pos, scale(target.vel, world.dt));
    const miss = closestApproachKm(prevPos, missile.pos, prevTarget, target.pos);
    if (miss > Math.max(lethal, 0.35)) return;

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

/** Advance every round in flight. */
export function stepMissiles(world, dt) {
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
  const target = world.aircraftById.get(track.truthId);
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
      targetKind: 'aircraft',
      targetId: target.id,
      siteId: site.id,
      radarId: site.radarId,
      trackId: track.id,
    });
    missile.trackLabel = track.tn;
    // The geometry the shot was TAKEN at, for the launch-discipline Pk term.
    // Intercept range alone forgives an edge launch against a closing target.
    missile.launchRangeKm = dist(site.pos, target.pos);
    // Rounds of a salvo leave the rail a couple of seconds apart; modelling that
    // as a small time-of-flight offset is enough for the display and the timing.
    missile.tofS = -i * type.salvoGapS;
    world.missiles.push(missile);
    world.stats.roundsFired++;
    if (!track.engagedBy.includes(missile.id)) track.engagedBy.push(missile.id);
  }

  if (launched > 0) {
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
      addEffect(world, { kind: 'shake', magnitude: 0.75, durationS: 0.9 });
    }
    /*
     * Whether this launch can break the target's nerve depends on how good a
     * shot it actually was. A snap launch from the very edge of the envelope
     * reads as a light in the sky, not a death sentence — the pilot evades and
     * presses on. Estimated with the same Pk arithmetic the intercept will use,
     * at the launch geometry.
     */
    const launchQuality = computeSamPk(site, target,
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
    if (AIR_TYPES[target.type].isVip) world.registerVipFires(site, launched);
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
