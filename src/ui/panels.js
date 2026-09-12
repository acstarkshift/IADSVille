/**
 * The HUD panels around the scope.
 *
 * These rebuild from world state rather than being mutated in place, which
 * keeps them honest — there is no way for the panel to disagree with the
 * simulation. They are refreshed at a few hertz rather than every frame,
 * because a track table that updates sixty times a second is unreadable and
 * expensive, while the canvas underneath stays at full rate.
 */

import { SIM, SAM_TYPES, AIR_TYPES, ASSET_TYPES, DEFENCE_CLASSES } from '../engine/config.js';
import { bearing, dist, len, clockString, clamp01 } from '../engine/math.js';
import { sortedTracks, cannotEngageReason, huntsTheFlight } from '../engine/threat.js';
import { trackProfile } from '../engine/detection.js';
import { engagementStatus, channelStatus } from './console.js';
import {
  armTimeToImpact, canStartLoading, channelsFor, railLoadS, railsOf, spanLimit, spanLoad,
} from '../engine/doctrine.js';
import {
  STATE, CONTROLS, POSTURE_CYCLE, STATUS, EQUIPMENT, PLATES, legend, keycap, pair,
  nomenclatureFor,
} from './lexicon.js';
import { rankOf } from '../engine/character.js';
import { consoleCaps } from '../engine/scenarios.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* -------------------------------------------------------------- painting */

/**
 * What identifies a control across a rebuild.
 *
 * Not the node — the node is thrown away eight times a second — but what the
 * control IS: the battery it belongs to and the verb it performs. Two rebuilds
 * of the same card produce the same key, which is what makes it possible to
 * hand the focus ring back to the control the operator had it on.
 */
function controlKey(el) {
  const d = el.dataset ?? {};
  return `${el.id ?? ''}|${d.act ?? ''}|${d.site ?? ''}|${d.radar ?? ''}|${d.formation ?? ''}|${d.track ?? ''}`;
}

/**
 * Write a panel, and keep what the operator had.
 *
 * These panels are regenerated from world state rather than mutated in place,
 * which keeps them honest — there is no way for the panel to disagree with the
 * simulation — but a bare `innerHTML =` throws away three things that belong
 * to the person rather than to the world: the focus ring, the scroll position,
 * and (with a rebuild between the press and the release) the press itself.
 *
 * So: nothing is written when the markup has not actually changed — which
 * makes a paused console genuinely still, and cuts the rebuild rate on a quiet
 * watch to almost nothing — and when it has, the focus ring is handed back to
 * the same control by identity and the column is scrolled back to where it
 * was. The press is handled in app.js, which freezes these panels for as long
 * as a pointer is down inside them.
 */
function paint(host, html) {
  if (host.__painted === html && host.childElementCount) return;
  host.__painted = html;
  const active = document.activeElement;
  const focusKey = active && active !== document.body && host.contains(active)
    ? controlKey(active) : null;
  const top = host.scrollTop;
  host.innerHTML = html;
  if (focusKey) {
    for (const el of host.querySelectorAll('button, [tabindex]')) {
      if (controlKey(el) === focusKey) { el.focus({ preventScroll: true }); break; }
    }
  }
  if (top) host.scrollTop = top;
}

/**
 * Forget what is on the panels, so the next paint is unconditional.
 *
 * Called when a watch starts: two different watches could in principle
 * generate the same markup for the same host, and a console that came up
 * showing the previous mission's rack would be an unforgettable bug to find.
 */
export function clearPanelCache(els) {
  for (const host of [els.trackList, els.batteryList, els.crewConsole,
    els.formationList, els.masterLamps, els.boardState, els.actionBar]) {
    if (host) host.__painted = null;
  }
}

/* ---------------------------------------------------------------- hardware
 * Small builders for the physical controls. Keeping them here means a lamp is
 * a lamp everywhere on the console, and a switch always says what state it is
 * in by the position of its lever rather than by its colour alone.
 */

/** A domed indicator with its engraved caption. */
/** Seconds until this site's nearest round in flight arrives, or null. */
function roundEtaFor(world, site) {
  let soonest = null;
  for (const missile of world.missiles) {
    if (!missile.alive || missile.siteId !== site.id || missile.kind !== 'sam') continue;
    const target = world.aircraftById.get(missile.targetId);
    if (!target?.alive || !missile.speed) continue;
    const eta = dist(missile.pos, target.pos) / missile.speed;
    if (soonest === null || eta < soonest) soonest = eta;
  }
  return soonest;
}

/**
 * A domed indicator with its caption beside it, in English.
 *
 * The caption used to be the Cyrillic over the English — two lines to say one
 * thing, on an annunciator whose whole job is to be read from the corner of
 * an eye. It is one English word, spelled out, at every width: an annunciator
 * that abbreviates itself to RAD / ARM / FLT when the window narrows is a code
 * nobody was taught, and this row is the console's primary status.
 */
function lamp(entry, lit, { colour = '', blinking = false, caption = null,
  figure = '', title = '' } = {}) {
  const classes = ['lamp', lit ? 'is-lit' : '', colour ? `is-${colour}` : '', blinking ? 'blinking' : '']
    .filter(Boolean).join(' ');
  const text = caption ?? entry.en;
  /*
   * `figure` is a lamp's own readout — the seconds on an ARM warning — kept
   * OUT of the caption. Appended to it, 'INBOUND ARM ACQ 14s' overran a
   * half-width annunciator cell and the browser ellipsised the legend itself,
   * so the one lamp that means run printed as 'INBOUND ARM ACQ 1…'. The
   * engraved legend never moves and never truncates; the figure sits in its
   * own column beside it.
   */
  // A caller's own title is the whole tooltip; the table's hint is the
  // fallback for a lamp nobody has written a sentence for.
  return `<span class="${classes}" title="${esc(title
    || `${entry.en}${entry.hint ? ` — ${entry.hint}` : ''}`)}">
    <span class="lamp-dome"></span>
    <span class="lamp-cap"><b>${esc(text)}</b></span>${
  figure ? `<b class="lamp-fig">${esc(figure)}</b>` : ''}</span>`;
}

/**
 * A bat-handle switch with BOTH of its positions engraved beside it, for good.
 *
 * Up is `up`, down is `down`, and the lever's position is the state — which is
 * the entire reason real panels use a lever instead of a button. The captions
 * never move and never change: the player asked for exactly this ("the Up
 * position should be radiate, the Down position should be silence, permanently
 * labelled as such"), and what was here instead was a button whose caption was
 * the state it was in, so the console rearranged itself under the finger every
 * time the switch was thrown.
 *
 * One line per position, in English. It was two — the Cyrillic over the gloss,
 * twice — which is four lines of 8px type with 8.4px leading inside a 34px
 * switch, repeated four times down the rack: measured, a smear. One line per
 * position at 11px is a switch you can read at arm's length, which is the only
 * thing this control has ever needed to be.
 *
 * The live position is a lit window, not a colour: it sits in a dark well with
 * its ink glowing. Colour alone did not survive the fill of the selected
 * card — the same aria-pressed RADIATE read lit on one card and inert on the
 * one below it, which is the exact failure a lever exists to prevent.
 */
function switch2(up, down, on, {
  act, site, radar, disabled = false, key = '', extra = '', note = '',
} = {}) {
  const attrs = [
    act ? `data-act="${act}"` : '',
    site ? `data-site="${site}"` : '',
    radar ? `data-radar="${radar}"` : '',
    disabled ? 'disabled' : '',
  ].filter(Boolean).join(' ');
  const pos = (entry, live) => `<span class="sw-pos ${live ? 'is-on' : ''}">${esc(entry.en)}</span>`;
  // The tooltip says where the lever is and what one click will do, in the
  // order a person reads a switch: the state, then the other position.
  const title = `${on ? up.en : down.en} — ${(on ? up : down).hint ?? ''}`
    + ` Click to switch to ${on ? down.en : up.en}.${note ? ` ${note}` : ''}`;
  return `<button class="sw ${extra}" aria-pressed="${on}" ${attrs}
      title="${esc(title)}">
    <span class="sw-body"><span class="sw-lever"></span></span>
    <span class="sw-legends">${pos(up, on)}${pos(down, !on)}</span>
    ${keycap(key)}
  </button>`;
}

/**
 * The emissions lamp: one engraved word, RADIATING, lit amber while the set
 * is warming up and green once it is on the air.
 *
 * It used to change its word to WARMING for the warm-up, which is a readout
 * pretending to be a lamp: the caption got thirteen pixels narrower and the
 * lamp beside it slid along the row every time the switch was thrown. A lamp
 * has one caption for the life of the panel; the warm-up is a colour, and the
 * tooltip says which.
 */
function emissionsLamp(radar) {
  const warming = radar?.state === 'warming';
  const lit = radar?.state === 'radiating' || warming;
  return lamp(STATUS.radiating, lit, {
    colour: warming ? 'amber' : 'green',
    title: !radar?.alive ? 'Radar destroyed'
      : warming ? 'Warming up — amber until the set is on the air'
        : lit ? 'On the air — this radar is switched on and can be found'
          : 'Off the air — this radar is switched off and sees nothing',
  });
}

/** The ARM lamp with its countdown in the figure column, not in the caption. */
function armLamp(armEtaS) {
  const inbound = Number.isFinite(armEtaS);
  return lamp(STATUS.armWarning, inbound, {
    colour: 'red', blinking: true,
    figure: inbound ? `${Math.ceil(armEtaS)}s` : '',
    title: inbound
      ? `An enemy anti-radar missile is homing on this set — ${Math.ceil(armEtaS)}s to impact`
      : 'Lights when an enemy anti-radar missile is homing on this set',
  });
}

/**
 * The launcher, as a row of round tube lamps.
 *
 * One lamp per rail: green while that tube holds a round, red when it is
 * spent, and amber on the one the loaders are working — because the rack now
 * fills a rail at a time and the lamp going green one by one IS the reload.
 * This replaced a row of flat bars, which read as a generic progress meter
 * rather than as the thing it is. The count is the battery's own ready
 * capacity, so a section with four rails looks like four rails.
 */
function tubes(site) {
  const capacity = railsOf(site);
  const rails = Math.min(capacity, 14);
  // The rail being hoisted onto is the next empty one, and only while the
  // loaders are actually on it — a rack sitting half full between waves is
  // not loading, and a lamp that says it is would be a lie about the one
  // thing this row exists to report.
  const loading = site.reloadRemainingS > 0 && site.readyRounds < capacity ? site.readyRounds : -1;
  const lamps = Array.from({ length: rails }, (_, i) => {
    if (i < site.readyRounds) return '<i class="is-loaded"></i>';
    return `<i class="${i === loading ? 'is-loading' : 'is-spent'}"></i>`;
  }).join('');
  return `<span class="tubes" title="${site.readyRounds} of ${capacity} rails loaded`
    + ` · ${site.magazine} in store to reload with">${lamps}</span>`;
}

/**
 * The count beside the rail lamps: how many rounds are on site to reload
 * with. The player asked for exactly this — "in addition to the display
 * showing the missiles which are hot in the launchers, there should be a
 * count of the missiles available on-site to reload" — and the card had it
 * only as the second half of "8/16 ROUNDS", which reads as eight of sixteen.
 * It is the store the watch issued, it falls one for each rail the loaders
 * fill, and at zero it turns the warning colour, because at zero the loaders
 * do not go out again.
 */
function storeCount(site) {
  const empty = site.magazine <= 0;
  return `<span class="unit-type store ${empty ? 'is-empty' : ''}"
      title="${esc(STATUS.magazine.hint)}${empty ? ' — none left, so the rails cannot be reloaded' : ''}">
    ${esc(STATUS.magazine.en)} <b>${site.magazine}</b></span>`;
}

/**
 * How long until the NEXT round is on the rail, and how many are still coming.
 *
 * The old bar counted down the whole ninety-five-second reload, because the
 * whole ninety-five seconds was what you had to wait for. The loaders now
 * hand rounds up one at a time, so the number the operator needs is the small
 * one — seconds to the next rail — with the count still to come beside it. A
 * displacing battery keeps the old full-duration bar, because displacing
 * really is all-or-nothing. Returns '' when there is nothing to wait for, so
 * it costs no space.
 */
function reloadBar(site, type) {
  const busy = site.scootRemainingS > 0
    ? { entry: STATUS.displacing, remainingS: site.scootRemainingS,
      totalS: type.scootS * (site.scootMult ?? 1) * 1.5, count: 0 }
    : site.reloadRemainingS > 0
      ? { entry: STATUS.loading, remainingS: site.reloadRemainingS,
        totalS: railLoadS(site),
        count: Math.min(railsOf(site) - site.readyRounds, site.magazine) }
      : null;
  if (!busy) return '';
  const frac = clamp01(1 - busy.remainingS / Math.max(busy.totalS, 1e-6));
  return `<div class="unit-row reload-row">
    <span class="unit-type">${esc(busy.entry.en)}${busy.count ? ` ${busy.count}` : ''}</span>
    <span class="gauge is-warn"><i style="width:${Math.round(frac * 100)}%"></i></span>
    <span class="unit-type reload-left">${Math.ceil(busy.remainingS)}s</span>
  </div>`;
}

/** A legend-cap pushbutton, with its one key stencilled in the corner. */
function press(entry, { act, site, track = '', state = '', disabled = false, extra = '', key = '', title = '' } = {}) {
  return `<button class="pb ${extra}" data-act="${act}" ${site ? `data-site="${site}"` : ''}
      ${track ? `data-track="${esc(track)}"` : ''}
      ${state ? `data-state="${state}"` : ''}
      ${disabled ? 'disabled' : ''} title="${esc(title || entry.en)}${key ? ` (${key})` : ''}"
      >${legend(entry, { key })}</button>`;
}

/* ------------------------------------------------------------- stamping */

const TABLES = { STATE, CONTROLS, STATUS, EQUIPMENT, PLATES };

/**
 * Fill the fixed legends on index.html out of the lexicon, once, at boot.
 *
 * The page used to carry these as literals — ВРЕМЯ · TIME, АТТЕСТАЦИЯ ·
 * STANDING, СЕТЬ КОМАНДОВАНЬЯ in a CSS `content` string — beside a table
 * that held the same words and was never consulted, so half of them had no
 * English at all (the works plate in the corner of the topbar read ВПВО ТМ ·
 * СЕКТОР 4-Б · ТИП 4М-2 · ЗАВ. № 118-44 and nothing else, on a console whose
 * one typographic rule is that the gloss is always beside the stencil).
 *
 * An element with `data-legend="GROUP.key"` gets that entry: the control's own
 * English face if it is a `.lg`, the paired plate line otherwise. `data-key`
 * stamps the keyboard shortcut in the corner chip.
 */
