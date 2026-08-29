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
};

const RADARS = {
  ewrNorth: { type: 'ewr', pos: { x: 3, y: 46 }, on: true },
  gapSouth: { type: 'gapfiller', pos: { x: -28, y: -18 }, on: true },
};

/** A civil airliner crossing the sector, oblivious. */
const civilTransit = (atS) => ({
  atS, type: 'civil', count: 1, scalable: false,
  bearingDeg: 290, distanceKm: 200, altM: 10200,
  name: 'TRANSIT 118',
  waypoints: [{ x: 40, y: -60 }, { x: 180, y: -150 }],
});

export const SCENARIOS = [
  {
    id: 'first-light',
    name: 'First Light',
    subtitle: 'Four contacts, high and unhurried. Learn the scope.',
    theme: 'crt-green',
    roles: ['net', 'crew', 'both'],
    seed: 'first-light-01',
    leakerTolerance: 1,
    playerBatteryId: 's_lance_w',
    brief: [
      'Four contacts crossed the border at height, tracking south. They are not trying to hide.',
      'Bring a radar up, sort the picture, and hand each track to a battery that can reach it.',
      'Nothing is shooting back at you tonight. Enjoy that.',
    ],
    teaches: 'Tracking, assignment, and the fact that a radar has to be radiating to see.',
    assets: [GROUND.town, GROUND.c2, GROUND.airbase, GROUND.power],
    sites: [SITES.bastion, SITES.lanceWest, SITES.thistleTown],
    radars: [RADARS.ewrNorth],
    waves: [
      { atS: 20, type: 'striker', count: 4, bearingDeg: 355, spreadDeg: 26, spacingS: 22, altM: 7600 },
    ],
  },

  {
    id: 'low-riders',
    name: 'Low Riders',
    subtitle: 'They have read the same horizon tables you have.',
    theme: 'crt-green',
    roles: ['net', 'crew', 'both'],
    seed: 'low-riders-04',
    leakerTolerance: 2,
    playerBatteryId: 's_thistle_t',
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
    ],
  },

  {
    id: 'solo-battery',
    name: 'Solo Battery',
    subtitle: 'One battery, one crew, one radar. Yours.',
    theme: 'crt-green',
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
    waves: [
      { atS: 25, type: 'striker', count: 3, bearingDeg: 40, spreadDeg: 22, spacingS: 34, altM: 6800 },
      { atS: 180, type: 'striker', count: 3, bearingDeg: 70, spreadDeg: 26, spacingS: 30, altM: 250 },
      { atS: 330, type: 'cruise', count: 3, bearingDeg: 55, spreadDeg: 30, spacingS: 12, altM: 90 },
    ],
  },

  {
    id: 'weasel-hour',
    name: 'Weasel Hour',
    subtitle: 'Something out there is listening for you.',
    theme: 'crt-amber',
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
    assets: [GROUND.town, GROUND.c2, GROUND.airbase, GROUND.power, GROUND.depot, GROUND.bridge],
    sites: [SITES.bastion, SITES.lanceWest, SITES.lanceEast, SITES.thistleTown, SITES.hammer],
    radars: [RADARS.ewrNorth, RADARS.gapSouth],
    waves: [
      { atS: 10, type: 'jammer', count: 2, bearingDeg: 0, spreadDeg: 70, spacingS: 20, distanceKm: 175, scalable: false },
      { atS: 110, type: 'decoy', count: 6, bearingDeg: 350, spreadDeg: 40, spacingS: 14, altM: 5200 },
      { atS: 170, type: 'striker', count: 5, bearingDeg: 10, spreadDeg: 34, spacingS: 22, altM: 5600 },
      civilTransit(240),
      { atS: 330, type: 'decoy', count: 4, bearingDeg: 20, spreadDeg: 30, spacingS: 12, altM: 4800 },
      { atS: 380, type: 'striker', count: 4, bearingDeg: 340, spreadDeg: 28, spacingS: 20, altM: 180 },
    ],
  },

  {
    id: 'economy-of-force',
    name: 'Economy of Force',
    subtitle: 'There are rounds on the rails. You have been told what they are for.',
    theme: 'crt-amber',
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
      { atS: 150, type: 'striker', count: 3, bearingDeg: 288, spreadDeg: 14, spacingS: 24, altM: 5400,
        targetAssetId: 'a_hospital' },
      { atS: 195, type: 'striker', count: 3, bearingDeg: 20, spreadDeg: 20, spacingS: 24, altM: 260,
        targetAssetId: 'a_power' },
      { atS: 330, type: 'striker', count: 2, bearingDeg: 292, spreadDeg: 14, spacingS: 20, altM: 180,
        targetAssetId: 'a_hospital' },
    ],
  },

  {
    id: 'across-the-line',
    name: 'Across the Line',
    subtitle: 'A round has gone wrong, and it is going to come down somewhere that is not our concern.',
    theme: 'crt-amber',
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
    roles: ['net', 'crew', 'both'],
    seed: 'ville-under-fire-11',
    /** The political section has an interest in tonight's scheduled transit. */
    civilOrder: true,
    leakerTolerance: 4,
    playerBatteryId: 's_thistle_t',
    roundAllowance: 30,
    brief: [
      'This is the main effort. Suppression first, then jamming, then decoys, then everything they have.',
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

  {
    id: 'two-cities',
    name: 'The Two Cities',
    subtitle: 'Two raids, one sector, and an order about which one matters.',
    theme: 'ops-modern',
    roles: ['net', 'crew', 'both'],
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
        + ' nothing more. Nine aircraft on each axis. Every strike aircraft carries two weapons.',
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
    },
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
    sites: [
      SITES.bastionCentre,
      SITES.lanceVille, SITES.lanceCapital,
      SITES.thistleVille, SITES.thistlePalace,
      SITES.hammer, SITES.hammerCapital,
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
      { atS: 110, type: 'striker', count: 4, bearingDeg: 25, spreadDeg: 22, spacingS: 20, altM: 6400,
        targetAssetId: 'a_palace' },
      { atS: 250, type: 'cruise', count: 3, bearingDeg: 30, spreadDeg: 20, spacingS: 14, altM: 90,
        targetAssetId: 'a_palace' },

      /*
       * Western axis: the valley, and the village in it. Deliberately smaller
       * than the northern one and spread over four minutes, so a battery
       * committed to the Ville can cycle its channels and genuinely hold —
       * the choice has to be a choice, not a foregone loss dressed up as one.
       */
      { atS: 175, type: 'striker', count: 3, bearingDeg: 285, spreadDeg: 24, spacingS: 26, altM: 5800,
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
      { atS: 210, type: 'striker', count: 3, bearingDeg: 60, spreadDeg: 18, spacingS: 20, altM: 4200,
        targetAssetId: 'a_post', scalable: false },
    ],
  },
];

export const scenarioById = (id) => SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0];

/** The watch the campaign is built toward. */
export const FINALE_ID = 'two-cities';
export const isFinale = (scenario) => scenario?.id === FINALE_ID;
