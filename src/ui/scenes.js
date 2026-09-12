/**
 * The scenes between watches.
 *
 * The player: "The little displays and summaries between watches is cluttered
 * and overwhelming. It should be replaced with slick, 16-bit style animated
 * cut scenes which start with the user holding a dot-matrix printed summary
 * of the watch, followed by debriefs with the political commissar, then a
 * chance to read letters from home. Include relevant dialog and cutscenes as
 * the story progresses."
 *
 * So the end of a watch is a sequence of scenes rather than a page of tables:
 * the printout, typed line by line onto tractor-feed paper in the operator's
 * own hands; the political section's office, where the commissar says what
 * the file says about the night and reacts to what the log shows you did; the
 * order of appointment when there is one; the folder on the desk when the
 * watch has taught you something about the people giving the orders; the
 * letter from home, read in quarters; and, on the last watches, the ending.
 *
 * Every scene is drawn on a canvas 320 by 180 and scaled up in whole pixels.
 * There are no image assets anywhere in this game, so the room, the desk, the
 * commissar's face and the snow past the window are all drawn here. The words
 * are laid over the picture as ordinary text, because the words are what the
 * scene is for and pixel type at this size cannot be read.
 *
 * `scenesFor` decides which scenes play and what is said in them, as data, so
 * a test can ask without a canvas. `ScenePlayer` plays them: a key or a tap
 * finishes the line being typed, then moves to the next; SKIP goes to the end.
 * The full report — the old page of tables — stays reachable behind one
 * button when the scenes are done.
 */

import { consequenceFor } from '../engine/campaign.js';
import { composeEnding } from '../engine/endings.js';
import { composeFlightEnding } from '../engine/epilogue.js';
import { ROLES } from '../engine/config.js';
import { portraitCells, portraitFeatures, PORTRAIT_W, PORTRAIT_H } from './portrait.js';

export const SCENE_W = 320;
export const SCENE_H = 180;

/* ------------------------------------------------------------------ what plays */

/**
 * The scenes for the watch that just ended, in order.
 *
 * Every watch gets the printout and the office. The rest depend on what the
 * file did: an appointment, a document, a letter, and on the final watches an
 * ending. With the narrative pressure switched off the office speaks in the
 * plain assessment's words and the letters and documents stay in the file.
 */
export function scenesFor(state, result, entry) {
  const pressure = state.narrativePressure !== false;
  const campaign = state.campaign;
  const scenes = [];

  scenes.push({
    id: 'printout',
    kind: 'printout',
    speaker: 'THE WATCH, AS THE TAPE HAS IT',
    lines: printoutLines(state, result),
  });

  const consequence = consequenceFor(campaign, { narrativePressure: pressure });
  scenes.push({
    id: 'commissar',
    kind: 'office',
    speaker: pressure ? 'THE POLITICAL SECTION' : 'SECTOR COMMAND',
    lines: commissarLines(result, consequence, pressure),
    tier: consequence.tier.id,
  });

  if (entry?.appointment) {
    scenes.push({
      id: 'appointment',
      kind: 'office',
      speaker: 'ORDER OF APPOINTMENT',
      lines: appointmentLines(entry.appointment, pressure),
      tier: consequence.tier.id,
    });
  }

  if (pressure && entry?.revelation) {
    scenes.push({
      id: 'revelation',
      kind: 'folder',
      speaker: entry.revelation.title,
      lines: entry.revelation.lines,
    });
  }

  if (pressure && entry?.letter) {
    scenes.push({
      id: 'letter',
      kind: 'quarters',
      speaker: entry.letter.title,
      lines: [...(entry.letter.note ? [entry.letter.note] : []), ...entry.letter.lines],
    });
  }

  const ending = !result.abandoned && result.finale
    ? composeEnding(result, campaign.character, { narrativePressure: pressure, family: campaign.family })
    : result.epilogue && !result.abandoned
      ? composeFlightEnding(result, campaign.character, { narrativePressure: pressure })
      : null;
  if (ending) {
    scenes.push({
      id: 'ending',
      kind: 'ending',
      speaker: ending.subtitle ?? ending.title,
      lines: ending.lines,
      held: !!result.success,
    });
  }

  return scenes;
}

/**
 * The opening of every watch, first person.
 *
 * The player: "Each watch should begin with a first person view of the
 * operator sitting down at the console, taking a deep breath and inserting
 * the ID card whereupon the system boots and the watch begins." Five beats,
 * no words: the walk up to the console in the dark, sitting, one breath, the
 * card into the reader with its lamps coming up blue then green, and the set
 * booting — the tube warming from a dot to a picture — which ends on the
 * first live frame. Each beat runs its length and goes on by itself; a key
 * or a tap goes on early, Escape or SKIP goes straight to the console. The
 * clock does not run until the boot ends (app.js holds the phase).
 */
export function openingScenes(state) {
  const hour = state?.mission?.hour ?? '00:00';
  return [
    { id: 'approach', kind: 'approach', silent: true, durationS: 2.2, hour },
    { id: 'sit', kind: 'sit', silent: true, durationS: 1.6 },
    { id: 'breath', kind: 'breath', silent: true, durationS: 2.0 },
    { id: 'card', kind: 'card', silent: true, durationS: 2.6 },
    { id: 'boot', kind: 'boot', silent: true, durationS: 2.6, sound: 'boot' },
  ];
}

/** How long the opening runs if nobody touches anything. */
export function openingTotalS(state) {
  return openingScenes(state).reduce((n, sc) => n + sc.durationS, 0);
}