export function stampLegends(root = document) {
  for (const el of root.querySelectorAll('[data-legend]')) {
    const [group, key] = el.dataset.legend.split('.');
    const entry = TABLES[group]?.[key];
    if (!entry) continue;
    if (el.classList.contains('lg')) {
      // Controls speak English, in one line — see `legend()`. The one thing
      // that gets a second line is a cap whose face is a figure: the speed
      // rack is marked 1× 2× 4× with the word underneath.
      const face = entry.cap ?? entry.en;
      const sub = entry.sub ?? '';
      el.innerHTML = `<b>${esc(face)}</b>${sub ? `<i>${esc(sub)}</i>` : ''}${keycap(el.dataset.key)}`;
    } else if (el.dataset.glossOnly !== undefined) {
      /*
       * The status readouts along the top are not engraved legends, they are
       * readouts, and they were being set bilingually — ВРЕМЯ · TIME, РАСХОД ·
       * EXPENDED, АТТЕСТАЦИЯ · STANDING — which is the littering the player
       * objected to and two hundred pixels of a row that has to hold the
       * clock, the raid, the identity card and the speed rack at 1280. The
       * Cyrillic stays where it is stencilled on hardware: the works plate,
       * the lamp captions, the switch and cap legends.
       */
      el.textContent = entry.en;
    } else el.textContent = `${entry.tm} · ${entry.en}`;
  }
  /*
   * The works plate in the corner of the topbar.
   *
   * It carried the type and works numbers as well, which are riveted to the
   * scope bezel four inches away — two hundred pixels of duplicated furniture
   * in the one row that has to hold the clock, the raid, the identity card and
   * the speed rack at 1280 as well as at 1920. What is left is the thing the
   * plate is for: whose service this is, and which sector.
   */
  const plate = root.getElementById?.('unit-plate') ?? root.querySelector('#unit-plate');
  if (plate) {
    const stencil = [STATE.serviceShort, STATE.sector];
    plate.innerHTML = `<b>${stencil.map((e) => esc(e.tm)).join(' · ')}</b>`
      + `<br>${stencil.map((e) => esc(e.en)).join(' · ')}`;
  }
}

/* --------------------------------------------------------------- topbar */

export function renderTopbar(world, ui, els) {
  els.clock.textContent = clockString(world.t);
  els.missionName.textContent = world.scenario.name;

  const airborne = world.aircraft.filter((a) => a.alive && a.type !== 'civil').length;
  els.airCount.textContent = String(airborne);
  els.rounds.textContent = `${world.stats.roundsFired}/${world.roundAllowance}`;
  els.rounds.parentElement.classList.toggle('is-over', world.stats.roundsFired > world.roundAllowance);

  const standing = Math.round(world.command.standing);
  els.standing.textContent = String(standing);
  els.standingFill.style.width = `${standing}%`;
  const wrap = els.standing.closest('.standing');
  wrap.classList.toggle('is-low', standing < 34);
  wrap.classList.toggle('is-mid', standing >= 34 && standing < 55);

  // The one legend on the picture panel that had no English at all was
  // ЕДИНАЯ КАРТА, sitting in the header of the panel the whole seat reads.
  const fusion = world.fusionOnline ? STATUS.fusion : STATUS.localControl;
  els.fusionState.textContent = fusion.en;
  els.fusionState.title = fusion.en;
  els.fusionState.classList.toggle('is-bad', !world.fusionOnline);

  // Master annunciator: the three things that would have someone shouting.
  // The ARM lamp carries its countdown — the most time-critical number in the
  // game used to live only in an 8.5px caption inside a scrollable column.
  let soonestArm = Infinity;
  for (const r of world.radars) {
    if (!r.alive) continue;
    const eta = armTimeToImpact(world, r);
    if (eta < soonestArm) soonestArm = eta;
  }
  const armInbound = Number.isFinite(soonestArm);
  const anyRadiating = world.radars.some((r) => r.state === 'radiating');
  const faulted = world.radars.some((r) => !r.alive) || world.sites.some((s) => !s.alive);
  /*
   * The master annunciator, with a short caption for a narrow bar.
   *
   * At 1280 the three lamps used to wrap onto a second row underneath the
   * works plate while the whole right-hand cluster stayed on row one, leaving
   * an L-shaped bar with a dead gutter in it. The fix was to swap all three
   * captions for three-letter stubs below 1400 — RAD / ARM / FLT — which is
   * the console's primary status row reduced to a code the player is never
   * taught, with FLT for FAULT reading as "flight" on a screen full of
   * aircraft. The words are spelled at every width now; the room comes out of
   * the speed rack, which lost the dim second line it did not need.
   */
  paint(els.masterLamps, [
    lamp(STATUS.radiating, anyRadiating, { colour: 'green',
      title: anyRadiating ? 'At least one of your radars is switched on'
        : 'Every radar is switched off — nothing can be seen or guided' }),
    // The seconds are the lamp's own figure, not part of its caption: as a
    // caption the word grew by the width of the figure and shoved FAULT
    // along the bar whenever a round was inbound.
    armLamp(soonestArm),
    lamp(STATUS.fault, faulted, { colour: 'amber',
      title: faulted ? 'A radar or battery of yours has been destroyed'
        : 'Lights when a radar or battery of yours is destroyed' }),
  ].join(''));

  /*
   * Who is sitting here: the issued identity card, in its slot.
   *
   * It began as two clipped plates, became one flat rectangle with a coloured
   * left edge, and in both shapes it printed a Cyrillic word ahead of every
   * English one — "стрелец · recruit", "командир дивизиона BATTALION
   * COMMANDER" — which is the littering the player asked to have scaled back,
   * in the one strip he reads every second of every watch.
   *
   * What it is now is a card: rank insignia printed on the left, the name in
   * the size a name is printed in, rank and appointment under it in one
   * English line, sitting at an oblique angle in a slot in the console (see
   * .id-slot in hud.css). The Cyrillic that belongs to a person — the
   * operator's own name — stays, because it is his name.
   */
  if (els.operatorPlate && world.character
    && els.operatorPlate.dataset.name !== world.character.name) {
    els.operatorPlate.dataset.name = world.character.name;
    els.operatorPlate.innerHTML = `<span class="id-name">${esc(world.character.name)}</span>`;
  }
  if (els.rankInsignia && world.character
    && els.rankInsignia.dataset.rank !== String(world.character.rankIndex)) {
    els.rankInsignia.dataset.rank = String(world.character.rankIndex);
    const rank = rankOf(world.character);
    els.rankInsignia.innerHTML = rankInsignia(world.character.rankIndex);
    els.rankInsignia.title = rank.en;
  }
  const post = world.character
    ? `${rankOf(world.character).en} · ${world.echelon.appointment.en}`
    : world.echelon.appointment.en;
  if (els.echelonPlate && els.echelonPlate.dataset.post !== post) {
    els.echelonPlate.dataset.post = post;
    els.echelonPlate.textContent = post;
    els.echelonPlate.title = `${world.echelon.tm} · ${world.echelon.en}`;
  }
}

/**
 * The rank insignia printed on the identity card, drawn rather than named.
 *
 * Sixteen ranks, one shoulder board, and a rule the player can read off the
 * card without a table: bars across the board are enlisted service, a stripe
 * down it is a commission, and stars are seniority within the commission.
 *
 *   0–5  recruit to master sergeant — that many transverse bars
 *   6     warrant officer — one longitudinal stripe, no stars
 *   7–10  junior lieutenant to captain — one stripe, one to four small stars
 *   11–13 major to colonel — two stripes, one to three small stars
 *   14–15 general officer — a bare board and one or two large stars
 *
 * Inline SVG in the console's own engraving colours, so it themes with
 * everything else and costs nothing to load.
 */
export function rankInsignia(rankIndex = 0) {
  const i = Math.max(0, Math.min(15, Math.round(rankIndex)));
  const parts = [];
  const star = (cx, cy, r) => {
    const pts = [];
    for (let k = 0; k < 10; k++) {
      const rad = k % 2 ? r * 0.44 : r;
      const a = (Math.PI / 5) * k - Math.PI / 2;
      pts.push(`${(cx + rad * Math.cos(a)).toFixed(2)},${(cy + rad * Math.sin(a)).toFixed(2)}`);
    }
    return `<polygon points="${pts.join(' ')}" fill="var(--engrave)"/>`;
  };
  if (i <= 5) {
    for (let k = 0; k < i; k++) {
      parts.push(`<rect x="3.5" y="${7 + k * 4.4}" width="15" height="2.2" fill="var(--engrave)"/>`);
    }
  } else {
    const stripes = i === 6 ? 1 : i <= 10 ? 1 : i <= 13 ? 2 : 0;
    for (let k = 0; k < stripes; k++) {
      parts.push(`<rect x="${stripes === 1 ? 9.9 : 7.4 + k * 5}" y="4" width="2.2" height="24"
        fill="var(--engrave)" opacity=".85"/>`);
    }
    const small = i >= 7 && i <= 10 ? i - 6 : i >= 11 && i <= 13 ? i - 10 : 0;
    for (let k = 0; k < small; k++) parts.push(star(11, 24.5 - k * 6.2, 2.7));
    if (i >= 14) for (let k = 0; k < i - 13; k++) parts.push(star(11, 20 - k * 9, 4.6));
  }
  /*
   * The board itself is woven, not painted: a recruit's board carries no bars
   * at all, and a bare rectangle at 16×23 reads as a missing graphic rather
   * than as the beginning of a career. The lay of the braid is drawn under
   * whatever the rank puts on top of it, so the object exists at rank zero.
   */
  const braid = Array.from({ length: 11 },
    (_, k) => `<line x1="2" y1="${3.5 + k * 2.6}" x2="20" y2="${1.2 + k * 2.6}"
      stroke="var(--engrave-dim)" stroke-width=".55" opacity=".28"/>`).join('');
  return `<svg viewBox="0 0 22 32" width="17" height="25" aria-hidden="true">
    <rect x="1" y="1" width="20" height="30" rx="3" fill="var(--plate)" stroke="var(--metal-edge)"/>
    <clipPath id="rk-board"><rect x="1.6" y="1.6" width="18.8" height="28.8" rx="2.6"/></clipPath>
    <g clip-path="url(#rk-board)">${braid}</g>
    <rect x="2.5" y="2.5" width="17" height="27" rx="2" fill="none"
      stroke="var(--engrave-dim)" stroke-width=".7" opacity=".55"/>
    ${parts.join('')}
  </svg>`;
}

/* --------------------------------------------------------- flight strip */

/**
 * The protected flight, on the one watch there is one.
 *
 * A strip of the kind an approach controller keeps on the aircraft they are
 * responsible for: what it is, where it is, how far it still has to go, and how
 * near the nearest thing hunting it has got. Without this the operator can see
 * a friendly symbol among thirty others and no reason to care about it, which
 * is a poor way to run the only watch in the game that is about one aeroplane.
 */
export function renderFlightStrip(world, els) {
  const strip = els.flightStrip;
  if (!strip) return;
  if (!world.scenario.epilogue) { strip.hidden = true; return; }

  const vip = world.vipAircraft();
  if (!vip) {
    const down = world.stats.vipDown;
    strip.hidden = false;
    strip.className = `flight-strip ${down ? 'is-lost' : 'is-clear'}`;
    strip.innerHTML = `<div class="flight-head"><b>STATE 01</b>
      <span>${down ? 'DESTROYED' : world.stats.vipEscaped
    ? 'CLEAR OF NATIONAL AIRSPACE' : 'NOT AIRBORNE'}</span></div>`;
    return;
  }

  // Distance still to fly before it is out of national airspace, and the
  // nearest hostile contact to it — the two numbers the whole watch turns on.
  const toGo = Math.max(0, SIM.worldRadiusKm - len(vip.pos));
  let nearest = Infinity;
  for (const track of world.tracks.values()) {
    if (track.hostility === 'friendly' || track.quality <= 0) continue;
    nearest = Math.min(nearest, dist(track.pos, vip.pos));
  }
  const threatened = nearest < 45;

  strip.hidden = false;
  strip.className = `flight-strip${threatened ? ' is-threatened' : ''}`;
  strip.innerHTML = `<div class="flight-head"><b>STATE 01</b>
      <span>${esc(STATUS.protectedFlight.en)}</span></div>
    <div class="flight-figures">
      <span><label>ALT</label>${Math.round(vip.altM / 100) * 100} M</span>
      <span><label>TO FRONTIER</label>${Math.round(toGo)} KM</span>
      <span class="${threatened ? 'is-bad' : ''}"><label>NEAREST</label>${
  Number.isFinite(nearest) ? `${Math.round(nearest)} KM` : '—'}</span>
    </div>`;
}

/* ----------------------------------------------------------- track list */

/**
 * One battery's line above its shootlist: what it is and whether it can shoot.
 * The shootlist board is only worth reading if the heading answers "can this
 * one take another one?" without a trip to the battery cards.
 */
function shootlistState(world, site) {
  if (!site.alive) return { text: 'DESTROYED', cls: 'is-down' };
  if (site.scootRemainingS > 0) {
    return { text: `DISPLACING ${Math.ceil(site.scootRemainingS)}s`, cls: 'is-busy' };
  }
  if (site.weaponsState === 'hold') return { text: 'WEAPONS HOLD', cls: 'is-busy' };
  /*
   * Rounds on the rails beat the loaders: the rack is almost always short of
   * something now that it tops itself up a rail at a time, and a battery with
   * seven rounds up is not "RELOADING", it is a battery with seven rounds up.
   * Loading is the headline only when the rails really are bare — and then
   * the number the reader wants is seconds to the NEXT one, not to a full
   * rack, because one round is all it takes to be back in the fight.
   */
  if (site.readyRounds > 0) return { text: `${site.readyRounds} READY`, cls: '' };
  if (site.reloadRemainingS > 0) {
    return { text: `LOADING ${Math.ceil(site.reloadRemainingS)}s`, cls: 'is-busy' };
  }
  return { text: 'RAILS EMPTY', cls: 'is-down' };
}

