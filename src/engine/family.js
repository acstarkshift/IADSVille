/**
 * The letters that do or do not arrive.
 *
 * At enlistment the soldier names who is still in the Ville, and the household
 * table has promised ever since that the choice would be "referred to for the
 * rest of the campaign — in the letters that do or do not arrive". This module
 * is that promise kept.
 *
 * The post works the way everything in this service works: through the
 * political section. A commended file gets its letter unopened, and is told
 * so, because the not-opening is itself a favour with a ledger entry. An
 * ordinary file gets the letter opened and resealed, competently. A flagged
 * file gets a notice of withholding instead — the letter exists, has a
 * postmark, and is somewhere in the sector office being read by people it was
 * not written to — and the letter itself is released watches later under the
 * wrong seal, or is still held at the finale, where it becomes a number in a
 * clause. The condemned tier's residence-permit sentence ("You will be
 * informed of the outcome") is also closed here, one way or the other,
 * because a threat nothing ever resolves stops being a threat and starts
 * being set dressing.
 *
 * Nothing in this file is a lever. The family's post follows the file, the
 * file follows the player's answers on the net, and there is no way to farm a
 * letter — which is the point being made. Everything is deterministic and
 * driven off campaign state, modelled on revelations.js.
 *
 * The player never writes back. The traffic is one-way and monitored, all
 * campaign long, so that the epilogue's twenty-minute unmonitored telephone
 * call means what it means.
 *
 * Tone rule, unchanged: the letters are reported as read — the register of a
 * man summarising his own mail for a file he knows will see it, because his
 * mail already has.
 */

import { districtOf } from './character.js';

/* ---------------------------------------------------------------- letters */

/**
 * The correspondence, in campaign order. `after` names the watch (or watches —
 * first one completed wins) whose debrief the letter arrives with; `lines`
 * builds the body for the household chosen at enlistment.
 *
 * ctx: { hit: homeDistrictHit this watch, permit: current permit state,
 *        watch: 1-based watch number }.
 */
