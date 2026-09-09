import { reachedEchelon, withinAppointment } from './echelon.js';
import { AIR_TYPES } from './config.js';

/**
 * The campaign.
 *
 * Each mission teaches exactly one thing and then never lets you forget it.
 * The order is deliberate: you learn to read the picture before anyone starts
 * shooting at your radars, and you learn to blink before the night you have to
 * do it while sector operations is burning.
 *
 * Geography is shared across all six so the ground becomes familiar — the same
 * river crossing, the same airbase, the same town — which is what makes losing a
 * piece of it land.
 */

/** The defended area. Everything is in km from the centre of the Ville. */
const GROUND = {
  town: { id: 'a_town', type: 'town', pos: { x: 0, y: 0 } },
  c2: { id: 'a_c2', type: 'c2', pos: { x: -9, y: -7 } },
  airbase: { id: 'a_airbase', type: 'airbase', pos: { x: 15, y: 11 } },
  power: { id: 'a_power', type: 'power', pos: { x: -19, y: 13 } },
  depot: { id: 'a_depot', type: 'depot', pos: { x: 7, y: -21 } },
  bridge: { id: 'a_bridge', type: 'bridge', pos: { x: 23, y: -9 } },
};

/**
 * Mostrograd, 117 km north-east of the Ville, and the palace in it.
 *
 * The distance is the whole design of the final watch: far enough that a
 * medium battery covering one city is useless over the other, close enough that
 * a single long-range battalion placed exactly between them can *just* reach
 * both — and, with four channels and eight rounds, still cannot stop two raids.
 * The tool that can technically do both is the tool that proves you cannot.
 */
const CAPITAL_GROUND = {
  palace: { id: 'a_palace', type: 'palace', label: 'PRESIDENTIAL PALACE', pos: { x: 100, y: 60 }, cluster: 'capital' },
  ministry: { id: 'a_ministry', type: 'ministry', label: 'STATE MINISTRY', pos: { x: 108, y: 52 }, cluster: 'capital' },
  capitalPower: { id: 'a_cap_power', type: 'power', label: 'MOSTROGRAD POWER', pos: { x: 92, y: 70 }, cluster: 'capital' },
};

/**
 * The district hospital, out on the Kubin road.
 *
 * Sited deliberately clear of everything else that is defended: forty-odd
 * kilometres from the Ville and twenty-five from the nearest other structure, so
 * a contact committed to it is unambiguous and the decision about it is a
 * decision rather than an accident of geometry. LANCE WEST covers it comfortably
 * — with the same rounds and the same two channels that the town and the power
 * station need.
 */
const HOSPITAL = { id: 'a_hospital', type: 'hospital', label: 'DISTRICT HOSPITAL', pos: { x: -40, y: 20 } };

/**
 * The encampment, over the Listonian border beyond the Kubin ridge.
 *
 * Sited so that LANCE WEST can reach it comfortably — the whole watch turns on
 * the fact that you can save these people, not on whether you can.
 */
const CAMP = { id: 'a_camp', type: 'camp', label: 'REFUGEE ENCAMPMENT', pos: { x: -58, y: 20 } };

/**
 * Demobodedovo, the state field south-east of Mostrograd.
 *
 * Twenty-six kilometres from the palace and well clear of the city, on the
 * Tavrov road. It exists on the map for one watch, and on that watch what
 * matters about it is not the runway but the direction the runway points.
 */
const AIRPORT = { id: 'a_airport', type: 'airport', label: 'DEMOBODEDOVO', pos: { x: 112, y: 40 } };

const SITES = {
  bastion: { id: 's_bastion', type: 'bastion', name: 'BASTION', pos: { x: 2, y: 28 } },
  lanceWest: { id: 's_lance_w', type: 'lance', name: 'LANCE WEST', pos: { x: -24, y: 6 } },
  lanceEast: { id: 's_lance_e', type: 'lance', name: 'LANCE EAST', pos: { x: 21, y: -4 } },
  thistleTown: { id: 's_thistle_t', type: 'thistle', name: 'THISTLE TOWN', pos: { x: -2, y: 3 } },
  thistleBase: { id: 's_thistle_b', type: 'thistle', name: 'THISTLE FIELD', pos: { x: 14, y: 9 } },
  hammer: { id: 's_hammer', type: 'hammer', name: 'HAMMER', pos: { x: 1, y: -2 } },

  /*
   * Positions used only on the last watch.
   *
   * The point-defence sections are sited *forward, on the threat axis*, not on
   * top of what they protect. A strike aircraft releases eighteen kilometres
   * out; a twelve-kilometre section sitting on the target covers to sixteen and
   * therefore never gets a shot at anything before it has already dropped. Push
   * it up the axis and it covers the release point instead, which is the whole
   * job of point defence and the difference between a battery that fights and a
   * battery that watches.
   */
  bastionCentre: { id: 's_bastion', type: 'bastion', name: 'BASTION', pos: { x: 50, y: 30 } },
  lanceVille: { id: 's_lance_w', type: 'lance', name: 'LANCE VALLEY', pos: { x: -16, y: 10 } },
  lanceCapital: { id: 's_lance_e', type: 'lance', name: 'LANCE CAPITAL', pos: { x: 108, y: 74 } },
  thistleVille: { id: 's_thistle_t', type: 'thistle', name: 'THISTLE VALLEY', pos: { x: -15, y: 6 } },
  thistlePalace: { id: 's_thistle_b', type: 'thistle', name: 'THISTLE NORTH', pos: { x: 106, y: 74 } },
  /*
   * The capital's own gun battery. Without it the two sides of the last watch
   * are not symmetric — the valley fields three batteries and Mostrograd two,
   * which made the palace indefensible however hard the operator committed to
   * it, and turned a choice between two cities into a choice between one city
   * and nothing.
   */
  hammerCapital: { id: 's_hammer_e', type: 'hammer', name: 'HAMMER CAPITAL', pos: { x: 102, y: 63 } },

  /*
   * The epilogue's order of battle, strung out along a departure corridor
   * rather than ringed around a place.
   *
   * The long-range battalion south-east of the city is the spine of it: sited
   * at Tavrov it reaches from the northern approaches to the capital all the
   * way down the outbound leg, which is the only way one battery can cover a
   * hundred and thirty kilometres of somebody else's flight plan. Everything
   * else covers a point — the field, the palace, the last stretch — and none of
   * them covers two.
   */
  bastionTavrov: { id: 's_bastion_se', type: 'bastion', name: 'BASTION TAVROV', pos: { x: 120, y: 22 } },
  lanceOutbound: { id: 's_lance_out', type: 'lance', name: 'LANCE YASEN', pos: { x: 160, y: -20 } },
  lanceCity: { id: 's_lance_city', type: 'lance', name: 'LANCE MOSTROGRAD', pos: { x: 96, y: 74 } },
  thistleField: { id: 's_thistle_fld', type: 'thistle', name: 'THISTLE FIELD', pos: { x: 110, y: 47 } },
  hammerPalace: { id: 's_hammer_pal', type: 'hammer', name: 'HAMMER PALACE', pos: { x: 100, y: 62 } },
};

const RADARS = {
  ewrNorth: { type: 'ewr', pos: { x: 3, y: 46 }, on: true },
  gapSouth: { type: 'gapfiller', pos: { x: -28, y: -18 }, on: true },
};

/* ------------------------------------------------------------------ *
 * The district.
 *
 * Four sectors and a hundred and ninety kilometres of ground, laid out on the
 * same map the first eight watches are fought on — the Ville is still at the
 * origin, Kubin is still up the western road, and the difference is that you
 * can now see all of it and reach almost none of it.
 *
 * Every sector is built the same way on purpose: a town, something industrial,
 * and three batteries. They are interchangeable in every respect except which
 * one you are from, and the watches at this level are about discovering that
 * the ranking you are about to do is not the arithmetic you think it is.
 * ------------------------------------------------------------------ */

const DISTRICT_GROUND = {
  /** 4-B, the valley. Home. */
  villeTown: { id: 'a_town', type: 'town', pos: { x: 0, y: 0 }, cluster: 'ville' },
  villeC2: { id: 'a_c2', type: 'c2', pos: { x: -9, y: -7 }, cluster: 'ville' },
  villeBridge: { id: 'a_bridge', type: 'bridge', pos: { x: 23, y: -9 }, cluster: 'ville' },

  /** 2-A, Kubin, on the western road and eleven kilometres from the border. */
  kubinCity: { id: 'a_kubin', type: 'city', label: 'KUBIN', pos: { x: -74, y: 18 }, cluster: 'kubin' },
  kubinDepot: { id: 'a_kubin_depot', type: 'depot', label: 'KUBIN RAILHEAD', pos: { x: -66, y: 6 }, cluster: 'kubin' },

  /** 7-C, Lozan, under the northern hills and nearest the frontier. */
  lozanCity: { id: 'a_lozan', type: 'city', label: 'LOZAN', pos: { x: 62, y: 88 }, cluster: 'lozan' },
  lozanPower: { id: 'a_lozan_power', type: 'power', label: 'LOZAN POWER', pos: { x: 52, y: 96 }, cluster: 'lozan' },

  /** 5-D, Brasov, in the south, where nothing has happened yet. */
  brasovCity: { id: 'a_brasov', type: 'city', label: 'BRASOV', pos: { x: 30, y: -92 }, cluster: 'brasov' },
  brasovDepot: { id: 'a_brasov_depot', type: 'depot', label: 'BRASOV WORKS', pos: { x: 18, y: -82 }, cluster: 'brasov' },

  /** And the post you are sitting in. */
  districtPost: {
    id: 'a_district', type: 'c2', label: 'DISTRICT COMMAND POST',
    pos: { x: 14, y: 16 }, cluster: 'hq',
  },
};

const DISTRICT_SITES = {
  /** The district's own battalion, at the command post. Always yours. */
  bastionDistrict: {
    id: 's_bastion_d', type: 'bastion', name: 'BASTION DISTRICT',
    pos: { x: 12, y: 14 }, formation: 'f_hq',
  },

  lanceVille: { id: 's_lance_v', type: 'lance', name: 'LANCE VILLE', pos: { x: -6, y: 4 }, formation: 'f_ville' },
  thistleVille: { id: 's_thistle_v', type: 'thistle', name: 'THISTLE VILLE', pos: { x: 2, y: 3 }, formation: 'f_ville' },
  hammerVille: { id: 's_hammer_v', type: 'hammer', name: 'HAMMER VILLE', pos: { x: 1, y: -2 }, formation: 'f_ville' },

  lanceKubin: { id: 's_lance_k', type: 'lance', name: 'LANCE KUBIN', pos: { x: -68, y: 16 }, formation: 'f_kubin' },
  thistleKubin: { id: 's_thistle_k', type: 'thistle', name: 'THISTLE KUBIN', pos: { x: -74, y: 22 }, formation: 'f_kubin' },
  hammerKubin: { id: 's_hammer_k', type: 'hammer', name: 'HAMMER KUBIN', pos: { x: -73, y: 17 }, formation: 'f_kubin' },

  lanceLozan: { id: 's_lance_l', type: 'lance', name: 'LANCE LOZAN', pos: { x: 58, y: 82 }, formation: 'f_lozan' },
  thistleLozan: { id: 's_thistle_l', type: 'thistle', name: 'THISTLE LOZAN', pos: { x: 62, y: 88 }, formation: 'f_lozan' },
  hammerLozan: { id: 's_hammer_l', type: 'hammer', name: 'HAMMER LOZAN', pos: { x: 53, y: 95 }, formation: 'f_lozan' },

  lanceBrasov: { id: 's_lance_b', type: 'lance', name: 'LANCE BRASOV', pos: { x: 26, y: -86 }, formation: 'f_brasov' },
  thistleBrasov: { id: 's_thistle_b2', type: 'thistle', name: 'THISTLE BRASOV', pos: { x: 30, y: -92 }, formation: 'f_brasov' },
  hammerBrasov: { id: 's_hammer_b', type: 'hammer', name: 'HAMMER BRASOV', pos: { x: 19, y: -83 }, formation: 'f_brasov' },
};

const DISTRICT_RADARS = [
  { type: 'ewr', pos: { x: 8, y: 44 }, on: true },
  { type: 'gapfiller', pos: { x: -66, y: 24 }, on: true },
  { type: 'gapfiller', pos: { x: 56, y: 82 }, on: true },
  { type: 'gapfiller', pos: { x: 26, y: -80 }, on: true },
];

/**
 * The four subordinate commands, and the officers who have them.
 *
 * They are named because you will spend two watches watching them work and
 * never meet any of them. Their competence is fixed before the raid starts and
 * nothing you do changes it — which is the actual experience of commanding
 * through other people, and the reason the standing order you leave is the only
 * weapon you have at this level.
 */
const DISTRICT_FORMATIONS = [
  {
    id: 'f_hq', hq: true, name: 'DISTRICT BATTALION',
    tm: 'ОКРУЖНОЙ ДИВИЗИОН', en: 'District battalion',
    pos: { x: 12, y: 14 }, posture: 'tight',
  },
  {
    id: 'f_ville', name: 'SECTOR 4-B', tm: 'СЕКТОР 4-Б', en: 'Sector 4-B, the valley',
    pos: { x: 0, y: 0 }, posture: 'tight',
    commander: { name: 'MAJ. LENKO', tm: 'МАЙОР ЛЕНКО', competence: 1.05 },
  },
  {
    id: 'f_kubin', name: 'SECTOR 2-A', tm: 'СЕКТОР 2-А', en: 'Sector 2-A, Kubin',
    pos: { x: -70, y: 18 }, posture: 'tight',
    // Careful, slow, and correct about everything he is slow about.
    commander: { name: 'CAPT. RADU', tm: 'КАПИТАН РАДУ', competence: 0.72 },
  },
  {
    id: 'f_lozan', name: 'SECTOR 7-C', tm: 'СЕКТОР 7-В', en: 'Sector 7-C, Lozan',
    pos: { x: 58, y: 86 }, posture: 'tight',
    commander: { name: 'MAJ. VOLOH', tm: 'МАЙОР ВОЛОХ', competence: 0.95 },
  },
  {
    id: 'f_brasov', name: 'SECTOR 5-D', tm: 'СЕКТОР 5-Д', en: 'Sector 5-D, Brasov',
    pos: { x: 28, y: -88 }, posture: 'tight',
    /*
     * The political section's man. He will fight anything on the priority of
     * fires with great determination and will not expend a round on anything
     * that is not, and he has never once been wrong about which is which,
     * because the list is the list.
     */
    commander: { name: 'MAJ. STRELNIK', tm: 'МАЙОР СТРЕЛЬНИК', competence: 0.9, political: true },
  },
];

/**
 * The same four officers, with the competences one watch needs.
 *
 * The values above are the district's own establishment and two watches read
 * them. Four Sectors is the watch about the appointment itself, and it needs
 * its officers pitched against a person's own hand pass rather than against
 * each other: measured on the shipped values, three of the four answered their
 * boards faster than a competent player did, standing in a sector was worth
 * −12% of the watch's score, and a spectator who set four buttons and walked
 * away beat both hand players. Scoped here rather than edited in place because
 * Reinforce the Capital's moral trade is measured against the establishment
 * values and a district-wide change degrades it.
 */
const districtFormationsWith = (competence) => DISTRICT_FORMATIONS.map((formation) => (
  formation.commander && competence[formation.id]
    ? { ...formation, commander: { ...formation.commander, ...competence[formation.id] } }
    : formation));

/*
 * A civil airliner crossing the sector, oblivious.
 *
 * It comes down the same corridor the raid uses, because that is where the
 * airway is and the airway was drawn before anybody was shooting. It used to
 * enter on 290 and leave to the south-east, nowhere near any threat axis in
 * the campaign — which made the corridor order sector command transmits about
 * it ("weapons tight in that sector") an instruction that had never once, on
 * any watch, forbidden a shot anybody wanted to take. Now the wedge it closes
 * lies across the bearings the strikers arrive on, and accepting the order is
 * a decision with a price — measured at about 6% of the watch's score, against
 * the standing a refusal costs. The package behind the transit is yours to
 * answer personally or not at all. Ten thousand metres keeps it distinguishable
 * from everything else on that bearing, for an operator who is looking.
 *
 * The bearing is 325 and not closer: routed straight down the threat axis it
 * flies THROUGH the raid rather than beside it, the correlator starts swapping
 * its plots with a striker's, and the picture reports one track as CIVIL and
 * HOSTILE at once. Measured at 325, minimum separation is six to eight
 * kilometres and that pathology does not occur on any seed.
 */
const civilTransit = (atS) => ({
  atS, type: 'civil', count: 1, scalable: false,
  bearingDeg: 325, distanceKm: 200, altM: 10200,
  name: 'TRANSIT 118',
  waypoints: [{ x: 60, y: 25 }, { x: 175, y: -140 }],
});

