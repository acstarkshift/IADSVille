/**
 * The contact's menu: every battery that could take it, and why the rest cannot.
 *
 * The player: "The process of dragging targets to SAMs is convoluted. In
 * addition to that assignment mechanic, there should be a right click context
 * menu that is available for each target which shows a list of SAMs to which
 * the target can be assigned (including stats about range-to-target, missiles
 * available, etc.)."
 *
 * So a right click on a contact — on the scope, in the cabin, or on its row in
 * the shootlist — opens a list of the batteries, one row each: the range from
 * the battery to the contact, how long until the contact is inside its ring,
 * rounds on the rails and in store, the crew's own estimate of the shot, and
 * whether the battery answers to you. A row that can take the contact assigns
 * it with one click; a row that cannot says why, in the same words the
 * refusal on the net uses, and stays where it is. The drag still works.
 *
 * `menuRowsFor` is the list as data, so a test can ask for it without a
 * pointer. `ContextMenu` puts it on the screen, keeps it inside the window,
 * answers the arrow keys, Enter and Escape, and closes on any click outside.
 */

import { SAM_TYPES, DEFENCE_CLASSES } from '../engine/config.js';
import { dist } from '../engine/math.js';
import { timeToInRangeS } from '../engine/weapons.js';
import { cannotEngageReason } from '../engine/threat.js';
import { channelsFor } from '../engine/doctrine.js';
import { engagementStatus } from './console.js';
import { nomenclatureFor } from './lexicon.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * One row per battery, the ones that can take the contact first.
 *
 * `already` marks the battery this contact is on; picking that row releases
 * it, which is the same act the ASSIGN cap performs on a held contact.
 */
export function menuRowsFor(world, track) {
  if (!world || !track) return [];
  const rows = world.sites.map((site) => {
    const type = SAM_TYPES[site.type];
    const already = site.engagements.some((e) => e.trackId === track.id);
    const mine = world.commandable(site.id);
    const reason = already ? null : cannotEngageReason(world, site, track);
    const toRange = timeToInRangeS(site, track);
    const status = engagementStatus(world, site, track);
    return {
      siteId: site.id,
      name: site.name,
      /** What the battery is, in the words the battery card uses: the class, not the plate. */
      nomenclature: (DEFENCE_CLASSES[type.class]?.en ?? nomenclatureFor(site.name)?.en ?? type.label).toUpperCase(),
      already,
      mine,
      can: !reason && !already,
      reason: reason ?? null,
      rangeKm: Math.round(dist(site.pos, track.pos)),
      reachKm: type.maxRangeKm,
      /** Seconds until the contact is inside the ring: 0 now, null unknown, Infinity never. */
      toRangeS: Number.isNaN(toRange) ? null : toRange,
      rails: site.readyRounds,
      store: site.magazine,
      channelsFree: Math.max(0, channelsFor(site) - site.engagements.length),
      pk: status?.pkEstimate ?? null,
    };
  });
  const order = (r) => (r.already ? 0 : r.can ? 1 : 2);
  const soon = (r) => (r.toRangeS === null ? 1e6 : r.toRangeS === Infinity ? 1e9 : r.toRangeS);
  return rows.sort((a, b) => order(a) - order(b) || soon(a) - soon(b) || (b.pk ?? 0) - (a.pk ?? 0));
}

/** The words on a row, so the menu and a test read the same thing. */
export function rowText(row) {
  const when = row.already ? 'ON IT'
    : row.toRangeS === 0 ? 'IN RANGE'
      : row.toRangeS === null ? 'NO COURSE YET'
        : row.toRangeS === Infinity ? 'NEVER ON THIS COURSE'
          : `IN RANGE IN ${Math.round(row.toRangeS)} s`;
  const pk = row.pk === null ? '—' : `${Math.round(row.pk * 100)}%`;
  return {
    when,
    range: `${row.rangeKm} km`,
    rounds: `${row.rails} on the rails · ${row.store} in store`,
    pk,
    command: row.mine ? 'under your command' : 'not yours to order',
    note: row.already ? 'Pick to release it.' : row.can ? 'Pick to hand it over.' : `Cannot take it: ${row.reason}.`,
  };
}

