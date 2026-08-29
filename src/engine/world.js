/**
 * The world: everything that exists, and the fixed-step tick that moves it.
 *
 * Order of operations in a tick matters and is deliberate:
 *
 *   1. spawn      — the raid arrives on schedule
 *   2. detection  — radars sweep, plots correlate, tracks age
 *   3. threat     — the picture is re-ranked
 *   4. doctrine   — the AI assigns and the crews decide
 *   5. engagement — reaction timers run, rounds leave the rails
 *   6. flight     — aircraft and rounds move, intercepts resolve
 *   7. command    — sector command reads the log and has opinions
 *   8. end check  — is there anything left to do?
 *
 * Sensing happens before deciding, and deciding happens before moving, so
 * nothing in the sim ever acts on information from its own future.
 */

import {
  SIM, SAM_TYPES, RADAR_TYPES, ASSET_TYPES, AIR_TYPES, DIFFICULTY, COMMAND, DAMAGE,
} from './config.js';
import { makeRng } from './rng.js';
import { dist, len, bearing, polar, clamp, clamp01 } from './math.js';
import { stepDetection } from './detection.js';
import { stepMissiles, inEnvelope } from './weapons.js';
import { stepAircraft, createAircraft } from './ai.js';
import { scoreAllTracks } from './threat.js';
import {
  stepEngagements, runAiBattleManager, runBatteryCrews, runAiEmcon,
  beginEngagement, endEngagement, fireEngagement, startReload, startScoot,
} from './doctrine.js';
import {
  damageAsset, damageRadar, damageSite, nearMiss, stepDamage, addEffect, consoleDark,
} from './damage.js';
import {
  createCommandState, stepCommand, standingDelta, settleDirectives, answerDirective, tierFor,
} from './command.js';

export class World {
  constructor(scenario, options = {}) {
    this.scenario = scenario;
    this.seed = options.seed ?? scenario.seed ?? 'iadsville';
    this.rng = makeRng(this.seed);
    this.difficulty = DIFFICULTY[options.difficulty ?? 'veteran'] ?? DIFFICULTY.veteran;
    this.narrativePressure = options.narrativePressure ?? true;
    /**
     * Everything that bends the equipment to the person operating it: supply and
     * reload limits handed down by the campaign file, merged with the operator's
     * own background, training and injuries. One object, read once at
     * construction and consulted by the detection, damage and command modules.
     */
    this.modifiers = {
      roundsMult: 1,
      reloadsAllowed: true,
      reactionMult: 1,
      reloadMult: 1,
      scootMult: 1,
      idSpeedMult: 1,
      exposureMult: 1,
      rebootMult: 1,
      standingLossMult: 1,
      directiveTimeMult: 1,
      extraChannels: 0,
      ...(options.modifiers ?? {}),
    };
    /** The service record of whoever is sitting in the chair, if there is one. */
    this.character = options.character ?? null;

    this.t = 0;
    this.dt = SIM.dt;
    this.phase = 'running';       // running | complete
    this.outcome = null;
    this.centre = { x: 0, y: 0 };
    this.nextTn = 1;
    this.aiThinkTimerS = 0;

    // Id sequences are per world, so two worlds in one process stay independent
    // and a seed always replays the same way.
    this.seq = { aircraft: 0, missile: 0, radar: 0 };

    this.assets = [];
    this.sites = [];
    this.radars = [];
    this.aircraft = [];
    this.missiles = [];
    this.tracks = new Map();
    this.events = [];
    this.effects = [];
    this.plots = [];

    this.assetById = new Map();
    this.siteById = new Map();
    this.radarById = new Map();
    this.aircraftById = new Map();

    this.fusionOnline = true;
    this.c2LostAtS = null;
    this.console = { rebootUntilS: 0, rebootReason: null, destroyed: false };
    this.command = createCommandState();

    this.stats = {
      kills: 0, roundsFired: 0, leakers: 0, assetsLost: 0, sitesLost: 0,
      radarsLost: 0, civilianCasualties: 0, abortedSorties: 0, armsIncoming: 0,
      civilianAircraftShot: 0, displacements: 0, decoysEngaged: 0, sortiesTotal: 0,
      turnedBack: 0,
    };

    this.control = {
      role: options.role ?? 'net',
      netIsHuman: options.role !== 'crew',
      crewedBatteryId: null,
    };

    /**
     * The battery you belong to, whether or not you are sitting in it. In the
     * operator's seat this is the console under your hands; in the battle
     * manager's seat it is still your parent unit, so training you paid for is
     * never wasted by a change of chair.
     */
    this.homeBatteryId = (options.role === 'crew' || options.role === 'both')
      ? (options.batteryId ?? scenario.playerBatteryId ?? scenario.sites[0]?.id)
      : (scenario.playerBatteryId ?? scenario.sites[0]?.id);

    this.buildAssets();
    this.buildDefences();
    this.buildWaves();
    this.applyRole(options.role ?? 'net', options.batteryId);

    this.roundAllowance = Math.round(
      scenario.roundAllowance ?? this.sites.reduce((n, s) => n + s.readyRounds, 0) * 0.75,
    );

    this.log('info', `${scenario.name.toUpperCase()} — WATCH BEGINS`, {});
  }

