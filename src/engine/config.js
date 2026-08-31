/**
 * Every tunable number in IADSVille.
 *
 * Nothing here is real hardware. Designations are invented and the physics is
 * deliberately simplified — the aim is a system that *behaves* the way an air
 * defence problem behaves (you cannot see everything, you cannot shoot
 * everything, and being visible is what kills you), not a fidelity claim.
 */

export const SIM = {
  /** Fixed simulation step, seconds. Everything integrates at this rate. */
  dt: 0.1,
  /** Speed multipliers offered in the UI. */
  speeds: [0, 1, 2, 4],
  /** Radius beyond which departing aircraft are considered gone, km. */
  worldRadiusKm: 210,
};

/**
 * Attacking platforms. `rcs` is radar cross-section in m² and drives detection
 * range as rcs^0.25, so a 0.1 m² cruise missile is seen at 56% of the range of
 * a 1 m² target — not 10%. Small helps, but flying low helps far more.
 */
export const AIR_TYPES = {
  striker: {
    id: 'striker',
    label: 'STRIKE',
    name: 'Strike aircraft',
    rcs: 5,
    speed: 0.24,          // km/s
    cruiseAltM: 7500,
    turnRate: 7,          // deg/s
    /** Range at which it releases on its assigned asset, km. */
    releaseRangeKm: 18,
    weapons: 2,
    weaponDamage: 45,
    /** Chance of pressing on rather than jettisoning, rolled once per engagement. */
    resolve: 0.78,
    /** Multiplier on incoming Pk while defensive. */
    evadeFactor: 0.55,
    evadeDurationS: 22,
    threatWeight: 1.0,
  },
  /**
   * The two things the enemy launches that you can shoot back at.
   *
   * Neither is ever spawned as a wave — they come off an aircraft in flight,
   * as an anti-radiation round leaving a suppression aircraft or a weapon
   * leaving a striker at its release point. They live in the round system,
   * not the aircraft system; they are listed here because this table is the
   * registry every lookup goes through (radar cross-section, threat weight,
   * the label on the track row), and a flying object missing from it is an
   * object the picture cannot describe.
   *
   * Both are small, quick and low. By the time either is worth engaging it is
   * beneath the floor of every medium and long-range battery on the board, so
   * the only systems that can answer are the guns and the point-defence
   * sections — which is exactly what those two classes are for, and the first
   * time in the campaign that siting them well pays a dividend you can watch
   * happen.
   */
  arm: {
    id: 'arm',
    label: 'ARM',
    name: 'Anti-radiation round',
    rcs: 0.05,
    speed: 0.6,
    cruiseAltM: 0,
    turnRate: 16,
    releaseRangeKm: 0,
    weapons: 0,
    weaponDamage: 0,
    resolve: 1,
    evadeFactor: 1,       // it does not know it is being shot at
    evadeDurationS: 0,
    /** Above a striker: it is seconds from taking a radar off the board. */
    threatWeight: 1.6,
  },
  glide: {
    id: 'glide',
    label: 'WEAPON',
    name: 'Released weapon',
    rcs: 0.08,
    speed: 0.31,
    cruiseAltM: 0,
    turnRate: 9,
    releaseRangeKm: 0,
    weapons: 0,
    weaponDamage: 0,
    resolve: 1,
    evadeFactor: 1,
    evadeDurationS: 0,
    threatWeight: 1.4,
  },
  cruise: {
    id: 'cruise',
    label: 'CRUISE',
    name: 'Cruise missile',
    rcs: 0.1,
    speed: 0.25,
    cruiseAltM: 90,
    turnRate: 4,
    releaseRangeKm: 0,    // it is the weapon
    weapons: 0,
    weaponDamage: 55,
    resolve: 1,           // never turns back
    evadeFactor: 1,       // never manoeuvres
    evadeDurationS: 0,
    threatWeight: 1.15,
  },
  sead: {
    id: 'sead',
    label: 'SEAD',
    name: 'Defence suppression',
    rcs: 3,
    speed: 0.26,
    cruiseAltM: 8500,
    turnRate: 8,
    releaseRangeKm: 0,
    weapons: 0,
    weaponDamage: 0,
    resolve: 0.85,
    evadeFactor: 0.5,
    evadeDurationS: 18,
    threatWeight: 1.3,
    /** Anti-radiation rounds carried. */
    arms: 2,
    /**
     * Maximum ARM launch range, km. This sits just inside a long-range
     * battery's envelope on purpose: the one system that can reach the weasel
     * has to radiate to do it, which is exactly what the weasel came for.
     */
    armRangeKm: 104,
    /** Preferred distance to hold from the emitter it is hunting, km. */
    standoffKm: 118,
    /** Seconds of observed emission needed before it will commit a round. */
    elintNeededS: 12,
  },
  jammer: {
    id: 'jammer',
    label: 'JAMMER',
    name: 'Standoff jammer',
    rcs: 25,              // large and unashamed — it wants to be seen, just not reached
    speed: 0.19,
    cruiseAltM: 10500,
    turnRate: 4,
    releaseRangeKm: 0,
    weapons: 0,
    weaponDamage: 0,
    resolve: 0.35,        // runs early; it is expensive and unarmed
    evadeFactor: 0.75,
    evadeDurationS: 25,
    threatWeight: 0.9,
    /** Burnthrough range imposed on a radar at 100 km standoff, km. */
    burnThroughAt100Km: 34,
    /** Half-width of the jammed bearing wedge, degrees. */
    lobeHalfWidthDeg: 13,
    /** Range multiplier applied to radars outside the wedge (sidelobes). */
    sidelobeFactor: 0.86,
    /** Distance from the defended area it prefers to orbit, km. */
    orbitKm: 135,
  },
  decoy: {
    id: 'decoy',
    label: 'DECOY',
    name: 'Air-launched decoy',
    /** Amplified return: it is built to look like something worth shooting. */
    rcs: 9,
    speed: 0.22,
    cruiseAltM: 5200,
    turnRate: 3,
    releaseRangeKm: 0,
    weapons: 0,
    weaponDamage: 0,
    resolve: 1,
    evadeFactor: 1,
    evadeDurationS: 0,
    threatWeight: 1.0,    // it reads exactly like a striker, which is the point
    /** Seconds before it falls out of the sky on its own. */
    lifetimeS: 780,
    /** Inside this range its flight becomes too perfect to be an aircraft. */
    tellRangeKm: 40,
  },
  /**
   * The president's aircraft, out of Demobodedovo.
   *
   * Friendly, so nothing engages it on its own initiative and no doctrine will
   * do this for you. If it comes down, somebody decided that — either the pair
   * of fighters coming for it, or the person at the console.
   */
  vip: {
    id: 'vip',
    label: 'STATE 01',
    name: 'Presidential aircraft',
    rcs: 30,
    speed: 0.26,
    cruiseAltM: 11000,
    turnRate: 3,
    releaseRangeKm: 0,
    weapons: 0,
    weaponDamage: 0,
    resolve: 1,
    /*
     * A transport beaming an air-to-air round is not a fighter defeating one.
     * It buys something, and not much: the seeker still has the geometry and
     * the aircraft still has the turn rate of a bus.
     */
    evadeFactor: 0.72,
    evadeDurationS: 30,
    threatWeight: 0,
    friendly: true,
    idSpeedMult: 2.4,
    /** The one aircraft in the game the whole watch is about. */
    isVip: true,
    /**
     * Metres a second on the climb out.
     *
     * It leaves Demobodedovo at circuit height and needs three minutes to reach
     * altitude. Those three minutes are the whole engagement: low, slow, inside
     * everybody's horizon and only just clear of the field it took off from.
     */
    climbRateMps: 60,
  },

  /**
   * Enemy fighters, hunting an aircraft rather than a place.
   *
   * The only air-to-air threat in the game, and it exists for one watch. They
   * close on their target and shoot at it; they have no interest in the ground
   * and will not attack anything on it.
   */
  interceptor: {
    id: 'interceptor',
    label: 'FIGHTER',
    name: 'Interceptor',
    rcs: 4,
    /*
     * Fast enough to matter. A quarter faster than an airliner is not an
     * interceptor, it is an escort: from eighty kilometres astern it never
     * closes, and the watch it is supposed to threaten resolves itself. At
     * supersonic dash it runs the target down from behind or cuts across in
     * front of it, which is the only reason the corridor has to be defended
     * at all.
     */
    speed: 0.46,
    cruiseAltM: 10500,
    turnRate: 11,
    releaseRangeKm: 0,
    weapons: 0,
    weaponDamage: 0,
    resolve: 0.9,
    evadeFactor: 0.6,
    evadeDurationS: 16,
    threatWeight: 1.4,
    /**
     * One round each, off one pass, from twenty-six kilometres.
     *
     * Four fighters is therefore four launches and no more, which is what makes
     * the corridor defensible at all: every fighter stopped before it reaches
     * its launch point is a round that is never in the air, and the difference
     * between stopping three of them and stopping none is the difference
     * between a fair chance and none.
     */
    airToAir: 1,
    airToAirRangeKm: 26,
    /** Probability one round kills what it was fired at. */
    airToAirPk: 0.55,
  },

  /**
   * Civil traffic in the corridor. It is not part of the raid, it does not know
   * there is a raid, and shooting one is the single fastest way to lose your
   * file. It exists to make identification a decision instead of a formality.
   */
  civil: {
    id: 'civil',
    label: 'CIVIL',
    name: 'Civil transit',
    rcs: 40,
    speed: 0.23,
    cruiseAltM: 9800,
    turnRate: 3,
    releaseRangeKm: 0,
    weapons: 0,
    weaponDamage: 0,
    resolve: 1,
    evadeFactor: 1,
    evadeDurationS: 0,
    threatWeight: 0,
    friendly: true,
    /** Squawks a valid code, so identification resolves faster than a hostile. */
    idSpeedMult: 1.9,
  },
};

