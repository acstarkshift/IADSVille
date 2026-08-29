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
import { dist, len, bearing, polar, wrapDeg, clamp, clamp01 } from './math.js';
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
import { composeEnding } from './endings.js';
import { echelonForScenario } from './echelon.js';
import { composeFlightEnding } from './epilogue.js';

/** Minutes on a road, in seconds. The reserve is not an inventory screen. */
const RESERVE_TRANSIT_S = 240;

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

    /*
     * A scenario may impose its own supply situation on top of everything the
     * campaign and the operator bring. It only ever tightens: a watch fought
     * with the depots committed elsewhere is fought with what is on the rails,
     * however well the quartermaster likes you.
     */
    if (scenario.supply) {
      this.modifiers.roundsMult *= scenario.supply.roundsMult ?? 1;
      if (scenario.supply.reloadsAllowed === false) this.modifiers.reloadsAllowed = false;
    }
    /** The service record of whoever is sitting in the chair, if there is one. */
    this.character = options.character ?? null;

    this.t = 0;
    this.dt = SIM.dt;
    this.phase = 'running';       // running | complete
    this.outcome = null;
    /*
     * The centre of the watch. The sector was drawn around the Ville and almost
     * every scenario uses it, but a watch fought entirely over the capital has
     * its geometry — ingress bearings, standoff orbits, the range rings on the
     * scope — measured from the capital instead.
     */
    this.centre = scenario.centre ? { ...scenario.centre } : { x: 0, y: 0 };
    this.nextTn = 1;

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
      /*
       * The state aircraft, on the one watch there is one. Three outcomes and
       * they are not interchangeable: it left, somebody else brought it down,
       * or the person reading this brought it down.
       */
      vipEscaped: false, vipDown: false, vipDownedBy: null, vipRoundsFired: 0,
      turnedBack: 0,
      /** Set once a round lands on the quarter the operator's family lives in. */
      homeDistrictHit: false,
      /** Set if the operator moved their own position out of the way. */
      displacedToSurvive: false,
      /** Set if it was overrun anyway. */
      postOverrun: false,
      /**
       * Rounds expended, attributed to the defended place the target appeared to
       * be going for. On the last watch this is the record of what you chose,
       * and it is compiled from what you shot at rather than from anything you
       * were asked to declare.
       */
      roundsByAsset: {},
      /** The same figures gathered by side of the sector. */
      roundsByCluster: {},
      /** Rounds fired at targets the priority of fires told you to ignore. */
      roundsAgainstOrder: 0,
      /** Rounds spent defending something the expenditure freeze excluded. */
      roundsAgainstFreeze: 0,
      /** Rounds fired at something on the far side of the Listonian border. */
      roundsAcrossBorder: 0,
    };

    this.control = {
      role: options.role ?? 'net',
      netIsHuman: options.role !== 'crew',
      crewedBatteryId: null,
    };

    /**
     * What this appointment is allowed to command directly.
     *
     * At battalion and sector command there is one formation and it is yours,
     * so this is invisible. From district command upward it is the whole game:
     * four sectors, two hands, and a handover cost every time you change your
     * mind about which fight is yours.
     */
    this.echelon = echelonForScenario(scenario);
    this.formations = [];
    this.formationById = new Map();
    this.reserve = {
      rounds: scenario.reserveRounds ?? this.echelon.reserveRounds,
      released: 0,
      frozen: false,
      inTransit: [],
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
    this.buildFormations();
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
        /** Which side of the sector this belongs to, where that matters. */
        cluster: spec.cluster ?? null,
        /** A post packs up and moves when the battery it sits with displaces. */
        follows: spec.follows ?? null,
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

  /**
   * Group the batteries into the formations somebody actually commands.
   *
   * A scenario that names no formations gets one containing everything, which
   * is what a battalion or a sector is: one command, one commander, and that
   * commander is the player. From district command upward the scenario names
   * them, each with an officer whose competence and reading of their orders are
   * fixed at the start and never explained to you.
   */
  buildFormations() {
    const specs = this.scenario.formations ?? [{
      id: 'f_command',
      name: this.scenario.formationName ?? 'THIS COMMAND',
      tm: 'ЭТА КОМАНДА',
      en: 'This command',
    }];

    for (const spec of specs) {
      const formation = {
        id: spec.id,
        name: spec.name,
        tm: spec.tm ?? spec.name,
        en: spec.en ?? spec.name,
        /** Where the formation's own responsibility lies, for the scope. */
        pos: spec.pos ? { ...spec.pos } : null,
        posture: spec.posture ?? 'tight',
        /**
         * Your own headquarters battalion.
         *
         * Every commander from district level upward has one formation that is
         * simply theirs — the batteries sitting around the post they are
         * sitting in. It is always under your hand and it never counts against
         * what the appointment lets you hold, because nobody has to hand it to
         * you. It is also, on the last watch, the thing the enemy is coming for.
         */
        hq: spec.hq === true,
        direct: false,
        handoverUntilS: 0,
        takenAtS: -Infinity,
        thinkTimerS: 0,
        commander: spec.commander
          ? { competence: 1, political: false, ...spec.commander }
          : { name: null, competence: 1, political: false },
        /** Rounds released to it out of the strategic reserve. */
        reserveReceived: 0,
      };
      this.formations.push(formation);
      this.formationById.set(formation.id, formation);
    }

    // Anything the scenario forgot to place belongs to the first formation, so
    // a battery can never end up commanded by nobody.
    const fallback = this.formations[0];
    for (const site of this.sites) {
      const spec = this.scenario.sites.find((x) => x.id === site.id);
      const formation = this.formationById.get(spec?.formation) ?? fallback;
      site.formationId = formation.id;
      // The formation's standing order is the batteries' weapons state: there
      // is no second system, so what you told a sector is exactly what its
      // batteries are doing.
      site.weaponsState = spec?.weaponsState ?? formation.posture;
    }

    /*
     * Everything you may hold at once, held from the first second. At battalion
     * and sector that is the single formation; higher up it is whichever ones
     * the scenario opens you in, and the rest are already fighting on their
     * standing orders before you have looked at them.
     */
    {
      const subordinate = this.formations.filter((f) => !f.hq);
      const limit = Number.isFinite(this.echelon.directLimit)
        ? this.echelon.directLimit : subordinate.length;
      const opening = this.scenario.openInFormations
        ?? subordinate.slice(0, limit).map((f) => f.id);
      for (const formation of this.formations) {
        if (formation.hq || opening.includes(formation.id)) {
          formation.direct = true;
          formation.takenAtS = -1;
        }
      }
    }
  }

  /** Every battery under a formation. */
  sitesOf(formation) {
    return this.sites.filter((s) => s.alive && s.formationId === formation.id);
  }

  formationOf(siteId) {
    return this.formationById.get(this.siteById.get(siteId)?.formationId) ?? null;
  }

  /**
   * Is a human actually running this formation's assignments right now?
   *
   * Two things have to be true: the appointment holds it directly, and the
   * player is in the net seat rather than sitting in a battery. An operator
   * crewing a gun holds no formations in any sense that matters — the net above
   * them is run by somebody else, and this is what tells the AI to run it.
   */
  formationIsHumanRun(formation) {
    return this.control.netIsHuman && formation.direct && this.t >= formation.handoverUntilS;
  }

  /** Is this formation under this appointment's own hand, whoever is sitting where? */
  isDirect(formationId) {
    const formation = this.formationById.get(formationId);
    return !!formation?.direct && this.t >= formation.handoverUntilS;
  }

  /**
   * Take a formation under your own hand.
   *
   * You may hold as many as the appointment allows and no more, so taking a
   * third sector at district command means letting go of the one you have held
   * longest — and both of them go quiet for the handover, because a command
   * changing hands in the middle of a raid is not instantaneous and pretending
   * otherwise would remove the only cost this decision has.
   */
  takeDirect(formationId) {
    const formation = this.formationById.get(formationId);
    if (!formation || !this.control.netIsHuman) return false;
    if (formation.direct) return false;

    if (formation.hq) { formation.direct = true; return true; }

    const limit = this.echelon.directLimit;
    const held = this.formations.filter((f) => f.direct && !f.hq);
    if (held.length >= limit) {
      const oldest = held.sort((a, b) => a.takenAtS - b.takenAtS)[0];
      this.releaseDirect(oldest.id, 'to take another');
    }

    formation.direct = true;
    formation.takenAtS = this.t;
    formation.handoverUntilS = this.t + this.echelon.handoverS;
    this.log('info', `${formation.name} — UNDER DIRECT COMMAND`, { formationId: formation.id });
    return true;
  }

  releaseDirect(formationId, why = null) {
    const formation = this.formationById.get(formationId);
    if (!formation || !formation.direct) return false;
    // You cannot hand your own headquarters to anybody. There is nobody to hand
    // it to; that is what makes it yours.
    if (formation.hq) return false;
    formation.direct = false;
    formation.handoverUntilS = this.t + this.echelon.handoverS;
    formation.thinkTimerS = 0;
    this.log('info', `${formation.name} — RELEASED${why ? ` ${why}` : ''}`
      + `${formation.commander?.name ? ` TO ${formation.commander.name}` : ''}`,
    { formationId: formation.id });
    return true;
  }

  /**
   * The standing order you leave a formation with.
   *
   * This is the only thing a district or national commander can say to three
   * quarters of their command, and it is said once, in advance, about a fight
   * that has not happened yet.
   */
  setPosture(formationId, posture) {
    const formation = this.formationById.get(formationId);
    if (!formation) return false;
    formation.posture = posture;
    for (const site of this.sitesOf(formation)) this.setWeaponsState(site.id, posture);
    this.log('info', `${formation.name} — WEAPONS ${posture.toUpperCase()}`, { formationId: formation.id });
    return true;
  }

  /** May the operator give this battery an order at this moment? */
  commandable(siteId) {
    const formation = this.formationOf(siteId);
    if (!formation) return true;
    // Your own console is always your own console.
    if (this.control.crewedBatteryId === siteId) return true;
    return this.isDirect(formation.id);
  }

  /* ---------------------------------------------------------------- *
   * The strategic reserve — national command only.
   * ---------------------------------------------------------------- */

  /**
   * Release rounds to a formation.
   *
   * Nobody below national command can do this, there are sixteen of them, and
   * they take four minutes to reach a rail. It is not enough to save two of
   * anything, which is the point: the reserve is not a resource, it is a
   * question about which place you have decided matters.
   */
  commitReserve(formationId, rounds = 4) {
    const formation = this.formationById.get(formationId);
    if (!formation) return 0;
    if (this.reserve.frozen) {
      this.log('warn', 'RESERVE IS FROZEN BY ORDER OF THE MINISTRY', { severity: 'high' });
      return 0;
    }
    const sending = Math.min(rounds, this.reserve.rounds);
    if (sending <= 0) return 0;

    /*
     * The reserve is fires like any other fires, and a priority of fires you
     * acknowledged covers it. Sending the national reserve to a place the order
     * says is not a defended place is the largest single act of disobedience
     * available anywhere in this game, and it is logged in the same column as
     * everything else.
     */
    const priorityId = this.command?.constraints?.priorityOfFiresId;
    if (priorityId) {
      const priority = this.assetById.get(priorityId);
      const covers = priority && this.sitesOf(formation)
        .some((site) => dist(site.pos, priority.pos) <= SAM_TYPES[site.type].maxRangeKm);
      if (!covers) {
        this.stats.roundsAgainstOrder += sending;
        this.noteFiresOutsidePriority();
      }
    }

    this.reserve.rounds -= sending;
    this.reserve.released += sending;
    this.reserve.inTransit.push({
      formationId, rounds: sending, arrivesAtS: this.t + RESERVE_TRANSIT_S,
    });
    this.log('info', `RESERVE — ${sending} ROUNDS RELEASED TO ${formation.name}`,
      { formationId: formation.id });
    return sending;
  }

  /** Rounds on the road. They arrive when they arrive. */
  stepReserve() {
    if (!this.reserve.inTransit.length) return;
    const arrived = this.reserve.inTransit.filter((c) => c.arrivesAtS <= this.t);
    if (!arrived.length) return;
    this.reserve.inTransit = this.reserve.inTransit.filter((c) => c.arrivesAtS > this.t);
    for (const convoy of arrived) {
      const formation = this.formationById.get(convoy.formationId);
      const sites = formation ? this.sitesOf(formation) : [];
      if (!sites.length) continue;
      formation.reserveReceived += convoy.rounds;
      for (let i = 0; i < convoy.rounds; i++) sites[i % sites.length].magazine += 1;
      this.log('good', `${formation.name} — ${convoy.rounds} ROUNDS DELIVERED`,
        { formationId: formation.id });
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
          /*
           * A wave may name the exact point it comes from instead of a bearing
           * and a range off the centre. Bearings are the right way to describe
           * a raid arriving over a frontier; they are a poor way to describe an
           * aircraft leaving a particular runway, or a pair of fighters placed
           * to cut a particular corner.
           */
          pos: wave.pos ? this.formationSlot(wave, i, count) : null,
        });
      }
    }
    this.pendingWaves.sort((a, b) => a.atS - b.atS);
    // Friendly movements are not sorties. An airliner crossing the corridor and
    // a state aircraft leaving the country are both traffic, not raid.
    this.stats.sortiesTotal = this.pendingWaves.filter((w) => !AIR_TYPES[w.type]?.friendly).length;
  }

  /**
   * Where the i-th aircraft of a positioned wave actually starts.
   *
   * A wave given a point rather than a bearing is a formation, not a stack:
   * the aircraft are spread abeam of their run-in, so a pair of fighters
   * crossing the frontier crosses it line abreast the way a pair does.
   */
  formationSlot(wave, i, count) {
    if (count === 1) return { ...wave.pos };
    const abeam = wrapDeg(bearing(wave.pos, this.centre) + 90);
    return polar(wave.pos, abeam, (i - (count - 1) / 2) * (wave.spacingKm ?? 12));
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

    if (type.isVip) {
      /*
       * Who fired decides everything that follows. An air-to-air round is the
       * fighters doing what they came to do and you failing to stop them; a
       * surface-to-air round is a decision taken at this console, by somebody
       * who had to select a track the system had already identified as
       * friendly and then give a fire order against it.
       */
      this.stats.vipDown = true;
      this.stats.vipDownedBy = missile?.kind === 'aam' ? 'enemy' : 'operator';
      this.log('alert', `${aircraft.name} DESTROYED`, { severity: 'high' });
      addEffect(this, { kind: 'flash', magnitude: 1, durationS: 1.4 });
    } else if (type.friendly) {
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
    if (AIR_TYPES[aircraft.type].isVip) {
      this.stats.vipEscaped = true;
      this.log('good', `${aircraft.name} — CLEAR OF NATIONAL AIRSPACE`, { severity: 'high' });
      return;
    }
    if (aircraft.type === 'civil') return;
    if (aircraft.aborted) this.stats.turnedBack++;
  }

  /** The aircraft the whole watch is about, while it is still flying. */
  vipAircraft() {
    return this.aircraft.find((a) => a.alive && AIR_TYPES[a.type].isVip) ?? null;
  }

  /** Rounds committed against the state aircraft, and the first site to do it. */
  registerVipFires(site, count) {
    this.stats.vipRoundsFired += count;
    if (!this.stats.vipFiredFirstBy) this.stats.vipFiredFirstBy = site.name;
    this.log('alert', `${site.name} — ROUNDS AWAY ON STATE 01`, { severity: 'high' });
  }

  /**
   * Does this contact hold the watch open?
   *
   * Everything hostile does, until it is a hundred kilometres out and running.
   * Civil traffic never does — the watch is not waiting on an airliner to leave
   * the corridor. The state aircraft does, and is the only friendly that ever
   * has: the entire question of that watch is whether it gets out, so ending it
   * the moment the last fighter dies would decide the thing being asked.
   */
  holdsWatchOpen(aircraft) {
    if (!aircraft.alive) return false;
    const type = AIR_TYPES[aircraft.type];
    if (type.friendly && !type.isVip) return false;
    // Measured from the centre of the watch rather than from the map origin.
    // On a district board the far sectors are a hundred kilometres out to begin
    // with, and an origin-relative rule held the watch open for six minutes
    // after the last aircraft had turned for home.
    return !(aircraft.state === 'egress' && dist(aircraft.pos, this.centre) > 110);
  }

  registerLeaker(aircraft, asset) {
    this.stats.leakers++;
    this.standingDelta(COMMAND.standing.perLeaker, `${aircraft.name} released on ${asset.label}`);
  }

  warnTargetOfLaunch(target) { target.threatenedAtS = this.t; }

  /**
   * Attribute a salvo to whatever the track was heading for.
   *
   * This is how the game finds out what you decided, without ever asking you.
   * A priority-of-fires order you accepted is enforced against the same figures.
   */
  registerRoundsSpent(track, count) {
    const assetId = track.predictedAssetId;
    if (!assetId) return;
    this.stats.roundsByAsset[assetId] = (this.stats.roundsByAsset[assetId] ?? 0) + count;

    const cluster = this.assetById.get(assetId)?.cluster;
    if (cluster) {
      this.stats.roundsByCluster[cluster] = (this.stats.roundsByCluster[cluster] ?? 0) + count;
    }

    /*
     * The expenditure freeze: rounds spent on the excluded place are counted,
     * announced once, and cost almost nothing. Sector command is not angry that
     * you defended the hospital. It simply does not recognise that you did.
     */
    const excluded = this.command.constraints.freezeExcludedId;
    if (excluded && assetId === excluded) {
      this.stats.roundsAgainstFreeze += count;
      if (!this.command.constraints.freezeBreachLogged) {
        this.command.constraints.freezeBreachLogged = true;
        this.log('warn', this.narrativePressure
          ? 'SECTOR ACTUAL: THAT EXPENDITURE IS OUTSIDE THE FREEZE. IT WILL BE QUERIED.'
          : 'EXPENDITURE OUTSIDE FREEZE.', { severity: 'high' });
      }
    }

    const excludedBorder = this.command.constraints.borderExcludedId;
    if (excludedBorder && assetId === excludedBorder) {
      this.stats.roundsAcrossBorder += count;
      if (!this.command.constraints.borderBreachLogged) {
        this.command.constraints.borderBreachLogged = true;
        this.log('warn', this.narrativePressure
          ? 'SECTOR ACTUAL: THAT ENGAGEMENT IS OUTSIDE NATIONAL TERRITORY. IT IS ON THE TAPE.'
          : 'ENGAGEMENT OUTSIDE NATIONAL TERRITORY.', { severity: 'high' });
      }
    }

    const priority = this.command.constraints.priorityOfFiresId;
    if (!priority) return;
    // The order names a place, but it means a side: firing at something bound
    // for the capital's power station is not a breach of a palace priority.
    const priorityCluster = this.assetById.get(priority)?.cluster;
    if (assetId === priority) return;
    if (priorityCluster && cluster === priorityCluster) return;

    // Firing outside an accepted priority of fires. It is recorded either way;
    // the first time, sector command says so out loud.
    this.stats.roundsAgainstOrder += count;
    this.noteFiresOutsidePriority();
  }

  /** Said out loud once, and written down every time. */
  noteFiresOutsidePriority() {
    if (this.command.constraints.priorityBreachLogged) return;
    this.command.constraints.priorityBreachLogged = true;
    this.log('alert', this.narrativePressure
      ? 'SECTOR ACTUAL: YOU ARE FIRING OUTSIDE THE PRIORITY OF FIRES. THE LOG IS RUNNING.'
      : 'ORDER VIOLATION: FIRES OUTSIDE DESIGNATED PRIORITY.', { severity: 'high' });
  }

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

  /**
   * A weapon whose target no longer exists looks for something else nearby.
   *
   * "Nearby" is the operative word: a cruise missile programmed against the
   * valley cannot re-attack a capital a hundred and seventeen kilometres away.
   * Without the limit, abandoning one city actively worsened the other, and
   * committing to a side became strictly worse than spreading — which is the
   * opposite of the decision the last watch is meant to pose.
   */
  pickAssetForRaid(fromPos, maxRangeKm = 45) {
    const alive = this.assets
      .filter((a) => !a.destroyed && dist(fromPos, a.pos) <= maxRangeKm)
      .sort((a, b) => dist(fromPos, a.pos) - dist(fromPos, b.pos));
    return alive[0] ?? null;
  }

  /**
   * A battery ordered away.
   *
   * It packs up and drives out of the sector, and it is not a casualty — the
   * returns will show it as a redeployment, correctly, and the place it was
   * covering will show as undefended, also correctly, and nobody will put those
   * two lines on the same page.
   */
  withdrawSite(siteId, reason = 'redeployed') {
    const site = this.siteById.get(siteId);
    if (!site || !site.alive) return false;
    site.alive = false;
    site.withdrawn = true;
    site.engagements = [];
    const radar = this.radarById.get(site.radarId);
    if (radar) { radar.alive = false; radar.on = false; radar.state = 'off'; }
    this.stats.sitesWithdrawn = (this.stats.sitesWithdrawn ?? 0) + 1;
    this.log('warn', `${site.name} — OFF THE AIR, ${reason.toUpperCase()}`,
      { siteId: site.id, severity: 'high' });
    return true;
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
    // A battery in a formation you are not commanding does not take your orders.
    // It is not being insubordinate; you are simply not on its net.
    if (!this.commandable(siteId)) return null;
    const manual = this.control.crewedBatteryId === siteId;
    return beginEngagement(this, site, track, { manual, ...opts });
  }

  unassign(trackId, siteId) {
    const site = this.siteById.get(siteId);
    if (!site) return false;
    // You cannot call off an engagement being run by somebody else's command
    // any more than you could have ordered it.
    if (!this.commandable(siteId)) return false;
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

      /*
       * Anything that lives with this battery packs up and goes with it — the
       * forward post included. Rounds already tracking the old grid reference
       * arrive at an empty field, which is the entire reason to move, and is
       * also why moving is the deliberate act of saving yourself rather than a
       * tactical adjustment.
       */
      for (const asset of this.assets) {
        if (asset.follows !== site.id || asset.destroyed) continue;
        asset.pos = { ...jitter };
        if (site.id === this.homeBatteryId) {
          this.stats.displacedToSurvive = true;
          this.log('warn', `${asset.label} — DISPLACING WITH ${site.name}`, { assetId: asset.id });
        }
      }
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
      const pos = spec.pos ?? polar(this.centre, spec.bearingDeg, spec.distanceKm);
      const target = spec.targetAssetId
        ? this.assetById.get(spec.targetAssetId)
        : this.pickRaidTarget(spec.type);

      const aircraft = createAircraft({
        seq: ++this.seq.aircraft,
        type: spec.type,
        pos,
        altM: spec.altM ?? type.cruiseAltM,
        hdg: bearing(pos, spec.waypoints?.[0] ?? target?.pos ?? this.centre),
        targetAssetId: target?.id ?? null,
        // The grid reference the sortie was planned against.
        briefedPos: target ? { ...target.pos } : null,
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

    // Always: it runs the formations the player is not personally commanding,
    // which at battalion and sector is none of them and at national command is
    // nearly the whole country.
    runAiBattleManager(this, dt);
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
    this.stepReserve();
    this.checkEnd();
  }

  /** The raid is over when there is nothing left to spawn, fly, or resolve. */
  checkEnd() {
    if (this.phase !== 'running') return;

    if (this.console.destroyed) {
      /*
       * Being overrun must never be a way out. If the watch simply stopped when
       * the post fell, the raid still in the air would never arrive and losing
       * your position would *spare* the cities — so the rest of the night is
       * played out with your batteries inert, and the figures in the debrief
       * are the ones that would actually have been recorded.
       */
      if (this.scenario.finale || this.scenario.epilogue) this.playOutWithoutYou();
      this.finish('site-lost');
      return;
    }
    // An aircraft running for the border with a hundred kilometres behind it is
    // no longer part of the fight, and the watch should not be held open waiting
    // for it to finish its flight home.
    const liveHostiles = this.aircraft.some((a) => this.holdsWatchOpen(a));
    const liveRounds = this.missiles.some((m) => m.alive);
    if (this.pendingWaves.length === 0 && !liveHostiles && !liveRounds) {
      this.finish('raid-spent');
    }
  }

  /**
   * Run the remainder of the raid with the operator gone: no assignments, no
   * emissions control, nothing but the batteries that were already fighting and
   * whatever the enemy does next. Bounded, because it must always terminate.
   */
  playOutWithoutYou() {
    for (const site of this.sites) {
      if (site.id === this.homeBatteryId) {
        site.alive = false;
        site.engagements = [];
      }
    }
    const wasDestroyed = this.console.destroyed;
    this.console.destroyed = false;   // so checkEnd does not recurse
    let steps = 0;
    while (steps < 20000) {
      const liveHostiles = this.aircraft.some((a) => this.holdsWatchOpen(a));
      if (this.pendingWaves.length === 0 && !liveHostiles && !this.missiles.some((m) => m.alive)) break;
      this.t += this.dt;
      this.spawnDue();
      stepDetection(this, this.dt);
      scoreAllTracks(this);
      runBatteryCrews(this, this.dt);
      stepEngagements(this, this.dt);
      stepAircraft(this, this.dt);
      stepMissiles(this, this.dt);
      steps++;
    }
    this.console.destroyed = wasDestroyed;
    this.stats.postOverrun = true;
  }

  finish(reason) {
    this.phase = 'complete';
    settleDirectives(this);

    /*
     * The last watch is scored twice: once by the rules that score every watch,
     * and once by what it actually cost. The ending is read off what was
     * defended, and its standing effect lands before the result is composed so
     * the debrief shows the figure the file will carry.
     */
    if (this.scenario.finale) {
      const provisional = this.result(reason);
      const ending = composeEnding(provisional, this.character,
        { narrativePressure: this.narrativePressure });
      standingDelta(this, ending.standing,
        this.narrativePressure ? ending.subtitle.toLowerCase() : ending.title.toLowerCase());
      this.endingId = ending.id;
    }

    /*
     * The epilogue is read the same way, off what actually happened, but its
     * standing has already been settled on the command net — the arithmetic
     * there needs to know how many rounds went at the aircraft and whether the
     * order was acknowledged, which is not something an ending text should be
     * doing. So this only names the outcome.
     */
    if (this.scenario.epilogue) {
      this.endingId = composeFlightEnding(this.result(reason), this.character,
        { narrativePressure: this.narrativePressure }).id;
    }

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
    // Scored on what a place is actually worth, which is not always what sector
    // command's ledger says it is worth.
    const assetScore = this.assets.reduce((sum, asset) => {
      const type = ASSET_TYPES[asset.type];
      if (asset.destroyed) return sum;
      const intact = 1 - clamp01(asset.damage / type.hp);
      return sum + (type.scoreValue ?? type.value) * 10 * intact;
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
      /*
       * Negated terms are normalised through `|| 0`: negating a zero penalty
       * yields -0, which is a real value that renders as "−0" in a debrief and
       * compares unequal to 0 under strict equality.
       */
      breakdown: {
        assets: Math.round(assetScore),
        kills: killScore,
        turnedBack: turnedBackScore,
        leakers: -leakerPenalty || 0,
        rounds: -roundCost || 0,
        civilian: -civilPenalty || 0,
        equipment: -equipmentPenalty || 0,
      },
      stats: { ...this.stats },
      ledger: [...this.command.ledger],
      /** Orders accepted or refused, for the endings to read. */
      constraints: { ...this.command.constraints },
      finale: this.scenario.finale === true,
      epilogue: this.scenario.epilogue === true,
      endingId: this.endingId ?? null,
      assets: this.assets.map((a) => ({
        id: a.id,
        type: a.type,
        label: a.label,
        destroyed: a.destroyed,
        damagePct: Math.round(100 * clamp01(a.damage / ASSET_TYPES[a.type].hp)),
        casualties: a.casualties ?? 0,
        districtsHit: a.districtsHit ?? [],
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
