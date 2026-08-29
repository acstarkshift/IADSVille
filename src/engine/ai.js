/**
 * How the raid behaves.
 *
 * The attackers are not a stream of targets flying at a wall. Each type is
 * solving its own problem, and the player's job is to work out which problem
 * each contact is solving before it finishes:
 *
 *   striker  wants to reach a release point and go home
 *   cruise   is the weapon, and simply arrives
 *   sead     wants your radars to be radiating, and punishes them when they are
 *   jammer   wants to stand where it ruins the picture and stay out of reach
 *   decoy    wants to be shot at
 *   civil    wants to be somewhere else entirely, and doesn't know any of this
 *
 * The most important behaviour here is the abort. A striker that turns for home
 * because a round went past its nose never bombs anything — a miss can still win
 * the fight, and the player should be able to feel that.
 */

import { AIR_TYPES, SIM, ARM } from './config.js';
import {
  bearing, dist, add, scale, headingVec, turnToward, norm, sub, len, wrapDeg,
  clamp, polar,
} from './math.js';
import { launchArm, releaseWeapons } from './weapons.js';

/** Callsigns give the log some texture: "RAID 04 TURNING BACK" reads better than an id. */
function callsign(type, n) {
  const prefix = {
    striker: 'RAID', cruise: 'VAMPIRE', sead: 'WEASEL',
    jammer: 'SHROUD', decoy: 'GHOST', civil: 'TRANSIT',
  }[type] ?? 'UNKNOWN';
  return `${prefix} ${String(n).padStart(2, '0')}`;
}

/** As with rounds, the sequence number comes from the world that owns it. */
export function createAircraft(spec) {
  const type = AIR_TYPES[spec.type];
  const n = spec.seq;
  return {
    id: `air${n}`,
    seq: n,
    type: spec.type,
    name: spec.name ?? callsign(spec.type, n),
    pos: { ...spec.pos },
    altM: spec.altM ?? type.cruiseAltM,
    hdg: spec.hdg ?? 0,
    speed: spec.speed ?? type.speed,
    vel: { x: 0, y: 0 },
    rcs: spec.rcs ?? type.rcs,
    alive: true,
    exited: false,
    state: spec.state ?? 'ingress',
    targetAssetId: spec.targetAssetId ?? null,
    weaponsLeft: type.weapons,
    released: false,
    aborted: false,
    damaged: false,
    armsLeft: type.arms ?? 0,
    lastArmS: -999,
    jamming: false,
    evadingUntilS: -1,
    threatenedAtS: -999,
    spawnS: spec.spawnS ?? 0,
    lifeS: 0,
    /** Seconds of observed emission per radar, for the suppression aircraft. */
    elint: new Map(),
    /** Orbit bookkeeping for jammers. */
    orbitCentre: spec.orbitCentre ?? null,
    orbitPhase: spec.orbitPhase ?? 0,
    waypoints: spec.waypoints ?? [],
    /**
     * Where the target was when this sortie was planned.
     *
     * A strike package flies to a grid reference, not to a live feed. If the
     * thing it was briefed on has moved by the time it arrives, it puts its
     * weapons on an empty field — which is the entire reason a battery
     * displaces, and the reason displacing is a real way to save yourself.
     */
    briefedPos: spec.briefedPos ? { ...spec.briefedPos } : null,
    /** Mirrored each tick so Pk calculations can see the clock. */
    worldTimeS: 0,
  };
}

/** Steer toward a point and advance. Everything airborne moves through here. */
function flyToward(aircraft, point, dt, speedMult = 1) {
  const type = AIR_TYPES[aircraft.type];
  const desired = bearing(aircraft.pos, point);
  aircraft.hdg = turnToward(aircraft.hdg, desired, type.turnRate * dt);
  advance(aircraft, dt, speedMult);
}