/**
 * What the tape prints. A dot-matrix printer prints what it is given, in
 * capitals, one line at a time, so this is the night as figures — the same
 * figures the full report carries — and nothing else.
 */
function printoutLines(state, result) {
  const s = result.stats ?? {};
  const mission = state.mission?.name ?? result.missionId ?? '';
  const seat = ROLES[result.role]?.label ?? '';
  const lines = [
    `${String(mission).toUpperCase()} · ${seat}`,
    `WATCH ENDED ${result.clock ?? ''}`.trim(),
    '',
    result.headline ?? '',
  ];
  if (result.cause) lines.push(String(result.cause).toUpperCase());
  lines.push('');
  if (result.abandoned) {
    lines.push('NOT SCORED. THE WATCH WAS NOT STOOD.');
  } else {
    lines.push(`SCORE ${result.score}`);
    lines.push(`AIRCRAFT DESTROYED ${s.kills ?? 0} · TURNED BACK ${s.turnedBack ?? 0}`);
    lines.push(`LEAKERS ${s.leakers ?? 0} · ROUNDS EXPENDED ${s.roundsFired ?? 0}`);
    const lost = (result.assets ?? []).filter((a) => a.destroyed).map((a) => a.label);
    lines.push(lost.length ? `GROUND LOST: ${lost.join(', ')}` : 'GROUND LOST: NONE');
  }
  lines.push(`STANDING ${Math.round(result.standing ?? 0)} — ${result.tierLabel ?? ''}`.trim());
  lines.push('');
  lines.push('END OF TAPE');
  return lines;
}

/**
 * What the commissar says.
 *
 * First the log: every decision the file charged or credited that the night
 * itself would read differently — the hospital, the encampment, the freeze,
 * the border, a priority refused — is read back in the section's voice. Then
 * the file entry, which is the same words the full report prints. Then the
 * dismissal, which depends on the tier.
 */
function commissarLines(result, consequence, pressure) {
  if (result.abandoned) {
    return [
      `You left the post${result.clock ? ` at ${result.clock}` : ''}, with the watch still running. The log was signed for you.`,
      'The file records an abandoned watch and nothing else, because nothing else was done.',
      'That is all.',
    ];
  }
  const lines = [];
  if (pressure) {
    const reactions = (result.ledger ?? [])
      .filter((l) => Math.abs(l.charged ?? l.delta ?? 0) >= 2
        && /civil|hospital|encampment|freeze|border|priority|state aircraft|movement order|Listonian|relayed|standing order|restriction|own authority/i.test(l.reason ?? ''))
      .slice(-4)
      .map((l) => {
        const charged = l.charged ?? l.delta;
        const reason = String(l.reason).replace(/\.$/, '');
        return charged > 0
          ? `The log says: ${reason}. The section notes it, in your favour.`
          : `The log says: ${reason}. The section notes it.`;
      });
    lines.push(...reactions);
  }
  lines.push(...consequence.lines);
  const dismissal = {
    commended: 'You may go.',
    satisfactory: 'Dismissed.',
    noted: 'That will be all. For now.',
    flagged: 'Sign here. And here.',
    condemned: 'You will be told where to report.',
  }[consequence.tier.id];
  if (pressure && dismissal) lines.push(dismissal);
  return lines;
}

function appointmentLines(appointment, pressure) {
  const lines = [`By order of the Chief of Air Defence, you are appointed ${appointment.echelon.appointment.en}.`];
  if (appointment.gazetted) lines.push(`You are gazetted to ${appointment.gazetted.en} on the same order.`);
  if (pressure && appointment.note) lines.push(appointment.note);
  if (appointment.echelon.blurb) lines.push(appointment.echelon.blurb);
  return lines;
}

/* ------------------------------------------------------------------- the player */

/** Characters typed a second. A dot-matrix head is slower than a person reads. */
const TYPE_RATE = { printout: 55, default: 42 };

/**
 * Plays a list of scenes on the scene host.
 *
 * The host is a fixed, full-window element holding the canvas, the text box,
 * the prompt and the SKIP button (see index.html). The canvas is 320 by 180
 * and scaled by CSS in whole pixels to fit the window; the text box is laid
 * over the part of the picture the scene names, in scene coordinates, so it
 * lands on the paper in the operator's hands or across the bottom of the
 * office wherever the window happens to be.
 */
export class ScenePlayer {
  constructor(host, { audio = null } = {}) {
    this.host = host;
    this.canvas = host.querySelector('canvas');
    this.textBox = host.querySelector('.scene-text');
    this.speakerEl = host.querySelector('.scene-speaker');
    this.bodyEl = host.querySelector('.scene-body');
    this.promptEl = host.querySelector('.scene-prompt');
    this.skipBtn = host.querySelector('.scene-skip');
    this.audio = audio;
    this.canvas.width = SCENE_W;
    this.canvas.height = SCENE_H;
    this.ctx = this.canvas.getContext('2d');
    this.scenes = [];
    this.index = -1;
    this.line = 0;
    this.typed = 0;
    this.playing = false;
    this.raf = 0;
    this.character = null;
    this.faces = new Map();
    this.onDone = null;
    this.onKey = (e) => {
      if (!this.playing) return;
      if (e.key === 'Escape') { e.preventDefault(); this.skipAll(); return; }
      if (['Enter', ' ', 'ArrowRight', 'Tab'].includes(e.key) || e.key.length === 1) {
        e.preventDefault();
        this.advance();
      }
    };
    this.onTap = (e) => {
      if (!this.playing) return;
      if (e.target === this.skipBtn) return;
      e.preventDefault();
      this.advance();
    };
    this.onResize = () => this.layout();
    if (this.skipBtn) this.skipBtn.onclick = () => this.skipAll();
  }

