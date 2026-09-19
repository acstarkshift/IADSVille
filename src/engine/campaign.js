/**
 * The campaign file.
 *
 * Standing survives the mission. That is the whole point — a bad night is not
 * erased by a restart, it is written down, and the next briefing opens with it.
 * At the bottom of the scale the consequences stop being text and start being
 * mission modifiers: a forward posting with no reloads is both a punishment and
 * a harder problem.
 *
 * Tone rule for everything written here: bureaucratic understatement. Passive
 * voice, file numbers, and things that are "under review". No depiction of harm.
 * The reader's imagination is a better writer than we are, and it keeps the
 * game's menace in the register of a form letter, which is where it belongs.
 */

import { COMMAND } from './config.js';
import { tierFor } from './command.js';
import { createCharacter, recordWatch, characterModifiers, RANKS, rankIndexOf } from './character.js';
import { learn } from './revelations.js';
import { emptyFamily, recordFamily, familyBriefingNote } from './family.js';
import { SCENARIOS } from './scenarios.js';
import { reachedPost, appointmentNote } from './echelon.js';

const KEY = 'iadsville.campaign.v1';

/** In-memory fallback so tests and headless runs never touch a browser API. */
export function memoryStore() {
  const data = new Map();
  return {
    get: (k) => data.get(k) ?? null,
    set: (k, v) => { data.set(k, v); },
    clear: () => data.clear(),
  };
}

/** Adapter over localStorage that degrades to memory when storage is unavailable. */
export function browserStore() {
  try {
    const probe = '__iadsville_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return {
      get: (k) => window.localStorage.getItem(k),
      set: (k, v) => window.localStorage.setItem(k, v),
      clear: () => window.localStorage.removeItem(KEY),
    };
  } catch {
    return memoryStore();
  }
}

export function emptyCampaign(character = null) {
  return {
    /** Null until the player has enlisted and chosen who they are. */
    character,
    standing: character
      ? (characterModifiers(character).startingStanding ?? COMMAND.startingStanding)
      : COMMAND.startingStanding,
    completed: {},        // missionId -> best result summary
    history: [],          // one entry per mission flown
    /** Escalating pressure on the personal thread, 0 upward. */
    fileMarks: 0,
    commendations: 0,
    /** Set once the last watch has been stood, whichever way it went. */
    ending: null,
    /**
     * What was actually standing when it ended — recorded beside the ending id
     * because the epilogue's premise is a fact about a building, not about
     * which finding the review reached. A record with facts is gated on the
     * facts; older records fall back to the ending list.
     */
    endingFacts: null,
    /**
     * And once the watch after it has been, which only some records ever have.
     * Kept separate from `ending` because `ending` is what unlocks the
     * epilogue: folding one into the other would make flying it lock it.
     */
    epilogue: null,
    /** What the operator has worked out about their own side, in order. */
    revelations: [],
    /** The correspondence thread: what arrived, what is held, and the permit. */
    family: emptyFamily(),
    /**
     * The post this record currently holds. It is derived from the watches
     * stood, and stored so that being appointed can be an event with a date on
     * it rather than a number the menu recomputes silently.
     *
     * A new file opens at the radar set, which is where the campaign now
     * starts. It used to open at 'battalion', so the first thing a Recruit
     * read on their own personnel file was that they commanded a battalion.
     */
    appointment: 'radar',
  };
}

/** Enlist: build the soldier and set the campaign's opening standing from them. */
export function enlist(campaign, { name, background, household }) {
  campaign.character = createCharacter({ name, background, household });
  const mods = characterModifiers(campaign.character);
  campaign.standing = mods.startingStanding ?? COMMAND.startingStanding;
  return campaign.character;
}

