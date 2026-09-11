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
    en: 'Your long-range radar, WIDE EYE, is switched off, so the scope is blank. '
      + 'Find WIDE EYE at the top of the right-hand panel and flip its switch up to RADIATE.',
    tm: 'ВКЛЮЧИТЕ ИЗЛУЧЕНИЕ',
    radars: ['WIDE EYE'],
    done: (w, u, sinceS) => w.radars.some((r) => !r.siteId && r.on) || sinceS > 120,
  },
  {
    id: 'select',
    en: 'Contacts appear on the scope as the beam sweeps past them. '
      + 'Click a contact on the scope, or its row in the AIR PICTURE list, to pick it.',
    tm: 'ВЫБЕРИТЕ ЦЕЛЬ',
    done: (w, u, sinceS) => !!u.selectedTrackId || sinceS > 120,
  },
  {
    id: 'assign',
    en: 'Give it to a battery: drag the contact onto a battery symbol, or press Shift+1 '
      + 'for battery 1. The battery reports back on the log at the bottom.',
    tm: 'НАЗНАЧЬТЕ БАТАРЕЮ',
    // Ninety seconds, not a hundred and fifty. A card that is still up when
    // the watch has moved on is furniture — and this one used to be
    // unclearable by the key it teaches, so it sat here for two and a half
    // minutes while the raid ran on around it.
    done: (w, u, sinceS) => [...w.tracks.values()].some((t) => t.assignedTo.length > 0) || sinceS > 90,
  },
  {
    id: 'intercept',
    en: 'The battery fires when the shot is good. WAITING FOR RANGE means it is aiming, '
      + 'not refusing. Watch the missile fly out and meet the contact.',
    tm: 'ЖДИТЕ ПЕРЕХВАТА',
    done: (w, u, sinceS) => w.stats.kills > 0 || sinceS > 150,
  },
  {
    id: 'net',
    en: 'When sector command calls, press Y to acknowledge or N to refuse. '
      + 'Both go on your record. The rest of the watch is yours.',
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
 * sitting in has a radar of its own, and that the sequence is pick a target,
 * lock, wait, launch. Same five-step shape, same dismiss button, same rule
 * that a step is cleared by doing the thing.
 *
 * And, like the net's, written for somebody who has never seen a radar.
 * "Designate", "put a channel on it", "the TRACKS list" (the panel says AIR
 * PICTURE) and "sector's picture is not a firing solution" were shop talk;
 * each card says what to do, where the control is, and what will happen.
 */
export const CREW_TUTORIAL_STEPS = [
  {
    id: 'radiate-own',
    en: 'Your battery’s own radar is switched off. Sector’s picture shows you where the '
      + 'contacts are, but you cannot shoot on it — flip your switch up to RADIATE.',
    tm: 'ВКЛЮЧИТЕ ИЗЛУЧЕНИЕ',
    done: (w, u, sinceS) => w.radarsOf(w.siteById.get(w.control.crewedBatteryId) ?? {})
      .some((r) => r.on) || sinceS > 120,
  },
  {
    id: 'designate',
    en: 'Contacts appear as your beam sweeps past them. Click one on the scope, or its '
      + 'row in the list on the left, to make it your target.',
    tm: 'ВЫБЕРИТЕ ЦЕЛЬ',
    done: (w, u, sinceS) => !!u.selectedTrackId || sinceS > 120,
  },
  {
    id: 'lock',
    en: 'Press LOCK to lock a fire-control channel onto your target. If the battery '
      + 'cannot take the shot, the console says why in plain words.',
    tm: 'ЗАХВАТ ЦЕЛИ',
    done: (w, u, sinceS) => (w.siteById.get(w.control.crewedBatteryId)?.engagements.length ?? 0) > 0
      || sinceS > 150,
  },
  {
    id: 'launch',
    en: 'LAUNCH lights up when the shot is ready. Press it — and keep your radar on '
      + 'until the missile arrives, because your radar is steering it.',
    tm: 'ПУСК',
    done: (w, u, sinceS) => w.stats.roundsFired > 0 || sinceS > 150,
  },
  {
    id: 'net-crew',
    en: 'When sector command calls, press Y to acknowledge or N to refuse. '
      + 'Both go on your record. The rest of the watch is yours.',
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