/**
 * The four classes of air defence, in the order a sector is built out of them.
 *
 * Each covers what the next one down cannot: the long-range battalion owns the
 * approach, the medium battery owns the release ring, the point-defence section
 * owns what got past it, and the guns own the last four kilometres, where
 * missiles have a minimum range and shells do not. A sector missing one of
 * these classes has a hole in it that nothing else can fill.
 */
export const DEFENCE_CLASSES = {
  guns: {
    id: 'guns', tm: 'ЗЕНИТНАЯ АРТИЛЛЕРИЯ', en: 'Anti-aircraft artillery', short: 'GUNS',
    blurb: 'Shells, not rounds. No minimum range and no guidance to lose, which is exactly '
      + 'what you want when something is already overhead.',
  },
  short: {
    id: 'short', tm: 'МАЛАЯ ДАЛЬНОСТЬ', en: 'Short-range missiles', short: 'SHORT',
    blurb: 'Point defence. Quick to react and short of reach, so it must be sited forward on '
      + 'the threat axis or it never sees a target before the weapons are already off.',
  },
  medium: {
    id: 'medium', tm: 'СРЕДНЯЯ ДАЛЬНОСТЬ', en: 'Medium-range missiles', short: 'MEDIUM',
    blurb: 'The workhorse. Covers the release ring, kills strike aircraft before they can drop, '
      + 'and is the class you will run out of first.',
  },
  long: {
    id: 'long', tm: 'БОЛЬШАЯ ДАЛЬНОСТЬ', en: 'Long-range missiles', short: 'LONG',
    blurb: 'Owns the approach and reaches the standoff aircraft nothing else can touch — '
      + 'jammers, suppression, the things sitting outside everyone else\'s envelope.',
  },
};

