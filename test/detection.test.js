import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  effectiveRangeKm, detectionProbability, sweepRadar, stepRadarPower,
  correlatePlots, ageTracks, trackProfile,
} from '../src/engine/detection.js';
import { DETECTION, AIR_TYPES } from '../src/engine/config.js';
import { makeRng } from '../src/engine/rng.js';

const radar = (over = {}) => ({
  id: 'r1', pos: { x: 0, y: 0 }, rangeKm: 300, heightM: 30, minRangeKm: 0.5,
  scanPeriodS: 12, warmupS: 10, elintGain: 1, alive: true, on: false, state: 'off',
  warmRemainingS: 0, rebootRemainingS: 0, az: 0, emitS: 0, exposure: 0,
  noiseFactor: 1, deadSectors: [], ...over,
});
const target = (over = {}) => ({
  id: 'a1', type: 'striker', alive: true, pos: { x: 0, y: 100 }, altM: 8000, rcs: 5, ...over,
});

describe('detection range', () => {
  test('range scales as the fourth root of radar cross-section', () => {
    // A short-range set and a high contact, so the horizon does not cap either
    // figure and the RCS term is the only thing being measured.
    const r = radar({ rangeKm: 100 });
    const big = effectiveRangeKm(r, target({ rcs: 16, altM: 12000 }));
    const small = effectiveRangeKm(r, target({ rcs: 1, altM: 12000 }));
    assert.ok(Math.abs(big / small - 2) < 1e-6, 'sixteen times the RCS is twice the range');
  });

  test('the horizon caps whatever the power budget would allow', () => {
    const r = radar({ rangeKm: 300 });
    const eff = effectiveRangeKm(r, target({ rcs: 100, altM: 150 }));
    assert.ok(eff < 90, `a huge low contact is still horizon-limited, got ${eff}`);
  });

  test('a low target is horizon-limited, not power-limited', () => {
    const r = radar();
    const high = effectiveRangeKm(r, target({ altM: 8000 }));
    const low = effectiveRangeKm(r, target({ altM: 100 }));
    assert.ok(high > 300, `high contact should be seen far out, got ${high}`);
    assert.ok(low < 75, `a contact at 100 m should be horizon-limited, got ${low}`);
  });

  test('a cruise missile at ninety metres gets seen very late indeed', () => {
    const eff = effectiveRangeKm(radar(), target({ type: 'cruise', rcs: 0.1, altM: 90 }));
    assert.ok(eff < 70, `expected under 70 km of warning, got ${eff}`);
  });

  test('battle damage blinds a wedge completely', () => {
    const r = radar({ deadSectors: [{ az: 0, halfWidthDeg: 20 }] });
    assert.equal(effectiveRangeKm(r, target({ pos: { x: 0, y: 100 } })), 0, 'due north is dead');
    assert.ok(effectiveRangeKm(r, target({ pos: { x: 100, y: 0 } })) > 0, 'due east still works');
  });
});

describe('jamming', () => {
  const jammerAt = (pos) => [{ pos }];

  test('main-lobe jamming collapses detection to a burnthrough range', () => {
    const r = radar();
    const clean = effectiveRangeKm(r, target());
    const jammed = effectiveRangeKm(r, target(), jammerAt({ x: 0, y: 200 }));
    assert.ok(jammed < clean / 4, `jamming should dominate: ${jammed} vs ${clean}`);
  });

  test('burnthrough improves as the jammer is pushed further out', () => {
    const r = radar();
    const near = effectiveRangeKm(r, target(), jammerAt({ x: 0, y: 120 }));
    const far = effectiveRangeKm(r, target(), jammerAt({ x: 0, y: 240 }));
    assert.ok(far > near, 'a more distant jammer is a weaker jammer');
  });

  test('off-axis targets only suffer sidelobe degradation', () => {
    const r = radar();
    const clean = effectiveRangeKm(r, target({ pos: { x: 100, y: 0 } }));
    const sidelobe = effectiveRangeKm(r, target({ pos: { x: 100, y: 0 } }), jammerAt({ x: 0, y: 200 }));
    assert.ok(sidelobe < clean, 'some degradation everywhere');
    assert.ok(sidelobe > clean * 0.8, 'but not the collapse seen in the main lobe');
  });
});

