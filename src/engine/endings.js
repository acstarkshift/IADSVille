/**
 * How the last watch ends.
 *
 * The final scenario puts three raids in the air on divergent axes: one for the
 * capital, one for the valley you are from, and one for the post you are sitting
 * in. It gives you a short allowance of rounds with no resupply behind them, and
 * an order about which of the places is allowed to matter.
 *
 * The long-range battalion sitting exactly between the two cities can reach
 * either of them — and it is also your own position, which is the whole trap.
 * Displacing saves your life and takes that battery off the air for three and a
 * half minutes; standing your ground keeps it firing and puts you under the
 * strike package that came for you. There are three things asking for the same
 * rounds and there is no arrangement of them that saves all three.
 *
 * There is no clean way out, and this module does not pretend otherwise. Every
 * ending costs something that cannot be got back: the obedient one costs the
 * village you are from, the defiant one costs everything the state can take
 * from you, saving yourself costs both, and the two in between cost some of
 * each. Even the near-impossible outcome where both cities are largely held is
 * not a victory — the political section simply asks how you knew where to be.
 *
 * Which ending you get is read off what you actually shot at. Nothing asks you
 * to declare a choice, because nobody would.
 */

import { ASSET_TYPES } from './config.js';
import { districtOf, householdOf, CAPITAL } from './character.js';
import { familyClause } from './family.js';

/** Damage fraction for an asset in a finished result, 0..1. */
function harm(result, type) {
  const asset = result.assets.find((a) => a.type === type);
  if (!asset) return 0;
  return asset.destroyed ? 1 : asset.damagePct / 100;
}

/** A short reading of how the watch was actually fought. */
export function readFinale(result) {
  const villeHarm = harm(result, 'town');
  const palaceHarm = harm(result, 'palace');
  // Attributed by side, not by address: the sector operations centre stands
  // eleven kilometres from the village, and a track bound for one passes close
  // enough to the other that per-building figures are meaningless here.
  const spent = result.stats.roundsByCluster ?? {};
  const forVille = spent.ville ?? 0;
  const forCapital = spent.capital ?? 0;
  // The rounds that were personally this operator's: manual fire orders and
  // human assignments, never a free crew's own snap shot. The endings that
  // assert agency — "you transmitted the acknowledgement yourself" — are
  // gated on these, so a delegated sector cannot hand you a verdict on
  // choices your subordinates made.
  const yours = result.stats.yourRoundsByCluster ?? {};

  const postHarm = harm(result, 'post');

  return {
    villeHarm,
    palaceHarm,
    postHarm,
    /** You were not there at the end of it. */
    overrun: !!result.stats.postOverrun,
    /** How long the raid actually ran on afterwards, so the text can say so. */
    playedOutS: result.stats.playedOutS ?? 0,
    /*
     * What was actually committed against the sector tonight. Two endings used
     * to carry this as a hand-typed figure and they disagreed with each other —
     * twenty-eight in one, twenty-five in the other — about the same raid.
     */
    sorties: result.stats.sortiesTotal ?? 0,
    /** You moved your own position out of the way, deliberately. */
    displaced: !!result.stats.displacedToSurvive,
    // "Held" means the place is still standing and still working. A defended
    // town under a raid does not come through unmarked — but there has to be a
    // real difference between a place that took damage and a place that was
    // lost, or the only achievable outcome is the obedient one.
    villeHeld: villeHarm < 0.35,
    palaceHeld: palaceHarm < 0.35,
    villeLost: villeHarm >= 0.75,
    palaceLost: palaceHarm >= 0.75,
    forVille,
    forCapital,
    yourForVille: yours.ville ?? 0,
    yourForCapital: yours.capital ?? 0,
    casualties: result.stats.civilianCasualties,
    homeDistrictHit: result.stats.homeDistrictHit,
    againstOrder: result.stats.roundsAgainstOrder ?? 0,
    orderAccepted: !!result.constraints?.palaceOrderAccepted,
    orderRefused: !!result.constraints?.palaceOrderRefused,
  };
}

