/**
 * The president's flight.
 *
 * The epilogue is the campaign's last argument, and it only happens to an
 * operator who obeyed the last order they were given. These tests defend four
 * things: that the watch is unreachable until then, that the corridor is a real
 * defensive problem rather than a cutscene, that all three outcomes are
 * genuinely available, and that the game can tell the difference between an
 * aircraft the enemy shot down and one this console shot down.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/engine/world.js';
import {
  SCENARIOS, scenarioById, EPILOGUE_ID, isEpilogue, isUnlocked, rosterFor,
} from '../src/engine/scenarios.js';
import {
  FLIGHT_ENDINGS, flightEndingFor, readFlight, composeFlightEnding, flightEndingSummary,
} from '../src/engine/epilogue.js';
import { emptyCampaign, recordMission } from '../src/engine/campaign.js';
import { createCharacter } from '../src/engine/character.js';
import { AIR_TYPES, SAM_TYPES } from '../src/engine/config.js';
import { DIRECTIVES, issueDirective, stepCommand } from '../src/engine/command.js';
import { dist, len } from '../src/engine/math.js';
import { closestApproachBetween } from '../src/engine/threat.js';

const epilogue = scenarioById(EPILOGUE_ID);

/**
 * A record that has stood every watch up to and including the last one, and
 * finished it the given way. Both gates on the epilogue need this.
 */
function servedRecord(ending) {
  const campaign = emptyCampaign();
  for (const scenario of SCENARIOS) {
    if (scenario.id === EPILOGUE_ID) continue;
    campaign.completed[scenario.id] = { score: 1, tier: 'satisfactory', role: 'net' };
  }
  campaign.ending = ending;
  return campaign;
}

/** A finished result, shaped the way World produces one. */
const outcome = (stats = {}, over = {}) => ({
  missionId: EPILOGUE_ID,
  reason: 'raid-spent',
  epilogue: true,
  assets: [
    { type: 'palace', label: 'PRESIDENTIAL PALACE', destroyed: false, damagePct: 0 },
    { type: 'airport', label: 'DEMOBODEDOVO', destroyed: false, damagePct: 0 },
  ],
  stats: {
    kills: 3, civilianCasualties: 0,
    vipEscaped: false, vipDown: false, vipDownedBy: null, vipRoundsFired: 0,
    ...stats,
  },
  constraints: over.constraints ?? { flightOrderAccepted: true },
  ...over,
});

describe('the watch that only some records have', () => {
  test('it is the one gated scenario, and it is gated on the palace', () => {
    assert.ok(isEpilogue(epilogue));
    assert.equal(epilogue.epilogue, true);
    assert.deepEqual(epilogue.requiresEnding, ['obedient', 'exemplary']);
    assert.equal(SCENARIOS.filter((s) => s.requiresEnding).length, 1,
      'only the epilogue is conditional');
  });

  test('a record that has not stood the last watch cannot see it', () => {
    assert.equal(isUnlocked(epilogue, emptyCampaign()), false);
    assert.equal(rosterFor(emptyCampaign()).some(isEpilogue), false);
  });

  test('holding the palace opens it; losing it does not', () => {
    for (const ending of ['obedient', 'exemplary']) {
      assert.ok(isUnlocked(epilogue, servedRecord(ending)), `${ending} should open the epilogue`);
    }
    for (const ending of ['defiant', 'survivor', 'collapse', 'overrun', 'divided']) {
      assert.equal(isUnlocked(epilogue, servedRecord(ending)), false, `${ending} should not`);
    }
  });

  test('the appointment gates it too: holding the palace is not enough on its own', () => {
    // Both gates have to open. A record that held the palace but has not been
    // appointed to national command cannot be given a national watch, and a
    // record appointed to national command that lost the palace has nothing to
    // protect out of Demobodedovo.
    const noService = { completed: {}, ending: 'obedient' };
    assert.equal(isUnlocked(epilogue, noService), false);
    assert.ok(isUnlocked(epilogue, servedRecord('obedient')));
  });

  test('the roster grows with the appointment', () => {
    const fresh = rosterFor(emptyCampaign());
    assert.ok(fresh.length > 0, 'a new record has somewhere to start');
    assert.ok(fresh.every((s) => s.echelon === 'battalion'),
      'and it is not handed a district on its first night');
    assert.equal(rosterFor(servedRecord('obedient')).length, SCENARIOS.length);
  });
});

