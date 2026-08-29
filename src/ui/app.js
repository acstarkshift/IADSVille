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
import { SCENARIOS, scenarioById } from '../engine/scenarios.js';
import { SIM, SAM_TYPES, ROLES } from '../engine/config.js';
import {
  loadCampaign, saveCampaign, browserStore, recordMission, emptyCampaign,
  consequenceFor, missionModifiers, enlist,
} from '../engine/campaign.js';
import { armTimeToImpact } from '../engine/doctrine.js';
import { AIR_TYPES } from '../engine/config.js';
import { dist, clamp01 } from '../engine/math.js';
import { applyTheme, THEMES } from './themes.js';
import { Scope } from './scope.js';
import { CrewConsole } from './console.js';
import { Audio } from './audio.js';
import {
  renderTopbar, renderTrackList, renderFlightStrip, renderBatteries, renderCrewConsole,
  renderEventLog, renderCommandNet, renderBlackout, renderScopeSide, RANGE_SCALES,
} from './panels.js';
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
  lastEventIndex: 0,
  lastPanelAt: 0,
  seenEvents: 0,
  /** The country underlay. On by default; some people want a clean tube. */
  showMap: true,
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
    clock: id('clock'),
    missionName: id('mission-name'),
    airCount: id('air-count'),
    rounds: id('rounds'),
    standing: id('standing'),
    standingFill: id('standing-fill'),
    fusionState: id('fusion-state'),
    trackList: id('track-list'),
    flightStrip: id('flight-strip'),
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
  });
}

function boot() {
  cacheEls();
  loadSettings();
  // Exposed for the headless smoke and integration tests, and genuinely handy
  // when debugging a campaign state by hand.
  window.__state = state;
  state.campaign = loadCampaign(store);
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

function ensureBattery() {
  const sites = state.mission.sites;
  if (!sites.some((s) => s.id === state.batteryId)) {
    state.batteryId = state.mission.playerBatteryId ?? sites[0].id;
  }
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
  if (batteryPick) batteryPick.onchange = () => { state.batteryId = batteryPick.value; saveSettings(); };

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
  showScreen(renderControls);
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
  });

  ui.selectedTrackId = null;
  ui.selectedSiteId = world.control.crewedBatteryId ?? world.sites[0]?.id ?? null;
  ui.lastEventIndex = 0;
  ui.seenEvents = 0;
  ui.view = state.role === 'crew' ? 'crew' : 'net';
  els.eventLog.innerHTML = '';
  accumulator = 0;
  state.speed = 1;
  setSpeed(1);

  els.viewToggle.hidden = state.role !== 'both';
  els.viewToggle.textContent = ui.view === 'net' ? 'TAKE A CONSOLE' : 'BACK TO THE NET';
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
  scope.rangeKm = world.scenario.scopeRangeKm ?? 150;
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
  // The selected speed button stays physically depressed.
  els.speedGroup.querySelectorAll('[data-speed]').forEach((b) => {
    b.classList.toggle('is-down', Number(b.dataset.speed) === speed);
  });
}

/* ----------------------------------------------------------- the loop */

function frame(now) {
  requestAnimationFrame(frame);
  const dtReal = Math.min(0.25, (now - lastFrame) / 1000 || 0);
  lastFrame = now;

  if (state.phase !== 'mission' || !world) return;

  // Fixed-step integration. The accumulator is capped so a backgrounded tab
  // resumes rather than trying to simulate the minute it missed.
  accumulator += dtReal * state.speed;
  let steps = 0;
  while (accumulator >= SIM.dt && steps < 40) {
    world.step(SIM.dt);
    accumulator -= SIM.dt;
    steps++;
    if (world.phase === 'complete') break;
  }

  render(now);

  if (world.phase === 'complete') endMission();
}

function render(now) {
  const dark = world.dark;

  if (ui.view === 'crew') {
    if (!dark) crew.render(world, ui);
    else clearCanvas();
  } else if (!dark) {
    scope.render(world, ui);
  } else {
    clearCanvas();
  }

  applyEffects();
  handleAudio();

  if (now - ui.lastPanelAt > 120) {
    ui.lastPanelAt = now;
    renderTopbar(world, ui, els);
    renderTrackList(world, ui, els);
    renderFlightStrip(world, els);
    renderBatteries(world, ui, els);
    renderScopeSide(world, ui, els, ui.view === 'crew' ? crew.rangeKm : scope.rangeKm);
    if (world.control.crewedBatteryId && ui.view === 'crew') renderCrewConsole(world, ui, els);
    else els.crewConsole.hidden = true;
  }
  renderEventLog(world, els, ui);
  renderCommandNet(world, els);
  renderBlackout(world, els);
}

