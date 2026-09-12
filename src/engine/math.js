/**
 * Geometry for the tactical picture.
 *
 * Conventions used everywhere in the engine:
 *   - Positions are {x, y} in kilometres on a flat plane. +x is east, +y is north.
 *     The origin is the centre of the defended area (the Ville).
 *   - Altitude is a separate scalar in metres. The sim is 2.5D: aircraft move in
 *     the plane and carry an altitude that matters for radar horizon and for
 *     weapon envelopes, but not for slant-range geometry (the error is under 2%
 *     at the ranges that matter, and it keeps the code honest).
 *   - Bearings are degrees, 0 = north, increasing clockwise, as read off a scope.
 *   - Speeds are km/s. A subsonic striker is ~0.25, a SAM ~1.0.
 */

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v) => clamp(v, 0, 1);
export const lerp = (a, b, t) => a + (b - a) * t;
/** Inverse lerp, clamped: where does v sit between a and b? */
export const invLerp = (a, b, v) => (b === a ? 0 : clamp01((v - a) / (b - a)));
export const smoothstep = (a, b, v) => {
  const t = invLerp(a, b, v);
  return t * t * (3 - 2 * t);
};

export const vec = (x = 0, y = 0) => ({ x, y });
export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a, k) => ({ x: a.x * k, y: a.y * k });
export const dot = (a, b) => a.x * b.x + a.y * b.y;
export const len = (a) => Math.hypot(a.x, a.y);
export const len2 = (a) => a.x * a.x + a.y * a.y;
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

export function norm(a) {
  const l = len(a);
  return l < 1e-9 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
}

/** Bearing from a to b, degrees, 0 = north, clockwise. */
export function bearing(a, b) {
  return wrapDeg(Math.atan2(b.x - a.x, b.y - a.y) * RAD);
}

/** Unit vector along a compass bearing. */
export function headingVec(deg) {
  const r = deg * DEG;
  return { x: Math.sin(r), y: Math.cos(r) };
}

/** Point at range km on bearing deg from origin point. */
export function polar(origin, deg, rangeKm) {
  const h = headingVec(deg);
  return { x: origin.x + h.x * rangeKm, y: origin.y + h.y * rangeKm };
}

/** Normalize to [0, 360). */
export function wrapDeg(d) {
  const m = d % 360;
  return m < 0 ? m + 360 : m;
}

/** Smallest signed difference b - a, in [-180, 180]. */
export function deltaDeg(a, b) {
  let d = (b - a) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

/** Absolute angular separation in [0, 180]. */
export function absDeltaDeg(a, b) {
  return Math.abs(deltaDeg(a, b));
}

/** Turn `from` toward `to` by at most maxDeg. */
export function turnToward(from, to, maxDeg) {
  const d = deltaDeg(from, to);
  return wrapDeg(from + clamp(d, -maxDeg, maxDeg));
}

/**
 * True if the beam moving clockwise from a0 to a1 crossed bearing b.
 *
 * The interval is half-open — (a0, a1] — which matters more than it looks. With
 * a closed interval a target sitting exactly on a step boundary is counted both
 * when the beam arrives at it and again when the next step departs from it,
 * giving that one bearing twice everyone else's update rate.
 */
export function sweptPast(a0, a1, b) {
  const span = wrapDeg(a1 - a0);
  if (span <= 0) return false;
  const offset = wrapDeg(b - a0);
  return offset > 0 && offset <= span;
}

/**
 * Radar line-of-sight horizon in km for two heights in metres.
 * The 4.12 coefficient is the standard 4/3-earth radio horizon approximation —
 * this single formula is why flying at 100 m works so well against a radar on a
 * 20 m mast, and it's the mechanic behind the "Low Riders" mission.
 */
export function radarHorizonKm(radarHeightM, targetHeightM) {
  return 4.12 * (Math.sqrt(Math.max(0, radarHeightM)) + Math.sqrt(Math.max(0, targetHeightM)));
}

/**
 * The same horizon the other way round: at a range of `rangeKm`, the lowest
 * altitude a set on a mast of `radarHeightM` can see. Zero out to the ground
 * horizon (4.12 √h km), then the parabola (r / 4.12 − √h)². The range-height
 * chart in the cabin draws this, so the chart and detection cannot disagree.
 */
export function horizonFloorM(radarHeightM, rangeKm) {
  const root = rangeKm / 4.12 - Math.sqrt(Math.max(0, radarHeightM));
  return root <= 0 ? 0 : root * root;
}

/**
 * Time until a constant-speed interceptor launched from `origin` meets a target
 * flying a constant course. Returns null when the target cannot be caught
 * (outrunning the missile, or opening faster than it closes).
 *
 * Solving |P + V t| = s t gives (V·V - s²)t² + 2(P·V)t + P·P = 0.
 */
export function interceptTime(origin, targetPos, targetVel, speed) {
  const p = sub(targetPos, origin);
  const a = len2(targetVel) - speed * speed;
  const b = 2 * dot(p, targetVel);
  const c = len2(p);

  if (Math.abs(a) < 1e-9) {
    // Target speed equals missile speed: the quadratic degenerates to linear.
    if (Math.abs(b) < 1e-9) return null;
    const t = -c / b;
    return t > 0 ? t : null;
  }

  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const root = Math.sqrt(disc);
  const t1 = (-b - root) / (2 * a);
  const t2 = (-b + root) / (2 * a);
  const candidates = [t1, t2].filter((t) => t > 0).sort((x, y) => x - y);
  return candidates.length ? candidates[0] : null;
}

/** Where to aim: the intercept point, or the target's present position if uncatchable. */
export function leadPoint(origin, targetPos, targetVel, speed) {
  const t = interceptTime(origin, targetPos, targetVel, speed);
  if (t === null) return { ...targetPos };
  return { x: targetPos.x + targetVel.x * t, y: targetPos.y + targetVel.y * t };
}

/**
 * Closing speed in km/s of `mover` relative to `point` — positive means closing.
 * Used for threat ranking and for time-to-go readouts.
 */
export function closureRate(moverPos, moverVel, point) {
  const toPoint = norm(sub(point, moverPos));
  return dot(moverVel, toPoint);
}

/** Seconds until `mover` reaches `point`, or Infinity if it is not closing. */
export function timeToGo(moverPos, moverVel, point) {
  const rate = closureRate(moverPos, moverVel, point);
  if (rate <= 1e-6) return Infinity;
  return dist(moverPos, point) / rate;
}

/** Format seconds as M:SS for the mission clock and countdowns. */
export function clockString(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
