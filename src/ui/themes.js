/**
 * Console themes.
 *
 * Colour lives in CSS (styles/theme.css) and is read back out of the custom
 * properties so there is exactly one source of truth for the palette. What lives
 * here is *behaviour*: whether the display holds a phosphor image between
 * frames, whether it wears scanlines, and which symbol set it draws.
 *
 * Each mission names a theme, so working a raid on the amber set genuinely feels
 * like a different console from the green one, and the modern ops display feels
 * like a different decade.
 */

export const THEMES = {
  'crt-green': {
    id: 'crt-green',
    label: 'PHOSPHOR GREEN',
    blurb: 'Cathode-ray plan position indicator. Paint decays; so does your picture.',
    /** Fraction of the previous frame's paint retained. Higher = longer trails. */
    /*
     * Raised from 0.955: at 60Hz that retained 6% of an echo after one second
     * against 6-12s scan revisits — the "phosphor" was gone before the sweep
     * came back, and the tube was carrying nothing between paints. 0.982
     * holds a third of the echo at one second and a ghost of it at three, so
     * the previous sweep is still readable when the next one arrives.
     */
    afterglow: 0.982,
    scanlines: true,
    glowPx: 9,
    sweepTailDeg: 62,
    symbology: 'blip',
    vignette: 0.55,
    curvature: true,
  },
  'crt-amber': {
    id: 'crt-amber',
    label: 'PHOSPHOR AMBER',
    blurb: 'Warmer tube, slower decay, and a bloom you will be staring at all night.',
    afterglow: 0.985,
    scanlines: true,
    glowPx: 12,
    sweepTailDeg: 78,
    symbology: 'blip',
    vignette: 0.6,
    curvature: true,
  },
  'ops-modern': {
    id: 'ops-modern',
    label: 'TACTICAL DISPLAY',
    blurb: 'Flat panel, standard symbology, no persistence. Everything is exactly as current as it is.',
    afterglow: 0,
    scanlines: false,
    glowPx: 0,
    sweepTailDeg: 30,
    symbology: 'standard',
    vignette: 0.2,
    curvature: false,
  },
};

export const THEME_IDS = Object.keys(THEMES);

/** Put a theme on the document. CSS does the rest of the chrome. */
export function applyTheme(themeId) {
  const theme = THEMES[themeId] ?? THEMES['crt-green'];
  document.body.dataset.theme = theme.id;
  return theme;
}

/**
 * Read the live palette back out of CSS so the canvas and the chrome can never
 * drift apart. Called once per theme change, not per frame.
 */
export function readPalette() {
  // Themes are stamped on <body>, so the palette has to be read from there —
  // reading from documentElement would always return the :root defaults and the
  // canvas would quietly stay green while the chrome changed around it.
  const style = getComputedStyle(document.body);
  const get = (name, fallback) => (style.getPropertyValue(name) || fallback).trim();
  return {
    bg: get('--bg', '#030a07'),
    panel: get('--bg-panel', '#061410'),
    grid: get('--grid', '#0d3326'),
    edge: get('--edge', '#14503a'),
    ink: get('--ink', '#6cffb8'),
    inkBright: get('--ink-bright', '#c7ffe4'),
    inkDim: get('--ink-dim', '#2f8f68'),
    accent: get('--accent', '#40ff9e'),
    hostile: get('--hostile', '#ff5b52'),
    friendly: get('--friendly', '#59c8ff'),
    unknown: get('--unknown', '#ffd447'),
    warn: get('--warn', '#ffa53d'),
    good: get('--good', '#6cff8f'),
  };
}

/** Colour for a track by what the operator currently believes about it. */
export function hostilityColour(palette, track) {
  if (track.hostility === 'friendly') return palette.friendly;
  if (track.hostility === 'hostile') return palette.hostile;
  return palette.unknown;
}
