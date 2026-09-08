/**
 * Battle damage to your own equipment.
 *
 * A hit on your site is not a game-over screen, it is a worse job. The radar
 * comes back with a wedge of the sky burned out of it, the crew that reloads the
 * rack is short two people, and the console you are reading this on drops out
 * for eight seconds while the raid keeps flying. Degradation is more frightening
 * than destruction because you have to keep working through it.
 */

import { DAMAGE, ASSET_TYPES, COMMAND } from './config.js';
import { bearing, clamp, wrapDeg } from './math.js';
import { DISTRICTS, districtOf } from './character.js';

/** Queue a screen effect for the UI to pick up. Purely cosmetic; the sim ignores it. */
export function addEffect(world, effect) {
  world.effects.push({ startedS: world.t, ...effect });
  if (world.effects.length > 40) world.effects.shift();
}

/** Knock the player's console offline — the scope goes dark and comes back changed. */
export function interruptConsole(world, seconds, reason) {
  // A cool head gets the standby bus across sooner.
  const scaled = seconds * (world.modifiers?.rebootMult ?? 1);
  const until = world.t + scaled;
  if (until > world.console.rebootUntilS) {
    world.console.rebootUntilS = until;
    world.console.rebootReason = reason;
    world.log('alert', `CONSOLE POWER LOST — ${reason}`, { severity: 'high' });
    addEffect(world, { kind: 'blackout', durationS: scaled });
  }
}

/** Does this piece of equipment belong to the seat the player is sitting in? */
function isPlayersEquipment(world, entity) {
  if (!entity) return false;
  if (world.control.crewedBatteryId && entity.siteId === world.control.crewedBatteryId) return true;
  if (world.control.crewedBatteryId && entity.id === world.control.crewedBatteryId) return true;
  return false;
}

export function damageRadar(world, radar, amount, cause) {
  if (!radar.alive) return;
  radar.damage += amount;
  world.log('alert', `${radar.label} — HIT (${cause})`, { radarId: radar.id, severity: 'high' });
  // A direct hit on your own position. Measured against a near miss and your
  // own rail firing, these three used to span 0.9 of a pixel — a hit, a bomb
  // that nearly had you, and a round leaving the launcher all felt the same,
  // and the launcher shook HARDER than the near miss. The spread is the
  // information; this is the top of it.
  addEffect(world, { kind: 'shake', magnitude: 1.6, durationS: 2.2 });

  if (radar.damage >= radar.hp) {
    radar.alive = false;
    radar.on = false;
    radar.state = 'off';
    world.stats.radarsLost++;
    world.log('alert', `${radar.label} — DESTROYED`, { radarId: radar.id, severity: 'high' });
    const site = radar.siteId ? world.siteById.get(radar.siteId) : null;
    if (site) damageSite(world, site, 45, 'fire control destroyed');
    if (isPlayersEquipment(world, radar)) interruptConsole(world, DAMAGE.rebootMaxS, 'DIRECT HIT');
    return;
  }

  // Survived, but not intact: a wedge of sky is gone and the noise floor is up.
  const woundAz = wrapDeg(world.rng.range(0, 360));
  radar.deadSectors.push({ az: woundAz, halfWidthDeg: DAMAGE.deadSectorHalfWidthDeg });
  radar.noiseFactor = Math.max(0.35, radar.noiseFactor * 0.72);
  world.log('warn', `${radar.label} — SECTOR ${Math.round(woundAz)} DEGRADED`, { radarId: radar.id });

  if (isPlayersEquipment(world, radar)) {
    interruptConsole(world, world.rng.range(DAMAGE.rebootMinS, DAMAGE.rebootMaxS), 'ANTENNA DAMAGE');
  }
}

export function damageSite(world, site, amount, cause) {
  if (!site.alive) return;
  site.damage += amount;

  if (site.damage >= DAMAGE.destroyedAt) {
    site.alive = false;
    site.readyRounds = 0;
    site.engagements = [];
    for (const radar of world.radarsOf(site)) {
      if (!radar.alive) continue;
      radar.alive = false;
      radar.on = false;
      radar.state = 'off';
    }
    world.stats.sitesLost++;
    world.log('alert', `${site.name} — OFF THE AIR`, { siteId: site.id, severity: 'high' });
    if (world.control.crewedBatteryId === site.id) {
      world.console.destroyed = true;
      interruptConsole(world, 999, 'SITE DESTROYED');
    }
    return;
  }

  // Casualties among the crew: everything they do now takes longer.
  if (world.rng.chance(0.5)) {
    site.crewLosses = (site.crewLosses ?? 0) + 1;
    site.reactionMult = (site.reactionMult ?? 1) * DAMAGE.crewLossReactionMult;
    site.reloadMult = (site.reloadMult ?? 1) * DAMAGE.crewLossReloadMult;
    world.log('warn', `${site.name} — CASUALTIES, CREW DEGRADED`, { siteId: site.id });
  }
}

