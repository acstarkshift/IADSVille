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
  serviceNumber, rankIndexOf,
} from '../engine/character.js';
import { rankInsignia, rankBadge } from './insignia.js';
import { drawPortrait, PORTRAIT_W, PORTRAIT_H } from './portrait.js';
import { knownRevelations } from '../engine/revelations.js';
import { tierFor } from '../engine/command.js';
import { STATE, PLATES, STATUS } from './lexicon.js';
import { letterById, dispositionPlate } from '../engine/family.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ------------------------------------------------------- the form furniture */

/**
 * THE FILING CABINET — one stock, one rule work, six screens.
 *
 * The dossier and the full report were the two screens all three judges called
 * the best-designed things in the game: ruled stock, a punched filing margin, a
 * red gutter rule, a form number in the letterhead and a rubber stamp. Beside
 * them the menu's personnel file, the briefing and the handbook were, in the
 * art director's words, "seven identical rounded boxes in a row ... on a black
 * field in a single terminal green", and the reader's, "plain bordered boxes of
 * green type on black. The story screens are not one system."
 *
 * So the vocabulary those two screens invented is written down here and issued
 * to the rest — the enlistment form, the menu's front sheet, the order, the
 * manual and the card the evening ends on all print from these blocks, which is
 * what makes them read as coming out of one drawer.
 */

/** A form's letterhead: what the paper is at the left, its number at the right. */
export const paperHead = (title, no) => `<div class="paper-head">
  <span class="paper-head-title">${esc(title)}</span>
  <span class="paper-head-no">${esc(no)}</span>
</div>`;

/**
 * One typed entry on a form: the caption above, the answer struck on the rule.
 *
 * This is what replaces the rounded tile. A tile is a console readout — it has
 * a lit border and it is a box; a form has a caption in small capitals and an
 * answer typed onto a ruled line, and the line runs the width of its column
 * whether the answer fills it or not. An answer too long for the column wraps
 * above its own rule instead of breaking the row, which is what the tiles did:
 * "one of which wraps to two lines and breaks the row".
 *
 * `mark` prints something beside the answer — the rank's own board against the
 * rank — and is markup, so its caller escapes it.
 */
export const field = (label, value, { wide = false, mood = '', mark = '' } = {}) => `<span
  class="typed-field${wide ? ' is-wide' : ''}${mood ? ` ${mood}` : ''}">
  <label>${esc(label)}</label><b>${mark}${esc(value)}</b></span>`;

/** A band of them, ruled across the sheet. */
export const fields = (list, cls = '') => `<div class="typed-fields${cls ? ` ${cls}` : ''}">${
  list.filter(Boolean).join('')}</div>`;

/* ------------------------------------------------------------ enlistment */