export function loadCampaign(store) {
  try {
    const raw = store.get(KEY);
    if (!raw) return emptyCampaign();
    const parsed = JSON.parse(raw);
    const campaign = { ...emptyCampaign(), ...parsed };
    // A record saved before the service record existed still loads; the player
    // is simply asked to enlist.
    if (campaign.character) {
      campaign.character = { ...createCharacter({ name: campaign.character.name }), ...campaign.character };
    }
    // Saves from before the post existed still load: the top-level spread put a
    // fresh family object in, and a partial one from a future save is filled
    // out field by field the way the character is.
    campaign.family = { ...emptyFamily(), ...(parsed.family ?? {}) };
    return campaign;
  } catch {
    return emptyCampaign();
  }
}

export function saveCampaign(store, campaign) {
  try {
    store.set(KEY, JSON.stringify(campaign));
  } catch {
    /* A campaign that cannot be saved still plays. */
  }
}

/**
 * Fold a finished mission into the campaign file.
 * Standing carries forward at three-quarters weight: a disaster hurts into the
 * next mission, but the campaign does not become unrecoverable from one bad raid.
 */
export function recordMission(campaign, result) {
  /*
   * A watch that was walked out of is written down, and that is all it does.
   *
   * Everything the file hands out below — the experience, the promotion, the
   * decoration, the letter from home, the completion that opens the next
   * echelon — is a payment for a watch that was stood. An abandoned one was
   * not, so it banks none of them: it costs standing (charged in the world's
   * own ledger, where the reason is written), it appears in the history, and
   * it leaves `completed` alone so the campaign gate stays shut. Pressing
   * BEGIN and then LEAVE POST twelve times used to open the entire campaign.
   */
  const abandoned = !!result.abandoned;

  /*
   * The first entry in a new file is written kindly. A fumbled learning watch
   * used to brand the campaign — FLAGGED standing, the political section in
   * the corridor, and fifteen percent off the ammunition for watch two, all
   * for a night on which the player was still finding the radiate switch. The
   * first watch carries at quarter weight and lands no lower than "noted";
   * from the second onward the file is the file.
   */
  const firstWatch = campaign.history.length === 0;
  const weight = firstWatch ? 0.25 : 0.75;
  const carried = Math.round(campaign.standing * (1 - weight) + result.standing * weight);
  const floor = firstWatch ? 34 : COMMAND.minStanding;
  campaign.standing = Math.max(floor, Math.min(COMMAND.maxStanding, carried));

  // The service record is updated against the standing the watch actually left
  // you on, so a promotion reflects where you now stand rather than where you
  // stood when the raid started.
  const service = campaign.character && !abandoned
    ? recordWatch(campaign.character, result, campaign.standing)
    : null;

  const tier = tierFor(campaign.standing);
  if (tier.id === 'commended' && !abandoned) campaign.commendations++;
  if (tier.id === 'flagged' || tier.id === 'condemned') campaign.fileMarks++;

  const entry = {
    missionId: result.missionId,
    role: result.role,
    score: result.score,
    standing: campaign.standing,
    /*
     * The tier the file files this watch under. An abandoned one is filed as
     * abandoned — it was carrying tier 'satisfactory', so the history line for
     * walking out of a watch was indistinguishable from a watch stood to its
     * end and quietly accepted, and the debrief read the same word back.
     */
    tier: abandoned ? 'abandoned' : tier.id,
    leakers: result.stats.leakers,
    kills: result.stats.kills,
    assetsLost: result.stats.assetsLost,
    abandoned,
    at: Date.now(),
  };
  campaign.history.push(entry);

  if (abandoned) {
    return { ...entry, service: null, revelation: null, appointment: null, letter: null };
  }

  if (result.finale && result.endingId) campaign.ending = result.endingId;
  if (result.finale) {
    const fraction = (type) => {
      const asset = result.assets?.find((a) => a.type === type);
      return asset ? (asset.destroyed ? 1 : (asset.damagePct ?? 0) / 100) : 0;
    };
    campaign.endingFacts = {
      palaceHeld: fraction('palace') < 0.75,
      villeHeld: fraction('town') < 0.35,
    };
  }
  if (result.epilogue && result.endingId) campaign.epilogue = result.endingId;

  /*
   * Some watches teach you something about the people giving the orders. A
   * document may have a variant that depends on how the watch was actually
   * fought — THE ALLOCATION's query paragraph is about rounds an obedient
   * operator never fired — so what the evening shows is composed here, while
   * the canonical text stays on the revelation itself.
   */
  const learned = learn(campaign, result.missionId);
  const revelation = learned
    ? { ...learned, lines: learned.linesFor ? learned.linesFor(result) : learned.lines }
    : null;

  const previous = campaign.completed[result.missionId];
  if (!previous || result.score > previous.score) {
    campaign.completed[result.missionId] = { score: result.score, tier: tier.id, role: result.role };
  }

  // And the promotion, which is decided by the watches you have stood rather
  // than by how any of them went — this service does not have enough officers
  // to be selective, and says so by never mentioning it.
  /*
   * It is settled BEFORE the post is written, because one of the six letters
   * addresses the player by rank instead of by name, and it arrives on Four
   * Sectors — the evening the order gazettes them to Major. The post used to be
   * written first, so on the one night the paper in the scene before it changed
   * the rank, the letter two scenes later opened "To Recruit Tomina,".
   */
  const appointment = appointTo(campaign);

  // And the post arrives with the file entry — or is announced as not arriving,
  // which in this service is also a delivery.
  const letter = recordFamily(campaign, result, tier.id);

  return { ...entry, service, revelation, appointment, letter };
}

