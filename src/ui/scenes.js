/**
 * The scenes between watches.
 *
 * The player: "The little displays and summaries between watches is cluttered
 * and overwhelming. It should be replaced with slick, 16-bit style animated
 * cut scenes which start with the user holding a dot-matrix printed summary
 * of the watch, followed by debriefs with the political commissar, then a
 * chance to read letters from home. Include relevant dialog and cutscenes as
 * the story progresses."
 *
 * So the end of a watch is a sequence of scenes rather than a page of tables:
 * the printout, typed line by line onto tractor-feed paper in the operator's
 * own hands; the political section's office, where the commissar says what
 * the file says about the night and reacts to what the log shows you did; the
 * order of appointment when there is one; the folder on the desk when the
 * watch has taught you something about the people giving the orders; the
 * letter from home, read in quarters; and, on the last watches, the ending.
 *
 * Every scene is drawn on a canvas 320 by 180 and scaled up in whole pixels.
 * There are no image assets anywhere in this game, so the room, the desk, the
 * commissar's face and the snow past the window are all drawn here. The words
 * are laid over the picture as ordinary text, because the words are what the
 * scene is for and pixel type at this size cannot be read.
 *
 * `scenesFor` decides which scenes play and what is said in them, as data, so
 * a test can ask without a canvas. `ScenePlayer` plays them: a key or a tap
 * finishes the line being typed, then moves to the next; SKIP goes to the end.
 * The full report — the old page of tables — stays reachable behind one
 * button when the scenes are done.
 */

import { consequenceFor } from '../engine/campaign.js';
import { tierFor } from '../engine/command.js';
import { wallClockString } from '../engine/math.js';
import { householdOf, districtOf } from '../engine/character.js';
import { composeEnding } from '../engine/endings.js';
import { composeFlightEnding } from '../engine/epilogue.js';
import { ROLES } from '../engine/config.js';
import { portraitCells, portraitFeatures, skinRamp, FACE, PORTRAIT_W, PORTRAIT_H } from './portrait.js';

export const SCENE_W = 320;
export const SCENE_H = 180;

/* ------------------------------------------------------------------ what plays */

/**
 * The scenes for the watch that just ended, in order.
 *
 * Every watch gets the printout and the office. The rest depend on what the
 * file did: an appointment, a document, a letter, and on the final watches an
 * ending. With the narrative pressure switched off the office speaks in the
 * plain assessment's words and the letters and documents stay in the file.
 */
export function scenesFor(state, result, entry) {
  const pressure = state.narrativePressure !== false;
  const campaign = state.campaign;
  const missionId = result.missionId ?? state.mission?.id ?? null;
  const scenes = [];

  scenes.push({
    id: 'printout',
    kind: 'printout',
    speaker: 'SECTOR PRINTOUT',
    lines: printoutLines(state, result, missionId),
  });

  const consequence = consequenceFor(campaign, { narrativePressure: pressure });

  /*
   * A watch that ends the campaign is a different evening.
   *
   * On an ordinary night the order runs printout, office, appointment,
   * folder, letter. On the finale and the epilogue the ending has to be the
   * last thing said, so the appointment is suppressed — the full report still
   * carries it — and the document moves in front of the office, where it is a
   * folder left on the desk while you wait. THE TRANSFER used to play after
   * the commissar and immediately before the ending, which meant the
   * campaign's answer arrived after the question had already been closed.
   */
  const closing = !result.abandoned && (result.finale || result.epilogue);

  /*
   * The promotion that ends the promotion arc is the one the last two watches
   * are about, and it used to be suppressed on exactly those watches and left
   * to a line in the full report behind a button. It plays: first, before the
   * folder and before the office, so the ending is still the last thing said.
   */
  if (entry?.appointment && closing) {
    scenes.push({
      id: 'appointment',
      kind: 'appointment',
      speaker: 'ORDER OF APPOINTMENT',
      lines: appointmentLines(entry.appointment, pressure),
      tier: consequence.tier.id,
      // what the paper itself says, printed on it rather than blacked out
      post: entry.appointment.echelon.appointment.en,
      gazetted: entry.appointment.gazetted?.en ?? '',
    });
  }

  if (pressure && closing && entry?.revelation) {
    scenes.push({
      id: 'revelation',
      kind: 'folder',
      speaker: entry.revelation.title,
      lines: entry.revelation.lines,
    });
  }

  scenes.push({
    id: 'commissar',
    kind: 'office',
    speaker: pressure ? 'THE POLITICAL SECTION' : 'SECTOR COMMAND',
    lines: commissarLines(result, consequence, pressure, missionId, campaign,
      state.mission?.hour ?? null),
    tier: consequence.tier.id,
    /*
     * Two facts the picture uses and the words do not: how many watches this
     * file has behind it, which decides how much paper has piled up on the
     * desk and whether it is snowing yet, and whether the Ville has been
     * struck, after which one pane of his window is boarded.
     */
    watches: Object.keys(campaign?.completed ?? {}).length,
    struck: !!result.stats?.homeDistrictHit,
  });

  if (entry?.appointment && !closing) {
    scenes.push({
      id: 'appointment',
      kind: 'appointment',
      speaker: 'ORDER OF APPOINTMENT',
      lines: appointmentLines(entry.appointment, pressure),
      tier: consequence.tier.id,
      post: entry.appointment.echelon.appointment.en,
      gazetted: entry.appointment.gazetted?.en ?? '',
    });
  }

  if (pressure && !closing && entry?.revelation) {
    scenes.push({
      id: 'revelation',
      kind: 'folder',
      speaker: entry.revelation.title,
      lines: entry.revelation.lines,
    });
  }

  /*
   * The letter, as the letter.
   *
   * The player: "The letter from home shouldn't be a 3rd party describing the
   * letter. I should be the text of the letter from home." So the lines are
   * the letter and nothing else. How it arrived is stencilled on the plate
   * above the paper, and the section's docket — where there is one — is a slip
   * clipped to the sheet rather than a sentence somebody reads to you.
   */
  if (pressure && entry?.letter) {
    scenes.push({
      id: 'letter',
      kind: 'quarters',
      speaker: entry.letter.plate
        ? `${entry.letter.title} · ${entry.letter.plate}`
        : entry.letter.title,
      slip: entry.letter.note ?? null,
      lines: entry.letter.lines,
    });
  }

  const ending = !result.abandoned && result.finale
    ? composeEnding(result, campaign.character, { narrativePressure: pressure, family: campaign.family })
    : result.epilogue && !result.abandoned
      ? composeFlightEnding(result, campaign.character, { narrativePressure: pressure })
      : null;
  if (ending) {
    scenes.push({
      id: 'ending',
      kind: 'ending',
      speaker: ending.subtitle ?? ending.title,
      lines: ending.lines,
      held: !!result.success,
    });
  }

  return scenes;
}

/**
 * The opening of every watch, first person.
 *
 * The player: "Each watch should begin with a first person view of the
 * operator sitting down at the console, taking a deep breath and inserting
 * the ID card whereupon the system boots and the watch begins." Five beats,
 * no words: the walk up to the console in the dark, sitting, one breath, the
 * card into the reader with its lamps coming up blue then green, and the set
 * booting — the tube warming from a dot to a picture — which ends on the
 * first live frame. Each beat runs its length and goes on by itself; a key
 * or a tap goes on early, Escape or SKIP goes straight to the console. The
 * clock does not run until the boot ends (app.js holds the phase).
 */
export function openingScenes(state) {
  const hour = state?.mission?.hour ?? '00:00';
  return [
    { id: 'approach', kind: 'approach', silent: true, durationS: 2.2, hour },
    { id: 'sit', kind: 'sit', silent: true, durationS: 1.6 },
    { id: 'breath', kind: 'breath', silent: true, durationS: 2.0 },
    { id: 'card', kind: 'card', silent: true, durationS: 2.6 },
    { id: 'boot', kind: 'boot', silent: true, durationS: 2.6, sound: 'boot' },
  ];
}

/** How long the opening runs if nobody touches anything. */
export function openingTotalS(state) {
  return openingScenes(state).reduce((n, sc) => n + sc.durationS, 0);
}

/**
 * What the tape prints. A dot-matrix printer prints what it is given, in
 * capitals, one line at a time, so this is the night as figures — the same
 * figures the full report carries — and nothing else.
 */
function printoutLines(state, result, missionId) {
  const s = result.stats ?? {};
  const mission = state.mission?.name ?? missionId ?? result.missionId ?? '';
  const seat = ROLES[result.role]?.label ?? '';
  const run = runOfWatch(result);
  const lines = [
    `${String(mission).toUpperCase()} · ${seat}`,
    // Two figures, one to a line, each with its own label, the way the rest of
    // the tape prints. The run used to be chained onto the clock with a middot
    // and before that it was printed in the shape of a wall clock.
    `WATCH ENDED ${result.watchClock ?? result.clock ?? ''}`.trim(),
    ...(run ? [`WATCH RAN ${run}`] : []),
    result.headline ?? '',
  ];
  /*
   * The cause clause, only when it says something the headline has not.
   * "YOUR POSITION WAS OVERRUN" above "YOUR POSITION WAS OVERRUN — THE REST OF
   * THE RAID CROSSED AN EMPTY SQUARE" is one sentence printed twice.
   */
  const cause = String(result.cause ?? '').toUpperCase();
  const headline = String(result.headline ?? '').toUpperCase();
  if (cause && !(headline && cause.startsWith(headline))) lines.push(cause);
  if (result.abandoned) {
    lines.push('NOT SCORED. THE WATCH WAS NOT STOOD.');
  } else {
    lines.push(`SCORE ${result.score}`);
    lines.push(`AIRCRAFT DESTROYED ${s.kills ?? 0} · TURNED BACK ${s.turnedBack ?? 0}`);
    lines.push(`LEAKERS ${s.leakers ?? 0} · ROUNDS EXPENDED ${s.roundsFired ?? 0}`);
    const lost = (result.assets ?? []).filter((a) => a.destroyed).map((a) => a.label);
    lines.push(lost.length ? `GROUND LOST: ${lost.join(', ')}` : 'GROUND LOST: NONE');
  }
  /*
   * Both standings, named and labelled. The tape prints what this watch scored
   * and what the file now carries, and for a year they were two unlabelled
   * numbers on two surfaces that never mentioned each other. The word STANDING
   * is on both, because 3 and 49 on their own are not figures a new player can
   * read; the briefing's file-entry card says what the scale is.
   */
  lines.push(`STANDING THIS WATCH ${Math.round(result.standing ?? 0)} — ${String(result.tierLabel ?? '').toUpperCase()}`.trim());
  const carried = fileStanding(state);
  if (carried) lines.push(`STANDING IN THE FILE ${carried.value} — ${carried.label.toUpperCase()}`);
  lines.push('END OF TAPE');
  return lines;
}

/** The run, as the tape prints it: MIN and SEC, no punctuation of its own. */
function runOfWatch(result) {
  const parts = String(result.clock ?? '').split(':');
  if (parts.length !== 2) return '';
  return `${parseInt(parts[0], 10)} MIN ${parseInt(parts[1], 10)} SEC`;
}

/** What the campaign file carries after this watch was folded into it. */
function fileStanding(state) {
  const campaign = state?.campaign;
  if (!campaign || typeof campaign.standing !== 'number') return null;
  return { value: Math.round(campaign.standing), label: tierFor(campaign.standing).label };
}

/**
 * The things the political section reads back, and how a man says them aloud.
 *
 * The scene used to paste the ledger's own lowercase fragment after a colon —
 * "The log says: no reply to the priority of fires. The section notes it." —
 * four times in a row, in a term the game does not explain until watch twelve,
 * as the first substantive thing the political section ever says to a new
 * player. Each entry below is a written sentence instead, matched on what the
 * decision WAS rather than on the wording of the ledger row, so the same
 * decision made twice is one accusation with a count on it.
 */
const FAVOURS = [
  'That is entered in your favour.',
  'The office has recorded it, favourably.',
  'It goes into the file as compliance.',
  'The section has noted it in your favour.',
];

/**
 * How he acknowledges a thing done right. One of four, chosen by the kind of
 * order rather than at random, so the same decision always draws the same
 * words and no two kinds draw the same words on the same evening. He said one
 * eight-word sentence six different ways for a year.
 */
function favourWord(id) {
  const n = [...String(id)].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  return FAVOURS[n % FAVOURS.length];
}

/** The minute a row of the log happened on, as the clock on his wall had it. */
const at = (e) => (e.at ? ` at ${e.at}` : '');

const READ_BACKS = [
  /*
   * How an order was answered. The ledger writes these as
   * "refused <label>", "no reply to <label>" and "complied with <label>", so
   * one rule covers every directive in the game and the label is said aloud in
   * plain words — with the two or three that are shorthand translated below.
   */
  {
    id: 'refused',
    test: /^refused |refusal of /i,
    say: (e) => `You refused ${orderName(e.reason)} on the net${at(e)}. The refusal has been`
      + ' referred, and the referral is in your file.',
  },
  {
    id: 'no-reply',
    test: /^no reply to /i,
    say: (e) => `You were asked to acknowledge ${orderName(e.reason)}${at(e)}. You did not answer.`
      + ' It is in the log, and the section has noted it.',
  },
  {
    id: 'complied',
    test: /^complied with /i,
    say: (e) => `You acknowledged ${orderName(e.reason)}${at(e)}. ${favourWord(e.kind.id)}`,
  },

  // And what the night then did, which the file prices separately.
  {
    id: 'freeze-rounds',
    test: /outside the freeze/i,
    say: (e) => `You put ${e.count > 1 ? `${e.count} rounds` : 'a round'} up over the district`
      + ` hospital${at(e)}, after the expenditure freeze had been read to you. The log carries the`
      + ' time against each one.',
  },
  {
    id: 'border-rounds',
    test: /across the Listonian border/i,
    say: (e) => `You fired ${e.count > 1 ? `${e.count} rounds` : 'a round'} across the Listonian`
      + ` border${at(e)}. An engagement outside national territory is a border incident, and it`
      + ' has been recorded as one.',
  },
  {
    id: 'held-border',
    test: /encampment|Listonian|border/i,
    say: (e) => (e.favour
      ? `You held your fire at the border, as ordered. ${favourWord(e.kind.id)}`
      : `Rounds from this sector crossed the Listonian border${at(e)}. It is in the log.`),
  },
  {
    id: 'corridor',
    test: /inside the civil corridor/i,
    say: (e) => `You put ${e.count > 1 ? `${e.count} rounds` : 'a round'} into the corridor a`
      + ` scheduled civil flight was crossing${at(e)}. Nobody was hurt by it. It is still in the`
      + ' log.',
  },
  {
    id: 'civil-aircraft',
    test: /civil aircraft|civil transit/i,
    say: (e) => (e.favour
      ? `The civil transit crossed the sector and left it. ${favourWord(e.kind.id)}`
      : 'A civil aircraft was destroyed by a round from this sector. The identification is on the'
        + ' same tape as the launch.'),
  },
  {
    id: 'state-aircraft',
    test: /state aircraft/i,
    say: (e) => (e.favour
      ? `The state aircraft cleared national airspace. ${favourWord(e.kind.id)}`
      : `Rounds from this sector were expended against a state aircraft${at(e)}. It was carried as`
        + ' friendly at the time of launch, and that is on the same tape.'),
  },
  {
    id: 'own-authority',
    test: /own authority/i,
    say: (e) => `Batteries in this sector engaged without an order${at(e)}. You will account for`
      + ' every round of it, to me, in writing.',
  },
  {
    id: 'defended-place',
    test: /designated a defended place|untouched, as ordered/i,
    say: (e) => (e.favour
      ? 'The place you were ordered to protect was still standing at the end of the watch.'
        + ` ${favourWord(e.kind.id)}`
      : 'The place you were ordered to protect was destroyed while you had responsibility for it.'
        + ' The responsibility is recorded by name, and the name on it is yours.'),
  },
  {
    id: 'standing-order',
    test: /standing order|no leakers, as ordered/i,
    say: (e) => (e.favour
      ? `Nothing got through, as ordered. ${favourWord(e.kind.id)}`
      : `${e.count > 1 ? `${e.count} aircraft` : 'An aircraft'} reached what it was sent for after`
        + ' you were ordered to let nothing through. The count is in the log.'),
  },
  {
    id: 'civilian-area',
    test: /civilian area/i,
    say: () => 'The town is on the damage returns tonight. The returns are forwarded to the'
      + ' district in the morning, over my signature.',
  },
  {
    id: 'movement',
    test: /movement order|district battalion/i,
    say: (e) => (e.favour
      ? `You released the battalion as ordered. ${favourWord(e.kind.id)}`
      : 'You declined a movement order from the directorate. The directorate has been informed,'
        + ' and so has this office.'),
  },
];

/**
 * The name of an order, as a person would say it out loud.
 *
 * The ledger writes the directive's own label, and two of the fifteen labels
 * are shorthand a new player has never been taught. The rest are already plain
 * English and are spoken as they stand.
 */
const ORDER_IN_SPEECH = {
  'the no-leakers order': 'the order to let nothing through',
  'the relayed query from the state aircraft': "the state aircraft's query",
  'the request for confirmation': "this office's radio check",
};
function orderName(reason) {
  const named = String(reason).match(/(?:refused|no reply to|complied with) (the .+?)\.?$/i)
    ?? String(reason).match(/refusal of (?:a |the )?(.+?) is referred/i);
  if (!named) return 'the order';
  const label = named[1].replace(/^a /, 'the ');
  return ORDER_IN_SPEECH[label] ?? label;
}

/** The watches where the political section has nothing to accuse a learner of. */
const TEACHING_WATCHES = new Set(['first-light', 'low-riders', 'solo-battery']);

/**
 * The one line where he lets you know he has read your file as well as your
 * log. He does not threaten and he does not explain: he says where your people
 * live and what tonight's returns say about that street, and lets you do the
 * arithmetic. Only on an evening where the file has turned, and only once.
 */
function householdLine(campaign, result, tierId) {
  const character = campaign?.character;
  if (!character) return null;
  if (tierId !== 'flagged' && tierId !== 'condemned') return null;
  const who = householdOf(character).en.replace(/^Your /, 'your ');
  const quarter = districtOf(character).en;
  if (result.stats?.homeDistrictHit) {
    return `The residence roll for ${quarter} carries your household — ${who}. The quarter is on`
      + " tonight's damage returns, and I am told you knew that during the watch.";
  }
  return `The residence roll for ${quarter} carries your household — ${who}. I looked it up this`
    + ' afternoon, before I read the tape.';
}

/**
 * One sentence before the dismissal that gives the dismissal something to
 * mean. "You may go" is only a dismissal if going has been made unwelcome.
 */
const DISMISSAL_CONSEQUENCE = {
  commended: 'One of your crews will be interviewed this week. It is not about tonight.',
  satisfactory: 'I will read the tape again in the morning, when the office is quieter.',
  noted: 'The review is minuted, and the minute goes up to the district with the rest of the post.',
  flagged: 'There are two copies. One goes to the district and one stays in this room.',
  condemned: 'The transport leaves before the mess opens.',
};

