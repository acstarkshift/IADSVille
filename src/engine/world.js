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
  SIM, SAM_TYPES, RADAR_TYPES, ASSET_TYPES, AIR_TYPES, DETECTION, DIFFICULTY, COMMAND, DAMAGE,
} from './config.js';
import { makeRng } from './rng.js';
import { dist, len, bearing, polar, wrapDeg, clamp, clamp01, absDeltaDeg } from './math.js';
import { stepDetection, rememberGhost } from './detection.js';
import { stepMissiles, inEnvelope, timeToInRangeS } from './weapons.js';
import { stepAircraft, createAircraft } from './ai.js';
import { scoreAllTracks, cannotEngageReason } from './threat.js';
import {
  stepEngagements, runAiBattleManager, runBatteryCrews, runAiEmcon, runSurveillanceEmcon,
  stepFireControl,
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

/**
 * Log kinds that are the watch doing something TO the operator.
 *
 * A launch, a kill, an alarm, a warning, an order, somebody on the radio. NOT
 * `info`, which is the console echoing the operator's own switches and the
 * machinery narrating itself — a set warming up, a channel claimed, an
 * antenna reporting that it is radiating. The distinction exists because the
 * anti-silence device below was being switched off by exactly that noise, and
 * it is the same set `tools/playtest.mjs` counts when it measures dead air, on
 * purpose: the mechanism and the instrument that judges it must not disagree
 * about what a quiet console is.
 */
export const ACTION_KINDS = new Set(['launch', 'good', 'alert', 'warn', 'command', 'comms']);

export class World {
  constructor(scenario, options = {}) {
    this.scenario = scenario;
    this.seed = options.seed ?? scenario.seed ?? 'iadsville';
    this.rng = makeRng(this.seed);
    this.difficulty = DIFFICULTY[options.difficulty ?? 'veteran'] ?? DIFFICULTY.veteran;
    this.narrativePressure = options.narrativePressure ?? true;
    /** The campaign's correspondence thread, read only by the finale endings. */
    this.family = options.family ?? null;
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
    /** Monotonic id for log events; the events list itself is capped. */
    this.eventSeq = 0;

    // Id sequences are per world, so two worlds in one process stay independent
    // and a seed always replays the same way.
    this.seq = { aircraft: 0, missile: 0, radar: 0 };

    this.assets = [];
    this.sites = [];
    this.radars = [];
    this.aircraft = [];
    this.missiles = [];
    this.tracks = new Map();
    /**
     * Numbers the sector has recently lost contact with, so a contact that
     * comes back out of a coverage seam comes back as itself. See
     * `rememberGhost` in detection.js.
     */
    this.trackGhosts = [];
    /**
     * When the first contact of the night appeared on the plot, or null while
     * the tube is still empty. The command net reads it: an order is timed
     * from the start of the fighting rather than from the handover, because
     * first contact moves by two-thirds of a minute across a watch's seeds and
     * a grace counted from t=0 does not. See `stepCommand`.
     */
    this.firstContactAtS = null;
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
      /** Arrivals at a place the expenditure freeze struck off — counted in
       *  `leakers` for the night's truth, but not a leaker the file recognises. */
      leakersUnrecognized: 0,
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
      /**
       * The subset of those that were somebody's decision at THIS console — a
       * manual fire order, or an assignment made by a human on the net. The
       * finale reads personal agency off this ledger; the state's ledger keeps
       * reading the whole tape, because the file never cared who fired.
       */
      yourRoundsByCluster: {},
      /** Rounds fired at targets the priority of fires told you to ignore. */
      roundsAgainstOrder: 0,
      /** Rounds spent defending something the expenditure freeze excluded. */
      roundsAgainstFreeze: 0,
      /** Rounds fired at something on the far side of the Listonian border. */
      roundsAcrossBorder: 0,
      /** Rounds fired inside a civil corridor you acknowledged. */
      roundsInCorridor: 0,
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
    this.pendingChatter = this.buildOpeningChatter();
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
      blinkUntilS: 0,
      /**
       * A sectored set: an antenna on a mount that cannot see behind itself.
       *
       * `fovDeg` null is the ordinary case — a surveillance or acquisition set
       * turning through the full circle. A fire-control set instead holds a
       * boresight and covers `fovDeg` around it, slewing at `slewRateDegPerS`
       * to keep the targets it is working inside that arc. It is why a
       * long-range battalion cannot simply answer two axes at once.
       */
      fovDeg: spec.fovDeg ?? null,
      slewRateDegPerS: spec.slewRateDegPerS ?? null,
      boresightDeg: spec.boresightDeg ?? this.rng.range(0, 360),
      slewingTo: null,
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
        /**
         * How many rails the launcher has, which is where the rack tops back
         * up to and how many lamps the panel draws. It is the starting rack
         * and not `type.readyRounds` because a deep-magazine qualification
         * scales the rack as well as the store: the loaders must be allowed
         * to refill what the crew was issued.
         */
        rails: readyRounds,
        /**
         * The store behind the rack, and how deep it is on THIS watch.
         *
         * `storeMult` is a scenario's own loadout decision, and it exists
         * because "the magazine is the only thing between the operator and a
         * legal shot" turned out to be a two-part figure once the loaders ran
         * continuously. The loaders' half is small — measured, six to eleven
         * per cent of the watch across these four. The other half is a
         * battalion that has fired its entire allocation and is watching the
         * rest of the raid go past, and no amount of loading faster touches
         * it: on Weasel Hour the crewed BASTION spent all twenty-four of its
         * rounds and then sat unable to shoot for a third of the night.
         *
         * A watch that presents more aeroplanes than the standard load can
         * answer has to say so in its own file rather than in the inventory,
         * because the type's sixteen rounds are right for the watches that
         * were built around them.
         */
        magazine: this.modifiers.reloadsAllowed
          ? Math.round(type.magazine * this.modifiers.roundsMult
            * (this.scenario.storeMult ?? 1))
          : 0,
        /** Seconds until the next round seats. See `stepLoading`. */
        reloadRemainingS: 0,
        /** True while the loaders are out: rails arrive one at a time. */
        loading: false,
        scootRemainingS: 0,
        displaced: false,
        engagements: [],
        weaponsState: spec.weaponsState ?? 'tight',
        salvoSize: 1,
        /**
         * 'doctrine' — the crew blinks by its own safety arithmetic when an
         * anti-radiation round is inbound. 'ride' — a commander has ordered the
         * set held up through guidance regardless. Nobody but a commander ever
         * sets 'ride'.
         */
        emconOrder: 'doctrine',
        // Crew quality starts at whatever the operator brings to it and is only
        // ever degraded from there by casualties.
        reactionMult: crewMult(m.reactionMult),
        /*
         * The operator's crew quality, times whatever the WATCH says about
         * its loaders.
         *
         * `scenario.reloadMult` was set on the teaching watch under a comment
         * explaining exactly why — a full crew on a quiet range reloads fast,
         * and without it one seed in five ended the first watch of the game
         * on a ninety-five second bar with a single blip on the scope — and
         * nothing anywhere read the field. The README quoted it twice, once
         * as "a reload multiplier of 0.35" and once as "a rail there takes
         * four seconds", and a rail there took eleven point nine. Adding it
         * to another scenario produced a byte-identical sixteen-seed table,
         * which is how a dead knob proves it is dead.
         */
        reloadMult: crewMult(m.reloadMult) * (this.scenario.reloadMult ?? 1),
        scootMult: crewMult(m.scootMult),
        extraChannels: mine ? (m.extraChannels ?? 0) : 0,
        crewLosses: 0,
        blinkUntilS: 0,
        radarId: null,
        fcRadarId: null,
      };
      /*
       * The battery's own sets.
       *
       * Most batteries run one: a single set that searches its patch and
       * guides its rounds, which is how a short-range section actually works.
       * A long-range battalion runs two, because you cannot search a whole
       * frontier with the same antenna you are using to hold a target — an
       * acquisition set turning through the full circle, and a fire-control
       * set on a mount with a limited arc that must be slewed onto whatever
       * the battalion is shooting. `site.radarId` stays the search set, which
       * is what the rest of the game means by "the battery's radar";
       * `site.fcRadarId` is what guides.
       */
      const radar = this.addRadar({
        ...type.radar,
        pos: site.pos,
        label: type.fcRadar ? `${site.name} ACQ` : `${site.name} FC`,
        hp: 70,
        on: false,
      }, site.id);
      radar.exposureMult = this.modifiers.exposureMult;
      site.radarId = radar.id;
      site.fcRadarId = radar.id;

      if (type.fcRadar) {
        // The type's `radar` block is the acquisition set for these; the
        // fire-control set is the sectored one and is built second.
        const fc = this.addRadar({
          ...type.fcRadar,
          pos: site.pos,
          label: `${site.name} FC`,
          hp: 70,
          on: false,
        }, site.id);
        fc.exposureMult = this.modifiers.exposureMult;
        site.fcRadarId = fc.id;
      }
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
      /*
       * The callsign of the net above a crewed battery.
       *
       * From the net seat this formation IS the player and nobody transmits to
       * them. From a battery's seat it is somebody else — the command post
       * working the picture and handing you targets — and until this existed
       * that somebody had no name, no rank and no voice: a player asked, in as
       * many words, who was assigning their shootlist, because the game had
       * never once said. Only surfaced where `formationIsHumanRun` is false,
       * so the player is never told they are being ordered about by
       * themselves.
       */
      netCallsign: 'ЦЕНТР · CONTROL',
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
        /**
         * What this formation calls itself on the air when it is talking TO
         * the player rather than being run by them. Named officers use their
         * own name; the anonymous command post above a crewed battery uses
         * this. Read through `netVoice()`, never directly.
         */
        netCallsign: spec.netCallsign ?? null,
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

  /**
   * Who is on the other end of the radio, from the seat the player is in.
   *
   * Null when the answer is "you" — a formation the player is running does not
   * transmit orders to them. Otherwise the named officer if there is one, or
   * the command post's callsign if the formation is the anonymous one a
   * battalion watch synthesises. This is the whole answer to "who is assigning
   * my shootlist", and before it existed the game had no way to say.
   */
  netVoice(formationId) {
    const formation = this.formationById.get(formationId);
    if (!formation || this.formationIsHumanRun(formation)) return null;
    return formation.commander?.name ?? formation.netCallsign ?? null;
  }

  /** Is this formation under this appointment's own hand, whoever is sitting where? */
  /** Every set this battery owns — one for most, two for a battalion. */
  radarsOf(site) {
    return this.radars.filter((r) => r.siteId === site.id);
  }

  /**
   * The thing a track is actually about.
   *
   * Usually an aircraft. Sometimes one of the enemy's rounds — an
   * anti-radiation round on its way to one of your sets, or a weapon a striker
   * has already released — because those are held on the scope too, and can be
   * shot at. Every consumer that used to reach into `aircraftById` goes
   * through here, so a track never silently resolves to nothing.
   */
  truthOf(track) {
    if (!track) return null;
    return this.aircraftById.get(track.truthId)
      ?? this.missiles.find((m) => m.id === track.truthId)
      ?? null;
  }

  /**
   * Is this contact inside an accepted civil corridor?
   *
   * The order names an aircraft, but what it closes is a slice of sky: a
   * wedge either side of the transit's bearing, inside which nobody on the net
   * shoots on their own authority. You still can — the order is a constraint,
   * not a lockout, and the file counts what you spend in there. (Until this
   * existed the corridor was written by the directive and read by nothing at
   * all: it could be neither obeyed nor violated.)
   *
   * Takes anything with a `pos`, so a track or an aircraft both work.
   */
  inCivilCorridor(contact) {
    const id = this.command?.constraints?.civilCorridorId;
    if (!id || !contact) return false;
    const transit = this.aircraftById.get(id);
    if (!transit?.alive) return false;
    return absDeltaDeg(bearing(this.centre, transit.pos), bearing(this.centre, contact.pos))
      <= COMMAND.civilCorridorHalfWidthDeg;
  }

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
    /*
     * Every event carries a monotonic sequence number, and consumers must key
     * on it rather than on array position. The list is capped, and a busy
     * climax minute can push hundreds of entries through it — an index-based
     * consumer compares against a length that stops growing at the cap and
     * silently goes deaf for the rest of the mission, which is precisely the
     * part of the mission with the most to hear.
     */
    const event = { seq: ++this.eventSeq, t: this.t, kind, text, ...meta };
    this.events.push(event);
    if (this.events.length > 300) this.events.shift();
    /*
     * When the watch last did something TO the operator, as opposed to echoing
     * something the machinery did. `reportTheLull` reads this rather than the
     * timestamp of the last line of any kind — see the note there — and it is
     * the same set of kinds the measurement harness counts as activity, so the
     * engine and the instrument cannot disagree about what silence is.
     */
    if (ACTION_KINDS.has(kind)) this._lastActionAtS = this.t;
    return event;
  }

  /**
   * A line that says the same thing as the last one, said at most once every
   * `gapS` seconds per `key`.
   *
   * The engine had one of these already — `armDuckLoggedAtS`, gated at twenty
   * seconds, written after a set announced SHUTTING DOWN hundreds of times in
   * one watch — and then every other repeating refusal in the game was
   * written without it. Measured in one First Light cabin watch: two hundred
   * and eleven copies of "NO FIRING SOLUTION", and at nine minutes all five
   * visible ticker lines were that one sentence. A refusal repeated is a
   * refusal nobody reads, and it costs the operator the watch's actual
   * traffic to say it.
   *
   * The key is the caller's business and should name the thing being refused,
   * not the sentence: one line per battery per reason, so two batteries
   * declining the same track both get heard once.
   */
  logThrottled(key, gapS, kind, text, meta = {}) {
    this._throttledAtS = this._throttledAtS ?? {};
    if (this.t - (this._throttledAtS[key] ?? -9999) < gapS) return null;
    this._throttledAtS[key] = this.t;
    return this.log(kind, text, meta);
  }

  /**
   * Radio traffic between the elements of the net and the person listening.
   *
   * The log is the system talking about itself; this is the crews talking.
   * Same ticker, its own ink, and a rate limit per element — a sector where
   * every battery reports every state change is a sector nobody reads, which
   * is the failure mode the churn cuts were about. An element speaks at most
   * once every few seconds; a launch or a set going down under fire is urgent
   * and always gets through. Somebody else's formation talks less, because
   * from the national seat there are a dozen of them and only one of you.
   */
  comms(from, text, { urgent = false, siteId = null, ...meta } = {}) {
    const site = siteId ? this.siteById.get(siteId) : null;
    // `formationId`, not `formation`. Sites have never carried a `formation`
    // field, so this was always falsy and the twelve-second spacing for
    // somebody else's formation had never once applied — every element on the
    // net spoke at the four-second rate regardless of whose command it was in.
    const distant = site?.formationId && !(this.isDirect?.(site.formationId) ?? true);
    const spacingS = urgent ? 0 : distant ? 12 : 4;
    this._commsAtS = this._commsAtS ?? {};
    if (this.t - (this._commsAtS[from] ?? -999) < spacingS) return null;
    this._commsAtS[from] = this.t;
    return this.log('comms', `${from}: ${text}`, { siteId, ...meta });
  }

  standingDelta(amount, reason) { standingDelta(this, amount, reason); }

  hostileTrackCount() {
    let n = 0;
    for (const track of this.tracks.values()) {
      // Identified hostiles only. Counting 'pending' contacts had sector
      // command demanding no leakers seventeen seconds before the system had
      // classified anything as hostile at all — the tutorial's first
      // interactive moment was a loyalty test about nothing.
      if (track.hostility === 'hostile' && track.quality > 0.2) n++;
    }
    return n;
  }

  /** Radars you are responsible for — which is all of them. */
  ownedRadars() { return this.radars.filter((r) => r.alive); }

  dropTrack(id, reason) {
    const track = this.tracks.get(id);
    if (!track) return;
    /*
     * Losing the contact does not unlearn the number. A track the sector held
     * firmly is remembered for a minute after it fades, so the same aeroplane
     * coming back out of a coverage seam comes back as itself rather than as
     * a new contact with a new number and a fresh announcement.
     */
    if (reason !== 'destroyed') rememberGhost(this, track);
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
      const shooter = missile?.siteId ? this.siteById.get(missile.siteId) : null;
      if (shooter) {
        this.comms(shooter.name, `SPLASH ${missile?.trackLabel ?? aircraft.name}. TARGET DESTROYED.`,
          { urgent: true, siteId: shooter.id, aircraftId: aircraft.id });
      }
      // The kill gets a visible moment — a short bright wash, well under the
      // magnitude of taking a hit yourself. The scope draws the expanding
      // bloom at the impact point off the destroyed track.
      addEffect(this, { kind: 'flash', magnitude: 0.3, durationS: 0.5 });
    }

    // Anything that was pointed at this aircraft has nothing left to guide on.
    this.markTracksDown(aircraft.id);
  }

  /**
   * Flag every track of an aircraft that no longer exists.
   *
   * Called from EVERY path that removes an aircraft from the fight — shot down,
   * a cruise missile arriving, a decoy expiring, an egressor leaving the map —
   * not only from the shoot-down. A coasting track whose truth is already gone
   * still reads as a firm hostile for the better part of a minute, and any
   * commander (human or AI) offered it will assign it, break off two seconds
   * later on "target destroyed", and be offered it again next think. Measured
   * at its worst that churn logged four events a second through a climax and
   * flushed the entire real watch history out of the capped event list.
   */
  markTracksDown(aircraftId) {
    for (const track of this.tracks.values()) {
      if (track.truthId === aircraftId && !track.destroyed) {
        track.destroyed = true;
        track.destroyedAtS = this.t;
      }
    }
  }

  killMissile(missile, reason) {
    missile.alive = false;
    missile.endReason = reason;
    // One of the enemy's rounds is a tracked contact like anything else, so
    // its track has to die with it — otherwise a weapon that has already
    // arrived stays on the board as a firm hostile somebody will assign.
    if (missile.contactType) this.markTracksDown(missile.id);
  }

  onMissileMiss(target, missile) {
    // A miss that resolved at all was a round going past the canopy — that is
    // a credible attack whatever the launch geometry was, and it makes the
    // pilot think very hard about home.
    this.warnTargetOfLaunch(target, true);
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
    // Gone is gone: nothing may be assigned against the coasting ghost.
    this.markTracksDown(aircraft.id);
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

    if (aircraft.state === 'egress') {
      // Measured from the centre of the watch rather than from the map origin.
      // On a district board the far sectors are a hundred kilometres out to
      // begin with, and an origin-relative rule held the watch open for six
      // minutes after the last aircraft had turned for home.
      if (dist(aircraft.pos, this.centre) > 110) return false;
      /*
       * An egressor nothing can touch is already gone. It is running for the
       * rim, no round is chasing it, and no surviving battery can reach it —
       * every long watch used to end on ninety to a hundred and sixty seconds
       * of dead air while survivors flew out to an arbitrary line, and the
       * finale ended on its longest silence. The outcome was decided minutes
       * before the debrief admitted it.
       */
      const targeted = this.missiles.some((m) => m.alive && m.targetId === aircraft.id);
      /*
       * And the reach that matters is the reach doctrine will use: free crews
       * refuse a runner beyond six tenths of their envelope, so a watch held
       * open for that shot is waiting for something forbidden. Measured, the
       * rule at full envelope left five silent minutes of egressors crawling
       * across the outer rings of batteries that had already declined them.
       */
      if (!targeted && !this.anySiteReaches(aircraft, 0.6)) return false;
    }
    return true;
  }

  /**
   * Is the raid over bar the rounds already in the air?
   *
   * The exact condition `checkEnd` uses, minus the rounds — so this is true
   * for the last thirty to sixty seconds of a watch that ends the ordinary
   * way, and it is the window in which the command net must stop transmitting
   * orders nobody will get to answer.
   */
  raidIsSpent() {
    if (this.pendingWaves.length > 0) return false;
    const holding = this.aircraft.filter((a) => this.holdsWatchOpen(a));
    if (!holding.length) return true;
    /*
     * And everything still up that already has a round tracking it is
     * arithmetic, not a fight. Without this clause an order went out one and
     * a half seconds before the debrief, on a watch whose last aeroplane was
     * mid-intercept when it was sent — technically live, and gone before
     * anybody could answer the net.
     */
    return holding.every((a) => this.missiles.some((m) => m.alive && m.targetId === a.id));
  }

  /** Can any surviving battery still put a round on this aircraft? */
  anySiteReaches(aircraft, rangeFraction = 1.05) {
    return this.sites.some((site) => {
      if (!site.alive || site.scootRemainingS > 0) return false;
      if (site.readyRounds <= 0 && site.magazine <= 0) return false;
      const type = SAM_TYPES[site.type];
      return dist(site.pos, aircraft.pos) <= type.maxRangeKm * rangeFraction
        && aircraft.altM <= type.maxAltM && aircraft.altM >= type.minAltM;
    });
  }

  registerLeaker(aircraft, asset) {
    this.stats.leakers++;
    /*
     * The state bills a leaker in proportion to its own valuation of the place
     * the weapon arrived at — the same schedule the asset-loss charge uses. A
     * release on the crossing is a failure; a release on a place the freeze
     * has just declared undesignated is, on this ledger, nothing at all; a
     * release on the encampment it refuses to recognise likewise. The score
     * counts every one of them in full. Billing the full rate here regardless
     * was the arithmetic that quietly made obeying the freeze WORSE for the
     * file than defending the hospital — the campaign's central lesson,
     * inverted by a constant.
     */
    const type = ASSET_TYPES[asset.type];
    const excluded = this.command.constraints.freezeExcludedId === asset.id;
    /*
     * And the file's own leaker count follows the same recognition. The
     * no-leakers settle used to bill every arrival at three points a head,
     * hospital arrivals included — the inversion coming back through a side
     * door: the state grieving, at settlement, for the building it had just
     * declared undesignated. An arrival the freeze does not recognise is not
     * a leaker the file can count. The score, as ever, counts all of them.
     */
    if (excluded) this.stats.leakersUnrecognized++;
    const weight = excluded ? 0 : type.critical ? 1 : Math.min(1, (type.value ?? 0) / 26);
    if (weight > 0) {
      this.standingDelta(COMMAND.standing.perLeaker * weight,
        `${aircraft.name} released on ${asset.label}`);
    }
  }

  /**
   * A launch warning. Every launch makes the target defensive; only a
   * `credible` one — decent launch geometry, or a round that already went
   * past — can break its nerve. The distinction is what stops maximum-range
   * spray from farming aborts.
   */
  warnTargetOfLaunch(target, credible = true) {
    target.threatenedAtS = this.t;
    if (credible) target.crediblyThreatenedAtS = this.t;
  }

  /**
   * Attribute a salvo to whatever the track was heading for.
   *
   * This is how the game finds out what you decided, without ever asking you.
   * A priority-of-fires order you accepted is enforced against the same figures.
   * Callers that know what the engagement was FOR at the moment it was decided
   * pass that stamp; the live prediction is only the fallback, because between
   * decision and release a noisy estimate can wander onto an answer nobody
   * chose.
   */
  registerRoundsSpent(track, count, origin = null, purposeAssetId = null) {
    /*
     * The civil corridor is billed on where the round was fired, not on what
     * it was fired at — a shot into a closed slice of sky is a shot into a
     * closed slice of sky whether or not the picture had worked out what the
     * contact was heading for. So it is counted before the asset gate below,
     * which returns early on an unattributed track.
     */
    if (this.inCivilCorridor(track)) {
      this.stats.roundsInCorridor = (this.stats.roundsInCorridor ?? 0) + count;
      if (!this.command.constraints.corridorBreachLogged) {
        this.command.constraints.corridorBreachLogged = true;
        this.log('warn', this.narrativePressure
          ? 'AIR TRAFFIC: THAT ENGAGEMENT IS INSIDE THE CORRIDOR YOU ACKNOWLEDGED.'
          : 'ENGAGEMENT INSIDE AN ACKNOWLEDGED CIVIL CORRIDOR.', { severity: 'high' });
      }
    }

    const assetId = purposeAssetId ?? track.predictedAssetId;
    if (!assetId) return;
    this.stats.roundsByAsset[assetId] = (this.stats.roundsByAsset[assetId] ?? 0) + count;

    const cluster = this.assetById.get(assetId)?.cluster;
    if (cluster) {
      this.stats.roundsByCluster[cluster] = (this.stats.roundsByCluster[cluster] ?? 0) + count;
      // Free crews' snap shots and subordinate officers' assignments are the
      // sector fighting; a human assignment is you choosing. Only the
      // choosing lands here.
      if (origin === 'assigned' && this.control.netIsHuman) {
        this.stats.yourRoundsByCluster[cluster] = (this.stats.yourRoundsByCluster[cluster] ?? 0) + count;
      }
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
    for (const radar of this.radarsOf(site)) {
      radar.alive = false; radar.on = false; radar.state = 'off';
    }
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
    // The battery says no at the moment of the order, not as a break-off
    // fifteen seconds into a cheerful ENGAGING. Callers surface the reason
    // via cannotEngageReason, which is the same test this refusal runs.
    if (cannotEngageReason(this, site, track)) return null;
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
    if (!engagement) {
      /*
       * A dry fire command answers. Silence on the fire key read as a broken
       * keyboard; the refusal names what is actually missing.
       *
       * Once every twenty seconds per battery, which is the gate the engine
       * already uses for the set that keeps announcing it is shutting down.
       * At the second and a half it used to run at, one First Light cabin
       * watch printed two hundred and eleven copies of this one sentence, and
       * at nine minutes all five visible ticker lines were it. A refusal
       * repeated is a refusal nobody reads, and it costs the operator the
       * watch's actual traffic to say it.
       */
      this.logThrottled(`dryFire:${siteId}`, 20, 'warn',
        `${site.name} — НЕТ РЕШЕНЬЯ · NO FIRING SOLUTION (lock a target first)`, { siteId });
      return 0;
    }
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

  /**
   * The commander's override on the crew's blink arithmetic: 'ride' holds a
   * set radiating through guidance with an anti-radiation round inbound. The
   * crew never chooses this for itself, and no AI officer orders it either —
   * it is the one call in the emissions game reserved for whoever answers for
   * the outcome.
   */
  setEmconOrder(siteId, order) {
    const site = this.siteById.get(siteId);
    if (!site || !this.commandable(siteId)) return false;
    if (order !== 'ride' && order !== 'doctrine') return false;
    if (site.emconOrder === order) return true;
    site.emconOrder = order;
    this.log('warn', order === 'ride'
      ? `${site.name} — ORDERED TO HOLD EMISSIONS THROUGH GUIDANCE`
      : `${site.name} — EMISSIONS PER DOCTRINE`, { siteId });
    return true;
  }

  setRadar(radarId, on) {
    const radar = this.radarById.get(radarId);
    if (!radar) return;
    /*
     * A battery has one emissions posture, not one per antenna. A long-range
     * battalion runs an acquisition set and a fire-control set; the operator
     * has a single RADIATE control for the battery and both sets answer it.
     * The fire-control set's *pointing* is the crew's business, not a switch.
     *
     * And the switch is addressed through `site.radarId`, which is the
     * ACQUISITION set — so an early `if (!radar.alive) return` meant that
     * killing one antenna took the battery's whole emissions control away
     * for the rest of the watch while its other set sat there alive and
     * unreachable. Measured in the cabin: BASTION ACQ destroyed at 161s,
     * RADIATE pressed some seven hundred times over the next twelve minutes
     * with no effect and no message. The order goes to whichever of this
     * battery's sets is still standing.
     */
    const family = radar.siteId
      ? this.radars.filter((r) => r.siteId === radar.siteId && r.alive)
      : (radar.alive ? [radar] : []);
    if (!family.length) {
      const site = radar.siteId ? this.siteById.get(radar.siteId) : null;
      this.logThrottled(`noAntennas:${radar.siteId ?? radar.id}`, 20, 'warn',
        `${site?.name ?? radar.label} — NO ANTENNAS LEFT TO RAISE`,
        { siteId: radar.siteId, radarId: radar.id });
      return;
    }
    /*
     * A switch that is already where you are putting it is not news. The line
     * below is the console echoing an order, and it was printed on every call
     * whether or not anything moved — so anything that reasserts an emissions
     * state each tick (a player model, a script, a finger on the key) filled
     * the ticker with "BASTION ACQ — RADIATING" twice a second. Found by
     * playing the teaching watch in a browser at 4x, where it was most of the
     * log. Nothing changed, nothing said.
     */
    const moved = family.some((r) => r.on !== on);
    for (const r of family) r.on = on;
    if (!moved) return;
    /*
     * And the order sticks. Every battery nobody is sitting in runs
     * `runAiEmcon` once a tick, which used to rewrite `radar.on`
     * unconditionally — so the net seat's SILENCE or RADIATE cap on a battery
     * card was accepted and undone a tenth of a second later, silently, on
     * the watch whose stated lesson is emissions control. A crew that has
     * been given an emissions order follows it; the one thing that still
     * overrides it is the anti-radiation duck, because nobody dies for a
     * switch, and the commander has the RIDE order for that.
     */
    const site = radar.siteId ? this.siteById.get(radar.siteId) : null;
    if (site) {
      site.emconHold = on ? 'radiate' : 'silent';
      site.emconHeldAtS = this.t;
    }
    this.log('info', `${family[0].label} — ${on ? 'RADIATING' : 'SILENT'}`,
      { radarId: family[0].id });
  }

  /**
   * Whichever of a battery's sets is still standing — the one whose lamp the
   * console shows and whose state the RADIATE cap toggles. A battery is one
   * emissions posture, and reading it off a destroyed antenna is how the cap
   * came to be greyed out over a live set.
   */
  liveRadarOf(site) {
    if (!site) return null;
    return this.radarsOf(site).find((r) => r.alive)
      ?? this.radarById.get(site.radarId) ?? null;
  }

  toggleRadar(radarId) {
    const radar = this.radarById.get(radarId);
    if (!radar) return;
    const site = radar.siteId ? this.siteById.get(radar.siteId) : null;
    const shown = site ? this.liveRadarOf(site) : radar;
    this.setRadar(radarId, !(shown ?? radar).on);
  }

  /**
   * LOADERS OUT. The rack fills itself a round at a time whenever the rails go
   * bare, so this is not "start the reload" any more — it is the order to send
   * the crew out on a rack that is only half spent, or across a guidance run.
   * It still fails loudly when there is nothing in the store to break out,
   * because a denied resupply is a plot point and not a UI state.
   */
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
      // Both sets travel with the battery. Leaving one at the old grid
      // reference would leave an anti-radiation magnet behind exactly where
      // the enemy's targeting says the battery still is.
      for (const radar of this.radarsOf(site)) radar.pos = { ...jitter };

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

  /**
   * The net traffic that opens a watch.
   *
   * Every long watch used to begin with a blank tube and total silence — two
   * minutes and a quarter of it on White Noise — because nothing in the
   * simulation exists until the first wave spawns. But a watch does not start
   * with the war; it starts with a handover, a readiness report, and, when the
   * frontier posts have anything, a first vague word of what is coming. Two or
   * three lines, honest but imprecise, timed so the tube is never dead for the
   * length of a kettle boiling.
   */
  buildOpeningChatter() {
    const chatter = [
      { atS: 4, text: 'WATCH HANDED OVER — THE PICTURE IS YOURS' },
      {
        atS: 11,
        text: `${this.radars.filter((r) => r.alive).length} SETS REPORTING. `
          + `${this.sites.filter((s) => s.alive).length} BATTERIES ON THE RAILS. SECTOR QUIET.`,
      },
    ];

    // A first, vague word from the frontier: real bearing, no numbers, timed
    // to land in the middle of what would otherwise be the longest silence.
    const first = this.pendingWaves.find((w) => !AIR_TYPES[w.type].friendly);
    if (first && first.atS > 45) {
      const octant = ['NORTH', 'NORTH-EAST', 'EAST', 'SOUTH-EAST', 'SOUTH',
        'SOUTH-WEST', 'WEST', 'NORTH-WEST'][Math.round(((first.bearingDeg % 360) + 360) % 360 / 45) % 8];
      chatter.push({
        atS: Math.round(first.atS * 0.55),
        text: `FRONTIER POSTS REPORT ENGINE NOISE TO THE ${octant}. NOTHING ON THE SETS YET.`,
      });
    }

    // A scenario may script its own traffic — word of what is happening on the
    // ground that no radar will ever paint. Copied per world, because the
    // pending list is consumed by shift() and the scenario module is a
    // singleton shared across replays. Lines marked pressureOnly are colour,
    // not information, and vanish with the narrative-pressure setting.
    for (const line of this.scenario.chatter ?? []) {
      if (line.pressureOnly && !this.narrativePressure) continue;
      chatter.push({ ...line });
    }
    return chatter.sort((a, b) => a.atS - b.atS);
  }

  /**
   * Is this line still true when its second arrives?
   *
   * A scripted line is written months before the watch it lands in, and two of
   * them on the teaching watch were being said into a room that had already
   * answered them: "THE SET IS NOT RADIATING" printed in twelve of twelve
   * traced cells and was true in four, and in the cabin — where the sector's
   * own crews raise the surveillance set a tenth of a second in — it was never
   * true at all. A watch that narrates a state has to read the state.
   *
   * Two predicates, because there are two sets and they are not the same
   * lesson. `whileCold` is the net's: nothing sector owns is radiating, so
   * nothing is painting. `whileOwnCold` is the cabin's: this battery's own
   * antennas are dark, whoever else can see. A line the world has outrun is
   * not dropped into silence — every conditional line in the campaign is
   * written as a pair, and `insteadText` carries the other true sentence for
   * the same slot.
   */
  chatterHolds(line) {
    if (line.whileCold && this.radars.some((r) => !r.siteId && r.alive && r.on)) return false;
    if (line.whileOwnCold) {
      const own = this.control.crewedBatteryId
        ? this.radars.filter((r) => r.siteId === this.control.crewedBatteryId)
        : [];
      if (!own.length || own.some((r) => r.alive && r.on)) return false;
    }
    return true;
  }

  spawnDue() {
    while (this.pendingChatter.length && this.pendingChatter[0].atS <= this.t) {
      const line = this.pendingChatter.shift();
      const holds = this.chatterHolds(line);
      const text = holds ? line.text : line.insteadText;
      if (!text) continue;
      /*
       * Scripted chatter is somebody on the radio, and the console has always
       * said so — `kind-comms` renders italic with a ▸, which is exactly what
       * "SECTOR: YOU ARE THE ONLY SET LEFT IN THIS SQUARE" is. It logged as
       * `info` — the kind reserved for the echo of the operator's own
       * switches — and the consequence was not cosmetic: the dead-air detector
       * counts the kinds a watch does TO you and ignores the kinds it does
       * BECAUSE of you, so Solo Battery's eleven pacing lines, written and
       * measured to fill that watch's structural silences, were worth nothing
       * in the reading that judged them. The bar's own definition of a hole
       * says a scripted chatter line breaks it. Now the log agrees with both.
       */
      this.log(line.kind ?? 'comms', text, line.opts ?? {});
    }
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

      // The watch the state aircraft flies is about one wheels-up, and the net
      // marks it. Nothing else that spawns is announced — raids announce
      // themselves by being detected, which is the game — but this departure
      // happens on our own field, in the clear, on schedule.
      if (type.isVip) {
        this.log('alert', this.narrativePressure
          ? `${aircraft.name} — ROLLING AT DEMOBODEDOVO. THE FIELD IS HELD FOR ONE MOVEMENT.`
          : `${aircraft.name} — AIRBORNE OUT OF DEMOBODEDOVO.`, { severity: 'high' });
      }
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
    if (this.firstContactAtS === null && this.tracks.size > 0) this.firstContactAtS = this.t;
    scoreAllTracks(this);

    // Always: it runs the formations the player is not personally commanding,
    // which at battalion and sector is none of them and at national command is
    // nearly the whole country.
    runAiBattleManager(this, dt);
    runBatteryCrews(this, dt);
    runSurveillanceEmcon(this);
    // The fire-control mounts come round onto whatever their batteries are
    // working. Before the engagements step, so a set that arrives on target
    // this tick lets its sequence run this tick.
    stepFireControl(this, dt);
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
    /*
     * "Did anything the OPERATOR owns ever radiate?" — one bit, kept because
     * the debrief has to be able to tell a quiet watch from a blind one when
     * it names the cause of a failure.
     *
     * Deliberately scoped to the sets this seat can actually switch: the
     * surveillance radars, and the crewed battery's own. Every AI battery on
     * the board runs its own emissions discipline and comes up in its own
     * time, so a flag that counted those would be true on every watch ever
     * played and would never be able to name the one failure it exists for —
     * a player who sat through a raid with their own sets cold.
     *
     * Costs a scan of a handful of sets and draws no random numbers.
     */
    if (!this._everRadiated && this.radars.some((r) => r.alive && r.on
      && (!r.siteId || r.siteId === this.control.crewedBatteryId))) {
      this._everRadiated = true;
    }
    stepCommand(this, dt);
    this.stepReserve();
    this.stepAdvisories();
    this.reportTheLull();
    this.checkEnd();
  }

  /**
   * The net talking to a human operator: the safety on the teaching watch's
   * cold radar, and the warning that a firm inbound is going unanswered.
   * Neither changes the fight — the AI needs no telling — they exist so that
   * failure arrives announced instead of as a debrief surprise.
   */
  stepAdvisories() {
    // The teaching-watch safety: a scenario that starts its surveillance set
    // cold names the moment sector stops waiting for you.
    if (this.scenario.radarSafetyAtS && !this._radarSafetyDone
      && this.t >= this.scenario.radarSafetyAtS) {
      this._radarSafetyDone = true;
      let flipped = false;
      for (const radar of this.radars) {
        if (radar.alive && !radar.siteId && !radar.on) { radar.on = true; flipped = true; }
      }
      if (flipped) {
        this.log('warn', 'SECTOR HAS BROUGHT THE SURVEILLANCE SET UP REMOTELY. THE SWITCH IS YOURS TO KEEP.',
          { severity: 'high' });
      }
      /*
       * And the cabin's own set, which sector cannot reach.
       *
       * The safety used to end at the sets sector owns, and on a watch that
       * has any of those the clause below never ran — so on the teaching
       * watch, whose second lesson is that the battery you are sitting in has
       * a switch of its own, an operator who never found it sat through the
       * whole night on somebody else's picture with the tube in front of them
       * dark. On Low Riders that cost 450 seconds with twenty aircraft on the
       * plot, measured in the browser. A crew alone in a cabin under an air
       * raid warning does not sit in the dark waiting to be told; they come
       * up, and they say why.
       *
       * Only when EVERY set of this battery is cold, so an operator who has
       * deliberately gone dark — which is the entire subject of Weasel Hour —
       * is never overruled by a safety. Weasel Hour sets no `radarSafetyAtS`
       * at all, and that is why.
       */
      const own = this.control.crewedBatteryId
        ? this.radars.filter((r) => r.alive && r.siteId === this.control.crewedBatteryId)
        : [];
      if (own.length && !own.some((r) => r.on)) {
        for (const radar of own) radar.on = true;
        this.log('warn', 'CREW HAS BROUGHT THE SET UP ON ITS OWN AUTHORITY — NOBODY ELSE CAN SEE FOR YOU.',
          { severity: 'high' });
        this.comms?.('CREW CHIEF', 'WE CANNOT SEE ANYTHING WITH THE SET COLD. IT IS UP.');
      }
    }

    if (!this.control.netIsHuman) return;
    this._advisoryScanAtS = this._advisoryScanAtS ?? 0;
    if (this.t - this._advisoryScanAtS < 5) return;
    this._advisoryScanAtS = this.t;
    this._inboundWarnedAtS = this._inboundWarnedAtS ?? {};
    for (const track of this.tracks.values()) {
      if (track.destroyed || track.hostility !== 'hostile') continue;
      if (track.classification === 'decoy') continue;
      if (track.quality < 0.5) continue;
      if (track.assignedTo.length > 0 || track.engagedBy.length > 0) continue;
      if (!Number.isFinite(track.ttiS) || track.ttiS > 120) continue;
      const asset = track.predictedAssetId ? this.assetById.get(track.predictedAssetId) : null;
      if (!asset || asset.destroyed) continue;
      const last = this._inboundWarnedAtS[track.id] ?? -999;
      if (this.t - last < 45) continue;
      this._inboundWarnedAtS[track.id] = this.t;
      this.log('warn', `${track.tn} INBOUND ${asset.label} — UNENGAGED`, {
        trackId: track.id, severity: 'high',
      });
    }
  }

  /**
   * The net does not go quiet, and when it has nothing to report it says so.
   *
   * Every watch has stretches with nothing shootable in them — a package turns
   * for home, one straggler drifts thirty kilometres outside everybody's ring
   * and takes three minutes to walk into a LANCE — and those stretches are the
   * shape of the fight rather than a defect in it. What WAS a defect is that
   * the console fell completely silent through them, so a new operator could
   * not tell "there is nothing you can do yet" from "you have missed
   * something". Measured over eight seeds of the four watches this was tuned
   * on, the worst of those silences ran two hundred and twenty-two seconds:
   * the sector had killed everything it could reach and one missed striker was
   * crawling towards LANCE EAST's ring.
   *
   * So after `COMMAND.lullReportS` with nothing at all on the ticker, sector
   * says what it is holding: the contact, its range, and which of your
   * batteries will have it and in how long. That last clause is the whole
   * point — it converts a blank screen into a countdown, and a countdown is
   * something an operator can plan a reload or an emissions cycle around.
   *
   * Logged as `info` and never as `comms`, deliberately: the debrief's
   * "seconds after the last action" figure exists to catch a watch that keeps
   * running after the fighting has stopped, and a net saying "nothing held"
   * must not be allowed to disguise exactly that. It draws no random numbers,
   * so every seeded measurement in the repository is unmoved by it.
   *
   * AND IT NEVER SAYS THE SAME THING TWICE RUNNING. The first version of this
   * cycled a variant list on a counter that only advanced when a line was
   * printed, which sounds like the same thing and is not: the state can change
   * between two lulls, so the counter walks two different lists and lands on
   * the same sentence, or on its twin. Measured on the build that shipped it,
   * one watch printed "SAY STATE. NOTHING BEHIND YOU IS SEEING THIS SQUARE FOR
   * YOU." and "SAY STATE. NOBODY BEHIND YOU IS GOING TO SEE THIS ONE FOR YOU."
   * eleven seconds apart, and another printed one identical held-contact line
   * ELEVEN times between 191 s and 477 s. That is not a room talking, it is a
   * tape loop, and a tape loop teaches the reader to stop reading — which is
   * the exact failure the whole idea was meant to repair.
   *
   * So `say()` remembers the last thing said and takes the next variant that
   * is not it, and the held-contact report — which is generated rather than
   * chosen from a list — is only allowed to repeat itself about the same
   * contact after a minute, and phrases itself differently when it does.
   */
  reportTheLull() {
    /*
     * Silence measured the way the bar measures it, and not the way the log
     * happened to be written.
     *
     * This clock read the timestamp of the last line of ANY kind, and a quiet
     * watch is not a watch with no lines in it. A battery warming an antenna,
     * a crew claiming a channel, a set reporting that it is radiating: all
     * `info`, all echoes of the machinery rather than the watch giving anybody
     * something to do, and all of them reset this timer. So the one device in
     * the engine whose entire job is to stop the console going quiet was being
     * switched off by the console's own noise. Measured on Low Riders'
     * spectator cabin, where it matters most: eight seeds of eight carried
     * stretches of 34 to 74 seconds — one of them 15% of the whole watch — in
     * which nothing was engageable, nothing was in flight and nothing was
     * said, while this function sat below its threshold the entire time.
     */
    if (this.t - (this._lastActionAtS ?? 0) < COMMAND.lullReportS) return;

    const mine = this.sites.filter((s) => s.alive
      && (s.id === this.control.crewedBatteryId || this.commandable(s.id)));
    let worst = null;
    for (const track of this.tracks.values()) {
      if (track.destroyed || track.hostility !== 'hostile') continue;
      if (track.quality < DETECTION.firmQuality) continue;
      if (!worst || track.threat > worst.threat) worst = track;
    }

    // Never the same sentence twice running, whichever list it comes from.
    const say = (variants) => {
      const fresh = variants.filter((v) => v !== this._lullLast);
      return (fresh.length ? fresh : variants)[(this._lullCount ?? 0) % (fresh.length || 1)];
    };

    let text;
    if (worst) {
      // Who gets it, and when. `timeToInRangeS` is the same walk-forward the
      // shootlist's own "IN RANGE IN" column runs, so the number the net reads
      // out is the number on the operator's screen.
      let bestSite = null;
      let bestS = Infinity;
      for (const site of mine) {
        const toRange = timeToInRangeS(site, worst);
        if (!Number.isFinite(toRange) || toRange >= bestS) continue;
        bestS = toRange; bestSite = site;
      }
      const km = Math.round(dist(this.centre, worst.pos));
      /*
       * A held contact is worth reporting once, and then it is the same news.
       * `_lullTrackAtS` is how long ago we last said anything about THIS
       * contact; inside a minute the net moves on to something else rather
       * than reading the same range out again with a different number on it.
       */
      this._lullTrackAtS = this._lullTrackAtS ?? {};
      const saidAgo = this.t - (this._lullTrackAtS[worst.id] ?? -999);
      if (saidAgo < 60) {
        text = say([
          `${worst.tn} IS THE ONLY THING WE HOLD AND IT HAS NOT CHANGED. NOTHING ELSE IS UP.`,
          'STILL THE ONE CONTACT. THE REST OF THE SQUARE IS CLEAN.',
          `NO CHANGE ON ${worst.tn}. FRONTIER POSTS HAVE NOTHING BEHIND IT.`,
        ]);
      } else if (!bestSite) {
        text = say([
          `HOLDING ${worst.tn}, ${km} KM OUT. NOTHING OF OURS REACHES IT ON THAT COURSE.`,
          `${worst.tn} AT ${km} KM AND OUTSIDE EVERY RING WE HAVE. WATCH IT AND WAIT.`,
        ]);
        this._lullTrackAtS[worst.id] = this.t;
      } else if (bestS > 0) {
        text = say([
          `HOLDING ${worst.tn}, ${km} KM OUT. ${bestSite.name} REACHES IT IN `
            + `${Math.round(bestS)} SECONDS.`,
          `${worst.tn} AT ${km} KM, CLOSING. ${bestSite.name} HAS IT IN `
            + `${Math.round(bestS)}.`,
        ]);
        this._lullTrackAtS[worst.id] = this.t;
      } else {
        /*
         * Already inside somebody's ring, so the geometry is not what is
         * wrong — say what is, in the same words the shootlist uses.
         * "REACHES IT IN 0 SECONDS" was the first version of this line and it
         * was worse than silence: it read as a countdown that had finished
         * while nothing happened.
         *
         * The range in this sentence is measured FROM THE BATTERY, not from
         * the sector centre the other lulls plot from: the clause names a
         * particular battery's ring, and a ring is a circle around the mount.
         * Reading the centre's number into it printed "T-004 IS INSIDE
         * BASTION'S RING AT 136 KM" for a battery that reaches 120, which
         * teaches the operator the wrong reach for their own equipment.
         *
         * And `cannotEngageReason` returning null does not mean "nothing":
         * it means the shot is LEGAL and only the order is missing. Rendering
         * that as "CANNOT SHOOT: NOTHING" told the operator the opposite of
         * what to do, in the one channel that exists to fill a lull, and it
         * did it hardest to the beginner it was written for. Null gets its
         * own sentence — the one that hands them the contact.
         */
        const why = cannotEngageReason(this, bestSite, worst);
        const ringKm = Math.round(dist(bestSite.pos, worst.pos));
        if (why) {
          text = say([
            `${worst.tn} IS INSIDE ${bestSite.name}'S RING AT ${ringKm} KM AND IT CANNOT `
              + `TAKE IT — ${why.toUpperCase()}.`,
            `${bestSite.name} HAS ${worst.tn} ON THE PLOT AND CANNOT SHOOT: `
              + `${why.toUpperCase()}.`,
          ]);
        } else if (bestSite.weaponsState === 'hold') {
          /*
           * Legal, unordered, AND muzzled. The order would be accepted and
           * then sit there, because a battery on WEAPONS HOLD launches
           * nothing; naming the hold is the difference between advice the
           * operator can act on and advice that dead-ends one click later.
           */
          text = say([
            `${worst.tn} IS INSIDE ${bestSite.name}'S RING AT ${ringKm} KM AND THEY ARE ON `
              + 'WEAPONS HOLD. RELEASE THEM AND GIVE THEM THE CONTACT.',
            `${bestSite.name} COULD TAKE ${worst.tn} AT ${ringKm} KM BUT IS HELD. THE `
              + 'ONLY THING IN THE WAY IS YOUR WEAPONS STATE.',
          ]);
        } else {
          text = say([
            `${worst.tn} IS INSIDE ${bestSite.name}'S RING AT ${ringKm} KM AND NOBODY IS ON `
              + `IT. ${bestSite.name} CAN TAKE IT — GIVE IT TO THEM.`,
            `${bestSite.name} HOLDS ${worst.tn} AT ${ringKm} KM, CAN SHOOT, AND HAS NO `
              + 'ORDER. THE CONTACT IS YOURS TO HAND OVER.',
          ]);
        }
        this._lullTrackAtS[worst.id] = this.t;
      }
    } else if (!this.radars.some((r) => r.alive && r.on)) {
      /*
       * The spectator trap, said out loud, and said differently each time. A
       * watch spent with every set cold is not a quiet watch, it is a blind
       * one, and the console has to say which of the two the operator is
       * looking at — the measured floor for this game is a sixteen-minute
       * solo-battery watch on which a player who touches nothing sees nothing
       * and is never told why.
       */
      text = say([
        'NOTHING IS RADIATING. THE PLOT IS BLANK UNTIL A SET COMES UP.',
        'STILL NO EMISSIONS FROM YOUR POSITION. WE ARE BLIND, NOT QUIET.',
        'SAY STATE. NOTHING BEHIND YOU IS SEEING THIS SQUARE FOR YOU.',
        'THE SCOPE IS EMPTY BECAUSE THE SET IS COLD, NOT BECAUSE THE SKY IS.',
      ]);
    } else if (this.pendingWaves.length) {
      text = say([
        'NOTHING ON THE PLOT. THE NEXT MOVEMENT HAS NOT SHOWN ITSELF YET.',
        'SETS CLEAN. THE FRONTIER POSTS HAVE NOTHING FOR US EITHER.',
        'STILL NOTHING HELD. STAY UP — IT IS NOT OVER.',
        'QUIET SQUARE. THAT IS A GAP IN THEIR PROGRAMME, NOT THE END OF IT.',
        'NO CONTACTS. USE IT — RACKS, EMISSIONS, WHATEVER IS SHORT.',
      ]);
    } else {
      /*
       * An empty plot with nothing left to spawn is the one case where this
       * device has genuinely nothing to say, and saying it on a twenty-five
       * second metronome is worse than the silence it is filling — measured
       * on the teaching watch's spectator path, three "PLOT CLEAR" variants
       * cycling at 774, 799, 878, 903 and 928 seconds, which is a tape loop
       * with a countdown behind it. Every other branch of this function
       * carries something the operator can act on: a contact, a range, a
       * battery, a reason they are blind. This one carries reassurance, and
       * reassurance repeated is not reassurance. Once every ninety seconds.
       */
      if (this.t - (this._lullClearAtS ?? -999) < 90) return;
      this._lullClearAtS = this.t;
      text = say([
        'PLOT CLEAR. STAY UP UNTIL SECTOR STANDS YOU DOWN.',
        'NOTHING AIRBORNE THAT WE CAN SEE. HOLD YOUR POSITION.',
        'THAT APPEARS TO BE ALL OF IT. NOBODY IS STANDING YOU DOWN YET.',
      ]);
    }
    this._lullCount = (this._lullCount ?? 0) + 1;
    this._lullLast = text;
    // Sector on the radio, which is what this is and what the console has
    // always rendered `comms` as. It logged as `info` — the kind that means
    // "a machine did something" — so the one line in the engine written to
    // break a silence did not, as far as anything measuring silence knew.
    this.log('comms', `SECTOR: ${text}`);
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
        { narrativePressure: this.narrativePressure, family: this.family });
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
    // And why, on the ticker, where the person is still looking. The debrief
    // repeats it; the ticker is where they find out.
    if (this.outcome.cause) this.log('alert', this.outcome.cause, { severity: 'high' });
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

    /*
     * A kill is worth what it stopped. A decoy is plywood with an amplifier:
     * splashing one is worth almost nothing, and with rounds at 3 points each
     * a salvo spent on it is a net loss — which is the entire point of the
     * decoy, and the entire value of the operator who held fire until the
     * track's impossibly steady flight gave it away. This used to pay +22 like
     * a real kill, which quietly deleted the discrimination skill the White
     * Noise briefing claims to teach.
     */
    const killScore = (this.stats.kills - this.stats.decoysEngaged) * 22
      + this.stats.decoysEngaged * 4;
    /*
     * A sortie that broke off is a sortie you stopped, whether or not it has
     * finished flying home.
     *
     * `stats.turnedBack` is incremented in `onAircraftExit` and nowhere else,
     * so an aircraft that aborted under fire and was still on the board when
     * the watch ended was neither counted nor paid for. Probed over 48
     * teaching watches: 79 sorties aborted, six counted, and twenty of the
     * forty-eight ended with one or two aborted aircraft still airborne. The
     * debrief printed TURNED BACK 0 over a ticker that had announced the
     * turn-backs by name, which breaks the two-ledgers principle on every
     * watch in the game — and turning a raid back is the second of the two
     * ways to win this thing.
     *
     * Counted here at settlement, and written into the stats spread as well
     * as the score, so the debrief and the ticker finally agree. Civil
     * traffic and the state aircraft are not sorties and are not counted.
     */
    const turnedBackTotal = this.stats.turnedBack + this.aircraft.filter((a) => a.alive
      && a.aborted && a.type !== 'civil' && !AIR_TYPES[a.type].isVip).length;
    const turnedBackScore = turnedBackTotal * 18;
    const leakerPenalty = this.stats.leakers * 45;
    /*
     * Five a round, up from three. At three, a kill paid for seven rounds and
     * ammunition discipline — the stated lesson of an entire watch — had no
     * score teeth: the walk-away fired 75% over allocation for a rounding
     * error. At five, the hand player's measured one-third round saving is a
     * real slice of the night, and spraying the edge of the envelope is
     * priced like the habit it is.
     */
    const roundCost = this.stats.roundsFired * 5;
    const civilPenalty = this.stats.civilianAircraftShot * 400
      + this.stats.civilianCasualties * 2;
    const equipmentPenalty = this.stats.sitesLost * 60 + this.stats.radarsLost * 35;

    const score = Math.round(
      assetScore + killScore + turnedBackScore
      - leakerPenalty - roundCost - civilPenalty - equipmentPenalty,
    );

    const criticalLost = this.assets.some((a) => ASSET_TYPES[a.type].critical && a.destroyed);
    // The headline is the file's reading of the night, so it counts the
    // leakers the file recognises: a watch that obeyed the freeze reads
    // SECTOR HELD over the building it lost doing so. That is the point.
    const leakersCounted = this.stats.leakers - (this.stats.leakersUnrecognized ?? 0);
    const success = reason !== 'site-lost' && !criticalLost && leakersCounted <= (this.scenario.leakerTolerance ?? 2);

    const tier = tierFor(this.command.standing);
    const headline = reason === 'site-lost'
      ? 'YOUR POSITION WAS OVERRUN'
      : success ? 'SECTOR HELD' : 'SECTOR PENETRATED';

    return {
      /**
       * Why, in one clause, and it is not decoration.
       *
       * Every losing watch used to end on the same three words —
       * "SECTOR PENETRATED" — and stop. A player who conceded four leakers
       * because they never brought a set up, one who conceded one because the
       * operations centre was on an axis nobody covered, and one who was
       * overrun in the first ninety seconds all got the identical line, so
       * losing taught nothing and the debrief had to be read as arithmetic to
       * find out what had happened. A watch that cannot say why it went wrong
       * cannot be learned from, and a beginner's watch has to be learnable
       * from its failures first of all.
       *
       * Read in the same order the verdict is decided in — overrun, then the
       * place that cannot be lost, then the count — so the clause always names
       * the thing that actually settled it.
       */
      cause: this.failureCause({ reason, success, criticalLost, leakersCounted }),
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
      stats: { ...this.stats, turnedBack: turnedBackTotal },
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

  /**
   * The one clause that says what settled the watch. Null when it was held.
   *
   * Order matters and it is the order the verdict itself is decided in. The
   * blind case is checked before the leaker count because it is the CAUSE of
   * the leaker count: an operator who never radiated did not lose to four
   * aircraft, they lost to an empty scope, and telling them "four leaked" is
   * telling them the symptom.
   */
  failureCause({ reason, success, criticalLost, leakersCounted }) {
    if (success) return null;
    if (reason === 'site-lost') {
      return 'YOUR POSITION WAS OVERRUN — THE REST OF THE RAID CROSSED AN EMPTY SQUARE.';
    }
    if (criticalLost) {
      const lost = this.assets.find((a) => ASSET_TYPES[a.type].critical && a.destroyed);
      return `${(lost?.label ?? ASSET_TYPES[lost?.type]?.label ?? 'A PLACE THAT CANNOT BE LOST')
        .toUpperCase()} WAS DESTROYED. THAT ALONE LOSES THE WATCH.`;
    }
    const tolerance = this.scenario.leakerTolerance ?? 2;
    const n = leakersCounted;
    const never = !this._everRadiated;
    if (never) {
      return `NOTHING OF YOURS EVER RADIATED. ${n} GOT THROUGH A SECTOR THAT `
        + 'COULD NOT SEE THEM.';
    }
    const dry = this.sites.some((s) => s.alive && s.readyRounds === 0 && s.magazine === 0);
    const refused = this.command.ledger.some((e) => /^refused /.test(e.reason ?? ''));
    const tail = dry
      ? ' AT LEAST ONE BATTERY FINISHED THE WATCH WITH AN EMPTY STORE.'
      : refused
        ? ' YOU REFUSED AN ORDER TONIGHT; THE FILE WILL SAY SO BESIDE THIS.'
        : ' THE ALLOWANCE WAS ' + tolerance + '.';
    return `${n} LEAKER${n === 1 ? '' : 'S'} REACHED WHAT ${n === 1 ? 'IT WAS' : 'THEY WERE'} `
      + `SENT FOR.${tail}`;
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
