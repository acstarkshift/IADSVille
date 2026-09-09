/**
 * Application shell: screens, the frame loop, and input.
 *
 * The simulation runs on a fixed 0.1 s step with an accumulator, so the physics
 * is identical whether the browser is managing 144 frames a second or 20, and
 * identical to the headless runs under `node --test`. Rendering happens every
 * frame; the DOM panels refresh at about eight hertz, because a track table that
 * updates sixty times a second cannot be read by a human being.
 */

import { World } from '../engine/world.js';
import { SCENARIOS, scenarioById, rosterFor, consoleCaps } from '../engine/scenarios.js';
import { SIM, SAM_TYPES, DEFENCE_CLASSES, ASSET_TYPES } from '../engine/config.js';
import {
  loadCampaign, saveCampaign, browserStore, recordMission, emptyCampaign,
  missionModifiers, enlist,
} from '../engine/campaign.js';
import { armTimeToImpact } from '../engine/doctrine.js';
import { stepCommand } from '../engine/command.js';
import { cannotEngageReason } from '../engine/threat.js';
import { AIR_TYPES } from '../engine/config.js';
import { dist, clamp01, clockString } from '../engine/math.js';
import { applyTheme } from './themes.js';
import { Scope } from './scope.js';
import { CrewConsole } from './console.js';
import { Audio } from './audio.js';
import {
  renderTopbar, renderTrackList, renderFlightStrip, renderFormations, renderBatteries, renderCrewConsole,
  renderEventLog, renderCommandNet, renderBlackout, renderScopeSide, stampLegends,
  clearPanelCache, RANGE_SCALES, batteryOrder,
} from './panels.js';
import { CONTROLS, POSTURE_CYCLE, legend } from './lexicon.js';
import { SPEED_BY_KEY, digitPressed } from './keymap.js';
import { renderMenu, renderBriefing, renderDebrief, renderControls } from './screens.js';
import { renderEnlistment, renderDossier } from './dossier.js';
import { learnSkill } from '../engine/character.js';

const SETTINGS_KEY = 'iadsville.settings.v1';
const store = browserStore();

const els = {};
const state = {
  phase: 'menu',
  missionId: SCENARIOS[0].id,
  get mission() { return scenarioById(this.missionId); },
  role: 'net',
  batteryId: null,
  difficulty: 'veteran',
  narrativePressure: true,
  audio: true,
  themeOverride: null,
  campaign: emptyCampaign(),
  speed: 1,
};

const ui = {
  selectedTrackId: null,
  selectedSiteId: null,
  dragFrom: null,
  dragTo: null,
  view: 'net',
  lastEventSeq: 0,
  lastPanelAt: 0,
  seenEventSeq: 0,
  /** rAF timestamp at which the end-of-watch beat gives way to the debrief. */
  watchEndsAt: 0,
  /** The country underlay. On by default; some people want a clean tube. */
  showMap: true,
  /** One sentence about whatever the pointer is over on the scope. */
  hoverInfo: null,
  /** Interactive-tutorial cursor: -1 off, otherwise an index into its steps. */
  tutorialStep: -1,
  tutorialStepAtS: 0,
  tutorialRendered: null,
};

let world = null;
let scope = null;
let crew = null;
let audio = null;
let accumulator = 0;
let lastFrame = 0;
let helpReturn = null;

/* ------------------------------------------------------------ settings */

function loadSettings() {
  try {
    const raw = store.get(SETTINGS_KEY);
    if (!raw) return;
    Object.assign(state, JSON.parse(raw));
  } catch { /* defaults are fine */ }

  /*
   * A saved selection can point at a watch this record is no longer — or not
   * yet — entitled to: the file was wiped, or the settings outlived it. Fall
   * back to something the appointment actually covers rather than opening on a
   * disabled card.
   */
  const roster = rosterFor(state.campaign);
  if (!roster.some((s) => s.id === state.missionId)) {
    state.missionId = roster[0]?.id ?? SCENARIOS[0].id;
  }
  if (!state.mission.roles.includes(state.role)) state.role = state.mission.roles[0];
}

function saveSettings() {
  try {
    store.set(SETTINGS_KEY, JSON.stringify({
      difficulty: state.difficulty,
      narrativePressure: state.narrativePressure,
      audio: state.audio,
      themeOverride: state.themeOverride,
      role: state.role,
      missionId: state.missionId,
    }));
  } catch { /* not fatal */ }
}

/* --------------------------------------------------------------- setup */

function cacheEls() {
  const id = (name) => document.getElementById(name);
  Object.assign(els, {
    shell: id('shell'),
    screen: id('screen'),
    canvas: id('scope'),
    scopeOverlay: id('scope-overlay'),
    scopeLegend: id('scope-legend'),
    tutorialCard: id('tutorial-card'),
    clock: id('clock'),
    missionName: id('mission-name'),
    airCount: id('air-count'),
    rounds: id('rounds'),
    standing: id('standing'),
    standingFill: id('standing-fill'),
    fusionState: id('fusion-state'),
    trackList: id('track-list'),
    flightStrip: id('flight-strip'),
    formationList: id('formation-list'),
    echelonPlate: id('echelon-plate'),
    trackDetail: id('track-detail'),
    batteryList: id('battery-list'),
    crewConsole: id('crew-console'),
    eventLog: id('event-log'),
    commandNet: id('command-net'),
    commandText: id('command-text'),
    commandTimer: id('command-timer'),
    speedGroup: id('speed-group'),
    viewToggle: id('view-toggle'),
    masterLamps: id('master-lamps'),
    operatorPlate: id('operator-plate'),
    scopeSide: id('scope-side'),
    abortAsk: id('abort-ask'),
    abortLine: id('abort-line'),
    abortConfirm: id('abort-confirm'),
    abortCancel: id('abort-cancel'),
  });
}

function boot() {
  cacheEls();
  // The fixed legends on the page come out of the lexicon, not out of the
  // markup, so the panel and the nomenclature table cannot disagree.
  stampLegends(document);
  // Exposed for the headless smoke and integration tests, and genuinely handy
  // when debugging a campaign state by hand.
  window.__state = state;
  // The service record first: the saved selection is validated against the
  // appointment it holds, so it has to exist before the settings are read.
  state.campaign = loadCampaign(store);
  loadSettings();
  scope = new Scope(els.canvas);
  crew = new CrewConsole(els.canvas);
  audio = new Audio();
  audio.setEnabled(state.audio);

  if (!state.mission.roles.includes(state.role)) state.role = state.mission.roles[0];
  ensureBattery();

  wireGlobalInput();
  wireCanvasInput();
  wirePanelInput();
  showMenu();
  requestAnimationFrame(frame);
}

/**
 * Seat the operator in the battery this watch is about.
 *
 * The old rule kept whatever battery was selected as long as it appeared
 * somewhere in the new mission's site list, which sounds harmless and is not:
 * BASTION is in the site list of nine watches, so anybody who played First
 * Light and then chose White Noise, Economy of Force, Across the Line or Ville
 * Under Fire was silently seated in BASTION — while every one of those four
 * files names a different cabin, three of the four briefs are written about
 * that cabin, and on Across the Line the battery you were given is the one
 * whose altitude floor makes the watch's own moral hinge unreachable.
 *
 * So the selection is remembered together with the watch it was made for. Stay
 * where you put yourself for as long as you are on that watch; change watch and
 * you arrive in the cabin the file names, which you may then change.
 */
let batteryChosenFor = null;

function ensureBattery() {
  const sites = state.mission.sites;
  const stale = batteryChosenFor !== state.missionId
    || !sites.some((s) => s.id === state.batteryId);
  if (stale) {
    state.batteryId = state.mission.playerBatteryId ?? sites[0].id;
    batteryChosenFor = state.missionId;
  }
}

/** The operator picked a battery by hand: that choice owns this watch. */
function chooseBattery(id) {
  state.batteryId = id;
  batteryChosenFor = state.missionId;
}

/* -------------------------------------------------------------- screens */

function showScreen(render) {
  els.screen.hidden = false;
  els.shell.hidden = true;
  render(els.screen, state);
}

