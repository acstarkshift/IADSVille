/**
 * The HUD panels around the scope.
 *
 * These rebuild from world state rather than being mutated in place, which
 * keeps them honest — there is no way for the panel to disagree with the
 * simulation. They are refreshed at a few hertz rather than every frame,
 * because a track table that updates sixty times a second is unreadable and
 * expensive, while the canvas underneath stays at full rate.
 */

import { SAM_TYPES, ASSET_TYPES, AIR_TYPES, COMMAND } from '../engine/config.js';
import { bearing, dist, len, clockString, clamp01 } from '../engine/math.js';
import { sortedTracks } from '../engine/threat.js';
import { trackProfile } from '../engine/detection.js';
import { engagementStatus } from './console.js';
import { armTimeToImpact } from '../engine/doctrine.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* --------------------------------------------------------------- topbar */

export function renderTopbar(world, ui, els) {
  els.clock.textContent = clockString(world.t);
  els.missionName.textContent = world.scenario.name;

  const airborne = world.aircraft.filter((a) => a.alive && a.type !== 'civil').length;
  els.airCount.textContent = String(airborne);
  els.rounds.textContent = `${world.stats.roundsFired}/${world.roundAllowance}`;
  els.rounds.parentElement.classList.toggle('is-over', world.stats.roundsFired > world.roundAllowance);

  const standing = Math.round(world.command.standing);
  els.standing.textContent = String(standing);
  els.standingFill.style.width = `${standing}%`;
  const wrap = els.standing.closest('.standing');
  wrap.classList.toggle('is-low', standing < 34);
  wrap.classList.toggle('is-mid', standing >= 34 && standing < 55);

  els.fusionState.textContent = world.fusionOnline ? 'FUSED' : 'LOCAL CONTROL';
  els.fusionState.classList.toggle('is-bad', !world.fusionOnline);
}

/* ----------------------------------------------------------- track list */

export function renderTrackList(world, ui, els) {
  let tracks = sortedTracks(world);

  // In the operator's seat the panel is their battery's picture: what their own
  // radar holds, plus what the net has cued them onto. Seeing the whole sector
  // here would undo the isolation the seat is built around.
  if (ui.view === 'crew' && world.control.crewedBatteryId) {
    const site = world.siteById.get(world.control.crewedBatteryId);
    tracks = tracks.filter((t) => t.sources.includes(site.radarId) || t.assignedTo.includes(site.id));
  }
  const rows = tracks.map((track) => {
    const brg = Math.round(bearing({ x: 0, y: 0 }, track.pos));
    const rng = Math.round(len(track.pos));
    const alt = Math.round(track.altM / 100);
    const label = track.classification !== 'unknown'
      ? (AIR_TYPES[track.classification]?.label ?? '—')
      : trackProfile(track);

    const assigned = track.assignedTo
      .map((id) => world.siteById.get(id)?.name?.split(' ')[0] ?? '')
      .join(',');
    const engaged = track.engagedBy.length > 0;

    const classes = [
      'track-row',
      `is-${track.hostility === 'pending' ? 'unknown' : track.hostility}`,
      track.coasting ? 'is-coasting' : '',
      engaged ? 'is-engaged' : '',
      ui.selectedTrackId === track.id ? 'is-selected' : '',
    ].filter(Boolean).join(' ');

    // A threat pip beats a number: you read it without doing arithmetic.
    const pips = track.threat > 60 ? '●●●' : track.threat > 25 ? '●●' : track.threat > 8 ? '●' : '';

    return `<li class="${classes}" data-track="${track.id}" role="option" aria-selected="${ui.selectedTrackId === track.id}">
      <span class="tn">${esc(track.tn)}</span>
      <span>${esc(label)}</span>
      <span>${String(brg).padStart(3, '0')}</span>
      <span>${rng}</span>
      <span>${String(alt).padStart(3, '0')}</span>
      <span class="asgn">${engaged ? '◆' : ''}${esc(assigned)} <em style="color:var(--hostile)">${pips}</em></span>
    </li>`;
  });

  els.trackList.innerHTML = rows.join('')
    || `<li class="track-row" style="opacity:.5"><span>—</span><span>${
      ui.view === 'crew' ? 'nothing held' : 'no contacts'}</span></li>`;

  renderTrackDetail(world, ui, els);
}

