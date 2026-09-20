/**
 * The lettering layer, for both displays.
 *
 * A radar display is mostly text on top of a grid, and there used to be two
 * quite different policies for putting it there. The cabin's plan view reserved
 * every symbol's extent before any lettering, looked for a free corner across
 * three rings of eight, knocked the text out of whatever was behind it, and —
 * the important part — printed anyway when every corner was taken, because a
 * missing track number is worse than a tight one. The plan position indicator
 * tried four corners against other LABELS only, and dropped the label if all
 * four were taken: measured at the commander's seat on The Two Cities, that
 * silently deleted 22 of the board's 39 names in one frame, among them the
 * palace, the only living radar, a formation the player personally directs and
 * five contacts — with no mark, no dimming and no count. Recomputed from
 * scratch every frame against marks that move, it also meant a name that fitted
 * this frame did not fit the next, so track numbers blinked several times a
 * second.
 *
 * So there is one engine, it is the cabin's, and both displays inherit it.
 *
 * What a display owes this class: `ctx`, `dpr`, `w` and `palette`.
 */

const FONT = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

export class Lettering {
  /**
   * Keep a rectangle clear of lettering.
   *
   * A symbol owns its pixels as much as a numeral does. Labels used to be
   * placed the instant their own mark was drawn, so the next contact's dot,
   * bracket, selection ring and bloom were all painted on TOP of a label that
   * had already found a clear corner. Every mark reserves its own extent first
   * and the lettering goes on afterwards, over a picture that is finished.
   */
  reserve(x, y, w, h) {
    (this.reserved ??= []).push({ x, y, w, h });
  }

  /**
   * Start a frame's label layer, holding everything already reserved.
   *
   * That is the axis numerals, the bearing scale, the corner blocks and every
   * symbol on the glass: a label may not be printed through any of them.
   *
   * It also rolls the placement memory forward one frame. A label that found a
   * corner last frame tries that corner first this frame, so a picture that is
   * barely moving does not reshuffle its own lettering; the memory is exactly
   * one frame deep, so a contact that leaves the tube takes its entry with it.
   */
  beginLabels() {
    this.labelBoxes = (this.reserved ?? []).slice();
    this.labelMemory = this.labelMemoryNext ?? new Map();
    this.labelMemoryNext = new Map();
  }

