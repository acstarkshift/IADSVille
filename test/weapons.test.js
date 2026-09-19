import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  closestApproachKm, inEnvelope, timeToInRangeS, computeSamPk, computeArmPk,
  createMissile, stepMissiles,
} from '../src/engine/weapons.js';
import { SAM_TYPES, ENGAGEMENT, ARM, DIFFICULTY } from '../src/engine/config.js';
import { railLoadS, railsOf } from '../src/engine/doctrine.js';

const site = (type = 'lance') => ({ id: 's1', type, alive: true, pos: { x: 0, y: 0 } });
const target = (over = {}) => ({
  id: 'a1', type: 'striker', pos: { x: 0, y: 20 }, altM: 6000,
  evadingUntilS: -1, worldTimeS: 0, vel: { x: 0, y: -0.24 }, ...over,
});

describe('intercept detection', () => {
  test('a round that passes through its target does not tunnel', () => {
    // Rounds cover more ground in one step than their lethal radius, so checking
    // only the endpoints would let them fly straight through an aircraft.
    const endpointDistance = Math.min(
      Math.hypot(-0.2, 0.05), Math.hypot(0.2, 0.05));
    const swept = closestApproachKm({ x: -0.2, y: 0 }, { x: 0.2, y: 0 }, { x: 0, y: 0.05 }, { x: 0, y: 0.05 });
    assert.ok(swept < ENGAGEMENT.lethalRadiusKm, 'the swept path registers a hit');
    assert.ok(endpointDistance > ENGAGEMENT.lethalRadiusKm, 'the endpoints alone would have missed it');
  });

  test('a genuine miss stays a miss', () => {
    const d = closestApproachKm({ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 3 }, { x: 0, y: 3 });
    assert.ok(Math.abs(d - 3) < 1e-9);
  });

  test('a stationary pair reports its plain separation', () => {
    assert.ok(Math.abs(closestApproachKm({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 4 }) - 5) < 1e-9);
  });
});

describe('engagement envelope', () => {
  const s = site('lance');
  const type = SAM_TYPES.lance;

  test('accepts a target inside the box', () => {
    assert.equal(inEnvelope(s, { x: 0, y: 20 }, 6000).ok, true);
  });

  test('rejects for the right reason in each direction', () => {
    assert.equal(inEnvelope(s, { x: 0, y: type.maxRangeKm + 5 }, 6000).reason, 'OUT OF RANGE');
    assert.equal(inEnvelope(s, { x: 0, y: 1 }, 6000).reason, 'TOO CLOSE');
    assert.equal(inEnvelope(s, { x: 0, y: 20 }, type.maxAltM + 1000).reason, 'TOO HIGH');
    assert.equal(inEnvelope(s, { x: 0, y: 20 }, 10).reason, 'TOO LOW');
  });

  test('a dead battery cannot engage anything', () => {
    assert.equal(inEnvelope({ ...s, alive: false }, { x: 0, y: 20 }, 6000).ok, false);
  });
});

describe('time to in-range', () => {
  const s = site('lance');

  test('is zero for something already in the envelope', () => {
    assert.equal(timeToInRangeS(s, { pos: { x: 0, y: 20 }, altM: 6000, vel: { x: 0, y: -0.2 } }), 0);
  });

  test('counts down for a closing contact', () => {
    const t = timeToInRangeS(s, { pos: { x: 0, y: 100 }, altM: 6000, vel: { x: 0, y: -0.25 } });
    assert.ok(t > 200 && t < 260, `expected about four minutes, got ${t}`);
  });

  test('is infinite for a contact that is opening away', () => {
    assert.equal(timeToInRangeS(s, { pos: { x: 0, y: 100 }, altM: 6000, vel: { x: 0, y: 0.25 } }), Infinity);
  });

  test('is not-a-number while the course is still unknown', () => {
    // A track seen once has no velocity estimate. That must read as "unknown",
    // not as "unreachable", or batteries abandon fresh assignments.
    assert.ok(Number.isNaN(timeToInRangeS(s, { pos: { x: 0, y: 100 }, altM: 6000, vel: { x: 0, y: 0 } })));
  });
});

