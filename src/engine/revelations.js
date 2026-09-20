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

import { COMMAND } from './config.js';

/**
 * In campaign order. Each is handed over once, on completing the watch it is
 * keyed to — and it is only learned when the player opens it.
 *
 * `desk` is how the document lies on the desk between watches: what the plate
 * under it says, what a glance at it tells you before it is opened (never a
 * word of what is inside), and whether it is yours. A folder that is not
 * yours costs the file something to open, and the office writes down how
 * long you were alone with it. The documents used to assert, in the second
 * person, an investigation nobody performed — "you looked the grid reference
 * up", "you had a reason" — so every clause of agency below is now either a
 * thing that arrived or the one act the player actually takes, which is
 * picking the folder up.
 */
export const REVELATIONS = {
  freeze: {
    id: 'freeze',
    after: 'economy-of-force',
    tm: 'НАРЯД',
    /** Its own reference, on the corner of the sheet. */
    ref: 'ALLOC 219',
    title: 'THE ALLOCATION',
    desk: {
      plate: 'A QUERY FROM SIGNALS',
      gist: 'Brought up with the returns. It is addressed to you.',
      yours: true,
    },
    lines: [
      /*
       * This paragraph used to open "The district hospital took four weapons",
       * a fixed count, on an evening whose own ledger three minutes later said
       * three. Nothing on the result counts weapons per building, so the
       * document quotes what it can actually see — the return, and whether the
       * building is still there — and the two papers stop contradicting each
       * other about a night the player watched.
       */
      'The sector return for tonight lists the district hospital as an undesignated structure, and'
        + ' its casualties under a heading that does not require a name.',
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
      const hospital = (result?.assets ?? []).find((a) => a.type === 'hospital');
      // What the return says about the building, read off the building.
      const opening = !hospital || hospital.destroyed ? all[0]
        : (hospital.damagePct ?? 0) > 0
          ? 'The sector return for tonight lists the district hospital as an undesignated'
            + ' structure, and its casualties under a heading that does not require a name. The'
            + ' building itself is still standing.'
          : 'The sector return for tonight lists the district hospital as an undesignated'
            + ' structure. Nothing reached it, and the return would have read the same if'
            + ' something had.';
      const outside = (result?.stats?.roundsAgainstFreeze ?? 0)
        + (result?.stats?.roundsAgainstOrder ?? 0);
      if (outside > 0) return [opening, all[1], all[2], all[3]];
      return [
        opening,
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
    /*
     * THE EVENING AFTER, NOT THE EVENING OF.
     *
     * The twelve-to-ten cut put both hinges on one night, and the writer's
     * decision was that this folder is read on the evening after the merged
     * watch so that one desk does not carry two folders on the night the
     * player is already reading the expenditure query. Both orders still
     * arrive on the one watch; only the paper is staggered.
     *
     * THE DESK IT MOVES ONTO ALREADY HAS ONE. `ledger` is keyed to this same
     * watch, and there is no third evening to give it: six documents, five
     * evenings between the merged watch and the finale, and the last four are
     * anchored to the watch they are about — the resupply that did not
     * arrive, the detention order, the movement order, the manifests. So
     * Ville Under Fire's desk carries two folders, this one and the depot
     * return, and `revelationsAfter` returns both rather than the first of
     * them. That is the whole of the change: `revelationAfter` used to be a
     * `.find`, which would have handed over this one and silently dropped the
     * other with nothing failing anywhere. See panel9/conflicts.md §10.
     */
    after: 'ville-under-fire',
    tm: 'КООРДИНАТЫ',
    /** Its own reference, on the corner of the sheet. */
    ref: 'ANNEX 7-C',
    title: 'THE GRID REFERENCE',
    desk: {
      plate: 'THE SECTOR TARGET FOLDER',
      gist: 'It came up with the strays\' return. It is not yours to open.',
      yours: false,
      cost: -3,
    },
    lines: [
      'The strays were logged as strays. Two rounds, both malfunctioning in the same way, both'
        + ' malfunctioning onto the same grid reference six kilometres beyond a national border,'
        + ' four hours apart.',
      'The grid reference is not in an intelligence product. It is in the sector target folder,'
        + ' which came up to your desk with the strays\' return because the clerk files a query'
        + ' with the folder it refers to, and which sits on an open shelf the rest of the year'
        + ' because everything in it is our own ground and there is nothing in there to protect.',
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
    /** Its own reference, on the corner of the sheet. */
    ref: 'RETURN 88',
    title: 'THE RETURN',
    desk: {
      plate: 'A DEPOT RETURN, IN THE WRONG FOLDER',
      gist: 'Underneath one that was yours. It was not addressed to you.',
      yours: false,
      cost: -3,
    },
    lines: [
      'A depot return crossed your desk during the resupply that did not arrive. It was not'
        + ' addressed to you. It was in the folder underneath one that was.',
      'It shows the sector holding four hundred and twelve rounds across six magazines. You have'
        + ' signed for what is in those magazines every week for a year. There are not four hundred'
        + ' and twelve rounds in this sector, and there are not two hundred.',
      'The return is not a forgery. It is properly countersigned at three levels, which means the'
        + ' number was correct when it was written and has been correct ever since, in the only'
        + ' sense the ministry recognises.',
      'You put it back underneath the one that was yours, the way it came. The clerk who collects'
        + ' the folders in the morning counts them and does not read them.',
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
    /** Its own reference, on the corner of the sheet. */
    ref: 'ORDER 512',
    title: 'THE DETENTION ORDER',
    desk: {
      plate: 'THE DISTRICT SIGNALS ANNEX',
      gist: 'Circulated to every headquarters on Monday. Yours is one of them now.',
      yours: true,
    },
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
    /** Its own reference, on the corner of the sheet. */
    ref: 'MOVE 61-4',
    title: 'THE MOVEMENT ORDER',
    desk: {
      plate: 'THE MOVEMENT ORDER SERIES',
      gist: 'Three orders in one folder, from the freight office. Not yours.',
      yours: false,
      cost: -3,
    },
    lines: [
      'The order that took your battalion is numbered, and orders in that series run consecutively,'
        + ' so the ones on either side of it exist. A movement order is freight paperwork, and the'
        + ' freight office files a series together, so the folder that came up with yours has the'
        + ' two on either side of it in it.',
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
    /** Its own reference, on the corner of the sheet. */
    ref: 'TRANS 719',
    title: 'THE TRANSFER',
    desk: {
      plate: 'THE TRANSFER MANIFESTS',
      gist: 'Left open on the desk. The office that files them is dark.',
      yours: true,
    },
    lines: [
      'The transfer manifests are not secret. They are boring, and they are filed in a room with'
        + ' one clerk and no lock. Tonight they are on your desk, open, because the clerk went home'
        + ' at four and the room is dark.',
      'Two hundred and sixty rounds left this sector across eleven months, on a schedule of routine'
        + ' redistributions. The same office signed off every one of them, and every one crossed the'
        + ' frontier within a week of being recorded.',
      'They were sold. The price is on the manifest, in a column headed ADMINISTRATIVE RECOVERY, and'
        + ' the money was recovered by an office in Mostrograd that does not appear on the'
        + " ministry's establishment. Its address does appear: it is the point of origin on a"
        + ' freight movement order you have also read.',
      /*
       * The hook the district watch pulled — nothing forecast against Brasov
       * for eleven months, its commander chosen by the political section, a
       * standing order you will not be shown — paid, in the document that has
       * the road on it.
       */
      'They crossed at Brasov. The road out of the Brasov depot is the only crossing on the'
        + ' manifests, and the standing order the commander of that sector holds is a copy of the'
        + ' schedule they left on: nothing is to be engaged over that road on a night it is in'
        + ' use. Nothing has been forecast against Brasov for eleven months. Whoever has been'
        + ' buying has been careful of the road.',
      'This is what the expenditure freeze was for. The freeze exists so that the magazines are'
        + ' never opened and counted while there is still somebody to count them in front of.',
      'The palace you were ordered to hold above your own village was paid for out of the rounds you'
        + ' were not allowed to fire.',
    ],
  },
};

/**
 * The revelations that fire on finishing this watch, in campaign order.
 *
 * It was a `.find` until the twelve-to-ten cut, which is safe exactly as long
 * as no two documents share a watch — and when the border folder moved onto
 * Ville Under Fire's evening, the depot return that was already there would
 * have stopped firing with nothing in the suite or the smoke to say so. The
 * list is the shape that cannot do that.
 */
export function revelationsAfter(missionId) {
  return Object.values(REVELATIONS).filter((r) => r.after === missionId);
}

/** The first of them, for the callers that only ever want one. */
export function revelationAfter(missionId) {
  return revelationsAfter(missionId)[0] ?? null;
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
    return 'You know where the rounds went, who signed for them, what the freeze was protecting, and'
      + ' why nothing was ever forecast against Brasov.';
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
    /*
     * It used to go on: "That has been sitting badly since." The one line in
     * the corpus that told the player how to feel about a choice they had
     * just made, at the top of the brief on the watch after the first hinge,
     * against the tone rule at the head of epilogue.js. The fact stops here;
     * the player supplies the rest.
     */
    return 'You were ordered not to defend a hospital, and the order cost you almost nothing.';
  }
  return null;
}

/**
 * The document this watch puts on the desk, if the file does not already
 * hold it. Handing it over records nothing: the file learns it when the
 * player opens it (`readFolder`), which is the one act this story asks of
 * them outside a console, and a player who leaves the folder where it lies
 * finishes the campaign without it.
 */
export function learn(campaign, missionId) {
  return learnAll(campaign, missionId)[0] ?? null;
}

/** Everything this watch puts on the desk that the file does not already hold. */
export function learnAll(campaign, missionId) {
  campaign.revelations = campaign.revelations ?? [];
  return revelationsAfter(missionId)
    .filter((r) => !campaign.revelations.includes(r.id));
}

/**
 * Open the folder. The file records what you now know; and if the folder was
 * not yours, it records that you opened it, and charges for it on the same
 * scale the net charges for a radio check left unanswered. Returns the
 * document, or null if the file already held it.
 */
export function readFolder(campaign, revelationId) {
  const revelation = REVELATIONS[revelationId] ?? null;
  if (!revelation) return null;
  campaign.revelations = campaign.revelations ?? [];
  if (campaign.revelations.includes(revelation.id)) return null;
  campaign.revelations.push(revelation.id);
  const desk = revelation.desk ?? {};
  if (desk.yours === false && Number.isFinite(desk.cost) && desk.cost !== 0) {
    if (typeof campaign.standing === 'number') {
      campaign.standing = Math.max(COMMAND.minStanding,
        Math.min(COMMAND.maxStanding, campaign.standing + desk.cost));
    }
    campaign.character?.record?.push({
      kind: 'folder', id: revelation.id, at: campaign.character.watches, cost: desk.cost,
    });
  }
  return revelation;
}
