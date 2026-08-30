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

  const postHarm = harm(result, 'post');

  return {
    villeHarm,
    palaceHarm,
    postHarm,
    /** You were not there at the end of it. */
    overrun: !!result.stats.postOverrun,
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
  if (r.villeHeld && !r.palaceHeld) return ENDINGS.defiant;
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
    standing: ending.standing,
    reading: r,
  };
}

/** The quarter a soldier's people live in, as a phrase. */
function homePhrase(character) {
  if (!character) return 'the village';
  return districtOf(character).en;
}

function householdPhrase(character) {
  if (!character) return 'your household';
  return householdOf(character).en;
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
    plainSummary: (r) => `The palace stands. The Ville took ${Math.round(r.villeHarm * 100)}% damage and ${r.casualties} casualties.`,
    standing: 14,
    lines: (r, character) => [
      `The presidential palace at ${CAPITAL.en} is undamaged. The state broadcast at 0600 described the`
        + ' defence of the capital as exemplary and did not mention the western valley.',
      `The Ville was struck through the night. ${r.casualties} casualties are recorded, which the sector`
        + ' returns list under the heading of an area of no designated defended places.',
      r.homeDistrictHit
        ? `The lists being compiled include ${homePhrase(character)}. You are not permitted to telephone.`
        : `The lists being compiled do not yet include ${homePhrase(character)}. They are not complete.`,
      'Sector command has recommended you for advancement. The recommendation cites your adherence to the'
        + ' priority of fires under difficult conditions.',
      `You are granted seven days' leave, to be taken at a destination of the ministry's choosing.`
        + ' The Ville is not on the list of permitted destinations while the area is being cleared.',
      `${householdPhrase(character)} — no notification has been received either way. Notification, where`
        + ' it is made, is made in writing.',
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
    plainSummary: (r) => `The Ville stands. The palace took ${Math.round(r.palaceHarm * 100)}% damage.`,
    standing: -45,
    lines: (r, character) => [
      `The presidential palace at ${CAPITAL.en} was struck at ${'0'}4:12 and is assessed as ${Math.round(r.palaceHarm * 100)}%`
        + ' destroyed. The state broadcast has not yet described this.',
      `The Ville is standing. ${r.casualties ? `${r.casualties} casualties are recorded` : 'No casualties are recorded'}`
        + ' in the valley, against a raid of nine aircraft.',
      r.againstOrder
        ? `The sector log shows ${r.againstOrder} rounds expended on tracks outside the designated priority`
          + ' of fires. The log is not in dispute; you transmitted the acknowledgement yourself.'
        : 'The sector log shows no acknowledgement of the priority of fires, and the transmission is on the tape.',
      'You are relieved of the watch and detained pending a hearing before a military tribunal of the'
        + ' political section. Your equipment has been signed for by your relief.',
      `${householdPhrase(character)} — reached by telephone from the crossing at first light. Everybody`
        + ' in the household is accounted for. The call was three minutes and was monitored.',
      'It is put to you at the hearing that you knew what you were doing. You have not disputed this.',
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
    plainSummary: (r) => `The palace took ${Math.round(r.palaceHarm * 100)}% damage; the Ville took ${Math.round(r.villeHarm * 100)}% and ${r.casualties} casualties.`,
    standing: -12,
    lines: (r, character) => [
      `Both places were struck. The palace is assessed at ${Math.round(r.palaceHarm * 100)}% damage and the`
        + ` Ville at ${Math.round(r.villeHarm * 100)}%, with ${r.casualties} casualties in the valley.`,
      'The review finds that fires were divided between a designated defended place and an area that was'
        + ' not one, and that this division reduced the effect achieved at both.',
      r.displaced
        ? 'It notes separately that the post displaced during the engagement, and that the battalion'
          + ' capable of reaching either city was therefore off the air for part of it. The note is'
          + ' entered without comment, which is the worst way to enter a note.'
        : 'It does not mention the third axis, or the strike package that came for this post, or what'
          + ' answering it cost the other two. Those aircraft are recorded as having been engaged.',
      'The finding is technically correct. It does not record how many aircraft were inbound, or how many'
        + ' rounds were on the rails, because those figures were not requested.',
      r.homeDistrictHit
        ? `${homePhrase(character)} is on the damage returns.`
        : `${homePhrase(character)} is not on the damage returns.`,
      `${householdPhrase(character)} — the sector has undertaken to forward any notification. It has`
        + ' undertaken this in writing, which is unusual, and you have not decided yet what that means.',
      'You remain on the watch roster. Nobody has said anything to you about it, which is the outcome'
        + ' most people in this service would take.',
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
    plainSummary: (r) => `Both places held: palace ${Math.round(r.palaceHarm * 100)}% damage, the Ville ${Math.round(r.villeHarm * 100)}%.`,
    standing: 6,
    lines: (r, character) => [
      `The palace is intact. The Ville is standing${r.casualties ? `, with ${r.casualties} casualties recorded` : ' and no casualties are recorded'}.`
        + ' Twenty-seven aircraft were committed against this sector and both places were held.',
      'The state broadcast describes the defence of the capital. It does not mention the valley, because'
        + ' the valley contains no designated defended places and therefore nothing happened there.',
      r.againstOrder
        ? `The political section observes that ${r.againstOrder} rounds were expended outside the priority`
          + ' of fires, and asks how you knew, before the western axis was detected, where to place your'
          + ' batteries. You have said that you did not know. This has been recorded.'
        : 'The political section has asked how the western axis came to be engaged at all. You have'
          + ' explained the geometry twice. It has been recorded both times.',
      `${householdPhrase(character)} — all accounted for. The line to the Ville was working by morning`
        + ' and you were permitted one call.',
      'You are not decorated for this. A decoration would require the citation to describe what was'
        + ' defended, and one of the two things you defended does not officially exist.',
      'Your file is annotated. The annotation is a single word and you are not shown it.',
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
    plainSummary: (r) => `You displaced and the post was not hit. The palace took ${Math.round(r.palaceHarm * 100)}% damage and the Ville ${Math.round(r.villeHarm * 100)}%, with ${r.casualties} casualties.`,
    standing: -38,
    lines: (r, character) => [
      'You ordered the displacement at the point where the third axis was committed, and the strike'
        + ' package arrived over an empty field forty minutes later. The post is intact. Every man and'
        + ' woman on it is intact.',
      `BASTION was off the air for the three and a half minutes that took, and for the eleven it needed`
        + ' afterwards to set up and acquire. Both raids ran through that window.',
      `The palace is assessed at ${Math.round(r.palaceHarm * 100)}% damage. The Ville is assessed at`
        + ` ${Math.round(r.villeHarm * 100)}%, with ${r.casualties} casualties recorded in the valley.`,
      r.homeDistrictHit
        ? `${homePhrase(character)} is on the damage returns.`
        : `${homePhrase(character)} is on the damage returns, along with the rest of it.`,
      `${householdPhrase(character)} — no notification. The line to the valley is down and the sector`
        + ' has no crew to spare for it.',
      'The review will establish that the displacement was correct by the manual. It will not ask the'
        + ' other question, and neither will anyone else, and you will be asked it every day for the'
        + ' rest of your life by nobody at all.',
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
    plainSummary: (r) => `The forward post was destroyed. The palace ended at ${Math.round(r.palaceHarm * 100)}% damage and the Ville at ${Math.round(r.villeHarm * 100)}%.`,
    standing: -55,
    lines: (r, character) => [
      'The third axis was not engaged in time. The forward post was struck while the battalion was'
        + ' still guiding, and the watch continued for another nineteen minutes without anybody on it.',
      `In that time the palace reached ${Math.round(r.palaceHarm * 100)}% damage and the Ville`
        + ` ${Math.round(r.villeHarm * 100)}%, with ${r.casualties} casualties in the valley. The`
        + ' batteries that were already engaged finished their engagements and then stopped, because'
        + ' nobody was left to give them anything else.',
      'You had two ways out of this and did not take either. Displacing would have cost the cities the'
        + ' only battery that could reach them. Fighting the third axis would have cost them the rounds.'
        + ' Neither is what happened.',
      `${householdPhrase(character)} — the notification, when it is made, will not be made to you.`,
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
    lines: (r, character) => [
      `The presidential palace is destroyed. The Ville is destroyed. ${r.casualties} casualties are`
        + ' recorded in the valley and the figure for the capital has not been released.',
      'The post is intact. Nobody attacked it in the end, or nobody attacked it successfully, and the'
        + ' distinction is not one the review will trouble itself with.',
      'The raid was twenty-five aircraft against six batteries and no resupply. The review will not'
        + ' record this, because the review is about you.',
      r.homeDistrictHit
        ? `${homePhrase(character)} was among the quarters struck.`
        : `${homePhrase(character)} was among the quarters struck. Every quarter was.`,
      `${householdPhrase(character)} — no notification. There is nobody at the sector office to ask.`,
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