/**
 * Nobody gets a scope until they have a file. Enlistment is the first screen a
 * new player sees, and it is where the campaign's identity is decided.
 */
function showEnlistment() {
  state.phase = 'enlist';
  applyTheme(state.themeOverride ?? 'crt-green');
  showScreen(renderEnlistment);
  const host = els.screen;
  const nameInput = host.querySelector('#enlist-name');

  host.querySelector('#enlist-reroll').onclick = () => {
    state.pendingName = null;
    showEnlistment();
  };
  const remember = () => { state.pendingName = nameInput.value; };
  host.querySelectorAll('[data-background]').forEach((btn) => {
    btn.onclick = () => {
      remember();
      state.pendingBackground = btn.dataset.background;
      showEnlistment();
    };
  });
  host.querySelectorAll('[data-household]').forEach((btn) => {
    btn.onclick = () => {
      remember();
      state.pendingHousehold = btn.dataset.household;
      showEnlistment();
    };
  });
  host.querySelector('#enlist-confirm').onclick = () => {
    enlist(state.campaign, {
      name: nameInput.value,
      background: state.pendingBackground,
      household: state.pendingHousehold,
    });
    saveCampaign(store, state.campaign);
    showMenu();
  };
  // The fast path past the paperwork wall: the suggested name and the clerk's
  // defaults, one click. The choices still exist — in the dossier, where they
  // can be read after the game has demonstrated what its nouns mean.
  host.querySelector('#enlist-defaults').onclick = () => {
    enlist(state.campaign, { name: nameInput.value });
    saveCampaign(store, state.campaign);
    showMenu();
  };
}

function showDossier(back) {
  state.phase = 'dossier';
  showScreen(renderDossier);
  els.screen.querySelectorAll('[data-skill]').forEach((btn) => {
    btn.onclick = () => {
      if (learnSkill(state.campaign.character, btn.dataset.skill)) {
        saveCampaign(store, state.campaign);
        showDossier(back);
      }
    };
  });
  els.screen.querySelector('#dossier-back').onclick = back;
}

function showMenu() {
  if (!state.campaign.character) { showEnlistment(); return; }
  state.phase = 'menu';
  applyTheme(state.themeOverride ?? state.mission.theme);
  scope.setTheme(state.themeOverride ?? state.mission.theme);
  showScreen(renderMenu);
  wireMenu();
}

function wireMenu() {
  const host = els.screen;
  host.querySelectorAll('[data-mission]').forEach((btn) => {
    btn.onclick = () => {
      state.missionId = btn.dataset.mission;
      if (!state.mission.roles.includes(state.role)) state.role = state.mission.roles[0];
      ensureBattery();
      saveSettings();
      showMenu();
    };
  });
  host.querySelectorAll('[data-role]').forEach((btn) => {
    btn.onclick = () => { state.role = btn.dataset.role; ensureBattery(); saveSettings(); showMenu(); };
  });
  host.querySelectorAll('[data-difficulty]').forEach((btn) => {
    btn.onclick = () => { state.difficulty = btn.dataset.difficulty; saveSettings(); showMenu(); };
  });

  const batteryPick = host.querySelector('#battery-pick');
  if (batteryPick) batteryPick.onchange = () => { chooseBattery(batteryPick.value); saveSettings(); };

  host.querySelector('#opt-pressure').onchange = (e) => {
    state.narrativePressure = e.target.checked; saveSettings();
  };
  host.querySelector('#opt-audio').onchange = (e) => {
    state.audio = e.target.checked; audio.setEnabled(state.audio); saveSettings();
  };
  host.querySelector('#opt-theme-lock').onchange = (e) => {
    state.themeOverride = e.target.checked ? (host.querySelector('#theme-pick').value ?? 'crt-green') : null;
    saveSettings(); showMenu();
  };
  host.querySelector('#theme-pick').onchange = (e) => {
    state.themeOverride = e.target.value; saveSettings(); showMenu();
  };

  host.querySelector('#btn-brief').onclick = () => { audio.resume(); showBriefing(); };
  host.querySelector('#btn-keys').onclick = () => showHelp(showMenu);
  host.querySelector('#btn-dossier').onclick = () => showDossier(showMenu);
  const wipe = host.querySelector('#btn-wipe');
  if (wipe) {
    wipe.onclick = () => {
      // Destroying the file also destroys the soldier: a new campaign starts
      // with a new enlistment, not with the same person at zero.
      state.campaign = emptyCampaign();
      state.pendingName = null;
      saveCampaign(store, state.campaign);
      showEnlistment();
    };
  }
}

function showBriefing() {
  state.phase = 'brief';
  applyTheme(state.themeOverride ?? state.mission.theme);
  showScreen(renderBriefing);
  els.screen.querySelector('#btn-start').onclick = startMission;
  els.screen.querySelector('#btn-back').onclick = showMenu;
}

function showHelp(back) {
  helpReturn = back;
  state.phase = 'help';
  // The key list belongs to the watch you are on: the teaching watch strips
  // salvo, RIDE and displacement off the console, so this page must not go on
  // telling a new operator to press S, G and X. One predicate answers for the
  // cap, the key and this page — see consoleCaps().
  const caps = consoleCaps(state.mission);
  showScreen((host) => renderControls(host, caps));
  els.screen.querySelector('#btn-close-help').onclick = () => helpReturn();
}

/* -------------------------------------------------------------- mission */

function startMission() {
  const themeId = state.themeOverride ?? state.mission.theme;
  applyTheme(themeId);
  scope.setTheme(themeId);
  crew.setTheme(themeId);

  world = new World(state.mission, {
    role: state.role,
    batteryId: state.batteryId,
    difficulty: state.difficulty,
    narrativePressure: state.narrativePressure,
    modifiers: missionModifiers(state.campaign, { narrativePressure: state.narrativePressure }),
    character: state.campaign.character,
    family: state.campaign.family,
  });

  ui.selectedTrackId = null;
  ui.selectedSiteId = world.control.crewedBatteryId ?? world.sites[0]?.id ?? null;
  ui.lastEventSeq = 0;
  ui.seenEventSeq = 0;
  ui.watchEndsAt = 0;
  ui.speedHintShown = false;
  ui.netPauseNoted = false;
  ui.hoverInfo = null;
  // The guided walk-through runs on the teaching watch, in whichever seat the
  // player took: the net gets the picture-and-assignment five, the cabin gets
  // the acquire-lock-launch five. It used to be gated off for `crew` entirely,
  // on the watch that exists to teach the controls.
  ui.tutorialStep = world.scenario.tutorial ? 0 : -1;
  ui.tutorialStepAtS = 0;
  ui.tutorialRendered = null;
  if (els.tutorialCard) els.tutorialCard.hidden = true;
  ui.view = state.role === 'crew' ? 'crew' : 'net';
  els.eventLog.innerHTML = '';
  accumulator = 0;
  state.speed = 1;
  setSpeed(1);

  els.viewToggle.hidden = state.role !== 'both';
  setViewToggle();
  els.abortAsk.hidden = true;
  ui.pressHeld = false;
  clearPanelCache(els);
  els.screen.hidden = true;
  els.shell.hidden = false;
  state.phase = 'mission';
  // Handy for debugging and for the headless smoke tests; harmless in play.
  window.__world = world;
  window.__state = state;
  window.__scope = scope;
  window.__ui = ui;
  /*
   * Frame the watch. Almost every scenario is drawn around the Ville at the
   * origin; the one fought over the capital is a hundred and seventeen
   * kilometres from it, and a scope centred on the sector's usual middle would
   * put the entire engagement in one corner.
   */
  scope.rangeKm = world.scenario.scopeRangeKm ?? world.echelon.scopeRangeKm;
  scope.origin = { ...world.centre };
  scope.centre = { ...world.centre };
  scope.clearPaint();
  audio.resume();
  audio.boot();
  updateLegend();
}