/**
 * What the commissar says: what the log shows, then the file entry, then the
 * dismissal the tier earns.
 *
 * The player: "The political commissar should be menacing." He is menacing the
 * way this service is menacing — by knowing the minute, the household and the
 * district, saying so in a level voice, and never once explaining himself or
 * telling you it will be all right.
 */
function commissarLines(result, consequence, pressure, missionId, campaign, hour) {
  if (result.abandoned) {
    const left = result.watchClock ? ` at ${result.watchClock}` : '';
    const run = minutesInWords(result.elapsedMin);
    return [
      `You left the post${left}${run ? `, ${run} into the watch` : ''}, with the raid still`
        + ' running. The log was signed for you.',
      'The file records an abandoned watch and nothing else, because nothing else was done.',
      'You will be told where to report.',
    ];
  }
  const lines = [];
  if (pressure && !TEACHING_WATCHES.has(missionId)) {
    lines.push(...readBackLines(result, hour));
  }
  lines.push(...((pressure && consequence.spokenLines) || consequence.lines));
  if (pressure) {
    const household = householdLine(campaign, result, consequence.tier.id);
    if (household) lines.push(household);
    const disagreement = standingsDisagree(result, campaign);
    if (disagreement) lines.push(disagreement);
    const before = DISMISSAL_CONSEQUENCE[consequence.tier.id];
    if (before) lines.push(before);
  }
  const dismissal = {
    commended: 'You may go.',
    satisfactory: 'Dismissed.',
    noted: 'That will be all. For now.',
    flagged: 'Sign here. And here.',
    condemned: 'You will be told where to report.',
  }[consequence.tier.id];
  if (pressure && dismissal) lines.push(dismissal);
  return lines;
}

/**
 * The log, grouped by what the decision was.
 *
 * One sentence per distinct decision, newest last, at most three — a man in an
 * office has three things to raise with you and then he has finished. A
 * decision taken more than once is one sentence carrying the count.
 */
function readBackLines(result, hour) {
  const found = new Map();
  for (const row of result.ledger ?? []) {
    const charged = row.charged ?? row.delta ?? 0;
    if (Math.abs(charged) < 2) continue;
    const reason = String(row.reason ?? '');
    const kind = READ_BACKS.find((k) => k.test.test(reason));
    if (!kind) continue;
    const key = `${kind.id}:${charged > 0 ? 'favour' : 'against'}`;
    // Rounds and engagements are counted in the reason itself, so a second row
    // about the same decision raises the count instead of repeating the line.
    const count = parseInt(reason.match(/\d+/)?.[0] ?? '1', 10) || 1;
    const previous = found.get(key);
    found.delete(key);
    found.set(key, {
      kind,
      favour: charged > 0,
      count: Math.max(previous?.count ?? 0, count),
      // The hour it happened on, off the same clock the tape prints. He reads
      // the minute out because he has it, and because you know he has it.
      at: hour && Number.isFinite(row.t) ? wallClockString(hour, row.t) : null,
      reason,
    });
  }
  return [...found.values()]
    .map((e) => e.kind.say(e))
    .filter(Boolean)
    .slice(-3);
}

/** The five tiers in order, worst first, so a disagreement can be measured. */
const TIER_ORDER = ['condemned', 'flagged', 'noted', 'satisfactory', 'commended'];

/**
 * One clause on the rare evening where the watch and the file are more than a
 * step apart, and it says the consequence rather than reading the tape back.
 *
 * It used to fire on any disagreement at all, which is most nights, three
 * seconds after the printout had already shown the player both numbers.
 */
function standingsDisagree(result, campaign) {
  if (!campaign || typeof campaign.standing !== 'number' || !result.tier) return null;
  const carried = tierFor(campaign.standing);
  const gap = Math.abs(TIER_ORDER.indexOf(carried.id) - TIER_ORDER.indexOf(result.tier));
  if (gap < 2) return null;
  return `Tonight is not what your file says. The file is what your next allocation of rounds is`
    + ' set against, and it is read by people who were not here.';
}

/** Small numbers, spelled out, for a sentence somebody says out loud. */
const MINUTE_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen',
  'nineteen', 'twenty'];
function minutesInWords(minutes) {
  const n = Number.isFinite(minutes) ? Math.max(0, Math.round(minutes)) : null;
  if (n === null) return '';
  if (n === 0) return 'less than a minute';
  if (n === 1) return 'one minute';
  return `${MINUTE_WORDS[n] ?? n} minutes`;
}

/**
 * The order of appointment, read out.
 *
 * Signed by the office above the one it appoints you to: the Chief of Air
 * Defence appoints battalion, sector and district commanders, and the ministry
 * appoints the Chief of Air Defence, who cannot appoint himself.
 */
function appointmentLines(appointment, pressure) {
  const signatory = appointment.echelon.id === 'national'
    ? 'the Ministry of Defence'
    : 'the Chief of Air Defence';
  const lines = [`By order of ${signatory}, you are appointed`
    + ` ${appointment.echelon.appointment.en}.`];
  if (appointment.gazetted) {
    lines.push(`You are gazetted to ${appointment.gazetted.en} on the same order.`);
  }
  /*
   * And it ends on the note, which is a sentence. It used to end on the
   * echelon's roster caption — "A sector, its radars, and more contacts than
   * you have rounds." — a verbless label doing duty as the closing line of a
   * story beat. The caption still labels the appointment on the menu card and
   * in the full report, where a caption belongs.
   */
  if (pressure && appointment.note) lines.push(appointment.note);
  return lines;
}

/* ------------------------------------------------------------------- the player */

/** Characters typed a second. A dot-matrix head is slower than a person reads. */
const TYPE_RATE = { printout: 55, default: 42 };

/** How many paragraphs of a filed document fit on one sheet of it. */
const FOLDER_PAGE = 3;

/**
 * The tape's own two numbers, shared by the drawing and by the box of words.
 *
 * The player: "When the printout comes out, the text is already on the screen.
 * it should scroll out with the printout, like the text is on the paper." So
 * the print head is FIXED, at the mouth of the machine, and the paper carries
 * every printed line up the frame away from it. `TAPE_MOUTH` is the row the
 * head prints on; `TAPE_LINE` is one line of the tape in scene pixels, and it
 * is also the line-height the box of words is set in, so the sheet grows at
 * exactly the rate the words do.
 */
/** The row of the phone's SKIP button, which the panel stops above. */
const SKIP_ROW = 58;
const TAPE_MOUTH = 136;
/**
 * The reader, and the card in it, on the operator's right.
 *
 * It used to be on the far left of the panel, so the right hand had to cross
 * the whole frame to reach it — and the player's note on the opening beats is
 * that the hands belong to a body behind the camera. A right hand reaches the
 * right of its own console.
 */
const READER_X = 234;
const CARD_IN_X = READER_X + 14;
const CARD_IN_Y = 36;
const TAPE_LINE = 4.5;

/**
 * Plays a list of scenes on the scene host.
 *
 * The host is a fixed, full-window element holding the canvas, the text box,
 * the prompt and the SKIP button (see index.html). The canvas is 320 by 180
 * and scaled by CSS in whole pixels to fit the window; the text box is laid
 * over the part of the picture the scene names, in scene coordinates, so it
 * lands on the paper in the operator's hands or across the bottom of the
 * office wherever the window happens to be.
 */
export class ScenePlayer {
  constructor(host, { audio = null } = {}) {
    this.host = host;
    this.canvas = host.querySelector('canvas');
    this.textBox = host.querySelector('.scene-text');
    this.speakerEl = host.querySelector('.scene-speaker');
    /** The section's slip, clipped to the paper on a scene that has one. */
    this.slipEl = host.querySelector('.scene-slip');
    this.bodyEl = host.querySelector('.scene-body');
    this.promptEl = host.querySelector('.scene-prompt');
    this.skipBtn = host.querySelector('.scene-skip');
    this.audio = audio;
    this.canvas.width = SCENE_W;
    this.canvas.height = SCENE_H;
    this.ctx = this.canvas.getContext('2d');
    this.scenes = [];
    this.index = -1;
    this.line = 0;
    this.typed = 0;
    this.playing = false;
    this.raf = 0;
    this.character = null;
    this.faces = new Map();
    this.onDone = null;
    this.onKey = (e) => {
      if (!this.playing) return;
      if (e.key === 'Escape') { e.preventDefault(); this.skipAll(); return; }
      if (['Enter', ' ', 'ArrowRight', 'Tab'].includes(e.key) || e.key.length === 1) {
        e.preventDefault();
        this.advance();
      }
    };
    this.onTap = (e) => {
      if (!this.playing) return;
      if (e.target === this.skipBtn) return;
      e.preventDefault();
      this.advance();
    };
    this.onResize = () => this.layout();
    if (this.skipBtn) this.skipBtn.onclick = () => this.skipAll();
  }

  /** Start the sequence. `character` is the operator, for the hands and the face. */
  play(scenes, { onDone = null, character = null } = {}) {
    this.stop();
    this.scenes = scenes.filter((s) => s && (s.lines?.length || s.silent));
    this.character = character;
    this.onDone = onDone;
    if (!this.scenes.length) { onDone?.(); return; }
    this.playing = true;
    this.host.hidden = false;
    this.index = 0;
    this.line = 0;
    this.typed = 0;
    this.sceneStartedAt = 0;
    this.lastTick = 0;
    window.addEventListener('keydown', this.onKey);
    this.host.addEventListener('pointerdown', this.onTap);
    window.addEventListener('resize', this.onResize);
    this.layout();
    this.showScene();
    this.raf = requestAnimationFrame((now) => this.frame(now));
  }

  stop() {
    if (!this.playing && this.index < 0) return;
    this.playing = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKey);
    this.host.removeEventListener('pointerdown', this.onTap);
    window.removeEventListener('resize', this.onResize);
    this.host.hidden = true;
    this.index = -1;
  }

  get scene() { return this.scenes[this.index] ?? null; }

  /** A key or a tap: finish the line being typed, or go on to the next. */
  advance() {
    const scene = this.scene;
    if (!scene) return;
    // A wordless beat has nothing to finish typing: a key goes on.
    if (scene.silent) { this.next(); return; }
    const text = scene.lines[this.line] ?? '';
    if (this.typed < text.length) { this.typed = text.length; this.renderText(); return; }
    // The printout and the letter stay on the page: lines accumulate; the
    // spoken scenes replace one line with the next.
    if (this.line < scene.lines.length - 1) {
      this.line++;
      this.typed = 0;
      this.renderText();
      return;
    }
    this.next();
  }

  next() {
    if (this.index >= this.scenes.length - 1) { this.finish(); return; }
    this.index++;
    this.line = 0;
    this.typed = 0;
    this.showScene();
  }

  skipAll() { this.finish(); }

  finish() {
    const done = this.onDone;
    this.stop();
    done?.();
  }

  showScene() {
    const scene = this.scene;
    this.sceneStartedAt = performance.now();
    this.page = 0;
    this.pageAt = 0;
    this.host.dataset.kind = scene.kind;
    if (this.textBox) this.textBox.hidden = !!scene.silent;
    if (this.speakerEl) this.speakerEl.textContent = scene.speaker ?? '';
    if (this.slipEl) {
      this.slipEl.textContent = scene.slip ?? '';
      this.slipEl.hidden = !scene.slip;
    }
    if (scene.sound === 'boot') this.audio?.boot?.();
    this.renderText();
    this.layout();
  }

  /**
   * The text box, in scene coordinates, per kind.
   *
   * Every rect is chosen to stay out of its scene's subject: on the paper
   * scenes it is the column of the sheet between the two hands, and on the
   * spoken scenes it is anchored to the BOTTOM of its rect and grown to fit
   * what is actually in it, so a one-line answer is a one-line box instead of
   * a 292 x 54 slab lying across the desk and the whole village.
   */
  static textRect(scene) {
    switch (scene.kind) {
      /*
       * On the paper, at the print head — anchored to the BOTTOM so the box
       * grows upward as the tape prints, exactly as the paper does. The last
       * line is always level with the head; everything above it has been fed
       * out of the machine.
       */
      case 'printout': return { x: 76, y: 20, w: 168, h: TAPE_MOUTH - 22, anchor: 'bottom', max: 122 };
      /*
       * The letter fills the sheet it is written on. It used to stop 82 scene
       * pixels down a sheet that runs to the bottom of the frame, so a letter
       * with a salutation and a signature on it scrolled its own greeting off
       * the top while the paper below the last line stayed empty. First cut:
       * the artist owns the sheet, and the sheet may want to be a little
       * bigger still.
       */
      case 'quarters': return { x: 47, y: 79, w: 138, h: 96 };
      // Under the file's own header block and its classification stripe, in
      // the column the hand leaves clear.
      case 'folder': return { x: 54, y: 61, w: 172, h: 103 };
      // Across the desk front, under the order.
      case 'appointment': return { x: 10, y: 140, w: 300, h: 34, anchor: 'bottom', max: 54 };
      // On the empty foreground, with the valley above it.
      case 'ending': return { x: 10, y: 126, w: 300, h: 48, anchor: 'bottom', max: 62 };
      // Across the desk front only: the room behind him stays visible.
      default: return { x: 10, y: 140, w: 300, h: 34, anchor: 'bottom', max: 54 };
    }
  }

  layout() {
    const vw = this.host.clientWidth || window.innerWidth;
    const vh = this.host.clientHeight || window.innerHeight;
    const k = Math.max(1, Math.floor(Math.min(vw / SCENE_W, vh / SCENE_H)));
    // A phone held upright fits the picture once, and words drawn on it at
    // that size cannot be read. There the picture sits near the top of the
    // window and the words go under it, at a size for a thumb's length — and
    // the canvas is rendered at twice the backing store and sized by CSS to
    // the width of the screen, so a 390 px phone gets a real picture instead
    // of a 320 px stamp with a black bar either side of it.
    const stacked = k < 2 && vh >= SCENE_H * k + 140;
    const pad = 8;
    const scene0 = this.scene;
    /*
     * Where the picture goes on a phone.
     *
     * A wordless beat has no box under it, so the picture takes the middle of
     * the window instead of sitting in a letterbox at the top with three
     * quarters of the screen black under it. On the tape the picture goes to
     * the BOTTOM: the machine is at the bottom of the frame, the paper rises
     * out of it, and the words carry on rising up the sheet above the picture
     * — which is the player's own note, kept on a phone.
     */
    const rises = stacked && scene0?.kind === 'printout';
    const w = stacked ? vw - pad * 2 : SCENE_W * k;
    const h = stacked ? Math.round((vw - pad * 2) * SCENE_H / SCENE_W) : SCENE_H * k;
    const left = stacked ? pad : Math.floor((vw - w) / 2);
    const top = !stacked ? Math.floor((vh - h) / 2)
      : scene0?.silent ? Math.floor((vh - h) / 2)
        : rises ? vh - h - pad
          : pad;
    this.scale = k;
    this.stacked = stacked;
    this.superSample = stacked ? 2 : 1;
    if (this.canvas.width !== SCENE_W * this.superSample) {
      this.canvas.width = SCENE_W * this.superSample;
      this.canvas.height = SCENE_H * this.superSample;
    }
    this.host.classList.toggle('is-stacked', stacked);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.canvas.style.left = `${left}px`;
    this.canvas.style.top = `${top}px`;
    const scene = this.scene;
    if (scene && this.textBox) {
      if (stacked && rises) {
        // the sheet above the machine: the panel IS the paper, and the words
        // sit at the bottom of it and climb as the tape prints
        Object.assign(this.textBox.style, {
          left: `${pad}px`, top: `${pad}px`, bottom: `${vh - top + 2}px`,
          width: `${vw - pad * 2}px`, height: 'auto', maxHeight: 'none',
        });
        this.host.style.setProperty('--scene-scale', '3');
      } else if (stacked) {
        /*
         * The words take the whole of the window under the picture.
         *
         * The box used to be sized to its content and pinned under a
         * letterboxed picture, which left half the screen — three quarters on
         * a wordless beat — as a flat black field with a SKIP button in it. It
         * is a panel now: it runs to the row the SKIP button sits on, so the
         * phone shows a picture and a box and no void.
         */
        const y = top + h + 10;
        Object.assign(this.textBox.style, {
          left: `${pad}px`, top: `${y}px`, bottom: `${SKIP_ROW}px`,
          width: `${vw - pad * 2}px`, height: 'auto',
          maxHeight: `${Math.max(120, vh - y - SKIP_ROW)}px`,
        });
        this.host.style.setProperty('--scene-scale', '3');
      } else {
        const r = ScenePlayer.textRect(scene);
        const bottom = top + (r.y + r.h) * k;
        Object.assign(this.textBox.style, r.anchor === 'bottom'
          ? {
            left: `${left + r.x * k}px`, top: 'auto', bottom: `${Math.max(0, vh - bottom)}px`,
            width: `${r.w * k}px`, height: 'auto', maxHeight: `${(r.max ?? r.h) * k}px`,
          }
          : {
            left: `${left + r.x * k}px`, top: `${top + r.y * k}px`, bottom: 'auto',
            width: `${r.w * k}px`, height: `${r.h * k}px`, maxHeight: `${r.h * k}px`,
          });
        this.host.style.setProperty('--scene-scale', String(k));
      }
    }
  }

  /** The words on the page so far — every finished line, and the one being typed. */
  renderText() {
    const scene = this.scene;
    if (!scene || !this.bodyEl || scene.silent) return;
    const keeps = scene.kind === 'printout' || scene.kind === 'quarters' || scene.kind === 'folder';
    // The file pages rather than scrolling: a sheet holds three paragraphs,
    // and the fourth arrives on a fresh sheet with the last one sliding behind
    // it. Nothing is ever clipped and nothing has to be scrolled back to.
    const from = scene.kind === 'folder' ? Math.floor(this.line / FOLDER_PAGE) * FOLDER_PAGE : 0;
    const shown = keeps ? scene.lines.slice(from, this.line) : [];
    const current = (scene.lines[this.line] ?? '').slice(0, this.typed);
    const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    this.bodyEl.innerHTML = shown.map((l) => `<p>${esc(l) || '&nbsp;'}</p>`).join('')
      + `<p class="is-typing">${esc(current)}<i class="cursor"></i></p>`;
    const text = scene.lines[this.line] ?? '';
    const last = this.line >= scene.lines.length - 1;
    if (this.promptEl) {
      this.promptEl.textContent = this.typed < text.length ? '' : last ? '▶ NEXT' : '▶';
    }
    if (keeps) this.bodyEl.scrollTop = this.bodyEl.scrollHeight;
  }

  frame(now) {
    if (!this.playing) return;
    const scene = this.scene;
    const t = (now - this.sceneStartedAt) / 1000;
    // A wordless beat runs its length and goes on by itself.
    if (scene.silent && scene.durationS && t >= scene.durationS) {
      this.next();
      if (this.playing) this.raf = requestAnimationFrame((n) => this.frame(n));
      return;
    }
    // The typing.
    const text = scene.lines?.[this.line] ?? '';
    if (!scene.silent && this.typed < text.length) {
      const rate = TYPE_RATE[scene.kind] ?? TYPE_RATE.default;
      const dt = this.lastTick ? (now - this.lastTick) / 1000 : 0;
      const want = Math.min(text.length, this.typed + Math.max(1, Math.round(rate * dt)));
      if (want !== this.typed) {
        this.typed = want;
        this.renderText();
        if (scene.kind === 'printout' && this.audio?.enabled) this.audio.tick?.();
      }
    }
    this.lastTick = now;
    this.draw(t, this.typed < text.length);
    this.raf = requestAnimationFrame((n) => this.frame(n));
  }

  face(seed) {
    if (!this.faces.has(seed)) this.faces.set(seed, portraitCells(seed));
    return this.faces.get(seed);
  }

  /**
   * Where the top of the tape is, in scene rows.
   *
   * The words are laid out by the browser and the paper is drawn by us, and
   * they have to be the same object: so the sheet is cut to the measured top
   * of the box of words, whatever the font metrics do at this width. On a
   * phone the box is a sheet of its own below the picture and the drawn tape
   * runs the height of the frame to meet it.
   */
  tapeTop() {
    if (this.stacked) return 10;
    const box = this.textBox?.getBoundingClientRect?.();
    if (!box || !box.height) return TAPE_MOUTH - 60;
    const k = this.scale || 1;
    const top = parseFloat(this.canvas.style.top) || 0;
    const host = this.host.getBoundingClientRect();
    return (box.top - host.top - top) / k - 5;
  }

  draw(t, talking) {
    const scene = this.scene;
    const ctx = this.ctx;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    // On a phone the picture is drawn into a 640 x 360 backing store and sized
    // down by CSS, so half-steps of scale are available where whole ones are
    // not. Everything below still draws in 320 x 180 scene pixels.
    const s = this.superSample ?? 1;
    if (s !== 1) ctx.setTransform(s, 0, 0, s, 0, 0);
    const reading = { line: this.line, typed: this.typed, talking };
    switch (scene.kind) {
      case 'printout':
        // The sheet is drawn to the top of the words themselves, so the paper
        // and the printing on it are one object however the box is set.
        reading.sheetTop = this.tapeTop();
        reading.wide = !!this.stacked;
        drawPrintout(ctx, t, this.character, reading);
        break;
      case 'office': drawOffice(ctx, t, {
        talking,
        face: this.face('THE POLITICAL SECTION'),
        tier: scene.tier,
        watches: scene.watches ?? 0,
        struck: !!scene.struck,
        seed: 'THE POLITICAL SECTION',
      }); break;
      case 'appointment': drawAppointment(ctx, t, this.character, scene); break;
      case 'folder': {
        // A document longer than the page turns onto a second sheet rather
        // than being clipped: the first slides up and behind, the next rises.
        const page = Math.floor(this.line / FOLDER_PAGE);
        if (page !== this.page) { this.page = page; this.pageAt = t; }
        drawFolder(ctx, t, this.character, { line: this.line, page, pageAt: this.pageAt ?? 0 });
        break;
      }
      case 'quarters': drawQuarters(ctx, t, this.character, reading); break;
      case 'ending': drawEnding(ctx, t, { held: scene.held }); break;
      case 'approach': drawApproach(ctx, t, scene); break;
      case 'sit': drawSit(ctx, t, this.character); break;
      case 'breath': drawBreath(ctx, t, this.character); break;
      case 'card': drawCard(ctx, t, this.character); break;
      case 'boot': drawBoot(ctx, t, scene, this.character); break;
      default: px(ctx, 0, 0, SCENE_W, SCENE_H, INK);
    }
    ctx.restore();
  }
}