  /* ---------------------------------------------------------------- *
   * Construction
   * ---------------------------------------------------------------- */

  buildAssets() {
    for (const spec of this.scenario.assets) {
      const type = ASSET_TYPES[spec.type];
      const asset = {
        id: spec.id ?? `asset_${spec.type}`,
        type: spec.type,
        label: spec.label ?? type.label,
        pos: { ...spec.pos },
        damage: 0,
        destroyed: false,
        casualties: 0,
      };
      this.assets.push(asset);
      this.assetById.set(asset.id, asset);
    }
  }

  nextMissileSeq() { return ++this.seq.missile; }

  addRadar(spec, siteId = null) {
    const radar = {
      id: `rdr${++this.seq.radar}`,
      siteId,
      kind: spec.kind,
      label: spec.label,
      pos: { ...spec.pos },
      heightM: spec.heightM,
      rangeKm: spec.rangeKm,
      minRangeKm: spec.minRangeKm ?? 0.5,
      scanPeriodS: spec.scanPeriodS,
      warmupS: spec.warmupS,
      elintGain: spec.elintGain,
      hp: spec.hp ?? 55,
      damage: 0,
      alive: true,
      on: spec.on ?? false,
      state: 'off',
      warmRemainingS: 0,
      rebootRemainingS: 0,
      az: this.rng.range(0, 360),
      emitS: 0,
      exposure: 0,
      noiseFactor: 1,
      deadSectors: [],
      armWarningAtS: -999,
    };
    this.radars.push(radar);
    this.radarById.set(radar.id, radar);
    return radar;
  }

  buildDefences() {
    for (const spec of this.scenario.radars ?? []) {
      const type = RADAR_TYPES[spec.type];
      const radar = this.addRadar({ ...type, ...spec, pos: spec.pos, on: spec.on ?? true });
      radar.exposureMult = this.modifiers.exposureMult;
    }

    for (const spec of this.scenario.sites) {
      const type = SAM_TYPES[spec.type];
      const readyRounds = Math.max(1, Math.round(type.readyRounds * this.modifiers.roundsMult));
      // Crew qualifications belong to the crew you are actually with. At your own
      // console they apply in full; across the rest of the sector you get half,
      // because you drilled those batteries but you are not sitting in them.
      const mine = spec.id === this.homeBatteryId;
      const crewMult = (value) => (mine ? value : 1 + (value - 1) * 0.5);
      const m = this.modifiers;
      const site = {
        id: spec.id ?? `site_${spec.type}_${this.sites.length + 1}`,
        type: spec.type,
        name: spec.name ?? `${type.label} ${this.sites.length + 1}`,
        pos: { ...spec.pos },
        alive: true,
        damage: 0,
        readyRounds,
        magazine: this.modifiers.reloadsAllowed
          ? Math.round(type.magazine * this.modifiers.roundsMult)
          : 0,
        reloadRemainingS: 0,
        scootRemainingS: 0,
        displaced: false,
        engagements: [],
        weaponsState: spec.weaponsState ?? 'tight',
        salvoSize: 1,
        // Crew quality starts at whatever the operator brings to it and is only
        // ever degraded from there by casualties.
        reactionMult: crewMult(m.reactionMult),
        reloadMult: crewMult(m.reloadMult),
        scootMult: crewMult(m.scootMult),
        extraChannels: mine ? (m.extraChannels ?? 0) : 0,
        crewLosses: 0,
        blinkUntilS: 0,
        radarId: null,
      };
      const radar = this.addRadar({
        ...type.radar,
        pos: site.pos,
        label: `${site.name} FC`,
        hp: 70,
        on: false,
      }, site.id);
      radar.exposureMult = this.modifiers.exposureMult;
      site.radarId = radar.id;
      this.sites.push(site);
      this.siteById.set(site.id, site);
    }
  }

