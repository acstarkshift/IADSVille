/**
 * Battle damage: what being shot at actually does to you.
 *
 * The design rule under test is that a hit degrades rather than simply removes.
 * A damaged radar comes back with a wedge of sky missing, a damaged crew works
 * slower, and the operator's own console drops out and reboots — all of which
 * are harder to play through than a clean loss would be.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/engine/world.js';
import { scenarioById } from '../src/engine/scenarios.js';
import {
  damageRadar, damageSite, damageAsset, nearMiss, interruptConsole,
  consoleDark, stepDamage, loseCentralControl,
} from '../src/engine/damage.js';
import { effectiveRangeKm } from '../src/engine/detection.js';
import { DAMAGE, ASSET_TYPES } from '../src/engine/config.js';

const world = (options = {}) => new World(scenarioById('weasel-hour'), { role: 'net', ...options });

describe('radar damage', () => {
  test('a survivable hit burns a wedge out of the coverage', () => {
    const w = world();
    const radar = w.radars[0];
    const target = { pos: { x: 0, y: 100 }, altM: 8000, rcs: 5 };
    const before = effectiveRangeKm(radar, target);

    damageRadar(w, radar, 10, 'fragments');
    assert.ok(radar.alive, 'it survived');
    assert.equal(radar.deadSectors.length, 1, 'but part of the sky is gone');
    assert.ok(radar.noiseFactor < 1, 'and the noise floor is up');

    const sector = radar.deadSectors[0];
    const blind = { pos: { x: Math.sin(sector.az * Math.PI / 180) * 100, y: Math.cos(sector.az * Math.PI / 180) * 100 }, altM: 8000, rcs: 5 };
    assert.equal(effectiveRangeKm(radar, blind), 0, 'nothing is visible in the dead wedge');
    assert.ok(effectiveRangeKm(radar, target) <= before);
  });

  test('a destroyed radar stops radiating and takes its battery down with it', () => {
    const w = world();
    const site = w.sites[0];
    const radar = w.radarById.get(site.radarId);
    damageRadar(w, radar, 999, 'direct hit');
    assert.equal(radar.alive, false);
    assert.equal(radar.state, 'off');
    assert.ok(site.damage > 0, 'losing fire control hurts the battery');
    assert.equal(w.stats.radarsLost, 1);
  });

  test('a near miss interrupts power without destroying anything', () => {
    const w = world();
    const radar = w.radars.find((r) => !r.siteId);
    nearMiss(w, radar, DAMAGE.nearMissKm * 0.5);
    assert.ok(radar.alive);
    assert.ok(consoleDark(w), 'the console drops out');
    assert.ok(w.console.rebootUntilS > w.t);
  });
});

describe('site damage', () => {
  test('crew casualties make everything the battery does take longer', () => {
    const w = world();
    const site = w.sites[0];
    const reaction = site.reactionMult;
    // The casualty roll is chance-based; a few hits guarantee at least one.
    for (let i = 0; i < 6 && site.alive; i++) damageSite(w, site, 5, 'fragments');
    assert.ok(site.reactionMult > reaction, 'reaction time degraded');
    assert.ok(site.reloadMult > 1, 'and so did reload time');
  });

  test('a destroyed battery stops fighting entirely', () => {
    const w = world();
    const site = w.sites[0];
    damageSite(w, site, DAMAGE.destroyedAt + 1, 'overrun');
    assert.equal(site.alive, false);
    assert.equal(site.readyRounds, 0);
    assert.equal(site.engagements.length, 0);
    assert.equal(w.radarById.get(site.radarId).alive, false);
  });

  test('losing the crewed battery ends the operator’s war', () => {
    const w = new World(scenarioById('solo-battery'), { role: 'crew' });
    const site = w.siteById.get(w.control.crewedBatteryId);
    damageSite(w, site, DAMAGE.destroyedAt + 1, 'overrun');
    assert.ok(w.console.destroyed);
    w.step(0.1);
    assert.equal(w.phase, 'complete');
    assert.equal(w.outcome.reason, 'site-lost');
    assert.equal(w.outcome.success, false);
  });
});

describe('asset damage', () => {
  test('damage accumulates and destroys, and is charged to your standing', () => {
    const w = world();
    const asset = w.assets.find((a) => a.type === 'airbase');
    const before = w.command.standing;
    damageAsset(w, asset, ASSET_TYPES.airbase.hp + 1, null);
    assert.ok(asset.destroyed);
    assert.equal(w.stats.assetsLost, 1);
    assert.ok(w.command.standing < before);
  });

  test('the town is reported in casualties, not percentages', () => {
    const w = world();
    const town = w.assets.find((a) => ASSET_TYPES[a.type].civilian);
    damageAsset(w, town, 45, null);
    assert.ok(town.casualties > 0);
    assert.equal(w.stats.civilianCasualties, town.casualties);
    assert.ok(w.events.some((e) => /CASUALTIES/.test(e.text)));
  });

  test('destroying the sector operations centre costs the integrated picture', () => {
    const w = world();
    const c2 = w.assets.find((a) => ASSET_TYPES[a.type].critical);
    assert.ok(w.fusionOnline);
    damageAsset(w, c2, ASSET_TYPES.c2.hp + 1, null);
    assert.equal(w.fusionOnline, false, 'this is what the raid is really after');
    assert.ok(w.c2LostAtS !== null);
  });

  test('losing the centre twice does not double-charge you', () => {
    const w = world();
    const c2 = w.assets.find((a) => ASSET_TYPES[a.type].critical);
    loseCentralControl(w, c2);
    const events = w.events.length;
    loseCentralControl(w, c2);
    assert.equal(w.events.length, events);
  });
});

describe('the console', () => {
  test('a reboot blinds the operator and then restores', () => {
    const w = world();
    interruptConsole(w, 8, 'NEAR MISS');
    assert.ok(consoleDark(w));
    assert.ok(w.dark, 'the world agrees you cannot see');

    for (let i = 0; i < 100; i++) { w.t += 0.1; stepDamage(w, 0.1); }
    assert.equal(consoleDark(w), false, 'the display comes back');
    assert.ok(w.events.some((e) => /CONSOLE RESTORED/.test(e.text)));
  });

  test('a longer interruption wins over a shorter one already running', () => {
    const w = world();
    interruptConsole(w, 4, 'FIRST');
    const short = w.console.rebootUntilS;
    interruptConsole(w, 20, 'SECOND');
    assert.ok(w.console.rebootUntilS > short);
    interruptConsole(w, 2, 'THIRD');
    assert.ok(w.console.rebootUntilS > short, 'and is not shortened again');
  });

  test('the simulation keeps running while the operator is blind', () => {
    const w = world();
    for (const radar of w.radars) radar.on = true;
    for (let i = 0; i < 2000; i++) w.step(0.1);
    interruptConsole(w, 8, 'NEAR MISS');
    const airborneBefore = w.aircraft.filter((a) => a.alive).length;
    const positions = w.aircraft.filter((a) => a.alive).map((a) => ({ ...a.pos }));
    for (let i = 0; i < 80; i++) w.step(0.1);
    const moved = w.aircraft.filter((a) => a.alive).some((a, i) =>
      positions[i] && (a.pos.x !== positions[i].x || a.pos.y !== positions[i].y));
    assert.ok(moved, 'the raid does not wait for your display');
  });
});

/*
 * What a battery with one antenna left can still do, and what it cannot.
 *
 * A long-range battalion runs two sets — an acquisition antenna that turns
 * through the circle and a fire-control antenna on a limited mount — and
 * every route to the emissions switch addresses `site.radarId`, which is the
 * acquisition set. Killing that one used to take the battery's whole
 * emissions control away for the rest of the watch while the other set sat
 * there alive and unreachable: measured in the cabin, RADIATE pressed some
 * seven hundred times over twelve minutes with no effect and no message.
 * And a battery whose GUIDANCE was gone went on holding engagements it could
 * not guide, so the console answered "all channels engaged" to an operator
 * whose antennas were scrap.
 */
