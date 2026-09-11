/**
 * The teaching watch's walk-through: five cards a seat, each cleared by the
 * player actually doing the thing.
 *
 * The chatter can say "bring the set up", but an instruction that waits until
 * you have done it is the only kind a first watch reliably reads. Every step
 * also times out — measured before that: a player who left the scope alone
 * was still reading "2 / 5" at t=630 s of a 660 s watch, because the arrival
 * arc on this raid is 300–345° and steps one to three had no way out but
 * success. A card that is still up when the watch has moved on is furniture.
 *
 * The cards live here, away from the DOM, for one reason: the names in them
 * are checked. The first card tells the player to find WIDE EYE, and the card
 * on the rack said P-31 WIDE EYE — the same set under two names, on the one
 * watch whose job is to teach the console. `test/console.test.js` holds that
 * every radar a lesson names is the label the radar carries, which is the
 * label the rack now prints first, with the nomenclature on the plate under
 * it the way every battery card already did.
 */

/**
 * A step that names a radar says so in `radars`, and the test holds that the
 * sentence really contains that name and that a set really carries it.
 *
 * @typedef {{ id: string, en: string, tm: string, radars?: string[],
 *   done: (w: any, u: any, sinceS: number) => boolean }} Step
 */

/** The battle manager's five. */
export const NET_TUTORIAL_STEPS = [
  {
    id: 'radiate',
    en: 'The surveillance set is cold and nothing will paint. Find WIDE EYE on the right panel and press RADIATE.',
    tm: 'ВКЛЮЧИТЕ ИЗЛУЧЕНИЕ',
    radars: ['WIDE EYE'],
    done: (w, u, sinceS) => w.radars.some((r) => !r.siteId && r.on) || sinceS > 120,
  },
  {
    id: 'select',
    en: 'Contacts paint as the beam sweeps. Click a contact on the scope, or a row in the TRACKS list.',
    tm: 'ВЫБЕРИТЕ ЦЕЛЬ',
    done: (w, u, sinceS) => !!u.selectedTrackId || sinceS > 120,
  },
  {
    id: 'assign',
    en: 'Hand it to a battery: drag the contact onto a battery symbol, or press Shift+1. The battery answers on the log.',
    tm: 'НАЗНАЧЬТЕ БАТАРЕЮ',
    // Ninety seconds, not a hundred and fifty. A card that is still up when
    // the watch has moved on is furniture — and this one used to be
    // unclearable by the key it teaches, so it sat here for two and a half
    // minutes while the raid ran on around it.
    done: (w, u, sinceS) => [...w.tracks.values()].some((t) => t.assignedTo.length > 0) || sinceS > 90,
  },
  {
    id: 'intercept',
    en: 'The battery fires when the shot is right — HOLDING FOR RANGE is aiming, not refusal. Watch the intercept.',
    tm: 'ЖДИТЕ ПЕРЕХВАТА',
    done: (w, u, sinceS) => w.stats.kills > 0 || sinceS > 150,
  },
  {
    id: 'net',
    en: 'When sector command transmits, Y acknowledges and N refuses. Both are recorded. The rest of the watch is yours.',
    tm: 'СЕТЬ ВАША',
    done: (w, u, sinceS) => sinceS > 16,
  },
];

/**
 * And the cabin's five, which did not exist.
 *
 * The teaching watch advertises three seats and gated the whole walk-through
 * off for the third of them, so a player who chose SAM OPERATOR on the watch
 * whose entire job is teaching the controls got no cards at all. The cabin is
 * not the net with fewer buttons: its lesson is that the battery you are
 * sitting in has an antenna of its own, and that the sequence is
 * acquire → lock → wait → launch. Same five-step shape, same dismiss button,
 * same rule that a step is cleared by doing the thing.
 */
export const CREW_TUTORIAL_STEPS = [
  {
    id: 'radiate-own',
    en: 'Your own set is cold, and sector’s picture is not a firing solution. Press RADIATE on your battery.',
    tm: 'ВКЛЮЧИТЕ ИЗЛУЧЕНИЕ',
    done: (w, u, sinceS) => w.radarsOf(w.siteById.get(w.control.crewedBatteryId) ?? {})
      .some((r) => r.on) || sinceS > 120,
  },
  {
    id: 'designate',
    en: 'Contacts paint as the beam sweeps. Click one on the scope, or a row in the shootlist, to designate it.',
    tm: 'ВЫБЕРИТЕ ЦЕЛЬ',
    done: (w, u, sinceS) => !!u.selectedTrackId || sinceS > 120,
  },
  {
    id: 'lock',
    en: 'Press LOCK to put a channel on it. The battalion refuses in plain words when it cannot — read the refusal.',
    tm: 'ЗАХВАТ ЦЕЛИ',
    done: (w, u, sinceS) => (w.siteById.get(w.control.crewedBatteryId)?.engagements.length ?? 0) > 0
      || sinceS > 150,
  },
  {
    id: 'launch',
    en: 'The cap lights when the solution is ready. LAUNCH — and keep the set radiating until the round arrives.',
    tm: 'ПУСК',
    done: (w, u, sinceS) => w.stats.roundsFired > 0 || sinceS > 150,
  },
  {
    id: 'net-crew',
    en: 'When sector command transmits, Y acknowledges and N refuses. Both are recorded. The rest of the watch is yours.',
    tm: 'СЕТЬ ВАША',
    done: (w, u, sinceS) => sinceS > 16,
  },
];

/**
 * Every radar callsign a lesson names, so a test can hold the tutorial and the
 * rack to one name. A step declares the sets it is about; a declared name
 * that is not in the step's own sentence is reported as an empty string, so
 * the test fails on the step rather than passing on a stale declaration.
 */
export function radarNamesIn(steps) {
  const names = new Set();
  for (const step of steps) {
    for (const name of step.radars ?? []) names.add(step.en.includes(name) ? name : '');
  }
  return [...names];
}
