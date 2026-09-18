/**
 * How far up you can see, and how little of it you can touch.
 *
 * TWO LADDERS, AND THEY ARE NOT THE SAME LADDER. A watch declares the
 * FORMATION it is fought at — `echelon`, the four entries below — and the POST
 * the player holds while standing it (`post`, `POSTS`, further down). The
 * formation decides the machinery: how much of the map the scope reaches, how
 * many formations one pair of hands may hold, whether there is a reserve. The
 * post decides who you are: what the file calls you, what rank comes with it,
 * and which seat you are allowed to sit in.
 *
 * They used to be one field, and the consequence was the thing a player wrote
 * in to complain about — a Recruit was titled Battalion Commander on the first
 * night of the war, because the first watch is fought at a battalion and the
 * game had no way to say "at a battalion, at the bottom of it, on a radar".
 *
 * The campaign is a promotion. You begin at a radar set with one switch and no
 * authority to shoot anything, and you end commanding the air defence of a
 * country. The equipment does not change. What changes is the *kind of
 * decision* you are making, and every promotion takes something away from you:
 *
 *   RADAR SET   what is out there, and who you tell about it
 *   CABIN       which of the things you can reach is worth a round
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

/**
 * Ordered from the smallest command to the largest.
 *
 * These are FORMATIONS, not appointments. What the player is called while
 * standing a watch at one of them is a POST — see `POSTS` below, which is the
 * ladder the campaign is actually climbed on.
 */
export const ECHELONS = {
  battalion: {
    id: 'battalion',
    order: 0,
    tm: 'ДИВИЗИОН',
    en: 'Battalion',
    appointment: { tm: 'КОМАНДИР ДИВИЗИОНА', en: 'Battalion Commander' },
    /** The formation's own name, for headings about the formation. */
    heading: 'BATTALION COMMAND',
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
    /** The rank the post carries; you are gazetted to it on taking it. */
    rankFloor: 'jlt',
    blurb: 'Four batteries sit in one valley and every one of them is yours to point.',
    teaches: 'You see a contact, hand it to something that can reach it, and watch the round go.',
  },

  sector: {
    id: 'sector',
    order: 1,
    tm: 'СЕКТОР',
    en: 'Sector',
    appointment: { tm: 'НАЧАЛЬНИК СЕКТОРА', en: 'Sector Commander' },
    heading: 'SECTOR COMMAND',
    short: 'SEC',
    directLimit: Infinity,
    handoverS: 0,
    scopeRangeKm: 150,
    reserveRounds: 0,
    rankFloor: 'slt',
    blurb: 'A sector and its radars answer to you, and every night brings more contacts than you have rounds.',
    teaches: 'You choose what is worth a round, and you learn that the building holding your picture together can be bombed.',
  },

  region: {
    id: 'region',
    order: 2,
    tm: 'ОКРУГ ПВО',
    en: 'Air Defence District',
    appointment: { tm: 'КОМАНДУЮЩИЙ ОКРУГОМ', en: 'District Commander' },
    heading: 'DISTRICT COMMAND',
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
    blurb: 'Three hundred kilometres wide, and you may hold two of its four sectors under your own hand at a time.',
    teaches: 'You fight through other people, and the order you leave them with is usually the only weapon you have.',
  },

  national: {
    id: 'national',
    order: 3,
    tm: 'ГЛАВНЫЙ ШТАБ ПВО',
    en: 'National Air Defence Command',
    appointment: { tm: 'НАЧАЛЬНИК ГЛАВНОГО ШТАБА', en: 'Chief of Air Defence' },
    heading: 'NATIONAL COMMAND',
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
    blurb: 'One seat runs the air defence of the whole country, with a reserve that will not cover two of anything at once.',
    teaches: 'You decide which places are defended, which means you decide which people are, and you sign it.',
  },
};

export const ECHELON_ORDER = Object.values(ECHELONS).sort((a, b) => a.order - b.order);

