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

/**
 * What a radar can see.
 *
 * Everything that flies as an aircraft — including the friendly traffic and the
 * aircraft the sector is trying to protect, both of which have to appear on the
 * scope for the operator to have any decision to make about them — and the
 * enemy's rounds in flight, which used to be excluded on the grounds that an
 * anti-radiation round is too small and too fast to hold. It is small and it is
 * fast, and the model now says so in the numbers instead: a twentieth of a
 * striker's cross-section, low, and gone in seconds. Whether it can be held is
 * a question the radar equation should answer, not a question the sim should
 * answer on the operator's behalf by refusing to look.
 *
 * A type may opt out with `radarInvisible`. Nothing currently does; the flag
 * exists so that adding a type to the game cannot silently make it undetectable,
 * which is exactly what a whitelist here did.
 */
const detectable = (contact) => !AIR_TYPES[contactType(contact)]?.radarInvisible;

/**
 * Which entry in the type table describes this flying thing.
 *
 * An aircraft is its own type; one of the enemy's rounds is whatever it was
 * stamped as when it left the rail. Everything downstream — cross-section,
 * threat weight, the label on the row — goes through here.
 */
export const contactType = (contact) => contact.contactType ?? contact.type;

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

  // And a set on a limited mount cannot see behind itself at all. This is the
  // whole cost of a fire-control antenna: enormous reach, through an arc.
  if (radar.fovDeg && absDeltaDeg(radar.boresightDeg, az) > radar.fovDeg / 2) return 0;

  // Radar cross-section scales range as the fourth root: small helps, but less
  // than people expect. A fifth of the reference RCS is about two thirds of
  // the range. Relative to `DETECTION.referenceRcs`, so a set's advertised
  // range is the range it actually sees a standard strike aircraft at — see
  // the note on that constant for what this looked like unanchored.
  let range = radar.rangeKm
    * Math.pow(Math.max(target.rcs, 1e-4) / DETECTION.referenceRcs, 0.25);

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
    // A signals-disciplined operator gives their opposite numbers less to work
    // with: short looks, irregular intervals, nothing to average.
    radar.exposure = Math.min(
      1, radar.exposure + dt * 0.0055 * radar.elintGain * (radar.exposureMult ?? 1));
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
  /*
   * A sectored set rasters inside its arc instead of turning through the
   * circle: the beam runs from one edge to the other and flies back. The
   * crossing test below is the same either way — a target is rolled once per
   * pass — but the flyback is a discontinuity, not a sweep, so nothing is
   * detected on that tick. (Without this the wrap reads as a single
   * enormous clockwise crossing and paints the entire arc at once.)
   */
  let flyback = false;
  if (radar.fovDeg) {
    const half = radar.fovDeg / 2;
    const from = wrapDeg(radar.boresightDeg - half);
    // How far the beam has come from the left edge, measured the short way.
    const swept = wrapDeg(az0 - from) + degrees;
    if (swept >= radar.fovDeg) {
      radar.az = from;
      flyback = true;
    } else {
      radar.az = wrapDeg(az0 + degrees);
    }
  } else {
    radar.az = wrapDeg(az0 + degrees);
  }
  const az1 = radar.az;
  if (flyback) return plots;

  for (const target of targets) {
    if (!target.alive || !detectable(target)) continue;

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

/**
 * Where a track should be right now if it has held its course.
 *
 * The correlator's comment always said it compared plots "against where the
 * track is predicted to be right now"; it compared them against `pos`, which
 * is the last plot, and dead reckoning did not begin until sixteen seconds of
 * silence. Everything between one look and the next was therefore correlated
 * against a position already a whole scan period out of date.
 */
function predictedAt(track, t) {
  const dtSince = Math.max(0, t - track.lastUpdateS);
  if (dtSince <= 0) return track.pos;
  return add(track.pos, scale(track.vel, dtSince));
}

/**
 * How far from the prediction a plot may fall and still be the same object.
 *
 * Base radius is measurement error. The rest is staleness: how far the target
 * has had to move since anybody looked, and how wrong the estimate can be
 * while it is still converging. A track with no velocity estimate at all gets
 * the full plausible-travel gate, because with no course there is no
 * prediction for the plot to be near — and inventing a second track in that
 * volume is exactly the failure this replaces.
 */
function gateKm(track, radius, t) {
  const dtSince = Math.max(0, t - track.lastUpdateS);
  if (dtSince <= 0) return radius;
  const speed = len(track.vel);
  const growth = speed < 1e-6
    ? DETECTION.maxTargetSpeedKmS
    : Math.max(DETECTION.gateGrowthKmPerS, speed * 0.5);
  return Math.min(radius + dtSince * growth, DETECTION.maxGateKm);
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
 * With the fusion centre gone, whose track is this plot allowed to join?
 *
 * Its own set's — and its own BATTERY's. Losing the sector operations centre
 * takes away the thing that reconciles plots between units; it does not take
 * away the plotting board inside one battery's cabin, where the acquisition
 * set and the fire-control set on the same mount have always been read
 * together by the same two people. Without this a battalion counted every
 * aeroplane twice all by itself the moment the centre died.
 */
function ownsPlot(world, track, plot) {
  if (track.sources.includes(plot.radarId)) return true;
  const site = world.radarById?.get(plot.radarId)?.siteId;
  if (!site) return false;
  return track.sources.some((id) => world.radarById?.get(id)?.siteId === site);
}

/**
 * Remember a dropped track for a minute, so it can come back as itself.
 *
 * Called from `world.dropTrack`. Worth remembering if the sector ever held it
 * firmly, or held it at all for long enough to be a thing rather than a
 * flicker — under heavy jamming a real raider never reaches firm quality, and
 * refusing to remember those is most of why White Noise issued two numbers per
 * aeroplane. A single plot that faded is not remembered: reviving that would
 * hand a real contact the number of a ghost of noise.
 */
export function rememberGhost(world, track) {
  const held = track.everFirm || world.t - track.firstSeenS >= 12;
  if (!held || track.destroyed) return;
  world.trackGhosts = world.trackGhosts ?? [];
  world.trackGhosts.push({
    id: track.id,
    tn: track.tn,
    pos: { ...track.pos },
    vel: { ...track.vel },
    altM: track.altM,
    droppedAtS: world.t,
    sources: [...track.sources],
    classification: track.classification,
    hostility: track.hostility,
    idProgressS: track.idProgressS,
    truthId: track.truthId,
  });
}

/**
 * Is this plot the same aeroplane the sector lost a minute ago?
 *
 * A raid that flies through a seam in the coverage used to come out the other
 * side as new aircraft with new numbers, and the net announced every one of
 * them: measured, ninety-eight NEW CONTACT calls in a watch with forty-five
 * objects in it, most of them about aeroplanes that were already leaving. A
 * sector does not do that. It re-acquires, and the number it re-acquires on is
 * the number it had.
 *
 * The recovered track keeps its identification work, because the sector did
 * that work and losing the contact does not unlearn it — but it comes back
 * with the quality of a single fresh plot, so it has to be re-earned before
 * anybody may shoot on it.
 */
function reacquire(world, plot, fused) {
  const ghosts = world.trackGhosts;
  if (!ghosts?.length) return null;

  let best = null;
  let bestD = Infinity;
  let bestIndex = -1;
  for (let i = 0; i < ghosts.length; i++) {
    const ghost = ghosts[i];
    const age = world.t - ghost.droppedAtS;
    if (age > DETECTION.reacquireWindowS) continue;
    // With the fusion centre gone a set only reconciles its own numbers, the
    // same rule the live correlation runs under.
    if (!fused && !ghost.sources.includes(plot.radarId)) continue;
    const predicted = add(ghost.pos, scale(ghost.vel, age));
    const gate = Math.min(
      DETECTION.reacquireGateKm + age * Math.max(len(ghost.vel) * 0.5, DETECTION.gateGrowthKmPerS),
      DETECTION.maxGateKm,
    );
    const d = dist(predicted, plot.pos);
    if (d >= gate) continue;
    // And in the same layer of the sky: a low flier reappearing is not the
    // high one that went off the plot a minute ago.
    if (Math.abs(ghost.altM - plot.altM) > 3500) continue;
    if (d < bestD) { bestD = d; best = ghost; bestIndex = i; }
  }
  if (!best) return null;
  ghosts.splice(bestIndex, 1);

  const track = {
    id: best.id,
    tn: best.tn,
    pos: { ...plot.pos },
    vel: { ...best.vel },
    altM: plot.altM,
    quality: DETECTION.qualityGain,
    firstSeenS: world.t,
    lastUpdateS: world.t,
    sources: [plot.radarId],
    truthId: plot.truthId,
    classification: best.classification,
    idProgressS: best.idProgressS,
    hostility: best.hostility,
    assignedTo: [],
    engagedBy: [],
    threat: 0,
    coasting: false,
    everFirm: false,
    reacquired: true,
  };
  world.tracks.set(track.id, track);
  return track;
}

/** Forget ghosts nobody is going to re-acquire. Called once a tick. */
function ageGhosts(world) {
  const ghosts = world.trackGhosts;
  if (!ghosts?.length) return;
  world.trackGhosts = ghosts.filter((g) => world.t - g.droppedAtS <= DETECTION.reacquireWindowS);
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
    let bestScore = Infinity;

    for (const track of world.tracks.values()) {
      if (!fused && !ownsPlot(world, track, plot)) continue;
      // Against where the track is predicted to be right now — which is what
      // this line has always claimed to do and never did.
      const d = dist(predictedAt(track, world.t), plot.pos);
      const gate = gateKm(track, radius, world.t);
      if (d >= gate) continue;
      // Nearest in gate-widths, not in kilometres: a plot four kilometres from
      // a track last seen twelve seconds ago is a better match than one three
      // kilometres from a track being painted continuously.
      const score = d / gate;
      if (score < bestScore) {
        bestScore = score;
        best = track;
      }
    }

    if (!best) {
      const revived = reacquire(world, plot, fused);
      if (revived) continue;
      const track = newTrack(world, plot);
      world.tracks.set(track.id, track);
      // The first contact of the watch is an event, spoken like one. Every
      // track after it is routine and stays off the net — but a watch used to
      // pass its first two minutes in total log silence while the tube quietly
      // grew symbols nobody announced.
      if (!world.firstContactLoggedAtS && world.log) {
        world.firstContactLoggedAtS = world.t;
        world.log('warn', `NEW CONTACT — ${track.tn}. THE WATCH HAS COMPANY.`,
          { trackId: track.id });
      }
      /*
       * A round in the air is not a contact, it is an emergency, and it is
       * called as one the instant the picture holds it: named, located, and
       * said out loud to be something that can still be shot at. Everything
       * else about this watch can wait forty seconds. This cannot.
       */
      const truth = world.truthOf?.(track);
      if (truth?.contactType && world.log) {
        const type = AIR_TYPES[truth.contactType];
        track.classification = truth.contactType;
        track.hostility = 'hostile';
        const brg = String(Math.round(bearing({ x: 0, y: 0 }, track.pos))).padStart(3, '0');
        world.log('alert', truth.contactType === 'arm'
          ? `ROUND IN THE AIR — ${track.tn}, BEARING ${brg}. ANTI-RADIATION. ENGAGEABLE.`
          : `WEAPON IN THE AIR — ${track.tn}, BEARING ${brg}. ENGAGEABLE.`,
        { trackId: track.id, severity: 'high' });
        world.comms?.('SECTOR', `${type.label} TRACKED AS ${track.tn}. LOW SECTIONS TAKE IT.`,
          { urgent: true, trackId: track.id });
      }

      // The set that found it says so — the surveillance sets only. Reporting
      // the air picture is their job; a battery's own set is looking at what
      // it is about to shoot, and does not narrate the sector.
      const finder = world.radarById?.get(plot.radarId);
      if (finder && !finder.siteId && world.comms && !truth?.contactType) {
        world.comms(finder.label, `NEW CONTACT, ${track.tn}, BEARING ${
          String(Math.round(bearing(finder.pos, track.pos))).padStart(3, '0')}.`,
        { trackId: track.id, radarId: finder.id });
      }
      continue;
    }

    const dtSince = world.t - best.lastUpdateS;

    /*
     * Alpha-beta smoothing: trust the new plot for position, blend for
     * velocity — but velocity only learns from plot pairs whose baseline is
     * long enough to beat the position noise. Two radars painting the same
     * aircraft a breath apart used to divide a few hundred metres of
     * radar-to-radar disagreement by a tenth of a second and blend the
     * resulting supersonic ghost in at 0.45: quality-1.0 tracks carried
     * velocities double the true speed and ninety degrees off course, and
     * every consumer downstream — target prediction, closure gates, the
     * intercept arithmetic — trusted them. The estimator knows what the
     * fastest tracked contact on the board is and will not believe anything
     * quicker; that is `DETECTION.maxTargetSpeedKmS`, and it is the enemy's
     * anti-radiation round, not a strike aircraft. Capping at a strike
     * aircraft's pace — which is what this line used to do — meant the
     * estimate for the one contact that is genuinely fast saturated at little
     * over half its speed, and the correlator lost it between looks.
     */
    if (dtSince >= 2) {
      const measuredVel = scale(sub(plot.pos, best.pos), 1 / dtSince);
      const measuredSpeed = len(measuredVel);
      const cap = DETECTION.maxTargetSpeedKmS;
      const capped = measuredSpeed > cap
        ? scale(measuredVel, cap / measuredSpeed) : measuredVel;
      const was = best.vel;
      best.vel = {
        x: best.vel.x + (capped.x - best.vel.x) * 0.45,
        y: best.vel.y + (capped.y - best.vel.y) * 0.45,
      };
      /*
       * How long this track has been flying the same way.
       *
       * Everything downstream that answers "where is it GOING" — the
       * defended place it is tracking toward, the orders that exclude a
       * place, the ledger that bills a salvo to one — is built on this
       * estimate, and the estimate wanders by a few degrees a look even on an
       * aircraft holding a ruler-straight line. The clock below is what lets
       * those consumers wait for a course instead of publishing the noise.
       */
      const from = len(was);
      const to = len(best.vel);
      if (from > 1e-6 && to > 1e-6) {
        const turned = absDeltaDeg(bearing({ x: 0, y: 0 }, was), bearing({ x: 0, y: 0 }, best.vel));
        best.courseSettledS = turned <= DETECTION.courseSteadyDeg
          ? (best.courseSettledS ?? 0) + dtSince : 0;
      } else {
        best.courseSettledS = 0;
      }
    }
    best.pos = { x: plot.pos.x, y: plot.pos.y };
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

    // How long this track has been held at high quality without a break —
    // the currency the decoy tell is bought with.
    track.wellHeldS = track.quality >= DETECTION.steadyTellQuality
      ? (track.wellHeldS ?? 0) + dt : 0;

    if (since > DETECTION.coastAfterS) {
      track.coasting = true;
      // Dead reckoning: the symbol keeps flying the last known course, and is
      // wrong in exactly the way that gets operators killed.
      track.pos = add(track.pos, scale(track.vel, dt));
    }

    // A destroyed track leaves the picture quickly. The wreck is falling, not
    // flying: holding the hostile symbol on its old course for the full coast
    // window meant a kill looked like nothing had happened for most of a
    // minute — and offered the AI a ghost to re-engage.
    if (track.destroyed && world.t - (track.destroyedAtS ?? world.t) > 5) {
      world.dropTrack(id, 'destroyed');
      continue;
    }

    /*
     * With the fusion centre gone every set builds its own tracks, so one
     * aircraft crossing three coverages becomes three track numbers and the
     * board fills with duplicates that never merge: measured on the climax
     * watch, ninety-seven numbers for fourteen aircraft by the end — clutter
     * presented as information. An unfused track that has stopped updating is
     * dropped roughly twice as fast. The picture still degrades when the
     * centre dies; it degrades into uncertainty rather than into noise.
     */
    const dropAfterS = world.fusionOnline
      ? DETECTION.dropAfterS : DETECTION.dropAfterS * 0.45;
    if (since > dropAfterS || track.quality <= 0) {
      world.dropTrack(id, since > dropAfterS ? 'lost' : 'faded');
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
  const truth = world.truthOf(track);
  if (!truth) return;

  const type = AIR_TYPES[contactType(truth)];
  const speedMult = (type.idSpeedMult ?? 1) * (world.modifiers?.idSpeedMult ?? 1);
  track.idProgressS += dt * speedMult * (world.fusionOnline ? 1 : 0.55);

  if (track.hostility === 'pending' && track.idProgressS > DETECTION.idTimeS * 0.4) {
    // Identification friend or foe: co-operative traffic answers, everyone else
    // is assumed hostile because of where they are and what they are doing.
    track.hostility = type.friendly ? 'friendly' : 'hostile';
  }

  if (track.idProgressS < DETECTION.idTimeS) return;

  if (truth.type === 'decoy') {
    /*
     * A decoy is built to read as a striker and it does — until either it is
     * close enough that its impossibly steady flight gives it away for free
     * (by which point most batteries have already fired at it), or an operator
     * has held its track continuously at high quality long enough to notice
     * the same thing early. The second tell is bought with radiating radars,
     * which is the price of everything in this game.
     */
    const rangeToCentre = len(track.pos);
    const steadyTell = (track.wellHeldS ?? 0) >= DETECTION.steadyTellS;
    track.classification = (rangeToCentre < AIR_TYPES.decoy.tellRangeKm || steadyTell)
      ? 'decoy' : 'striker';
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

  /*
   * What the sets are looking for: every aircraft, plus the enemy's rounds in
   * flight. An anti-radiation round and a released weapon are small, quick and
   * hard to hold — which the model says in the numbers (a twentieth of a
   * striker's cross-section) rather than by refusing to plot them. They are
   * the two things in the air the operator might still be able to do something
   * about, and being unable to even see them was the sim deciding that for
   * them. Our own rounds carry no `contactType` and never enter this list.
   */
  const contacts = world.aircraft.concat(
    world.missiles.filter((m) => m.alive && m.contactType));

  for (const radar of world.radars) {
    stepRadarPower(radar, dt);
    const plots = sweepRadar(radar, contacts, jammers, world.rng, dt);
    for (const p of plots) allPlots.push(p);
  }

  correlatePlots(world, allPlots);
  ageTracks(world, dt);
  ageGhosts(world);
  return allPlots;
}