  /** Start the sequence. `character` is the operator, for the hands and the face. */
  play(scenes, { onDone = null, character = null } = {}) {
    this.stop();
    this.scenes = scenes.filter((s) => s && (s.lines?.length || s.silent));
    this.character = character;
    this.onDone = onDone;
    if (!this.scenes.length) { onDone?.(); return; }
    this.playing = true;
    this.host.hidden = false;
    this.index = 0;
    this.line = 0;
    this.typed = 0;
    this.sceneStartedAt = 0;
    this.lastTick = 0;
    window.addEventListener('keydown', this.onKey);
    this.host.addEventListener('pointerdown', this.onTap);
    window.addEventListener('resize', this.onResize);
    this.layout();
    this.showScene();
    this.raf = requestAnimationFrame((now) => this.frame(now));
  }

  stop() {
    if (!this.playing && this.index < 0) return;
    this.playing = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKey);
    this.host.removeEventListener('pointerdown', this.onTap);
    window.removeEventListener('resize', this.onResize);
    this.host.hidden = true;
    this.index = -1;
  }

  get scene() { return this.scenes[this.index] ?? null; }

  /** A key or a tap: finish the line being typed, or go on to the next. */
  advance() {
    const scene = this.scene;
    if (!scene) return;
    // A wordless beat has nothing to finish typing: a key goes on.
    if (scene.silent) { this.next(); return; }
    const text = scene.lines[this.line] ?? '';
    if (this.typed < text.length) { this.typed = text.length; this.renderText(); return; }
    // The printout and the letter stay on the page: lines accumulate; the
    // spoken scenes replace one line with the next.
    if (this.line < scene.lines.length - 1) {
      this.line++;
      this.typed = 0;
      this.renderText();
      return;
    }
    this.next();
  }

  next() {
    if (this.index >= this.scenes.length - 1) { this.finish(); return; }
    this.index++;
    this.line = 0;
    this.typed = 0;
    this.showScene();
  }

  skipAll() { this.finish(); }

  finish() {
    const done = this.onDone;
    this.stop();
    done?.();
  }

  showScene() {
    const scene = this.scene;
    this.sceneStartedAt = performance.now();
    this.host.dataset.kind = scene.kind;
    if (this.textBox) this.textBox.hidden = !!scene.silent;
    if (this.speakerEl) this.speakerEl.textContent = scene.speaker ?? '';
    if (scene.sound === 'boot') this.audio?.boot?.();
    this.renderText();
    this.layout();
  }

  /** The text box, laid out in scene coordinates. */
  static textRect(scene) {
    switch (scene.kind) {
      // On the paper, between the thumbs that hold it.
      case 'printout': return { x: 80, y: 76, w: 160, h: 96 };
      case 'quarters': return { x: 80, y: 80, w: 160, h: 88 };
      case 'folder': return { x: 56, y: 44, w: 176, h: 116 };
      default: return { x: 14, y: 120, w: 292, h: 54 };
    }
  }

  layout() {
    const vw = this.host.clientWidth || window.innerWidth;
    const vh = this.host.clientHeight || window.innerHeight;
    const k = Math.max(1, Math.floor(Math.min(vw / SCENE_W, vh / SCENE_H)));
    const w = SCENE_W * k;
    const h = SCENE_H * k;
    // A phone held upright fits the picture once, and words drawn on it at
    // that size cannot be read. There the picture sits in the upper part of
    // the window and the words go under it, at a size for a thumb's length.
    const stacked = k < 2 && vh >= h + 140;
    const left = Math.floor((vw - w) / 2);
    const top = stacked ? Math.max(8, Math.floor((vh - h) * 0.2)) : Math.floor((vh - h) / 2);
    this.scale = k;
    this.stacked = stacked;
    this.host.classList.toggle('is-stacked', stacked);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.canvas.style.left = `${left}px`;
    this.canvas.style.top = `${top}px`;
    const scene = this.scene;
    if (scene && this.textBox) {
      if (stacked) {
        const pad = 12;
        const y = top + h + pad;
        Object.assign(this.textBox.style, {
          left: `${pad}px`, top: `${y}px`,
          width: `${vw - pad * 2}px`, height: `${Math.max(140, vh - y - pad)}px`,
        });
        this.host.style.setProperty('--scene-scale', '3');
      } else {
        const r = ScenePlayer.textRect(scene);
        Object.assign(this.textBox.style, {
          left: `${left + r.x * k}px`, top: `${top + r.y * k}px`,
          width: `${r.w * k}px`, height: `${r.h * k}px`,
        });
        this.host.style.setProperty('--scene-scale', String(k));
      }
    }
  }

  /** The words on the page so far — every finished line, and the one being typed. */
  renderText() {
    const scene = this.scene;
    if (!scene || !this.bodyEl || scene.silent) return;
    const keeps = scene.kind === 'printout' || scene.kind === 'quarters' || scene.kind === 'folder';
    const shown = keeps ? scene.lines.slice(0, this.line) : [];
    const current = (scene.lines[this.line] ?? '').slice(0, this.typed);
    const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    this.bodyEl.innerHTML = shown.map((l) => `<p>${esc(l) || '&nbsp;'}</p>`).join('')
      + `<p class="is-typing">${esc(current)}<i class="cursor"></i></p>`;
    const text = scene.lines[this.line] ?? '';
    const last = this.line >= scene.lines.length - 1;
    if (this.promptEl) {
      this.promptEl.textContent = this.typed < text.length ? '' : last ? '▶ NEXT' : '▶';
    }
    if (keeps) this.bodyEl.scrollTop = this.bodyEl.scrollHeight;
  }

  frame(now) {
    if (!this.playing) return;
    const scene = this.scene;
    const t = (now - this.sceneStartedAt) / 1000;
    // A wordless beat runs its length and goes on by itself.
    if (scene.silent && scene.durationS && t >= scene.durationS) {
      this.next();
      if (this.playing) this.raf = requestAnimationFrame((n) => this.frame(n));
      return;
    }
    // The typing.
    const text = scene.lines?.[this.line] ?? '';
    if (!scene.silent && this.typed < text.length) {
      const rate = TYPE_RATE[scene.kind] ?? TYPE_RATE.default;
      const dt = this.lastTick ? (now - this.lastTick) / 1000 : 0;
      const want = Math.min(text.length, this.typed + Math.max(1, Math.round(rate * dt)));
      if (want !== this.typed) {
        this.typed = want;
        this.renderText();
        if (scene.kind === 'printout' && this.audio?.enabled) this.audio.tick?.();
      }
    }
    this.lastTick = now;
    this.draw(t, this.typed < text.length);
    this.raf = requestAnimationFrame((n) => this.frame(n));
  }

  face(seed) {
    if (!this.faces.has(seed)) this.faces.set(seed, portraitCells(seed));
    return this.faces.get(seed);
  }

  draw(t, talking) {
    const scene = this.scene;
    const ctx = this.ctx;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    switch (scene.kind) {
      case 'printout': drawPrintout(ctx, t, this.character); break;
      case 'office': drawOffice(ctx, t, { talking, face: this.face('THE POLITICAL SECTION'), tier: scene.tier }); break;
      case 'folder': drawFolder(ctx, t, this.character); break;
      case 'quarters': drawQuarters(ctx, t, this.character); break;
      case 'ending': drawEnding(ctx, t, { held: scene.held }); break;
      case 'approach': drawApproach(ctx, t, scene); break;
      case 'sit': drawSit(ctx, t, this.character); break;
      case 'breath': drawBreath(ctx, t, this.character); break;
      case 'card': drawCard(ctx, t, this.character); break;
      case 'boot': drawBoot(ctx, t, scene, this.character); break;
      default: ctx.fillStyle = '#000'; ctx.fillRect(0, 0, SCENE_W, SCENE_H);
    }
    ctx.restore();
  }
}

