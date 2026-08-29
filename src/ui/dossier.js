/**
 * The service record: enlistment, the dossier, and what a watch did to it.
 *
 * These screens are the RPG's face. They are laid out as paperwork rather than
 * as a character sheet, because that is what a soldier of Trans Mordovia would
 * actually be handed — a card with a file number on it, stamps in the corner,
 * and someone else's handwriting deciding what happens to them next.
 */

import {
  RANKS, BACKGROUNDS, SKILLS, DECORATIONS, HOME_TOWNS,
  rankOf, backgroundOf, nextRank, canLearn, suggestName,
} from '../engine/character.js';
import { tierFor } from '../engine/command.js';
import { STATE, PLATES } from './lexicon.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Stamps and file numbers, so a card looks issued rather than generated. */
function fileNumber(character) {
  let h = 7;
  for (const ch of character.name) h = (h * 31 + ch.charCodeAt(0)) & 0xffff;
  return `${String(h % 9000 + 1000)}-${String(character.watches % 90 + 10)}-Б`;
}

/* ------------------------------------------------------------ enlistment */

export function renderEnlistment(host, state) {
  const suggested = state.pendingName ?? suggestName();
  state.pendingName = suggested;
  const background = state.pendingBackground ?? 'factory';
  state.pendingBackground = background;

  host.innerHTML = `<div class="screen-inner">
    <h1 class="title" style="font-size:30px">ЛИЧНОЕ ДЕЛО</h1>
    <p class="subtitle">SERVICE RECORD · ${esc(STATE.serviceShort.tm)} · ${esc(STATE.service.en)}</p>

    <div class="card record-card">
      <div class="record-stamp">${esc(PLATES.standard)}</div>
      <h3>Enlistment</h3>
      <p style="color:var(--ink-dim)">You are being posted to an air defence sector outside
      ${esc(STATE.town.en)}. Sector command keeps a file on you from today. It is never closed.</p>

      <div class="field-row">
        <label class="field">
          <span>ФАМИЛИЯ И ИМЯ · NAME</span>
          <input id="enlist-name" type="text" maxlength="34" value="${esc(suggested)}" autocomplete="off">
        </label>
        <button class="btn" id="enlist-reroll" title="Another name">↻</button>
        <label class="field">
          <span>РОДНОЙ ГОРОД · HOME TOWN</span>
          <select id="enlist-home">
            ${HOME_TOWNS.map((t) => `<option ${state.pendingHome === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}
          </select>
        </label>
      </div>
    </div>

    <div class="card">
      <h3>Before the army had you</h3>
      <p style="color:var(--ink-dim)">Permanent. It decides what you are already good at, and what
      sector command assumes about you before you have done anything.</p>
      <div class="choice-row" id="background-row">
        ${Object.values(BACKGROUNDS).map((bg) => `<button class="choice ${bg.id === background ? 'is-active' : ''}" data-background="${bg.id}">
          <b>${esc(bg.tm)} · ${esc(bg.en)}</b>
          <small>${esc(bg.blurb)}</small>
          <small style="color:var(--good);margin-top:5px">${esc(bg.effect)}</small>
        </button>`).join('')}
      </div>
    </div>

    <div class="actions">
      <button class="btn-primary" id="enlist-confirm">ПРИНЯТЬ ПРИСЯГУ · ENLIST</button>
    </div>
  </div>`;
}

/* --------------------------------------------------------------- dossier */

export function renderDossier(host, state) {
  const character = state.campaign.character;
  const rank = rankOf(character);
  const bg = backgroundOf(character);
  const next = nextRank(character, state.campaign.standing);
  const tier = tierFor(state.campaign.standing);
  const progress = next
    ? Math.round(100 * Math.min(1, (character.xp - RANKS[character.rankIndex].xp)
      / Math.max(1, next.rank.xp - RANKS[character.rankIndex].xp)))
    : 100;

  host.innerHTML = `<div class="screen-inner">
    <h1 class="title" style="font-size:26px">${esc(rank.tm)} ${esc(character.name)}</h1>
    <p class="subtitle">${esc(rank.en)} · ${esc(STATE.serviceShort.tm)} · ДЕЛО № ${esc(fileNumber(character))}</p>

    <div class="card record-card">
      <div class="record-stamp">${esc(tier.label)}</div>
      <div class="score-grid">
        <div class="score-cell"><label>ЗВАНИЕ · RANK</label><b style="font-size:13px">${esc(rank.tm)}</b></div>
        <div class="score-cell"><label>ОПЫТ · EXPERIENCE</label><b>${character.xp}</b></div>
        <div class="score-cell"><label>ВАХТ · WATCHES</label><b>${character.watches}</b></div>
        <div class="score-cell"><label>АТТЕСТАЦИЯ · STANDING</label><b>${Math.round(state.campaign.standing)}</b></div>
        <div class="score-cell ${character.points ? 'is-good' : ''}"><label>ПОДГОТОВКА · TRAINING PTS</label><b>${character.points}</b></div>
        <div class="score-cell ${character.wounded ? 'is-bad' : ''}"><label>СОСТОЯНИЕ · CONDITION</label>
          <b style="font-size:13px">${character.wounded ? 'РАНЕН · INJURED' : 'ГОДЕН · FIT'}</b></div>
      </div>
      ${next ? `<div style="margin-top:10px">
        <div class="crew-row" style="border:0"><span>Toward ${esc(next.rank.tm)} · ${esc(next.rank.en)}</span>
          <b>${next.xpShort ? `${next.xpShort} experience` : 'experience met'}${next.standingShort ? `, standing ${next.rank.standing}` : ''}</b></div>
        <div class="meter"><i style="width:${progress}%"></i></div>
      </div>` : '<p style="margin-top:10px;color:var(--good)">At the top of the ladder they will let you reach.</p>'}
      ${character.wounded ? `<p style="color:var(--hostile);margin-top:8px">
        You were pulled out of a position that was overrun. Everything takes you longer until the
        next watch is behind you.</p>` : ''}
    </div>

    <div class="card">
      <h3>Training</h3>
      <p style="color:var(--ink-dim)">One point per promotion. Qualifications apply in full at your own
      battery and at half strength across the sector — you drilled those crews, but you are not sitting in them.</p>
      <div class="choice-row" style="flex-wrap:wrap">
        ${Object.values(SKILLS).map((skill) => {
    const known = character.skills.includes(skill.id);
    const affordable = canLearn(character, skill.id);
    return `<button class="choice ${known ? 'is-active' : ''}" data-skill="${skill.id}"
            ${known || !affordable ? 'disabled' : ''}>
          <b>${esc(skill.tm)} · ${esc(skill.en)}${skill.cost > 1 ? ` (${skill.cost})` : ''}</b>
          <small>${esc(skill.blurb)}</small>
          <small style="color:${known ? 'var(--good)' : 'var(--accent)'};margin-top:5px">
            ${known ? '✔ QUALIFIED — ' : ''}${esc(skill.effect)}</small>
        </button>`;
  }).join('')}
      </div>
    </div>

    <div class="card">
      <h3>Decorations</h3>
      ${character.decorations.length ? `<table class="ledger">
        ${character.decorations.map((id) => {
    const d = DECORATIONS[id];
    return `<tr><td><b style="color:var(--ink-bright)">${esc(d.tm)}</b><br>
        <span style="color:var(--ink-dim)">${esc(d.en)} — ${esc(d.blurb)}</span></td></tr>`;
  }).join('')}</table>`
    : '<p style="color:var(--ink-dim)">None awarded. Most files stay this way.</p>'}
    </div>

    <div class="card">
      <h3>Particulars</h3>
      <table class="ledger">
        <tr><td>Origin</td><td>${esc(bg.tm)} · ${esc(bg.en)}</td></tr>
        <tr><td>Home town</td><td>${esc(character.home)}, ${esc(STATE.country.en)}</td></tr>
        <tr><td>Watches stood</td><td>${character.watches}</td></tr>
        <tr><td>Assessment</td><td>${esc(tier.label)}</td></tr>
      </table>
      ${state.narrativePressure ? `<p style="color:var(--ink-dim);margin-top:8px">
        Correspondence to and from ${esc(character.home)} passes through the sector political section.
        This is described as routine.</p>` : ''}
    </div>

    ${character.record.length ? `<div class="card">
      <h3>Record of service</h3>
      <table class="ledger">
        ${[...character.record].reverse().slice(0, 12).map((entry) => {
    const text = {
      promotion: () => `Promoted to ${RANKS.find((r) => r.id === entry.id)?.tm ?? ''}`,
      demotion: () => `Reduced to ${RANKS.find((r) => r.id === entry.id)?.tm ?? ''}`,
      decoration: () => `Awarded ${DECORATIONS[entry.id]?.tm ?? ''}`,
      training: () => `Qualified ${SKILLS[entry.id]?.tm ?? ''}`,
      wounded: () => 'Position overrun. Evacuated.',
    }[entry.kind]?.() ?? entry.kind;
    const mood = entry.kind === 'demotion' || entry.kind === 'wounded' ? 'down' : 'up';
    return `<tr><td>Watch ${entry.at}</td><td class="${mood}">${esc(text)}</td></tr>`;
  }).join('')}
      </table>
    </div>` : ''}

    <div class="actions">
      <button class="btn-primary" id="dossier-back">BACK</button>
    </div>
  </div>`;
}

/**
 * The block appended to a debrief: what this watch did to the record. Returned
 * as markup so the debrief screen can place it, rather than rendering itself.
 */
export function serviceSummary(character, service, campaign) {
  if (!character || !service) return '';
  const rank = rankOf(character);
  const rows = [];

  rows.push(`<tr><td>Experience earned</td><td class="up">+${service.gained}</td></tr>`);
  if (service.promotion) {
    rows.push(`<tr><td><b>Promoted</b></td><td class="up">${esc(service.promotion.tm)} · ${esc(service.promotion.en)}</td></tr>`);
    rows.push('<tr><td>Training point</td><td class="up">+1</td></tr>');
  }
  if (service.demotion) {
    rows.push(`<tr><td><b>Reduced in rank</b></td><td class="down">${esc(service.demotion.tm)} · ${esc(service.demotion.en)}</td></tr>`);
  }
  for (const decoration of service.awarded) {
    rows.push(`<tr><td><b>${esc(decoration.tm)}</b><br><span style="color:var(--ink-dim)">${esc(decoration.blurb)}</span></td>
      <td class="up">${esc(decoration.en)}</td></tr>`);
  }
  if (character.wounded) {
    rows.push('<tr><td><b>Wounded</b></td><td class="down">Your position was overrun</td></tr>');
  } else if (service.recovered) {
    rows.push('<tr><td>Returned to duty</td><td class="up">Fit</td></tr>');
  }

  const next = nextRank(character, campaign.standing);
  if (next) {
    rows.push(`<tr><td>Toward ${esc(next.rank.tm)}</td><td>${next.xpShort
      ? `${next.xpShort} experience` : 'experience met'}${next.standingShort
      ? `, standing ${next.rank.standing}` : ''}</td></tr>`);
  }

  return `<div class="card record-card">
    <div class="record-stamp">ДЕЛО № ${esc(fileNumber(character))}</div>
    <h3>Service record — ${esc(rank.tm)} ${esc(character.name)}</h3>
    <table class="ledger">${rows.join('')}</table>
    ${character.points ? `<p style="color:var(--accent);margin-top:8px">
      ${character.points} training point${character.points > 1 ? 's' : ''} unspent — open your dossier.</p>` : ''}
  </div>`;
}