/**
 * Ground systems, one per class. Engagement `channels` is the real constraint: a
 * battery with eight rounds and two channels can only ever be fighting two
 * targets, so a fourteen-ship raid beats it on arithmetic no matter how good the
 * operator is.
 */
export const SAM_TYPES = {
  bastion: {
    id: 'bastion',
    /** Which of the four classes of air defence this is. */
    class: 'long',
    label: 'BASTION',
    name: 'Long-range battalion',
    maxRangeKm: 120,
    minRangeKm: 6,
    maxAltM: 25000,
    minAltM: 120,
    missileSpeed: 1.35,   // km/s
    channels: 4,
    /** Seconds from assignment to first round away. */
    reactionS: 9,
    /** Seconds between rounds of a salvo. */
    salvoGapS: 2.5,
    readyRounds: 8,
    magazine: 16,
    reloadS: 95,
    pkBase: 0.8,
    /** Displacement time if the crew relocates, seconds. */
    scootS: 210,
    /**
     * The acquisition set: the battalion's own search picture, turning
     * through the full circle. Long-range batteries are the only class that
     * carries two sets, and this is the one the rest of the game means when
     * it says "the battery's radar".
     */
    radar: {
      kind: 'acq', label: 'BASTION ACQ',
      rangeKm: 224, heightM: 26, scanPeriodS: 10, warmupS: 12,
      /** How loudly it advertises itself to enemy ELINT. */
      elintGain: 1.5,
    },
    /**
     * And the fire-control set, which is a different machine entirely.
     *
     * It sits on a mount that covers a hundred and twenty degrees and traverses
     * at five degrees a second, so swinging it from one edge of its arc to the
     * other is the better part of half a minute. Nothing is guided that it is
     * not pointing at. That is what a long-range battalion actually is: enormous
     * reach through one soda straw, and the operator's job is deciding which way
     * the straw points before the raid tells them.
     */
    fcRadar: {
      kind: 'fc', label: 'BASTION FC',
      rangeKm: 194, heightM: 26, scanPeriodS: 4, warmupS: 8,
      elintGain: 1.3,
      fovDeg: 120,
      slewRateDegPerS: 5,
    },
  },
  lance: {
    id: 'lance',
    /** Which of the four classes of air defence this is. */
    class: 'medium',
    label: 'LANCE',
    name: 'Medium-range battery',
    maxRangeKm: 42,
    minRangeKm: 3,
    maxAltM: 15000,
    minAltM: 60,
    missileSpeed: 1.05,
    channels: 2,
    reactionS: 6,
    salvoGapS: 2,
    readyRounds: 8,
    magazine: 16,
    reloadS: 62,
    pkBase: 0.8,
    scootS: 130,
    radar: {
      kind: 'fc', label: 'LANCE FC',
      rangeKm: 93, heightM: 13, scanPeriodS: 6, warmupS: 8,
      elintGain: 1.0,
    },
  },
  thistle: {
    id: 'thistle',
    /** Which of the four classes of air defence this is. */
    class: 'short',
    label: 'THISTLE',
    name: 'Point defence section',
    maxRangeKm: 12,
    minRangeKm: 0.8,
    maxAltM: 6000,
    minAltM: 15,
    missileSpeed: 0.85,
    channels: 2,
    reactionS: 3.5,
    salvoGapS: 1.2,
    readyRounds: 8,
    magazine: 24,
    reloadS: 34,
    pkBase: 0.78,
    scootS: 55,
    radar: {
      kind: 'fc', label: 'THISTLE FC',
      rangeKm: 39, heightM: 7, scanPeriodS: 3, warmupS: 4,
      elintGain: 0.6,
    },
  },
  hammer: {
    id: 'hammer',
    /** Which of the four classes of air defence this is. */
    class: 'guns',
    label: 'HAMMER',
    name: 'Gun battery',
    maxRangeKm: 4,
    minRangeKm: 0.15,
    maxAltM: 2500,
    minAltM: 0,
    missileSpeed: 1.0,    // shell time of flight
    channels: 1,
    reactionS: 2,
    salvoGapS: 0.6,
    readyRounds: 12,      // bursts
    magazine: 40,
    reloadS: 18,
    pkBase: 0.3,
    scootS: 40,
    radar: {
      kind: 'fc', label: 'HAMMER DIR',
      rangeKm: 21, heightM: 5, scanPeriodS: 2, warmupS: 2,
      elintGain: 0.35,
    },
  },
};