/* ------------------------------------------------------------------ the pictures */

const px = (ctx, x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };

/** The two backdrop inks a portrait was taken against, so a scene can leave them out. */
function backdropOf(seed) {
  const back = portraitFeatures(seed).back;
  const n = parseInt(back.slice(1), 16);
  const dim = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, v - 18));
  return [back, `#${dim.map((v) => v.toString(16).padStart(2, '0')).join('')}`];
}

/**
 * Draw a portrait's cells at a scale, optionally with a peaked cap on top.
 * The booth backdrop behind the head is left out — in a room the room is the
 * backdrop — and the tunic's shoulders are drawn by the scene instead.
 */
function blitFace(ctx, cells, x, y, k, { cap = null, mouthOpen = false, backdrop = [] } = {}) {
  for (let j = 0; j < PORTRAIT_H; j++) {
    for (let i = 0; i < PORTRAIT_W; i++) {
      const c = cells[j][i];
      if (backdrop.includes(c)) continue;
      px(ctx, x + i * k, y + j * k, k, k, c);
    }
  }
  if (mouthOpen) px(ctx, x + 10 * k, y + 18 * k, 5 * k, 2 * k, '#2a1a14');
  if (cap) {
    // A service cap: the crown over the hair, a band, a peak, a small badge.
    px(ctx, x + 5 * k, y + 2 * k, 14 * k, 3 * k, cap.crown);
    px(ctx, x + 6 * k, y + 1 * k, 12 * k, 1 * k, cap.crown);
    px(ctx, x + 4 * k, y + 5 * k, 16 * k, 2 * k, cap.band);
    px(ctx, x + 3 * k, y + 7 * k, 18 * k, 1 * k, '#101010');
    px(ctx, x + 11 * k, y + 5 * k, 2 * k, 2 * k, '#d9b95a');
  }
}

/** Hands holding a sheet: skin from the operator's own portrait. */
function hands(ctx, skin, y) {
  const lit = skin[0];
  const dark = skin[1];
  // Left hand, thumb over the paper's edge.
  px(ctx, 28, y + 10, 44, 60, dark);
  px(ctx, 34, y + 6, 34, 60, lit);
  px(ctx, 60, y - 2, 16, 30, lit);
  px(ctx, 70, y - 2, 6, 30, dark);
  // Right hand.
  px(ctx, 248, y + 10, 44, 60, dark);
  px(ctx, 252, y + 6, 34, 60, lit);
  px(ctx, 244, y - 2, 16, 30, lit);
  px(ctx, 244, y - 2, 6, 30, dark);
  // Cuffs.
  px(ctx, 24, y + 56, 52, 24, '#3d4b33');
  px(ctx, 244, y + 56, 52, 24, '#3d4b33');
}