/** A round that missed, but not by enough. */
export function nearMiss(world, radar, missKm) {
  if (missKm > DAMAGE.nearMissKm) return;
  radar.noiseFactor = Math.max(0.5, radar.noiseFactor * 0.9);
  world.log('warn', `${radar.label} — NEAR MISS, POWER INTERRUPTED`, { radarId: radar.id });
  addEffect(world, { kind: 'shake', magnitude: 0.75, durationS: 1.6 });
  if (isPlayersEquipment(world, radar) || radar.kind === 'ewr') {
    interruptConsole(world, world.rng.range(DAMAGE.rebootMinS, DAMAGE.rebootMaxS), 'NEAR MISS');
  }
}

export function damageAsset(world, asset, amount, source) {
  if (asset.destroyed) return;
  asset.damage += amount;
  const type = ASSET_TYPES[asset.type];

  if (type.civilian) {
    // Reported in people and by quarter, because that is how it would be
    // reported — and because one of those quarters is where your people live.
    const casualties = Math.round(amount * world.rng.range(0.8, 2.4));
    asset.casualties = (asset.casualties ?? 0) + casualties;
    world.stats.civilianCasualties += casualties;

    const district = DISTRICTS[world.rng.int(0, DISTRICTS.length - 1)];
    asset.districtsHit = asset.districtsHit ?? [];
    if (!asset.districtsHit.includes(district.id)) asset.districtsHit.push(district.id);

    const home = type.home && world.character ? districtOf(world.character) : null;
    if (home && home.id === district.id) {
      world.stats.homeDistrictHit = true;
      world.log('alert',
        `${asset.label} — ${district.tm} / ${district.en.toUpperCase()} STRUCK. `
        + `${casualties} CASUALTIES`,
        { assetId: asset.id, severity: 'high', personal: true });
      /*
       * A few seconds later, a line only one person on the net has any use
       * for. Routed through the chatter queue so it arrives as its own beat
       * rather than in the same breath as the strike report.
       */
      if (world.narrativePressure && !world.stats.homeQuarterTrunksDown) {
        world.stats.homeQuarterTrunksDown = true;
        world.pendingChatter.push({
          atS: world.t + 7,
          text: `TRUNK LINES TO ${district.tm} / ${district.en.toUpperCase()} REPORTED DOWN.`
            + ' NO CALLS IN OR OUT OF THE QUARTER.',
          opts: { personal: true },
        });
        world.pendingChatter.sort((a, b) => a.atS - b.atS);
      }
    } else {
      world.log('alert',
        `${asset.label} — ${district.tm} / ${district.en.toUpperCase()} STRUCK. `
        + `${casualties} CASUALTIES REPORTED`,
        { assetId: asset.id, severity: 'high' });
    }
    /*
     * The state's ledger grieves in proportion to its own valuation, and for
     * a place it does not recognise it does not grieve at all. Charging the
     * full civilian rate for the refugee encampment — a place whose `value` is
     * zero precisely because the ledger refuses to know it — contradicted the
     * campaign's central document and quietly correlated the two arithmetics
     * the whole design keeps apart. The SCORE still counts every casualty in
     * full; that is the other arithmetic, and it is yours.
     *
     * The same schedule prices every hit: full rate at the town's 26, a
     * fraction for the hospital the state rates below a river crossing, and
     * nothing at all once the freeze has struck a place off — obeying the
     * order to abandon it must cost the file nothing, or the file would be
     * arguing with its own order.
     */
    const excludedByFreeze = world.command?.constraints?.freezeExcludedId === asset.id;
    const weight = excludedByFreeze ? 0 : Math.min(1, type.value / 26);
    if (weight > 0) {
      world.standingDelta(COMMAND.standing.perCivilianHit * weight, 'civilian area struck');
    }
  } else {
    const pct = Math.min(100, Math.round(100 * asset.damage / type.hp));
    world.log('alert', `${asset.label} — STRUCK (${pct}%)`, {
      assetId: asset.id, severity: 'high',
    });
  }
  addEffect(world, { kind: 'flash', magnitude: 0.8, durationS: 0.6 });

  /*
   * The fused picture goes before the walls do. See ASSET_TYPES.c2: a place
   * that carries `offAirFrac` stops being a centre at that fraction of its hit
   * points, which is the difference between a watch where the decapitation is
   * a thing that happens to you and a watch where it is the moment you lost.
   */
  if (type.critical && type.offAirFrac && asset.damage >= type.hp * type.offAirFrac) {
    loseCentralControl(world, asset);
  }

  if (asset.damage >= type.hp) {
    asset.destroyed = true;
    world.stats.assetsLost++;

    // The forward post is not a building you are defending; it is the room you
    // are sitting in. Losing it ends the watch whichever seat you are in.
    if (type.isPost) {
      world.stats.postOverrun = true;
      world.console.destroyed = true;
      world.log('alert', `${asset.label} — POSITION OVERRUN`, { severity: 'high' });
    }
    world.log('alert', `${asset.label} — DESTROYED`, { assetId: asset.id, severity: 'high' });
    /*
     * Scaled by the state's own valuation: full rate at the schedule's anchor
     * (the town's 26), nothing at all for a value of zero. The ledger cannot
     * simultaneously say the encampment is not a designated place and bill
     * you fourteen points for losing it — its indifference has to be real or
     * the divergence the campaign turns on is a lie the code tells about
     * itself.
     */
    /*
     * And a place the expenditure freeze has declared undesignated is priced
     * accordingly: losing it cannot cost the file anything, or the order to
     * abandon it would be a trap rather than a corruption.
     */
    const excludedByFreeze = world.command?.constraints?.freezeExcludedId === asset.id;
    const weight = excludedByFreeze ? 0 : type.critical ? 1 : Math.min(1, type.value / 26);
    if (weight > 0) {
      world.standingDelta(
        (type.critical ? COMMAND.standing.perCriticalAssetLost : COMMAND.standing.perAssetLost)
          * weight,
        `${asset.label} lost`,
      );
    }
    if (type.critical) loseCentralControl(world, asset);
  }
}