function advance(aircraft, dt, speedMult = 1) {
  const speed = aircraft.speed * speedMult * (aircraft.damaged ? 0.78 : 1);
  const h = headingVec(aircraft.hdg);
  aircraft.vel = scale(h, speed);
  aircraft.pos = add(aircraft.pos, scale(aircraft.vel, dt));
}

/** Head for the nearest map edge on the outbound side and leave. */
function egress(aircraft, dt) {
  const out = len(aircraft.pos) < 1e-3
    ? headingVec(aircraft.hdg)
    : norm(aircraft.pos);
  const exitPoint = scale(out, SIM.worldRadiusKm + 40);
  flyToward(aircraft, exitPoint, dt, 1.08); // running home is worth a little extra
}

/**
 * React to being shot at.
 *
 * Two separate things happen: the aircraft goes defensive (which cuts the
 * incoming round's kill probability), and it decides whether the mission is
 * still worth it. Nerve is finite, and a striker that loses it is out of the
 * fight for good.
 */
function handleThreat(world, aircraft, dt) {
  const type = AIR_TYPES[aircraft.type];
  const justThreatened = world.t - aircraft.threatenedAtS < 0.2;
  if (!justThreatened) return;

  if (type.evadeDurationS > 0) {
    aircraft.evadingUntilS = world.t + type.evadeDurationS;
  }

  if (aircraft.aborted || aircraft.released || aircraft.state === 'egress') return;

  // Nerve is tested once per engagement, not once per round. Otherwise a battery
  // could break a formation by firing single rounds at it from out of range.
  if (world.t - (aircraft.lastResolveRollS ?? -999) < 25) return;
  aircraft.lastResolveRollS = world.t;

  if (!world.rng.chance(type.resolve)) {
    aircraft.aborted = true;
    aircraft.state = 'egress';
    aircraft.weaponsLeft = 0;
    world.stats.abortedSorties++;
    world.log('good', `${aircraft.name} — TURNING BACK`, { aircraftId: aircraft.id });
  }
}

/** A defensive aircraft beams the threat rather than flying a straight line. */
function evasiveStep(world, aircraft, dt) {
  const threat = world.nearestThreatTo(aircraft);
  if (!threat) return false;
  const toThreat = bearing(aircraft.pos, threat.pos);
  // Beam: put the threat on the wing, which is where the geometry hurts it most.
  // Which wing is fixed per aircraft so the manoeuvre is stable and reproducible.
  const beamHdg = wrapDeg(toThreat + (aircraft.seq % 2 ? 90 : -90));
  const type = AIR_TYPES[aircraft.type];
  aircraft.hdg = turnToward(aircraft.hdg, beamHdg, type.turnRate * dt);
  advance(aircraft, dt);
  return true;
}

function stepStriker(world, aircraft, dt) {
  const type = AIR_TYPES[aircraft.type];
  const asset = world.assetById.get(aircraft.targetAssetId);

  if (aircraft.state === 'egress' || !asset || asset.destroyed) {
    if (aircraft.state !== 'egress' && asset?.destroyed) {
      // Its target is already rubble; it goes home rather than re-attacking.
      aircraft.state = 'egress';
      aircraft.weaponsLeft = 0;
    }
    egress(aircraft, dt);
    return;
  }

  if (aircraft.evadingUntilS > world.t && evasiveStep(world, aircraft, dt)) return;

  // Navigate to the briefed point. Nobody re-plans a sortie in the air.
  const aim = aircraft.briefedPos ?? asset.pos;
  const range = dist(aircraft.pos, aim);
  if (range <= type.releaseRangeKm && aircraft.weaponsLeft > 0) {
    releaseWeapons(world, aircraft, asset, aim);
    aircraft.state = 'egress';
    return;
  }
  flyToward(aircraft, aim, dt);
}

