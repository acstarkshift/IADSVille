/**
 * The machinery of an engagement, and the AI that drives it when you don't.
 *
 * Every engagement — yours or the computer's — runs the same state machine:
 *
 *   reacting -> ready -> guiding -> done
 *
 * The player never gets a faster reaction timer or a private launch path. What
 * the player gets is judgement: which target, which battery, how many rounds,
 * and whether the radar stays up while the round flies.
 *
 * Two AI minds live here. The battle manager decides what each battery should be
 * shooting at; the battery crews decide when to radiate, when to launch and when
 * to blink. Whichever seat the player takes, the other one is filled by these.
 */

import { SAM_TYPES, ENGAGEMENT, ARM, DETECTION } from './config.js';
import { dist, len, clamp, clamp01 } from './math.js';
import { inEnvelope, launchSalvo, timeToInRangeS } from './weapons.js';
import { engagementValue, sortedTracks } from './threat.js';

/** Seconds a searching battery radiates, and the quiet gap between sweeps. */
const SEARCH_DWELL_S = 18;
const SEARCH_GAP_S = 40;

/** Start an engagement if the battery has a channel free. Returns it, or null. */
export function beginEngagement(world, site, track, { manual = false, salvo = null } = {}) {
  const type = SAM_TYPES[site.type];
  if (!site.alive) return null;
  if (site.engagements.length >= type.channels) return null;
  if (site.engagements.some((e) => e.trackId === track.id)) return null;
  if (site.readyRounds <= 0) return null;

  const engagement = {
    trackId: track.id,
    state: 'reacting',
    timerS: type.reactionS * (site.reactionMult ?? 1),
    salvo: salvo ?? site.salvoSize,
    manual,
    missileIds: [],
    startedS: world.t,
  };
  site.engagements.push(engagement);
  if (!track.assignedTo.includes(site.id)) track.assignedTo.push(site.id);
  world.log('info', `${site.name} — ENGAGING ${track.tn}`, { siteId: site.id, trackId: track.id });
  return engagement;
}

/** Break an engagement off — the target died, faded, or the player changed their mind. */
export function endEngagement(world, site, engagement, reason) {
  site.engagements = site.engagements.filter((e) => e !== engagement);
  const track = world.tracks.get(engagement.trackId);
  if (track) track.assignedTo = track.assignedTo.filter((id) => id !== site.id);
  if (reason && reason !== 'complete') {
    world.log('info', `${site.name} — BREAK OFF ${track?.tn ?? ''} (${reason})`, { siteId: site.id });
  }
}

/**
 * Advance every battery's engagements.
 *
 * A manual engagement stops at 'ready' and waits for the operator's fire
 * command. An automatic one launches the moment the target is inside the
 * envelope. Both then sit in 'guiding' until the rounds resolve — and the
 * battery's channel stays tied up the whole time, which is the real cost of a
 * shot.
 */
export function stepEngagements(world, dt) {
  for (const site of world.sites) {
    if (!site.alive) {
      site.engagements = [];
      continue;
    }

    if (site.reloadRemainingS > 0) {
      site.reloadRemainingS = Math.max(0, site.reloadRemainingS - dt);
      if (site.reloadRemainingS === 0) {
        const type = SAM_TYPES[site.type];
        const load = Math.min(type.readyRounds, site.magazine);
        site.magazine -= load;
        site.readyRounds = load;
        world.log('good', `${site.name} — RELOAD COMPLETE, ${load} READY`, { siteId: site.id });
      }
    }

    if (site.scootRemainingS > 0) {
      site.scootRemainingS = Math.max(0, site.scootRemainingS - dt);
      if (site.scootRemainingS === 0) {
        site.displaced = false;
        world.log('good', `${site.name} — IN POSITION`, { siteId: site.id });
      }
      continue; // a battery on the move fights nobody
    }

    for (const engagement of [...site.engagements]) {
      const track = world.tracks.get(engagement.trackId);
      if (!track) { endEngagement(world, site, engagement, 'track lost'); continue; }

      const target = world.aircraftById.get(track.truthId);
      if (!target || !target.alive) {
        if (engagement.missileIds.length === 0) {
          endEngagement(world, site, engagement, 'target destroyed');
          continue;
        }
      }

      if (engagement.state === 'reacting') {
        engagement.timerS -= dt;
        if (engagement.timerS <= 0) engagement.state = 'ready';
      }

      if (engagement.state === 'ready') {
        const env = inEnvelope(site, track.pos, track.altM);
        const firm = track.quality >= DETECTION.firmQuality;
        if (!engagement.manual && env.ok && firm && site.weaponsState !== 'hold') {
          fireEngagement(world, site, engagement);
          engagement.unreachableS = 0;
        } else {
          /*
           * Give up on a target only once it is persistently unreachable.
           * timeToInRangeS returns NaN while the velocity estimate is still
           * settling, and a single bad look should never throw away an
           * assignment the operator just made — so the channel is held until
           * the target has been clearly out of reach for a while.
           */
          const eta = timeToInRangeS(site, track);
          const unreachable = eta === Infinity;
          engagement.unreachableS = unreachable ? (engagement.unreachableS ?? 0) + dt : 0;
          if (engagement.unreachableS > 12) {
            endEngagement(world, site, engagement, 'out of reach');
          }
        }
      }

      if (engagement.state === 'guiding') {
        const live = engagement.missileIds.filter((id) =>
          world.missiles.some((m) => m.id === id && m.alive));
        engagement.missileIds = live;
        if (live.length === 0) {
          // Shoot-look-shoot: if the target survived and the rack has rounds, the
          // channel re-engages rather than releasing a target still inbound.
          const stillAlive = target && target.alive;
          const env = stillAlive ? inEnvelope(site, track.pos, track.altM) : { ok: false };
          if (stillAlive && env.ok && site.readyRounds > 0 && !engagement.manual
              && site.weaponsState === 'free' && world.t - engagement.startedS < 180) {
            engagement.state = 'ready';
            engagement.timerS = 0;
          } else {
            endEngagement(world, site, engagement, 'complete');
          }
        }
      }
    }
  }
}