/** Standalone surveillance radars — no weapons, long reach, and a lightning rod. */
export const RADAR_TYPES = {
  ewr: {
    kind: 'ewr', label: 'WIDE EYE',
    name: 'Early warning radar',
    rangeKm: 449, heightM: 32, scanPeriodS: 12, warmupS: 20,
    elintGain: 2.0,
    hp: 60,
  },
  gapfiller: {
    kind: 'acq', label: 'LOW LOOK',
    name: 'Gap-filler radar',
    rangeKm: 164, heightM: 18, scanPeriodS: 5, warmupS: 9,
    elintGain: 1.1,
    hp: 45,
  },
};

/** Detection model constants. */
export const DETECTION = {
  /**
   * Probability of detection on a single scan is s/(1+s) with s = (Reff/r)^4,
   * giving 50% right at the nominal range and a fast, physical roll-off.
   */
  pdExponent: 4,
  /**
   * The radar cross-section a set's advertised range is quoted against.
   *
   * Range scales as the fourth root of RCS, and that scaling used to be
   * applied with no reference at all — `rangeKm * rcs**0.25` — which made
   * every data plate in the game wrong. A striker (rcs 5) multiplied every
   * advertised range by 1.50, a jammer by 2.24, an airliner by 2.51: the
   * hundred-and-fifty-kilometre early-warning set really reached two hundred
   * and twenty-five against the commonest target in the game and three
   * hundred and seventy-six against civil traffic, and a sixty-two-kilometre
   * fire-control set was measured holding a striker at a hundred and forty
   * nine. Anchored to the striker, `rangeKm` now means what it says: the
   * range this set sees a standard strike aircraft at. Everything else is
   * relative to that — a cruise missile at 0.38, an anti-radiation round at
   * 0.32, a decoy fractionally larger than the thing it imitates.
   */
  referenceRcs: 5,
  /*
   * Note on the plates: every radar's `rangeKm` was multiplied by 5**0.25
   * (1.4953) at the same time this anchor was introduced, so the two changes
   * cancel exactly and detection behaviour is bit-identical for every target
   * class. What changed is truthfulness — and the scope, which draws each
   * set's coverage circle at `rangeKm` and was therefore drawing a ring a
   * third smaller than the range contacts actually appeared at. A player
   * watching blips light up outside their own radar's circle is not wrong to
   * call that broken.
   */
  /** Below this altitude a target sits in ground clutter, in metres. */
  clutterAltM: 300,
  /** Worst-case detection multiplier for a target buried in clutter. */
  clutterPenalty: 0.45,
  /** Clutter is only a problem past this fraction of nominal range. */
  clutterOnsetFraction: 0.35,
  /**
   * Quality gained per successful scan hit, and lost per second without one.
   * These two have to be read together with scan period: a twelve-second early
   * warning scan must still be able to hold a track, so decay per scan interval
   * (0.012 x 12 = 0.14) has to sit well under the per-hit gain.
   */
  qualityGain: 0.3,
  qualityDecayPerS: 0.012,
  /** Quality at which a track is firm enough to shoot on. */
  firmQuality: 0.55,
  /** Seconds of no update before a track starts coasting on last velocity. */
  coastAfterS: 16,
  /** Seconds of coasting before the track is dropped entirely. */
  dropAfterS: 45,
  /** Plots within this distance of a track's prediction correlate to it, km. */
  correlationRadiusKm: 4.5,
  /** Without central fusion, plots must fall much closer to associate. */
  degradedCorrelationRadiusKm: 1.6,
  /** Seconds of observation to classify a track's type. */
  idTimeS: 26,
  /**
   * The attention tell. A decoy flies an impossibly steady line, and a track
   * held continuously above this quality for this long gives it away at ANY
   * range — but holding a track that well means keeping radars on it, which
   * means radiating, which is the game's own currency. The alternative tell —
   * simple proximity, inside the decoy's tellRangeKm — arrives after most
   * batteries have already fired. Discrimination is a skill you pay for in
   * exposure, or a fact you learn too late for free.
   */
  steadyTellQuality: 0.85,
  steadyTellS: 30,
};