/** A sheet of tractor-feed paper with its sprocket holes and green bars. */
function sheet(ctx, x, y, w, h, { cream = false } = {}) {
  px(ctx, x + 2, y + 2, w, h, 'rgba(0,0,0,.45)');
  px(ctx, x, y, w, h, cream ? '#efe6cf' : '#f1f1ea');
  if (!cream) {
    for (let yy = y + 6; yy < y + h; yy += 12) px(ctx, x + 8, yy, w - 16, 6, '#e0eadf');
    for (let yy = y + 5; yy < y + h; yy += 8) {
      px(ctx, x + 3, yy, 2, 2, '#b8b8b0');
      px(ctx, x + w - 5, yy, 2, 2, '#b8b8b0');
    }
    px(ctx, x + 7, y, 1, h, '#cfcfc6');
    px(ctx, x + w - 8, y, 1, h, '#cfcfc6');
  } else {
    for (let yy = y + 12; yy < y + h; yy += 9) px(ctx, x + 6, yy, w - 12, 1, '#cfd8e6');
  }
}

/** The room the console is in, seen from the seat, with the tube glowing. */
/**
 * The console room. `live` draws the tube with its rings and sweep and the
 * lamps lit; before the boot it is a dark glass on a dark panel, and `tube`
 * (0..1) is how far the set has come up.
 */
function consoleRoom(ctx, t, { live = true, tube = 1, lamps = 1 } = {}) {
  px(ctx, 0, 0, SCENE_W, SCENE_H, '#0a0d0a');
  // The panel across the top, the tube in the middle of it.
  px(ctx, 0, 0, SCENE_W, 70, '#2a2e27');
  px(ctx, 0, 66, SCENE_W, 4, '#1a1d18');
  px(ctx, 96, 6, 128, 56, '#0c0c0c');
  px(ctx, 100, 10, 120, 48, live ? '#04140c' : '#050706');
  if (live && tube > 0) {
    // Range rings and the sweep, arriving in order as the set comes up.
    ctx.strokeStyle = `rgba(64,255,158,${0.25 * Math.min(1, tube * 1.5)})`;
    ctx.lineWidth = 1;
    const rings = [8, 16, 24].slice(0, Math.ceil(tube * 3));
    for (const r of rings) { ctx.beginPath(); ctx.arc(160, 34, r, 0, Math.PI * 2); ctx.stroke(); }
    if (tube >= 0.6) {
      const a = (t * 1.6) % (Math.PI * 2);
      ctx.strokeStyle = 'rgba(64,255,158,.9)';
      ctx.beginPath(); ctx.moveTo(160, 34); ctx.lineTo(160 + Math.cos(a) * 24, 34 + Math.sin(a) * 24); ctx.stroke();
    }
  }
  // Lamps and switches either side; the lamps come up with the set.
  for (let i = 0; i < 4; i++) {
    const on = lamps >= (i + 1) / 4;
    px(ctx, 20 + i * 14, 16, 6, 6, on && i === 1 ? '#ffb43c' : on && i === 0 ? '#45e874' : '#3a3f36');
    px(ctx, 244 + i * 14, 16, 6, 6, on && i === 2 ? '#45e874' : '#3a3f36');
  }
  for (let i = 0; i < 5; i++) { px(ctx, 22 + i * 12, 36, 4, 12, '#6e7568'); px(ctx, 22 + i * 12, 36 + (i % 2) * 6, 4, 6, '#d9dcd4'); }
  for (let i = 0; i < 5; i++) { px(ctx, 244 + i * 12, 36, 4, 12, '#6e7568'); px(ctx, 244 + i * 12, 36 + ((i + 1) % 2) * 6, 4, 6, '#d9dcd4'); }
  // The desk edge, and the glow of the tube on it.
  px(ctx, 0, 70, SCENE_W, 110, '#141712');
  px(ctx, 0, 70, SCENE_W, 8, '#1e2119');
  if (live) {
    ctx.fillStyle = `rgba(64,255,158,${0.06 * tube})`;
    ctx.fillRect(80, 78, 160, 100);
  }
}

/* ------------------------------------------------------------------ the opening */

/** The card reader on the panel's left, with its three lamps. */
function cardReader(ctx, { power = false, card = false, net = false } = {}) {
  px(ctx, 24, 50, 44, 12, '#111311');
  px(ctx, 26, 52, 40, 8, '#1c1f1b');
  px(ctx, 30, 55, 32, 2, '#050605');           // the slot mouth
  px(ctx, 27, 53, 3, 3, power ? '#5aa9ff' : '#2a2f36');
  px(ctx, 32, 53, 3, 3, card ? '#45e874' : '#2a3a2f');
  px(ctx, 37, 53, 3, 3, net ? '#ffb43c' : '#3a3428');
}

/** The operator's card, white plastic with the photograph and a band. */
function idCard(ctx, x, y) {
  px(ctx, x, y, 18, 12, '#e8e6df');
  px(ctx, x, y, 18, 2, '#8a1f1a');
  px(ctx, x + 2, y + 4, 5, 6, '#c9a27f');
  px(ctx, x + 9, y + 5, 7, 1, '#3b3f38');
  px(ctx, x + 9, y + 7, 6, 1, '#3b3f38');
  px(ctx, x + 9, y + 9, 4, 1, '#3b3f38');
}

/** A hand from the bottom of the frame, holding something at (x, y). */
function reachingHand(ctx, skin, x, y) {
  const [light, dark] = skin;
  px(ctx, x - 6, y + 8, 22, 60, light);
  px(ctx, x - 6, y + 8, 4, 60, dark);
  px(ctx, x - 2, y + 2, 6, 10, light);          // the thumb on the card
  px(ctx, x + 12, y + 4, 6, 8, light);          // a finger over its edge
}