/**
 * Is this contact work anybody at this seat can actually do?
 *
 * UNPAIRED is the seat's work list, and a work list that includes work nobody
 * can do is a way of telling the operator they are failing at something that
 * does not exist. It counted every unassigned hostile with no filter at all:
 * measured, "10 WITH NOBODY ON THEM" for six minutes of a coda in which all
 * ten were outbound or out of reach; two suppression aircraft at 160 km listed
 * as urgent against a longest reach of 120; two more at 193 and 204 km, off
 * the range scale the operator was looking at.
 *
 * Answerable means some battery of yours could take it now, or could take it
 * once it has flown a little further in — which is what "out of reach for
 * eighty seconds" is, and it is why that one reason counts as work arriving.
 * Everything else — never in reach, an empty rack, a destroyed antenna — is
 * not this contact's problem and not the operator's failure.
 *
 * Exported because it is the rule rather than the rendering, and a rule about
 * what the operator is being blamed for deserves a test.
 */
export function answerableBy(world, sites, track) {
  if (track.hostility !== 'hostile') return true;
  return sites.some((site) => {
    const why = cannotEngageReason(world, site, track);
    return !why || /^out of reach for/.test(why);
  });
}

/**
 * The contacts this seat's list holds.
 *
 * On the net it is the sector's picture. In the operator's seat it is their
 * battery's own: what their radar holds, plus what the net has cued them
 * onto — seeing the whole sector from the cabin would undo the isolation the
 * seat is built around. One function rather than a filter inside the list,
 * because the NEXT TARGET cap steps through this list and has to be dead when
 * it is empty. It used to light on `world.tracks.size`, so on a two-seat
 * watch the cabin's cap was live while the cabin's own list was still empty
 * — measured on Ville Under Fire at 4×: the sector's first track at 13 s, the
 * first row on the cabin list at 74 s — and a thumb that tapped it in
 * between got nothing, which on a phone with no keyboard reads as a console
 * that does not work.
 */
export function seatPicture(world, ui) {
  const tracks = sortedTracks(world);
  if (ui.view === 'crew' && world.control.crewedBatteryId) {
    const site = world.siteById.get(world.control.crewedBatteryId);
    return tracks.filter((t) => world.radarsOf(site).some((r) => t.sources.includes(r.id))
      || t.assignedTo.includes(site.id));
  }
  return tracks;
}

export function renderTrackList(world, ui, els) {
  const tracks = seatPicture(world, ui);
  const rowFor = (track, ownerId = null) => {
    const brg = Math.round(bearing({ x: 0, y: 0 }, track.pos));
    const rng = Math.round(len(track.pos));
    // Metres, plainly. The ×100M code needed a hover tooltip to decode and a
    // conversion to compare against the battery card's altitude band — the
    // one comparison the core verb depends on.
    const alt = Math.round(track.altM / 100) * 100;
    const label = track.classification !== 'unknown'
      ? (AIR_TYPES[track.classification]?.label ?? '—')
      : trackProfile(track);

    // Under a battery's own heading the column says who ELSE is on the track;
    // repeating the name of the list you are reading tells you nothing.
    const assigned = track.assignedTo
      .filter((id) => id !== ownerId)
      .map((id) => world.siteById.get(id)?.name?.split(' ')[0] ?? '')
      .join(',');
    const engaged = track.engagedBy.length > 0;

    /*
     * Under your own battery's heading: did you take this one, or were you
     * given it? In the cabin the net above you fills your shootlist and until
     * now a cue was indistinguishable from your own lock — the player's
     * question was literally "who is assigning my shoot list". A caret means
     * the net called it to you; no caret means you chose it.
     */
    const ownEngagement = ownerId
      ? world.siteById.get(ownerId)?.engagements.find((e) => e.trackId === track.id)
      : null;
    const cued = !!ownEngagement?.cued;

    const classes = [
      'track-row',
      `is-${track.hostility === 'pending' ? 'unknown' : track.hostility}`,
      track.coasting ? 'is-coasting' : '',
      engaged ? 'is-engaged' : '',
      ui.selectedTrackId === track.id ? 'is-selected' : '',
    ].filter(Boolean).join(' ');

    // A threat pip beats a number: you read it without doing arithmetic.
    const pips = track.threat > 60 ? '●●●' : track.threat > 25 ? '●●' : track.threat > 8 ? '●' : '';

    return `<li class="${classes}" data-track="${track.id}" role="option" aria-selected="${ui.selectedTrackId === track.id}">
      <span class="tn">${esc(track.tn)}</span>
      <span>${esc(label)}</span>
      <span>${String(brg).padStart(3, '0')}</span>
      <span>${rng}</span>
      <span>${alt}</span>
      <span class="asgn">${engaged ? '◆' : ''}${cued ? '<i class="cued" title="Called to you by the net — you did not pick this one">▸</i>' : ''}${esc(assigned)} <em class="pips">${pips}</em></span>
    </li>`;
  };

  /*
   * Shootlists, not one long list. A flat picture sorted by threat answers
   * "what is out there" and hides the question the seat actually exists to
   * answer: which of these has nobody on it, and what is each battery already
   * holding. So: everything unpaired at the top — that section IS the work —
   * and beneath it one list per battery, in the fixed order the battery cards
   * use so a row keeps its place on the panel between ticks.
   *
   * A track paired to two batteries appears under both. That is not a
   * duplicate; it is the fact.
   */
  const head = (label, note, cls = '') => `<li class="shootlist-head ${cls}" role="presentation">
      <span class="sl-name">${esc(label)}</span><span class="sl-note" title="${esc(note)}">${esc(note)}</span>
    </li>`;

  /*
   * UNPAIRED is the seat's work list, and a work list that includes work
   * nobody can do is a way of telling the operator they are failing at
   * something that does not exist. It counted every unassigned hostile with
   * no filter at all: measured, "10 WITH NOBODY ON THEM" for six minutes of a
   * coda in which all ten were outbound or out of reach; two suppression
   * aircraft at 160 km listed as urgent against a longest reach of 120; two
   * more at 193 and 204 km, off the range scale the operator was looking at.
   *
   * The partition is answerable versus out of reach, and it is decided by the
   * same `cannotEngageReason` the battery cards use: a contact is answerable
   * if some battery of yours could take it now, or could take it as soon as
   * it has flown a little further in. Everything else stays visible — losing
   * it would be worse — as a plain tail with the reason attached, and neither
   * the count nor the red header sees it.
   */
  const mine = ui.view === 'crew' && world.control.crewedBatteryId
    ? world.sites.filter((s) => s.id === world.control.crewedBatteryId)
    : world.sites.filter((s) => s.alive && world.commandable(s.id));
  const answerable = (track) => answerableBy(world, mine, track);

  const unassigned = tracks.filter((t) => t.assignedTo.length === 0);
  const unpaired = unassigned.filter(answerable);
  const beyond = unassigned.filter((t) => !answerable(t));
  const sections = [];
  /*
   * The heads say it in words a first-timer reads: NOT ASSIGNED, and how
   * many are waiting for a battery. UNPAIRED / 3 WITH NOBODY ON THEM /
   * UNCOMMITTED was the board talking to itself.
   */
  if (unassigned.length || !tracks.length) {
    sections.push(head('NOT ASSIGNED', unpaired.length
      ? `${unpaired.length} WAITING FOR A BATTERY` : 'NONE WAITING',
    unpaired.some((t) => t.hostility === 'hostile') ? 'is-urgent' : ''));
    sections.push(unpaired.length
      ? unpaired.map(rowFor).join('')
      : `<li class="track-row is-empty" role="presentation"><span>—</span><span>${
        ui.view === 'crew' ? 'nothing on your radar' : 'no contacts'}</span></li>`);
  }
  if (beyond.length) {
    sections.push(head('OUT OF REACH', `${beyond.length} TOO FAR FOR ANY BATTERY OF YOURS`, 'is-idle'));
    sections.push(beyond.map((t) => rowFor(t)).join(''));
  }

  // In the cabin the board is your own battery's; the net's other shootlists
  // are not yours to read from that seat.
  const boards = ui.view === 'crew' && world.control.crewedBatteryId
    ? world.sites.filter((s) => s.id === world.control.crewedBatteryId)
    : world.sites;
  const idle = [];
  for (const site of boards) {
    const held = tracks.filter((t) => t.assignedTo.includes(site.id));
    const state = shootlistState(world, site);
    // Your own cabin's board is always drawn, empty or not: an operator wants
    // to see that the answer is nothing, not have the question disappear.
    const own = site.id === world.control.crewedBatteryId && ui.view === 'crew';
    if (!held.length && !own) {
      if (site.alive && world.commandable(site.id)) idle.push(site);
      continue;
    }
    sections.push(head(site.name, state.text, state.cls));
    sections.push(held.length
      ? held.map((t) => rowFor(t, site.id)).join('')
      : '<li class="track-row is-empty" role="presentation"><span>—</span><span>nothing assigned</span></li>');
  }
  if (idle.length && ui.view !== 'crew') {
    sections.push(head('NOT ENGAGING', idle.map((s) => s.name).join(' · '), 'is-idle'));
  }

  paint(els.trackList, sections.join(''));

  renderBoardState(world, ui, els, { tracks, unpaired, mine });
  renderTrackDetail(world, ui, els);
}

/**
 * The state of the board, on the panel the board is on.
 *
 * Four contacts leave this column ninety per cent bare — measured at 1600×950
 * on First Light, a 687 px list box holding 66 px of rows, the rest flat black
 * with no rule and no reason. That space is now the answer to the question the
 * seat asks all night and that nothing on the console answered without reading
 * four battery cards one at a time: how much of the sector is still in your
 * hand. Contacts on the board, how many nobody has taken, how many are being
 * shot at, how many rounds of yours are in the air, and how many batteries
 * still have something on the rails.
 *
 * In the cabin it is the same four figures for your own battery, because the
 * operator's seat sees its own battery and the cues sent to it, and pretending
 * otherwise would undo the isolation that seat is built around.
 */
function renderBoardState(world, ui, els, { tracks, unpaired, mine }) {
  const host = els.boardState;
  if (!host) return;

  const hostile = tracks.filter((t) => t.hostility === 'hostile').length;
  const paired = tracks.filter((t) => t.assignedTo.length > 0).length;
  const roundsUp = world.missiles.filter((m) => m.alive && m.kind === 'sam'
    && mine.some((s) => s.id === m.siteId)).length;
  const armed = mine.filter((s) => s.alive && s.readyRounds > 0 && s.scootRemainingS === 0);
  const rails = armed.reduce((n, s) => n + s.readyRounds, 0);

  const figure = (label, value, mood = '') =>
    `<span class="bs-figure ${mood}"><label>${esc(label)}</label><b>${esc(String(value))}</b></span>`;

  paint(host, `<div class="bs-head">${
    ui.view === 'crew' ? 'YOUR BATTERY' : 'THE SECTOR'}</div>
    <div class="bs-figures">
      ${figure('CONTACTS', tracks.length)}
      ${figure('HOSTILE', hostile, hostile ? 'is-bad' : '')}
      ${figure('NOT ASSIGNED', unpaired.length, unpaired.length ? 'is-warn' : '')}
      ${figure('ASSIGNED', paired, paired ? 'is-good' : '')}
      ${figure('IN FLIGHT', roundsUp)}
      ${figure('CAN FIRE', `${armed.length}/${mine.length}`,
    armed.length ? '' : 'is-bad')}
    </div>
    <div class="bs-note">${rails} round${rails === 1 ? '' : 's'} on the rails${(() => {
    const cold = mine.length - armed.length;
    return cold > 0 ? ` · ${cold} ${cold === 1 ? 'battery' : 'batteries'} cannot fire` : '';
  })()}</div>
    ${groundState(world)}
    ${pictureSources(world, ui)}`);
}

/**
 * Where the picture is coming from, on the panel the picture is on.
 *
 * Nothing paints until a set radiates, and the seat's whole first lesson is
 * that — but the only place on the console that said whether a surveillance
 * set was up was its own card, at the far end of the opposite panel, behind a
 * scrollbar. So an operator watching an empty board had to cross the console
 * to find out whether the board was empty or the antenna was cold, and when a
 * set was destroyed mid-raid the picture simply got worse with no statement of
 * why. Two lines under the ground, on the panel that goes blind.
 */
function pictureSources(world, ui) {
  // The cabin fights on its own antenna and is told so elsewhere; this is the
  // net's picture, which is assembled out of the surveillance sets.
  if (ui.view === 'crew') return '';
  const sets = world.radars.filter((r) => !r.siteId);
  if (!sets.length) return '';
  const rows = sets.map((radar) => {
    const state = !radar.alive ? STATUS.destroyed.en
      : radar.state === 'warming' ? STATUS.warming.en
        : radar.on ? 'ON' : 'OFF';
    const cls = !radar.alive ? 'is-lost' : radar.on ? '' : 'is-hurt';
    // The callsign, which is the set's one name everywhere on the console.
    return `<div class="bs-row ${cls}" title="${esc(nomenclatureFor(radar.label)?.en ?? radar.label)}">`
      + `<span>${esc(radar.label)}</span><b>${esc(state)}</b></div>`;
  }).join('');
  return `<div class="bs-head is-second">YOUR RADARS</div>${rows}`;
}

/**
 * What is being defended, and whether it is still there.
 *
 * The whole watch is scored on this and the console never showed it. A hit on
 * the airbase was one ticker line that scrolled away inside a minute; from
 * then until the debrief there was no way to find out what was still standing
 * short of remembering. It is four to six rows of two words. The debrief has
 * printed this table since the first build — it should not be the first time
 * the operator sees it.
 */
function groundState(world) {
  const rows = world.assets.map((asset) => {
    const hp = ASSET_TYPES[asset.type]?.hp ?? 1;
    const pct = Math.round(100 * clamp01(asset.damage / hp));
    const state = asset.destroyed ? 'DESTROYED' : pct >= 1 ? `${pct}% DAMAGE` : 'INTACT';
    const cls = asset.destroyed ? 'is-lost' : pct >= 1 ? 'is-hurt' : '';
    return `<div class="bs-row ${cls}"><span>${esc(asset.label)}</span><b>${esc(state)}</b></div>`;
  }).join('');
  return rows ? `<div class="bs-head is-second">THE GROUND</div>${rows}` : '';
}