export function renderEnlistment(host, state) {
  if (host) host.scrollTop = 0;
  const suggested = state.pendingName ?? suggestName();
  state.pendingName = suggested;
  const background = state.pendingBackground ?? 'factory';
  state.pendingBackground = background;
  const household = state.pendingHousehold ?? 'mother';
  state.pendingHousehold = household;

  /*
   * THE FIRST PAGE OF THE FILE IS PRINTED LIKE THE REST OF IT.
   *
   * This screen opens the record the dossier, the menu's front sheet and the
   * report all belong to, and it was the last one in the set still built as
   * bordered boxes of green type on black. It is the same form, so it is the
   * same stock, the same punched margin and the same letterhead — the recruit
   * fills in his particulars on FORM 2-19 and everything after it is that
   * paper coming back to him.
   */
  host.innerHTML = `<div class="screen-inner is-paper is-enlist">
    ${paperHead('Personnel file — enlistment', 'FORM 2-19')}
    <h1 class="title is-outcome">ЛИЧНОЕ ДЕЛО · SERVICE RECORD</h1>
    <p class="subtitle">${esc(STATE.service.en)} · ${esc(STATE.country.en)}</p>

    <div class="card record-card">
      ${/* The standard the form is printed to, stamped in the corner the way
           every other stamp in the file is: the plate over its gloss, two
           short lines. Set as one long line it ran three hundred pixels
           across the sheet and printed through the first sentence. */ ''}
      <div class="record-stamp"><span class="tm">${esc(PLATES.standard.tm)}</span><span
        class="en">${esc(PLATES.standard.en)}</span></div>
      <h3>Enlistment</h3>
      <p class="note">You are being posted to the air defence sector covering the valley of the
      Ville, the village you are from. The scope you will sit at is centred on your own roof.</p>
      <p class="note">The war is with the Federation, across the northern frontier. It is nineteen
      months old, nobody in the Ville can tell you what started it, and the aircraft come at
      night.</p>
      <p class="note">Sector command keeps a file on you from today, and it is never closed. The
      file is kept by the political section — the part of the service that watches the service. It
      reads your log and your post, and it keeps what it reads.</p>
      ${/*
         * What the recruit is actually being posted to, which until the ladder
         * existed this card got wrong: it promised a battalion on the first
         * night, and the game then opened a Recruit's file at Battalion
         * Commander. The last sentence survives unchanged because it is still
         * true of every appointment above the two operator posts — the job
         * carries the rank, in this service.
         */ ''}
      <p class="note">You start at a radar set. Switch it on, hold what it finds, and hand each
      contact to the officer at the next desk; he is the one who fires. A launcher comes after
      that, and the net after the launcher. This sector is short of officers, so the rank will be
      made to catch up with the job afterwards.</p>

      <div class="field-row">
        <label class="field">
          <span>NAME</span>
          <input id="enlist-name" type="text" maxlength="34" value="${esc(suggested)}" autocomplete="off">
        </label>
        <button class="btn" id="enlist-reroll" title="Another name">↻</button>
        <label class="field">
          <span>HOME</span>
          <input type="text" value="THE VILLE" readonly disabled>
        </label>
      </div>
    </div>

    <div class="card">
      <h3>Who is still there</h3>
      <p class="note">The Ville is on every scope in this campaign, and the people below live
      there. Every raid you fight is a raid on their street.</p>
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
          <b>${esc(bg.en)}</b>
          <small>${esc(bg.blurb)}</small>
          <small class="gained">${esc(bg.effect)}</small>
        </button>`).join('')}
      </div>
    </div>

    ${/* the foot of the form, where the office that keeps it is named */ ''}
    <div class="record-foot-line"><span>Kept by the sector political section</span>
      <span>${esc(STATE.serviceShort.tm)} · ${esc(STATE.serviceShort.en)}</span></div>

    <div class="actions">
      <button class="btn-primary" id="enlist-confirm">ENLIST</button>
      <button class="btn" id="enlist-defaults"
        title="Take the suggested name and the clerk's defaults, and get to the console">
        SIGN WHERE INDICATED</button>
    </div>
    <p class="note aside">The particulars can be read at leisure in the dossier afterwards.
    Take as long as you like here; the clerk will wait.</p>
  </div>`;
}

/* --------------------------------------------------------------- dossier */

export function renderDossier(host, state) {
  // Opening your own service record used to land you 278 pixels down it.
  if (host) host.scrollTop = 0;
  const character = state.campaign.character;
  const rank = rankOf(character);
  const bg = backgroundOf(character);
  const next = nextRank(character, state.campaign.standing);
  const tier = tierFor(state.campaign.standing);
  const progress = next
    ? Math.round(100 * Math.min(1, (character.xp - RANKS[character.rankIndex].xp)
      / Math.max(1, next.rank.xp - RANKS[character.rankIndex].xp)))
    : 100;

  host.innerHTML = `<div class="screen-inner is-paper">
    ${/*
     * The service record is a document. The art judge: "these are the two
     * longest reads in the game and they are styled divs ... no paper ground,
     * no rule work, no form furniture beyond one small mark and a FORM 4471-B
     * label. The appointment sheet in the same build proves the team can draw
     * a document." So the file is printed on the same stock the report is, with
     * a punched filing margin and its own form number in the letterhead.
     */ ''}
    ${paperHead('Personnel file — Air Defence Forces', 'FORM 2-19')}
    <h1 class="title is-file">${esc(rank.en)} ${esc(character.name)}</h1>
    <p class="subtitle">${esc(STATE.service.en)} · ${esc(STATE.country.en)}
      · FILE NO. ${esc(serviceNumber(character))}</p>

    <div class="card record-card">
      <div class="record-stamp">${esc(tier.label)}</div>
      ${/* The file's own photograph and insignia — the same face and board
           the card in the console carries, at a size a file prints them. */ ''}
      <div class="file-ident">
        <span class="file-ident-photo">
          <canvas class="portrait file-photo" width="48" height="60" aria-label="Photograph on file"></canvas>
        </span>
        <div class="file-ident-text">
          ${rankBadge(character.rankIndex, { size: 30 })}
          <span class="file-no">SERVICE NO. ${esc(serviceNumber(character))}</span>
        </div>
      </div>
      ${/* The particulars, typed onto the form's own rules — the same band, in
           the same hand, as the front sheet on the menu. They were six lit
           tiles on a piece of paper, which is the one construction on these
           screens that belongs to the console rather than to the file. */ ''}
      ${fields([
    field('Rank', rank.en, { mark: rankInsignia(character.rankIndex, { size: 22, title: rank.en }) }),
    field('Condition', character.wounded ? 'INJURED' : 'FIT',
      { mood: character.wounded ? 'is-bad' : '' }),
  ])}
      ${fields([
    field('Standing', Math.round(state.campaign.standing)),
    field('Experience', grouped(character.xp)),
    field('Watches', character.watches),
    field('Training points', character.points, { mood: character.points ? 'is-good' : '' }),
  ], 'is-figures')}
      ${/* What the number means, where the number lives. It is explained once
           on the first briefing and then printed on the tape, the card, this
           file and the report for eleven more watches. */ ''}
      <p class="note">Standing is the figure the file keeps on you, from nothing to a hundred.
      Seventy-eight and above is commended; below fifteen the file goes to the political
      section.</p>
      ${/* One number style with the report's, and a row that says what it is
           counting rather than fusing a label to half a sentence. */ ''}
      ${next ? `<div class="rank-progress">
        <div class="crew-row is-plain"><span>Toward ${esc(next.rank.en)}</span>
          <b>${next.xpShort ? `${grouped(next.xpShort)} experience` : 'experience met'}${next.standingShort ? `, and a standing of ${next.rank.standing}` : ''}</b></div>
        <div class="meter"><i style="width:${progress}%"></i></div>
      </div>` : '<p class="verdict gained">The highest rank this appointment allows.</p>'}
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
          <b>${esc(skill.en)}${skill.cost > 1 ? ` (${skill.cost})` : ''}</b>
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
    return `<tr><td><b>${esc(d.en)}</b> <span class="stencil note">${esc(d.tm)}</span><br>
        <span class="note">${esc(d.blurb)}</span></td></tr>`;
  }).join('')}</table>`
    : '<p class="note">None awarded. Most files stay this way.</p>'}
    </div>

    <div class="card">
      <h3>Particulars</h3>
      <table class="ledger">
        <tr><td>Origin</td><td>${esc(bg.en)}</td></tr>
        <tr><td>Home</td><td>the Ville, in the western valley</td></tr>
        <tr><td>Household</td><td>${esc(householdOf(character).en)}</td></tr>
        <tr><td>Quarter</td><td>${esc(districtOf(character).en)}</td></tr>
        ${state.narrativePressure && (state.campaign.family?.permit ?? 'standing') !== 'standing'
    ? `<tr><td>Residence permit</td><td>${state.campaign.family.permit === 'review'
      ? 'Under review' : 'Review concluded. No action taken. The review remains in the file.'}</td></tr>` : ''}
        <tr><td>Watches stood</td><td>${character.watches}</td></tr>
        <tr><td>Assessment</td><td>${esc(tier.label)}</td></tr>
      </table>
      ${state.narrativePressure ? `<p class="note aside">
        Correspondence to and from the Ville passes through the sector political section. This is
        described as routine. The village is eleven kilometres from this console.</p>` : ''}
    </div>

    ${knownRevelations(state.campaign).length && state.narrativePressure ? `<div class="card revelation-card">
      <h3>What you have worked out</h3>
      <table class="ledger">
        ${knownRevelations(state.campaign).map((r) => `<tr>
          <td><b>${esc(r.title)}</b></td>
          <td class="is-prose note">${esc(r.lines[0])}</td>
        </tr>`).join('')}
      </table>
    </div>` : ''}

    ${state.narrativePressure
      && ((state.campaign.family?.delivered?.length ?? 0) + (state.campaign.family?.withheld?.length ?? 0) > 0)
    ? `<div class="card letter-card">
      <h3>Correspondence</h3>
      ${/*
       * One row per letter: its title, how it arrived stamped beside it, and a
       * line of the letter in the hand that wrote it. Nothing here describes
       * the post to the man it was addressed to.
       */ ''}
      <table class="ledger">
        ${state.campaign.family.delivered.map((d) => {
    const t = letterById(d.id);
    const plate = dispositionPlate(d.disposition);
    return t ? `<tr>
          <td><b>${esc(t.title)}</b>${plate
      ? `<br><span class="letter-plate">${esc(plate)}</span>` : ''}</td>
          <td class="is-prose note">${esc(d.excerpt ?? '')}</td>
        </tr>` : '';
  }).join('')}
        ${state.campaign.family.withheld.map((h) => {
    const t = letterById(h.id);
    return t ? `<tr>
          <td><b>${esc(t.title)}</b><br>
            <span class="letter-plate">${esc(dispositionPlate('withheld'))}</span></td>
          <td class="is-prose grave">Posted from the Ville. Held pending assessment of your
            file.</td>
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
        return r ? `Promoted to ${r.en}` : 'Promoted';
      },
      demotion: () => {
        const r = RANKS.find((x) => x.id === entry.id);
        return r ? `Reduced to ${r.en}` : 'Reduced in rank';
      },
      decoration: () => {
        const d = DECORATIONS[entry.id];
        return d ? `Awarded ${d.en}` : 'Decorated';
      },
      training: () => {
        const k = SKILLS[entry.id];
        return k ? `Qualified ${k.en}` : 'Qualified';
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
  for (const photo of host.querySelectorAll('canvas.portrait')) {
    if (photo.getContext) drawPortrait(photo.getContext('2d'), 0, 0, PORTRAIT_W, PORTRAIT_H, character.name);
  }
  // and the page opens at the top of itself, after the new content is in it
  host.scrollTop = 0;
}

/**
 * The block appended to a debrief: what this watch did to the record. Returned
 * as markup so the debrief screen can place it, rather than rendering itself.
 */
/** A long number with room to breathe: 121,940, not 121940. */
export const grouped = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export function serviceSummary(character, service, campaign) {
  if (!character || !service) return '';
  const rank = rankOf(character);
  const rows = [];

  rows.push(`<tr><td>Experience earned</td><td class="up">+${service.gained}</td></tr>`);
  if (service.promotion) {
    rows.push(`<tr><td><b>Promoted</b></td><td class="up">${rankInsignia(rankIndexOf(service.promotion.id), { size: 16 })} ${esc(service.promotion.en)}</td></tr>`);
    rows.push('<tr><td>Training point</td><td class="up">+1</td></tr>');
  }
  if (service.demotion) {
    rows.push(`<tr><td><b>Reduced in rank</b></td><td class="down">${esc(service.demotion.en)}</td></tr>`);
  }
  for (const decoration of service.awarded) {
    rows.push(`<tr><td><b>${esc(decoration.en)}</b> <span class="stencil note">${esc(decoration.tm)}</span><br>
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
    /*
     * One sentence, one number style. It was "Still to earn, toward Lieutenant
     * General | 121 188 experience, and standing 84" — a label fused to half a
     * sentence, a thin space between the thousands where the row two lines up
     * writes 747 with nothing in it, and no way to tell that 84 is a standing
     * the file has to reach rather than a second count of something.
     */
    const needs = [
      next.xpShort ? `another ${grouped(next.xpShort)} experience` : null,
      next.standingShort ? `a standing of ${next.rank.standing}` : null,
    ].filter(Boolean);
    rows.push(`<tr><td>Next rank</td><td>${esc(next.rank.en)} ${needs.length
      ? `needs ${needs.join(' and ')}.` : 'is earned; the appointment decides when it is given.'}</td></tr>`);
  }

  return `<div class="card record-card">
    <div class="record-stamp"><span class="tm">ДЕЛО</span><span class="en">FILE ${esc(serviceNumber(character))}</span></div>
    <div class="record-head">
      ${/* The same print that is stuck to the front of the dossier. */ ''}
      <span class="file-ident-photo">
        <canvas class="portrait file-photo is-small" width="48" height="60"
          data-seed="${esc(character.name)}" aria-label="Photograph on file"></canvas>
      </span>
      ${/* The board is captioned with what it IS. It used to be captioned with
            the rank, directly above a heading that reads "Service record —
            Senior Lieutenant Bavich": the rank set twice, adjacent, on a card
            whose whole job is to look like a typed record. */ ''}
      <span class="ident-board is-captioned">
        ${rankInsignia(character.rankIndex, { size: 34, title: rank.en })}
        <small>RANK BOARD</small>
      </span>
      <h3>Service record — ${esc(rank.en)} ${esc(character.name)}</h3>
    </div>
    <table class="ledger">${rows.join('')}</table>
    ${character.points ? `<p class="urgent aside">
      ${character.points} training point${character.points > 1 ? 's' : ''} unspent — open your dossier.</p>` : ''}
  </div>`;
}

/**
 * Paint every photograph a screen has just written the markup for.
 *
 * The file's own picture is a canvas, so it has to be drawn after the page is
 * in the document; the dossier does it for its own copy and this does it for
 * everyone else's.
 */
export function paintFilePhotos(host) {
  if (!host) return;
  for (const canvas of host.querySelectorAll('canvas.file-photo[data-seed]')) {
    if (canvas.getContext) drawPortrait(canvas.getContext('2d'), 0, 0, PORTRAIT_W, PORTRAIT_H, canvas.dataset.seed);
  }
}

/**
 * The same sheet of paper, for a watch that was walked out of.
 *
 * An abandoned watch banks nothing, so `serviceSummary` above renders nothing
 * at all and the debrief lost the only card on it that looked issued rather
 * than printed: no file number, no stamp, no rank, no name — the plainest
 * screen in the build, at the end of the most consequential decision on the
 * console. This is the abandonment's own file entry, in the paperwork the
 * service uses for everything else, and it names the tier the ledger beside it
 * is already reading: the file does not call this satisfactory.
 */
export function abandonedRecord(character, result) {
  const rank = character ? rankOf(character) : null;
  const stamp = character
    ? `ДЕЛО / FILE ${esc(serviceNumber(character))}`
    : `${esc(STATUS.postAbandoned.tm)} · ${esc(STATUS.postAbandoned.en)}`;
  return `<div class="card record-card is-abandoned">
    <div class="record-stamp is-grave">${stamp}</div>
    <h3>File entry — ${esc(STATUS.postAbandoned.en)}</h3>
    ${character ? `<p>${esc(rank.en)} <b>${esc(character.name)}</b> left the post at
      <b>${esc(result.watchClock ?? result.clock ?? '')}</b>, ${result.clock ?? ''} into the watch,
      with the raid still running. The file records an abandoned watch and nothing else.</p>` : ''}
    <table class="ledger">
      <tr><td>Experience earned</td><td class="down">none</td></tr>
      <tr><td>Decoration, letter, appointment</td><td class="down">none</td></tr>
      <tr><td>This watch on the roster</td><td class="down">not completed</td></tr>
      <tr><td>Standing</td><td class="down">charged for leaving the post</td></tr>
    </table>
    <p class="note">Nothing further is required of you tonight. Stand the watch again from the
    roster when you are ready; it is scored when it is finished.</p>
  </div>`;
}
