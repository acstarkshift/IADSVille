/**
 * Everything that is not the fight: the mission list, the briefing, the file
 * entry that follows a mission, and the debrief.
 *
 * The briefing and the debrief carry the campaign's voice. The rule they follow
 * is understatement — sector command never threatens anyone directly, it notes
 * things, forwards things, and lists things as under review. A form letter is
 * more frightening than a shouted one, and it keeps the game's menace in a
 * register that stays in good taste.
 */

import { SCENARIOS, isUnlocked, appointmentOf, watchConditions } from '../engine/scenarios.js';
import { ECHELON_ORDER, ECHELONS } from '../engine/echelon.js';
import { DIFFICULTY, ROLES, SAM_TYPES, DEFENCE_CLASSES, ASSET_TYPES } from '../engine/config.js';
import { consequenceFor, briefingNote } from '../engine/campaign.js';
import { tierFor, LEDGER_SUBJECTS } from '../engine/command.js';
import { rankOf, backgroundOf, householdOf, districtOf } from '../engine/character.js';
import { serviceSummary, abandonedRecord, paintFilePhotos } from './dossier.js';
import { STATE } from './lexicon.js';
import { rankInsignia } from './insignia.js';
import { composeEnding, endingSummary } from '../engine/endings.js';
import { composeFlightEnding, flightEndingSummary } from '../engine/epilogue.js';
import { standing as arcStanding } from '../engine/revelations.js';
import { briefLine } from '../engine/family.js';
import { drawEndingStill } from './scenes.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * A rubber stamp's face: the service's own name over its English gloss.
 *
 * The gloss has been in the lexicon all along and the template printed only
 * the Cyrillic half, which is the one thing the house rule on the language
 * does not allow — every Cyrillic string on screen is paired with its English
 * beside it.
 */
const stampFace = (tm, en) => (en
  ? `<span class="tm">${esc(tm)}</span><span class="en">${esc(en)}</span>`
  : `<span class="tm">${esc(tm)}</span>`);

/** Every screen opens at the top of itself, however far the last one scrolled. */
const toTop = (host) => { if (host) host.scrollTop = 0; };

/* ------------------------------------------------------------- title */

export function renderMenu(host, state) {
  const campaign = state.campaign;
  const tier = tierFor(campaign.standing);
  const flown = campaign.history.length;

  const character = campaign.character;
  const rank = character ? rankOf(character) : null;
  const appointment = appointmentOf(campaign);

  /**
   * One watch on the roster.
   *
   * A watch above your appointment is not shown as sealed but as not yet held —
   * the difference matters, because one of those is a secret and the other is
   * simply a job you have not been given. The sealed treatment is reserved for
   * the single scenario whose existence is the surprise.
   */
  const missionCard = (sc) => {
    const done = campaign.completed[sc.id];
    const active = state.missionId === sc.id;
    if (!isUnlocked(sc, campaign)) {
      /*
       * The one watch whose existence is the surprise stays redacted at every
       * appointment until it is genuinely open. It used to be named on the
       * roster in the first minute of a new record — "The President's Flight,
       * above your appointment" — and only blacked out in the tenth hour, once
       * the player held national command and already knew about it.
       */
      const held = sc.requiresEnding
        || ECHELON_ORDER.find((e) => e.id === sc.echelon).order <= appointment.order;
      return held
        ? `<button class="mission is-sealed" disabled>
            <b>▓▓▓▓▓▓▓▓ ▓▓▓▓▓▓</b>
            <small>Not on the roster. This watch has not happened yet.</small>
            <div class="flags"><span class="pill tight">SEALED</span></div>
          </button>`
        : `<button class="mission is-sealed" disabled>
            <b>${esc(sc.name)}</b>
            <small>Above your appointment. You will be given it when you are given it.</small>
            <div class="flags"><span class="pill tight">NOT YOUR COMMAND</span></div>
          </button>`;
    }
    return `<button class="mission ${active ? 'is-active' : ''}" data-mission="${sc.id}">
        <b>${esc(sc.name)}</b>
        <small>${esc(sc.subtitle)}</small>
        <div class="flags">
          ${sc.roles.length === 1 ? `<span class="pill tight">${esc(ROLES[sc.roles[0]].label)} ONLY</span>` : ''}
          ${done ? `<span class="pill free">BEST ${done.score}</span>` : ''}
        </div>
      </button>`;
  };

  host.innerHTML = `<div class="screen-inner">
    <h1 class="title">IADSVILLE</h1>
    <p class="subtitle">${esc(STATE.country.en)} · ${esc(STATE.service.en)} · SECTOR 4-B</p>

    <div class="card">
      <p>You are an air defence conscript in the second year of a war with the Federation, across
      the northern frontier. You sit eleven kilometres from the village you grew up in, and
      tonight's raid is coming down your valley.</p>
      <p>Your radars can only see while they are transmitting, and everything that can see you is
      listening for exactly that. You have more contacts than rounds, and sector command reads
      your log in the morning.</p>
    </div>

    <div class="card record-card">
      <div class="record-stamp">${stampFace(tier.label)}</div>
      <h3>Personnel file</h3>
      ${character ? `<div class="ident-row">
        <span class="ident-board">${rankInsignia(character.rankIndex, { size: 40 })}</span>
        <span class="ident-name"><b>${esc(rank.en)} ${esc(character.name)}</b>
          <small>${esc(appointment.appointment.en)}</small></span>
      </div>` : ''}
      <div class="score-grid">
        <div class="score-cell is-word"><label>RANK</label><b>${esc(rank?.en ?? '—')}</b></div>
        <div class="score-cell is-word"><label>APPOINTMENT</label>
          <b>${esc(appointment.appointment.en)}</b></div>
        <div class="score-cell"><label>STANDING</label><b>${Math.round(campaign.standing)}</b></div>
        <div class="score-cell"><label>EXPERIENCE</label><b>${character?.xp ?? 0}</b></div>
        <div class="score-cell"><label>WATCHES</label><b>${flown}</b></div>
        <div class="score-cell ${character?.points ? 'is-good' : ''}"><label>TRAINING</label><b>${character?.points ?? 0}</b></div>
        <div class="score-cell is-word ${character?.wounded ? 'is-bad' : ''}"><label>CONDITION</label>
          <b>${character?.wounded ? 'INJURED' : 'FIT'}</b></div>
      </div>
      ${campaign.ending ? `<p class="verdict grave">
        <b>${esc(endingSummary(campaign.ending) ?? '')}</b> — the last watch has been stood.</p>` : ''}
      ${campaign.epilogue ? `<p class="verdict grave">
        <b>${esc(flightEndingSummary(campaign.epilogue) ?? '')}</b> — and what happened two days after it.</p>` : ''}
      ${character ? `<p class="note verdict">
        ${esc(backgroundOf(character).en)}. Home: the Ville, in the western valley.
        Household: ${esc(householdOf(character).en.replace(/^Your /, 'your '))}.
        ${character.decorations.length ? `${character.decorations.length} decoration${character.decorations.length > 1 ? 's' : ''} on file.` : ''}
        ${character.points ? '<b class="urgent">Training points unspent.</b>' : ''}</p>` : ''}
    </div>

    <div class="card">
      <h3>Select a watch</h3>
      <p class="lede">
        You hold the appointment of <b class="urgent">${esc(appointment.appointment.en.toLowerCase())}</b>.
        ${esc(appointment.blurb)}</p>
      ${ECHELON_ORDER.map((echelon) => {
    const watches = SCENARIOS.filter((sc) => sc.echelon === echelon.id);
    if (!watches.length) return '';
    const reached = echelon.order <= appointment.order;
    return `<div class="act ${reached ? '' : 'is-locked'}">
          <div class="act-head">
            <span class="lg"><b>${esc(echelon.heading)}</b></span>
            <span>${reached ? esc(echelon.teaches) : 'Not yet held.'}</span>
          </div>
          <div class="mission-grid">${watches.map(missionCard).join('')}</div>
        </div>`;
  }).join('')}
    </div>


    <div class="card">
      <h3>Seat</h3>
      <div class="choice-row" id="role-row">
        ${Object.values(ROLES).map((role) => {
    const allowed = state.mission.roles.includes(role.id);
    return `<button class="choice ${state.role === role.id ? 'is-active' : ''}"
            data-role="${role.id}" ${allowed ? '' : 'disabled'}>
            <b>${esc(role.label)}</b><small>${esc(role.blurb)}</small>
          </button>`;
  }).join('')}
      </div>
      ${state.role !== 'net' ? `<div class="toggle-row">
        <span>Battery:</span>
        <select id="battery-pick" class="btn">
          ${state.mission.sites.map((s) => `<option value="${s.id}" ${state.batteryId === s.id ? 'selected' : ''}>
            ${esc(s.name ?? s.id)} — ${esc(SAM_TYPES[s.type].label)},
            ${esc(DEFENCE_CLASSES[SAM_TYPES[s.type].class].en.toLowerCase())} (${SAM_TYPES[s.type].maxRangeKm} km)
          </option>`).join('')}
        </select>
      </div>` : ''}
    </div>

    <div class="card">
      <h3>Difficulty</h3>
      <div class="choice-row" id="difficulty-row">
        ${Object.values(DIFFICULTY).map((d) => `<button class="choice ${state.difficulty === d.id ? 'is-active' : ''}" data-difficulty="${d.id}">
          <b>${esc(d.label)}${d.recommended ? ' ★' : ''}</b><small>${esc(d.blurb)}</small>
        </button>`).join('')}
      </div>
      <div class="toggle-row">
        <label><input type="checkbox" id="opt-pressure" ${state.narrativePressure ? 'checked' : ''}> Narrative pressure</label>
        <span class="note">— sector command's file entries and the consequences of failing them. Turn it off for the simulation alone.</span>
      </div>
      <div class="toggle-row">
        <label><input type="checkbox" id="opt-audio" ${state.audio ? 'checked' : ''}> Sound</label>
      </div>
    </div>

    <div class="actions">
      <button class="btn-primary" id="btn-brief">TAKE THE WATCH</button>
      <button class="btn" id="btn-dossier">DOSSIER</button>
      <button class="btn" id="btn-keys">CONTROLS</button>
      ${flown ? '<button class="btn is-danger" id="btn-wipe">DESTROY FILE</button>' : ''}
    </div>
  </div>`;
  toTop(host);
}