/**
 * Move the record up to whatever post the watches stood now justify.
 *
 * The rank comes with the job. An officer appointed to a district is gazetted
 * to Major on the same order, which is how most people in this service find out
 * they have been promoted — and why nobody here believes a rank means anything
 * about the person holding it. The two operator posts work the same way and
 * have the same teeth: standing the radar watches is what makes you a Missile
 * Operator, and a Junior Sergeant, on one piece of paper.
 *
 * The returned object still calls the post `echelon`, because six scenes, the
 * order of appointment and the personnel file all read that field and a post
 * is what they were always reading — the field named the ladder, and the
 * ladder now starts two rungs lower.
 */
export function appointTo(campaign) {
  const post = reachedPost(campaign, SCENARIOS);
  if (post.id === campaign.appointment) return null;
  campaign.appointment = post.id;

  let gazetted = null;
  if (campaign.character) {
    const floor = rankIndexOf(post.rankFloor);
    if (campaign.character.rankIndex < floor) {
      campaign.character.rankIndex = floor;
      gazetted = RANKS[floor];
      campaign.character.record.push({
        kind: 'appointment', id: post.id, at: campaign.character.watches,
      });
    }
  }
  return { echelon: post, gazetted, note: appointmentNote(post) };
}

/** What the simulation should be handed for this campaign: supply plus the soldier. */
export function missionModifiers(campaign, { narrativePressure = true } = {}) {
  const supply = consequenceFor(campaign, { narrativePressure }).modifiers;
  if (!campaign.character) return supply;
  const personal = characterModifiers(campaign.character);
  return {
    ...personal,
    ...supply,
    // Supply and training both move the round count; they should compound rather
    // than one silently overwriting the other.
    roundsMult: (supply.roundsMult ?? 1) * (personal.roundsMult ?? 1),
  };
}

/**
 * What the file says about you now, and what it does to your next mission.
 *
 * The modifiers are the teeth. Being condemned means the next raid is fought
 * with what is already on the rails.
 */
