/**
 * The battery console — what the SAM operator sees.
 *
 * Deliberately *not* the sector picture. You get your own radar's coverage and
 * nothing else, plus whatever the net can be bothered to cue you onto. When
 * sector operations goes down the cues stop and this is all there is.
 *
 * The lower half is a range-height indicator, and it carries the single most
 * educational line in the game: the radar horizon curve. Everything under that
 * curve is invisible to you no matter how much power you put into the antenna,
 * which is why the contact at ninety metres appears at forty kilometres and
 * gives you about two minutes.
 */

import { THEMES, readPalette, hostilityColour } from './themes.js';
import { SAM_TYPES, AIR_TYPES } from '../engine/config.js';
import { bearing, dist, headingVec, len, radarHorizonKm, clamp01, clamp } from '../engine/math.js';
import { inEnvelope, timeToInRangeS, computeSamPk } from '../engine/weapons.js';
import { withAlpha } from './scope.js';

const TAU = Math.PI * 2;
const FONT = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
/** Share of the canvas height given to the plan view; the rest is the height finder. */
const PLAN_SHARE = 0.66;

export class CrewConsole {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = 1;
    this.w = 0;
    this.h = 0;
    this.theme = THEMES['crt-green'];
    this.palette = readPalette();
    this.rangeKm = 60;
  }

  setTheme(themeId) {
    this.theme = THEMES[themeId] ?? THEMES['crt-green'];
    this.palette = readPalette();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (w !== this.canvas.width || h !== this.canvas.height) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.dpr = dpr;
    this.w = w;
    this.h = h;
    this.planH = h * PLAN_SHARE;
  }

  site(world) { return world.siteById.get(world.control.crewedBatteryId); }

  /** Plan-view scale: the battery's own maximum range fills the plan area. */
  planScale() {
    return Math.min(this.w, this.planH) / 2 / this.rangeKm;
  }

  toScreen(site, pos) {
    const s = this.planScale();
    return {
      x: this.w / 2 + (pos.x - site.pos.x) * s,
      y: this.planH / 2 - (pos.y - site.pos.y) * s,
    };
  }

  pick(px, py, world) {
    const site = this.site(world);
    if (!site) return null;
    const p = { x: px * this.dpr, y: py * this.dpr };
    if (p.y > this.planH) return null;
    let best = null;
    let bestDist = 20 * this.dpr;
    for (const track of this.localTracks(world)) {
      const s = this.toScreen(site, track.pos);
      const d = Math.hypot(s.x - p.x, s.y - p.y);
      if (d < bestDist) { bestDist = d; best = { kind: 'track', id: track.id }; }
    }
    return best;
  }

  /**
   * What this battery can legitimately see: its own radar's contributions, plus
   * anything the net has cued it onto. That distinction is the whole point of
   * the seat — losing the net does not blind you, it isolates you.
   */
  localTracks(world) {
    const site = this.site(world);
    if (!site) return [];
    const out = [];
    for (const track of world.tracks.values()) {
      const own = world.radarsOf(site).some((r) => track.sources.includes(r.id));
      const cued = track.assignedTo.includes(site.id);
      if (own || cued) out.push({ ...track, cueOnly: !own && cued });
    }
    return out;
  }

  render(world, ui = {}) {
    this.resize();
    const site = this.site(world);
    const { ctx } = this;
    const p = this.palette;

    ctx.save();
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, this.w, this.h);

    if (!site) {
      ctx.fillStyle = p.hostile;
      ctx.font = `${16 * this.dpr}px ${FONT}`;
      ctx.fillText('NO BATTERY ASSIGNED', 20 * this.dpr, 40 * this.dpr);
      ctx.restore();
      return;
    }

    const type = SAM_TYPES[site.type];
    this.rangeKm = type.maxRangeKm * 1.35;

    this.drawPlan(world, site, type, ui);
    this.drawHeightFinder(world, site, type, ui);

    if (this.theme.scanlines) {
      ctx.globalAlpha = 0.14;
      ctx.fillStyle = '#000';
      const gap = Math.max(2, Math.round(2 * this.dpr));
      for (let y = 0; y < this.h; y += gap * 2) ctx.fillRect(0, y, this.w, gap);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  drawPlan(world, site, type, ui) {
    const { ctx } = this;
    const p = this.palette;
    const scale = this.planScale();
    const centre = this.toScreen(site, site.pos);
    const radar = world.radarById.get(site.radarId);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, this.w, this.planH);
    ctx.clip();

    // Range rings labelled in kilometres.
    ctx.strokeStyle = p.grid;
    ctx.fillStyle = p.inkDim;
    ctx.font = `${9.5 * this.dpr}px ${FONT}`;
    ctx.lineWidth = 1;
    const step = type.maxRangeKm > 60 ? 20 : type.maxRangeKm > 25 ? 10 : 5;
    for (let r = step; r <= this.rangeKm; r += step) {
      ctx.beginPath();
      ctx.arc(centre.x, centre.y, r * scale, 0, TAU);
      ctx.stroke();
      ctx.fillText(`${r}`, centre.x + 3 * this.dpr, centre.y - r * scale - 2 * this.dpr);
    }
    for (let a = 0; a < 360; a += 30) {
      const h = headingVec(a);
      ctx.beginPath();
      ctx.moveTo(centre.x, centre.y);
      ctx.lineTo(centre.x + h.x * this.rangeKm * scale, centre.y - h.y * this.rangeKm * scale);
      ctx.globalAlpha = a % 90 === 0 ? 0.7 : 0.3;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // The engagement envelope, drawn as the ring you have to get them inside.
    ctx.strokeStyle = withAlpha(p.accent, 0.55);
    ctx.setLineDash([5 * this.dpr, 4 * this.dpr]);
    ctx.beginPath();
    ctx.arc(centre.x, centre.y, type.maxRangeKm * scale, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = withAlpha(p.hostile, 0.4);
    ctx.beginPath();
    ctx.arc(centre.x, centre.y, type.minRangeKm * scale, 0, TAU);
    ctx.stroke();

    // The beam, when the set is up.
    if (radar?.state === 'radiating') {
      const h = headingVec(radar.az);
      // Clamp the beam to what the display actually covers; a line running off
      // past the outer ring reads as a bug rather than as reach.
      const reach = Math.min(radar.rangeKm, this.rangeKm) * scale;
      const grad = ctx.createRadialGradient(centre.x, centre.y, 0, centre.x, centre.y, reach);
      grad.addColorStop(0, withAlpha(p.accent, 0.2));
      grad.addColorStop(1, withAlpha(p.accent, 0.01));
      ctx.beginPath();
      ctx.moveTo(centre.x, centre.y);
      ctx.arc(centre.x, centre.y, reach,
        (radar.az - 50 - 90) * Math.PI / 180, (radar.az - 90) * Math.PI / 180);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(centre.x, centre.y);
      ctx.lineTo(centre.x + h.x * reach, centre.y - h.y * reach);
      ctx.strokeStyle = withAlpha(p.accent, 0.7);
      ctx.lineWidth = 1.5 * this.dpr;
      ctx.stroke();
    } else {
      ctx.fillStyle = withAlpha(p.hostile, 0.75);
      ctx.font = `${12 * this.dpr}px ${FONT}`;
      ctx.fillText('SET DARK', 12 * this.dpr, 22 * this.dpr);
    }

    /*
     * The fire-control arc, from inside the cabin. On a battalion this is the
     * most important thing on the plan view: the antenna covers a hundred and
     * twenty degrees, traverses at five degrees a second, and guides nothing
     * outside the wedge. The crew watches this the way a gunner watches a
     * traverse limit.
     */
    const fc = world.radarById.get(site.fcRadarId ?? site.radarId);
    if (fc?.fovDeg && fc.alive) {
      const half = fc.fovDeg / 2;
      const reach = Math.min(type.maxRangeKm, this.rangeKm) * scale;
      const lit = fc.state === 'radiating';
      ctx.beginPath();
      ctx.moveTo(centre.x, centre.y);
      ctx.arc(centre.x, centre.y, reach,
        (fc.boresightDeg - half - 90) * Math.PI / 180,
        (fc.boresightDeg + half - 90) * Math.PI / 180);
      ctx.closePath();
      ctx.fillStyle = withAlpha(p.accent, lit ? 0.07 : 0.03);
      ctx.fill();
      ctx.strokeStyle = withAlpha(p.accent, lit ? 0.4 : 0.18);
      ctx.lineWidth = 1.2 * this.dpr;
      ctx.stroke();
      const bore = headingVec(fc.boresightDeg);
      ctx.beginPath();
      ctx.moveTo(centre.x, centre.y);
      ctx.lineTo(centre.x + bore.x * reach, centre.y - bore.y * reach);
      ctx.setLineDash([4 * this.dpr, 5 * this.dpr]);
      ctx.strokeStyle = withAlpha(p.accent, lit ? 0.5 : 0.25);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // The battery itself.
    ctx.fillStyle = p.friendly;
    ctx.beginPath();
    ctx.arc(centre.x, centre.y, 4 * this.dpr, 0, TAU);
    ctx.fill();

    for (const track of this.localTracks(world)) {
      const rangeKm = dist(site.pos, track.pos);
      const colour = hostilityColour(p, track);
      const selected = ui.selectedTrackId === track.id;
      const env = inEnvelope(site, track.pos, track.altM);

      /*
       * The kill, in the cabin. The seat with the FIRE button in it had no
       * bloom, no cross, and no drop: a target you had just splashed kept
       * flying its symbol along its old velocity for five seconds, which is
       * the one moment this seat exists for, rendered as nothing.
       */
      if (track.destroyed) {
        const s = this.toScreen(site, track.pos);
        const age = clamp01((world.t - (track.destroyedAtS ?? world.t)) / 4.5);
        const bloom = 6 * this.dpr * (1.4 + age * 2.4);
        ctx.save();
        ctx.globalAlpha = 0.9 * (1 - age);
        ctx.strokeStyle = colour;
        ctx.lineWidth = 1.6 * this.dpr;
        ctx.beginPath();
        ctx.arc(s.x, s.y, bloom, 0, TAU);
        ctx.stroke();
        const arm = 5 * this.dpr;
        ctx.beginPath();
        ctx.moveTo(s.x - arm, s.y - arm); ctx.lineTo(s.x + arm, s.y + arm);
        ctx.moveTo(s.x - arm, s.y + arm); ctx.lineTo(s.x + arm, s.y - arm);
        ctx.stroke();
        ctx.fillStyle = colour;
        ctx.font = `${8.5 * this.dpr}px ${FONT}`;
        ctx.fillText(`${track.tn} ✕`, s.x + bloom + 3 * this.dpr, s.y + 3 * this.dpr);
        ctx.restore();
        continue;
      }

      // A cue you cannot reach yet still has to be findable, so contacts beyond
      // the display are pinned to the edge on their true bearing with the range
      // written next to them. That is what a cue over the net actually gives you:
      // a direction and a number, not a picture.
      if (rangeKm > this.rangeKm) {
        const az = bearing(site.pos, track.pos);
        const h = headingVec(az);
        const edge = Math.min(this.w, this.planH) / 2 - 14 * this.dpr;
        const ex = centre.x + h.x * edge;
        const ey = centre.y - h.y * edge;
        ctx.save();
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = colour;
        ctx.translate(ex, ey);
        ctx.rotate((az) * Math.PI / 180);
        ctx.beginPath();
        ctx.moveTo(0, -6 * this.dpr);
        ctx.lineTo(4.5 * this.dpr, 4 * this.dpr);
        ctx.lineTo(-4.5 * this.dpr, 4 * this.dpr);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = p.inkDim;
        ctx.font = `${8.5 * this.dpr}px ${FONT}`;
        ctx.fillText(`${track.tn} ${Math.round(rangeKm)}`, ex + 7 * this.dpr, ey + 3 * this.dpr);
        continue;
      }

      const s = this.toScreen(site, track.pos);

      ctx.save();
      ctx.globalAlpha = track.cueOnly ? 0.55 : track.coasting ? 0.6 : 1;
      ctx.strokeStyle = colour;
      ctx.fillStyle = colour;
      ctx.lineWidth = (selected ? 2.4 : 1.4) * this.dpr;

      if (track.cueOnly) {
        // A cue you have not found yourself: bracketed, hollow, and untrustworthy.
        const r = 7 * this.dpr;
        ctx.setLineDash([2 * this.dpr, 3 * this.dpr]);
        ctx.beginPath();
        ctx.arc(s.x, s.y, r, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = `${8.5 * this.dpr}px ${FONT}`;
        ctx.fillText('CUE', s.x + r + 2 * this.dpr, s.y + 3 * this.dpr);
      } else {
        ctx.beginPath();
        ctx.arc(s.x, s.y, 3 * this.dpr, 0, TAU);
        ctx.fill();
        const speed = len(track.vel);
        if (speed > 1e-4) {
          const lead = this.toScreen(site, {
            x: track.pos.x + track.vel.x / speed * speed * 60,
            y: track.pos.y + track.vel.y / speed * speed * 60,
          });
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(lead.x, lead.y);
          ctx.stroke();
        }
        ctx.font = `${9 * this.dpr}px ${FONT}`;
        ctx.fillText(track.tn, s.x + 6 * this.dpr, s.y - 3 * this.dpr);
        ctx.fillStyle = env.ok ? p.good : p.inkDim;
        ctx.fillText(`${Math.round(env.rangeKm)}km`, s.x + 6 * this.dpr, s.y + 7 * this.dpr);
      }

      if (selected) {
        ctx.strokeStyle = p.inkBright;
        ctx.setLineDash([3 * this.dpr, 3 * this.dpr]);
        ctx.beginPath();
        ctx.arc(s.x, s.y, 12 * this.dpr, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
    }

    // Rounds in flight, ours and theirs.
    for (const missile of world.missiles) {
      if (!missile.alive || missile.tofS < 0) continue;
      const relevant = missile.siteId === site.id
        || (missile.kind === 'arm' && missile.targetId === site.radarId);
      if (!relevant) continue;
      const s = this.toScreen(site, missile.pos);
      ctx.fillStyle = missile.kind === 'arm' ? p.hostile : p.accent;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 2.6 * this.dpr, 0, TAU);
      ctx.fill();
      if (missile.kind === 'arm') {
        const pulse = 0.5 + 0.5 * Math.sin(world.t * 7);
        ctx.strokeStyle = withAlpha(p.hostile, 0.4 + pulse * 0.5);
        ctx.lineWidth = 1.4 * this.dpr;
        ctx.beginPath();
        ctx.arc(s.x, s.y, (6 + pulse * 5) * this.dpr, 0, TAU);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /**
   * Range-height indicator.
   *
   * Horizontal axis is ground range from the battery, vertical is altitude. The
   * engagement envelope is a box; the radar horizon is a curve rising from the
   * origin. A contact below that curve does not exist as far as this radar is
   * concerned, and watching a low contact climb out from under it — already
   * inside your minimum range — teaches the lesson faster than any briefing.
   */
  drawHeightFinder(world, site, type, ui) {
    const { ctx } = this;
    const p = this.palette;
    const top = this.planH;
    const height = this.h - top;
    const pad = { l: 42 * this.dpr, r: 12 * this.dpr, t: 14 * this.dpr, b: 18 * this.dpr };
    const plotW = this.w - pad.l - pad.r;
    const plotH = height - pad.t - pad.b;
    const maxRangeKm = this.rangeKm;
    const maxAltM = Math.max(type.maxAltM * 1.15, 12000);
    const radar = world.radarById.get(site.radarId);

    const rx = (km) => pad.l + clamp01(km / maxRangeKm) * plotW;
    const ry = (m) => top + pad.t + plotH - clamp01(m / maxAltM) * plotH;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, top, this.w, height);
    ctx.clip();

    ctx.strokeStyle = p.edge;
    ctx.beginPath();
    ctx.moveTo(0, top + 0.5);
    ctx.lineTo(this.w, top + 0.5);
    ctx.stroke();

    ctx.font = `${9 * this.dpr}px ${FONT}`;
    ctx.fillStyle = p.inkDim;
    ctx.fillText('RANGE / HEIGHT', pad.l, top + 11 * this.dpr);

    // Axes.
    ctx.strokeStyle = p.grid;
    ctx.lineWidth = 1;
    for (let km = 0; km <= maxRangeKm; km += type.maxRangeKm > 60 ? 20 : 10) {
      ctx.beginPath();
      ctx.moveTo(rx(km), top + pad.t);
      ctx.lineTo(rx(km), top + pad.t + plotH);
      ctx.stroke();
      ctx.fillText(`${km}`, rx(km) + 2 * this.dpr, this.h - 6 * this.dpr);
    }
    for (let alt = 0; alt <= maxAltM; alt += 5000) {
      ctx.beginPath();
      ctx.moveTo(pad.l, ry(alt));
      ctx.lineTo(this.w - pad.r, ry(alt));
      ctx.stroke();
      ctx.fillText(`${Math.round(alt / 1000)}k`, 6 * this.dpr, ry(alt) + 3 * this.dpr);
    }

    // The engagement envelope as a box you have to get a contact inside.
    ctx.fillStyle = withAlpha(p.accent, 0.09);
    ctx.strokeStyle = withAlpha(p.accent, 0.5);
    ctx.setLineDash([4 * this.dpr, 3 * this.dpr]);
    const boxX = rx(type.minRangeKm);
    const boxW = rx(type.maxRangeKm) - boxX;
    const boxY = ry(type.maxAltM);
    const boxH = ry(type.minAltM) - boxY;
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeRect(boxX, boxY, boxW, boxH);
    ctx.setLineDash([]);

    // The horizon: below this line, the radar is looking at the ground.
    if (radar) {
      ctx.beginPath();
      let started = false;
      for (let km = 0; km <= maxRangeKm; km += 1) {
        // Invert the horizon formula for the lowest visible altitude at this range.
        const root = km / 4.12 - Math.sqrt(radar.heightM);
        const altM = root <= 0 ? 0 : root * root;
        if (altM > maxAltM) break;
        const x = rx(km);
        const y = ry(altM);
        if (!started) { ctx.moveTo(x, y); started = true; } else { ctx.lineTo(x, y); }
      }
      ctx.strokeStyle = withAlpha(p.hostile, 0.75);
      ctx.lineWidth = 1.4 * this.dpr;
      ctx.stroke();
      ctx.fillStyle = withAlpha(p.hostile, 0.7);
      ctx.fillText('HORIZON', this.w - 70 * this.dpr, ry(0) - 6 * this.dpr);
    }

    let offScale = 0;
    for (const track of this.localTracks(world)) {
      if (track.cueOnly) continue;
      const rangeKm = dist(site.pos, track.pos);
      if (rangeKm > maxRangeKm) { offScale++; continue; }
      const x = rx(rangeKm);
      const y = ry(track.altM);
      const colour = hostilityColour(p, track);
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.arc(x, y, 3 * this.dpr, 0, TAU);
      ctx.fill();
      if (ui.selectedTrackId === track.id) {
        ctx.strokeStyle = p.inkBright;
        ctx.lineWidth = 1.4 * this.dpr;
        ctx.beginPath();
        ctx.arc(x, y, 8 * this.dpr, 0, TAU);
        ctx.stroke();
      }
      ctx.fillStyle = p.inkDim;
      ctx.font = `${8.5 * this.dpr}px ${FONT}`;
      ctx.fillText(track.tn, x + 5 * this.dpr, y - 4 * this.dpr);
    }

    // Contacts beyond the plot get a chevron on the edge rather than vanishing:
    // "there is something out there, it is just not your problem yet".
    if (offScale) {
      ctx.fillStyle = p.inkDim;
      ctx.font = `${9 * this.dpr}px ${FONT}`;
      ctx.fillText(`${offScale} BEYOND ▸`, this.w - 92 * this.dpr, top + 11 * this.dpr);
    }

    ctx.restore();
  }
}

/**
 * The numbers the operator panel shows. Kept here rather than in the DOM code so
 * the same figures could drive a test, a readout, or a voice line without
 * being recomputed three different ways.
 */
export function engagementStatus(world, site, track) {
  if (!site) return null;
  const type = SAM_TYPES[site.type];
  // Search and guidance are the same set on most batteries and two different
  // machines on a long-range battalion. Guidance is the fire-control set's
  // business; everything else reads the battery's own (search) set.
  const radar = world.radarById.get(site.fcRadarId ?? site.radarId);
  const engagement = track ? site.engagements.find((e) => e.trackId === track.id) : null;
  const env = track ? inEnvelope(site, track.pos, track.altM) : null;
  const toRange = track && env && !env.ok ? timeToInRangeS(site, track) : 0;

  // The most anxious number on the console: seconds until the nearest round
  // in flight reaches its target. For a long time the operator stared at a
  // 2.2px dot for the whole ~25-second flight with no readout anywhere.
  let roundEtaS = null;
  if (engagement?.missileIds?.length) {
    for (const id of engagement.missileIds) {
      const missile = world.missiles.find((m) => m.id === id && m.alive);
      if (!missile) continue;
      const target = world.aircraftById.get(missile.targetId);
      if (!target?.alive || !missile.speed) continue;
      const eta = dist(missile.pos, target.pos) / missile.speed;
      if (roundEtaS === null || eta < roundEtaS) roundEtaS = eta;
    }
  }

  /*
   * What the crew's own firing tables say the shot is worth, from the picture
   * this console actually has: range, altitude, and whatever the
   * classification says about the target — an unclassified contact is priced
   * as a strike profile, which is what a crew assumes too. An estimate, not
   * the roll: the roll also knows about evasion and launch discipline. It
   * exists because "FIRE is lit" and "this is a good shot" were the same
   * lamp, and the difference between them is the entire skill of the seat.
   */
  /*
   * Where the fire-control antenna is pointing, and whether the selected
   * track is inside its arc. Null on every battery whose set turns through
   * the full circle — there is no arc to be outside of.
   */
  let fc = null;
  if (radar?.fovDeg) {
    const az = track ? bearing(radar.pos, track.pos) : null;
    const offAxis = az === null ? null : Math.abs(((az - radar.boresightDeg + 540) % 360) - 180);
    fc = {
      boresightDeg: Math.round(radar.boresightDeg),
      fovDeg: radar.fovDeg,
      onTarget: offAxis !== null && offAxis <= radar.fovDeg / 2,
      // Seconds of traverse still to come before this track is inside the arc.
      slewS: offAxis === null ? 0
        : Math.max(0, (offAxis - radar.fovDeg / 2) / (radar.slewRateDegPerS || 1)),
    };
  }

  /*
   * And no estimate at all from a battery whose guidance antenna is
   * wreckage. Seen in a real watch: the cabin reading EST KILL PROB 80% and
   * IN ENVELOPE 42 KM beside "FIRE CONTROL DESTROYED — THIS BATTERY CANNOT
   * GUIDE A ROUND". The geometry was true and the promise was not, and a
   * console that prices a shot it cannot take is the same lie in a different
   * font.
   */
  let pkEstimate = null;
  if (track && env?.ok && radar?.alive) {
    const known = AIR_TYPES[track.classification] ? track.classification : 'striker';
    pkEstimate = computeSamPk(site, { pos: track.pos, altM: track.altM, type: known },
      null, world.difficulty);
  }

  return {
    hasTarget: !!track,
    trackLabel: track?.tn ?? '—',
    rangeKm: env?.rangeKm ?? 0,
    inEnvelope: env?.ok ?? false,
    envelopeReason: env?.reason ?? 'NO TARGET',
    pkEstimate,
    fc,
    timeToRangeS: Number.isFinite(toRange) ? toRange : null,
    state: engagement?.state ?? 'idle',
    /** Deliberately waiting for the target to close before releasing. */
    holding: !!engagement?.holding && engagement?.state === 'ready',
    reactionRemainingS: engagement?.state === 'reacting' ? Math.max(0, engagement.timerS) : 0,
    roundsUp: engagement?.missileIds.length ?? 0,
    roundEtaS,
    canFire: !!engagement && engagement.state === 'ready' && (env?.ok ?? false)
      && site.readyRounds > 0 && radar?.state === 'radiating'
      && (fc === null || fc.onTarget),
    guidance: radar?.state === 'radiating' && (fc === null || fc.onTarget)
      ? 'GUIDING' : 'NO GUIDANCE',
    radarState: radar?.state ?? 'off',
    exposure: radar?.exposure ?? 0,
    channelsUsed: site.engagements.length,
    channels: type.channels,
  };
}
