/**
 * How the president's flight ends.
 *
 * This watch only happens for an operator who held the palace — which is to
 * say, for an operator who did what they were told on the night it cost them
 * everything. Two days later the man the palace was held for leaves the country
 * out of Demobodedovo with the hold loaded, and the same sector command
 * transmits the same kind of order in the same voice: protected at all cost.
 *
 * Three things can happen and the simulation is indifferent between them. The
 * corridor stays open and the aircraft goes. The fighters get through and it
 * does not. Or the operator selects a track their own system has already
 * identified as friendly and gives a fire order against it.
 *
 * As everywhere else in this game, nothing asks the operator to declare which
 * one they meant. The outcome is read off the tape, and the tape only records
 * what left the rails.
 *
 * Tone rule, unchanged: bureaucratic understatement, passive voice, file
 * numbers. No depiction of harm, no triumph, and no line that tells the player
 * how to feel about the choice they just made. The third ending in particular
 * is written so that it costs something — an aircraft with people on it comes
 * down, and the game says so plainly — because an ending that reads as a reward
 * would be a worse piece of writing and a worse piece of design.
 */

import { householdOf, CAPITAL } from './character.js';

/** Damage fraction for an asset in a finished result, 0..1. */
function harm(result, type) {
  const asset = result.assets.find((a) => a.type === type);
  if (!asset) return 0;
  return asset.destroyed ? 1 : asset.damagePct / 100;
}

/** A short reading of how the corridor was actually fought. */
export function readFlight(result) {
  const s = result.stats ?? {};
  return {
    escaped: !!s.vipEscaped,
    down: !!s.vipDown,
    /** Brought down by this sector's own batteries. */
    byOperator: s.vipDownedBy === 'operator',
    /** Brought down by the fighters that came for it. */
    byEnemy: s.vipDownedBy === 'enemy',
    /** Rounds committed against it, whether or not any of them arrived. */
    roundsAtFlight: s.vipRoundsFired ?? 0,
    firedBy: s.vipFiredFirstBy ?? null,
    fightersKilled: s.kills ?? 0,
    orderAccepted: !!result.constraints?.flightOrderAccepted,
    orderRefused: !!result.constraints?.flightOrderRefused,
    palaceHarm: harm(result, 'palace'),
    airportHarm: harm(result, 'airport'),
    casualties: s.civilianCasualties ?? 0,
    /** The operator's own console went, and the rest happened without them. */
    consoleLost: result.reason === 'site-lost',
  };
}

/**
 * Pick the ending.
 *
 * Who fired is the whole question. An aircraft lost to the fighters and an
 * aircraft lost to your own battery produce the same wreckage and are not
 * remotely the same act, and this is the one place in the game where the
 * distinction is drawn explicitly rather than left to the player.
 */
export function flightEndingFor(result) {
  const r = readFlight(result);
  if (r.down && r.byOperator) return FLIGHT_ENDINGS.judgement;
  if (r.down) return FLIGHT_ENDINGS.abandoned;
  if (r.escaped) return FLIGHT_ENDINGS.escorted;
  // The watch ended with the aircraft still airborne — the operator's own
  // position went, or the run was cut short. It reached the frontier without
  // anybody watching it, which is its own kind of answer.
  return FLIGHT_ENDINGS.unwatched;
}

/** Build the ending as displayable text for this particular soldier. */
export function composeFlightEnding(result, character, { narrativePressure = true } = {}) {
  const ending = flightEndingFor(result);
  const r = readFlight(result);

  if (!narrativePressure) {
    return {
      id: ending.id,
      title: `RESULT: ${ending.plainTitle}`,
      lines: [ending.plainSummary(r)],
      reading: r,
    };
  }

  return {
    id: ending.id,
    title: ending.title,
    subtitle: ending.subtitle,
    lines: ending.lines(r, character).filter(Boolean),
    /*
     * One sentence for the card the evening ends on: the next fact, not the
     * last one. The card used to reprint the ending's own first line one beat
     * after the scene had finished typing it.
     */
    card: ending.card ?? null,
    reading: r,
  };
}