export function consequenceFor(campaign, { narrativePressure = true } = {}) {
  const tier = tierFor(campaign.standing);
  const marks = campaign.fileMarks;

  const tactical = {
    commended: { roundsMult: 1.15, reloadsAllowed: true },
    satisfactory: { roundsMult: 1, reloadsAllowed: true },
    noted: { roundsMult: 0.95, reloadsAllowed: true },
    flagged: { roundsMult: 0.85, reloadsAllowed: true },
    condemned: { roundsMult: 0.75, reloadsAllowed: false },
  }[tier.id];

  if (!narrativePressure) {
    return {
      tier,
      modifiers: tactical,
      title: `ASSESSMENT: ${tier.label}`,
      lines: [supplyLine(tactical)],
    };
  }

  const lines = {
    commended: [
      /*
       * "File 4471-B" was the form's number doing duty as the operator's own
       * file number, on a record whose card is stamped with a service number
       * and whose form is headed FORM 4471-B. Three numbers, two of them the
       * same, none of them agreeing about what it named.
       */
      'Sector command records your conduct as exemplary. Your file is amended accordingly.',
      'Your housing and travel categories have both been revised upward by one grade.',
    ],
    satisfactory: [
      'Sector command has recorded the engagement. No comment is appended.',
      'Nothing further is required of you at this time.',
    ],
    noted: [
      'Your conduct of the engagement has been noted for review. The review is routine.',
      'Your correspondence allowance is unchanged this month.',
    ],
    flagged: [
      'A discrepancy has been identified between your reported conduct and the sector log.',
      'Your file has been forwarded to the political section for assessment.',
      'You will be asked to account for the discrepancy. You will not be told which one.',
    ],
    condemned: [
      'You are referred to the sector political section.',
      'Your unit is reassigned forward. Resupply for your position is suspended pending review.',
      "Your family's residence permit in the Ville is listed as under review. You will be informed"
        + ' of the outcome.',
    ],
  }[tier.id];

  const markLine = marks >= 3 && (tier.id === 'flagged' || tier.id === 'condemned')
    ? `This is the ${ordinalWord(marks)} entry of its kind in your file.` : null;
  if (markLine) lines.push(markLine);
  lines.push(supplyLine(tactical));

  /*
   * The same entry twice, for two mouths.
   *
   * `lines` is the form: it is printed on the report under FORM 4471-B, and a
   * form is allowed a label, a colon and a percentage — and a form is allowed
   * to say the same thing every month, because that is what a form is.
   *
   * `spokenLines` is what the man in the office reads out, and a man does not.
   * He said the identical five sentences on every evening of the campaign,
   * which made the one recurring character in the game a form letter read
   * aloud. Now he says the entry, then one thing the entry costs you this
   * month, and he only mentions the allocation on a night it actually moved.
   */
  /*
   * The allocation is mentioned on a night it actually moved.
   *
   * It used to be mentioned on every condemned night as well, because a
   * condemned file is never allowed to reload — so "You will not be reloading.
   * Whatever is on the rails at the start of the next watch is what you have
   * for it." was said word for word on three consecutive bad evenings. Nothing
   * had moved on the second and the third; the supply was as suspended as it
   * had been the night before, and a man does not tell you the same standing
   * fact three times.
   */
  const previous = campaign.history?.[campaign.history.length - 2]?.tier ?? null;
  const supplyMoved = previous === null || previous !== tier.id;
  const spokenLines = [
    spokenEntry(tier.id, campaign) ?? lines[0],
    monthlyLine(tier.id, campaign),
    markLine,
    supplyMoved ? supplySpoken(tactical) : null,
  ].filter(Boolean);

  /*
   * And the same entry a third time, for a paper nobody reads aloud.
   *
   * On the night the post is struck the section does not hold a meeting: it
   * signs a finding and sends it. The form's own lines are already in the
   * right register for that — passive, filed, nothing in the first person —
   * except the supply line, which is a label and a colon and belongs on the
   * tape rather than in a paragraph of a signed document.
   */
  const writtenLines = [
    ...lines.filter((l) => !/^[A-Z]+:/.test(l)),
    supplyWritten(tactical),
  ];

  return {
    tier,
    modifiers: tactical,
    title: `FILE ENTRY — ${tier.label}`,
    lines,
    spokenLines,
    writtenLines,
  };
}