/** Pull the trigger on a ready engagement. Shared by the AI and the fire button. */
export function fireEngagement(world, site, engagement) {
  const track = world.tracks.get(engagement.trackId);
  if (!track || engagement.state !== 'ready') return 0;
  const env = inEnvelope(site, track.pos, track.altM);
  if (!env.ok) return 0;

  const launched = launchSalvo(world, site, track, engagement.salvo);
  if (launched === 0) {
    endEngagement(world, site, engagement, 'no rounds');
    return 0;
  }
  engagement.missileIds = world.missiles
    .filter((m) => m.trackId === track.id && m.siteId === site.id && m.alive)
    .map((m) => m.id);
  engagement.state = 'guiding';
  return launched;
}

/* ------------------------------------------------------------------ *
 * AI battle manager — fills the seat when the player is crewing a gun.
 * ------------------------------------------------------------------ */

/**
 * Assign firm hostile tracks to the batteries best placed to kill them.
 *
 * This is deliberately a decent-but-not-brilliant algorithm: it takes the most
 * urgent unengaged track and gives it to the highest-value shooter. It does not
 * plan ahead, husband long-range rounds, or notice that six of the fourteen
 * contacts are decoys. A player who is paying attention will beat it, which is
 * the point of sitting in the chair.
 */
export function runAiBattleManager(world, dt) {
  if (!world.fusionOnline) return;      // no centre, no assignment
  world.aiThinkTimerS -= dt;
  if (world.aiThinkTimerS > 0) return;
  world.aiThinkTimerS = 1.0;

  const candidates = sortedTracks(world).filter((t) =>
    t.hostility === 'hostile'
    && t.quality >= DETECTION.firmQuality
    && t.threat > 0.5
    && t.assignedTo.length === 0);

  for (const track of candidates) {
    let best = null;
    let bestValue = -Infinity;

    for (const site of world.sites) {
      // The player's own battery is cued, not commanded: the AI hands it a
      // target and the human decides what to do about it.
      const manual = world.control.crewedBatteryId === site.id;
      const evaluation = engagementValue(world, site, track);
      if (!evaluation) continue;
      if (evaluation.value > bestValue) {
        bestValue = evaluation.value;
        best = { site, manual };
      }
    }

    if (best) beginEngagement(world, best.site, track, { manual: best.manual });
  }
}

/* ------------------------------------------------------------------ *
 * AI battery crews — emissions discipline, and the nerve to hold it.
 * ------------------------------------------------------------------ */

/** Seconds until an anti-radiation round arrives at this radar, or Infinity. */
export function armTimeToImpact(world, radar) {
  let soonest = Infinity;
  for (const missile of world.missiles) {
    if (!missile.alive || missile.kind !== 'arm' || missile.targetId !== radar.id) continue;
    const eta = dist(missile.pos, radar.pos) / missile.speed;
    if (eta < soonest) soonest = eta;
  }
  return soonest;
}

/** Seconds until this site's own rounds finish their work, or Infinity. */
function ownRoundsTimeToImpact(world, site) {
  let soonest = Infinity;
  for (const missile of world.missiles) {
    if (!missile.alive || missile.siteId !== site.id) continue;
    const target = world.aircraftById.get(missile.targetId);
    if (!target || !target.alive) continue;
    const eta = dist(missile.pos, target.pos) / Math.max(missile.speed - len(target.vel) * 0.5, 0.2);
    if (eta < soonest) soonest = eta;
  }
  return soonest;
}