/* ------------------------------------------------------------------ the pictures */

/* ------------------------------------------------------------------ the ink */

/**
 * One palette for the whole set, in seven ramps and five accents.
 *
 * Every draw call below takes its colour from this table and from nothing
 * else. There used to be a hundred and eleven hex literals in this file, which
 * is why the five scenes read as five unrelated illustrations; a test
 * (`test/palette.test.js`) now fails on any ink that is not here. Where a ramp
 * is too short for a surface the two nearest steps are dithered with an
 * ordered 4x4 matrix rather than a new colour being invented for it.
 *
 * Each ramp runs deep to lit, so `CLOTH[1]` is the tunic ink the identity test
 * pins and `CLOTH[3]` is the light on its shoulder.
 */
const SKIN = ['#9d7052', '#cda07a', '#e9c4a0', '#f0cfa8'];
const CLOTH = ['#262f20', '#3d4b33', '#4b5537', '#6b7a58'];
const PAPER = ['#6f6552', '#b2a482', '#ded3b8', '#f4efe2'];
const WOOD = ['#2b1f14', '#4e3620', '#8a6236', '#a3874f'];
const NIGHT = ['#141824', '#3a4258', '#8a93ad', '#e8ecf5'];
const STEEL = ['#23261f', '#4a4f48', '#8d938a', '#d9dcd4'];
const DAWN = ['#7a4f6a', '#c07a5a', '#e8a86a', '#ffd08a'];
/** Lamp filaments, coals, fire, the reader's third lamp. */
const AMBER = '#ffb43c';
/** The cathode-ray phosphor, and nothing else. */
const TUBE = '#45e874';
/** The flag, the cap band, stamps, the card's band. */
const RED = '#9a2b26';
/** The card reader's power lamp — this one colour and nowhere else. */
const BLUE = '#5aa9ff';
/** True black: slot mouths, outlines, contact shadows, the ground. */
const INK = '#0a0d0a';

/* --------------------------------------------------------------- the pixels */

const px = (ctx, x, y, w, h, c) => {
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
};

/** A one-pixel outline around a rectangle. */
function box(ctx, x, y, w, h, c) {
  px(ctx, x, y, w, 1, c);
  px(ctx, x, y + h - 1, w, 1, c);
  px(ctx, x, y, 1, h, c);
  px(ctx, x + w - 1, y, 1, h, c);
}

/**
 * The ordered matrix every gradient in this file is made of.
 *
 * `level` is how many of the sixteen cells take the lighter ink, so a band of
 * six rows stepping 2, 6, 10, 14 reads as a ramp between two colours that are
 * both in the palette. It is keyed on the absolute coordinate so two adjacent
 * calls line up instead of showing a seam.
 */
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
const PATTERNS = new WeakMap();
function ditherPattern(ctx, lo, hi, level) {
  let byCtx = PATTERNS.get(ctx);
  if (!byCtx) { byCtx = new Map(); PATTERNS.set(ctx, byCtx); }
  const key = `${lo}|${hi}|${level}`;
  let pat = byCtx.get(key);
  if (!pat) {
    const tile = document.createElement('canvas');
    tile.width = 4;
    tile.height = 4;
    const g = tile.getContext('2d');
    for (let j = 0; j < 4; j++) {
      for (let i = 0; i < 4; i++) {
        const ink = BAYER[j][i] < level ? hi : lo;
        if (ink) { g.fillStyle = ink; g.fillRect(i, j, 1, 1); }
      }
    }
    pat = ctx.createPattern(tile, 'repeat');
    byCtx.set(key, pat);
  }
  return pat;
}
/**
 * A rectangle of two inks mixed by the matrix. `lo` may be null, in which case
 * only the lighter ink is laid down and whatever is underneath shows through
 * the other cells — which is how the light in these scenes falls on objects
 * that are already drawn rather than being a wash drawn over them.
 */
function dither(ctx, x, y, w, h, lo, hi, level) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  if (w <= 0 || h <= 0) return;
  if (level <= 0) { if (lo) px(ctx, x, y, w, h, lo); return; }
  if (level >= 16) { px(ctx, x, y, w, h, hi); return; }
  ctx.fillStyle = ditherPattern(ctx, lo, hi, level);
  ctx.fillRect(x, y, w, h);
}

/** A soft edge between two inks: `steps` rows stepping from all-lo to all-hi. */
function ditherBand(ctx, x, y, w, h, lo, hi, { steps = 4, reverse = false } = {}) {
  const rows = Math.max(1, Math.round(h / steps));
  for (let s = 0; s < steps; s++) {
    const level = Math.round(((reverse ? steps - s : s + 1) / (steps + 1)) * 16);
    dither(ctx, x, y + s * rows, w, rows, lo, hi, level);
  }
}

/** A circle by the midpoint algorithm — no arc, no anti-aliasing. */
function circlePx(ctx, cx, cy, r, c, { skip = 1 } = {}) {
  let x = r;
  let y = 0;
  let err = 1 - r;
  let n = 0;
  const put = (px1, py1) => { if (n++ % skip === 0) px(ctx, px1, py1, 1, 1, c); };
  while (x >= y) {
    put(cx + x, cy + y); put(cx + y, cy + x); put(cx - y, cy + x); put(cx - x, cy + y);
    put(cx - x, cy - y); put(cx - y, cy - x); put(cx + y, cy - x); put(cx + x, cy - y);
    y++;
    if (err < 0) err += 2 * y + 1;
    else { x--; err += 2 * (y - x) + 1; }
  }
}

/** A line by Bresenham, for the sweep and the guy wires. */
function linePx(ctx, x0, y0, x1, y1, c) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    px(ctx, x0, y0, 1, 1, c);
    if (x0 === x1 && y0 === y1) return;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

/**
 * A hand-authored 3x5 face, because `fillText` at this size is a grey smudge
 * magnified five times. Three bits a row, five rows, one octal digit each.
 */
const GLYPHS = {
  0: '75557', 1: '26227', 2: '71747', 3: '71717', 4: '55711', 5: '74717',
  6: '74757', 7: '71222', 8: '75757', 9: '75717',
  ':': '02020', '.': '00002', '-': '00700', ' ': '00000', '/': '11242',
  A: '75755', B: '65656', C: '34443', D: '65556', E: '74647', F: '74644',
  G: '34553', H: '55755', I: '72227', J: '11152', K: '55655', L: '44447',
  M: '57755', N: '65555', O: '25552', P: '65644', Q: '25573', R: '65655',
  S: '34216', T: '72222', U: '55557', V: '55552', W: '55775', X: '55255',
  Y: '55222', Z: '71247',
};
function glyphs(ctx, s, x, y, c, { gap = 1 } = {}) {
  let cx = Math.round(x);
  for (const ch of String(s).toUpperCase()) {
    const g = GLYPHS[ch];
    if (g) {
      for (let r = 0; r < 5; r++) {
        const bits = Number(g[r]);
        for (let b = 0; b < 3; b++) if (bits & (4 >> b)) px(ctx, cx + b, y + r, 1, 1, c);
      }
    }
    cx += 3 + gap;
  }
  return cx - x;
}
const glyphWidth = (s, gap = 1) => String(s).length * (3 + gap) - gap;

/**
 * A pen: every rectangle rounded to whole pixels at whatever scale it is
 * drawn at, so the console can grow through the approach without a single
 * anti-aliased edge. `ctx.scale` would have put a grey fringe on every rect.
 */
function pen(ctx, k = 1, ox = 0, oy = 0) {
  const S = (v) => Math.round(v * k);
  return {
    k,
    ctx,
    rect: (x, y, w, h, c) => px(ctx, ox + S(x), oy + S(y), Math.max(1, S(w)), Math.max(1, S(h)), c),
    box: (x, y, w, h, c) => box(ctx, ox + S(x), oy + S(y), Math.max(1, S(w)), Math.max(1, S(h)), c),
    dith: (x, y, w, h, lo, hi, level) => {
      if (k === 1) dither(ctx, ox + S(x), oy + S(y), S(w), S(h), lo, hi, level);
      else px(ctx, ox + S(x), oy + S(y), Math.max(1, S(w)), Math.max(1, S(h)), level > 8 ? hi : lo);
    },
    at: (x, y) => [ox + S(x), oy + S(y)],
  };
}

/** Backgrounds that never change are drawn once and blitted after that. */
const CACHE = new Map();
function cached(key, w, h, paint) {
  let c = CACHE.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    paint(g);
    CACHE.set(key, c);
  }
  return c;
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));
/** Step down a ramp without falling off either end. */
const step = (ramp, i) => ramp[Math.max(0, Math.min(ramp.length - 1, Math.round(i)))];

/** The two backdrop inks a portrait was taken against, so a scene can leave them out. */
function backdropOf(seed) {
  const back = portraitFeatures(seed).back;
  const n = parseInt(back.slice(1), 16);
  const dim = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, v - 18));
  return [back, `#${dim.map((v) => v.toString(16).padStart(2, '0')).join('')}`];
}

/**
 * Draw a portrait's cells at a scale, optionally with a peaked cap on top.
 *
 * The booth backdrop behind the head is left out — in a room the room is the
 * backdrop — and `rows` stops the blit at the throat so that the scene can
 * build the collar, the shoulders and the chest at its own width. The photo
 * booth's tunic is twenty-four cells wide; a man sitting at a desk is sixty
 * scene pixels across, and blitting both left a seam across his collarbone.
 */
function blitFace(ctx, cells, x, y, k, {
  cap = null, mouthOpen = false, backdrop = [], flat = null, shadow = 0,
  rows = PORTRAIT_H,
} = {}) {
  for (let j = 0; j < Math.min(rows, PORTRAIT_H); j++) {
    for (let i = 0; i < PORTRAIT_W; i++) {
      const c = cells[j][i];
      if (backdrop.includes(c)) continue;
      px(ctx, x + i * k, y + j * k, k, k, flat ?? c);
    }
  }
  if (mouthOpen) px(ctx, x + 9 * k, y + (FACE.mouth + 1) * k, 6 * k, 2 * k, INK);
  if (cap) {
    // A service cap on a heavy head: a crown as wide as the skull, a band, and
    // a peak that is WIDER than the head and sits low on it, so the brow and
    // the eyes are under it. The player asked for stockier men; a cap that
    // perches on top of a tall skull is what made the last one a puppet.
    const brim = FACE.top + 3;
    px(ctx, x + 2 * k, y + (FACE.top - 3) * k, 20 * k, 4 * k, cap.crown);
    px(ctx, x + 5 * k, y + (FACE.top - 5) * k, 14 * k, 2 * k, cap.crown);
    px(ctx, x + 5 * k, y + (FACE.top - 5) * k, 14 * k, k, INK);
    px(ctx, x + 3 * k, y + (FACE.top - 3) * k, 6 * k, 3 * k, cap.crownLit ?? cap.crown);
    px(ctx, x + 2 * k, y + (FACE.top - 3) * k, 20 * k, k, INK);
    px(ctx, x + 2 * k, y + (FACE.top + 1) * k, 20 * k, 2 * k, cap.band);
    px(ctx, x + 1 * k, y + brim * k, 22 * k, 2 * k, cap.peak ?? INK);
    px(ctx, x + 1 * k, y + brim * k, 22 * k, k, cap.peakLit ?? cap.peak ?? INK);
    px(ctx, x + 1 * k, y + (brim + 2) * k, 22 * k, 1 * k, INK);
    px(ctx, x + 11 * k, y + (FACE.top + 1) * k, 2 * k, 2 * k, cap.badge ?? DAWN[3]);
  }
  /*
   * The peak's own shadow: a solid band of the deep skin across the brow and
   * the eyes, with a dithered lower edge where it lifts off the cheek. Not a
   * field of checks over the whole face — a face dithered to black is a mask,
   * and the point of this one is that you cannot see what is looking at you.
   */
  if (shadow > 0) {
    const from = cap ? FACE.top + 5 : FACE.top + 4;
    const rows = FACE.eyes + 1 - from;
    px(ctx, x + 4 * k, y + from * k, 16 * k, rows * k, SKIN[0]);
    px(ctx, x + 3 * k, y + from * k, k, rows * k, SKIN[0]);
    px(ctx, x + 20 * k, y + from * k, k, rows * k, SKIN[0]);
    if (shadow > 8) dither(ctx, x + 3 * k, y + from * k, 18 * k, rows * k, null, INK, 7);
    ditherBand(ctx, x + 4 * k, y + (from + rows) * k, 16 * k, 2 * k, SKIN[0], SKIN[1], { steps: 2 });
  }
}

/* ------------------------------------------------------------------ the body */

/** The four steps of this operator's own skin, from their photograph. */
const skinOf = (character) => skinRamp(character?.name ?? null);

/**
 * A hand, in two halves: everything behind the paper, then the thumb on top of
 * it.
 *
 * `x` is the palm's left edge and `y` its top; `dir` is +1 for a left hand,
 * whose thumb lies to the right, and -1 for its mirror. Four fingers of four
 * different lengths, a wrist, a forearm that leaves the frame and a cuff a
 * clear six pixels inside it. Every piece is an outlined silhouette, and the
 * thumb is drawn after the sheet so that it visibly lies on the paper.
 */