/**
 * The file entry's opening sentence, in his mouth, three ways per tier.
 *
 * The printed form keeps one fixed wording, because that is what a form is.
 * The man reading it out does not: a record that sat at noted for four watches
 * heard "Your conduct of the engagement has been noted for review. The review
 * is routine." four evenings running, immediately after the night line that
 * was written to vary. Taken in turn by the number of watches in the file, so
 * the same file on the same watch always hears the same sentence.
 */
const SPOKEN_ENTRY = {
  commended: [
    'Sector command records your conduct as exemplary. Your file is amended accordingly.',
    'Sector command has entered tonight as exemplary conduct. The entry is signed, and it is not'
      + ' provisional.',
    'Your conduct tonight is recorded as exemplary. Sector command wrote the entry and I'
      + ' countersigned it.',
  ],
  satisfactory: [
    'Sector command has recorded the engagement. No comment is appended.',
    'Sector command has entered the engagement in your file. Nothing is appended to it.',
    'The engagement is recorded. Sector command had no comment to add and did not add one.',
  ],
  noted: [
    'Your conduct of the engagement has been noted for review. The review is routine.',
    'Your conduct of the engagement is noted for review. I opened it this evening, and it will run'
      + ' its course.',
    'Sector command has noted your conduct of the engagement. The review that follows a note is'
      + ' done by this office.',
  ],
  flagged: [
    'A discrepancy has been identified between your reported conduct and the sector log.',
    'A discrepancy stands between your reported conduct and the sector log. I identified it'
      + ' myself.',
    'Sector command has identified a discrepancy between what you reported and what the log'
      + ' holds.',
  ],
  condemned: [
    'You are referred to the sector political section.',
    'You are referred to this office by name. The referral is written and it is signed.',
    'Sector command has referred you to the political section. The referral came to this desk.',
  ],
};
function spokenEntry(tierId, campaign) {
  const list = SPOKEN_ENTRY[tierId];
  if (!list?.length) return null;
  return list[Math.max(0, (campaign.history?.length ?? 1) - 1) % list.length];
}

/**
 * What the file entry costs you this month, in his mouth.
 *
 * Four per tier, taken in turn by the number of watches the file carries, so a
 * player who is noted six times hears six different consequences instead of
 * the same sentence about a correspondence allowance six times. Deterministic,
 * like everything else here: the same file on the same watch always hears the
 * same line.
 */
const MONTHLY = {
  commended: [
    'Your housing category is revised upward by one grade. Somebody in this office signed for'
      + ' that, and it was me.',
    'Your travel category goes up a grade. It does not extend to the western valley.',
    'The district asked this office for a name on Tuesday and I gave them yours. You will hear'
      + ' nothing more about it.',
    'Your correspondence allowance is increased by two letters a month. You are not obliged to'
      + ' use it.',
  ],
  satisfactory: [
    'Nothing further is required of you at this time.',
    'Your file goes back in the drawer tonight with one more page in it.',
    'Your allowances are unchanged this month. The clerk brings the paper round on Thursday.',
    'The tape is filed. Nobody above me has asked for it.',
  ],
  noted: [
    'Your correspondence allowance is unchanged this month.',
    'The district has asked for a copy of the tape. I have not sent it yet.',
    'Your leave application for the eleventh is held until the review closes. It is not refused.',
    'You are on a list this month that you were not on last month. It is a short list.',
  ],
  flagged: [
    'Your file has been forwarded to the political section for assessment.',
    'Your correspondence is stopped while the assessment runs. Anything addressed to you stays in'
      + ' this office.',
    'You will be asked to account for the discrepancy. You will not be told which one.',
    'A second officer has read the tape. He is not from this sector and you have not met him.',
  ],
  condemned: [
    'Your unit is reassigned forward. Resupply for your position is suspended pending review.',
    'Your pay is stopped this month while the review runs. The mess has been told.',
    'Two men from the district will sit behind you on the next watch. They will not speak to you.',
    'Your name is off the duty roster from Monday. It has not been put on any other roster yet.',
  ],
};