export const SCENARIOS = [
  {
    id: 'first-light',
    name: 'First Light',
    subtitle: 'Four contacts, high and unhurried. Learn the scope.',
    theme: 'crt-green',
    echelon: 'battalion',
    roles: ['net', 'crew', 'both'],
    seed: 'first-light-01',
    /*
     * Two, not one. On the teaching watch a single leaker was the difference
     * between SECTOR HELD and SECTOR PENETRATED, and the most common way to
     * concede it was reading the interface for ninety seconds — the watch
     * that exists to teach the controls failed you for learning them.
     *
     * AND NOBODY WHO TOUCHES THE CONSOLE LOSES THIS WATCH, WHICH IS THE POINT
     * AND NOT AN OVERSIGHT. Measured, sixteen seeds a seat: novice, competent
     * and careful play all hold 100 per cent on all three seats, and only the
     * player who never touches a control fails — 0 per cent on the net and
     * from both seats, 75 in the cabin, where the sector's own crews fight the
     * watch around a silent battery. The difficulty rule wants a beginner
     * losing two watches in five, and tightening the allowance to one would
     * deliver that by failing a learner for the ninety seconds they spend
     * finding the switch, which is the exact defect the paragraph above
     * records fixing. A teaching watch that fails a learner has failed. What
     * it must do instead is fail the SPECTATOR, and it does. Stated here as
     * well as in the README because the last two scrubs both had to
     * rediscover that the number was deliberate.
     */
    leakerTolerance: 2,
    /**
     * Sector command stays off the net for the first minute and a half. The
     * player's first interactive decision on the teaching watch should be an
     * assignment, not a timed loyalty test whose economics nothing has
     * explained yet — the first directive used to land at forty-nine seconds,
     * before the first contact had even classified hostile.
     */
    directiveGraceS: 95,
    /** And a clear minute of fighting, whenever the first contact paints. */
    directiveContactGraceS: 60,
    /*
     * The brief promises "a radar has to be radiating to see", and then the
     * early-warning set used to come up lit and the lesson never happened.
     * WIDE EYE starts cold; the net talks the player to the switch; and if
     * nobody touches it, sector brings the set up remotely at one minute —
     * a safety, logged as exactly what it is.
     *
     * The same safety now reaches BASTION's own antennas, which is the second
     * half of the same lesson and was missing from the seat that needed it.
     * A cabin sits behind somebody else's picture until it radiates, and on
     * this watch the sector's crews raise WIDE EYE a tenth of a second in — so
     * the crew seat could ride the whole teaching watch on a set it never
     * switched on, with its own tube dark and nothing saying why.
     */
    radarSafetyAtS: 60,
    /*
     * And the seat itself is simplified: displacement, salvo policy, riding
     * an ARM and the exposure gauge belong to watches where somebody shoots
     * back. On this one they are eight extra controls between a new operator
     * and the two that matter — the radar switch and the assignment.
     */
    basicConsole: true,
    /** And walked through interactively: five steps, each cleared by doing it. */
    tutorial: true,
    /*
     * A full crew on a quiet range reloads fast. Measured without this, one
     * seed in five ended the teaching watch on a literal ninety-five second
     * RELOADING bar with a single blip on the scope — the first watch of the
     * game, doubling to eight minutes, its final act a countdown.
     */
    reloadMult: 0.35,
    /*
     * THE LESSON, AND THE OTHER TRUE SENTENCE FOR THE SAME SLOT.
     *
     * Both radiate lines used to fire unconditionally, so a player who found
     * the switch at one second was told at twelve that their set was dark and
     * at thirty where the switch was: measured, "THE SET IS NOT RADIATING"
     * printed in twelve of twelve traced cells and was true in four. A
     * teaching watch that contradicts its own lesson teaches the player to
     * stop reading the net, which is the one habit this watch cannot afford
     * to build.
     *
     * So each line is a pair. `whileCold` reads the surveillance sets and
     * `whileOwnCold` reads the battery you are sitting in; when the world has
     * outrun the sentence, `insteadText` says the other true thing rather than
     * leaving a hole where a line was scheduled. The cabin gets its own pair
     * because in the cabin the lesson is a different antenna: sector's crews
     * raise WIDE EYE at once and the tube in front of you stays dark until you
     * throw the switch yourself.
     *
     * The last three are the room, not the lesson. Measured on the spectator
     * cabin — a player who touches nothing while the sector's crews fight —
     * the watch went silent from 141 s to 188 s and again from 238 s to 431 s,
     * three minutes and a quarter of a teaching watch with nothing said in it.
     */
    chatter: [
      { atS: 12,
        whileCold: true,
        text: 'WIDE EYE REPORTS READY. THE SET IS NOT RADIATING — NOTHING WILL PAINT UNTIL IT IS.',
        insteadText: 'WIDE EYE IS RADIATING AND THE TUBE IS YOURS. EVERYTHING NORTH OF THE RIVER IS OURS TO SORT.' },
      { atS: 30,
        whileCold: true,
        text: 'THE RADIATE SWITCH IS ON THE RIGHT PANEL, UNDER WIDE EYE. THE BORDER POSTS CAN HEAR THEM COMING.',
        insteadText: 'THE BORDER POSTS CAN HEAR THEM COMING. WHATEVER PAINTS, HAND IT TO A BATTERY THAT REACHES IT.' },
      { atS: 22,
        whileOwnCold: true,
        text: 'YOUR OWN SET IS COLD. SECTOR CAN SEE THEM; YOU CANNOT SHOOT WHAT YOU ARE NOT HOLDING.',
        insteadText: 'YOUR SET IS UP AND THE BATTALION IS ON THE RAILS. WAIT FOR SOMETHING THAT COMES INSIDE YOUR RING.' },
      { atS: 46,
        whileOwnCold: true,
        text: 'RADIATE WHEN YOU ARE READY — THE CAP MARKED ИЗЛУЧЕНЬ · RADIATE, AND IT IS YOURS.',
        insteadText: 'BATTALION REPORTS FOUR ON THE RAILS AND A CLEAR ARC. NOTHING IS SHOOTING BACK TONIGHT.' },
      { atS: 150, text: 'BORDER POST FOUR REPORTS THE FIRST PASS TURNING NORTH. THEY ARE NOT HURRYING.' },
      { atS: 250, text: 'RANGE CONTROL: SECOND ELEMENT LIFTED TWENTY MINUTES AGO OUT OF THE NORTH-EAST. TWO OF THEM.' },
      { atS: 340, text: 'STAFF WANTS A COUNT WHEN YOU HAVE ONE. NOBODY UP HERE HAS DONE THIS EITHER.' },
    ],
    /*
     * The crew seat sits at BASTION, because BASTION is the battery this
     * raid is actually for. It used to sit at LANCE WEST — measured: across
     * an entire crew-seat watch, not one contact entered that battery's
     * envelope, its radar never turned on, and the AI won the mission in
     * front of a player whose teaching watch was five minutes of nothing.
     */
    playerBatteryId: 's_bastion',
    brief: [
      'Four contacts crossed the border at height, tracking south. They are not trying to hide.',
      'Bring a radar up, sort the picture, and hand each track to a battery that can reach it.',
      'Nothing is shooting back at you tonight. Enjoy that.',
    ],
    teaches: 'Tracking, assignment, and the fact that a radar has to be radiating to see.',
    assets: [GROUND.town, GROUND.c2, GROUND.airbase, GROUND.power],
    sites: [SITES.bastion, SITES.lanceWest, SITES.thistleTown],
    radars: [{ ...RADARS.ewrNorth, on: false }],
    /*
     * Four, and then two more.
     *
     * The teaching watch used to be one package: four aircraft spawned inside
     * the first ninety seconds, and everything after that was chasing whatever
     * the first pass had missed. Measured over eight seeds that put the last
     * hostile of the night on the board at 30% of the watch, and the remaining
     * seventy per cent was one straggler being re-engaged until the dice
     * agreed — on seed p1 the same aircraft was missed at 165, 275 and 333
     * seconds and finally killed at 386. The watch ended when the random
     * numbers said so, which is not a designed ending.
     *
     * So the second element comes in from the north-east while the first one
     * is still being cleaned up, close enough that BASTION can reach it the
     * moment it appears. Two aircraft, not four: this is the watch that
     * teaches the scope, and the second element exists to give the lesson a
     * SECOND go — "now do that again, without being walked through it" — not
     * to be a test. The tutorial's five steps are all cleared on the first
     * package.
     */
    waves: [
      { atS: 20, type: 'striker', count: 4, bearingDeg: 355, spreadDeg: 26, spacingS: 22, altM: 7600 },
      { atS: 205, type: 'striker', count: 2, bearingDeg: 32, spreadDeg: 18, spacingS: 26, altM: 7100,
        distanceKm: 85 },
    ],
  },

  {
    id: 'low-riders',
    name: 'Low Riders',
    subtitle: 'They have read the same horizon tables you have.',
    theme: 'crt-green',
    echelon: 'battalion',
    roles: ['net', 'crew', 'both'],
    seed: 'low-riders-04',
    /*
     * THREE, and the number moved because the count under it did.
     *
     * First Light forgives two because it is the watch you learn the controls
     * on. This one is the second watch and it has TWENTY-EIGHT aircraft in
     * seven packages on five axes, fifteen of them under BASTION's own
     * horizon. It forgave two, then one — and both of those numbers were
     * written against a leaker count that omitted every cruise missile in the
     * raid, which on this watch is twelve of the twenty-eight. The engine now
     * counts a missile that arrives the same way it counts a bomb that is
     * dropped (see `stepCruise`), so "one" was in truth an allowance of one
     * bomb and twelve missiles, and the watch could not be lost the way its
     * own file said it could.
     *
     * On the honest count, sixteen seeds a seat, competent play concedes a
     * median of two: at an allowance of two the net holds 56 per cent, at
     * three 81, at four 94. Three is the top of the difficulty band, which is
     * where the second watch of the teaching act belongs, and it is the number
     * that makes act one the easiest act rather than the hardest. The raid,
     * the store and the five axes are untouched; what changed is that the
     * number in this line now means what it says.
     */
    leakerTolerance: 3,
    /*
     * Eighty-five seconds before sector command starts testing you, for the
     * same reason the teaching watch waits ninety-five. The first contact on
     * this one paints at seventeen seconds — that is the whole point of the
     * watch, a low approach arriving already close — and measured over eight
     * seeds the first routine directive used to land at fifty-five, which is
     * thirty-seven seconds of fighting. An operator who has been in contact
     * for half a minute has not yet formed the opinion the order is asking
     * them to have. Grace to eighty-five puts the first order at least a
     * minute into the shooting, which is the bar the rest of the campaign
     * already meets: Solo Battery gives eighty-four seconds and First Light
     * seventy-four.
     */
    directiveGraceS: 85,
    /** And a clear minute of fighting, whenever the first contact paints. */
    directiveContactGraceS: 60,
    /*
     * SEVENTY-FIVE, and this watch nearly did without one.
     *
     * `radarSafetyAtS` is the teaching watch's safety and it belongs here for
     * a different reason. This is the one watch whose cabin sits in a
     * long-range set behind somebody else's picture: two early-warning sets
     * are up from the first second, so the sector's plot fills whether or not
     * the operator ever throws their own switch — and the engine's blind-crew
     * line only fires when NOTHING at all is radiating, so it never fired
     * here. Measured in the browser: a crew watch spent 450 seconds dark with
     * twenty aircraft on the plot, guided by two sets that cannot see the
     * deck, and the only thing telling the operator was an amber lamp.
     *
     * Seventy-five and not sixty, because this is not the watch that teaches
     * the switch — it teaches the horizon — and an operator who has read the
     * console legend deserves the credit for finding it themselves. First
     * contact paints at eighteen seconds, so seventy-five is a clear minute of
     * a raid they can see and cannot touch, which is the argument.
     */
    radarSafetyAtS: 75,
    /*
     * The seat is BASTION, not the point-defence section.
     *
     * It used to be `s_thistle_t`, a twelve-kilometre set — and measured over
     * four seeds the raid never came within THIRTY-THREE kilometres of it.
     * Nothing was ever engageable, on any seed, for the whole watch: a player
     * who picked SAM OPERATOR here sat through twelve minutes they physically
     * could not join, and the first legal shot was `never` on half the seeds.
     * From BASTION it is 27-31 s to the first shot and 49% of the watch is
     * engageable. It is also the apt seat for this watch: the lesson of Low
     * Riders is that a low contact defeats the long-range set's own horizon,
     * and the way to feel that is to be sitting in the long-range set.
     */
    playerBatteryId: 's_bastion',
    /*
     * Seven tenths again in every store, and the reason is the same arithmetic
     * as Weasel Hour's — see the long note there.
     *
     * Thirty aircraft arrive on five axes and the crewed BASTION reaches
     * THIRTEEN of them — the other seventeen are under its hundred-and-twenty
     * metre floor, which is the watch's whole argument and the reason the
     * cabin sits in the long-range set rather than in the point-defence
     * section. Measured, cabin, competent, before this: it fired all
     * twenty-four of its rounds and then spent 30% of the watch with the
     * magazine as the ONLY thing between it and a legal shot, of which just
     * 10% was actually waiting on the loaders. The other twenty points were an
     * empty store, and no hoist fixes an empty store.
     *
     * With it, over sixteen seeds: sole-limiter share 15% in the cabin and 7%
     * on the net, the watch still held 69% of the time at competent and 94% at
     * expert, and the launcher busy — a legal shot, a channel committed or a
     * round of its own in the air — for 92% of the night.
     */
    storeMult: 1.7,
    brief: [
      'Second wave came in at height. This one will not.',
      'A radar on a thirty-metre mast sees a target at one hundred metres for about sixty kilometres, and',
      'not one metre further. You will get very little warning. Put the short-range sections where it matters.',
    ],
    teaches: 'Radar horizon. Low contacts appear close and stay close.',
    /*
     * The valley talks, because this watch had nothing to say for fourteen
     * minutes.
     *
     * Solo Battery carries eleven scripted lines and this carried none, on a
     * watch half again as long. Measured with the hole windows the scrub added
     * to the harness: the spectator cabin went silent from 366 s to 439 s, and
     * the back end of a played watch from 818 s to 895 s. Chatter draws no
     * random numbers and costs no rounds, so it is the one pacing instrument
     * that cannot move the balance — but it is only worth having if the lines
     * are the watch's own argument rather than filler, so every one of these
     * is either the horizon lesson arriving as information or somebody on the
     * ground who can hear what the sets cannot see.
     */
    chatter: [
      { atS: 26, text: 'WIDE EYE HAS THE HIGH PACKAGE. GAP SOUTH IS CLEAR — WHICH IS NOT THE SAME AS EMPTY.' },
      { atS: 62, text: 'BASTION REPORTS ITS FLOOR AT A HUNDRED AND TWENTY METRES. UNDER THAT IT IS A SPECTATOR.' },
      { atS: 118, text: 'FRONTIER POST: SOMETHING WENT OVER THE RIDGE LOW ENOUGH TO RATTLE THE WINDOWS. NOTHING ON ANY SET.' },
      { atS: 176, text: 'THISTLE TOWN AND HAMMER MANNED. TWELVE KILOMETRES OF SKY EACH, AND THEY ARE WHAT IS LEFT UNDER THE HORIZON.' },
      { atS: 232, text: 'TOWN WARDEN REPORTS THE SIRENS SOUNDED. THE MARKET IS EMPTY AND THE SCHOOL IS FULL.' },
      { atS: 288, text: 'GAP SOUTH REPORTS CLUTTER RISING ON THE WESTERN BEARINGS. THAT IS EITHER WEATHER OR IT IS NOT.' },
      { atS: 344, text: 'RIVER CROSSING ASKS WHETHER THE BRIDGE IS COVERED. SECTOR SAYS IT IS. SECTOR IS NOT LOOKING AT YOUR PLOT.' },
      { atS: 400, text: 'HAMMER SECTION HAS EYES ON THE LOW APPROACHES. THEY CAN HEAR ENGINES AND SEE NOTHING.' },
      { atS: 470, text: 'AIRFIELD ASKS WHETHER TO DISPERSE. TELL THEM WHAT YOU CAN REACH AND WHAT YOU CANNOT.' },
      { atS: 545, text: 'SECTOR WANTS A COUNT. WHATEVER GOT UNDER YOU IS STILL DOWN THERE SOMEWHERE.' },
      { atS: 620, text: 'BORDER POSTS REPORT THEM CROSSING BACK NORTH, LOW AND FAST, THE WAY THEY CAME.' },
      { atS: 700, text: 'TOWN WARDEN ASKS WHETHER IT IS OVER. NOBODY UP HERE WILL SAY SO YET.' },
    ],
    assets: [GROUND.town, GROUND.c2, GROUND.airbase, GROUND.power, GROUND.bridge],
    sites: [SITES.bastion, SITES.lanceWest, SITES.lanceEast, SITES.thistleTown, SITES.hammer],
    radars: [RADARS.ewrNorth, RADARS.gapSouth],
    waves: [
      /*
       * THE TWO LOW PACKAGES COME IN FROM A HUNDRED AND THIRTY-FIVE, NOT FROM
       * THE ENGINE'S DEFAULT HUNDRED AND FIFTY-FIVE.
       *
       * Not to shorten the ingress — under the horizon it makes no difference
       * to when they paint — but to shorten the EGRESS. The watch stays open
       * while a hostile is inside a hundred and ten kilometres of the centre
       * AND inside six tenths of some battery's reach, and a striker at a
       * hundred and thirty metres that has dropped its weapons and turned for
       * home crawls out through exactly that band. Measured with the hole
       * windows the scrub added, sixteen seeds and every seat: three of the
       * long watches ended with three low strikers at eighty-five to
       * ninety-four kilometres, weapons gone, nothing left to decide, and six
       * runs of a hundred and ninety-two passed the eighteen-minute ceiling.
       * From a hundred and thirty-five the medians fall from 13.8 to 12.9
       * minutes and the tail is six runs in three hundred and eighty-four,
       * all of them on the do-nothing and beginner paths that never clear
       * anything at all.
       */
      { atS: 15, type: 'striker', count: 3, bearingDeg: 350, spreadDeg: 20, spacingS: 30, altM: 7200 },
      { atS: 90, type: 'striker', count: 5, bearingDeg: 20, spreadDeg: 34, spacingS: 26, altM: 130,
        distanceKm: 135 },
      { atS: 260, type: 'striker', count: 3, bearingDeg: 330, spreadDeg: 18, spacingS: 24, altM: 110,
        distanceKm: 130 },

      /*
       * And something that actually reaches the town, so the point-defence
       * ring has a job.
       *
       * The three packages above release at standoff and turn for home around
       * forty kilometres out, which is why THISTLE TOWN and HAMMER — the two
       * sections this watch's brief tells you to site carefully — spent every
       * measured seed at zero engagements. These two come in under the horizon
       * on two axes at fifty-five metres, named onto the town and the
       * operations centre so they keep coming, and they arrive while BASTION
       * still has the third striker package on its hands. The timing is the
       * other load-bearing number: at 300/340 they arrive after BASTION is
       * free again and it picks them off (THISTLE 9%, watch 1023 s, held 5/6);
       * at 220/255 they overlap the striker package properly and more of them
       * live to reach the ring (THISTLE 14%, watch 954 s, held 6/6).
       *
       * The altitude is the load-bearing number. Measured, THISTLE's share of
       * the watch it can engage: 0% with nothing; 1% with three cruise at 80 m
       * from 130 km (BASTION kills them all on the way in); 11% at 60 m from
       * 105 km; 14% with this pair. Six seeds, crew loop played properly:
       * held stays 6/6 and the score is unchanged within noise, because what
       * the package costs in leakers it returns in targets the short-range
       * sections can finally reach.
       */
      { atS: 220, type: 'cruise', count: 4, bearingDeg: 340, spreadDeg: 22, spacingS: 10, altM: 55,
        distanceKm: 95, targetAssetId: 'a_town' },
      { atS: 255, type: 'cruise', count: 4, bearingDeg: 15, spreadDeg: 20, spacingS: 10, altM: 55,
        distanceKm: 95, targetAssetId: 'a_c2' },

      /*
       * And a last run at the crossing, from the west, after everything above
       * is spent.
       *
       * Without it the last hostile of the night was on the board at 41% of
       * the watch and the remaining six minutes were spent walking survivors
       * off the map — the watch coasted out. This is the watch's own lesson
       * arriving one more time from a bearing nothing has come from yet: sixty
       * kilometres is inside LANCE WEST's ring but under BASTION's horizon at
       * fifty metres, so the long-range battalion cannot help and the operator
       * has to have left something in the west that can.
       *
       * Sixty kilometres and not ninety-five like the pair above, because the
       * ingress has to fit inside the watch rather than extend it: at ninety-
       * five these arrive four minutes after everything else has stopped, and
       * the silence they are here to fill is the silence they create.
       */
      /*
       * AND FIVE AT HEIGHT, NOT THREE, ARRIVING SIXTEEN SECONDS APART.
       *
       * This is the only package on the watch that belongs to the cabin. Of
       * the thirty aircraft, seventeen are under BASTION's floor and
       * most of the rest are inside a LANCE's ring as well — but a strike
       * package at six thousand nine hundred metres on the north-east axis is
       * the long-range battalion's problem and nobody else's, and at three
       * aircraft with twenty-four seconds between them it was a problem four
       * channels solved without being thought about.
       *
       * Measured over thirty-two seeds and every seat, against the same watch
       * with three: a competently played watch falls from 81 / 94 / 94 per
       * cent held to 72 / 59 / 66, which is the sixty-to-ninety band the
       * campaign asks an act-one watch to sit in and which this one was above
       * on two seats of three; a beginner in the cabin falls from 81% to 63%;
       * and the cabin's attention dividend — the thing this watch had least of
       * — goes from eight seeds of sixteen and +4.5% to twenty-four of
       * thirty-two and +20.1%, because five at height is a saturation problem
       * and saturation is what rewards planning ahead. What it costs is the
       * expert's hold rate, which falls to 81 / 81 / 63 against a bar of
       * seven in eight; that is written up in the README with the four
       * alternatives that were measured against it.
       */
      { atS: 300, type: 'striker', count: 5, bearingDeg: 25, spreadDeg: 18, spacingS: 16, altM: 6900,
        distanceKm: 100, targetAssetId: 'a_airbase' },
      /*
       * FOUR, not six. Six missiles at fifty metres from fifty kilometres,
       * arriving together on the one axis the long-range battalion cannot see
       * under, is the single largest source of arrivals on this watch — and
       * until the scrub made a missile that arrives a leaker, all six of them
       * were free. Measured on the honest count at six: a competent net seat
       * conceded 0 1 1 2 3 5 6 6 across the eight seeds, a spread wide enough
       * that no allowance at all put the watch in the sixty-to-ninety band.
       * At four the tail comes in and the beat is unchanged.
       */
      { atS: 435, type: 'cruise', count: 4, bearingDeg: 255, spreadDeg: 20, spacingS: 12, altM: 50,
        distanceKm: 50, targetAssetId: 'a_bridge' },
    ],
  },

  {
    id: 'solo-battery',
    name: 'Solo Battery',
    subtitle: 'One battery, one crew, one radar. Yours.',
    theme: 'crt-green',
    echelon: 'battalion',
    roles: ['crew'],
    seed: 'solo-battery-09',
    /*
     * FOUR, re-based on the honest count and with the wave table untouched.
     *
     * Five of this watch's sixteen aircraft are cruise missiles, and until the
     * curve scrub made an arriving missile a leaker they could not fail the
     * watch however many of them landed. At the old allowance of two the
     * honest count holds six seeds of sixteen — below the band, on the watch
     * whose seven alternative wave tables are all recorded below as worse.
     *
     * FIVE, and not four, and the reason is the operations centre rather than
     * the count. SECTOR OPS is marked critical and its loss converts the
     * verdict on its own, so three seeds of sixteen are lost before the
     * allowance is consulted at all: this watch's held rate is capped at 81
     * per cent whatever is forgiven, and it reaches that cap at five. That cap
     * is what sets the ceiling for the whole of act two — no later watch may
     * be easier than the hardest watch of the act before it — and it is the
     * single most load-bearing number in the campaign's difficulty curve.
     */
    leakerTolerance: 5,
    playerBatteryId: 's_lance_e',
    /*
     * The crew brings its own set up at forty-five seconds if nobody has.
     *
     * `radarSafetyAtS` is the teaching watch's safety, and this is the watch
     * that needed it more. There is no surveillance radar here at all — the
     * isolation is the lesson — so an operator who touches nothing is not
     * quiet, they are blind, and measured, they stayed blind: first contact at
     * 180 s median and 236 s at worst, first legal shot at 256 s. Three
     * minutes of an empty scope on the watch whose entire subject is working a
     * console, with nothing on the screen to say which of "nothing is
     * happening" and "you have not switched the set on" it was.
     *
     * Forty-five and not sixty because there is nobody else to see for you:
     * on First Light sector is watching over your shoulder with its own set up
     * and can afford to let the lesson run a full minute. The line the crew
     * chief says is the lesson arriving anyway, and the switch stays yours.
     */
    /*
     * A quarter again in the store, for the same reason the two sector watches
     * carry one: the fourth wave took the crewed LANCE from spending sixteen
     * rounds a watch to spending all twenty-four of them, and a battery with
     * an empty store and a raid still on the plot is an allocation problem
     * wearing a reload bar's clothes. Measured over sixteen seeds, cabin,
     * competent: sole-limiter share 10% before and the figure in README after,
     * of which seven points were the loaders and three an empty store.
     */
    storeMult: 1.25,
    radarSafetyAtS: 45,
    /*
     * And ninety-five seconds before sector starts testing you, the same as
     * the teaching watch. The first contact paints at thirty-one seconds and
     * the first directive used to land at fifty-three — twenty-two seconds of
     * fighting, on the watch where the player is also learning the lock-and-
     * launch sequence for the first time.
     *
     * And sixty of those seconds are counted from the first contact rather
     * than from the handover, because this watch's first paint moves between
     * twenty-six and forty-three seconds across its eight seeds — the same
     * absolute grace gave one operator eighty-six seconds of fighting before
     * the first order and another fifty-two.
     */
    directiveGraceS: 95,
    directiveContactGraceS: 60,
    brief: [
      'Sector has stripped the area to reinforce the coast. What is left is you.',
      'You will acquire, you will lock, you will launch, and you will keep the set radiating until the round',
      'arrives — because the moment you shut down, that round becomes scrap falling on a field.',
    ],
    teaches: 'The full engagement loop from the seat: acquire, lock, launch, guide.',
    assets: [GROUND.town, GROUND.c2, GROUND.bridge, GROUND.depot],
    sites: [SITES.lanceEast, SITES.hammer],
    radars: [],
    /*
     * These come over the ridge, not from the far side of the country.
     *
     * Every wave used to take the engine's default spawn distance of 155 km
     * (world.js) — which is the right number for a sector watch with an
     * early-warning radar and a hundred-and-twenty-kilometre battalion, and
     * the wrong one for this watch. Here there is no surveillance radar at all
     * (the isolation is the point) and one battery reaching forty-two
     * kilometres. Measured, that combination gave: a contact painting at 28 s
     * at 149 km, firm at 208 s, and the first LEGAL SHOT at 435 s. Seven
     * minutes of watching a dot crawl, on the one watch in the game whose
     * whole subject is working a console.
     *
     * Seventy, eighty and eighty-five kilometres instead. Measured over six
     * seeds with the crew loop played properly (lock what the battery can
     * take, fire when the solution is ready), against the same six before:
     *
     *   first legal shot   406-672 s  ->  73-82 s on five seeds of six
     *   watch held           4 of 6   ->  5 of 6
     *   score                   432   ->  763
     *   leakers                 1.2   ->  0.2
     *   watch length          998 s   ->  709 s
     *
     * THE FOURTH WAVE, and the note it replaces.
     *
     * This comment used to end "do not add a fourth wave to fill the back
     * half", with three attempts recorded against it: two more strikers took
     * the watch from 5/6 held to 0/6, two more cruise to 3/6. That was true,
     * and it was true of a battery whose rack was all-or-nothing — a LANCE
     * that fired its eighth round was out of the watch for sixty-two seconds
     * with nothing on the rails, and a fourth package arriving anywhere near
     * that hole simply walked past. `stepLoading` removed the hole, and the
     * ceiling the note was really describing moved with it: measured after
     * that change and before this wave, the crew seat held 8 of 8 at competent
     * AND at novice, with the magazine the sole limiter for 4% of the watch
     * and only six legal shot opportunities on the worst seed. The watch had
     * stopped being a test.
     *
     * So the fourth wave goes back in, at 470 s and sixty kilometres out —
     * close, because the ingress has to fit inside the watch rather than
     * extend it, and at nine hundred metres because that is under BASTION's
     * horizon and inside LANCE EAST's, which is the whole geometry of the
     * watch. It is the pair that decides the night: see README's difficulty
     * table for what it did to the three player models.
     */
    /*
     * The net, on the watch where there is no net.
     *
     * Three waves and one two-channel battery leaves two structural silences —
     * measured over eight seeds, one around a hundred seconds after the first
     * package turns for home and one of eighty to a hundred and twenty between
     * the second package and the cruise wave coming up under the horizon. Both
     * are the shape of the watch and neither is fixable with aircraft: the
     * comment above records the three wave tables that were tried and what
     * each of them broke.
     *
     * So the room talks instead, which is what a room does. Every line here is
     * a thing an operator alone in a cabin would actually be told, and three of
     * them are the horizon lesson arriving as information rather than as a
     * surprise: the cruise package is spawned at 330 s and will not paint until
     * it is thirty kilometres out, so the sector saying it is coming is the
     * only warning the mechanics can honestly give. Measured, the crew seat's
     * dead-air share falls from 29.6% to the figure in the README table, and
     * the longest hole with it; nothing else about the watch moves, because
     * chatter costs no rounds and draws no random numbers.
     */
    chatter: [
      { atS: 14, text: 'AIR RAID WARNING RED. TAKE POST. THE SET IS COLD AND THE VALLEY IS YOURS.' },
      { atS: 32, whileOwnCold: true,
        text: 'CREW CHIEF: NOTHING PAINTS UNTIL WE RADIATE, AND NOBODY IS RADIATING FOR US.',
        insteadText: 'CREW CHIEF: SET IS UP AND SWEEPING. TWENTY-FOUR ROUNDS AND TWO CHANNELS, THAT IS ALL OF IT.' },
      { atS: 52, text: 'SECTOR: YOU ARE THE ONLY SET LEFT IN THIS SQUARE. THE PICTURE IS WHATEVER YOU CAN SEE.' },
      { atS: 88, text: 'HAMMER SECTION MANNED AND READY — TWELVE ROUNDS AND EIGHT KILOMETRES OF SKY.' },
      { atS: 124, text: 'SECTOR: SAY STATE. NOBODY BEHIND YOU IS GOING TO SEE THIS ONE FOR YOU.' },
      { atS: 198, text: 'TOWN WARDEN REPORTS THE SIRENS SOUNDED. PEOPLE ARE UNDER THE SCHOOL.' },
      { atS: 256, text: 'RIVER CROSSING ASKS WHETHER TO STOP THE CONVOY. SECTOR SAYS KEEP IT MOVING.' },
      { atS: 292, text: 'HAMMER SECTION HEARD THE SECOND PACKAGE GO OVER. THEY COULD NOT REACH IT.' },
      { atS: 418, text: 'SECTOR: SECOND PACKAGE HAS TURNED FOR HOME. STAY UP — THAT IS NOT ALL OF IT.' },
      { atS: 452, text: 'FRONTIER POST HEARD SOMETHING LOW GO OVER TWENTY MINUTES AGO. NOTHING ON ANY SET SINCE.' },
      { atS: 486, text: 'SECTOR: EXPECT CRUISE. THEY WILL COME OUT OF YOUR HORIZON AT THIRTY KILOMETRES OR LESS.' },
      { atS: 520, text: 'HAMMER SECTION REPORTS EYES ON THE LOW APPROACHES. NOTHING YET.' },
      { atS: 554, text: 'SECTOR: STILL NOTHING ON THE PLOT. THEY ARE IN THE GROUND CLUTTER AND THEY ARE COMING.' },
    ],
    /*
     * DO NOT RETUNE THIS TABLE. Sixteen aircraft in four waves, and it is the
     * only arrangement of them in which the whole difficulty bar passes.
     *
     * Seven alternatives were measured at thirty-two seeds each during the
     * gameplay scrub and every one of them broke a line this one holds.
     * Re-pointing the waves at the depot, the operations centre and the town
     * in any of three orders took a competent operator to 94-100% held;
     * pointing the third one at the operations centre twice destroyed it on
     * thirty-two watches of thirty-two; sending the cruise wave at the
     * operations centre put a beginner at 19%; moving the first wave to the
     * depot or the town cost the attention dividend outright. Recorded here so
     * the next reader does not spend an afternoon rediscovering it.
     *
     * AND WHAT THE WATCH IS ACTUALLY ABOUT, which is not what its brief says.
     * The brief, the sirens and the town warden are all about the town, and
     * `pickRaidTarget` weights the operations centre at 88 against the town's
     * 9.1 — so the town is destroyed on none of thirty-two competent watches
     * and touched on three, while SECTOR OPS is four hundred of the roughly
     * nine hundred points of ground here AND is marked critical, so losing it
     * subtracts about five hundred and converts the verdict at the same time.
     * A competent operator holds twenty-one of the twenty-two seeds where it
     * survives and none of the ten where it does not. That is a good hinge and
     * the trace shows the operator earning it; the fiction pointing somewhere
     * else is deliberate, because a crew alone in a valley is told to defend
     * the place they live in and finds out what the file actually values by
     * losing it.
     */
    waves: [
      { atS: 25, type: 'striker', count: 3, bearingDeg: 40, spreadDeg: 22, spacingS: 34, altM: 6800,
        distanceKm: 70 },
      { atS: 180, type: 'striker', count: 4, bearingDeg: 70, spreadDeg: 26, spacingS: 30, altM: 250,
        distanceKm: 80 },
      { atS: 330, type: 'cruise', count: 5, bearingDeg: 55, spreadDeg: 30, spacingS: 12, altM: 90,
        distanceKm: 85 },
      { atS: 470, type: 'striker', count: 4, bearingDeg: 25, spreadDeg: 20, spacingS: 26, altM: 900,
        distanceKm: 60, targetAssetId: 'a_bridge' },
    ],
  },

  {
    id: 'weasel-hour',
    name: 'Weasel Hour',
    subtitle: 'Something out there is listening for you.',
    theme: 'crt-amber',
    echelon: 'sector',
    roles: ['net', 'crew', 'both'],
    seed: 'weasel-hour-02',
    /*
     * THREE, against a raid of twenty-two, and both numbers moved together.
     *
     * The act-one pass measured four raid sizes here and settled on twenty-one
     * — but it settled on them against a leaker count that could not see a
     * cruise missile arrive, and eight of this raid's twenty-two aircraft are
     * cruise missiles. "Two" meant two bombs and eight missiles. Counted
     * honestly at twenty-one aircraft and an allowance of two, sixteen seeds a
     * seat, the net holds 88 per cent and the cabin 94 — the top of the band
     * on the third watch of the game, which puts it above act one's hardest
     * and breaks the curve at the first step of act two.
     *
     * The fix is one more missile on the late run at the power station (see
     * the wave) and an allowance of three: net 75, cabin 88, both seats 81,
     * with the store left where the act-one pass put it. Three raid sizes were
     * measured at sixteen seeds before this one was kept — twenty-one holds
     * 88/94/81, twenty-two with an extra LOW STRIKER holds 75/88/75 but takes
     * the careful player down to 69/75/75, and twenty-three holds 94/81/88 and
     * costs the cabin's expert twenty-six points. The extra missile is the
     * least bad of the four and it lands where the invisible arrivals were.
     */
    leakerTolerance: 3,
    playerBatteryId: 's_bastion',
    roundAllowance: 18,
    /*
     * Half as much again in every store on the position, and the reason is a
     * measurement rather than a mood.
     *
     * Sixteen rounds behind an eight-round rack is two reloads, and it is the
     * right number for a watch with one package on it. This one has sixteen
     * aeroplanes and six anti-radiation rounds, and the crewed BASTION reaches
     * every one of them: measured, eight seeds, the cabin fired all
     * twenty-four of its rounds by the middle of the watch and then spent 43%
     * of the night with the magazine as the ONLY thing between it and a legal
     * shot — a battery watching a raid it could reach and could not touch.
     * That is not the emissions lesson this watch is for, it is a supply
     * failure standing in front of it.
     *
     * Note what it is NOT. The loaders are not the problem here and this is not
     * a loading fix: the share of the same watch spent waiting for a round that
     * was actually coming up the hoist is nine to ten per cent. This is the
     * allocation, and the allocation is a thing a scenario decides.
     *
     * The expenditure order still asks for eighteen, and the difference
     * between what you are issued and what you are allowed to spend is
     * deliberate: the ledger is one of the things this watch is about.
     */
    storeMult: 1.75,
    /*
     * Ninety, and this is the watch that needed it most: the suppression pair
     * paints at twenty-five seconds and the first routine directive used to
     * arrive at forty-nine, twenty-three seconds into the shooting. This is
     * also the noisiest watch on the net — eight orders a watch against Low
     * Riders' six — so it is the one where an operator most needs a clear
     * minute to learn what is being done to them before the first order about
     * it arrives. The hinge orders are exempt from this gate by design, as
     * they are everywhere: a watch that turns on a transmission sends it when
     * its trigger fires and not before.
     */
    directiveGraceS: 90,
    /** And a clear minute of fighting, whenever the first contact paints. */
    directiveContactGraceS: 60,
    /*
     * The noisiest net in the campaign had nothing scripted on it at all.
     *
     * Eight directives a watch is the ORDERS; this is the room, and the room
     * is what tells an operator that the thing hunting them is a person with a
     * procedure rather than a dice roll. Every line here is the watch's own
     * argument — twelve seconds of emissions, an allocation that is smaller
     * than the raid, and a sector that will keep telling you to radiate
     * because sector is not the one being shot at.
     */
    chatter: [
      { atS: 16, text: 'EW PICKET: SOMEBODY IS LISTENING ON THE NORTHERN BEARINGS. THEY HAVE NOT SHOT YET.' },
      { atS: 68, text: 'CREW CHIEF: TWELVE SECONDS OF EMISSIONS IS ALL THEY NEED. WE HAVE GIVEN THEM MORE THAN THAT.' },
      { atS: 168, text: 'FRONTIER POST: TWO MORE LIFTED OFF THE COAST FIELD. THAT IS WHAT THEY DO WHEN THE FIRST PAIR HAVE FAILED.' },
      { atS: 262, text: 'POWER STATION ASKS WHETHER TO SHED LOAD. TELL THEM WHAT IS COMING AND LET THEM DECIDE.' },
      { atS: 320, text: 'SECTOR: SECOND SUPPRESSION ELEMENT IS AIRBORNE. YOU WILL KNOW WHEN IT IS LISTENING.' },
      { atS: 412, text: 'ORDNANCE: EVERY ROUND SPENT ON A WEAPON IS A ROUND NOT SPENT ON WHAT CARRIED IT.' },
      { atS: 500, text: 'SECTOR: EXPECT SOMETHING LOW OUT OF THE NORTH-WEST. THEY HAVE WATCHED YOU LOOK NORTH ALL NIGHT.' },
      { atS: 600, text: 'POLITICAL SECTION WANTS TO KNOW WHY THE EMISSIONS LOG HAS GAPS IN IT.' },
      { atS: 700, text: 'BORDER POSTS REPORT THE LAST OF THEM CROSSING BACK NORTH. NOBODY IS STANDING YOU DOWN.' },
    ],
    brief: [
      'Suppression aircraft are working the sector. They need roughly twelve seconds of your emissions to',
      'build a firing solution, and they carry two rounds each.',
      'Sector command will order you to keep radiating. Sector command is not the one being shot at.',
    ],
    teaches: 'Emissions control: blink to survive, and pay for it in guidance.',
    assets: [GROUND.town, GROUND.c2, GROUND.airbase, GROUND.power, GROUND.bridge],
    sites: [SITES.bastion, SITES.lanceWest, SITES.lanceEast, SITES.thistleTown],
    radars: [RADARS.ewrNorth, RADARS.gapSouth],
    /*
     * EVERYTHING COMES IN CLOSER, AND ONE MORE THING COMES IN LATE.
     *
     * BASTION reaches a hundred and twenty kilometres. Every wave here used to
     * spawn beyond that — the suppression pair at 165, the strike packages at
     * the engine's 155 km default — so the first two and a half minutes of
     * each package were an aeroplane crawling towards a ring it was not yet in
     * and nobody could do anything about. Measured over eight seeds and every
     * seat: median watch 12.2 to 18.8 minutes, worst seed 22.6, four seeds at
     * competent or expert over the eighteen-minute ceiling, and the longest
     * dead coda in the set — one seed spent 176 seconds after its last action
     * watching a survivor walk home.
     *
     * A hundred and twenty-five for the suppression aircraft, which have to be
     * outside BASTION's ring to do the job the watch is about (they stand off,
     * listen for twelve seconds of emissions and shoot from beyond it); a
     * hundred and five and eighty for the strike packages, which are in
     * reach from the moment they appear. Nothing about the fight changes —
     * same aircraft, same axes, same order — except that the parts of it that
     * were not a fight are gone. (The sentence above said "a hundred and ten
     * and a hundred" over code that read 105 and 95, for two passes.)
     *
     * THE EIGHTY IS THE SECOND OF THOSE AND IT WAS NINETY-FIVE. That package
     * comes out of the north-north-east — the quadrant BASTION itself sits in
     * — drops on its target and walks straight back out along the same line,
     * and the watch is held open until it is a hundred and ten kilometres from
     * the centre or beyond every surviving battery's usable reach. From
     * ninety-five that egress leg was three hundred seconds of the sector
     * shooting at an aeroplane with nothing left to drop. Measured over
     * sixteen seeds, three seats and four player models: six runs of a hundred
     * and ninety-two ran past the eighteen-minute ceiling, worst 18.9; at
     * eighty none of three hundred and eighty-four do.
     *
     * AND THE RAID IS TWENTY-ONE AIRCRAFT, NOT FIFTEEN, which is the larger
     * change and the reason for it is that this is the last watch of the first
     * act and it could not be failed. Fifteen aircraft against four batteries
     * with an allowance of two leakers gave a mean of 0.1 leakers at competent
     * play: nothing was getting through, so nothing below competent could
     * lose. A beginner held 88% of the net's watches and every single one of
     * the cabin's. Two more in the high package, one more in the low one and
     * a three-ship cruise run at the power station in the gap between them —
     * measured over thirty-two seeds a seat, a beginner on the net falls from
     * 88% to 41%, which is the band the campaign asks of them, and the
     * do-nothing cabin from 31% held to none.
     *
     * Four sizes were measured at thirty-two seeds each and this is the least
     * bad of them: at twenty aircraft a competent operator holds 94-100% and
     * the watch is not a test; at twenty-two, 81-97%; at twenty-three the
     * competent band is perfect at 81-84% but a beginner falls to 3-13% on two
     * seats and the expert to 69% in the cabin. Twenty-one keeps the expert at
     * 84-94% and the beginner on the net in band, and pays for it with a
     * competent net seat four points above the ninety-per-cent ceiling.
     *
     * The last wave is the one that decides the watch. The
     * previous last spawn was at 50% of the median watch and the back half was
     * survivors and stragglers; these come out of the north-west at sixty
     * metres, under the horizon, named onto the operations centre, while the
     * suppression aircraft still has the operator deciding whether to radiate.
     * That is the watch's own question asked once more with a real cost
     * attached: you cannot see them without the set up, and the set being up
     * is what the third weasel is waiting for.
     */
    waves: [
      { atS: 20, type: 'sead', count: 2, bearingDeg: 5, spreadDeg: 40, spacingS: 45, distanceKm: 125 },
      { atS: 120, type: 'striker', count: 6, bearingDeg: 350, spreadDeg: 30, spacingS: 24, altM: 6400,
        distanceKm: 105, targetAssetId: 'a_airbase' },
      /*
       * The gap, filled by the raid rather than by talk. Measured with the
       * hole windows the scrub added: from 205 s to 274 s this watch had
       * nothing engageable, nothing in flight and nothing to say, on the
       * both-seats configuration at competent play — the longest structural
       * silence in act one. Three cruise at sixty metres out of the west,
       * named onto the power station, arrive while the operator is still
       * deciding whether to keep radiating for the second weasel.
       */
      { atS: 215, type: 'cruise', count: 3, bearingDeg: 250, spreadDeg: 18, spacingS: 12, altM: 60,
        distanceKm: 70, targetAssetId: 'a_power' },
      { atS: 300, type: 'sead', count: 1, bearingDeg: 330, spacingS: 0, distanceKm: 125 },
      { atS: 340, type: 'striker', count: 5, bearingDeg: 15, spreadDeg: 24, spacingS: 24, altM: 200,
        distanceKm: 80, targetAssetId: 'a_bridge' },
      /*
       * FIVE, not four, and this is where the honest count went.
       *
       * The late run at the operations centre is the last thing that happens
       * on this watch and every round of it used to be free: `registerLeaker`
       * was called from the moment a strike aircraft let go of what it was
       * carrying, and a cruise missile IS what it is carrying. So the file
       * could not see the one package that arrives after the allocation has
       * been spent — which is the whole argument of a watch that issues
       * eighteen rounds against twenty-two aircraft. One more of them, on the
       * axis the suppression pair has been working all night, is what takes
       * the net seat off the top of the difficulty band and puts act two
       * below act one where it belongs. Measured at sixteen seeds: 88 per
       * cent held becomes 75, and the cabin's magazine-limited share does not
       * move (twenty per cent), because a missile at sixty metres is a
       * horizon problem and not a store problem.
       */
      { atS: 455, type: 'cruise', count: 5, bearingDeg: 305, spreadDeg: 20, spacingS: 12, altM: 60,
        distanceKm: 65, targetAssetId: 'a_c2' },
    ],
  },

  {
    id: 'white-noise',
    name: 'White Noise',
    subtitle: 'Half of what you can see is not there.',
    theme: 'crt-amber',
    echelon: 'sector',
    roles: ['net', 'crew', 'both'],
    seed: 'white-noise-07',
    /*
     * ONE, AND THE WAVE TABLE IS NOT TO BE GROWN. READ THIS BEFORE TOUCHING IT.
     *
     * This is the watch that carries the campaign's load-bearing property —
     * that a commander choosing targets beats crews left to themselves — and
     * `test/funfix.test.js` measures it here in two forms: hand play against
     * set-free-and-walk-away, and an AI battle manager laid over free crews
     * against those crews alone. The second is a ratio with a floor of 0.95.
     *
     * The curve scrub tried three times to make this watch harder by adding a
     * fourth axis, and every version broke that ratio. Twenty-four seeds, the
     * test's own construction: shipped table 0.977; four aeroplanes on the deck
     * out of 248° 0.858; the same four at nine hundred metres 0.858; at four
     * thousand two hundred metres and a hundred and ten kilometres 0.723;
     * moving them to 196° so the crewed battery could not cover them 0.700.
     * Even growing the existing low package from five aircraft to six and
     * pulling it six kilometres closer reads 0.896. The mechanism is the same
     * every time and it is worth writing down: MORE RAID ON THIS WATCH HELPS
     * THE CREWS AND HURTS THE COMMANDER. A free crew shoots what enters its
     * own ring and needs no picture to do it; a commander pairing the whole
     * sector is the one who runs out of channels, and a package that arrives
     * while he is already saturated is answered by whoever happens to be
     * pointing at it. On the deck it was worse still — hand play scored 42.8
     * per cent BELOW the walk-away — because he cannot pair what he has not
     * seen.
     *
     * So the difficulty here is the STANDARD and not the aeroplanes, and one
     * is what the standard has to be. Sixteen seeds a seat on the shipped
     * table: competent play concedes nothing at all on eleven nights of
     * sixteen, and holds 69 / 63 / 81 per cent at an allowance of none,
     * 81 / 88 / 94 at one and 94 / 100 / 94 at two. One is the number, and on
     * a watch whose whole subject is whether you can SEE what is coming, "one
     * got through" being the difference between held and penetrated is the
     * right sentence for it to end on.
     */
    leakerTolerance: 1,
    playerBatteryId: 's_lance_w',
    roundAllowance: 22,
    brief: [
      'Two standoff jammers are on station beyond your reach. Inside their noise you will see nothing until',
      'burnthrough, and burnthrough gets better the further out they sit.',
      'They are also sending decoys. The decoys are built to look like strike aircraft and they succeed.',
      'You have twenty-two rounds in the allocation. There are more contacts than that.',
    ],
    teaches: 'Jamming, burnthrough, decoys, and ammunition discipline.',
    /*
     * NO STORE CUT ON THIS WATCH, AND THE MEASUREMENT THAT SETTLED IT.
     *
     * The obvious way to make "there are more contacts than that" mechanically
     * true is to shorten the sector's stores, and it was tried three ways:
     * half stores, six tenths, seven tenths. All three invert the property
     * this watch exists to carry, and this is the watch two of the campaign's
     * load-bearing measurements are taken on. Twelve seeds, hand play against
     * set-free-and-walk-away: at full stores the commander concedes ten
     * leakers against the walk-away's nineteen and loses three structures
     * against eight; at seven tenths it concedes twenty-two against
     * twenty-two, loses eleven against four, and the score dividend goes
     * NEGATIVE. Scarcity punishes the player who is choosing targets across
     * the whole sector far harder than it punishes crews who only ever shoot
     * what wanders into their own ring, because the commander's reach — the
     * exact thing attention buys here — is what he can no longer afford.
     * Slower reloads do the same thing to the delegation ladder: with the
     * store at eight tenths the AI net over free crews fell to 0.91 of free
     * crews alone against a 0.95 floor.
     *
     * So the allocation stays a ledger constraint — twenty-two rounds against
     * a raid of thirty-odd objects, priced at five points a round — and the
     * difficulty comes from the raid: two axes instead of one, and nineteen
     * strike aircraft in the table instead of twelve.
     */
    /*
     * The EW picket speaks first, because on this watch the noise arrives
     * before the aeroplanes do and that is the whole subject. The old order
     * had the net reporting a held contact at 52 s against a first paint at
     * 86 s — the room describing something that did not exist yet.
     */
    chatter: [
      { atS: 24, text: 'EW PICKET REPORTS SWEEP JAMMING RISING ON THE NORTHERN BEARINGS. EXPECT A DIRTY PICTURE.' },
      { atS: 96, text: 'WIDE EYE HOLDS A STREAM ON THE NORTHERN AXIS. NOT ALL OF THAT IS AEROPLANES.' },
    ],
    assets: [GROUND.town, GROUND.c2, GROUND.airbase, GROUND.power, GROUND.depot, GROUND.bridge],
    sites: [SITES.bastion, SITES.lanceWest, SITES.lanceEast, SITES.thistleTown, SITES.hammer],
    radars: [RADARS.ewrNorth, RADARS.gapSouth],
    waves: [
      { atS: 6, type: 'jammer', count: 2, bearingDeg: 0, spreadDeg: 70, spacingS: 20, distanceKm: 158, scalable: false },
      { atS: 30, type: 'decoy', count: 6, bearingDeg: 350, spreadDeg: 40, spacingS: 14, altM: 5200 },
      { atS: 130, type: 'striker', count: 6, bearingDeg: 10, spreadDeg: 34, spacingS: 20, altM: 5600,
        distanceKm: 134 },
      /*
       * The western stream, down the Kubin road at the power station.
       *
       * LANCE WEST is the battery this file names and it sits twenty-four
       * kilometres west of the centre with a forty-two-kilometre reach, so a
       * raid that runs entirely down the northern axis never enters its
       * envelope: measured, the designated cabin's first legal shot was at
       * 469.5 s and its first own round at 659 s on a watch that averaged
       * fifteen minutes. This stream passes within eight kilometres of it.
       *
       * That it is decoys first is the point. The cabin's first shot of the
       * night is spent on a lie, and the rails are half-empty when the real
       * package comes down the same road four minutes later — which is this
       * watch's lesson arriving in the seat instead of in the debrief.
       */
      { atS: 44, type: 'decoy', count: 3, bearingDeg: 288, spreadDeg: 16, spacingS: 16, altM: 4600,
        distanceKm: 86, targetAssetId: 'a_power' },
      civilTransit(240),
      { atS: 300, type: 'decoy', count: 4, bearingDeg: 20, spreadDeg: 30, spacingS: 12, altM: 4800 },
      { atS: 300, type: 'striker', count: 4, bearingDeg: 292, spreadDeg: 18, spacingS: 18, altM: 900,
        distanceKm: 104, targetAssetId: 'a_power' },
      /*
       * The low package. It used to spawn at the engine's default hundred and
       * fifty-five kilometres, which is eleven minutes of transit at a hundred
       * and eighty metres — so the last aircraft of it was still being chased
       * at 1040 s and it, not the raid, was what set the length of the watch.
       * At a hundred and four it crosses the horizon at seventy-eight and the
       * fight over it happens inside the rings.
       */
      { atS: 355, type: 'striker', count: 5, bearingDeg: 340, spreadDeg: 28, spacingS: 18, altM: 180,
        distanceKm: 98 },
      /*
       * And a late package, because the back half had nothing in it.
       * Measured: the last spawn used to land at forty per cent of the
       * watch, and the remaining eight minutes ran at four to eight events a
       * minute with no rounds in the air — the raid was decided long before
       * the watch admitted it. This one arrives with the allocation nearly
       * spent, which is the ammunition lesson arriving as a raid instead of
       * as a number in the debrief.
       */
      { atS: 480, type: 'striker', count: 4, bearingDeg: 5, spreadDeg: 26, spacingS: 16, altM: 5200,
        distanceKm: 96 },
    ],
  },

  {
    id: 'economy-of-force',
    name: 'Economy of Force',
    subtitle: 'There are rounds on the rails. You have been told what they are for.',
    theme: 'crt-amber',
    echelon: 'sector',
    roles: ['net', 'crew', 'both'],
    seed: 'economy-08',
    /*
     * TWO, and the standard is about designated places only.
     *
     * This is the campaign's measured moral hinge — `tools/measure-moral.mjs`
     * reproduces the README's table off this raid — so its difficulty had to
     * be built without turning the hospital into a difficulty knob. It cannot
     * be one: the freeze strikes the building off the schedule, and
     * `registerLeaker` follows the same recognition, so a weapon that arrives
     * there is not in the count the verdict is read against. That is how this
     * watch can print SECTOR HELD over the building it lost obeying, and it
     * is the sentence the whole watch is for.
     *
     * So the pressure is on the places the schedule DOES name, and it arrives
     * as the east package below. At three the watch held all twenty-four
     * competent cells before that package existed; with it, sixteen seeds a
     * seat, the honest count runs nought to four and the readings are
     * 25 / 50 / 38 per cent at an allowance of one, 81 / 81 / 88 at two and
     * 88 / 94 / 100 at three. Two is the rung, and all three seats sit inside
     * the band on it.
     */
    leakerTolerance: 2,
    playerBatteryId: 's_lance_w',
    roundAllowance: 12,
    brief: [
      'Sector has transmitted an expenditure freeze ahead of tonight. You will receive it formally'
        + ' once the raid is up, and you will be asked to acknowledge it.',
      'The district hospital is out on the Kubin road, twenty-one kilometres from LANCE WEST and well'
        + ' inside its envelope. It is not on the schedule of designated defended places. Nothing in'
        + ' this sector is, except the airbase, the power station and sector operations.',
      'You have rounds. You will be told they are not yours to spend.',
    ],
    teaches: 'What the allocation is actually for.',
    assets: [
      GROUND.town, GROUND.c2, GROUND.airbase, GROUND.power, HOSPITAL,
    ],
    sites: [SITES.bastion, SITES.lanceWest, SITES.thistleTown, SITES.hammer],
    radars: [RADARS.ewrNorth, RADARS.gapSouth],
    waves: [
      { atS: 25, type: 'striker', count: 3, bearingDeg: 350, spreadDeg: 22, spacingS: 26, altM: 6200,
        targetAssetId: 'a_airbase' },
      /*
       * The probe up the Kubin road, and the reason the whole watch works.
       *
       * LANCE WEST is the battery the brief is about — "twenty-one kilometres
       * from LANCE WEST and well inside its envelope" — and on the shipped
       * table it never fired. Measured over eight competent seeds: the crewed
       * cabin's first legal shot came at 464 s against a 90 s bar, its
       * engageable share was ten per cent, and on five of the eight seeds no
       * hostile entered its envelope AT ALL. The seat the moral geometry is
       * built around was a chair with a view of somebody else's fight.
       *
       * This one comes in close, low and early on the same road the hospital
       * package will use later, so the cabin is already fighting the western
       * axis when the freeze arrives — and the order is therefore about a
       * battery with rounds in the air rather than about a bearing on a map.
       * Bearing 310 rather than 300 keeps its ray nine kilometres clear of the
       * hospital rather than three and a half, so the prediction column does
       * not label it early and give the decision away.
       */
      { atS: 35, type: 'striker', count: 4, bearingDeg: 310, spreadDeg: 22, spacingS: 15, altM: 1500,
        distanceKm: 62, targetAssetId: 'a_power' },
      // The hospital package and the power station package arrive together, so
      // the rounds genuinely compete and the freeze is not a free order to obey.
      // On the deck, down the Kubin road: the horizon hides it until it is
      // nearly there, and only a battery deliberately watching the west takes
      // it in time. That deliberateness is the whole moral geometry of the
      // watch — a defence that saved the hospital by accident was answering
      // the order with a shrug instead of a decision.
      { atS: 150, type: 'striker', count: 3, bearingDeg: 288, spreadDeg: 14, spacingS: 24, altM: 320,
        targetAssetId: 'a_hospital' },
      { atS: 195, type: 'striker', count: 3, bearingDeg: 20, spreadDeg: 20, spacingS: 24, altM: 260,
        distanceKm: 120, targetAssetId: 'a_power' },
      // Same deck as the first package: at 180 m the covering battery's
      // low-altitude penalty stacked with evasion into a tail that a
      // deliberate westward watch could not actually kill — measured, the
      // defence lost the building three nights in eight with rounds to spare.
      // The freeze, not the physics, is meant to be what loses the hospital.
      //
      // And it comes late, at four hundred seconds rather than three hundred
      // and thirty: the last spawn used to land at half the median watch, so
      // the back third was a chase. Now the second half of the night is the
      // half the order is about.
      /*
       * THE EAST PACKAGE, AND IT IS WHY THE FREEZE COSTS ANYTHING.
       *
       * Every aeroplane on this watch used to arrive between 288° and 20°, so
       * the whole sector could watch one half of the sky and the order to
       * abandon the hospital was an order to give up rounds it had no other
       * use for. Measured over eight seeds a seat, competent play let NOTHING
       * designated through: nought arrivals on twenty-three of the twenty-four
       * cells, at every allowance from three down to none.
       *
       * The airbase is a designated defended place, it is nineteen kilometres
       * east of BASTION with nothing but HAMMER between it and the frontier,
       * and nothing has ever come at it from that side. Four on the deck at
       * seventy-eight kilometres, at three hundred and thirty seconds, means
       * the sector is committed east while the western probe is still running
       * — and the freeze is finally an order about rounds somebody else needs.
       *
       * The size, the height and the timing were all chosen by measurement,
       * sixteen seeds a seat, and every direction cost something real. Six of
       * them at two hundred and sixty metres puts all three seats on the same
       * rung (75 / 75 / 75) and destroys the airbase on half the nights: mean
       * score falls from 553 to 361 and the watch becomes one you hold while
       * losing most of the ground, which is not what SECTOR HELD is supposed
       * to mean. Pulling the second hospital package forward from 400 s to
       * 355 s so the two arrive together reads 69 / 100 / 75 and takes the
       * moral table with it — obedience's mean score falls from 48 to −24 and
       * the cabin stops being able to lose the watch at all. Four on the deck
       * at 330 s against the hospital package at 400 s is the version that
       * leaves both the curve and the table intact: 81 / 81 / 88 held, and
       * `node tools/measure-moral.mjs` still reads obey 51/48, defend 34/380,
       * refuse 11/380.
       */
      { atS: 330, type: 'striker', count: 4, bearingDeg: 78, spreadDeg: 20, spacingS: 16, altM: 140,
        distanceKm: 78, targetAssetId: 'a_airbase' },
      { atS: 400, type: 'striker', count: 2, bearingDeg: 292, spreadDeg: 14, spacingS: 20, altM: 320,
        distanceKm: 132, targetAssetId: 'a_hospital' },
    ],
  },

  {
    id: 'across-the-line',
    name: 'Across the Line',
    subtitle: 'A round has gone wrong, and it is going to come down somewhere that is not our concern.',
    theme: 'crt-amber',
    echelon: 'sector',
    roles: ['net', 'crew', 'both'],
    seed: 'across-11',
    /*
     * ONE, and the camp is not in the count.
     *
     * A leaker the file recognises is one at a place the schedule values, and
     * the encampment is valued at nothing — deliberately, which is the whole
     * watch. So both strays can come down at Gorna and the verdict will still
     * read SECTOR HELD; what they cost is four hundred points of score and
     * whatever you think of yourself. That was free until the curve scrub,
     * because a cruise missile that arrived registered nothing at all; now it
     * registers, and `registerLeaker` declines to count it at a place the
     * schedule values at nothing — the same recognition the freeze uses one
     * watch earlier. The debrief prints "1 (+1 UNCOUNTED)" and the ground
     * table underneath names the camp.
     *
     * The allowance is therefore about the power station, the crossing and the
     * town. At two a competent sector held every one of twenty-four seeds. At
     * one, sixteen seeds a seat with the south-eastern package below in the
     * table, it holds 75 / 69 / 81 — and a beginner holds 63 / 69 / 31, which
     * is the only watch in act two where the net seat's novice is inside the
     * band at all.
     */
    leakerTolerance: 1,
    playerBatteryId: 's_lance_w',
    roundAllowance: 18,
    brief: [
      'One of tonight\'s cruise missiles is not tracking anything in this sector. Its course takes it'
        + ' west, over the ridge, across the Listonian border, and down near Gorna. A second one will'
        + ' do the same thing later, which tells you something about the first.',
      'There is a camp at Gorna. Four hundred people who left Trans Mordovia and have been living in'
        + ' tents on the far side of that line for two years, and whose continued existence is a'
        + ' subject the ministry does not enjoy.',
      'LANCE WEST holds it at thirty-seven kilometres, five inside its envelope, and BASTION reaches'
        + ' it with sixty to spare. It is a straight, slow, unmanoeuvring target and you have rounds'
        + ' on the rails. There is no version of this where you could not have stopped it.',
      'Sector will transmit its position on this. You already know what it is going to be.',
    ],
    teaches: 'What the schedule of defended places is really a schedule of.',
    assets: [
      GROUND.town, GROUND.c2, GROUND.power, GROUND.bridge, CAMP,
    ],
    sites: [SITES.bastion, SITES.lanceWest, SITES.thistleTown, SITES.hammer],
    radars: [RADARS.ewrNorth, RADARS.gapSouth],
    waves: [
      { atS: 20, type: 'striker', count: 3, bearingDeg: 355, spreadDeg: 24, spacingS: 26, altM: 6000,
        targetAssetId: 'a_power' },
      /*
       * The western package, early and close, because LANCE WEST is the cabin
       * this watch designates and on the shipped table its first legal shot was
       * at 522 s of an 850 s watch. Down the Kubin road at eighty-two
       * kilometres it is inside the battery's ring inside two minutes.
       */
      { atS: 45, type: 'striker', count: 3, bearingDeg: 288, spreadDeg: 20, spacingS: 20, altM: 210,
        distanceKm: 82, targetAssetId: 'a_power' },
      /*
       * The stray, and the height it comes in at.
       *
       * It used to fly at a hundred and ten metres. BASTION's floor is a
       * hundred and twenty. So the battery the briefing names in the same
       * sentence as "reaches it with sixty to spare" could not legally engage
       * it at any range, ever — the only seconds in which the console said
       * otherwise were the altitude estimate's own hundred-metre noise lifting
       * the target over a floor it was under. The whole watch is built on the
       * claim that you COULD have stopped this, and the claim was false in the
       * range column's blind spot. Measured over eight seeds, weapons on hold:
       * LANCE WEST's legal window on the first stray was a median 55 s and
       * zero seconds on one seed; BASTION's was noise.
       *
       * At a hundred and seventy metres both named batteries hold it properly.
       * And it spawns at ninety-five kilometres instead of the engine's default
       * hundred and fifty-five, because a cruise missile at two hundred and
       * fifty metres a second took the better part of ten minutes to arrive and
       * was not tracked until 456-597 s — the watch's subject spent most of the
       * watch off the tube. `test/revelations.test.js` now asserts both halves
       * of the reach, range and height, for every wave aimed at the camp.
       */
      { atS: 130, type: 'cruise', count: 1, bearingDeg: 352, spreadDeg: 0, altM: 170,
        distanceKm: 95, targetAssetId: 'a_camp', scalable: false, name: 'VAMPIRE STRAY' },
      { atS: 240, type: 'striker', count: 4, bearingDeg: 15, spreadDeg: 24, spacingS: 22, altM: 240,
        distanceKm: 132, targetAssetId: 'a_bridge' },
      { atS: 320, type: 'striker', count: 3, bearingDeg: 297, spreadDeg: 22, spacingS: 18, altM: 220,
        distanceKm: 130, targetAssetId: 'a_town' },
      /*
       * THE CROSSING, FROM THE SOUTH-EAST, WHILE THE SECOND STRAY IS RUNNING.
       *
       * The point of this watch is that you decide twice, and the second
       * decision has to cost something the first one did not. It did not:
       * measured over eight seeds a seat, competent play conceded nought or
       * one recognised arrival and held every one of twenty-four cells at
       * every allowance down to one, so the second stray was answered by a
       * sector with nothing else on its hands.
       *
       * Two low out of 118° at three hundred and sixty seconds, on the one
       * bearing nothing has come from tonight. The crossing is twenty-three
       * kilometres east of the town; only BASTION reaches it, and only once
       * they are over its horizon, so this is a pair of contacts that appear
       * late and have to be answered at once. They are still being fought when
       * VAMPIRE STRAY 2 crosses the ridge at four hundred and thirty, which is
       * the whole question asked a second time with the sector's hands full.
       *
       * TWO, and it was four first. Four took the watch to nought of eight
       * held at an allowance of one — the hardest cell in the campaign, on the
       * watch whose point is a choice rather than a workload — and the height
       * went from 130 m to 160 m for the same reason the strays did: a
       * hundred and twenty metres is BASTION's floor, and a package the one
       * battery that reaches the crossing cannot legally engage is not a
       * decision, it is a countdown.
       */
      { atS: 360, type: 'striker', count: 2, bearingDeg: 118, spreadDeg: 20, spacingS: 16, altM: 160,
        distanceKm: 84, targetAssetId: 'a_bridge' },
      // A second one goes the same way later. By then you have already decided
      // what you are, and the only question is whether you do it twice. It sits
      // at 430 s rather than 330 because the last spawn used to land at 39% of
      // the watch and the last quarter was one missile crossing an empty map.
      { atS: 430, type: 'cruise', count: 1, bearingDeg: 348, spreadDeg: 0, altM: 160,
        distanceKm: 95, targetAssetId: 'a_camp', scalable: false, name: 'VAMPIRE STRAY 2' },
    ],
  },

  {
    id: 'ville-under-fire',
    name: 'Ville Under Fire',
    subtitle: 'Everything at once, and then the lights go out.',
    theme: 'ops-modern',
    echelon: 'sector',
    roles: ['net', 'crew', 'both'],
    seed: 'ville-under-fire-11',
    /** The political section has an interest in tonight's scheduled transit. */
    civilOrder: true,
    /*
     * THREE, on the honest count, and it is act two's hardest watch.
     *
     * Nine of this raid's thirty-one aircraft are cruise missiles on the deck
     * and every one of them was free until the curve scrub counted an arriving
     * missile as an arrival; four was written against a raid a quarter of
     * which could not fail the watch. Sixteen seeds a seat on the honest
     * count: 50 / 63 / 44 per cent held at two, 69 / 81 / 75 at three, 81 / 94
     * / 81 at four. Three is the number, and the net seat's 69 is the floor of
     * act two — which is what lets the district watches sit at 69 without
     * being easier than the act before them.
     *
     * Re-measured after the residue pass moved three of the deck missiles to
     * the front of the watch: 69 / 88 / 88 at three over sixteen seeds, and
     * four was tried and moves the net seat by six points only, because half
     * the net's failures here are the operations centre and not the count.
     */
    leakerTolerance: 3,
    playerBatteryId: 's_thistle_t',
    roundAllowance: 30,
    /*
     * A clear minute of fighting before sector command's first routine order.
     *
     * Traced on all three seats: first contact at 15 s and the first directive
     * at 43 s, so the watch that opens with "this is the main effort" asked for
     * an opinion after twenty-eight seconds of it. Act one has carried this
     * field since the instruments pass and the district watch was given it in
     * the same change as this one; the measurement is the same in all three
     * places, and it is the first contact that starts the clock, not the
     * handover.
     */
    directiveContactGraceS: 60,
    brief: [
      'This is the main effort. Suppression first, then jamming, then decoys, then everything they have.',
      'The axis of it runs down the valley, and at the bottom of the valley is the Ville. The'
        + ' sector defends a crossing, a headquarters, and a town; the town is the one of the'
        + ' three that has people you can name in it.',
      'There is also a scheduled civil transit crossing the sector tonight, and the political section'
        + ' has taken an interest in one of its passengers. You will hear about it.',
      'They know where sector operations is. When it goes, the picture stops being one picture — every set',
      'reports for itself and nobody reconciles them. Cueing stops. Anything you delegated becomes nobody\'s job.',
      'Finish the watch anyway.',
    ],
    teaches: 'All of it, without the centre.',
    assets: [
      GROUND.town, GROUND.c2, GROUND.airbase, GROUND.power, GROUND.depot, GROUND.bridge,
    ],
    sites: [
      SITES.bastion, SITES.lanceWest, SITES.lanceEast,
      SITES.thistleTown, SITES.thistleBase, SITES.hammer,
    ],
    radars: [RADARS.ewrNorth, RADARS.gapSouth],
    /*
     * The whole raid is pulled inside the rings.
     *
     * Measured on the shipped table: the close-in fight — the best-designed
     * part of this watch, everything inside forty kilometres with the point
     * sections firing — began at minute thirteen of an eighteen-minute night,
     * and the nine minutes before it were sixteen aircraft on the plot with
     * one battery in reach of any of them. The last hostile spawned at 39-43%
     * of the median. Every package now arrives at a range the sector can
     * answer, and the last one arrives at 430 s instead of 360 s.
     */
    waves: [
      { atS: 15, type: 'sead', count: 2, bearingDeg: 355, spreadDeg: 50, spacingS: 30, distanceKm: 148 },
      { atS: 60, type: 'jammer', count: 2, bearingDeg: 10, spreadDeg: 60, spacingS: 25, distanceKm: 168, scalable: false },
      { atS: 130, type: 'decoy', count: 5, bearingDeg: 0, spreadDeg: 44, spacingS: 12, altM: 5000,
        distanceKm: 132 },
      { atS: 165, type: 'striker', count: 5, bearingDeg: 345, spreadDeg: 30, spacingS: 18, altM: 6200,
        distanceKm: 132, targetAssetId: 'a_c2' },
      civilTransit(210),
      /*
       * THE CABIN'S OWN FIGHT, AT THE FRONT OF THE WATCH.
       *
       * Three of the eight came off the 250 s run and now arrive first, on the
       * deck, down the western approach, aimed at the town THISTLE TOWN is
       * sited on. Same eight rounds, same axis, same night — but the seat this
       * watch designates is a twelve-kilometre point section, and until this
       * existed every package on the board spawned 82 to 168 km out, so the
       * cabin's first LEGAL claim landed at 213 s of a fourteen-minute watch
       * against a ninety-second bar and the first contact actually inside its
       * ring at 573 s. The arithmetic of twelve kilometres was offered as the
       * reason; it is the reason the raid AS WRITTEN could not be answered
       * sooner, not a reason to write it that way. Low Riders has carried the
       * answer since act one: a low element that arrives close in and is
       * engageable the moment it paints.
       *
       * Forty-two kilometres because that is what ninety seconds is worth at a
       * cruise missile's quarter-kilometre a second — the claim horizon opens
       * twelve and a half kilometres outside the ring, so the seat has a legal
       * shot from about twenty-four. Cruise rather than a low striker because a
       * striker releases at eighteen and turns, and what it releases is under
       * the section's own altitude floor: the cabin would watch the weapons go
       * past it. This is the district being attacked in front of the person
       * from it, which is the sentence the brief opens with.
       *
       * AND FORTY METRES, WHICH IS WHAT MAKES IT THE CABIN'S. At a hundred and
       * thirty they sat inside LANCE's sixty-metre floor, so on the unlucky
       * seeds the sector's own medium batteries killed all three before any of
       * them reached the section's claim horizon and the cabin was back to
       * waiting three minutes — measured on three named seeds, 200 s, 194 s
       * and 90 s to the first legal shot. Under every floor on this board but
       * the section's own fifteen metres and the gun battery's four-kilometre
       * ring, the same seeds read 72 / 86 / 75, and no seed has the work taken
       * away. Sixteen seeds competently played: median 63.5 s against 213.5,
       * worst 92, and the first contact actually inside the ring 128.5 s
       * against 573.
       */
      { atS: 8, type: 'cruise', count: 3, bearingDeg: 345, spreadDeg: 18, spacingS: 11, altM: 40,
        distanceKm: 42, targetAssetId: 'a_town' },
      /*
       * Six at 250 s, not eight. The three that moved to the front of the
       * watch are three the sector still has to answer, so the total went from
       * thirty aircraft to thirty-three and the net seat fell from 69 to 50
       * per cent held over sixteen seeds — half of those failures the
       * operations centre rather than the leaker count. Six restores act two's
       * floor with the cabin's fight kept: sixteen seeds, net 69, cabin 88,
       * both seats 88.
       */
      { atS: 250, type: 'cruise', count: 7, bearingDeg: 20, spreadDeg: 46, spacingS: 8, altM: 85,
        distanceKm: 92 },
      { atS: 300, type: 'sead', count: 2, bearingDeg: 30, spreadDeg: 30, spacingS: 20, distanceKm: 130 },
      /*
       * The last package: later on the clock and nearer on the map, which are
       * the same edit. It used to arrive at 430 s from eighty-two kilometres,
       * which put the watch's final spawn at 52% of its own median length —
       * under the 55% bar — while the aircraft that survived it spent four
       * minutes walking home and took the worst seed to 18.5 minutes, over the
       * ceiling. Seventy kilometres is fifty seconds less ingress and fifty
       * less egress, so moving it forty seconds later costs the watch nothing
       * and buys back both figures.
       */
      { atS: 470, type: 'striker', count: 5, bearingDeg: 5, spreadDeg: 40, spacingS: 16, altM: 160,
        distanceKm: 66 },
    ],
  },

  /* ---------------------------------------------------------------- *
   * ACT III — district command. Four sectors, and two hands.
   * ---------------------------------------------------------------- */

  {
    id: 'four-sectors',
    name: 'Four Sectors',
    subtitle: 'You have been promoted. You can now see everything and reach almost none of it.',
    theme: 'ops-modern',
    echelon: 'region',
    roles: ['net'],
    seed: 'four-sectors-01',
    /*
     * Six, not eight. The district is a big board and eight was written when
     * four sectors between them presented twenty-six aircraft; the raid is
     * denser now, and a tolerance that forgave eight weapons arriving on the
     * places you are responsible for made the verdict agree with the spectator
     * on more than half the seeds. Measured across eight: at eight the
     * competent player held seven of eight and the novice four; at six it is
     * five and one, which is the shape an act-three watch is supposed to have.
     *
     * EIGHT on the honest count. Nine of the thirty-four aircraft here are
     * cruise missiles, and until the curve scrub none of them could ever be an
     * arrival — so "six" meant six of the twenty-three strike aircraft, with
     * the two low missile streams on Lozan and the valley free. Counted
     * properly, sixteen seeds, competent play concedes a median of seven and
     * the readings are 31 per cent held at six, 56 at seven, 69 at eight and
     * 81 at nine. Eight is the rung, and eight is also what the district's own
     * arithmetic says: thirteen batteries across a hundred and ninety
     * kilometres, four of them under an officer who will not spend a round
     * outside the priority of fires.
     */
    leakerTolerance: 8,
    playerBatteryId: 's_bastion_d',
    roundAllowance: 40,
    centre: { x: 4, y: 6 },
    scopeRangeKm: 260,
    /*
     * Twelve rounds behind each rack instead of sixteen.
     *
     * Thirteen batteries with a full store between them is why "set every
     * sector WEAPONS FREE and never touch another control" out-scored both
     * hand players: nobody ever ran out, so the standing order cost nothing
     * whichever way it was left. At three quarters the sector left free meets
     * the third package on an empty rack, and the order becomes a decision
     * with a bill.
     */
    storeMult: 0.75,
    /*
     * A clear minute of fighting before the first order, counted from the
     * contact and not from the clock.
     *
     * Act one has carried this since the instruments pass; this watch had it
     * measured and did not have it set. Traced on the net seat: first contact
     * at 31 s, first directive at 43 s — twelve seconds of fighting against a
     * sixty-second bar, and confirmed in the browser at 4x, where SECTOR
     * ACTUAL's routine order about the river line lands at 0:42 with one
     * contact on the scope. An order about a fight you are not yet having is
     * an order you answer without an opinion.
     */
    directiveContactGraceS: 60,
    brief: [
      'You are appointed to command of the district. Four sectors, a hundred and ninety kilometres of'
        + ' ground, and thirteen batteries that are no longer yours to point.',
      'Each sector has a commander. You may take two of them under your own hand at a time and no more,'
        + ' and changing which two costs you the better part of twenty seconds during which nobody at all'
        + ' is commanding either one.',
      'Everything you are not standing in fights on the standing order you left it with — hold, tight,'
        + ' or free. That order is now your principal weapon. It is issued in advance, to somebody you'
        + ' cannot see, about a raid that has not happened yet.',
      'Two axes are crossing the frontier tonight, on Lozan and on Kubin. There is a third smaller one'
        + ' and it is going down the valley. You know the valley.',
      'Nothing is forecast against Brasov. Nothing has been forecast against Brasov in eleven months,'
        + ' which is why it has a commander the political section chose and an order you will not be'
        + ' asked to review. The forecast is a forecast.',
    ],
    teaches: 'That a standing order given to somebody you cannot see is a real weapon, and usually the only one you have.',
    assets: [
      DISTRICT_GROUND.villeTown, DISTRICT_GROUND.villeC2, DISTRICT_GROUND.villeBridge,
      DISTRICT_GROUND.kubinCity, DISTRICT_GROUND.kubinDepot,
      DISTRICT_GROUND.lozanCity, DISTRICT_GROUND.lozanPower,
      DISTRICT_GROUND.brasovCity, DISTRICT_GROUND.brasovDepot,
      DISTRICT_GROUND.districtPost,
    ],
    /*
     * The officers, pitched for this watch.
     *
     * Measured on the establishment values: Lenko answered 100% of contacts,
     * Voloh 96%, Strelnik 89% — all three of them faster and less discriminate
     * than a person's own three-second pass — and the appointment's first verb
     * was worth −12%. These four are good and are not better than you: each of
     * them will take the contacts his sector is built for and will be one beat
     * behind on the marginal ones.
     *
     * And each runs his sector on one radio. THREE engagements at a time is
     * what an officer with a map and a handset can personally direct; the
     * fourth aircraft of a package waits for a channel, for the standing order
     * to let his crews take it, or for you to come and stand there.
     */
    formations: districtFormationsWith({
      f_ville: { competence: 0.88, span: 3 },
      f_kubin: { competence: 0.62, span: 3 },
      f_lozan: { competence: 0.8, span: 3 },
      f_brasov: { competence: 0.72, span: 3 },
    }),
    /** You open holding the valley and the district battalion. The rest are on their own. */
    openInFormations: ['f_ville'],
    sites: Object.values(DISTRICT_SITES),
    radars: DISTRICT_RADARS,
    waves: [
      /*
       * Lozan, first and heaviest — it is nearest the frontier and it always
       * is. The packages arrive tighter than they used to (eleven and nine
       * seconds between aircraft, against eighteen and fourteen) because a
       * sector's officer answers three at a time: a package that arrives in
       * file is four separate problems he can solve one after another, and a
       * package that arrives together is the one the appointment is about.
       */
      { atS: 25, type: 'sead', count: 2, bearingDeg: 20, spreadDeg: 30, spacingS: 24, distanceKm: 165 },
      { atS: 70, type: 'striker', count: 6, bearingDeg: 15, spreadDeg: 24, spacingS: 11, altM: 6200,
        distanceKm: 145, targetAssetId: 'a_lozan_power' },
      { atS: 210, type: 'cruise', count: 5, bearingDeg: 22, spreadDeg: 26, spacingS: 9, altM: 90,
        distanceKm: 145, targetAssetId: 'a_lozan' },

      // Kubin, second, and from a bearing the western gapfiller is poor against.
      { atS: 120, type: 'striker', count: 5, bearingDeg: 300, spreadDeg: 26, spacingS: 12, altM: 5600,
        distanceKm: 145, targetAssetId: 'a_kubin_depot' },
      { atS: 265, type: 'striker', count: 5, bearingDeg: 288, spreadDeg: 22, spacingS: 11, altM: 170,
        distanceKm: 145, targetAssetId: 'a_kubin' },

      // And the valley, which is small, and which you will want to take anyway.
      { atS: 175, type: 'striker', count: 3, bearingDeg: 345, spreadDeg: 24, spacingS: 22, altM: 5200,
        distanceKm: 140, targetAssetId: 'a_bridge' },
      { atS: 320, type: 'cruise', count: 4, bearingDeg: 350, spreadDeg: 24, spacingS: 12, altM: 85,
        distanceKm: 140, targetAssetId: 'a_town' },

      /*
       * Brasov, last, from the south, and not in the brief.
       *
       * Measured, this sector had never once been attacked: every axis above
       * arrives between 288° and 22°, Brasov sits at 162°, and its three
       * batteries spent zero rounds across four watches. A quarter of the
       * order of battle was scenery — which also made the political colonel
       * who commands it, the district act's whole device, a man with nothing
       * to decline. Late, so the fourth sector is a reason for the back half
       * to exist rather than a fourth thing to watch in the first eight
       * minutes, and small, because it is a raid of opportunity on the flank
       * everyone had written off.
       *
       * At 430 s it was the last aeroplane of the night at 54% of the watch,
       * which put the whole back half of a fifteen-minute raid into the chase.
       * At 500 it lands past the halfway mark and the sector that has been
       * scenery all night is the thing the last four minutes are about.
       */
      { atS: 500, type: 'striker', count: 4, bearingDeg: 162, spreadDeg: 20, spacingS: 14, altM: 4800,
        distanceKm: 150, targetAssetId: 'a_brasov_depot' },
    ],
  },

  {
    id: 'reinforce-the-capital',
    name: 'Reinforce the Capital',
    subtitle: 'An order to send away the only thing that reaches two of your sectors.',
    theme: 'ops-modern',
    echelon: 'region',
    roles: ['net'],
    seed: 'reinforce-01',
    /*
     * Seven, not nine. A verdict that survived two destroyed places and five
     * hundred and twenty-three civilian dead — measured, in a browser watch
     * that printed SECTOR HELD over both — is not a verdict, and the watch
     * whose lesson is what an order COSTS cannot be the one watch where the
     * cost does not reach the headline. Measured over eight seeds: at nine, all
     * three player models held every seed; at five the competent player holds
     * five and the expert seven, which is the shape an act-three watch wants.
     * (The novice holds six, which is more than the bar allows and is not a
     * property of this watch — see the note in the README: on a thirteen-battery
     * district board the harness's competent model assigns by nearest-capable
     * battery and pre-empts the officers with a worse pairing, so it leaks a
     * shade MORE than the careless model that leaves them alone. It is the
     * instrument that cannot separate them here, not the raid.)
     *
     * SIX on the honest count. Six of the twenty-seven aircraft here are
     * cruise missiles and none of them could ever be an arrival before the
     * curve scrub. Sixteen seeds: competent play concedes a median of five and
     * the readings are 19 per cent held at four, 56 at five, 69 at six and 81
     * at seven. Six puts this watch level with Four Sectors, which is what an
     * act wants — the two district watches are the same problem asked twice,
     * once about the appointment and once about the order.
     */
    leakerTolerance: 6,
    playerBatteryId: 's_bastion_d',
    roundAllowance: 36,
    centre: { x: 4, y: 6 },
    scopeRangeKm: 260,
    /** The hinge: the ministry wants your battalion. */
    withdrawalOrder: true,
    /*
     * And it comes when the battalion is in the middle of something.
     *
     * The order used to arrive at fifty-five seconds, before BASTION DISTRICT
     * had fired a round — so "give me your long-range battalion" was a form to
     * sign rather than a thing to lose, and the brief's promise of the order
     * "in the next few minutes" was false by two minutes. At a hundred and
     * sixty-five it lands with the battalion holding four tracks and its
     * channels full, which is the sentence the watch is actually about: give me
     * the battery that is currently firing.
     */
    withdrawalOrderAtS: 165,
    brief: [
      'The ministry has assessed a threat to the capital and is drawing long-range assets from the'
        + ' districts. You will receive the order in the next few minutes and you will be asked to'
        + ' acknowledge it on the net.',
      'The asset is BASTION DISTRICT. It is the only long-range battalion between Kubin and Lozan and'
        + ' the only thing in this district that reaches either of them from where it stands.',
      'Mostrograd is not under attack. It has not been under attack at any point this week. You have'
        + ' the same air picture the ministry has.',
      'There is a raid coming tonight regardless of what you do about the order.',
    ],
    teaches: 'What a redeployment order costs, and who it is actually for.',
    briefIfKnown: {
      ledger: ['You have seen the depot returns. You know how much is already sitting in the capital'
        + ' and how little of it has moved since the spring.'],
      border: ['You have read a schedule of defended places before. You know what it is a schedule of.'],
    },
    assets: [
      DISTRICT_GROUND.villeTown, DISTRICT_GROUND.villeC2, DISTRICT_GROUND.villeBridge,
      DISTRICT_GROUND.kubinCity, DISTRICT_GROUND.kubinDepot,
      DISTRICT_GROUND.lozanCity, DISTRICT_GROUND.lozanPower,
      DISTRICT_GROUND.brasovCity, DISTRICT_GROUND.brasovDepot,
      DISTRICT_GROUND.districtPost,
    ],
    /*
     * The district's own establishment, untouched — the same four officers at
     * the competences their files give them, and no span declared.
     *
     * This watch is the campaign's measured moral hinge and the officers are
     * what it is calibrated against. Spans were tried here and taken out
     * again: over eight seeds of the hand-fought model in `test/echelon.test.js`
     * they moved the district's ground outcome from six places lost refusing
     * against eight obeying to TEN against four — the officers holding fewer
     * engagements pushes more of the fight onto crews the withdrawn battalion
     * was covering, and the trade the level exists to state inverts. Four
     * Sectors is the watch about the appointment; this one is about the order.
     */
    formations: DISTRICT_FORMATIONS,
    openInFormations: ['f_kubin'],
    sites: Object.values(DISTRICT_SITES),
    radars: DISTRICT_RADARS,
    waves: [
      { atS: 35, type: 'sead', count: 2, bearingDeg: 340, spreadDeg: 44, spacingS: 26, distanceKm: 165 },
      // Kubin takes the weight, and Kubin is what the battalion covers. The
      // deck wave and the cruise stream are sized against FIVE battalions:
      // the local sections can parry them with the long-range battalion's
      // reach behind them, and visibly cannot once the ministry has it.
      { atS: 105, type: 'striker', count: 5, bearingDeg: 296, spreadDeg: 26, spacingS: 18, altM: 6000,
        distanceKm: 145, targetAssetId: 'a_kubin' },
      { atS: 190, type: 'striker', count: 5, bearingDeg: 305, spreadDeg: 22, spacingS: 20, altM: 180,
        distanceKm: 145, targetAssetId: 'a_kubin_depot' },
      { atS: 250, type: 'cruise', count: 6, bearingDeg: 18, spreadDeg: 26, spacingS: 14, altM: 90,
        distanceKm: 145, targetAssetId: 'a_lozan' },
      /*
       * Three, not four. Eight weapons on the Lozan power station behind a
       * six-round cruise stream took it on eight seeds of eight whatever the
       * commander did with the battalion — which made the district's ground
       * outcome a constant and the withdrawal's whole cost invisible in it.
       * Measured over eight seeds of the hand-fought model: at four aircraft,
       * refusing lost NINE places against obedience's eight; at three, it loses
       * six against eight, which is the sentence the level is about.
       */
      { atS: 315, type: 'striker', count: 3, bearingDeg: 12, spreadDeg: 24, spacingS: 18, altM: 5400,
        distanceKm: 145, targetAssetId: 'a_lozan_power' },
      { atS: 380, type: 'striker', count: 3, bearingDeg: 348, spreadDeg: 22, spacingS: 22, altM: 5000,
        distanceKm: 140, targetAssetId: 'a_c2' },
      // Brasov again, and on this watch it is the sector the withdrawn
      // battalion used to reach. See the note on the district watch. At 455 s
      // it was the last aeroplane of the night at 53% of the watch; at 500 it
      // lands past the halfway mark, which is where the bar wants it and where
      // the sector that has been quiet all night earns the last four minutes.
      { atS: 500, type: 'striker', count: 3, bearingDeg: 165, spreadDeg: 20, spacingS: 20, altM: 4600,
        distanceKm: 150, targetAssetId: 'a_brasov' },
    ],
  },

  /* ---------------------------------------------------------------- *
   * ACT IV — national command. The whole country, and one seat.
   * ---------------------------------------------------------------- */

  {
    id: 'two-cities',
    name: 'The Two Cities',
    subtitle: 'Two raids, one sector, and an order about which one matters.',
    theme: 'ops-modern',
    echelon: 'national',
    roles: ['net', 'both'],
    seed: 'two-cities-final',
    /*
     * Three. Twenty-eight aircraft carry something like forty-four weapons at
     * two places and a post, and a verdict that forgave six of them arriving
     * was one the careless player model met on three quarters of its seeds.
     * Measured over eight: at three the novice holds three, the competent six
     * and the expert eight, which is what the last watch of the campaign is
     * supposed to look like.
     *
     * FOUR on the honest count. Nine of the twenty-eight aircraft on this
     * board are cruise missiles — five at the palace and four in the valley —
     * and every one of them arrived for nothing until the curve scrub counted
     * it. Sixteen seeds on the net: 25 per cent held at three, 69 at four, 75
     * at five. Four is the number, and it has to be four rather than five
     * because the district watches hold 69 and nothing in act four may be
     * easier than act three's hardest.
     *
     * From both seats the same night holds 94 per cent, which is above the
     * band and is the watch's own arithmetic rather than an accident: the
     * `both` seat is a national commander who is also crewing the one battery
     * that reaches either city. Tightening further to bring it in would put
     * the net seat under the floor — measured, at an allowance of three the
     * net holds 4 of 16 — so the exception is recorded in the README instead.
     */
    leakerTolerance: 4,
    playerBatteryId: 's_bastion',
    roundAllowance: 26,
    /**
     * The depots are committed to the capital. There is no resupply, and what
     * a battery has tonight is what it was issued — the rails, and one refill
     * behind them.
     *
     * It used to be the rails and nothing else, and the arithmetic that made
     * was not the one the level wanted. Measured in the cabin: the magazine was
     * the ONLY thing between the operator and a legal shot for sixty-five per
     * cent of the watch, engageable share fell to fifteen, and BASTION — the
     * battery the brief is about — was dry at five minutes and never fired
     * again, so the third axis arrived at a rack that had been empty for six
     * minutes. That is not scarcity, it is a watch that ends at minute five and
     * takes another eleven to admit it. Half a store keeps the total honest —
     * sixteen rounds on the long battalion against eighteen aircraft — and
     * gives the cabin back the one piece of craft this watch is for, which is
     * knowing when to send the loaders out.
     */
    supply: { roundsMult: 1, reloadsAllowed: true },
    /*
     * A third of a rack behind each, and no more.
     *
     * The finale's lesson is that the equipment was never the constraint, and
     * for a while its arithmetic said the opposite: with nothing behind the
     * rails the magazine was the ONLY thing between the operator and a legal
     * shot for two thirds of the watch, the crewed battery was dry at five
     * minutes of a sixteen-minute night, and the harness's careless player
     * model out-held its careful one on both seats because the careful one
     * spent its rails early and the watch had no way back. A watch decided by
     * a hoist is not a watch about a choice. So there is enough to fight with,
     * the raid is what is heavy, and the constraint is where the level says it
     * is: two places, three axes, and one of you.
     */
    storeMult: 0.35,
    /**
     * The national reserve, on the night it matters.
     *
     * Eight rounds, four minutes on the road, and released by nobody below this
     * appointment. The whole allocation sent to one valley is worth having; split
     * between two it is worth nothing to either, which makes it one more version
     * of the same question the rest of the watch is asking.
     */
    reserveRounds: 8,
    /** The watch the whole campaign has been walking toward. */
    finale: true,
    brief: [
      'Three formations crossed the frontier on divergent axes.',
      'The northern one is tracking Mostrograd and the presidential palace. The western one is'
        + ' tracking the valley, and there is nothing in the valley but the crossing and your village.',
      'The third is tracking this post. You have been radiating all night and they have known where'
        + ' you are for some time. You can displace and live, and BASTION — the only battery that can'
        + ' reach either city — will be off the air for the three and a half minutes that takes.',
      'Sector command has already transmitted its priority of fires. You will receive it shortly and'
        + ' you will be asked to acknowledge it on the net, in the clear, with the log running.',
      'BASTION sits between the two cities and can reach either. There is no resupply tonight — the'
        + ' depots are committed to the capital, so BASTION has one refill in its own store and every'
        + ' other battery has a third of one. Eleven aircraft on each axis, and six more for this'
        + ' post. Every strike aircraft carries two weapons.',
    ],
    teaches: 'That the equipment was never the constraint.',
    /**
     * The official line about the depots, read by somebody who has seen the
     * returns, is a different sentence entirely.
     */
    briefIfKnown: {
      ledger: ['You have seen what the depot returns say the sector is holding. You know what the'
        + ' magazines actually contain. "The depots are committed to the capital" is a sentence you'
        + ' can no longer hear the way it is meant.'],
      freeze: ['Nothing in the western valley is a designated defended place. You have been told'
        + ' that before, about a building with people in it.'],
      movement: ['The household effects left the palace for Demobodedovo under a movement order you'
        + ' have read. What the priority of fires will protect tonight is the address.'],
    },
    /*
     * The night's long tail. After the last packages commit, the watch used
     * to run its final four minutes in silence while survivors straggled out
     * — but a sector that has just spent its magazines is the opposite of a
     * quiet room: the accounting starts before the firing stops.
     */
    chatter: [
      { atS: 46, text: 'FRONTIER POSTS REPORT ENGINE NOISE ON THREE BEARINGS. THE SETS HAVE NOTHING YET.' },
      { atS: 62, text: 'LOZAN EXCHANGE HAS STOPPED ANSWERING. THE LINE IS NOT REPORTED CUT.', pressureOnly: true },
      /*
       * The one thing this watch never said out loud. The third axis is aimed
       * at the post the player is sitting in, and the only way to know that was
       * to select each contact and read the destination line. A player who is
       * told at two minutes forty-eight that a formation has turned in on THEM
       * has time to shoot it, or to displace, or to decide not to — which is
       * the trilemma the brief promises and the watch was not delivering.
       */
      { atS: 168, text: 'THE THIRD FORMATION HAS TURNED IN ON THIS POST. IT IS NOT TRACKING EITHER CITY.' },
      { atS: 385, text: 'THE NORTHERN FORMATION HAS PASSED ITS RELEASE LINE. THE WESTERN ONE HAS NOT TURNED YET.' },
      { atS: 745, text: 'FORMATIONS REPORT ROUNDS REMAINING BY SECTION. THE FIGURES GO TO THE MINISTRY AS TRANSMITTED.' },
      { atS: 850, text: 'DISTRICT EXCHANGE REQUESTS LINE CAPACITY FOR CASUALTY TRAFFIC. GRANTED ON THE SECOND REQUEST.', pressureOnly: true },
      { atS: 930, text: 'THE 0600 BROADCAST IS IN PREPARATION. SECTOR IS ASKED FOR ONE FIGURE, CHECKED TWICE.' },
    ],
    /*
     * Clustered, because the sector operations centre sits eleven kilometres
     * from the village and a track bound for one passes close to the other. On
     * this watch the question is never "which building" but "which valley", so
     * rounds are attributed to a side rather than to an address.
     */
    assets: [
      { ...GROUND.town, cluster: 'ville' },
      { ...GROUND.c2, cluster: 'ville' },
      { ...GROUND.bridge, cluster: 'ville' },
      CAPITAL_GROUND.palace, CAPITAL_GROUND.ministry, CAPITAL_GROUND.capitalPower,
      /*
       * You. Co-located with BASTION, which is the only battery on the board
       * that can reach either city — so the third thing being asked of these
       * rounds is your own life, and displacing to save it is also removing the
       * one system that could have helped anybody else.
       */
      {
        id: 'a_post', type: 'post', label: 'FORWARD POST',
        pos: { x: 50, y: 30 }, cluster: 'self', follows: 's_bastion',
      },
    ],
    /**
     * Two subordinate commands and your own battalion, and you may stand in
     * one of the two.
     *
     * This is what the appointment did to this watch. The battery that reaches
     * both cities is your own and is always under your hand — but the sector
     * you are not standing in is run by somebody else, on the standing order
     * you gave them before either raid was detected, and one of those two
     * officers will not expend a round on anything the priority of fires does
     * not name. You will find out which one at about four in the morning.
     */
    formations: [
      {
        id: 'f_hq', hq: true, name: 'NATIONAL BATTALION',
        tm: 'ДИВИЗИОН ГЛАВНОГО ШТАБА', en: 'Headquarters battalion',
        pos: { x: 50, y: 30 }, posture: 'tight',
      },
      {
        id: 'f_valley', name: 'VALLEY SECTOR', tm: 'СЕКТОР ДОЛИНЫ', en: 'Valley sector',
        pos: { x: -8, y: 4 }, posture: 'tight',
        /*
         * Two engagements at a time, each, and that is the finale's whole
         * argument as a number. A sector commander with one radio and one map
         * can hold two problems; the packages arrive in fours. Whichever of the
         * two sectors you are not standing in will be a beat behind all night,
         * and there is no arrangement of your own hands that covers both.
         */
        commander: { name: 'CAPT. RADU', tm: 'КАПИТАН РАДУ', competence: 0.85, span: 2 },
      },
      {
        id: 'f_capital', name: 'CAPITAL SECTOR', tm: 'СЕКТОР СТОЛИЦЫ', en: 'Capital sector',
        pos: { x: 104, y: 68 }, posture: 'tight',
        // He will hold the palace beautifully and let the valley burn, and he
        // will be right, in the only sense the word is used in this service.
        commander: {
          name: 'COL. STRELNIK', tm: 'ПОЛКОВНИК СТРЕЛЬНИК', competence: 1.0, political: true, span: 2,
        },
      },
    ],
    openInFormations: ['f_valley'],
    sites: [
      /*
       * The one store on the board. Eight rounds on the rails and eight behind
       * them, for the only battery that reaches either city — and nothing for
       * anybody else, which is what "the depots are committed to the capital"
       * means when you are the one holding the long battalion.
       *
       * Measured with no store at all: the magazine was the only thing between
       * the operator and a legal shot for two thirds of the watch, BASTION was
       * dry at five minutes of a sixteen-minute night, and the harness's
       * careless player model out-held its careful one on both seats because
       * the careful one spent its rails early and the watch had no way back.
       * Measured with a second rack for every battery instead: eighty-eight
       * extra rounds, and all four player models held all eight seeds.
       */
      { ...SITES.bastionCentre, formation: 'f_hq', storeMult: 0.5 },   // one full refill
      { ...SITES.lanceVille, formation: 'f_valley' },
      { ...SITES.thistleVille, formation: 'f_valley' },
      { ...SITES.hammer, formation: 'f_valley' },
      { ...SITES.lanceCapital, formation: 'f_capital' },
      { ...SITES.thistlePalace, formation: 'f_capital' },
      { ...SITES.hammerCapital, formation: 'f_capital' },
    ],
    radars: [
      { type: 'ewr', pos: { x: 40, y: 78 }, on: true },
      { type: 'gapfiller', pos: { x: -22, y: 30 }, on: true },
    ],
    waves: [
      /*
       * Northern axis: the capital. Suppression first, as it always is.
       *
       * Eleven aircraft a side is the number the whole watch is balanced on: a
       * committed defence with everything on one side's rails can just about
       * stop eleven, and cannot come close to stopping twenty-two. Remember
       * that a strike aircraft carries two weapons, so eleven aircraft is
       * closer to eighteen impacts than to eleven.
       *
       * It was nine a side, spread wider, against batteries with nothing behind
       * their racks. That version was decided by the hoist rather than by the
       * choice: see the note on `storeMult` above. The rounds are now there and
       * the packages arrive together, which moves the constraint from the
       * magazine to the pair of hands.
       */
      { atS: 70, type: 'striker', count: 6, bearingDeg: 25, spreadDeg: 22, spacingS: 14, altM: 6400,
        targetAssetId: 'a_palace' },
      /*
       * AND THE ONE THING THAT CHARGES FOR DELEGATION BY NAME.
       *
       * The finale's load-bearing claim is that there is no arrangement of
       * these rounds that serves all three places — and measured against the
       * arm that arranges nothing, it was not true: with every battery set
       * WEAPONS FREE and the AI net running the picture, both cities AND the
       * post came through on eight seeds of eighteen. A trilemma that a single
       * press of the standing order solves half the time is not a trilemma.
       *
       * The device that answers it is the campaign's own, and act two spends a
       * whole watch teaching it: a free crew snaps the earliest shot at
       * whatever is nearest, which is exactly what a decoy is built to be.
       * Four of them on the capital's axis cost a delegating player rounds and
       * channels and cost a commander who reads the picture nothing — the
       * tell is thirty seconds of a well-held track, or forty kilometres for
       * free, and both are available to somebody paying attention. Measured
       * over eighteen seeds of the fully delegated arm: all three came through
       * on eight, and now on three.
       */
      { atS: 205, type: 'decoy', count: 4, bearingDeg: 28, spreadDeg: 26, spacingS: 11, altM: 5200,
        distanceKm: 124 },
      { atS: 250, type: 'cruise', count: 5, bearingDeg: 30, spreadDeg: 20, spacingS: 10, altM: 90,
        distanceKm: 130, targetAssetId: 'a_palace' },

      /*
       * Western axis: the valley, and the village in it. Deliberately smaller
       * than the northern one and spread over four minutes, so a battery
       * committed to the Ville can cycle its channels and genuinely hold —
       * the choice has to be a choice, not a foregone loss dressed up as one.
       */
      { atS: 175, type: 'striker', count: 5, bearingDeg: 285, spreadDeg: 24, spacingS: 16, altM: 5800,
        targetAssetId: 'a_town' },
      /*
       * Later, and spawned close in. On the default hundred-and-fifty-five
       * kilometre ring the last western package released at 770-824 s and its
       * weapons arrived at 948 — five hundred and thirty seconds of transit
       * after a spawn that was already only 41% of the way through the watch.
       * The valley's raid now finishes inside the watch it belongs to.
       */
      { atS: 320, type: 'cruise', count: 4, bearingDeg: 292, spreadDeg: 26, spacingS: 12, altM: 85,
        distanceKm: 115, targetAssetId: 'a_town' },
      { atS: 500, type: 'striker', count: 2, bearingDeg: 300, spreadDeg: 22, spacingS: 20, altM: 160,
        distanceKm: 95, targetAssetId: 'a_town' },

      /*
       * And the third axis, which is for you. They know where the forward post
       * is because it has been radiating all night, and they have brought
       * suppression aircraft and a small strike package for it.
       */
      /*
       * The only suppression on the board, and it is aimed at you. Two packages
       * of it collapsed every kill probability in the sector through guidance
       * loss and made all three places indefensible at once, which is a
       * different problem from the one this watch is supposed to pose.
       */
      /*
       * The suppression pair comes first and comes early — at forty-five
       * seconds rather than ninety, which is also the watch's first contact.
       * T1 wants something on the tube inside a minute and the capital's raid
       * cannot be pulled forward to provide it: measured over three variants,
       * every earlier northern package drains BASTION earlier and costs the
       * competent player held seeds. An independent early contact is the right
       * repair, and the aircraft coming to blind you is the honest one.
       */
      { atS: 45, type: 'sead', count: 2, bearingDeg: 55, spreadDeg: 20, spacingS: 24, distanceKm: 160,
        scalable: false },
      /*
       * And the strike package for this post arrives at two and a half minutes
       * with three aircraft, not at three and a half with four.
       *
       * This is the change the whole watch turned on. BASTION was dry at 320 s
       * against a post-strike release at 571-604 s, so YOUR POSITION WAS
       * OVERRUN happened at every skill level, in seventy-three per cent of
       * runs, including the walk-away — a scripted death with one hidden save.
       * Arriving while there are rounds on the rails makes the third axis a
       * thing you can answer with fire, or duck by displacing, or decide to
       * ignore in favour of a city. That is the trilemma the brief describes.
       */
      { atS: 150, type: 'striker', count: 4, bearingDeg: 60, spreadDeg: 18, spacingS: 20, altM: 4200,
        distanceKm: 128, targetAssetId: 'a_post', scalable: false },
    ],
  },

  /**
   * The epilogue, and the only watch in the game that is not about a place.
   *
   * It exists only for an operator who held the palace on the last watch —
   * which is to say, for an operator who obeyed. Two days later the man the
   * palace was defended for leaves the country from the state field at
   * Demobodedovo, and the same sector command that ordered the palace held now
   * orders his aircraft protected at all cost.
   *
   * There are three ways this ends and the simulation does not favour any of
   * them. You can hold the corridor open and watch him go. You can spend your
   * rounds on the palace, the field and the city, and let the fighters do what
   * fighters do. Or you can select a track your own system has already
   * identified as friendly, and give a fire order against it.
   *
   * Nothing in the interface asks which one you meant. The log records what
   * left the rails.
   */
  {
    id: 'presidents-flight',
    name: "The President's Flight",
    subtitle: 'STATE 01, out of Demobodedovo, and everything that wants it down.',
    theme: 'ops-modern',
    echelon: 'national',
    roles: ['net', 'both'],
    seed: 'presidents-flight-01',
    /*
     * The allowance is here for form's sake and decides nothing. This watch's
     * verdict is the aeroplane: `result()` reads STATE 01 first, and over
     * sixteen seeds a competent net seat concedes ZERO arrivals on every one
     * of them. Its difficulty lives entirely in how many rounds the city takes
     * off the corridor — see the palace package in the wave table.
     */
    leakerTolerance: 4,
    playerBatteryId: 's_bastion_se',
    roundAllowance: 20,
    /** The watch is fought over the capital, so its geometry is struck from there. */
    centre: { x: 106, y: 50 },
    /** And framed wide enough to hold the whole departure corridor at once. */
    scopeRangeKm: 175,
    /** Only for an operator who held the palace. */
    requiresEnding: ['obedient', 'exemplary'],
    /** Read by the scoring and the endings the way `finale` is. */
    epilogue: true,
    /*
     * THE ORDER THAT WAS ALREADY IN FORCE.
     *
     * The capital's priority of fires is the palace and it was settled before
     * this watch was handed over — which is why it is declared here instead of
     * being asked for on the net. It has one consequence and the watch is
     * built on it: COL. STRELNIK holds a list of buildings, an aeroplane is
     * not on any list of buildings, and so the corridor is the operator's job
     * and nobody else's. Before this existed his sector shot the fighters down
     * on its own initiative and the brief's own sentence — "you have one
     * battalion that can cover the corridor; it cannot cover the corridor and
     * the city at the same time" — was false. Measured at eight seeds on the
     * net: a player who touched nothing held 4 of 8 and outscored competent
     * play; after, nothing holds 0 of 8.
     */
    priorityOfFires: 'a_palace',
    /** What is left of the reserve two days later. */
    reserveRounds: 6,
    /**
     * The capital's own allocation, which is not the sector's.
     *
     * The last watch was fought on what was on the rails because the depots
     * were "committed to the capital". This is the capital. The rounds that
     * were not in the valley two nights ago are here, stacked, for one
     * aeroplane — and an operator who has read the depot returns will notice
     * the arithmetic without anybody drawing attention to it.
     */
    supply: { roundsMult: 1.4, reloadsAllowed: true },
    /*
     * The departure, narrated from the ground. STATE 01 does not roll until
     * sixty seconds in, and the field talks while it is being loaded — the one
     * watch where the opening traffic is about our own side. The sequencing in
     * these lines is the characterization: freight first, and two aircraft
     * full of other people held on the apron so that one can go.
     */
    chatter: [
      { atS: 14, pressureOnly: true,
        text: 'DEMOBODEDOVO GROUND: LOADING COMPLETE. THE CRANE DETAIL IS RELEASED TO ITS BATTERY.' },
      { atS: 30,
        text: 'THE FIELD IS CLOSED TO ALL OTHER MOVEMENTS. TWO EVACUATION FLIGHTS ARE HELD ON THE APRON.' },
      { atS: 48, pressureOnly: true,
        text: 'PASSENGER STEPS WITHDRAWN. THE FREIGHT DOORS WERE SEALED FIRST.' },
    ],
    brief: [
      'Two days after the last watch. You have been moved to the capital sector, which is what happens'
        + ' to people whose files say what yours now says.',
      'At 0410 a state aircraft, callsign STATE 01, will lift from Demobodedovo and route south-east for'
        + ' the frontier. The passenger list is not being transmitted. Sector command has ordered the'
        + ' aircraft protected at all cost, and has used those words.',
      'Two flights of enemy fighters are already airborne to the north. They are not interested in the'
        + ' palace, the city, or you. They are interested in one aeroplane, and they carry one round'
        + ' each, off one pass, from twenty kilometres.',
      'There is also a strike package coming for the palace and the field, and you have one battalion'
        + ' that can cover the corridor. It cannot cover the corridor and the city at the same time.',
      'STATE 01 will be on your scope, identified, until it is out of national airspace or it is'
        + ' not. Nothing else on this watch matters beside that.',
    ],
    teaches: 'That the last decision was never about a building either.',
    briefIfKnown: {
      buyer: ['You know who has been buying what, and through which ministry, and what the aircraft'
        + ' at Demobodedovo has been loading since yesterday afternoon. Nobody has asked you to know it.'],
      ledger: ['The depot returns you saw are the returns for a sector that no longer has a government'
        + ' to account to. Nothing was ever going to be resupplied.'],
      movement: ['The loading at Demobodedovo completes a movement order you have read. Freight class'
        + ' four does not board an aircraft in an emergency. It boards on a schedule, and the schedule'
        + ' is older than the threat.'],
    },
    assets: [
      CAPITAL_GROUND.palace, CAPITAL_GROUND.ministry, CAPITAL_GROUND.capitalPower, AIRPORT,
    ],
    /**
     * The corridor is yours; the city is not.
     *
     * BASTION TAVROV is the headquarters battalion and reaches the whole
     * departure route, so the corridor is always under your own hand. The
     * capital's own sector, and the section at the far end of the corridor, are
     * commanded by other people on whatever you told them — and you may stand
     * in one of the two.
     */
    formations: [
      {
        id: 'f_hq', hq: true, name: 'NATIONAL BATTALION',
        tm: 'ДИВИЗИОН ГЛАВНОГО ШТАБА', en: 'Headquarters battalion',
        pos: { x: 120, y: 22 }, posture: 'tight',
      },
      {
        id: 'f_city', name: 'CAPITAL SECTOR', tm: 'СЕКТОР СТОЛИЦЫ', en: 'Capital sector',
        pos: { x: 102, y: 60 }, posture: 'tight',
        commander: {
          name: 'COL. STRELNIK', tm: 'ПОЛКОВНИК СТРЕЛЬНИК', competence: 1.0, political: true, span: 2,
        },
      },
      {
        /*
         * The far end of the corridor, and it is on WEAPONS TIGHT.
         *
         * It used to open free, which meant the section fought the second pair
         * on its own initiative and the operator's only job was to watch. The
         * two officers on this watch each hold two engagements at a time; the
         * standing order is what decides whether this one is fighting what it
         * can see or waiting to be told, and it is the first thing worth
         * pressing on the panel.
         */
        id: 'f_corridor', name: 'TAVROV SECTION', tm: 'ТАВРОВСКИЙ УЧАСТОК', en: 'Tavrov section',
        pos: { x: 160, y: -20 }, posture: 'tight',
        commander: { name: 'CAPT. VOLOH', tm: 'КАПИТАН ВОЛОХ', competence: 0.9, span: 2 },
      },
    ],
    openInFormations: ['f_corridor'],
    sites: [
      { ...SITES.bastionTavrov, formation: 'f_hq' },
      { ...SITES.lanceOutbound, formation: 'f_corridor' },
      { ...SITES.lanceCity, formation: 'f_city' },
      { ...SITES.thistleField, formation: 'f_city' },
      { ...SITES.hammerPalace, formation: 'f_city' },
    ],
    radars: [
      { type: 'ewr', pos: { x: 88, y: 96 }, on: true },
      { type: 'gapfiller', pos: { x: 148, y: 4 }, on: true },
    ],
    waves: [
      /*
       * The first flight, crossing the frontier north of the city while the
       * aircraft they came for is still on the ground. They hold north of
       * Mostrograd until it rolls, which gives the operator four minutes of
       * knowing exactly what is about to happen and being unable to start it.
       *
       * Four, and the same at the far end — eight fighters carrying one
       * shorter-legged round each rather than four carrying a long one. The
       * arithmetic against a defence that does nothing is unchanged; what
       * changes is that stopping fighters now subtracts something. See
       * AIR_TYPES.interceptor for the six-row ladder that set the count and
       * the kill probability together.
       *
       * They went from three a flight to four when the priority of fires above
       * took COL. STRELNIK off the corridor: with the fighters facing only the
       * batteries the operator actually commands, six of them left a competent
       * net seat holding 32 of 32. Thirty-two seeds at eight and 0.33: net
       * nothing 25%, novice 28%, competent 63%, expert 75%.
       */
      { atS: 20, type: 'interceptor', count: 4, spacingKm: 16, scalable: false,
        pos: { x: 150, y: 142 }, waypoints: [{ x: 150, y: 100 }] },

      /*
       * STATE 01. It rolls at four minutes, climbs at sixty metres a second and
       * flies the filed route — south-east down the Tavrov corridor and out.
       * It is friendly, it is identified as friendly, and no doctrine in the
       * game will ever engage it on its own.
       */
      { atS: 60, type: 'vip', count: 1, scalable: false,
        pos: { x: 112, y: 40 }, altM: 300, name: 'STATE 01',
        waypoints: [{ x: 150, y: 10 }, { x: 195, y: -40 }] },

      /*
       * The other thing asking for your rounds. The strike package is for the
       * palace and the field, not for the corridor, and every round spent on it
       * is a round that is not available eighty kilometres to the south-east
       * four minutes later.
       */
      /*
       * FOUR at the palace, not three, and the reason is the curve rather than
       * the corridor.
       *
       * This watch's verdict is the aeroplane and nothing else — no leaker
       * allowance can touch it — so its difficulty lives entirely in how many
       * rounds the city takes off the corridor. At three it was the easiest
       * watch of the last two acts: sixteen seeds, competent play brought
       * STATE 01 out on 88 per cent of nights against the district watches'
       * 69, so the campaign got easier at exactly the point it is supposed to
       * be hardest. At four it is 62 per cent, which is the bottom of the
       * band and the bottom of the campaign, which is where the sealed watch
       * belongs.
       *
       * A fourth FIGHTER at the far end of the corridor was tried first and
       * answered the wrong question while the colonel was still covering the
       * corridor for free; with the corridor handed back to the operator it is
       * the whole of this watch's difficulty and both flights carry one. A
       * fifth striker
       * over Mostrograd was tried too and took the competent seat to 50 per
       * cent, under the floor. One more aeroplane over the city is the same
       * pressure arriving where the brief puts it.
       *
       * AND THIS WATCH IS QUOTED AT SIXTEEN SEEDS FOR A REASON. Its verdict is
       * one binary event, so eight seeds can only report it in twelve-and-a-
       * half point steps and the same build reads 50 per cent on the first
       * eight seeds and 62 on sixteen. The README's table says which.
       */
      { atS: 0, type: 'striker', count: 4, bearingDeg: 340, spreadDeg: 26, spacingS: 20,
        distanceKm: 100, altM: 6100, targetAssetId: 'a_palace' },
      { atS: 60, type: 'cruise', count: 3, bearingDeg: 355, spreadDeg: 22, spacingS: 14,
        distanceKm: 95, altM: 90, targetAssetId: 'a_airport' },

      /*
       * Suppression, aimed at the sets holding the corridor. Blinking keeps the
       * radar; it also drops every round in the air between here and the
       * fighters, and the fighters do not need a radar of yours to work.
       */
      { atS: 30, type: 'sead', count: 2, bearingDeg: 350, spreadDeg: 34, spacingS: 26,
        distanceKm: 150, scalable: false },

      /*
       * The second flight, from the north-east, timed for the far end of the
       * corridor where one battalion's coverage runs out and the reloads have
       * not come back yet.
       */
      { atS: 290, type: 'interceptor', count: 4, spacingKm: 16, scalable: false,
        pos: { x: 196, y: 40 }, waypoints: [{ x: 186, y: -6 }] },
    ],
  },
];