export const LETTERS = [
  {
    id: 'first-post',
    after: 'first-light',
    tm: 'ПИСЬМО ИЗ ВИЛЛЫ',
    title: 'A LETTER FROM THE VILLE',
    lines: (hh) => ({
      mother: [
        'Your mother writes that the weather has turned and the queue at the dispensary has moved'
          + ' indoors for the season. The stove is drawing well. Veselin\'s boy has been taken for'
          + ' the army too, and his mother has been impossible about it.',
        'She does not ask what you do at night.',
        'She closes the way she closes everything: all well here. She writes knowing somebody at the'
          + ' sector office reads it before you do, and she writes it anyway.',
      ],
      sister: [
        'Your sister writes that the younger one has started drawing aircraft, all of them flying'
          + ' away to the left, and that the elder has learned your rank and corrects anyone who'
          + ' gets it wrong.',
        'The mill quarter is well enough, she says, and so is everybody in it.',
        'She has numbered the sheets: 2 of 3, 3 of 3. She started doing that when pages began going'
          + ' missing in the post.',
      ],
      grandmother: [
        'Your grandmother\'s letter is six lines long. It covers the garden, the frost and the price'
          + ' of paraffin, and it ends on the sentence she has closed letters with since the last'
          + ' war: keep your boots dry.',
        'She does not name your posting, your service, or the war.',
        'She has written letters through a censor before. Nobody reading this one will get anything'
          + ' out of Vera that she did not mean to give them.',
      ],
      brother: [
        'Your brother\'s letter is mostly about the pump at the river road, which he has fixed, and'
          + ' the medical board, which he has appealed again.',
        'He asks what the service is like in exactly one sentence, then spends a paragraph saying it'
          + ' does not matter to him.',
        'He has underlined nothing, and Ilya underlines what he means.',
      ],
    }[hh]),
  },

  {
    id: 'dispensary',
    /** The fortnightly register arrives with whichever early watch lands first. */
    after: ['low-riders', 'solo-battery', 'weasel-hour'],
    tm: 'ОЧЕРЕДНОЕ ПИСЬМО',
    title: 'THE FORTNIGHTLY LETTER',
    lines: (hh) => [
      'The fortnightly letter covers the queue at the dispensary, the weather over the valley, and'
        + ' the price of flour against the price of paraffin.',
      'Aircraft have crossed the valley at night for three weeks. The letter does not mention them,'
        + ' and none of the letters ever has.',
      {
        mother: 'Your mother adds that she has repainted the kitchen, which she last did the'
          + ' month you enlisted.',
        sister: 'Nata adds that the children now sleep in the room facing away from the valley. She'
          + ' does not say why, only that it is the warmer room.',
        grandmother: 'Vera adds one line about the cellar: it has been aired and the shelves'
          + ' restocked. She does not say what for.',
        brother: 'Ilya adds that he has been up on the mill roof fixing the weathervane, and that'
          + ' you can see a long way from the mill roof.',
      }[hh],
      'It is signed the way every one of them is signed: all well.',
    ],
  },

  {
    id: 'hospital-road',
    after: 'economy-of-force',
    tm: 'ПИСЬМО О ДОРОГЕ',
    title: 'THE ROAD IS CLOSED FOR WORKS',
    lines: (hh) => [
      'The letter mentions in passing that the Kubin road is closed at the twenty-first kilometre'
        + ' for works, and that the dispensary run now goes the long way round, which adds an hour.',
      'Nobody in the Ville has seen any works.',
      {
        mother: 'Your mother has taken the long way round twice this week. It is the same queue at'
          + ' the far end of it, she reports, only an hour further away.',
        sister: 'The elder child asked Nata why the buses stop at the twenty-first kilometre. She'
          + ' writes that she told him it was works.',
        grandmother: 'Vera remarks that the last time that road was closed for works she was younger'
          + ' than you are now, and it was not works then either.',
        brother: 'Ilya walked out to the closure and was turned back by men who were not road men.'
          + ' He describes their boots in some detail.',
      }[hh],
    ],
  },

  {
    id: 'aftermath',
    after: 'ville-under-fire',
    tm: 'ПИСЬМО ПОСЛЕ НАЛЁТА',
    title: 'A LETTER, AFTER',
    lines: (hh, ctx) => [
      'This is the first letter since the night the sector log calls the main effort.',
      ctx.hit
        ? 'It is about repairs: the glazier\'s waiting list, the tarpaulin over the roof beam, and'
          + ' whose cart carried what. The night itself gets one sentence. There was some excitement'
          + ' here, it says, and nothing else in the letter admits that anything happened.'
        : 'It mentions the other quarters — the mill got it worst, and the river road — and then'
          + ' goes back to the dispensary queue. About your own street it says nothing at all, and'
          + ' it asks you nothing. That is new.',
      {
        mother: 'The handwriting is smaller than usual. The words are the same as always.',
        sister: 'The children have added a drawing. It is a house, with very heavy lines where'
          + ' the roof is.',
        grandmother: 'Vera\'s postscript is one line: the cellar shelving held. She had mentioned'
          + ' the cellar before.',
        brother: 'Ilya writes that he has been helping with the roofs, and that nobody has mentioned'
          + ' his heart murmur all week.',
      }[hh],
    ],
  },

  {
    id: 'shorter',
    after: 'four-sectors',
    tm: 'КОРОТКОЕ ПИСЬМО',
    title: 'A SHORTER LETTER',
    lines: (hh) => [
      'The letter is addressed to your rank, correctly, with the new appointment underneath it in'
        + ' brackets. The salutation used to be your name.',
      'It is one page: the dispensary, the weather, the road. It reads like the other letters with'
        + ' the warmth taken out of it, the way anybody writes to an office.',
      {
        mother: 'Nothing in it is wrong. The stove is still drawing well; she says so in the same'
          + ' words as last time.',
        sister: 'Nothing in it is wrong. Nata names both children and gives their ages, as though'
          + ' you might need reminding.',
        grandmother: 'Nothing in it is wrong. Vera has sent an inventory of the cellar, itemised,'
          + ' which is not a thing anybody puts in a letter.',
        brother: 'Nothing in it is wrong. Ilya has signed with his full name and added the word'
          + ' brother after it, the way you would sign a return.',
      }[hh],
    ],
  },

  {
    id: 'last-before',
    after: 'reinforce-the-capital',
    tm: 'ПОСЛЕДНЕЕ ПИСЬМО',
    title: 'THE LAST LETTER BEFORE',
    lines: (hh) => ({
      mother: [
        'Your mother writes that the valley has been loud at night, and that she has taken the'
          + ' photographs down off the west wall. For cleaning, she writes.',
        'She asks, for the first time since you enlisted, when you are next permitted to telephone.',
        'She closes: all well here. It is the fortieth time she has written that sentence and the'
          + ' first time it reads like a request.',
      ],
      sister: [
        'Nata\'s letter is mostly the children. The younger one\'s aircraft now fly to the right,'
          + ' toward the edge of the page. The elder has stopped correcting people about your rank.',
        'At the bottom, after her name, a line was started and then crossed out — neatly, so that'
          + ' you would see it had been crossed out.',
      ],
      grandmother: [
        'Vera\'s letter runs to nine lines, which for Vera is a speech. It covers the paraffin, the'
          + ' frost coming early, and the cellar.',
        'The ninth line: she has taken the enamel box down from the shelf — you know the one — and'
          + ' keeps it by the door now.',
        'She still will not discuss the last war. She has begun preparing for this one anyway.',
      ],
      brother: [
        'Ilya writes one page about the pump and one about the weather. Then, at the end and without'
          + ' any preamble: the board can keep its decision.',
        'He has joined the fire pickets at the mill. Nobody asks the pickets about their hearts.',
      ],
    }[hh]),
  },
];