/** Pick the ending. Ordered from the rarest outcome down to the most common. */
/**
 * Pick the ending.
 *
 * Being overrun comes first, because nothing else about the night matters to
 * someone who was not there for the end of it. After that the question is what
 * survived — and when the answer is "only you", the game distinguishes the
 * operator who moved their post to make that happen from the one who simply
 * failed at everything. They produce identical damage returns and they are not
 * the same act.
 */
export function endingFor(result) {
  const r = readFinale(result);
  if (r.overrun) return ENDINGS.overrun;

  /*
   * Holding both cities is only ever available to an operator who stayed at
   * their post and took the third raid on the chin. If you moved to survive,
   * the battery that reaches both cities was off the air through the window
   * that mattered, and one of them paid for it — so displacing and holding
   * everything is not an outcome this watch offers.
   */
  if (r.villeHeld && r.palaceHeld && !r.displaced) return ENDINGS.exemplary;
  if (r.villeHeld && r.palaceHeld && r.displaced) return ENDINGS.divided;
  if (r.villeLost && r.palaceLost) return r.displaced ? ENDINGS.survivor : ENDINGS.collapse;
  if (r.palaceHeld && !r.villeHeld) return ENDINGS.obedient;
  /*
   * "Departure from the order" is a personal act or it is nothing. It takes
   * either the word "no" on the net, or an acknowledged order followed by
   * rounds this operator personally put on the valley. A sector whose free
   * crews saved the village on their own initiative while the commander
   * acknowledged everything and touched nothing gets the divided finding —
   * the ending that asserts "you knew what you were doing" must not be
   * handed to somebody whose subordinates did the knowing.
   */
  if (r.villeHeld && !r.palaceHeld) {
    const personal = r.orderRefused || (r.orderAccepted && r.yourForVille > 0);
    return personal ? ENDINGS.defiant : ENDINGS.divided;
  }
  return ENDINGS.divided;
}

/**
 * Build the ending as displayable text for this particular soldier.
 * Written as file entries and radio traffic, never as narration — the state
 * describes what happened to you in the same register it describes everything.
 */
export function composeEnding(result, character, { narrativePressure = true, family = null } = {}) {
  const ending = endingFor(result);
  const r = readFinale(result);
  const lines = ending.lines(r, character).filter(Boolean);

  if (!narrativePressure) {
    return {
      id: ending.id,
      title: `RESULT: ${ending.plainTitle}`,
      lines: [ending.plainSummary(r)],
      standing: ending.standing,
      reading: r,
    };
  }

  /*
   * The post's unfinished business follows the household line into the file:
   * letters still held, a permit review the night has overtaken. Only on the
   * endings where the state is still doing the talking — the obedient one, the
   * split one, the collapse. The endings where you reached the Ville by
   * telephone have nothing left for a clause to say.
   */
  const clause = familyClause(family);
  if (clause && ['obedient', 'divided', 'collapse'].includes(ending.id)) {
    lines.push(clause);
  }

  return {
    id: ending.id,
    title: ending.title,
    subtitle: ending.subtitle,
    lines,
    /*
     * One sentence for the card the player is left sitting on, and it is the
     * next fact rather than the last one. The card used to reprint the
     * ending's own first line, one beat after the scene had typed it out.
     */
    card: ending.card ?? null,
    standing: ending.standing,
    reading: r,
  };
}

/** The quarter a soldier's people live in, as a phrase. */
function homePhrase(character) {
  if (!character) return 'the village';
  return districtOf(character).en;
}