/* ---------------------------------------------------------- briefing */

export function renderBriefing(host, state) {
  const mission = state.mission;
  const consequence = consequenceFor(state.campaign, { narrativePressure: state.narrativePressure });
  const note = briefingNote(state.campaign,
    { narrativePressure: state.narrativePressure, missionId: mission.id });
  const role = ROLES[state.role];
  const battery = state.role !== 'net'
    ? mission.sites.find((s) => s.id === state.batteryId) ?? mission.sites[0]
    : null;

  const character = state.campaign.character;
  const rank = character ? rankOf(character) : null;

  host.innerHTML = `<div class="screen-inner">
    <h1 class="title is-watch">${esc(mission.name)}</h1>
    <p class="subtitle">${esc(mission.subtitle)}</p>
    ${/* The hour, the sky and the cold. The officer briefing you is a person
         and gets his own line; he used to be the last item in a middot list
         after the temperature. */ ''}
    <p class="note conditions">${esc(watchConditions(mission).line)}</p>
    <p class="note">You stand this watch as ${esc((ECHELONS[mission.echelon]?.appointment?.en
    ?? String(mission.echelon ?? '')).toLowerCase())}.</p>
    ${character ? `<div class="card record-card is-tight">
      <div class="record-stamp">${stampFace(STATE.serviceShort.tm, STATE.serviceShort.en)}</div>
      <p>Posting order for <b>${esc(rank.en)} ${esc(character.name)}</b>.
      Origin: ${esc(backgroundOf(character).en)}. Home: the Ville, in the western valley.
      ${character.wounded ? '<span class="grave">Returned to duty against medical advice.</span>' : ''}</p>
    </div>` : ''}

    ${note ? `<div class="card"><p class="note quoted">${esc(note)}</p></div>` : ''}

    ${state.narrativePressure && briefLine(state.campaign, mission.id) ? `<div class="card">
      <p class="quoted">${esc(briefLine(state.campaign, mission.id))}</p>
    </div>` : ''}

    ${state.narrativePressure && arcStanding(state.campaign) ? `<div class="card file-entry">
      <span class="form-no">SECTOR FILE</span>
      <h3>What you know</h3>
      <p>${esc(arcStanding(state.campaign))}</p>
    </div>` : ''}

    <div class="card is-situation">
      <h3>Situation</h3>
      ${sectorMap(mission)}
      ${mission.brief.map((line) => `<p>${esc(line)}</p>`).join('')}
      ${state.narrativePressure ? Object.entries(mission.briefIfKnown ?? {})
    .filter(([id]) => (state.campaign.revelations ?? []).includes(id))
    .flatMap(([, lines]) => lines)
    .map((line) => `<p class="warned">${esc(line)}</p>`).join('') : ''}
    </div>

    <div class="card">
      <h3>Your seat — ${esc(role.label)}</h3>
      <p>${esc(role.blurb)}</p>
      ${battery ? `<p class="note">You are crewing <b>${esc(battery.name)}</b> —
        ${esc(SAM_TYPES[battery.type].label)}, ${esc(DEFENCE_CLASSES[SAM_TYPES[battery.type].class].en.toLowerCase())}.
        ${SAM_TYPES[battery.type].minRangeKm}–${SAM_TYPES[battery.type].maxRangeKm} km,
        ${SAM_TYPES[battery.type].minAltM}–${SAM_TYPES[battery.type].maxAltM} m,
        ${SAM_TYPES[battery.type].channels} channels, ${SAM_TYPES[battery.type].readyRounds} rounds on the rails.</p>
        <p class="note quoted">${esc(DEFENCE_CLASSES[SAM_TYPES[battery.type].class].blurb)}</p>` : ''}
      <p class="note"><b>What this watch is for.</b> ${esc(mission.teaches)}</p>
    </div>

    ${/*
     * The file, before there is anything in it.
     *
     * On a brand-new record this card used to read "FILE ENTRY — SATISFACTORY
     * / Sector command has recorded the engagement. No comment is appended."
     * before the player had stood a single watch. The one document whose job
     * is to prove the file is watching opened by describing something that had
     * not happened. It now opens the file, and says once — here, where they
     * first meet them — what the two figures the tape prints all campaign
     * actually mean.
     */ ''}
    ${(state.campaign.history?.length ?? 0) === 0 ? `<div class="card file-entry">
      <span class="form-no">FORM 4471-B</span>
      <h3>FILE ENTRY — OPENED</h3>
      <p>File 4471-B is opened today. It holds your posting order and nothing else.</p>
      <p>Your standing is the number the file keeps on you. It runs from nothing to a hundred and
      begins at ${Math.round(state.campaign.standing)}. At seventy-eight and above a file is
      commended; below fifteen it is referred to the political section.</p>
      <p>The other figure the tape prints is leakers: aircraft that got past you and struck what
      they were sent for. Every watch has an allowance, and the allowance is small.</p>
    </div>` : `<div class="card ${consequence.tier.id === 'commended' ? 'file-entry is-good' : consequence.tier.id === 'satisfactory' ? '' : 'file-entry'}">
      <span class="form-no">FORM 4471-B</span>
      <h3>${esc(consequence.title)}</h3>
      ${consequence.lines.map((l) => `<p>${esc(l)}</p>`).join('')}
    </div>`}

    <div class="actions">
      <button class="btn-primary" id="btn-start">BEGIN</button>
      <button class="btn" id="btn-back">BACK</button>
    </div>
  </div>`;
  toTop(host);
}