function renderTrackDetail(world, ui, els) {
  const track = ui.selectedTrackId ? world.tracks.get(ui.selectedTrackId) : null;
  if (!track) {
    els.trackDetail.innerHTML = '<i>Click a contact to read what it is and where it is heading.</i>';
    return;
  }
  const asset = track.predictedAssetId ? world.assetById.get(track.predictedAssetId) : null;
  const tti = Number.isFinite(track.ttiS) ? clockString(track.ttiS) : '—';
  const speedKts = Math.round(len(track.vel) * 1943.8);
  const idPct = Math.round(100 * clamp01(track.idProgressS / 26));

  // "Identifying 40%", "track 80% sure", "not seen lately — position
  // estimated": the readout says what the figures mean rather than naming
  // the field they came from.
  els.trackDetail.innerHTML = `
    <b>${esc(track.tn)}</b> ${esc(track.hostility.toUpperCase())}
    · ${esc(track.classification === 'unknown' ? `identifying ${idPct}%` : AIR_TYPES[track.classification]?.name ?? '')}<br>
    ${speedKts} kt · ${Math.round(track.altM)} m · track ${Math.round(track.quality * 100)}% sure
    ${track.coasting ? '· <em>NOT SEEN LATELY — POSITION ESTIMATED</em>' : ''}<br>
    ${huntsTheFlight(world, track)
    ? `Heading for <b>${esc(world.vipAircraft()?.name ?? 'THE STATE AIRCRAFT')}</b>.`
    : asset ? `Heading for <b>${esc(asset.label)}</b>, ${tti} away.` : 'Heading nowhere in particular yet.'}
    ${track.assignedTo.length ? `<br>Assigned to: <b>${esc(track.assignedTo.map((id) => world.siteById.get(id)?.name).join(', '))}</b>` : ''}`;
}

/* ---------------------------------------------------------- formations */

/**
 * The commands under this one.
 *
 * Invisible at battalion and sector level, where there is a single formation
 * and it is yours. From district command upward this is the panel the watch is
 * actually played on: four sectors, two of which you may hold, each with a
 * standing order and an officer who is carrying it out somewhere you cannot
 * see. Taking one costs a handover, and the handover is shown running, because
 * the seconds in which nobody is commanding a sector are the price of the
 * decision and hiding them would make the decision free.
 */
/** Alt and this command's number, or nothing if it is past the fourth. */
function takeKey(world, formation) {
  const n = world.formations.filter((f) => !f.hq).indexOf(formation);
  return n >= 0 && n < 4 ? `ALT${n + 1}` : '';
}

export function renderFormations(world, ui, els) {
  const host = els.formationList;
  if (!host) return;
  if (world.formations.length < 2) { host.hidden = true; return; }
  host.hidden = false;

  const limit = world.echelon.directLimit;
  const held = world.formations.filter((f) => f.direct && !f.hq).length;

  const cards = world.formations.map((formation) => {
    const sites = world.sites.filter((s) => s.formationId === formation.id);
    const alive = sites.filter((s) => s.alive);
    const rounds = alive.reduce((n, s) => n + s.readyRounds, 0);
    const engaged = alive.reduce((n, s) => n + s.engagements.length, 0);
    const handover = Math.max(0, formation.handoverUntilS - world.t);
    const state = handover > 0 ? 'handover' : formation.hq ? 'hq' : formation.direct ? 'direct' : 'detached';
    const postureEntry = CONTROLS[formation.posture];
    const nextEntry = CONTROLS[POSTURE_CYCLE[(POSTURE_CYCLE.indexOf(formation.posture) + 1) % 3]];
    /*
     * How much of his own sector the officer is actually holding.
     *
     * A subordinate commander directs a fixed number of engagements at once —
     * one officer, one radio, one map — and when a package arrives together
     * rather than in file the rest of it waits on him. The card said ENGAGED 4
     * and gave no way to tell a sector fighting hard from a sector that has run
     * out of hands, which is the single thing this appointment is deciding
     * between. Now it says 3/3 and turns, and the two answers are on the two
     * buttons underneath it.
     */
    const limit = spanLimit(formation);
    const held = spanLoad(world, formation);
    const showSpan = Number.isFinite(limit) && !formation.direct && handover <= 0;
    const saturated = showSpan && held >= limit;

    return `<div class="fmn is-${state}${saturated ? ' is-saturated' : ''}" data-formation="${formation.id}">
      ${/*
     * The head of a formation card is built like the head of a battery card:
     * the English name on the left, the Cyrillic nomenclature on a plate at
     * the right. It was the other way round and in a different idiom —
     * ДИВИЗИОН ГЛАВНОГО ШТАБА over a dim "Headquarters battalion" — so one
     * scrolling column carried two naming systems, Cyrillic-first at the top
     * and English-first below it, on cards of the same size.
     */ ''}
      <div class="fmn-head unit-head">
        <span class="unit-name">${esc(formation.en.toUpperCase())}</span>
        <span class="unit-type is-plate" title="${esc(formation.en)}">${esc(formation.tm)}</span>
      </div>
      ${/* Who is actually commanding it, on its own instrument line rather
           than squeezed into the head beside a name and a plate. */ ''}
      <div class="fmn-state"><label>COMMAND</label><b>${esc(
    handover > 0 ? `HANDOVER ${Math.ceil(handover)}s`
      : formation.hq ? 'YOURS'
        : formation.direct ? 'UNDER YOUR HAND'
          : saturated ? 'HANDS FULL'
            : (formation.commander?.name ?? 'SUBORDINATE'))}</b></div>
      <div class="fmn-figures">
        <span><label>BTY</label>${alive.length}/${sites.length}</span>
        <span><label>ROUNDS</label>${rounds}</span>
        <span><label>ENGAGED</label>${showSpan ? `${held}/${limit}` : engaged}</span>
        <span><label>ORDER</label>${esc(postureEntry.en)}</span>
      </div>
      <div class="fmn-controls">
        <button class="pb" data-act="posture" data-formation="${formation.id}"
          title="Now WEAPONS ${esc(postureEntry.en)}. Press to order WEAPONS ${esc(nextEntry.en)} — the standing order this formation fights on while you are elsewhere.">
          <span class="lg"><b>ORDER WEAPONS ${esc(nextEntry.en)}</b></span>
        </button>
        ${/*
     * The key that takes this command is stamped on the cap that takes it, the
     * way every other key on this console is: Alt and the card's own number,
     * counted over the formations you may take — which is the same list the
     * key map walks.
     */ ''}
        ${formation.hq ? '' : `<button class="pb ${formation.direct ? 'is-down' : ''}"
          data-act="direct" data-formation="${formation.id}"
          title="${formation.direct ? 'Hand it back to its commander' : `Take it under your own hand (${held}/${limit} held)`}">
          <span class="lg"><b>${formation.direct ? 'RELEASE' : 'TAKE'}</b></span>${keycap(takeKey(world, formation))}
        </button>`}
      </div>
    </div>`;
  }).join('');

  paint(host, `<div class="fmn-bar">
      <span class="lg"><b>SUBORDINATE COMMANDS</b></span>
      <span class="fmn-count">${held}/${Number.isFinite(limit) ? limit : '∞'} DIRECT</span>
    </div>
    <div class="unit-explain">Each formation fights on the standing order you leave it with.
      TAKE one to command its batteries yourself; the rest are their officers' watch.</div>
    ${cards}${renderReserve(world)}`);
}

/**
 * The strategic reserve, at the one appointment that can release it.
 *
 * Rounds nobody below you can move, four minutes of road between the order and
 * a rail, and not enough of them to cover two of anything.
 *
 * Every formation that has batteries, including your own headquarters
 * battalion. It used to exclude the headquarters — `!f.hq` — on the reasoning
 * that your own battalion is already yours, which is true and irrelevant: on
 * the escort watch BASTION TAVROV is the ONLY battery whose reach covers the
 * filed route, it sits in the headquarters formation, and the epilogue's own
 * verb could therefore not be pointed at the thing the epilogue is about. Six
 * rounds and four minutes of road is a decision either way; the panel's job is
 * to let it be made.
 */
function renderReserve(world) {
  if (!world.reserve.rounds && !world.reserve.released) return '';
  const transit = world.reserve.inTransit
    .map((c) => `${c.rounds} → ${esc(world.formationById.get(c.formationId)?.name ?? '')} `
      + `(${Math.ceil(c.arrivesAtS - world.t)}s)`)
    .join(', ');
  return `<div class="fmn is-reserve">
    <div class="fmn-head unit-head">
      <span class="unit-name">STRATEGIC RESERVE</span>
      <span class="unit-type is-plate">${world.reserve.rounds} ROUNDS HELD</span>
    </div>
    ${transit ? `<div class="fmn-figures"><span><label>ON THE ROAD</label>${transit}</span></div>` : ''}
    <div class="fmn-controls">
      ${world.formations.filter((f) => world.sitesOf(f).length).map((f) => `<button class="pb"
        data-act="reserve" data-formation="${f.id}" ${world.reserve.rounds <= 0 ? 'disabled' : ''}
        title="Release four rounds to ${esc(f.name)}. They take four minutes to arrive.">
        <span class="lg"><b>RELEASE 4 → ${esc(f.en.toUpperCase())}</b></span>
      </button>`).join('')}
    </div>
  </div>`;
}

/**
 * The weapons state, as three latching positions instead of one cycling cap.
 *
 * The old cap printed the state the battery was IN and moved it to the NEXT one
 * when pressed — the same trap the formation cards were taken out of — and it
 * carried two keys on one face ("WEAPONS TIGHT · Q W") without saying which key
 * did which. Three caps, one key each, the live one latched down: what the
 * battery is on is the cap that is pressed in, and what a press will do is
 * written on the cap you press.
 *
 * The order is POSTURE_CYCLE's, so the rack, the formation cards and the
 * keyboard all name the three states in the same order.
 */
/*
 * Q, W, E — three adjacent keys for three adjacent caps, and no modifier on
 * any of them. FREE used to be Shift+E, which put a two-glyph chip on a cap
 * whose neighbours carried one, and left the only modified binding on the rack
 * sitting next to the only other control that answered to E.
 */
const WEAPONS_KEYS = { hold: 'Q', tight: 'W', free: 'E' };

function weaponsCaps(site, disabled, keyed) {
  return POSTURE_CYCLE.map((stateId) => {
    const entry = CONTROLS[stateId];
    const live = site.weaponsState === stateId;
    return press(entry, {
      act: 'weapons',
      site: site.id,
      state: stateId,
      key: keyed ? WEAPONS_KEYS[stateId] : '',
      disabled,
      extra: `pb-weapons${live ? ' is-down is-live' : ''}`,
      title: live ? `Weapons ${entry.en} — this battery is on it`
        : `Order weapons ${entry.en}`,
    });
  }).join('');
}

/* ------------------------------------------------------------- weapons */

/**
 * The batteries, in the order the panel lists them and the keys address them.
 *
 * Your own battery is first. The list used to be in scenario order, which put
 * the district and national watches' home battery third or fourth inside a
 * scrolling column — measured at 1600×950 on the finale, `#battery-list` is
 * 144 px tall against 2406 px of cards, and BASTION's DISPLACE cap sat 364 px
 * below the fold on the one watch whose whole third axis is aimed at that
 * battery. A player cannot be expected to scroll for the control that decides
 * whether they live, and nothing on the net tells them to look.
 *
 * `world.sites` itself is untouched, so the engine and every seeded
 * measurement are unaffected; the panel and the keyboard read this instead, so
 * the number on a card is the number that selects it.
 */
export function batteryOrder(world) {
  const rank = (s) => (world.control.crewedBatteryId === s.id ? 0
    : world.homeBatteryId === s.id ? 1 : 2);
  return [...world.sites].sort((a, b) => rank(a) - rank(b));
}

/**
 * The cards the rack actually draws, which is where its numbering comes from.
 *
 * With the cabin up the crewed battery is not a card in the rack — it is the
 * console below it. It used to be both: on a single-battery watch the column
 * showed LANCE EAST twice, the rack's copy clipped mid-button by its own
 * height cap and wearing the brighter border of the two. The keyboard reads
 * this list as well, so the number on a card is still the number that
 * addresses it.
 */
export function rackBatteries(world, ui) {
  const crewedUp = ui?.view === 'crew' && !!world.control.crewedBatteryId;
  return batteryOrder(world)
    .filter((site) => !(crewedUp && site.id === world.control.crewedBatteryId));
}

/**
 * The rest of the net, as one line each, above the seat.
 *
 * In the cabin the rack is reference material — what else is on the air, and
 * whether any of it is being shot at — and reference material rendered as full
 * cards does not fit above a console that needs the column. What it did
 * instead was worse than not fitting: the rack is a scroller, so its first
 * card was sliced horizontally through the middle of its ELINT EXPOSURE row by
 * the console's top edge and every card under it was out of sight, on a panel
 * with no scrollbar drawn.
 *
 * So: uniform strips, one row per set, on one pitch. A cut between strips is a
 * cut between rows and never through a line of text, every unit on the net is
 * legible at a glance, and the emissions switch — the one control on this
 * panel a watch cannot be played without — is still on every one of them.
 */
function crewRack(world, ui, caps) {
  const rows = [];
  for (const radar of world.radars.filter((r) => !r.siteId)) {
    rows.push({
      key: `data-radar="${radar.id}"`,
      name: radar.label,
      dead: !radar.alive,
      armEtaS: radar.alive ? armTimeToImpact(world, radar) : Infinity,
      figure: radar.alive ? `${radar.rangeKm} km` : STATUS.destroyed.en,
      exposure: caps.exposure && radar.alive ? radar.exposure ?? 0 : null,
      control: switch2(CONTROLS.radiate, CONTROLS.silence, !!radar.on,
        { act: 'emcon-radar', radar: radar.id, disabled: !radar.alive }),
    });
  }
  for (const site of rackBatteries(world, ui)) {
    const sets = world.radarsOf(site);
    const radar = sets.find((r) => r.alive) ?? world.radarById.get(site.radarId);
    const armEtaS = Math.min(...sets.filter((r) => r.alive)
      .map((r) => armTimeToImpact(world, r)), Infinity);
    rows.push({
      key: `data-site="${site.id}"`,
      name: site.name,
      dead: !site.alive,
      armEtaS,
      figure: site.alive
        ? `${site.readyRounds}/${railsOf(site)} · ${site.engagements.length} ENG`
        : STATUS.destroyed.en,
      exposure: caps.exposure && radar?.alive ? radar.exposure ?? 0 : null,
      control: switch2(CONTROLS.radiate, CONTROLS.silence, !!radar?.on,
        { act: 'emcon', site: site.id, disabled: !site.alive || !radar?.alive }),
    });
  }
  return rows.map((r) => `<div class="rack-strip ${r.dead ? 'is-dead' : ''}" ${r.key}>
    <span class="rs-name">${esc(r.name)}</span>
    ${Number.isFinite(r.armEtaS)
    ? `<span class="rs-arm" title="Anti-radiation round tracking this set"
        >ARM ${Math.ceil(r.armEtaS)}s</span>` : ''}
    ${r.exposure === null ? '' : `<span class="gauge rs-gauge ${r.exposure > 0.65 ? 'is-hot'
    : r.exposure > 0.35 ? 'is-warn' : ''}" title="${esc(STATUS.exposure.en)}"
      ><i style="width:${Math.round(r.exposure * 100)}%"></i></span>`}
    <span class="rs-fig">${esc(r.figure)}</span>
    ${r.control}
  </div>`).join('')
    // A list says when it has come to an end, rather than trailing off into
    // painted steel and leaving the player wondering what is under the fold.
    + `<div class="rack-empty">${rows.length === 1 ? 'NOTHING ELSE ON THIS NET'
      : 'END OF THE NET'}</div>`;
}