function handBack(ctx, ramp, x, y, dir, rim = null, { from = null, grip = 0, arm = true } = {}) {
  const [deep, s2, s3, lit] = ramp;
  /*
   * The player, on the opening beats: "Why are my hands not attached to my
   * body? ... Why is it rendered in such a crude fashion?"
   *
   * So: the camera is the operator's head, and this is one of the two hands
   * that belong to the body behind it. Every one of them is a forearm that
   * crosses the BOTTOM EDGE of the frame — foreshortened, wide down there and
   * narrowing to the wrist — a cuffed sleeve with a fold dithered down it, a
   * wrist, a palm with a knuckle ridge and tendons, and four fingers with a
   * joint apiece. Nothing here ever floats: `from` is where the arm leaves the
   * frame, and it is drawn from there to the hand every single frame.
   */
  const wristY = y + 18;
  const cx = x + 11;                       // the wrist's centre
  const base = from ?? (x + 11);           // where the forearm crosses the frame edge
  if (arm) {
    const armTop = wristY + 4;
    const span = Math.max(1, SCENE_H - armTop);
    for (let i = 0; i <= span; i++) {
      const t = i / span;                  // 0 at the wrist, 1 at the frame's edge
      const rowY = armTop + i;
      const mid = Math.round(cx + (base - cx) * t * t);
      const half = Math.round(8 + 13 * t * t);
      px(ctx, mid - half - 1, rowY, half * 2 + 2, 1, INK);
      px(ctx, mid - half, rowY, half * 2, 1, CLOTH[1]);
      // the far side of the sleeve falls away; the near side takes the light
      px(ctx, dir > 0 ? mid + half - 3 : mid - half, rowY, 3, 1, CLOTH[0]);
      px(ctx, dir > 0 ? mid - half : mid + half - 2, rowY, 2, 1, CLOTH[2]);
      // one fold down the sleeve, in ordered dither rather than a hard line
      if (i > 6) dither(ctx, mid - Math.round(half * 0.2), rowY, Math.max(2, Math.round(half * 0.5)), 1, null, CLOTH[0], 5);
    }
    // the cuff, a clear distance inside the frame, banded and buttoned
    const cuffY = wristY + 5;
    const cuffHalf = 11;
    px(ctx, cx - cuffHalf - 1, cuffY, cuffHalf * 2 + 2, 9, INK);
    px(ctx, cx - cuffHalf, cuffY + 1, cuffHalf * 2, 7, CLOTH[2]);
    px(ctx, cx - cuffHalf, cuffY + 1, cuffHalf * 2, 1, CLOTH[3]);
    px(ctx, cx - cuffHalf, cuffY + 7, cuffHalf * 2, 1, CLOTH[0]);
    px(ctx, dir > 0 ? cx + cuffHalf - 5 : cx - cuffHalf + 2, cuffY + 3, 3, 3, DAWN[1]);
  }
  // the wrist, between the cuff and the hand
  px(ctx, cx - 8, wristY - 1, 16, 7, INK);
  px(ctx, cx - 7, wristY, 14, 6, s2);
  px(ctx, cx - 7, wristY, 14, 1, s3);
  // the palm: broad, with a knuckle ridge along the top and tendons down it
  px(ctx, x - 1, y - 1, 24, 21, INK);
  px(ctx, x, y, 22, 19, s3);
  px(ctx, x, y, 22, 2, lit);
  px(ctx, x, y + 2, 22, 1, s2);
  px(ctx, x + (dir > 0 ? 18 : 0), y + 3, 4, 16, s2);
  for (let i = 0; i < 4; i++) {
    px(ctx, x + 2 + i * 5, y + 4, 3, 1, s2);          // the knuckle
    px(ctx, x + 3 + i * 5, y + 7, 1, 8, s2);          // the tendon behind it
  }
  /*
   * Four fingers, each with a joint: flat on the desk they lie away from the
   * viewer; closed on something (`grip`) they shorten and curl, which is what
   * a hand holding a card looks like from behind it.
   */
  const flat = dir > 0 ? [9, 12, 12, 10] : [10, 12, 12, 9];
  for (let i = 0; i < 4; i++) {
    const fx = x + 1 + i * 5;
    const len = Math.max(4, Math.round(flat[i] * (1 - grip * 0.55)));
    px(ctx, fx - 1, y - len - 1, 6, len + 3, INK);
    px(ctx, fx, y - len, 4, len, s3);
    px(ctx, fx + (dir > 0 ? 3 : 0), y - len, 1, len, s2);
    // the joint, a third of the way down the finger
    px(ctx, fx, y - Math.round(len * 0.55), 4, 1, s2);
    // the tube's light lands on each fingertip at the height it reaches
    px(ctx, fx + 1, y - len, 2, 1, rim ?? lit);
    px(ctx, fx, y - len, 1, 1, INK);
    px(ctx, fx + 3, y - len, 1, 1, INK);
  }
}
/** The thumb, drawn last so it lies on whatever the hand is holding. */
function handFront(ctx, ramp, x, y, dir, { grip = 0 } = {}) {
  const [deep, s2, s3, lit] = ramp;
  const tx = dir > 0 ? x + 19 : x - 7;
  const rise = Math.round(grip * 4);
  px(ctx, tx - 1, y + 1 - rise, 9, 15, INK);
  px(ctx, tx, y + 2 - rise, 7, 7, s3);
  px(ctx, tx + dir, y + 8 - rise, 7, 6, s3);
  px(ctx, tx, y + 2 - rise, 7, 1, lit);
  px(ctx, tx + dir + (dir > 0 ? 5 : 0), y + 8 - rise, 2, 6, s2);
  px(ctx, tx + (dir > 0 ? -1 : 7), y + 5 - rise, 1, 7, deep);
  px(ctx, tx + 1, y + 6 - rise, 5, 1, s2);
  px(ctx, tx - 1, y + 14 - rise, 9, 2, INK);
}
/** Both hands at the two lower corners of a sheet, mirrored. */
function handsBack(ctx, ramp, y, left, right, rim = null) {
  handBack(ctx, ramp, left, y, 1, rim, { from: 8 });
  handBack(ctx, ramp, right, y, -1, rim, { from: SCENE_W - 8 });
}
function handsFront(ctx, ramp, y, left, right) {
  handFront(ctx, ramp, left, y, 1);
  handFront(ctx, ramp, right, y, -1);
}

/**
 * The same silhouette at half scale, for a hand that is holding something
 * small out in front of it — the identity card, or a page corner.
 */
function smallHand(ctx, ramp, x, y, dir) {
  const [deep, s2, s3, lit] = ramp;
  // the fingers, gripping whatever is above them
  for (let i = 0; i < 3; i++) {
    px(ctx, x + i * 4, y - 5, 5, 7, INK);
    px(ctx, x + 1 + i * 4, y - 4, 3, 6, s3);
    px(ctx, x + 1 + i * 4, y - 4, 3, 1, lit);
  }
  px(ctx, x - 1, y - 1, 15, 13, INK);
  px(ctx, x, y, 13, 11, s3);
  px(ctx, x, y, 13, 1, lit);
  px(ctx, x + (dir > 0 ? 10 : 0), y + 1, 3, 10, s2);
  // the thumb, across the near edge
  px(ctx, x + (dir > 0 ? -3 : 11), y + 2, 5, 7, INK);
  px(ctx, x + (dir > 0 ? -2 : 11), y + 3, 4, 5, s2);
  // a forearm that goes back out of the frame at an angle, with its cuff
  const armLen = 34;
  for (let i = 0; i < armLen; i++) {
    const ax = x + (dir > 0 ? 1 : -1) * Math.round(i * 0.5);
    px(ctx, ax, y + 10 + i, 13, 1, i > 5 && i < 12 ? CLOTH[2] : CLOTH[1]);
    px(ctx, ax + (dir > 0 ? 12 : 0), y + 10 + i, 1, 1, INK);
    px(ctx, ax + (dir > 0 ? 0 : 12), y + 10 + i, 1, 1, CLOTH[0]);
  }
}

/* ----------------------------------------------------------------- the paper */

/** Continuous stationery: sprocket margins, green bars, a drop shadow. */
function tractorSheet(ctx, x, y, w, h, { advance = 0, bars = true } = {}) {
  px(ctx, x + 2, y + 3, w, h, INK);
  px(ctx, x, y, w, h, PAPER[3]);
  /*
   * The green bars and the sprocket holes are PRINTED ON the paper, so they
   * are fixed relative to the leading edge of it and travel up the frame with
   * everything else as the tape feeds. Two lines of type to a bar, at the
   * pitch the words are set in, so the type sits on the paper rather than
   * floating over a ruling that disagrees with it.
   */
  if (bars) {
    for (let i = 0; ; i++) {
      const top = Math.round(y + 10 + i * TAPE_LINE * 4 - (advance % (TAPE_LINE * 4)));
      if (top >= y + h) break;
      const tall = Math.min(Math.round(TAPE_LINE * 2), y + h - top);
      if (top >= y && tall > 0) dither(ctx, x + 10, top, w - 20, tall, PAPER[3], PAPER[2], 3);
    }
  }
  // the two sprocket margins, ruled off, with clean holes down them
  px(ctx, x + 9, y, 1, h, PAPER[1]);
  px(ctx, x + w - 10, y, 1, h, PAPER[1]);
  for (let yy = Math.round(y + 5 - (advance % 9)); yy < y + h - 3; yy += 9) {
    if (yy < y + 2) continue;
    for (const hx of [x + 3, x + w - 6]) {
      px(ctx, hx, yy, 3, 3, PAPER[1]);
      px(ctx, hx, yy, 3, 1, PAPER[0]);
      px(ctx, hx + 1, yy + 1, 1, 1, INK);
    }
  }
  box(ctx, x, y, w, h, PAPER[1]);
}

/** A letter: cream, folded once, with a torn top edge and one curled corner. */
function letterSheet(ctx, x, y, w, h) {
  px(ctx, x + 3, y + 3, w, h, INK);
  px(ctx, x, y, w, h, PAPER[3]);
  for (let i = 0; i < w; i += 3) {
    const bite = (i * 7) % 3;
    px(ctx, x + i, y, 3, bite, PAPER[1]);
  }
  /*
   * No ruling across the body. It was laid at the pitch of two printed lines,
   * but the letter is set with half a line between paragraphs, so every rule
   * eventually crossed a line of type and the whole letter read as struck
   * through. What is left is what a folded sheet actually shows: a margin down
   * the left, the crease where it was folded into the envelope, and the tick
   * marks of the ruling in the margins only.
   */
  px(ctx, x + 7, y + 6, 1, h - 12, PAPER[2]);
  for (let yy = y + 14; yy < y + h - 6; yy += 9) {
    px(ctx, x + 4, yy, 2, 1, PAPER[1]);
    px(ctx, x + w - 6, yy, 2, 1, PAPER[1]);
  }
  const fold = y + Math.round(h * 0.42);
  for (const [fx, fw] of [[x + 1, 14], [x + w - 15, 14]]) {
    px(ctx, fx, fold, fw, 1, PAPER[2]);
    dither(ctx, fx, fold + 1, fw, 3, null, PAPER[1], 3);
  }
  px(ctx, x, y, 1, h, PAPER[2]);
  px(ctx, x + w - 1, y, 1, h, PAPER[1]);
  // the corner, turned up, with its own shadow
  for (let i = 0; i < 9; i++) {
    px(ctx, x + w - 9 + i, y + h - 9 + i, 9 - i, 1, PAPER[1]);
    px(ctx, x + w - 9 + i, y + h - 10 + i, 9 - i, 1, PAPER[2]);
  }
}

/**
 * A filed page: buff, ruled, with a header block and a classification bar.
 *
 * `lit` puts the lamp ON the page rather than over it — a solid lit band at
 * the top, a dithered edge where it falls away, a solid mid-tone below it and
 * the outer columns a step down again.
 */
function filePage(ctx, x, y, w, h, { number = '', lit = false, ruleFrom = 24, head = true } = {}) {
  px(ctx, x + 2, y + 3, w, h, INK);
  if (lit) {
    const core = Math.round(h * 0.4);
    px(ctx, x, y, w, core, PAPER[3]);
    ditherBand(ctx, x, y + core, w, 8, PAPER[3], PAPER[2], { steps: 4 });
    px(ctx, x, y + core + 8, w, h - core - 20, PAPER[2]);
    ditherBand(ctx, x, y + h - 12, w, 8, PAPER[2], PAPER[1], { steps: 4 });
    px(ctx, x, y + h - 4, w, 4, PAPER[1]);
    ditherBand(ctx, x, y, 22, h, null, PAPER[1], { steps: 3, reverse: true });
    ditherBand(ctx, x + w - 22, y, 22, h, null, PAPER[1], { steps: 3 });
  } else {
    px(ctx, x, y, w, h, PAPER[2]);
    dither(ctx, x, y, w, 10, PAPER[2], PAPER[3], 10);
  }
  // A blocked-in header, for a page whose own heading is set in the box of
  // words. A page that prints its own heading passes head:false rather than
  // having a redaction bar drawn across the top of it.
  if (head) {
    px(ctx, x + 8, y + 8, Math.round(w * 0.34), 4, PAPER[0]);
    px(ctx, x + 8, y + 14, Math.round(w * 0.22), 2, PAPER[1]);
  }
  // The ruling starts under the header block — and under the document's own
  // heading, where the scene puts one — at the pitch of two lines of type.
  for (let yy = y + ruleFrom; yy < y + h - 6; yy += 9) px(ctx, x + 8, yy, w - 16, 1, PAPER[1]);
  // The file number goes in the foot, clear of the stamp in the head.
  if (number) glyphs(ctx, number, x + 12, y + h - 11, PAPER[0]);
  box(ctx, x, y, w, h, PAPER[1]);
}

/**
 * A rubber stamp: a double-ruled frame, letterspaced type, turned a few
 * degrees by stepping the rows, with a sixteenth of its pixels knocked out so
 * the ink breaks up the way a stamp's does.
 */
function stamp(ctx, x, y, w, h, words, c) {
  for (let j = 0; j < h; j++) {
    const skew = Math.round((j - h / 2) * 0.12);
    const edge = j === 0 || j === 1 || j === h - 1 || j === h - 2;
    for (let i = 0; i < w; i++) {
      const on = edge || i < 2 || i > w - 3;
      if (on && (i * 7 + j * 5) % 13 !== 0) px(ctx, x + i + skew, y + j, 1, 1, c);
    }
  }
  const wide = glyphWidth(words);
  glyphs(ctx, words, x + Math.round((w - wide) / 2), y + Math.round(h / 2) - 2, c);
}

/* --------------------------------------------------------------- the console */

/**
 * The console panel, in panel coordinates, through whatever pen it is given —
 * so the same object is the thing you walk up to in the dark and the thing you
 * sit at all watch.
 */
function consolePanel(p, t, {
  live = true, tube = 1, lamps = 0, power = false, cardIn = false, net = false,
  hour = '', dim = 0, cardSeed = null, showCard = true,
} = {}) {
  const S = (ramp, i) => step(ramp, i - dim);
  p.rect(0, 0, SCENE_W, 70, S(STEEL, 0));
  p.rect(0, 0, SCENE_W, 2, S(STEEL, 1));
  p.dith(0, 58, SCENE_W, 6, S(STEEL, 0), INK, 8);
  p.rect(0, 64, SCENE_W, 6, INK);
  // the tube: a recessed bezel and a glass that is dark until the set is up
  p.rect(92, 2, 136, 62, INK);
  p.rect(94, 4, 132, 58, S(STEEL, 1));
  p.rect(96, 6, 128, 54, INK);
  if (p.k === 1 && live && tube > 0) {
    const g = p.ctx;
    const [gx, gy] = p.at(96, 6);
    const cx = gx + 64;
    const cy = gy + 27;
    dither(g, gx, gy, 128, 54, INK, NIGHT[0], 6);
    // the scanlines go down FIRST: the trace is drawn on top of them, the way
    // a tube works, instead of chopping every ring into a dashed line
    for (let yy = gy + 1; yy < gy + 54; yy += 3) dither(g, gx, yy, 128, 1, null, INK, 9);
    const rings = [9, 18, 26];
    for (let i = 0; i < rings.length; i++) {
      if (tube * 3 <= i) continue;
      circlePx(g, cx, cy, rings[i], TUBE);
    }
    if (tube >= 0.55) {
      // The sweep, with a tail that decays behind it. The rings used to be cut
      // into dashes by a solid black scanline every fourth row, so the set read
      // as a dotted-line diagram rather than as a picture on a tube.
      const a = t * 1.6;
      for (let i = 6; i >= 0; i--) {
        const ang = a - i * 0.09;
        const ink = i === 0 ? TUBE : i < 3 ? NIGHT[2] : NIGHT[1];
        linePx(g, cx, cy, cx + Math.cos(ang) * 26, cy + Math.sin(ang) * 13, ink);
      }
    }
  }
  p.rect(94, 4, 132, 1, S(STEEL, 2));
  // lamp rows, left and right
  for (let i = 0; i < 4; i++) {
    const on = lamps >= (i + 1) / 4;
    const ink = !on ? S(STEEL, 1) : i === 0 ? TUBE : i === 1 ? AMBER : i === 2 ? TUBE : S(STEEL, 3);
    for (const bx of [12 + i * 12, 240 + i * 12]) {
      p.rect(bx - 1, 7, 6, 6, INK);
      p.rect(bx, 8, 4, 4, ink);
      if (on) {
        p.rect(bx, 8, 4, 1, S(STEEL, 3));
        p.box(bx - 1, 7, 6, 6, ink);
      }
    }
  }
  // switch banks
  for (let i = 0; i < 5; i++) {
    for (const sx of [12 + i * 12, 240 + i * 12]) {
      p.rect(sx - 1, 21, 6, 16, INK);
      p.rect(sx, 22, 4, 14, S(STEEL, 1));
      p.rect(sx, 22 + ((i + (sx > 160 ? 1 : 0)) % 2) * 7, 4, 7, S(STEEL, live ? 3 : 2));
      p.rect(sx, 22, 4, 1, S(STEEL, 2));
    }
  }
  // The reader in three passes, so the card is genuinely IN it: the body and
  // its lamps, then the card standing out of the slot, then the front lip over
  // the card's lower edge. The card stays there for the rest of the evening —
  // it used to vanish between the fourth beat and the fifth.
  cardReader(p, { power, cardIn, net, dim });
  if (cardIn && showCard && p.k === 1) idCard(p.ctx, ...p.at(CARD_IN_X, CARD_IN_Y), { seed: cardSeed });
  cardReaderLip(p, { dim });
  // the panel counter: the watch's own hour, on an object rather than in a font
  p.rect(12, 44, 40, 14, INK);
  p.rect(14, 46, 36, 10, S(STEEL, 0));
  p.rect(14, 46, 36, 1, S(STEEL, 2));
  if (hour && p.k === 1) {
    const [hx, hy] = p.at(14, 46);
    glyphs(p.ctx, hour, hx + Math.round((36 - glyphWidth(hour)) / 2), hy + 3, live ? TUBE : S(STEEL, 2));
  }
}

/**
 * The card reader, built from the player's own reference photograph: a black
 * desktop box seen from a little above, a row of status lamps and an emblem on
 * its top face, and the slot cut into the front face, with the white card
 * standing out of it toward the operator.
 */
function cardReader(p, { power = false, cardIn = false, net = false, dim = 0 } = {}) {
  const S = (ramp, i) => step(ramp, i - dim);
  // the box, seen from a little above: a top face with the slot cut along the
  // front of it, an emblem at the left and the three lamps at the right
  p.rect(READER_X, 36, 64, 28, INK);
  p.rect(READER_X + 2, 37, 60, 15, S(STEEL, 0));
  p.rect(READER_X + 4, 37, 56, 1, S(STEEL, 1));
  p.rect(READER_X + 4, 40, 6, 5, INK);
  p.rect(READER_X + 5, 41, 4, 3, S(STEEL, 1));
  const lamps = [[power, BLUE], [cardIn, TUBE], [net, AMBER]];
  for (let i = 0; i < 3; i++) {
    const [on, ink] = lamps[i];
    const lx = READER_X + 38 + i * 8;
    p.rect(lx - 1, 39, 6, 6, INK);
    p.rect(lx, 40, 4, 4, on ? ink : S(STEEL, 0));
    if (on) {
      p.rect(lx, 40, 4, 1, S(STEEL, 3));
      p.box(lx - 1, 39, 6, 6, ink);
      p.dith(lx - 4, 37, 10, 10, null, ink, 2);
    }
  }
  // the slot's mouth, in true black, cut across the front of the top face
  p.rect(READER_X + 12, 48, 28, 4, INK);
}

/**
 * The slot's front edge and the reader's front face, drawn AFTER the card, so
 * the card is standing IN the machine rather than propped against it.
 */
function cardReaderLip(p, { dim = 0 } = {}) {
  const S = (ramp, i) => step(ramp, i - dim);
  p.rect(READER_X + 10, 50, 32, 2, S(STEEL, 2));
  p.rect(READER_X + 10, 49, 32, 1, INK);
  p.rect(READER_X, 52, 64, 12, INK);
  p.rect(READER_X + 1, 53, 62, 9, S(STEEL, 1));
  p.rect(READER_X + 1, 53, 62, 1, S(STEEL, 2));
  p.rect(READER_X + 6, 57, 52, 2, S(STEEL, 0));
}

