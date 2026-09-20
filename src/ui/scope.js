/**
 * The plan position indicator: the picture the whole game is played on.
 *
 * Rendering is two-layered on purpose. A persistent "paint" canvas holds the
 * radar returns and fades a little every frame, which is what gives the cathode
 * themes their afterglow — fresh paint under the sweep, older paint dimming
 * behind it, exactly the way a real tube behaves and exactly the reason a scope
 * feels alive. Vector symbology (tracks, sites, rounds) is drawn crisply on top
 * every frame, because a symbol that smeared would be unreadable.
 *
 * The modern theme sets afterglow to zero and gets a clean redraw instead.
 */

import { THEMES, readPalette, hostilityColour } from './themes.js';
import { Lettering, withAlpha } from './labels.js';
import { watchConditions } from '../engine/scenarios.js';
import { MAP } from '../engine/geography.js';
import { SAM_TYPES, ASSET_TYPES, AIR_TYPES } from '../engine/config.js';
import { bearing, headingVec, len, clamp01 } from '../engine/math.js';
import { trackProfile } from '../engine/detection.js';

const TAU = Math.PI * 2;

export class Scope extends Lettering {
  constructor(canvas) {
    super();
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.paint = document.createElement('canvas');
    this.paintCtx = this.paint.getContext('2d');
    this.dpr = 1;
    this.w = 0;
    this.h = 0;
    this.rangeKm = 150;
    /** The widest position the watch's own range switch has. See `zoom`. */
    this.maxRangeKm = 260;
    this.centre = { x: 0, y: 0 };
    /** Where the range rings and bearing spokes are struck from. */
    this.origin = { x: 0, y: 0 };
    this.theme = THEMES['crt-green'];
    this.palette = null;
    this.lastSweepAz = new Map();
    this.setTheme('crt-green');
  }

  setTheme(themeId) {
    this.theme = THEMES[themeId] ?? THEMES['crt-green'];
    this.palette = readPalette();
    this.clearPaint();
  }

  clearPaint() {
    if (!this.palette || !this.paint.width) return;
    this.paintCtx.clearRect(0, 0, this.paint.width, this.paint.height);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (w === this.canvas.width && h === this.canvas.height) return;
    this.canvas.width = w;
    this.canvas.height = h;
    this.paint.width = w;
    this.paint.height = h;
    this.dpr = dpr;
    this.w = w;
    this.h = h;
    this.clearPaint();
  }

  /** Pixels per kilometre, sized so `rangeKm` fits the smaller half-dimension. */
  get scale() {
    return Math.min(this.w, this.h) / 2 / this.rangeKm;
  }

  toScreen(pos) {
    const s = this.scale;
    return {
      x: this.w / 2 + (pos.x - this.centre.x) * s,
      y: this.h / 2 - (pos.y - this.centre.y) * s,
    };
  }

  /** Screen point (CSS pixels) back to world kilometres. */
  toWorld(px, py) {
    const s = this.scale;
    return {
      x: this.centre.x + (px * this.dpr - this.w / 2) / s,
      y: this.centre.y - (py * this.dpr - this.h / 2) / s,
    };
  }

  /**
   * The wheel's continuous zoom, stopped at the ends of the switch's travel.
   *
   * The ceiling used to be a flat 260 km, which is under two of the scales the
   * game actually opens on. On The Two Cities the tube starts at 300, so one
   * turn of the wheel outward clamped it to 260 and 300 was gone — on a watch
   * whose batteries outreach the picture. The ceiling is now the widest detent
   * the watch's own selector has, set with the rest of the framing when the
   * watch opens.
   */
  zoom(factor) {
    this.rangeKm = Math.max(15, Math.min(this.maxRangeKm ?? 260, this.rangeKm * factor));
  }

  /**
   * Queue a label instead of drawing it immediately.
   *
   * Six batteries, six defended assets and two radars sit inside twenty
   * kilometres of the town, so at sector zoom their names land on top of each
   * other and the map becomes unreadable. Labels are therefore collected,
   * sorted by how much the operator needs them, and placed at the end of the
   * frame over a picture that is finished.
   *
   * `offset` is the first ring's radius in CSS pixels. It used to be
   * multiplied by the device ratio inside the placer while three of the six
   * callers had already multiplied it themselves, so on a two-times display
   * those three labels stood off their marks by four times what they asked
   * for. Every caller states it once, unmultiplied.
   */
  queueLabel(spec) {
    this.labelQueue.push(spec);
  }

  /**
   * Place the frame's labels, most important first.
   *
   * This was the game's second label engine and its worse one. It tried four
   * corners against other LABELS only — nothing reserved a blip, a triangle, a
   * defended place or a range numeral — and when all four were taken it simply
   * dropped the label. Measured on the tree this replaces, over twelve
   * consecutive frames: 39% of the board's names deleted at the commander's
   * seat on The Two Cities, 48% at the district on Four Sectors, 60% on a
   * phone. Among the casualties, every frame: PRESIDENTIAL PALACE, THE VILLE,
   * FORWARD POST, CAPITAL SECTOR — a formation the player personally directs —
   * and LOW LOOK, the only surveillance radar still alive on that watch. No
   * mark, no dimming, no count.
   *
   * It is now the cabin's engine, which every mark on this tube reserves its
   * extent with first, and which prints anyway when every corner is taken,
   * because a missing track number is worse than a tight one. Only a place
   * name may still give way: geography is `optional` and yields to anything
   * flying.
   */
  flushLabels() {
    this.beginLabels();
    this.labelQueue.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    for (const label of this.labelQueue) {
      this.place(label.lines ?? [label.text], label.x, label.y, label.colour, {
        size: label.size ?? 9.5,
        radius: label.offset ?? 6,
        colours: label.colours,
        optional: label.optional === true,
        key: label.key ?? null,
      });
    }
    this.labelQueue = [];
  }

  /** What is under the cursor? Tracks win over hardware — you click them more. */
  pick(px, py, world) {
    const p = { x: px * this.dpr, y: py * this.dpr };
    const hitPx = 18 * this.dpr;
    let best = null;
    let bestDist = hitPx;

    const consider = (kind, id, worldPos) => {
      const s = this.toScreen(worldPos);
      const d = Math.hypot(s.x - p.x, s.y - p.y);
      if (d < bestDist) { bestDist = d; best = { kind, id }; }
    };

    /*
     * THE CARET ON THE RIM IS THE CONTACT.
     *
     * A contact outside the picture is drawn as a caret at the edge with its
     * number and its range beside it, and the caret was scenery: `pick` tested
     * every track at its TRUE screen position, which for an off-scale contact
     * is somewhere past the bezel, so clicking the mark that says "it is out
     * there, that way" selected nothing, opened nothing and could not be
     * handed to a battery. On a battalion watch whose batteries outreach the
     * default scale that is most of the raid. The carets are hit-tested first,
     * from the positions they were actually drawn at last frame, because a
     * mark you can see is a mark you should be able to press.
     */
    for (const hit of this.edgeHits ?? []) {
      const d = Math.hypot(hit.x - p.x, hit.y - p.y);
      if (d < bestDist) { bestDist = d; best = { kind: 'track', id: hit.id }; }
    }
    if (best) return best;

    for (const track of world.tracks.values()) consider('track', track.id, track.pos);
    if (best) return best;
    for (const site of world.sites) consider('site', site.id, site.pos);
    for (const radar of world.radars) if (!radar.siteId) consider('radar', radar.id, radar.pos);
    for (const asset of world.assets) consider('asset', asset.id, asset.pos);
    return best;
  }

  /* ----------------------------------------------------------- rendering */

  render(world, ui = {}, frameDtS = 1 / 60) {
    this.resize();
    if (!this.w) return;
    const { ctx } = this;
    const p = this.palette;

    ctx.save();
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, this.w, this.h);
    this.labelQueue = [];
    // Nothing is reserved across frames: the picture is redrawn from scratch.
    this.reserved = [];

    this.updatePaint(world, frameDtS, ui);
    // Drawn before the grid so the country sits under everything, but its
    // labels are queued and placed with the rest at the end of the frame.
    if (ui.showMap !== false) this.drawMap(world);
    this.drawGrid(world);

    // The beam itself is redrawn every frame rather than painted into the
    // persistence layer: it is a live affordance, and accumulating it would
    // saturate the tube within seconds.
    for (const radar of world.radars) {
      if (radar.state === 'radiating') this.drawSweep(ctx, radar);
    }

