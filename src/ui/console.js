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
import { SAM_TYPES, AIR_TYPES, ASSET_TYPES } from '../engine/config.js';
import { bearing, dist, headingVec, len, clamp01 } from '../engine/math.js';
import { inEnvelope, timeToInRangeS, computeSamPk } from '../engine/weapons.js';
import { withAlpha } from './scope.js';

const TAU = Math.PI * 2;
const FONT = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
/** Share of the canvas height given to the plan view; the rest is the height finder. */
const PLAN_SHARE = 0.62;

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

  /* ------------------------------------------------------------ lettering
   *
   * Every string on this display used to be a bare fillText at a fixed offset
   * from its mark, with no halo, no plate and no idea what else was already
   * there. Ordinary play produced 'T-00[dot]✕T-002' where a kill marker met
   * the next contact, 'T-003 11km' printed straight through a range numeral,
   * the 10 km ring, the boresight line and the own-battery symbol, and two
   * range-height contacts whose labels overprinted into 'T0002'. A radar
   * display is mostly text on top of a grid, so the text is a layer with
   * rules: it is knocked out of whatever is behind it, and it looks for a
   * corner nobody is standing in.
   */

  /** Start a frame's label layer. */
  beginLabels() { this.labelBoxes = []; }

  /**
   * Draw a string near (x, y), knocked out of the grid, in a corner that is
   * free. Tries the eight compass offsets in the preferred order and takes the
   * first that collides with nothing already placed; if all eight are taken it
   * uses the first and accepts the overlap rather than dropping the label,
   * because a missing track number is worse than a tight one.
   */
  place(text, x, y, colour, { size = 8.5, radius = 6, prefer = 'NE', weight = '' } = {}) {
    const { ctx } = this;
    const d = this.dpr;
    ctx.font = `${weight ? `${weight} ` : ''}${size * d}px ${FONT}`;
    const w = ctx.measureText(text).width;
    const h = size * d;
    const r = radius * d;
    const order = ['NE', 'E', 'SE', 'N', 'S', 'NW', 'W', 'SW'];
    const from = order.indexOf(prefer);
    const tries = order.slice(from < 0 ? 0 : from).concat(order.slice(0, from < 0 ? 0 : from));
    let best = null;
    for (const dir of tries) {
      const ox = dir.includes('E') ? r : dir.includes('W') ? -r - w : -w / 2;
      const oy = dir.includes('N') ? -r : dir.includes('S') ? r + h * 0.8 : h * 0.35;
      const box = { x: x + ox, y: y + oy - h, w, h: h * 1.15 };
      if (!best) best = box;
      const clash = this.labelBoxes.some((b) => box.x < b.x + b.w && box.x + box.w > b.x
        && box.y < b.y + b.h && box.y + box.h > b.y);
      if (!clash) { best = box; break; }
    }
    this.labelBoxes.push(best);
    ctx.save();
    // A label that had to move to find room says which mark it belongs to.
    const home = { x: x + (r + 1), y: y - r };
    if (Math.hypot(best.x - home.x, best.y - home.y) > 10 * d) {
      ctx.strokeStyle = withAlpha(colour, 0.45);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(best.x + (best.x < x ? best.w : 0), best.y + best.h * 0.6);
      ctx.stroke();
    }
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3 * d;
    ctx.strokeStyle = this.palette.bg;
    ctx.globalAlpha = 0.85;
    ctx.strokeText(text, best.x, best.y + h);
    ctx.globalAlpha = 1;
    ctx.fillStyle = colour;
    ctx.fillText(text, best.x, best.y + h);
    ctx.restore();
    return best;
  }

  /** A string that owns its position — an axis numeral, a title — still knocked out. */
  stamp(text, x, y, colour, { size = 9, align = 'left', weight = '' } = {}) {
    const { ctx } = this;
    const d = this.dpr;
    ctx.save();
    ctx.font = `${weight ? `${weight} ` : ''}${size * d}px ${FONT}`;
    ctx.textAlign = align;
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3 * d;
    ctx.strokeStyle = this.palette.bg;
    ctx.globalAlpha = 0.85;
    ctx.strokeText(text, x, y);
    ctx.globalAlpha = 1;
    ctx.fillStyle = colour;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  /**
   * The noise this battery's own set is looking into.
   *
   * White Noise is a whole watch about standoff jamming and not one pixel of
   * it was drawn: the detection model degraded the picture and the display
   * said nothing, so a hole on a bearing looked exactly like empty sky. The
   * strobe is computed from the same numbers `effectiveRangeKm` uses — main
   * lobe half-width, and a burn-through range that grows the further off the
   * jammer stands — so what is drawn is what the radar is suffering. The
   * jammer itself is not drawn: you see the noise, not the aeroplane.
   */
  jammingStrobes(world, radar) {
    if (!radar || radar.state !== 'radiating') return [];
    const type = AIR_TYPES.jammer;
    if (!type) return [];
    return world.aircraft
      .filter((a) => a.alive && a.type === 'jammer' && a.jamming)
      .map((a) => ({
        az: bearing(radar.pos, a.pos),
        halfWidthDeg: type.lobeHalfWidthDeg,
        burnThroughKm: type.burnThroughAt100Km * (dist(radar.pos, a.pos) / 100),
      }));
  }

  drawPlan(world, site, type, ui) {
    const { ctx } = this;
    const p = this.palette;
    const d = this.dpr;
    const scale = this.planScale();
    const centre = this.toScreen(site, site.pos);
    const radar = world.radarById.get(site.radarId);
    const reachOnDisplay = Math.min(this.w, this.planH) / 2;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, this.w, this.planH);
    ctx.clip();

    // Range rings. The numerals used to be stacked in one column on the 000°
    // radial — which on the first watch is precisely where the raid comes
    // from — so they are on the quiet north-west radial now, off the axis
    // everything else in this game is aimed along.
    ctx.strokeStyle = p.grid;
    ctx.lineWidth = 1;
    const step = type.maxRangeKm > 60 ? 20 : type.maxRangeKm > 25 ? 10 : 5;
    for (let r = step; r <= this.rangeKm; r += step) {
      ctx.beginPath();
      ctx.arc(centre.x, centre.y, r * scale, 0, TAU);
      ctx.stroke();
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
    for (let r = step; r <= this.rangeKm; r += step) {
      const h = headingVec(315);
      this.stamp(`${r}`, centre.x + h.x * r * scale + 3 * d,
        centre.y - h.y * r * scale + 3 * d, p.inkDim, { size: 8.5 });
    }

    /*
     * The bearing scale.
     *
     * There was none at all: no numerals, no cardinals, no north index — on a
     * display whose own panel prints the fire-control boresight as a bearing,
     * whose shootlist prints BRG per contact, and whose net cues the seat by
     * bearing ("TAKE T-007, BEARING 336"). Three sources of bearings and
     * nothing to read one off.
     */
    const ring = reachOnDisplay - 11 * d;
    ctx.strokeStyle = withAlpha(p.inkDim, 0.75);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(centre.x, centre.y, ring, 0, TAU);
    ctx.stroke();
    for (let a = 0; a < 360; a += 10) {
      const h = headingVec(a);
      const long = a % 30 === 0;
      const t0 = ring - (long ? 6 : 3) * d;
      ctx.beginPath();
      ctx.moveTo(centre.x + h.x * t0, centre.y - h.y * t0);
      ctx.lineTo(centre.x + h.x * ring, centre.y - h.y * ring);
      ctx.globalAlpha = long ? 0.9 : 0.45;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    for (let a = 0; a < 360; a += 30) {
      const h = headingVec(a);
      const rr = ring + 7 * d;
      const cardinal = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[a];
      this.stamp(cardinal ?? String(a).padStart(3, '0'),
        centre.x + h.x * rr, centre.y - h.y * rr + 3 * d,
        cardinal ? p.ink : p.inkDim, { size: cardinal ? 10 : 8.5, align: 'center',
          weight: cardinal ? 'bold' : '' });
    }
    ctx.textAlign = 'left';

    // The engagement envelope: the ring you have to get them inside.
    ctx.strokeStyle = withAlpha(p.accent, 0.55);
    ctx.setLineDash([5 * d, 4 * d]);
    ctx.beginPath();
    ctx.arc(centre.x, centre.y, type.maxRangeKm * scale, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = withAlpha(p.hostile, 0.4);
    ctx.beginPath();
    ctx.arc(centre.x, centre.y, type.minRangeKm * scale, 0, TAU);
    ctx.stroke();

    /*
     * Where you are and what you are standing in front of.
     *
     * The seat had no geography whatever: a circle of rings with the operator
     * at the middle of it and no way to tell which side of the display the
     * town was on, in a game whose whole subject is which places you cover.
     * The things this battery is defending are drawn at their true positions
     * with their names, dimmer than the traffic, because they do not move.
     */
    for (const asset of world.assets ?? []) {
      if (asset.destroyed) continue;
      const rangeKm = dist(site.pos, asset.pos);
      if (rangeKm > this.rangeKm) continue;
      const s = this.toScreen(site, asset.pos);
      ctx.save();
      ctx.globalAlpha = 0.65;
      ctx.strokeStyle = p.friendly;
      ctx.lineWidth = 1.2 * d;
      ctx.beginPath();
      ctx.rect(s.x - 3 * d, s.y - 3 * d, 6 * d, 6 * d);
      ctx.stroke();
      ctx.restore();
    }

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
      ctx.lineWidth = 1.5 * d;
      ctx.stroke();
    } else {
      this.stamp('SET DARK — NOTHING IS BEING PAINTED', 10 * d, this.planH - 10 * d,
        withAlpha(p.hostile, 0.85), { size: 12 });
    }

    // Noise strobes: the bearings this set cannot see through, and how far in
    // it can burn through them.
    const strobes = this.jammingStrobes(world, radar);
    for (const strobe of strobes) {
      const half = strobe.halfWidthDeg * Math.PI / 180;
      const a0 = (strobe.az - 90) * Math.PI / 180;
      const grad = ctx.createRadialGradient(centre.x, centre.y, 0,
        centre.x, centre.y, reachOnDisplay);
      grad.addColorStop(0, withAlpha(p.warn, 0.02));
      grad.addColorStop(1, withAlpha(p.warn, 0.3));
      ctx.beginPath();
      ctx.moveTo(centre.x, centre.y);
      ctx.arc(centre.x, centre.y, reachOnDisplay, a0 - half, a0 + half);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
      // Inside this arc the set still holds contacts; outside it, on this
      // bearing, it is deaf.
      const burn = Math.min(strobe.burnThroughKm, this.rangeKm) * scale;
      ctx.beginPath();
      ctx.arc(centre.x, centre.y, burn, a0 - half, a0 + half);
      ctx.strokeStyle = withAlpha(p.warn, 0.8);
      ctx.setLineDash([4 * d, 3 * d]);
      ctx.lineWidth = 1.3 * d;
      ctx.stroke();
      ctx.setLineDash([]);
      const h = headingVec(strobe.az);
      this.stamp('JAM', centre.x + h.x * (burn + 12 * d),
        centre.y - h.y * (burn + 12 * d), p.warn, { size: 9, align: 'center' });
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
      ctx.lineWidth = 1.2 * d;
      ctx.stroke();
      const bore = headingVec(fc.boresightDeg);
      ctx.beginPath();
      ctx.moveTo(centre.x, centre.y);
      ctx.lineTo(centre.x + bore.x * reach, centre.y - bore.y * reach);
      ctx.setLineDash([4 * d, 5 * d]);
      ctx.strokeStyle = withAlpha(p.accent, lit ? 0.5 : 0.25);
      ctx.stroke();
      ctx.setLineDash([]);
      // The boresight, printed on the bearing scale it is read against.
      const mark = headingVec(fc.boresightDeg);
      this.stamp('▲', centre.x + mark.x * (ring - 1 * d),
        centre.y - mark.y * (ring - 1 * d) + 3 * d, p.accent, { size: 8, align: 'center' });
    }

    // The battery itself: a launcher symbol rather than a dot, so it survives
    // being crossed by a grid line and a label.
    ctx.save();
    ctx.strokeStyle = p.friendly;
    ctx.fillStyle = p.bg;
    ctx.lineWidth = 1.8 * d;
    ctx.beginPath();
    ctx.arc(centre.x, centre.y, 6 * d, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(centre.x, centre.y - 4 * d);
    ctx.lineTo(centre.x + 3.5 * d, centre.y + 3 * d);
    ctx.lineTo(centre.x - 3.5 * d, centre.y + 3 * d);
    ctx.closePath();
    ctx.fillStyle = p.friendly;
    ctx.fill();
    ctx.restore();

    /*
     * The corner blocks.
     *
     * The plan is a circle in a 16:9 frame, so the two side corners are black
     * whatever is drawn — measured, 44% of the plan area. A shipped display
     * puts its data blocks there rather than leaving the glass empty: what
     * this station is and whether it is transmitting on the left, and the
     * contact the readouts are about, with a bearing, on the right. The
     * bearing matters: the net cues this seat by bearing and there was no
     * way to read one off the display it cues.
     */
    const focus = ui.selectedTrackId ? world.tracks.get(ui.selectedTrackId)
      : world.tracks.get(site.engagements[0]?.trackId);
    const blockL = [
      site.name,
      `${type.label}  ${site.readyRounds}/${site.magazine} RDS`,
      radar?.state === 'radiating' ? 'RADIATING' : radar?.state === 'warming' ? 'WARMING' : 'SILENT',
      `RANGE SCALE ${Math.round(this.rangeKm)} km`,
    ];
    const blockR = focus ? [
      `${focus.tn}  ${String(focus.hostility).toUpperCase()}`,
      `BRG ${String(Math.round(bearing(site.pos, focus.pos))).padStart(3, '0')}°`,
      `RNG ${Math.round(dist(site.pos, focus.pos))} km`,
      `ALT ${Math.round(focus.altM).toLocaleString('en-US')} m`,
    ] : ['NO CONTACT', 'DESIGNATED'];
    blockL.forEach((line, i) => this.stamp(line, 10 * d, (16 + i * 12) * d,
      i === 0 ? p.ink : p.inkDim, { size: i === 0 ? 10 : 9, weight: i === 0 ? 'bold' : '' }));
    blockR.forEach((line, i) => this.stamp(line, this.w - 10 * d, (16 + i * 12) * d,
      i === 0 ? (focus ? hostilityColour(p, focus) : p.inkDim) : p.inkDim,
      { size: i === 0 ? 10 : 9, align: 'right', weight: i === 0 ? 'bold' : '' }));

    // Labels go on last, over the grid, and out of each other's way.
    this.beginLabels();
    // The corner blocks are already on the glass; nothing may be written over
    // them, so they are the first two things the label layer knows about.
    this.labelBoxes.push({ x: 0, y: 0, w: 120 * d, h: 64 * d });
    this.labelBoxes.push({ x: this.w - 120 * d, y: 0, w: 120 * d, h: 64 * d });
    this.labelBoxes.push({ x: centre.x - 9 * d, y: centre.y - 9 * d, w: 18 * d, h: 18 * d });
    this.place(site.name, centre.x, centre.y, p.friendly, { prefer: 'SW', radius: 8, size: 9 });
    for (const asset of world.assets ?? []) {
      if (asset.destroyed) continue;
      if (dist(site.pos, asset.pos) > this.rangeKm) continue;
      const s = this.toScreen(site, asset.pos);
      this.place(asset.label ?? ASSET_TYPES[asset.type]?.label ?? asset.type,
        s.x, s.y, withAlpha(p.friendly, 0.8), { prefer: 'SE', radius: 6, size: 8 });
    }

    for (const track of this.localTracks(world)) {
      const rangeKm = dist(site.pos, track.pos);
      const colour = hostilityColour(p, track);
      const selected = ui.selectedTrackId === track.id;
      const env = inEnvelope(site, track.pos, track.altM);
      // Which channel, if any, this battery is holding it on — the operator's
      // own launcher, said on the picture as well as on the panel.
      const channelIndex = site.engagements.findIndex((e) => e.trackId === track.id);
      const engagement = channelIndex >= 0 ? site.engagements[channelIndex] : null;

      /*
       * The kill, in the cabin. The seat with the FIRE button in it had no
       * bloom, no cross, and no drop: a target you had just splashed kept
       * flying its symbol along its old velocity for five seconds, which is
       * the one moment this seat exists for, rendered as nothing.
       */
      if (track.destroyed) {
        const s = this.toScreen(site, track.pos);
        const age = clamp01((world.t - (track.destroyedAtS ?? world.t)) / 4.5);
        const bloom = 6 * d * (1.4 + age * 2.4);
        ctx.save();
        ctx.globalAlpha = 0.9 * (1 - age);
        ctx.strokeStyle = colour;
        ctx.lineWidth = 1.6 * d;
        ctx.beginPath();
        ctx.arc(s.x, s.y, bloom, 0, TAU);
        ctx.stroke();
        const arm = 5 * d;
        ctx.beginPath();
        ctx.moveTo(s.x - arm, s.y - arm); ctx.lineTo(s.x + arm, s.y + arm);
        ctx.moveTo(s.x - arm, s.y + arm); ctx.lineTo(s.x + arm, s.y - arm);
        ctx.stroke();
        ctx.restore();
        ctx.globalAlpha = 1 - age * 0.6;
        this.place(`${track.tn} ✕`, s.x, s.y, colour,
          { prefer: 'NE', radius: bloom + 2, size: 8.5 });
        ctx.globalAlpha = 1;
        continue;
      }

      // A cue you cannot reach yet still has to be findable, so contacts beyond
      // the display are pinned to the edge on their true bearing with the range
      // written next to them. That is what a cue over the net actually gives you:
      // a direction and a number, not a picture.
      if (rangeKm > this.rangeKm) {
        const az = bearing(site.pos, track.pos);
        const h = headingVec(az);
        const edge = reachOnDisplay - 26 * d;
        const ex = centre.x + h.x * edge;
        const ey = centre.y - h.y * edge;
        ctx.save();
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = colour;
        ctx.translate(ex, ey);
        ctx.rotate(az * Math.PI / 180);
        ctx.beginPath();
        ctx.moveTo(0, -6 * d);
        ctx.lineTo(4.5 * d, 4 * d);
        ctx.lineTo(-4.5 * d, 4 * d);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        this.place(`${track.tn} ${Math.round(rangeKm)}`, ex, ey, p.inkDim,
          { prefer: 'SW', radius: 8, size: 8.5 });
        continue;
      }

      const s = this.toScreen(site, track.pos);

      ctx.save();
      ctx.globalAlpha = track.cueOnly ? 0.55 : track.coasting ? 0.6 : 1;
      ctx.strokeStyle = colour;
      ctx.fillStyle = colour;
      ctx.lineWidth = (selected ? 2.4 : 1.4) * d;

      if (track.cueOnly) {
        // A cue you have not found yourself: bracketed, hollow, and untrustworthy.
        const r = 7 * d;
        ctx.setLineDash([2 * d, 3 * d]);
        ctx.beginPath();
        ctx.arc(s.x, s.y, r, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.beginPath();
        ctx.arc(s.x, s.y, 3 * d, 0, TAU);
        ctx.fill();
        const speed = len(track.vel);
        if (speed > 1e-4) {
          const lead = this.toScreen(site, {
            x: track.pos.x + track.vel.x * 60,
            y: track.pos.y + track.vel.y * 60,
          });
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(lead.x, lead.y);
          ctx.stroke();
        }
      }

      /*
       * Taken, and by which channel.
       *
       * A contact this battery is engaging looked exactly like one nobody had
       * touched. It wears the corner brackets every fire-control display puts
       * on a designated target, and the channel number sits inside them, so
       * the picture and the channel block name the same thing the same way.
       */
      if (engagement) {
        const b = 9 * d;
        ctx.save();
        ctx.strokeStyle = engagement.state === 'guiding' ? p.warn : p.inkBright;
        ctx.lineWidth = 1.6 * d;
        for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          ctx.beginPath();
          ctx.moveTo(s.x + sx * b, s.y + sy * b - sy * 3.5 * d);
          ctx.lineTo(s.x + sx * b, s.y + sy * b);
          ctx.lineTo(s.x + sx * b - sx * 3.5 * d, s.y + sy * b);
          ctx.stroke();
        }
        ctx.restore();
      }

      if (selected) {
        ctx.strokeStyle = p.inkBright;
        ctx.setLineDash([3 * d, 3 * d]);
        ctx.beginPath();
        ctx.arc(s.x, s.y, 13 * d, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();

      const tag = track.cueOnly ? `${track.tn} CUE`
        : engagement ? `${track.tn} · CH${channelIndex + 1}` : track.tn;
      this.place(tag, s.x, s.y, colour,
        { prefer: 'NE', radius: selected ? 15 : 9, size: 9, weight: selected ? 'bold' : '' });
      /*
       * The range goes on the contact the operator is working, and on no
       * other. Printed under every symbol it doubled the amount of text on
       * the glass, and inside twenty kilometres — where six contacts sit on
       * top of each other on the run in — the second line was what turned the
       * middle of the display into a smear. The figure is on the corner block,
       * on the channel rows and in the shootlist for everything else.
       */
      if (!track.cueOnly && selected) {
        this.place(`${Math.round(env.rangeKm)} km`, s.x, s.y, env.ok ? p.good : p.inkDim,
          { prefer: 'SE', radius: 15, size: 8.5 });
      }
    }

    // Rounds in flight, ours and theirs.
    for (const missile of world.missiles) {
      if (!missile.alive || missile.tofS < 0) continue;
      const relevant = missile.siteId === site.id
        || (missile.kind === 'arm' && world.radarsOf(site).some((r) => r.id === missile.targetId));
      if (!relevant) continue;
      const s = this.toScreen(site, missile.pos);
      ctx.fillStyle = missile.kind === 'arm' ? p.hostile : p.accent;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 2.6 * d, 0, TAU);
      ctx.fill();
      if (missile.kind === 'arm') {
        const pulse = 0.5 + 0.5 * Math.sin(world.t * 7);
        ctx.strokeStyle = withAlpha(p.hostile, 0.4 + pulse * 0.5);
        ctx.lineWidth = 1.4 * d;
        ctx.beginPath();
        ctx.arc(s.x, s.y, (6 + pulse * 5) * d, 0, TAU);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /**
   * Range-height indicator.
   *
   * Horizontal axis is ground range from the battery, vertical is altitude.
   * The radar horizon is a curve rising from the origin: a contact below it
   * does not exist as far as this radar is concerned, and watching a low
   * contact climb out from under it — already inside your minimum range —
   * teaches the lesson faster than any briefing.
   *
   * What it did NOT show was anything the operator had done about it. The
   * plan view above drew kills, drew rounds in flight and drew the envelope
   * as a shaped region; the range-height half below drew none of the three.
   * A track the top half had just crossed out went on being plotted here as a
   * live contact for five seconds, the round the LAUNCH cap had spent was
   * invisible for its whole thirty-second flight on the one instrument built
   * to show the intercept closing in the vertical, and the envelope was a
   * plain rectangle where a missile envelope is a lens.
   */
  drawHeightFinder(world, site, type, ui) {
    const { ctx } = this;
    const p = this.palette;
    const d = this.dpr;
    const top = this.planH;
    const height = this.h - top;
    // The bottom gutter is the axis's own. The kilometre numerals used to be
    // written at h - 6, i.e. in the last six pixels of the canvas, where the
    // tube's instruction line and the command net's banner are also drawn.
    const pad = { l: 42 * d, r: 12 * d, t: 15 * d, b: 26 * d };
    const plotW = this.w - pad.l - pad.r;
    const plotH = height - pad.t - pad.b;
    const maxRangeKm = this.rangeKm;
    const radar = world.radarById.get(site.radarId);

    /*
     * The altitude scale follows the traffic, not the catalogue.
     *
     * Pinned to the weapon's ceiling it put every contact on the weasel watch
     * into a band at the bottom of the plot with the top 55% of the
     * instrument permanently empty. It reaches whatever is actually up there
     * — or the top of the envelope, whichever is higher — rounded to a whole
     * number of gridlines so the labels stay round.
     */
    let traffic = 0;
    for (const track of this.localTracks(world)) {
      if (track.cueOnly) continue;
      if (dist(site.pos, track.pos) <= maxRangeKm) traffic = Math.max(traffic, track.altM);
    }
    const gridM = type.maxAltM > 14000 ? 5000 : type.maxAltM > 4000 ? 2000 : 1000;
    // The whole envelope, and whatever is flying above it: an instrument that
    // cannot show the ceiling cannot answer "is it above us", which is one of
    // the two questions the seat asks all night.
    const maxAltM = Math.ceil(Math.max(type.maxAltM, traffic) * 1.1 / gridM) * gridM;
    const ceilingOnScale = type.maxAltM <= maxAltM;

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

    this.stamp('RANGE / HEIGHT', pad.l, top + 11 * d, p.inkDim, { size: 9 });

    // Axes.
    ctx.strokeStyle = p.grid;
    ctx.lineWidth = 1;
    const kmStep = type.maxRangeKm > 60 ? 20 : 10;
    for (let km = 0; km <= maxRangeKm; km += kmStep) {
      ctx.beginPath();
      ctx.moveTo(rx(km), top + pad.t);
      ctx.lineTo(rx(km), top + pad.t + plotH);
      ctx.stroke();
    }
    for (let alt = 0; alt <= maxAltM; alt += gridM) {
      ctx.beginPath();
      ctx.moveTo(pad.l, ry(alt));
      ctx.lineTo(this.w - pad.r, ry(alt));
      ctx.stroke();
      this.stamp(`${Math.round(alt / 1000)}k`, 6 * d, ry(alt) + 3 * d, p.inkDim, { size: 9 });
    }

    /*
     * The engagement envelope as the lens it is: a wall at minimum range, a
     * ceiling that falls away with distance, and a floor that rises. Drawn as
     * a rectangle it claimed shots at maximum range and maximum altitude at
     * once, which is not a thing this or any battery can do — and the plan
     * view directly above drew the same envelope correctly as a tapering
     * region, so the two halves of one instrument disagreed about the weapon.
     */
    ctx.save();
    ctx.beginPath();
    const lens = [];
    const steps = 24;
    for (let i = 0; i <= steps; i += 1) {
      const f = i / steps;
      const km = type.minRangeKm + f * (type.maxRangeKm - type.minRangeKm);
      // Ceiling: full at the first third, easing down to two thirds at the rim.
      const ceil = type.maxAltM * (1 - 0.55 * Math.pow(Math.max(0, f - 0.35) / 0.65, 1.7));
      lens.push([rx(km), ry(Math.min(ceil, maxAltM))]);
    }
    for (let i = steps; i >= 0; i -= 1) {
      const f = i / steps;
      const km = type.minRangeKm + f * (type.maxRangeKm - type.minRangeKm);
      // Floor: the horizon and the guidance both climb with range.
      const floor = type.minAltM + (type.maxAltM * 0.06) * Math.pow(f, 2.2);
      lens.push([rx(km), ry(floor)]);
    }
    ctx.moveTo(lens[0][0], lens[0][1]);
    for (const [x, y] of lens.slice(1)) ctx.lineTo(x, y);
    ctx.closePath();
    ctx.fillStyle = withAlpha(p.accent, 0.1);
    ctx.fill();
    ctx.strokeStyle = withAlpha(p.accent, 0.55);
    ctx.lineWidth = 1.2 * d;
    ctx.stroke();
    ctx.restore();
    this.stamp(ceilingOnScale ? 'ENGAGEMENT ENVELOPE'
      : `ENGAGEMENT ENVELOPE — CEILING ${type.maxAltM.toLocaleString('en-US')} m ABOVE SCALE`,
    rx((type.minRangeKm + type.maxRangeKm) / 2),
    ry(Math.min(type.maxAltM, maxAltM)) + (ceilingOnScale ? -5 * d : 11 * d),
    withAlpha(p.accent, 0.75), { size: 8, align: 'center' });

    // The horizon: below this line, the radar is looking at the ground. The
    // ground itself is hatched, so "under the curve" reads as terrain rather
    // than as empty plot.
    if (radar) {
      const curve = [];
      for (let km = 0; km <= maxRangeKm; km += 1) {
        // Invert the horizon formula for the lowest visible altitude at this range.
        const root = km / 4.12 - Math.sqrt(radar.heightM);
        const altM = root <= 0 ? 0 : root * root;
        curve.push([rx(km), ry(Math.min(altM, maxAltM))]);
        if (altM > maxAltM) break;
      }
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(curve[0][0], top + pad.t + plotH);
      for (const [x, y] of curve) ctx.lineTo(x, y);
      ctx.lineTo(curve[curve.length - 1][0], top + pad.t + plotH);
      ctx.closePath();
      ctx.fillStyle = withAlpha(p.hostile, 0.09);
      ctx.fill();
      ctx.clip();
      ctx.strokeStyle = withAlpha(p.hostile, 0.22);
      ctx.lineWidth = 1;
      for (let x = pad.l - plotH; x < this.w; x += 9 * d) {
        ctx.beginPath();
        ctx.moveTo(x, top + pad.t + plotH);
        ctx.lineTo(x + plotH, top + pad.t);
        ctx.stroke();
      }
      ctx.restore();
      ctx.beginPath();
      let started = false;
      for (const [x, y] of curve) {
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = withAlpha(p.hostile, 0.8);
      ctx.lineWidth = 1.4 * d;
      ctx.stroke();
      const last = curve[curve.length - 1];
      this.stamp('RADAR HORIZON — NOTHING UNDER IT IS SEEN',
        Math.min(last[0], this.w - pad.r) - 4 * d, last[1] - 7 * d,
        withAlpha(p.hostile, 0.8), { size: 8.5, align: 'right' });
    }

    this.beginLabels();
    let offScale = 0;
    for (const track of this.localTracks(world)) {
      if (track.cueOnly) continue;
      const rangeKm = dist(site.pos, track.pos);
      if (rangeKm > maxRangeKm) { offScale++; continue; }
      const x = rx(rangeKm);
      const y = ry(Math.min(track.altM, maxAltM));
      const colour = hostilityColour(p, track);

      // A splashed contact is splashed on both halves of the instrument, at
      // the same instant and with the same decay.
      if (track.destroyed) {
        const age = clamp01((world.t - (track.destroyedAtS ?? world.t)) / 4.5);
        ctx.save();
        ctx.globalAlpha = 0.9 * (1 - age);
        ctx.strokeStyle = colour;
        ctx.lineWidth = 1.5 * d;
        const arm = 4.5 * d;
        ctx.beginPath();
        ctx.moveTo(x - arm, y - arm); ctx.lineTo(x + arm, y + arm);
        ctx.moveTo(x - arm, y + arm); ctx.lineTo(x + arm, y - arm);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, (5 + age * 7) * d, 0, TAU);
        ctx.stroke();
        ctx.restore();
        continue;
      }

      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.arc(x, y, 3 * d, 0, TAU);
      ctx.fill();
      if (ui.selectedTrackId === track.id) {
        ctx.strokeStyle = p.inkBright;
        ctx.lineWidth = 1.4 * d;
        ctx.beginPath();
        ctx.arc(x, y, 8 * d, 0, TAU);
        ctx.stroke();
      }
      this.place(`${track.tn} ${Math.round(track.altM).toLocaleString('en-US')}m`,
        x, y, colour, { prefer: 'NE', radius: 7, size: 8.5 });
    }

    /*
     * The rounds, on the instrument that shows whether they are climbing to
     * meet anything. Ours in the accent colour with a line to the target's
     * plot, so the closing geometry is legible; an anti-radiation round
     * descending on this position in the hostile colour, with its own pulse.
     */
    for (const missile of world.missiles) {
      if (!missile.alive || missile.tofS < 0) continue;
      const arm = missile.kind === 'arm'
        && world.radarsOf(site).some((r) => r.id === missile.targetId);
      if (missile.siteId !== site.id && !arm) continue;
      const km = dist(site.pos, missile.pos);
      if (km > maxRangeKm) continue;
      const x = rx(km);
      const y = ry(Math.min(missile.altM ?? 0, maxAltM));
      const colour = arm ? p.hostile : p.accent;
      if (!arm) {
        const target = world.aircraftById.get(missile.targetId);
        if (target?.alive) {
          const tkm = dist(site.pos, target.pos);
          if (tkm <= maxRangeKm) {
            ctx.save();
            ctx.strokeStyle = withAlpha(colour, 0.4);
            ctx.setLineDash([3 * d, 3 * d]);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(rx(tkm), ry(Math.min(target.altM, maxAltM)));
            ctx.stroke();
            ctx.restore();
          }
        }
      }
      ctx.save();
      ctx.fillStyle = colour;
      ctx.translate(x, y);
      ctx.beginPath();
      ctx.moveTo(0, -4 * d);
      ctx.lineTo(2.4 * d, 3 * d);
      ctx.lineTo(-2.4 * d, 3 * d);
      ctx.closePath();
      ctx.fill();
      if (arm) {
        const pulse = 0.5 + 0.5 * Math.sin(world.t * 7);
        ctx.strokeStyle = withAlpha(p.hostile, 0.35 + pulse * 0.5);
        ctx.lineWidth = 1.3 * d;
        ctx.beginPath();
        ctx.arc(0, 0, (6 + pulse * 4) * d, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    }

    // The kilometre scale, in its own gutter under the plot.
    ctx.save();
    for (let km = 0; km <= maxRangeKm; km += kmStep) {
      this.stamp(`${km}`, rx(km), top + pad.t + plotH + 13 * d, p.inkDim,
        { size: 9, align: 'center' });
    }
    this.stamp('km', this.w - pad.r + 2 * d, top + pad.t + plotH + 13 * d, p.inkDim,
      { size: 8.5, align: 'right' });
    ctx.restore();

    // Contacts beyond the plot get a chevron on the edge rather than vanishing:
    // "there is something out there, it is just not your problem yet".
    if (offScale) {
      this.stamp(`${offScale} BEYOND ▸`, this.w - 12 * d, top + 11 * d, p.inkDim,
        { size: 9, align: 'right' });
    }

    ctx.restore();
  }
}

/**
 * The battery's fire-control channels, one entry per channel, occupied or not.
 *
 * The cabin's entire statement about its channels used to be the fraction
 * `3/4`, computed for a panel whose every other row described the ONE track
 * the player had last clicked. So a battery could be guiding three rounds
 * while its own console read TARGET —, SEQUENCE STANDBY and both guidance
 * lamps dark, with the engagements visible nowhere: not nameable, not
 * prioritisable, not breakable. The seat exists to work the channels, so the
 * channels are the readout, and an empty one is a row that says FREE rather
 * than a row that is not drawn.
 *
 * Always `type.channels` long, so the block is the same height all watch and
 * nothing below it moves when a channel opens.
 */
export function channelStatus(world, site) {
  if (!site) return [];
  const type = SAM_TYPES[site.type];
  const out = [];
  for (let i = 0; i < type.channels; i += 1) {
    const engagement = site.engagements[i];
    if (!engagement) { out.push({ channel: i + 1, free: true }); continue; }
    const track = world.tracks.get(engagement.trackId);
    const env = track ? inEnvelope(site, track.pos, track.altM) : null;
    let etaS = null;
    for (const id of engagement.missileIds ?? []) {
      const missile = world.missiles.find((m) => m.id === id && m.alive);
      if (!missile) continue;
      const target = world.aircraftById.get(missile.targetId);
      if (!target?.alive || !missile.speed) continue;
      const eta = dist(missile.pos, target.pos) / missile.speed;
      if (etaS === null || eta < etaS) etaS = eta;
    }
    out.push({
      channel: i + 1,
      free: false,
      trackId: engagement.trackId,
      tn: track?.tn ?? engagement.trackId,
      /*
       * The four words a channel can be in, in the crew's language rather
       * than the engine's: the crew is bringing the set round (REACTING), the
       * solution stands and the cap is live (READY), the crew is deliberately
       * letting the target close (HOLDING), or a round is in the air
       * (GUIDING). `holding` is a flag on a ready engagement, so it is tested
       * first or it never shows.
       */
      state: engagement.holding && engagement.state === 'ready' ? 'HOLDING'
        : { reacting: 'REACTING', ready: 'READY', guiding: 'GUIDING' }[engagement.state] ?? 'IDLE',
      roundsUp: engagement.missileIds?.length ?? 0,
      /** Seconds of crew reaction still to run before the channel is ready. */
      timerS: engagement.state === 'reacting' ? Math.max(0, engagement.timerS) : 0,
      etaS,
      rangeKm: env?.rangeKm ?? null,
      inEnvelope: env?.ok ?? false,
      lost: !track,
    });
  }
  return out;
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
    /*
     * Whether this battery is guiding, which is a question about an
     * engagement and was being answered from the transmitter.
     *
     * The old test was `radar is radiating && the arc is on target`, which
     * never asked whether there was anything to guide: on a battery whose set
     * turns through the full circle the GUIDING lamp lit green the moment the
     * antenna warmed, with the rails full, nothing selected and no channel
     * open — and on a battalion with a sectored fire-control set the SAME
     * state lit NO GUIDANCE instead, because an arc cannot be on a target
     * that does not exist. Two batteries, one situation, opposite lamps, and
     * neither of them true. With no channel open, neither lamp lights.
     */
    guidance: !engagement ? 'NO CHANNEL'
      : radar?.state === 'radiating' && (fc === null || fc.onTarget)
        ? 'GUIDING' : 'NO GUIDANCE',
    radarState: radar?.state ?? 'off',
    exposure: radar?.exposure ?? 0,
    channelsUsed: site.engagements.length,
    channels: type.channels,
  };
}
