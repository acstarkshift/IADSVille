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
import { engagementStatus } from './console.js';
import {
  armTimeToImpact, canStartLoading, channelsFor, railLoadS, railsOf, spanLimit, spanLoad,
} from '../engine/doctrine.js';
import {
  STATE, CONTROLS, POSTURE_CYCLE, STATUS, EQUIPMENT, PLATES, legend, keycap, pair,
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
    els.formationList, els.masterLamps, els.boardState]) {
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
 * an eye. `short` is the same caption for a bar that has run out of room; the
 * topbar's three master lamps carry one and drop to it below 1400px rather
 * than wrapping the cluster onto a second row.
 */
function lamp(entry, lit, { colour = '', blinking = false, caption = null, short = '' } = {}) {
  const classes = ['lamp', lit ? 'is-lit' : '', colour ? `is-${colour}` : '', blinking ? 'blinking' : '']
    .filter(Boolean).join(' ');
  const text = caption ?? entry.en;
  return `<span class="${classes}" title="${esc(`${entry.tm} · ${entry.en}`)}${
    entry.hint ? esc(` — ${entry.hint}`) : ''}">
    <span class="lamp-dome"></span>
    <span class="lamp-cap"><b>${esc(text)}</b>${short ? `<i>${esc(short)}</i>` : ''}</span></span>`;
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
function switch2(up, down, on, { act, site, radar, disabled = false, key = '', extra = '' } = {}) {
  const attrs = [
    act ? `data-act="${act}"` : '',
    site ? `data-site="${site}"` : '',
    radar ? `data-radar="${radar}"` : '',
    disabled ? 'disabled' : '',
  ].filter(Boolean).join(' ');
  const pos = (entry, live) => `<span class="sw-pos ${live ? 'is-on' : ''}">${esc(entry.en)}</span>`;
  return `<button class="sw ${extra}" aria-pressed="${on}" ${attrs}
      title="${esc(up.en)} / ${esc(down.en)} — ${esc((on ? up : down).hint ?? '')}">
    <span class="sw-body"><span class="sw-lever"></span></span>
    <span class="sw-legends">${pos(up, on)}${pos(down, !on)}</span>
    ${keycap(key)}
  </button>`;
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
  return `<span class="tubes" title="${site.readyRounds} of ${capacity} tubes loaded`
    + ` · ${site.magazine} rounds in store">${lamps}</span>`;
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
function press(entry, { act, site, state = '', disabled = false, extra = '', key = '', title = '' } = {}) {
  return `<button class="pb ${extra}" data-act="${act}" ${site ? `data-site="${site}"` : ''}
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
      el.title = `${entry.tm} · ${entry.en}`;
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
  els.fusionState.title = `${fusion.tm} · ${fusion.en}`;
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
   * an L-shaped bar with a dead gutter in it. They carry both captions now and
   * the CSS drops to the short one rather than letting the cluster wrap; the
   * ARM countdown survives the shortening, because it is the most time-critical
   * number on the console.
   */
  paint(els.masterLamps, [
    lamp(STATUS.radiating, anyRadiating, { colour: 'green', short: 'RAD' }),
    lamp(STATUS.armWarning, armInbound, {
      colour: 'red', blinking: true,
      caption: armInbound ? `${STATUS.armWarning.en} ${Math.ceil(soonestArm)}s` : STATUS.armWarning.en,
      short: armInbound ? `ARM ${Math.ceil(soonestArm)}s` : 'ARM',
    }),
    lamp(STATUS.fault, faulted, { colour: 'amber', short: 'FLT' }),
  ].join(''));

  /*
   * Who is sitting here, on one card rather than two.
   *
   * These were two separate plates of different heights, set side by side with
   * their own borders and their own baselines, and the operator's name — the
   * one string on the console that is about the player — was cut off mid-glyph
   * at the edge of its box. One card, two lines on one left margin, the name
   * given the width it needs: rank and name above, the appointment under it.
   */
  if (els.operatorPlate && world.character
    && els.operatorPlate.dataset.name !== world.character.name) {
    els.operatorPlate.dataset.name = world.character.name;
    const rank = rankOf(world.character);
    els.operatorPlate.innerHTML = `<b>${esc(rank.tm)} · ${esc(rank.en)}</b>`
      + `<span class="id-name">${esc(world.character.name)}</span>`;
  }
  if (els.echelonPlate && els.echelonPlate.dataset.echelon !== world.echelon.id) {
    els.echelonPlate.dataset.echelon = world.echelon.id;
    els.echelonPlate.innerHTML = `<b>${esc(world.echelon.appointment.tm)}</b>`
      + `<span>${esc(world.echelon.appointment.en)}</span>`;
    els.echelonPlate.title = `${world.echelon.tm} · ${world.echelon.en}`;
  }
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
  if (site.readyRounds > 0) return { text: `${site.readyRounds} RDY`, cls: '' };
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

export function renderTrackList(world, ui, els) {
  let tracks = sortedTracks(world);

  // In the operator's seat the panel is their battery's picture: what their own
  // radar holds, plus what the net has cued them onto. Seeing the whole sector
  // here would undo the isolation the seat is built around.
  if (ui.view === 'crew' && world.control.crewedBatteryId) {
    const site = world.siteById.get(world.control.crewedBatteryId);
    tracks = tracks.filter((t) => world.radarsOf(site).some((r) => t.sources.includes(r.id))
      || t.assignedTo.includes(site.id));
  }
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
  if (unassigned.length || !tracks.length) {
    sections.push(head('UNPAIRED', unpaired.length ? `${unpaired.length} WITH NOBODY ON THEM` : 'NOTHING WAITING',
      unpaired.some((t) => t.hostility === 'hostile') ? 'is-urgent' : ''));
    sections.push(unpaired.length
      ? unpaired.map(rowFor).join('')
      : `<li class="track-row is-empty" role="presentation"><span>—</span><span>${
        ui.view === 'crew' ? 'nothing held' : 'no contacts'}</span></li>`);
  }
  if (beyond.length) {
    sections.push(head('OUT OF REACH', `${beyond.length} NOTHING OF YOURS CAN TAKE`, 'is-idle'));
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
      : '<li class="track-row is-empty" role="presentation"><span>—</span><span>nothing paired</span></li>');
  }
  if (idle.length && ui.view !== 'crew') {
    sections.push(head('UNCOMMITTED', idle.map((s) => s.name).join(' · '), 'is-idle'));
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
      ${figure('UNPAIRED', unpaired.length, unpaired.length ? 'is-warn' : '')}
      ${figure('PAIRED', paired, paired ? 'is-good' : '')}
      ${figure('ROUNDS UP', roundsUp)}
      ${figure('ARMED', `${armed.length}/${mine.length}`,
    armed.length ? '' : 'is-bad')}
    </div>
    <div class="bs-note">${rails} round${rails === 1 ? '' : 's'} on the rails${(() => {
    const cold = mine.length - armed.length;
    return cold > 0 ? ` · ${cold} ${cold === 1 ? 'battery' : 'batteries'} cannot fire` : '';
  })()}</div>
    ${groundState(world)}`);
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
    els.trackDetail.innerHTML = '<i>Select a contact to see what it is doing.</i>';
    return;
  }
  const asset = track.predictedAssetId ? world.assetById.get(track.predictedAssetId) : null;
  const tti = Number.isFinite(track.ttiS) ? clockString(track.ttiS) : '—';
  const speedKts = Math.round(len(track.vel) * 1943.8);
  const idPct = Math.round(100 * clamp01(track.idProgressS / 26));

  els.trackDetail.innerHTML = `
    <b>${esc(track.tn)}</b> ${esc(track.hostility.toUpperCase())}
    · ${esc(track.classification === 'unknown' ? `ID ${idPct}%` : AIR_TYPES[track.classification]?.name ?? '')}<br>
    ${speedKts} kt · ${Math.round(track.altM)} m · quality ${Math.round(track.quality * 100)}%
    ${track.coasting ? '· <em>COASTING</em>' : ''}<br>
    ${huntsTheFlight(world, track)
    ? `Tracking toward <b>${esc(world.vipAircraft()?.name ?? 'THE STATE AIRCRAFT')}</b>.`
    : asset ? `Tracking toward <b>${esc(asset.label)}</b>, ${tti} out.` : 'No obvious objective.'}
    ${track.assignedTo.length ? `<br>Assigned: <b>${esc(track.assignedTo.map((id) => world.siteById.get(id)?.name).join(', '))}</b>` : ''}`;
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
      <div class="fmn-head">
        <span class="lg"><b>${esc(formation.tm)}</b><i>${esc(formation.en)}</i></span>
        <span class="fmn-state">${esc(
    handover > 0 ? `HANDOVER ${Math.ceil(handover)}s`
      : formation.hq ? 'YOURS'
        : formation.direct ? 'UNDER YOUR HAND'
          : saturated ? 'HANDS FULL'
            : (formation.commander?.name ?? 'SUBORDINATE'))}</span>
      </div>
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
    <div class="fmn-head">
      <span class="lg"><b>STRATEGIC RESERVE</b></span>
      <span class="fmn-state">${world.reserve.rounds} ROUNDS HELD</span>
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

export function renderBatteries(world, ui, els) {
  // One answer for what this watch's console carries, shared with the key map
  // and the handbook. See consoleCaps().
  const caps = consoleCaps(world.scenario);
  const units = batteryOrder(world).map((site, index) => {
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
        <span>✗ CANNOT TAKE ${esc(selectedTrack.tn)} — ${esc(unfit.toUpperCase())}</span>
      </div>` : ''}

      <div class="unit-row">
        ${lamp(STATUS.ready, site.alive && site.readyRounds > 0 && site.scootRemainingS === 0, { colour: 'green' })}
        ${lamp(radar?.state === 'warming' ? STATUS.warming : STATUS.radiating,
    radar?.state === 'radiating' || radar?.state === 'warming',
    { colour: radar?.state === 'warming' ? 'amber' : 'green' })}
        ${lamp(STATUS.armWarning, Number.isFinite(armEta), { colour: 'red', blinking: true,
    caption: Number.isFinite(armEta) ? `${STATUS.armWarning.en} ${Math.ceil(armEta)}s` : STATUS.armWarning.en })}
        ${!site.alive ? lamp(STATUS.fault, true, { colour: 'red' }) : ''}
      </div>

      <div class="unit-row">
        ${tubes(site)}
        <span class="unit-type wrap" title="${esc(DEFENCE_CLASSES[type.class].blurb)}">
          ${esc(DEFENCE_CLASSES[type.class].en)}
        </span>
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
      <div class="unit-row">
        <span class="unit-type wrap">${site.readyRounds}/${site.magazine} ROUNDS
          · ${esc(STATUS.channels.en)} ${site.engagements.length}/${channelsFor(site)}${(() => {
    // The battery's own most anxious number, on the net side too: seconds
    // until its nearest round in flight arrives. The crew console had this;
    // the commander watching four batteries did not.
    const eta = roundEtaFor(world, site);
    return eta !== null ? ` · ${esc(STATUS.inFlight.en)} ${Math.ceil(eta)}s` : '';
  })()}
          <span class="lo">· ${type.minRangeKm}–${type.maxRangeKm} KM · ${Math.round(type.minAltM)}–${Math.round(type.maxAltM).toLocaleString('en-US')} M</span></span>
      </div>
      ${reloadBar(site, type)}

      ${site.emconHold && !crewed ? `<div class="unit-row is-quiet">
        <span class="unit-type wrap">${esc(STATUS.emconHeld.en)} — ${esc(
    site.emconHold === 'silent' ? 'SILENT' : 'RADIATING')} UNTIL YOU SAY OTHERWISE</span>
      </div>` : ''}

      <div class="unit-switches">
        ${switch2(CONTROLS.radiate, CONTROLS.silence, !!radar?.on,
    { act: 'emcon', site: site.id, key: keyed ? 'A' : '', disabled: detached || !anyAlive })}
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
    const nomenclature = Object.values(EQUIPMENT).find((e) => e.en.includes(radar.label));
    const armEta = radar.alive ? armTimeToImpact(world, radar) : Infinity;
    return `<div class="unit" data-radar="${radar.id}">
      <span class="screw ${'abcd'[index % 4]}"></span>
      <div class="unit-head">
        ${/*
       * Callsign first, then the plate — the same head the battery cards have,
       * because the player's rule is that a set has one name everywhere and
       * the tutorial calls this one WIDE EYE. The range figure moved down to
       * the lamp row: it read "449 КМ/KM" — two spellings of one unit — in the
       * most prominent slot on the first card of the rack.
       */ ''}
        <span class="unit-name">${esc(nomenclature?.en ?? radar.label)}</span>
        <span class="unit-type is-plate" title="${esc(nomenclature?.en ?? radar.label)}">
          ${esc(nomenclature ? nomenclature.tm : radar.label)}</span>
      </div>
      ${/*
     * What this set is, read off the set rather than off its range figure.
     * The rule was `rangeKm > 90`, and the gap-filler on the weasel watch
     * reaches 164 km — so the card for П-14 LOW LOOK, the set that exists to
     * see under the big one, described itself as the long-range surveillance
     * picture, word for word, directly under its own nomenclature plate.
     */ ''}
      <div class="unit-explain">${esc(nomenclature === EQUIPMENT.gapfiller
    ? 'Gap-filler radar — covers the low approaches the big set cannot see.'
    : 'Early-warning radar — the long-range surveillance picture. Nothing paints until a set radiates.')}</div>
      <div class="unit-row">
        ${lamp(radar.state === 'warming' ? STATUS.warming : STATUS.radiating,
    radar.state === 'radiating' || radar.state === 'warming',
    { colour: radar.state === 'warming' ? 'amber' : 'green' })}
        ${lamp(STATUS.armWarning, Number.isFinite(armEta), { colour: 'red', blinking: true,
    caption: Number.isFinite(armEta) ? `${STATUS.armWarning.en} ${Math.ceil(armEta)}s` : STATUS.armWarning.en })}
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

  paint(els.batteryList, surveillance + units);
}

/* -------------------------------------------------------- crew console */

/**
 * The operator's own panel: the engagement sequence on the left of their brain,
 * and the "are they about to kill me" numbers on the right.
 */
export function renderCrewConsole(world, ui, els) {
  const site = world.siteById.get(world.control.crewedBatteryId);
  if (!site) { els.crewConsole.hidden = true; return; }
  els.crewConsole.hidden = false;

  const track = ui.selectedTrackId ? world.tracks.get(ui.selectedTrackId) : null;
  const status = engagementStatus(world, site, track);
  const radar = world.radarById.get(site.radarId);
  const armEta = radar?.alive ? armTimeToImpact(world, radar) : Infinity;
  const type = SAM_TYPES[site.type];
  const nomenclature = EQUIPMENT[site.type];
  /*
   * The teaching watch shows the seat, not the trade: displacement and the
   * ELINT game wait until a watch where somebody is actually shooting back.
   * And so does every other watch where nobody is — measured on Solo Battery,
   * not one of its sixteen aircraft carries an anti-radiation round, so the
   * exposure gauge sat pinned at 100% in red from the four-minute mark of
   * three hand-played watches with nothing behind it and the INBOUND ARM lamp
   * never lit once.
   *
   * `consoleCaps` is that whole judgement in one place, and the key map and
   * the handbook read the same answer this card does.
   */
  const caps = consoleCaps(world.scenario);

  const sequence = status.holding ? STATUS.holding : {
    idle: STATUS.standby, reacting: STATUS.preparing, ready: STATUS.ready, guiding: STATUS.inFlight,
  }[status.state] ?? STATUS.standby;

  const envelope = !status.hasTarget ? STATUS.noTarget
    : status.inEnvelope ? STATUS.inEnvelope : STATUS.outOfZone;

  const envelopeDetail = !status.hasTarget ? '—'
    : status.inEnvelope ? `${Math.round(status.rangeKm)} KM`
      : status.timeToRangeS !== null ? `+${Math.ceil(status.timeToRangeS)}s`
        : STATUS.noSolution.en;

  const row = (entry, value, mood = '') =>
    `<div class="crew-row ${mood}">${legend(entry, { inline: true })}<b>${esc(value)}</b></div>`;

  /*
   * Why the lock will not take, said before the operator presses the button.
   * The net seat's battery cards have carried this line for watches; the seat
   * with the LOCK button on it had nothing, so a refused lock was silence and
   * the rule had to be guessed at. There is no hidden rule — you may lock
   * anything this battery can physically engage, whether or not the net
   * assigned it to you — and when you cannot, this says which of the seven
   * reasons it is.
   */
  const unfit = track && site.alive ? cannotEngageReason(world, site, track) : null;
  /*
   * And when the answer is that the antennas are wreckage, say THAT, whether
   * or not a contact happens to be selected. A cabin whose fire-control set
   * had been destroyed showed "NO TARGET SELECTED — PICK A CONTACT" for the
   * rest of the watch, which is advice about the wrong problem given to
   * somebody who has just been bombed. Photographed three minutes apart on
   * two different watches, unchanged both times.
   */
  const guidance = world.radarById.get(site.fcRadarId ?? site.radarId);
  const wrecked = site.alive && guidance && !guidance.alive;
  const noTarget = !track && !wrecked;

  paint(els.crewConsole, `
    <div class="unit is-mine">
      <span class="screw a"></span>
      <div class="unit-head">
        <span class="unit-name">${esc(site.name)}</span>
        <span class="unit-type wrap is-plate" title="${esc(nomenclature?.en ?? type.label)}">
          ${esc(nomenclature ? pair(nomenclature) : type.label)}</span>
      </div>

      <div class="unit-row is-spaced">
        ${lamp(STATUS.ready, status.state === 'ready', { colour: 'green' })}
        ${lamp(STATUS.guiding, status.guidance === 'GUIDING', { colour: 'green' })}
        ${lamp(STATUS.noGuidance, status.guidance !== 'GUIDING', { colour: 'amber' })}
        ${lamp(STATUS.armWarning, Number.isFinite(armEta), { colour: 'red', blinking: true })}
      </div>

      ${row(STATUS.target, status.trackLabel)}
      ${row(envelope, envelopeDetail, status.inEnvelope ? 'is-good' : '')}
      ${status.fc ? row(STATUS.fireControl,
    `${String(status.fc.boresightDeg).padStart(3, '0')}° ± ${status.fc.fovDeg / 2}°`
      + (status.hasTarget ? status.fc.onTarget ? ' · ON TARGET'
        : ` · SLEWING ${Math.ceil(status.fc.slewS)}s` : ''),
    status.hasTarget && status.fc.onTarget ? 'is-good' : status.hasTarget ? 'is-hot' : '') : ''}
      ${status.pkEstimate !== null
    ? row(STATUS.shotQuality, `${Math.round(status.pkEstimate * 100)}%`,
      status.pkEstimate >= 0.5 ? 'is-good' : '')
    : ''}
      ${row(STATUS.sequence, `${sequence.en}${status.reactionRemainingS > 0 ? ` ${status.reactionRemainingS.toFixed(1)}s` : ''}`)}
      ${row(STATUS.channels, `${status.channelsUsed}/${status.channels}`)}
      ${row(CONTROLS.reload, `${site.readyRounds} / ${site.magazine}`)}
      <div class="crew-row crew-tubes">${legend(CONTROLS.launch, { inline: true })}${tubes(site)}</div>
      ${reloadBar(site, type)}

      <button class="pb pb-fire ${status.canFire && (status.pkEstimate === null || status.pkEstimate >= 0.5) ? 'is-armed' : ''}" id="btn-fire"
        ${status.canFire ? '' : 'disabled'}>
        ${status.state === 'guiding'
    ? `<span class="lg"><b>${status.roundsUp} IN FLIGHT</b>${status.roundEtaS !== null ? `<i>${Math.ceil(status.roundEtaS)}s TO INTERCEPT</i>` : ''}</span>`
    : legend(CONTROLS.launch, { key: 'F' })}
      </button>

      ${unfit ? `<div class="unit-row unit-unfit" title="Why this battery cannot take the selected contact">
        <span>✗ CANNOT LOCK ${esc(track.tn)} — ${esc(unfit.toUpperCase())}</span>
      </div>` : ''}
      ${noTarget ? `<div class="unit-row unit-unfit is-quiet">
        <span>NO TARGET SELECTED — PICK A CONTACT ON THE SCOPE OR THE LIST</span>
      </div>` : ''}
      ${wrecked ? `<div class="unit-row unit-unfit">
        <span>${esc(STATUS.antennasGone.en)} — ${esc(guidance.label)} DESTROYED. THIS BATTERY
        CANNOT GUIDE A ROUND.</span>
      </div>` : ''}

      <div class="unit-switches">
        ${switch2(CONTROLS.radiate, CONTROLS.silence, !!radar?.on,
    { act: 'emcon', site: site.id, key: 'A', extra: 'sw-primary', disabled: !radar?.alive })}
      </div>
      <div class="unit-controls">
        ${press(CONTROLS.lock, { act: 'lock', site: site.id, key: 'L', disabled: !!unfit || noTarget })}
        ${press(CONTROLS.reload, { act: 'reload', site: site.id, key: 'R' })}
        ${caps.displace ? press(CONTROLS.displace, { act: 'scoot', site: site.id, key: 'X' }) : ''}
      </div>

      ${caps.exposure ? `<div class="unit-row is-spaced">
        ${legend(STATUS.exposure, { inline: true })}
        <span class="gauge ${(radar?.exposure ?? 0) > 0.65 ? 'is-hot' : (radar?.exposure ?? 0) > 0.35 ? 'is-warn' : ''}">
          <i style="width:${Math.round((radar?.exposure ?? 0) * 100)}%"></i></span>
        <span class="unit-type">${Math.round((radar?.exposure ?? 0) * 100)}%</span>
      </div>` : ''}
      ${site.crewLosses ? `<div class="crew-row is-hot">${legend(STATUS.crew, { inline: true })}
        <b>${site.crewLosses} CASUALTIES</b></div>` : ''}

      <div class="placard">${esc(PLATES.warning.tm)}<br>${esc(PLATES.warning.en)}</div>
    </div>`);
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