function stepCruise(world, aircraft, dt) {
  const asset = world.assetById.get(aircraft.targetAssetId);
  if (!asset || asset.destroyed) {
    // Re-target rather than fly into an empty field — these are programmed for
    // the target set, not for a single building.
    const next = world.pickAssetForRaid(aircraft.pos);
    if (!next) { egress(aircraft, dt); return; }
    aircraft.targetAssetId = next.id;
    // Re-targeting is instant; it does not cost the round a tick of flight.
  }
  /*
   * Terminal dive.
   *
   * A cruise missile turns at four degrees a second, which is a turn radius of
   * about three and a half kilometres — larger than the radius at which it
   * counts as having arrived. One that overshoots by a few hundred metres can
   * therefore enter a stable orbit around its own target and fly it forever.
   * Inside five kilometres it stops flying a turn-rate-limited course and points
   * itself at the target, which is both what actually happens and what stops the
   * simulation waiting on an aircraft that will never land.
   */
  const aim = aircraft.briefedPos ?? asset.pos;
  const range = dist(aircraft.pos, aim);
  if (range < 5) {
    aircraft.hdg = bearing(aircraft.pos, aim);
    advance(aircraft, dt);
  } else {
    flyToward(aircraft, aim, dt);
  }

  // It detonates where it was sent. Whether the target is still there is a
  // separate question, and one the missile is in no position to ask.
  if (dist(aircraft.pos, aim) < 0.6 && dist(aircraft.pos, asset.pos) < 0.9) {
    world.damageAsset(asset, AIR_TYPES.cruise.weaponDamage, aircraft);
    aircraft.alive = false;
    aircraft.impacted = true;
    world.log('alert', `${asset.label} — IMPACT`, { assetId: asset.id });
  } else if (dist(aircraft.pos, aim) < 0.6) {
    aircraft.alive = false;
    aircraft.impacted = true;
    world.log('good', 'VAMPIRE IMPACT — EMPTY GROUND', { aircraftId: aircraft.id });
  }
}

/**
 * Suppression aircraft. It listens first: a radar has to be radiating long
 * enough for a firing solution, which is precisely why blinking works and why
 * leaving the early-warning radar up all mission does not.
 */
function stepSead(world, aircraft, dt) {
  const type = AIR_TYPES.sead;

  for (const radar of world.radars) {
    if (!radar.alive || radar.state !== 'radiating') continue;
    const d = dist(aircraft.pos, radar.pos);
    if (d > 220) continue;
    const gain = radar.elintGain * (1 - clamp(d / 260, 0, 0.85));
    aircraft.elint.set(radar.id, (aircraft.elint.get(radar.id) ?? 0) + dt * gain);
  }

  if (aircraft.evadingUntilS > world.t && evasiveStep(world, aircraft, dt)) return;

  if (aircraft.armsLeft <= 0 || aircraft.state === 'egress') {
    aircraft.state = 'egress';
    egress(aircraft, dt);
    return;
  }

  // Pick the juiciest emitter it has a solution on: exposure, then reach — but
  // deconflicted. A package that puts every round onto the same early-warning
  // set wastes most of them, so a radar already under attack is heavily
  // discounted and the flight spreads across the sector's emitters instead.
  let best = null;
  let bestScore = -Infinity;
  for (const radar of world.radars) {
    if (!radar.alive) continue;
    const heard = aircraft.elint.get(radar.id) ?? 0;
    if (heard < type.elintNeededS) continue;
    const d = dist(aircraft.pos, radar.pos);
    const alreadyTargeted = world.missiles.some(
      (m) => m.alive && m.kind === 'arm' && m.targetId === radar.id);
    const score = radar.elintGain * 10 - d * 0.08
      + (radar.state === 'radiating' ? 25 : 0)
      - (alreadyTargeted ? 60 : 0);
    if (score > bestScore) { bestScore = score; best = radar; }
  }

  if (!best) {
    // Nothing worth shooting yet: hold at standoff and keep listening.
    const loiter = polar(world.centre, bearing(world.centre, aircraft.pos), type.standoffKm);
    flyToward(aircraft, loiter, dt);
    return;
  }

  const d = dist(aircraft.pos, best.pos);
  if (d <= type.armRangeKm && world.t - aircraft.lastArmS > 14) {
    launchArm(world, aircraft, best);
    aircraft.lastArmS = world.t;
    if (aircraft.armsLeft <= 0) aircraft.state = 'egress';
    return;
  }
  // Close only to the edge of its own reach. Driving deeper buys nothing and
  // puts it inside the envelope of the battery it is trying to kill.
  const standoff = Math.min(type.armRangeKm * 0.94, d);
  flyToward(aircraft, polar(best.pos, bearing(best.pos, aircraft.pos), standoff), dt);
}