/**
 * And while the residence permit is open, that is what he raises, because it is
 * the thing that matters.
 *
 * It used to raise it by returning one fixed sentence, which outranked the
 * rotation instead of joining it: a file sitting at condemned heard "Your
 * family's residence permit in the Ville is listed as under review. You will
 * be informed of the outcome." word for word on every evening the permit was
 * open, which is the one thread in the game that must not sound recorded. The
 * permit now has four sentences of its own and takes them in turn exactly as
 * MONTHLY does — the first says the thing has opened, and the rest are what an
 * open review looks like from the inside of the office holding it.
 */
const PERMIT_REVIEW = [
  "Your family's residence permit in the Ville is listed as under review from tonight. You will be"
    + ' informed of the outcome.',
  'The review of your family\'s permit sits with the district housing office. It is one of forty'
    + ' they are holding this quarter.',
  'Nothing has been written to your household about the permit. The regulation does not require'
    + ' it.',
  'The permit file came back to this office this week with nothing added to it. It goes in the'
    + ' drawer with your tape.',
];
function monthlyLine(tierId, campaign) {
  const watch = campaign.history?.length ?? 1;
  if (tierId === 'condemned' && (campaign.family?.permit ?? 'standing') === 'review') {
    // Counted from the evening the review opened, so the sentence that says it
    // has opened is the one said on the evening it opens. A record saved before
    // the office kept that date rotates from the watch count instead.
    const opened = campaign.family?.permitOpenedAt;
    const since = Number.isFinite(opened) ? Math.max(0, watch - opened) : Math.max(0, watch - 1);
    return PERMIT_REVIEW[since % PERMIT_REVIEW.length];
  }
  const list = MONTHLY[tierId];
  if (!list?.length) return null;
  return list[Math.max(0, watch - 1) % list.length];
}

function supplyLine(tactical) {
  if (!tactical.reloadsAllowed) return 'SUPPLY: No reloads authorised. You will fight with what is on the rails.';
  if (tactical.roundsMult > 1) return 'SUPPLY: Allocation increased.';
  if (tactical.roundsMult < 1) return `SUPPLY: Allocation reduced to ${Math.round(tactical.roundsMult * 100)}%.`;
  return 'SUPPLY: Allocation nominal.';
}

/** The same fact, said out loud by somebody who is not going to give you the figure. */
function supplySpoken(tactical) {
  if (!tactical.reloadsAllowed) {
    return 'You will not be reloading. Whatever is on the rails at the start of the next watch is'
      + ' what you have for it.';
  }
  if (tactical.roundsMult > 1) return 'Your allocation of rounds goes up. Somebody signed for that.';
  if (tactical.roundsMult < 1) {
    return 'Your allocation of rounds is cut for the next watch. You will be told by how much when'
      + ' you sign for it.';
  }
  return 'Your allocation of rounds is unchanged.';
}

/** And the same fact on a paper that nobody stands up to read. */
function supplyWritten(tactical) {
  if (!tactical.reloadsAllowed) {
    return 'No reloads are authorised for this position. The next watch is fought with what is on'
      + ' the rails at the start of it.';
  }
  if (tactical.roundsMult > 1) return 'The allocation of rounds for this position is increased.';
  if (tactical.roundsMult < 1) return 'The allocation of rounds for this position is reduced.';
  return 'The allocation of rounds for this position is unchanged.';
}

/**
 * The SIGNAL line on the order sheet: the morning after the night before.
 *
 * Four per tier, taken in turn by the number of watches in the file, the way
 * the office's monthly line and its dismissals are — and where the night
 * before left a figure behind, the line reads it. One fixed sentence per tier
 * printed "Nobody mentioned the last engagement. That is the best outcome
 * available." on seven of ten briefings, four of them consecutively, in
 * italics, at the top of the sheet.
 */
