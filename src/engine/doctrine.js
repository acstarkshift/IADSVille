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
import {
  dist, len, clamp, clamp01, closureRate, bearing, absDeltaDeg, wrapDeg, turnToward,
} from './math.js';
import { inEnvelope, launchSalvo, timeToInRangeS } from './weapons.js';
import { engagementValue, sortedTracks } from './threat.js';

/** Seconds a searching battery radiates, and the quiet gap between sweeps. */
const SEARCH_DWELL_S = 18;
const SEARCH_GAP_S = 40;

/**
 * How many simultaneous engagements this battery can actually hold.
 *
 * The type sets the baseline; a well-drilled crew adds one, which is why the
 * Trained Crew qualification is worth two promotion points. Every caller goes
 * through here so the display, the AI and the rules can never disagree about
 * whether a channel is free.
 */
export function channelsFor(site) {
  return SAM_TYPES[site.type].channels + (site.extraChannels ?? 0);
}

/** Start an engagement if the battery has a channel free. Returns it, or null. */
export function beginEngagement(world, site, track, { manual = false, salvo = null, origin = null } = {}) {
  const type = SAM_TYPES[site.type];
  if (!site.alive) return null;
  // The aircraft behind this track is already wreckage. The symbol stays on the
  // scope until the track drops, and without this every battery in the sector
  // re-engages it once a tick for the next forty-five seconds. The truth check
  // backs up the flag: every death path is supposed to set `destroyed`, but a
  // path that forgets must not reopen the churn.
  if (track.destroyed) return null;
  const truth = world.aircraftById.get(track.truthId);
  if (truth && !truth.alive) return null;
  if (site.engagements.length >= channelsFor(site)) return null;
  if (site.engagements.some((e) => e.trackId === track.id)) return null;
  if (site.readyRounds <= 0) return null;

  const engagement = {
    trackId: track.id,
    state: 'reacting',
    timerS: type.reactionS * (site.reactionMult ?? 1),
    salvo: salvo ?? site.salvoSize,
    manual,
    /**
     * Who created this engagement decides how it shoots. 'assigned' — a net
     * assignment, human or AI — holds fire for a sweet-spot shot; 'free' — a
     * crew self-engaging on weapons free — snaps the earliest one, at the
     * edge of the envelope, because that is what free means.
     */
    origin: origin ?? 'assigned',
    /**
     * What this engagement was FOR — the prediction at the moment the decision
     * was made. Billing (freeze rounds, the finale's account of what you chose
     * to defend) reads this stamp, not the live prediction at release: a noisy
     * track that wandered onto the struck-off place in the seconds between
     * assignment and launch used to bill an obedient operator for a breach
     * they never chose.
     */
    purposeAssetId: track.predictedAssetId ?? null,
    missileIds: [],
    startedS: world.t,
  };
  /*
   * A crew whose own set already holds the track is not starting from a cold
   * plot: the assignment confirms the picture they are looking at, and the
   * sequence runs correspondingly quicker. Without this, every assignment
   * re-paid the full reaction time a free crew's shoot-look-shoot skips —
   * which quietly made supervision a tax and delegation a dominant strategy.
   */
  const heldByOwnSet = world.radarsOf
    ? world.radarsOf(site).some((r) => track.sources?.includes(r.id))
    : track.sources?.includes(site.radarId);
  if ((origin ?? 'assigned') !== 'free' && heldByOwnSet) {
    engagement.timerS *= 0.55;
  }
  site.engagements.push(engagement);
  if (!track.assignedTo.includes(site.id)) track.assignedTo.push(site.id);
  /*
   * At district and national scale, most of what happens is other people's
   * fights, and a ticker averaging a line every two seconds trains the reader
   * to stop reading — which the endgame then punishes. A subordinate
   * formation outside your direct hand narrates one engagement per few
   * seconds; your own commands, and every battalion/sector watch, log all of
   * them.
   */
  const wide = world.echelon?.id === 'region' || world.echelon?.id === 'national';
  const subordinate = wide && site.formation && !(world.isDirect?.(site.formation) ?? true);
  world._fmnEngageLogAtS = world._fmnEngageLogAtS ?? {};
  const lastLogged = world._fmnEngageLogAtS[site.formation] ?? -99;
  /*
   * And the same battery re-announcing the same track is not news twice. A
   * shoot-look-shoot cycle or a broken-and-retaken claim used to print a
   * fresh ENGAGING every round trip; measured, the ticker's most common line
   * was a repeat, and a reader trained on repeats stops reading.
   */
  world._engageSaidAtS = world._engageSaidAtS ?? {};
  const pairKey = `${site.id}:${track.id}`;
  const saidAt = world._engageSaidAtS[pairKey] ?? -99;
  if ((!subordinate || world.t - lastLogged >= 6) && world.t - saidAt >= 30) {
    if (subordinate) world._fmnEngageLogAtS[site.formation] = world.t;
    world._engageSaidAtS[pairKey] = world.t;
    world.log('info', `${site.name} — ENGAGING ${track.tn}`, { siteId: site.id, trackId: track.id });
    // An order given by a person gets answered by a person. Officers'
    // assignments and crews' own snap shots do not acknowledge to you —
    // nobody transmitted anything to them.
    if ((origin ?? 'assigned') === 'assigned' && world.control.netIsHuman && world.comms) {
      world.comms(site.name, `ROGER, ENGAGING ${track.tn}.`,
        { siteId: site.id, trackId: track.id });
    }
  }
  return engagement;
}