describe('kill probability', () => {
  const s = site('lance');
  const type = SAM_TYPES.lance;

  test('is best in the middle of the envelope and worst at the edge', () => {
    const sweet = computeSamPk(s, target({ pos: { x: 0, y: 15 } }), { unguidedS: 0 }, null);
    const edge = computeSamPk(s, target({ pos: { x: 0, y: type.maxRangeKm - 0.5 } }), { unguidedS: 0 }, null);
    assert.ok(sweet > edge * 1.8, `sweet spot ${sweet} should dominate the edge ${edge}`);
    assert.ok(sweet <= type.pkBase + 1e-9);
  });

  test('a defensive target is much harder to hit', () => {
    const steady = computeSamPk(s, target(), { unguidedS: 0 }, null);
    const evading = computeSamPk(s, target({ evadingUntilS: 30, worldTimeS: 0 }), { unguidedS: 0 }, null);
    assert.ok(evading < steady * 0.7, 'manoeuvring buys real survivability');
  });

  test('losing the guiding radar all but ruins the shot', () => {
    const guided = computeSamPk(s, target(), { unguidedS: 0 }, null);
    const blind = computeSamPk(s, target(), { unguidedS: 3 }, null);
    assert.ok(blind < guided * 0.2, 'this is the cost of blinking with a round in the air');
    assert.ok(Math.abs(blind / guided - ENGAGEMENT.unguidedPk) < 1e-6);
  });

  test('small low targets are the hardest problem', () => {
    const bomber = computeSamPk(s, target(), { unguidedS: 0 }, null);
    const cruise = computeSamPk(s, target({ type: 'cruise', altM: 90 }), { unguidedS: 0 }, null);
    /*
     * Half the shot, near enough. The bar was 0.5 against a flat altitude
     * cliff; the cliff is now a slope from the system's own floor, so a cruise
     * missile ninety metres up takes 0.76 of the low penalty rather than all
     * of it and lands at 0.52 of the bomber. It is still comfortably the
     * hardest target class in the game — two and a half rounds a kill against
     * the bomber's one and a quarter — which is the property this pins.
     */
    assert.ok(cruise < bomber * 0.55,
      `a cruise missile down low is a poor target for a medium battery `
      + `(${cruise.toFixed(2)} vs ${bomber.toFixed(2)})`);
  });

  test('difficulty scales the player’s rounds', () => {
    const easy = computeSamPk(s, target(), { unguidedS: 0 }, DIFFICULTY.rookie);
    const hard = computeSamPk(s, target(), { unguidedS: 0 }, DIFFICULTY.nightmare);
    assert.ok(easy > hard);
  });

  test('probability never leaves the unit interval', () => {
    const absurd = computeSamPk(site('bastion'), target({ pos: { x: 0, y: 0.1 }, altM: 0 }), { unguidedS: 0 }, DIFFICULTY.rookie);
    assert.ok(absurd >= 0 && absurd <= 1, `got ${absurd}`);
  });
});

describe('anti-radiation rounds', () => {
  test('a radiating set is very likely to be hit', () => {
    assert.ok(computeArmPk({ state: 'radiating' }, { targetDarkS: 0 }, null) > 0.8);
  });

  test('shutting down late still leaves real danger', () => {
    const pk = computeArmPk({ state: 'off' }, { targetDarkS: 4 }, null);
    assert.ok(Math.abs(pk - ARM.pkMemory) < 1e-9);
    assert.ok(pk > 0.2, 'the round remembers where the radar was');
  });

  test('shutting down early mostly works', () => {
    const pk = computeArmPk({ state: 'off' }, { targetDarkS: ARM.earlyShutdownS + 2 }, null);
    assert.ok(pk < 0.12, 'this is the whole reason to blink');
  });

  test('the blink is worth an order of magnitude', () => {
    const emitting = computeArmPk({ state: 'radiating' }, { targetDarkS: 0 }, null);
    const early = computeArmPk({ state: 'off' }, { targetDarkS: 30 }, null);
    assert.ok(emitting / early > 5);
  });
});