function renderTrackDetail(world, ui, els) {
  const track = ui.selectedTrackId ? world.tracks.get(ui.selectedTrackId) : null;
  if (!track) {
    els.trackDetail.innerHTML = '<i>Select a contact to see what it is doing.</i>';
    return;
  }
  const asset = track.predictedAssetId ? world.assetById.get(track.predictedAssetId) : null;
  const tti = Number.isFinite(track.ttiS) ? clockString(track.ttiS) : '—';
  const speedKts = Math.round(len(track.vel) * 1943.8);
  const idPct = Math.round(100 * clamp01(track.idProgressS / 26));

  els.trackDetail.innerHTML = `
    <b>${esc(track.tn)}</b> ${esc(track.hostility.toUpperCase())}
    · ${esc(track.classification === 'unknown' ? `ID ${idPct}%` : AIR_TYPES[track.classification]?.name ?? '')}<br>
    ${speedKts} kt · ${Math.round(track.altM)} m · quality ${Math.round(track.quality * 100)}%
    ${track.coasting ? '· <em style="color:var(--warn)">COASTING</em>' : ''}<br>
    ${asset ? `Tracking toward <b>${esc(asset.label)}</b>, ${tti} out.` : 'No obvious objective.'}
    ${track.assignedTo.length ? `<br>Assigned: <b>${esc(track.assignedTo.map((id) => world.siteById.get(id)?.name).join(', '))}</b>` : ''}`;
}

/* ------------------------------------------------------------- weapons */

export function renderBatteries(world, ui, els) {
  const html = world.sites.map((site, index) => {
    const type = SAM_TYPES[site.type];
    const radar = world.radarById.get(site.radarId);
    const crewed = world.control.crewedBatteryId === site.id;

    const radarPill = !radar?.alive ? '<span class="pill dark">RADAR LOST</span>'
      : radar.state === 'radiating' ? '<span class="pill radiating">RADIATING</span>'
        : radar.state === 'warming' ? `<span class="pill warming">WARMING ${Math.ceil(radar.warmRemainingS)}s</span>`
          : '<span class="pill dark">DARK</span>';

    const armEta = radar?.alive ? armTimeToImpact(world, radar) : Infinity;
    const armPill = Number.isFinite(armEta)
      ? `<span class="pill alarm">ARM ${Math.ceil(armEta)}s</span>` : '';

    const rounds = Array.from({ length: Math.min(type.readyRounds, 12) }, (_, i) =>
      `<i class="${i < site.readyRounds ? '' : 'is-spent'}"></i>`).join('');

    const busy = site.reloadRemainingS > 0
      ? `<div class="progress"><i style="width:${100 * (1 - site.reloadRemainingS / (type.reloadS * site.reloadMult))}%"></i></div>`
      : site.scootRemainingS > 0
        ? `<div class="progress"><i style="width:${100 * (1 - site.scootRemainingS / (type.scootS * site.reloadMult))}%"></i></div>`
        : '';

    const classes = ['battery',
      ui.selectedSiteId === site.id ? 'is-selected' : '',
      !site.alive ? 'is-dead' : '',
      crewed ? 'is-crewed' : ''].filter(Boolean).join(' ');

    return `<div class="${classes}" data-site="${site.id}">
      <div class="battery-name">
        <b>${index + 1}. ${esc(site.name)}</b>
        <span class="type">${esc(type.label)}${crewed ? ' · YOUR SEAT' : ''}</span>
      </div>
      <div class="battery-meta">
        <span>RDY <b>${site.readyRounds}</b>/${site.magazine}</span>
        <span>CH <b>${site.engagements.length}</b>/${type.channels}</span>
        <span>RNG <b>${type.maxRangeKm}</b>km</span>
        <span class="pill ${site.weaponsState}">${site.weaponsState.toUpperCase()}</span>
        ${radarPill}${armPill}
      </div>
      <div class="rounds-bar">${rounds}</div>
      ${busy}
      <div class="battery-actions">
        <button class="btn" data-act="emcon" data-site="${site.id}">${radar?.on ? 'SHUT DOWN' : 'RADIATE'}</button>
        <button class="btn" data-act="weapons" data-site="${site.id}">WPN ${site.weaponsState.toUpperCase()}</button>
        <button class="btn" data-act="salvo" data-site="${site.id}">SALVO ${site.salvoSize}</button>
        <button class="btn" data-act="reload" data-site="${site.id}" ${site.magazine <= 0 || site.reloadRemainingS > 0 ? 'disabled' : ''}>RELOAD</button>
        <button class="btn" data-act="scoot" data-site="${site.id}" ${site.scootRemainingS > 0 ? 'disabled' : ''}>SCOOT</button>
      </div>
    </div>`;
  }).join('');

  const standalone = world.radars.filter((r) => !r.siteId).map((radar) => `
    <div class="battery" data-radar="${radar.id}">
      <div class="battery-name">
        <b>${esc(radar.label)}</b><span class="type">${radar.alive ? `${radar.rangeKm}km` : 'DESTROYED'}</span>
      </div>
      <div class="battery-meta">
        ${radar.state === 'radiating' ? '<span class="pill radiating">RADIATING</span>'
      : radar.state === 'warming' ? `<span class="pill warming">WARMING ${Math.ceil(radar.warmRemainingS)}s</span>`
        : '<span class="pill dark">DARK</span>'}
        <span>EXPOSURE <b>${Math.round(radar.exposure * 100)}%</b></span>
        ${Number.isFinite(armTimeToImpact(world, radar)) ? `<span class="pill alarm">ARM ${Math.ceil(armTimeToImpact(world, radar))}s</span>` : ''}
      </div>
      <div class="battery-actions">
        <button class="btn" data-act="emcon-radar" data-radar="${radar.id}" ${radar.alive ? '' : 'disabled'}>${radar.on ? 'SHUT DOWN' : 'RADIATE'}</button>
      </div>
    </div>`).join('');

  els.batteryList.innerHTML = standalone + html;
}