export const echelonOf = (id) => ECHELONS[id] ?? ECHELONS.battalion;

/** The echelon a scenario is fought at. Watches that predate the field default down. */
export const echelonForScenario = (scenario) => echelonOf(scenario?.echelon ?? 'sector');

/* ------------------------------------------------------------------ *
 * The ladder the campaign is climbed on
 * ------------------------------------------------------------------ */

/**
 * The posts, from the bottom of a battalion to the top of a country.
 *
 * SIX RUNGS, AND THE FIRST TWO ARE NOT COMMANDS. The player asked for this in
 * so many words — "you should start as a Sam operator or radar operator then
 * work up" — and the campaign's own data was the argument for it: every watch
 * offered every seat from the first night, and the file called a Recruit a
 * Battalion Commander because the only ladder in the game was the ladder of
 * formations.
 *
 * A post carries four things and they move together: what the file calls you
 * (`appointment`), the rank the order gazettes with it (`rankFloor`), the
 * seats it may be played from (`seats`), and what the job is for (`teaches`).
 * The top four are the four commands, unchanged — the same appointments, the
 * same rank floors, the same blurbs — now sitting above the two operator posts
 * rather than starting at the bottom.
 *
 * `order` is the gate: a post opens when every watch at the post below it has
 * been stood, which is the same rule the four commands have always used, so a
 * bad night still promotes you and no watch is ever locked behind a score.
 */
const operatorPost = (spec) => ({
  directLimit: Infinity,
  handoverS: 0,
  reserveRounds: 0,
  ...spec,
});

export const POSTS = {
  /**
   * The set, and one switch.
   *
   * You do not shoot. A launch officer does that, on what you hand him, and he
   * answers on the radio — so the whole of this post is the one idea the game
   * is built on: a radar must transmit to see, and transmitting is how you are
   * found. Nothing else on the console is yours.
   */
  radar: operatorPost({
    id: 'radar',
    order: 0,
    tm: 'РАСЧЁТ РЛС',
    en: 'Radar crew',
    appointment: { tm: 'ОПЕРАТОР РЛС', en: 'Radar Operator' },
    heading: 'THE RADAR SET',
    short: 'RDR',
    scopeRangeKm: 140,
    rankFloor: 'strelets',
    seats: ['radar'],
    blurb: 'One set, one tube, and whatever the sector knows tonight is whatever you can hold on it.',
    teaches: 'You switch the set on, hold what it finds, and hand it to the officer who fires.',
  }),

  /**
   * The cabin. Eleven metres from the set, and the first post with a trigger.
   */
  crew: operatorPost({
    id: 'crew',
    order: 1,
    tm: 'РАСЧЁТ КАБИНЫ',
    en: 'Guidance crew',
    appointment: { tm: 'ОПЕРАТОР НАВЕДЕНИЯ', en: 'Missile Operator' },
    heading: 'THE CABIN',
    short: 'CAB',
    scopeRangeKm: 140,
    rankFloor: 'jsgt',
    seats: ['crew'],
    blurb: 'One cabin, one battery, and everything inside its ring is yours to take or to miss.',
    teaches: 'You acquire, lock, launch and guide it in, and you pay for every second you radiate.',
  }),

  battalion: { ...ECHELONS.battalion, order: 2, seats: ['net'] },
  sector: { ...ECHELONS.sector, order: 3, seats: ['net', 'both'] },
  region: { ...ECHELONS.region, order: 4, seats: ['net'] },
  national: { ...ECHELONS.national, order: 5, seats: ['net', 'both'] },
};

export const POST_ORDER = Object.values(POSTS).sort((a, b) => a.order - b.order);

export const postOf = (id) => POSTS[id] ?? POSTS.radar;

/**
 * The post a watch is stood under. A watch that names none falls back to the
 * formation it is fought at, which is what every watch did before the two
 * operator posts existed.
 */