function endMission() {
  const result = world.outcome ?? world.result('aborted');
  const entry = recordMission(state.campaign, result);
  saveCampaign(store, state.campaign);
  audio.stopArmWarning();
  state.phase = 'debrief';
  els.shell.hidden = true;
  els.screen.hidden = false;
  renderDebrief(els.screen, state, result, entry);
  els.screen.querySelector('#btn-again').onclick = showMenu;
  els.screen.querySelector('#btn-replay').onclick = () => { showBriefing(); };
  const dossier = els.screen.querySelector('#btn-dossier-debrief');
  if (dossier) dossier.onclick = () => showDossier(() => endMissionScreen(result, entry));
}

/** Re-show a debrief after a detour through the dossier. */
function endMissionScreen(result, entry) {
  state.phase = 'debrief';
  els.shell.hidden = true;
  els.screen.hidden = false;
  renderDebrief(els.screen, state, result, entry);
  els.screen.querySelector('#btn-again').onclick = showMenu;
  els.screen.querySelector('#btn-replay').onclick = () => { showBriefing(); };
  const dossier = els.screen.querySelector('#btn-dossier-debrief');
  if (dossier) dossier.onclick = () => showDossier(() => endMissionScreen(result, entry));
}

function setSpeed(speed) {
  state.speed = speed;
  /*
   * The selected cap stays physically depressed, and it is the group's one
   * stop on the tab ring: four near-identical caps do not each deserve a
   * press of the Tab key. The left and right arrows move within the group,
   * which is how a segmented control is driven from a keyboard everywhere
   * else, and it keeps the walk to the rack short enough to be worth taking.
   */
  els.speedGroup.querySelectorAll('[data-speed]').forEach((b) => {
    const chosen = Number(b.dataset.speed) === speed;
    b.classList.toggle('is-down', chosen);
    b.tabIndex = chosen ? 0 : -1;
    b.setAttribute('aria-checked', String(chosen));
  });
  // Said once, the first time somebody tries it: sector command's clock is
  // not attached to your space bar.
  if (speed === 0 && world?.command?.pending && !ui.netPauseNoted) {
    ui.netPauseNoted = true;
    world.log('warn', 'THE NET DOES NOT PAUSE. THE TRANSMISSION IS STILL WAITING FOR AN ANSWER.');
  }
}

/* ----------------------------------------------------------- the loop */

function frame(now) {
  requestAnimationFrame(frame);
  const dtReal = Math.min(0.25, (now - lastFrame) / 1000 || 0);
  lastFrame = now;

  /*
   * The net does not pause. With the simulation frozen — the space bar, a
   * blurred window, the help screen — a pending directive's clock keeps
   * running on wall time. Reading the order carefully is free; unlimited
   * decision time at zero cost was a hole in the game's one honest threat,
   * and silence stays an answer even for a player who never unpauses.
   */
  const pending = world?.command?.pending;
  if (pending && world.phase === 'running'
      && (state.speed === 0 || state.phase !== 'mission')) {
    pending.deadlineS -= dtReal;
    if (world.t > pending.deadlineS) stepCommand(world, 0);
  }

  if (state.phase !== 'mission' || !world) return;

  // Fixed-step integration. The accumulator is capped so a backgrounded tab
  // resumes rather than trying to simulate the minute it missed.
  accumulator += dtReal * state.speed;
  let steps = 0;
  // Radar returns from EVERY sim step this frame, not just the last one. At
  // 2x and 4x several steps run per rendered frame, and painting only the
  // final step's plots silently dropped most of the sweep's echoes exactly
  // when the phosphor look matters most.
  const framePlots = [];
  while (accumulator >= SIM.dt && steps < 40) {
    world.step(SIM.dt);
    if (world.plots?.length) framePlots.push(...world.plots);
    accumulator -= SIM.dt;
    steps++;
    if (world.phase === 'complete') break;
  }
  if (steps > 1) world.plots = framePlots;

  render(now, dtReal);

  // Once, on a brand-new soldier's quiet opening: the speed controls exist.
  // Measured, a first-timer who waited for something to happen sat through
  // nine and a half minutes at 1x with four unremarked buttons that would
  // have fixed it.
  if (!ui.speedHintShown && state.speed === 1 && world.t > 75
      && world.stats.roundsFired === 0 && (world.character?.watches ?? 1) === 0) {
    ui.speedHintShown = true;
    // The keys are the numbers on the caps: 2 for twice, 4 for four times.
    world.log('info',
      'NOTHING CLOSE YET. TIME COMPRESSION IS ON THE BOARD — KEYS 2 AND 4. THE WATCH KEEPS AT 1.');
  }

  /*
   * The watch does not hard-cut to paperwork. When the simulation completes,
   * the tube stays live for a beat — the last splash still fading, the WATCH
   * ENDS line sitting in the ticker — before the debrief takes the screen.
   * Cutting on the same frame meant the final event of every mission was
   * never actually seen.
   */
  if (world.phase === 'complete') {
    if (!ui.watchEndsAt) ui.watchEndsAt = now + 2500;
    if (now >= ui.watchEndsAt) {
      ui.watchEndsAt = 0;
      endMission();
    }
  }
}

function render(now, frameDtS = 1 / 60) {
  const dark = world.dark;

  if (ui.view === 'crew') {
    if (!dark) crew.render(world, ui);
    else clearCanvas();
  } else if (!dark) {
    scope.render(world, ui, frameDtS);
  } else {
    clearCanvas();
  }

  applyEffects();
  handleAudio();

  /*
   * A dark console is DARK: the panels blank with the scope and the commands
   * go with them (see the input handlers), because a blackout that only
   * dimmed the map while the track list kept scrolling and the buttons kept
   * working was a screen effect, not an event. Speed and the handbook stay —
   * the room still exists — and the log catches up on restore, which is what
   * a recovering track store would do.
   */
  document.body.classList.toggle('is-console-dark', dark);
  if (now - ui.lastPanelAt > 120) {
    ui.lastPanelAt = now;
    renderTopbar(world, ui, els);
    /*
     * The rack holds still while it is being pressed. See the press handling
     * below: a cap rebuilt between the finger going down and coming up is a
     * different cap, and the press is thrown away. The clock above keeps
     * running, because the clock is not something anybody is holding.
     *
     * A press that never came back — the pointer left the window, the tab was
     * switched under a held finger — must not freeze the rack for good.
     */
    if (ui.pressHeld && now - (ui.pressHeldAt ?? 0) > 5000) ui.pressHeld = false;
    if (!dark && !ui.pressHeld) {
      renderTrackList(world, ui, els);
      renderFlightStrip(world, els);
      renderFormations(world, ui, els);
      renderBatteries(world, ui, els);
      renderScopeSide(world, ui, els, ui.view === 'crew' ? crew.rangeKm : scope.rangeKm);
      const cabin = !!world.control.crewedBatteryId && ui.view === 'crew';
      if (cabin) renderCrewConsole(world, ui, els);
      else els.crewConsole.hidden = true;
      // With the cabin up the rack is reference, not the control surface: it
      // yields the column so LOCK and the launch cap stay on the screen.
      els.batteryList.classList.toggle('is-secondary', cabin);
      els.formationList.classList.toggle('is-secondary', cabin);
      els.batteryList.classList.toggle('with-formations', world.formations.length > 1);
      updateLegend();
      renderTutorial();
    }
  }
  if (!dark) {
    renderEventLog(world, els, ui);
    renderCommandNet(world, els);
  }
  renderBlackout(world, els);
}

/*
 * A dark console shows the theme's own black. Read from BODY: the theme is
 * stamped on <body>, so asking documentElement for --bg returned the green
 * phosphor default on every watch — the amber and modern sets blanked to a
 * colour from a console they are not.
 */
function clearCanvas() {
  const ctx = els.canvas.getContext('2d');
  ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg').trim() || '#000';
  ctx.fillRect(0, 0, els.canvas.width, els.canvas.height);
}

/**
 * Screen shake, impact flashes and the power flicker, driven by the engine's
 * effect queue. Nothing here changes the simulation — but a hit that does not
 * register physically reads as a log line rather than as something that just
 * happened to you.
 */