describe('the corridor', () => {
  const airport = epilogue.assets.find((a) => a.type === 'airport');
  const vipWave = epilogue.waves.find((w) => w.type === 'vip');

  test('the aircraft leaves from the field, not from nowhere', () => {
    assert.ok(airport, 'Demobodedovo is on the board');
    assert.deepEqual(vipWave.pos, airport.pos, 'it rolls from the runway it is briefed from');
    assert.ok(vipWave.altM < 1000, 'and it starts on the climb out, low and slow');
    assert.equal(vipWave.count, 1);
    assert.equal(vipWave.scalable, false, 'there is exactly one of it at every difficulty');
  });

  test('the route runs out of the country and off the board', () => {
    const last = vipWave.waypoints.at(-1);
    assert.ok(len(last) > 150, 'the last filed point is near the frontier');
    // Every leg heads away from the capital: this is a departure, not a circuit.
    let previous = dist(vipWave.pos, epilogue.centre);
    for (const wp of vipWave.waypoints) {
      const d = dist(wp, epilogue.centre);
      assert.ok(d > previous, 'each leg is further out than the last');
      previous = d;
    }
  });

  test('nothing below the long-range battalion can cover it', () => {
    const route = [airport.pos, ...vipWave.waypoints];
    for (const site of epilogue.sites) {
      if (SAM_TYPES[site.type].class === 'long') continue;
      const reach = SAM_TYPES[site.type].maxRangeKm;
      const covered = route.filter((point) => dist(site.pos, point) <= reach).length;
      assert.ok(covered < route.length,
        `${site.name} is a ${SAM_TYPES[site.type].class} battery and must not cover the whole corridor`);
    }
  });

  test('the long-range battalion does cover it, and still cannot hold it alone', () => {
    /*
     * Deliberately, and for the same reason as the last watch: the constraint
     * has never been the equipment. One battalion reaches the whole departure
     * route, and has four channels, eight rounds on the rails and a ninety-five
     * second reload against four fighters and two more packages going for the
     * city and the field. The geometry says yes and the arithmetic says no.
     */
    const bastion = epilogue.sites.find((s) => SAM_TYPES[s.type].class === 'long');
    assert.ok(bastion, 'there is a long-range battery');
    const type = SAM_TYPES[bastion.type];
    const route = [airport.pos, ...vipWave.waypoints];
    assert.ok(route.every((p) => dist(bastion.pos, p) <= type.maxRangeKm),
      'it can reach every point on the filed route');

    const inbound = epilogue.waves.reduce((n, w) => n + (AIR_TYPES[w.type].friendly ? 0 : w.count), 0);
    assert.ok(inbound > type.channels * 2,
      'and there are far more contacts than it has channels to hold them with');
  });

  test('there are four fighters and they carry one round each', () => {
    const fighters = epilogue.waves.filter((w) => w.type === 'interceptor');
    const total = fighters.reduce((n, w) => n + w.count, 0);
    assert.equal(total, 4);
    assert.equal(AIR_TYPES.interceptor.airToAir, 1,
      'one pass, one round — so every fighter stopped is a launch prevented');
    assert.ok(AIR_TYPES.interceptor.speed > AIR_TYPES.vip.speed * 1.5,
      'a fighter that cannot run down what it is chasing is an escort');
  });

  test('the strike package competes for the same rounds', () => {
    const ground = epilogue.waves.filter((w) => w.type === 'striker' || w.type === 'cruise');
    assert.ok(ground.length >= 2, 'something is also coming for the city and the field');
    assert.ok(ground.every((w) => w.targetAssetId), 'and it is aimed at named places');
  });
});

