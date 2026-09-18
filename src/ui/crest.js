/**
 * The national crest, cast into the desk lip at the operator's left hand.
 *
 * The console's bottom-left corner was the one part of the desk with nothing
 * on it: the ticker is a three-column grid and its first column — as wide as
 * the track panel above it — carried no content at any desktop width, so three
 * hundred pixels of machined metal sat blank beside the card reader.
 *
 * What belongs there is the thing the watch is stood for. The crest is painted
 * enamel on cast brass, so unlike everything else on the lip it does not take
 * the echelon's metal or the hour's light: a national device is the same
 * object in a battalion cabin at dawn and in the national command at midnight.
 *
 * It is drawn here rather than written as markup because it is pixel art and
 * has to obey the same rules as the cutscenes — the palette table of
 * `scenes.js`, whole pixels, no path primitives, no system font — and
 * `test/palette.test.js` holds this file to those rules with the same
 * assertions it holds the scenes to.
 *
 * The device itself is the one already flying on the pole in the political
 * section's office (`drawOffice` in scenes.js): a sunburst in sunrise gold
 * with a red heart, on a red field. If one is ever redrawn the other moves
 * with it, because a country does not have two flags.
 */

/** The field, and the heart of the sunburst. The flag's own red. */
const RED = '#9a2b26';
/** The sunburst and the shield's rim: DAWN-2, the sunrise gold. */
const GOLD = '#e8a86a';
/** DAWN-3, where the light strikes the rim and the top of the disc. */
const GOLD_HI = '#ffd08a';
/** DAWN-1, the shaded underside of the same brass. */
const GOLD_LO = '#c07a5a';
/** True black: the outline the casting sits in, and its shadow. */
const INK = '#0a0d0a';

/** Logical pixels. The canvas is drawn at this size and scaled by whole steps. */
export const CREST_W = 32;
export const CREST_H = 36;
/** Whole-pixel magnification, so nothing lands on a half pixel. */
export const CREST_SCALE = 2;

/** The centre line of the shield, and the centre of the device on it. */
const CX = 16;
const SUN_Y = 15;

/**
 * Half the shield's width at a given row, in logical pixels.
 *
 * Square shoulders down to the waist and then a taper that falls away faster
 * than a circle would — a heater shield rather than a spoon. Rows outside the
 * shield answer zero, so every pass over the picture can ask this one question
 * instead of carrying its own idea of the outline.
 */
function halfWidth(y) {
  if (y < 1 || y > 34) return 0;
  if (y === 1) return 13;
  if (y === 2) return 14;
  if (y <= 19) return 15;
  // the last three rows are named rather than computed, so the point comes to
  // a point: a curve that lands on four pixels reads as a blunt stump
  if (y >= 32) return [3, 2, 1][y - 32];
  const t = (y - 19) / 15;
  return Math.max(3, Math.round(15 * (1 - t ** 2.2)));
}

/** A step darker, for the shaded half of a painted surface. */
function darken(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255]
    .map((v) => Math.max(0, Math.round(v - amount)));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

/** One rectangle of whole pixels. Every mark in this file is made with it. */
function px(ctx, x, y, w, h, colour) {
  if (w <= 0 || h <= 0) return;
  ctx.fillStyle = colour;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/**
 * A filled disc, plotted row by row.
 *
 * `arc()` would be anti-aliased and then magnified, and the grey fringe on a
 * magnified arc is the clearest tell that a picture is not pixel art.
 */
function disc(ctx, cx, cy, r, colour) {
  for (let y = Math.ceil(cy - r); y <= Math.floor(cy + r); y++) {
    const dy = y - cy;
    const half = Math.floor(Math.sqrt(Math.max(0, r * r - dy * dy)));
    px(ctx, cx - half, y, half * 2 + 1, 1, colour);
  }
}

/**
 * An annulus — the sun's rim, which is what the device actually is.
 *
 * The flag in the office carries a gold block with a red square cut out of the
 * middle of it. Read at the size a crest is read at, that is a ring, and a ring
 * is what this draws: the gold between the two radii and nothing inside.
 */
function ring(ctx, cx, cy, outer, inner, colour) {
  for (let y = Math.ceil(cy - outer); y <= Math.floor(cy + outer); y++) {
    const dy = y - cy;
    const o = Math.floor(Math.sqrt(Math.max(0, outer * outer - dy * dy)));
    const i = Math.abs(dy) <= inner ? Math.floor(Math.sqrt(Math.max(0, inner * inner - dy * dy))) : -1;
    if (i < 0) { px(ctx, cx - o, y, o * 2 + 1, 1, colour); continue; }
    px(ctx, cx - o, y, o - i, 1, colour);
    px(ctx, cx + i + 1, y, o - i, 1, colour);
  }
}

/**
 * A ray of the sunburst: whole pixels stepped along a bearing, two wide at the
 * root and one at the tip, so it reads as light thrown off a disc rather than
 * as a wire soldered to it.
 */
function ray(ctx, angle, from, to, colour) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const across = Math.abs(dx) > Math.abs(dy);
  for (let r = from; r <= to; r += 0.34) {
    const x = Math.round(CX + dx * r);
    const y = Math.round(SUN_Y + dy * r);
    const fat = r < from + (to - from) * 0.45;
    px(ctx, x, y, fat && across ? 1 : 1, 1, colour);
    if (fat) px(ctx, x + (across ? 0 : 1), y + (across ? 1 : 0), 1, 1, colour);
  }
}