export const letterById = (id) => LETTERS.find((l) => l.id === id) ?? null;

/* ---------------------------------------------------------------- notices */

/**
 * Not letters: the paperwork that stands where a letter should be. Bilingual
 * headings like everything else; the political section is nothing if not
 * correctly stencilled.
 */
const WITHHELD_NOTICE = {
  id: 'withheld-notice',
  tm: 'УВЕДОМЛЕНИЕ О ЗАДЕРЖАНИИ',
  title: 'NOTICE OF WITHHOLDING',
  lines: () => [
    'A letter addressed to you, posted from the Ville eleven days ago, is held by the sector'
      + ' political section pending assessment of your file.',
    'You are informed of this as regulation requires. The regulation does not require anything'
      + ' further, and nothing further is provided.',
  ],
};

const PERMIT_NOTICE = {
  id: 'permit-close',
  tm: 'РАЗРЕШЕНИЕ НА ПРОЖИВАНИЕ',
  title: 'THE RESIDENCE PERMIT',
  lines: () => [
    'The review of your family\'s residence permit is concluded. No action is taken.',
    'You have now been informed of the outcome, as undertaken. The review remains in the file.',
  ],
};

/** How each delivery is described on the envelope, so to speak. */
function dispositionNote(disposition) {
  return {
    unopened: 'Delivered. It was not opened first.',
    resealed: 'Delivered. The envelope has been opened and resealed. The resealing is competent.',
    released: 'Held by the political section and released without comment. The postmark and the'
      + ' delivery date disagree. The seal is not the original seal.',
  }[disposition] ?? null;
}

/* ---------------------------------------------------------------- state */

export function emptyFamily() {
  return {
    /** Letters that reached you: { id, at, disposition, excerpt }. */
    delivered: [],
    /** Letters the political section is sitting on: { id, sinceWatch }. */
    withheld: [],
    /** The residence-permit thread: 'standing' | 'review' | 'closed'. */
    permit: 'standing',
    permitClosedAt: null,
    /** Consecutive clean watches, for the release and permit machinery. */
    goodStreak: 0,
    /** The last thing the post did, for the next briefing to lean on. */
    lastDisposition: null,
    /** A concluded review still owes its one line of paperwork. */
    permitNoticeDue: false,
  };
}

/* ---------------------------------------------------------------- record */

function recordOnFile(campaign, id, disposition) {
  campaign.character?.record?.push({
    kind: 'family', id, at: campaign.character.watches, disposition,
  });
}

function letterPayload(template, disposition, hh, ctx, family) {
  const lines = template.lines(hh, ctx) ?? [];
  return {
    id: template.id,
    tm: template.tm,
    title: template.title,
    disposition,
    note: dispositionNote(disposition),
    heldCount: family.withheld.length,
    lines,
  };
}

function noticePayload(notice, disposition, family) {
  return {
    id: notice.id,
    tm: notice.tm,
    title: notice.title,
    disposition,
    note: null,
    heldCount: family.withheld.length,
    lines: notice.lines(),
  };
}

/**
 * Fold one finished watch into the family thread. Called from recordMission
 * with the tier the watch settled on; returns the debrief's letter card
 * payload, or null on a watch the post has nothing to say about.
 *
 * One card per debrief, by precedence: this watch's own letter (delivered or
 * withheld), then the release of a held letter, then the permit paperwork.
 * Deterministic — no RNG anywhere — and idempotent per letter: replays never
 * deliver the same letter twice.
 */