describe('reading the outcome', () => {
  test('the aircraft got out', () => {
    assert.equal(flightEndingFor(outcome({ vipEscaped: true })).id, 'escorted');
  });

  test('the fighters got it', () => {
    assert.equal(flightEndingFor(outcome({ vipDown: true, vipDownedBy: 'enemy' })).id, 'abandoned');
  });

  test('this console got it', () => {
    const ending = flightEndingFor(outcome({
      vipDown: true, vipDownedBy: 'operator', vipRoundsFired: 2,
    }));
    assert.equal(ending.id, 'judgement');
  });

  test('the same wreckage from two different acts is two different endings', () => {
    const enemy = flightEndingFor(outcome({ vipDown: true, vipDownedBy: 'enemy' }));
    const mine = flightEndingFor(outcome({ vipDown: true, vipDownedBy: 'operator' }));
    assert.notEqual(enemy.id, mine.id);
  });

  test('a watch that ended with the question open says so', () => {
    assert.equal(flightEndingFor(outcome({}, { reason: 'site-lost' })).id, 'unwatched');
  });

  test('rounds fired at it are named in the text even when they missed', () => {
    const composed = composeFlightEnding(
      outcome({ vipDown: true, vipDownedBy: 'enemy', vipRoundsFired: 2, vipFiredFirstBy: 'BASTION TAVROV' }),
      createCharacter({ name: 'Тест' }),
    );
    const text = composed.lines.join(' ');
    assert.match(text, /2 rounds expended/);
    assert.match(text, /BASTION TAVROV/);
    assert.match(text, /friendly at the time of launch/);
  });

  test('the endings speak to this soldier’s own household', () => {
    const character = createCharacter({ name: 'Тест', household: 'grandmother' });
    for (const id of Object.keys(FLIGHT_ENDINGS)) {
      const stats = {
        escorted: { vipEscaped: true },
        abandoned: { vipDown: true, vipDownedBy: 'enemy' },
        judgement: { vipDown: true, vipDownedBy: 'operator', vipRoundsFired: 1 },
        unwatched: {},
      }[id];
      const composed = composeFlightEnding(outcome(stats, id === 'unwatched' ? { reason: 'site-lost' } : {}), character);
      assert.equal(composed.id, id);
      assert.ok(composed.lines.length >= 4, `${id} needs to be written, not summarised`);
    }
  });

  test('turning narrative pressure off leaves a plain result, not a story', () => {
    const plain = composeFlightEnding(outcome({ vipEscaped: true }), null, { narrativePressure: false });
    assert.equal(plain.lines.length, 1);
    assert.match(plain.title, /^RESULT:/);
    assert.equal(plain.id, 'escorted');
  });

  test('the freight is priced in seats, and the state grieves the hold', () => {
    // The president is never named and never speaks. What makes him what he is
    // must therefore be carried entirely by material: a weight figure, a freight
    // class, a seating plan, and the order in which a board asks its questions.
    const escorted = FLIGHT_ENDINGS.escorted
      .lines(readFlight(outcome({ vipEscaped: true })), null).join(' ');
    assert.match(escorted, /forty-one seats/);
    assert.match(escorted, /household and administrative effects/);
    assert.match(escorted, /assigns it no frequency/);

    const abandoned = FLIGHT_ENDINGS.abandoned
      .lines(readFlight(outcome({ vipDown: true, vipDownedBy: 'enemy' })), null).join(' ');
    assert.match(abandoned, /recovery of the freight/);
    assert.match(abandoned, /no third question/);

    const judgement = FLIGHT_ENDINGS.judgement
      .lines(readFlight(outcome({ vipDown: true, vipDownedBy: 'operator', vipRoundsFired: 1 })), null)
      .join(' ');
    assert.match(judgement, /freight manifest/);
    assert.match(judgement, /There had never been one/);
  });

  test('none of them is a victory', () => {
    for (const [id, ending] of Object.entries(FLIGHT_ENDINGS)) {
      const text = ending.lines(readFlight(outcome({ vipEscaped: id === 'escorted' })), null).join(' ');
      assert.ok(!/congratul|well done|victor/i.test(text), `${id} should not celebrate`);
    }
    assert.ok(flightEndingSummary('judgement').includes('CONSOLE'));
    assert.equal(flightEndingSummary('nonesuch'), null);
  });
});

/* ---------------------------------------------------------------- played */