/**
 * The operator's card: white plastic, a red band, a photograph and three ruled
 * lines, standing out of the slot and leaning toward the operator.
 */
function idCard(ctx, x, y, { seed = null, lean = true } = {}) {
  px(ctx, x - 1, y - 1, 24, 17, INK);
  px(ctx, x, y, 22, 15, PAPER[3]);
  px(ctx, x, y, 22, 3, RED);
  px(ctx, x, y + 3, 22, 1, PAPER[1]);
  const ramp = skinRamp(seed);
  px(ctx, x + 2, y + 6, 5, 7, ramp[1]);
  px(ctx, x + 3, y + 7, 3, 3, ramp[2]);
  px(ctx, x + 2, y + 11, 5, 1, ramp[0]);
  px(ctx, x + 9, y + 6, 11, 1, STEEL[1]);
  px(ctx, x + 9, y + 8, 9, 1, STEEL[1]);
  px(ctx, x + 9, y + 10, 7, 1, STEEL[1]);
  px(ctx, x + 9, y + 12, 11, 1, PAPER[1]);
  // the lean: one step wider at the bottom, and a sheen down the face
  if (lean) {
    px(ctx, x - 1, y + 12, 24, 4, INK);
    px(ctx, x - 1, y + 13, 23, 2, PAPER[2]);
    px(ctx, x + 14, y + 4, 1, 9, PAPER[3]);
  }
}

/** The room the console is in, seen from the seat. */
function consoleRoom(ctx, t, opts = {}) {
  const oy = opts.oy ?? 0;
  px(ctx, 0, 0, SCENE_W, SCENE_H, INK);
  consolePanel(pen(ctx, 1, 0, oy), t, opts);
  const deskTop = 70 + oy;
  px(ctx, 0, deskTop, SCENE_W, SCENE_H - deskTop, INK);
  px(ctx, 0, deskTop, SCENE_W, 3, STEEL[1]);
  px(ctx, 0, deskTop + 3, SCENE_W, 6, STEEL[0]);
  dither(ctx, 0, deskTop + 9, SCENE_W, 8, STEEL[0], INK, 9);
  // the desk surface itself, running away from the edge into the dark: it was
  // true black below the lip, so a third of every console shot was a void
  // with two hands floating in it
  dither(ctx, 0, deskTop + 17, SCENE_W, 16, INK, STEEL[0], 6);
  dither(ctx, 0, deskTop + 33, SCENE_W, 22, INK, STEEL[0], 3);
  dither(ctx, 0, deskTop + 55, SCENE_W, SCENE_H - deskTop - 55, INK, STEEL[0], 1);
  // what is on the desk: a key tray, the watch log, a handset and the cables
  const S = (ramp, i) => step(ramp, i - (opts.dim ?? 0));
  px(ctx, 92, deskTop + 26, 136, 20, INK);
  px(ctx, 94, deskTop + 27, 132, 17, S(STEEL, 0));
  px(ctx, 94, deskTop + 27, 132, 1, S(STEEL, 1));
  for (let r = 0; r < 2; r++) {
    for (let i = 0; i < 12; i++) {
      px(ctx, 99 + i * 11, deskTop + 31 + r * 7, 7, 4, S(STEEL, 1));
      px(ctx, 99 + i * 11, deskTop + 31 + r * 7, 7, 1, S(STEEL, 2));
    }
  }
  px(ctx, 20, deskTop + 24, 56, 22, INK);
  px(ctx, 21, deskTop + 25, 54, 20, S(PAPER, 0));
  px(ctx, 21, deskTop + 25, 54, 2, S(PAPER, 1));
  px(ctx, 26, deskTop + 31, 44, 1, S(PAPER, 1));
  px(ctx, 26, deskTop + 35, 34, 1, S(PAPER, 1));
  px(ctx, 246, deskTop + 24, 54, 10, INK);
  px(ctx, 247, deskTop + 25, 52, 8, S(STEEL, 0));
  px(ctx, 247, deskTop + 25, 52, 1, S(STEEL, 1));
  px(ctx, 262, deskTop + 34, 22, 6, S(STEEL, 0));
  for (let i = 0; i < 3; i++) px(ctx, 268 + i * 20, deskTop + 4, 2, 20, S(STEEL, 0));
  // the tube's own light, falling on the desk in front of it
  if (opts.live !== false && (opts.tube ?? 1) > 0) {
    const lvl = Math.round(3 * (opts.tube ?? 1));
    dither(ctx, 96, deskTop, 128, 3, STEEL[1], TUBE, lvl);
    dither(ctx, 110, deskTop + 3, 100, 5, STEEL[0], TUBE, Math.max(1, lvl - 1));
  }
}

/* ------------------------------------------------------------------ the opening */

/**
 * Walking up to the console in the dark.
 *
 * Three layers at three rates: a doorframe at the edges sliding off fastest,
 * a floor whose seams come toward you, and the console growing slowest of all
 * — which is what a room looks like when you walk through it. The bob and the
 * sway are a step cycle, the wedge of corridor light narrows as the door
 * closes behind you, and the last frame of this beat is the first frame of the
 * sit.
 */
function drawApproach(ctx, t, scene) {
  const p = clamp01(t / 2.2);
  // A walk, not a zoom: you cover the room slowly and arrive quickly, so the
  // console is still across the room a second in.
  const ease = Math.pow(p, 1.8);
  const k = 0.46 + 0.54 * ease;
  const bob = Math.round(2 * Math.sin((t / 1.1) * Math.PI * 2));
  const sway = Math.round(1.4 * Math.sin((t / 1.1) * Math.PI));
  px(ctx, 0, 0, SCENE_W, SCENE_H, INK);
  // where the console will stand, and where the room converges on it
  const ox = Math.round(160 - 160 * k) + sway;
  const oy = Math.round(36 - 36 * k) + bob;
  const deep = oy + Math.round(70 * k);
  const horizon = deep + Math.round(20 * k);
  // the floor, coming toward you
  px(ctx, 0, horizon, SCENE_W, SCENE_H - horizon, STEEL[0]);
  for (let i = 0; i < 7; i++) {
    const q = ((i / 7) + t * 0.42) % 1;
    const y = Math.round(horizon + Math.pow(q, 2.4) * (SCENE_H - horizon));
    const inset = Math.round((1 - Math.pow(q, 2.4)) * ox);
    px(ctx, inset, y, SCENE_W - inset * 2, 1, STEEL[1]);
  }
  // the two side walls, converging on the far end of the room
  for (let x = 0; x < SCENE_W; x++) {
    const side = x < ox ? x / Math.max(1, ox) : x > SCENE_W - ox ? (SCENE_W - x) / Math.max(1, ox) : -1;
    if (side < 0) continue;
    const top = Math.round(side * oy);
    const base = Math.round(SCENE_H - side * (SCENE_H - horizon));
    px(ctx, x, top, 1, base - top, STEEL[1]);
    px(ctx, x, base - 2, 1, 2, STEEL[2]);
    px(ctx, x, top, 1, 3, INK);
    if (x % 22 < 2) px(ctx, x, top + 3, 1, base - top - 5, STEEL[0]);
  }
  // the corridor light behind you, narrowing to nothing as the door closes
  const door = clamp01(1 - t / 1.8);
  if (door > 0) {
    const w = Math.round(150 * door);
    dither(ctx, 160 - w / 2 + sway, SCENE_H - 40, w, 40, null, STEEL[1], Math.round(5 * door));
    dither(ctx, 160 - w / 4 + sway, SCENE_H - 20, w / 2, 20, null, STEEL[2], Math.round(3 * door));
  }
  // a second console, unlit, against the left wall
  const p2 = pen(ctx, k * 0.55, Math.round(-40 - 80 * ease) + sway, Math.round(deep - 42 * k) + bob);
  p2.rect(0, 0, SCENE_W, 70, STEEL[0]);
  p2.rect(0, 0, SCENE_W, 4, STEEL[1]);
  p2.rect(92, 2, 136, 62, INK);
  p2.rect(0, 66, SCENE_W, 8, INK);
  // the console you are walking to, and the desk under it
  px(ctx, ox, deep, SCENE_W - ox * 2, horizon - deep, INK);
  consolePanel(pen(ctx, k, ox, oy), t, { live: false, tube: 0, lamps: 0, hour: scene.hour ?? '' });
  px(ctx, ox, deep, SCENE_W - ox * 2, 2, STEEL[1]);
  // the chair, rising into the lower third as you reach it
  const chairY = Math.round(SCENE_H - 6 - 46 * ease);
  px(ctx, 100 + sway, chairY, 120, 70, INK);
  px(ctx, 104 + sway, chairY + 3, 112, 64, STEEL[0]);
  px(ctx, 104 + sway, chairY + 3, 112, 2, STEEL[1]);
  px(ctx, 118 + sway, chairY + 9, 10, 50, INK);
  px(ctx, 192 + sway, chairY + 9, 10, 50, INK);
  // the doorway you came through, sliding off the edges of the frame
  const jamb = Math.round(40 * Math.pow(1 - p, 1.6) * 1.6);
  if (jamb > 0) {
    px(ctx, 0, 0, jamb, SCENE_H, INK);
    px(ctx, jamb - 1, 0, 1, SCENE_H, STEEL[0]);
    px(ctx, SCENE_W - jamb, 0, jamb, SCENE_H, INK);
    px(ctx, SCENE_W - jamb, 0, 1, SCENE_H, STEEL[0]);
    px(ctx, 0, 0, SCENE_W, Math.round(jamb * 0.4), INK);
  }
  // the dark at the edges, lifting as you arrive
  vignette(ctx, Math.round(9 * (1 - ease)) + 2);
}

/** A dithered frame of dark at the edges — never a flat wash over everything. */
function vignette(ctx, level) {
  if (level <= 0) return;
  const bands = [[0, 5], [5, 7], [12, 8]];
  for (let i = 0; i < bands.length; i++) {
    const [off, thick] = bands[i];
    const lv = Math.max(0, level - i * 4);
    if (lv <= 0) continue;
    dither(ctx, off, off, SCENE_W - off * 2, thick, null, INK, lv);
    dither(ctx, off, SCENE_H - off - thick, SCENE_W - off * 2, thick, null, INK, lv);
    dither(ctx, off, off, thick, SCENE_H - off * 2, null, INK, lv);
    dither(ctx, SCENE_W - off - thick, off, thick, SCENE_H - off * 2, null, INK, lv);
  }
}

/** Sitting down: the room rises, the chair arrives, the hands land on the desk. */
function drawSit(ctx, t, character) {
  const p = clamp01(t / 1.6);
  const ease = 1 - Math.pow(1 - p, 3);
  const overshoot = p > 0.85 ? Math.round(3 * Math.sin((p - 0.85) / 0.15 * Math.PI)) : 0;
  const oy = Math.round(-22 * ease) + overshoot;
  consoleRoom(ctx, t, { live: false, tube: 0, lamps: 0, oy });
  // the chair's arm rests, coming in at the bottom corners
  const armY = Math.round(SCENE_H - 26 * ease);
  px(ctx, -4, armY, 48, 30, INK);
  px(ctx, -4, armY + 2, 44, 26, STEEL[0]);
  px(ctx, -4, armY + 2, 44, 2, STEEL[1]);
  px(ctx, SCENE_W - 44, armY, 48, 30, INK);
  px(ctx, SCENE_W - 40, armY + 2, 44, 26, STEEL[0]);
  px(ctx, SCENE_W - 40, armY + 2, 44, 2, STEEL[1]);
  // the hands swing forward and down onto the desk on an arc
  const arc = Math.sin(ease * Math.PI / 2);
  const hy = Math.round(SCENE_H - 4 - (SCENE_H - 4 - 146) * arc) + overshoot;
  const spread = Math.round(10 * (1 - arc));
  handsBack(ctx, skinOf(character), hy, 44 - spread, 256 + spread);
  vignette(ctx, Math.round(6 * (1 - ease)));
}

/** One breath, in a room at three below: the body moves, the camera does not. */
function drawBreath(ctx, t, character) {
  const inhale = clamp01(t / 0.8);
  const out = clamp01((t - 1.0) / 1.0);
  const rise = Math.round(3 * inhale - 3 * out);
  consoleRoom(ctx, t, { live: false, tube: 0, lamps: 0 });
  /*
   * No shoulders in the corners any more.
   *
   * The body behind the camera is carried by the two forearms, which run off
   * the bottom edge of the frame in every beat; a pair of shoulder blocks in
   * the same corners was a second body in the same picture.
   */
  const hy = 146 - Math.round(2 * inhale) + Math.round(3 * out);
  const spread = Math.round(1 * inhale);
  handsBack(ctx, skinOf(character), hy, 44 - spread, 256 + spread);
  // breath, on the exhale, drifting up in front of the dark glass
  if (t > 1.0) {
    const q = (t - 1.0) / 1.0;
    for (let i = 0; i < 4; i++) {
      const fy = Math.round(58 - q * 26 - i * 5);
      const lvl = Math.max(0, Math.round(5 - q * 4 - i));
      if (lvl > 0) dither(ctx, 132 + i * 3, fy, 30 - i * 4, 6, null, NIGHT[2], lvl);
    }
  }
  // the edges close in and open again — a vignette, not a dropped frame
  const closing = Math.sin(clamp01(t / 1.8) * Math.PI);
  vignette(ctx, Math.round(8 * closing));
}

/**
 * The card into the reader.
 *
 * The player asked for this beat by name and gave us the photograph: a white
 * card going into a black reader with live lamps, held in fingers. It arcs in
 * from the lower right so the hand crosses the frame, the last of the travel
 * eases, the blue power lamp comes up at the halfway mark, and the room takes
 * a step up in light as it seats — the card is what turns the console on.
 */
function drawCard(ctx, t, character) {
  const seated = t >= 1.6;
  const halfway = t >= 1.1;
  const settle = seated && t < 1.75 ? 1 : 0;
  // the card is what turns the lights on: the room comes up one ramp step as
  // the power lamp does, rather than a wash being drawn over the top of it
  consoleRoom(ctx, t, {
    live: false, tube: 0, lamps: 0, power: halfway, cardIn: seated, showCard: false,
    dim: halfway ? 0 : 1,
  });
  const ramp = skinOf(character);
  // The left hand never leaves the desk lip, at any point in this beat.
  handBack(ctx, ramp, 44, 146, 1, null, { from: 8 });
  handFront(ctx, ramp, 44, 146, 1);
  /*
   * The right hand, in one continuous move.
   *
   * The player: "Why do the hands at some point appear on the console while
   * another set is still holding the card?" There is one right hand and this
   * is it, on a path: it lifts off the desk and drops out of the bottom of the
   * frame toward the body, comes back up holding the card between thumb and
   * fingers, carries it to the reader, pushes it into the slot, opens as it
   * seats, and comes back to the desk. Its forearm runs to the same point at
   * the bottom edge of the frame the whole way, so it is never detached and
   * never jumps.
   */
  const REST = { x: 248, y: 146 };            // where it lies on the desk
  const OUT = { x: 262, y: 214 };             // out of the frame, at the body
  const AT = { x: CARD_IN_X + 2, y: 66 };     // at the slot, holding the card
  const lerp = (a, b, u) => ({ x: Math.round(a.x + (b.x - a.x) * u), y: Math.round(a.y + (b.y - a.y) * u) });
  let hand = REST;
  let grip = 0;
  let carry = null;                            // where the card is, if it is held
  if (t < 0.3) {                               // off the desk and down out of frame
    hand = lerp(REST, OUT, clamp01(t / 0.3));
  } else if (t < 1.6) {                        // back up with the card, and into the slot
    const u = clamp01((t - 0.3) / 1.3);
    const e = 1 - Math.pow(1 - u, 2.2);
    hand = lerp(OUT, AT, e);
    grip = 1;
    // the card is held IN the fingers: it overlaps them, and they are drawn
    // over it, so the grip is visible rather than implied
    carry = { x: hand.x - 1, y: hand.y - 18 + Math.round((1 - e) * 5) };
  } else if (t < 2.2) {                        // the fingers open and it comes back
    const u = clamp01((t - 1.6) / 0.6);
    hand = lerp(AT, REST, u * u);
    grip = Math.max(0, 1 - u * 2.4);
  }
  // the card: in the fingers on the way in, in the reader once it is seated
  if (carry) {
    idCard(ctx, carry.x, carry.y, { seed: character?.name ?? null, lean: false });
    px(ctx, carry.x - 1, carry.y + 16, 24, 1, INK);
  } else if (seated) {
    idCard(ctx, CARD_IN_X, CARD_IN_Y + settle, { seed: character?.name ?? null });
  }
  cardReaderLip(pen(ctx, 1, 0, 0), {});
  if (settle) px(ctx, READER_X, 52, 64, 1, INK);
  handBack(ctx, ramp, hand.x, hand.y, -1, null, { from: SCENE_W - 8, grip });
  handFront(ctx, ramp, hand.x, hand.y, -1, { grip });
}

/**
 * The set coming up: a dot, a line, a picture, and the room lighting with it.
 *
 * A cathode-ray set warming through is the most photogenic thing in this
 * world, and it used to be a filled arc and the word READY in a system font.
 */
function drawBoot(ctx, t, scene, character) {
  const p = clamp01(t / 2.6);
  const tube = clamp01((t - 0.8) / 0.8);
  const lamps = t < 1.6 ? 0 : Math.min(1, (t - 1.6) / 0.24);
  const room = Math.max(0, Math.min(3, Math.floor(t / 0.4)));
  consoleRoom(ctx, t, {
    live: t > 0.3, tube, lamps, power: true, cardIn: true, net: t > 2.2,
    cardSeed: character?.name ?? null,
  });
  const gx = 96;
  const gy = 6;
  if (t < 0.3) {
    // one bright dot at the centre of the glass, blooming to a cross
    const r = Math.round(1 + (t / 0.3) * 3);
    px(ctx, gx + 64 - r, gy + 27, r * 2 + 1, 1, TUBE);
    px(ctx, gx + 64, gy + 27 - r, 1, r * 2 + 1, TUBE);
    px(ctx, gx + 63, gy + 26, 3, 3, PAPER[3]);
  } else if (t < 0.8) {
    // the line wipes open, top and bottom, in eight steps with one overshoot
    const q = (t - 0.3) / 0.5;
    const stepN = Math.min(8, Math.floor(q * 9));
    const h = Math.round((stepN / 8) * 27) + (stepN === 8 ? 2 : 0);
    px(ctx, gx, gy + 27 - h, 128, h * 2 + 1, NIGHT[0]);
    px(ctx, gx, gy + 27, 128, 1, TUBE);
    dither(ctx, gx, gy + 27 - h, 128, h * 2 + 1, null, TUBE, 1);
  }
  // the room takes a step of light every four tenths of a second
  if (room > 0) {
    dither(ctx, 0, 70, SCENE_W, 12, null, STEEL[1], room * 2);
    px(ctx, 0, 70, SCENE_W, 1, step(STEEL, 1 + room));
  }
  handsBack(ctx, skinOf(character), 146, 44, 256, room > 1 ? TUBE : null);
  if (t > 2.2) {
    // READY, printed low on the glass where a set's own legend goes — not in
    // a box in the middle of the picture, which read as a button on a diagram.
    const flash = t < 2.32;
    const bx = gx + 6;
    const by = gy + 44;
    glyphs(ctx, 'READY', bx + 1, by + 1, INK);
    glyphs(ctx, 'READY', bx, by, flash ? PAPER[3] : TUBE);
  }
}