/** Surface-to-air engagement resolution. */
export const ENGAGEMENT = {
  /** Pk multiplier at the very edge of the envelope. */
  edgeRangePk: 0.42,
  /** Fraction of max range inside which Pk is unpenalised. */
  sweetSpotFraction: 0.62,
  /**
   * A net-assigned engagement holds its fire while a closing target is still
   * outside this fraction of max range, so the shot resolves near the sweet
   * spot instead of at the edge. Crews self-engaging on weapons free do NOT
   * hold — doctrine for a free battery is to engage at first opportunity, and
   * that eagerness is what delegation costs: the same rounds, spent at the
   * worst end of the Pk curve. This is the mechanical gap between a commander
   * who assigns and a commander who walks away.
   */
  holdFireFraction: 0.72,
  /**
   * But never hold longer than this — a crossing target still gets shot.
   * Sized for the long-range battalion: a striker closing at a quarter of a
   * kilometre a second needs the better part of a minute to come down from
   * the envelope edge to the hold-fire line, and a cap shorter than that
   * quietly turned every assigned long-range shot back into an edge launch.
   */
  holdFireMaxS: 45,
  /**
   * Pk multiplier for a round LAUNCHED at the very edge of the envelope,
   * independent of where it intercepts. A maximum-range shot arrives with no
   * energy left to manoeuvre and opens on the worst possible guidance basket;
   * chasing the target deeper into the envelope before firing is the whole
   * craft of the assignment. Without this term, launch discipline was free —
   * an inbound target closed the range before intercept and the edge penalty
   * evaporated, which is why snap-shooting everything used to work.
   */
  edgeLaunchPk: 0.62,
  /**
   * Hold for a better shot only when there is time to spend. A target whose
   * time-to-impact on its predicted objective is inside this many seconds is
   * shot at the first opportunity whatever its range — a terminal cruise
   * missile does not grant second chances, and a launch in the air is also
   * suppression, forcing the evasive break that delays a weapon release.
   * "Time available" is the first input of real fire control, and it is what
   * separates the patient shot from the late one.
   */
  holdFireMinTtiS: 75,
  /**
   * Launch-quality Pk below which a shot cannot break the target's nerve.
   * The round still flies and can still kill; it just does not read as the
   * kind of attack anyone jettisons a war load over.
   */
  crediblePk: 0.3,
  /*
   * Pk multiplier at a system's own altitude floor, sloping back to 1 at three
   * times it (or 200 m, whichever is higher). Was a flat 0.6 applied as a
   * cliff at a fixed 250 m for every class; a slope charges the difficulty of
   * a low engagement in proportion to how low it actually is.
   */
  lowAltPk: 0.7,
  /** Pk multiplier against a cruise-missile-sized target. */
  smallTargetPk: 0.68,
  /**
   * And a round in flight is harder again than a small aircraft: a fraction of
   * the size, quick, and crossing the envelope in seconds. Terminal defence is
   * a real option and a poor bet — which is the honest shape for it.
   */
  versusRoundPk: 0.55,
  /** Pk multiplier when the guiding radar went dark before terminal. */
  unguidedPk: 0.11,
  /** Seconds a missile can coast unguided before it is written off. */
  unguidedGraceS: 5,
  /** Distance at which the round detonates, km. */
  lethalRadiusKm: 0.12,
  /** Hard cap on a round's flight time, seconds. */
  maxFlightS: 220,
  /** Seconds a striker needs after being fired on before it can steady up again. */
  reengageDelayS: 4,
};