export function renderBatteries(world, ui, els) {
  // One answer for what this watch's console carries, shared with the key map
  // and the handbook. See consoleCaps().
  const caps = consoleCaps(world.scenario);
  /*
   * The rack is the OTHER batteries.
   *
   * With the cabin up, the crewed battery was drawn twice in the same column:
   * once as a rack card with its own lamps, rail lamps, refusal line and caps,
   * and once as the console below it — and on a single-battery watch the copy
   * wearing the bright selection border was the rack's, clipped mid-button by
   * the rack's own height cap. One battery, two consoles, the duplicate the
   * more prominent of the two. The seat is the seat; the rack is what else is
   * on the net, and dropping the duplicate is also the height the cabin's own
   * controls needed.
   */
  const units = rackBatteries(world, ui).map((site, index) => {
    const type = SAM_TYPES[site.type];
    /*
     * The battery's emissions lamp and switch follow whichever set is still
     * standing, not `site.radarId` — that names the acquisition antenna, and
     * reading only it greyed the RADIATE cap out for the rest of the watch
     * the moment that one set died, on a battery whose fire-control antenna
     * was alive and answerable the whole time.
     */
    const sets = world.radarsOf(site);
    const radar = sets.find((r) => r.alive) ?? world.radarById.get(site.radarId);
    const anyAlive = sets.some((r) => r.alive);
    const nomenclature = EQUIPMENT[site.type];
    const mine = world.homeBatteryId === site.id;
    const crewed = world.control.crewedBatteryId === site.id;
    const armEta = radar?.alive ? armTimeToImpact(world, radar) : Infinity;


    // A battery in a formation somebody else is commanding is still on the
    // board and still shooting; it simply is not taking orders from this seat.
    const detached = !world.commandable(site.id);

    /*
     * Fit against the selected contact, judged BEFORE the assignment. The
     * first watch hands the player a battery whose ceiling is below every
     * contact in the mission; the card now says so while they are deciding,
     * instead of a cheerful ENGAGING followed by a quiet break-off.
     */
    const selectedTrack = ui.selectedTrackId ? world.tracks.get(ui.selectedTrackId) : null;
    const unfit = selectedTrack && !detached && site.alive
      ? cannotEngageReason(world, site, selectedTrack) : null;

    /*
     * The key chips go on the card the keys will act on, and on no other.
     *
     * Q, W, E, R, S and X all act on the SELECTED battery, so a rack of four
     * cards printed the same six chips four times over: twenty-four key
     * legends for six keys, and no way to tell from the rack which card they
     * addressed. The chips follow the selection — which is also the card
     * carrying the class note, for the same reason — and the shroud reserves
     * the chip's corner on every cap either way, so nothing on the rack moves
     * when the selection does.
     */
    const keyed = ui.view !== 'crew'
      && (ui.selectedSiteId === site.id || (!ui.selectedSiteId && mine));

    return `<div class="unit ${ui.selectedSiteId === site.id ? 'is-selected' : ''}
        ${!site.alive ? 'is-dead' : ''} ${mine ? 'is-mine' : ''}
        ${detached ? 'is-detached' : ''}" data-site="${site.id}">
      <span class="screw ${'abcd'[index % 4]}"></span>
      <div class="unit-head">
        <span class="unit-name">${index + 1}. ${esc(site.name)}</span>
        ${/* The nomenclature plate is where the Cyrillic lives, here and on the
             works plate and the stamps — and nowhere else on this console. */ ''}
        <span class="unit-type is-plate" title="${esc(nomenclature?.en ?? type.label)}">
          ${esc(nomenclature ? pair(nomenclature) : type.label)}${crewed ? ` · ${esc(STATUS.yourSeat.en)}` : ''}</span>
      </div>
      ${unfit ? `<div class="unit-row unit-unfit" title="Against the selected contact">
        <span>✗ CANNOT TAKE ${esc(selectedTrack.tn)} — ${esc(refusalText(unfit))}</span>
      </div>` : ''}

      ${/*
     * Three lamps on three fixed cells, and every caption engraved for good.
     *
     * The player's complaint was that throwing the switch made "the text
     * change and stuff move around": the emissions lamp used to swap its
     * word between RADIATING and WARMING, which made it thirteen pixels
     * narrower and slid INBOUND ARM along the row; the ARM lamp appended its
     * countdown to its own caption and grew; and a dead battery grew a
     * fourth lamp. The captions are fixed now — warming is the amber of the
     * RADIATING lamp, the seconds are the ARM lamp's own figure column, and a
     * dead battery's FAULT lights in the cell READY can never light in — so
     * the only thing on the card that moves when the switch is thrown is
     * the lever. See `emissionsLamp` and `armLamp`.
     */ ''}
      <div class="unit-row unit-lamps">
        ${!site.alive ? lamp(STATUS.fault, true, { colour: 'red' })
    : lamp(STATUS.ready, site.readyRounds > 0 && site.scootRemainingS === 0, { colour: 'green' })}
        ${emissionsLamp(radar)}
        ${armLamp(armEta)}
      </div>

      ${/* The rails, and beside them the rounds on site to fill them from. */ ''}
      <div class="unit-row unit-rails">
        ${tubes(site)}
        ${storeCount(site)}
      </div>
      ${/*
     * What the class IS, on the card the operator is actually looking at.
     *
     * Four copies of a four-line paragraph, one per battery, is a hundred and
     * seventy pixels of teaching copy standing between the operator and the
     * caps on a rack that scrolls — and it is the same four lines every night
     * once it has been read. The class name stays on every card; the paragraph
     * belongs to the card that is selected, which is the card being decided
     * about.
     */ ''}
      ${ui.selectedSiteId === site.id || crewed || (!ui.selectedSiteId && mine)
    ? `<div class="unit-explain">${esc(DEFENCE_CLASSES[type.class].blurb)}</div>` : ''}
      ${/*
     * What the battery is, and what it can reach. The class name moved here
     * from beside the rail lamps, which now carry the store count; the old
     * "8/16 ROUNDS" that led this row is gone, because the lamps are the
     * eight and the store figure is the sixteen, each next to what it counts.
     */ ''}
      <div class="unit-row">
        <span class="unit-type wrap"><span title="${esc(DEFENCE_CLASSES[type.class].blurb)}">${
  esc(DEFENCE_CLASSES[type.class].en.toUpperCase())}</span>
          · ${esc(STATUS.channels.en)} ${site.engagements.length}/${channelsFor(site)}${(() => {
    // The battery's own most anxious number, on the net side too: seconds
    // until its nearest round in flight arrives. The crew console had this;
    // the commander watching four batteries did not.
    const eta = roundEtaFor(world, site);
    return eta !== null ? ` · ${esc(STATUS.inFlight.en)} ${Math.ceil(eta)}s` : '';
  })()}
          ${/* A range is one figure and may not be broken across two lines.
               This read "· 6–120 KM · 120–" over "25,000 M" on a rack 230px
               wide — a numeric span cut in half at the hyphen. Each envelope
               is its own unbreakable unit; the line breaks at the middot. */ ''}
          <span class="lo"><span class="nb">· ${type.minRangeKm}–${type.maxRangeKm} KM</span>
            <span class="nb">· ${Math.round(type.minAltM)}–${Math.round(type.maxAltM).toLocaleString('en-US')} M</span></span></span>
      </div>
      ${reloadBar(site, type)}

      ${/*
     * No row appears when the switch is thrown.
     *
     * There used to be one — BY ORDER — SILENT UNTIL YOU SAY OTHERWISE — that
     * came into being the moment the operator threw a battery's switch and
     * pushed the switch and every cap under it down the card, which is the
     * exact thing the player asked to have stopped. A switch that stays
     * where you put it needs no notice saying so; the fact is in the
     * switch's own tooltip.
     */ ''}
      <div class="unit-switches">
        ${switch2(CONTROLS.radiate, CONTROLS.silence, !!radar?.on,
    { act: 'emcon', site: site.id, key: keyed ? 'A' : '', disabled: detached || !anyAlive,
      note: site.emconHold && !crewed ? STATUS.emconHeld.hint : '' })}
        ${!caps.ride ? '' : switch2(CONTROLS.ride, CONTROLS.perDoctrine, site.emconOrder === 'ride',
    { act: 'ride', site: site.id, key: keyed ? 'G' : '', disabled: detached || !anyAlive })}
      </div>
      <div class="unit-controls">
        ${weaponsCaps(site, detached, keyed)}
        ${press(CONTROLS.reload, { act: 'reload', site: site.id, key: keyed ? 'R' : '',
    disabled: detached || !canStartLoading(world, site) })}
        ${!caps.salvo ? '' : press({ tm: `${CONTROLS.salvo.tm} ${site.salvoSize}`, en: `SALVO ${site.salvoSize}` },
    { act: 'salvo', site: site.id, key: keyed ? 'S' : '', disabled: detached,
      title: 'Rounds per engagement' })}
        ${!caps.displace ? ''
    : press(CONTROLS.displace, { act: 'scoot', site: site.id, key: keyed ? 'X' : '',
      disabled: detached || site.scootRemainingS > 0 })}
      </div>
    </div>`;
  }).join('');

  /*
   * Blind with hostiles airborne: nothing on the picture, something in the
   * sky. That is the one state where the radiate switch is THE decision, and
   * the switch says so — measured by a person, not an agent: the old
   * bat-handle at the bottom of a Cyrillic-headed card was "too hard to
   * turn on", which for a switch that makes the game exist is disqualifying.
   */
  const blind = world.tracks.size === 0
    && world.aircraft.some((a) => a.alive && !AIR_TYPES[a.type]?.friendly);

  const surveillance = world.radars.filter((r) => !r.siteId).map((radar, index) => {
    const nomenclature = nomenclatureFor(radar.label);
    const armEta = radar.alive ? armTimeToImpact(world, radar) : Infinity;
    return `<div class="unit" data-radar="${radar.id}">
      <span class="screw ${'abcd'[index % 4]}"></span>
      <div class="unit-head">
        ${/*
       * The callsign on the head, the nomenclature on the plate — the same
       * head the battery cards have (1. BASTION over С-200 «БАСТИОН» · S-200
       * BASTION). The player's rule is that a set has one name everywhere:
       * the tutorial says "find WIDE EYE", so the card says WIDE EYE, and
       * P-31 is what the plate under it is stencilled with. It used to say
       * P-31 WIDE EYE on the head with a bare Cyrillic plate, which was the
       * one card on the rack built the other way round from its neighbours.
       */ ''}
        <span class="unit-name">${esc(radar.label)}</span>
        <span class="unit-type is-plate" title="${esc(nomenclature ? pair(nomenclature) : radar.label)}">
          ${esc(nomenclature ? pair(nomenclature) : radar.label)}</span>
      </div>
      ${/*
     * What this set is, read off the set rather than off its range figure.
     * The rule was `rangeKm > 90`, and the gap-filler on the weasel watch
     * reaches 164 km — so the card for П-14 LOW LOOK, the set that exists to
     * see under the big one, described itself as the long-range surveillance
     * picture, word for word, directly under its own nomenclature plate.
     */ ''}
      <div class="unit-explain">${esc(nomenclature === EQUIPMENT.gapfiller
    ? 'Gap-filler radar — sees the low approaches the big set cannot.'
    : 'Early-warning radar — the long-range search set. Nothing shows on the scope until a radar is switched on.')}</div>
      <div class="unit-row unit-lamps">
        ${emissionsLamp(radar)}
        ${armLamp(armEta)}
        <span class="unit-type reach">${radar.alive ? `${radar.rangeKm} KM` : esc(STATUS.destroyed.en)}</span>
      </div>
      ${caps.exposure ? `<div class="unit-row">
        <span class="unit-type wrap">${esc(STATUS.exposure.en)}</span>
        <span class="gauge ${radar.exposure > 0.65 ? 'is-hot' : radar.exposure > 0.35 ? 'is-warn' : ''}">
          <i style="width:${Math.round(radar.exposure * 100)}%"></i></span>
        <span class="unit-type">${Math.round(radar.exposure * 100)}%</span>
      </div>` : ''}
      <div class="unit-switches">
        ${switch2(CONTROLS.radiate, CONTROLS.silence, !!radar.on, {
    act: 'emcon-radar', radar: radar.id, disabled: !radar.alive,
    extra: `sw-primary${!radar.on && blind && radar.alive ? ' is-urgent' : ''}`,
  })}
      </div>
    </div>`;
  }).join('');

  paint(els.batteryList, ui.view === 'crew' ? crewRack(world, ui, caps) : surveillance + units);

  /*
   * Which card the keyboard is pointed at, said at the head of the rack.
   *
   * The key chips are printed on the selected battery's caps and on no other —
   * twenty-four legends for six keys was unreadable — but the caps on the cards
   * below look identically live, and nothing on the panel said that Q, W, E and
   * R follow the highlight. The rack head says it, and names the card, so the
   * answer is one glance rather than a hunt for chips.
   */
  if (els.rackKeys) {
    const target = ui.view === 'crew' ? null
      : batteryOrder(world).find((s) => s.id === ui.selectedSiteId)
        ?? batteryOrder(world).find((s) => s.id === world.homeBatteryId);
    /*
     * In the cabin the head says what the strips under it are instead. It was
     * the word WEAPONS alone on a full-width band of empty painted steel at
     * the top of the column — a heading with nothing to head.
     */
    const text = ui.view === 'crew'
      ? `${rackBatteries(world, ui).length + world.radars.filter((r) => !r.siteId).length}`
        + ' ON THE NET · NOT YOUR SEAT'
      : target ? `KEYS → ${target.name}` : '';
    if (els.rackKeys.textContent !== text) els.rackKeys.textContent = text;
  }
}

/* -------------------------------------------------------- crew console */

