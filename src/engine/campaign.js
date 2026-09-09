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
import { reachedEchelon, appointmentNote } from './echelon.js';

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
     * The command this record currently holds. It is derived from the watches
     * stood, and stored so that being appointed can be an event with a date on
     * it rather than a number the menu recomputes silently.
     */
    appointment: 'battalion',
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

  // Some watches teach you something about the people giving the orders.
  const revelation = learn(campaign, result.missionId);

  // And the post arrives with the file entry — or is announced as not arriving,
  // which in this service is also a delivery.
  const letter = recordFamily(campaign, result, tier.id);

  const previous = campaign.completed[result.missionId];
  if (!previous || result.score > previous.score) {
    campaign.completed[result.missionId] = { score: result.score, tier: tier.id, role: result.role };
  }

  // And the promotion, which is decided by the watches you have stood rather
  // than by how any of them went — this service does not have enough officers
  // to be selective, and says so by never mentioning it.
  const appointment = appointTo(campaign);

  return { ...entry, service, revelation, appointment, letter };
}

/**
 * Move the record up to whatever command the watches stood now justify.
 *
 * The rank comes with the job. An officer appointed to a district is gazetted
 * to Major on the same order, which is how most people in this service find out
 * they have been promoted — and why nobody here believes a rank means anything
 * about the person holding it.
 */
export function appointTo(campaign) {
  const echelon = reachedEchelon(campaign, SCENARIOS);
  if (echelon.id === campaign.appointment) return null;
  campaign.appointment = echelon.id;

  let gazetted = null;
  if (campaign.character) {
    const floor = rankIndexOf(echelon.rankFloor);
    if (campaign.character.rankIndex < floor) {
      campaign.character.rankIndex = floor;
      gazetted = RANKS[floor];
      campaign.character.record.push({
        kind: 'appointment', id: echelon.id, at: campaign.character.watches,
      });
    }
  }
  return { echelon, gazetted, note: appointmentNote(echelon) };
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
      `Sector command records your conduct as exemplary. File 4471-B amended accordingly.`,
      `Your housing category has been revised upward by one grade.`,
      `A letter from the Ville was delivered to you this week. It was not opened first.`,
    ],
    satisfactory: [
      `Sector command has recorded the engagement. No comment is appended.`,
      `Nothing further is required of you at this time.`,
    ],
    noted: [
      `Your conduct of the engagement has been noted for review.`,
      `The review is routine. Most reviews are routine.`,
      `Your correspondence allowance is unchanged this month.`,
    ],
    flagged: [
      `A discrepancy has been identified between your reported conduct and the sector log.`,
      `Your file has been forwarded to the political section for assessment.`,
      `A letter addressed to you was withheld pending that assessment.`,
    ],
    condemned: [
      `You are referred to the sector political section.`,
      `Your unit is reassigned forward. Resupply for your position is suspended pending review.`,
      `Your family's residence permit in the Ville is listed as under review. You will be informed of the outcome.`,
    ],
  }[tier.id];

  if (marks >= 3 && (tier.id === 'flagged' || tier.id === 'condemned')) {
    lines.push(`This is the ${ordinal(marks)} entry of its kind in your file.`);
  }
  lines.push(supplyLine(tactical));

  return { tier, modifiers: tactical, title: `FILE ENTRY — ${tier.label}`, lines };
}

function supplyLine(tactical) {
  if (!tactical.reloadsAllowed) return 'SUPPLY: No reloads authorised. You will fight with what is on the rails.';
  if (tactical.roundsMult > 1) return 'SUPPLY: Allocation increased.';
  if (tactical.roundsMult < 1) return `SUPPLY: Allocation reduced to ${Math.round(tactical.roundsMult * 100)}%.`;
  return 'SUPPLY: Allocation nominal.';
}

/** A quiet line before the shooting starts, coloured by how the last one went. */
export function briefingNote(campaign, { narrativePressure = true } = {}) {
  if (!narrativePressure) return null;
  // The post speaks first when it has something to say — a letter being sat
  // on, or an office that has stopped sitting on anything.
  const fromFamily = familyBriefingNote(campaign);
  if (fromFamily) return fromFamily;
  const last = campaign.history[campaign.history.length - 1];
  if (!last) {
    return 'You have the watch. The sector is quiet. It will not stay that way.';
  }
  return {
    commended: 'The mess has been giving you the good coffee. Nobody has explained why.',
    satisfactory: 'Nobody mentioned the last engagement. That is the best outcome available.',
    noted: 'Your relief was late and would not meet your eye. Take the seat.',
    flagged: 'There is a man from the political section in the corridor. He is not here for you yet.',
    condemned: 'You were not told why the position moved forward. You were told to be at the console by first light.',
    // Nobody asks where you went. The file simply knows.
    abandoned: 'Nobody asked where you went last time. The log was signed for you, in somebody else’s hand.',
  }[last.tier] ?? null;
}

function ordinal(n) {
  const suffix = ['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] ?? ['th', 'st', 'nd', 'rd'][n % 100] ?? 'th';
  return `${n}${suffix}`;
}
