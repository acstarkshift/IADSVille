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
import { createCharacter, recordWatch, characterModifiers } from './character.js';
import { learn } from './revelations.js';

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
    /** What the operator has worked out about their own side, in order. */
    revelations: [],
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
  const carried = Math.round(campaign.standing * 0.25 + result.standing * 0.75);
  campaign.standing = Math.max(COMMAND.minStanding, Math.min(COMMAND.maxStanding, carried));

  // The service record is updated against the standing the watch actually left
  // you on, so a promotion reflects where you now stand rather than where you
  // stood when the raid started.
  const service = campaign.character
    ? recordWatch(campaign.character, result, campaign.standing)
    : null;

  const tier = tierFor(campaign.standing);
  if (tier.id === 'commended') campaign.commendations++;
  if (tier.id === 'flagged' || tier.id === 'condemned') campaign.fileMarks++;

  const entry = {
    missionId: result.missionId,
    role: result.role,
    score: result.score,
    standing: campaign.standing,
    tier: tier.id,
    leakers: result.stats.leakers,
    kills: result.stats.kills,
    assetsLost: result.stats.assetsLost,
    at: Date.now(),
  };
  campaign.history.push(entry);

  if (result.finale && result.endingId) campaign.ending = result.endingId;

  // Some watches teach you something about the people giving the orders.
  const revelation = learn(campaign, result.missionId);

  const previous = campaign.completed[result.missionId];
  if (!previous || result.score > previous.score) {
    campaign.completed[result.missionId] = { score: result.score, tier: tier.id, role: result.role };
  }
  return { ...entry, service, revelation };
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
  }[last.tier] ?? null;
}

function ordinal(n) {
  const suffix = ['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] ?? ['th', 'st', 'nd', 'rd'][n % 100] ?? 'th';
  return `${n}${suffix}`;
}