  buildWaves() {
    this.pendingWaves = [];
    const scale = this.difficulty.raidScale;

    for (const wave of this.scenario.waves) {
      const count = Math.max(1, Math.round((wave.count ?? 1) * (wave.scalable === false ? 1 : scale)));
      for (let i = 0; i < count; i++) {
        const spread = wave.spreadDeg ?? 12;
        const bearingDeg = (wave.bearingDeg ?? 0) + (count === 1 ? 0 : (i / (count - 1) - 0.5) * spread);
        this.pendingWaves.push({
          atS: (wave.atS ?? 0) + i * (wave.spacingS ?? 0),
          type: wave.type,
          bearingDeg,
          distanceKm: wave.distanceKm ?? 155,
          altM: wave.altM,
          targetAssetId: wave.targetAssetId ?? null,
          waypoints: wave.waypoints ?? null,
          name: wave.name ?? null,
        });
      }
    }
    this.pendingWaves.sort((a, b) => a.atS - b.atS);
    this.stats.sortiesTotal = this.pendingWaves.filter((w) => w.type !== 'civil').length;
  }

  applyRole(role, batteryId) {
    this.control.role = role;
    this.control.netIsHuman = role === 'net' || role === 'both';
    if (role === 'crew' || role === 'both') {
      const preferred = batteryId ?? this.scenario.playerBatteryId;
      const site = this.siteById.get(preferred) ?? this.sites[0];
      this.control.crewedBatteryId = site?.id ?? null;
      if (site) site.crewed = true;
    }
    // The player's own set starts cold — coming up is their decision, and their
    // risk. Every other battery is under AI emissions discipline from the first
    // second, which includes deciding when to search.
    const crewed = this.control.crewedBatteryId;
    if (crewed) {
      const site = this.siteById.get(crewed);
      const radar = this.radarById.get(site?.radarId);
      if (radar) radar.on = false;
    }
  }

  /* ---------------------------------------------------------------- *
   * Reporting hooks used by the other modules
   * ---------------------------------------------------------------- */

  log(kind, text, meta = {}) {
    const event = { t: this.t, kind, text, ...meta };
    this.events.push(event);
    if (this.events.length > 300) this.events.shift();
    return event;
  }

  standingDelta(amount, reason) { standingDelta(this, amount, reason); }

  hostileTrackCount() {
    let n = 0;
    for (const track of this.tracks.values()) {
      if (track.hostility !== 'friendly' && track.quality > 0.2) n++;
    }
    return n;
  }

  /** Radars you are responsible for — which is all of them. */
  ownedRadars() { return this.radars.filter((r) => r.alive); }

  dropTrack(id, reason) {
    const track = this.tracks.get(id);
    if (!track) return;
    for (const siteId of track.assignedTo) {
      const site = this.siteById.get(siteId);
      if (!site) continue;
      for (const engagement of [...site.engagements]) {
        if (engagement.trackId === id) endEngagement(this, site, engagement, reason);
      }
    }
    this.tracks.delete(id);
  }

  killAircraft(aircraft, missile) {
    aircraft.alive = false;
    aircraft.deadSinceS = this.t;
    const type = AIR_TYPES[aircraft.type];

    if (type.friendly) {
      this.stats.civilianAircraftShot++;
      this.log('alert', `${aircraft.name} DESTROYED — CIVIL AIRCRAFT`, { severity: 'high' });
      addEffect(this, { kind: 'flash', magnitude: 1, durationS: 1.2 });
    } else {
      this.stats.kills++;
      if (aircraft.type === 'decoy') this.stats.decoysEngaged++;
      this.standingDelta(COMMAND.standing.perKill, `${aircraft.name} destroyed`);
      this.log('good', `SPLASH — ${missile?.trackLabel ?? aircraft.name}`, {
        aircraftId: aircraft.id, severity: 'good',
      });
    }

    // Anything that was pointed at this aircraft has nothing left to guide on.
    for (const track of this.tracks.values()) {
      if (track.truthId === aircraft.id) track.destroyed = true;
    }
  }

