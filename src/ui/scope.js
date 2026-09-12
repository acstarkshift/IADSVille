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
import { watchConditions } from '../engine/scenarios.js';
import { MAP } from '../engine/geography.js';
import { SAM_TYPES, ASSET_TYPES, AIR_TYPES } from '../engine/config.js';
import { bearing, headingVec, len, clamp01 } from '../engine/math.js';
import { trackProfile } from '../engine/detection.js';

const TAU = Math.PI * 2;

export class Scope {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.paint = document.createElement('canvas');
    this.paintCtx = this.paint.getContext('2d');
    this.dpr = 1;
    this.w = 0;
    this.h = 0;
    this.rangeKm = 150;
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

  zoom(factor) {
    this.rangeKm = Math.max(15, Math.min(260, this.rangeKm * factor));
  }

  /**
   * Queue a label instead of drawing it immediately.
   *
   * Six batteries, six defended assets and two radars sit inside twenty
   * kilometres of the town, so at sector zoom their names land on top of each
   * other and the map becomes unreadable. Labels are therefore collected,
   * sorted by how much the operator needs them, and placed greedily in the
   * first candidate position that does not collide with one already placed.
   */
  queueLabel(spec) {
    this.labelQueue.push(spec);
  }

  /** Place queued labels, most important first, skipping ones with nowhere to go. */
  flushLabels() {
    const { ctx } = this;
    const placed = [];
    const pad = 2 * this.dpr;

    const overlaps = (box) => placed.some((b) =>
      box.x < b.x + b.w + pad && box.x + box.w + pad > b.x
      && box.y < b.y + b.h + pad && box.y + box.h + pad > b.y);

    this.labelQueue.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    for (const label of this.labelQueue) {
      const lines = label.lines ?? [label.text];
      ctx.font = label.font ?? `${9.5 * this.dpr}px ${FONT}`;
      const w = Math.max(...lines.map((l) => ctx.measureText(l).width));
      const lineH = 10 * this.dpr;
      const h = lineH * lines.length;
      const off = (label.offset ?? 6) * this.dpr;

      // Right, left, above, below — in that order, because reading rightward is
      // the habit and the other placements are fallbacks.
      const candidates = [
        { x: label.x + off, y: label.y - h / 2 },
        { x: label.x - off - w, y: label.y - h / 2 },
        { x: label.x - w / 2, y: label.y - off - h },
        { x: label.x - w / 2, y: label.y + off },
      ];

      let box = candidates.find((c) => !overlaps({ x: c.x, y: c.y, w, h }));
      if (!box) {
        if (!label.force) continue;   // low-priority labels simply give way
        box = candidates[0];
      }
      placed.push({ x: box.x, y: box.y, w, h });

      lines.forEach((line, i) => {
        ctx.fillStyle = label.colours?.[i] ?? label.colour;
        ctx.fillText(line, box.x, box.y + lineH * (i + 0.8));
      });
    }
    this.labelQueue = [];
  }