/**
 * The decapitation.
 *
 * Losing the sector operations centre does not cost you a single radar or a
 * single round — it costs you the thing that made them one system. Plots stop
 * being reconciled, so one aircraft becomes three tracks; cueing stops, so a
 * battery only knows what it can see for itself; and anything you delegated is
 * now nobody's job.
 */
export function loseCentralControl(world, asset) {
  if (!world.fusionOnline) return;
  world.fusionOnline = false;
  world.c2LostAtS = world.t;
  world.log('alert', 'SECTOR OPS OFF THE AIR — TRACK FUSION LOST', { severity: 'high' });
  // Said in full, because the tactical consequence is the one thing an operator
  // must not have to deduce while the building is still burning: without the
  // centre there are no assignments, and a battery not on weapons free fights
  // nothing at all.
  world.log('alert',
    'NO CENTRAL CUEING. BATTERIES TO LOCAL CONTROL — ONLY SETS ON WEAPONS FREE WILL ENGAGE.',
    { severity: 'high' });
  addEffect(world, { kind: 'blackout', durationS: 3.5 });
  interruptConsole(world, 3.5, 'SECTOR OPS DOWN');

  // Every track loses its consolidated identity: what was one aircraft on one
  // track number is about to be re-detected separately by every radar that sees it.
  for (const track of world.tracks.values()) {
    track.quality = Math.min(track.quality, 0.5);
    track.idProgressS *= 0.4;
  }
}

/** Tick console recovery and expire finished effects. */
export function stepDamage(world, dt) {
  world.effects = world.effects.filter(
    (e) => world.t - e.startedS < (e.durationS ?? 1) + 0.25,
  );
  if (world.console.rebootUntilS > 0 && world.t >= world.console.rebootUntilS && !world.console.destroyed) {
    world.console.rebootUntilS = 0;
    world.log('info', 'CONSOLE RESTORED', {});
  }
}

/** True while the player cannot see anything at all. */
export function consoleDark(world) {
  return world.console.destroyed || world.t < world.console.rebootUntilS;
}