  /**
   * Draw a string — or a block of them — near (x, y), knocked out of the grid,
   * in a corner that is free. Tries the eight compass offsets in the preferred
   * order and takes the first that collides with nothing already placed; if all
   * of them are taken it uses the least bad and accepts the overlap, because a
   * missing track number is worse than a tight one.
   */
  place(text, x, y, colour, {
    size = 8.5, radius = 6, prefer = 'NE', weight = '', optional = false,
    colours = null, key = null,
  } = {}) {
    const { ctx } = this;
    const d = this.dpr;
    const lines = Array.isArray(text) ? text : [text];
    ctx.font = `${weight ? `${weight} ` : ''}${size * d}px ${FONT}`;
    const w = Math.max(...lines.map((line) => ctx.measureText(line).width));
    const h = size * d;
    // The pitch between lines of one block. A single line is exactly what it
    // always was, so nothing on the cabin's plot moves.
    const lead = h * 1.32;
    const blockH = h + lead * (lines.length - 1);
    const r = radius * d;
    const order = ['NE', 'E', 'SE', 'N', 'S', 'NW', 'W', 'SW'];
    const from = order.indexOf(prefer);
    const tries = order.slice(from < 0 ? 0 : from).concat(order.slice(0, from < 0 ? 0 : from));
    /*
     * Three rings of eight, and a gap that counts as a collision.
     *
     * With one ring the eighth try was often still taken and the label was
     * dropped where it fell: measured on the range-height plot, two contacts'
     * altitudes came to rest with the last glyph of one touching the first of
     * the other — boxes that do not overlap by the arithmetic and are
     * unreadable on the glass. The box is padded by three pixels on every side
     * before it is tested, so "touching" is a clash; and when all eight corners
     * at the mark's own radius are taken the label steps out to a second ring
     * and draws a leader back, which is what a crowded plot needs anyway.
     */
    const padX = 3 * d;
    const padY = 2 * d;
    /*
     * How badly a candidate clashes, in square pixels, rather than whether it
     * clashes at all.
     *
     * With a boolean test the last resort was "take the first corner tried and
     * accept whatever it lands on", which on a busy plot meant a track number
     * printed squarely through the horizon tag while a corner four pixels
     * further round was clear. Scored, the fallback is the least bad corner of
     * the thirty-two, which in practice is a corner that clips one grid line
     * rather than one that buries another label.
     */
    const cost = (box) => this.labelBoxes.reduce((sum, b) => {
      const ox = Math.min(box.x + box.w + padX, b.x + b.w) - Math.max(box.x - padX, b.x);
      const oy = Math.min(box.y + box.h + padY, b.y + b.h) - Math.max(box.y - padY, b.y);
      return ox > 0 && oy > 0 ? sum + ox * oy : sum;
    }, 0);
    const rings = [r, r + 13 * d, r + 26 * d, r + 40 * d];
    const boxAt = (ring, dir) => {
      const ox = dir.includes('E') ? ring : dir.includes('W') ? -ring - w : -w / 2;
      const oy = dir.includes('N') ? -ring : dir.includes('S') ? ring + h * 0.8 : h * 0.35;
      return { x: x + ox, y: y + oy - h, w, h: blockH * 1.15 };
    };

    let best = null;
    let bestCost = Infinity;
    let placed = false;
    let chosen = null;

    // Last frame's corner first, so lettering on a slow picture stays put.
    const was = key === null ? null : this.labelMemory?.get(key);
    if (was) {
      const box = boxAt(rings[was.ring] ?? rings[0], was.dir);
      if (cost(box) === 0) { best = box; placed = true; chosen = was; }
    }

    for (let ri = 0; ri < rings.length && !placed; ri++) {
      for (const dir of tries) {
        const box = boxAt(rings[ri], dir);
        const c = cost(box);
        if (c === 0) { best = box; placed = true; chosen = { ring: ri, dir }; break; }
        if (c < bestCost) { bestCost = c; best = box; chosen = { ring: ri, dir }; }
      }
    }
    // A place name is not worth a clash. Geography gives way to anything
    // flying: if every corner near a town is taken, the town goes unnamed
    // this frame rather than printing through a track number.
    if (!placed && optional) return null;
    // And inside the glass. A label that ran off the right-hand edge lost its
    // altitude figure to the frame; clamped, it keeps its leader line back to
    // the mark, which is what the leader is for.
    best.x = Math.max(2 * d, Math.min(best.x, this.w - w - 2 * d));
    this.labelBoxes.push(best);
    if (key !== null && chosen && placed) this.labelMemoryNext?.set(key, chosen);
    ctx.save();
    // A label that had to move to find room says which mark it belongs to.
    const home = { x: x + (r + 1), y: y - r };
    if (Math.hypot(best.x - home.x, best.y - home.y) > 10 * d) {
      ctx.strokeStyle = withAlpha(colour, 0.45);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(best.x + (best.x < x ? best.w : 0), best.y + best.h * 0.6);
      ctx.stroke();
    }
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3 * d;
    lines.forEach((line, i) => {
      const baseline = best.y + h + lead * i;
      ctx.strokeStyle = this.palette.bg;
      ctx.globalAlpha = 0.85;
      ctx.strokeText(line, best.x, baseline);
      ctx.globalAlpha = 1;
      ctx.fillStyle = colours?.[i] ?? colour;
      ctx.fillText(line, best.x, baseline);
    });
    ctx.restore();
    return best;
  }

  /**
   * A string that owns its position — an axis numeral, a title — knocked out
   * of the grid and reserved, so no placed label may be printed across it.
   */
  stamp(text, x, y, colour, { size = 9, align = 'left', weight = '', alpha = 1 } = {}) {
    const { ctx } = this;
    const d = this.dpr;
    ctx.save();
    ctx.font = `${weight ? `${weight} ` : ''}${size * d}px ${FONT}`;
    ctx.textAlign = align;
    const tw = ctx.measureText(text).width;
    const th = size * d;
    this.reserve(align === 'right' ? x - tw : align === 'center' ? x - tw / 2 : x,
      y - th, tw, th * 1.2);
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3 * d;
    ctx.strokeStyle = this.palette.bg;
    ctx.globalAlpha = 0.85 * alpha;
    ctx.strokeText(text, x, y);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = colour;
    ctx.fillText(text, x, y);
    ctx.restore();
  }
}

/** Add an alpha channel to a hex or rgb colour string from the theme. */
export function withAlpha(colour, alpha) {
  const c = colour.trim();
  if (c.startsWith('#')) {
    const hex = c.length === 4
      ? c.slice(1).split('').map((ch) => ch + ch).join('')
      : c.slice(1);
    const n = parseInt(hex, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }
  if (c.startsWith('rgb(')) return c.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`);
  return c;
}
