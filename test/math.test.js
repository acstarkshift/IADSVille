import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  bearing, polar, wrapDeg, deltaDeg, sweptPast, turnToward, radarHorizonKm,
  interceptTime, leadPoint, timeToGo, closureRate, clockString, dist,
} from '../src/engine/math.js';
import { makeRng } from '../src/engine/rng.js';

describe('geometry', () => {
  test('bearings read like a compass rose', () => {
    const o = { x: 0, y: 0 };
    assert.equal(bearing(o, { x: 0, y: 1 }), 0);
    assert.equal(bearing(o, { x: 1, y: 0 }), 90);
    assert.equal(bearing(o, { x: 0, y: -1 }), 180);
    assert.equal(bearing(o, { x: -1, y: 0 }), 270);
  });

  test('polar and bearing are inverses', () => {
    for (const deg of [0, 37, 90, 181, 270, 359]) {
      const p = polar({ x: 0, y: 0 }, deg, 42);
      assert.ok(Math.abs(deltaDeg(deg, bearing({ x: 0, y: 0 }, p))) < 1e-6);
      assert.ok(Math.abs(dist({ x: 0, y: 0 }, p) - 42) < 1e-9);
    }
  });

  test('angle wrapping handles the 360 seam', () => {
    assert.equal(wrapDeg(-10), 350);
    assert.equal(wrapDeg(370), 10);
    assert.equal(deltaDeg(350, 10), 20);
    assert.equal(deltaDeg(10, 350), -20);
    assert.equal(turnToward(350, 10, 5), 355);
    assert.equal(turnToward(350, 10, 90), 10);
  });

  test('a sweep crossing north is still a crossing', () => {
    assert.ok(sweptPast(350, 10, 0), 'beam passing through north crosses 000');
    assert.ok(sweptPast(350, 10, 355));
    assert.ok(!sweptPast(350, 10, 180));
    assert.ok(!sweptPast(10, 20, 350));
  });

  test('the swept interval is half-open, so a bearing is not counted twice', () => {
    // The beam arriving at a bearing counts; the next step departing from that
    // same bearing must not count it again, or that one azimuth gets double the
    // update rate of every other.
    assert.ok(sweptPast(350, 10, 10), 'arriving at the bearing counts');
    assert.ok(!sweptPast(10, 30, 10), 'departing from it does not count again');
  });
});

describe('radar horizon', () => {
  test('a low target is hidden far sooner than a high one', () => {
    const low = radarHorizonKm(30, 100);
    const high = radarHorizonKm(30, 8000);
    assert.ok(low > 50 && low < 70, `low horizon was ${low}`);
    assert.ok(high > 380, `high horizon was ${high}`);
    assert.ok(high / low > 5, 'altitude should buy an order-of-magnitude of warning');
  });

  test('horizon grows with the square root of height, not linearly', () => {
    const a = radarHorizonKm(0, 100);
    const b = radarHorizonKm(0, 400);
    assert.ok(Math.abs(b / a - 2) < 1e-9, 'four times the altitude is twice the range');
  });
});

describe('intercept geometry', () => {
  test('head-on intercept closes at the sum of the speeds', () => {
    const t = interceptTime({ x: 0, y: 0 }, { x: 0, y: 100 }, { x: 0, y: -0.25 }, 1);
    assert.ok(Math.abs(t - 80) < 1e-6, `expected 80 s, got ${t}`);
  });

  test('a target running faster than the round cannot be caught', () => {
    assert.equal(interceptTime({ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 0, y: 2 }, 1), null);
  });

  test('the lead point is where the target will be, not where it is', () => {
    const target = { x: 50, y: 50 };
    const vel = { x: -0.2, y: 0 };
    const lead = leadPoint({ x: 0, y: 0 }, target, vel, 1);
    assert.ok(lead.x < target.x, 'lead should be ahead of a westbound target');
    // The round and the target must arrive at the lead point together.
    const t = interceptTime({ x: 0, y: 0 }, target, vel, 1);
    assert.ok(Math.abs(dist({ x: 0, y: 0 }, lead) / 1 - t) < 1e-6);
  });

  test('closure and time-to-go agree about who is closing', () => {
    const pos = { x: 0, y: 100 };
    assert.ok(closureRate(pos, { x: 0, y: -0.25 }, { x: 0, y: 0 }) > 0);
    assert.equal(timeToGo(pos, { x: 0, y: 0.25 }, { x: 0, y: 0 }), Infinity);
    assert.ok(Math.abs(timeToGo(pos, { x: 0, y: -0.25 }, { x: 0, y: 0 }) - 400) < 1e-6);
  });
});

describe('seeded randomness', () => {
  test('the same seed replays the same mission', () => {
    const a = makeRng('watch-01');
    const b = makeRng('watch-01');
    const left = Array.from({ length: 200 }, () => a.next());
    const right = Array.from({ length: 200 }, () => b.next());
    assert.deepEqual(left, right);
  });

  test('different seeds diverge', () => {
    const a = makeRng('watch-01');
    const b = makeRng('watch-02');
    assert.notEqual(a.next(), b.next());
  });

  test('the distribution is not obviously broken', () => {
    const rng = makeRng(99);
    let sum = 0;
    let min = 1;
    let max = 0;
    for (let i = 0; i < 50000; i++) {
      const v = rng.next();
      sum += v;
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    assert.ok(Math.abs(sum / 50000 - 0.5) < 0.01, 'mean should be near a half');
    assert.ok(min < 0.001 && max > 0.999, 'should cover the unit interval');
  });

  test('state can be saved and restored mid-run', () => {
    const rng = makeRng('resume');
    rng.next();
    const saved = rng.state();
    const expected = [rng.next(), rng.next()];
    rng.setState(saved);
    assert.deepEqual([rng.next(), rng.next()], expected);
  });
});

test('the mission clock formats as minutes and seconds', () => {
  assert.equal(clockString(0), '0:00');
  assert.equal(clockString(9), '0:09');
  assert.equal(clockString(125), '2:05');
  assert.equal(clockString(-5), '0:00');
});