/** Run the epilogue headless. `posture` decides what the batteries are told. */
function play({ posture = 'free', shootTheFlight = false, seed = 'epilogue-test', answer = 'accepted' } = {}) {
  const character = createCharacter({ name: 'Тест', household: 'mother' });
  const world = new World(epilogue, { role: 'net', character, seed });
  world.control.netIsHuman = false;
  for (const site of world.sites) world.setWeaponsState(site.id, posture);

  let fired = false;
  let n = 0;
  while (world.phase === 'running' && n < 30000) {
    for (const radar of world.radars) if (radar.alive && !radar.siteId) radar.on = true;
    world.step(0.1);
    if (world.command.pending) world.answer(answer);

    if (shootTheFlight && !fired) {
      const vip = world.vipAircraft();
      const track = vip && [...world.tracks.values()].find((t) => t.truthId === vip.id);
      if (track && track.hostility === 'friendly') {
        // Only batteries this appointment actually commands: at national level
        // most of the country belongs to somebody else.
        const site = world.sites
          .filter((s) => s.alive && s.readyRounds > 0 && world.commandable(s.id))
          .sort((a, b) => dist(a.pos, vip.pos) - dist(b.pos, vip.pos))[0];
        if (site && world.assign(track.id, site.id)) fired = true;
      }
    }
    n++;
  }
  return world;
}

describe('the flight, flown', () => {
  test('it terminates, scores, and names an outcome', () => {
    const world = play();
    assert.equal(world.phase, 'complete');
    assert.equal(world.outcome.epilogue, true);
    assert.ok(FLIGHT_ENDINGS[world.outcome.endingId], `got ending ${world.outcome.endingId}`);
    assert.ok(world.t < 1200, 'and it does not run all night');
  });

  test('the aircraft and the fighters both appear on the scope', () => {
    // A regression: radars once carried a whitelist of what they could see, and
    // a type added to the game after it was written was simply invisible — which
    // on this watch meant neither the thing being protected nor the thing
    // hunting it ever reached the operator.
    const world = new World(epilogue, { role: 'net', seed: 'visible' });
    world.control.netIsHuman = false;
    const seen = new Set();
    for (let n = 0; n < 4000 && world.phase === 'running'; n++) {
      for (const radar of world.radars) if (radar.alive && !radar.siteId) radar.on = true;
      world.step(0.1);
      for (const track of world.tracks.values()) {
        const truth = world.aircraftById.get(track.truthId);
        if (truth) seen.add(truth.type);
      }
    }
    assert.ok(seen.has('vip'), 'STATE 01 must be trackable');
    assert.ok(seen.has('interceptor'), 'so must the fighters');
  });

  test('the state aircraft is identified as friendly, and nothing engages it by itself', () => {
    const world = play({ posture: 'free' });
    assert.equal(world.stats.vipRoundsFired, 0,
      'no doctrine in the game shoots at a friendly on its own initiative');
    assert.notEqual(world.outcome.endingId, 'judgement');
  });

  test('batteries told to hold their fire lose the aircraft', () => {
    const world = play({ posture: 'hold' });
    assert.equal(world.stats.vipDown, true);
    assert.equal(world.stats.vipDownedBy, 'enemy');
    assert.equal(world.outcome.endingId, 'abandoned');
  });

  test('an operator can fire on it, and the tape records the fire order either way', () => {
    const world = play({ shootTheFlight: true });
    assert.ok(world.stats.vipRoundsFired > 0, 'the rounds are on the tape');
    // Firing on it does not guarantee yours is the round that arrives — the
    // fighters are also trying — so the ending has to follow the attribution
    // rather than the intent.
    if (world.stats.vipDown) {
      assert.ok(['operator', 'enemy'].includes(world.stats.vipDownedBy));
      assert.equal(world.outcome.endingId,
        world.stats.vipDownedBy === 'operator' ? 'judgement' : 'abandoned');
    }
  });

  test('attribution follows the weapon that arrived, not the one that was fired', () => {
    // The distinction the whole epilogue turns on, checked directly rather than
    // waiting for a seed in which it happens to come up.
    for (const [kind, expected] of [['aam', 'enemy'], ['sam', 'operator']]) {
      const world = new World(epilogue, { role: 'net', seed: `attrib-${kind}` });
      let n = 0;
      while (!world.vipAircraft() && n < 3000) { world.step(0.1); n++; }
      const vip = world.vipAircraft();
      assert.ok(vip, 'the aircraft takes off');
      world.killAircraft(vip, { kind });
      assert.equal(world.stats.vipDown, true);
      assert.equal(world.stats.vipDownedBy, expected);
      assert.equal(world.stats.civilianAircraftShot, 0,
        'and it is never filed as a civil transit');
    }
  });

  test('the corridor is defensible: committing to it saves the aircraft sometimes', () => {
    // Not "always" — this is a fight, not a formality. But an operator who puts
    // every battery onto the contacts closing on the flight has to be able to
    // get it out, or the order to protect it is theatre and the choice the
    // watch offers is not a choice.
    let saved = 0;
    for (const seed of ['c1', 'c2', 'c3', 'c4']) {
      const world = new World(epilogue, { role: 'net', seed });
      world.control.netIsHuman = false;
      // A commander who puts the whole country on the corridor: every formation
      // released to fire, salvos of two, and their own hand on the corridor.
      for (const formation of world.formations) world.setPosture(formation.id, 'free');
      for (const site of world.sites) world.setSalvo(site.id, 2);
      let n = 0;
      while (world.phase === 'running' && n < 30000) {
        for (const radar of world.radars) if (radar.alive && !radar.siteId) radar.on = true;
        world.step(0.1);
        if (world.command.pending) world.answer('accepted');
        const vip = world.vipAircraft();
        if (vip) {
          for (const track of world.tracks.values()) {
            if (track.hostility !== 'hostile' || track.destroyed) continue;
            if (track.quality < 0.5 || track.assignedTo.length) continue;
            if (closestApproachBetween(track, vip).missKm > 40) continue;
            for (const site of world.sites) {
              if (world.commandable(site.id) && world.assign(track.id, site.id)) break;
            }
          }
        }
        n++;
      }
      if (world.stats.vipEscaped) saved++;
    }
    assert.ok(saved > 0, 'a corridor defence must be able to work');
  });
});