describe('probability of detection', () => {
  test('fifty per cent at nominal range, rolling off fast', () => {
    assert.ok(Math.abs(detectionProbability(100, 100, 8000) - 0.5) < 1e-9);
    assert.ok(detectionProbability(100, 60, 8000) > 0.88);
    assert.ok(detectionProbability(100, 200, 8000) < 0.07);
    assert.equal(detectionProbability(0, 50, 8000), 0);
  });

  test('ground clutter penalises low contacts at range', () => {
    const high = detectionProbability(100, 80, 5000);
    const low = detectionProbability(100, 80, 50);
    assert.ok(low < high * 0.7, 'a contact in the weeds is harder to pick out');
  });
});

describe('emission state machine', () => {
  test('a radar takes its warmup time to come up', () => {
    const r = radar({ on: true, warmupS: 10 });
    stepRadarPower(r, 1);
    assert.equal(r.state, 'warming');
    for (let i = 0; i < 12; i++) stepRadarPower(r, 1);
    assert.equal(r.state, 'radiating');
  });

  test('shutting down is instant, and coming back is not', () => {
    const r = radar({ on: true, warmupS: 10 });
    for (let i = 0; i < 12; i++) stepRadarPower(r, 1);
    r.on = false;
    stepRadarPower(r, 0.1);
    assert.equal(r.state, 'off', 'going dark is immediate');
    r.on = true;
    stepRadarPower(r, 0.1);
    assert.equal(r.state, 'warming', 'but coming back costs the warmup again');
  });

  test('exposure accumulates while radiating and decays while dark', () => {
    const r = radar({ on: true, warmupS: 0 });
    for (let i = 0; i < 100; i++) stepRadarPower(r, 1);
    const hot = r.exposure;
    assert.ok(hot > 0.3, `expected meaningful exposure, got ${hot}`);
    r.on = false;
    for (let i = 0; i < 100; i++) stepRadarPower(r, 1);
    assert.ok(r.exposure < hot, 'going quiet cools you off');
  });

  test('a radar that is not radiating produces no plots at all', () => {
    const r = radar({ on: false });
    const plots = sweepRadar(r, [target()], [], makeRng(1), 1);
    assert.equal(plots.length, 0);
  });
});

describe('sweeping', () => {
  test('a target is rolled once per beam crossing, not once per tick', () => {
    const r = radar({ on: true, warmupS: 0, scanPeriodS: 12, az: 0 });
    stepRadarPower(r, 0.1);
    const rng = makeRng('sweep');
    const revolutions = 3;
    const ticks = (12 * revolutions) / 0.1;
    let plots = 0;
    for (let i = 0; i < ticks; i++) {
      // A close, large contact: detection probability is effectively one, so any
      // shortfall is the sweep gating looks rather than the roll failing.
      plots += sweepRadar(r, [target({ pos: { x: 0, y: 40 } })], [], rng, 0.1).length;
    }
    assert.ok(plots >= revolutions && plots <= revolutions + 2,
      `expected about one look per revolution over ${revolutions} scans, got ${plots}`);
    assert.ok(plots < ticks / 10, 'and emphatically not one per simulation step');
  });

  test('nothing is detected inside the overhead cone of silence', () => {
    const r = radar({ on: true, warmupS: 0, minRangeKm: 2 });
    stepRadarPower(r, 0.1);
    const rng = makeRng('cone');
    let plots = 0;
    for (let i = 0; i < 300; i++) {
      plots += sweepRadar(r, [target({ pos: { x: 0, y: 0.5 } })], [], rng, 0.1).length;
    }
    assert.equal(plots, 0, 'a contact directly overhead is invisible');
  });
});

