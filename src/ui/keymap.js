/**
 * The keyboard, decided in one place and free of the DOM so it can be tested.
 *
 * Two rules live here, and both of them were broken on the console:
 *
 *  1. A number is read off the physical key, not off the character. `e.key`
 *     changes with the modifier and with the layout — on a US board Shift+1
 *     arrives as '!' — so a handler that switched on `e.key.toLowerCase()`
 *     could never see a shifted digit at all. The interactive tutorial teaches
 *     "press Shift+1" as one of the two ways to hand a contact to a battery;
 *     measured, it did nothing, and the card then sat on step 3 of 5 for the
 *     rest of the watch.
 *
 *  2. The number printed on a speed cap is the number that selects it. The old
 *     map was positional — `[1, 2, 4, 0][n]` — so 3 selected the cap stencilled
 *     4×, and 4, the obvious reach for maximum speed, stopped the raid dead.
 *     There is no 3× speed, so there is no 3 key.
 */

/** The speed each printed cap answers to. Pause is 0 (and the space bar). */
export const SPEED_BY_KEY = { 0: 0, 1: 1, 2: 2, 4: 4 };

/**
 * Which number the operator actually pressed, or null.
 *
 * `code` first, because it is the key under the finger whatever the layout and
 * whatever is held down with it. The shifted glyphs of a US number row are
 * accepted as a fallback so a synthesised event carrying only a `key` — a
 * test, a soft keyboard, a remapped layout — still lands on the same number.
 */
export function digitPressed(e) {
  const byCode = /^(?:Digit|Numpad)([0-9])$/.exec(e?.code ?? '');
  if (byCode) return Number(byCode[1]);
  const key = e?.key ?? '';
  if (/^[0-9]$/.test(key)) return Number(key);
  const shifted = '!@#$%^&*()'.indexOf(key);
  return shifted >= 0 ? (shifted + 1) % 10 : null;
}
