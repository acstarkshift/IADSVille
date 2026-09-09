/**
 * The service record: enlistment, the dossier, and what a watch did to it.
 *
 * These screens are the RPG's face. They are laid out as paperwork rather than
 * as a character sheet, because that is what a soldier of Trans Mordovia would
 * actually be handed — a card with a file number on it, stamps in the corner,
 * and someone else's handwriting deciding what happens to them next.
 */

import {
  RANKS, BACKGROUNDS, SKILLS, DECORATIONS, HOUSEHOLDS,
  rankOf, backgroundOf, householdOf, districtOf, nextRank, canLearn, suggestName,
} from '../engine/character.js';
import { knownRevelations } from '../engine/revelations.js';
import { tierFor } from '../engine/command.js';
import { STATE, PLATES } from './lexicon.js';
import { letterById } from '../engine/family.js';

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
  const household = state.pendingHousehold ?? 'mother';
  state.pendingHousehold = household;

  host.innerHTML = `<div class="screen-inner">
    <h1 class="title is-outcome">ЛИЧНОЕ ДЕЛО · SERVICE RECORD</h1>
    <p class="subtitle">SERVICE RECORD · ${esc(STATE.serviceShort.tm)} · ${esc(STATE.service.en)}</p>

    <div class="card record-card">
      <div class="record-stamp">${esc(PLATES.standard.tm)} · ${esc(PLATES.standard.en)}</div>
      <h3>Enlistment</h3>
      <p class="note">You are being posted to the air defence sector covering the valley
      of ${esc(STATE.town.en)} — the village you are from. The scope you will sit at is centred on your
      own roof. Sector command keeps a file on you from today, and it is never closed.</p>

      <div class="field-row">
        <label class="field">
          <span>ФАМИЛИЯ И ИМЯ · NAME</span>
          <input id="enlist-name" type="text" maxlength="34" value="${esc(suggested)}" autocomplete="off">
        </label>
        <button class="btn" id="enlist-reroll" title="Another name">↻</button>
        <label class="field">
          <span>РОДНОЙ ГОРОД · HOME</span>
          <input type="text" value="ВИЛЛА · THE VILLE" readonly disabled>
        </label>
      </div>
    </div>

    <div class="card">
      <h3>Who is still there</h3>
      <p class="note">The Ville is on every scope in this campaign, and it is where the
      people below live. That is not a coincidence and it does not become one.</p>
      <div class="choice-row" id="household-row">
        ${Object.values(HOUSEHOLDS).map((h) => `<button class="choice ${h.id === household ? 'is-active' : ''}"
          data-household="${h.id}">
          <b>${esc(h.en)}</b>
          <small>${esc(h.blurb)}</small>
        </button>`).join('')}
      </div>
    </div>

    <div class="card">
      <h3>Before the army had you</h3>
      <p class="note">Permanent. It decides what you are already good at, and what
      sector command assumes about you before you have done anything.</p>
      <div class="choice-row" id="background-row">
        ${Object.values(BACKGROUNDS).map((bg) => `<button class="choice ${bg.id === background ? 'is-active' : ''}" data-background="${bg.id}">
          <b>${esc(bg.tm)} · ${esc(bg.en)}</b>
          <small>${esc(bg.blurb)}</small>
          <small class="gained">${esc(bg.effect)}</small>
        </button>`).join('')}
      </div>
    </div>

    <div class="actions">
      <button class="btn-primary" id="enlist-confirm">ПРИНЯТЬ ПРИСЯГУ · ENLIST</button>
      <button class="btn" id="enlist-defaults"
        title="Take the suggested name and the clerk's defaults, and get to the console">
        ПОДПИСАТЬ ГДЕ УКАЗАНО · SIGN WHERE INDICATED</button>
    </div>
    <p class="note aside">The particulars can be read at
    leisure in the dossier. The clerk has seen people stand at this counter for ten minutes; he has
    also seen the schedule.</p>
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
    <h1 class="title is-file">${esc(rank.tm)} ${esc(character.name)}</h1>
    <p class="subtitle">${esc(rank.en)} · ${esc(STATE.serviceShort.tm)} · ${esc(STATE.serviceShort.en)}
      · ДЕЛО № / FILE NO. ${esc(fileNumber(character))}</p>

    <div class="card record-card">
      <div class="record-stamp">${esc(tier.label)}</div>
      <div class="score-grid">
        <div class="score-cell is-word"><label>ЗВАНИЕ · RANK</label>
          <b>${esc(rank.tm)}</b><span class="sub">${esc(rank.en)}</span></div>
        <div class="score-cell"><label>ОПЫТ · EXPERIENCE</label><b>${character.xp}</b></div>
        <div class="score-cell"><label>ВАХТ · WATCHES</label><b>${character.watches}</b></div>
        <div class="score-cell"><label>АТТЕСТАЦИЯ · STANDING</label><b>${Math.round(state.campaign.standing)}</b></div>
        <div class="score-cell ${character.points ? 'is-good' : ''}"><label>ПОДГОТОВКА · TRAINING PTS</label><b>${character.points}</b></div>
        <div class="score-cell is-word ${character.wounded ? 'is-bad' : ''}"><label>СОСТОЯНИЕ · CONDITION</label>
          <b>${character.wounded ? 'РАНЕН · INJURED' : 'ГОДЕН · FIT'}</b></div>
      </div>
      ${next ? `<div class="rank-progress">
        <div class="crew-row is-plain"><span>Toward ${esc(next.rank.tm)} · ${esc(next.rank.en)}</span>
          <b>${next.xpShort ? `${next.xpShort} experience` : 'experience met'}${next.standingShort ? `, standing ${next.rank.standing}` : ''}</b></div>
        <div class="meter"><i style="width:${progress}%"></i></div>
      </div>` : '<p class="verdict gained">At the top of the ladder they will let you reach.</p>'}
      ${character.wounded ? `<p class="grave aside">
        You were pulled out of a position that was overrun. Everything takes you longer until the
        next watch is behind you.</p>` : ''}
    </div>

    <div class="card">
      <h3>Training</h3>
      <p class="note">One point per promotion. Qualifications apply in full at your own
      battery and at half strength across the sector — you drilled those crews, but you are not sitting in them.</p>
      <div class="choice-row">
        ${Object.values(SKILLS).map((skill) => {
    const known = character.skills.includes(skill.id);
    const affordable = canLearn(character, skill.id);
    return `<button class="choice ${known ? 'is-active' : ''}" data-skill="${skill.id}"
            ${known || !affordable ? 'disabled' : ''}>
          <b>${esc(skill.tm)} · ${esc(skill.en)}${skill.cost > 1 ? ` (${skill.cost})` : ''}</b>
          <small>${esc(skill.blurb)}</small>
          <small class="${known ? 'gained' : 'urgent'}">
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
    return `<tr><td><b class="stencil">${esc(d.tm)}</b><br>
        <span class="note">${esc(d.en)} — ${esc(d.blurb)}</span></td></tr>`;
  }).join('')}</table>`
    : '<p class="note">None awarded. Most files stay this way.</p>'}
    </div>

    <div class="card">
      <h3>Particulars</h3>
      <table class="ledger">
        <tr><td>Origin</td><td>${esc(bg.tm)} · ${esc(bg.en)}</td></tr>
        <tr><td>Home</td><td>${esc(character.home)} · ${esc(STATE.town.en)},
          ${esc(STATE.country.tm)} · ${esc(STATE.country.en)}</td></tr>
        <tr><td>Household</td><td>${esc(householdOf(character).en)}</td></tr>
        <tr><td>Quarter</td><td>${esc(districtOf(character).tm)} · ${esc(districtOf(character).en)}</td></tr>
        ${state.narrativePressure && (state.campaign.family?.permit ?? 'standing') !== 'standing'
    ? `<tr><td>Residence permit</td><td>${state.campaign.family.permit === 'review'
      ? 'Under review' : 'Review concluded. No action taken. The review remains in the file.'}</td></tr>` : ''}
        <tr><td>Watches stood</td><td>${character.watches}</td></tr>
        <tr><td>Assessment</td><td>${esc(tier.label)}</td></tr>
      </table>
      ${state.narrativePressure ? `<p class="note aside">
        Correspondence to and from the Ville passes through the sector political section. This is
        described as routine. The village is fourteen kilometres from this console.</p>` : ''}
    </div>

    ${knownRevelations(state.campaign).length && state.narrativePressure ? `<div class="card revelation-card">
      <h3>What you have worked out</h3>
      <table class="ledger">
        ${knownRevelations(state.campaign).map((r) => `<tr>
          <td><b class="stencil">${esc(r.tm)}</b> · ${esc(r.title)}</td>
          <td class="is-prose note">${esc(r.lines[0])}</td>
        </tr>`).join('')}
      </table>
    </div>` : ''}

    ${state.narrativePressure
      && ((state.campaign.family?.delivered?.length ?? 0) + (state.campaign.family?.withheld?.length ?? 0) > 0)
    ? `<div class="card letter-card">
      <h3>Correspondence</h3>
      <table class="ledger">
        ${state.campaign.family.delivered.map((d) => {
    const t = letterById(d.id);
    return t ? `<tr>
          <td><b class="stencil">${esc(t.tm)}</b> · ${esc(t.title)}</td>
          <td class="is-prose note">${esc(d.excerpt ?? '')}</td>
        </tr>` : '';
  }).join('')}
        ${state.campaign.family.withheld.map((h) => {
    const t = letterById(h.id);
    return t ? `<tr>
          <td><b class="stencil">${esc(t.tm)}</b> · ${esc(t.title)}</td>
          <td class="is-prose grave">Withheld by the political section.</td>
        </tr>` : '';
  }).join('')}
      </table>
    </div>` : ''}

    ${character.record.length ? `<div class="card">
      <h3>Record of service</h3>
      <table class="ledger">
        ${[...character.record].reverse().slice(0, 12).map((entry) => {
    const text = {
      promotion: () => {
        const r = RANKS.find((x) => x.id === entry.id);
        return r ? `Promoted to ${r.tm} · ${r.en}` : 'Promoted';
      },
      demotion: () => {
        const r = RANKS.find((x) => x.id === entry.id);
        return r ? `Reduced to ${r.tm} · ${r.en}` : 'Reduced in rank';
      },
      decoration: () => {
        const d = DECORATIONS[entry.id];
        return d ? `Awarded ${d.tm} · ${d.en}` : 'Decorated';
      },
      training: () => {
        const k = SKILLS[entry.id];
        return k ? `Qualified ${k.tm} · ${k.en}` : 'Qualified';
      },
      wounded: () => 'Position overrun. Evacuated.',
      family: () => ({
        unopened: 'A letter from the Ville, delivered unopened',
        resealed: 'A letter from the Ville, opened and resealed',
        withheld: 'A letter from the Ville, withheld by the political section',
        released: 'A withheld letter, released after assessment',
        closed: 'Residence permit review concluded. No action taken',
      }[entry.disposition] ?? 'Correspondence noted'),
    }[entry.kind]?.() ?? entry.kind;
    const mood = entry.kind === 'demotion' || entry.kind === 'wounded'
      || (entry.kind === 'family' && entry.disposition === 'withheld') ? 'down' : 'up';
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
    rows.push(`<tr><td><b>${esc(decoration.tm)}</b> · ${esc(decoration.en)}<br>
      <span class="note">${esc(decoration.blurb)}</span></td>
      <td class="up">AWARDED</td></tr>`);
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
    <div class="record-stamp">ДЕЛО № / FILE ${esc(fileNumber(character))}</div>
    <h3>Service record — ${esc(rank.tm)} · ${esc(rank.en)} ${esc(character.name)}</h3>
    <table class="ledger">${rows.join('')}</table>
    ${character.points ? `<p class="urgent aside">
      ${character.points} training point${character.points > 1 ? 's' : ''} unspent — open your dossier.</p>` : ''}
  </div>`;
}