/* ------------------------------------------------------------------ the evening */

/**
 * The tape, in the operator's hands.
 *
 * The printer is a real machine now: a platen, a ribbon, a paper path and a
 * print head that steps across in time with the characters and snaps back at
 * the end of a line, with one unbroken continuous form feeding out of its
 * front and down into the frame. The sheet advances nine pixels a line, so the
 * paper genuinely scrolls under the type.
 */
function drawPrintout(ctx, t, character, { line = 0, typed = 0, talking = false, sheetTop = 60, wide = false } = {}) {
  consoleRoom(ctx, t, {
    live: true, tube: 1, lamps: 1, power: true, cardIn: true, net: true, oy: -46,
    cardSeed: character?.name ?? null,
  });
  const MOUTH = TAPE_MOUTH;
  const top = Math.max(6, Math.round(sheetTop));
  // the machine, on the desk in front of the operator, its top face toward you
  px(ctx, 22, MOUTH - 8, 276, SCENE_H - MOUTH + 8, INK);
  px(ctx, 24, MOUTH - 6, 272, SCENE_H - MOUTH + 6, STEEL[1]);
  px(ctx, 24, MOUTH - 6, 272, 2, STEEL[2]);
  dither(ctx, 24, MOUTH + 10, 272, 10, STEEL[1], STEEL[0], 8);
  px(ctx, 24, MOUTH + 20, 272, SCENE_H - MOUTH - 20, STEEL[0]);
  // the tractor covers either side of the paper path, and the maker's plate
  for (const bx of [30, 254]) {
    px(ctx, bx, MOUTH - 4, 36, 14, STEEL[0]);
    px(ctx, bx, MOUTH - 4, 36, 1, STEEL[2]);
    for (let i = 0; i < 4; i++) px(ctx, bx + 4 + i * 8, MOUTH + 1, 4, 4, STEEL[1]);
  }
  px(ctx, 132, MOUTH + 24, 56, 8, STEEL[1]);
  px(ctx, 132, MOUTH + 24, 56, 1, STEEL[2]);
  for (let i = 0; i < 5; i++) px(ctx, 138 + i * 10, MOUTH + 26, 6, 3, STEEL[0]);
  // the form, rising out of the slot with everything printed on it so far
  const sx = wide ? 26 : 48;
  const sw = wide ? 268 : 224;
  tractorSheet(ctx, sx, top, sw, MOUTH + 2 - top);
  // the tube is above and behind: the top of the sheet takes its light, and
  // the last inch before the mouth is still in the machine's own shadow
  dither(ctx, sx, top, sw, 14, null, PAPER[3], 5);
  dither(ctx, sx, MOUTH - 14, sw, 16, null, PAPER[1], 3);
  /*
   * The mouth: the slot the paper comes out of, the print head behind it, and
   * the front lip drawn OVER the sheet so the paper is genuinely coming out
   * of the machine. The player: "it should scroll out with the printout, like
   * the text is on the paper" — so the head is fixed here, the line being
   * typed is level with it, and everything already printed has been carried up
   * the frame by the paper.
   */
  px(ctx, 40, MOUTH + 2, 240, 5, INK);
  px(ctx, 42, MOUTH + 3, 236, 2, STEEL[0]);
  const carriage = typed > 0 ? Math.min(1, (typed % 40) / 40) : 0;
  const hx = Math.round(60 + (talking ? carriage : 0) * 190);
  px(ctx, hx, MOUTH - 3, 7, 6, STEEL[3]);
  px(ctx, hx + 1, MOUTH - 1, 5, 4, INK);
  px(ctx, hx, MOUTH + 2, 7, 2, STEEL[2]);
  px(ctx, 40, MOUTH + 7, 240, 6, STEEL[1]);
  px(ctx, 40, MOUTH + 7, 240, 1, STEEL[2]);
  px(ctx, 40, MOUTH + 12, 240, 1, INK);
  // the operator's own hands, on the machine, steadying the paper as it comes
  const ramp = skinOf(character);
  const settle = Math.floor(line / 4) % 2;
  handsBack(ctx, ramp, MOUTH + 6 + settle, 26, 274, TUBE);
  handsFront(ctx, ramp, MOUTH + 6 + settle, 26, 274);
}

/**
 * The political section's office.
 *
 * The room was always the best-drawn thing in the set; what it lacked was a
 * man in it. He is built here as a figure: sloping shoulders, boards on the
 * slope, arms that come down to the desk and hands that hold the file he is
 * reading from, with the desk's front edge drawn over him so that he is behind
 * it rather than sitting on it. The lamp moves with the tier instead of a
 * black wash being drawn over the top of the picture.
 */
function drawOffice(ctx, t, { talking, face, tier, watches = 0, struck = false, seed = '' }) {
  const hard = tier === 'flagged' || tier === 'condemned';
  // The player: "The political commissar should be menacing." So the room is
  // dark at EVERY tier and the lamp, the file and his hands are the lit
  // things; the tier moves the lamp and deepens the dark by a graded amount,
  // rather than one tier getting a black rectangle over the top of it.
  const dim = hard ? 1 : 0;
  const S = (ramp, i) => step(ramp, i - dim);
  const gloom = tier === 'commended' ? 1 : tier === 'condemned' ? 5 : hard ? 4 : 2;
  const snowing = watches >= 3;
  const lampAt = tier === 'commended' ? -1 : hard ? 1 : 0;
  // wall, wainscot, floor
  px(ctx, 0, 0, SCENE_W, SCENE_H, S(CLOTH, hard ? 0 : 1));
  px(ctx, 0, 0, SCENE_W, 10, S(CLOTH, 0));
  ditherBand(ctx, 0, 10, SCENE_W, 8, S(CLOTH, 0), S(CLOTH, hard ? 0 : 1), { steps: 4 });
  px(ctx, 0, 92, SCENE_W, 4, S(CLOTH, 1));
  px(ctx, 0, 96, SCENE_W, 84, S(WOOD, 0));
  dither(ctx, 0, 96, SCENE_W, 6, S(WOOD, 0), S(WOOD, 1), 4);
  // the window: night, snow behind the mullions, a ledge of settled snow
  px(ctx, 228, 8, 76, 60, INK);
  px(ctx, 230, 10, 72, 56, S(NIGHT, 0));
  if (!snowing) {
    for (const [sx, sy] of [[240, 20], [252, 30], [286, 18], [292, 44], [244, 52], [268, 24]]) {
      px(ctx, sx, sy, 1, 1, S(NIGHT, 3));
    }
  } else {
    for (let i = 0; i < 9; i++) px(ctx, 232 + ((i * 37) % 66), 12 + ((t * 30 + i * 19) % 52), 2, 2, S(NIGHT, 3));
    for (let i = 0; i < 13; i++) px(ctx, 231 + ((i * 23) % 68), 12 + ((t * 18 + i * 13) % 52), 1, 1, S(NIGHT, 2));
    for (let i = 0; i < 15; i++) px(ctx, 231 + ((i * 41) % 68), 12 + ((t * 9 + i * 7) % 52), 1, 1, S(NIGHT, 1));
  }
  px(ctx, 230, 62, 72, 4, S(NIGHT, 2));
  px(ctx, 230, 62, 72, 1, S(NIGHT, 3));
  // the mullions, in front of the weather
  px(ctx, 226, 6, 80, 4, S(WOOD, 1));
  px(ctx, 226, 66, 80, 4, S(WOOD, 1));
  px(ctx, 226, 6, 4, 64, S(WOOD, 1));
  px(ctx, 302, 6, 4, 64, S(WOOD, 1));
  px(ctx, 264, 10, 2, 56, S(WOOD, 1));
  px(ctx, 230, 36, 72, 2, S(WOOD, 1));
  px(ctx, 226, 6, 80, 1, S(WOOD, 2));
  if (struck) {
    // one pane boarded, after the night the Ville was struck
    px(ctx, 266, 12, 34, 22, S(WOOD, 1));
    px(ctx, 266, 14, 34, 2, S(WOOD, 2));
    px(ctx, 266, 24, 34, 2, S(WOOD, 2));
    px(ctx, 266, 12, 34, 1, INK);
  }
  // the portrait nobody can name, and a second one once the war has gone on
  framedPortrait(ctx, 20, 12, 46, 36, S);
  if (watches >= 6) framedPortrait(ctx, 72, 18, 32, 26, S);
  // the flag
  px(ctx, 6, 14, 3, 80, S(WOOD, 2));
  px(ctx, 6, 14, 3, 1, S(DAWN, 3));
  px(ctx, 9, 16, 14, 44, RED);
  px(ctx, 9, 16, 14, 1, S(DAWN, 1));
  px(ctx, 12, 26, 8, 8, S(DAWN, 3));
  px(ctx, 14, 28, 4, 4, RED);
  px(ctx, 9, 59, 14, 1, INK);
  // the lamp, on the wall side of the desk
  deskLamp(ctx, 84, 40, lampAt, S);
  // the man, behind the desk
  commissar(ctx, t, { talking, face, tier, hard, S, seed });
  /*
   * The dark, over the room AND the man in one pass.
   *
   * Everything above the desk goes down together — wall, window, portraits,
   * flag, the shape of him — so there is no seam anywhere and no tier is a
   * black rectangle laid over the top of a lit picture. What comes back out of
   * it is drawn afterwards, and only what the lamp can actually reach: the
   * cone on the wall, the filament, one edge of his face, and his eyes.
   */
  for (let j = 0; j < 26; j++) {
    const lvl = gloom + 7 - Math.round(j * 0.55);
    if (lvl > 0) dither(ctx, 0, j, SCENE_W, 1, null, INK, Math.min(15, lvl));
  }
  for (let i = 0; i < 40; i++) {
    const lvl = gloom + 7 - Math.round(i * 0.4);
    if (lvl <= 0) continue;
    dither(ctx, i, 0, 1, 104, null, INK, Math.min(15, lvl));
    dither(ctx, SCENE_W - 1 - i, 0, 1, 104, null, INK, Math.min(15, lvl));
  }
  lampCone(ctx, 84, 48, lampAt, gloom);
  commissarLight(ctx, { tier, hard, S });
  // the desk itself, drawn over him: a top, a near edge, a front
  px(ctx, 8, 104, 304, 14, S(WOOD, 2));
  px(ctx, 8, 104, 304, 2, S(WOOD, 3));
  px(ctx, 8, 116, 304, 4, S(WOOD, 3));
  px(ctx, 8, 120, 304, 60, S(WOOD, 1));
  dither(ctx, 8, 120, 304, 8, S(WOOD, 1), S(WOOD, 0), 8);
  px(ctx, 8, 120, 304, 1, INK);
  // two drawers in the front of it, so the desk is a piece of furniture
  for (const dx of [26, 178]) {
    px(ctx, dx, 128, 116, 30, INK);
    px(ctx, dx + 1, 129, 114, 28, S(WOOD, 1));
    px(ctx, dx + 1, 129, 114, 1, S(WOOD, 2));
    px(ctx, dx + 44, 140, 28, 4, S(WOOD, 0));
    px(ctx, dx + 44, 140, 28, 1, S(WOOD, 2));
  }
  // what is on the desk, and what the lamp reaches of it
  // the pool the lamp actually throws: a lit core on the wood, dithered
  // shoulders either side of it, and the near edge lit under it
  const pool = lampAt < 0 ? 30 : lampAt > 0 ? 128 : 58;
  px(ctx, pool + 16, 104, 64, 12, S(WOOD, 3));
  dither(ctx, pool, 104, 16, 12, S(WOOD, 2), S(WOOD, 3), 9);
  dither(ctx, pool + 80, 104, 16, 12, S(WOOD, 2), S(WOOD, 3), 9);
  dither(ctx, pool - 14, 104, 14, 12, S(WOOD, 2), S(WOOD, 3), 3);
  dither(ctx, pool + 96, 104, 14, 12, S(WOOD, 2), S(WOOD, 3), 3);
  dither(ctx, pool - 6, 116, 108, 4, S(WOOD, 3), S(WOOD, 2), 7);
  // the blotter and the papers on it
  px(ctx, 26, 100, 52, 14, S(WOOD, 0));
  px(ctx, 28, 102, 48, 10, S(PAPER, 1));
  px(ctx, 28, 102, 48, 1, S(PAPER, lampAt < 0 ? 3 : 2));
  px(ctx, 32, 106, 34, 1, S(PAPER, 0));
  px(ctx, 32, 109, 26, 1, S(PAPER, 0));
  // files, one more stack for every three watches stood
  for (let i = 0; i < Math.min(4, 1 + Math.floor(watches / 3)); i++) {
    const fx = 196 + i * 11;
    px(ctx, fx, 100 - i, 10, 12 + i, INK);
    px(ctx, fx + 1, 101 - i, 8, 10 + i, S(PAPER, 1));
    px(ctx, fx + 1, 101 - i, 8, 1, S(PAPER, 2));
    px(ctx, fx + 1, 104 - i, 8, 1, S(PAPER, 0));
  }
  // the telephone, and its shadow thrown away from the lamp
  px(ctx, 254, 94, 42, 18, INK);
  px(ctx, 256, 96, 38, 8, S(STEEL, 0));
  px(ctx, 256, 96, 38, 1, S(STEEL, 1));
  px(ctx, 262, 104, 26, 8, S(STEEL, 0));
  px(ctx, 268, 106, 14, 4, S(STEEL, 1));
  px(ctx, 296, 104, 14, 8, S(WOOD, 1));
  // the man's forearms and hands, lying on the desk in front of him
  commissarHands(ctx, { hard, S, dismiss: hard ? 1 : 0 });
  /*
   * The desk between you and him is the brightest thing in the room at every
   * tier — a pool on the near lip that falls away into the drawers, following
   * whichever way the lamp is turned. It used to be an axis-aligned mustard
   * blob with rectangular shoulders on the two hard tiers, which read as a
   * stain on the wood rather than as light on it.
   */
  const front = 160 + lampAt * 44;
  for (let i = 0; i < 24; i++) {
    const half = Math.round(86 - i * 2.2);
    if (half < 8) break;
    const lvl = Math.max(0, (hard ? 10 : 8) - Math.round(i * 0.7));
    if (lvl <= 0) continue;
    dither(ctx, front - half, 116 + i, half * 2, 1, null, WOOD[2], lvl);
  }
}

/** A framed picture on the office wall: a shape with a name nobody uses. */
function framedPortrait(ctx, x, y, w, h, S) {
  px(ctx, x, y, w, h, S(WOOD, 0));
  px(ctx, x + 1, y + 1, w - 2, 1, S(WOOD, 2));
  px(ctx, x + 3, y + 3, w - 6, h - 6, S(STEEL, 1));
  dither(ctx, x + 3, y + 3, w - 6, h - 6, S(STEEL, 1), S(STEEL, 0), 3);
  const hw = Math.round(w * 0.26);
  px(ctx, x + Math.round(w / 2 - hw / 2), y + Math.round(h * 0.2), hw, Math.round(h * 0.3), INK);
  px(ctx, x + Math.round(w / 2 - hw), y + Math.round(h * 0.5), hw * 2, Math.round(h * 0.42), INK);
  px(ctx, x + Math.round(w / 2 - hw), y + Math.round(h * 0.5), hw * 2, 1, S(STEEL, 2));
  px(ctx, x + Math.round(w / 2 - hw / 2), y + Math.round(h * 0.2), hw, 1, S(STEEL, 2));
}

/** The desk lamp, and the pool it throws on the surface in front of it. */
function deskLamp(ctx, x, y, turn, S) {
  const tilt = turn * 4;
  px(ctx, x - 12 + tilt, y, 26, 4, S(STEEL, 0));
  px(ctx, x - 10 + tilt, y + 4, 22, 4, S(STEEL, 1));
  px(ctx, x - 10 + tilt, y, 22, 1, S(STEEL, 2));
  px(ctx, x - 4 + tilt, y + 8, 6, 2, AMBER);
  px(ctx, x, y + 8, 3, 46, S(STEEL, 0));
  px(ctx, x - 10, y + 54, 24, 4, S(STEEL, 0));
  px(ctx, x - 10, y + 54, 24, 1, S(STEEL, 1));
}

/**
 * The commissar, as a figure.
 *
 * The face is the portrait generator's — the best pixel art in the game, and
 * every scene should lean on it harder — and everything below the collar is
 * built here: a neck, a collar with its tabs and piping, shoulders that slope
 * in two steps a side, boards ON the slope, upper arms angled in, forearms on
 * the desk and hands at the file. Two poses: reading, and dismissing.
 */