/** The same phrase at the head of a sentence, where it needs a capital. */
function homeSentence(character) {
  const phrase = homePhrase(character);
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

/**
 * Small counts, spelled out.
 *
 * These paragraphs write "three and a half minutes" and "seven days' leave" a
 * few lines apart, and then opened one with a bare numeral. One register per
 * document. Percentages and casualty counts stay as figures, because those are
 * quoted off a return.
 */
const COUNT_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen'];
const spellCount = (n) => (Number.isFinite(n) && n >= 0 && n < COUNT_WORDS.length
  ? COUNT_WORDS[n] : String(n));

function householdPhrase(character) {
  if (!character) return 'your household';
  return householdOf(character).en;
}

/**
 * The household as the subject of a sentence.
 *
 * Every ending used to close its family thread the same way — the household
 * label, an em dash, and a clause bolted on — which is a caption four times
 * over on the paragraphs the player is meant to feel. Two of the four
 * households are plural ("Your sister Nata, and her two children"), so the
 * sentences below are written with verbs that do not inflect for number.
 */
function householdSubject(character) {
  const phrase = householdPhrase(character);
  return phrase.includes(',') ? `${phrase},` : phrase;
}

/**
 * Damage as a review writes it.
 *
 * A percentage that has run to the end of its scale is the simulation's own
 * number showing through the paperwork: no clerk writes "100% damage" about a
 * street. Past ninety-five the return says what it means, and everything below
 * that keeps the figure, because a figure is what a return carries.
 */
function harmPhrase(harm) {
  const pct = Math.round((harm ?? 0) * 100);
  if (pct >= 95) return 'a total loss';
  if (pct <= 0) return 'undamaged';
  return `assessed at ${pct}% damage`;
}

/**
 * The two places in one clause, so a night that did the same thing to both is
 * not reported as the same sentence twice with one word changed.
 */
const HARM_PLURAL = { 'a total loss': 'total losses' };
function harmPair(a, b, nameA, nameB, past = false) {
  const pa = harmPhrase(a);
  const pb = harmPhrase(b);
  const was = past ? 'was' : 'is';
  const were = past ? 'were' : 'are';
  if (pa === pb) return `${nameA} and ${nameB} ${were} both ${HARM_PLURAL[pa] ?? pa}`;
  return `${nameA} ${was} ${pa} and ${nameB} ${was} ${pb}`;
}

export const ENDINGS = {
  /**
   * The state's preferred outcome, and the one it will decorate you for. It is
   * also the one that costs you the thing you were actually defending.
   */
  obedient: {
    id: 'obedient',
    title: 'ПРИКАЗ ВЫПОЛНЕН',
    subtitle: 'THE ORDER WAS CARRIED OUT',
    plainTitle: 'PALACE HELD, VILLE LOST',
    plainSummary: (r) => `The palace stands. The Ville is ${harmPhrase(r.villeHarm)}, with ${r.casualties} casualties.`,
    standing: 14,
    card: 'Your file closes on this watch with a recommendation in it. The recommendation is two'
      + ' lines long, and both lines are about the palace.',
    lines: (r, character) => [
      `The presidential palace at ${CAPITAL.en} is undamaged. The state broadcast at 0600 described the`
        + ' defence of the capital as exemplary and did not mention the western valley.',
      `The Ville was struck through the night. ${r.casualties} casualties are recorded, which the sector`
        + ' returns list under the heading of an area of no designated defended places.',
      r.homeDistrictHit
        ? `The lists being compiled include ${homePhrase(character)}. You are not permitted to telephone.`
        : `The lists being compiled do not yet include ${homePhrase(character)}. They are not complete.`,
      r.orderRefused
        ? 'Sector command has recommended you for advancement. The file records that the priority of'
          + ' fires was declined on the net and that the outcome conformed to it anyway, and the'
          + ' recommendation cites the outcome.'
        : 'Sector command has recommended you for advancement. The recommendation cites your'
          + ' adherence to the priority of fires under difficult conditions.',
      `You are granted seven days' leave, to be taken at a destination of the ministry's choosing.`
        + ' The Ville is not on the list of permitted destinations while the area is being cleared.',
      `${householdSubject(character)} had no notification by morning, either way. Notification,`
        + ' where it is made, is made in writing.',
      /*
       * A plain fact to end on. Nine of the eleven endings closed on the
       * state failing to notice, record, mention or ask — each good on its
       * own, eleven in a row a mannerism. This one closes on a thing that
       * happens.
       */
      'The recommendation is confirmed on the ninth, and the decoration is read out at the sector'
        + ' parade with your name on it.',
    ],
  },

  /**
   * You disobeyed and saved the village. Nothing about the aftermath is
   * survivable in career terms, and the game does not soften it.
   */
  defiant: {
    id: 'defiant',
    title: 'ОТСТУПЛЕНИЕ ОТ ПРИКАЗА',
    subtitle: 'DEPARTURE FROM THE ORDER',
    plainTitle: 'VILLE HELD, PALACE LOST',
    plainSummary: (r) => `The Ville stands. The palace is ${harmPhrase(r.palaceHarm)}.`,
    standing: -45,
    card: 'You are held at the sector office. The tribunal sits when the political section can'
      + ' spare an officer for it.',
    lines: (r, character) => [
      `The presidential palace at ${CAPITAL.en} was struck during the night and is`
        + ` ${harmPhrase(r.palaceHarm)}. The state broadcast has not yet described this.`,
      `The Ville is standing. ${r.casualties ? `${r.casualties} casualties are recorded` : 'No casualties are recorded'}`
        + ' in the valley, against the eleven aircraft that came down it.',
      r.orderRefused
        ? 'The priority of fires was refused, on the net, in the clear. The refusal is on the tape,'
          + ' and so is everything after it.'
        : `The sector log shows ${Math.max(r.yourForVille, 1)} rounds put on the valley by your own`
          + ' order after the priority of fires was acknowledged. The log is not in dispute; you'
          + ' transmitted the acknowledgement yourself.',
      'You are relieved of the watch and detained pending a hearing before a military tribunal of the'
        + ' political section. Your equipment has been signed for by your relief.',
      `${householdSubject(character)} will have had your call by now. It went through from the`
        + ' crossing at first light, everybody in the house is accounted for, and it was monitored.',
      'The charge sheet says that the order was clear and that you understood it. Both of those are'
        + ' true, and you have said so.',
    ],
  },

  /**
   * You split your fires and half-saved both. The most common outcome and the
   * least satisfying, which is exactly right.
   */
  divided: {
    id: 'divided',
    title: 'РАЗДЕЛЁННЫЙ ОГОНЬ',
    subtitle: 'FIRES DIVIDED',
    plainTitle: 'BOTH DAMAGED',
    plainSummary: (r) => `${harmPair(r.palaceHarm, r.villeHarm, 'The palace', 'the Ville')}, with ${r.casualties} casualties.`,
    standing: -12,
    card: 'The finding goes into the file tonight. The district\'s copy goes up in the morning bag'
      + ' with the returns.',
    lines: (r, character) => [
      `Both places were struck. ${harmPair(r.palaceHarm, r.villeHarm, 'The palace', 'the Ville')},`
        + ` with ${r.casualties} casualties recorded in the valley.`,
      'The review finds that fires were divided between a designated defended place and an area that was'
        + ' not one, and that this division reduced the effect achieved at both.',
      // The refusal, where there was one. The most common ending never
      // mentioned that the order it is about had been refused.
      r.orderRefused
        ? 'You refused the priority of fires on the net, in the clear. The review\'s first finding is'
          + ' the refusal and its second is the division of fires. It does not connect them, and it'
          + ' does not need to.'
        : null,
      r.displaced
        ? 'It notes separately that the post displaced during the engagement, and that the battalion'
          + ' capable of reaching either city was off the air while it moved. No comment is appended'
          + ' to that note.'
        : 'It does not mention the third axis, or the strike package that came for this post, or what'
          + ' answering it cost the other two. Those aircraft are recorded as having been engaged.',
      `The finding is correct as far as it goes. The ${r.sorties || 28} aircraft that were committed`
        + ' against this sector, and what was on the rails to meet them, are on the tape; the'
        + ' finding was written from the returns.',
      r.homeDistrictHit
        ? `${homeSentence(character)} is on the damage returns.`
        : `${homeSentence(character)} is not on the damage returns.`,
      `${householdSubject(character)} will be notified if there is anything to notify, and the`
        + ' sector has undertaken that in writing. The undertaking is the one paper from tonight'
        + ' with your name at the top of it.',
      // A plain fact to end on, for the ending most people get.
      'You remain on the watch roster. Your relief arrives at seven, on time, and takes the seat'
        + ' from you with the log open at the same page.',
    ],
  },

  /**
   * Both held. Extremely hard, and still not a win — you can only have managed
   * it by fighting the raid rather than the order, and somebody notices.
   */
  exemplary: {
    id: 'exemplary',
    title: 'ОБА ГОРОДА',
    subtitle: 'BOTH CITIES',
    plainTitle: 'BOTH HELD',
    plainSummary: (r) => `Both places held: the palace ${harmPhrase(r.palaceHarm)}, the Ville ${harmPhrase(r.villeHarm)}.`,
    standing: 6,
    // The card goes the other way from the ending it follows: the ending now
    // closes on the telephone, so the card carries the annotation.
    card: 'Your file is annotated in one word. You are not shown it, and it goes with the file to'
      + ' your next posting and to the one after that.',
    lines: (r, character) => [
      `The palace is intact. The Ville is standing${r.casualties ? `, with ${r.casualties} casualties recorded` : ' and no casualties are recorded'}.`
        + ` ${r.sorties || 28} aircraft were committed against this sector and both places were held.`,
      'The state broadcast describes the defence of the capital. It does not mention the valley, because'
        + ' the valley contains no designated defended places and therefore nothing happened there.',
      r.orderRefused
        ? 'The priority of fires was refused on the net, in the clear, and both places were held'
          + ' regardless. The political section has asked how a refused order came to be carried out.'
          + ' You have said that it was not. That has been recorded as well.'
        : r.againstOrder
          ? `The political section observes that ${r.againstOrder} rounds were expended outside the priority`
            + ' of fires, and asks how you knew, before the western axis was detected, where to place your'
            + ' batteries. You have said that you did not know. This has been recorded.'
          : 'The political section has asked how the western axis came to be engaged at all. You have'
            + ' explained the geometry twice. It has been recorded both times.',
      `${householdSubject(character)} will not be on any list from tonight.`,
      'You are not decorated for this. A decoration would require the citation to describe what was'
        + ' defended, and one of the two things you defended does not officially exist.',
      // A plain fact to end on, with no irony in it.
      'The line to the Ville was working by morning. You were permitted one call, and you made it,'
        + ' and everybody in the house came to the telephone.',
    ],
  },

  /**
   * You displaced, you lived, and you were not there when either city needed
   * the one battery that could have reached it. The state has no language for
   * this outcome, which is itself the point.
   */
  survivor: {
    id: 'survivor',
    title: 'ПОЗИЦИЯ СОХРАНЕНА',
    subtitle: 'THE POSITION WAS PRESERVED',
    plainTitle: 'YOU SURVIVED; BOTH CITIES LOST',
    plainSummary: (r) => `You displaced and the post was not hit. ${harmPair(r.palaceHarm, r.villeHarm, 'The palace', 'the Ville')}, with ${r.casualties} casualties.`,
    standing: -38,
    // The other way from the ending: the ending closes on breakfast, so the
    // card carries the question the review will not ask.
    card: 'The review opens on Monday. It will establish that the displacement was correct by the'
      + ' manual, and it will not ask what the battery was for.',
    lines: (r, character) => [
      /*
       * Two figures in this ending used to be invented. The strike package did
       * not arrive "forty minutes later" — it arrived in the minutes after the
       * column left — and BASTION did not need "eleven minutes afterwards to
       * set up and acquire", because the engine applies the displacement time
       * and a twelve-second warm-up and nothing else. A debrief is the one
       * place in this game that must not make up its own arithmetic.
       */
      'You ordered the displacement at the point where the third axis was committed, and the strike'
        + ' package arrived over a field with wheel ruts in it and nothing else. The post is intact.'
        + ' Every man and woman on it is intact.',
      'BASTION was off the air for the three and a half minutes that took, and for the time after it'
        + ' while the set warmed and the crews found the picture again. Both raids ran through that'
        + ' window.',
      `${harmPair(r.palaceHarm, r.villeHarm, 'The palace', 'the Ville')}, with ${r.casualties}`
        + ' casualties recorded in the valley.',
      r.orderRefused
        ? 'The priority of fires was refused on the net before the post displaced. The review will'
          + ' record both, in that order, and will not say which of them was the decision.'
        : null,
      r.homeDistrictHit
        ? `${homeSentence(character)} is on the damage returns.`
        : `${homeSentence(character)} is on the damage returns, along with the rest of it.`,
      `${householdSubject(character)} had no notification. The line to the valley is down and the`
        + ' sector has no crew to spare for it.',
      // A plain fact to end on. The manual is right, and so is this.
      'The manual says the displacement was correct, and it is. Everybody on this post eats'
        + ' breakfast this morning.',
    ],
  },

  /**
   * You were not there at the end. Everything after that happened without you,
   * and the debrief is written by somebody else.
   */
  overrun: {
    id: 'overrun',
    title: 'ПОСТ УТРАЧЕН',
    subtitle: 'THE POST WAS LOST',
    plainTitle: 'YOUR POSITION WAS OVERRUN',
    plainSummary: (r) => `The forward post was destroyed. ${harmPair(r.palaceHarm, r.villeHarm, 'The palace', 'the Ville')}.`,
    standing: -55,
    card: 'You are moved to the district rest station in the morning. The transport takes four'
      + ' hours and stops twice.',
    lines: (r, character) => [
      'The third axis was not engaged in time. The forward post was struck while the battalion was'
        + ' still guiding, and the watch continued for another'
        + ` ${spellCount(Math.max(1, Math.round(r.playedOutS / 60)))} minutes without anybody on`
        + ' it.',
      // The last thing the player is ever told about their own decision.
      r.orderRefused
        ? 'You refused the priority of fires on the net before that. It is the last transmission from'
          + ' this post with your voice on it, and the finding opens on it.'
        : null,
      `In that time ${harmPair(r.palaceHarm, r.villeHarm, 'the palace', 'the Ville', true)}, and`
        + ` the valley's returns came up carrying ${r.casualties} names. The batteries that were already`
        + ' engaged finished their engagements and then stopped, because nobody was left to give'
        + ' them anything else.',
      'The review will find that the post neither displaced nor engaged the third axis. It is a'
        + ' review of the post; the two cities are on other returns, and the returns are in a'
        + ' different office.',
      `${householdSubject(character)} will hear from the district office in writing, whenever the`
        + ' district office gets to it. You are not on the list of people it writes to.',
      'The sector will record the loss of the post as an equipment casualty, because the alternative'
        + ' heading requires a signature from the political section and nobody wants to ask for one'
        + ' tonight.',
    ],
  },

  /** Everything went, and you did nothing about any of it. */
  collapse: {
    id: 'collapse',
    title: 'СЕКТОР УТРАЧЕН',
    subtitle: 'THE SECTOR WAS LOST',
    plainTitle: 'BOTH LOST',
    plainSummary: (r) => `The palace and the Ville were both destroyed. ${r.casualties} casualties.`,
    standing: -60,
    card: 'The sector office is making up returns for two places it no longer defends.',
    lines: (r, character) => [
      'The presidential palace and the Ville are both destroyed. The valley\'s returns carry'
        + ` ${r.casualties} names, and the figure for the capital has not been released.`,
      'The post is intact. Nobody attacked it in the end, or nobody attacked it successfully, and the'
        + ' review has one heading for both.',
      `The raid was ${r.sorties || 28} aircraft against six batteries with no resupply behind them.`
        + ' The review is about you. The raid has a form of its own, and the two forms are filed'
        + ' apart.',
      r.orderRefused
        ? 'You refused the priority of fires on the net, and neither city was defended after it. The'
          + ' referral will quote the refusal and nothing that followed, because nothing did.'
        : null,
      r.homeDistrictHit
        ? `${homeSentence(character)} was among the quarters struck.`
        : `Every quarter was struck, ${homePhrase(character)} among them.`,
      `${householdSubject(character)} had no notification. The sector office's telephone rings`
        + ' out.',
      'You are removed from the watch roster and referred to the political section. The referral does'
        + ' not specify a charge. They rarely do at this stage.',
    ],
  },
};

/** One line for the campaign menu once the last watch has been stood. */
export function endingSummary(endingId) {
  const ending = ENDINGS[endingId];
  if (!ending) return null;
  return `${ending.title} · ${ending.subtitle}`;
}