/** Anti-radiation missiles — the enemy's answer to your emissions. */
export const ARM = {
  speed: 0.92,
  maxFlightS: 190,
  lethalRadiusKm: 0.2,
  /** Pk when the radar is still radiating at impact. */
  pkEmitting: 0.86,
  /** Pk when the radar shut down late — the round remembers where it was. */
  pkMemory: 0.34,
  /** Pk when the radar shut down early enough to matter. */
  pkShutdownEarly: 0.09,
  /** Shutting down more than this many seconds before impact counts as early. */
  earlyShutdownS: 16,
  /** Damage dealt to a site on a hit. */
  damage: 70,
  /** Seconds of warning the crew gets, if anyone is watching. */
  warningLeadS: 20,
};

/** What the raid is trying to destroy, and what it costs you to lose it. */
export const ASSET_TYPES = {
  c2: {
    id: 'c2', label: 'SECTOR OPS', name: 'Sector operations centre',
    value: 40, hp: 110,
    /** Losing this is what breaks the integrated picture. */
    critical: true,
  },
  airbase: { id: 'airbase', label: 'AIRBASE', name: 'Airbase', value: 30, hp: 150 },
  /**
   * A district town — Kubin, Lozan, Brasov.
   *
   * The generic version of the Ville: somewhere with people in it that is not
   * where you are from. That distinction is the entire subject of district
   * command, where you find out how you rank three towns none of which is
   * yours, and then find out at the next appointment that somebody was already
   * ranking yours.
   */
  city: {
    id: 'city', label: 'DISTRICT TOWN', name: 'District town',
    value: 20, hp: 300, civilian: true,
  },
  power: { id: 'power', label: 'POWER', name: 'Power station', value: 16, hp: 85 },
  depot: { id: 'depot', label: 'DEPOT', name: 'Munitions depot', value: 14, hp: 75 },
  bridge: { id: 'bridge', label: 'BRIDGE', name: 'River crossing', value: 10, hp: 60 },
  town: {
    /*
     * A village spread along a valley, not a single building. It takes a great
     * deal of killing, which is what makes defending it a real proposition
     * rather than a foregone loss — and what makes the damage figure a measure
     * of how much of it is left rather than a hit counter.
     */
    id: 'town', label: 'THE VILLE', name: 'The Ville', value: 26, hp: 420,
    /** Civilian: damage here is reported in people, not percentages. */
    civilian: true,
    /** And it is where the operator is from, which the debrief does not forget. */
    home: true,
  },
  /**
   * The district hospital.
   *
   * Note the two numbers. `value` is what sector command's ledger says it is
   * worth, and it is almost nothing — a hospital defends no bridges and produces
   * no steel. `scoreValue` is what it is actually worth. Every other structure
   * in this game has those two figures set to the same number. This one does
   * not, and the watch it appears on is the watch where the operator finds out
   * that the state's arithmetic and their own were never the same arithmetic.
   */
  hospital: {
    id: 'hospital', label: 'DISTRICT HOSPITAL', name: 'District hospital',
    value: 8,
    scoreValue: 55,
    /*
     * Stout enough to survive two weapon releases and fall to the third. At
     * 120 it fell to the second, which made saving it require killing four
     * raiders of the package's five — measured, a deliberate westward defence
     * with rounds to spare still lost the building one night in two on the
     * arithmetic alone. The freeze is meant to be what loses this place, not
     * a binomial.
     */
    hp: 200,
    civilian: true,
  },
  /**
   * A refugee encampment across the Listonian border.
   *
   * Trans-Mordovian dissidents who left, and who the state would rather were
   * not there to be pointed at. Its `value` is zero — sector command's ledger
   * does not merely undervalue this place, it does not recognise it — and its
   * `scoreValue` is the highest of anything on the board. There is no clearer
   * statement of the gap between the two arithmetics anywhere in the game.
   */
  camp: {
    id: 'camp', label: 'REFUGEE ENCAMPMENT', name: 'Refugee encampment',
    value: 0,
    scoreValue: 70,
    hp: 90,
    civilian: true,
    /** Outside national territory, which is the whole of the argument. */
    foreign: true,
  },
  /**
   * The seat of the state, in Mostrograd. Worth more to sector command than
   * everything else on the board combined — which is the entire problem with it.
   */
  palace: {
    /*
     * A palace complex rather than a single roof — hard enough that a committed
     * defence holds it, soft enough that an absent one does not. Both cities
     * have to be genuinely defensible for the choice between them to mean
     * anything; if either were doomed regardless, this would be a cutscene.
     */
    id: 'palace', label: 'PRESIDENTIAL PALACE', name: 'Presidential palace',
    value: 70, hp: 420,
    critical: false,
    /** Losing it is not survivable for the person who was on watch. */
    regime: true,
  },
  ministry: {
    id: 'ministry', label: 'STATE MINISTRY', name: 'Ministry building',
    value: 22, hp: 95,
  },
  /**
   * Demobodedovo, the state field south-east of Mostrograd.
   *
   * On the roster it is an airfield like any other. On the one watch it
   * appears, it is the place an aircraft leaves from, and what the runway is
   * worth has nothing to do with the runway.
   */
  airport: {
    id: 'airport', label: 'DEMOBODEDOVO', name: 'Demobodedovo state airport',
    value: 24, hp: 130,
  },
  /**
   * Where you are.
   *
   * The forward post is co-located with the battalion you belong to, so on the
   * last watch your own position is also the only battery that can reach both
   * cities. Losing it ends your watch; saving it by displacing takes that
   * battery out of the fight for as long as the move takes. There is no version
   * of this where all three survive.
   */
  post: {
    /*
     * Sized so that ignoring the third axis kills you and answering it costs
     * four or five rounds: three strike aircraft carry enough to level the post
     * twice over, and stopping two of the three leaves you standing.
     */
    /*
     * Valued between the village and the palace. Threat ranking is "what will
     * hurt me most", and losing this ends the watch — at a low value the
     * aircraft coming to kill the operator sorted below everything else on the
     * board, which is not how anybody prioritises anything.
     */
    id: 'post', label: 'FORWARD POST', name: 'Sector forward post',
    value: 55, hp: 170,
    /** Destroying this is destroying the operator. */
    isPost: true,
  },
};