describe('a battery with one antenna left', () => {
  const battalion = (w) => w.sites.find((s) => w.radarsOf(s).length > 1);

  test('the emissions switch acts on whichever set survives', () => {
    const w = world();
    const site = battalion(w);
    assert.ok(site, 'weasel-hour fields a battalion with two sets');
    const acq = w.radarById.get(site.radarId);
    const fc = w.radarById.get(site.fcRadarId);
    assert.notEqual(acq.id, fc.id, 'and they are two different antennas');

    damageRadar(w, acq, acq.hp + 1, 'anti-radiation round');
    assert.equal(acq.alive, false);
    assert.ok(fc.alive, 'the fire-control set is still standing');

    // The operator presses RADIATE. The order is addressed through the dead
    // antenna, because that is what the console has always addressed.
    w.setRadar(site.radarId, true);
    assert.equal(fc.on, true, 'the surviving set answers the switch');
    w.setRadar(site.radarId, false);
    assert.equal(fc.on, false, 'and answers it in both directions');
  });

  test('a battery that cannot guide drops the engagements it cannot guide', () => {
    const w = world();
    const site = battalion(w);
    for (const radar of w.radars) radar.on = true;
    // Run until this battalion has something on its channels.
    let n = 0;
    while (w.phase === 'running' && n < 12000 && site.engagements.length === 0) {
      w.step(0.1);
      for (const track of w.tracks.values()) {
        if (track.hostility === 'hostile' && !track.destroyed) w.assign(track.id, site.id);
      }
      n++;
    }
    assert.ok(site.engagements.length > 0, 'the battalion took a target');

    const fc = w.radarById.get(site.fcRadarId ?? site.radarId);
    damageRadar(w, fc, fc.hp + 1, 'anti-radiation round');
    w.step(0.1);
    assert.equal(site.engagements.length, 0,
      'with the guidance antenna gone the channels are free, and say so');
  });
});

/*
 * The emissions order that the crews used to undo.
 *
 * `runAiEmcon` runs for every battery nobody is sitting in, once a tick, and
 * rewrote `radar.on` unconditionally — so the net seat's SILENCE on a battery
 * card was accepted and reversed a tenth of a second later, on the watch
 * whose entire lesson is emissions control.
 */
describe('an emissions order from the net', () => {
  test('holds for the rest of the watch on a battery nobody is sitting in', () => {
    const w = world();
    const site = w.sites.find((s) => s.id !== w.control.crewedBatteryId);
    for (const radar of w.radars) radar.on = true;
    for (let i = 0; i < 1500; i++) w.step(0.1);      // let the raid get going

    w.setRadar(site.radarId, false);
    assert.equal(w.liveRadarOf(site).on, false, 'the order takes effect');
    for (let i = 0; i < 600; i++) w.step(0.1);       // a full minute of ticks
    assert.equal(w.radarsOf(site).every((r) => !r.on), true,
      'and is still in force a minute later — doctrine defers to the seat');

    w.setRadar(site.radarId, true);
    for (let i = 0; i < 600; i++) w.step(0.1);
    // The one thing that may still take the set down is the anti-radiation
    // duck, and only while a round is actually inbound on it.
    const ducking = w.t < (site.blinkUntilS ?? 0);
    assert.ok(w.radarsOf(site).some((r) => r.on) || ducking,
      'RADIATE holds too, except while a round is on top of them');
  });
});