function applyEffects() {
  let shaking = false;
  let shakeMag = 0;
  let flash = 0;
  let alarm = false;
  for (const effect of world.effects) {
    const age = world.t - effect.startedS;
    const life = effect.durationS ?? 1;
    if (age > life) continue;
    if (effect.kind === 'shake') {
      shaking = true;
      shakeMag = Math.max(shakeMag, effect.magnitude ?? 1);
    }
    if (effect.kind === 'alarm') alarm = true;
    /*
     * A flash is light. A blackout is the opposite of light, and it was being
     * consumed by this branch at the default magnitude of one — so a power
     * failure washed the tube CREAM at a third alpha for the whole six-to-ten
     * second reboot. The console going dark is already drawn, by the class
     * below; the effect needs nothing here but to stop pretending it is a
     * muzzle flash.
     */
    if (effect.kind === 'flash') {
      flash = Math.max(flash, (effect.magnitude ?? 1) * (1 - age / life));
    }
  }

  els.shell.classList.toggle('is-shaking', shaking);
  // A near miss and a direct hit used to produce the same fixed two-pixel
  // wiggle; the amplitude now carries the difference, over a range wide
  // enough to read: your own rail at 2.0px, a bomb that nearly had you at
  // 3.4px, a direct hit at 6.2px.
  if (shaking) els.shell.style.setProperty('--shake-px', `${(0.8 + shakeMag * 3.4).toFixed(1)}px`);

  // A launch aimed at one of your own sets: a red breath at the edges of the
  // tube. The engine has queued this effect since the first build; nothing
  // ever consumed it.
  els.shell.classList.toggle('is-alarm', alarm);

  // A brief wash of light over the scope, fading with the effect. The 0.3
  // factor made a kill's flash arithmetically imperceptible (0.09 alpha).
  // Only the alpha is set here; the colour is --flash-rgb, in theme.css.
  if (flash > 0.01) {
    els.scopeOverlay.style.setProperty('--flash-a', Math.min(0.35, flash * 0.55).toFixed(3));
  } else if (els.scopeOverlay.style.getPropertyValue('--flash-a')) {
    els.scopeOverlay.style.removeProperty('--flash-a');
  }

  // One-shot flicker on the whole console the moment something lands.
  const struck = world.effects.some((e) =>
    e.kind === 'shake' && world.t - e.startedS < 0.2);
  if (struck && !ui.flickering) {
    ui.flickering = true;
    els.shell.classList.add('is-hit');
    setTimeout(() => {
      els.shell.classList.remove('is-hit');
      ui.flickering = false;
    }, 500);
  }
}

/**
 * Map simulation events onto sound, plus the two continuous cues: the
 * anti-radiation warble and the low pulse that rises as something closes on a
 * defended asset.
 */
function handleAudio() {
  // A paused simulation is a silent one. The frame loop keeps running at
  // speed zero — for the panels — and for a long time the ARM warble ran
  // with it: a frozen scope screaming indefinitely about a frozen round.
  if (state.speed === 0 || document.hidden) {
    audio.stopArmWarning();
    return;
  }

  // Keyed on the monotonic event seq, never on array position: the event list
  // is capped, and comparing against its frozen length once made every sound
  // in the game stop for the last two minutes of the finale.
  for (const e of world.events) {
    if (e.seq <= ui.seenEventSeq) continue;
    if (e.kind === 'launch') audio.launch();
    else if (e.kind === 'good' && e.text.startsWith('SPLASH')) audio.splash();
    else if (e.kind === 'good' && e.text.includes('TURNING BACK')) audio.relief();
    // Ordering matters: 'NEAR MISS, POWER INTERRUPTED' also contains 'MISS',
    // and a bomb that nearly had you must not share a sound with your own
    // round going wide.
    else if (e.kind === 'warn' && e.text.includes('NEAR MISS')) audio.thud();
    else if (e.kind === 'warn' && e.text.includes('MISS')) audio.miss();
    // The other way a round ends. Measured silent on a quarter to a third of
    // every round fired on the suppression watches — the direct consequence of
    // the trade the whole game is built on, and it made no sound.
    else if (e.kind === 'warn' && e.text.includes('NO GUIDANCE')) audio.guidanceLost();
    else if (e.kind === 'warn' && e.text.startsWith('NEW CONTACT')) audio.newTrack();
    /*
     * Contact reports moved onto the radio net when the crews got a voice, and
     * took the new-contact tick with them: measured, eighteen contact reports
     * in a watch of White Noise and exactly ONE of them still matched this
     * map, because the other seventeen now read "WIDE EYE: NEW CONTACT, …".
     * Only this one line sounds — the rest of the radio traffic accompanies
     * events that already have their own noise.
     */
    else if (e.kind === 'comms' && e.text.includes('NEW CONTACT')) audio.newTrack();
    else if (e.kind === 'alert' && e.text.includes('WEAPONS RELEASE')) audio.release();
    else if (e.kind === 'alert' && e.text.includes('— HIT (')) audio.clank();
    else if (e.kind === 'alert' && /IMPACT|STRUCK|DESTROYED/.test(e.text)) audio.impact();
    else if (e.kind === 'command') audio.command();
  }
  ui.seenEventSeq = world.events.length
    ? world.events[world.events.length - 1].seq : ui.seenEventSeq;

  /*
   * The warble is the sound of a set holding an anti-radiation round on its
   * own nose: it runs only while a TARGETED radar is RADIATING, and quickens
   * with the soonest arrival. A round homing on a set that has shut down is
   * a different dread — the silence after the switch is the reward for
   * having thrown it, and the old any-alive-radar rule kept the warble at
   * half the watch's runtime, which is how an alarm becomes wallpaper.
   */
  let soonestArm = Infinity;
  for (const r of world.radars) {
    if (!r.alive || r.state !== 'radiating') continue;
    const eta = armTimeToImpact(world, r);
    if (eta < soonestArm) soonestArm = eta;
  }
  if (Number.isFinite(soonestArm)) {
    audio.startArmWarning();
    audio.setArmUrgency(soonestArm);
  } else {
    audio.stopArmWarning();
  }

  // Tension rises with the nearest inbound striker's time to its release
  // point — and only when it is genuinely close. The bed used to swell from
  // a minute out and idle around a sixth of full, which reads as texture,
  // not threat; below the floor it is simply off.
  let worst = 0;
  for (const aircraft of world.aircraft) {
    if (!aircraft.alive || aircraft.released || aircraft.type === 'civil') continue;
    const asset = world.assetById.get(aircraft.targetAssetId);
    if (!asset || asset.destroyed) continue;
    const releaseKm = AIR_TYPES[aircraft.type].releaseRangeKm;
    const toGo = Math.max(0, dist(aircraft.pos, asset.pos) - releaseKm);
    worst = Math.max(worst, 1 - clamp01(toGo / 45));
  }
  audio.pulse(worst < 0.15 ? 0 : worst);
}

function updateLegend() {
  /*
   * The line under the tube, written for a person.
   *
   * It is the seat's only on-screen instruction — a first-timer who picked the
   * cabin had to find the help screen to learn that the game had controls —
   * and it doubles as the hover readout, so pointing at anything on the scope
   * replaces it with what that thing IS.
   *
   * It used to end "right-click a radar to blink it", which is shop talk for
   * switching a set on and off for a few seconds and means nothing to anybody
   * who has not already been told. Plain sentences, and the key beside the
   * verb it performs.
   */
  els.scopeLegend.textContent = ui.hoverInfo ?? (ui.view === 'crew'
    ? 'Click a contact to designate it. L locks a channel onto it, F launches. '
      + 'E turns your own radar on and off — that one decision is the whole game.'
    : 'Point at anything to read what it is. Drag a contact onto a battery to hand it over, '
      + 'or press Shift and the battery’s number. Right-click a radar to switch it on or off.');
}