const skinOf = (character) => (character ? portraitFeatures(character.name).skin : ['#e9c4a0', '#cda07a']);

/** Walking up to the console in the dark: the panel grows as you come to it. */
function drawApproach(ctx, t, scene) {
  const p = Math.min(1, t / 2.2);
  const k = 0.72 + 0.28 * (1 - Math.pow(1 - p, 2));
  px(ctx, 0, 0, SCENE_W, SCENE_H, '#000');
  ctx.save();
  ctx.translate(SCENE_W / 2, SCENE_H * 0.55);
  ctx.scale(k, k);
  ctx.translate(-SCENE_W / 2, -SCENE_H * 0.55);
  consoleRoom(ctx, t, { live: false, lamps: 0 });
  cardReader(ctx, {});
  // The room around it: a doorway's light behind you, on the floor.
  ctx.fillStyle = 'rgba(120,130,110,.05)';
  ctx.fillRect(0, 150, SCENE_W, 30);
  ctx.restore();
  // The hour on the wall clock, dim, so the watch's own night is set.
  ctx.fillStyle = 'rgba(200,210,190,.35)';
  ctx.font = '7px monospace';
  ctx.fillText(scene.hour ?? '', 288, 8);
  // Darkness at the edges that lifts as you arrive.
  ctx.fillStyle = `rgba(0,0,0,${0.55 * (1 - p)})`;
  ctx.fillRect(0, 0, SCENE_W, SCENE_H);
}

/** Sitting: the view drops into the chair and the hands come to the desk. */
function drawSit(ctx, t, character) {
  const p = Math.min(1, t / 1.6);
  const ease = 1 - Math.pow(1 - p, 3);
  px(ctx, 0, 0, SCENE_W, SCENE_H, '#000');
  ctx.save();
  ctx.translate(0, -22 * (1 - ease));
  consoleRoom(ctx, t, { live: false, lamps: 0 });
  cardReader(ctx, {});
  ctx.restore();
  // The hands rise to the desk edge as you settle.
  hands(ctx, skinOf(character), 150 + (1 - ease) * 50);
}

/** One breath: the frame settles, dims a little, and comes back. */
function drawBreath(ctx, t, character) {
  const p = Math.min(1, t / 2.0);
  const breath = Math.sin(p * Math.PI);          // in, then out
  px(ctx, 0, 0, SCENE_W, SCENE_H, '#000');
  ctx.save();
  ctx.translate(0, Math.round(-1.5 * breath));
  consoleRoom(ctx, t, { live: false, lamps: 0 });
  cardReader(ctx, {});
  ctx.restore();
  hands(ctx, skinOf(character), 150);
  ctx.fillStyle = `rgba(0,0,0,${0.22 * breath})`;
  ctx.fillRect(0, 0, SCENE_W, SCENE_H);
}

/** The card into the reader: blue when the reader sees it, green when it is seated. */
function drawCard(ctx, t, character) {
  const p = Math.min(1, t / 1.6);                // the travel takes 1.6 s of the 2.6
  const ease = 1 - Math.pow(1 - p, 2);
  px(ctx, 0, 0, SCENE_W, SCENE_H, '#000');
  consoleRoom(ctx, t, { live: false, lamps: 0 });
  const seated = p >= 1;
  const halfway = p >= 0.55;
  // The card comes up from the lower left into the slot; once it is in, the
  // reader is drawn over its top so it sits half out, as it does on the console.
  const x = 36 + (1 - ease) * 30;
  const y = 44 + (1 - ease) * 100;
  const skin = skinOf(character);
  if (!seated) reachingHand(ctx, skin, x, y);
  idCard(ctx, x, y);
  cardReader(ctx, { power: halfway, card: seated });
  if (seated) {
    // The hand withdraws to the desk over the next half second.
    hands(ctx, skin, 150 + 20 * Math.max(0, 1 - (t - 1.6) / 0.6));
  }
}

/** The set boots: a dot, then the rings, then the sweep and the lamps. */
function drawBoot(ctx, t, scene, character) {
  const p = Math.min(1, t / 2.6);
  px(ctx, 0, 0, SCENE_W, SCENE_H, '#000');
  consoleRoom(ctx, t, { live: p > 0.25, tube: Math.max(0, (p - 0.25) / 0.6), lamps: Math.max(0, (p - 0.1) / 0.8) });
  cardReader(ctx, { power: true, card: true, net: p > 0.9 });
  if (p <= 0.3) {
    // The dot in the middle of the glass, growing.
    const r = 1 + p * 8;
    ctx.fillStyle = `rgba(120,255,190,${0.6 + p})`;
    ctx.beginPath(); ctx.arc(160, 34, r, 0, Math.PI * 2); ctx.fill();
  }
  hands(ctx, skinOf(character), 150);
  if (p > 0.85) {
    ctx.fillStyle = 'rgba(199,255,228,.9)';
    ctx.font = '7px monospace';
    ctx.fillText('READY', 148, 60);
  }
}

function drawPrintout(ctx, t, character) {
  consoleRoom(ctx, t);
  // The printer on the desk at the right, feeding.
  px(ctx, 262, 76, 50, 26, '#3b3f38');
  px(ctx, 266, 80, 42, 4, '#101010');
  px(ctx, 270, 88, 8, 4, (Math.floor(t * 4) % 2) ? '#45e874' : '#1c2a1c');
  // The sheet rises into the hands over the first second and a half.
  const rise = Math.min(1, t / 1.5);
  const y = 74 + (1 - rise) * 60;
  sheet(ctx, 62, y - 8, 196, 130);
  hands(ctx, character ? portraitFeatures(character.name).skin : ['#e9c4a0', '#cda07a'], 120);
}