  killMissile(missile, reason) {
    missile.alive = false;
    missile.endReason = reason;
  }

  onMissileMiss(target, missile) {
    // Even a clean miss is worth something: it makes the pilot think about home.
    target.threatenedAtS = this.t;
  }

  onArmLaunch(radar, missile, shooter) {
    radar.armWarningAtS = this.t;
    this.log('alert', `LAUNCH WARNING — ANTI-RADIATION ROUND TRACKING ${radar.label}`, {
      radarId: radar.id, severity: 'high',
    });
    addEffect(this, { kind: 'alarm', durationS: 2 });
  }

  onArmMiss(radar, missile, missKm) {
    this.log('good', `${radar.label} — ROUND MISSED`, { radarId: radar.id });
    nearMiss(this, radar, missKm);
  }

  onAircraftExit(aircraft) {
    if (aircraft.type === 'civil') return;
    if (aircraft.aborted) this.stats.turnedBack++;
  }

  registerLeaker(aircraft, asset) {
    this.stats.leakers++;
    this.standingDelta(COMMAND.standing.perLeaker, `${aircraft.name} released on ${asset.label}`);
  }

  warnTargetOfLaunch(target) { target.threatenedAtS = this.t; }

  nearestThreatTo(aircraft) {
    let best = null;
    let bestDist = Infinity;
    for (const missile of this.missiles) {
      if (!missile.alive || missile.targetId !== aircraft.id) continue;
      const d = dist(missile.pos, aircraft.pos);
      if (d < bestDist) { bestDist = d; best = missile; }
    }
    return best;
  }

  pickAssetForRaid(fromPos) {
    const alive = this.assets.filter((a) => !a.destroyed);
    if (alive.length === 0) return null;
    return alive.sort((a, b) => dist(fromPos, a.pos) - dist(fromPos, b.pos))[0];
  }

  damageAsset(asset, amount, source) { damageAsset(this, asset, amount, source); }
  damageRadar(radar, amount, cause) { damageRadar(this, radar, amount, cause); }
  damageSite(site, amount, cause) { damageSite(this, site, amount, cause); }

  /* ---------------------------------------------------------------- *
   * Player commands. Every one of these is also available to the AI.
   * ---------------------------------------------------------------- */

  assign(trackId, siteId, opts = {}) {
    const track = this.tracks.get(trackId);
    const site = this.siteById.get(siteId);
    if (!track || !site) return null;
    const manual = this.control.crewedBatteryId === siteId;
    return beginEngagement(this, site, track, { manual, ...opts });
  }

  unassign(trackId, siteId) {
    const site = this.siteById.get(siteId);
    if (!site) return false;
    const engagement = site.engagements.find((e) => e.trackId === trackId);
    if (!engagement) return false;
    endEngagement(this, site, engagement, 'cancelled');
    return true;
  }

  /** The operator's fire command for a manual engagement. */
  fire(siteId, trackId = null) {
    const site = this.siteById.get(siteId);
    if (!site) return 0;
    const engagement = trackId
      ? site.engagements.find((e) => e.trackId === trackId)
      : site.engagements.find((e) => e.state === 'ready');
    if (!engagement) return 0;
    return fireEngagement(this, site, engagement);
  }

  setWeaponsState(siteId, state) {
    const site = this.siteById.get(siteId);
    if (!site) return;
    site.weaponsState = state;
    this.log('info', `${site.name} — WEAPONS ${state.toUpperCase()}`, { siteId });
    if (state === 'hold') {
      for (const engagement of [...site.engagements]) endEngagement(this, site, engagement, 'weapons hold');
    }
  }

  setSalvo(siteId, size) {
    const site = this.siteById.get(siteId);
    if (!site) return;
    const cap = this.command.constraints.maxSalvo ?? 2;
    site.salvoSize = clamp(size, 1, cap);
  }