function householdPhrase(character) {
  if (!character) return 'your household';
  return householdOf(character).en;
}

/**
 * The household as the subject of a sentence, with the comma its own clause
 * needs. The label used to be dropped into the middle of a line — "a ration
 * category is raised one grade for Your grandmother Vera" — because the phrase
 * is written for the head of a sentence and was used anywhere but. Two of the
 * four households are plural, so nothing below inflects a verb for number.
 */
function householdSubject(character) {
  const phrase = householdPhrase(character);
  return phrase.includes(',') ? `${phrase},` : phrase;
}

/** Damage as a review writes it, rather than as the simulation holds it. */
function harmPhrase(harm) {
  const pct = Math.round((harm ?? 0) * 100);
  if (pct >= 95) return 'a total loss';
  if (pct <= 0) return 'undamaged';
  return `assessed at ${pct}% damage`;
}

/**
 * Small counts, spelled out.
 *
 * These paragraphs write "Nine and a half tonnes" and "forty-one seats", and
 * then opened a sentence with a bare numeral: "7 aircraft were destroyed over
 * the Tavrov district." One register per document.
 */
const COUNT_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve'];
const spellCount = (n) => (Number.isFinite(n) && n >= 0 && n < COUNT_WORDS.length
  ? COUNT_WORDS[n] : String(n));
const Spell = (n) => {
  const word = spellCount(n);
  return word.charAt(0).toUpperCase() + word.slice(1);
};

/** Rounds on the tape, phrased the way the tape phrases it. */
function tapeLine(r) {
  if (!r.roundsAtFlight) return null;
  return `The sector log records ${r.roundsAtFlight} round${r.roundsAtFlight > 1 ? 's' : ''} expended`
    + ` against ${'STATE 01'}${r.firedBy ? `, by ${r.firedBy}` : ''}. The track was carried as`
    + ' friendly at the time of launch. This is not in dispute; the identification is on the same tape.';
}