/**
 * Draw the crest onto a canvas element, sizing it as it goes.
 *
 * Called once when the console boots. It reads nothing from the world and
 * nothing from the theme, so it never has to be drawn twice.
 */
export function drawCrest(canvas) {
  if (!canvas) return false;
  canvas.width = CREST_W * CREST_SCALE;
  canvas.height = CREST_H * CREST_SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(CREST_SCALE, CREST_SCALE);

  const LAST = 34;
  // The casting's shadow on the desk: the shield again, one pixel down and to
  // the right, so the crest sits ON the lip rather than being printed on it.
  // It stops where the shield narrows to the point: carried all the way down,
  // the offset row hangs below the tip as a drip of ink with nothing over it.
  for (let y = 1; y <= LAST; y++) {
    const hw = halfWidth(y);
    if (hw >= 3) px(ctx, CX - hw + 1, y + 1, hw * 2, 1, INK);
  }

  /*
   * The field, with the outline that follows it, and the light on it.
   *
   * Each row is drawn once: the black rim at full width, then the enamel inset
   * one pixel on each side. The enamel darkens down the shield rather than
   * being one flat red — a painted casting under a desk lamp is lit at the
   * shoulders and shaded at the point, and flat red is what makes a crest read
   * as a sticker somebody pasted onto the metal.
   */
  for (let y = 1; y <= LAST; y++) {
    const hw = halfWidth(y);
    if (!hw) continue;
    px(ctx, CX - hw, y, hw * 2, 1, INK);
    if (hw > 1) px(ctx, CX - hw + 1, y, hw * 2 - 2, 1, darken(RED, Math.round((y / LAST) * 26) - 6));
  }

  /*
   * The brass rim, inside the outline.
   *
   * A cast rim is not one colour: the light on this console comes from above
   * and to the left, so the rim is lit along the top and the left flank and in
   * shadow along the right flank and the point. Drawing it as a single gold
   * line is what made the first cut read as a sticker.
   */
  for (let y = 2; y <= LAST; y++) {
    const hw = halfWidth(y);
    if (hw < 2) continue;
    const lit = y <= 7;
    px(ctx, CX - hw + 1, y, 1, 1, lit ? GOLD_HI : GOLD);
    px(ctx, CX + hw - 2, y, 1, 1, lit ? GOLD : GOLD_LO);
    // where the taper steps inward the rim needs the step filled, or the
    // outline breaks into a dashed line down both sides of the point
    const step = hw - halfWidth(y + 1);
    if (step > 1 && halfWidth(y + 1) > 0) {
      px(ctx, CX - hw + 1, y, step, 1, GOLD);
      px(ctx, CX + hw - 1 - step, y, step, 1, GOLD_LO);
    }
  }
  px(ctx, CX - halfWidth(2) + 1, 2, halfWidth(2) * 2 - 2, 1, GOLD_HI);

  /*
   * The device: the sunburst with the red heart, the same one that flies on
   * the pole in the political section's office. Eight rays — the four on the
   * cross long, the four between them short — and then the ring over their
   * inner ends, so the rays read as thrown off it rather than poked into it.
   */
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4;
    ray(ctx, angle, 7, i % 2 === 0 ? 11 : 10, i >= 4 || i === 3 ? GOLD_HI : GOLD);
  }
  ring(ctx, CX, SUN_Y, 6, 3, GOLD);
  // the lit shoulder of the ring, and the shadow under its far side
  for (let y = SUN_Y - 6; y <= SUN_Y - 3; y++) {
    const dy = y - SUN_Y;
    const o = Math.floor(Math.sqrt(Math.max(0, 36 - dy * dy)));
    px(ctx, CX - o, y, o, 1, GOLD_HI);
  }
  for (let y = SUN_Y + 3; y <= SUN_Y + 6; y++) {
    const dy = y - SUN_Y;
    const o = Math.floor(Math.sqrt(Math.max(0, 36 - dy * dy)));
    px(ctx, CX, y, o + 1, 1, GOLD_LO);
  }

  ctx.restore();
  return true;
}