describe('the file, afterwards', () => {
  test('sector command credits the escape and floors the alternative', () => {
    const escaped = play({ posture: 'tight' });
    const shot = play({ shootTheFlight: true });
    if (shot.stats.vipDownedBy === 'operator') {
      assert.equal(Math.round(shot.outcome.standing), 0,
        'nothing offsets firing on the state aircraft');
    }
    assert.ok(escaped.outcome.ledger.length > 0, 'the watch is written up either way');
  });

  test('the ledger names what happened to the aircraft', () => {
    const world = play({ posture: 'hold' });
    const reasons = world.outcome.ledger.map((l) => l.reason).join(' | ');
    assert.match(reasons, /state aircraft was lost to enemy fighters/);
  });

  test('the epilogue is recorded without locking itself', () => {
    const campaign = servedRecord('obedient');
    campaign.character = createCharacter({ name: 'Тест' });
    const world = play({ posture: 'hold' });
    recordMission(campaign, world.outcome);
    assert.equal(campaign.epilogue, world.outcome.endingId);
    assert.equal(campaign.ending, 'obedient', 'the unlock must survive being used');
    assert.ok(isUnlocked(epilogue, campaign), 'and the watch stays replayable');
  });
});

describe('the order', () => {
  test('it is not transmitted before the aircraft is off the ground', () => {
    const world = new World(epilogue, { role: 'net', seed: 'order' });
    world.control.netIsHuman = false;
    let issuedAtS = null;
    let vipUpAtS = null;
    for (let n = 0; n < 3000 && world.phase === 'running'; n++) {
      for (const radar of world.radars) if (radar.alive && !radar.siteId) radar.on = true;
      world.step(0.1);
      if (vipUpAtS === null && world.vipAircraft()) vipUpAtS = world.t;
      if (issuedAtS === null && world.command.issuedOnce.protectFlight) issuedAtS = world.t;
      if (world.command.pending) world.answer('accepted');
    }
    assert.ok(vipUpAtS !== null, 'the aircraft takes off');
    assert.ok(issuedAtS !== null, 'and the order follows it');
    assert.ok(issuedAtS >= vipUpAtS, 'nobody orders the protection of an aircraft on the ground');
  });

  test('nothing routine goes out ahead of it', () => {
    const world = new World(epilogue, { role: 'net', seed: 'order' });
    world.control.netIsHuman = false;
    for (let n = 0; n < 1200 && world.phase === 'running'; n++) {
      for (const radar of world.radars) if (radar.alive && !radar.siteId) radar.on = true;
      world.step(0.1);
      if (world.command.pending) {
        assert.equal(world.command.pending.id, DIRECTIVES.protectFlight.id,
          'the hinge order holds the net');
        break;
      }
    }
  });

  test('the order can be refused, and the refusal is recorded', () => {
    const world = play({ answer: 'refused', posture: 'hold' });
    assert.equal(world.command.constraints.flightOrderRefused, true);
    assert.ok(!world.command.constraints.flightOrderAccepted);
  });
});