/**
 * Emissions control for an AI-run site.
 *
 * The crew radiates when it has work, goes quiet when it doesn't, and blinks
 * when a round is coming — unless its own missile is about to arrive first, in
 * which case it holds the beam and takes the hit. That last judgement is exactly
 * the one the player has to make in the SAM operator seat.
 */
export function runAiEmcon(world, dt, site) {
  const radar = world.radarById.get(site.radarId);
  if (!radar || !radar.alive) return;
  const type = SAM_TYPES[site.type];

  const armEta = armTimeToImpact(world, radar);
  const roundEta = ownRoundsTimeToImpact(world, site);

  if (armEta < 18) {
    const worthIt = roundEta + 2 < armEta;
    if (!worthIt) {
      if (radar.on) {
        world.log('warn', `${site.name} — SHUTTING DOWN, ROUND INBOUND`, { siteId: site.id });
      }
      radar.on = false;
      site.blinkUntilS = world.t + 25;
      return;
    }
  }

  if (world.t < (site.blinkUntilS ?? 0)) return;

  const hasWork = site.engagements.length > 0;
  const threatNear = [...world.tracks.values()].some((t) =>
    t.hostility !== 'friendly'
    && dist(site.pos, t.pos) < type.maxRangeKm * 1.3
    && t.quality > 0.3);

  if (site.weaponsState === 'hold') { radar.on = false; return; }
  if (hasWork || threatNear) { radar.on = true; site.searchUntilS = 0; return; }

  /*
   * Nothing to look at — but a battery that only radiates when it already has a
   * picture never gets one. Crews therefore search on a duty cycle: a short
   * sweep, then back down. It is the same bargain the player makes by hand,
   * just on a timer, and it is what stops a fully dark sector from sleeping
   * through a raid.
   */
  if (world.t < (site.searchUntilS ?? 0)) { radar.on = true; return; }
  if (world.t > (site.nextSearchS ?? 0)) {
    site.searchUntilS = world.t + SEARCH_DWELL_S;
    site.nextSearchS = world.t + SEARCH_DWELL_S + SEARCH_GAP_S;
    radar.on = true;
    return;
  }
  radar.on = false;
}

/** Everything an AI-crewed battery does on its own initiative. */
export function runBatteryCrews(world, dt) {
  for (const site of world.sites) {
    if (!site.alive) continue;
    const human = world.control.crewedBatteryId === site.id;
    if (human) continue;

    runAiEmcon(world, dt, site);

    // Reload when the rack is dry and nothing is inbound to shoot at right now.
    if (site.readyRounds === 0 && site.reloadRemainingS === 0 && site.magazine > 0
        && site.engagements.length === 0) {
      startReload(world, site);
    }

    /*
     * Weapons free means what it says: the battery engages firm hostiles inside
     * its envelope on its own authority. Weapons tight means it shoots only what
     * it is given. That distinction is the battle manager's delegation dial —
     * set a flank free and stop thinking about it, or hold it tight and spend
     * your attention there.
     *
     * With the centre gone a battery can only act on what its own radar holds,
     * which is what makes losing fusion so expensive even for a free battery.
     */
    if (site.weaponsState === 'free') {
      const available = [...world.tracks.values()]
        .filter((t) => t.hostility === 'hostile'
          && t.quality >= DETECTION.firmQuality
          && t.assignedTo.length === 0
          && (world.fusionOnline || t.sources.includes(site.radarId))
          && inEnvelope(site, t.pos, t.altM).ok)
        .sort((a, b) => b.threat - a.threat);
      if (available[0]) beginEngagement(world, site, available[0]);
    }
  }
}

export function startReload(world, site) {
  if (site.magazine <= 0 || site.reloadRemainingS > 0) return false;
  const type = SAM_TYPES[site.type];
  site.reloadRemainingS = type.reloadS * (site.reloadMult ?? 1);
  world.log('info', `${site.name} — RELOADING (${Math.round(site.reloadRemainingS)}s)`, { siteId: site.id });
  return true;
}

/** Displace the battery: safe from anti-radiation rounds, and useless while moving. */
export function startScoot(world, site) {
  if (site.scootRemainingS > 0 || !site.alive) return false;
  const type = SAM_TYPES[site.type];
  site.scootRemainingS = type.scootS * (site.reloadMult ?? 1);
  site.displaced = true;
  site.engagements = [];
  const radar = world.radarById.get(site.radarId);
  if (radar) {
    radar.on = false;
    // A displaced site is a new problem for the enemy's targeting.
    radar.exposure = 0;
    radar.deadSectors = [];
  }
  world.log('warn', `${site.name} — DISPLACING (${Math.round(site.scootRemainingS)}s)`, { siteId: site.id });
  return true;
}
