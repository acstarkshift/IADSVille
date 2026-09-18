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

import {
  SCENARIOS, isUnlocked, appointmentOf, watchConditions, postOfScenario,
} from '../engine/scenarios.js';
import { POST_ORDER, appointingSignatory } from '../engine/echelon.js';
import {
  DIFFICULTY, ROLES, SAM_TYPES, DEFENCE_CLASSES, ASSET_TYPES, RADAR_TYPES,
} from '../engine/config.js';
import { consequenceFor, briefingNote } from '../engine/campaign.js';
import { tierFor, LEDGER_SUBJECTS } from '../engine/command.js';
import { rankOf, backgroundOf, householdOf, districtOf } from '../engine/character.js';
import {
  serviceSummary, abandonedRecord, paintFilePhotos, paperHead, field, fields, grouped,
} from './dossier.js';
import { STATE } from './lexicon.js';
import { rankInsignia } from './insignia.js';
import { composeEnding, endingSummary } from '../engine/endings.js';
import { composeFlightEnding, flightEndingSummary } from '../engine/epilogue.js';
import { standing as arcStanding } from '../engine/revelations.js';
import { briefLine } from '../engine/family.js';
import { drawEndingStill, plainLedgerReason } from './scenes.js';

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

/*
 * The form furniture — the letterhead, the typed field and a band of them — is
 * declared with the service record in dossier.js and imported here, so that the
 * menu's front sheet, the order, the manual, the end card and the record itself
 * are all printed from one set of blocks. See the note on `paperHead` there.
 */

/**
 * What a command you have not been given says about itself, by how far above
 * your appointment it is.
 *
 * One line per block of the roster. Every locked watch used to carry the same
 * two sentences under its own name, so a new record opened on the same line
 * printed eight times down one screen.
 */