function drawOffice(ctx, t, { talking, face, tier }) {
  // The wall, the wainscot, the floor.
  px(ctx, 0, 0, SCENE_W, SCENE_H, '#4a4f3a');
  px(ctx, 0, 0, SCENE_W, 6, '#3c4030');
  px(ctx, 0, 96, SCENE_W, 4, '#2f3326');
  px(ctx, 0, 100, SCENE_W, 80, '#3a3128');
  // The window, and the night past it: a few stars, and snow.
  px(ctx, 232, 14, 66, 48, '#1b1f2e');
  px(ctx, 232, 14, 66, 48, 'rgba(0,0,0,0)');
  px(ctx, 228, 10, 74, 4, '#5a5240'); px(ctx, 228, 62, 74, 4, '#5a5240');
  px(ctx, 228, 10, 4, 56, '#5a5240'); px(ctx, 298, 10, 4, 56, '#5a5240');
  px(ctx, 264, 14, 2, 48, '#5a5240'); px(ctx, 232, 37, 66, 2, '#5a5240');
  for (const [sx, sy] of [[240, 20], [252, 30], [286, 18], [292, 44], [244, 52]]) px(ctx, sx, sy, 1, 1, '#c9d2ff');
  for (let i = 0; i < 12; i++) {
    const sx = 234 + ((i * 37) % 62);
    const sy = 15 + ((t * 9 + i * 13) % 46);
    px(ctx, sx, sy, 1, 1, '#e8ecf5');
  }
  // The portrait on the wall: a frame around a shape nobody can name.
  px(ctx, 24, 14, 46, 36, '#2a2418');
  px(ctx, 27, 17, 40, 30, '#6e6a58');
  px(ctx, 41, 22, 12, 10, '#3a3a34'); px(ctx, 37, 31, 20, 14, '#3a3a34'); px(ctx, 44, 20, 6, 3, '#2c2c28');
  // A flag in the corner, red with a gold device.
  px(ctx, 6, 20, 3, 76, '#8a6d3b');
  px(ctx, 9, 22, 12, 40, '#9a2b26'); px(ctx, 12, 30, 6, 6, '#d9b95a');
  // The desk, the papers, the telephone, the lamp with its cone of light.
  ctx.fillStyle = 'rgba(255,220,140,.10)';
  ctx.beginPath(); ctx.moveTo(84, 60); ctx.lineTo(40, 112); ctx.lineTo(150, 112); ctx.closePath(); ctx.fill();
  px(ctx, 20, 104, 280, 14, '#6b4a2a');
  px(ctx, 20, 118, 280, 62, '#4e3620');
  px(ctx, 24, 106, 272, 2, '#8a6236');
  px(ctx, 78, 50, 16, 8, '#2f5a3a'); px(ctx, 84, 58, 4, 46, '#2a2a26'); px(ctx, 76, 100, 20, 4, '#2a2a26');
  px(ctx, 40, 98, 34, 8, '#e5e1d0'); px(ctx, 44, 96, 30, 2, '#dad6c4'); px(ctx, 46, 100, 22, 1, '#8b8b80');
  px(ctx, 236, 90, 30, 14, '#141414'); px(ctx, 232, 86, 38, 5, '#1c1c1c'); px(ctx, 250, 96, 8, 4, '#2a2a2a');
  px(ctx, 120, 100, 42, 6, '#c8b98a'); px(ctx, 124, 98, 34, 2, '#b9aa7c');
  // The commissar, behind the desk, cap on, boards on; the mouth moves while
  // the section is speaking. The tier decides only how much of the lamp's
  // light reaches the face.
  const k = 2;
  const fx = 148;
  const fy = 34;
  px(ctx, fx - 14, fy + 44, 76, 30, '#3d4b33');
  px(ctx, fx - 12, fy + 44, 14, 6, '#4b5537'); px(ctx, fx + 46, fy + 44, 14, 6, '#4b5537');
  px(ctx, fx - 12, fy + 45, 14, 1, '#b83a32'); px(ctx, fx + 46, fy + 45, 14, 1, '#b83a32');
  blitFace(ctx, face, fx, fy, k, {
    cap: { crown: '#2f4a3a', band: '#9a2b26' },
    mouthOpen: talking && Math.floor(t * 7) % 2 === 0,
    backdrop: backdropOf('THE POLITICAL SECTION'),
  });
  if (tier === 'flagged' || tier === 'condemned') {
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    ctx.fillRect(0, 0, SCENE_W, 104);
  }
}

function drawFolder(ctx, t, character) {
  // The desk from above, under the lamp: a folder open on it, a hand at the page.
  px(ctx, 0, 0, SCENE_W, SCENE_H, '#3a2c1e');
  ctx.fillStyle = 'rgba(255,220,140,.12)';
  ctx.beginPath(); ctx.ellipse(160, 90, 150, 90, 0, 0, Math.PI * 2); ctx.fill();
  px(ctx, 36, 22, 248, 146, '#b89a63');
  px(ctx, 36, 22, 248, 10, '#a3874f');
  px(ctx, 46, 34, 228, 136, '#efe9d6');
  for (let y = 48; y < 166; y += 9) px(ctx, 56, y, 208, 1, '#cfd8e6');
  px(ctx, 56, 40, 60, 4, '#9a2b26');
  px(ctx, 200, 38, 62, 8, '#d9d3bd'); px(ctx, 204, 40, 54, 4, 'rgba(154,43,38,.55)');
  const skin = character ? portraitFeatures(character.name).skin : ['#e9c4a0', '#cda07a'];
  const sway = Math.sin(t * 0.8) * 2;
  px(ctx, 250 + sway, 120, 60, 60, skin[1]); px(ctx, 254 + sway, 116, 46, 60, skin[0]);
  px(ctx, 236 + sway, 128, 30, 10, skin[0]);
}

