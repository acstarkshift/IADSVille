/**
 * What the operator finds out, and when.
 *
 * The campaign has an arc under the raids, and it runs from devotion to
 * knowledge. It is not delivered by anyone making a speech. It arrives the way
 * this kind of knowledge actually arrives: as a form, a figure that does not
 * reconcile, a remark from a clerk who assumed you already knew.
 *
 * Every one of these is anchored in something the player has already *felt*
 * before they are told it. The ammunition has been short since the third watch.
 * The allocation has been queried. Reloads have been denied. By the time the
 * ledger explains why, the player has spent hours inside the consequence, which
 * is the only way a revelation of this kind lands at all.
 *
 * Tone is the same as everywhere else in this game: bureaucratic understatement.
 * Nobody is villainous on the page. The documents are simply allowed to say what
 * they say.
 */

/** In campaign order. Each fires once, on completing the watch it is keyed to. */
export const REVELATIONS = {
  freeze: {
    id: 'freeze',
    after: 'economy-of-force',
    tm: 'НАРЯД',
    title: 'THE ALLOCATION',
    lines: [
      'The district hospital took four weapons. The sector return lists the building as an'
        + ' undesignated structure and the casualties under a heading that does not require a name.',
      'Your expenditure for the watch was queried within the hour. The query is a standard form. It'
        + ' asks you to account for rounds expended outside the freeze, and it has a box for the'
        + ' number and a box for the reason, and the box for the reason is four lines long.',
      'The clerk who brought it up from signals has done this before. He said, not unkindly, that'
        + ' nobody reads the reason, and that you should write "target misidentified" because that'
        + ' one goes through without a second signature.',
      'He also said — and this is the part you have not stopped thinking about — that the district'
        + ' allocation was spent before the quarter began. Not spent tonight. Spent before it began.',
    ],
  },

  border: {
    id: 'border',
    after: 'across-the-line',
    tm: 'КООРДИНАТЫ',
    title: 'THE GRID REFERENCE',
    lines: [
      'The strays were logged as strays. Two rounds, both malfunctioning in the same way, both'
        + ' malfunctioning onto the same grid reference eleven kilometres beyond a national border,'
        + ' four hours apart.',
      'You looked the grid reference up. Not in an intelligence product — in the sector target folder,'
        + ' which is on an open shelf because everything in it is our own territory and there is'
        + ' nothing in there to protect.',
      'It is in there. Handwritten, on the inside back cover, under no heading, in a folder that has'
        + ' no business containing a point in Listonia at all.',
      'Somebody wrote those coordinates down before the war. The word for what happened over Gorna is'
        + ' not "stray", and the order you were given about not engaging across the border was not'
        + ' about a border incident.',
    ],
  },

  ledger: {
    id: 'ledger',
    after: 'ville-under-fire',
    tm: 'ВЕДОМОСТЬ',
    title: 'THE RETURN',
    lines: [
      'A depot return crossed your desk during the resupply that did not arrive. It was not addressed'
        + ' to you; it was in the folder underneath one that was.',
      'It shows the sector holding four hundred and twelve rounds across six magazines. You have'
        + ' signed for what is in those magazines every week for a year. There are not four hundred'
        + ' and twelve rounds in this sector. There are not two hundred.',
      'The return is not a forgery. It is properly countersigned at three levels, which means the'
        + ' number was correct when it was written and has been correct ever since, in the only sense'
        + ' the ministry recognises.',
      'You put the folder back the way it was. You have thought since about how quickly you did that,'
        + ' and how little deciding was involved.',
    ],
  },

  movement: {
    id: 'movement',
    after: 'reinforce-the-capital',
    tm: 'ПЕРЕМЕЩЕНИЕ',
    title: 'THE MOVEMENT ORDER',
    lines: [
      'The order that took your battalion is numbered, and orders in that series are numbered'
        + ' consecutively, which means the ones on either side of it exist. A movement order is not'
        + ' an intelligence product. It is freight paperwork, and freight paperwork is filed where'
        + ' freight is handled, which is a room with no lock on it.',
      'Same series, same week: road movement, palace annexe to Demobodedovo, freight class four —'
        + ' household and administrative effects. Eleven vehicles. The escort was found from the'
        + ' capital garrison, which is the garrison your battalion was sent to reinforce.',
      'The assessed threat to the capital — the stated grounds for taking the battalion — is dated'
        + ' two days after the freight left.',
      'You have read the two documents in both orders and the sequence does not change: first the'
        + ' household effects, then the threat, then the guns. The air defence of this country was'
        + ' rearranged around a departure schedule, and the departure schedule came first.',
    ],
  },

  buyer: {
    id: 'buyer',
    after: 'two-cities',
    tm: 'ПЕРЕДАЧА',
    title: 'THE TRANSFER',
    lines: [
      'The transfer manifests are not secret. They are simply boring, and filed in a room nobody has'
        + ' a reason to enter, and you had a reason.',
      'Two hundred and sixty rounds left this sector across eleven months on a schedule of routine'
        + ' redistributions. Every one of them is signed off by the same office. Every one crossed the'
        + ' frontier within a week of the redistribution being recorded.',
      'They were sold. Not diverted, not lost, not misallocated — sold, at a price that is written on'
        + ' the manifest in a column headed ADMINISTRATIVE RECOVERY, and the sum recovered has been'
        + ' administratively recovered by an office in Mostrograd that does not appear on the'
        + " ministry's establishment. Its address does. It is the point of origin on a freight"
        + ' movement order you have also read.',
      'This is what the expenditure freeze was for. Not the war. The freeze exists so that the'
        + ' magazines are never opened and counted while there is still someone to count them in'
        + ' front of.',
      'The palace you were ordered to hold above your own village was paid for out of the rounds you'
        + ' were not allowed to fire.',
    ],
  },
};

/** The revelation that fires on finishing this watch, if any. */
export function revelationAfter(missionId) {
  return Object.values(REVELATIONS).find((r) => r.after === missionId) ?? null;
}

/** Everything the operator knows, in campaign order. */
export function knownRevelations(campaign) {
  return Object.values(REVELATIONS).filter((r) => (campaign.revelations ?? []).includes(r.id));
}

/**
 * A one-line summary of where the operator's understanding has got to, used at
 * the top of a briefing so the arc is legible without re-reading the documents.
 */
export function standing(campaign) {
  const known = knownRevelations(campaign).map((r) => r.id);
  if (known.includes('buyer')) {
    return 'You know where the rounds went, who signed for them, and what the freeze was protecting.';
  }
  if (known.includes('movement')) {
    return 'You know the household effects left the palace before the threat that justified guarding'
      + ' it was written down.';
  }
  if (known.includes('ledger')) {
    return 'You know the depot returns do not reconcile. You have not worked out what that means yet,'
      + ' or you have and would rather not have.';
  }
  if (known.includes('border')) {
    return 'You know the strays over Gorna were not strays, and that the order about the border was'
      + ' not about the border.';
  }
  if (known.includes('freeze')) {
    return 'You were ordered not to defend a hospital, and the order cost you almost nothing. That'
      + ' has been sitting badly since.';
  }
  return null;
}

/** Record a revelation on the campaign file. Returns it if it is new. */
export function learn(campaign, missionId) {
  const revelation = revelationAfter(missionId);
  if (!revelation) return null;
  campaign.revelations = campaign.revelations ?? [];
  if (campaign.revelations.includes(revelation.id)) return null;
  campaign.revelations.push(revelation.id);
  return revelation;
}