  setRadar(radarId, on) {
    const radar = this.radarById.get(radarId);
    if (!radar || !radar.alive) return;
    radar.on = on;
    this.log(on ? 'info' : 'warn', `${radar.label} — ${on ? 'RADIATE' : 'SHUT DOWN'}`, { radarId });
  }

  toggleRadar(radarId) {
    const radar = this.radarById.get(radarId);
    if (radar) this.setRadar(radarId, !radar.on);
  }

  reload(siteId) {
    const site = this.siteById.get(siteId);
    if (!site) return false;
    if (!this.modifiers.reloadsAllowed || site.magazine <= 0) {
      this.log('warn', `${site.name} — NO RESUPPLY AUTHORISED`, { siteId });
      return false;
    }
    return startReload(this, site);
  }

  scoot(siteId) {
    const site = this.siteById.get(siteId);
    if (!site) return false;
    const moved = startScoot(this, site);
    if (moved) {
      this.stats.displacements++;
      // Displacing puts the battery somewhere the enemy's targeting is not.
      const jitter = polar(site.pos, this.rng.range(0, 360), this.rng.range(2.5, 6));
      site.pos = jitter;
      const radar = this.radarById.get(site.radarId);
      if (radar) radar.pos = { ...jitter };
    }
    return moved;
  }

  answer(response) { return answerDirective(this, response); }

  /* ---------------------------------------------------------------- *
   * The tick
   * ---------------------------------------------------------------- */

  spawnDue() {
    while (this.pendingWaves.length && this.pendingWaves[0].atS <= this.t) {
      const spec = this.pendingWaves.shift();
      const type = AIR_TYPES[spec.type];
      const pos = polar(this.centre, spec.bearingDeg, spec.distanceKm);
      const target = spec.targetAssetId
        ? this.assetById.get(spec.targetAssetId)
        : this.pickRaidTarget(spec.type);

      const aircraft = createAircraft({
        seq: ++this.seq.aircraft,
        type: spec.type,
        pos,
        altM: spec.altM ?? type.cruiseAltM,
        hdg: bearing(pos, target?.pos ?? this.centre),
        targetAssetId: target?.id ?? null,
        spawnS: this.t,
        name: spec.name,
        waypoints: spec.waypoints,
      });
      this.aircraft.push(aircraft);
      this.aircraftById.set(aircraft.id, aircraft);
    }
  }

  /** Raids go for what hurts: command first, then the things that fly and shoot. */
  pickRaidTarget(airType) {
    const alive = this.assets.filter((a) => !a.destroyed);
    if (!alive.length) return null;
    const weights = alive.map((asset) => {
      const type = ASSET_TYPES[asset.type];
      let w = type.value;
      if (type.critical) w *= 2.2;
      if (type.civilian) w *= 0.35;      // the town is not the primary objective
      if (airType === 'decoy') w *= 1;   // decoys mimic strikers, so they mimic targets
      return w;
    });
    const total = weights.reduce((a, b) => a + b, 0);
    let roll = this.rng.next() * total;
    for (let i = 0; i < alive.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return alive[i];
    }
    return alive[alive.length - 1];
  }

  step(dt = this.dt) {
    if (this.phase !== 'running') return;
    this.dt = dt;
    this.t += dt;

    this.spawnDue();
    this.plots = stepDetection(this, dt);
    scoreAllTracks(this);

    if (!this.control.netIsHuman) runAiBattleManager(this, dt);
    runBatteryCrews(this, dt);
    // The player's own battery still needs its radar handled if they are running
    // the net rather than sitting in it.
    if (this.control.role === 'net') {
      for (const site of this.sites) {
        if (site.id === this.control.crewedBatteryId) runAiEmcon(this, dt, site);
      }
    }

    stepEngagements(this, dt);
    stepAircraft(this, dt);
    stepMissiles(this, dt);
    stepDamage(this, dt);
    stepCommand(this, dt);
    this.checkEnd();
  }