/**
 * A refusal, in the console's own voice.
 *
 * `cannotEngageReason` answers in sentence-case English with its units glued
 * to their figures, because it is written for the ticker — and the cabin was
 * printing it through `toUpperCase()`, which turned the units into part
 * numbers: ABOVE ITS CEILING (15KM), BELOW ITS FLOOR (60M), OUT OF REACH FOR
 * 137S, on a panel whose every other figure is typeset 41 km / 39s / 80%. The
 * engine keeps its prose for the log; the panel keeps its engraving.
 */
function refusalText(reason) {
  if (!reason) return '';
  const table = [
    [/^battery destroyed$/, 'BATTERY DESTROYED'],
    [/^not under your command$/, 'NOT YOUR COMMAND'],
    [/^fire control destroyed$/, 'FIRE CONTROL DESTROYED'],
    [/^above its ceiling \((\d+)km\)$/, 'TOO HIGH · CEILING $1 km'],
    [/^below its floor \((\d+)m\)$/, 'TOO LOW · FLOOR $1 m'],
    [/^no rounds on the rails$/, 'RAILS EMPTY'],
    [/^all channels engaged$/, 'ALL CHANNELS BUSY'],
    [/^will never be in reach$/, 'OUT OF REACH'],
    [/^out of reach for (\d+)s$/, 'OUT OF REACH FOR $1 s'],
  ];
  for (const [pattern, form] of table) {
    if (pattern.test(reason)) return reason.replace(pattern, form);
  }
  return String(reason).toUpperCase();
}

/**
 * The second line on the launch cap: what the cap is waiting for.
 *
 * Short enough to be engraved, and it always says something — a cap that is
 * ready says how many rounds it will fire from, and a cap that is dead says
 * which of the reasons it is dead for. Both are things the operator was
 * otherwise reading off three different rows above it.
 *
 * What it never does any more is REPLACE the cap's legend. During a guidance
 * run the cap used to print '1 IN FLIGHT · 37s TO INTERCEPT' where the word
 * LAUNCH goes, so for the twenty-five to forty seconds that matter most the
 * primary control of the seat lost its identity and became a countdown. The
 * cap says LAUNCH in every state; the countdown is a readout, and readouts
 * live on rows.
 */
function fireCapNote(site, status, unfit, noTarget) {
  if (!site.alive) return 'BATTERY DESTROYED';
  if (site.scootRemainingS > 0) return 'MOVING — CANNOT FIRE';
  if (status.state === 'guiding') {
    return `${status.roundsUp} IN FLIGHT`
      + (status.roundEtaS !== null ? ` · ${Math.ceil(status.roundEtaS)}s TO GO` : '');
  }
  if (site.readyRounds <= 0) return 'RAILS EMPTY';
  if (noTarget) return 'NO TARGET PICKED';
  if (unfit) return refusalText(unfit);
  if (status.canFire) return `${site.readyRounds} ON THE RAILS · ${site.salvoSize} PER SHOT`;
  if (status.holding) return 'WAITING FOR RANGE';
  if (status.state === 'reacting') return 'CREW SETTING UP';
  return 'NO SHOT YET';
}

/**
 * One fire-control channel, as a row of the cabin's channel block.
 *
 * An occupied channel is a button: pressing it foregrounds its contact in the
 * readouts above, which is how the operator moves between three engagements
 * without hunting for their symbols on the tube. A free one is a dashed row
 * that holds its place, so the block is the same height whatever the battery
 * is doing and nothing below it moves when a channel opens or closes.
 */
function channelRow(entry, focusedTrackId) {
  if (entry.free) {
    return `<div class="chan is-free">
      <span class="chan-n">${entry.channel}</span>
      <span class="chan-tn">—</span>
      <span class="chan-state">${esc(STATUS.channelFree.en)}</span>
      <span class="chan-fig"></span>
    </div>`;
  }
  /*
   * Range, rounds up, and whichever clock this channel is on: the crew's
   * reaction before it is ready, then the round's time of flight once one is
   * in the air. Rounds-up is always printed on a busy channel — the column
   * used to appear only when a round was actually up, so the operator could
   * not tell a channel holding two rounds from one holding none without
   * watching the figure change.
   */
  const figures = [
    entry.rangeKm !== null ? `${Math.round(entry.rangeKm)} km` : '',
    `${entry.roundsUp} IN AIR`,
    entry.etaS !== null ? `${Math.ceil(entry.etaS)}s`
      : entry.timerS > 0 ? `${entry.timerS.toFixed(1)}s` : '',
  ].filter(Boolean).join(' · ');
  const focused = entry.trackId === focusedTrackId;
  return `<button class="chan is-live ${focused ? 'is-focus' : ''}
      ${entry.state === 'GUIDING' ? 'is-guiding' : ''}" data-track="${esc(entry.trackId)}"
      title="Channel ${entry.channel} — ${esc(entry.tn)}, ${esc(entry.state.toLowerCase())}. Press to bring it up on the readouts.">
    ${/*
   * The foregrounded channel is MARKED, not reprinted.
   *
   * The block used to carry a row of its own at the head reading
   * 'SEL T-001 ON CHANNEL 1' directly above '1 T-001 REACTING' — the same
   * contact, the same channel, twice, in adjacent rows of the same table. The
   * caret in the number column says which row the readouts below are about.
   */ ''}
    <span class="chan-n">${focused ? '▸' : ''}${entry.channel}</span>
    <span class="chan-tn">${esc(entry.tn)}</span>
    <span class="chan-state">${esc(entry.state)}</span>
    <span class="chan-fig">${esc(figures)}</span>
  </button>`;
}

/**
 * The operator's own station.
 *
 * Three rules hold this card together, and all three were broken:
 *
 *   The panel is about the BATTERY, not about the cursor. With nothing
 *   selected it used to go blank — TARGET —, SEQUENCE STANDBY, both guidance
 *   lamps dark — while its own launcher guided three rounds. The channel block
 *   is the readout now, and the rows above it foreground the selected contact
 *   or, failing one, the channel the battery is actually working.
 *
 *   Controls do not move. Every optional row used to sit ABOVE the caps, so
 *   the launch cap and LOCK slid up and down by up to 41 px as an engagement
 *   progressed — which is to say, exactly when the operator was reaching for
 *   them. The commands are a fixed pad at the foot of the card; only the
 *   readouts above them scroll.
 *
 *   A control that cannot act says so. RELOAD and DISPLACE were live-looking
 *   caps that ate presses in silence on a displacing battery.
 */