/** One sentence for whatever the scope's hit-test found under the pointer. */
function describeEntity(hit) {
  if (!hit || !world) return null;
  if (hit.kind === 'track') {
    const t = world.tracks.get(hit.id);
    if (!t) return null;
    const kindName = t.classification === 'unknown'
      ? 'unidentified contact' : (AIR_TYPES[t.classification]?.name?.toLowerCase() ?? t.classification);
    const dest = t.predictedAssetId ? world.assetById.get(t.predictedAssetId) : null;
    return `${t.tn} — ${t.hostility} ${kindName}`
      + (dest ? `, appears bound for ${dest.label}` : ', destination not yet established');
  }
  if (hit.kind === 'site') {
    const s = world.siteById.get(hit.id);
    if (!s) return null;
    const cls = DEFENCE_CLASSES[SAM_TYPES[s.type].class];
    return `${s.name} — ${cls.en.toLowerCase()}. ${cls.blurb}`;
  }
  if (hit.kind === 'radar') {
    const r = world.radarById.get(hit.id);
    if (!r) return null;
    return `${r.label} — surveillance radar, ${r.rangeKm} km. `
      + (r.alive ? (r.on ? 'Radiating.' : 'Cold — nothing paints until a set radiates.') : 'Destroyed.');
  }
  if (hit.kind === 'asset') {
    const a = world.assetById.get(hit.id);
    if (!a) return null;
    const at = ASSET_TYPES[a.type];
    const tags = [at.civilian ? 'civilian' : null, at.critical ? 'critical' : null]
      .filter(Boolean).join(', ');
    return `${a.label} — ${at.name.toLowerCase()}${tags ? ` (${tags})` : ''}`
      + (a.destroyed ? '. Destroyed.' : ' — a place this sector defends.');
  }
  return null;
}

/*
 * The teaching watch's interactive tutorial. Five steps, each cleared by the
 * player actually doing the thing — the chatter can say "bring the set up",
 * but an instruction that waits until you have done it is the only kind a
 * first watch reliably reads. Dismissable, and it never touches the sim.
 */
const NET_TUTORIAL_STEPS = [
  {
    id: 'radiate',
    en: 'The surveillance set is cold and nothing will paint. Find WIDE EYE on the right panel and press RADIATE.',
    tm: 'ВКЛЮЧИТЕ ИЗЛУЧЕНИЕ',
    done: (w, u, sinceS) => w.radars.some((r) => !r.siteId && r.on) || sinceS > 120,
  },
  {
    id: 'select',
    en: 'Contacts paint as the beam sweeps. Click a contact on the scope, or a row in the TRACKS list.',
    tm: 'ВЫБЕРИТЕ ЦЕЛЬ',
    done: (w, u, sinceS) => !!u.selectedTrackId || sinceS > 120,
  },
  {
    id: 'assign',
    en: 'Hand it to a battery: drag the contact onto a battery symbol, or press Shift+1. The battery answers on the log.',
    tm: 'НАЗНАЧЬТЕ БАТАРЕЮ',
    // Ninety seconds, not a hundred and fifty. A card that is still up when
    // the watch has moved on is furniture — and this one used to be
    // unclearable by the key it teaches, so it sat here for two and a half
    // minutes while the raid ran on around it.
    done: (w, u, sinceS) => [...w.tracks.values()].some((t) => t.assignedTo.length > 0) || sinceS > 90,
  },
  {
    id: 'intercept',
    en: 'The battery fires when the shot is right — HOLDING FOR RANGE is aiming, not refusal. Watch the intercept.',
    tm: 'ЖДИТЕ ПЕРЕХВАТА',
    done: (w, u, sinceS) => w.stats.kills > 0 || sinceS > 150,
  },
  {
    id: 'net',
    en: 'When sector command transmits, Y acknowledges and N refuses. Both are recorded. The rest of the watch is yours.',
    tm: 'СЕТЬ ВАША',
    done: (w, u, sinceS) => sinceS > 16,
  },
];

/*
 * And the cabin's five, which did not exist.
 *
 * The teaching watch advertises three seats and gated the whole walk-through
 * off for the third of them, so a player who chose SAM OPERATOR on the watch
 * whose entire job is teaching the controls got no cards at all. The cabin is
 * not the net with fewer buttons: its lesson is that the battery you are
 * sitting in has an antenna of its own, and that the sequence is
 * acquire → lock → wait → launch. Same five-step shape, same dismiss button,
 * same rule that a step is cleared by doing the thing.
 *
 * Every step also times out. Measured before this: a player who left the
 * scope alone was still reading "2 / 5" at t=630 s of a 660 s watch, because
 * the arrival arc on this raid is 300-345° and steps one to three had no way
 * out but success. A card that is still up when the watch has moved on is
 * furniture.
 */
const CREW_TUTORIAL_STEPS = [
  {
    id: 'radiate-own',
    en: 'Your own set is cold, and sector’s picture is not a firing solution. Press RADIATE on your battery.',
    tm: 'ВКЛЮЧИТЕ ИЗЛУЧЕНИЕ',
    done: (w, u, sinceS) => w.radarsOf(w.siteById.get(w.control.crewedBatteryId) ?? {})
      .some((r) => r.on) || sinceS > 120,
  },
  {
    id: 'designate',
    en: 'Contacts paint as the beam sweeps. Click one on the scope, or a row in the shootlist, to designate it.',
    tm: 'ВЫБЕРИТЕ ЦЕЛЬ',
    done: (w, u, sinceS) => !!u.selectedTrackId || sinceS > 120,
  },
  {
    id: 'lock',
    en: 'Press LOCK to put a channel on it. The battalion refuses in plain words when it cannot — read the refusal.',
    tm: 'ЗАХВАТ ЦЕЛИ',
    done: (w, u, sinceS) => (w.siteById.get(w.control.crewedBatteryId)?.engagements.length ?? 0) > 0
      || sinceS > 150,
  },
  {
    id: 'launch',
    en: 'The cap lights when the solution is ready. LAUNCH — and keep the set radiating until the round arrives.',
    tm: 'ПУСК',
    done: (w, u, sinceS) => w.stats.roundsFired > 0 || sinceS > 150,
  },
  {
    id: 'net-crew',
    en: 'When sector command transmits, Y acknowledges and N refuses. Both are recorded. The rest of the watch is yours.',
    tm: 'СЕТЬ ВАША',
    done: (w, u, sinceS) => sinceS > 16,
  },
];

function tutorialSteps() {
  return state.role === 'crew' ? CREW_TUTORIAL_STEPS : NET_TUTORIAL_STEPS;
}

function renderTutorial() {
  if (!els.tutorialCard) return;
  const steps = tutorialSteps();
  if (ui.tutorialStep < 0 || ui.tutorialStep >= steps.length) {
    els.tutorialCard.hidden = true;
    return;
  }
  while (ui.tutorialStep < steps.length
    && steps[ui.tutorialStep].done(world, ui, world.t - ui.tutorialStepAtS)) {
    ui.tutorialStep++;
    ui.tutorialStepAtS = world.t;
    ui.tutorialRendered = null;
  }
  if (ui.tutorialStep >= steps.length) {
    els.tutorialCard.hidden = true;
    return;
  }
  const step = steps[ui.tutorialStep];
  if (ui.tutorialRendered === step.id) return;
  ui.tutorialRendered = step.id;
  els.tutorialCard.hidden = false;
  els.tutorialCard.innerHTML = `
    <button class="tut-skip" id="tut-skip" title="Dismiss the tutorial">×</button>
    <span class="tut-step">${ui.tutorialStep + 1} / ${steps.length}</span>
    <b>${step.en}</b><i>${step.tm}</i>`;
  els.tutorialCard.querySelector('#tut-skip').onclick = () => {
    ui.tutorialStep = -1;
    els.tutorialCard.hidden = true;
  };
}

/* --------------------------------------------------------------- input */