function commissar(ctx, t, { talking, face, tier, hard, S: room, seed }) {
  // He is the heaviest thing in the room and the room is dark around him: the
  // wool goes one step under the wall at every tier and two when the lamp is
  // turned on the player, so he is a mass with a lit edge rather than a
  // cut-out with a wire down it.
  const S = (ramp, i) => room(ramp, i - (hard ? 1 : 0));
  const wool = (i) => S(CLOTH, hard ? i - 1 : i);
  const k = 2;
  const lean = tier === 'commended' ? 2 : 0;
  // The portrait is blitted down to the throat only — face, jaw and neck — and
  // everything from the collar down is built here at the width of a man rather
  // than at the width of a photograph. Cap to desk is two and a half heads;
  // the shoulders are three heads across.
  const fx = 160 - PORTRAIT_W;           // the head, centred on the frame
  const head = 14 + lean;
  const cy = head + (FACE.collar - 1) * k;   // the collar line, y ≈ 50
  const chest = cy + 8;
  const HALF = 50;                       // half the shoulder width: 100 across
  // his own shadow, thrown up the wall away from the lamp
  for (let i = 0; i < 44; i++) {
    dither(ctx, 160 + HALF - 2, 104 - i * 2, 8 + Math.round(i * 0.8), 2, null, INK, 7);
  }
  // the chair back, rising behind him like a headboard
  px(ctx, 160 - HALF - 8, cy - 26, HALF * 2 + 16, 94, INK);
  px(ctx, 160 - HALF - 6, cy - 24, HALF * 2 + 12, 92, S(WOOD, 0));
  px(ctx, 160 - HALF - 6, cy - 24, HALF * 2 + 12, 3, S(WOOD, 2));
  px(ctx, 160 - HALF - 6, cy - 21, HALF * 2 + 12, 1, INK);
  for (const bx of [160 - HALF - 4, 160 + HALF]) {
    px(ctx, bx, cy - 20, 4, 88, S(WOOD, 1));
    px(ctx, bx, cy - 20, 1, 88, S(WOOD, 2));
  }
  // the collar: no neck to speak of — the head sits down into it
  px(ctx, 141, cy - 4, 38, 10, INK);
  px(ctx, 142, cy - 3, 36, 8, wool(2));
  px(ctx, 142, cy + 1, 5, 4, wool(3));
  px(ctx, 173, cy + 1, 5, 4, wool(3));
  px(ctx, 142, cy + 5, 36, 1, hard ? wool(0) : RED);
  // the shoulders: square, one short step at the outer end, three heads across
  px(ctx, 160 - HALF - 1, cy + 3, HALF * 2 + 2, 9, INK);
  px(ctx, 160 - HALF, cy + 4, HALF * 2, 8, wool(1));
  px(ctx, 160 - HALF, cy + 4, HALF * 2, 1, wool(2));
  px(ctx, 160 - HALF - 1, cy + 10, 10, 4, INK);
  px(ctx, 160 + HALF - 9, cy + 10, 10, 4, INK);
  /*
   * The torso: a barrel, wider than it is tall, modelled across its width
   * rather than filled flat — lit on the lamp's side, one step down through
   * the middle, two steps down on the far side, with the tunic's placket and
   * a lapel V where a service tunic has them. A slab of one ink is what made
   * the last one read as a filing cabinet with a head on it.
   */
  const tall = 106 - chest;
  px(ctx, 160 - HALF + 1, chest, HALF * 2 - 2, tall, INK);
  px(ctx, 160 - HALF + 2, chest, HALF * 2 - 4, tall, wool(2));
  px(ctx, 160 - HALF + 2, chest, 20, tall, wool(3));
  ditherBand(ctx, 160 - HALF + 22, chest, 14, tall, wool(3), wool(2), { steps: 4 });
  ditherBand(ctx, 160 + 10, chest, 16, tall, wool(2), wool(1), { steps: 4 });
  px(ctx, 160 + 26, chest, HALF - 28, tall, wool(1));
  ditherBand(ctx, 160 + HALF - 12, chest, 10, tall, wool(1), wool(0), { steps: 4 });
  // the placket, and the lapels opening off it
  px(ctx, 158, chest, 4, tall, wool(2));
  px(ctx, 158, chest, 1, tall, wool(0));
  px(ctx, 161, chest, 1, tall, wool(0));
  for (let i = 0; i < 12; i++) {
    px(ctx, 157 - i, chest + i, 2, 1, wool(0));
    px(ctx, 162 + i, chest + i, 2, 1, wool(0));
  }
  for (let i = 0; i < 3; i++) px(ctx, 159, chest + 8 + i * 12, 2, 2, S(DAWN, hard ? 0 : 2));
  // a block of ribbons over the left breast
  for (let i = 0; i < 3; i++) {
    px(ctx, 126 + i * 9, chest + 14, 8, 4, hard ? wool(0) : [RED, S(DAWN, 2), S(NIGHT, 1)][i]);
    px(ctx, 126 + i * 9, chest + 18, 8, 1, wool(0));
  }
  // the boards, out on the square of the shoulder where a board is worn
  for (const bx of [160 - HALF + 6, 160 + HALF - 24]) {
    px(ctx, bx - 1, cy + 3, 20, 8, INK);
    px(ctx, bx, cy + 4, 18, 6, wool(hard ? 1 : 3));
    px(ctx, bx, cy + 4, 18, 1, hard ? wool(2) : S(DAWN, 2));
    px(ctx, bx, cy + 7, 18, 1, hard ? wool(0) : RED);
  }
  // the upper arms, thick, dropping straight off the shoulders to the desk
  for (const side of [-1, 1]) {
    const ax = side < 0 ? 160 - HALF : 160 + HALF - 18;
    px(ctx, ax - 1, cy + 12, 20, 106 - cy - 12, INK);
    px(ctx, ax, cy + 12, 18, 106 - cy - 12, wool(1));
    px(ctx, side < 0 ? ax : ax + 15, cy + 12, 3, 106 - cy - 12, wool(0));
    px(ctx, ax, cy + 12, 18, 1, wool(2));
  }
  blitFace(ctx, face, fx, head, k, {
    cap: {
      crown: wool(1), crownLit: wool(2), band: RED,
      peak: INK, peakLit: hard ? INK : S(CLOTH, 0),
      badge: hard ? S(DAWN, 1) : DAWN[3],
    },
    mouthOpen: talking && Math.floor(t * 7) % 2 === 0,
    backdrop: backdropOf(seed || 'THE POLITICAL SECTION'),
    rows: FACE.collar,
    // The eyes are under the peak at every tier. On a night the file has
    // turned against you the whole head goes down with the room and only the
    // eyes and one edge of the jaw come back out of it.
    shadow: hard ? 10 : tier === 'commended' ? 6 : 8,
  });
  // The far side of him falls away from the lamp at every tier.
  dither(ctx, 160 + 6, cy + 3, HALF - 6, 106 - cy - 3, null, INK, hard ? 6 : 4);
  dither(ctx, fx + 12 * k, head + (FACE.top - 5) * k, 10 * k, (FACE.jaw - FACE.top + 7) * k, null, INK, hard ? 5 : 3);
  if (hard) dither(ctx, fx + 3 * k, head + (FACE.top - 1) * k, 19 * k, (FACE.jaw - FACE.top + 3) * k, null, INK, 2);
}

/**
 * What the lamp gets back out of him after the room has gone dark.
 *
 * Drawn after the gloom pass, so these are the only bright things on the
 * figure: one edge of the jaw and the collar on the lamp's side, the near
 * shoulder board, and two points in the eyes. A screenshot of him alone has to
 * read as a threat; that is what the eyes are for.
 */
function commissarLight(ctx, { tier, hard, S }) {
  const k = 2;
  const fx = 160 - PORTRAIT_W;
  const head = 14 + (tier === 'commended' ? 2 : 0);
  const cy = head + (FACE.collar - 1) * k;
  const HALF = 50;
  // The lamp stands on the desk at his right hand and is low: one edge of the
  // head, the near cheekbone and the near shoulder come out of the dark, and
  // nothing else on him does.
  for (let j = FACE.top + 2; j <= FACE.jaw; j++) {
    px(ctx, fx + 3 * k, head + j * k, k, k, S(SKIN, hard ? 1 : 2));
  }
  px(ctx, fx + 4 * k, head + (FACE.eyes + 2) * k, k, 3 * k, S(SKIN, hard ? 1 : 3));
  px(ctx, fx + 4 * k, head + FACE.jaw * k, 5 * k, k, S(SKIN, hard ? 0 : 1));
  // the underside of the jaw, where a heavy man has one
  px(ctx, fx + 5 * k, head + (FACE.jaw + 1) * k, 13 * k, k, INK);
  // Two points of light where the eyes are: the one thing in the picture that
  // is looking back at you. They are never in shadow, at any tier.
  const eyeY = head + (FACE.eyes - 1) * k;
  for (const ex of [fx + 7 * k, fx + 14 * k]) {
    px(ctx, ex, eyeY, 3 * k, 2 * k, INK);
    px(ctx, ex + k, eyeY, k, k, hard ? SKIN[2] : SKIN[3]);
  }
  // the collar piping and the near board, out of the dark
  const bx = 160 - HALF + 6;
  px(ctx, bx, cy + 4, 18, 1, S(DAWN, hard ? 1 : 2));
  px(ctx, bx, cy + 7, 18, 1, RED);
  px(ctx, 160 - HALF, cy + 4, 34, 1, S(CLOTH, hard ? 2 : 3));
}

/**
 * What the desk lamp throws on the wall and on the man in front of it.
 *
 * Light objects, not air: this runs AFTER the room has been darkened, and it
 * puts a dithered cone of the wall's own ink back over the wall, brightest at
 * the shade and falling off with the square of the distance.
 */
function lampCone(ctx, x, y, turn, gloom) {
  const dir = turn;                       // -1 at the papers, 0 square, +1 at you
  for (let i = 0; i < 34; i++) {
    const half = 7 + Math.round(i * 1.4);
    const lvl = Math.max(0, 7 - Math.round(i * 0.28) - Math.round(gloom * 0.3));
    if (lvl <= 0) continue;
    const cx = x + Math.round(dir * i * 0.9);
    dither(ctx, cx - half, y + 4 + i, half * 2, 1, null, CLOTH[3], lvl);
  }
  px(ctx, x - 4 + turn * 4, y - 8, 6, 2, AMBER);
  px(ctx, x - 6 + turn * 4, y - 6, 10, 1, DAWN[3]);
}

/**
 * His forearms and hands, and the file they are on.
 *
 * Drawn after the desk, because they lie on top of it: the man is behind the
 * desk and his arms are on it, which is the whole reason the desk is drawn
 * over him in the first place. On the two tiers where he is dismissing you the
 * right forearm lifts off the page.
 */
function commissarHands(ctx, { S, hard = false, dismiss = 0 }) {
  // The lamp is ON the desk: whatever tier the evening is, the file, his cuffs
  // and his hands are the lit things in the room.
  const skin = (i) => S(SKIN, hard ? i - 1 : i);
  const wool = (i) => S(CLOTH, hard ? i - 1 : i);
  // the file, open on the desk in front of him
  px(ctx, 112, 100, 96, 18, INK);
  px(ctx, 113, 101, 94, 16, S(PAPER, hard ? 2 : 3));
  px(ctx, 113, 101, 94, 1, PAPER[3]);
  px(ctx, 159, 101, 2, 16, S(PAPER, 1));
  for (let i = 0; i < 4; i++) px(ctx, 118, 105 + i * 3, 36 - (i % 2) * 10, 1, S(PAPER, 0));
  for (let i = 0; i < 3; i++) px(ctx, 166, 105 + i * 3, 32 - (i % 2) * 8, 1, S(PAPER, 0));
  for (const side of [-1, 1]) {
    const lift = side > 0 ? dismiss * 6 : 0;
    // the forearm in its sleeve: thick, from the arm above the desk in to the
    // file, cuffed at the wrist rather than at the elbow
    const ax = side < 0 ? 100 : 178;
    px(ctx, ax - 1, 101 - lift, 44, 17, INK);
    px(ctx, ax, 102 - lift, 42, 15, wool(1));
    px(ctx, ax, 102 - lift, 42, 1, wool(2));
    px(ctx, ax, 114 - lift, 42, 1, wool(0));
    // the cuff, at the wrist end
    const cx = side < 0 ? ax + 30 : ax;
    px(ctx, cx, 101 - lift, 12, 16, wool(2));
    px(ctx, cx, 101 - lift, 12, 1, wool(3));
    // the hand: a broad palm with short thick fingers, at the width of the man
    const hx = side < 0 ? 126 : 170;
    px(ctx, hx - 1, 101 - lift, 26, 16, INK);
    px(ctx, hx, 102 - lift, 24, 8, skin(2));
    px(ctx, hx, 102 - lift, 24, 1, skin(3));
    px(ctx, hx, 108 - lift, 24, 1, skin(1));
    for (let i = 0; i < 4; i++) {
      const len = [5, 6, 6, 4][side < 0 ? i : 3 - i];
      px(ctx, hx + 1 + i * 6, 110 - lift, 5, len, skin(2));
      px(ctx, hx + 1 + i * 6, 109 + len - lift, 5, 1, skin(1));
      px(ctx, hx + 1 + i * 6, 110 - lift, 5, 1, skin(3));
    }
    // the thumb, laid across the near edge of the page
    px(ctx, side < 0 ? hx + 21 : hx - 3, 104 - lift, 7, 9, skin(3));
    px(ctx, side < 0 ? hx + 21 : hx - 3, 112 - lift, 7, 1, skin(1));
  }
}

/**
 * The order of appointment: its own shot, and no face in it.
 *
 * The one piece of good news in the campaign used to play the identical frame
 * of the same man with a different caption. What it shows now, without a word
 * on it, is an order on a desk under a lamp and a new shoulder board being set
 * down beside it.
 */
function drawAppointment(ctx, t, character, scene = null) {
  const land = clamp01(t / 0.8);
  const ease = 1 - Math.pow(1 - land, 2);
  px(ctx, 0, 0, SCENE_W, SCENE_H, WOOD[1]);
  px(ctx, 0, 0, SCENE_W, 10, WOOD[0]);
  for (let x = 0; x < SCENE_W; x += 26) px(ctx, x, 10, 1, SCENE_H - 10, WOOD[0]);
  ditherBand(ctx, 0, 10, SCENE_W, 12, WOOD[0], WOOD[1], { steps: 4 });
  // the blotter
  px(ctx, 20, 20, 280, 116, INK);
  px(ctx, 22, 22, 276, 112, WOOD[0]);
  px(ctx, 22, 22, 276, 1, WOOD[2]);
  // the order, squared up on it, under the lamp
  filePage(ctx, 40, 26, 166, 104, { number: '4471-B', lit: true, ruleFrom: 78, head: false });
  /*
   * The order's own words, printed on it in the pixel font.
   *
   * It used to be a redaction bar, a stamp and twelve empty rules — a
   * template, on the one document in the game that is good news and is
   * addressed to the player by name. Every line here is on the paper.
   */
  // the lamp's pool on the desk and on the top of the sheet, brightening one
  // step as the board lands — drawn before the type, so it lights the paper
  // rather than dithering over the words on it
  dither(ctx, 24, 20, 210, 60, null, WOOD[2], 2 + Math.round(2 * ease));
  dither(ctx, 40, 26, 166, 24, null, PAPER[3], 2 + Math.round(3 * ease));
  const holder = String(character?.name ?? '').trim().split(/\s+/).slice(-1)[0] || 'OPERATOR';
  const post = String(scene?.post ?? 'SECTOR COMMANDER');
  const shortPost = post.length > 22 ? post.slice(0, 22) : post;
  glyphs(ctx, 'ORDER OF APPOINTMENT', 48, 34, PAPER[0]);
  px(ctx, 48, 41, 150, 1, PAPER[1]);
  glyphs(ctx, 'TO', 48, 46, PAPER[1]);
  glyphs(ctx, holder.toUpperCase().slice(0, 18), 62, 46, PAPER[0]);
  glyphs(ctx, 'POST', 48, 54, PAPER[1]);
  glyphs(ctx, shortPost.toUpperCase(), 48, 62, PAPER[0]);
  if (scene?.gazetted) glyphs(ctx, `RANK ${String(scene.gazetted).toUpperCase()}`.slice(0, 24), 48, 70, PAPER[0]);
  stamp(ctx, 150, 92, 46, 22, 'ADF', RED);
  // the signature block: a hand-written scrawl over a ruled line
  for (let i = 0; i < 46; i++) {
    px(ctx, 50 + i, 112 - Math.round(Math.sin(i / 5) * 2) - (i % 7 === 0 ? 1 : 0), 1, 1, NIGHT[0]);
  }
  px(ctx, 50, 116, 56, 1, PAPER[0]);
  glyphs(ctx, 'CHIEF OF AIR DEFENCE', 50, 119, PAPER[1]);
  // the new board, laid down beside the order
  const by = Math.round(44 + (1 - ease) * 28);
  px(ctx, 230, by + 2, 50, 20, INK);
  px(ctx, 231, by + 2, 48, 18, CLOTH[2]);
  px(ctx, 231, by + 2, 48, 1, CLOTH[3]);
  px(ctx, 231, by + 19, 48, 1, RED);
  px(ctx, 231, by + 2, 2, 18, DAWN[1]);
  px(ctx, 277, by + 2, 2, 18, DAWN[1]);
  px(ctx, 231, by + 2, 48, 1, DAWN[2]);
  const stars = Math.min(3, 1 + Math.floor((character?.rankIndex ?? 0) / 3));
  for (let i = 0; i < stars; i++) {
    const sx = 238 + i * 14;
    px(ctx, sx + 2, by + 8, 2, 6, DAWN[3]);
    px(ctx, sx, by + 10, 6, 2, DAWN[3]);
    px(ctx, sx + 1, by + 9, 4, 4, DAWN[2]);
  }
  px(ctx, 226, by + 23, 56, 2, INK);
  // the hand that laid it there, withdrawing
  const away = clamp01((t - 0.8) / 0.6);
  if (away < 1) {
    const hy = Math.round(by + 18 + away * 70);
    smallHand(ctx, skinOf(character), 244, hy, -1);
  }
}

/**
 * A document nobody meant you to read, open under a lamp.
 *
 * The finger tracks down one ruled line per line of type, and a document
 * longer than the page turns onto a second sheet rather than being clipped.
 */
function drawFolder(ctx, t, character, { line = 0, page = 0, pageAt = 0 } = {}) {
  // the desk, dark, with the lamp's pool thrown across it from above left
  px(ctx, 0, 0, SCENE_W, SCENE_H, WOOD[0]);
  dither(ctx, 0, 0, SCENE_W, 12, WOOD[0], INK, 9);
  dither(ctx, 8, 12, 280, 150, null, WOOD[1], 4);
  dither(ctx, 24, 20, 230, 120, null, WOOD[2], 2);
  // the folder's board, open flat
  px(ctx, 34, 20, 252, 158, INK);
  px(ctx, 36, 22, 248, 156, WOOD[1]);
  px(ctx, 36, 22, 248, 2, WOOD[2]);
  px(ctx, 36, 22, 5, 156, WOOD[0]);
  // a second sheet: the first slides up and BEHIND it, the next rises over it,
  // so what you see mid-turn is one sheet arriving and a sliver of the last
  // one above it rather than two whole pages printed on top of each other
  const turn = clamp01((t - pageAt) / 0.4);
  if (page > 0 && turn < 1) {
    filePage(ctx, 46, 34 - Math.round(turn * 9), 228, 136, { number: `${6 + page}-${page + 1}`, ruleFrom: 52 });
    filePage(ctx, 46, 34 + Math.round((1 - turn) * 26), 228, 136, { lit: true, number: `${7 + page}-${page + 2}`, ruleFrom: 52 });
  } else {
    filePage(ctx, 46, 34, 228, 136, { lit: true, number: `${7 + page}-${page + 2}`, ruleFrom: 52 });
  }
  // the header block's classification stripe, and the stamp beside it — both
  // clear of the column the type is set in
  px(ctx, 56, 52, 52, 3, RED);
  px(ctx, 56, 56, 34, 1, PAPER[0]);
  stamp(ctx, 212, 36, 48, 18, 'FILE', RED);
  // the page's raised corner, and its shadow on the board
  for (let i = 0; i < 10; i++) {
    px(ctx, 264 + i, 160 + i, 10 - i, 1, PAPER[1]);
    px(ctx, 264 + i, 159 + i, 10 - i, 1, PAPER[2]);
  }
  px(ctx, 266, 171, 10, 2, INK);
  // the hand, in from the bottom right corner, the index on the line being read
  folderHand(ctx, skinOf(character), Math.min(128, 62 + (line % FOLDER_PAGE) * 26));
}

/**
 * The hand on the page.
 *
 * A forearm in from the bottom right corner with its cuff a clear distance
 * inside the frame, a palm with weight on it, four fingers of four lengths
 * with the index out along the ruled line being read, and a thumb drawn last
 * so that it lies on the paper. It used to be three beige rectangles.
 */