export function renderCrewConsole(world, ui, els) {
  const site = world.siteById.get(world.control.crewedBatteryId);
  if (!site) { els.crewConsole.hidden = true; return; }
  els.crewConsole.hidden = false;

  const type = SAM_TYPES[site.type];
  const nomenclature = EQUIPMENT[site.type];
  /*
   * The teaching watch shows the seat, not the trade: displacement and the
   * ELINT game wait until a watch where somebody is actually shooting back.
   * `consoleCaps` is that whole judgement in one place, and the key map and
   * the handbook read the same answer this card does.
   */
  const caps = consoleCaps(world.scenario);
  const channels = channelStatus(world, site);
  const sets = world.radarsOf(site);
  const radar = sets.find((r) => r.alive) ?? world.radarById.get(site.radarId);
  const guidanceSet = world.radarById.get(site.fcRadarId ?? site.radarId);
  const wrecked = site.alive && guidanceSet && !guidanceSet.alive;
  const displacing = site.alive && site.scootRemainingS > 0;

  /*
   * Which contact the readouts are about.
   *
   * The selection, when there is one. When there is not, the battery's own
   * busiest channel — because a cabin whose launcher is guiding a round and
   * whose panel says NO TARGET DESIGNATED is not reporting the battery, it is
   * reporting the mouse. The rows say which of the two they are showing.
   */
  const selected = ui.selectedTrackId ? world.tracks.get(ui.selectedTrackId) : null;
  const adopted = selected ? null
    : channels.find((c) => !c.free && !c.lost && c.state === 'READY')
      ?? channels.find((c) => !c.free && !c.lost);
  const track = selected ?? (adopted ? world.tracks.get(adopted.trackId) : null);
  const status = engagementStatus(world, site, track);

  /*
   * A refusal about the contact you are already shooting at is not a refusal.
   *
   * `cannotEngageReason` answers 'all channels engaged' whenever the channels
   * are full, without asking whether the track in question is holding one of
   * them — so the cabin printed ✗ CANNOT LOCK T-001 — ALL CHANNELS ENGAGED
   * directly under a live red launch cap, an IN ENVELOPE range and a 36% kill
   * estimate for that same T-001, and greyed out the LOCK cap, which is also
   * the break-off control. The console refusing and offering the same target
   * in adjacent rows, and no way to let the channel go.
   */
  const own = track ? site.engagements.find((e) => e.trackId === track.id) : null;
  const unfit = track && site.alive && !own ? cannotEngageReason(world, site, track) : null;

  /*
   * The anti-radiation watch, per antenna.
   *
   * A battalion has two sets and they are hunted separately: measured on the
   * weasel watch, two rounds in the air, one tracking the acquisition set and
   * one the fire control, their exposures diverged to 0.997 and 0.892 — and
   * the cabin showed one un-timed lamp and one bar, both for the acquisition
   * set, with nothing at all about the antenna being shot at. The lamp names
   * the set being hunted and counts it down, because the seconds are what the
   * DISPLACE cap beside it is answering.
   */
  const threatened = sets
    .filter((r) => r.alive)
    .map((r) => ({ radar: r, etaS: armTimeToImpact(world, r) }))
    .filter((t) => Number.isFinite(t.etaS))
    .sort((a, b) => a.etaS - b.etaS)[0] ?? null;
  const setName = (r) => (sets.length < 2 ? '' : r.id === site.fcRadarId ? 'FC' : 'ACQ');

  const envelopeValue = !track ? '—'
    : status.inEnvelope ? `${Math.round(status.rangeKm)} km`
      : status.timeToRangeS !== null ? `+${Math.ceil(status.timeToRangeS)}s`
        : STATUS.noSolution.en;

  const row = (entry, value, mood = '') =>
    `<div class="crew-row ${mood}">${legend(entry, { inline: true })}<b>${esc(value)}</b></div>`;

  /*
   * One advisory line, in one place, at one height.
   *
   * With nothing selected the card used to say the same thing three times in
   * three treatments — TARGET —, then NO TARGET DESIGNATED wearing the
   * envelope row's label, then a shouted NO TARGET SELECTED — PICK A CONTACT
   * — in a column where the DISPLACE cap did not fit. With the antennas gone
   * it said DESTROYED three times across two lines. One line, highest
   * priority wins, and the slot keeps its height when there is nothing to say.
   */
  const advisory = !site.alive
    ? { text: 'THIS BATTERY HAS BEEN DESTROYED', mood: 'is-bad' }
    : displacing
      // The clock for this is on the banner, and only on the banner: the card
      // used to print the same countdown three times — banner, advisory and
      // rail row — three figures of the same number in forty pixels.
      ? { text: 'ON THE MOVE — CANNOT SEE, GUIDE OR FIRE', mood: 'is-warn' }
      : wrecked
        ? { text: `${guidanceSet.label} DESTROYED — CANNOT GUIDE A MISSILE`, mood: 'is-bad' }
        : unfit
          ? { text: `CANNOT LOCK ${track.tn} — ${refusalText(unfit)}`, mood: 'is-warn' }
          /*
           * A casualty is news, and it belongs on the line the card keeps for
           * news. It had a readout row of its own reading CREW CLOSED UP for
           * the whole of every watch that went well — twenty pixels of the one
           * column whose channel table and kill estimate were being cut off by
           * the bottom of the panel, to say that nothing had happened.
           */
          : site.crewLosses
            ? { text: `${STATUS.crew.en} — ${site.crewLosses} LOST`, mood: 'is-bad' }
            : !track
            // Short enough to be read. The full sentence was 358 px of advice
            // in a 302 px slot at both reference widths, so the one
            // instruction the panel gives ended in an ellipsis every time.
              ? { text: 'NO TARGET — PICK A CONTACT', mood: 'is-quiet' }
              : { text: '', mood: 'is-quiet' };

  /*
   * The loaders, always on the panel whether they are working or not.
   *
   * The bar used to be emitted only while something was happening, which made
   * it one more optional row shoving the launch cap down the card the moment
   * the operator sent the crew out. It holds its place now and says what the
   * loaders are doing, which on a quiet rack is nothing.
   */
  const loaders = site.reloadRemainingS > 0
    ? { label: `${STATUS.loading.en} ${Math.ceil(site.reloadRemainingS)}s`,
      frac: clamp01(1 - site.reloadRemainingS / Math.max(railLoadS(site), 1e-6)),
      mood: 'is-warn' }
    : { label: site.magazine <= 0 ? 'NONE LEFT TO LOAD' : 'LOADERS IDLE', frac: 0,
      mood: site.magazine <= 0 ? 'is-empty' : '' };

  /*
   * The battery's condition, in one strip, with one clock.
   *
   * Always drawn — IN ACTION for most of a watch — because a banner that
   * appears only when the position is hurt is a banner that shoves every
   * control under it thirty pixels down the card at the exact moment the
   * operator is reaching for one. The displacement clock lives here and
   * nowhere else, and the strip's own underline is the progress bar for it,
   * which is why there is no orphan stub of a rule further down the card.
   */
  const condition = !site.alive
    ? { entry: STATUS.destroyed, mood: 'is-bad', figure: '', frac: 0 }
    : displacing
      ? { entry: STATUS.outOfAction, mood: 'is-warn',
        figure: `${Math.ceil(site.scootRemainingS)}s`,
        frac: clamp01(1 - site.scootRemainingS
          / Math.max(type.scootS * (site.scootMult ?? 1) * 1.5, 1e-6)) }
      : wrecked
        ? { entry: STATUS.antennasGone, mood: 'is-bad', figure: '', frac: 0 }
        // The right-hand figure is the battery's emissions, stated rather than
        // commanded: ON THE AIR / SILENT, not the verb engraved on the switch
        // at the foot of the card, which would be the same word twice.
        : { entry: STATUS.inAction, mood: '', frac: 0,
          figure: radar?.on ? 'ON THE AIR' : 'SILENT' };

  const lockEntry = own ? CONTROLS.breakOff : CONTROLS.lock;
  const railCount = railsOf(site);

  paint(els.crewConsole, `
    <div class="unit cabin ${displacing ? 'is-displacing' : ''} ${!site.alive ? 'is-dead' : ''}">
      <span class="screw a"></span><span class="screw b"></span>

      ${/*
     * The seat says whose it is.
     *
     * The card used to be a second copy of the rack's battery card with no
     * heading at all, directly under the rack's own copy of the same battery
     * — on a single-battery watch the right-hand column showed LANCE EAST
     * twice, and the copy wearing the bright selection border was the one
     * that was clipped mid-button. The rack no longer carries the crewed
     * battery (see renderBatteries); this is titled, and framed as the one
     * thing on the panel the operator's hands are on.
     */ ''}
      <div class="cabin-head">
        <span class="cabin-station">${esc(STATUS.yourSeat.en)}</span>
        <span class="unit-name">${esc(site.name)}</span>
        ${/*
       * The nomenclature plate, with the model number printed once.
       *
       * `pair()` gives С-200 «БАСТИОН» · S-200 BASTION — thirty characters, of
       * which the first five are the same figure in two alphabets, and at the
       * reference width it ran sixteen pixels past the card and ellipsised its
       * own English gloss away. The Cyrillic stencil is what a plate is for;
       * the gloss only has to carry the name.
       */ ''}
        <span class="unit-type is-plate"
          title="${esc(nomenclature ? pair(nomenclature) : type.label)}"
          >${esc(nomenclature
    ? `${nomenclature.tm} · ${nomenclature.en.replace(/^[A-ZА-Я0-9-]+\s+/, '')}`
    : type.label)}</span>
      </div>

      ${/*
     * English, on its own.
     *
     * The strip is a live readout that changes four times a watch, not a plate
     * bolted to the frame, and the player's rule is that the Cyrillic lives on
     * the plates — the card's head carries this battery's, two rows up. It is
     * also the only way this line is legible: at ten pixels bold the stencil's
     * О and Ю are drawn wider than their advance and ran into each other.
     */ ''}
      <div class="cabin-banner ${condition.mood}">
        <span class="cond-name">${esc(condition.entry.en)}</span>
        <b>${esc(condition.figure)}</b>
        <span class="banner-bar" style="width:${Math.round(condition.frac * 100)}%"></span>
      </div>

      ${/*
     * The annunciators are above the scroller, not in it.
     *
     * They are the console's primary status; a lamp you have to scroll to is
     * not an annunciator. Four seated lamps on a fixed 2x2 pitch, in the same
     * two columns as the command pad at the foot of the card.
     */ ''}
      <div class="cabin-lamps">
        ${lamp(STATUS.ready, status.state === 'ready', { colour: 'green' })}
        ${lamp(STATUS.guiding, status.guidance === 'GUIDING', { colour: 'green' })}
        ${lamp(STATUS.noGuidance, status.guidance === 'NO GUIDANCE', { colour: 'amber' })}
        ${lamp(STATUS.armWarning, !!threatened, { colour: 'red', blinking: true,
    figure: threatened
      ? `${setName(threatened.radar) ? `${setName(threatened.radar)} ` : ''}${Math.ceil(threatened.etaS)}s`
      : '',
    title: threatened
      ? `A round is homing on ${threatened.radar.label} — ${Math.ceil(threatened.etaS)}s to impact`
      : `${STATUS.armWarning.en} — lights when ${STATUS.armWarning.hint}` })}
      </div>

      ${/*
     * The channel table: what the launcher is holding, one row per channel.
     *
     * The card used to state its channels as the fraction 2/2 beside a TARGET
     * row about whichever contact the mouse had last touched, so a battery
     * guiding two rounds could read TARGET —, SEQUENCE STANDBY, CHANNELS 2/2
     * all at once — three rows disagreeing about one battery. The channels ARE
     * the targets and the sequence: one row each, the worked one marked with a
     * caret.
     *
     * It is exactly as tall as the battery has channels. Ruled to a fixed six
     * rows it left a hundred and fifty pixels of empty ruled void inside a
     * bordered box on a two-channel battery, and on a four-channel battery at
     * 1280 it was the readout that got cut off. The slack belongs below the
     * instrument, as panel metal, not inside it as blank staves — and it
     * cannot move the controls, because the command pad is not in the
     * scroller.
     *
     * It is above the scroller for the same reason the lamps are: this is the
     * instrument the seat works, and REACH and CREW are reference data. When
     * the column runs short it is the reference that goes under the fold.
     */ ''}
      <div class="chan-block">
        <div class="chan-head">
          ${legend(STATUS.channels, { inline: true })}
          <span class="chan-count">${status.channelsUsed}/${status.channels}</span>
        </div>
        <div class="chan-rows">${channels.map((c) => channelRow(c, track?.id)).join('')}</div>
      </div>

      <div class="cabin-body">
        ${/*
       * Which contact every row below this one is about.
       *
       * Without it the readouts were a second opinion: OUT OF ZONE +20s and
       * EST. KILL PROB — printed directly under a channel row reading T-002
       * READY 46 km, two true statements about two different aeroplanes with
       * nothing saying so. The row names the contact and where it came from —
       * the operator's own selection, or the channel the launcher is working
       * when they have not selected anything.
       */ ''}
        ${row(STATUS.target, !track ? '—'
    : `${track.tn} · ${own ? `CH ${own.channel ?? channels.find((c) => c.trackId === track.id)?.channel ?? ''}`.trim()
      : selected ? 'SELECTED' : 'CUED'}`,
    track ? own ? 'is-good' : '' : 'is-dim')}
        ${row(status.inEnvelope ? STATUS.inEnvelope : STATUS.outOfZone, envelopeValue,
    status.inEnvelope ? 'is-good' : '')}
        ${row(STATUS.shotQuality, status.pkEstimate !== null
    ? `${Math.round(status.pkEstimate * 100)}%` : '—',
    status.pkEstimate !== null && status.pkEstimate >= 0.5 ? 'is-good' : '')}
        ${status.fc ? row(STATUS.fireControl,
    `${String(status.fc.boresightDeg).padStart(3, '0')}° ± ${status.fc.fovDeg / 2}°`
      + (track ? status.fc.onTarget ? ' · ON TARGET' : ` · SLEWING ${Math.ceil(status.fc.slewS)}s` : ''),
    track && status.fc.onTarget ? 'is-good' : track ? 'is-hot' : '') : ''}

        ${/*
       * One exposure row per antenna, on the same row pitch as every other
       * readout. As a single packed strip — a label, two sub-labels, two bars
       * and two figures in one fifteen-pixel line — it was the one row on the
       * card that was off the grid and the one nobody could read.
       */ ''}
        ${!caps.exposure ? '' : sets.map((r) => `<div class="crew-row is-gauge"
          title="${esc(r.label)} — ${esc(STATUS.exposure.hint ?? '')}">
          <span class="lg"><b>${esc(STATUS.exposure.en)}${setName(r) ? ` ${setName(r)}` : ''}</b></span>
          <span class="gauge ${!r.alive ? '' : (r.exposure ?? 0) > 0.65 ? 'is-hot'
    : (r.exposure ?? 0) > 0.35 ? 'is-warn' : ''}">
            <i style="width:${r.alive ? Math.round((r.exposure ?? 0) * 100) : 0}%"></i></span>
          <b>${r.alive ? `${Math.round((r.exposure ?? 0) * 100)}%` : '✕'}</b>
        </div>`).join('')}

        ${/*
       * What this equipment can do at all: the box it can kill inside, as one
       * row of engraved reference at the foot of the readouts. It was two rows
       * — REACH and ALTITUDE — saying one thing, in the column whose channel
       * table was being cut off by the bottom of the panel.
       */ ''}
        <div class="crew-row is-plain">${legend(STATUS.reach, { inline: true })}
          <b>${type.minRangeKm}–${type.maxRangeKm} km · ${Math.round(type.minAltM)}–${Math.round(type.maxAltM).toLocaleString('en-US')} m</b></div>
      </div>

      ${/*
     * More card below the fold. The scroller's height is snapped to the row
     * pitch after the paint, so the cut can only land between rows — the fade
     * that was here instead sliced the REACH row through the middle of its
     * glyphs under this very cue.
     */ ''}
      <div class="cabin-more"><em>SCROLL FOR MORE ▾</em></div>

      ${/*
     * The plates, in the slack, hard against the command rule.
     *
     * A tall panel — a single-battery watch at the reference size leaves the
     * seat two hundred and forty spare pixels — used to answer with a field of
     * black between the last readout and the caps: a rendering hole where a
     * built object has stampings. This block is the card's only flexible
     * element: it is nothing at all when the column is tight and it fills the
     * slack when there is any, so the emptiness is always at the TOP of it,
     * where a blank field of painted steel is what a panel actually looks
     * like.
     *
     * It is also where the works plate belongs. In the scope bezel's
     * ninety-eight-pixel gutter it broke to one word a line — ЗАВОД ИМ. /
     * КОРНЕЛА / KORNEL WORKS down a column — and that gutter did not exist at
     * all below 1400px, so the seat's furniture changed identity between the
     * two reference viewports. Here it has three hundred pixels and sets on
     * one line, at every width the cabin is drawn at.
     */ ''}
      <div class="cabin-plates">
        <span class="data-plate">${esc(PLATES.factory.tm)} · ${esc(PLATES.factory.en)}
          &nbsp;·&nbsp; ${esc(PLATES.works.tm)}</span>
        <span class="placard">${esc(PLATES.caution.tm)}<br>${esc(PLATES.caution.en)}</span>
      </div>

      ${/*
     * The command pad: one grid, equal cells, in engagement order.
     *
     * It was a flex-wrap row of four objects at four sizes whose widths were
     * set by the length of their captions — LOCK 58px wide and 55 tall,
     * SILENCE a different shape on a different baseline, RELOAD 86 by 48, and
     * DISPLACE wide enough to wrap onto a line of its own — with LOCK, the
     * second control of the engagement, rendered UNDER the launch cap. The
     * sequence is designate, lock, launch; the pad reads in that order, on one
     * pitch, and it is pinned to the foot of the card so it is where it was
     * last time whatever the readouts above are doing.
     */ ''}
      <div class="cabin-commands">
        <div class="cabin-advisory ${advisory.mood}">
          <span>${esc(advisory.text) || '&nbsp;'}</span>
        </div>

        <div class="cabin-ammo ${loaders.mood}">
          <span class="ammo-label">${esc(STATUS.rails.en)}</span>
          ${tubes(site)}
          <b>${site.readyRounds}/${railCount}</b>
          <span class="ammo-work">${esc(loaders.label)}</span>
          ${/*
       * The store, as one object: its label and its figure wrap together or
       * not at all. As two flex items the row could break between them —
       * measured with the loaders out at 1600: IN STORE at the end of the
       * first line and 17 alone at the start of the second.
       */ ''}
          <span class="ammo-mag" title="${esc(STATUS.magazine.hint)}">
            <span class="ammo-label">${esc(STATUS.magazine.en)}</span>
            <b class="ammo-store">${site.magazine}</b></span>
          ${/*
       * The loaders' clock as a hairline under the rail lamps rather than as
       * a row of its own that comes and goes. Every row that appeared when
       * the crew went out used to shove the launch cap and LOCK down the card
       * by its own height — measured, 41 px across one engagement, which is
       * most of a cap — so the bar is always drawn and simply has nothing in
       * it when the loaders are stowed. It counts the LOADERS and nothing
       * else: with the displacement clock in it too, a battery on the road
       * drew a ninety-pixel unlabelled stub of a rule here that read as a
       * stray hairline, next to a rail row saying the same seconds again.
       */ ''}
          <span class="ammo-bar"><i style="width:${Math.round(loaders.frac * 100)}%"></i></span>
        </div>

        <div class="cabin-pad">
          ${press(lockEntry, { act: 'lock', site: site.id, track: track?.id, key: 'L',
    extra: own ? 'pb-breakoff' : '',
    disabled: !site.alive || displacing || (!own && (!!unfit || !track)),
    title: own ? `Let ${track.tn} go and free the channel`
      : unfit ? `Cannot lock: ${refusalText(unfit)}` : 'Lock a fire-control channel onto the selected contact' })}
          ${press(CONTROLS.reload, { act: 'reload', site: site.id, key: 'R',
    disabled: !canStartLoading(world, site),
    title: canStartLoading(world, site) ? 'Loaders out — fill the rails now'
      : site.magazine <= 0 ? 'Nothing left in store to load'
        : site.readyRounds >= railCount ? 'The rails are full'
          : displacing ? 'Not while the battery is on the road' : 'The loaders are already out' })}

          ${/*
       * The launch cap, and nothing else on this panel is allowed to look
       * like it. It keeps its legend in every state — the countdown that
       * used to replace it lives on the cap's own second line and on the
       * channel row — and it states ARMED with a border and an ink colour
       * as well as with the halo, because the halo is an animation and a
       * player with reduced motion set was being shown a cold cap and a
       * live one as the same pixels.
       */ ''}
          <button class="${['pb', 'pb-fire', status.canFire ? 'is-armed' : '',
    status.canFire && status.pkEstimate !== null && status.pkEstimate < 0.5 ? 'is-marginal' : '',
    // A cap on a battery that is on the road or wrecked is dead metal, not a
    // red cap that happens to be disabled: it was the loudest object on the
    // panel while the banner above it said OUT OF ACTION.
    !site.alive || displacing ? 'is-safed' : ''].filter(Boolean).join(' ')}"
            id="btn-fire" data-act="fire" data-site="${site.id}"
            ${track ? `data-track="${esc(track.id)}"` : ''}
            title="${esc(fireCapNote(site, status, unfit, !track))}"
            ${status.canFire ? '' : 'disabled'}>
            ${legend(CONTROLS.launch, { key: 'F', sub: fireCapNote(site, status, unfit, !track) })}
          </button>

          <div class="cabin-emcon">
            ${switch2(CONTROLS.radiate, CONTROLS.silence, !!radar?.on,
    { act: 'emcon', site: site.id, key: 'A', extra: 'sw-primary',
      disabled: !radar?.alive || displacing })}
          </div>
          ${!caps.displace ? '' : press(CONTROLS.displace, { act: 'scoot', site: site.id, key: 'X',
    extra: 'pb-scoot', disabled: !site.alive || displacing,
    title: displacing ? 'Already on the road' : 'Strike the position and move — sixty seconds off the air' })}
        </div>
      </div>
    </div>`);

  /*
   * Cut the readouts between rows, and say when there is more below.
   *
   * The readouts scroll and the commands do not, which is the right way round
   * — but a scroller with no scrollbar (Chromium draws an overlay one, or none
   * at all) and no edge treatment is exactly how the seat used to hide its own
   * DISPLACE cap. The cue was a fade, and a fade over an arbitrary cut greys
   * out half a row: measured on the two-set watch, REACH sliced horizontally
   * through the middle of its glyphs underneath SCROLL FOR MORE.
   *
   * Every child of the scroller is exactly one row tall, so flooring its
   * height to the row pitch puts the cut on a row boundary and the last
   * visible readout is always whole. The slack — under twenty pixels — goes
   * above the command pad, which stays where it is.
   *
   * Measured after the paint, because only the browser knows whether this
   * battery's channel table and exposure rows fit today; and skipped entirely
   * where the stylesheet has said this console does not scroll at all, which
   * is the phone, where the whole right-hand panel scrolls instead.
   */
  /*
   * A plate is whole or it is not there.
   *
   * The stampings live in the card's slack, which on a laptop with four
   * channels up is thirty pixels — and a thirty-pixel window on a forty-four
   * pixel block showed the bottom two thirds of a red caution placard sliced
   * horizontally through its own first line, directly under the REACH row.
   * The block's height is set by the flex layout and does not depend on
   * whether its contents are drawn, so this cannot oscillate.
   */
  const plates = els.crewConsole.querySelector('.cabin-plates');
  if (plates) plates.classList.toggle('is-fitted', plates.clientHeight >= 56);

  const body = els.crewConsole.querySelector('.cabin-body');
  if (body) {
    if (getComputedStyle(body).overflowY === 'visible') {
      body.style.maxHeight = '';
      body.classList.remove('is-overflowing');
    } else {
      const pitch = parseFloat(getComputedStyle(body).getPropertyValue('--cab-row')) || 20;
      body.style.maxHeight = '';
      const free = body.clientHeight;
      const snapped = Math.max(pitch, Math.floor(free / pitch) * pitch);
      if (snapped < free) body.style.maxHeight = `${snapped}px`;
      body.classList.toggle('is-overflowing', body.scrollHeight - body.clientHeight > 2);
    }
  }
}

