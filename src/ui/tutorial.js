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
 * `phone` is the same lesson for a console that is laid out differently.
 * Some of these cards told the player where to look — "at the top of the
 * right-hand panel", "its row in the AIR PICTURE list", "the list on the
 * left" — or which key to hit — "Shift+1", "press Y to acknowledge". Below
 * 900px none of those exist: there is no right-hand panel and no list (the
 * rack is under the picture and the picture is the list), and there is no
 * keyboard at all. A card that names a control that is not there is worse
 * than one that names none, so those cards carry a second sentence and the
 * rest are one sentence at every width. `stepText` picks; see
 * `renderTutorial` in app.js.
 *
 * @typedef {{ id: string, en: string, phone?: string, radars?: string[],
 *   done: (w: any, u: any, sinceS: number) => boolean }} Step
 */

/** The card as this console should say it. */
export function stepText(step, phone) {
  return (phone && step.phone) || step.en;
}

/**
 * Every wording a lesson can be read in, so that a rule about the words is a
 * rule about all of them: the phone card is the same lesson, and it is held to
 * the same English as the desktop one. See the tests in console.test.js.
 */
export function stepTexts(step) {
  return step.phone ? [step.en, step.phone] : [step.en];
}

/** The battle manager's five. */
export const NET_TUTORIAL_STEPS = [
  {
    id: 'radiate',
    en: 'Your long-range radar, WIDE EYE, is switched off, so the scope is blank. '
      + 'Find WIDE EYE at the top of the right-hand panel and flip its switch up to RADIATE.',
    // On a phone WIDE EYE's switch is the one on the bar at the foot of the
    // screen: the rack below the picture shows the set and its state, and the
    // rail carries its lever, because the rail is the part that never scrolls.
    phone: 'Your long-range radar, WIDE EYE, is switched off, so the scope is blank. '
      + 'Flip the RADIATE switch on the bar at the bottom of the screen.',
    radars: ['WIDE EYE'],
    done: (w, u, sinceS) => w.radars.some((r) => !r.siteId && r.on) || sinceS > 120,
  },
  {
    id: 'select',
    en: 'Contacts appear on the scope as the beam sweeps past them. '
      + 'Click a contact on the scope, or its row in the AIR PICTURE list, to pick it.',
    // The AIR PICTURE list is a desktop column and is not drawn on a phone,
    // where the picture itself is the list and NEXT TARGET walks it.
    phone: 'Contacts appear on the scope as the beam sweeps past them. '
      + 'Press one on the scope, or press NEXT TARGET, to pick it.',
    done: (w, u, sinceS) => !!u.selectedTrackId || sinceS > 120,
  },
  {
    id: 'assign',
    en: 'Give it to a battery: drag the contact onto a battery symbol, or press Shift+1 '
      + 'for battery 1. The battery reports back on the log at the bottom.',
    // Shift+1 is not a thing a thumb can do. On a phone the rack under the
    // picture picks the battery and ASSIGN on the bar hands the contact over.
    phone: 'Give it to a battery: press one on the rack below, then press ASSIGN. '
      + 'It reports back on the log.',
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
    done: (w, u, sinceS) => w.stats.kills > 0 || sinceS > 150,
  },
  {
    id: 'net',
    en: 'When sector command calls, press Y to acknowledge or N to refuse. '
      + 'Both go on your record. The rest of the watch is yours.',
    // No keyboard: the two caps are on the banner itself.
    phone: 'When sector command calls, press ACKNOWLEDGE or REFUSE on the banner. '
      + 'Both go on your record. The rest of the watch is yours.',
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
    done: (w, u, sinceS) => w.radarsOf(w.siteById.get(w.control.crewedBatteryId) ?? {})
      .some((r) => r.on) || sinceS > 120,
  },
  {
    id: 'designate',
    en: 'Contacts appear as your beam sweeps past them. Click one on the scope, or its '
      + 'row in the list on the left, to make it your target.',
    // "the list on the left" is a desktop column; the phone has the picture
    // and the rail.
    phone: 'Contacts appear as your beam sweeps past them. Press one on the scope, '
      + 'or press NEXT TARGET, to make it your target.',
    done: (w, u, sinceS) => !!u.selectedTrackId || sinceS > 120,
  },
  {
    id: 'lock',
    en: 'Press LOCK to lock a fire-control channel onto your target. If the battery '
      + 'cannot take the shot, the console says why in plain words.',
    done: (w, u, sinceS) => (w.siteById.get(w.control.crewedBatteryId)?.engagements.length ?? 0) > 0
      || sinceS > 150,
  },
  {
    id: 'launch',
    en: 'LAUNCH lights up when the shot is ready. Press it — and keep your radar on '
      + 'until the missile arrives, because your radar is steering it.',
    done: (w, u, sinceS) => w.stats.roundsFired > 0 || sinceS > 150,
  },
  {
    id: 'net-crew',
    en: 'When sector command calls, press Y to acknowledge or N to refuse. '
      + 'Both go on your record. The rest of the watch is yours.',
    // No keyboard: the two caps are on the banner itself.
    phone: 'When sector command calls, press ACKNOWLEDGE or REFUSE on the banner. '
      + 'Both go on your record. The rest of the watch is yours.',
    done: (w, u, sinceS) => sinceS > 16,
  },
];

/**
 * Every radar callsign a lesson names, so a test can hold the tutorial and the
 * rack to one name. A step declares the sets it is about; a declared name
 * that is not in EVERY wording of that step is reported as an empty string, so
 * the test fails on the step rather than passing on a stale declaration — a
 * lesson that says WIDE EYE on a desktop and names nothing on a phone is two
 * different lessons.
 */
export function radarNamesIn(steps) {
  const names = new Set();
  for (const step of steps) {
    for (const name of step.radars ?? []) {
      names.add(stepTexts(step).every((t) => t.includes(name)) ? name : '');
    }
  }
  return [...names];
}
