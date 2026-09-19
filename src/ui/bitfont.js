/**
 * The game's own type, drawn as pixels.
 *
 * There used to be two fonts in this game and neither one was a pixel font.
 *
 * The drawn one was a 3x5 table of octal digits, and several of its letters
 * were not the letters they claimed to be: `N: '65555'` plots as a top-left
 * corner with two uprights, so the order of appointment read TO DAПILOV and
 * RAПK, and `K: '55655'` plots as an H with a notch. Three pixels is below the
 * floor for a Latin alphabet — N, K, M, W and S all need a diagonal and there
 * is nowhere to put one — and the table had no lower case, no comma and no
 * apostrophe, so it could not set a sentence at all. Everything that WAS a
 * sentence therefore fell back to the browser's anti-aliased monospace, laid
 * over five-times-magnified pixel art, in every cutscene and on every panel:
 * two art languages in one frame, with grey and coloured fringes on every
 * stroke, on a display the game insists has one phosphor and no grey in it.
 *
 * This is one face at two sizes. The body is six cells wide by ten tall — a
 * cap height of seven, an x-height of five, a baseline on row seven and two
 * rows of descender under it — and the display size is the same face at twice
 * the scale with an optional bold pass, which is what the order of appointment
 * is stencilled in. It covers Latin upper and lower case, the digits, the
 * punctuation a sentence actually needs, and the Cyrillic capitals, because
 * the operator's own name is set in them and their own promotion is printed
 * with it.
 *
 * Every glyph is authored here as rows of `#` and `.`, one line each, because
 * the fault in the table this replaces was that nobody could read it.
 */

/** Cell metrics, in pixels at k = 1. */
export const FONT = {
  /** Advance from one glyph's left edge to the next, including the sidebearing. */
  advance: 6,
  /** Ink width available to a glyph. */
  width: 5,
  /** Rows in the cell, top to bottom. */
  height: 10,
  /** The row a capital's foot sits on. */
  baseline: 7,
  /** Rows from the top of a capital to the baseline. */
  capHeight: 7,
  /** Rows from the top of an x to the baseline. */
  xHeight: 5,
};

/*
 * Each entry is `'<first row>|<row>/<row>/…'`. The first row is where the
 * glyph's top line sits in the ten-row cell, so a capital starts at 1, an x at
 * 3, a comma at 7, and a descender simply runs on past the baseline.
 */