const SIGNAL_BY_TIER = {
  commended: [
    () => 'The mess has been giving you the good coffee. Nobody has explained why.',
    () => 'Your relief saluted this morning, which he has not done before. Nobody has told him to.',
    () => 'There is a photograph of the sector\'s operators on the board in the corridor. You are'
      + ' in it, second from the left, and nobody said it was being taken.',
    () => 'The clerk brought your allocation up himself instead of sending the boy. He did not'
      + ' say why, and you did not ask.',
  ],
  satisfactory: [
    () => 'Nobody mentioned the last engagement. That is the best outcome available.',
    () => 'The tape from the last watch was filed on Thursday, with the others. Nobody has asked'
      + ' for it back.',
    (last) => `Your relief handed over on time and said nothing about ${last.leakers
      ? 'the ones that got through' : 'the night'}. The log is open at a fresh page.`,
    () => 'There is a new mug on the shelf by the door. It is not yours, and nobody has claimed it.',
  ],
  noted: [
    () => 'Your relief was late and would not meet your eye. Take the seat.',
    () => 'Somebody has been through the log before you. The pages are in order, and one of them'
      + ' has a paperclip on it.',
    () => 'The clerk asked for your service number this morning. He has had it for a year.',
    (last) => `The night's returns went up to the district with a note pinned to them${last.assetsLost
      ? ', under the loss return' : ''}. You were not shown the note.`,
  ],
  flagged: [
    () => 'There is a man from the political section in the corridor. He is not here for you yet.',
    () => 'Your name was read out at the morning parade with two others, in a list, for no stated'
      + ' purpose.',
    () => 'The seat has been moved a hand\'s width to the left. Somebody sat in it last night who'
      + ' was not the relief.',
    () => 'A second copy of the last tape was made this morning. The first copy is where it'
      + ' always is.',
  ],
  condemned: [
    () => 'You were not told why the position moved forward. You were told to be at the console by'
      + ' first light.',
    () => 'The transport left before the mess opened. You ate in the cab.',
    () => 'The two men from the corridor came out to the position with you. They have chairs behind'
      + ' yours.',
    () => 'Your kit arrived at the forward position in a sack with somebody else\'s name crossed'
      + ' out on it.',
  ],
  // Nobody asks where you went. The file simply knows.
  abandoned: [
    () => 'Nobody asked where you went last time. The log was signed for you, in somebody else’s hand.',
    () => 'The watch you left is in the log as stood, with a signature on it that is not yours.',
    () => 'Your relief has been told to note the hour you arrive. He was not told why.',
    () => 'The seat was warm when you came in. Nobody says whose it was.',
  ],
};

/** A quiet line before the shooting starts, coloured by how the last one went. */
export function briefingNote(campaign, { narrativePressure = true, missionId = null } = {}) {
  if (!narrativePressure) return null;
  // The post speaks first when it has something to say — a letter being sat
  // on, or an office that has stopped sitting on anything.
  const fromFamily = familyBriefingNote(campaign, missionId);
  if (fromFamily) return fromFamily;
  const last = campaign.history[campaign.history.length - 1];
  if (!last) {
    /*
     * The first-night line, on a record that has a first night. A file that
     * has completed watches has stood them whatever its history array says,
     * and it was being told the sector was quiet on the night it took the seat
     * as Chief of Air Defence.
     */
    return Object.keys(campaign.completed ?? {}).length === 0
      ? 'You have the watch. The sector is quiet. It will not stay that way.'
      : 'You have the watch. Nobody has briefed you tonight and nobody is going to.';
  }
  const list = SIGNAL_BY_TIER[last.tier];
  if (!list) return null;
  return list[Math.max(0, campaign.history.length - 1) % list.length](last);
}

/**
 * Ordinals in words, because a man in an office says "the fourth entry" and
 * the file entry is read out loud before it is ever printed. Past twelfth it
 * falls back to the figure, and a file with thirteen marks in it has other
 * problems.
 */
const ORDINAL_WORDS = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh',
  'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth'];
function ordinalWord(n) {
  if (ORDINAL_WORDS[n]) return ORDINAL_WORDS[n];
  const suffix = ['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] ?? ['th', 'st', 'nd', 'rd'][n % 100] ?? 'th';
  return `${n}${suffix}`;
}