/* ------------------------------------------------------------ thumb rail */

/**
 * The verbs of the watch, on the glass, for a hand with no keyboard.
 *
 * At phone widths the picture panel is gone and the rack is a third of a short
 * screen that scrolls, so the launch cap was off the bottom of a scroller in
 * portrait and off the screen entirely in landscape — there was no way to fire
 * a round with a finger. Two of the seat's verbs were worse than that: stepping
 * the board and handing a contact over existed only as arrow keys and Shift+1,
 * which on a phone is not slow, it is impossible.
 *
 * This is those verbs, docked above the ticker, never scrolling, thumb-sized.
 * It is built at every width and hidden by the stylesheet above 900px, so the
 * same console grows one when the window is narrowed and loses it when it is
 * widened, and nothing else on the page has to know.
 *
 * The emissions control is a two-position switch here as it is everywhere else:
 * up is RADIATE, down is SILENCE, both engraved, one press to throw.
 */
export function renderActionBar(world, ui, els, cabin) {
  const host = els.actionBar;
  if (!host) return;
  host.hidden = false;
  // Whether this console has a rail is the stylesheet's decision, and the
  // stylesheet's answer is read back off the box rather than duplicated as a
  // breakpoint here: a console that is not showing one is not asked to build
  // one eight times a second.
  if (host.offsetParent === null) return;

  const crewed = cabin ? world.siteById.get(world.control.crewedBatteryId) : null;
  const track = ui.selectedTrackId ? world.tracks.get(ui.selectedTrackId) : null;

  // What the rail says it is pointed at. A rail whose caps act on "the
  // selection" has to print the selection, or it is four unlabelled verbs.
  const aimed = track ? `${track.tn} ${track.classification === 'unknown'
    ? track.hostility.toUpperCase() : String(track.classification).toUpperCase()}`
    : 'NO CONTACT SELECTED';

  const caps = [];
  // Live only when there is a row on this seat's list to step to — the
  // cabin's list fills later than the sector's, and a cap that lights before
  // it can do anything is a cap a thumb learns to distrust.
  caps.push(press(CONTROLS.nextTarget, {
    act: 'step-target', disabled: seatPicture(world, ui).length === 0,
    title: 'Step to the next contact on the board',
  }));

  if (crewed) {
    /*
     * The rail's caps are the cabin's caps: same verbs, same contact, same
     * refusals. The contact is the cabin's own — the selection, or the channel
     * the battery is working when there is no selection — so a thumb that has
     * selected nothing can still fire the shot the launcher already has.
     */
    const railChannel = track ? null
      : channelStatus(world, crewed).find((c) => !c.free && !c.lost);
    const aim = track ?? (railChannel ? world.tracks.get(railChannel.trackId) : null);
    const status = engagementStatus(world, crewed, aim);
    const own = aim ? crewed.engagements.find((e) => e.trackId === aim.id) : null;
    const unfit = aim && crewed.alive && !own ? cannotEngageReason(world, crewed, aim) : null;
    caps.push(press(own ? CONTROLS.breakOff : CONTROLS.lock, {
      act: 'lock', site: crewed.id, track: aim?.id,
      extra: own ? 'pb-breakoff' : '',
      disabled: !own && (!!unfit || !aim),
      title: own ? `Let ${aim.tn} go and free the channel`
        : unfit ? `Cannot lock: ${unfit}` : 'Lock a fire-control channel onto the selected contact',
    }));
    caps.push(press(CONTROLS.launch, {
      act: 'fire', site: crewed.id, track: aim?.id, disabled: !status.canFire,
      extra: `pb-fire pb-rail${status.canFire ? ' is-armed' : ''}`,
      title: fireCapNote(crewed, status, unfit, !aim),
    }));
  } else {
    /*
     * The net seat's launch is an assignment: the batteries fire themselves,
     * and handing a contact to one is the decision. The cap names the battery
     * it will hand it to, which is the card the rack is highlighting.
     */
    const target = batteryOrder(world).find((s) => s.id === ui.selectedSiteId)
      ?? batteryOrder(world).find((s) => s.id === world.homeBatteryId)
      ?? world.sites[0];
    const already = target && track
      && target.engagements.some((en) => en.trackId === track.id);
    caps.push(press(
      { tm: CONTROLS.assign.tm, en: already ? 'RELEASE' : CONTROLS.assign.en },
      {
        act: 'assign', site: target?.id, disabled: !track || !target,
        // Only the cap that COMMITS a battery wears the committing colour;
        // taking one off again is an ordinary cap.
        extra: already ? 'pb-rail' : 'pb-fire pb-rail',
        title: target ? `${already ? 'Take' : 'Hand'} the selected contact `
          + `${already ? 'off' : 'to'} ${target.name}` : 'No battery on your net',
      },
    ));
  }

  const radar = crewed ? world.radarsOf(crewed).find((r) => r.alive)
    : world.radars.filter((r) => !r.siteId && r.alive)[0];
  if (radar) {
    caps.push(switch2(CONTROLS.radiate, CONTROLS.silence, !!radar.on, crewed
      ? { act: 'emcon', site: crewed.id, disabled: !crewed.alive }
      : { act: 'emcon-radar', radar: radar.id }));
  }

  /*
   * The seat, on a watch that has two.
   *
   * The commander's seat toggle lives in the topbar, and the phone does not
   * draw that part of the topbar — measured at 390x844 and 844x390 on the
   * two-seat watch, the toggle was 0x0 — so from the net view there was no
   * way to the cabin, which is the only view with a LAUNCH cap. A narrow cap
   * at the end of the rail, sized to its two words rather than sharing the
   * row equally, so NEXT TARGET, LOCK, LAUNCH and the switch keep their
   * width. Whether the watch has two seats is the topbar toggle's own
   * answer, read off it rather than duplicated here.
   */
  if (els.viewToggle && !els.viewToggle.hidden) {
    const entry = cabin ? CONTROLS.seatNet : CONTROLS.seatCabin;
    caps.push(press(entry, { act: 'seat', extra: 'pb-seat', title: entry.hint }));
  }

  paint(host, `<div class="ab-aim"><label>SELECTED</label><b>${esc(aimed)}</b></div>
    <div class="ab-caps">${caps.join('')}</div>`);
}

/* ------------------------------------------------------------ event log */

export function renderEventLog(world, els, state) {
  // Keyed on event seq, not array index — the list is capped, and an index
  // comparison freezes the ticker for good the moment the cap is reached.
  const from = state.lastEventSeq ?? 0;
  const fresh = world.events.filter((e) => e.seq > from);
  if (!fresh.length) return;
  state.lastEventSeq = fresh[fresh.length - 1].seq;

  // The `personal` flag marks the handful of lines that are about the
  // operator's own street — written by the engine since the first build and
  // consumed nowhere until now.
  const html = fresh.map((e) => `<li class="kind-${e.kind}${e.personal ? ' is-personal' : ''}">
      <span class="t">${clockString(e.t)}</span><span>${esc(e.text)}</span></li>`).join('');
  els.eventLog.insertAdjacentHTML('beforeend', html);

  while (els.eventLog.children.length > 120) els.eventLog.firstElementChild.remove();
  els.eventLog.scrollTop = els.eventLog.scrollHeight;
}

/* ---------------------------------------------------------- command net */

/**
 * Keep the side panels clear of the banner that floats over them.
 *
 * The command net is deliberately an overlay — a directive that grew the
 * footer used to shrink the stage and rescale the whole picture mid-watch —
 * but it is a full-width overlay, so it also sat on top of the bottom forty-odd
 * pixels of the rack. Measured with the weasel raid paused and a directive up:
 * four of a hundred presses on real caps landed on the banner instead, with
 * nothing to tell the operator why the cap they were pressing did nothing. The
 * banner's own height is handed to the panels as padding, so the last cap on
 * the rack always ends above it; the tube, which is what must not resize, is
 * not touched.
 */
function reserveForNet(els, height) {
  const shell = els.shell ?? document.getElementById('shell');
  if (!shell || shell.dataset.netH === String(height)) return;
  shell.dataset.netH = String(height);
  shell.style.setProperty('--net-h', `${height}px`);
}

export function renderCommandNet(world, els) {
  const directive = world.command.pending;
  if (!directive) {
    els.commandNet.hidden = true;
    reserveForNet(els, 0);
    return;
  }
  els.commandNet.hidden = false;
  if (els.commandText.dataset.uid !== directive.uid) {
    els.commandText.dataset.uid = directive.uid;
    els.commandText.innerHTML = `<span class="command-tag">◈ ${esc(STATUS.commandNet.en)}</span>`
      + esc(directive.text);
  }
  reserveForNet(els, els.commandNet.offsetHeight);
  const left = Math.max(0, directive.deadlineS - world.t);
  els.commandTimer.textContent = `${Math.ceil(left)}s`;
}

/**
 * The English half of a plate entry with its serial dropped: TYPE 4M-2 → TYPE.
 *
 * A plate carries its number once. The gloss is there to say what the number
 * is called, not to reprint it — which is what ЗАВ. № 118-44 over WORKS NO.
 * 118-44 was doing, twice on one plate.
 */
function glossWord(entry) {
  return entry.en.replace(/\s*\S*\d\S*$/, '');
}

/** Range scale positions on the selector, in kilometres. */
export const RANGE_SCALES = [60, 100, 150, 220];

/**
 * The scope's own controls, mounted on the bezel beside the tube: a rotary range
 * selector with real detents, and the plate the factory riveted on.
 *
 * The knob is drawn once and then only its pointer is rotated, so turning it
 * costs a transform rather than a re-render.
 */
export function renderScopeSide(world, ui, els, rangeKm) {
  const index = RANGE_SCALES.indexOf(rangeKm);
  const detent = index >= 0 ? index : RANGE_SCALES.findIndex((r) => r >= rangeKm);
  const angle = -135 + (Math.max(0, detent) / (RANGE_SCALES.length - 1)) * 270;

  if (els.scopeSide.dataset.built !== '1') {
    els.scopeSide.dataset.built = '1';
    els.scopeSide.innerHTML = `
      <div class="knob-group">
        <button class="knob" id="range-knob" title="Range scale — mouse wheel over the scope also works">
          <span class="knob-pointer"></span>
        </button>
      </div>
      ${legend(CONTROLS.range, {})}
      <span class="knob-readout" id="range-readout"></span>
      ${/*
     * The works plate: the figure once, the word for it in both languages.
     * It used to print ТИП 4М-2 / TYPE 4M-2 / ЗАВ. № 118-44 / WORKS NO. 118-44
     * — the same two numbers stamped twice each, which is not a plate, it is a
     * plate photocopied onto itself.
     */ ''}
      <span class="data-plate is-footer">
        <b>${esc(PLATES.type.tm)}</b><br>${esc(glossWord(PLATES.type))}<br>
        <b>${esc(PLATES.works.tm)}</b><br>${esc(glossWord(PLATES.works))}<br>
        ${esc(PLATES.factory.tm)}<br>${esc(PLATES.factory.en)}
      </span>
      <span class="placard">${esc(PLATES.caution.tm)}<br>${esc(PLATES.caution.en)}</span>`;
  }

  const pointer = els.scopeSide.querySelector('.knob-pointer');
  if (pointer) pointer.style.transform = `rotate(${angle}deg)`;
  const readout = els.scopeSide.querySelector('#range-readout');
  if (readout) readout.textContent = `${Math.round(rangeKm)} KM`;
}

/** The boot sequence shown while the console is down. It is not a spinner. */
export function renderBlackout(world, els) {
  const dark = world.dark;
  if (!dark) {
    if (els.scopeOverlay.dataset.mode !== 'clear') {
      els.scopeOverlay.dataset.mode = 'clear';
      els.scopeOverlay.innerHTML = '';
    }
    return;
  }
  if (world.console.destroyed) {
    if (els.scopeOverlay.dataset.mode === 'dead') return;
    els.scopeOverlay.dataset.mode = 'dead';
    els.scopeOverlay.innerHTML = '<div class="huge">POSITION OVERRUN</div>';
    return;
  }
  const remaining = Math.max(0, world.console.rebootUntilS - world.t);
  const lines = [
    'POWER FAULT — TRANSFERRING TO STANDBY BUS',
    `CAUSE: ${world.console.rebootReason ?? 'UNKNOWN'}`,
    'PROCESSOR RESET .......... OK',
    'ANTENNA SERVO ............ CHECK',
    'TRACK STORE .............. RECOVERING',
    `DISPLAY IN ${remaining.toFixed(1)}s`,
  ];
  const show = Math.min(lines.length, Math.ceil((6 - remaining) * 1.2) + 1);
  els.scopeOverlay.dataset.mode = 'boot';
  els.scopeOverlay.innerHTML = `<div class="boot">${lines.slice(0, Math.max(1, show))
    .map((l) => `<div class="line">${esc(l)}</div>`).join('')}</div>`;
}
