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
      'Your expenditure for the watch was queried within the hour. The query is a standard form'
        + ' with a box for the number of rounds spent outside the freeze, and a box for the reason'
        + ' that is four lines long.',
      'The clerk who brought it up from signals has done this before. He said nobody reads the'
        + ' reason, and that you should write "target misidentified", because that one goes through'
        + ' without a second signature.',
      'He also said, on his way out, that the district allocation had already been spent when the'
        + ' quarter began.',
    ],
    /*
     * The middle of this document is about a query into rounds you spent
     * outside the freeze, and an operator who obeyed the freeze spent none.
     * That player used to read two paragraphs about a form they never
     * received. They get the other true document instead; the last paragraph
     * is the revelation and fires either way.
     */
    linesFor: (result) => {
      const all = REVELATIONS.freeze.lines;
      const outside = (result?.stats?.roundsAgainstFreeze ?? 0)
        + (result?.stats?.roundsAgainstOrder ?? 0);
      if (outside > 0) return all;
      return [
        all[0],
        'Your expenditure for the watch was queried within the hour and the query was closed the'
          + ' same evening, because nothing of yours was outside the freeze. The clerk who brought'
          + ' the returns up from signals said he had expected more paper from this sector, and'
          + ' that a quarter with no queries in it draws an inspection in the spring.',
        all[3],
      ];
    },
  },

  border: {
    id: 'border',
    after: 'across-the-line',
    tm: 'КООРДИНАТЫ',
    title: 'THE GRID REFERENCE',
    lines: [
      'The strays were logged as strays. Two rounds, both malfunctioning in the same way, both'
        + ' malfunctioning onto the same grid reference six kilometres beyond a national border,'
        + ' four hours apart.',
      'You looked the grid reference up. It is not in an intelligence product. It is in the sector'
        + ' target folder, which sits on an open shelf because everything in it is our own ground'
        + ' and there is nothing in there to protect.',
      'It is written on the inside back cover by hand, under no heading, in a folder that has no'
        + ' business containing a point in Listonia at all.',
      'Somebody wrote those coordinates down before the war started. Two rounds have now been put'
        + ' on them, and the order you were given was issued to keep the sector away from the point'
        + ' while it was done.',
    ],
  },

  ledger: {
    id: 'ledger',
    after: 'ville-under-fire',
    tm: 'ВЕДОМОСТЬ',
    title: 'THE RETURN',
    lines: [
      'A depot return crossed your desk during the resupply that did not arrive. It was not'
        + ' addressed to you. It was in the folder underneath one that was.',
      'It shows the sector holding four hundred and twelve rounds across six magazines. You have'
        + ' signed for what is in those magazines every week for a year. There are not four hundred'
        + ' and twelve rounds in this sector, and there are not two hundred.',
      'The return is not a forgery. It is properly countersigned at three levels, which means the'
        + ' number was correct when it was written and has been correct ever since, in the only'
        + ' sense the ministry recognises.',
      'You put the folder back the way it was, and you were out of the room before you had decided'
        + ' to be.',
    ],
  },

  /**
   * The civil transit, paid off.
   *
   * Watch eight orders the operator to fire on an airliner because there is a
   * person aboard subject to a detention order. Until this document that order
   * was answered by nothing at all — a row in a ledger and a number in a
   * score. It lands on watch nine because a district commander has the
   * signals annex on his desk, and because Four Sectors is the watch about
   * orders given to people you cannot see.
   */
  passenger: {
    id: 'passenger',
    after: 'four-sectors',
    tm: 'ОРДЕР НА ЗАДЕРЖАНИЕ',
    title: 'THE DETENTION ORDER',
    lines: [
      'The detention order that was read to you on the net has a file number, and the file number'
        + ' is printed in the district signals annex, which is circulated to every headquarters'
        + ' every Monday.',
      'The name on it is a customs official from Kubin. He is forty-four years old and he is'
        + ' described in the annex as a departmental employee under investigation for irregularities'
        + ' in the recording of freight.',
      'The order is dated three days before the transit was filed. Nobody knew on the Tuesday which'
        + ' aircraft he would be on.',
      'The annex lists him under a heading for persons whose departure is not to be permitted. There'
        + ' are eleven names under that heading and four of them work in freight.',
    ],
  },

  movement: {
    id: 'movement',
    after: 'reinforce-the-capital',
    tm: 'ПЕРЕМЕЩЕНИЕ',
    title: 'THE MOVEMENT ORDER',
    lines: [
      'The order that took your battalion is numbered, and orders in that series run consecutively,'
        + ' so the ones on either side of it exist. A movement order is freight paperwork, and'
        + ' freight paperwork is filed where freight is handled, in a room with no lock on it.',
      'Same series, same week: road movement, palace annexe to Demobodedovo, freight class four —'
        + ' household and administrative effects. Eleven vehicles. The escort was found from the'
        + ' capital garrison, which is the garrison your battalion was sent to reinforce.',
      'The assessed threat to the capital, which is the stated reason for taking the battalion, is'
        + ' dated two days after that freight left.',
      'The air defence of the country was moved to cover a departure that had already happened.',
    ],
  },

  buyer: {
    id: 'buyer',
    after: 'two-cities',
    tm: 'ПЕРЕДАЧА',
    title: 'THE TRANSFER',
    lines: [
      'The transfer manifests are not secret. They are boring, and they are filed in a room nobody'
        + ' has a reason to enter, and you had a reason.',
      'Two hundred and sixty rounds left this sector across eleven months, on a schedule of routine'
        + ' redistributions. The same office signed off every one of them, and every one crossed the'
        + ' frontier within a week of being recorded.',
      'They were sold. The price is on the manifest, in a column headed ADMINISTRATIVE RECOVERY, and'
        + ' the money was recovered by an office in Mostrograd that does not appear on the'
        + " ministry's establishment. Its address does appear: it is the point of origin on a"
        + ' freight movement order you have also read.',
      'This is what the expenditure freeze was for. The freeze exists so that the magazines are'
        + ' never opened and counted while there is still somebody to count them in front of.',
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
  if (known.includes('passenger')) {
    return 'You know the detention order was dated before the flight it was used on, and that the'
      + ' man named on it worked in freight.';
  }
  if (known.includes('ledger')) {
    return 'You know the depot returns do not reconcile, and you have not worked out what that'
      + ' means yet.';
  }
  if (known.includes('border')) {
    return 'You know the strays over Gorna were aimed, and that the order about the border was'
      + ' issued to keep you off the point while they landed.';
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
