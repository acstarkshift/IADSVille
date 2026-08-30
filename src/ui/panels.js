/**
 * The HUD panels around the scope.
 *
 * These rebuild from world state rather than being mutated in place, which
 * keeps them honest — there is no way for the panel to disagree with the
 * simulation. They are refreshed at a few hertz rather than every frame,
 * because a track table that updates sixty times a second is unreadable and
 * expensive, while the canvas underneath stays at full rate.
 */

import { SIM, SAM_TYPES, ASSET_TYPES, AIR_TYPES, COMMAND, DEFENCE_CLASSES } from '../engine/config.js';
import { bearing, dist, len, clockString, clamp01 } from '../engine/math.js';
import { sortedTracks, cannotEngageReason } from '../engine/threat.js';
import { trackProfile } from '../engine/detection.js';
import { engagementStatus } from './console.js';
import { armTimeToImpact, channelsFor } from '../engine/doctrine.js';
import { CONTROLS, STATUS, EQUIPMENT, PLATES, legend, pair, pairHtml } from './lexicon.js';
import { rankOf } from '../engine/character.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------------------------------------------------------------- hardware
 * Small builders for the physical controls. Keeping them here means a lamp is
 * a lamp everywhere on the console, and a switch always says what state it is
 * in by the position of its lever rather than by its colour alone.
 */

/** A domed indicator with its engraved caption. */
function lamp(entry, lit, { colour = '', blinking = false, caption = null } = {}) {
  const classes = ['lamp', lit ? 'is-lit' : '', colour ? `is-${colour}` : '', blinking ? 'blinking' : '']
    .filter(Boolean).join(' ');
  return `<span class="${classes}" title="${esc(entry.hint ?? entry.en)}">
    <span class="lamp-dome"></span>
    <span class="lg"><b>${esc(caption ?? entry.tm)}</b><i>${esc(entry.en)}</i></span></span>`;
}

/** A bat-handle toggle. Lever up is on, and the position is the state. */
function toggle(entry, on, { act, site, radar, disabled = false } = {}) {
  const attrs = [
    act ? `data-act="${act}"` : '',
    site ? `data-site="${site}"` : '',
    radar ? `data-radar="${radar}"` : '',
    disabled ? 'disabled' : '',
  ].filter(Boolean).join(' ');
  return `<button class="sw" aria-pressed="${on}" ${attrs}
      title="${esc(entry.en)} — ${esc(entry.hint ?? '')}">
    <span class="sw-body">
      <span class="sw-marks"><span>I</span><span>O</span></span>
      <span class="sw-lever"></span>
    </span>
    ${legend(entry, { inline: false })}
  </button>`;
}

/** A legend-cap pushbutton. */
function press(entry, { act, site, disabled = false, extra = '' } = {}) {
  return `<button class="pb ${extra}" data-act="${act}" ${site ? `data-site="${site}"` : ''}
      ${disabled ? 'disabled' : ''} title="${esc(entry.en)}">${legend(entry)}</button>`;
}

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

  els.fusionState.textContent = world.fusionOnline ? STATUS.fusion.tm : STATUS.localControl.tm;
  els.fusionState.title = world.fusionOnline ? STATUS.fusion.en : STATUS.localControl.en;
  els.fusionState.classList.toggle('is-bad', !world.fusionOnline);

  // Master annunciator: the three things that would have someone shouting.
  const armInbound = world.radars.some((r) => r.alive && Number.isFinite(armTimeToImpact(world, r)));
  const anyRadiating = world.radars.some((r) => r.state === 'radiating');
  const faulted = world.radars.some((r) => !r.alive) || world.sites.some((s) => !s.alive);
  els.masterLamps.innerHTML = [
    lamp(STATUS.radiating, anyRadiating, { colour: 'green' }),
    lamp(STATUS.armWarning, armInbound, { colour: 'red', blinking: true }),
    lamp(STATUS.fault, faulted, { colour: 'amber' }),
  ].join('');

  // The appointment, stencilled where the operator can see what they are.
  if (els.echelonPlate && els.echelonPlate.dataset.echelon !== world.echelon.id) {
    els.echelonPlate.dataset.echelon = world.echelon.id;
    els.echelonPlate.innerHTML = `<span class="data-plate">
      <b>${esc(world.echelon.tm)}</b><br>${esc(world.echelon.appointment.en)}
    </span>`;
    els.echelonPlate.title = `${world.echelon.appointment.tm} · ${world.echelon.appointment.en}`;
  }

  if (world.character && els.operatorPlate.dataset.name !== world.character.name) {
    els.operatorPlate.dataset.name = world.character.name;
    const rank = rankOf(world.character);
    els.operatorPlate.innerHTML = `<span class="data-plate">
      <b>${esc(rank.tm)}</b> ${esc(world.character.name)}<br>${esc(rank.en)}
    </span>`;
  }
}

