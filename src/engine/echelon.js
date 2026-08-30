/**
 * How far up you can see, and how little of it you can touch.
 *
 * The campaign is a promotion. You begin commanding a battalion — four
 * batteries in one valley, every one of them yours to point personally — and
 * you end commanding the air defence of a country. The equipment does not
 * change. What changes is the *kind of decision* you are making, and every
 * promotion takes something away from you:
 *
 *   BATTALION   which battery shoots this track
 *   SECTOR      which tracks are worth a round at all
 *   REGION      which sector you are standing in, because you cannot be in two
 *   NATIONAL    which region is allowed to be defended
 *
 * The mechanism is `directLimit`: the number of subordinate formations a
 * commander at this level may hold under their own hand at once. At battalion
 * and sector there is one formation and it is yours, so those watches play
 * exactly as they always did. At district and national command there are
 * several, you may hold one or two, and everything else fights on the standing
 * order you left it with. Taking a formation costs a handover — seconds in
 * which nobody is commanding it at all — so changing your mind is not free.
 *
 * That is the whole argument of the promotion. The higher you go, the more of
 * the war you are responsible for and the less of it you are permitted to do
 * anything about; and the last appointment in the game is the one where the
 * only thing left to decide is which place is allowed to survive.
 */

/** Ordered from the smallest command to the largest. */
export const ECHELONS = {
  battalion: {
    id: 'battalion',
    order: 0,
    tm: 'ДИВИЗИОН',
    en: 'Battalion',
    appointment: { tm: 'КОМАНДИР ДИВИЗИОНА', en: 'Battalion commander' },
    short: 'BN',
    /** Everything on the board is yours, personally. */
    directLimit: Infinity,
    handoverS: 0,
    /*
     * A hundred and forty, not a hundred, because a battalion holding a
     * long-range battery reaches a hundred and twenty and its early-warning
     * set sees a hundred and fifty. At a hundred the tube was smaller than the
     * battalion's own envelope, and the consequence was a reward inversion
     * nobody would have predicted: measured on the teaching watch, a player
     * who hands every contact to a battery the moment it goes firm kills or
     * turns back all four beyond the rim, and sees an aircraft drawn on their
     * radar screen for ONE PER CENT of the watch. Playing well emptied the
     * screen. A spectator, whose contacts fly all the way in, saw them 80% of
     * the time. The scope has to be at least as big as the fight it is for.
     */
    scopeRangeKm: 140,
    /** Rounds you may release that nobody below you can. */
    reserveRounds: 0,
    /** The rank the appointment carries; you are gazetted to it on taking it. */
    rankFloor: 'jlt',
    /** Seats this appointment may be played from. */
    roles: ['net', 'crew', 'both'],
    blurb: 'Four batteries in one valley. Every one of them is yours to point.',
    teaches: 'The engagement itself: see it, hand it to something that can reach it, watch the round.',
  },

  sector: {
    id: 'sector',
    order: 1,
    tm: 'СЕКТОР',
    en: 'Sector',
    appointment: { tm: 'НАЧАЛЬНИК СЕКТОРА', en: 'Sector commander' },
    short: 'SEC',
    directLimit: Infinity,
    handoverS: 0,
    scopeRangeKm: 150,
    reserveRounds: 0,
    rankFloor: 'slt',
    roles: ['net', 'crew', 'both'],
    blurb: 'A sector, its radars, and more contacts than you have rounds.',
    teaches: 'Triage, emissions discipline, and the fact that the centre holding your picture together is a building somebody can bomb.',
  },

  region: {
    id: 'region',
    order: 2,
    tm: 'ОКРУГ ПВО',
    en: 'Air Defence District',
    appointment: { tm: 'КОМАНДУЮЩИЙ ОКРУГОМ', en: 'District commander' },
    short: 'DIST',
    /**
     * Two. There are four sectors under you and you may stand in two of them.
     * The other two fight on whatever you told them before you left.
     */
    directLimit: 2,
    handoverS: 18,
    scopeRangeKm: 260,
    reserveRounds: 0,
    rankFloor: 'major',
    /*
     * No console. A district commander does not sit in a launcher, and losing
     * the seat is part of what the promotion costs: from here on you fight
     * entirely through other people's hands.
     */
    roles: ['net'],
    blurb: 'Four sectors, three hundred kilometres, and one of you.',
    teaches: 'That a standing order given to somebody you cannot see is a real weapon, and usually the only one you have.',
  },

  national: {
    id: 'national',
    order: 3,
    tm: 'ГЛАВНЫЙ ШТАБ ПВО',
    en: 'National Air Defence Command',
    appointment: { tm: 'НАЧАЛЬНИК ГЛАВНОГО ШТАБА', en: 'Chief of Air Defence' },
    short: 'NAT',
    /** One. The country is yours and you may be in one place in it. */
    directLimit: 1,
    handoverS: 26,
    scopeRangeKm: 300,
    /**
     * The rounds nobody below you can release. It is not much — it was never
     * much — and where it goes is the only question this appointment really
     * asks. The ministry has opinions about where it goes.
     */
    reserveRounds: 16,
    rankFloor: 'majgen',
    /*
     * The net, or the net and your own headquarters battalion's console — which
     * on the last watch is the battery sitting in the room you are sitting in.
     */
    roles: ['net', 'both'],
    blurb: 'The whole country, one seat, and a reserve that will not cover two of anything.',
    teaches: 'That the schedule of defended places was always a schedule of people, and that you sign it now.',
  },
};

export const ECHELON_ORDER = Object.values(ECHELONS).sort((a, b) => a.order - b.order);

export const echelonOf = (id) => ECHELONS[id] ?? ECHELONS.battalion;

/** The echelon a scenario is fought at. Watches that predate the field default down. */
export const echelonForScenario = (scenario) => echelonOf(scenario?.echelon ?? 'sector');

/**
 * How high this record has been appointed.
 *
 * An echelon opens when every watch below it has been stood at least once —
 * progress, not marks. A commander who did badly at sector command is still
 * promoted to district command, because that is how this service works and
 * because a campaign that locks you out of its second half for a bad night is
 * a campaign nobody finishes.
 */
export function reachedEchelon(campaign, scenarios) {
  let reached = ECHELONS.battalion;
  for (const echelon of ECHELON_ORDER) {
    if (echelon.order === 0) continue;
    const below = scenarios.filter((s) => (s.echelon ?? 'sector') === ECHELON_ORDER[echelon.order - 1].id);
    const allStood = below.length > 0 && below.every((s) => campaign?.completed?.[s.id]);
    if (!allStood) break;
    reached = echelon;
  }
  return reached;
}

/** Is this watch at or below the appointment this record holds? */
export function withinAppointment(scenario, campaign, scenarios) {
  return echelonForScenario(scenario).order <= reachedEchelon(campaign, scenarios).order;
}

/**
 * What the appointment order says when you are given it.
 *
 * The rank comes with the job rather than the other way round, which is both
 * how these services actually work and the reason nobody in this game is ever
 * promoted for the thing they think they were promoted for.
 */
export function appointmentNote(echelon) {
  return {
    battalion: 'You have the battalion. Four batteries, one radar, and the valley they sit in.',
    sector: 'You are appointed to the sector. The appointment carries the rank on the same order,'
      + ' which is how you learn you have it.',
    region: 'You are appointed to command of the district. Four sectors answer to you. You will'
      + ' not meet three of the four commanders during this war.',
    national: 'You are appointed Chief of Air Defence. The order is two lines long and does not'
      + ' say who held the appointment before you.',
  }[echelon.id] ?? null;
}
