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

import { SCENARIOS } from '../engine/scenarios.js';
import { DIFFICULTY, ROLES, SAM_TYPES, COMMAND, DEFENCE_CLASSES } from '../engine/config.js';
import { consequenceFor, briefingNote } from '../engine/campaign.js';
import { tierFor } from '../engine/command.js';
import { THEMES, applyTheme } from './themes.js';
import { clockString } from '../engine/math.js';
import { rankOf, backgroundOf, householdOf, districtOf } from '../engine/character.js';
import { serviceSummary } from './dossier.js';
import { STATE } from './lexicon.js';
import { composeEnding, ENDINGS, endingSummary } from '../engine/endings.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ------------------------------------------------------------- title */

export function renderMenu(host, state, actions) {
  const campaign = state.campaign;
  const tier = tierFor(campaign.standing);
  const flown = campaign.history.length;

  const character = campaign.character;
  const rank = character ? rankOf(character) : null;

  host.innerHTML = `<div class="screen-inner">
    <h1 class="title">IADSVILLE</h1>
    <p class="subtitle">${esc(STATE.country.tm)} · ${esc(STATE.service.en)} · sector 4-B</p>

    <div class="card">
      <p>A raid is coming for the town you are sitting under. You have radars that can see only
      while they are radiating, batteries with more targets than rounds, and a command that reads
      your log afterwards.</p>
      <p style="color:var(--ink-dim)">Emit to see. Emit to shoot. Emit and they will find you. Pick two.</p>
    </div>

    <div class="card record-card">
      <div class="record-stamp">${esc(tier.label)}</div>
      <h3>Personnel file${character ? ` — ${esc(rank.tm)} ${esc(character.name)}` : ''}</h3>
      <div class="score-grid">
        <div class="score-cell"><label>ЗВАНИЕ · RANK</label><b style="font-size:13px">${esc(rank?.en ?? '—')}</b></div>
        <div class="score-cell"><label>АТТЕСТАЦИЯ · STANDING</label><b>${Math.round(campaign.standing)}</b></div>
        <div class="score-cell"><label>ОПЫТ · EXPERIENCE</label><b>${character?.xp ?? 0}</b></div>
        <div class="score-cell"><label>ВАХТ · WATCHES</label><b>${flown}</b></div>
        <div class="score-cell ${character?.points ? 'is-good' : ''}"><label>ПОДГОТОВКА · TRAINING</label><b>${character?.points ?? 0}</b></div>
        <div class="score-cell ${character?.wounded ? 'is-bad' : ''}"><label>СОСТОЯНИЕ · CONDITION</label>
          <b style="font-size:13px">${character?.wounded ? 'РАНЕН' : 'ГОДЕН'}</b></div>
      </div>
      ${campaign.ending ? `<p style="margin-top:9px;color:var(--hostile)">
        <b>${esc(endingSummary(campaign.ending) ?? '')}</b> — the last watch has been stood.</p>` : ''}
      ${character ? `<p style="color:var(--ink-dim);margin-top:9px">
        ${esc(backgroundOf(character).en)}, of the Ville · ${esc(householdOf(character).en)}.
        ${character.decorations.length ? `${character.decorations.length} decoration${character.decorations.length > 1 ? 's' : ''} on file.` : ''}
        ${character.points ? '<b style="color:var(--accent)"> Training points unspent.</b>' : ''}</p>` : ''}
    </div>

    <div class="card">
      <h3>Select a watch</h3>
      <div class="mission-grid">
        ${SCENARIOS.map((s) => {
    const done = campaign.completed[s.id];
    const active = state.missionId === s.id;
    return `<button class="mission ${active ? 'is-active' : ''}" data-mission="${s.id}">
            <b>${esc(s.name)}</b>
            <small>${esc(s.subtitle)}</small>
            <div class="flags">
              <span class="pill">${esc(THEMES[s.theme].label)}</span>
              ${s.roles.length === 1 ? `<span class="pill tight">${esc(ROLES[s.roles[0]].label)} ONLY</span>` : ''}
              ${done ? `<span class="pill free">BEST ${done.score}</span>` : ''}
            </div>
          </button>`;
  }).join('')}
      </div>
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
          <b>${esc(d.label)}</b><small>Raid ×${d.raidScale} · their accuracy ×${d.armAccuracyMult} · command ×${d.directiveRate}</small>
        </button>`).join('')}
      </div>
      <div class="toggle-row">
        <label><input type="checkbox" id="opt-pressure" ${state.narrativePressure ? 'checked' : ''}> Narrative pressure</label>
        <span style="opacity:.7">— sector command's file entries and the consequences of failing them. Turn it off for the simulation alone.</span>
      </div>
      <div class="toggle-row">
        <label><input type="checkbox" id="opt-audio" ${state.audio ? 'checked' : ''}> Sound</label>
        <label style="margin-left:12px"><input type="checkbox" id="opt-theme-lock" ${state.themeOverride ? 'checked' : ''}> Force theme:</label>
        <select id="theme-pick" class="btn" ${state.themeOverride ? '' : 'disabled'}>
          ${Object.values(THEMES).map((t) => `<option value="${t.id}" ${state.themeOverride === t.id ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="actions">
      <button class="btn-primary" id="btn-brief">TAKE THE WATCH</button>
      <button class="btn" id="btn-dossier">ЛИЧНОЕ ДЕЛО · DOSSIER</button>
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
    <h1 class="title" style="font-size:34px">${esc(mission.name)}</h1>
    <p class="subtitle">${esc(mission.subtitle)}</p>
    ${character ? `<div class="card record-card" style="padding:9px 14px">
      <div class="record-stamp">${esc(STATE.serviceShort.tm)}</div>
      <p style="margin:0">Posting order for <b>${esc(rank.tm)} ${esc(character.name)}</b>.
      Origin: ${esc(backgroundOf(character).en)}. Home: ${esc(STATE.town.en)}, ${esc(STATE.country.en)}.
      ${character.wounded ? '<span style="color:var(--hostile)">Returned to duty against medical advice.</span>' : ''}</p>
    </div>` : ''}

    ${note ? `<div class="card"><p style="color:var(--ink-dim);font-style:italic">${esc(note)}</p></div>` : ''}

    <div class="card">
      <h3>Situation</h3>
      ${mission.brief.map((line) => `<p>${esc(line)}</p>`).join('')}
    </div>

    <div class="card">
      <h3>Your seat — ${esc(role.label)}</h3>
      <p>${esc(role.blurb)}</p>
      ${battery ? `<p style="color:var(--ink-dim)">You are crewing <b>${esc(battery.name)}</b> —
        ${esc(SAM_TYPES[battery.type].label)}, ${esc(DEFENCE_CLASSES[SAM_TYPES[battery.type].class].en.toLowerCase())}.
        ${SAM_TYPES[battery.type].minRangeKm}–${SAM_TYPES[battery.type].maxRangeKm} km,
        ${SAM_TYPES[battery.type].minAltM}–${SAM_TYPES[battery.type].maxAltM} m,
        ${SAM_TYPES[battery.type].channels} channels, ${SAM_TYPES[battery.type].readyRounds} rounds on the rails.</p>
        <p style="color:var(--ink-dim);font-style:italic">${esc(DEFENCE_CLASSES[SAM_TYPES[battery.type].class].blurb)}</p>` : ''}
      <p style="color:var(--ink-dim)">This watch teaches: ${esc(mission.teaches)}</p>
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

export function renderDebrief(host, state, result, entry) {
  const consequence = consequenceFor(state.campaign, { narrativePressure: state.narrativePressure });

  /*
   * The last watch does not get a debrief so much as an outcome. The ending is
   * read off what was actually defended and is placed above the arithmetic,
   * because on this one night the arithmetic is not the point.
   */
  const ending = result.finale
    ? composeEnding(result, state.campaign.character, { narrativePressure: state.narrativePressure })
    : null;
  const b = result.breakdown;
  const s = result.stats;

  const cell = (label, value, mood = '') =>
    `<div class="score-cell ${mood}"><label>${esc(label)}</label><b>${esc(value)}</b></div>`;

  const ledger = result.ledger
    .filter((l) => Math.abs(l.delta) >= 0.5)
    .slice(-14)
    .map((l) => `<tr><td>${esc(l.reason)}</td><td class="${l.delta > 0 ? 'up' : 'down'}">${l.delta > 0 ? '+' : ''}${l.delta.toFixed(1)}</td></tr>`)
    .join('');

  host.innerHTML = `<div class="screen-inner">
    ${ending ? `
      <h1 class="title" style="font-size:30px">${esc(ending.title)}</h1>
      <p class="subtitle">${esc(ending.subtitle ?? '')}</p>
      <div class="card ending-card">
        ${ending.lines.map((line) => `<p>${esc(line)}</p>`).join('')}
      </div>
      <p class="subtitle" style="margin-top:18px">${esc(state.mission.name)} · ${esc(ROLES[result.role].label)}</p>
    ` : `
      <h1 class="title" style="font-size:32px;color:${result.success ? 'var(--good)' : 'var(--hostile)'}">${esc(result.headline)}</h1>
      <p class="subtitle">${esc(state.mission.name)} · ${esc(ROLES[result.role].label)}</p>
    `}

    <div class="card">
      <h3>Score</h3>
      <div class="score-grid">
        ${cell('TOTAL', result.score, result.score > 0 ? 'is-good' : 'is-bad')}
        ${cell('KILLS', s.kills)}
        ${cell('TURNED BACK', s.turnedBack, s.turnedBack ? 'is-good' : '')}
        ${cell('LEAKERS', s.leakers, s.leakers ? 'is-bad' : 'is-good')}
        ${cell('ROUNDS', `${s.roundsFired}`)}
        ${cell('ASSETS LOST', s.assetsLost, s.assetsLost ? 'is-bad' : 'is-good')}
      </div>
    </div>

    <div class="card">
      <h3>Ground</h3>
      <table class="ledger">
        ${result.assets.map((a) => {
    const home = a.type === 'town' && state.campaign.character;
    const quarter = home ? districtOf(state.campaign.character) : null;
    const struck = home && a.districtsHit?.includes(quarter.id);
    return `<tr><td>${esc(a.label)}${home ? ' <span style="color:var(--ink-dim)">— home</span>' : ''}</td>
          <td class="${a.destroyed ? 'down' : a.damagePct ? '' : 'up'}">
            ${a.destroyed ? 'DESTROYED' : a.damagePct ? `${a.damagePct}% damage` : 'intact'}
            ${a.casualties ? ` · ${a.casualties} casualties` : ''}
            ${struck ? `<br><span style="color:var(--hostile)">${esc(quarter.tm)} — ${esc(quarter.en)}, where your people live, is on the returns.</span>` : ''}
          </td></tr>`;
  }).join('')}
      </table>
      ${result.battery ? `<p style="margin-top:8px;color:var(--ink-dim)">
        Your battery: <b>${esc(result.battery.name)}</b> —
        ${result.battery.alive ? 'still in action' : 'lost'},
        ${result.battery.roundsRemaining} rounds on the rails,
        ${result.battery.crewLosses} crew casualties,
        ${Math.round(result.battery.exposure * 100)}% emissions exposure.</p>` : ''}
    </div>

    <div class="card">
      <h3>Points</h3>
      <table class="ledger">
        ${[
    ['Ground preserved', b.assets],
    ['Aircraft destroyed', b.kills],
    ['Sorties turned back', b.turnedBack],
    ['Leakers', b.leakers],
    ['Rounds expended', b.rounds],
    ['Equipment lost', b.equipment],
    ['Civilian harm', b.civilian],
  ].filter(([, v]) => v !== 0).map(([label, value]) =>
    `<tr><td>${esc(label)}</td><td class="${value > 0 ? 'up' : 'down'}">${value > 0 ? '+' : ''}${value}</td></tr>`).join('')}
      </table>
    </div>

    ${serviceSummary(state.campaign.character, entry?.service, state.campaign)}

    ${ledger ? `<div class="card">
      <h3>Sector command's ledger</h3>
      <table class="ledger">${ledger}</table>
      <p style="margin-top:8px;color:var(--ink-dim)">Standing: ${Math.round(result.standing)} — ${esc(result.tierLabel)}</p>
    </div>` : ''}

    <div class="card ${consequence.tier.id === 'commended' ? 'file-entry is-good' : 'file-entry'}">
      <h3>${esc(consequence.title)}</h3>
      ${consequence.lines.map((l) => `<p>${esc(l)}</p>`).join('')}
    </div>

    <div class="actions">
      <button class="btn-primary" id="btn-again">STAND ANOTHER WATCH</button>
      <button class="btn" id="btn-replay">REPLAY THIS ONE</button>
      ${state.campaign.character ? '<button class="btn" id="btn-dossier-debrief">ЛИЧНОЕ ДЕЛО · DOSSIER</button>' : ''}
    </div>
  </div>`;
}

/* ------------------------------------------------------------- help */

export function renderControls(host) {
  const key = (k, d) => `<div><b>${esc(k)}</b><span>${esc(d)}</span></div>`;
  host.innerHTML = `<div class="screen-inner">
    <h1 class="title" style="font-size:28px">CONTROLS</h1>
    <div class="card">
      <h3>Everywhere</h3>
      <div class="keys">
        ${key('Space', 'pause / resume')}
        ${key('1 – 4', 'game speed')}
        ${key('+ / −', 'zoom the scope')}
        ${key('Tab', 'switch seat (commander only)')}
        ${key('Y / N', 'acknowledge or refuse a directive')}
        ${key('M', 'the map of Trans Mordovia under the picture')}
        ${key('H', 'this screen')}
      </div>
    </div>
    <div class="card">
      <h3>Battle manager</h3>
      <div class="keys">
        ${key('Click a contact', 'select it')}
        ${key('Drag contact → battery', 'assign the engagement')}
        ${key('Q W E', 'weapons hold / tight / free on the selected battery')}
        ${key('R', 'reload the selected battery')}
        ${key('X', 'displace the selected battery')}
        ${key('E', 'toggle the selected battery’s radar')}
        ${key('`', 'toggle every surveillance radar')}
      </div>
    </div>
    <div class="card">
      <h3>SAM operator</h3>
      <div class="keys">
        ${key('Click a contact', 'designate it')}
        ${key('L', 'lock — start the engagement sequence')}
        ${key('F', 'fire')}
        ${key('E', 'radiate / shut down (this is the whole game)')}
        ${key('S', 'salvo size')}
        ${key('R', 'reload')}
        ${key('X', 'displace')}
      </div>
    </div>
    <div class="card">
      <h3>The four classes of air defence</h3>
      <table class="ledger">
        ${Object.values(DEFENCE_CLASSES).map((c) => {
    const sys = Object.values(SAM_TYPES).find((t) => t.class === c.id);
    return `<tr><td><b style="color:var(--ink-bright)">${esc(c.tm)}</b> · ${esc(c.en)}<br>
      <span style="color:var(--ink-dim)">${esc(c.blurb)}</span></td>
      <td>${esc(sys.label)}<br><span style="color:var(--ink-dim)">${sys.minRangeKm}–${sys.maxRangeKm} km<br>
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