function stepJammer(world, aircraft, dt) {
  const type = AIR_TYPES.jammer;

  if (aircraft.evadingUntilS > world.t || aircraft.aborted) {
    aircraft.jamming = false;
    aircraft.state = 'egress';
    egress(aircraft, dt);
    return;
  }

  if (!aircraft.orbitCentre) {
    aircraft.orbitCentre = polar(world.centre, bearing(world.centre, aircraft.pos), type.orbitKm);
  }

  // A jammer screens a raid. With the raid spent it has no reason to loiter
  // over hostile ground, and it is far too expensive to lose for nothing.
  const raidStillRunning = world.pendingWaves.length > 0 || world.aircraft.some(
    (a) => a.alive && a !== aircraft && a.type !== 'civil' && a.type !== 'jammer' && a.state !== 'egress');
  if (!raidStillRunning && aircraft.lifeS > 90) {
    aircraft.jamming = false;
    aircraft.state = 'egress';
    egress(aircraft, dt);
    return;
  }

  const toStation = dist(aircraft.pos, aircraft.orbitCentre);
  if (toStation > 18) {
    flyToward(aircraft, aircraft.orbitCentre, dt);
  } else {
    // On station: fly a lazy circle so the jamming bearing wanders slightly.
    aircraft.orbitPhase = wrapDeg(aircraft.orbitPhase + 8 * dt);
    flyToward(aircraft, polar(aircraft.orbitCentre, aircraft.orbitPhase, 12), dt);
  }
  aircraft.jamming = dist(world.centre, aircraft.pos) < type.orbitKm * 1.45;
}

function stepDecoy(world, aircraft, dt) {
  const asset = world.assetById.get(aircraft.targetAssetId);
  const aim = asset && !asset.destroyed ? asset.pos : world.centre;
  flyToward(aircraft, aim, dt);
  if (aircraft.lifeS > AIR_TYPES.decoy.lifetimeS) {
    aircraft.alive = false;
    aircraft.expired = true;
    world.log('info', 'CONTACT FADED — NO IMPACT', { aircraftId: aircraft.id });
  }
}

function stepCivil(world, aircraft, dt) {
  const wp = aircraft.waypoints[0];
  if (!wp) { egress(aircraft, dt); return; }
  flyToward(aircraft, wp, dt);
  if (dist(aircraft.pos, wp) < 6) aircraft.waypoints.shift();
}

const BEHAVIOURS = {
  striker: stepStriker,
  cruise: stepCruise,
  sead: stepSead,
  jammer: stepJammer,
  decoy: stepDecoy,
  civil: stepCivil,
};

/** Advance the whole raid one step. */
export function stepAircraft(world, dt) {
  for (const aircraft of world.aircraft) {
    if (!aircraft.alive) continue;
    aircraft.lifeS += dt;
    aircraft.worldTimeS = world.t;

    handleThreat(world, aircraft, dt);
    (BEHAVIOURS[aircraft.type] ?? stepStriker)(world, aircraft, dt);

    if (len(aircraft.pos) > SIM.worldRadiusKm) {
      aircraft.alive = false;
      aircraft.exited = true;
      world.onAircraftExit(aircraft);
    }
  }
  // Dead aircraft are kept in the list, not spliced out: rounds still in flight
  // need to resolve against them, and the scope draws a fading wreck.
}