describe('the ready rack', () => {
  /*
   * The loaders hand rounds up one at a time, and the arithmetic that keeps
   * the ammunition economy exactly where it was is that a whole rack still
   * costs `reloadS`. Pinned per type, because the temptation when a battery
   * feels starved is to shave the rail interval, and shaving it is a
   * difficulty change wearing a mechanism's clothes.
   */
  test('a rail costs the whole reload divided by the rails, for every type', () => {
    for (const type of Object.values(SAM_TYPES)) {
      const s = { type: type.id };
      assert.equal(railsOf(s), type.readyRounds, `${type.label} has one rail per ready round`);
      assert.ok(Math.abs(railLoadS(s) * type.readyRounds - type.reloadS) < 1e-9,
        `${type.label}: ${type.readyRounds} rails at ${railLoadS(s)}s must come to ${type.reloadS}s`);
    }
  });

  test('a rack scaled by a deep-magazine crew still fills in reloadS', () => {
    // `rails` is the rack the crew was actually issued, not the type's, so a
    // qualification that deepens the rack does not also slow the reload.
    const s = { type: 'lance', rails: 10 };
    assert.equal(railsOf(s), 10);
    assert.ok(Math.abs(railLoadS(s) * 10 - SAM_TYPES.lance.reloadS) < 1e-9);
  });

  test('battle damage slows the loaders and nothing else', () => {
    const hurt = { type: 'bastion', reloadMult: 1.4 };
    assert.ok(Math.abs(railLoadS(hurt) / railLoadS({ type: 'bastion' }) - 1.4) < 1e-9);
  });
});

describe('the intercept is resolved in three dimensions', () => {
  /*
   * Measured before this: five per cent of all surface-to-air kills scored
   * with the round drawn more than one lethal radius from the aeroplane in the
   * VERTICAL, 1.5% more than a kilometre, worst case 6,380 m. The intercept
   * read the ground plane alone and the flight profile was declared display
   * truth, so the one instrument the missile seat is built around could be
   * flatly contradicted by the outcome.
   */
  const bareWorld = () => ({
    t: 0, dt: 0.1, missiles: [], effects: [],
    aircraftById: new Map(), siteById: new Map(), radarById: new Map(), assetById: new Map(),
    rng: { chance: () => true }, difficulty: {}, stats: {},
    killMissile(m, why) { m.alive = false; m.why = why; },
    killed: [],
    killAircraft(a) { this.killed.push(a.id); },
    log() {}, comms() {}, onMissileMiss() {}, markTracksDown() {},
  });

  const shootAt = (targetAltM, roundAltM) => {
    const world = bareWorld();
    const site = { id: 's1', type: 'bastion', alive: true, pos: { x: 0, y: 0 } };
    const radar = { id: 'r1', pos: site.pos, state: 'radiating', alive: true };
    const target = { id: 'a1', alive: true, type: 'striker', pos: { x: 0, y: 0.03 },
      altM: targetAltM, vel: { x: 0, y: 0 }, evadingUntilS: -1, worldTimeS: 0 };
    world.siteById.set(site.id, site);
    world.radarById.set(radar.id, radar);
    world.aircraftById.set(target.id, target);
    const m = createMissile({ seq: 1, kind: 'sam', pos: { x: 0, y: 0 }, altM: roundAltM,
      speed: 1.2, hdg: 0, targetKind: 'aircraft', targetId: target.id,
      siteId: site.id, radarId: radar.id });
    // Held at the height under test: this is about the fuze, not the climb.
    m.runKm = 60;
    m.arcF = 0;
    world.missiles.push(m);
    Object.defineProperty(m, 'altM', { get: () => roundAltM, set: () => {}, configurable: true });
    world.t += world.dt;
    stepMissiles(world, world.dt);
    return world.killed.length > 0;
  };

  test('a round beside its target destroys it', () => {
    assert.equal(shootAt(8000, 8000), true);
  });

  test('a round two vertical miles under its target does not', () => {
    assert.equal(shootAt(8000, 20), false);
  });

  test('the gate is three lethal radii, and it is generous below that', () => {
    const lethalM = ENGAGEMENT.lethalRadiusKm * 1000 * ENGAGEMENT.verticalLethalMult;
    assert.equal(shootAt(8000, 8000 - lethalM * 0.9), true, 'inside the fuze');
    assert.equal(shootAt(8000, 8000 - lethalM * 1.2), false, 'outside it');
  });
});
