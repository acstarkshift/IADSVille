/**
 * Rank insignia, drawn rather than named.
 *
 * Sixteen ranks, one shoulder board, and a rule a player can read off the
 * card without a table: bars across the board are enlisted service, a stripe
 * down it is a commission, stars are seniority within the commission, and a
 * braided field with large stars is a general officer.
 *
 *   0–5   recruit to master sergeant — that many transverse bars
 *   6     warrant officer — one longitudinal stripe, no stars
 *   7–10  junior lieutenant to captain — one stripe, one to four small stars
 *   11–13 major to colonel — two stripes, one to three small stars
 *   14–15 general officer — a braided board and one or two large stars
 *
 * The board is an object — olive cloth, brass and enamel — so it keeps its
 * own colours on every theme, the way the identity card does: a printed
 * insignia does not turn green because the tube did. Inline SVG, one clip
 * id per rendering so several boards on one page never share a clip.
 */

import { RANKS } from '../engine/character.js';

const CLOTH = '#4b5537';
const CLOTH_LO = '#3a4229';
const PIPING = '#b83a32';
const BRASS = '#d9b95a';
const BRASS_HI = '#f3dc8e';
const BRAID = '#c9a94e';
const EDGE = '#1f2418';

let clipSerial = 0;

/**
 * The board as inline SVG. `size` is the height in CSS pixels; the width
 * follows the board's 22:32 proportion. `title` adds an accessible name.
 */
export function rankInsignia(rankIndex = 0, { size = 25, title = '' } = {}) {
  const i = Math.max(0, Math.min(RANKS.length - 1, Math.round(rankIndex)));
  const parts = [];
  const star = (cx, cy, r, fill = BRASS_HI) => {
    const pts = [];
    for (let k = 0; k < 10; k++) {
      const rad = k % 2 ? r * 0.44 : r;
      const a = (Math.PI / 5) * k - Math.PI / 2;
      pts.push(`${(cx + rad * Math.cos(a)).toFixed(2)},${(cy + rad * Math.sin(a)).toFixed(2)}`);
    }
    return `<polygon points="${pts.join(' ')}" fill="${fill}" stroke="${EDGE}" stroke-width=".35"/>`;
  };

  const general = i >= 14;
  const officer = i >= 7 && i < 14;
  const warrant = i === 6;

  if (i <= 5) {
    // Enlisted: brass bars across the board, from the bottom up.
    for (let k = 0; k < i; k++) {
      const y = 25.5 - k * 4.4;
      parts.push(`<rect x="4" y="${y}" width="14" height="2.4" rx=".4" fill="${BRASS}" stroke="${EDGE}" stroke-width=".35"/>`);
      parts.push(`<rect x="4.6" y="${y + 0.5}" width="12.8" height=".7" fill="${BRASS_HI}" opacity=".7"/>`);
    }
  } else if (warrant || officer) {
    const stripes = i >= 11 ? 2 : 1;
    for (let k = 0; k < stripes; k++) {
      const x = stripes === 1 ? 9.9 : 7.2 + k * 5.4;
      parts.push(`<rect x="${x}" y="3" width="2.2" height="26" fill="${PIPING}" stroke="${EDGE}" stroke-width=".3"/>`);
    }
    const small = i >= 7 && i <= 10 ? i - 6 : i >= 11 ? i - 10 : 0;
    for (let k = 0; k < small; k++) parts.push(star(11, 25 - k * 6.2, 2.9));
  }
  if (general) {
    for (let k = 0; k < i - 13; k++) parts.push(star(11, 21 - k * 9.5, 4.8));
  }

  /*
   * The cloth is woven, not painted: a recruit's board carries nothing at all,
   * and a bare rectangle reads as a missing graphic rather than as the
   * beginning of a career. A general's board is braided instead — a zigzag
   * of brass thread under the stars.
   */
  const id = `rk${clipSerial++}`;
  const weave = general
    ? Array.from({ length: 7 }, (_, k) => `<path d="M2 ${3 + k * 4} l4.5 2.2 l4.5 -2.2 l4.5 2.2 l4.5 -2.2" fill="none" stroke="${BRAID}" stroke-width="1.1" opacity=".85"/>`).join('')
    : Array.from({ length: 12 }, (_, k) => `<line x1="2" y1="${3 + k * 2.5}" x2="20" y2="${1 + k * 2.5}" stroke="${CLOTH_LO}" stroke-width=".6" opacity=".9"/>`).join('');
  const w = Math.round(size * 22 / 32);
  return `<svg viewBox="0 0 22 32" width="${w}" height="${size}" class="rank-board"${title ? ` role="img" aria-label="${escapeAttr(title)}"` : ' aria-hidden="true"'}>
    <rect x="1" y="1" width="20" height="30" rx="3" fill="${CLOTH}" stroke="${EDGE}"/>
    <clipPath id="${id}"><rect x="1.6" y="1.6" width="18.8" height="28.8" rx="2.6"/></clipPath>
    <g clip-path="url(#${id})">${weave}</g>
    ${officer || general ? `<rect x="2.2" y="2.2" width="17.6" height="27.6" rx="2.2" fill="none" stroke="${PIPING}" stroke-width=".9" opacity="${general ? '.0' : '.9'}"/>` : ''}
    ${general ? `<rect x="2.2" y="2.2" width="17.6" height="27.6" rx="2.2" fill="none" stroke="${BRASS}" stroke-width="1"/>` : ''}
    ${parts.join('')}
  </svg>`;
}

/** The insignia beside the rank's name, for the paperwork. */
export function rankBadge(rankIndex, { size = 22 } = {}) {
  const rank = RANKS[Math.max(0, Math.min(RANKS.length - 1, rankIndex))];
  return `<span class="rank-badge">${rankInsignia(rankIndex, { size, title: rank.en })}<b>${escapeAttr(rank.en)}</b></span>`;
}

function escapeAttr(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