export function recordFamily(campaign, result, tierId) {
  if (!campaign.character) return null;
  campaign.family = { ...emptyFamily(), ...(campaign.family ?? {}) };
  const family = campaign.family;
  const watch = campaign.history.length;

  const good = tierId === 'commended' || tierId === 'satisfactory';
  const withholding = tierId === 'flagged' || tierId === 'condemned';

  // The residence permit. Opened by the condemned tier's own sentence;
  // closed after two clean watches, with its promised outcome: none.
  family.goodStreak = good ? (family.goodStreak ?? 0) + 1 : 0;
  if (tierId === 'condemned' && family.permit === 'standing') {
    family.permit = 'review';
  } else if (family.permit === 'review' && family.goodStreak >= 2) {
    family.permit = 'closed';
    family.permitClosedAt = watch;
    family.permitNoticeDue = true;
  }

  const seen = (id) => family.delivered.some((d) => d.id === id)
    || family.withheld.some((h) => h.id === id);
  const candidate = LETTERS.find((l) => [].concat(l.after).includes(result.missionId)
    && !seen(l.id));

  const ctx = {
    hit: !!result.stats?.homeDistrictHit,
    permit: family.permit,
    watch,
  };
  const hh = campaign.character.household;

  let payload = null;
  if (candidate && withholding) {
    family.withheld.push({ id: candidate.id, sinceWatch: watch });
    recordOnFile(campaign, candidate.id, 'withheld');
    payload = noticePayload(WITHHELD_NOTICE, 'withheld', family);
  } else if (candidate) {
    const disposition = tierId === 'commended' ? 'unopened' : 'resealed';
    const built = letterPayload(candidate, disposition, hh, ctx, family);
    family.delivered.push({
      id: candidate.id, at: watch, disposition, excerpt: built.lines[0] ?? '',
    });
    recordOnFile(campaign, candidate.id, disposition);
    payload = built;
  } else if (good && family.withheld.length) {
    const held = family.withheld.shift();
    const template = letterById(held.id);
    const built = letterPayload(template, 'released', hh, ctx, family);
    family.delivered.push({
      id: held.id, at: watch, disposition: 'released', excerpt: built.lines[0] ?? '',
    });
    recordOnFile(campaign, held.id, 'released');
    payload = built;
  } else if (family.permitNoticeDue) {
    family.permitNoticeDue = false;
    recordOnFile(campaign, 'permit', 'closed');
    payload = noticePayload(PERMIT_NOTICE, 'notice', family);
  }

  if (payload) {
    family.lastDisposition = { id: payload.id, disposition: payload.disposition, watch };
  }
  return payload;
}

/* ---------------------------------------------------------------- surfaces */

/**
 * One conditional line for the pre-watch briefing, beside the tier note.
 * Character-aware where the static brief arrays cannot be.
 */
export function briefLine(campaign, missionId) {
  const character = campaign.character;
  if (!character) return null;
  if (missionId === 'ville-under-fire') {
    const quarter = districtOf(character);
    return 'The main effort is coming down the valley tonight, and your people are in'
      + ` ${quarter.en}. The sector chart marks the crossing, the headquarters and the town. It`
      + ' does not mark which street they live on.';
  }
  if ((campaign.family?.permit ?? 'standing') === 'review') {
    return 'Your family\'s residence permit is still listed as under review. Nobody has written to'
      + ' you about it, and nobody will until there is something to write.';
  }
  return null;
}

/**
 * A family override for the quiet line before the shooting starts. Returns
 * null to let the tier note speak instead.
 */
export function familyBriefingNote(campaign, missionId = null) {
  const family = campaign.family;
  if (!family) return null;
  /*
   * Only on the watch after the campaign ended. This line used to print on
   * every briefing once an ending existed, including a replayed First Light,
   * where a sector office that has stopped reading anything is two watches in
   * the future.
   */
  if (campaign.ending && missionId === 'presidents-flight') {
    return 'No letter this week. The office that reads them first has stopped reading anything.';
  }
  const last = family.lastDisposition;
  if (last?.disposition === 'withheld' && last.watch === (campaign.history?.length ?? 0)) {
    return 'Somewhere in the sector office there is a letter addressed to you. The office knows'
      + ' what it says. You do not.';
  }
  return null;
}

/**
 * The clause the finale endings append to the household line when the post has
 * unfinished business — held letters, an unresolved permit. Null when every
 * thread is closed, which is the only way a thread is allowed to end here.
 */
export function familyClause(family) {
  if (!family) return null;
  const parts = [];
  const held = family.withheld?.length ?? 0;
  if (held) {
    parts.push(`${held === 1 ? 'One letter' : `${held} letters`} addressed to you`
      + ` ${held === 1 ? 'remains' : 'remain'} with the political section, to be forwarded when`
      + ' the assessment concludes.');
  }
  if (family.permit === 'review') {
    parts.push('The question of the residence permit is recorded as overtaken by events.');
  }
  return parts.length ? parts.join(' ') : null;
}