  /** Stable per-id slot so a label never jitters between frames. */
  labelSlot(id) {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
    return Math.abs(h);
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

    this.updatePaint(world, frameDtS);
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
    this.flushLabels();
    this.drawChrome(world, ui);

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
  updatePaint(world, frameDtS = 1 / 60) {
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

    for (const plot of world.plots ?? []) {
      const s = this.toScreen(plot.pos);
      const r = Math.max(1.6, 3.2 * this.dpr);
      const alpha = 0.55 + 0.45 * clamp01(plot.strength ?? 0.5);
      ctx.fillStyle = p.accent;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, TAU);
      ctx.fill();
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

    // High ground: filled, with a lighter crest line so ridges read as ridges.
    for (const range of MAP.highGround) {
      path(range.points, true);
      ctx.fillStyle = withAlpha(p.inkDim, 0.07);
      ctx.fill();
      ctx.strokeStyle = withAlpha(p.inkDim, 0.22);
      ctx.lineWidth = 1 * this.dpr;
      ctx.stroke();
    }

    for (const lake of MAP.lakes) {
      path(lake.points, true);
      ctx.fillStyle = withAlpha(p.friendly, 0.09);
      ctx.fill();
      ctx.strokeStyle = withAlpha(p.friendly, 0.24);
      ctx.stroke();
    }

    for (const river of MAP.rivers) {
      path(river.points);
      ctx.strokeStyle = riverMarked
        ? withAlpha(p.hostile, riverFlashing ? 0.85 : 0.45)
        : withAlpha(p.friendly, 0.19);
      ctx.lineWidth = (riverMarked ? (riverFlashing ? 2.4 : 1.8) : 1.2) * this.dpr;
      ctx.stroke();
    }

    ctx.setLineDash([6 * this.dpr, 5 * this.dpr]);
    for (const road of MAP.roads) {
      path(road.points);
      ctx.strokeStyle = withAlpha(p.inkDim, 0.3);
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
    ctx.strokeStyle = withAlpha(p.unknown, 0.3);
    ctx.stroke();
    ctx.setLineDash([]);

    // Place names go through the same declutter pass as everything else, at the
    // lowest priority on the board: geography gives way to anything flying.
    if (s > 1.1) {
      for (const town of MAP.settlements) {
        const q = this.toScreen(town.pos);
        ctx.fillStyle = withAlpha(p.inkDim, town.capital ? 0.55 : 0.36);
        ctx.beginPath();
        ctx.arc(q.x, q.y, (town.capital ? 3 : 2) * this.dpr, 0, TAU);
        ctx.fill();
        this.queueLabel({
          // One name, in English. Every town used to be lettered twice —
          // the Cyrillic over the English — which doubled the text on the
          // tube for no one's benefit; the player asked for the Cyrillic to
          // be scaled back to the plates, and a map label is not a plate.
          text: town.en,
          colour: withAlpha(p.inkDim, town.capital ? 0.7 : 0.5),
          x: q.x, y: q.y,
          priority: town.capital ? 8 : 4,
          offset: 5,
        });
      }
    }
    ctx.restore();
  }

  drawGrid(world) {
    const { ctx } = this;
    const p = this.palette;
    const centre = this.toScreen(this.origin);
    const step = this.rangeKm > 160 ? 50 : this.rangeKm > 80 ? 25 : 10;

    ctx.save();
    ctx.strokeStyle = p.grid;
    ctx.fillStyle = p.inkDim;
    ctx.lineWidth = 1;
    ctx.font = `${10 * this.dpr}px ${FONT}`;

    for (let r = step; r <= this.rangeKm * 1.6; r += step) {
      const px = r * this.scale;
      ctx.beginPath();
      ctx.arc(centre.x, centre.y, px, 0, TAU);
      ctx.stroke();
      ctx.fillText(`${r}`, centre.x + 3 * this.dpr, centre.y - px - 3 * this.dpr);
    }

    // Bearing spokes every thirty degrees, labelled at the edge.
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

      // The boresight itself — the line the crew has actually chosen.
      const h = headingVec(radar.boresightDeg);
      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      ctx.lineTo(origin.x + h.x * reach, origin.y - h.y * reach);
      ctx.strokeStyle = withAlpha(p.accent, lit ? 0.42 : 0.2);
      ctx.setLineDash([3 * this.dpr, 5 * this.dpr]);
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

      this.queueLabel({
        lines: [formation.name, held ? 'DIRECT' : handover
          ? `HANDOVER ${Math.ceil(formation.handoverUntilS - world.t)}s`
          : (formation.commander?.name ?? 'SUBORDINATE')],
        x: s.x, y: s.y,
        colours: [colour, p.inkDim],
        colour,
        priority: held ? 64 : 40,
        offset: 16 * this.dpr,
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

      this.queueLabel({
        text: designated ? `${asset.label} · PRIORITY` : asset.label,
        x: s.x, y: s.y,
        colour: asset.destroyed || designated ? p.hostile : p.inkDim,
        // A destroyed or burning asset is worth the space; an intact one gives
        // way. A designated one outranks both — it is the only place on this
        // map the file will ask you about by name.
        priority: designated ? 90 : asset.destroyed ? 60 : hurt > 0 ? 50 : 20,
        force: designated,
        offset: designated ? size * 3 : size + 3,
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
      this.queueLabel({
        text: `${site.name}${site.alive ? ` ${site.readyRounds}${busy}` : ' ✕'}`,
        x: s.x, y: s.y,
        colour: !site.alive ? p.inkDim : site.engagements.length ? p.warn : p.ink,
        priority: selected || crewed ? 90 : 45,
        force: selected || crewed,
        offset: size + 3,
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
      this.queueLabel({
        text: radar.alive ? radar.label : `${radar.label} ✕`,
        x: s.x, y: s.y,
        colour: radar.alive ? p.inkDim : p.hostile,
        priority: radar.alive ? 40 : 65,
        offset: r + 3,
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
      if (!missile.alive || missile.tofS < 0) continue;
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
      }
    }
  }

  drawTracks(world, ui) {
    const { ctx } = this;
    const p = this.palette;
    const standard = this.theme.symbology === 'standard';
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
        this.queueLabel({
          lines: [`${track.tn} ✕`],
          x: s.x, y: s.y,
          colours: [colour], colour,
          priority: 60, offset: bloom + 3,
        });
        continue;
      }

      ctx.save();
      ctx.globalAlpha = track.coasting ? 0.5 : 1;
      ctx.strokeStyle = colour;
      ctx.fillStyle = colour;
      ctx.lineWidth = (selected ? 2.2 : 1.4) * this.dpr;

      if (standard) {
        drawStandardSymbol(ctx, s, size, track);
      } else {
        ctx.beginPath();
        ctx.arc(s.x, s.y, size * 0.55, 0, TAU);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(s.x, s.y, size, 0, TAU);
        ctx.stroke();
      }

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
      this.queueLabel({
        lines: [track.tn, `${String(alt).padStart(3, '0')} ${label}`,
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
        force: selected,
        offset: size + 4,
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
    if (!edge.length) return;
    const { ctx } = this;
    const cx = this.w / 2;
    const cy = this.h / 2;
    // The top inset clears the two readouts the tube draws at y=16 and y=30;
    // a caret printed over RANGE 140 KM is worse than no caret.
    const inset = { top: 46 * this.dpr, side: 30 * this.dpr, bottom: 18 * this.dpr };
    ctx.save();
    ctx.font = `${8.5 * this.dpr}px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
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
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = colour;
      ctx.textAlign = onSide ? (x > cx ? 'right' : 'left') : 'center';
      ctx.fillText(`${track.tn} ${Math.round(len(track.pos))}`,
        onSide ? x - Math.sign(dx) * inward : x,
        onSide ? y : y + Math.sign(-dy) * inward);
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
    const { ctx } = this;
    const p = this.palette;
    ctx.save();
    ctx.font = `${10 * this.dpr}px ${FONT}`;
    ctx.fillStyle = p.inkDim;
    ctx.fillText(`RANGE ${Math.round(this.rangeKm)} KM`, 10 * this.dpr, 16 * this.dpr);
    // The hour and the weather, under the range: the watch's own time of
    // night, which is one of the things that tells this watch from the last.
    ctx.fillText(watchConditions(world.scenario, world.t).line, 10 * this.dpr, 30 * this.dpr);
    if (!world.fusionOnline) {
      ctx.fillStyle = p.hostile;
      // What it means for the person looking at the tube, not the name of
      // the mode: every radar is now reporting on its own, and the same
      // aircraft can wear a different track number on each of them.
      ctx.fillText('SECTOR LINK DOWN — EACH RADAR REPORTS ON ITS OWN', 10 * this.dpr, 44 * this.dpr);
    }
    ctx.restore();
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

const FONT = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

/** Approximate MIL-STD-2525 air frames: diamond hostile, dome friendly, quatrefoil unknown. */
function drawStandardSymbol(ctx, s, size, track) {
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

/** Add an alpha channel to a hex or rgb colour string from the theme. */
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
  const tag = holders.length
    ? `${engaged ? '▲ ' : '→ '}${holders[0]}${holders.length > 1 ? ` +${holders.length - 1}` : ''}`
    : null;
  return { bracket, holders, tag };
}

export function withAlpha(colour, alpha) {
  const c = colour.trim();
  if (c.startsWith('#')) {
    const hex = c.length === 4
      ? c.slice(1).split('').map((ch) => ch + ch).join('')
      : c.slice(1);
    const n = parseInt(hex, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }
  if (c.startsWith('rgb(')) return c.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`);
  return c;
}