/** Battle damage to your own sites and consoles. */
export const DAMAGE = {
  /** Damage above which a site is destroyed outright. */
  destroyedAt: 100,
  /** A hit this close without a kill still wrecks things, km. */
  nearMissKm: 0.6,
  /** Seconds the scope is dark after a power interruption. */
  rebootMinS: 6,
  rebootMaxS: 10,
  /** Reaction time multiplier after crew casualties. */
  crewLossReactionMult: 1.8,
  /** Reload time multiplier after crew casualties. */
  crewLossReloadMult: 2.1,
  /** Half-width of a dead bearing wedge burned into a damaged scope, degrees. */
  deadSectorHalfWidthDeg: 22,
};

/**
 * The Command Net. Standing is the campaign's real health bar: it survives the
 * mission, it decides the tone of the next briefing, and at the bottom of the
 * scale it starts changing the missions you are given.
 */
export const COMMAND = {
  startingStanding: 50,
  minStanding: 0,
  maxStanding: 100,
  /** Seconds to answer a directive before it counts as ignored. */
  directiveTimeoutS: 45,
  /*
   * Half the wedge an accepted civil corridor closes, degrees. Twelve is a
   * scheduled airway's width plus the error in a bearing read off a scope,
   * and — measured — wide enough that a raid arriving on the same axis as the
   * transit is genuinely inside it rather than technically beside it.
   */
  civilCorridorHalfWidthDeg: 12,
  standing: {
    perKill: 0.7,
    perLeaker: -4,
    perAssetLost: -14,
    perCriticalAssetLost: -22,
    /** Per civilian-area hit. */
    perCivilianHit: -6,
    directiveObeyed: 4,
    directiveRefused: -9,
    directiveIgnored: -12,
    /** Per round expended beyond the mission's allowance. */
    perWastedRound: -0.4,
    /** Per minute of total emissions silence, once past the grace period. */
    perDarkMinute: -2.5,
    darkGraceS: 120,
    /** Awarded for finishing with every defended asset intact. */
    cleanSweep: 8,
    /** Awarded for surviving with your own site intact. */
    siteIntact: 3,
  },
  /** Standing thresholds for the consequence tiers. */
  tiers: [
    { min: 78, id: 'commended', label: 'COMMENDED' },
    { min: 55, id: 'satisfactory', label: 'SATISFACTORY' },
    { min: 34, id: 'noted', label: 'UNDER REVIEW' },
    { min: 15, id: 'flagged', label: 'FLAGGED' },
    { min: 0, id: 'condemned', label: 'REFERRED' },
  ],
};