function wireCanvasInput() {
  const canvas = els.canvas;
  let panning = null;

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('pointerdown', (e) => {
    if (state.phase !== 'mission') return;
    audio.resume();
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const renderer = ui.view === 'crew' ? crew : scope;
    const hit = renderer.pick(px, py, world);

    if (e.button === 2) {
      // Right click blinks whatever radar is under the cursor.
      if (hit?.kind === 'radar') world.toggleRadar(hit.id);
      else if (hit?.kind === 'site') {
        const site = world.siteById.get(hit.id);
        if (site) world.toggleRadar(site.radarId);
      }
      return;
    }

    if (hit?.kind === 'track') {
      ui.selectedTrackId = hit.id;
      ui.dragFrom = hit.id;
      canvas.setPointerCapture(e.pointerId);
    } else if (hit?.kind === 'site') {
      ui.selectedSiteId = hit.id;
    } else if (ui.view === 'net') {
      panning = { x: e.clientX, y: e.clientY, centre: { ...scope.centre } };
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (state.phase !== 'mission') return;
    const rect = canvas.getBoundingClientRect();
    if (ui.dragFrom) {
      ui.dragTo = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    } else if (panning) {
      const s = scope.scale / scope.dpr;
      scope.centre = {
        x: panning.centre.x - (e.clientX - panning.x) / s,
        y: panning.centre.y + (e.clientY - panning.y) / s,
      };
    } else {
      // Idle pointer: say what the thing under it is, in the legend line.
      const renderer = ui.view === 'crew' ? crew : scope;
      ui.hoverInfo = describeEntity(
        renderer.pick(e.clientX - rect.left, e.clientY - rect.top, world));
    }
  });

  canvas.addEventListener('pointerleave', () => { ui.hoverInfo = null; });

  canvas.addEventListener('pointerup', (e) => {
    panning = null;
    if (state.phase !== 'mission' || !ui.dragFrom) return;
    const rect = canvas.getBoundingClientRect();
    const hit = (ui.view === 'crew' ? crew : scope)
      .pick(e.clientX - rect.left, e.clientY - rect.top, world);
    if (hit?.kind === 'site') assignSelected(hit.id);
    ui.dragFrom = null;
    ui.dragTo = null;
  });

  canvas.addEventListener('wheel', (e) => {
    if (state.phase !== 'mission' || ui.view === 'crew') return;
    e.preventDefault();
    scope.zoom(e.deltaY > 0 ? 1.12 : 0.89);
  }, { passive: false });
}

function assignSelected(siteId) {
  if (!ui.selectedTrackId) return;
  const site = world.siteById.get(siteId);
  const existing = site?.engagements.find((en) => en.trackId === ui.selectedTrackId);
  if (existing) {
    world.unassign(ui.selectedTrackId, siteId);
    return;
  }
  if (!world.assign(ui.selectedTrackId, siteId)) {
    // A refused assignment says why, at the moment of the decision. The old
    // behaviour was worse than silence: some refusals printed ENGAGING and
    // then broke off fifteen seconds later in the dimmest line the log has.
    const track = world.tracks.get(ui.selectedTrackId);
    const reason = site && track ? cannotEngageReason(world, site, track) : null;
    if (reason) {
      /*
       * Once per battery per reason per twenty seconds. Pressing ASSIGN on
       * four batteries in a row used to print four lines a second for as long
       * as the operator kept trying — measured on the weasel watch, BASTION /
       * LANCE WEST / LANCE EAST / THISTLE TOWN cannot take T-017, over and
       * over for twenty consecutive seconds, with nothing else audible.
       */
      world.logThrottled(`cannotTake:${siteId}:${reason}`, 20, 'warn',
        `${site.name} — CANNOT TAKE ${track.tn}: ${reason.toUpperCase()}`,
        { siteId, trackId: track.id });
    }
  } else {
    // The tick belongs to the player's own act of assigning, not to every
    // ENGAGING line in the sector — a sound that fires for other people's
    // decisions teaches the ear to ignore it.
    audio.tick();
  }
}

/**
 * Which control a press acts on, in the order the panel stacks them.
 *
 * `#btn-fire` is matched with `closest` rather than by comparing the event
 * target's id, which is what the launch cap used to do: the cap's legend is a
 * `<span>` filling most of its face, so a press that landed on the word ПУСК —
 * measured, 60 of the 792 sample points across the cap — hit the span, failed
 * `e.target.id === 'btn-fire'`, and did nothing at all.
 */
function controlUnder(target) {
  if (!target?.closest) return null;
  return target.closest('[data-act]')
    ?? target.closest('#btn-fire')
    // The empty-state row carries no track id; pressing it must not clear the
    // selection out from under the operator.
    ?? target.closest('[data-track]')
    ?? target.closest('[data-site]');
}

/** Do what the control says, whether a finger or the keyboard pressed it. */
function operate(ctl) {
  // A dark console takes no orders — the buttons under a blanked panel are as
  // dead as the display (belt to the CSS pointer-events braces).
  if (!ctl || !world || world.dark) return;
  if (ctl.dataset.act) {
    runAction(ctl.dataset.act, ctl.dataset.site, ctl.dataset.radar, ctl.dataset.formation);
  } else if (ctl.id === 'btn-fire') {
    world.fire(world.control.crewedBatteryId, ui.selectedTrackId);
  } else if (ctl.dataset.track) {
    ui.selectedTrackId = ctl.dataset.track;
  } else if (ctl.dataset.site) {
    ui.selectedSiteId = ctl.dataset.site;
  }
  // Whatever it did, the panel should be showing it on the next frame.
  ui.lastPanelAt = 0;
}

/*
 * A press on this console is a press.
 *
 * The panels are regenerated from world state every 120 ms, and the browser
 * only synthesises a `click` when the pointer goes down and comes up on the
 * SAME element — so any rebuild between the two ends of a press threw it away.
 * Measured on the weapons rack with the raid running: of a hundred presses
 * held for a normal human 100 ms, thirteen registered. At 120 ms and longer,
 * none did. It failed non-deterministically, which is worse than failing
 * outright, because the same cap worked or did not depending on where the
 * press happened to land in the refresh cycle.
 *
 * Two things fix it, and both are here. The panels do not rebuild while a
 * pointer is down inside them (`ui.pressHeld`, read by render), so the control
 * under the finger keeps its identity for as long as it is held; and the
 * action is committed on pointerup against the control the press STARTED on,
 * rather than waiting for the browser to decide whether the two ends matched.
 * Sliding off the cap before letting go still cancels it, which is what a
 * physical cap does.
 */
let pressArmed = null;

function beginPress(e) {
  if (e.button !== 0) return;
  ui.pressHeld = true;
  ui.pressHeldAt = performance.now();
  const ctl = controlUnder(e.target);
  pressArmed = ctl && !ctl.disabled ? ctl : null;
  if (pressArmed) pressArmed.classList.add('is-pressed');
}

function endPress(e) {
  const ctl = pressArmed;
  const wasHeld = ui.pressHeld;
  pressArmed = null;
  ui.pressHeld = false;
  if (!wasHeld) return;
  if (ctl) {
    ctl.classList.remove('is-pressed');
    const over = e.type === 'pointerup' && Number.isFinite(e.clientX)
      ? document.elementFromPoint(e.clientX, e.clientY) : null;
    if (over && ctl.isConnected && ctl.contains(over)) operate(ctl);
  }
  // Lift the freeze and repaint on the very next frame.
  ui.lastPanelAt = 0;
}

function wirePanelInput() {
  /*
   * A cap pressed with the mouse does not take the focus ring.
   *
   * The ring belongs to the keyboard: it says which control Enter and Space
   * will press. Chromium leaves focus on a button after a click, so without
   * this, clicking the 4× cap quietly rebound the space bar from PAUSE to
   * "press 4× again" for the rest of the watch — measured, and it did the
   * same to every cap on the rack. Cancelling the default action of mousedown
   * suppresses the focus and nothing else: the click still fires.
   */
  els.shell.addEventListener('mousedown', (e) => {
    if (e.target.closest?.('button')) e.preventDefault();
  });

  for (const host of [els.trackList, els.batteryList, els.crewConsole, els.formationList]) {
    host.addEventListener('pointerdown', beginPress);
    /*
     * And the keyboard's own press. A click with `detail === 0` was not made
     * by a pointer — it is Enter or Space on the control the focus ring is
     * sitting on — so it never went through the pointer path above and has to
     * be operated here. Pointer-made clicks are ignored, because their press
     * was already committed on pointerup.
     */
    host.addEventListener('click', (e) => {
      if (e.detail === 0) operate(controlUnder(e.target));
    });
  }
  window.addEventListener('pointerup', endPress);
  window.addEventListener('pointercancel', endPress);

  els.speedGroup.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-speed]');
    if (btn) setSpeed(Number(btn.dataset.speed));
  });

  // The range selector clicks round its detents; the wheel over the tube still
  // works for anyone who would rather zoom continuously.
  els.scopeSide.addEventListener('click', (e) => {
    if (!e.target.closest('#range-knob') || ui.view === 'crew') return;
    const current = RANGE_SCALES.findIndex((r) => r >= scope.rangeKm - 1);
    const next = RANGE_SCALES[(current + 1 + RANGE_SCALES.length) % RANGE_SCALES.length];
    scope.rangeKm = next;
    audio.detent();
  });

  els.viewToggle.onclick = toggleView;
  document.getElementById('btn-help').onclick = () => showHelp(() => {
    els.screen.hidden = true;
    els.shell.hidden = false;
    state.phase = 'mission';
  });
  document.getElementById('btn-abort').onclick = askAbort;
  els.abortCancel.onclick = closeAbort;
  els.abortConfirm.onclick = () => {
    closeAbort();
    if (world) world.finish('aborted');
  };
  document.getElementById('btn-accept').onclick = () => { if (!world.dark) world.answer('accepted'); };
  document.getElementById('btn-refuse').onclick = () => { if (!world.dark) world.answer('refused'); };
}