function drawQuarters(ctx, t, character) {
  // A barrack room at night: a bulb, a bunk, a stove, snow past the window.
  px(ctx, 0, 0, SCENE_W, SCENE_H, '#1c1e22');
  px(ctx, 0, 0, SCENE_W, 100, '#2a2d33');
  px(ctx, 0, 100, SCENE_W, 80, '#22201c');
  // The bulb and its cone.
  px(ctx, 159, 0, 2, 22, '#4a4a4a'); px(ctx, 155, 22, 10, 8, '#f3e9b0'); px(ctx, 157, 30, 6, 4, '#f7f1cc');
  ctx.fillStyle = 'rgba(243,233,176,.09)';
  ctx.beginPath(); ctx.moveTo(160, 30); ctx.lineTo(30, 180); ctx.lineTo(290, 180); ctx.closePath(); ctx.fill();
  // The window, left, with snow.
  px(ctx, 24, 18, 60, 48, '#0f1420');
  px(ctx, 20, 14, 68, 4, '#4a4436'); px(ctx, 20, 66, 68, 4, '#4a4436'); px(ctx, 20, 14, 4, 56, '#4a4436'); px(ctx, 84, 14, 4, 56, '#4a4436');
  px(ctx, 53, 18, 2, 48, '#4a4436'); px(ctx, 24, 41, 60, 2, '#4a4436');
  for (let i = 0; i < 14; i++) px(ctx, 26 + ((i * 29) % 56), 19 + ((t * 8 + i * 11) % 46), 1, 1, '#e8ecf5');
  // The bunk, right, and the stove, left.
  px(ctx, 216, 62, 96, 44, '#4a4a48'); px(ctx, 220, 66, 88, 30, '#5f6a66'); px(ctx, 224, 68, 26, 12, '#d9d3bd');
  px(ctx, 214, 60, 4, 60, '#7a7a76'); px(ctx, 310, 60, 4, 60, '#7a7a76');
  px(ctx, 24, 76, 30, 34, '#2c2a26'); px(ctx, 28, 80, 22, 10, (Math.floor(t * 6) % 2) ? '#ff8a3a' : '#e0662a'); px(ctx, 36, 60, 6, 16, '#3a3834');
  // The letter, in hands.
  sheet(ctx, 58, 68, 204, 120, { cream: true });
  hands(ctx, character ? portraitFeatures(character.name).skin : ['#e9c4a0', '#cda07a'], 124);
}

function drawEnding(ctx, t, { held }) {
  // The valley at first light, or under a red sky.
  const bands = held
    ? ['#0b1226', '#1a2140', '#3a3560', '#7a4f6a', '#c07a5a', '#e8a86a']
    : ['#05060a', '#0d0a12', '#1a0d14', '#2c1016', '#40161a', '#5a1c1c'];
  for (let i = 0; i < bands.length; i++) px(ctx, 0, i * 20, SCENE_W, 20, bands[i]);
  for (let i = 0; i < 24; i++) px(ctx, (i * 53) % SCENE_W, (i * 17) % 60, 1, 1, held ? '#c9d2ff' : '#8a8a9a');
  // Hills, two ranges, and the river between them.
  ctx.fillStyle = held ? '#2a2f4a' : '#120c14';
  ctx.beginPath(); ctx.moveTo(0, 120);
  for (let x = 0; x <= SCENE_W; x += 8) ctx.lineTo(x, 112 - Math.abs(Math.sin(x / 41)) * 22 - Math.sin(x / 13) * 3);
  ctx.lineTo(SCENE_W, 180); ctx.lineTo(0, 180); ctx.closePath(); ctx.fill();
  px(ctx, 0, 132, SCENE_W, 48, held ? '#1a2030' : '#0c0a10');
  px(ctx, 0, 140, SCENE_W, 6, held ? '#4a6a8a' : '#2a2a3a');
  // The Ville's roofs and the tower, and one antenna turning on the ridge.
  for (let i = 0; i < 9; i++) px(ctx, 60 + i * 24, 148 + (i % 3) * 3, 16, 12, held ? '#22283a' : '#100c12');
  px(ctx, 172, 134, 6, 26, held ? '#22283a' : '#100c12'); px(ctx, 170, 130, 10, 4, held ? '#22283a' : '#100c12');
  const a = t * 1.2;
  px(ctx, 258, 92, 2, 14, '#0a0a12');
  ctx.strokeStyle = '#0a0a12'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(259, 92); ctx.lineTo(259 + Math.cos(a) * 12, 92 + Math.sin(a) * 4); ctx.stroke();
  if (!held) {
    for (let i = 0; i < 5; i++) {
      const sx = 90 + i * 40;
      px(ctx, sx, 150 - ((t * 20 + i * 9) % 30), 3, 3, (Math.floor(t * 8 + i) % 2) ? '#ff8a3a' : '#7a2a1a');
    }
  }
}