  /** The raid is over when there is nothing left to spawn, fly, or resolve. */
  checkEnd() {
    if (this.phase !== 'running') return;

    if (this.console.destroyed) {
      this.finish('site-lost');
      return;
    }
    // An aircraft running for the border with a hundred kilometres behind it is
    // no longer part of the fight, and the watch should not be held open waiting
    // for it to finish its flight home.
    const liveHostiles = this.aircraft.some((a) =>
      a.alive && a.type !== 'civil'
      && !(a.state === 'egress' && len(a.pos) > 110));
    const liveRounds = this.missiles.some((m) => m.alive);
    if (this.pendingWaves.length === 0 && !liveHostiles && !liveRounds) {
      this.finish('raid-spent');
    }
  }

  finish(reason) {
    this.phase = 'complete';
    settleDirectives(this);
    this.outcome = this.result(reason);
    this.log(this.outcome.success ? 'good' : 'alert',
      `WATCH ENDS — ${this.outcome.headline}`, { severity: 'high' });
  }

  /**
   * Mission scoring.
   *
   * Assets are worth far more than kills, because the job is not killing
   * aeroplanes — it is keeping the things behind you intact. Rounds cost points
   * so that emptying every rack into the first wave is a decision with a price.
   */
  result(reason = 'raid-spent') {
    const assetScore = this.assets.reduce((sum, asset) => {
      const type = ASSET_TYPES[asset.type];
      if (asset.destroyed) return sum;
      const intact = 1 - clamp01(asset.damage / type.hp);
      return sum + type.value * 10 * intact;
    }, 0);

    const killScore = this.stats.kills * 22;
    const turnedBackScore = this.stats.turnedBack * 18;
    const leakerPenalty = this.stats.leakers * 45;
    const roundCost = this.stats.roundsFired * 3;
    const civilPenalty = this.stats.civilianAircraftShot * 400
      + this.stats.civilianCasualties * 2;
    const equipmentPenalty = this.stats.sitesLost * 60 + this.stats.radarsLost * 35;

    const score = Math.round(
      assetScore + killScore + turnedBackScore
      - leakerPenalty - roundCost - civilPenalty - equipmentPenalty,
    );

    const criticalLost = this.assets.some((a) => ASSET_TYPES[a.type].critical && a.destroyed);
    const success = reason !== 'site-lost' && !criticalLost && this.stats.leakers <= (this.scenario.leakerTolerance ?? 2);

    const tier = tierFor(this.command.standing);
    const headline = reason === 'site-lost'
      ? 'YOUR POSITION WAS OVERRUN'
      : success ? 'SECTOR HELD' : 'SECTOR PENETRATED';

    return {
      missionId: this.scenario.id,
      role: this.control.role,
      reason,
      success,
      headline,
      score,
      standing: this.command.standing,
      tier: tier.id,
      tierLabel: tier.label,
      breakdown: {
        assets: Math.round(assetScore),
        kills: killScore,
        turnedBack: turnedBackScore,
        leakers: -leakerPenalty,
        rounds: -roundCost,
        civilian: -civilPenalty,
        equipment: -equipmentPenalty,
      },
      stats: { ...this.stats },
      ledger: [...this.command.ledger],
      assets: this.assets.map((a) => ({
        label: a.label,
        destroyed: a.destroyed,
        damagePct: Math.round(100 * clamp01(a.damage / ASSET_TYPES[a.type].hp)),
        casualties: a.casualties ?? 0,
      })),
      battery: this.control.crewedBatteryId ? this.batteryReport(this.control.crewedBatteryId) : null,
    };
  }

  /** The SAM operator's own line in the report: what your battery did. */
  batteryReport(siteId) {
    const site = this.siteById.get(siteId);
    if (!site) return null;
    const fired = this.missiles.filter((m) => m.siteId === siteId).length;
    const type = SAM_TYPES[site.type];
    return {
      name: site.name,
      alive: site.alive,
      roundsRemaining: site.readyRounds,
      magazine: site.magazine,
      crewLosses: site.crewLosses ?? 0,
      displaced: this.stats.displacements > 0,
      exposure: this.radarById.get(site.radarId)?.exposure ?? 0,
      type: type.label,
    };
  }

  /** Convenience for the UI: is the player blind right now? */
  get dark() { return consoleDark(this); }
}

export function createWorld(scenario, options) {
  return new World(scenario, options);
}