/**
 * Leaving the post, asked properly.
 *
 * The cap used to end the watch on the first click, with no question and no
 * statement of what it cost — beside the pause cap, in a topbar full of things
 * that are safe to press. Leaving is a decision the game scores, so it is
 * confirmed like one, and the card says what will be lost before it is lost.
 * The simulation deliberately keeps running underneath: this is not a pause,
 * and the raid does not wait for the paperwork.
 */
function askAbort() {
  if (!world || state.phase !== 'mission' || !els.abortAsk.hidden) return;
  const airborne = world.aircraft.filter((a) => a.alive && a.type !== 'civil').length;
  els.abortLine.textContent = airborne === 0
    ? `It is ${clockString(world.t)} and the raid has not reached the sector yet. `
      + 'Leaving now ends the watch anyway; it does not postpone it.'
    : `It is ${clockString(world.t)}. ${airborne} raid aircraft `
      + `${airborne === 1 ? 'is' : 'are'} still airborne, and the raid does not stop `
      + 'while you decide.';
  els.abortAsk.hidden = false;
  // The safe answer takes the focus, so Enter and Space keep you at the post.
  els.abortCancel.focus();
}

function closeAbort() {
  if (els.abortAsk.hidden) return;
  els.abortAsk.hidden = true;
  document.getElementById('btn-abort')?.focus();
}

function runAction(act, siteId, radarId, formationId) {
  if (!world) return;
  const site = siteId ? world.siteById.get(siteId) : null;
  const formation = formationId ? world.formationById.get(formationId) : null;
  /*
   * A battery in a command you are not holding is not on your net. The panel
   * disables its controls, but the rule lives here as well so a keyboard
   * shortcut cannot reach around the disabled attribute — the only thing you
   * may say to a formation you are not standing in is its standing order, and
   * that is a formation-level control, not a battery-level one.
   */
  if (site && !world.commandable(site.id) && act !== 'lock') return;

  /*
   * The console makes a noise when you operate it. Everything here was silent,
   * on a panel whose entire aesthetic is switches you throw and caps you press
   * — the emissions switch the game's one idea hangs off included. Toggles get
   * the switch, everything else the button; the state after the action decides
   * which way a switch sounds.
   */
  const THROWN = new Set(['emcon', 'emcon-radar', 'weapons', 'posture', 'ride', 'direct']);
  if (THROWN.has(act)) {
    // The surviving set, not `site.radarId` — the switch acts on whichever
    // antenna the battery still has, so the click must sound like that one.
    const wasRadiating = act === 'emcon' ? !!world.liveRadarOf?.(site)?.on
      : act === 'emcon-radar' ? !!world.radarById?.get(radarId)?.on : null;
    queueMicrotask(() => audio.toggleSwitch(wasRadiating === null ? true : !wasRadiating));
  } else {
    audio.press();
  }

  switch (act) {
    case 'direct':
      if (formation) {
        if (formation.direct) world.releaseDirect(formation.id);
        else world.takeDirect(formation.id);
      }
      break;
    case 'posture': {
      // The cap on the card is labelled with the state this press produces, so
      // the two must read the same list. See POSTURE_CYCLE.
      if (!formation) break;
      world.setPosture(formation.id,
        POSTURE_CYCLE[(POSTURE_CYCLE.indexOf(formation.posture) + 1) % POSTURE_CYCLE.length]);
      break;
    }
    case 'reserve': if (formation) world.commitReserve(formation.id, 4); break;
    case 'emcon': if (site) world.toggleRadar(site.radarId); break;
    case 'emcon-radar': world.toggleRadar(radarId); break;
    case 'weapons': {
      if (!site) break;
      const order = ['hold', 'tight', 'free'];
      world.setWeaponsState(site.id, order[(order.indexOf(site.weaponsState) + 1) % 3]);
      break;
    }
    case 'salvo': if (site) world.setSalvo(site.id, site.salvoSize === 1 ? 2 : 1); break;
    case 'ride':
      if (site) world.setEmconOrder(site.id, site.emconOrder === 'ride' ? 'doctrine' : 'ride');
      break;
    case 'reload': if (site) world.reload(site.id); break;
    case 'scoot': if (site) world.scoot(site.id); break;
    /*
     * LOCK is the cabin's assignment. It used to call world.assign directly
     * and drop the null on the floor, so a refused lock in the SAM seat did
     * NOTHING AT ALL — no line, no sound, no reason — while the same refusal
     * from the net seat has printed its reason since the first watch. That
     * silence read as a broken button, and left the operator guessing at a
     * rule ("can I only lock what is assigned to me?" — no: you can lock
     * anything your battery can physically take). It goes through the same
     * path as every other assignment now, reason and all.
     */
    case 'lock':
      if (!site) break;
      if (!ui.selectedTrackId) {
        world.log('warn', `${site.name} — NO TARGET SELECTED. PICK A CONTACT FIRST.`,
          { siteId: site.id });
        break;
      }
      assignSelected(site.id);
      break;
    default: break;
  }
}

/**
 * The cap says what pressing it will do, in both languages.
 *
 * It used to be assigned as plain textContent, which threw away the engraved
 * legend the button ships with: the moment a watch started, the one cap in
 * the topbar with no stencil on it was the one that changes your seat.
 */
function setViewToggle() {
  const entry = ui.view === 'net' ? CONTROLS.takeConsole : CONTROLS.backToNet;
  // The key is printed on the cap, like every other key on this console.
  els.viewToggle.innerHTML = legend(entry, { key: 'V' });
  els.viewToggle.title = `${entry.en} (V)`;
}

function toggleView() {
  if (state.role !== 'both') return;
  ui.view = ui.view === 'net' ? 'crew' : 'net';
  setViewToggle();
  updateLegend();
}