export const scenarioById = (id) => SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0];

/** The watch the campaign is built toward. */
export const FINALE_ID = 'two-cities';
export const isFinale = (scenario) => scenario?.id === FINALE_ID;

/** The conditional watch after it. */
export const EPILOGUE_ID = 'presidents-flight';
export const isEpilogue = (scenario) => scenario?.id === EPILOGUE_ID;

/**
 * Is this watch on the roster yet?
 *
 * Two gates. The first is the appointment: a battalion commander is not handed
 * a district, and the campaign is a promotion, so an echelon opens once every
 * watch below it has been stood — on progress, not on marks, because a service
 * that stopped promoting people for a bad night would have nobody left.
 *
 * The second gate applies to exactly one scenario and is about what you did
 * rather than how well you did it: the aircraft only leaves Demobodedovo in a
 * version of events where the palace was still standing to leave from.
 */
export function isUnlocked(scenario, campaign) {
  if (scenario?.requiresEnding) {
    /*
     * The flight needs a palace that was still standing to leave from — a fact
     * about the building, not about which finding the review reached. Records
     * that carry the fact are gated on it (so a divided night that held both
     * cities still opens the watch); older records fall back to the ending
     * list they were saved with.
     */
    const facts = campaign?.endingFacts;
    const unlocked = facts
      ? !!facts.palaceHeld
      : scenario.requiresEnding.includes(campaign?.ending);
    if (!unlocked) return false;
  }
  return withinAppointment(scenario, campaign, SCENARIOS);
}