describe('the departure, and the aircraft with questions', () => {
  test('the field talks while it is loaded, and the net marks wheels-up', () => {
    const world = new World(epilogue, { role: 'net', seed: 'chatter' });
    world.control.netIsHuman = false;
    for (let n = 0; n < 700; n++) world.step(0.1);
    const text = world.events.map((e) => e.text).join(' | ');
    assert.match(text, /LOADING COMPLETE/);
    assert.match(text, /EVACUATION FLIGHTS ARE HELD/);
    assert.match(text, /FREIGHT DOORS WERE SEALED FIRST/);
    assert.match(text, /ROLLING AT DEMOBODEDOVO/);
  });

  test('with the pressure off, the colour goes and the information stays', () => {
    const world = new World(epilogue, {
      role: 'net', seed: 'chatter', narrativePressure: false,
    });
    world.control.netIsHuman = false;
    for (let n = 0; n < 700; n++) world.step(0.1);
    const text = world.events.map((e) => e.text).join(' | ');
    assert.doesNotMatch(text, /FREIGHT DOORS/);
    assert.match(text, /CLOSED TO ALL OTHER MOVEMENTS/);
    assert.match(text, /AIRBORNE OUT OF DEMOBODEDOVO/);
  });

  test('the relayed queries arrive only after the protection order, at most twice', () => {
    const world = play();
    const log = world.command.log;
    const protectAt = log.findIndex((d) => d.id === 'protectFlight');
    const relays = log.filter((d) => d.id === 'relayQuery');
    assert.ok(protectAt >= 0, 'the hinge went out');
    assert.ok(relays.length >= 1, 'the aircraft asks at least once');
    assert.ok(relays.length <= 2, `twice is a passenger; got ${relays.length}`);
    for (const relay of relays) {
      assert.ok(log.indexOf(relay) > protectAt,
        'no query is relayed ahead of the order it presumes');
    }
  });

  test('the queries exist only on the flight watch', () => {
    const elsewhere = new World(scenarioById('two-cities'), { role: 'net', seed: 'not-here' });
    elsewhere.command.issuedOnce.protectFlight = true;
    assert.equal(DIRECTIVES.relayQuery.trigger(elsewhere), false,
      'the finale has no state aircraft to ask after');
  });

  test('silence to a relayed query is charged under a reason the debrief table shows', () => {
    const world = new World(epilogue, { role: 'net', seed: 'relay-silence' });
    issueDirective(world, DIRECTIVES.relayQuery);
    world.command.pending.deadlineS = world.t - 1;
    stepCommand(world, 0.1);
    const entry = world.command.ledger.find((l) => /relayed query/.test(l.reason));
    assert.ok(entry, 'the omission is recorded');
    assert.ok(entry.charged < 0, 'and it costs');
    // The debrief's divergence table filters on this pattern (screens.js) —
    // the file charging you for attention correctly spent elsewhere is exactly
    // the kind of row that card exists to show.
    assert.match(entry.reason, /relayed/i);
  });
});