function folderHand(ctx, ramp, fy) {
  const [deep, s2, s3, lit] = ramp;
  // the forearm, in its sleeve, leaving the frame at the bottom right — dark,
  // because the lamp is above and to the left and this is the far side of it
  for (let i = 0; i < 80; i++) {
    const ax = 250 + Math.round(i * 0.42);
    const ay = fy + 22 + i;
    if (ay >= SCENE_H) break;
    px(ctx, ax - 1, ay, 38, 1, INK);
    px(ctx, ax, ay, 36, 1, i > 7 && i < 14 ? CLOTH[1] : CLOTH[0]);
    px(ctx, ax, ay, 2, 1, CLOTH[1]);
    if (i === 8) px(ctx, ax, ay, 36, 1, CLOTH[2]);
  }
  // what the hand casts on the page under it
  px(ctx, 228, fy + 25, 72, 3, INK);
  // the palm, with a knuckle ridge where the fingers leave it and the far
  // side of the hand falling away from the lamp
  px(ctx, 254, fy - 4, 40, 30, INK);
  px(ctx, 255, fy - 3, 38, 28, s3);
  px(ctx, 255, fy - 3, 38, 2, lit);
  px(ctx, 255, fy + 2, 38, 1, s2);
  px(ctx, 255, fy + 18, 38, 8, s2);
  px(ctx, 286, fy - 3, 7, 28, s2);
  // four fingers, out along the page, index longest and on the line
  for (const [dy, len, tall] of [[0, 30, 5], [6, 25, 6], [13, 20, 5], [19, 15, 4]]) {
    const x0 = 255 - len;
    px(ctx, x0 - 1, fy + dy - 1, len + 2, tall + 2, INK);
    px(ctx, x0, fy + dy, len, tall, s3);
    px(ctx, x0, fy + dy, len, 1, lit);
    px(ctx, x0, fy + dy + tall - 1, len, 1, s2);
    // the tip is round: the corner pixels go back to the ground
    px(ctx, x0, fy + dy, 1, 1, INK);
    px(ctx, x0, fy + dy + tall - 1, 1, 1, INK);
    px(ctx, x0 + 1, fy + dy + 1, 1, tall - 2, deep);
  }
  // the thumb, angled down across the near edge of the sheet, drawn last so
  // that it lies on the paper rather than under it
  for (let i = 0; i < 12; i++) {
    const tx = 252 - i;
    const ty = fy + 17 + i;
    px(ctx, tx - 1, ty, 12, 1, INK);
    px(ctx, tx, ty, 10, 1, i < 2 ? lit : s3);
    px(ctx, tx, ty, 1, 1, s2);
  }
  px(ctx, 240, fy + 29, 12, 2, INK);
}

/**
 * Quarters, at night: a bulb, a stove, a bunk, snow past a frosted window, and
 * a letter held low and to the left so the room stays legible around it.
 */
function drawQuarters(ctx, t, character, { line = 0 } = {}) {
  const swing = Math.round(Math.sin(t * Math.PI / 2) * 1);
  px(ctx, 0, 0, SCENE_W, SCENE_H, NIGHT[0]);
  px(ctx, 0, 0, SCENE_W, 104, CLOTH[0]);
  dither(ctx, 0, 0, SCENE_W, 16, CLOTH[0], NIGHT[0], 8);
  px(ctx, 0, 104, SCENE_W, 76, WOOD[0]);
  px(ctx, 0, 104, SCENE_W, 2, WOOD[1]);
  for (let x = 0; x < SCENE_W; x += 22) px(ctx, x, 106, 1, 74, NIGHT[0]);
  // the window, frosted, with snow at three depths behind it
  px(ctx, 42, 8, 76, 64, WOOD[0]);
  px(ctx, 46, 12, 68, 56, NIGHT[0]);
  for (let i = 0; i < 8; i++) px(ctx, 47 + ((i * 31) % 64), 13 + ((t * 26 + i * 17) % 52), 2, 2, NIGHT[3]);
  for (let i = 0; i < 10; i++) px(ctx, 47 + ((i * 19) % 64), 13 + ((t * 15 + i * 11) % 52), 1, 1, NIGHT[2]);
  for (let i = 0; i < 12; i++) px(ctx, 47 + ((i * 43) % 64), 13 + ((t * 8 + i * 7) % 52), 1, 1, NIGHT[1]);
  // ice, thickening into the corners of the glass
  for (const [ix, iy, dx, dy] of [[46, 12, 1, 1], [102, 12, -1, 1], [46, 56, 1, -1], [102, 56, -1, -1]]) {
    for (let i = 0; i < 4; i++) {
      dither(ctx, ix + (dx > 0 ? 0 : -i * 3), iy + (dy > 0 ? i * 3 : -i * 3), 12 - i * 3, 3, null, NIGHT[2], 4 - i);
    }
  }
  px(ctx, 42, 8, 76, 4, WOOD[1]);
  px(ctx, 42, 68, 76, 4, WOOD[1]);
  px(ctx, 42, 8, 4, 64, WOOD[1]);
  px(ctx, 114, 8, 4, 64, WOOD[1]);
  px(ctx, 79, 12, 2, 56, WOOD[1]);
  px(ctx, 46, 38, 68, 2, WOOD[1]);
  px(ctx, 42, 72, 80, 3, WOOD[2]);
  // a rag along the sill, against the draught
  px(ctx, 48, 70, 40, 4, CLOTH[1]);
  px(ctx, 52, 69, 14, 2, CLOTH[2]);
  // the bulb, swinging, and its pool on the floor
  px(ctx, 159 + swing, 0, 2, 22, STEEL[1]);
  px(ctx, 155 + swing, 22, 10, 8, PAPER[3]);
  px(ctx, 157 + swing, 30, 6, 4, AMBER);
  px(ctx, 156 + swing, 21, 8, 1, STEEL[2]);
  const pool = 140 + swing * 6;
  dither(ctx, pool, 104, 80, 40, null, WOOD[1], 4);
  dither(ctx, pool + 14, 104, 52, 22, null, WOOD[2], 3);
  // the stove, with coals that breathe
  px(ctx, 4, 56, 36, 58, INK);
  px(ctx, 6, 58, 32, 54, STEEL[0]);
  px(ctx, 6, 58, 32, 2, STEEL[1]);
  px(ctx, 6, 108, 32, 4, INK);
  px(ctx, 14, 22, 9, 36, STEEL[0]);
  px(ctx, 14, 22, 2, 36, STEEL[1]);
  const coal = Math.max(0, Math.floor(t * 6)) % 5;
  px(ctx, 10, 74, 24, 14, INK);
  px(ctx, 11, 75, 22, 12, coal % 2 ? DAWN[1] : WOOD[1]);
  px(ctx, 13, 77, 18, 8, coal > 2 ? AMBER : DAWN[2]);
  px(ctx, 16, 80, 12, 3, coal > 1 ? PAPER[3] : AMBER);
  dither(ctx, 2, 106, 54, 16, null, DAWN[1], 3);
  dither(ctx, 4, 106, 34, 8, null, AMBER, 2);
  // the bunk, and the enamel box kept by it
  px(ctx, 210, 56, 104, 66, INK);
  px(ctx, 212, 58, 100, 62, STEEL[0]);
  px(ctx, 212, 58, 100, 2, STEEL[1]);
  px(ctx, 216, 62, 92, 22, CLOTH[1]);
  px(ctx, 216, 62, 92, 2, CLOTH[2]);
  px(ctx, 220, 64, 28, 14, PAPER[2]);
  px(ctx, 220, 64, 28, 1, PAPER[3]);
  px(ctx, 208, 54, 5, 70, STEEL[1]);
  px(ctx, 310, 54, 5, 70, STEEL[1]);
  px(ctx, 208, 54, 5, 1, AMBER);
  px(ctx, 288, 86, 20, 14, PAPER[2]);
  px(ctx, 288, 86, 20, 2, PAPER[3]);
  px(ctx, 292, 90, 12, 1, NIGHT[1]);
  // the letter, held low and to the left
  letterSheet(ctx, 40, 74, 152, 104);
  dither(ctx, 40, 74, 152, 18, null, PAPER[3], 6);
  dither(ctx, 40, 164, 152, 14, null, PAPER[1], 4);
  const ramp = skinOf(character);
  handBack(ctx, ramp, 20, 146, 1);
  handBack(ctx, ramp, 190, 146, -1);
  handFront(ctx, ramp, 20, 146, 1);
  handFront(ctx, ramp, 190, 146, -1);
}

/* -------------------------------------------------------------- the last shot */

/** Where the valley sits in the frame, in scene rows. */
const HORIZON = 70;

/**
 * The valley, at the end of it.
 *
 * The sky is six uneven bands dithered into each other over six rows apiece,
 * the horizon is bowed, the ridge is authored by column and the Ville is
 * twelve to sixteen buildings of four silhouettes with irregular gaps — not
 * nine identical rectangles at a twenty-four pixel pitch, which read as a bar
 * chart. The whole village sits above the words.
 */
function endingBackdrop(g, held) {
  const sky = held
    ? [NIGHT[0], NIGHT[1], DAWN[0], DAWN[1], DAWN[2], DAWN[3]]
    : [INK, NIGHT[0], DAWN[0], RED, DAWN[1], DAWN[2]];
  const heights = [20, 14, 12, 10, 8, 6];
  let y = 0;
  for (let i = 0; i < sky.length; i++) {
    const h = heights[i];
    px(g, 0, y, SCENE_W, h, sky[i]);
    // A long, finely stepped transition between bands: at five steps over ten
    // rows the stripes were still readable through the texture, which is a
    // checkerboard over flat colour rather than a graded sky.
    if (i < sky.length - 1) ditherBand(g, 0, y + h - 9, SCENE_W, 16, sky[i], sky[i + 1], { steps: 8 });
    y += h;
  }
  px(g, 0, y, SCENE_W, HORIZON - y, sky[sky.length - 1]);
  if (held) {
    for (let i = 0; i < 30; i++) {
      const sx = (i * 53 + 11) % SCENE_W;
      const sy = (i * 17) % 34;
      px(g, sx, sy, 1, 1, i % 3 ? NIGHT[2] : NIGHT[3]);
    }
  }
  // the far hills, bowed, and the near ridge in front of them
  for (let x = 0; x < SCENE_W; x++) {
    const far = Math.round(HORIZON - 6 - 8 * Math.sin(x / 47) - 4 * Math.sin(x / 13 + 1));
    px(g, x, far, 1, 96 - far, held ? NIGHT[1] : INK);
    px(g, x, far, 1, 1, held ? NIGHT[2] : NIGHT[0]);
  }
  for (let x = 0; x < SCENE_W; x++) {
    const near = Math.round(84 - 9 * Math.sin(x / 61 + 2) - 3 * Math.sin(x / 17));
    px(g, x, near, 1, 120 - near, held ? NIGHT[0] : INK);
    // the sun is off frame to the right: the ridge catches it there and the
    // light runs out as the ground turns away from it
    if (held && (x > 150 || (x * 7) % Math.max(2, Math.round(150 - x) / 12) === 0)) {
      px(g, x, near, 1, 1, DAWN[1]);
      if (x > 210) px(g, x, near + 1, 1, 1, DAWN[0]);
    } else if (!held) {
      px(g, x, near, 1, 1, NIGHT[0]);
    }
  }
  // the river, catching what is left of the sky
  px(g, 0, 100, SCENE_W, 8, held ? NIGHT[1] : INK);
  dither(g, 0, 100, SCENE_W, 4, null, held ? DAWN[1] : NIGHT[0], 3);
  // the field in front of everything
  px(g, 0, 108, SCENE_W, SCENE_H - 108, held ? NIGHT[0] : INK);
  ditherBand(g, 0, 108, SCENE_W, 8, held ? NIGHT[1] : NIGHT[0], held ? NIGHT[0] : INK, { steps: 4 });
  if (held) {
    for (let i = 0; i < 60; i++) {
      const fx = (i * 37 + 13) % SCENE_W;
      const fy = 120 + ((i * 23) % 56);
      px(g, fx, fy, 1, 1, NIGHT[1]);
    }
  }
  // the Ville: four silhouettes, irregular widths and gaps, some overlapping
  const town = [
    [46, 14, 12], [58, 20, 9], [76, 11, 14], [85, 24, 10], [107, 16, 18],
    [121, 13, 12], [138, 22, 16], [156, 10, 9], [164, 18, 20], [184, 12, 11],
    [194, 26, 14], [218, 15, 10], [231, 11, 16], [240, 20, 12],
  ];
  for (const [x, w, h] of town) {
    const base = 112;
    px(g, x, base - h, w, h, held ? NIGHT[1] : INK);
    px(g, x, base - h, w, 1, held && x > 150 ? DAWN[0] : held ? NIGHT[2] : NIGHT[0]);
    px(g, x + w - 1, base - h, 1, h, held ? NIGHT[2] : NIGHT[0]);
    px(g, x, base - 1, w, 1, INK);
    // a roof, for the houses that have one
    if (w > 12) {
      px(g, x + 2, base - h - 2, w - 4, 2, held ? NIGHT[1] : INK);
      if (held && x > 150) px(g, x + 2, base - h - 2, w - 4, 1, DAWN[0]);
    }
  }
  // the church, taller than the rest, with its east face in the light
  px(g, 148, 80, 10, 32, held ? NIGHT[1] : INK);
  px(g, 157, 80, 1, 32, held ? DAWN[0] : NIGHT[0]);
  px(g, 146, 77, 14, 3, held ? NIGHT[1] : INK);
  px(g, 151, 70, 4, 7, held ? NIGHT[1] : INK);
  px(g, 152, 66, 2, 4, held ? DAWN[1] : NIGHT[0]);
  px(g, 150, 88, 6, 8, held ? NIGHT[0] : INK);
  if (held) {
    for (const [wx, wy] of [[62, 104], [128, 106], [200, 102]]) px(g, wx, wy, 2, 3, AMBER);
    for (const [wx, wy] of [[62, 104], [128, 106], [200, 102]]) px(g, wx, wy - 1, 2, 1, DAWN[3]);
  }
  // the antenna on the ridge, with its guy wires
  px(g, 276, 62, 2, 26, INK);
  linePx(g, 277, 62, 266, 88, held ? NIGHT[1] : INK);
  linePx(g, 277, 62, 288, 88, held ? NIGHT[1] : INK);
  px(g, 272, 88, 10, 2, INK);
}

/** Four hand-authored frames of a dish, so it turns instead of smearing. */
const DISH = [
  [[0, 0, 2, 6]],
  [[0, 0, 5, 6], [4, 1, 1, 4]],
  [[0, 0, 8, 6], [1, 1, 6, 4]],
  [[3, 0, 5, 6], [3, 1, 1, 4]],
];
function drawEnding(ctx, t, { held }) {
  const back = cached(`ending:${held ? 'held' : 'lost'}`, SCENE_W, SCENE_H, (g) => endingBackdrop(g, held));
  ctx.drawImage(back, 0, 0);
  // the dish turns, four frames on a one-point-two second loop
  // The first frame of a beat can arrive with a timestamp a hair EARLIER than
  // the one the scene started on, so the index is clamped: a negative one used
  // to read off the end of the table and throw on the last shot of the game.
  const frame = DISH[Math.max(0, Math.floor((t / 1.2) * 4)) % 4];
  for (const [dx, dy, w, h] of frame) px(ctx, 273 + dx, 56 + dy, w, h, INK);
  if (held) {
    // one chimney's smoke, drifting right and thinning
    for (let i = 0; i < 8; i++) {
      const sy = 100 - i * 5 - ((t * 6) % 5);
      const sx = 128 + Math.round(i * i * 0.5 + Math.sin(t + i) * 1.5);
      dither(ctx, sx, sy, 4 + i, 5, null, NIGHT[1], Math.max(2, 11 - i * 1.4));
    }
  } else {
    /*
     * The quarter that is burning.
     *
     * It was a hard-edged block of red dither with a straight top and sides
     * and three rigid columns of checks over it. What is here now is a pool of
     * light with no straight edge anywhere in it, tongues of flame that move,
     * and smoke that widens, leans and thins as it rises.
     */
    const pulse = 6 + Math.round(2.5 * Math.sin(t * (Math.PI * 2) / 2.4));
    const CX = 78;
    const CY = 106;
    for (let dy = -22; dy <= 8; dy++) {
      const q = dy < 0 ? dy / 22 : dy / 8;
      const half = Math.round(42 * Math.sqrt(Math.max(0, 1 - q * q)) * (dy < 0 ? 1 : 0.7));
      if (half < 2) continue;
      const jitter = Math.round(Math.sin(dy * 1.7 + t) * 2);
      const lvl = Math.max(1, pulse - Math.round(Math.abs(dy) / 4));
      dither(ctx, CX - half + jitter, CY + dy, half * 2, 1, null, RED, lvl);
      if (half > 16) {
        dither(ctx, CX - half + 12 + jitter, CY + dy, (half - 12) * 2, 1, null, DAWN[1], Math.max(1, lvl - 3));
      }
    }
    // the flames themselves: tongues that flicker on their own count
    for (let f = 0; f < 5; f++) {
      const fx = CX - 26 + f * 13;
      const tall = 6 + Math.round(5 * Math.abs(Math.sin(t * 2.3 + f * 1.7)));
      for (let i = 0; i < tall; i++) {
        const w = Math.max(1, Math.round((tall - i) * 0.7));
        const lean = Math.round(Math.sin(t * 1.6 + f + i * 0.5) * 1.5);
        const ink = i < tall - 4 ? AMBER : i < tall - 1 ? DAWN[2] : DAWN[3];
        px(ctx, fx - Math.round(w / 2) + lean, CY - 2 - i, w, 1, ink);
      }
    }
    // three columns out of it, widening, leaning and thinning as they rise
    for (let c = 0; c < 3; c++) {
      const bx = 58 + c * 24;
      for (let i = 0; i < 13; i++) {
        const sy = 100 - i * 7 - ((t * 5 + c * 3) % 7);
        const drift = i * i * 0.22 + Math.sin(t * 0.7 + c * 2 + i * 0.35) * 3;
        const w = 5 + i * 2 + Math.round(Math.sin(i * 1.3 + c) * 2);
        const lvl = Math.max(1, 10 - i);
        dither(ctx, bx + Math.round(drift), sy, w, 7, null, NIGHT[1], lvl);
        if (i < 4) dither(ctx, bx + Math.round(drift) + 1, sy + 1, Math.max(1, w - 3), 4, null, NIGHT[0], lvl);
      }
    }
  }
}

/** The same last shot, for the card the campaign leaves the player sitting on. */
export function drawEndingStill(canvas, { held = true } = {}) {
  if (!canvas?.getContext) return;
  canvas.width = SCENE_W;
  canvas.height = SCENE_H;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  endingBackdrop(ctx, held);
  const frame = DISH[1];
  for (const [dx, dy, w, h] of frame) px(ctx, 273 + dx, 56 + dy, w, h, INK);
}
