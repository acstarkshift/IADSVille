/**
 * How the last watch ends.
 *
 * The final scenario puts two raids in the air eleven minutes apart on axes a
 * hundred and seventeen kilometres apart, gives you twenty-six rounds against
 * twenty-seven aircraft, and hands you an order about which of the two places
 * matters. One battery — the long-range battalion sitting exactly between the
 * cities — can technically reach both, and cannot possibly stop both. That is
 * the point of it being there.
 *
 * There is no clean way out, and this module does not pretend otherwise. Every
 * ending costs something that cannot be got back: the obedient one costs the
 * village you are from, the defiant one costs everything the state can take
 * from you, and the two in between cost some of each. Even the near-impossible
 * outcome where both cities are largely held is not a victory — the political
 * section simply asks how you knew where to be.
 *
 * Which ending you get is read off what you actually shot at. Nothing asks you
 * to declare a choice, because nobody would.
 */

import { ASSET_TYPES } from './config.js';
import { districtOf, householdOf, CAPITAL } from './character.js';

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

  return {
    villeHarm,
    palaceHarm,
    // "Held" means the place is still a place. A defended town under a raid of
    // ten aircraft does not come through unmarked, and pretending otherwise
    // would make the only achievable outcome the obedient one.
    villeHeld: villeHarm < 0.42,
    palaceHeld: palaceHarm < 0.42,
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
export function endingFor(result) {
  const r = readFinale(result);
  if (r.villeHeld && r.palaceHeld) return ENDINGS.exemplary;
  if (r.villeLost && r.palaceLost) return ENDINGS.collapse;
  if (r.palaceHeld && !r.villeHeld) return ENDINGS.obedient;
  if (r.villeHeld && !r.palaceHeld) return ENDINGS.defiant;
  return ENDINGS.divided;
}

/**
 * Build the ending as displayable text for this particular soldier.
 * Written as file entries and radio traffic, never as narration — the state
 * describes what happened to you in the same register it describes everything.
 */
export function composeEnding(result, character, { narrativePressure = true } = {}) {
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

  /** Everything went. */
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
      'The raid was twenty-seven aircraft against six batteries and twenty-six rounds. The review will'
        + ' not record this, because the review is about you.',
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