const GLYPHS = {
  ' ': '0|',
  '!': '1|..#../..#../..#../..#../..#../...../..#..',
  '"': '1|.#.#./.#.#.',
  '#': '2|.#.#./#####/.#.#./#####/.#.#.',
  '%': '1|##..#/##..#/...#./..#../.#.../#..##/#..##',
  '&': '1|.##../#..#./.##../##.#./#..##/#..#./.##.#',
  "'": '1|..#../..#..',
  '(': '1|...#./..#../.#.../.#.../.#.../..#../...#.',
  ')': '1|.#.../..#../...#./...#./...#./..#../.#...',
  '*': '2|#.#.#/.###./#####/.###./#.#.#',
  '+': '3|..#../..#../#####/..#../..#..',
  ',': '7|..#../..#../.#...',
  '-': '5|#####',
  '.': '7|..#..',
  '/': '1|....#/....#/...#./..#../.#.../#..../#....',
  '0': '1|.###./#...#/#..##/#.#.#/##..#/#...#/.###.',
  '1': '1|..#../.##../..#../..#../..#../..#../.###.',
  '2': '1|.###./#...#/....#/...#./..#../.#.../#####',
  '3': '1|#####/...#./..##./....#/....#/#...#/.###.',
  '4': '1|...#./..##./.#.#./#..#./#####/...#./...#.',
  '5': '1|#####/#..../####./....#/....#/#...#/.###.',
  '6': '1|..##./.#.../#..../####./#...#/#...#/.###.',
  '7': '1|#####/....#/...#./..#../.#.../.#.../.#...',
  '8': '1|.###./#...#/#...#/.###./#...#/#...#/.###.',
  '9': '1|.###./#...#/#...#/.####/....#/...#./.##..',
  ':': '3|..#../...../...../...../..#..',
  ';': '3|..#../...../...../...../..#../..#../.#...',
  '<': '2|...#./..#../.#.../..#../...#.',
  '=': '4|#####/...../#####',
  '>': '2|.#.../..#../...#./..#../.#...',
  '?': '1|.###./#...#/....#/..##./..#../...../..#..',
  '@': '1|.###./#...#/#.###/#.#.#/#.###/#..../.###.',
  A: '1|.###./#...#/#...#/#####/#...#/#...#/#...#',
  B: '1|####./#...#/####./#...#/#...#/#...#/####.',
  C: '1|.###./#...#/#..../#..../#..../#...#/.###.',
  D: '1|####./#...#/#...#/#...#/#...#/#...#/####.',
  E: '1|#####/#..../#..../####./#..../#..../#####',
  F: '1|#####/#..../#..../####./#..../#..../#....',
  G: '1|.###./#...#/#..../#.###/#...#/#...#/.###.',
  H: '1|#...#/#...#/#...#/#####/#...#/#...#/#...#',
  I: '1|.###./..#../..#../..#../..#../..#../.###.',
  J: '1|..###/...#./...#./...#./...#./#..#./.##..',
  K: '1|#...#/#..#./#.#../##.../#.#../#..#./#...#',
  L: '1|#..../#..../#..../#..../#..../#..../#####',
  M: '1|#...#/##.##/#.#.#/#.#.#/#...#/#...#/#...#',
  N: '1|#...#/##..#/#.#.#/#.#.#/#..##/#...#/#...#',
  O: '1|.###./#...#/#...#/#...#/#...#/#...#/.###.',
  P: '1|####./#...#/#...#/####./#..../#..../#....',
  Q: '1|.###./#...#/#...#/#...#/#.#.#/#..#./.##.#',
  R: '1|####./#...#/#...#/####./#.#../#..#./#...#',
  S: '1|.####/#..../#..../.###./....#/....#/####.',
  T: '1|#####/..#../..#../..#../..#../..#../..#..',
  U: '1|#...#/#...#/#...#/#...#/#...#/#...#/.###.',
  V: '1|#...#/#...#/#...#/#...#/#...#/.#.#./..#..',
  W: '1|#...#/#...#/#...#/#.#.#/#.#.#/##.##/#...#',
  X: '1|#...#/#...#/.#.#./..#../.#.#./#...#/#...#',
  Y: '1|#...#/#...#/.#.#./..#../..#../..#../..#..',
  Z: '1|#####/....#/...#./..#../.#.../#..../#####',
  '[': '1|.###./.#.../.#.../.#.../.#.../.#.../.###.',
  ']': '1|.###./...#./...#./...#./...#./...#./.###.',
  _: '9|#####',
  a: '3|.###./....#/.####/#...#/.####',
  b: '1|#..../#..../####./#...#/#...#/#...#/####.',
  c: '3|.###./#..../#..../#..../.###.',
  d: '1|....#/....#/.####/#...#/#...#/#...#/.####',
  e: '3|.###./#...#/#####/#..../.###.',
  f: '1|..##./.#..#/.#.../###../.#.../.#.../.#...',
  g: '3|.####/#...#/#...#/.####/....#/#...#/.###.',
  h: '1|#..../#..../####./#...#/#...#/#...#/#...#',
  i: '1|..#../...../.##../..#../..#../..#../.###.',
  j: '1|...#./...../..##./...#./...#./...#./...#./#..#./.##..',
  k: '1|#..../#..../#..#./#.#../##.../#.#../#..#.',
  l: '1|.##../..#../..#../..#../..#../..#../.###.',
  m: '3|##.#./#.#.#/#.#.#/#.#.#/#.#.#',
  n: '3|####./#...#/#...#/#...#/#...#',
  o: '3|.###./#...#/#...#/#...#/.###.',
  p: '3|####./#...#/#...#/####./#..../#..../#....',
  q: '3|.####/#...#/#...#/.####/....#/....#/....#',
  r: '3|#.##./##..#/#..../#..../#....',
  s: '3|.####/#..../.###./....#/####.',
  t: '1|.#.../.#.../###../.#.../.#.../.#..#/..##.',
  u: '3|#...#/#...#/#...#/#...#/.####',
  v: '3|#...#/#...#/#...#/.#.#./..#..',
  w: '3|#...#/#.#.#/#.#.#/#.#.#/.#.#.',
  x: '3|#...#/.#.#./..#../.#.#./#...#',
  y: '3|#...#/#...#/#...#/.####/....#/#...#/.###.',
  z: '3|#####/...#./..#../.#.../#####',

  /* The punctuation the plates and the file references actually use. */
  '·': '5|..#..',
  '—': '5|#####',
  '°': '1|.##../#..#./.##..',
  '×': '3|#...#/.#.#./..#../.#.#./#...#',

  /*
   * Cyrillic capitals. Eleven of them are the Latin letter — А В Е К М Н О Р С
   * Т Х — and are aliased below rather than drawn twice, so a change to the A
   * changes the А with it and the two alphabets can never drift apart on one
   * plate.
   */
  Б: '1|####./#..../#..../####./#...#/#...#/####.',
  Г: '1|#####/#..../#..../#..../#..../#..../#....',
  Д: '1|..##./.#.#./.#.#./.#.#./.#.#./#####/#...#',
  Ж: '1|#.#.#/#.#.#/#.#.#/#####/#.#.#/#.#.#/#.#.#',
  З: '1|.###./#...#/....#/..##./....#/#...#/.###.',
  И: '1|#...#/#...#/#..##/#.#.#/##..#/#...#/#...#',
  Й: '0|.###./...../#...#/#..##/#.#.#/##..#/#...#/#...#',
  Л: '1|..###/.#..#/.#..#/.#..#/.#..#/.#..#/#...#',
  П: '1|#####/#...#/#...#/#...#/#...#/#...#/#...#',
  У: '1|#...#/#...#/#...#/.####/....#/#...#/.###.',
  Ф: '1|..#../.###./#.#.#/#.#.#/#.#.#/.###./..#..',
  Ц: '1|#..#./#..#./#..#./#..#./#..#./#####/....#',
  Ч: '1|#...#/#...#/#...#/.####/....#/....#/....#',
  Ш: '1|#.#.#/#.#.#/#.#.#/#.#.#/#.#.#/#.#.#/#####',
  Щ: '1|#.#.#/#.#.#/#.#.#/#.#.#/#.#.#/#####/....#',
  Ъ: '1|##.../.#.../.###./.#..#/.#..#/.#..#/.###.',
  Ы: '1|#...#/#...#/###.#/#..##/#..##/#..##/###.#',
  Ь: '1|#..../#..../####./#...#/#...#/#...#/####.',
  Э: '1|.###./#...#/....#/..###/....#/#...#/.###.',
  Ю: '1|#..##/#.#.#/#.#.#/###.#/#.#.#/#.#.#/#..##',
  Я: '1|.####/#...#/#...#/.####/..#.#/.#..#/#...#',
  Ё: '0|.#.#./...../#####/#..../####./#..../#..../#####',
};