/** The appointment this record currently holds. */
export const appointmentOf = (campaign) => reachedEchelon(campaign, SCENARIOS);

/** Every watch fought at one echelon, in campaign order. */
export const watchesAt = (echelonId) => SCENARIOS.filter((s) => s.echelon === echelonId);

/** The watches a given campaign may actually select. */
export const rosterFor = (campaign) => SCENARIOS.filter((s) => isUnlocked(s, campaign));

/**
 * Does anything in this raid hunt the antenna, or the ground it stands on?
 *
 * The console carries two controls for that question and only that question:
 * the ЗАСВЕТКА · ELINT EXPOSURE gauge, which reads how much of your emissions
 * somebody has collected, and DISPLACE, which is the only verb that empties
 * the grid reference they collected it at. On Solo Battery neither means
 * anything — not one of the sixteen aircraft in that raid carries an
 * anti-radiation round, so `armsLeft` is nought for every one of them, the
 * INBOUND ARM lamp never lights, and the gauge sat pinned at 100% in red from
 * the four-minute mark of three hand-played watches with nothing behind it. A
 * gauge that is always red is a decoration, and a button whose whole purpose
 * is to answer a threat that does not exist is a trap: it costs a battalion
 * three and a half minutes off the air.
 *
 * First Light already hides both behind `basicConsole`, with a comment saying
 * the exposure gauge belongs to watches where somebody shoots back. This asks
 * the raid table instead of asking the scenario to remember.
 */