function wireGlobalInput() {
  window.addEventListener('keydown', (e) => {
    if (e.target.matches('input, select, textarea')) return;
    /*
     * A control with the focus RING on it gets Enter and Space to itself:
     * that is how a keyboard presses a cap, and the console must not answer
     * one keystroke twice.
     *
     * The ring, specifically — `:focus-visible`, not `:focus`. Chromium leaves
     * focus on a button after a click, so testing plain focus would mean that
     * clicking the 4× cap silently rebound the space bar from PAUSE to "press
     * 4× again" for the rest of the watch. A mouse user keeps their space bar;
     * a keyboard user, who can see which control they are on, presses it.
     */
    if ((e.key === ' ' || e.key === 'Enter')
      && e.target.closest?.('button, a[href], input, select, textarea')) return;

    if (state.phase !== 'mission') {
      if (e.key === 'Enter' && state.phase === 'brief') startMission();
      if (e.key === 'Enter' && state.phase === 'enlist') {
        els.screen.querySelector('#enlist-confirm')?.click();
      }
      return;
    }
    /*
     * A question on the screen owns the keyboard while it is up. Escape is the
     * way out; Enter and Space were handed to the focused cap above.
     */
    if (!els.abortAsk.hidden) {
      if (e.key === 'Escape') { e.preventDefault(); closeAbort(); }
      return;
    }

    const digit = digitPressed(e);

    // A dark console takes no orders. Only the clock and the handbook still
    // answer — and the net, notably, keeps its own time regardless.
    if (world.dark) {
      const k = e.key.toLowerCase();
      const speedKey = k === ' '
        || (digit !== null && digit in SPEED_BY_KEY && !e.shiftKey && !e.altKey);
      if (!speedKey && k !== 'h') return;
    }

    // Same rule as the panel: the keys act on the selected battery only while it
    // is on your net.
    const selected = ui.selectedSiteId ? world.siteById.get(ui.selectedSiteId) : null;
    const site = selected && world.commandable(selected.id) ? selected : null;
    const crewedId = world.control.crewedBatteryId;
    // What this watch's console actually carries. The card, the handbook and
    // the key map all read this one answer — see consoleCaps().
    const caps = consoleCaps(world.scenario);
    /** Say once, quietly, that the verb is not on tonight's console. */
    const notFitted = (name) => world.logThrottled(`notFitted:${name}`, 30, 'info',
      `${name} IS NOT ON THIS CONSOLE TONIGHT.`);

    /*
     * The number row: a speed on its own, a battery with shift, a formation
     * with alt. Handled off the code rather than the character so the shifted
     * and alt-shifted forms reach the same branch on every layout.
     */
    if (digit !== null) {
      const n = digit - 1;
      if (e.altKey && world.formations.length > 1) {
        const target = world.formations.filter((f) => !f.hq)[n];
        if (target) {
          e.preventDefault();
          if (target.direct) world.releaseDirect(target.id);
          else world.takeDirect(target.id);
        }
      } else if (e.shiftKey) {
        // The same order the panel numbers its cards in — your own battery
        // first — so Shift+1 hands the selected contact to the card marked 1.
        const target = batteryOrder(world)[n];
        if (target) {
          e.preventDefault();
          ui.selectedSiteId = target.id;
          assignSelected(target.id);
        }
      } else if (digit in SPEED_BY_KEY) {
        setSpeed(SPEED_BY_KEY[digit]);
      }
      return;
    }

    switch (e.key.toLowerCase()) {
      case ' ': e.preventDefault(); setSpeed(state.speed === 0 ? 1 : 0); break;
      case '+': case '=': scope.zoom(0.85); break;
      case '-': case '_': scope.zoom(1.18); break;
      /*
       * Step through the board.
       *
       * A contact could only be picked with a pointer — on the tube or in the
       * list — so the seat's first verb was the one thing the keyboard could
       * not do, and every key that acts on "the selected contact" (LOCK,
       * LAUNCH, Shift+battery) was unreachable without a mouse. The arrows
       * walk the rows in the order they are drawn, which is the order the
       * shootlists put them in, so a contact under two batteries is stepped
       * through under both.
       */
      case 'arrowleft': case 'arrowright': {
        // Inside the speed group the arrows are the group's own; anywhere else
        // they are nothing, and the board's arrows are up and down.
        const caps = [...els.speedGroup.querySelectorAll('[data-speed]')];
        const at = caps.indexOf(document.activeElement);
        if (at < 0) break;
        e.preventDefault();
        const step = e.key === 'ArrowRight' ? 1 : caps.length - 1;
        const cap = caps[(at + step) % caps.length];
        setSpeed(Number(cap.dataset.speed));
        cap.focus();
        break;
      }
      case 'arrowdown': case 'arrowup': {
        const rows = [...els.trackList.querySelectorAll('li[data-track]')];
        if (!rows.length) break;
        e.preventDefault();
        const ids = rows.map((r) => r.dataset.track);
        const at = ids.indexOf(ui.selectedTrackId);
        const next = e.key === 'ArrowDown'
          ? (at + 1) % ids.length
          : (at <= 0 ? ids.length - 1 : at - 1);
        ui.selectedTrackId = ids[next];
        rows[next].scrollIntoView({ block: 'nearest' });
        ui.lastPanelAt = 0;
        break;
      }
      /*
       * From here down a key is the cap.
       *
       * Everything with a cap on the panel goes through `runAction`, which is
       * what the cap itself calls: the console makes the same noise, the same
       * guards apply, and a refusal prints the same sentence. The key and the
       * button used to be two implementations of one verb, and they had
       * drifted — L locked silently and told you nothing when it could not,
       * while the LOCK cap beside it has printed its reason for watches.
       */
      case 'q': if (site) { audio.press(); world.setWeaponsState(site.id, 'hold'); } break;
      case 'w': if (site) { audio.press(); world.setWeaponsState(site.id, 'tight'); } break;
      case 'e': {
        const target = ui.view === 'crew' ? world.siteById.get(crewedId) : site;
        if (target) runAction('emcon', target.id);
        break;
      }
      case 'f': if (crewedId) world.fire(crewedId, ui.selectedTrackId); break;
      case 'l': if (crewedId) runAction('lock', crewedId); break;
      case 'r': if (site) runAction('reload', site.id); break;
      /*
       * S, G and X answer to the same predicate their caps do.
       *
       * The teaching watch strips SALVO, RIDE and DISPLACE off the battery
       * card and off the handbook, and left all three live on the keyboard:
       * pressing X on First Light put the beginner's only long-range battery
       * on the road for two hundred and ten seconds, with no cap on screen to
       * explain it, no key in the handbook to look up, and no way to cancel.
       * A control the watch has removed is removed everywhere — and says so
       * once, so a stray press reads as a rule rather than as a dead key.
       */
      case 'x':
        if (!caps.displace) { notFitted('DISPLACE'); break; }
        if (site) runAction('scoot', site.id);
        break;
      case 's':
        if (!caps.salvo) { notFitted('SALVO'); break; }
        if (site) runAction('salvo', site.id);
        break;
      case 'g': {
        // Ride the warning: hold the selected (or crewed) battery's emissions
        // through guidance with an ARM inbound. The one EMCON call the crew
        // will never make for itself.
        if (!caps.ride) { notFitted('RIDE'); break; }
        const target = ui.view === 'crew' ? world.siteById.get(crewedId) : site;
        if (target) runAction('ride', target.id);
        break;
      }
      case 'y': if (world.command.pending) world.answer('accepted'); break;
      case 'n': if (world.command.pending) world.answer('refused'); break;
      case 'm': ui.showMap = !ui.showMap; break;
      case 'h': showHelp(() => { els.screen.hidden = true; els.shell.hidden = false; state.phase = 'mission'; }); break;
      /*
       * The seat toggle is on V, and Tab belongs to the browser.
       *
       * This used to be `case 'tab': e.preventDefault(); toggleView();`, run
       * for the whole mission phase and before toggleView's own "only the
       * commander has two seats" guard — so on every watch, including the
       * nine where the toggle does nothing at all, Tab was swallowed and focus
       * never left <body>. Measured: twenty-six consecutive presses on First
       * Light with the focus never moving. The console has a drawn focus ring
       * on nine kinds of control and no player could ever see one, and the
       * game could not be played without a mouse.
       */
      case 'v': toggleView(); break;
      case '`': {
        const surveillance = world.radars.filter((r) => !r.siteId && r.alive);
        const anyOn = surveillance.some((r) => r.on);
        for (const radar of surveillance) world.setRadar(radar.id, !anyOn);
        break;
      }
      default: break;
    }

    // Weapons free is on its own key because it is the one you reach for fast.
    if (e.key === 'E' && e.shiftKey && site) { audio.press(); world.setWeaponsState(site.id, 'free'); }
  });

  window.addEventListener('resize', () => { scope.resize(); crew.resize(); });
  window.addEventListener('blur', () => { if (state.phase === 'mission') setSpeed(0); });
  // With the tab hidden, requestAnimationFrame suspends but a running
  // oscillator does not: the warble kept sounding with nothing left alive to
  // stop it. Silence is handled here because the frame loop cannot.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) audio.stopArmWarning();
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}