export const postForScenario = (scenario) => postOf(scenario?.post ?? scenario?.echelon ?? 'sector');

/**
 * How high this record has been appointed.
 *
 * A post opens when every watch below it has been stood at least once —
 * progress, not marks. A commander who did badly at sector command is still
 * promoted to district command, because that is how this service works and
 * because a campaign that locks you out of its second half for a bad night is
 * a campaign nobody finishes. The same rule now reaches down to the two
 * operator posts, so the first promotion in the game is the one from the set
 * to the cabin, and it is earned exactly the way the last one is.
 */
export function reachedPost(campaign, scenarios) {
  let reached = POSTS.radar;
  for (const post of POST_ORDER) {
    if (post.order === 0) continue;
    const below = scenarios.filter((s) => postForScenario(s).id === POST_ORDER[post.order - 1].id);
    const allStood = below.length > 0 && below.every((s) => campaign?.completed?.[s.id]);
    if (!allStood) break;
    reached = post;
  }
  return reached;
}

/** Is this watch at or below the appointment this record holds? */
export function withinAppointment(scenario, campaign, scenarios) {
  return postForScenario(scenario).order <= reachedPost(campaign, scenarios).order;
}

/**
 * What the appointment order says when you are given it.
 *
 * The rank comes with the job rather than the other way round, which is both
 * how these services actually work and the reason nobody in this game is ever
 * promoted for the thing they think they were promoted for.
 */
export function appointmentNote(post) {
  return {
    // The first two are postings, not gazettes: a sergeant reads them out and
    // the paper stays in his folder. Concrete, and eleven metres long.
    radar: 'You are put on the set with the duty roster, in pencil, on the back of last week’s.',
    crew: 'The order moves you eleven metres, from the cabin with the tube in it to the cabin with'
      + ' the rounds in it.',
    battalion: 'Four batteries, one radar, and the valley they sit in are yours from tonight.',
    // One clause about how the order arrived and one concrete thing about the
    // paper it arrived on. It used to be a sentence repeated with one word
    // changed for effect, which is the mannerism the standard names by name.
    sector: 'The order came up with the morning traffic, in a bundle with the ration returns and'
      + ' a notice about the water.',
    region: 'Four sectors answer to you. You will not meet three of the four commanders during'
      + ' this war.',
    /*
     * What the order DOES say. It used to say what it left out — "does not say
     * who held the appointment before you" — one line after the caveat above
     * it, which on the worst night says the order does not mention the
     * position. Two consecutive sentences whose only job is an omission.
     */
    national: 'The order is two lines long, dated this morning, and copied to eleven addresses.'
      + ' Yours is the last of them.',
  }[post.id] ?? null;
}

/**
 * Who signs an order of appointment: the office above the one it appoints to.
 *
 * The Chief of Air Defence appoints commanders and the ministry appoints the
 * Chief, who cannot appoint himself. Nobody in Mostrograd appoints a man to a
 * radar set: the two operator posts are the battalion's own paperwork, signed
 * eleven metres away by the officer who will be standing beside him.
 *
 * One answer, in two registers, because two screens ask for it — the order
 * read out as a scene wants a stamp in capitals and the file entry wants a
 * clause in a sentence, and they used to disagree: the scene said the
 * battalion had appointed you and the report on the same night said the Chief
 * of Air Defence had.
 */
const OPERATOR_POSTS = new Set(['radar', 'crew']);

export const appointingOffice = (post) => (post.id === 'national' ? 'MINISTRY OF DEFENCE'
  : OPERATOR_POSTS.has(post.id) ? 'BATTALION ORDERLY ROOM' : 'CHIEF OF AIR DEFENCE');

export const appointingSignatory = (post) => (post.id === 'national' ? 'the Ministry of Defence'
  : OPERATOR_POSTS.has(post.id) ? 'the battalion' : 'the Chief of Air Defence');