function clearCanvas() {
  const ctx = els.canvas.getContext('2d');
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg') || '#000';
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
  let flash = 0;
  for (const effect of world.effects) {
    const age = world.t - effect.startedS;
    const life = effect.durationS ?? 1;
    if (age > life) continue;
    if (effect.kind === 'shake') shaking = true;
    if (effect.kind === 'flash' || effect.kind === 'blackout') {
      flash = Math.max(flash, (effect.magnitude ?? 1) * (1 - age / life));
    }
  }

  els.shell.classList.toggle('is-shaking', shaking);

  // A brief wash of light over the scope, fading with the effect.
  if (flash > 0.01) {
    els.scopeOverlay.style.backgroundColor = `rgba(255, 236, 200, ${Math.min(0.35, flash * 0.3)})`;
  } else if (els.scopeOverlay.style.backgroundColor) {
    els.scopeOverlay.style.backgroundColor = '';
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
  for (let i = ui.seenEvents; i < world.events.length; i++) {
    const e = world.events[i];
    if (e.kind === 'launch') audio.launch();
    else if (e.kind === 'good' && e.text.startsWith('SPLASH')) audio.splash();
    else if (e.kind === 'alert' && /IMPACT|STRUCK|DESTROYED/.test(e.text)) audio.impact();
    else if (e.kind === 'command') audio.command();
  }
  ui.seenEvents = world.events.length;

  const armInbound = world.radars.some((r) => r.alive && Number.isFinite(armTimeToImpact(world, r)));
  if (armInbound) audio.startArmWarning(); else audio.stopArmWarning();

  // Tension rises with the nearest inbound striker's time to its release point.
  let worst = 0;
  for (const aircraft of world.aircraft) {
    if (!aircraft.alive || aircraft.released || aircraft.type === 'civil') continue;
    const asset = world.assetById.get(aircraft.targetAssetId);
    if (!asset || asset.destroyed) continue;
    const releaseKm = AIR_TYPES[aircraft.type].releaseRangeKm;
    const toGo = Math.max(0, dist(aircraft.pos, asset.pos) - releaseKm);
    worst = Math.max(worst, 1 - clamp01(toGo / 60));
  }
  audio.pulse(worst);
}

function updateLegend() {
  els.scopeLegend.innerHTML = ui.view === 'crew'
    ? ''
    : 'drag a contact onto a battery to assign · right-click a radar to blink it · M for the map';
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
    }
  });

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
  if (existing) world.unassign(ui.selectedTrackId, siteId);
  else world.assign(ui.selectedTrackId, siteId);
}

function wirePanelInput() {
  els.trackList.addEventListener('click', (e) => {
    // The empty-state row carries no track id; clicking it must not clear the
    // selection out from under the operator.
    const row = e.target.closest('[data-track]');
    if (row?.dataset.track) ui.selectedTrackId = row.dataset.track;
  });

  const panelAction = (e) => {
    const btn = e.target.closest('[data-act]');
    if (btn) {
      e.stopPropagation();
      runAction(btn.dataset.act, btn.dataset.site, btn.dataset.radar);
      return;
    }
    if (e.target.id === 'btn-fire') {
      world.fire(world.control.crewedBatteryId, ui.selectedTrackId);
      return;
    }
    const card = e.target.closest('[data-site]');
    if (card) ui.selectedSiteId = card.dataset.site;
  };
  els.batteryList.addEventListener('click', panelAction);
  els.crewConsole.addEventListener('click', panelAction);

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
  });

  els.viewToggle.onclick = toggleView;
  document.getElementById('btn-help').onclick = () => showHelp(() => {
    els.screen.hidden = true;
    els.shell.hidden = false;
    state.phase = 'mission';
  });
  document.getElementById('btn-abort').onclick = () => {
    if (world) { world.finish('aborted'); }
  };
  document.getElementById('btn-accept').onclick = () => world.answer('accepted');
  document.getElementById('btn-refuse').onclick = () => world.answer('refused');
}