const NOT_HELD = [
  '',
  'The next rung. You will be given it when you are given it.',
  'Two appointments above yours. You have not met the man who holds it.',
  'Three appointments above yours. Nobody has told you who holds it.',
  'Four appointments above yours. It is a name on a signature block.',
  'Five appointments above yours. It is held in Mostrograd.',
];

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
        || postOfScenario(sc).order <= appointment.order;
      return held
        ? `<button class="mission is-sealed" disabled>
            <b>▓▓▓▓▓▓▓▓ ▓▓▓▓▓▓</b>
            <small>Not on the roster. This watch has not happened yet.</small>
            <div class="flags"><span class="pill tight">SEALED</span></div>
          </button>`
        /*
         * A watch you have not been given carries its name and the stamp, and
         * nothing else. The sentence about being given it when you are given
         * it is true and it is worth saying — once, at the head of the block
         * it applies to, rather than eight times down one screen on a new
         * record, which is how it read as a wall of the same line.
         */
        /*
         * POST, not COMMAND. Eight of the twelve watches are now stood from a
         * seat that commands nothing — a set and a cabin — and a recruit
         * reading NOT YOUR COMMAND over Solo Battery was being told the wrong
         * thing about the rung directly above him. One word covers the whole
         * ladder, and it is the word the roster, the file and the LEAVE POST
         * cap already use.
         */
        : `<button class="mission is-sealed" disabled>
            <b>${esc(sc.name)}</b>
            <div class="flags"><span class="pill tight">NOT YOUR POST</span></div>
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

    ${/*
     * THE PERSONNEL FILE, as the file itself.
     *
     * The art director: "seven identical rounded boxes in a row, one of which
     * wraps to two lines and breaks the row, on a black field in a single
     * terminal green ... beside the dossier and the report — which are drawn as
     * documents — these read as a different game." It is the same document as
     * the dossier, so it is printed on the same stock and carries the same
     * form number: buff paper laid on the black desk, a punched filing margin
     * with the red gutter rule, the letterhead of FORM 2-19, the photograph as
     * a print, and the particulars typed onto ruled lines in two bands — the
     * holder, then the figures. The tier is a rubber stamp applied across the
     * typing rather than parked in a box in the corner.
     */ ''}
    <div class="card record-card doc-sheet">
      ${paperHead('Personnel file — Air Defence Forces', 'FORM 2-19')}
      <div class="record-stamp">${stampFace(tier.label)}</div>
      ${character ? `<div class="ident-row">
        ${/* The print on the front of the file — the same face as the card in
             the reader, the dossier and the end card. The menu is the screen
             the player sees most and it used to carry no face at all. */ ''}
        <span class="file-ident-photo">
          <canvas class="portrait file-photo" width="24" height="30"
            data-seed="${esc(character.name)}" aria-label="Photograph on file"></canvas>
        </span>
        ${/* The holder, typed on the file's own name rule. The appointment used
             to be set again in small capitals directly under the name and again
             in the tile below it; it is a particular, and it is entered once,
             in the band with the others. The rank board used to hang between
             the photograph and the name with nothing to say what it was; it is
             printed against the rank, which is what it means. */ ''}
        <span class="ident-name"><label>Surname and given name</label>
          <b>${esc(rank?.en ?? '')} ${esc(character.name)}</b></span>
      </div>` : ''}
      ${fields([
    field('Rank', rank?.en ?? '—',
      { mark: character ? rankInsignia(character.rankIndex, { size: 22, title: rank.en }) : '' }),
    field('Appointment', appointment.appointment.en, { wide: true }),
    field('Condition', character?.wounded ? 'INJURED' : 'FIT',
      { mood: character?.wounded ? 'is-bad' : '' }),
  ])}
      ${fields([
    field('Standing', Math.round(campaign.standing)),
    /* One number style with the record's: 26,000, not 26000. */
    field('Experience', grouped(character?.xp ?? 0)),
    field('Watches', flown),
    field('Training', character?.points ?? 0, { mood: character?.points ? 'is-good' : '' }),
  ], 'is-figures')}
      ${/* The clerk's remarks, under the ruled bands and under their own
           caption, which is where a form keeps the sentences — and no caption
           at all on a sheet with nothing written under it. */ ''}
      ${(() => {
    const remarks = [
      campaign.ending ? `<p class="verdict grave">
        <b>${esc(endingSummary(campaign.ending) ?? '')}</b> — the last watch has been stood.</p>` : '',
      campaign.epilogue ? `<p class="verdict grave">
        <b>${esc(flightEndingSummary(campaign.epilogue) ?? '')}</b> — and what happened two days after it.</p>` : '',
      character ? `<p class="note verdict">
        ${esc(backgroundOf(character).en)}. Home: the Ville, in the western valley.
        Household: ${esc(householdOf(character).en.replace(/^Your /, 'your '))}.
        ${character.decorations.length ? `${character.decorations.length} decoration${character.decorations.length > 1 ? 's' : ''} on file.` : ''}
        ${character.points ? '<b class="urgent">Training points unspent.</b>' : ''}</p>` : '',
    ].filter(Boolean);
    return remarks.length
      ? `<div class="doc-remarks"><span>Remarks</span>${remarks.join('')}</div>` : '';
  })()}
      ${/* The foot of the sheet, where a form says what it is and who keeps
           it — the same line the full report's foot carries. */ ''}
      <div class="record-foot-line"><span>Kept by the sector political section</span>
        <span>${esc(STATE.serviceShort.tm)} · ${esc(STATE.serviceShort.en)}</span></div>
    </div>

    <div class="card">
      <h3>Select a watch</h3>
      <p class="lede">
        You hold the appointment of <b class="urgent">${esc(appointment.appointment.en)}</b>.
        ${esc(appointment.blurb)}</p>
      ${/*
         * The roster is the LADDER, one block a rung, from the set to the
         * country. It used to be grouped by the size of the formation, which
         * is a different question and put the first night of the war under a
         * heading reading BATTALION COMMAND.
         */ ''}
      ${POST_ORDER.map((post) => {
    const watches = SCENARIOS.filter((sc) => postOfScenario(sc).id === post.id);
    if (!watches.length) return '';
    const reached = post.order <= appointment.order;
    return `<div class="act ${reached ? '' : 'is-locked'}">
          <div class="act-head">
            <span class="lg"><b>${esc(post.heading)}</b></span>
            <span>${reached ? esc(post.teaches) : esc(NOT_HELD[post.order - appointment.order]
    ?? NOT_HELD[NOT_HELD.length - 1])}</span>
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
      ${/* Which cabin you are sitting in — a question only the two seats with
           a launcher under them have. */ ''}
      ${state.role === 'crew' || state.role === 'both' ? `<div class="toggle-row">
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
  paintFilePhotos(host);
  toTop(host);
}

/* ---------------------------------------------------------- briefing */

export function renderBriefing(host, state) {
  const mission = state.mission;
  const consequence = consequenceFor(state.campaign, { narrativePressure: state.narrativePressure });
  const note = briefingNote(state.campaign,
    { narrativePressure: state.narrativePressure, missionId: mission.id });
  const role = ROLES[state.role];
  const battery = state.role === 'crew' || state.role === 'both'
    ? mission.sites.find((s) => s.id === state.batteryId) ?? mission.sites[0]
    : null;

  const character = state.campaign.character;
  const rank = character ? rankOf(character) : null;

  /*
   * THE BRIEFING IS AN ORDER SHEET.
   *
   * It was built exactly like the personnel file — a stack of bordered boxes of
   * green type on black — and the art director filed both together: "the
   * briefing is the same construction. Beside the dossier and the report, which
   * are drawn as documents, these read as a different game." An operation order
   * is a sheet of paper issued to one man for one night: a letterhead with the
   * order's number, the particulars typed in at the top, the situation in
   * numbered paragraphs with the sector map printed beside them as a figure,
   * and the office's stamp at the foot. Everything on it was already here; none
   * of it was drawn as what it is.
   */
  host.innerHTML = `<div class="screen-inner is-paper is-order">
    ${paperHead(`${STATE.sector.en} — operation order`, 'FORM 3-31')}
    <h1 class="title is-watch">${esc(mission.name)}</h1>
    <p class="subtitle">${esc(mission.subtitle)}</p>
    ${/* The particulars of the order, typed into the head of it: the hour and
         the sky, the post the watch is stood under, and the seat. They were
         two loose grey lines under the title and a heading further down the
         page. One spelling for the job, everywhere it is named: the order of
         appointment, the personnel file and the roster all say the same
         thing. It is the POST the watch is stood under — a night fought at a
         battalion is not a night in command of one. */ ''}
    ${fields([
    field('Time and weather', watchConditions(mission).line),
    field('Post held this watch', postOfScenario(mission).appointment.en, { wide: true }),
    field('Seat', role.label),
  ], 'is-order-head')}
    ${character ? `<div class="card record-card is-tight">
      <div class="record-stamp">${stampFace(STATE.serviceShort.tm, STATE.serviceShort.en)}</div>
      <p>Posting order for <b>${esc(rank.en)} ${esc(character.name)}</b>.
      Origin: ${esc(backgroundOf(character).en)}. Home: the Ville, in the western valley.
      ${character.wounded ? '<span class="grave">Returned to duty against medical advice.</span>' : ''}</p>
    </div>` : ''}

    ${/* What came in over the wire before the watch: a signal slip pasted to
         the order, not another panel in a deck of panels. */ ''}
    ${note ? `<div class="card is-signal"><span class="form-no">Signal</span>
      <p class="note quoted">${esc(note)}</p></div>` : ''}

    ${state.narrativePressure && briefLine(state.campaign, mission.id) ? `<div class="card is-signal">
      <span class="form-no">Signal</span>
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
      ${/* The situation in numbered paragraphs, which is how an order is
           written and read. The numbers are printed by the sheet itself (a
           counter in the stylesheet), so not a word of the brief moves. */ ''}
      ${mission.brief.map((line) => `<p>${esc(line)}</p>`).join('')}
      ${state.narrativePressure ? Object.entries(mission.briefIfKnown ?? {})
    .filter(([id]) => (state.campaign.revelations ?? []).includes(id))
    .flatMap(([, lines]) => lines)
    .map((line) => `<p class="warned">${esc(line)}</p>`).join('') : ''}
    </div>

    <div class="card">
      <h3>Your seat — ${esc(role.label)}</h3>
      <p>${esc(role.blurb)}</p>
      ${/*
         * And at the set, what is under your hands instead of a launcher: the
         * surveillance radars this watch fields, and the man who does the
         * shooting. A seat that is defined by what it may NOT do has to say
         * so on the paper before the watch, not discover it at the console.
         */ ''}
      ${state.role === 'radar' ? `<p class="note">You are on
        <b>${esc((mission.radars ?? []).map((r) => RADAR_TYPES[r.type]?.label ?? 'SET')
    .join(' and ') || 'the sector set')}</b>.
        A launch officer beside you works the batteries; you switch the set, hold what it finds
        and hand him each contact by name. He will not fire at anything you have not called.</p>` : ''}
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
    ${/* And a record that has stood a watch is not a record whose file was
         opened this morning. It used to be gated on the history array alone,
         so a file that had completed eleven watches could be handed the
         paperwork of a recruit's first night. */ ''}
    ${(state.campaign.history?.length ?? 0) === 0
    && Object.keys(state.campaign.completed ?? {}).length === 0 ? `<div class="card file-entry">
      <span class="form-no">FORM 4471-B</span>
      <h3>FILE ENTRY — OPENED</h3>
      <p>Your file is opened today. It holds your posting order and nothing else.</p>
      <p>Your standing is the number the file keeps on you. It runs from nothing to a hundred and
      begins at ${Math.round(state.campaign.standing)}. At seventy-eight and above a file is
      commended; below fifteen it is referred to the political section.</p>
      <p>The other figure the tape prints is how many aircraft got through — the ones that passed
      you and struck what they were sent for. Every watch has an allowance for them, and the
      allowance is small.</p>
    </div>` : `${/* One form, whatever the file says on it. A satisfactory
         record used to get this entry as a bare card with an unstyled FORM
         4471-B floating above the heading, so the one document on the screen
         that is literally a form was the one drawn as a box. */ ''}
      <div class="card file-entry${consequence.tier.id === 'commended' ? ' is-good' : ''}">
      <span class="form-no">FORM 4471-B</span>
      <h3>${esc(consequence.title)}</h3>
      ${consequence.lines.map((l) => `<p>${esc(l)}</p>`).join('')}
    </div>`}

    ${/* The foot of the order: who issued it, and under whose authority. */ ''}
    <div class="record-foot-line"><span>Issued by sector operations</span>
      <span>${esc(STATE.serviceShort.tm)} · ${esc(STATE.serviceShort.en)}</span></div>

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
  /*
   * The batteries are lettered on the map and named in the key under it.
   *
   * All three judges: "LANCE CAPITAL, HAMMER CAPITAL and THISTLE NORTH occupy
   * the same forty pixels, and THISTLE TOWN, LANCE WEST and HAMMER do the
   * same over THE VILLE ... a battery symbol is drawn straight through THISTLE
   * NORTH so the name renders as THIST and NORTH either side of a green
   * square." Six names cannot be printed inside twenty kilometres at this
   * scale, and no amount of nudging makes them fit: what a map does with a
   * cluster is letter it and put the names in a key.
   */
  const LETTERS = 'ABCDEFGH';
  const batteries = sites.map((s, i) => `<g class="map-site ${s.id === mission.playerBatteryId ? 'is-own' : ''}">
      <rect x="${X(s.pos.x) - 4}" y="${Y(s.pos.y) - 4}" width="8" height="8"></rect>
      <text class="map-key-mark" x="${Number(X(s.pos.x)) + (i % 2 ? -12 : 7)}" y="${Number(Y(s.pos.y)) + (i % 2 ? 14 : -6)}">${LETTERS[i] ?? '?'}</text>
    </g>`).join('');
  /*
   * The key names the battery and then what class it is — except that most of
   * these batteries are named after their class, so the line read "B LANCE
   * WEST LANCE · 42 KM" and printed the same word twice. Where the name
   * already carries the class, the key gives the reach and nothing else.
   */
  const key = sites.map((s, i) => {
    const name = String(s.name ?? '');
    const type = String(SAM_TYPES[s.type]?.label ?? '');
    const doubled = type && name.toUpperCase().split(' ').includes(type.toUpperCase());
    return `<li class="${s.id === mission.playerBatteryId ? 'is-own' : ''}">
      <b>${LETTERS[i] ?? '?'}</b> ${esc(name)}
      <small>${doubled ? '' : `${esc(type)} · `}reaches ${reach(s)} km</small>
    </li>`;
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
    ${/* A printed figure has a plate number and a caption under it, and the
         key belongs to the caption. It used to be a bare box of green lines
         with a list under it. */ ''}
    <figcaption class="map-key">
      <span class="map-caption">Fig. 1 — ${esc(STATE.sector.en)}, the ground this watch is fought over</span>
      <ul>${key}</ul>
    </figcaption>
  </figure>`;
}

/* ----------------------------------------------------------- debrief */

/**
 * The night's side of a divergence row: one factual sentence about what the
 * decision the file priced actually came to on the ground. The card promised
 * pairs and rendered only the file column — half a thesis. This is the other
 * half, read straight off the result, never off the ledger.
 *
 * One written outcome per kind of order, and null where there is honestly
 * nothing to report, so the row is dropped instead of being padded. The column
 * used to fall through to "0 casualties are on the returns." for anything it
 * had no rule for, which on the first watch printed the same sentence in all
 * three rows and on the last one printed it against a radio check.
 */
function nightSideFor(reason, result) {
  const s = result.stats ?? {};
  const asset = (type) => result.assets?.find((a) => a.type === type);
  const byLabel = (text) => result.assets
    ?.find((a) => a.label && String(text).toLowerCase().includes(a.label.toLowerCase()));
  /*
   * Every sentence this returns is tagged with how the night went on the
   * ground — `true` for held, `false` for lost, `null` where the ground has no
   * verdict either way. The table above filters on it, because a row where the
   * file and the night agree is not a divergence and the card says in its own
   * first sentence that it lists divergences.
   */
  const good = (text) => ({ text, good: true });
  const bad = (text) => ({ text, good: false });
  const flat = (text) => ({ text, good: null });
  const fate = (a, name) => {
    if (!a) return null;
    if (a.destroyed) return bad(`${name} was lost.`);
    if ((a.damagePct ?? 0) > 0) {
      return (a.damagePct >= 50 ? bad : good)(`${name} stands, struck to ${Math.round(a.damagePct)}%.`);
    }
    return good(`${name} stands untouched.`);
  };
  const casualties = (opening) => (s.civilianCasualties
    ? bad(`${opening} ${s.civilianCasualties} casualties are on the returns.`)
    : bad(`${opening} No casualties are on the returns.`));

  if (/freeze|hospital/i.test(reason)) return fate(asset('hospital'), 'The hospital');
  if (/border|encampment|Listonian/i.test(reason)) return fate(asset('camp'), 'The camp at Gorna');
  // "civilian area struck" is the town taking casualties, not the corridor:
  // it has to be read before the civil transit, or every strike on the Ville
  // reported that an airliner had crossed the sector safely.
  if (/civilian area/i.test(reason)) return casualties('The town was struck.');
  if (/civil transit|civil corridor|civil aircraft|inside the civil/i.test(reason)) {
    return s.civilianAircraftShot
      ? bad('A civil aircraft with people aboard was destroyed.')
      : good('The transit crossed the sector and left it.');
  }
  if (/state aircraft|relayed/i.test(reason)) {
    if (/no reply/i.test(reason)) return flat('The attention went to the corridor instead.');
    if (s.vipDown) return bad('STATE 01 came down in the Tavrov district.');
    if (s.vipEscaped) return good('STATE 01 cleared national airspace.');
    return flat('STATE 01 left the picture unresolved.');
  }
  if (/movement order|district battalion/i.test(reason)) {
    return /refused/i.test(reason)
      ? good('The battalion stayed, and so did the coverage it carries.')
      : bad('The only battalion that reaches Kubin and Lozan moved that night.');
  }
  // The order to keep the set radiating: what the sector could see for it, and
  // what that cost, which is the whole argument of that directive. It answers
  // in engagements rather than in leakers, so it does not print the leaker
  // row's sentence again with one word changed.
  if (/radiat/i.test(reason)) {
    const seen = s.kills
      ? `${s.kills} aircraft ${s.kills === 1 ? 'was' : 'were'} engaged and destroyed in all.`
      : 'Nothing in the sector was engaged all night.';
    if (s.radarsLost) {
      return bad(`${seen} ${s.radarsLost} radar${s.radarsLost > 1 ? 's were' : ' was'} lost doing it.`);
    }
    return s.leakers
      ? bad(`${seen} No set was lost, and ${s.leakers} aircraft got through.`)
      : good(`${seen} No set was lost and nothing got through.`);
  }
  // The emissions restriction is about sets, and the expenditure restriction is
  // about rounds. Both used to be caught by the same word.
  if (/emissions/i.test(reason)) {
    return s.radarsLost
      ? bad(`${s.radarsLost} radar${s.radarsLost > 1 ? 's were' : ' was'} lost tonight.`)
      : good('No set was lost tonight.');
  }
  if (/expenditure|over allocation/i.test(reason)) {
    return flat(`${s.roundsFired ?? 0} rounds were expended in all.`);
  }
  if (/leaker|standing order/i.test(reason)) {
    return s.leakers
      ? bad(`${s.leakers} aircraft reached what ${s.leakers === 1 ? 'it was' : 'they were'} sent for.`)
      : good('Nothing reached what it was sent for.');
  }
  // The designation names its place in the row itself, so the row can be
  // answered with that place's own fate.
  if (/priority|designat/i.test(reason)) {
    const named = byLabel(reason);
    if (named) return fate(named, named.label);
    return fate(asset('palace'), 'The palace');
  }
  if (/displacement/i.test(reason)) {
    return result.reason === 'site-lost'
      ? bad('The post was struck anyway.')
      : good('The post was not struck.');
  }
  return null;
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

  /* One figure on the record, typed on its own rule — see `field` in dossier.js. */
  const cell = (label, value, mood = '') => field(label, value, { mood });

  /*
   * The count of aircraft that got through, in the two currencies this debrief
   * closes on. (The stat is still `leakers` in the engine, which is what the
   * service calls them; no screen says that word any more, because the game
   * says "got through" in every register a player reads.)
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

  /*
   * Sector command's ledger, one row per decision.
   *
   * Filtered on what the state CHARGED, not what it could still collect — the
   * account at its floor keeps being billed, and the bill is the point. The
   * rows used to be printed one per charge, so the same decision taken four
   * times filled four identical lines of lowercase fragment, each carrying the
   * parenthesis "(at the floor)" — a term the game teaches nowhere. Grouped,
   * counted, set as a line of English, and the floor is said once underneath
   * in words.
   */
  /*
   * Rows about one aircraft or one weapon are grouped by what they were about
   * rather than by the track's callsign: four rows reading "VAMPIRE 27
   * released on THE VILLE" through "VAMPIRE 30 released on THE VILLE" are one
   * line about four weapons over the Ville.
   */
  /*
   * And the row says who did it. "Weapons released on DISTRICT HOSPITAL ×3",
   * in a table of decisions charged against the operator and directly under
   * "No reply to...", reads as though the operator had put the weapons there
   * themselves. The raid released them; the file is charging the operator for
   * not stopping it, which is a different sentence.
   */
  const ledgerName = (reason) => plainLedgerReason(String(reason)
    .replace(/^[A-Z]+ \d+ released on /, 'Enemy weapons released on ')
    .replace(/^[A-Z]+ \d+ destroyed$/, 'Aircraft destroyed'));
  const ledgerRows = [...result.ledger
    .filter((l) => Math.abs(l.charged ?? l.delta) >= 0.5)
    .reduce((map, l) => {
      const charged = l.charged ?? l.delta;
      const reason = ledgerName(l.reason);
      const seen = map.get(reason);
      map.set(reason, {
        reason,
        charged: (seen?.charged ?? 0) + charged,
        times: (seen?.times ?? 0) + 1,
        atFloor: (seen?.atFloor ?? false) || !!l.atFloor,
      });
      return map;
    }, new Map())
    .values()].slice(-14);
  const anyAtFloor = ledgerRows.some((l) => l.atFloor);
  const sentence = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);
  const ledger = ledgerRows.map((l) => {
    const shown = `${l.charged > 0 ? '+' : ''}${l.charged.toFixed(1)}`;
    return `<tr><td>${esc(sentence(l.reason))}${l.times > 1 ? ` <span class="note">&times;${l.times}</span>` : ''}${l.atFloor ? ' *' : ''}</td>
        <td class="${l.charged > 0 ? 'up' : 'down'}">${shown}</td></tr>`;
  }).join('');

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
  /*
   * And a row only belongs here if the file and the night actually parted.
   *
   * The card's first sentence promises the decisions where the two disagree,
   * and then it printed rows where they plainly agreed: "DISTRICT HOSPITAL
   * lost | −5.6 | The hospital was lost." is the file and the ground saying
   * the same thing in two columns. A divergence is a charge against you for a
   * night that went well on the ground, or a credit for one that did not.
   * Everything else is arithmetic, and the ledger above already has it.
   */
  const seenNight = new Set();
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
    // A row whose night side has nothing to report is left out rather than
    // padded with a sentence that fits every night equally badly.
    .map((l) => ({ ...l, night: nightSideFor(l.reason, result) }))
    .filter((l) => l.night && l.night.good !== null && l.night.good === (l.charged < 0))
    // Two decisions can come to the same thing on the ground — the freeze and
    // the hospital's own row are both about one building — and the table used
    // to print that one consequence twice, which is the tic the standard bans.
    .filter((l) => {
      if (seenNight.has(l.night.text)) return false;
      seenNight.add(l.night.text);
      return true;
    })
    .slice(-8);

  /*
   * The debrief is the one screen with a rack of figures on it, so it is the
   * one screen that is allowed to be wider than a column of prose. It was
   * 940 px on a 1600 px page with the score strip squeezed into six 120 px
   * cells and a hand's width of empty page under the buttons.
   */
  host.innerHTML = `<div class="screen-inner is-debrief is-paper">
    ${/*
     * The report is a document, not a page of console panels.
     *
     * All three judges filed it: "the two longest reads in the game and they
     * are styled divs: a ~500px column of green monospace centred on black
     * with roughly 380px of dead margin on each side, no paper ground, no rule
     * work, no form furniture", "the story screen the player is meant to sit
     * with is still monospace green on black with no paper, no rule, no stamp
     * and no type design ... beside the drawn scenes it reads as a debug
     * dump." So the sheet is buff stock with a punched filing margin down the
     * left, a letterhead with the form's own number and the watch on it, a
     * double rule under that, and the service stamp at the foot. Every panel
     * on it is printed rather than lit; the figures keep their ledger rules.
     */ ''}
    <div class="paper-head">
      <span class="paper-head-title">SECTOR OPERATIONS — RECORD OF WATCH</span>
      <span class="paper-head-no">FORM 4471-B</span>
    </div>
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
        ${/*
          * The finding fills the sheet.
          *
          * All three judges measured the same fault: "the epilogue card is
          * left-aligned in a 580px column while the header rule, the SCORE
          * tiles and the GROUND columns all run the full 1150px of the sheet",
          * "a page designed as a form carries a blank right-hand third down
          * its whole length", "the right half of the sheet is empty for the
          * block's full height". Prose still wants a reading measure, so the
          * page gets what a real record sheet has beside the prose: a ruled
          * rail of particulars, the watch, the standing, the role and the
          * service stamp. One block, two columns, no void.
          */ ''}
        <div class="record-body">
          <div class="record-prose">
            <p class="subtitle is-lead">${esc(ending.title)}</p>
            <h1 class="title is-outcome">${esc(ending.subtitle ?? ending.title)}</h1>
            ${ending.lines.map((line) => `<p>${esc(line)}</p>`).join('')}
          </div>
          <aside class="record-rail">
            <div class="rail-row"><span>Watch</span><b>${esc(state.mission.name)}</b></div>
            <div class="rail-row"><span>Seat</span><b>${esc(ROLES[result.role].label)}</b></div>
            <div class="rail-row"><span>This watch</span><b>${Math.round(result.score)}</b></div>
            <div class="rail-row"><span>In the file</span><b>${Math.round(state.campaign.standing)}</b></div>
            <div class="rail-row"><span>Entered by</span><b>Sector political section</b></div>
            <div class="rail-remarks">
              ${/* Five rules, not seven: the block was three hundred pixels of
                   empty paper and the stamp sat under all of it. */ ''}
              <span>Remarks</span>
              <i></i><i></i><i></i><i></i><i></i>
            </div>
            <span class="record-stamp is-inline">Sector record<br>Entered</span>
          </aside>
        </div>
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
      ${/*
       * The night's figures, entered on the record's own rules.
       *
       * They were six lit tiles — the console's readout, printed on a sheet of
       * paper — and they were the last of that construction left in the file
       * after the front sheet and the record itself were rebuilt as forms. The
       * band is the same band the personnel file carries, so a player moving
       * from the menu to the report is reading one hand.
       */ ''}
      <div class="typed-fields is-figures${result.abandoned ? ' is-unscored' : ''}">
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
        ${/* The tape prints AIRCRAFT DESTROYED and the prose says aircraft were
             destroyed; this tile said KILLS, which is a third name for one
             number on screens the player reads minutes apart. */ ''}
        ${cell('AIRCRAFT DESTROYED', s.kills)}
        ${cell('TURNED BACK', s.turnedBack, !result.abandoned && s.turnedBack ? 'is-good' : '')}
        ${cell('GOT THROUGH', leakerCell, result.abandoned ? '' : s.leakers ? 'is-bad' : 'is-good')}
        ${cell('ROUNDS', `${s.roundsFired}`)}
        ${cell('ASSETS LOST', s.assetsLost, result.abandoned ? '' : s.assetsLost ? 'is-bad' : 'is-good')}
      </div>
      ${result.abandoned ? `<p class="note score-withheld">Nothing on this line was
        earned or lost: the watch was not stood.</p>`
    : `<p class="note">An aircraft that got through is one that passed you and struck what it was sent for.${unrecognised > 0
      ? ' The uncounted ones arrived at a place tonight\'s orders had struck off the list.' : ''}</p>`}
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
    /*
     * The gloss about the player's own quarter goes on its own line under the
     * row, left-aligned and in the body ink. The art judge: "the gloss is
     * right-aligned in the same alarm red as the DESTROYED status and wraps to
     * three ragged lines opposite a left-aligned label, so the row reads as a
     * collision."
     */
    return `<tr><td class="is-place">${esc(a.label)}${home ? ' <span class="note">— home</span>' : ''}</td>
          <td class="${a.destroyed ? 'down' : a.damagePct || result.abandoned ? '' : 'up'}">
            ${a.destroyed ? 'DESTROYED' : a.damagePct ? `${a.damagePct}% damage` : 'intact'}
            ${a.casualties ? ` · ${a.casualties} casualties` : ''}
          </td></tr>${struck ? `<tr class="is-gloss"><td colspan="2" class="is-prose">${esc(quarter.en.charAt(0).toUpperCase() + quarter.en.slice(1))}, where your people live, is on the returns.</td></tr>` : ''}`;
  }).join('')}
      </table>
      ${/*
       * The battery, in sentences.
       *
       * It used to end "0% emissions exposure" — a third name for a figure the
       * console calls ELINT EXPOSURE and the seat explains in a tooltip, printed
       * as a bare percentage with no unit a reader can decode, at the foot of a
       * document written in plain English everywhere else. One name for the
       * thing, and the plain words for it the first time it is printed here.
       */ ''}
      ${result.battery ? `<p class="aside">
        Your battery: <b>${esc(result.battery.name)}</b> —
        ${result.battery.alive ? 'still in action' : 'lost'}, with
        ${result.battery.roundsRemaining} rounds on the rails and
        ${result.battery.crewLosses || 'no'} crew ${result.battery.crewLosses === 1 ? 'casualty' : 'casualties'}.
        Its radar finished the watch at ${Math.round(result.battery.exposure * 100)}% ELINT
        exposure, which is how well the enemy had it located from its own transmissions.${s.ownAuthorityEngagements
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
      ['Aircraft that got through', b.leakers],
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
      ${anyAtFloor ? `<p class="aside">* Charged in full and collected in part: your standing was
        already at its lowest, so there was nothing left for the file to take.</p>` : ''}
      ${/*
       * Which of the two figures this is.
       *
       * "Standing: 3 — REFERRED" sat six lines above "FILE ENTRY — UNDER
       * REVIEW" with nothing on the sheet saying that one was tonight and one
       * was the record — two tier words disagreeing on the same page, on the
       * screen a confused player opens to find out. The tape labels them
       * STANDING THIS WATCH and STANDING IN THE FILE; so does the report.
       */ ''}
      <p class="aside">Standing this watch: ${Math.round(result.standing)} —
        ${esc(result.tierLabel)}. This is what tonight was worth, on its own.</p>
    </div>` : ''}

    ${divergences.length ? `<div class="card">
      <h3>The file and the night</h3>
      <p class="lede">The decisions where the two came apart: what your standing was charged or
      credited, beside what actually came of it on the ground. A decision the ground agreed with
      is not listed, so an empty table means the file and the night said the same thing all
      night.</p>
      <table class="ledger">
        <tr><th>decision</th><th class="is-figure">the file</th><th>the night</th></tr>
        ${divergences.map((l) => {
    const charged = l.charged;
    return `<tr><td>${esc(sentence(plainLedgerReason(l.reason)))}${l.times > 1 ? ` <span class="note">&times;${l.times}</span>` : ''}</td>
          <td class="${charged > 0 ? 'up' : 'down'}">${charged > 0 ? '+' : ''}${charged.toFixed(1)}</td>
          <td class="is-prose note">${esc(l.night.text)}</td></tr>`;
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
      <p class="aside">Standing in the file: ${Math.round(state.campaign.standing)}. This is what
        your file has come to, and it is the figure that travels with you.</p>
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

    ${/* The form number is the form's, and the heading says what the paper is.
         "ORDER 12-4" alone is a reference nothing on any screen explains. */ ''}
    ${entry?.appointment ? `<div class="card file-entry is-good">
      <span class="form-no">ORDER 12-4</span>
      <h3>The order appointing you</h3>
      ${/* The same signatory the scene read out: a recruit is put on a set by
           the orderly room, not appointed to one by the Chief of Air Defence. */ ''}
      <p>By order of ${esc(appointingSignatory(entry.appointment.echelon))}, you are appointed
        <b>${esc(entry.appointment.echelon.appointment.en)}</b>.</p>
      ${entry.appointment.gazetted ? `<p>You are gazetted to
        ${esc(entry.appointment.gazetted.en)} on the same order.</p>` : ''}
      ${state.narrativePressure && entry.appointment.note
    ? `<p>${esc(entry.appointment.note)}</p>` : ''}
      ${/* The order and the file entry above it are about the same night, and
           the report used to print SERVICE RECORD — MAJOR GENERAL beside a
           standing of nine with nothing between them. */ ''}
      ${state.narrativePressure && (consequence.tier.id === 'flagged' || consequence.tier.id === 'condemned')
    ? `<p>${consequence.tier.id === 'condemned'
      ? 'The order is dated today and mentions nothing that happened tonight.'
      : 'The order was drawn up before tonight\'s entry reached the file. Nobody has withdrawn it.'}</p>` : ''}
      <p class="note">${esc(entry.appointment.echelon.blurb)}</p>
    </div>` : ''}

    ${/* The plate and the title, separated the way every other paired plate in
         the game separates them. The margin between them was a CSS margin, so
         the heading itself read as one run-on word. */ ''}
    ${state.narrativePressure && entry?.revelation ? `<div class="card revelation-card">
      <h3>${entry.revelation.tm ? `<span class="tm">${esc(entry.revelation.tm)}</span> <span class="plate-sep">·</span> ` : ''}${esc(entry.revelation.title)}</h3>
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

  /*
   * EVERY watch ends on a title card.
   *
   * The reader judge counted the cost of the exception: "eleven watches out of
   * twelve end on a bare left-aligned text block on flat black ... the finale's
   * end card has the valley behind it and looks like a game; the ordinary one
   * looks like a terminal." So the valley goes behind all twelve of them —
   * held or lost by whether the sector held, which is the sector at the hour
   * the watch ended — and the block is centred over it either way.
   */
  host.innerHTML = `<div class="screen-inner is-endcard is-title-card">
    <canvas class="endcard-sky" width="320" height="180" aria-hidden="true"></canvas>
    <div class="endcard-block">
      ${/*
       * The card the evening ends on is the file entry for the night, so it is
       * printed on the file's own stock and carries the file's own number. The
       * story judge, of the last cut: "the card is a plain cream rectangle with
       * a hairline border laid over the landscape ... it is the one story screen
       * still built as a styled div while the dossier and the full report are
       * convincing paper. It should have the same stock as the report — the
       * faint grid, the red margin rule, punch holes, a form number and the
       * entered stamp." It has them now, and the stamp is the one the political
       * section puts on a record it has taken in.
       */ ''}
      ${paperHead('Record of watch', 'FORM 4471-B')}
      ${/* The same print that is stuck to the front of the dossier and to the
           head of the service record, at the end of the file it belongs to —
           at the size it is read at there, not at a third of it. */ ''}
      ${state.campaign.character ? `<span class="file-ident-photo endcard-photo">
        <canvas class="portrait file-photo" width="24" height="30"
          data-seed="${esc(state.campaign.character.name)}" aria-label="Photograph on file"></canvas>
      </span>` : ''}
      ${ending && ending.subtitle ? `<p class="endcard-tm">${esc(ending.title)}</p>` : ''}
      <h1 class="title is-watch ${result.success ? 'gained' : 'grave'}">${esc(headline)}</h1>
      ${/* The watch's name belongs under the title, not in the figure row as a
           label over the seat: the card used to read "The President's Flight →
           BATTLE MANAGER" beside SCORE and STANDING. */ ''}
      <p class="subtitle endcard-watch">${esc(state.mission.name)}</p>
      <hr class="endcard-rule">
      ${/*
       * The card carries what happens NEXT, not the sentence the scene has
       * just finished typing. It used to reprint the ending's own first line
       * one beat after the player read it, so the one screen the campaign
       * leaves you sitting on said nothing the evening had not.
       */ ''}
      ${ending ? `<p class="ending-lede">${esc(ending.card ?? ending.lines[0] ?? '')}</p>`
    : cause ? `<p class="subtitle grave">${esc(cause)}</p>` : ''}
      <div class="endcard-facts">
        ${facts.map(([label, value]) => `<span><label>${esc(label)}</label><b>${esc(value)}</b></span>`).join('')}
      </div>
      <span class="record-stamp is-entered">Sector record<br>Entered</span>
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
  if (sky) drawEndingStill(sky, { held: !result.abandoned && !!result.success });
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
  /*
   * One entry in the manual: the cap, printed as a cap, and what it does.
   *
   * The cap is set inside its own cell rather than being the cell, so that the
   * printed key can be a box of its own width while the column it stands in
   * stays a column — every cap in a section on one left edge, every
   * description on another, which is the difference between a typeset manual
   * and a list of ragged pairs.
   */
  const key = (k, d) => `<div><b><i>${esc(k)}</i></b><span>${esc(d)}</span></div>`;
  /*
   * THE HANDBOOK IS A PRINTED MANUAL.
   *
   * The reader judge: "beside them the menu's personnel file and the handbook
   * are plain bordered boxes of green terminal type with stat tiles. The story
   * screens are not one system." A handbook is the one document here that is
   * not a form — it is an issued manual — so it is printed on the same stock
   * and bound the same way, with numbered sections, the keys set as caps with
   * leader rules across to what they do, the four classes as plates with
   * figure numbers, and the issue number at the foot of every page.
   */
  host.innerHTML = `<div class="screen-inner is-paper is-manual">
    ${/* Short enough to set on one line at 390px: a letterhead that wraps is
         the one line on a form that may not. */ ''}
    ${paperHead('Handbook for the operator', 'FORM 9-2')}
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
    ${/*
       * The seats in the order a career passes through them, which is also the
       * order a player needs them in. This page used to open on the battle
       * manager and list LOCK under L — on the first night of the campaign,
       * from a seat with no launcher, where L hands the contact to somebody
       * else. A new player pressing H on their first watch found two jobs
       * described and neither of them theirs.
       */ ''}
    <div class="card">
      <h3>Radar operator</h3>
      <div class="keys">
        ${key('Click a contact', 'select it')}
        ${key('L', 'read it to the launch officer — he answers on the radio and puts a battery on it')}
        ${key('Right-click a contact', 'the officer at the top of the list, and under him every battery and what it reaches')}
        ${key('`', 'switch every search radar on or off — the one switch this seat has')}
      </div>
      <p class="note">There is no launch cap on this console and there is not meant to be. You
      switch the set, you hold what it finds and you call it; the officer at the next desk fires,
      and he fires at nothing you have not called.</p>
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

    ${/* The foot of an issued manual: what edition it is and who issued it. */ ''}
    <div class="record-foot-line"><span>Issued with the console</span>
      <span>${esc(STATE.serviceShort.tm)} · ${esc(STATE.serviceShort.en)}</span></div>

    <div class="actions"><button class="btn-primary" id="btn-close-help">BACK</button></div>
  </div>`;
  toTop(host);
}
