import { reachedEchelon, withinAppointment } from './echelon.js';

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
    /*
     * The brief promises "a radar has to be radiating to see", and then the
     * early-warning set used to come up lit and the lesson never happened.
     * WIDE EYE starts cold; the net talks the player to the switch; and if
     * nobody touches it, sector brings the set up remotely at one minute —
     * a safety, logged as exactly what it is.
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
    chatter: [
      { atS: 12, text: 'WIDE EYE REPORTS READY. THE SET IS NOT RADIATING — NOTHING WILL PAINT UNTIL IT IS.' },
      { atS: 30, text: 'THE RADIATE SWITCH IS ON THE RIGHT PANEL, UNDER WIDE EYE. THE BORDER POSTS CAN HEAR THEM COMING.' },
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
    waves: [
      { atS: 20, type: 'striker', count: 4, bearingDeg: 355, spreadDeg: 26, spacingS: 22, altM: 7600 },
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
    leakerTolerance: 2,
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
    brief: [
      'Second wave came in at height. This one will not.',
      'A radar on a thirty-metre mast sees a target at one hundred metres for about sixty kilometres, and',
      'not one metre further. You will get very little warning. Put the short-range sections where it matters.',
    ],
    teaches: 'Radar horizon. Low contacts appear close and stay close.',
    assets: [GROUND.town, GROUND.c2, GROUND.airbase, GROUND.power, GROUND.bridge],
    sites: [SITES.bastion, SITES.lanceWest, SITES.lanceEast, SITES.thistleTown, SITES.hammer],
    radars: [RADARS.ewrNorth, RADARS.gapSouth],
    waves: [
      { atS: 15, type: 'striker', count: 2, bearingDeg: 350, spreadDeg: 20, spacingS: 30, altM: 7200 },
      { atS: 90, type: 'striker', count: 5, bearingDeg: 20, spreadDeg: 34, spacingS: 26, altM: 130 },
      { atS: 260, type: 'striker', count: 3, bearingDeg: 330, spreadDeg: 18, spacingS: 24, altM: 110 },

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
      { atS: 255, type: 'cruise', count: 3, bearingDeg: 15, spreadDeg: 20, spacingS: 10, altM: 55,
        distanceKm: 95, targetAssetId: 'a_c2' },
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
    leakerTolerance: 2,
    playerBatteryId: 's_lance_e',
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
     * Do not add a fourth wave to fill the back half. It was tried three ways:
     * two more strikers takes the watch from 5/6 held to 0/6, two more cruise
     * to 3/6, and neither closes the quiet stretches. One battery with two
     * channels has a hard ceiling on what it can absorb, and that ceiling —
     * not the wave table — is what makes this watch what it is.
     */
    waves: [
      { atS: 25, type: 'striker', count: 3, bearingDeg: 40, spreadDeg: 22, spacingS: 34, altM: 6800,
        distanceKm: 70 },
      { atS: 180, type: 'striker', count: 3, bearingDeg: 70, spreadDeg: 26, spacingS: 30, altM: 250,
        distanceKm: 80 },
      { atS: 330, type: 'cruise', count: 3, bearingDeg: 55, spreadDeg: 30, spacingS: 12, altM: 90,
        distanceKm: 85 },
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
    leakerTolerance: 2,
    playerBatteryId: 's_bastion',
    roundAllowance: 18,
    brief: [
      'Suppression aircraft are working the sector. They need roughly twelve seconds of your emissions to',
      'build a firing solution, and they carry two rounds each.',
      'Sector command will order you to keep radiating. Sector command is not the one being shot at.',
    ],
    teaches: 'Emissions control: blink to survive, and pay for it in guidance.',
    assets: [GROUND.town, GROUND.c2, GROUND.airbase, GROUND.power, GROUND.bridge],
    sites: [SITES.bastion, SITES.lanceWest, SITES.lanceEast, SITES.thistleTown],
    radars: [RADARS.ewrNorth, RADARS.gapSouth],
    waves: [
      { atS: 20, type: 'sead', count: 2, bearingDeg: 5, spreadDeg: 40, spacingS: 45, distanceKm: 165 },
      { atS: 120, type: 'striker', count: 4, bearingDeg: 350, spreadDeg: 30, spacingS: 28, altM: 6400 },
      { atS: 300, type: 'sead', count: 1, bearingDeg: 330, spacingS: 0, distanceKm: 160 },
      { atS: 340, type: 'striker', count: 3, bearingDeg: 15, spreadDeg: 24, spacingS: 26, altM: 200 },
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
    leakerTolerance: 3,
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
     * The longest routine silence in the campaign used to sit right here —
     * seventy-five to eighty-five seconds of one slow contact and nothing
     * else, between first paint and the decoy stream. The net talks through
     * it, because a sector EW picture filling with noise is not actually a
     * quiet room.
     */
    chatter: [
      { atS: 52, text: 'WIDE EYE HOLDS ONE CONTACT, SLOW, NOT CLOSING. NOTHING BEHIND IT YET.' },
      { atS: 86, text: 'EW PICKET REPORTS SWEEP JAMMING RISING ON THE NORTHERN BEARINGS. EXPECT A DIRTY PICTURE.' },
    ],
    assets: [GROUND.town, GROUND.c2, GROUND.airbase, GROUND.power, GROUND.depot, GROUND.bridge],
    sites: [SITES.bastion, SITES.lanceWest, SITES.lanceEast, SITES.thistleTown, SITES.hammer],
    radars: [RADARS.ewrNorth, RADARS.gapSouth],
    waves: [
      { atS: 10, type: 'jammer', count: 2, bearingDeg: 0, spreadDeg: 70, spacingS: 20, distanceKm: 175, scalable: false },
      { atS: 70, type: 'decoy', count: 6, bearingDeg: 350, spreadDeg: 40, spacingS: 14, altM: 5200 },
      { atS: 130, type: 'striker', count: 5, bearingDeg: 10, spreadDeg: 34, spacingS: 22, altM: 5600 },
      civilTransit(240),
      { atS: 300, type: 'decoy', count: 4, bearingDeg: 20, spreadDeg: 30, spacingS: 12, altM: 4800 },
      { atS: 355, type: 'striker', count: 4, bearingDeg: 340, spreadDeg: 28, spacingS: 20, altM: 180 },
      /*
       * And a late package, because the back half had nothing in it.
       * Measured: the last spawn used to land at forty per cent of the
       * watch, and the remaining eight minutes ran at four to eight events a
       * minute with no rounds in the air — the raid was decided long before
       * the watch admitted it. This one arrives with the allocation nearly
       * spent, which is the ammunition lesson arriving as a raid instead of
       * as a number in the debrief.
       */
      { atS: 470, type: 'striker', count: 3, bearingDeg: 5, spreadDeg: 26, spacingS: 18, altM: 5200 },
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
    leakerTolerance: 3,
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
        targetAssetId: 'a_power' },
      // Same deck as the first package: at 180 m the covering battery's
      // low-altitude penalty stacked with evasion into a tail that a
      // deliberate westward watch could not actually kill — measured, the
      // defence lost the building three nights in eight with rounds to spare.
      // The freeze, not the physics, is meant to be what loses the hospital.
      { atS: 330, type: 'striker', count: 2, bearingDeg: 292, spreadDeg: 14, spacingS: 20, altM: 320,
        targetAssetId: 'a_hospital' },
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
    leakerTolerance: 2,
    playerBatteryId: 's_lance_w',
    roundAllowance: 14,
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
      // The stray. It comes in on the northern axis with the rest and then turns
      // west, which is why it reads as an ordinary contact until it does not.
      { atS: 120, type: 'cruise', count: 1, bearingDeg: 340, spreadDeg: 0, altM: 110,
        targetAssetId: 'a_camp', scalable: false, name: 'VAMPIRE STRAY' },
      { atS: 240, type: 'striker', count: 3, bearingDeg: 15, spreadDeg: 22, spacingS: 24, altM: 240,
        targetAssetId: 'a_bridge' },
      // A second one goes the same way later. By then you have already decided
      // what you are, and the only question is whether you do it twice.
      { atS: 330, type: 'cruise', count: 1, bearingDeg: 345, spreadDeg: 0, altM: 95,
        targetAssetId: 'a_camp', scalable: false, name: 'VAMPIRE STRAY 2' },
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
    leakerTolerance: 4,
    playerBatteryId: 's_thistle_t',
    roundAllowance: 30,
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
    waves: [
      { atS: 15, type: 'sead', count: 2, bearingDeg: 355, spreadDeg: 50, spacingS: 30, distanceKm: 165 },
      { atS: 60, type: 'jammer', count: 2, bearingDeg: 10, spreadDeg: 60, spacingS: 25, distanceKm: 180, scalable: false },
      { atS: 130, type: 'decoy', count: 5, bearingDeg: 0, spreadDeg: 44, spacingS: 12, altM: 5000 },
      { atS: 165, type: 'striker', count: 5, bearingDeg: 345, spreadDeg: 30, spacingS: 18, altM: 6200,
        targetAssetId: 'a_c2' },
      civilTransit(210),
      { atS: 250, type: 'cruise', count: 8, bearingDeg: 20, spreadDeg: 46, spacingS: 8, altM: 85 },
      { atS: 300, type: 'sead', count: 2, bearingDeg: 30, spreadDeg: 30, spacingS: 20, distanceKm: 160 },
      { atS: 360, type: 'striker', count: 5, bearingDeg: 5, spreadDeg: 40, spacingS: 16, altM: 160 },
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
    leakerTolerance: 8,
    playerBatteryId: 's_bastion_d',
    roundAllowance: 40,
    centre: { x: 4, y: 6 },
    scopeRangeKm: 260,
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
    formations: DISTRICT_FORMATIONS,
    /** You open holding the valley and the district battalion. The rest are on their own. */
    openInFormations: ['f_ville'],
    sites: Object.values(DISTRICT_SITES),
    radars: DISTRICT_RADARS,
    waves: [
      // Lozan, first and heaviest — it is nearest the frontier and it always is.
      { atS: 25, type: 'sead', count: 2, bearingDeg: 20, spreadDeg: 30, spacingS: 24, distanceKm: 165 },
      { atS: 70, type: 'striker', count: 5, bearingDeg: 15, spreadDeg: 24, spacingS: 18, altM: 6200,
        distanceKm: 145, targetAssetId: 'a_lozan_power' },
      { atS: 210, type: 'cruise', count: 4, bearingDeg: 22, spreadDeg: 26, spacingS: 14, altM: 90,
        distanceKm: 145, targetAssetId: 'a_lozan' },

      // Kubin, second, and from a bearing the western gapfiller is poor against.
      { atS: 120, type: 'striker', count: 4, bearingDeg: 300, spreadDeg: 26, spacingS: 20, altM: 5600,
        distanceKm: 145, targetAssetId: 'a_kubin_depot' },
      { atS: 265, type: 'striker', count: 4, bearingDeg: 288, spreadDeg: 22, spacingS: 18, altM: 170,
        distanceKm: 145, targetAssetId: 'a_kubin' },

      // And the valley, which is small, and which you will want to take anyway.
      { atS: 175, type: 'striker', count: 3, bearingDeg: 345, spreadDeg: 24, spacingS: 22, altM: 5200,
        distanceKm: 140, targetAssetId: 'a_bridge' },
      { atS: 320, type: 'cruise', count: 3, bearingDeg: 350, spreadDeg: 24, spacingS: 16, altM: 85,
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
       */
      { atS: 430, type: 'striker', count: 3, bearingDeg: 162, spreadDeg: 20, spacingS: 20, altM: 4800,
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
    leakerTolerance: 9,
    playerBatteryId: 's_bastion_d',
    roundAllowance: 36,
    centre: { x: 4, y: 6 },
    scopeRangeKm: 260,
    /** The hinge: the ministry wants your battalion. */
    withdrawalOrder: true,
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
      { atS: 315, type: 'striker', count: 4, bearingDeg: 12, spreadDeg: 24, spacingS: 18, altM: 5400,
        distanceKm: 145, targetAssetId: 'a_lozan_power' },
      { atS: 380, type: 'striker', count: 3, bearingDeg: 348, spreadDeg: 22, spacingS: 22, altM: 5000,
        distanceKm: 140, targetAssetId: 'a_c2' },
      // Brasov again, and on this watch it is the sector the withdrawn
      // battalion used to reach. See the note on the district watch.
      { atS: 455, type: 'striker', count: 3, bearingDeg: 165, spreadDeg: 20, spacingS: 20, altM: 4600,
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
    leakerTolerance: 6,
    playerBatteryId: 's_bastion',
    roundAllowance: 26,
    /**
     * The depots are committed to the capital. There is no resupply and the
     * rails are short, which is what turns "defend both" from a matter of
     * attention into a matter of arithmetic.
     */
    supply: { roundsMult: 1, reloadsAllowed: false },
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
        + ' depots are committed to the capital — so every battery fights with what is on its rails and'
        + ' nothing more. Nine aircraft on each axis, and six more for this post. Every strike aircraft'
        + ' carries two weapons.',
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
        commander: { name: 'CAPT. RADU', tm: 'КАПИТАН РАДУ', competence: 0.85 },
      },
      {
        id: 'f_capital', name: 'CAPITAL SECTOR', tm: 'СЕКТОР СТОЛИЦЫ', en: 'Capital sector',
        pos: { x: 104, y: 68 }, posture: 'tight',
        // He will hold the palace beautifully and let the valley burn, and he
        // will be right, in the only sense the word is used in this service.
        commander: { name: 'COL. STRELNIK', tm: 'ПОЛКОВНИК СТРЕЛЬНИК', competence: 1.0, political: true },
      },
    ],
    openInFormations: ['f_valley'],
    sites: [
      { ...SITES.bastionCentre, formation: 'f_hq' },
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
       * Nine aircraft a side is the number the whole watch is balanced on: a
       * committed defence with everything on one side's rails can just about
       * stop nine, and cannot come close to stopping eighteen. Remember that a
       * strike aircraft carries two weapons, so nine aircraft is closer to
       * fifteen impacts than to nine.
       */
      { atS: 70, type: 'striker', count: 5, bearingDeg: 25, spreadDeg: 22, spacingS: 20, altM: 6400,
        targetAssetId: 'a_palace' },
      { atS: 250, type: 'cruise', count: 4, bearingDeg: 30, spreadDeg: 20, spacingS: 14, altM: 90,
        targetAssetId: 'a_palace' },

      /*
       * Western axis: the valley, and the village in it. Deliberately smaller
       * than the northern one and spread over four minutes, so a battery
       * committed to the Ville can cycle its channels and genuinely hold —
       * the choice has to be a choice, not a foregone loss dressed up as one.
       */
      { atS: 175, type: 'striker', count: 4, bearingDeg: 285, spreadDeg: 24, spacingS: 26, altM: 5800,
        targetAssetId: 'a_town' },
      { atS: 295, type: 'cruise', count: 3, bearingDeg: 292, spreadDeg: 26, spacingS: 18, altM: 85,
        targetAssetId: 'a_town' },
      { atS: 415, type: 'striker', count: 2, bearingDeg: 300, spreadDeg: 22, spacingS: 24, altM: 160,
        targetAssetId: 'a_town' },

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
      { atS: 90, type: 'sead', count: 2, bearingDeg: 55, spreadDeg: 20, spacingS: 24, distanceKm: 160,
        scalable: false },
      { atS: 210, type: 'striker', count: 4, bearingDeg: 60, spreadDeg: 18, spacingS: 20, altM: 4200,
        targetAssetId: 'a_post', scalable: false },
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
      'Two pairs of enemy fighters are already airborne to the north. They are not interested in the'
        + ' palace, the city, or you. They are interested in one aeroplane, and they carry two rounds each.',
      'There is also a strike package coming for the palace and the field, and you have one battalion'
        + ' that can cover the corridor. It cannot cover the corridor and the city at the same time.',
      'STATE 01 will be on your scope, identified, for eight minutes.',
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
        commander: { name: 'COL. STRELNIK', tm: 'ПОЛКОВНИК СТРЕЛЬНИК', competence: 1.0, political: true },
      },
      {
        id: 'f_corridor', name: 'TAVROV SECTION', tm: 'ТАВРОВСКИЙ УЧАСТОК', en: 'Tavrov section',
        pos: { x: 160, y: -20 }, posture: 'free',
        commander: { name: 'CAPT. VOLOH', tm: 'КАПИТАН ВОЛОХ', competence: 0.9 },
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
       * The first pair, crossing the frontier north of the city while the
       * aircraft they came for is still on the ground. They hold north of
       * Mostrograd until it rolls, which gives the operator four minutes of
       * knowing exactly what is about to happen and being unable to start it.
       */
      { atS: 20, type: 'interceptor', count: 2, spacingKm: 16, scalable: false,
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
      { atS: 0, type: 'striker', count: 3, bearingDeg: 340, spreadDeg: 26, spacingS: 20,
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
       * The second pair, from the north-east, timed for the far end of the
       * corridor where one battalion's coverage runs out and the reloads have
       * not come back yet.
       */
      { atS: 290, type: 'interceptor', count: 2, spacingKm: 16, scalable: false,
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