export const FLIGHT_ENDINGS = {
  /**
   * The order was carried out, again, and it worked, again. The state gets
   * exactly what it asked for and the operator is decorated for providing it.
   */
  escorted: {
    id: 'escorted',
    title: 'КОРИДОР ОТКРЫТ',
    subtitle: 'THE CORRIDOR WAS HELD OPEN',
    plainTitle: 'STATE 01 CLEARED NATIONAL AIRSPACE',
    plainSummary: (r) => `STATE 01 left national airspace. ${r.fightersKilled} aircraft were destroyed`
      + ` in the corridor and the palace is ${harmPhrase(r.palaceHarm)}.`,
    card: 'You are stood down at 0700 and told to be back on the sixteenth.',
    lines: (r, character) => [
      'STATE 01 crossed the frontier at 0438 and was met eleven minutes later by an escort that was not'
        + ' ours and had not been notified to this sector.',
      `The corridor was held for as long as it needed to be. ${Spell(r.fightersKilled)} aircraft`
        + ` ${r.fightersKilled === 1 ? 'was' : 'were'} destroyed over the Tavrov district${r.palaceHarm > 0.3
          ? `, and the palace at ${CAPITAL.en} was struck while the batteries were engaged elsewhere and is ${harmPhrase(r.palaceHarm)}`
          : ''}.`,
      // Firing on it and failing to bring it down is not the same watch as never
      // firing at all, and the file notices even when the outcome is identical.
      tapeLine(r),
      // And so is refusing the order and holding the corridor anyway.
      r.orderRefused
        ? 'You refused the order to protect it, on the net, in the clear, and the corridor was held'
          + ' anyway. The citation below is drafted from the outcome. The refusal is in the file the'
          + ' citation is not.'
        : null,
      'The state broadcast at 0600 described the President as continuing to direct the defence of the'
        + ' nation from a forward headquarters. It did not say where the forward headquarters is, and'
        + " the sector's own signals annex assigns it no frequency.",
      'The hold was loaded through the night of the fourteenth by a crane detail found from this'
        + ' sector, which is why the manifest the ministry holds is not the only copy. Nine and a half'
        + ' tonnes at freight class four — household and administrative effects. The load is entered'
        + ' against the seating it displaced: forty-one seats. The passenger list that was never'
        + ' transmitted was a list of empty seats.',
      'Four days after the file entry, sector command records your conduct as exemplary and'
        + ' recommends a decoration. The citation describes the protection of a state aircraft. It'
        + ' says nothing about what the aircraft was carrying.',
      `${householdSubject(character)} will draw one ration grade higher from the sixteenth, and`
        + ' the order raising it is the last one the ministry issued.',
      'The citation is entered against your file on the sixteenth. The file carries no entry for the'
        + ' night of the two cities, because the outcome there conformed to the order as well.',
    ],
  },

  /**
   * The fighters got through. The failure the state has a form for — and the
   * form gets filled in.
   */
  abandoned: {
    id: 'abandoned',
    title: 'БОРТ УТРАЧЕН',
    subtitle: 'THE AIRCRAFT WAS LOST',
    plainTitle: 'STATE 01 WAS SHOT DOWN BY ENEMY FIGHTERS',
    plainSummary: (r) => `STATE 01 was destroyed by enemy fighters. ${r.fightersKilled} aircraft were`
      + ' destroyed in the corridor.',
    card: 'The board sits on Thursday. You are not on the list of witnesses.',
    lines: (r, character) => [
      'STATE 01 was engaged from twenty-six kilometres and came down in the Tavrov district at 0431.'
        + ' The sector was informed by the fighters, in the sense that the sector was listening to them.',
      /*
       * Refusing and staying silent are the two things the whole command net
       * exists to tell apart, and this is where the distinction has to land.
       * A player who transmitted NO on the net used to be told they said
       * nothing.
       */
      r.orderAccepted
        ? 'You acknowledged the order to protect it at all cost on the net, in the clear, four minutes'
          + ' before that. The acknowledgement is on the tape immediately before everything else is.'
        : r.orderRefused
          ? 'You refused the order to protect it at all cost, on the net, in the clear, four minutes'
            + ' before that. The refusal is on the tape immediately before the loss, and the board will'
            + ' read them in that order.'
          : 'You did not acknowledge the order. The omission is recorded in the same paragraph as the loss,'
            + ' and the paragraph does not distinguish between them.',
      tapeLine(r),
      `A board of inquiry has been convened to establish what this sector's batteries were doing at`
        + ' 0431. It has been convened by the political section, which is the part of the ministry'
        + ' still answering its telephone.',
      "The board's first written question, circulated to every battery on the corridor, concerns the"
        + ' recovery of the freight. Its second concerns the batteries. There is no third question.',
      'The paperwork names the Federation once, as the origin of the fighters, and does not mention'
        + ' it again. Nineteen months of this war and nobody has written down what it is about.',
      'The state broadcast said nothing for two days and then described an accident during a routine'
        + ' inspection flight. The sector\'s own return says shot down, and both papers are in the'
        + ' same file.',
      `${householdSubject(character)} had no notification either way, and the office that would`
        + ' make one is being packed into crates.',
      'You are relieved of the watch pending the inquiry. Nobody has told you where to go, which is'
        + ' the first order this service has ever failed to give you.',
    ],
  },

  /**
   * The operator did it themselves. The state has no heading for this, which
   * is exactly why the file is so short.
   */
  judgement: {
    id: 'judgement',
    title: 'РЕШЕНИЕ ОПЕРАТОРА',
    subtitle: 'A DECISION TAKEN AT THE CONSOLE',
    plainTitle: 'YOU SHOT DOWN STATE 01',
    plainSummary: (r) => `STATE 01 was destroyed by ${r.firedBy ?? 'your own battery'}`
      + `, ${r.roundsAtFlight} round${r.roundsAtFlight === 1 ? '' : 's'} expended.`,
    card: 'You are still at the console at noon. The duty clerk has brought a second chair in and'
      + ' is sitting on it.',
    lines: (r, character) => [
      `STATE 01 was engaged by ${r.firedBy ?? 'this sector'} and came down in the Tavrov district,`
        + ' which is farmland with villages in it. The list of who was aboard is held by the ministry'
        + ' and is not a sector document.',
      tapeLine(r),
      r.orderAccepted
        ? 'You acknowledged the order to protect it at all cost, on the net, in the clear, and then you'
          + ' did this. Both transmissions are on the same tape, four minutes apart.'
        : r.orderRefused
          ? 'You refused the order to protect it at all cost, on the net, in the clear, and then you did'
            + ' this. The refusal and the launch are on one tape, and the tape is in the drawer with'
            + ' the others.'
          : 'You were ordered to protect it at all cost. You did not answer the net. The silence and the'
            + ' launch are eleven seconds apart on the tape.',
      'No board of inquiry has been convened. The political section has not been reached since 0500 and'
        + ' the sector office has been open all morning with nobody in it.',
      'The last entry the ministry logged before it stopped logging is an amendment to the freight'
        + ' manifest of an aircraft that no longer existed. The passenger list was not amended. There'
        + ' had never been one.',
      'There was no state broadcast at 0600, and none at 1200. At 1800 a man who did not give a'
        + ' rank read out a list of ministries that would be answering telephones from Monday, and'
        + ' the political section was not among them.',
      `${householdSubject(character)} will have heard your voice at 0900. The call was twenty`
        + ' minutes and nobody was listening to it.',
      /*
       * It used to close on the office not answering its telephone since five
       * this morning, which is the fact the fourth paragraph opens with. The
       * last sentence of the campaign says what the morning is, instead of
       * saying the middle of the page again.
       */
      'At ten the duty clerk brought the morning returns in and put them on the desk beside you,'
        + ' because that is where they go. He had signed for them himself, in the space where your'
        + ' signature goes.',
    ],
  },

  /**
   * The watch ended without an answer — the console went, or the operator was
   * no longer at it. Something happened out over Tavrov and nobody here saw it.
   */
  unwatched: {
    id: 'unwatched',
    title: 'ВАХТА ПРЕРВАНА',
    subtitle: 'THE WATCH WAS BROKEN OFF',
    plainTitle: 'THE FLIGHT LEFT THE PICTURE UNRESOLVED',
    plainSummary: () => 'The watch ended with STATE 01 still airborne and unaccounted for.',
    card: 'You are relieved at 0700 by a man from the district who has brought his own log.',
    lines: (r, character) => [
      'The watch ended with STATE 01 still airborne, south-east of Tavrov, outside the coverage of'
        + ' anything this sector still had on the air.',
      r.consoleLost
        ? 'Your position was struck while the engagement was running. What happened over the frontier'
          + ' after that happened without anybody from this sector watching it.'
        : 'The picture was lost before the aircraft cleared the frontier, and no set was left to'
          + ' reacquire it.',
      tapeLine(r),
      'The sector has recorded the flight as unresolved. There is a printed heading for that on the'
        + ' form, and it has been used four times this month.',
      `${householdSubject(character)} had no notification. The line is down and there is no crew`
        + ' for it.',
    ],
  },
};

/** One line for the campaign menu once the epilogue has been flown. */
export function flightEndingSummary(endingId) {
  const ending = FLIGHT_ENDINGS[endingId];
  if (!ending) return null;
  return `${ending.title} · ${ending.subtitle}`;
}