export class ContextMenu {
  /**
   * `host` is the menu's element (see index.html); `onPick(siteId, trackId,
   * already)` is called when a live row is chosen.
   */
  constructor(host, { onPick, bounds = null }) {
    this.host = host;
    this.onPick = onPick;
    /** Where the menu is kept: a function returning the tube's rectangle. */
    this.bounds = bounds;
    this.trackId = null;
    this.onKey = (e) => this.key(e);
    this.onOutside = (e) => { if (!this.host.contains(e.target)) this.close(); };
    this.host.addEventListener('click', (e) => {
      const row = e.target.closest?.('[data-site]');
      if (!row || row.disabled) return;
      e.preventDefault();
      const already = row.dataset.already === 'true';
      const site = row.dataset.site;
      const track = this.trackId;
      this.close();
      this.onPick(site, track, already);
    });
  }

  get open() { return !this.host.hidden; }

  /** Open the menu for a contact at a point on the page, kept inside the window. */
  show(world, track, x, y) {
    const rows = menuRowsFor(world, track);
    this.trackId = track.id;
    const kind = track.classification && track.classification !== 'unknown'
      ? String(track.classification).toUpperCase() : String(track.hostility).toUpperCase();
    this.host.innerHTML = `
      <div class="ctx-head"><b>${esc(track.tn)}</b> · ${esc(kind)} · ${Math.round(track.altM).toLocaleString('en-US')} m
        <span class="ctx-hint">Pick a battery. Esc closes.</span></div>
      ${rows.map((r) => {
    const t = rowText(r);
    const live = r.can || r.already;
    return `<button type="button" role="menuitem" class="ctx-row ${live ? 'is-live' : 'is-dead'} ${r.already ? 'is-on' : ''}"
        data-site="${esc(r.siteId)}" data-already="${r.already}" ${live ? '' : 'disabled'}
        title="${esc(t.note)}">
        <span class="ctx-name"><b>${esc(r.name)}</b><i>${esc(r.nomenclature)}</i></span>
        <span class="ctx-when">${esc(t.when)}</span>
        <span class="ctx-range">${esc(t.range)}<i>reach ${r.reachKm} km</i></span>
        <span class="ctx-rounds">${esc(t.rounds)}</span>
        <span class="ctx-pk"><i>est. kill</i>${esc(t.pk)}</span>
        <span class="ctx-cmd ${r.mine ? '' : 'is-not'}">${esc(t.command)}</span>
        ${live ? '' : `<span class="ctx-why">${esc(r.reason)}</span>`}
      </button>`;
  }).join('')}
      ${rows.length ? '' : '<p class="ctx-empty">No batteries on this net.</p>'}`;
    this.host.hidden = false;
    /*
     * Inside the tube. The menu is about what is on the glass, and a panel
     * that hangs off the edge of the glass over the battery cards reads as
     * a bug — the player said so. It is kept inside the scope's own
     * rectangle when it fits there, and inside the window when the glass is
     * too small for it (a phone). Measure, then move.
     */
    const pad = 8;
    const w = this.host.offsetWidth;
    const h = this.host.offsetHeight;
    const glass = this.bounds?.() ?? null;
    const box = glass && glass.width >= w + pad * 2 && glass.height >= h + pad * 2
      ? { x: glass.left, y: glass.top, w: glass.width, h: glass.height }
      : { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
    const left = Math.max(box.x + pad, Math.min(x, box.x + box.w - w - pad));
    const top = Math.max(box.y + pad, Math.min(y, box.y + box.h - h - pad));
    this.host.style.left = `${left}px`;
    this.host.style.top = `${top}px`;
    window.addEventListener('keydown', this.onKey, true);
    // Deferred so the click that opened the menu does not close it.
    setTimeout(() => {
      if (!this.open) return;
      window.addEventListener('pointerdown', this.onOutside, true);
    }, 0);
    const first = this.host.querySelector('.ctx-row.is-live') ?? this.host.querySelector('.ctx-row');
    first?.focus();
  }

  close() {
    if (!this.open) return;
    this.host.hidden = true;
    this.host.innerHTML = '';
    this.trackId = null;
    window.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('pointerdown', this.onOutside, true);
  }

  key(e) {
    if (!this.open) return;
    const rows = [...this.host.querySelectorAll('.ctx-row:not([disabled])')];
    const at = rows.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); e.stopPropagation();
      if (!rows.length) return;
      const next = e.key === 'ArrowDown' ? (at + 1) % rows.length : (at <= 0 ? rows.length - 1 : at - 1);
      rows[next].focus();
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      if (at >= 0) { e.preventDefault(); e.stopPropagation(); rows[at].click(); }
      return;
    }
    // Any other key belongs to the console; the menu gets out of its way.
    if (e.key.length === 1 || e.key === 'Tab') this.close();
  }
}