/**
 * The sector, drawn from the scenario's own coordinates.
 *
 * Five paragraphs of geometry with no geometry on the page was the biggest
 * missed picture in the narrative surface: the briefs name a ridge, a gap, two
 * cities and a distance, and the player was asked to hold all of it in their
 * head. Everything here is read off the scenario — the batteries at their
 * actual reach, the defended places where they actually are, each raid axis on
 * its actual bearing — so the map cannot drift from the watch it describes.
 */
function sectorMap(mission) {
  const assets = mission.assets ?? [];
  const sites = mission.sites ?? [];
  if (!assets.length && !sites.length) return '';
  const W = 480;
  const H = 300;
  const pad = 26;
  const pts = [...assets.map((a) => a.pos), ...sites.map((s) => s.pos)];
  const reach = (s) => SAM_TYPES[s.type]?.maxRangeKm ?? 0;
  let minX = Math.min(...pts.map((p) => p.x), ...sites.map((s) => s.pos.x - reach(s)));
  let maxX = Math.max(...pts.map((p) => p.x), ...sites.map((s) => s.pos.x + reach(s)));
  let minY = Math.min(...pts.map((p) => p.y), ...sites.map((s) => s.pos.y - reach(s)));
  let maxY = Math.max(...pts.map((p) => p.y), ...sites.map((s) => s.pos.y + reach(s)));
  // the frontier is north of everything, and the raid comes over it
  maxY += 30;
  const spanX = Math.max(20, maxX - minX);
  const spanY = Math.max(20, maxY - minY);
  const k = Math.min((W - pad * 2) / spanX, (H - pad * 2) / spanY);
  const ox = pad + ((W - pad * 2) - spanX * k) / 2;
  const oy = pad + ((H - pad * 2) - spanY * k) / 2;
  const X = (x) => (ox + (x - minX) * k).toFixed(1);
  const Y = (y) => (H - oy - (y - minY) * k).toFixed(1);

  const home = assets.find((a) => a.type === 'town');
  const rings = sites.map((s) => {
    const own = s.id === mission.playerBatteryId;
    return `<circle class="map-reach ${own ? 'is-own' : ''}" cx="${X(s.pos.x)}" cy="${Y(s.pos.y)}"
      r="${(reach(s) * k).toFixed(1)}"></circle>`;
  }).join('');
  /*
   * Every name on the map goes through one collision list — the batteries
   * first, then the places — so that a capital with four buildings and two
   * batteries inside twenty kilometres does not print six names on top of
   * each other. A label that will not fit where it belongs steps down a row
   * at a time until it does.
   */
  const taken = [];
  const settle = (lx, ly, text, middle) => {
    // The real set width of the label, at the map's own type size — the
    // estimate used to be half of it, so four names inside twenty kilometres
    // all passed the test and printed on top of each other.
    const wide = String(text).length * 5.6;
    const half = wide / 2;
    let y = ly;
    let x0 = middle ? lx - half : lx;
    let x1 = middle ? lx + half : lx + wide;
    for (let guard = 0; guard < 10; guard++) {
      if (!taken.some((tk) => Math.abs(tk.y - y) < 10 && tk.x1 > x0 - 3 && tk.x0 < x1 + 3)) break;
      // down a row, and every other row out to the side, so a cluster of
      // names fans out instead of stacking into the next mark
      y += 10;
      const shift = guard % 2 ? 10 : -10;
      x0 += shift; x1 += shift;
    }
    taken.push({ x0, x1, y });
    return { y: Math.max(10, Math.min(H - 6, y)).toFixed(1), x: (middle ? (x0 + x1) / 2 : x0).toFixed(1) };
  };
  const batteries = sites.map((s, i) => {
    const at = settle(Number(X(s.pos.x)), Number(Y(s.pos.y)) + (i % 2 ? 17 : -10), s.name ?? '', true);
    return `<g class="map-site ${s.id === mission.playerBatteryId ? 'is-own' : ''}">
      <rect x="${X(s.pos.x) - 4}" y="${Y(s.pos.y) - 4}" width="8" height="8"></rect>
      <text x="${at.x}" y="${at.y}">${esc(s.name ?? '')}</text>
    </g>`;
  }).join('');
  // Names only for the places the brief talks about; marks for everything.
  const NAMED = new Set(['town', 'city', 'palace', 'hospital', 'camp']);
  const places = assets.map((a) => {
    const big = a.type === 'town' || a.type === 'city' || a.type === 'palace';
    const label = NAMED.has(a.type) || a === home ? (a.label ?? ASSET_TYPES[a.type]?.label ?? '') : '';
    const lx = Number(X(a.pos.x)) + 8;
    const at = label ? settle(lx, Number(Y(a.pos.y)) + 4, label, false) : null;
    return `<g class="map-place ${a === home ? 'is-home' : ''}">
      ${big
    ? `<circle cx="${X(a.pos.x)}" cy="${Y(a.pos.y)}" r="5"></circle>`
    : `<rect x="${X(a.pos.x) - 3}" y="${Y(a.pos.y) - 3}" width="6" height="6"></rect>`}
      ${label ? `<line class="map-leader" x1="${X(a.pos.x)}" y1="${Y(a.pos.y)}" x2="${at.x}" y2="${Number(at.y) - 3}"></line>
      <text x="${at.x}" y="${at.y}">${esc(label)}</text>` : ''}
    </g>`;
  }).join('');

  // one arrow per axis, on the bearing the aircraft actually arrive from
  const axes = [];
  for (const wave of mission.waves ?? []) {
    if (!Number.isFinite(wave.bearingDeg)) continue;
    const near = axes.find((a) => Math.abs(a.bearing - wave.bearingDeg) < 26);
    if (near) { near.count += wave.count ?? 1; continue; }
    axes.push({ bearing: wave.bearingDeg, count: wave.count ?? 1, at: wave.atS ?? 0 });
  }
  const cx = (Number(X(0)) + W / 2) / 2;
  const cy = (Number(Y(0)) + H / 2) / 2;
  const arrows = axes.slice(0, 4).map((a, i) => {
    const rad = (a.bearing * Math.PI) / 180;
    const dx = Math.sin(rad);
    const dy = -Math.cos(rad);
    const far = 168;
    const x1 = cx + dx * far;
    const y1 = cy + dy * far;
    const x2 = cx + dx * 58;
    const y2 = cy + dy * 58;
    return `<g class="map-axis">
      <line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"
        marker-end="url(#map-arrow)"></line>
      <circle cx="${x1.toFixed(1)}" cy="${y1.toFixed(1)}" r="8"></circle>
      <text x="${x1.toFixed(1)}" y="${(y1 + 3.5).toFixed(1)}">${i + 1}</text>
    </g>`;
  }).join('');

  // a scale bar, in the units the briefs use
  const bar = Math.round(20 * k);
  return `<figure class="sector-map">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Sector map for this watch">
      <defs>
        <marker id="map-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z"></path>
        </marker>
      </defs>
      <rect class="map-ground" x="0" y="0" width="${W}" height="${H}"></rect>
      <g class="map-grid">
        ${[0, 1, 2, 3, 4, 5].map((i) => `<line x1="0" y1="${(i * H) / 5}" x2="${W}" y2="${(i * H) / 5}"></line>`).join('')}
        ${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<line x1="${(i * W) / 8}" y1="0" x2="${(i * W) / 8}" y2="${H}"></line>`).join('')}
      </g>
      <g class="map-frontier">
        <line x1="0" y1="${Y(maxY - 14)}" x2="${W}" y2="${Y(maxY - 14)}"></line>
        <text x="10" y="${Number(Y(maxY - 14)) - 6}">THE NORTHERN FRONTIER</text>
      </g>
      ${rings}${arrows}${places}${batteries}
      <g class="map-scale">
        <line x1="14" y1="${H - 14}" x2="${14 + bar}" y2="${H - 14}"></line>
        <text x="${18 + bar}" y="${H - 11}">20 km</text>
      </g>
      <g class="map-north">
        <line x1="${W - 22}" y1="${H - 40}" x2="${W - 22}" y2="${H - 14}" marker-end="url(#map-arrow)"></line>
        <text x="${W - 30}" y="${H - 44}">N</text>
      </g>
    </svg>
  </figure>`;
}

/* ----------------------------------------------------------- debrief */

/**
 * The night's side of a divergence row: one factual sentence about what the
 * decision the file priced actually was. The card promised pairs and rendered
 * only the file column — half a thesis. This is the other half, read straight
 * off the result, never off the ledger.
 */
function nightSideFor(reason, result) {
  const s = result.stats ?? {};
  const asset = (type) => result.assets?.find((a) => a.type === type);
  const fate = (a, name) => {
    if (!a) return null;
    if (a.destroyed) return `${name} was lost.`;
    if ((a.damagePct ?? 0) > 0) return `${name} stands, struck to ${Math.round(a.damagePct)}%.`;
    return `${name} stands untouched.`;
  };
  if (/freeze|hospital/i.test(reason)) {
    return fate(asset('hospital'), 'The hospital') ?? 'The hospital was not on this watch.';
  }
  if (/border|encampment|Listonian/i.test(reason)) {
    return fate(asset('camp'), 'The camp at Gorna') ?? 'The camp was not on this watch.';
  }
  // "civilian area struck" is the town taking casualties, not the corridor:
  // it has to be read before the civil transit, or every strike on the Ville
  // reported that an airliner had crossed the sector safely.
  if (/civilian area/i.test(reason)) {
    return `${s.civilianCasualties ?? 0} casualties are on the returns.`;
  }
  if (/civil transit|civil corridor|civil aircraft|inside the civil/i.test(reason)) {
    return s.civilianAircraftShot
      ? 'A civil aircraft with people aboard was destroyed.'
      : 'The transit crossed the sector and left it.';
  }
  if (/state aircraft|relayed/i.test(reason)) {
    if (/no reply/i.test(reason)) return 'The attention went to the corridor instead.';
    if (s.vipDown) return 'STATE 01 came down in the Tavrov district.';
    if (s.vipEscaped) return 'STATE 01 cleared national airspace.';
    return 'STATE 01 left the picture unresolved.';
  }
  if (/movement order/i.test(reason)) {
    return /refused/i.test(reason)
      ? 'The battalion stayed. So did its coverage.'
      : 'The only battalion that reaches Kubin and Lozan moved that night.';
  }
  if (/priority|designat/i.test(reason)) {
    return `${s.civilianCasualties ?? 0} casualties are on the returns.`;
  }
  return `${s.civilianCasualties ?? 0} casualties are on the returns.`;
}

export function renderDebrief(host, state, result, entry) {
  const consequence = consequenceFor(state.campaign, { narrativePressure: state.narrativePressure });

  /*
   * The last watch does not get a debrief so much as an outcome. The ending is
   * read off what was actually defended and is placed above the arithmetic,
   * because on this one night the arithmetic is not the point.
   *
   * A watch that was walked out of has nothing to read: `result.finale` is
   * already false for an abandoned watch, and the second clause says so here
   * too, because an ending composed from a raid that never launched is the
   * worst thing this screen could print.
   */
  const ending = !result.abandoned && result.finale
    ? composeEnding(result, state.campaign.character, { narrativePressure: state.narrativePressure })
    : result.epilogue
      ? composeFlightEnding(result, state.campaign.character, { narrativePressure: state.narrativePressure })
      : null;
  const b = result.breakdown;
  const s = result.stats;

  const cell = (label, value, mood = '') =>
    `<div class="score-cell ${mood}"><label>${esc(label)}</label><b>${esc(value)}</b></div>`;

  /*
   * The leaker count, in the two currencies this debrief closes on.
   *
   * `stats.leakers` is every weapon that arrived somewhere. The verdict is
   * read against the count the FILE recognises — arrivals at a place tonight's
   * freeze struck off, or at one the schedule values at nothing, are not in
   * it — so on Economy of Force and Across the Line the cell was printing one
   * number beside a cause clause quoting another, with nothing to say why. It
   * now reads "1 (+1 UNCOUNTED)" when the two disagree, and the ground table
   * below already names the building.
   */
  const unrecognised = s.leakersUnrecognized ?? 0;
  const leakerCell = unrecognised > 0
    ? `${s.leakers - unrecognised} (+${unrecognised} UNCOUNTED)`
    : `${s.leakers}`;

  // Filtered on what the state CHARGED, not what it could still collect — the
  // account at its floor keeps being billed, and the bill is the point.
  const ledger = result.ledger
    .filter((l) => Math.abs(l.charged ?? l.delta) >= 0.5)
    .slice(-14)
    .map((l) => {
      const charged = l.charged ?? l.delta;
      const shown = `${charged > 0 ? '+' : ''}${charged.toFixed(1)}${l.atFloor ? ' (at the floor)' : ''}`;
      return `<tr><td>${esc(l.reason)}</td><td class="${charged > 0 ? 'up' : 'down'}">${shown}</td></tr>`;
    })
    .join('');

  /*
   * THE FILE vs THE NIGHT: the game's two currencies, side by side, for the
   * decisions where they parted company. Every entry pairs what the watch did
   * to your standing with what it did to the actual score, so the divergence
   * the campaign is built on is visible in one debrief instead of only across
   * replays. Only the tellingly signed rows appear — a night where the two
   * agree produces an empty table, and an empty table here is good news.
   */
  /*
   * Grouped by decision, because the same decision charged five times is one
   * row with a count on it and not five identical rows. A raid that struck the
   * town in five places used to print "civilian area struck" five times over.
   */
  const divergences = [...result.ledger
    .filter((l) => {
      const charged = l.charged ?? l.delta;
      return Math.abs(charged) >= 2 && LEDGER_SUBJECTS.test(l.reason);
    })
    .reduce((map, l) => {
      const charged = l.charged ?? l.delta;
      const seen = map.get(l.reason);
      map.set(l.reason, { reason: l.reason, charged: (seen?.charged ?? 0) + charged, times: (seen?.times ?? 0) + 1 });
      return map;
    }, new Map())
    .values()]
    .slice(-8);

  /*
   * The debrief is the one screen with a rack of figures on it, so it is the
   * one screen that is allowed to be wider than a column of prose. It was
   * 940 px on a 1600 px page with the score strip squeezed into six 120 px
   * cells and a hand's width of empty page under the buttons.
   */
  host.innerHTML = `<div class="screen-inner is-debrief">
    ${/*
     * The finding, as a printed record rather than a column of prose floating
     * on black: a letterhead rule over it, the paragraphs at a reading measure
     * inside a block the width of the page, and the sector's stamp at the foot
     * of it. The page used to run a 510 px column of type over a 1240 px band
     * of figures, which is two pages at once.
     */ ''}
    ${ending ? `
      <div class="card ending-card">
        <div class="record-head-line"><span>SECTOR RECORD · THE FINDING</span><span>${esc(state.mission.name)}</span></div>
        <p class="subtitle is-lead">${esc(ending.title)}</p>
        <h1 class="title is-outcome">${esc(ending.subtitle ?? ending.title)}</h1>
        ${ending.lines.map((line) => `<p>${esc(line)}</p>`).join('')}
        <div class="record-foot-line"><span>${esc(ROLES[result.role].label)}</span><span>ВПВО ТМ · TM ADF</span></div>
      </div>
    ` : `
      <h1 class="title is-watch ${result.success ? 'gained' : 'grave'}">${esc(result.headline)}</h1>
      ${result.cause ? `<p class="subtitle grave">${esc(result.cause)}</p>` : ''}
      <p class="subtitle">${esc(state.mission.name)} · ${esc(ROLES[result.role].label)}</p>
    `}

    ${/*
     * The score is one band of six across the page, not a column of two rows
     * of three.
     *
     * It was the left half of a two-column band, so six cells wrapped 3+3 in a
     * 420px column while the GROUND card beside it was four tight rows — the
     * two cards never shared a baseline and GROUND ended on ninety pixels of
     * empty panel. Six figures read as a rack when they are a rack; the ground
     * and the arithmetic below it are two tables of similar height and pair
     * properly with each other instead.
     */ ''}
    <div class="card score-card">
      <h3>Score</h3>
      <div class="score-grid${result.abandoned ? ' is-unscored' : ''}">
        ${/*
     * A watch that banked nothing is printed in one ink.
     *
     * Six zeros in three colours — the total in the failure red, four cells in
     * the pale ink and two in the credit green — read as a mixed result on a
     * night that had no result at all: LEAKERS 0 and ASSETS LOST 0 were being
     * congratulated for a raid that never arrived. On an abandoned watch every
     * cell is neutral, because none of them was earned either way.
     */ ''}
        ${cell('TOTAL', result.score, result.abandoned ? '' : result.score > 0 ? 'is-good' : 'is-bad')}
        ${cell('KILLS', s.kills)}
        ${cell('TURNED BACK', s.turnedBack, !result.abandoned && s.turnedBack ? 'is-good' : '')}
        ${cell('LEAKERS', leakerCell, result.abandoned ? '' : s.leakers ? 'is-bad' : 'is-good')}
        ${cell('ROUNDS', `${s.roundsFired}`)}
        ${cell('ASSETS LOST', s.assetsLost, result.abandoned ? '' : s.assetsLost ? 'is-bad' : 'is-good')}
      </div>
      ${result.abandoned ? `<p class="note score-withheld">Nothing on this line was
        earned or lost: the watch was not stood.</p>` : ''}
    </div>

    <div class="debrief-cols">
    <div class="card">
      <h3>Ground</h3>
      ${/* Nothing on the ground was defended on a watch nobody stood, so the
           whole column is in the neutral ink rather than the credit one. */ ''}
      <table class="ledger${result.abandoned ? ' is-unscored' : ''}">
        ${result.assets.map((a) => {
    const home = a.type === 'town' && state.campaign.character;
    const quarter = home ? districtOf(state.campaign.character) : null;
    const struck = home && a.districtsHit?.includes(quarter.id);
    // Nothing on the ground was defended on a watch nobody stood, so nothing
    // on this table is printed in the credit ink either.
    return `<tr><td>${esc(a.label)}${home ? ' <span class="note">— home</span>' : ''}</td>
          <td class="${a.destroyed ? 'down' : a.damagePct || result.abandoned ? '' : 'up'}">
            ${a.destroyed ? 'DESTROYED' : a.damagePct ? `${a.damagePct}% damage` : 'intact'}
            ${a.casualties ? ` · ${a.casualties} casualties` : ''}
            ${struck ? `<br><span class="grave">${esc(quarter.en.charAt(0).toUpperCase() + quarter.en.slice(1))}, where your people live, is on the returns.</span>` : ''}
          </td></tr>`;
  }).join('')}
      </table>
      ${result.battery ? `<p class="aside">
        Your battery: <b>${esc(result.battery.name)}</b> —
        ${result.battery.alive ? 'still in action' : 'lost'},
        ${result.battery.roundsRemaining} rounds on the rails,
        ${result.battery.crewLosses} crew casualties,
        ${Math.round(result.battery.exposure * 100)}% emissions exposure.${s.ownAuthorityEngagements
    ? ` <span class="grave">${s.ownAuthorityEngagements} engagement${s.ownAuthorityEngagements === 1 ? '' : 's'} on your own authority, ${s.roundsOnOwnAuthority} round${s.roundsOnOwnAuthority === 1 ? '' : 's'}; the net has it in writing.</span>`
    : ''}</p>` : ''}
    </div>

    ${/* The arithmetic pairs with the ground: two tables of a similar height,
         side by side, each hugging its own content. */ ''}
    ${(() => {
    // A card with a heading and nothing under it is furniture. It happens on
    // an abandoned watch, where every line of the arithmetic is zero by
    // definition and the card above has already said why.
    const rows = [
      ['Ground preserved', b.assets],
      ['Aircraft destroyed', b.kills],
      ['Sorties turned back', b.turnedBack],
      ['Leakers', b.leakers],
      ['Rounds expended', b.rounds],
      ['Equipment lost', b.equipment],
      ['Civilian harm', b.civilian],
    ].filter(([, v]) => v !== 0);
    if (!rows.length) return '';
    return `<div class="card">
      <h3>Points</h3>
      <table class="ledger">
        ${rows.map(([label, value]) =>
    `<tr><td>${esc(label)}</td><td class="${value > 0 ? 'up' : 'down'}">${value > 0 ? '+' : ''}${value}</td></tr>`).join('')}
      </table>
    </div>`;
  })()}
    </div>

    ${result.abandoned
    ? abandonedRecord(state.campaign.character, result)
    : serviceSummary(state.campaign.character, entry?.service, state.campaign)}

    ${ledger ? `<div class="card">
      <h3>Sector command's ledger</h3>
      <table class="ledger">${ledger}</table>
      <p class="aside">Standing: ${Math.round(result.standing)} — ${esc(result.tierLabel)}</p>
    </div>` : ''}

    ${divergences.length ? `<div class="card">
      <h3>The file and the night</h3>
      <p class="lede">The decisions that moved your standing, each beside what actually came of
      it on the ground. Only the ones where the file and the outcome disagree are listed; an
      empty table means they agreed all night.</p>
      <table class="ledger">
        <tr><th>decision</th><th class="is-figure">the file</th><th>the night</th></tr>
        ${divergences.map((l) => {
    const charged = l.charged;
    return `<tr><td>${esc(l.reason)}${l.times > 1 ? ` <span class="note">&times;${l.times}</span>` : ''}</td>
          <td class="${charged > 0 ? 'up' : 'down'}">${charged > 0 ? '+' : ''}${charged.toFixed(1)}</td>
          <td class="is-prose note">${esc(nightSideFor(l.reason, result))}</td></tr>`;
  }).join('')}
      </table>
      <p class="aside">The score above, ${result.score}, is what actually happened tonight:
      aircraft down, ground held, people alive. Your standing is what sector command wrote in
      your file about it. The two are kept apart on purpose: a decision that saved the hospital
      can lower your standing, and one that lost it can raise it.</p>
    </div>` : ''}

    ${/*
     * Sector command's standing assessment — of a watch that was stood.
     *
     * On an abandoned watch this card printed "FILE ENTRY — SATISFACTORY /
     * Nothing further is required of you at this time" three lines under a
     * ledger reading "Standing: 32 — FLAGGED", on a page headlined WATCH
     * ABANDONED. The abandonment has its own file entry, above, under its own
     * heading and its own tier; the file does not get to say both.
     */ ''}
    ${result.abandoned ? '' : `<div class="card ${consequence.tier.id === 'commended' ? 'file-entry is-good' : 'file-entry'}">
      <span class="form-no">FORM 4471-B</span>
      <h3>${esc(consequence.title)}</h3>
      ${consequence.lines.map((l) => `<p>${esc(l)}</p>`).join('')}
    </div>`}

    ${/*
     * The letter card carries the letter, the same way the quarters scene
     * does: the disposition is stencilled beside the title and the section's
     * docket is a slip clipped to the sheet, never a sentence describing the
     * post to the man who just read it.
     */ ''}
    ${state.narrativePressure && entry?.letter ? `<div class="card letter-card">
      <h3>${esc(entry.letter.title)}${entry.letter.plate
    ? ` <span class="letter-plate">${esc(entry.letter.plate)}</span>` : ''}</h3>
      ${entry.letter.note ? `<p class="letter-slip">${esc(entry.letter.note)}</p>` : ''}
      ${entry.letter.lines.map((l, i) => {
    const cls = entry.letter.isLetter && i === 0 ? ' class="letter-salutation"'
      : entry.letter.isLetter && i === entry.letter.lines.length - 1 ? ' class="letter-sign"' : '';
    return `<p${cls}>${esc(l)}</p>`;
  }).join('')}
    </div>` : ''}

    ${entry?.appointment ? `<div class="card file-entry is-good">
      <span class="form-no">ORDER 12-4</span>
      <h3>Order of appointment</h3>
      <p>By order of ${entry.appointment.echelon.id === 'national' ? 'the Ministry of Defence'
    : 'the Chief of Air Defence'}, you are appointed
        <b>${esc(entry.appointment.echelon.appointment.en)}</b>.</p>
      ${entry.appointment.gazetted ? `<p>You are gazetted to
        ${esc(entry.appointment.gazetted.en)} on the same order.</p>` : ''}
      ${state.narrativePressure && entry.appointment.note
    ? `<p>${esc(entry.appointment.note)}</p>` : ''}
      <p class="note">${esc(entry.appointment.echelon.blurb)}</p>
    </div>` : ''}

    ${state.narrativePressure && entry?.revelation ? `<div class="card revelation-card">
      <h3>${entry.revelation.tm ? `<span class="tm">${esc(entry.revelation.tm)}</span>` : ''}${esc(entry.revelation.title)}</h3>
      ${entry.revelation.lines.map((l) => `<p>${esc(l)}</p>`).join('')}
      <span class="doc-stamp">SECTOR FILE</span>
    </div>` : ''}

    <div class="actions">
      <button class="btn-primary" id="btn-again">STAND ANOTHER WATCH</button>
      <button class="btn" id="btn-replay">REPLAY THIS ONE</button>
      ${state.campaign.character ? '<button class="btn" id="btn-dossier-debrief">DOSSIER</button>' : ''}
      <button class="btn" id="btn-close-report">CLOSE THE REPORT</button>
    </div>
  </div>`;
  paintFilePhotos(host);
  toTop(host);
}

/**
 * The card the evening ends on.
 *
 * The scenes have said what happened; this is one line of it and the ways
 * out. The full report — the page of tables the debrief used to be — is one
 * button away, and so is watching the evening again.
 */
export function renderEndCard(host, state, result) {
  /*
   * On a watch that closes the campaign the card names the ending rather than
   * the night's operational result. Twelve watches of arc used to finish on
   * "SECTOR HELD", which is the headline of every other Tuesday.
   */
  const ending = !result.abandoned && result.finale
    ? composeEnding(result, state.campaign.character,
      { narrativePressure: state.narrativePressure, family: state.campaign.family })
    : !result.abandoned && result.epilogue
      ? composeFlightEnding(result, state.campaign.character,
        { narrativePressure: state.narrativePressure })
      : null;

  /*
   * The cause clause is printed only when it says something the headline has
   * not. "SECTOR PENETRATED" above "SECTOR PENETRATED — TWO GOT THROUGH" is
   * one sentence set twice.
   */
  const headline = ending ? (ending.subtitle ?? ending.title) : result.headline;
  const cause = result.cause
    && !String(result.cause).toUpperCase().startsWith(String(result.headline ?? '').toUpperCase())
    ? result.cause : null;

  /*
   * A title card, not another deck of panels: the last shot of the evening
   * carried through as a dimmed ground, the ending's two titles over one rule,
   * its first line under them, and the figures as a single row.
   */
  const facts = [
    ...(result.abandoned
      ? [['SCORE', 'NOT SCORED']]
      : [['SCORE', String(result.score)],
        ['STANDING', `${Math.round(result.standing)} — ${result.tierLabel}`]]),
    ['SEAT', ROLES[result.role].label],
  ];

  host.innerHTML = `<div class="screen-inner is-endcard ${ending ? 'is-title-card' : ''}">
    ${ending ? '<canvas class="endcard-sky" width="320" height="180" aria-hidden="true"></canvas>' : ''}
    <div class="endcard-block">
      ${/* The same print that is stuck to the front of the dossier and to the
           head of the service record, at the end of the file it belongs to. */ ''}
      ${state.campaign.character ? `<span class="file-ident-photo endcard-photo">
        <canvas class="portrait file-photo is-small" width="24" height="30"
          data-seed="${esc(state.campaign.character.name)}" aria-label="Photograph on file"></canvas>
      </span>` : ''}
      ${ending && ending.subtitle ? `<p class="endcard-tm">${esc(ending.title)}</p>` : ''}
      <h1 class="title is-watch ${result.success ? 'gained' : 'grave'}">${esc(headline)}</h1>
      ${/* The watch's name belongs under the title, not in the figure row as a
           label over the seat: the card used to read "The President's Flight →
           BATTLE MANAGER" beside SCORE and STANDING. */ ''}
      <p class="subtitle endcard-watch">${esc(state.mission.name)}</p>
      <hr class="endcard-rule">
      ${ending ? `<p class="ending-lede">${esc(ending.lines[0] ?? '')}</p>`
    : cause ? `<p class="subtitle grave">${esc(cause)}</p>` : ''}
      <div class="endcard-facts">
        ${facts.map(([label, value]) => `<span><label>${esc(label)}</label><b>${esc(value)}</b></span>`).join('')}
      </div>
    </div>
    <div class="actions is-endcard-actions">
      <button class="btn-primary" id="btn-again">STAND ANOTHER WATCH</button>
      <span class="action-pair">
        <button class="btn" id="btn-report">THE FULL REPORT</button>
        <button class="btn" id="btn-scenes">THE EVENING AGAIN</button>
      </span>
      <span class="action-pair is-quiet">
        <button class="btn" id="btn-replay">REPLAY THIS ONE</button>
        ${state.campaign.character ? '<button class="btn" id="btn-dossier-debrief">DOSSIER</button>' : ''}
      </span>
    </div>
  </div>`;
  // The evening's last picture, dimmed, behind the words it belongs to.
  const sky = host.querySelector('.endcard-sky');
  if (sky && ending) drawEndingStill(sky, { held: !!result.success });
  paintFilePhotos(host);
  toTop(host);
}

/* ------------------------------------------------------------- help */

/**
 * A 64 x 32 silhouette for a class of air defence, drawn rather than described:
 * a long-range battalion on its trailers, a medium battery, a point-defence
 * section and a gun. Four shapes a player can tell apart at a glance.
 */
function classSilhouette(id) {
  const art = {
    strategic: '<rect x="4" y="18" width="44" height="7"/><rect x="10" y="8" width="34" height="10" transform="rotate(-16 10 18)"/><circle cx="14" cy="27" r="4"/><circle cx="26" cy="27" r="4"/><circle cx="40" cy="27" r="4"/>',
    long: '<rect x="8" y="17" width="36" height="7"/><rect x="14" y="9" width="26" height="7" transform="rotate(-20 14 16)"/><circle cx="16" cy="26" r="4"/><circle cx="38" cy="26" r="4"/>',
    medium: '<rect x="12" y="18" width="28" height="7"/><rect x="18" y="11" width="18" height="6" transform="rotate(-24 18 17)"/><circle cx="18" cy="27" r="4"/><circle cx="34" cy="27" r="4"/>',
    short: '<rect x="16" y="19" width="22" height="6"/><rect x="22" y="13" width="12" height="5" transform="rotate(-28 22 18)"/><circle cx="21" cy="27" r="3.5"/><circle cx="34" cy="27" r="3.5"/>',
    gun: '<rect x="16" y="20" width="22" height="5"/><rect x="24" y="10" width="16" height="3" transform="rotate(-34 24 12)"/><circle cx="22" cy="27" r="3.5"/><circle cx="34" cy="27" r="3.5"/>',
  }[id] ?? '<rect x="14" y="18" width="26" height="7"/><circle cx="20" cy="27" r="4"/><circle cx="34" cy="27" r="4"/>';
  return `<svg viewBox="0 0 64 32" role="img" aria-hidden="true">${art}<line x1="0" y1="31" x2="64" y2="31"/></svg>`;
}



/**
 * The handbook for the console you are actually sitting at.
 *
 * The caps a watch does not carry are taken by `consoleCaps(scenario)`, and
 * this page, the battery card and the key map all read that one answer — so
 * they cannot drift the way they had. The teaching watch strips SALVO, RIDE
 * and DISPLACE off the card; this page used to go on listing S, G and X as
 * things to press, and the keyboard went on obeying them, which is how a
 * learner put their only battery on the road for three and a half minutes.
 */
export function renderControls(host, { salvo = true, ride = true, displace = true } = {}) {
  const key = (k, d) => `<div><b>${esc(k)}</b><span>${esc(d)}</span></div>`;
  host.innerHTML = `<div class="screen-inner">
    <h1 class="title is-outcome">CONTROLS</h1>
    <div class="card">
      <h3>Everywhere</h3>
      <div class="keys">
        ${key('Space / 0', 'hold — the simulation stops; a pending order’s clock does not')}
        ${key('1 / 2 / 4', 'the speed printed on the cap; there is no 3× cap and no 3 key')}
        ${key('Tab', 'walk the console’s controls; Enter or Space presses the one with the ring')}
        ${key('↑ / ↓', 'step through the contacts on the board')}
        ${key('← / →', 'change speed while the ring is on the speed caps')}
        ${key('+ / −', 'zoom the scope')}
        ${key('V', 'switch seat — net or cabin (commander only)')}
        ${key('Y / N', 'acknowledge or refuse a directive')}
        ${key('M', 'the map of Trans Mordovia under the picture')}
        ${key('H', 'this screen')}
      </div>
    </div>
    <div class="card">
      <h3>Battle manager</h3>
      <div class="keys">
        ${key('Click a contact', 'select it')}
        ${key('Drag contact → battery', 'hand it to that battery')}
        ${key('Right-click a contact', 'every battery that could take it — range, time to its ring, rounds, the odds — one click to hand it over')}
        ${key('Shift+1 … 4', 'hand the selected contact to battery 1–4, in the order the cards are numbered')}
        ${key('Alt+1 … 4', 'take or hand back subordinate command 1–4 (district and national watches)')}
        ${key('Q / W / E', 'the three weapons caps on the selected battery: hold, tight, free')}
        ${key('A', 'flip the selected battery’s radar switch — careful: this switches your own radar off')}
        ${ride ? key('G', 'HOLD BEAM — keep its radar on and guide the missile even with an enemy anti-radar missile inbound (the crew never will on its own)') : ''}
        ${key('R', 'loaders out — start filling the selected battery’s rails now, short or not')}
        ${displace ? key('X', 'move the selected battery — a minute off the air, and the enemy has to find it again') : ''}
        ${key('`', 'switch every search radar on or off')}
      </div>
      <p class="note">Every key on that list acts on the <b>selected</b> battery, which is why the
      key chips are stamped on the selected card and on no other: the rack shows six keys once,
      not the same six on every card. Click a card to move them.</p>
    </div>
    <div class="card">
      <h3>SAM operator</h3>
      <div class="keys">
        ${key('Click a contact', 'make it your target')}
        ${key('L', 'lock a fire-control channel onto it; press again to let it go')}
        ${key('F', 'launch a missile at it, once LAUNCH lights')}
        ${key('A', 'your radar switch — up is RADIATE (you can see and shoot, and be found), down is SILENCE')}
        ${salvo ? key('S', 'missiles per shot — one or two') : ''}
        ${key('R', 'loaders out — top the rails up now, instead of waiting for them to go bare')}
        ${displace ? key('X', 'move the battery — a minute off the air, and the enemy has to find it again') : ''}
      </div>
    </div>
    ${salvo && ride && displace ? '' : `<div class="card">
      <p class="note">Some controls are not fitted to tonight's console — this watch is
      flown on the caps you can see, and the keys that are not listed above do nothing.</p>
    </div>`}
    <div class="card">
      <h3>The four classes of air defence</h3>
      ${/*
       * Four classes, each with its own silhouette and its reach drawn
       * against the same scale — a table of four numbers told the player
       * nothing about what the difference between them feels like.
       */ ''}
      <div class="classes">
        ${Object.values(DEFENCE_CLASSES).map((c) => {
    const sys = Object.values(SAM_TYPES).find((t) => t.class === c.id);
    const far = Math.max(...Object.values(SAM_TYPES).map((t) => t.maxRangeKm));
    const x0 = (100 * sys.minRangeKm) / far;
    const x1 = (100 * sys.maxRangeKm) / far;
    return `<div class="class-row">
        <span class="class-art">${classSilhouette(c.id)}</span>
        <span class="class-text">
          <b>${esc(c.en)}</b> <span class="stencil note">${esc(c.tm)}</span>
          <small class="note">${esc(c.blurb)}</small>
        </span>
        <span class="class-reach">
          <b>${esc(sys.label)}</b>
          <span class="reach-bar"><i style="left:${x0.toFixed(1)}%;width:${(x1 - x0).toFixed(1)}%"></i></span>
          <small class="note">${sys.minRangeKm}–${sys.maxRangeKm}&nbsp;km · ${sys.minAltM}–${sys.maxAltM}&nbsp;m</small>
        </span>
      </div>`;
  }).join('')}
      </div>
      <p class="note aside">The bars are drawn against one scale: the longest reach in the
      service is ${Math.max(...Object.values(SAM_TYPES).map((t) => t.maxRangeKm))}&nbsp;km.</p>
    </div>

    <div class="card">
      <h3>What is actually going on</h3>
      <p>A radar only sees a target when its beam sweeps that bearing, and it cannot see through
      the horizon at all — which is why a contact at ninety metres appears close and stays close.</p>
      <p>A surface-to-air round is guided all the way by the radar that launched it. Switch that
      radar off while the round is in the air and the round loses its guidance and falls in a
      field. Leave the radar on and the suppression aircraft works out where you are.</p>
      <p>Sector operations fuses every radar into one picture. Lose it and each set reports for
      itself: the same aircraft grows a track number on every radar that can see it, and nobody
      reconciles them.</p>
      <p>A contact in dashed brackets is one a battery has been given, with the battery's name under
      it; solid brackets mean that battery has a round in the air on it. A contact with no
      brackets is nobody's. The shootlist marks the same two states in its battery column: an open
      diamond means the contact has been assigned, and a filled one means a round is in the
      air.</p>
    </div>
    <div class="actions"><button class="btn-primary" id="btn-close-help">BACK</button></div>
  </div>`;
  toTop(host);
}