function runAction(act, siteId, radarId) {
  if (!world) return;
  const site = siteId ? world.siteById.get(siteId) : null;
  switch (act) {
    case 'emcon': if (site) world.toggleRadar(site.radarId); break;
    case 'emcon-radar': world.toggleRadar(radarId); break;
    case 'weapons': {
      if (!site) break;
      const order = ['hold', 'tight', 'free'];
      world.setWeaponsState(site.id, order[(order.indexOf(site.weaponsState) + 1) % 3]);
      break;
    }
    case 'salvo': if (site) world.setSalvo(site.id, site.salvoSize === 1 ? 2 : 1); break;
    case 'reload': if (site) world.reload(site.id); break;
    case 'scoot': if (site) world.scoot(site.id); break;
    case 'lock': if (site && ui.selectedTrackId) world.assign(ui.selectedTrackId, site.id); break;
    default: break;
  }
}

function toggleView() {
  if (state.role !== 'both') return;
  ui.view = ui.view === 'net' ? 'crew' : 'net';
  els.viewToggle.textContent = ui.view === 'net' ? 'TAKE A CONSOLE' : 'BACK TO THE NET';
  updateLegend();
}

function wireGlobalInput() {
  window.addEventListener('keydown', (e) => {
    if (e.target.matches('input, select, textarea')) return;

    if (state.phase !== 'mission') {
      if (e.key === 'Enter' && state.phase === 'brief') startMission();
      if (e.key === 'Enter' && state.phase === 'enlist') {
        els.screen.querySelector('#enlist-confirm')?.click();
      }
      return;
    }
    const site = ui.selectedSiteId ? world.siteById.get(ui.selectedSiteId) : null;
    const crewedId = world.control.crewedBatteryId;

    switch (e.key.toLowerCase()) {
      case ' ': e.preventDefault(); setSpeed(state.speed === 0 ? 1 : 0); break;
      case '1': case '2': case '3': case '4': {
        // Numbers pick a speed on their own, or a battery with shift held.
        if (e.shiftKey) {
          const target = world.sites[Number(e.key) - 1];
          if (target) { ui.selectedSiteId = target.id; assignSelected(target.id); }
        } else {
          setSpeed([1, 2, 4, 0][Number(e.key) - 1] ?? 1);
        }
        break;
      }
      case '+': case '=': scope.zoom(0.85); break;
      case '-': case '_': scope.zoom(1.18); break;
      case 'q': if (site) world.setWeaponsState(site.id, 'hold'); break;
      case 'w': if (site) world.setWeaponsState(site.id, 'tight'); break;
      case 'e': {
        const target = ui.view === 'crew' ? world.siteById.get(crewedId) : site;
        if (target) world.toggleRadar(target.radarId);
        break;
      }
      case 'f': if (crewedId) world.fire(crewedId, ui.selectedTrackId); break;
      case 'l': if (crewedId && ui.selectedTrackId) world.assign(ui.selectedTrackId, crewedId); break;
      case 'r': if (site) world.reload(site.id); break;
      case 'x': if (site) world.scoot(site.id); break;
      case 's': if (site) world.setSalvo(site.id, site.salvoSize === 1 ? 2 : 1); break;
      case 'y': if (world.command.pending) world.answer('accepted'); break;
      case 'n': if (world.command.pending) world.answer('refused'); break;
      case 'm': ui.showMap = !ui.showMap; break;
      case 'h': showHelp(() => { els.screen.hidden = true; els.shell.hidden = false; state.phase = 'mission'; }); break;
      case 'tab': e.preventDefault(); toggleView(); break;
      case '`': {
        const surveillance = world.radars.filter((r) => !r.siteId && r.alive);
        const anyOn = surveillance.some((r) => r.on);
        for (const radar of surveillance) world.setRadar(radar.id, !anyOn);
        break;
      }
      default: break;
    }

    // Weapons free is on its own key because it is the one you reach for fast.
    if (e.key === 'E' && e.shiftKey && site) world.setWeaponsState(site.id, 'free');
  });

  window.addEventListener('resize', () => { scope.resize(); crew.resize(); });
  window.addEventListener('blur', () => { if (state.phase === 'mission') setSpeed(0); });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}