/** The eleven capitals the two alphabets share. */
for (const [cyr, lat] of [['А', 'A'], ['В', 'B'], ['Е', 'E'], ['К', 'K'], ['М', 'M'],
  ['Н', 'H'], ['О', 'O'], ['Р', 'P'], ['С', 'C'], ['Т', 'T'], ['Х', 'X']]) {
  GLYPHS[cyr] = GLYPHS[lat];
}

/** A few characters the copy uses that stand in for one already drawn. */
for (const [from, to] of [['’', "'"], ['‘', "'"], ['“', '"'], ['”', '"'],
  ['–', '—'], [' ', ' ']]) {
  GLYPHS[from] = GLYPHS[to];
}

/** Parsed on first use: `{ top, rows: [bitmask per row] }`. */
const CACHE = new Map();
function glyphOf(ch) {
  let g = CACHE.get(ch);
  if (g !== undefined) return g;
  const spec = GLYPHS[ch];
  if (spec === undefined) { CACHE.set(ch, null); return null; }
  const [topStr, rowStr] = spec.split('|');
  const rows = rowStr ? rowStr.split('/').map((r) => {
    let bits = 0;
    for (let i = 0; i < FONT.width; i += 1) if (r[i] === '#') bits |= (1 << (FONT.width - 1 - i));
    return bits;
  }) : [];
  g = { top: Number(topStr), rows };
  CACHE.set(ch, g);
  return g;
}

