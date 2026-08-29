/**
 * Seeded pseudo-random number generation.
 *
 * Every mission in IADSVille is reproducible from a seed: the same seed and the
 * same player inputs produce the same raid, the same detection rolls and the
 * same kills. That matters for debugging ("the striker at 2:14 should have been
 * seen") and it lets scenarios be tuned against a fixed sample.
 */

/** Hash an arbitrary string into a 32-bit seed. */
export function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * mulberry32 — small, fast, good enough for a game, and trivially portable so
 * the browser and `node --test` agree bit for bit.
 */
export function makeRng(seed) {
  let a = (typeof seed === 'string' ? hashSeed(seed) : seed >>> 0) || 1;

  /** Uniform in [0, 1). */
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    /** Uniform in [min, max). */
    range: (min, max) => min + next() * (max - min),
    /** Integer in [min, max]. */
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    /** True with probability p. */
    chance: (p) => next() < p,
    /** Uniform pick from an array. */
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    /** Normal-ish deviate via Box-Muller, clamped to +/-3 sigma. */
    gauss: (mean = 0, sd = 1) => {
      const u = Math.max(next(), 1e-9);
      const v = next();
      const g = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
      return mean + sd * Math.max(-3, Math.min(3, g));
    },
    /** Current internal state, for save/restore of a deterministic run. */
    state: () => a,
    setState: (s) => { a = s >>> 0; },
  };
}