export function raidHuntsRadars(scenario) {
  return (scenario?.waves ?? []).some((wave) => (AIR_TYPES[wave.type]?.arms ?? 0) > 0);
}

/**
 * ...and the other half of the same question: is the POSITION the objective?
 *
 * DISPLACE answers two threats, not one. The second is a hostile tracking
 * toward something that packs up and drives out with the battery — the forward
 * post on the finale — and on that watch one displacement is the difference
 * between a scripted overrun and a watch held. A scenario with no such asset
 * and no anti-radiation round in its raid has nothing for the button to do.
 */
export function positionCanBeHunted(scenario) {
  return raidHuntsRadars(scenario)
    || (scenario?.assets ?? []).some((asset) => asset.follows);
}

/**
 * Which of the console's optional controls this watch actually fits.
 *
 * One answer, read by all three places that have to agree about it: the cap on
 * the battery card (`panels.js`), the line on the CONTROLS screen
 * (`screens.js`), and the key binding (`app.js`). They used to each ask the
 * question their own way, and they drifted: First Light stripped SALVO, RIDE
 * and DISPLACE off the card and off the help page, and left S, G and X live on
 * the keyboard — so a learner who fat-fingered X put their only long-range
 * battery on the road for two hundred and ten seconds, with no cap on screen to
 * explain it and no entry in the handbook to find.
 *
 * A control that has been removed is removed everywhere: the binding, the
 * button and the help entry go together.
 */
export function consoleCaps(scenario) {
  const basic = !!scenario?.basicConsole;
  return {
    /** Rounds per engagement. Off on the teaching console. */
    salvo: !basic,
    /** Hold the beam through guidance with an ARM inbound. */
    ride: !basic,
    /** Pack up and drive. Only where something is hunting the position. */
    displace: !basic && positionCanBeHunted(scenario),
    /** The ELINT gauge, which needs somebody listening for it. */
    exposure: !basic && raidHuntsRadars(scenario),
  };
}