/* -------------------------------------------------------- crew console */

/**
 * The operator's own panel: the engagement sequence on the left of their brain,
 * and the "are they about to kill me" numbers on the right.
 */
export function renderCrewConsole(world, ui, els) {
  const site = world.siteById.get(world.control.crewedBatteryId);
  if (!site) { els.crewConsole.hidden = true; return; }
  els.crewConsole.hidden = false;

  const track = ui.selectedTrackId ? world.tracks.get(ui.selectedTrackId) : null;
  const status = engagementStatus(world, site, track);
  const radar = world.radarById.get(site.radarId);
  const armEta = radar?.alive ? armTimeToImpact(world, radar) : Infinity;
  const type = SAM_TYPES[site.type];

  const stateLabel = {
    idle: 'STANDBY', reacting: 'PREPARING', ready: 'READY', guiding: 'ROUNDS IN FLIGHT',
  }[status.state] ?? status.state.toUpperCase();

  const envLine = !status.hasTarget ? 'NO TARGET DESIGNATED'
    : status.inEnvelope ? `IN ENVELOPE · ${Math.round(status.rangeKm)} km`
      : status.timeToRangeS !== null
        ? `${status.envelopeReason} · in range in ${Math.ceil(status.timeToRangeS)}s`
        : `${status.envelopeReason} · no solution`;

  els.crewConsole.innerHTML = `
    <h3>${esc(site.name)} — ${esc(type.label)}</h3>
    <div class="crew-row" style="color:var(--ink-dim);font-size:10px"><span>dashed ring is your envelope · red curve is your horizon</span></div>
    <div class="crew-row"><span>TARGET</span><b>${esc(status.trackLabel)}</b></div>
    <div class="crew-row ${status.inEnvelope ? 'is-good' : ''}"><span>ENVELOPE</span><b>${esc(envLine)}</b></div>
    <div class="crew-row"><span>SEQUENCE</span><b>${esc(stateLabel)}${status.reactionRemainingS > 0 ? ` ${status.reactionRemainingS.toFixed(1)}s` : ''}</b></div>
    <div class="crew-row ${status.guidance === 'GUIDING' ? 'is-good' : 'is-hot'}"><span>GUIDANCE</span><b>${esc(status.guidance)}</b></div>
    <div class="crew-row"><span>CHANNELS</span><b>${status.channelsUsed}/${status.channels}</b></div>
    <div class="crew-row"><span>ROUNDS</span><b>${site.readyRounds} ready · ${site.magazine} stored</b></div>

    <h3 style="margin-top:10px">SURVIVAL</h3>
    <div class="crew-row ${radar?.exposure > 0.6 ? 'is-hot' : ''}"><span>ELINT EXPOSURE</span><b>${Math.round((radar?.exposure ?? 0) * 100)}%</b></div>
    <div class="meter ${radar?.exposure > 0.6 ? 'is-hot' : ''}"><i style="width:${Math.round((radar?.exposure ?? 0) * 100)}%"></i></div>
    ${Number.isFinite(armEta)
      ? `<div class="crew-row is-hot"><span>ROUND INBOUND</span><b>${Math.ceil(armEta)}s</b></div>`
      : '<div class="crew-row"><span>THREAT</span><b>NONE TRACKED</b></div>'}
    ${site.crewLosses ? `<div class="crew-row is-hot"><span>CREW</span><b>${site.crewLosses} CASUALTIES</b></div>` : ''}

    <button class="fire-btn ${status.canFire ? 'is-armed' : ''}" id="btn-fire" ${status.canFire ? '' : 'disabled'}>
      ${status.state === 'guiding' ? `${status.roundsUp} IN FLIGHT` : 'FIRE  [F]'}
    </button>
    <div class="battery-actions" style="margin-top:6px">
      <button class="btn" data-act="lock" data-site="${site.id}">LOCK [L]</button>
      <button class="btn" data-act="emcon" data-site="${site.id}">${radar?.on ? 'SHUT DOWN [E]' : 'RADIATE [E]'}</button>
      <button class="btn" data-act="reload" data-site="${site.id}">RELOAD [R]</button>
      <button class="btn" data-act="scoot" data-site="${site.id}">SCOOT [X]</button>
    </div>`;
}