/** Difficulty scales the raid, not the player's tools. */
export const DIFFICULTY = {
  rookie: {
    id: 'rookie', label: 'CONSCRIPT',
    blurb: 'A smaller raid, forgiving rounds, and a command with better things to do than read your log.',
    raidScale: 0.7, enemyPkMult: 0.7, friendlyPkMult: 1.15,
    armAccuracyMult: 0.7, directiveRate: 0.5, standingLossMult: 0.6,
  },
  veteran: {
    id: 'veteran', label: 'OFFICER', recommended: true,
    blurb: 'The war as designed. Start here.',
    raidScale: 1, enemyPkMult: 1, friendlyPkMult: 1,
    armAccuracyMult: 1, directiveRate: 1, standingLossMult: 1,
  },
  nightmare: {
    id: 'nightmare', label: 'EXPENDABLE',
    blurb: 'A third more aircraft, sharper suppression, and a political section that reads everything twice.',
    raidScale: 1.35, enemyPkMult: 1.2, friendlyPkMult: 0.88,
    armAccuracyMult: 1.2, directiveRate: 1.5, standingLossMult: 1.4,
  },
};

/** Weapons release states a battery can be held in. */
export const WEAPON_STATES = ['hold', 'tight', 'free'];

export const ROLES = {
  net: { id: 'net', label: 'BATTLE MANAGER', blurb: 'Run the picture. Assign the shooters.' },
  crew: { id: 'crew', label: 'SAM OPERATOR', blurb: 'Crew one battery. Acquire, launch, survive.' },
  both: { id: 'both', label: 'COMMANDER', blurb: 'Run the picture and take a console yourself.' },
};