/** A minimal world stand-in: correlation only needs these few fields. */
function fakeWorld(over = {}) {
  return {
    t: 0, nextTn: 1, tracks: new Map(), fusionOnline: true,
    // A real World always carries these; the stub mirrors it so the tests are
    // exercising the same code path the game does.
    modifiers: { idSpeedMult: 1 },
    aircraftById: new Map([['a1', { id: 'a1', type: 'striker' }]]),
    // Rounds in flight are trackable contacts too, so the stub resolves truth
    // exactly the way World.truthOf does — aircraft first, then the enemy's
    // rounds — or these tests would be exercising a path the game does not.
    missiles: [],
    truthOf(track) {
      return this.aircraftById.get(track.truthId)
        ?? this.missiles.find((m) => m.id === track.truthId)
        ?? null;
    },
    dropped: [],
    dropTrack(id, reason) { this.dropped.push(reason); this.tracks.delete(id); },
    ...over,
  };
}

describe('track correlation', () => {
  const plot = (over = {}) => ({ radarId: 'r1', truthId: 'a1', pos: { x: 0, y: 100 }, altM: 8000, ...over });

  test('a first plot creates a numbered track', () => {
    const w = fakeWorld();
    correlatePlots(w, [plot()]);
    assert.equal(w.tracks.size, 1);
    assert.equal([...w.tracks.values()][0].tn, 'T-001');
  });

  test('nearby plots join the existing track and build a velocity estimate', () => {
    const w = fakeWorld();
    correlatePlots(w, [plot()]);
    w.t = 10;
    correlatePlots(w, [plot({ pos: { x: 0, y: 98 } })]);
    assert.equal(w.tracks.size, 1, 'still one aircraft');
    const track = [...w.tracks.values()][0];
    assert.ok(track.vel.y < 0, 'the track is moving south');
    assert.ok(track.quality > DETECTION.qualityGain, 'quality builds with each look');
  });

  test('a distant plot starts a separate track', () => {
    const w = fakeWorld();
    correlatePlots(w, [plot()]);
    correlatePlots(w, [plot({ pos: { x: 60, y: 100 }, truthId: 'a2' })]);
    assert.equal(w.tracks.size, 2);
  });

  test('without central fusion, each radar grows its own track on one aircraft', () => {
    const fused = fakeWorld();
    correlatePlots(fused, [plot({ radarId: 'r1' })]);
    correlatePlots(fused, [plot({ radarId: 'r2', pos: { x: 0.4, y: 100.3 } })]);
    assert.equal(fused.tracks.size, 1, 'fusion reconciles the two reports');

    const split = fakeWorld({ fusionOnline: false });
    correlatePlots(split, [plot({ radarId: 'r1' })]);
    correlatePlots(split, [plot({ radarId: 'r2', pos: { x: 0.4, y: 100.3 } })]);
    assert.equal(split.tracks.size, 2, 'without the centre, the raid appears to double');
  });
});