    // Composite the phosphor layer (returns only) under the crisp symbology.
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(this.paint, 0, 0);
    ctx.globalCompositeOperation = 'source-over';

    this.drawDeadSectors(world);
    this.drawFireControlArcs(world);
    this.drawFormations(world);
    this.drawAssets(world, ui);
    this.drawSites(world, ui);
    this.drawStandaloneRadars(world, ui);
    this.drawMissiles(world);
    this.drawTracks(world, ui);
    this.drawAssignmentDrag(world, ui);
    this.drawEnvelope(world, ui);
    /*
     * The corner readouts go on BEFORE the lettering, not after it.
     *
     * Drawn last they were painted over whatever the placer had just fitted
     * into the top-left corner — which on a phone is where the range rings and
     * the first two or three track blocks live, and is the whole of the bugs
     * critic's `scope-legends-overprint-range-rings-on-a-phone`. Stamped
     * first, they reserve their own boxes and the placer treats them as the
     * furniture they are.
     */
    this.drawChrome(world, ui);
    this.flushLabels();

    if (this.theme.scanlines) this.drawScanlines();
    if (this.theme.vignette) this.drawVignette();
    ctx.restore();
  }

  /**
   * The persistence layer: fade what was there, then lay down this tick's
   * returns and the sweep. Plots are the only thing that paints, which is the
   * honest behaviour — the scope shows echoes, and everything else is a symbol
   * the system drew for you.
   */
  updatePaint(world, frameDtS = 1 / 60, ui = {}) {
    const ctx = this.paintCtx;
    const p = this.palette;
    const glow = this.theme.afterglow;

    if (glow <= 0) {
      ctx.clearRect(0, 0, this.w, this.h);
    } else {
      // The afterglow constants are tuned as per-frame retention at 60Hz, so
      // the fade is scaled to the real frame time: phosphor decays with the
      // clock, not with the display's refresh rate. Unscaled, the persistence
      // differed some fifty-fold between a 30Hz laptop and a 144Hz monitor.
      const retained = Math.pow(glow, Math.max(0.2, frameDtS * 60));
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = `rgba(0,0,0,${1 - retained})`;
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.globalCompositeOperation = 'source-over';
    }

    /*
     * Every echo of every simulation step this frame, when the frame ran more
     * than one; the world's own last step otherwise. See the frame loop.
     *
     * A RETURN IS A SMEAR ALONG THE BEAM, NOT A DOT.
     *
     * The graphics critic: "the one place the paint layer does show is a soft
     * round green smear behind each contact, which is a Gaussian blob, not a
     * beam-smeared return." It was `ctx.arc(x, y, r, 0, TAU)` — a circle, the
     * same shape whatever set painted it and from wherever. An antenna has a
     * beam of some width and a pulse of some length, so what it lays on the
     * tube is an arc struck from the set that painted it: short in range,
     * spread in bearing by the beam, and brighter along the edge the beam is
     * moving towards, which is where the paint is newest. Two hundred
     * kilometres out that is a visible streak, and close in it is almost a
     * point — which is the whole reason a plot at range is called a smudge.
     */
    const beamHalfRad = (2.4 / 2) * Math.PI / 180;
    for (const plot of ui.framePlots ?? world.plots ?? []) {
      const s = this.toScreen(plot.pos);
      const alpha = 0.55 + 0.45 * clamp01(plot.strength ?? 0.5);
      const radar = world.radarById?.get(plot.radarId);
      ctx.fillStyle = p.accent;
      ctx.strokeStyle = p.accent;
      ctx.globalAlpha = alpha;
      if (radar) {
        const o = this.toScreen(radar.pos);
        const rPx = Math.hypot(s.x - o.x, s.y - o.y);
        const a = Math.atan2(s.y - o.y, s.x - o.x);
        // Half the beam, on the glass, never narrower than the pulse is long.
        const half = Math.max((2.2 * this.dpr) / Math.max(rPx, 1), beamHalfRad);
        ctx.lineCap = 'round';
        // The body of the return, across the whole beam.
        ctx.lineWidth = Math.max(2, 3.4 * this.dpr);
        ctx.globalAlpha = alpha * 0.5;
        ctx.beginPath();
        ctx.arc(o.x, o.y, rPx, a - half, a + half);
        ctx.stroke();
        // And its leading edge, which is the freshest paint on the tube. The
        // beam turns with increasing bearing, which on the glass is clockwise.
        ctx.globalAlpha = alpha;
        ctx.lineWidth = Math.max(2, 2.6 * this.dpr);
        ctx.beginPath();
        ctx.arc(o.x, o.y, rPx, a + half * 0.25, a + half);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(s.x, s.y, Math.max(1.6, 3.2 * this.dpr), 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  /** The rotating beam, with a decaying tail behind it. */
  drawSweep(ctx, radar) {
    const origin = this.toScreen(radar.pos);
    const reach = radar.rangeKm * this.scale;
    const az = radar.az;
    const tail = this.theme.sweepTailDeg;
    const p = this.palette;

    const start = (az - tail - 90) * Math.PI / 180;
    const end = (az - 90) * Math.PI / 180;
    const gradient = ctx.createRadialGradient(origin.x, origin.y, 0, origin.x, origin.y, reach);
    // Kept deliberately faint: a sector can have four or five sets up at once
    // and the wedges stack, so anything heavier drowns the contacts underneath.
    gradient.addColorStop(0, withAlpha(p.accent, 0.11));
    gradient.addColorStop(0.7, withAlpha(p.accent, 0.03));
    gradient.addColorStop(1, withAlpha(p.accent, 0.01));

    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.arc(origin.x, origin.y, reach, start, end);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // The leading edge is the bright part; that is where new paint appears.
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    const h = headingVec(az);
    ctx.lineTo(origin.x + h.x * reach, origin.y - h.y * reach);
    ctx.strokeStyle = withAlpha(p.accent, 0.45);
    ctx.lineWidth = 1.4 * this.dpr;
    ctx.stroke();
  }

  /**
   * The country, under the picture.
   *
   * An operator does not read a plan position indicator in the abstract — they
   * read it against ground they know. Having the Mordava, the Kubin ridge and
   * the trunk road underneath turns "a contact at 285 for 90" into "something
   * coming down the valley", which is the way the job is actually done, and
   * makes the river line the directives keep referring to an actual line.
   *
   * Drawn dim on purpose. If it ever competes with a track symbol it is wrong.
   */
  drawMap(world) {
    const { ctx } = this;
    const p = this.palette;
    const s = this.scale;
    /*
     * "No leakers past the river line." The order names a feature on the map,
     * so the map says which one from the moment you acknowledge it: red, and
     * red for the rest of the watch. It flashes for the first ten seconds,
     * once a second, and then holds — an order about a line you must not let
     * anything cross should be visible on the line, not only in the ticker.
     */
    const riverAtS = world?.command?.constraints?.riverLineAtS ?? null;
    const sinceRiver = riverAtS === null ? Infinity : world.t - riverAtS;
    const riverMarked = Number.isFinite(sinceRiver);
    const riverFlashing = sinceRiver < 10 && Math.floor(sinceRiver * 2) % 2 === 0;
    const path = (points, close = false) => {
      ctx.beginPath();
      points.forEach((point, i) => {
        const q = this.toScreen(point);
        if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
      });
      if (close) ctx.closePath();
    };

    ctx.save();

    /*
     * THE CHART IS SCRIBED ON THE FACEPLATE, IN ONE WAX.
     *
     * The graphics critic: "place names and terrain shapes are drawn in
     * desaturated grey and grey-blue on a green phosphor. A CRT cannot show
     * grey. Map furniture on a real PPI is either scribed on the faceplate or
     * projected, and either way it is a different physical layer with its own
     * single colour." It was `inkDim` for the ridges and the roads and
     * `friendly` — a pale blue — for the water, which is two impossible
     * colours and, worse, the same substance as the data. Everything that is
     * geography is now the one warm wax (`--chart`), and nothing that is
     * geography glows. What stays coloured is an ORDER drawn on the chart —
     * the river line when sector command has named it — because that is not
     * geography, it is the thing you must not let anything cross.
     */
    const wax = p.chart;

    // High ground: filled, with a lighter crest line so ridges read as ridges.
    for (const range of MAP.highGround) {
      path(range.points, true);
      ctx.fillStyle = withAlpha(wax, 0.05);
      ctx.fill();
      ctx.strokeStyle = withAlpha(wax, 0.2);
      ctx.lineWidth = 1 * this.dpr;
      ctx.stroke();
    }

    for (const lake of MAP.lakes) {
      path(lake.points, true);
      ctx.fillStyle = withAlpha(wax, 0.07);
      ctx.fill();
      ctx.strokeStyle = withAlpha(wax, 0.22);
      ctx.stroke();
    }

    for (const river of MAP.rivers) {
      path(river.points);
      ctx.strokeStyle = riverMarked
        ? withAlpha(p.hostile, riverFlashing ? 0.85 : 0.45)
        : withAlpha(wax, 0.2);
      ctx.lineWidth = (riverMarked ? (riverFlashing ? 2.4 : 1.8) : 1.2) * this.dpr;
      ctx.stroke();
    }

    ctx.setLineDash([6 * this.dpr, 5 * this.dpr]);
    for (const road of MAP.roads) {
      path(road.points);
      ctx.strokeStyle = withAlpha(wax, 0.26);
      ctx.lineWidth = 1.1 * this.dpr;
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // The frontier. Everything that has happened to this sector came over it.
    path(MAP.frontier);
    ctx.setLineDash([10 * this.dpr, 4 * this.dpr, 2 * this.dpr, 4 * this.dpr]);
    ctx.strokeStyle = withAlpha(p.hostile, 0.32);
    ctx.lineWidth = 1.5 * this.dpr;
    ctx.stroke();

    // The Listonian border. A different kind of line: nothing comes over it, and
    // on one watch that is exactly the problem.
    path(MAP.border);
    ctx.strokeStyle = withAlpha(wax, 0.34);
    ctx.stroke();
    ctx.setLineDash([]);

    // Place names go through the same declutter pass as everything else, at the
    // lowest priority on the board: geography gives way to anything flying.
    if (s > 1.1) {
      for (const town of MAP.settlements) {
        const q = this.toScreen(town.pos);
        ctx.fillStyle = withAlpha(wax, town.capital ? 0.5 : 0.34);
        ctx.beginPath();
        ctx.arc(q.x, q.y, (town.capital ? 3 : 2) * this.dpr, 0, TAU);
        ctx.fill();
        this.reserve(q.x - 3 * this.dpr, q.y - 3 * this.dpr, 6 * this.dpr, 6 * this.dpr);
        this.queueLabel({
          // One name, in English. Every town used to be lettered twice —
          // the Cyrillic over the English — which doubled the text on the
          // tube for no one's benefit; the player asked for the Cyrillic to
          // be scaled back to the plates, and a map label is not a plate.
          text: town.en,
          colour: withAlpha(wax, town.capital ? 0.62 : 0.44),
          x: q.x, y: q.y,
          priority: town.capital ? 8 : 4,
          offset: 5,
          key: `town:${town.en}`,
          // Geography gives way. A town that cannot find a corner goes unnamed
          // this frame rather than printing through a track number.
          optional: true,
        });
      }
    }
    ctx.restore();
  }

  drawGrid(world) {
    const { ctx } = this;
    const p = this.palette;
    const d = this.dpr;
    const centre = this.toScreen(this.origin);
    const step = this.rangeKm > 160 ? 50 : this.rangeKm > 80 ? 25 : 10;

    ctx.save();
    ctx.strokeStyle = p.grid;
    ctx.lineWidth = 1;

    /*
     * The range numerals go up the 045 radial, not up the twelve o'clock
     * spoke.
     *
     * Every one of them used to be drawn at `centre.x + 3`, so the whole scale
     * stood in one column straight up the north spoke — with the spoke ruled
     * through the digits, and anything flying up the middle of the picture
     * lettered into the same strip. On the 045 radial no spoke runs (they are
     * every thirty degrees) and the column no longer exists.
     */
    const diag = Math.SQRT1_2;
    for (let r = step; r <= this.rangeKm * 1.6; r += step) {
      const px = r * this.scale;
      ctx.beginPath();
      ctx.arc(centre.x, centre.y, px, 0, TAU);
      ctx.stroke();
      this.stamp(`${r}`, centre.x + px * diag + 3 * d, centre.y - px * diag + 3 * d,
        p.inkDim, { size: 8.5 });
    }

    // Bearing spokes every thirty degrees.
    const reach = this.rangeKm * 1.6 * this.scale;
    for (let a = 0; a < 360; a += 30) {
      const h = headingVec(a);
      ctx.beginPath();
      ctx.moveTo(centre.x, centre.y);
      ctx.lineTo(centre.x + h.x * reach, centre.y - h.y * reach);
      ctx.globalAlpha = a % 90 === 0 ? 0.8 : 0.35;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    /*
     * And the scale to read them off, which this tube never had.
     *
     * The cabin's plan view has carried a bearing scale with cardinals and
     * thirties for some time; the plan position indicator — the display whose
     * net cues the seat by bearing, whose shootlist prints one per contact and
     * whose fire-control arcs are drawn on one — had ruled spokes and not a
     * single numeral. It is the cabin's scale, on the ring that fits the short
     * axis of whatever the tube has been given.
     *
     * Only when the origin is on the glass: the board can be panned, and a
     * scale struck from a centre somewhere off the left-hand edge is a ring of
     * numerals that mean nothing.
     */
    if (centre.x < 0 || centre.y < 0 || centre.x > this.w || centre.y > this.h) return;
    const ring = Math.min(this.w, this.h) / 2 - 13 * d;
    if (ring < 40 * d) return;
    ctx.save();
    ctx.strokeStyle = withAlpha(p.inkDim, 0.7);
    ctx.lineWidth = 1;
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
    for (let a = 0; a < 360; a += 30) {
      const h = headingVec(a);
      const rr = ring + 7 * d;
      const cardinal = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[a];
      this.stamp(cardinal ?? String(a).padStart(3, '0'),
        centre.x + h.x * rr, centre.y - h.y * rr + 3 * d,
        cardinal ? p.ink : p.inkDim,
        { size: cardinal ? 10 : 8.5, align: 'center', weight: cardinal ? 'bold' : '' });
    }
    ctx.restore();
  }

  /**
   * Where the fire-control antennas are looking.
   *
   * A long-range battalion guides through a hundred-and-twenty-degree arc that
   * takes the better part of half a minute to swing, so which way it points is
   * a decision the operator is making whether they can see it or not. Now they
   * can see it: a faint wedge out to the battery's reach, brighter along the
   * boresight, and drawn under the symbols so it never competes with a track.
   */
  drawFireControlArcs(world) {
    const { ctx } = this;
    const p = this.palette;
    for (const radar of world.radars) {
      if (!radar.alive || !radar.fovDeg) continue;
      const site = radar.siteId ? world.siteById.get(radar.siteId) : null;
      if (site && !site.alive) continue;
      const origin = this.toScreen(radar.pos);
      const reach = Math.min(radar.rangeKm,
        site ? SAM_TYPES[site.type].maxRangeKm : radar.rangeKm) * this.scale;
      const half = radar.fovDeg / 2;
      const start = (radar.boresightDeg - half - 90) * Math.PI / 180;
      const end = (radar.boresightDeg + half - 90) * Math.PI / 180;
      const lit = radar.state === 'radiating';

      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      ctx.arc(origin.x, origin.y, reach, start, end);
      ctx.closePath();
      ctx.fillStyle = withAlpha(p.accent, lit ? 0.05 : 0.02);
      ctx.fill();
      ctx.strokeStyle = withAlpha(p.accent, lit ? 0.3 : 0.14);
      ctx.lineWidth = 1 * this.dpr;
      ctx.stroke();

      /*
       * The boresight itself — the line the crew has actually chosen.
       *
       * It was drawn at the same brightness as the sweep's leading edge and to
       * the battery's full reach, which can be well past the edge of the
       * glass, so on a battalion board two of them ran corner to corner as
       * full-tube diagonals and read as scratches on the faceplate. Half the
       * alpha, a long dash that no rotating beam has, and cut to the tube.
       */
      const h = headingVec(radar.boresightDeg);
      const onGlass = Math.min(reach, Math.hypot(this.w, this.h) * 0.5);
      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      ctx.lineTo(origin.x + h.x * onGlass, origin.y - h.y * onGlass);
      ctx.strokeStyle = withAlpha(p.accent, lit ? 0.22 : 0.1);
      ctx.setLineDash([9 * this.dpr, 7 * this.dpr]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  /** Wedges a damaged radar can no longer see into. */
  drawDeadSectors(world) {
    const { ctx } = this;
    for (const radar of world.radars) {
      if (!radar.alive || !radar.deadSectors?.length) continue;
      const origin = this.toScreen(radar.pos);
      const reach = radar.rangeKm * this.scale;
      for (const sector of radar.deadSectors) {
        const start = (sector.az - sector.halfWidthDeg - 90) * Math.PI / 180;
        const end = (sector.az + sector.halfWidthDeg - 90) * Math.PI / 180;
        ctx.beginPath();
        ctx.moveTo(origin.x, origin.y);
        ctx.arc(origin.x, origin.y, reach, start, end);
        ctx.closePath();
        ctx.fillStyle = withAlpha(this.palette.hostile, 0.06);
        ctx.fill();
      }
    }
  }

  /**
   * Where the subordinate commands are, and whose hand each is in.
   *
   * Drawn under everything else, as boundaries on a wall map are: a ring at the
   * sector's centre of responsibility, solid where you are standing, dashed
   * while a handover is running, and faint where somebody else has it. On a
   * district board this is the only way to read at a glance which quarter of
   * the country you are actually commanding.
   */
  drawFormations(world) {
    if (!world.formations || world.formations.length < 2) return;
    const { ctx } = this;
    const p = this.palette;

    for (const formation of world.formations) {
      if (!formation.pos) continue;
      const s = this.toScreen(formation.pos);
      const handover = formation.handoverUntilS > world.t;
      const held = formation.direct && !handover;
      const colour = handover ? p.warn : held ? p.accent : p.inkDim;

      ctx.save();
      ctx.strokeStyle = withAlpha(colour, held ? 0.55 : 0.28);
      ctx.lineWidth = (held ? 1.8 : 1.2) * this.dpr;
      if (handover) ctx.setLineDash([5 * this.dpr, 4 * this.dpr]);
      ctx.beginPath();
      ctx.arc(s.x, s.y, 13 * this.dpr, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      this.reserve(s.x - 13 * this.dpr, s.y - 13 * this.dpr, 26 * this.dpr, 26 * this.dpr);
      this.queueLabel({
        lines: [formation.name, held ? 'DIRECT' : handover
          ? `HANDOVER ${Math.ceil(formation.handoverUntilS - world.t)}s`
          : (formation.commander?.name ?? 'SUBORDINATE')],
        x: s.x, y: s.y,
        colours: [colour, p.inkDim],
        colour,
        priority: held ? 64 : 40,
        offset: 16,
        key: `formation:${formation.id ?? formation.name}`,
      });
    }
  }

  drawAssets(world, ui) {
    const { ctx } = this;
    const p = this.palette;
    const size = 5 * this.dpr;

    /*
     * A place sector command has named is a place on the map, not a line in a
     * ticker that scrolls away in five events. The asset a priority of fires
     * designates flashes for the first ten seconds — so you look at it — and
     * then stays marked in red, with its name held at the top of the label
     * priorities, for the rest of the watch. You are never again in doubt
     * about which building the order was about.
     */
    const designatedId = world.command?.constraints?.priorityOfFiresId ?? null;
    const designatedAtS = world.command?.constraints?.priorityDesignatedAtS ?? null;
    const sinceDesignation = designatedAtS === null ? Infinity : world.t - designatedAtS;
    const flashing = sinceDesignation < 10 && Math.floor(sinceDesignation * 2) % 2 === 0;

    for (const asset of world.assets) {
      const s = this.toScreen(asset.pos);
      const type = ASSET_TYPES[asset.type];
      const hurt = clamp01(asset.damage / type.hp);
      const designated = asset.id === designatedId;
      const colour = asset.destroyed ? p.hostile
        : designated ? p.hostile
          : type.critical ? p.friendly : p.ink;

      ctx.save();
      ctx.strokeStyle = colour;
      ctx.fillStyle = withAlpha(colour, designated ? 0.3 : 0.15);
      ctx.lineWidth = (designated ? 2.2 : 1.4) * this.dpr;

      if (designated && !asset.destroyed) {
        // A ring around the designated place, breathing while it is new.
        ctx.save();
        ctx.globalAlpha = flashing ? 0.95 : 0.5;
        ctx.strokeStyle = p.hostile;
        ctx.lineWidth = 1.6 * this.dpr;
        ctx.setLineDash([3 * this.dpr, 3 * this.dpr]);
        ctx.beginPath();
        ctx.arc(s.x, s.y, size * (flashing ? 3.4 : 2.4), 0, TAU);
        ctx.stroke();
        ctx.restore();
      }

      if (asset.destroyed) {
        ctx.beginPath();
        ctx.moveTo(s.x - size, s.y - size); ctx.lineTo(s.x + size, s.y + size);
        ctx.moveTo(s.x + size, s.y - size); ctx.lineTo(s.x - size, s.y + size);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.rect(s.x - size, s.y - size, size * 2, size * 2);
        ctx.fill();
        ctx.stroke();
        if (hurt > 0) {
          // A damage bar under the symbol reads faster than a percentage.
          ctx.fillStyle = p.warn;
          ctx.fillRect(s.x - size, s.y + size + 2 * this.dpr, size * 2 * hurt, 2 * this.dpr);
        }
      }

      const extent = designated ? size * 3.6 : size + 3;
      this.reserve(s.x - extent, s.y - extent, extent * 2, extent * 2);
      this.queueLabel({
        text: designated ? `${asset.label} · PRIORITY` : asset.label,
        x: s.x, y: s.y,
        colour: asset.destroyed || designated ? p.hostile : p.inkDim,
        // A destroyed or burning asset is worth the space; an intact one gives
        // way. A designated one outranks both — it is the only place on this
        // map the file will ask you about by name.
        priority: designated ? 90 : asset.destroyed ? 60 : hurt > 0 ? 50 : 20,
        offset: extent / this.dpr + 2,
        key: `asset:${asset.id}`,
      });
      ctx.restore();
    }
  }

  drawSites(world, ui) {
    const { ctx } = this;
    const p = this.palette;
    const size = 6 * this.dpr;

    for (const site of world.sites) {
      const s = this.toScreen(site.pos);
      const radar = world.radarById.get(site.radarId);
      const selected = ui.selectedSiteId === site.id;
      const crewed = world.control.crewedBatteryId === site.id;
      const colour = !site.alive ? p.inkDim
        : radar?.state === 'radiating' ? p.accent
          : site.weaponsState === 'hold' ? p.inkDim : p.ink;

      ctx.save();
      ctx.strokeStyle = colour;
      ctx.lineWidth = (crewed ? 2.2 : 1.5) * this.dpr;

      // A battery is a triangle; the crewed one wears a ring so you can find
      // yourself on the scope at a glance.
      ctx.beginPath();
      ctx.moveTo(s.x, s.y - size);
      ctx.lineTo(s.x + size, s.y + size * 0.8);
      ctx.lineTo(s.x - size, s.y + size * 0.8);
      ctx.closePath();
      if (!site.alive) {
        ctx.globalAlpha = 0.45;
      } else if (radar?.state === 'radiating') {
        ctx.fillStyle = withAlpha(colour, 0.22);
        ctx.fill();
      }
      ctx.stroke();

      if (crewed) {
        ctx.beginPath();
        ctx.arc(s.x, s.y, size * 1.9, 0, TAU);
        ctx.strokeStyle = p.friendly;
        ctx.setLineDash([3 * this.dpr, 3 * this.dpr]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (selected) {
        ctx.beginPath();
        ctx.arc(s.x, s.y, size * 2.4, 0, TAU);
        ctx.strokeStyle = p.accent;
        ctx.stroke();
      }

      ctx.globalAlpha = 1;
      const busy = site.engagements.length
        ? ` ${'◆'.repeat(Math.min(site.engagements.length, 4))}` : '';
      const extent = size * (selected ? 2.4 : crewed ? 1.9 : 1.1);
      this.reserve(s.x - extent, s.y - extent, extent * 2, extent * 2);
      this.queueLabel({
        text: `${site.name}${site.alive ? ` ${site.readyRounds}${busy}` : ' ✕'}`,
        x: s.x, y: s.y,
        colour: !site.alive ? p.inkDim : site.engagements.length ? p.warn : p.ink,
        priority: selected || crewed ? 90 : 45,
        offset: extent / this.dpr + 2,
        key: `site:${site.id}`,
      });
      ctx.restore();
    }
  }

  drawStandaloneRadars(world, ui) {
    const { ctx } = this;
    const p = this.palette;
    for (const radar of world.radars) {
      if (radar.siteId) continue;
      const s = this.toScreen(radar.pos);
      const r = 5 * this.dpr;
      const live = radar.state === 'radiating';
      ctx.save();
      ctx.strokeStyle = !radar.alive ? p.inkDim : live ? p.accent : p.ink;
      ctx.lineWidth = 1.4 * this.dpr;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(s.x, s.y - r * 2.1);
      ctx.lineTo(s.x, s.y - r);
      ctx.stroke();
      this.reserve(s.x - r, s.y - r * 2.1, r * 2, r * 3.1);
      this.queueLabel({
        text: radar.alive ? radar.label : `${radar.label} ✕`,
        x: s.x, y: s.y,
        colour: radar.alive ? p.inkDim : p.hostile,
        // The only set still radiating is not scenery. On the two watches with
        // a wreck and a live set on the same board, the living one's name was
        // among the first things the old placer threw away.
        priority: radar.alive && radar.state === 'radiating' ? 72 : radar.alive ? 40 : 65,
        offset: r / this.dpr + 3,
        key: `radar:${radar.id}`,
      });
      ctx.restore();
    }
  }

  drawMissiles(world) {
    const { ctx } = this;
    const p = this.palette;

    /*
     * Misses, drawn. A round that went wide leaves a puff dissipating where
     * the dot was — for years the majority outcome of every launch was the
     * instantaneous absence of a pixel. Read from the engine's effect queue;
     * purely cosmetic.
     */
    for (const effect of world.effects) {
      if (effect.kind === 'puff') {
        const age = (world.t - effect.startedS) / (effect.durationS ?? 1.8);
        if (age < 0 || age > 1) continue;
        const s = this.toScreen(effect.pos);
        ctx.save();
        ctx.globalAlpha = 0.45 * (1 - age);
        ctx.strokeStyle = p.warn;
        ctx.lineWidth = 1.2 * this.dpr;
        ctx.beginPath();
        ctx.arc(s.x, s.y, (2 + age * 9) * this.dpr, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 0.25 * (1 - age);
        ctx.beginPath();
        ctx.arc(s.x, s.y, (1 + age * 4.5) * this.dpr, 0, TAU);
        ctx.stroke();
        ctx.restore();
      } else if (effect.kind === 'launchflash') {
        // The rail lights the site for half a second. The launch used to be a
        // log line and a dot appearing somewhere along the vector; now the
        // place it left FROM flares, which is where the operator's eye goes
        // when a battery answers an order.
        const age = (world.t - effect.startedS) / (effect.durationS ?? 0.5);
        if (age < 0 || age > 1) continue;
        const s = this.toScreen(effect.pos);
        ctx.save();
        ctx.globalAlpha = 0.7 * (1 - age);
        ctx.fillStyle = p.accent;
        ctx.beginPath();
        ctx.arc(s.x, s.y, (2.5 + age * 6) * this.dpr, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 0.35 * (1 - age);
        ctx.strokeStyle = p.accent;
        ctx.lineWidth = 1.4 * this.dpr;
        ctx.beginPath();
        ctx.arc(s.x, s.y, (4 + age * 12) * this.dpr, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
    }

    for (const missile of world.missiles) {
      if (!missile.alive) continue;
      const s = this.toScreen(missile.pos);
      const colour = missile.kind === 'arm' ? p.hostile
        : missile.kind === 'strike' ? p.warn : p.accent;

      if (missile.trail.length > 1) {
        ctx.beginPath();
        const first = this.toScreen(missile.trail[0]);
        ctx.moveTo(first.x, first.y);
        for (const point of missile.trail) {
          const t = this.toScreen(point);
          ctx.lineTo(t.x, t.y);
        }
        ctx.lineTo(s.x, s.y);
        ctx.strokeStyle = withAlpha(colour, 0.35);
        ctx.lineWidth = 1 * this.dpr;
        ctx.stroke();
      }

      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 2.2 * this.dpr, 0, TAU);
      ctx.fill();

      // An anti-radiation round gets a halo, because it is the one thing on the
      // scope that is aimed at the player.
      if (missile.kind === 'arm') {
        const pulse = 0.5 + 0.5 * Math.sin(world.t * 6);
        ctx.strokeStyle = withAlpha(p.hostile, 0.35 + pulse * 0.4);
        ctx.lineWidth = 1.2 * this.dpr;
        ctx.beginPath();
        ctx.arc(s.x, s.y, (5 + pulse * 4) * this.dpr, 0, TAU);
        ctx.stroke();
        this.reserve(s.x - 9 * this.dpr, s.y - 9 * this.dpr, 18 * this.dpr, 18 * this.dpr);
      } else {
        this.reserve(s.x - 3 * this.dpr, s.y - 3 * this.dpr, 6 * this.dpr, 6 * this.dpr);
      }
    }
  }

  drawTracks(world, ui) {
    const { ctx } = this;
    const p = this.palette;
    /*
     * On a small tube a contact carries its number and nothing else.
     *
     * Thirteen contacts on a 380 px glass is thirteen three-line blocks, and
     * the graphics critic counted four of them overlapping inside one eighty
     * pixel square. Their own remedy: "on the phone, drop the second line of a
     * track label entirely and show it only for the selected contact." The
     * altitude and the type are a tap away in the contact's own row and in the
     * hover readout; the track number is what the board is read by.
     *
     * Measured off the glass rather than the device, because the question is
     * how much room the lettering has.
     */
    const tight = this.w / this.dpr < 520;
    /*
     * Contacts the plot cannot reach get a caret on the rim pointing at them,
     * the way the cabin's plan view has always done it. Without this a track
     * outside the range simply is not there, and the tube tells you the sky is
     * empty when it means "the sky is empty within this circle" — which on a
     * watch whose batteries outreach its default scale is a different claim.
     */
    const edge = [];

    for (const track of world.tracks.values()) {
      const s = this.toScreen(track.pos);
      if (!track.destroyed
        && (s.x < 0 || s.y < 0 || s.x > this.w || s.y > this.h)) {
        edge.push({ track, colour: hostilityColour(p, track) });
        continue;
      }
      const colour = hostilityColour(p, track);
      const selected = ui.selectedTrackId === track.id;
      const size = 5 * this.dpr;

      /*
       * The kill, drawn as one. A destroyed track stops being a hostile
       * diamond with a confident velocity leader — it is an expanding, fading
       * bloom with a cross through it, held for the few seconds before the
       * track drops. For most of the game's life the target you had just
       * splashed kept flying its symbol along its old course for the better
       * part of a minute, and the most satisfying event in air defence read
       * as a log line.
       */
      if (track.destroyed) {
        const age = clamp01((world.t - (track.destroyedAtS ?? world.t)) / 4.5);
        const bloom = size * (1.6 + age * 2.6);
        ctx.save();
        ctx.globalAlpha = 0.85 * (1 - age);
        ctx.strokeStyle = colour;
        ctx.lineWidth = 1.6 * this.dpr;
        ctx.beginPath();
        ctx.arc(s.x, s.y, bloom, 0, TAU);
        ctx.stroke();
        const arm = size * 0.9;
        ctx.beginPath();
        ctx.moveTo(s.x - arm, s.y - arm); ctx.lineTo(s.x + arm, s.y + arm);
        ctx.moveTo(s.x - arm, s.y + arm); ctx.lineTo(s.x + arm, s.y - arm);
        ctx.stroke();
        ctx.restore();
        this.reserve(s.x - bloom, s.y - bloom, bloom * 2, bloom * 2);
        this.queueLabel({
          lines: [`${track.tn} ✕`],
          x: s.x, y: s.y,
          colours: [colour], colour,
          priority: 60, offset: bloom / this.dpr + 3,
          key: `track:${track.id}`,
        });
        continue;
      }

      /*
       * AND THE SYMBOL IS AS OLD AS THE LOOK THAT MADE IT.
       *
       * "Track symbols are drawn at full brightness all the time, everywhere,
       * whether the beam passed them a moment ago or five seconds ago. The
       * sweep is decoration over a static vector chart rather than the thing
       * that puts the picture on the tube." So a contact is brightest at the
       * instant it is painted and fades back towards a floor as the picture
       * goes stale — which is not only truer to the hardware, it is the answer
       * to a question the operator is always asking: how old is this? On a set
       * with a twelve second revisit the difference is most of the watch. The
       * contact the operator has selected stays at full strength whatever the
       * beam is doing, because that one is theirs.
       */
      const sinceLook = Math.max(0, world.t - (track.lastUpdateS ?? world.t));
      const fresh = selected ? 1 : clamp01(1 - sinceLook / 9);
      ctx.save();
      ctx.globalAlpha = track.coasting ? 0.42 : 0.55 + 0.45 * fresh;
      ctx.strokeStyle = colour;
      ctx.fillStyle = colour;
      ctx.lineWidth = (selected ? 2.2 : 1.4) * this.dpr;

      /*
       * WHAT IT IS, AS A SHAPE.
       *
       * Every contact on this tube used to be the same mark — a filled dot
       * inside a ring — and hostile, friendly and unidentified differed only
       * in colour. The one distinction the whole game turns on, the one that
       * decides whether you shoot the airliner, was carried by hue with no
       * redundant channel at all: measured, #ff5b52 against #ffd447 is 2.15:1
       * in ordinary vision and 1.44:1 under deuteranopia, against a floor of
       * 3.0 for a graphical object that has to be told apart.
       *
       * The frames to fix it were written in this file years ago and have
       * never once been drawn: `drawStandardSymbol` was gated on
       * `this.theme.symbology === 'standard'` and there is one theme, whose
       * symbology is 'blip'. The gate is gone. Diamond hostile, dome friendly,
       * quatrefoil unidentified — and the track is coasting when the frame is
       * broken rather than merely dimmed, because a dead-reckoned position
       * half a minute old is a different thing from a paint and half an alpha
       * is not a statement.
       */
      if (track.coasting) ctx.setLineDash([2.5 * this.dpr, 2.5 * this.dpr]);
      drawStandardSymbol(ctx, s, size, track);
      ctx.setLineDash([]);
      // The plot itself, inside the frame: where the system believes it is.
      ctx.beginPath();
      ctx.arc(s.x, s.y, size * 0.38, 0, TAU);
      ctx.fill();

      /*
       * The protected flight.
       *
       * Once identified it is the only thing on the scope the whole watch is
       * about, and it is drawn as a friendly like any other, so it needs a
       * marking of its own: a slow pulsing ring, the way a controller keeps a
       * finger on the one contact that matters. Nothing else in the game draws
       * this, because nothing else in the game is one aircraft.
       */
      if (AIR_TYPES[track.classification]?.isVip) {
        const pulse = 0.5 + 0.5 * Math.sin(world.t * 2.2);
        ctx.save();
        ctx.strokeStyle = withAlpha(p.friendly, 0.3 + pulse * 0.45);
        ctx.lineWidth = 1.6 * this.dpr;
        ctx.setLineDash([4 * this.dpr, 3 * this.dpr]);
        ctx.beginPath();
        ctx.arc(s.x, s.y, size * (2.4 + pulse * 0.5), 0, TAU);
        ctx.stroke();
        ctx.restore();
      }

      // Velocity leader: one minute of flight at the current estimate. This is
      // the single most useful thing on the scope — it shows intent.
      const speed = len(track.vel);
      if (speed > 1e-4) {
        const leadKm = speed * 60;
        const lead = this.toScreen({
          x: track.pos.x + track.vel.x / speed * leadKm,
          y: track.pos.y + track.vel.y / speed * leadKm,
        });
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(lead.x, lead.y);
        ctx.lineWidth = 1.2 * this.dpr;
        ctx.stroke();
      }

      if (selected) {
        ctx.beginPath();
        ctx.arc(s.x, s.y, size * 2.6, 0, TAU);
        ctx.setLineDash([3 * this.dpr, 3 * this.dpr]);
        ctx.strokeStyle = p.inkBright;
        ctx.stroke();
        ctx.setLineDash([]);
      }

      /*
       * Whose it is, as a shape.
       *
       * A contact a battery holds wears the corner brackets every fire-control
       * display puts on a designated target — dashed while the battery has
       * only claimed it, solid once a round is in the air — and the label
       * names the battery. The tether to the battery stays, but a faint dashed
       * line across a crowded plot was the whole of the old marking, and the
       * player could not tell an assigned contact from a loose one at a
       * glance, which is the one thing the net seat exists to see.
       */
      const shape = assignmentShape(world, track);
      if (shape.bracket !== 'none') {
        const b = size * 2.1;
        const arm = size * 0.9;
        ctx.save();
        ctx.strokeStyle = shape.bracket === 'solid' ? p.good : p.accent;
        ctx.lineWidth = (shape.bracket === 'solid' ? 1.8 : 1.3) * this.dpr;
        if (shape.bracket === 'dashed') ctx.setLineDash([2 * this.dpr, 2 * this.dpr]);
        for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          ctx.beginPath();
          ctx.moveTo(s.x + sx * b, s.y + sy * b - sy * arm);
          ctx.lineTo(s.x + sx * b, s.y + sy * b);
          ctx.lineTo(s.x + sx * b - sx * arm, s.y + sy * b);
          ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.restore();
      }

      // Label block: track number, then altitude in hundreds of metres and
      // whatever the system is willing to say about what it is, then the
      // battery that has it.
      const alt = Math.round(track.altM / 100);
      const label = track.classification !== 'unknown'
        ? AIR_TYPES[track.classification]?.label ?? ''
        : trackProfile(track);
      /*
       * The contact owns everything drawn on it, not just its dot: the
       * selection ring, the assignment brackets and the protected flight's
       * pulsing ring all stand off the blip, and a label printed through any
       * of them is printed through the mark it is naming.
       */
      const extent = size * (selected ? 2.8
        : shape.bracket !== 'none' ? 2.4
          : AIR_TYPES[track.classification]?.isVip ? 3.0 : 1.2);
      this.reserve(s.x - extent, s.y - extent, extent * 2, extent * 2);
      this.queueLabel({
        lines: tight && !selected ? [track.tn]
          : [track.tn, `${String(alt).padStart(3, '0')} ${label}`,
            ...(shape.tag ? [shape.tag] : [])],
        x: s.x, y: s.y,
        colours: [selected ? p.inkBright : colour, p.inkDim,
          shape.bracket === 'solid' ? p.good : p.accent],
        colour,
        // Contacts always outrank scenery; the selected one and the aircraft the
        // watch exists to protect outrank everything.
        priority: selected ? 100
          : AIR_TYPES[track.classification]?.isVip ? 98
            : 70 + Math.min(track.threat / 10, 20),
        offset: extent / this.dpr + 3,
        key: `track:${track.id}`,
      });

      // A line to the battery working it, so assignment is visible at a glance.
      for (const siteId of track.assignedTo) {
        const site = world.siteById.get(siteId);
        if (!site) continue;
        const sp = this.toScreen(site.pos);
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(sp.x, sp.y);
        ctx.strokeStyle = withAlpha(track.engagedBy.length ? p.good : p.accent, 0.45);
        ctx.lineWidth = 1 * this.dpr;
        ctx.setLineDash([2 * this.dpr, 5 * this.dpr]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
    }

    this.drawOffScale(edge);
  }

  /**
   * Contacts outside the plot, as carets on the rim.
   *
   * Each sits where the line from the centre to the contact leaves the canvas,
   * points outward, and carries the track number and how far out it is. It is
   * the difference between "nothing is out there" and "nothing is out there
   * that I have room to draw" — and on a battalion watch, where the batteries
   * outreach the picture, that difference is most of the watch.
   */
  drawOffScale(edge) {
    // Where each caret was drawn, so `pick` can find it. Cleared every frame,
    // whether or not there is anything out there.
    this.edgeHits = [];
    if (!edge.length) return;
    const { ctx } = this;
    const cx = this.w / 2;
    const cy = this.h / 2;
    // The top inset clears the two readouts the tube draws at y=16 and y=30;
    // a caret printed over RANGE 140 KM is worse than no caret.
    const inset = { top: 46 * this.dpr, side: 30 * this.dpr, bottom: 18 * this.dpr };
    ctx.save();
    for (const { track, colour } of edge) {
      const s = this.toScreen(track.pos);
      const dx = s.x - cx;
      const dy = s.y - cy;
      if (!dx && !dy) continue;
      // Where the ray leaves the inset rectangle: the smaller of the two
      // axis crossings is the side it actually exits through.
      const vertical = dy < 0 ? cy - inset.top : cy - inset.bottom;
      const scale = Math.min(
        Math.abs(dx) > 1e-6 ? (cx - inset.side) / Math.abs(dx) : Infinity,
        Math.abs(dy) > 1e-6 ? vertical / Math.abs(dy) : Infinity,
      );
      const x = cx + dx * scale;
      const y = cy + dy * scale;
      const angle = Math.atan2(dy, dx);

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.globalAlpha = 0.75;
      ctx.strokeStyle = colour;
      ctx.lineWidth = 1.4 * this.dpr;
      ctx.beginPath();
      ctx.moveTo(-4 * this.dpr, -4 * this.dpr);
      ctx.lineTo(2 * this.dpr, 0);
      ctx.lineTo(-4 * this.dpr, 4 * this.dpr);
      ctx.stroke();
      ctx.restore();

      /*
       * The caption goes inboard along whichever edge the caret sits on: below
       * a top caret, beside a side one. Placed by `dx` alone it ran back over
       * the caret for anything near the top or bottom centre.
       */
      const onSide = Math.abs(x - cx) > cx - inset.side - 1;
      const inward = 11 * this.dpr;
      this.reserve(x - 6 * this.dpr, y - 6 * this.dpr, 12 * this.dpr, 12 * this.dpr);
      // The caret is the contact, as far as a finger is concerned: the press
      // lands a little inboard of the point, over the caption as well.
      this.edgeHits.push({ id: track.id,
        x: x - Math.sign(dx) * 4 * this.dpr, y: y - Math.sign(dy) * 4 * this.dpr });
      // Stamped rather than written: the caption owns its corner of the rim,
      // so nothing the placer fits afterwards is printed across it.
      this.stamp(`${track.tn} ${Math.round(len(track.pos))}`,
        onSide ? x - Math.sign(dx) * inward : x,
        onSide ? y + 3 * this.dpr : y + Math.sign(-dy) * inward,
        colour,
        { size: 8.5, align: onSide ? (x > cx ? 'right' : 'left') : 'center', alpha: 0.72 });
    }
    ctx.restore();
  }

  /** The rubber band while the player drags a track onto a battery. */
  drawAssignmentDrag(world, ui) {
    if (!ui.dragFrom || !ui.dragTo) return;
    const track = world.tracks.get(ui.dragFrom);
    if (!track) return;
    const a = this.toScreen(track.pos);
    const b = { x: ui.dragTo.x * this.dpr, y: ui.dragTo.y * this.dpr };
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = this.palette.inkBright;
    ctx.lineWidth = 1.4 * this.dpr;
    ctx.setLineDash([4 * this.dpr, 4 * this.dpr]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
  }

  /** Show a battery's reach when it is selected — the "can I even hit that" answer. */
  drawEnvelope(world, ui) {
    const { ctx } = this;

    /*
     * Every living battery shows a whisper of its reach all the time. The
     * spatial answer to "who can take this track" used to exist only for a
     * battery the player had already thought to click — invisible exactly to
     * the person who has not yet learned that clicking a site draws its ring.
     */
    ctx.save();
    ctx.lineWidth = 1 * this.dpr;
    for (const site of world.sites) {
      if (!site.alive || site.id === ui.selectedSiteId) continue;
      const t = SAM_TYPES[site.type];
      const c = this.toScreen(site.pos);
      ctx.strokeStyle = withAlpha(this.palette.accent, 0.09);
      ctx.beginPath();
      ctx.arc(c.x, c.y, t.maxRangeKm * this.scale, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();

    const site = ui.selectedSiteId ? world.siteById.get(ui.selectedSiteId) : null;
    if (!site) return;
    const type = SAM_TYPES[site.type];
    const s = this.toScreen(site.pos);
    ctx.save();
    ctx.strokeStyle = withAlpha(this.palette.accent, 0.5);
    ctx.setLineDash([5 * this.dpr, 4 * this.dpr]);
    ctx.lineWidth = 1.2 * this.dpr;
    ctx.beginPath();
    ctx.arc(s.x, s.y, type.maxRangeKm * this.scale, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = withAlpha(this.palette.hostile, 0.35);
    ctx.beginPath();
    ctx.arc(s.x, s.y, type.minRangeKm * this.scale, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  drawChrome(world, ui) {
    const p = this.palette;
    const d = this.dpr;
    this.stamp(`RANGE ${Math.round(this.rangeKm)} KM`, 10 * d, 16 * d, p.inkDim, { size: 10 });
    /*
     * And the readout is the control, wherever the bezel is not.
     *
     * Below 1400px the whole bezel strip is not drawn, so at 1280x800 — one of
     * the two desk widths — the range could be changed only by a wheel or by
     * keys, neither of which is stated anywhere; and on a phone there is no
     * wheel, no keyboard and no pinch, so the scale was frozen for the entire
     * watch. The box the readout was just stamped in is remembered in CSS
     * pixels so a tap on it can step the switch.
     */
    const box = this.reserved[this.reserved.length - 1];
    this.rangeHit = box
      ? { x: box.x / d - 6, y: box.y / d - 6, w: box.w / d + 12, h: box.h / d + 14 }
      : null;
    // The hour and the weather, under the range: the watch's own time of
    // night, which is one of the things that tells this watch from the last.
    this.stamp(watchConditions(world.scenario, world.t).line, 10 * d, 30 * d, p.inkDim, { size: 10 });
    if (!world.fusionOnline) {
      // What it means for the person looking at the tube, not the name of
      // the mode: every radar is now reporting on its own, and the same
      // aircraft can wear a different track number on each of them.
      this.stamp('SECTOR LINK DOWN — EACH RADAR REPORTS ON ITS OWN',
        10 * d, 44 * d, p.hostile, { size: 10 });
    }
  }

  drawScanlines() {
    const { ctx } = this;
    const gap = Math.max(2, Math.round(2 * this.dpr));
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = '#000';
    for (let y = 0; y < this.h; y += gap * 2) ctx.fillRect(0, y, this.w, gap);
    ctx.restore();
  }

  drawVignette() {
    const { ctx } = this;
    const g = ctx.createRadialGradient(
      this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.35,
      this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.72,
    );
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${this.theme.vignette})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
  }
}

/**
 * The air frames: diamond hostile, dome friendly, quatrefoil unidentified.
 *
 * Exported because the console is no longer allowed to draw a mark it will not
 * also explain. The nomenclature plate on the bezel draws each of these at the
 * size the tube draws it, from this function, so the key can never drift from
 * the picture.
 */
export function drawStandardSymbol(ctx, s, size, track) {
  ctx.beginPath();
  if (track.hostility === 'hostile') {
    ctx.moveTo(s.x, s.y - size * 1.2);
    ctx.lineTo(s.x + size * 1.1, s.y);
    ctx.lineTo(s.x, s.y + size * 1.2);
    ctx.lineTo(s.x - size * 1.1, s.y);
    ctx.closePath();
  } else if (track.hostility === 'friendly') {
    ctx.arc(s.x, s.y, size, Math.PI, 0);
    ctx.lineTo(s.x + size, s.y + size * 0.5);
    ctx.lineTo(s.x - size, s.y + size * 0.5);
    ctx.closePath();
  } else {
    const r = size * 0.95;
    ctx.moveTo(s.x - r, s.y - r * 0.4);
    ctx.quadraticCurveTo(s.x - r, s.y - r, s.x, s.y - r);
    ctx.quadraticCurveTo(s.x + r, s.y - r, s.x + r, s.y - r * 0.4);
    ctx.lineTo(s.x + r, s.y + r * 0.4);
    ctx.quadraticCurveTo(s.x + r, s.y + r, s.x, s.y + r);
    ctx.quadraticCurveTo(s.x - r, s.y + r, s.x - r, s.y + r * 0.4);
    ctx.closePath();
  }
  ctx.stroke();
}

/**
 * THE NOMENCLATURE: every mark on the glass, and what it is called.
 *
 * The interface critic's count: "Nothing on this console tells the player what
 * any mark means. Red is never defined as hostile, yellow never as
 * unidentified, blue never as friendly. Nor is the dashed corner bracket, the
 * solid bracket, the rim caret, the cross, the pulsing ring or the dashed
 * tether. `#scope-legend`, the element named 'legend', is not a legend: it is
 * a fixed instruction line that never changes." A regular expression for the
 * name of any colour over the whole handbook returned false.
 *
 * So this is the table, and it is drawn rather than described — by the same
 * code the tube draws with, at the size the tube draws it, so the key cannot
 * drift away from the picture it explains. It is printed in the handbook under
 * THE PICTURE and on the bezel plate beside the range knob.
 */
export const NOMENCLATURE = [
  { id: 'hostile', name: 'Hostile', note: 'identified as an enemy aircraft' },
  { id: 'friendly', name: 'Friendly', note: 'identified as one of ours' },
  { id: 'unknown', name: 'Unidentified', note: 'seen, not yet named — most of what you shoot at' },
  { id: 'coasting', name: 'Coasting', note: 'no paint this sweep; the position is dead reckoned' },
  { id: 'destroyed', name: 'Splashed', note: 'held for a few seconds, then the track drops' },
  { id: 'vip', name: 'Protected flight', note: 'the one aircraft a watch is about' },
  { id: 'claimed', name: 'Assigned \u25c7', note: 'a battery has it; its name is under the contact, and \u25c7 marks it in the list' },
  { id: 'firing', name: 'Engaged \u25c6', note: 'that battery has a round in the air on it; \u25c6 in the list' },
  { id: 'offscale', name: 'Off the scale', note: 'outside the picture, on the bearing shown' },
  { id: 'battery', name: 'Battery', note: 'filled while its radar is radiating' },
  { id: 'radar', name: 'Surveillance radar', note: 'a set of its own, not a battery’s' },
  { id: 'place', name: 'Defended place', note: 'what the watch is fought for' },
  { id: 'priority', name: 'Priority of fires', note: 'the place an order has named; it is not to be touched' },
];

/**
 * One entry of the nomenclature, drawn centred on (cx, cy) at the size the
 * tube draws it. `u` is the device ratio the swatch is being drawn at.
 */
export function drawNomenclature(ctx, id, cx, cy, p, u = 1) {
  const s = { x: cx, y: cy };
  const size = 5 * u;
  const frame = (hostility, dash = null) => {
    ctx.save();
    ctx.strokeStyle = ctx.fillStyle = hostility === 'hostile' ? p.hostile
      : hostility === 'friendly' ? p.friendly : p.unknown;
    ctx.lineWidth = 1.4 * u;
    if (dash) { ctx.setLineDash(dash); ctx.globalAlpha = 0.5; }
    drawStandardSymbol(ctx, s, size, { hostility });
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(s.x, s.y, size * 0.38, 0, TAU);
    ctx.fill();
    ctx.restore();
  };
  const brackets = (solid) => {
    ctx.save();
    ctx.strokeStyle = solid ? p.good : p.accent;
    ctx.lineWidth = (solid ? 1.8 : 1.3) * u;
    if (!solid) ctx.setLineDash([2 * u, 2 * u]);
    const b = size * 2.1;
    const arm = size * 0.9;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      ctx.beginPath();
      ctx.moveTo(s.x + sx * b, s.y + sy * b - sy * arm);
      ctx.lineTo(s.x + sx * b, s.y + sy * b);
      ctx.lineTo(s.x + sx * b - sx * arm, s.y + sy * b);
      ctx.stroke();
    }
    ctx.restore();
  };

  switch (id) {
    case 'hostile': frame('hostile'); break;
    case 'friendly': frame('friendly'); break;
    case 'unknown': frame('unknown'); break;
    case 'coasting': frame('hostile', [2.5 * u, 2.5 * u]); break;
    case 'destroyed': {
      ctx.save();
      ctx.strokeStyle = p.hostile;
      ctx.lineWidth = 1.6 * u;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(s.x, s.y, size * 2.4, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
      const arm = size * 0.9;
      ctx.beginPath();
      ctx.moveTo(s.x - arm, s.y - arm); ctx.lineTo(s.x + arm, s.y + arm);
      ctx.moveTo(s.x - arm, s.y + arm); ctx.lineTo(s.x + arm, s.y - arm);
      ctx.stroke();
      ctx.restore();
      break;
    }
    case 'vip':
      frame('friendly');
      ctx.save();
      ctx.strokeStyle = p.friendly;
      ctx.lineWidth = 1.6 * u;
      ctx.setLineDash([4 * u, 3 * u]);
      ctx.beginPath();
      ctx.arc(s.x, s.y, size * 2.6, 0, TAU);
      ctx.stroke();
      ctx.restore();
      break;
    case 'claimed': frame('unknown'); brackets(false); break;
    case 'firing': frame('hostile'); brackets(true); break;
    case 'offscale':
      ctx.save();
      ctx.strokeStyle = p.hostile;
      ctx.lineWidth = 1.4 * u;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.moveTo(s.x - 4 * u, s.y - 4 * u);
      ctx.lineTo(s.x + 2 * u, s.y);
      ctx.lineTo(s.x - 4 * u, s.y + 4 * u);
      ctx.stroke();
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.moveTo(s.x + 5 * u, s.y - 6 * u);
      ctx.lineTo(s.x + 5 * u, s.y + 6 * u);
      ctx.stroke();
      ctx.restore();
      break;
    case 'battery': {
      ctx.save();
      const b = 6 * u;
      ctx.strokeStyle = p.accent;
      ctx.fillStyle = withAlpha(p.accent, 0.22);
      ctx.lineWidth = 1.5 * u;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y - b);
      ctx.lineTo(s.x + b, s.y + b * 0.8);
      ctx.lineTo(s.x - b, s.y + b * 0.8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      break;
    }
    case 'radar': {
      ctx.save();
      const r = 5 * u;
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = 1.4 * u;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(s.x, s.y - r * 2.1);
      ctx.lineTo(s.x, s.y - r);
      ctx.stroke();
      ctx.restore();
      break;
    }
    case 'place':
    case 'priority': {
      ctx.save();
      const colour = id === 'priority' ? p.hostile : p.friendly;
      ctx.strokeStyle = colour;
      ctx.fillStyle = withAlpha(colour, id === 'priority' ? 0.3 : 0.15);
      ctx.lineWidth = (id === 'priority' ? 2.2 : 1.4) * u;
      ctx.beginPath();
      ctx.rect(s.x - size, s.y - size, size * 2, size * 2);
      ctx.fill();
      ctx.stroke();
      if (id === 'priority') {
        ctx.setLineDash([3 * u, 3 * u]);
        ctx.lineWidth = 1.6 * u;
        ctx.beginPath();
        ctx.arc(s.x, s.y, size * 2.6, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
      break;
    }
    default: break;
  }
}

/**
 * A contact's assignment, as the glass draws it.
 *
 * `bracket` is 'none' for a contact nobody holds, 'dashed' once a battery
 * has claimed it, 'solid' once that battery has a round in the air; `tag` is
 * the holder's name for the label block — the first word of it, with a
 * count when more than one battery is on the same contact. Pure, so a test
 * can hold the shape to the engine's state without a canvas.
 */
export function assignmentShape(world, track) {
  const holders = (track.assignedTo ?? [])
    .map((id) => world.siteById.get(id)?.name?.split(' ')[0])
    .filter(Boolean);
  const engaged = (track.engagedBy?.length ?? 0) > 0;
  const bracket = engaged ? 'solid' : holders.length ? 'dashed' : 'none';
  /*
   * ONE PAIR OF GLYPHS FOR ONE FACT.
   *
   * Assignment and engagement were encoded three ways in two panels a hand's
   * width apart: the shootlist said ◇ and ◆, this tag said → and ▲, and the
   * bracket round the contact said dashed and solid. A player who learned one
   * had learned none of the others. The tube and the list now use the same two
   * marks, and the nomenclature plate prints them beside the brackets they go
   * with.
   */
  const tag = holders.length
    ? `${engaged ? '◆ ' : '◇ '}${holders[0]}${holders.length > 1 ? ` +${holders.length - 1}` : ''}`
    : null;
  return { bracket, holders, tag };
}

/** Re-exported where it has always been imported from. It lives in labels.js. */
export { withAlpha };
