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

import { SCENARIOS, isUnlocked, appointmentOf } from '../engine/scenarios.js';
import { ECHELON_ORDER } from '../engine/echelon.js';
import { DIFFICULTY, ROLES, SAM_TYPES, DEFENCE_CLASSES } from '../engine/config.js';
import { consequenceFor, briefingNote } from '../engine/campaign.js';
import { tierFor } from '../engine/command.js';
import { THEMES } from './themes.js';
import { rankOf, backgroundOf, householdOf, districtOf } from '../engine/character.js';
import { serviceSummary, abandonedRecord } from './dossier.js';
import { STATE } from './lexicon.js';
import { rankInsignia } from './insignia.js';
import { composeEnding, endingSummary } from '../engine/endings.js';
import { composeFlightEnding, flightEndingSummary } from '../engine/epilogue.js';
import { standing as arcStanding } from '../engine/revelations.js';
import { briefLine } from '../engine/family.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

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
      const held = ECHELON_ORDER.find((e) => e.id === sc.echelon).order <= appointment.order;
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
          <span class="pill">${esc(THEMES[sc.theme].label)}</span>
          ${sc.roles.length === 1 ? `<span class="pill tight">${esc(ROLES[sc.roles[0]].label)} ONLY</span>` : ''}
          ${done ? `<span class="pill free">BEST ${done.score}</span>` : ''}
        </div>
      </button>`;
  };

  host.innerHTML = `<div class="screen-inner">
    <h1 class="title">IADSVILLE</h1>
    <p class="subtitle">${esc(STATE.country.en)} · ${esc(STATE.service.en)} · SECTOR 4-B</p>

    <div class="card">
      <p>A raid is coming for the town you are sitting under. You have radars that can see only
      while they are radiating, batteries with more targets than rounds, and a command that reads
      your log afterwards.</p>
      <p class="note">While a radar is on, the enemy can find it. Knowing when to radiate and when to
      go silent is the whole job.</p>
    </div>

    <div class="card record-card">
      <div class="record-stamp">${esc(tier.label)}</div>
      <h3>Personnel file${character ? ` — ${rankInsignia(character.rankIndex, { size: 14 })} ${esc(rank.en)} ${esc(character.name)}` : ''}</h3>
      <div class="score-grid">
        <div class="score-cell is-word"><label>RANK</label><b>${character ? rankInsignia(character.rankIndex, { size: 16 }) : ''}${esc(rank?.en ?? '—')}</b></div>
        <div class="score-cell is-word"><label>APPOINTMENT</label>
          <b>${esc(appointment.en)}</b></div>
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
        ${esc(backgroundOf(character).en)}, of the Ville · ${esc(householdOf(character).en)}.
        ${character.decorations.length ? `${character.decorations.length} decoration${character.decorations.length > 1 ? 's' : ''} on file.` : ''}
        ${character.points ? '<b class="urgent"> Training points unspent.</b>' : ''}</p>` : ''}
    </div>

    <div class="card">
      <h3>Select a watch</h3>
      <p class="lede">
        You currently hold <b class="urgent">${esc(appointment.appointment.en)}</b>. ${esc(appointment.blurb)}</p>
      ${ECHELON_ORDER.map((echelon) => {
    const watches = SCENARIOS.filter((sc) => sc.echelon === echelon.id);
    if (!watches.length) return '';
    const reached = echelon.order <= appointment.order;
    return `<div class="act ${reached ? '' : 'is-locked'}">
          <div class="act-head">
            <span class="lg"><b>${esc(echelon.en.toUpperCase())} COMMAND</b></span>
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
        <label><input type="checkbox" id="opt-theme-lock" ${state.themeOverride ? 'checked' : ''}> Force theme:</label>
        <select id="theme-pick" class="btn" ${state.themeOverride ? '' : 'disabled'}>
          ${Object.values(THEMES).map((t) => `<option value="${t.id}" ${state.themeOverride === t.id ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="actions">
      <button class="btn-primary" id="btn-brief">TAKE THE WATCH</button>
      <button class="btn" id="btn-dossier">DOSSIER</button>
      <button class="btn" id="btn-keys">CONTROLS</button>
      ${flown ? '<button class="btn is-danger" id="btn-wipe">DESTROY FILE</button>' : ''}
    </div>
  </div>`;
}

/* ---------------------------------------------------------- briefing */

export function renderBriefing(host, state) {
  const mission = state.mission;
  const consequence = consequenceFor(state.campaign, { narrativePressure: state.narrativePressure });
  const note = briefingNote(state.campaign, { narrativePressure: state.narrativePressure });
  const role = ROLES[state.role];
  const battery = state.role !== 'net'
    ? mission.sites.find((s) => s.id === state.batteryId) ?? mission.sites[0]
    : null;

  const character = state.campaign.character;
  const rank = character ? rankOf(character) : null;

  host.innerHTML = `<div class="screen-inner">
    <h1 class="title is-watch">${esc(mission.name)}</h1>
    <p class="subtitle">${esc(mission.subtitle)}</p>
    ${character ? `<div class="card record-card is-tight">
      <div class="record-stamp">${esc(STATE.serviceShort.tm)}</div>
      <p>Posting order for <b>${rankInsignia(character.rankIndex, { size: 14 })} ${esc(rank.en)} ${esc(character.name)}</b>.
      Origin: ${esc(backgroundOf(character).en)}. Home: ${esc(STATE.town.en)}, ${esc(STATE.country.en)}.
      ${character.wounded ? '<span class="grave">Returned to duty against medical advice.</span>' : ''}</p>
    </div>` : ''}

    ${note ? `<div class="card"><p class="note quoted">${esc(note)}</p></div>` : ''}

    ${state.narrativePressure && briefLine(state.campaign, mission.id) ? `<div class="card">
      <p class="quoted">${esc(briefLine(state.campaign, mission.id))}</p>
    </div>` : ''}

    ${state.narrativePressure && arcStanding(state.campaign) ? `<div class="card file-entry">
      <h3>What you know</h3>
      <p>${esc(arcStanding(state.campaign))}</p>
    </div>` : ''}

    <div class="card">
      <h3>Situation</h3>
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
      <p class="note">This watch teaches: ${esc(mission.teaches)}</p>
    </div>

    <div class="card ${consequence.tier.id === 'commended' ? 'file-entry is-good' : consequence.tier.id === 'satisfactory' ? '' : 'file-entry'}">
      <h3>${esc(consequence.title)}</h3>
      ${consequence.lines.map((l) => `<p>${esc(l)}</p>`).join('')}
    </div>

    <div class="actions">
      <button class="btn-primary" id="btn-start">BEGIN</button>
      <button class="btn" id="btn-back">BACK</button>
    </div>
  </div>`;
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
  if (/civil/i.test(reason)) {
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
  if (/priority/i.test(reason)) {
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
  const divergences = result.ledger
    .filter((l) => {
      const charged = l.charged ?? l.delta;
      return Math.abs(charged) >= 2 && /civil|hospital|encampment|freeze|border|priority|state aircraft|movement order|Listonian|relayed/i.test(l.reason);
    })
    .slice(-8);

  /*
   * The debrief is the one screen with a rack of figures on it, so it is the
   * one screen that is allowed to be wider than a column of prose. It was
   * 940 px on a 1600 px page with the score strip squeezed into six 120 px
   * cells and a hand's width of empty page under the buttons.
   */
  host.innerHTML = `<div class="screen-inner is-debrief">
    ${ending ? `
      <p class="subtitle is-lead">${esc(ending.title)}</p>
      <h1 class="title is-outcome">${esc(ending.subtitle ?? ending.title)}</h1>
      <div class="card ending-card">
        ${ending.lines.map((line) => `<p>${esc(line)}</p>`).join('')}
      </div>
      <p class="subtitle is-tail">${esc(state.mission.name)} · ${esc(ROLES[result.role].label)}</p>
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
        ${Math.round(result.battery.exposure * 100)}% emissions exposure.</p>` : ''}
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
      <h3>THE FILE AND THE NIGHT</h3>
      <p class="lede">What each decision did to your file, beside
      what the night actually was. When these two columns agree, this table is empty.</p>
      <table class="ledger">
        <tr><th>decision</th><th class="is-figure">the file</th><th>the night</th></tr>
        ${divergences.map((l) => {
    const charged = l.charged ?? l.delta;
    return `<tr><td>${esc(l.reason)}</td>
          <td class="${charged > 0 ? 'up' : 'down'}">${charged > 0 ? '+' : ''}${charged.toFixed(1)}</td>
          <td class="is-prose note">${esc(nightSideFor(l.reason, result))}</td></tr>`;
  }).join('')}
      </table>
      <p class="aside">The night itself is the score above: ${result.score}.
      The file does not read the score, and the score does not read the file.</p>
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
      <h3>${esc(consequence.title)}</h3>
      ${consequence.lines.map((l) => `<p>${esc(l)}</p>`).join('')}
    </div>`}

    ${state.narrativePressure && entry?.letter ? `<div class="card letter-card">
      <h3>${esc(entry.letter.title)}</h3>
      ${entry.letter.note ? `<p class="note quoted">${esc(entry.letter.note)}</p>` : ''}
      ${entry.letter.lines.map((l) => `<p>${esc(l)}</p>`).join('')}
    </div>` : ''}

    ${entry?.appointment ? `<div class="card file-entry is-good">
      <h3>ORDER OF APPOINTMENT</h3>
      <p><b>${esc(entry.appointment.echelon.appointment.en)}</b></p>
      ${entry.appointment.gazetted ? `<p>You are gazetted to
        ${esc(entry.appointment.gazetted.en)} on the same order.</p>` : ''}
      ${state.narrativePressure && entry.appointment.note
    ? `<p>${esc(entry.appointment.note)}</p>` : ''}
      <p class="note">${esc(entry.appointment.echelon.blurb)}</p>
    </div>` : ''}

    ${state.narrativePressure && entry?.revelation ? `<div class="card revelation-card">
      <h3>${esc(entry.revelation.title)}</h3>
      ${entry.revelation.lines.map((l) => `<p>${esc(l)}</p>`).join('')}
    </div>` : ''}

    <div class="actions">
      <button class="btn-primary" id="btn-again">STAND ANOTHER WATCH</button>
      <button class="btn" id="btn-replay">REPLAY THIS ONE</button>
      ${state.campaign.character ? '<button class="btn" id="btn-dossier-debrief">DOSSIER</button>' : ''}
      <button class="btn" id="btn-close-report">CLOSE THE REPORT</button>
    </div>
  </div>`;
}

/**
 * The card the evening ends on.
 *
 * The scenes have said what happened; this is one line of it and the ways
 * out. The full report — the page of tables the debrief used to be — is one
 * button away, and so is watching the evening again.
 */
export function renderEndCard(host, state, result) {
  host.innerHTML = `<div class="screen-inner is-endcard">
    <h1 class="title is-watch ${result.success ? 'gained' : 'grave'}">${esc(result.headline)}</h1>
    ${result.cause ? `<p class="subtitle grave">${esc(result.cause)}</p>` : ''}
    <p class="subtitle">${esc(state.mission.name)} · ${esc(ROLES[result.role].label)}${
  result.abandoned ? ' · not scored' : ` · score ${result.score} · standing ${Math.round(result.standing)}, ${esc(result.tierLabel)}`}</p>
    <div class="actions">
      <button class="btn-primary" id="btn-again">STAND ANOTHER WATCH</button>
      <button class="btn" id="btn-replay">REPLAY THIS ONE</button>
      <button class="btn" id="btn-report">THE FULL REPORT</button>
      <button class="btn" id="btn-scenes">THE EVENING AGAIN</button>
      ${state.campaign.character ? '<button class="btn" id="btn-dossier-debrief">DOSSIER</button>' : ''}
    </div>
  </div>`;
}

/* ------------------------------------------------------------- help */

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
        ${key('A', 'your radar switch — up is RADIATE (you can see and shoot, and be found), down is SILENCE (this is the whole game)')}
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
      <table class="ledger">
        ${Object.values(DEFENCE_CLASSES).map((c) => {
    const sys = Object.values(SAM_TYPES).find((t) => t.class === c.id);
    return `<tr><td><b>${esc(c.en)}</b> <span class="stencil note">${esc(c.tm)}</span><br>
      <span class="note">${esc(c.blurb)}</span></td>
      <td>${esc(sys.label)}<br><span class="note">${sys.minRangeKm}–${sys.maxRangeKm} km<br>
      ${sys.minAltM}–${sys.maxAltM} m</span></td></tr>`;
  }).join('')}
      </table>
    </div>

    <div class="card">
      <h3>What is actually going on</h3>
      <p>A radar only sees a target when its beam sweeps that bearing, and it cannot see through
      the horizon at all — which is why a contact at ninety metres appears close and stays close.</p>
      <p>A surface-to-air round is guided by the radar that launched it. Shut that radar down and the
      round in flight goes stupid. Leave it up and the suppression aircraft finds you.</p>
      <p>Sector operations fuses every radar into one picture. Lose it and each set reports for
      itself: the same aircraft grows a track number on every radar that can see it, and nobody
      reconciles them.</p>
    </div>
    <div class="actions"><button class="btn-primary" id="btn-close-help">BACK</button></div>
  </div>`;
}