describe('track ageing', () => {
  test('a track with no updates coasts, then drops', () => {
    const w = fakeWorld();
    correlatePlots(w, [{ radarId: 'r1', truthId: 'a1', pos: { x: 0, y: 100 }, altM: 8000 }]);
    const track = [...w.tracks.values()][0];
    track.vel = { x: 0, y: -0.25 };
    track.quality = 1;

    for (let i = 0; i < DETECTION.coastAfterS * 10 + 20; i++) { w.t += 0.1; ageTracks(w, 0.1); }
    assert.ok(track.coasting, 'a quiet track starts dead reckoning');
    assert.ok(track.pos.y < 100, 'and keeps flying the last known course');

    for (let i = 0; i < DETECTION.dropAfterS * 10; i++) { w.t += 0.1; ageTracks(w, 0.1); }
    assert.equal(w.tracks.size, 0, 'eventually it is dropped');
    assert.ok(w.dropped.includes('lost'));
  });

  test('identification resolves with sustained good-quality observation', () => {
    const w = fakeWorld();
    correlatePlots(w, [{ radarId: 'r1', truthId: 'a1', pos: { x: 0, y: 100 }, altM: 8000 }]);
    const track = [...w.tracks.values()][0];
    for (let i = 0; i < 400; i++) {
      track.quality = 1;                 // hold it firm, as repeated looks would
      track.lastUpdateS = w.t;
      w.t += 0.1;
      ageTracks(w, 0.1);
    }
    assert.equal(track.hostility, 'hostile');
    assert.equal(track.classification, 'striker');
  });

  test('a decoy reads as a striker until proximity or sustained attention gives it away', () => {
    /*
     * Two tells, priced differently. The free one is range: inside tellRangeKm
     * the flight is too perfect to be a crew, but by then batteries have
     * usually fired. The bought one is attention: a track held continuously at
     * high quality — which means radars radiating on it — reveals the same
     * thing early. A track held firm but below the steady threshold learns
     * nothing at range, however long it is watched.
     */
    const w = fakeWorld({
      aircraftById: new Map([['a1', { id: 'a1', type: 'decoy' }]]),
    });
    correlatePlots(w, [{ radarId: 'r1', truthId: 'a1', pos: { x: 0, y: 120 }, altM: 5000 }]);
    const track = [...w.tracks.values()][0];
    const holdAt = (q) => { track.quality = q; track.lastUpdateS = w.t; w.t += 0.1; ageTracks(w, 0.1); };

    // Firm but not well-held: convincing forever at range.
    for (let i = 0; i < 400; i++) holdAt(DETECTION.steadyTellQuality - 0.05);
    assert.equal(track.classification, 'striker', 'far out and loosely held, a decoy is convincing');

    // Well-held for the steady interval: revealed at any range.
    for (let i = 0; i < Math.ceil(DETECTION.steadyTellS * 10) + 5; i++) holdAt(1);
    assert.equal(track.classification, 'decoy', 'sustained high-quality tracking gives it away');
  });

  test('a decoy close in gives itself away with no attention at all', () => {
    const w = fakeWorld({
      aircraftById: new Map([['a1', { id: 'a1', type: 'decoy' }]]),
    });
    correlatePlots(w, [{ radarId: 'r1', truthId: 'a1', pos: { x: 0, y: 20 }, altM: 5000 }]);
    const track = [...w.tracks.values()][0];
    // Loosely held, so only the proximity tell can be doing the work.
    for (let i = 0; i < 400; i++) {
      track.quality = DETECTION.steadyTellQuality - 0.05;
      track.lastUpdateS = w.t; w.t += 0.1; ageTracks(w, 0.1);
    }
    assert.equal(track.classification, 'decoy', 'close in, the trick stops working');
  });

  test('friendly traffic identifies as friendly', () => {
    const w = fakeWorld({ aircraftById: new Map([['a1', { id: 'a1', type: 'civil' }]]) });
    correlatePlots(w, [{ radarId: 'r1', truthId: 'a1', pos: { x: 0, y: 100 }, altM: 10000 }]);
    const track = [...w.tracks.values()][0];
    for (let i = 0; i < 400; i++) {
      track.quality = 1; track.lastUpdateS = w.t; w.t += 0.1; ageTracks(w, 0.1);
    }
    assert.equal(track.hostility, 'friendly');
  });
});

test('the kinematic profile is readable before identification resolves', () => {
  assert.equal(trackProfile({ altM: 100, vel: { x: 0, y: 0.3 } }), 'LOW/FAST');
  assert.equal(trackProfile({ altM: 9000, vel: { x: 0, y: 0.1 } }), 'HIGH/SLOW');
});