/* ------------------------------------------------------------ event log */

export function renderEventLog(world, els, state) {
  const from = state.lastEventIndex ?? 0;
  if (world.events.length === from) return;
  const fresh = world.events.slice(from);
  state.lastEventIndex = world.events.length;

  const html = fresh.map((e) => `<li class="kind-${e.kind}">
      <span class="t">${clockString(e.t)}</span><span>${esc(e.text)}</span></li>`).join('');
  els.eventLog.insertAdjacentHTML('beforeend', html);

  while (els.eventLog.children.length > 120) els.eventLog.firstElementChild.remove();
  els.eventLog.scrollTop = els.eventLog.scrollHeight;
}

/* ---------------------------------------------------------- command net */

export function renderCommandNet(world, els) {
  const directive = world.command.pending;
  if (!directive) {
    els.commandNet.hidden = true;
    return;
  }
  els.commandNet.hidden = false;
  if (els.commandText.dataset.uid !== directive.uid) {
    els.commandText.dataset.uid = directive.uid;
    els.commandText.textContent = directive.text;
  }
  const left = Math.max(0, directive.deadlineS - world.t);
  els.commandTimer.textContent = `${Math.ceil(left)}s`;
}

/** The boot sequence shown while the console is down. It is not a spinner. */
export function renderBlackout(world, els) {
  const dark = world.dark;
  if (!dark) {
    if (els.scopeOverlay.dataset.mode !== 'clear') {
      els.scopeOverlay.dataset.mode = 'clear';
      els.scopeOverlay.innerHTML = '';
    }
    return;
  }
  if (world.console.destroyed) {
    if (els.scopeOverlay.dataset.mode === 'dead') return;
    els.scopeOverlay.dataset.mode = 'dead';
    els.scopeOverlay.innerHTML = '<div class="huge">POSITION OVERRUN</div>';
    return;
  }
  const remaining = Math.max(0, world.console.rebootUntilS - world.t);
  const lines = [
    'POWER FAULT — TRANSFERRING TO STANDBY BUS',
    `CAUSE: ${world.console.rebootReason ?? 'UNKNOWN'}`,
    'PROCESSOR RESET .......... OK',
    'ANTENNA SERVO ............ CHECK',
    'TRACK STORE .............. RECOVERING',
    `DISPLAY IN ${remaining.toFixed(1)}s`,
  ];
  const show = Math.min(lines.length, Math.ceil((6 - remaining) * 1.2) + 1);
  els.scopeOverlay.dataset.mode = 'boot';
  els.scopeOverlay.innerHTML = `<div class="boot">${lines.slice(0, Math.max(1, show))
    .map((l) => `<div class="line">${esc(l)}</div>`).join('')}</div>`;
}