/** Is there a glyph for this character? Used by the type test, and by nothing else. */
export const hasGlyph = (ch) => glyphOf(ch) !== null;

/** Every character the face can set, for the specimen sheet and the test. */
export const COVERAGE = () => Object.keys(GLYPHS);

/**
 * Set a string at `x, y`, where y is the TOP of the ten-row cell.
 *
 * `k` is the magnification and is always a whole number: this is a bitmap
 * face and half a pixel of it is a grey fringe. `bold` lays the glyph down a
 * second time one pixel to the right, which is how the order of appointment's
 * stencil weight is made — the same shapes, inked twice, rather than a second
 * alphabet to keep in step with the first.
 *
 * Returns the width it drew, so a caller can right-align or underline it.
 */
export function text(ctx, put, s, x, y, colour, { k = 1, bold = false, tracking = 0 } = {}) {
  let cx = Math.round(x);
  for (const ch of String(s)) {
    const g = glyphOf(ch);
    if (g) {
      for (let r = 0; r < g.rows.length; r += 1) {
        const bits = g.rows[r];
        if (!bits) continue;
        const ry = y + (g.top + r) * k;
        for (let b = 0; b < FONT.width; b += 1) {
          if (!(bits & (1 << (FONT.width - 1 - b)))) continue;
          put(ctx, cx + b * k, ry, k, k, colour);
          if (bold) put(ctx, cx + b * k + k, ry, k, k, colour);
        }
      }
    } else if (ch !== ' ') {
      /*
       * A character with no glyph is drawn as the empty box every typesetter
       * draws it as, rather than as a gap. A missing letter that looks like a
       * space is how RAПK survived three passes.
       */
      const h = FONT.capHeight;
      for (let b = 0; b < FONT.width; b += 1) {
        put(ctx, cx + b * k, y + k, k, k, colour);
        put(ctx, cx + b * k, y + (h) * k, k, k, colour);
      }
      for (let r = 1; r <= h; r += 1) {
        put(ctx, cx, y + r * k, k, k, colour);
        put(ctx, cx + (FONT.width - 1) * k, y + r * k, k, k, colour);
      }
    }
    cx += (FONT.advance + tracking + (bold ? 1 : 0)) * k;
  }
  return cx - Math.round(x);
}

/** How wide that string will be, without drawing it. */
export const textWidth = (s, { k = 1, bold = false, tracking = 0 } = {}) => {
  const n = [...String(s)].length;
  if (!n) return 0;
  const advance = FONT.advance + tracking + (bold ? 1 : 0);
  const ink = FONT.width + (bold ? 1 : 0);
  return ((n - 1) * advance + ink) * k;
};

/**
 * Break a string into lines that fit a width, on spaces where it can and
 * anywhere when it must. Canvas has no word wrap, and drawn paper has to carry
 * its own words now, so this is where the paragraphs on the printout and the
 * letter are broken.
 */
export function wrap(s, maxPx, opts = {}) {
  const words = String(s).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (textWidth(candidate, opts) <= maxPx || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}