/* --------------------------------------------------------- flight strip */

/**
 * The protected flight, on the one watch there is one.
 *
 * A strip of the kind an approach controller keeps on the aircraft they are
 * responsible for: what it is, where it is, how far it still has to go, and how
 * near the nearest thing hunting it has got. Without this the operator can see
 * a friendly symbol among thirty others and no reason to care about it, which
 * is a poor way to run the only watch in the game that is about one aeroplane.
 */
export function renderFlightStrip(world, els) {
  const strip = els.flightStrip;
  if (!strip) return;
  if (!world.scenario.epilogue) { strip.hidden = true; return; }

  const vip = world.vipAircraft();
  if (!vip) {
    const down = world.stats.vipDown;
    strip.hidden = false;
    strip.className = `flight-strip ${down ? 'is-lost' : 'is-clear'}`;
    strip.innerHTML = `<div class="flight-head"><b>STATE 01</b>
      <span>${down ? 'ЦЕЛЬ УНИЧТОЖЕНА · DESTROYED' : world.stats.vipEscaped
    ? 'ВНЕ ВОЗДУШНОГО ПРОСТРАНСТВА · CLEAR OF NATIONAL AIRSPACE' : 'НЕ В ВОЗДУХЕ · NOT AIRBORNE'}</span></div>`;
    return;
  }

  // Distance still to fly before it is out of national airspace, and the
  // nearest hostile contact to it — the two numbers the whole watch turns on.
  const toGo = Math.max(0, SIM.worldRadiusKm - len(vip.pos));
  let nearest = Infinity;
  for (const track of world.tracks.values()) {
    if (track.hostility === 'friendly' || track.quality <= 0) continue;
    nearest = Math.min(nearest, dist(track.pos, vip.pos));
  }
  const threatened = nearest < 45;

  strip.hidden = false;
  strip.className = `flight-strip${threatened ? ' is-threatened' : ''}`;
  strip.innerHTML = `<div class="flight-head"><b>STATE 01</b>
      <span>${esc(pair(STATUS.protectedFlight))}</span></div>
    <div class="flight-figures">
      <span><label>ALT</label>${Math.round(vip.altM / 100) * 100} M</span>
      <span><label>TO FRONTIER</label>${Math.round(toGo)} KM</span>
      <span class="${threatened ? 'is-bad' : ''}"><label>NEAREST</label>${
  Number.isFinite(nearest) ? `${Math.round(nearest)} KM` : '—'}</span>
    </div>`;
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

/* ---------------------------------------------------------- formations */

/**
 * The commands under this one.
 *
 * Invisible at battalion and sector level, where there is a single formation
 * and it is yours. From district command upward this is the panel the watch is
 * actually played on: four sectors, two of which you may hold, each with a
 * standing order and an officer who is carrying it out somewhere you cannot
 * see. Taking one costs a handover, and the handover is shown running, because
 * the seconds in which nobody is commanding a sector are the price of the
 * decision and hiding them would make the decision free.
 */
export function renderFormations(world, ui, els) {
  const host = els.formationList;
  if (!host) return;
  if (world.formations.length < 2) { host.hidden = true; return; }
  host.hidden = false;

  const limit = world.echelon.directLimit;
  const held = world.formations.filter((f) => f.direct && !f.hq).length;

  const cards = world.formations.map((formation) => {
    const sites = world.sites.filter((s) => s.formationId === formation.id);
    const alive = sites.filter((s) => s.alive);
    const rounds = alive.reduce((n, s) => n + s.readyRounds, 0);
    const engaged = alive.reduce((n, s) => n + s.engagements.length, 0);
    const handover = Math.max(0, formation.handoverUntilS - world.t);
    const state = handover > 0 ? 'handover' : formation.hq ? 'hq' : formation.direct ? 'direct' : 'detached';
    const postureEntry = CONTROLS[formation.posture];

    return `<div class="fmn is-${state}" data-formation="${formation.id}">
      <div class="fmn-head">
        <span class="lg"><b>${esc(formation.tm)}</b><i>${esc(formation.en)}</i></span>
        <span class="fmn-state">${esc(
    handover > 0 ? `ПЕРЕДАЧА · HANDOVER ${Math.ceil(handover)}s`
      : formation.hq ? 'ВАШ ДИВИЗИОН · YOURS'
        : formation.direct ? 'ПОД ВАШЕЙ РУКОЙ · DIRECT'
          : `${formation.commander?.tm ?? ''} · ${formation.commander?.name ?? 'SUBORDINATE'}`)}</span>
      </div>
      <div class="fmn-figures">
        <span><label>BTY</label>${alive.length}/${sites.length}</span>
        <span><label>ROUNDS</label>${rounds}</span>
        <span><label>ENGAGED</label>${engaged}</span>
        <span><label>ORDER</label>${esc(postureEntry.en)}</span>
      </div>
      <div class="fmn-controls">
        <button class="pb" data-act="posture" data-formation="${formation.id}"
          title="The standing order this formation fights on while you are elsewhere">
          <span class="lg"><b>${esc(postureEntry.tm)}</b><i>WEAPONS ${esc(postureEntry.en)}</i></span>
        </button>
        ${formation.hq ? '' : `<button class="pb ${formation.direct ? 'is-down' : ''}"
          data-act="direct" data-formation="${formation.id}"
          title="${formation.direct ? 'Hand it back to its commander' : `Take it under your own hand (${held}/${limit} held)`}">
          <span class="lg"><b>${formation.direct ? 'ОТДАТЬ' : 'ПРИНЯТЬ'}</b><i>${
  formation.direct ? 'RELEASE' : 'TAKE'}</i></span>
        </button>`}
      </div>
    </div>`;
  }).join('');

  host.innerHTML = `<div class="fmn-bar">
      <span class="lg"><b>ПОДЧИНЁННЫЕ КОМАНДЫ</b><i>SUBORDINATE COMMANDS</i></span>
      <span class="fmn-count">${held}/${Number.isFinite(limit) ? limit : '∞'} DIRECT</span>
    </div>${cards}${renderReserve(world)}`;
}

/**
 * The strategic reserve, at the one appointment that can release it.
 *
 * Rounds nobody below you can move, four minutes of road between the order and
 * a rail, and not enough of them to cover two of anything.
 */
function renderReserve(world) {
  if (!world.reserve.rounds && !world.reserve.released) return '';
  const transit = world.reserve.inTransit
    .map((c) => `${c.rounds} → ${esc(world.formationById.get(c.formationId)?.name ?? '')} `
      + `(${Math.ceil(c.arrivesAtS - world.t)}s)`)
    .join(', ');
  return `<div class="fmn is-reserve">
    <div class="fmn-head">
      <span class="lg"><b>СТРАТЕГИЧЕСКИЙ РЕЗЕРВ</b><i>STRATEGIC RESERVE</i></span>
      <span class="fmn-state">${world.reserve.rounds} ROUNDS HELD</span>
    </div>
    ${transit ? `<div class="fmn-figures"><span><label>ON THE ROAD</label>${transit}</span></div>` : ''}
    <div class="fmn-controls">
      ${world.formations.filter((f) => !f.hq).map((f) => `<button class="pb"
        data-act="reserve" data-formation="${f.id}" ${world.reserve.rounds <= 0 ? 'disabled' : ''}
        title="Release four rounds to ${esc(f.name)}. They take four minutes to arrive.">
        <span class="lg"><b>4 → ${esc(f.tm)}</b><i>RELEASE TO ${esc(f.en.toUpperCase())}</i></span>
      </button>`).join('')}
    </div>
  </div>`;
}

/* ------------------------------------------------------------- weapons */

export function renderBatteries(world, ui, els) {
  const units = world.sites.map((site, index) => {
    const type = SAM_TYPES[site.type];
    const radar = world.radarById.get(site.radarId);
    const nomenclature = EQUIPMENT[site.type];
    const mine = world.homeBatteryId === site.id;
    const crewed = world.control.crewedBatteryId === site.id;
    const armEta = radar?.alive ? armTimeToImpact(world, radar) : Infinity;

    const rail = Array.from({ length: Math.min(type.readyRounds, 14) }, (_, i) =>
      `<i class="${i < site.readyRounds ? '' : 'is-spent'}"></i>`).join('');

    const busyLabel = site.reloadRemainingS > 0
      ? { entry: STATUS.reloading, frac: 1 - site.reloadRemainingS / (type.reloadS * (site.reloadMult ?? 1)) }
      : site.scootRemainingS > 0
        ? { entry: STATUS.displacing, frac: 1 - site.scootRemainingS / (type.scootS * (site.scootMult ?? 1) * 1.5) }
        : null;

    const weaponsEntry = CONTROLS[site.weaponsState];

    // A battery in a formation somebody else is commanding is still on the
    // board and still shooting; it simply is not taking orders from this seat.
    const detached = !world.commandable(site.id);

    /*
     * Fit against the selected contact, judged BEFORE the assignment. The
     * first watch hands the player a battery whose ceiling is below every
     * contact in the mission; the card now says so while they are deciding,
     * instead of a cheerful ENGAGING followed by a quiet break-off.
     */
    const selectedTrack = ui.selectedTrackId ? world.tracks.get(ui.selectedTrackId) : null;
    const unfit = selectedTrack && !detached && site.alive
      ? cannotEngageReason(world, site, selectedTrack) : null;

    return `<div class="unit ${ui.selectedSiteId === site.id ? 'is-selected' : ''}
        ${!site.alive ? 'is-dead' : ''} ${mine ? 'is-mine' : ''}
        ${detached ? 'is-detached' : ''}" data-site="${site.id}">
      <span class="screw ${'abcd'[index % 4]}"></span>
      <div class="unit-head">
        <span class="unit-name">${index + 1}. ${esc(site.name)}</span>
        <span class="unit-type wrap" style="max-width:56%;text-align:right">
          ${esc(nomenclature ? pair(nomenclature) : type.label)}${crewed ? ` · ${esc(pair(STATUS.yourSeat))}` : ''}</span>
      </div>
      ${unfit ? `<div class="unit-row unit-unfit" title="Against the selected contact">
        <span>✗ CANNOT TAKE ${esc(selectedTrack.tn)} — ${esc(unfit.toUpperCase())}</span>
      </div>` : ''}

      <div class="unit-row">
        ${lamp(STATUS.ready, site.alive && site.readyRounds > 0 && site.scootRemainingS === 0, { colour: 'green' })}
        ${lamp(radar?.state === 'warming' ? STATUS.warming : STATUS.radiating,
    radar?.state === 'radiating' || radar?.state === 'warming',
    { colour: radar?.state === 'warming' ? 'amber' : 'green' })}
        ${lamp(STATUS.armWarning, Number.isFinite(armEta), { colour: 'red', blinking: true,
    caption: Number.isFinite(armEta) ? `${STATUS.armWarning.tm} ${Math.ceil(armEta)}s` : STATUS.armWarning.tm })}
        ${!site.alive ? lamp(STATUS.fault, true, { colour: 'red' }) : ''}
      </div>

      <div class="unit-row">
        <span class="rail" title="${site.readyRounds} ready of ${site.magazine} stored">${rail}</span>
        <span class="unit-type wrap" title="${esc(DEFENCE_CLASSES[type.class].blurb)}">
          ${esc(pair(DEFENCE_CLASSES[type.class]))}
        </span>
      </div>
      <div class="unit-row">
        <span class="unit-type wrap">${site.readyRounds}/${site.magazine} ROUNDS
          · ${esc(pair(STATUS.channels))} ${site.engagements.length}/${channelsFor(site)}
          · ${type.minRangeKm}–${type.maxRangeKm} КМ/KM
          · ${Math.round(type.minAltM)}–${Math.round(type.maxAltM / 1000)}К М/M</span>
      </div>
      ${busyLabel ? `<div class="unit-row">
        <span class="unit-type">${esc(pair(busyLabel.entry))}</span>
        <span class="gauge is-warn"><i style="width:${Math.round(busyLabel.frac * 100)}%"></i></span>
      </div>` : ''}

      <div class="unit-controls">
        ${toggle(radar?.on ? CONTROLS.silence : CONTROLS.radiate, !!radar?.on,
    { act: 'emcon', site: site.id, disabled: detached || !radar?.alive })}
        <button class="pb ${site.emconOrder === 'ride' ? 'is-down' : ''}"
          data-act="ride" data-site="${site.id}" ${detached || !radar?.alive ? 'disabled' : ''}
          title="${esc(site.emconOrder === 'ride' ? CONTROLS.ride.hint : CONTROLS.perDoctrine.hint)} (G)">
          <span class="lg"><b>${esc(CONTROLS.ride.tm)}</b><i>${esc(
    site.emconOrder === 'ride' ? 'RIDING' : 'RIDE')}</i></span>
        </button>
        <button class="pb" data-act="weapons" data-site="${site.id}" ${detached ? 'disabled' : ''}
          title="Weapons state — hold, tight or free (Q / W / Shift+E)">
          <span class="lg"><b>${esc(weaponsEntry.tm)}</b><i>WEAPONS ${esc(weaponsEntry.en)}</i></span>
        </button>
        <button class="pb" data-act="salvo" data-site="${site.id}" ${detached ? 'disabled' : ''}
          title="Rounds per engagement">
          <span class="lg"><b>${esc(CONTROLS.salvo.tm)} ${site.salvoSize}</b><i>SALVO</i></span>
        </button>
        ${press(CONTROLS.reload, { act: 'reload', site: site.id,
    disabled: detached || site.magazine <= 0 || site.reloadRemainingS > 0 })}
        ${press(CONTROLS.displace, { act: 'scoot', site: site.id,
    disabled: detached || site.scootRemainingS > 0 })}
      </div>
    </div>`;
  }).join('');

  const surveillance = world.radars.filter((r) => !r.siteId).map((radar, index) => {
    const nomenclature = Object.values(EQUIPMENT).find((e) => e.en.includes(radar.label));
    const armEta = radar.alive ? armTimeToImpact(world, radar) : Infinity;
    return `<div class="unit" data-radar="${radar.id}">
      <span class="screw ${'abcd'[index % 4]}"></span>
      <div class="unit-head">
        <span class="unit-name" title="${esc(nomenclature?.en ?? radar.label)}">${esc(nomenclature ? nomenclature.tm : radar.label)}</span>
        <span class="unit-type">${radar.alive ? `${radar.rangeKm} КМ/KM` : esc(pair(STATUS.destroyed))}</span>
      </div>
      <div class="unit-row">
        ${lamp(radar.state === 'warming' ? STATUS.warming : STATUS.radiating,
    radar.state === 'radiating' || radar.state === 'warming',
    { colour: radar.state === 'warming' ? 'amber' : 'green' })}
        ${lamp(STATUS.armWarning, Number.isFinite(armEta), { colour: 'red', blinking: true,
    caption: Number.isFinite(armEta) ? `${STATUS.armWarning.tm} ${Math.ceil(armEta)}s` : STATUS.armWarning.tm })}
      </div>
      <div class="unit-row">
        <span class="unit-type">${esc(pair(STATUS.exposure))}</span>
        <span class="gauge ${radar.exposure > 0.65 ? 'is-hot' : radar.exposure > 0.35 ? 'is-warn' : ''}">
          <i style="width:${Math.round(radar.exposure * 100)}%"></i></span>
        <span class="unit-type">${Math.round(radar.exposure * 100)}%</span>
      </div>
      <div class="unit-controls">
        ${toggle(radar.on ? CONTROLS.silence : CONTROLS.radiate, radar.on,
    { act: 'emcon-radar', radar: radar.id, disabled: !radar.alive })}
      </div>
    </div>`;
  }).join('');

  els.batteryList.innerHTML = surveillance + units;
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
  const nomenclature = EQUIPMENT[site.type];

  const sequence = {
    idle: STATUS.standby, reacting: STATUS.preparing, ready: STATUS.ready, guiding: STATUS.inFlight,
  }[status.state] ?? STATUS.standby;

  const envelope = !status.hasTarget ? STATUS.noTarget
    : status.inEnvelope ? STATUS.inEnvelope : STATUS.outOfZone;

  const envelopeDetail = !status.hasTarget ? '—'
    : status.inEnvelope ? `${Math.round(status.rangeKm)} КМ`
      : status.timeToRangeS !== null ? `+${Math.ceil(status.timeToRangeS)}s`
        : pair(STATUS.noSolution);

  const row = (entry, value, mood = '') =>
    `<div class="crew-row ${mood}">${legend(entry, { inline: true })}<b>${esc(value)}</b></div>`;

  els.crewConsole.innerHTML = `
    <div class="unit is-mine" style="margin:0">
      <span class="screw a"></span>
      <div class="unit-head">
        <span class="unit-name">${esc(site.name)}</span>
        <span class="unit-type" title="${esc(nomenclature?.en ?? type.label)}">
          ${esc(nomenclature ? pair(nomenclature) : type.label)}</span>
      </div>

      <div class="unit-row" style="margin-top:7px">
        ${lamp(STATUS.ready, status.state === 'ready', { colour: 'green' })}
        ${lamp(STATUS.guiding, status.guidance === 'GUIDING', { colour: 'green' })}
        ${lamp(STATUS.noGuidance, status.guidance !== 'GUIDING', { colour: 'amber' })}
        ${lamp(STATUS.armWarning, Number.isFinite(armEta), { colour: 'red', blinking: true })}
      </div>

      ${row(STATUS.target, status.trackLabel)}
      ${row(envelope, envelopeDetail, status.inEnvelope ? 'is-good' : '')}
      ${row(STATUS.sequence, `${pair(sequence)}${status.reactionRemainingS > 0 ? ` ${status.reactionRemainingS.toFixed(1)}s` : ''}`)}
      ${row(STATUS.channels, `${status.channelsUsed}/${status.channels}`)}
      ${row(CONTROLS.reload, `${site.readyRounds} / ${site.magazine}`)}

      <button class="pb pb-fire ${status.canFire ? 'is-armed' : ''}" id="btn-fire"
        ${status.canFire ? '' : 'disabled'}>
        ${status.state === 'guiding'
    ? `<span class="lg"><b>${status.roundsUp} В ПОЛЁТЕ</b><i>${status.roundsUp} IN FLIGHT</i></span>`
    : legend(CONTROLS.launch)}
      </button>

      <div class="unit-controls" style="margin-top:8px">
        ${press(CONTROLS.lock, { act: 'lock', site: site.id })}
        ${toggle(radar?.on ? CONTROLS.silence : CONTROLS.radiate, !!radar?.on,
    { act: 'emcon', site: site.id, disabled: !radar?.alive })}
        ${press(CONTROLS.reload, { act: 'reload', site: site.id })}
        ${press(CONTROLS.displace, { act: 'scoot', site: site.id })}
      </div>

      <div class="unit-row" style="margin-top:9px">
        ${legend(STATUS.exposure, { inline: true })}
        <span class="gauge ${(radar?.exposure ?? 0) > 0.65 ? 'is-hot' : (radar?.exposure ?? 0) > 0.35 ? 'is-warn' : ''}">
          <i style="width:${Math.round((radar?.exposure ?? 0) * 100)}%"></i></span>
        <span class="unit-type">${Math.round((radar?.exposure ?? 0) * 100)}%</span>
      </div>
      ${site.crewLosses ? `<div class="crew-row is-hot">${legend(STATUS.crew, { inline: true })}
        <b>${site.crewLosses} ПОТЕРЬ / CASUALTIES</b></div>` : ''}

      <div class="placard" style="margin-top:9px">${esc(PLATES.warning.tm)}<br>${esc(PLATES.warning.en)}</div>
    </div>`;
}

/* ------------------------------------------------------------ event log */

export function renderEventLog(world, els, state) {
  // Keyed on event seq, not array index — the list is capped, and an index
  // comparison freezes the ticker for good the moment the cap is reached.
  const from = state.lastEventSeq ?? 0;
  const fresh = world.events.filter((e) => e.seq > from);
  if (!fresh.length) return;
  state.lastEventSeq = fresh[fresh.length - 1].seq;

  // The `personal` flag marks the handful of lines that are about the
  // operator's own street — written by the engine since the first build and
  // consumed nowhere until now.
  const html = fresh.map((e) => `<li class="kind-${e.kind}${e.personal ? ' is-personal' : ''}">
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

/** Range scale positions on the selector, in kilometres. */
export const RANGE_SCALES = [60, 100, 150, 220];

/**
 * The scope's own controls, mounted on the bezel beside the tube: a rotary range
 * selector with real detents, and the plate the factory riveted on.
 *
 * The knob is drawn once and then only its pointer is rotated, so turning it
 * costs a transform rather than a re-render.
 */
export function renderScopeSide(world, ui, els, rangeKm) {
  const index = RANGE_SCALES.indexOf(rangeKm);
  const detent = index >= 0 ? index : RANGE_SCALES.findIndex((r) => r >= rangeKm);
  const angle = -135 + (Math.max(0, detent) / (RANGE_SCALES.length - 1)) * 270;

  if (els.scopeSide.dataset.built !== '1') {
    els.scopeSide.dataset.built = '1';
    els.scopeSide.innerHTML = `
      <div class="knob-group">
        <button class="knob" id="range-knob" title="Range scale — mouse wheel over the scope also works">
          <span class="knob-pointer"></span>
        </button>
      </div>
      ${legend(CONTROLS.range, {})}
      <span class="knob-readout" id="range-readout"></span>
      <span class="data-plate" style="margin-top:auto">
        <b>${esc(PLATES.type.tm)}</b> ${esc(PLATES.type.en)}<br>
        ${esc(PLATES.works.tm)}<br>${esc(PLATES.works.en)}<br>
        ${esc(PLATES.factory.tm)}<br>${esc(PLATES.factory.en)}
      </span>
      <span class="placard">${esc(PLATES.caution.tm)}<br>${esc(PLATES.caution.en)}</span>`;
  }

  const pointer = els.scopeSide.querySelector('.knob-pointer');
  if (pointer) pointer.style.transform = `rotate(${angle}deg)`;
  const readout = els.scopeSide.querySelector('#range-readout');
  if (readout) readout.textContent = `${Math.round(rangeKm)} КМ`;
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