/** Break an engagement off — the target died, faded, or the player changed their mind. */
export function endEngagement(world, site, engagement, reason) {
  site.engagements = site.engagements.filter((e) => e !== engagement);
  const track = world.tracks.get(engagement.trackId);
  if (track) track.assignedTo = track.assignedTo.filter((id) => id !== site.id);
  // An out-of-reach release is housekeeping, not an event: the claim ended
  // because the geometry did. It stays out of the ticker; the operator's
  // answer arrives as the refusal at assignment time instead.
  if (reason && reason !== 'complete' && reason !== 'out of reach') {
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
        world.comms?.(site.name, `BACK ON THE RAILS, ${load} READY.`, { siteId: site.id });
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
        /*
         * The sequence does not run while the fire-control antenna is still
         * coming round. A battalion whose set is pointed at the northern axis
         * does not answer a contact in the west until it has traversed —
         * five degrees a second, so most of half a minute across the arc.
         * Batteries with a single omnidirectional set are never held up here.
         */
        if (fcBearsOn(world, site, track)) {
          engagement.timerS -= dt;
          if (engagement.timerS <= 0) {
            engagement.state = 'ready';
            engagement.readyAtS = world.t;
          }
        }
      }

      if (engagement.state === 'ready') {
        const env = inEnvelope(site, track.pos, track.altM);
        const firm = track.quality >= DETECTION.firmQuality;
        if (!engagement.manual && env.ok && firm && site.weaponsState !== 'hold') {
          /*
           * An assigned engagement waits for a shot worth taking: a closing
           * target still outside the hold-fire fraction of max range will be
           * markedly deeper in the envelope in a few seconds, and Pk decays
           * hard toward the edge. Bounded by holdFireMaxS and by closure —
           * a crossing or receding target is shot now, never orbited. Free
           * self-engagements skip all of this: doctrine for a free battery is
           * the earliest shot there is, which is precisely what makes leaving
           * the whole sector on free cheaper in attention and dearer in rounds.
           */
          const type = SAM_TYPES[site.type];
          const closing = closureRate(track.pos, track.vel, site.pos) > 0.005;
          // "Time available": hold only when the target's arrival at whatever
          // it is going for leaves room for patience. A terminal vampire is
          // shot the instant it can be, because there is no second shot.
          const timeToSpare = (track.ttiS ?? Infinity) > ENGAGEMENT.holdFireMinTtiS;
          /*
           * And patience is a thing you buy with rounds. A battery down to
           * its last pair does not wait for prettier geometry — it fires
           * what it has at what it can reach, because the alternative is
           * finishing the watch with rounds on the rails and a raid past it.
           * Measured: with a late package arriving on a spent allocation, a
           * net that kept holding for sweet spots scored eighteen per cent
           * BELOW the same crews left on free. Discipline that outlives its
           * own magazine is not discipline.
           */
          const roundsToSpare = site.readyRounds > (engagement.salvo ?? 1) * 2;
          const holdable = engagement.origin !== 'free'
            && closing
            && timeToSpare
            && roundsToSpare
            && env.rangeKm > type.maxRangeKm * ENGAGEMENT.holdFireFraction
            && world.t - (engagement.readyAtS ?? world.t) < ENGAGEMENT.holdFireMaxS;
          if (!holdable) {
            fireEngagement(world, site, engagement);
            engagement.unreachableS = 0;
          } else if (!engagement.holding) {
            /*
             * Say so, once. The deliberate sweet-spot hold used to read as a
             * dead order: "ENGAGING", forty-eight silent seconds, then a
             * launch the player had stopped waiting for. The battery is not
             * ignoring the assignment; it is aiming, and now it says so.
             */
            engagement.holding = true;
            world.log('info', `${site.name} — HOLDING ${track.tn} FOR RANGE`, {
              siteId: site.id, trackId: track.id,
            });
          }
        } else {
          /*
           * Give up on a target once it is persistently unreachable — and
           * read "unreachable" honestly. The old test counted only a hard
           * Infinity, so a track skirting the envelope at a tangent, or one
           * whose velocity solution kept flickering to NaN, pinned this
           * channel indefinitely: measured on the climax watch, a C2-bound
           * striker sat assigned to a battery it would never enter, unshot
           * and claiming the track, while batteries with full racks had no
           * right to it and the jamming quietly ate the picture. A settling
           * solution still gets its grace; a receding target, or a shot more
           * than a minute away, does not.
           */
          const eta = timeToInRangeS(site, track);
          const settling = Number.isNaN(eta) && world.t - engagement.startedS < 8;
          const hopeless = eta === Infinity || eta > 60
            || (Number.isNaN(eta) && !settling)
            || closureRate(track.pos, track.vel, site.pos) < -0.002;
          engagement.unreachableS = hopeless ? (engagement.unreachableS ?? 0) + dt : 0;
          if (engagement.unreachableS > 6) {
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
          /*
           * Re-engage only while this battery still owns the shot. A target
           * that survived the salvo and is now running deep past this
           * envelope's edge belongs to the next layer in — holding the claim
           * and lobbing again from the rim is how an outer battery starves
           * the guns under the target of their terminal shot.
           */
          const stillOurs = env.ok
            && env.rangeKm <= SAM_TYPES[site.type].maxRangeKm * 0.8;
          if (stillAlive && stillOurs && site.readyRounds > 0 && !engagement.manual
              && world.t - engagement.startedS < 180) {
            /*
             * Shoot-look-shoot for everyone. A free crew re-engages the
             * instant the miss resolves; a netted battery confirms with the
             * net first — quick, because the solution is still on the tube,
             * but not free. The old rule let ONLY free crews re-engage, so
             * an assigned battery dropped its target after every miss and
             * re-paid the whole assignment cycle: most of the measured gap
             * between supervision and delegation was this line.
             */
            const free = site.weaponsState === 'free';
            engagement.state = free ? 'ready' : 'reacting';
            engagement.timerS = free ? 0 : 2.5;
            engagement.holding = false;
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

  const launched = launchSalvo(world, site, track, engagement.salvo, engagement.origin);
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
 * AI battle managers — the commanders you are not currently being.
 * ------------------------------------------------------------------ */

/**
 * Assign firm hostile tracks to the batteries best placed to kill them.
 *
 * This is deliberately a decent-but-not-brilliant algorithm: it takes the most
 * urgent unengaged track and gives it to the highest-value shooter. It does not
 * plan ahead, husband long-range rounds, or notice that six of the fourteen
 * contacts are decoys. A player who is paying attention will beat it, which is
 * the point of sitting in the chair.
 *
 * It runs once per formation that the player is not personally commanding —
 * which at battalion and sector is none of them, or all of them if the player
 * is crewing a gun instead, and at district and national command is most of the
 * country most of the time. Each of those formations has a named officer with
 * their own competence and their own reading of their orders, and the whole
 * experience of high command is watching them do a slightly worse job than you
 * would have done, in four places at once, while you are only in one.
 */
export function runAiBattleManager(world, dt) {
  for (const formation of world.formations) {
    if (world.formationIsHumanRun(formation)) continue;
    runFormationCommander(world, formation, dt);
  }
}

function runFormationCommander(world, formation, dt) {
  if (!world.fusionOnline) return;      // no centre, no assignment
  if (world.t < formation.handoverUntilS) return;   // nobody has this one yet
  if (formation.posture === 'hold') return;

  /*
   * How good this officer is, and what "good" means here.
   *
   * Two things, and both are ordinary human failures rather than handicaps
   * bolted on to make the player feel clever. A slower officer looks at the
   * board less often, so a contact sits unengaged for a beat or two longer than
   * it should; and a slower officer waits for a target to look properly
   * dangerous before spending a round on it, so the marginal ones — the low
   * one on a bearing nobody is watching, the second aircraft of a pair — get
   * picked up late or not at all.
   *
   * That gap is the entire value of a district commander standing in a sector
   * personally, and it is why the appointment is a decision rather than a
   * larger map.
   */
  const competence = formation.commander?.competence ?? 1;
  formation.thinkTimerS = (formation.thinkTimerS ?? 0) - dt;
  if (formation.thinkTimerS > 0) return;
  formation.thinkTimerS = 1.0 + (1 - competence) * 5;

  const sites = world.sitesOf(formation);
  if (!sites.length) return;

  // Never below the base filter: a good officer is quicker off the mark, not
  // willing to spend rounds on contacts that are not worth one.
  const worthARound = Math.max(0.5, 0.5 + (1 - competence) * 34);

  const candidates = sortedTracks(world).filter((t) =>
    t.hostility === 'hostile'
    && !t.destroyed
    && t.quality >= DETECTION.firmQuality
    && t.threat > worthARound
    && t.assignedTo.length === 0
    /*
     * Don't steal the shot a crew already has. An assignment claims the
     * track, replacing a free crew's imminent deep-envelope self-engagement
     * with a held one that re-pays the reaction sequence — measured, an AI
     * net laid over free crews SUBTRACTED value from its own sector that
     * way. A commander adds coordination where the crews have nothing, not
     * supervision where they are already aiming.
     */
    && !freeCrewCovers(world, t)
    && commanderWillEngage(world, formation, t));

  for (const track of candidates) {
    let best = null;
    let bestValue = -Infinity;

    for (const site of sites) {
      // The player's own battery is cued, not commanded: the AI hands it a
      // target and the human decides what to do about it.
      const manual = world.control.crewedBatteryId === site.id;
      const evaluation = engagementValue(world, site, track);
      if (!evaluation) continue;
      // An officer does not bookmark: a claim the battery cannot act on for
      // most of a minute sits in a channel, prints an ENGAGING it cannot
      // honour yet, and usually breaks off when the geometry moves. The
      // track is re-looked every think cycle; nothing is lost by waiting
      // until a battery can actually take it. Same horizon the assignment
      // refusal uses (cannotEngageReason): forty-five seconds plus what the
      // battery's reach entitles it to plan ahead — a flat bar here was
      // measured to erase the district battalion's forward coverage.
      if (evaluation.timeToRangeS > 45 + SAM_TYPES[site.type].maxRangeKm * 0.4) continue;
      if (evaluation.value > bestValue) {
        bestValue = evaluation.value;
        best = { site, manual };
      }
    }

    /*
     * An officer's assignment is the formation fighting, not the player
     * choosing — the finale's account of what YOU defended must not inherit
     * a subordinate commander's decisions. The one exception is a cue to the
     * player's own crewed battery, where the human still pulls the trigger.
     */
    if (best) {
      beginEngagement(world, best.site, track,
        { manual: best.manual, origin: best.manual ? 'assigned' : 'formation' });
    }
  }
}

/**
 * A free-posture crew can and will take this track on its own — now, or
 * within the next few seconds as it closes. The near-future window matters:
 * an assignment made twenty seconds before a crew's own snap shot is not
 * coordination, it is queue-jumping with a slower sequence.
 */
export function freeCrewCovers(world, track) {
  return world.sites.some((site) => {
    if (!site.alive || site.weaponsState !== 'free') return false;
    if (site.readyRounds <= 0 || site.engagements.length >= channelsFor(site)) return false;
    if (!world.fusionOnline
      && !world.radarsOf(site).some((r) => track.sources.includes(r.id))) return false;
    if (inEnvelope(site, track.pos, track.altM).ok) return true;
    const toRange = timeToInRangeS(site, track);
    return Number.isFinite(toRange) && toRange < 20;
  });
}

/**
 * Will this officer take this target?
 *
 * A formation on 'tight' fights what comes to it and does not reach across the
 * district for somebody else's problem. And an officer the file describes as
 * politically reliable does not expend rounds on anything outside the priority
 * of fires — not because he is a coward but because he has read the same order
 * you have and, unlike you, has never once considered not obeying it.
 */
export function commanderWillEngage(world, formation, track) {
  // Any officer on this net has read the freeze the commander acknowledged.
  // Expenditure against the struck-off place is nobody's initiative but yours.
  const struckOff = world.command?.constraints?.freezeExcludedId;
  if (struckOff && track.predictedAssetId === struckOff) return false;
  if (formation.commander?.political) {
    const priority = world.command?.constraints?.priorityOfFiresId;
    if (priority && track.predictedAssetId && track.predictedAssetId !== priority) {
      // The order names a place, but it means a side — the same reading the
      // breach accounting applies. The colonel holds the priority's whole
      // cluster, not one address in it: an officer this reliable does not
      // watch the ministry burn across the street from the palace he is
      // defending and call it obedience.
      const priorityCluster = world.assetById.get(priority)?.cluster;
      const trackCluster = world.assetById.get(track.predictedAssetId)?.cluster;
      if (!priorityCluster || priorityCluster !== trackCluster) return false;
    }
  }
  if (formation.posture !== 'tight') return true;
  const sites = world.sitesOf(formation);
  return sites.some((site) => dist(site.pos, track.pos) < SAM_TYPES[site.type].maxRangeKm * 1.4);
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
/* ------------------------------------------------------------------ *
 * Fire control — the antenna that has to be pointing at it.
 * ------------------------------------------------------------------ */

/** The set that guides this battery's rounds, which may be its only set. */
export function fcRadarOf(world, site) {
  return world.radarById.get(site.fcRadarId ?? site.radarId) ?? null;
}

/**
 * Is the fire-control antenna bearing on this track?
 *
 * True for every battery whose set turns through the full circle — the
 * question only means something for a set on a limited mount.
 */
export function fcBearsOn(world, site, track) {
  const fc = fcRadarOf(world, site);
  if (!fc || !fc.fovDeg) return true;
  if (!fc.alive) return false;
  return absDeltaDeg(fc.boresightDeg, bearing(fc.pos, track.pos)) <= fc.fovDeg / 2;
}

/**
 * Point the fire-control sets at the work.
 *
 * A crew slews to cover what the battery is engaging: if everything it is
 * working fits inside the arc, the antenna sits on the bisector and holds all
 * of it; if it does not, the crew takes the most urgent and the rest waits.
 * With nothing assigned the set leads the picture — it lies on the worst
 * threat it could reach — which is what a crew with a quiet net does and what
 * stops the arc from being a gotcha the player cannot anticipate.
 */
export function stepFireControl(world, dt) {
  for (const site of world.sites) {
    const fc = fcRadarOf(world, site);
    if (!fc || !fc.fovDeg || !fc.alive) continue;

    const bearings = [];
    let urgent = null;
    for (const engagement of site.engagements) {
      const track = world.tracks.get(engagement.trackId);
      if (!track || track.destroyed) continue;
      bearings.push(bearing(fc.pos, track.pos));
      if (!urgent || track.threat > urgent.threat) urgent = track;
    }
    if (!bearings.length) {
      // Nothing assigned: lie on the most threatening thing in reach.
      const type = SAM_TYPES[site.type];
      for (const track of world.tracks.values()) {
        if (track.destroyed || track.hostility === 'friendly' || track.threat <= 0) continue;
        if (dist(fc.pos, track.pos) > type.maxRangeKm * 1.3) continue;
        if (!urgent || track.threat > urgent.threat) urgent = track;
      }
      if (!urgent) continue;
      bearings.push(bearing(fc.pos, urgent.pos));
    }

    /*
     * The desired boresight. Offsets are measured relative to the first
     * bearing and wrapped into ±180 so the span is computed the short way
     * round — a pair at 350° and 010° is twenty degrees apart, not three
     * hundred and forty.
     */
    const ref = bearings[0];
    let lo = 0;
    let hi = 0;
    for (const b of bearings) {
      const offset = wrapDeg(b - ref + 180) - 180;
      lo = Math.min(lo, offset);
      hi = Math.max(hi, offset);
    }
    const desired = (hi - lo) <= fc.fovDeg
      ? wrapDeg(ref + (lo + hi) / 2)
      : bearing(fc.pos, urgent.pos);

    const before = fc.boresightDeg;
    fc.boresightDeg = turnToward(fc.boresightDeg, desired, fc.slewRateDegPerS * dt);
    const remaining = absDeltaDeg(fc.boresightDeg, desired);

    // The crew says so when the mount is genuinely running, and again when it
    // settles — a long traverse is a thing the operator is waiting on.
    const moving = absDeltaDeg(before, fc.boresightDeg) > 1e-6;
    if (moving && remaining > 12 && !fc.slewingTo) {
      fc.slewingTo = Math.round(desired);
      world.comms?.(fc.label, `SLEWING TO ${String(Math.round(desired)).padStart(3, '0')}.`,
        { siteId: site.id, radarId: fc.id });
    } else if (fc.slewingTo !== null && remaining <= 2) {
      fc.slewingTo = null;
      world.comms?.(fc.label, 'ON TARGET.', { siteId: site.id, radarId: fc.id });
    }
  }
}

/**
 * Emissions discipline for the surveillance sets nobody crews.
 *
 * Site radars blink by their crew's arithmetic below; the early-warning and
 * gapfiller sets had no such instinct, and an AI-run sector would hold them
 * radiating straight into an anti-radiation shot the fire-control sets had
 * already learned to duck. Runs only when the AI has the net — a human
 * commander owns these switches otherwise, and the suppression game with
 * them.
 */
export function runSurveillanceEmcon(world) {
  if (world.control.netIsHuman) return;
  for (const radar of world.radars) {
    if (radar.siteId || !radar.alive) continue;
    const armEta = armTimeToImpact(world, radar);
    if (armEta < 18) {
      /*
       * Said once per threat, not once per tick. The announcement fired
       * whenever the set happened to be up with a round inside eighteen
       * seconds — so anything that re-raised it (a measurement harness, a
       * commander overruling the crew) produced a fresh SHUTTING DOWN every
       * tenth of a second: measured, hundreds of phantom lines in one watch,
       * two thirds of that run's entire event count.
       */
      if (radar.on && world.t - (radar.armDuckLoggedAtS ?? -999) > 20) {
        radar.armDuckLoggedAtS = world.t;
        world.log('warn', `${radar.label} — SHUTTING DOWN, ROUND INBOUND`, { radarId: radar.id });
        world.comms?.(radar.label, 'ROUND ON THIS SET — GOING DARK.', { urgent: true, radarId: radar.id });
      }
      radar.on = false;
      radar.blinkUntilS = world.t + 25;
    } else if (!radar.on && world.t >= (radar.blinkUntilS ?? 0)) {
      // Nothing is homing on it any more, and it has served its blink.
      radar.on = true;
      world.comms?.(radar.label, 'SKY CLEAR — BACK UP.', { radarId: radar.id });
    }
  }
}

export function runAiEmcon(world, dt, site) {
  const radar = world.radarById.get(site.radarId);
  if (!radar || !radar.alive) return;
  const type = SAM_TYPES[site.type];

  const armEta = armTimeToImpact(world, radar);
  const roundEta = ownRoundsTimeToImpact(world, site);

  if (armEta < 18) {
    /*
     * The crew's own arithmetic: stay up only when their round lands before
     * the enemy's does. A commander can overrule it with the RIDE order —
     * hold emissions through guidance even though the ARM will arrive first,
     * trading the set (and the people at it) for the shot. No doctrine writes
     * that order and no AI ever gives it; it exists so the game's central
     * dilemma is finally decidable from the seat the player actually sits in
     * rather than being settled by the crew's safety rules every time. It is
     * self-limiting: with no rounds in the air there is nothing to guide, and
     * the crew blinks as trained no matter what the order says.
     */
    const worthIt = roundEta + 2 < armEta;
    const ordered = site.emconOrder === 'ride' && Number.isFinite(roundEta);
    if (!worthIt && !ordered) {
      if (radar.on) {
        world.log('warn', `${site.name} — SHUTTING DOWN, ROUND INBOUND`, { siteId: site.id });
        world.comms?.(site.name, 'ROUND ON US — GOING DARK.', { urgent: true, siteId: site.id });
      }
      // Every antenna the battery owns goes down together: ducking with the
      // search set while the fire-control set keeps shouting is not ducking.
      for (const r of world.radarsOf(site)) r.on = false;
      site.blinkUntilS = world.t + 25;
      return;
    }
    if (ordered && !worthIt && radar.on) {
      // Said once per warning, because somebody at the set is going to remember it.
      if (!site.ridingArmSinceS) {
        site.ridingArmSinceS = world.t;
        world.log('warn', `${site.name} — HOLDING EMISSIONS THROUGH GUIDANCE, BY ORDER`,
          { siteId: site.id, severity: 'high' });
      }
    }
  } else {
    site.ridingArmSinceS = 0;
  }

  if (world.t < (site.blinkUntilS ?? 0)) return;

  const hasWork = site.engagements.length > 0;
  const threatNear = [...world.tracks.values()].some((t) =>
    t.hostility !== 'friendly'
    && dist(site.pos, t.pos) < type.maxRangeKm * 1.3
    && t.quality > 0.3);

  const setEmissions = (on) => { for (const r of world.radarsOf(site)) r.on = on; };
  if (site.weaponsState === 'hold') { setEmissions(false); return; }
  if (hasWork || threatNear) { setEmissions(true); site.searchUntilS = 0; return; }

  /*
   * Nothing to look at — but a battery that only radiates when it already has a
   * picture never gets one. Crews therefore search on a duty cycle: a short
   * sweep, then back down. It is the same bargain the player makes by hand,
   * just on a timer, and it is what stops a fully dark sector from sleeping
   * through a raid.
   */
  if (world.t < (site.searchUntilS ?? 0)) { setEmissions(true); return; }
  if (world.t > (site.nextSearchS ?? 0)) {
    site.searchUntilS = world.t + SEARCH_DWELL_S;
    site.nextSearchS = world.t + SEARCH_DWELL_S + SEARCH_GAP_S;
    setEmissions(true);
    return;
  }
  setEmissions(false);
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
      /*
       * An accepted expenditure freeze binds the crews too: the order went to
       * every battery on the net, and a crew on its own authority still reads
       * its traffic. Rounds against the struck-off place can therefore only be
       * a decision taken at the net seat — which is what the settle accounting
       * assumes when it bills them.
       */
      const struckOff = world.command.constraints.freezeExcludedId ?? null;
      const available = [...world.tracks.values()]
        .filter((t) => {
          if (t.hostility !== 'hostile' || t.destroyed) return false;
          if (t.quality < DETECTION.firmQuality || t.assignedTo.length) return false;
          if (struckOff !== null && t.predictedAssetId === struckOff) return false;
          if (!world.fusionOnline
            && !world.radarsOf(site).some((r) => t.sources.includes(r.id))) return false;
          const env = inEnvelope(site, t.pos, t.altM);
          if (!env.ok) return false;
          /*
           * Let leavers leave. A crew chasing a departing aircraft out of the
           * back of its own envelope was the grind that closed watches: the
           * same low-Pk snap shot at the same egressing tail every thirty
           * seconds, five misses in a row, the allocation gone and the watch
           * held open past its story. An egressor gets engaged only while a
           * shot at it is still a real shot.
           */
          const truth = world.aircraftById.get(t.truthId);
          if (truth?.state === 'egress'
            && env.rangeKm > SAM_TYPES[site.type].maxRangeKm * 0.6) return false;
          return true;
        })
        /*
         * Nearest first — not most dangerous first. A crew on its own
         * authority defends itself and the ground it is standing on; the
         * sector-wide threat ranking lives at the net, because ranking is what
         * the net is FOR. Nearest-first across a whole sector is not a
         * defence: it is six batteries each shooting whatever happens to be
         * passing, while the aircraft that matters flies between them. That
         * misallocation, plus the snap shot at the envelope edge, is the full
         * price of setting everything free and walking away.
         */
        .sort((a, b) => dist(site.pos, a.pos) - dist(site.pos, b.pos));
      if (available[0]) beginEngagement(world, site, available[0], { origin: 'free' });
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
  site.scootRemainingS = type.scootS * (site.scootMult ?? 1) * (site.crewLosses ? 1.5 : 1);
  site.displaced = true;
  site.engagements = [];
  for (const radar of world.radarsOf(site)) {
    radar.on = false;
    // A displaced site is a new problem for the enemy's targeting.
    radar.exposure = 0;
    radar.deadSectors = [];
  }
  world.log('warn', `${site.name} — DISPLACING (${Math.round(site.scootRemainingS)}s)`, { siteId: site.id });
  return true;
}
