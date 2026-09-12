/**
 * The console's controls: what they answer to, and what leaving costs.
 *
 * Three rules the interface used to break, all of them reachable without a
 * browser because the rules themselves are data:
 *
 *  - a watch that was walked out of is not a watch that was won;
 *  - a number key means the number printed on the cap;
 *  - a control a watch has removed is removed from the key map too.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import { World } from '../src/engine/world.js';
import { scenarioById, consoleCaps } from '../src/engine/scenarios.js';
import { emptyCampaign, enlist, recordMission, briefingNote } from '../src/engine/campaign.js';
import { SPEED_BY_KEY, digitPressed } from '../src/ui/keymap.js';
import {
  CONTROLS, POSTURE_CYCLE, EQUIPMENT, legend, keycap, nomenclatureFor, callsignOf,
} from '../src/ui/lexicon.js';
import { RADAR_TYPES, SAM_TYPES } from '../src/engine/config.js';
import { planGeography } from '../src/ui/console.js';
import { seatPicture } from '../src/ui/panels.js';
import { NET_TUTORIAL_STEPS, CREW_TUTORIAL_STEPS, radarNamesIn } from '../src/ui/tutorial.js';

const watch = (id, opts = {}) => new World(scenarioById(id), { role: 'net', seed: 5, ...opts });

describe('plain English on and under the scope', () => {
  /*
   * The player: "The text at the bottom of the scope is neuralese garbage.
   * 'Right click a target to blink it?' What's that even mean? Scrub all
   * that text so that a human can understand it." These are the phrases the
   * scrub retired from the console's own words — the legend line, the
   * tutorial, the stamps on the tube, the board's heads and the cap notes —
   * and none of them may come back into the interface sources.
   */
  test('no retired phrase survives in the interface', () => {
    const retired = [
      'blink it', 'to blink', 'NOTHING IS BEING PAINTED', 'NOTHING BELOW THE HORIZON IS SEEN',
      'NO CONTACT DESIGNATED', 'NO TARGET DESIGNATED', "'NO CONTACT', 'DESIGNATED'",
      'the TRACKS list', 'is not a firing solution', 'NO FIRING SOLUTION',
      'HOLDING FOR RANGE', "'UNPAIRED'", "'UNCOMMITTED'", 'WITH NOBODY ON THEM',
      'NOTHING OF YOURS CAN TAKE', 'off is invisible, on is a target',
      'high voltage to the antenna', 'kill the transmitter', 'ENGAGEMENT ENVELOPE',
      'LOCAL CONTROL — NO FUSION', 'Nothing paints until', 'to designate it',
      'put a channel on it', 'CREW PREPARING', 'LOADERS STOWED',
    ];
    const offenders = [];
    for (const file of readdirSync('src/ui').filter((f) => f.endsWith('.js'))) {
      const source = readFileSync(`src/ui/${file}`, 'utf8');
      source.split('\n').forEach((line, i) => {
        // Comments may quote the old words to say why they went; code may not.
        const code = line.replace(/^\s*(\/\/|\*|\/\*).*$/, '').replace(/\/\/.*$/, '');
        for (const phrase of retired) {
          if (code.includes(phrase)) offenders.push(`${file}:${i + 1} still says "${phrase}"`);
        }
      });
    }
    assert.deepEqual(offenders, [], offenders.join('\n'));
  });

  test('every tutorial card is a sentence a first-timer can act on', () => {
    for (const step of [...NET_TUTORIAL_STEPS, ...CREW_TUTORIAL_STEPS]) {
      assert.ok(/[.!]$/.test(step.en), `${step.id} should end as a sentence: "${step.en}"`);
      for (const jargon of ['designate', 'paint', 'firing solution', 'channel on it', 'TRACKS list', 'set is cold']) {
        assert.ok(!step.en.toLowerCase().includes(jargon.toLowerCase()),
          `${step.id} still says "${jargon}": "${step.en}"`);
      }
      // The card is the console speaking; it speaks English only.
      assert.equal(step.tm, undefined, `${step.id} carries no stencil line`);
      assert.ok(!/[Ѐ-ӿ]/.test(step.en), `${step.id} is English`);
    }
  });
});

describe('one name for one radar', () => {
  /*
   * The player: "The tutorial tells me to have WIDE EYE radiate, but the
   * console doesn't call that radar WIDE EYE, it calls it P-31." A set has
   * one name everywhere — the callsign the config gives it — and the
   * nomenclature is what the plate under that name is stencilled with.
   */
  test('every radar a lesson names is a callsign a set actually carries', () => {
    const callsigns = Object.values(RADAR_TYPES).map((t) => t.label);
    const named = radarNamesIn([...NET_TUTORIAL_STEPS, ...CREW_TUTORIAL_STEPS]);
    assert.ok(named.includes('WIDE EYE'), 'the first lesson is about the surveillance set');
    for (const name of named) {
      assert.ok(callsigns.includes(name), `the tutorial says "${name}"; no radar is called that`);
    }
  });

  test('the teaching watch fields the set the lesson names', () => {
    const world = watch('first-light');
    const labels = world.radars.filter((r) => !r.siteId).map((r) => r.label);
    assert.ok(labels.includes('WIDE EYE'), `First Light's sets are ${labels.join(', ')}`);
  });

  test('every callsign has a plate, and the plate is the model number then the callsign', () => {
    for (const type of Object.values(RADAR_TYPES)) {
      const plate = nomenclatureFor(type.label);
      assert.ok(plate, `${type.label} has no nomenclature plate`);
      assert.equal(callsignOf(plate), type.label,
        `${plate.en} should name the set ${type.label} after its model number`);
      assert.ok(/^[A-Z]+-\d+ /.test(plate.en), `${plate.en} should begin with a model number`);
    }
    // WIDE EYE's plate ends in EYE, and a set called EYE must still not get it.
    assert.equal(nomenclatureFor('EYE'), null, 'a partial callsign matches nothing');
    assert.equal(nomenclatureFor(''), null);
    assert.equal(nomenclatureFor('WIDE EYE'), EQUIPMENT.ewr);
  });
});

describe('leaving the post', () => {
  test('an abandoned watch is not a victory, and pays nothing', () => {
    const world = watch('first-light');
    world.step(0.1);
    world.finish('aborted');

    const r = world.outcome;
    assert.equal(r.abandoned, true);
    assert.equal(r.success, false, 'walking out must not read as SECTOR HELD');
    assert.equal(r.headline, 'WATCH ABANDONED');
    assert.ok(r.score <= 0, `an abandoned watch scores nothing, got ${r.score}`);
    assert.equal(r.breakdown.assets, 0, 'the ground-preserved award is for ground defended');
    assert.equal(r.breakdown.turnedBack, 0);
    assert.match(r.cause, /LEFT THE POST/);
  });

  test('the file records the abandonment and banks nothing else', () => {
    const campaign = emptyCampaign();
    enlist(campaign, { name: 'Test', background: 'academy', household: 'mother' });
    const before = { xp: campaign.character.xp, rank: campaign.character.rankIndex };

    const world = watch('first-light');
    world.step(0.1);
    world.finish('aborted');
    const entry = recordMission(campaign, world.outcome);

    assert.equal(campaign.character.xp, before.xp, 'no experience for a watch not stood');
    assert.equal(campaign.character.rankIndex, before.rank);
    assert.equal(campaign.completed['first-light'], undefined,
      'an abandoned watch must not open the next echelon');
    assert.equal(entry.service, null);
    assert.equal(entry.letter, null);
    assert.equal(entry.appointment, null);
    assert.equal(campaign.history.length, 1, 'it is still written down');
    assert.equal(campaign.history[0].abandoned, true);
  });

  test('repeating it never opens the roster', () => {
    const campaign = emptyCampaign();
    enlist(campaign, { name: 'Test', background: 'academy', household: 'mother' });
    for (let i = 0; i < 3; i++) {
      const world = watch('first-light');
      world.step(0.1);
      world.finish('aborted');
      recordMission(campaign, world.outcome);
    }
    assert.deepEqual(Object.keys(campaign.completed), []);
    assert.equal(campaign.character.xp, 0);
    assert.equal(campaign.appointment, 'battalion');
  });

  test('abandoning the finale composes no ending at all', () => {
    const world = watch('two-cities');
    world.step(0.1);
    world.finish('aborted');

    assert.equal(world.outcome.finale, false, 'the ending is read off a night that happened');
    assert.equal(world.outcome.endingId, null);
    assert.equal(world.endingId ?? null, null);

    const campaign = emptyCampaign();
    enlist(campaign, { name: 'Test' });
    recordMission(campaign, world.outcome);
    assert.equal(campaign.ending, null, 'the campaign must not end because somebody left');
  });

  test('a watch fought to its end is unaffected', () => {
    const world = watch('first-light');
    world.finish('raid-spent');
    assert.equal(world.outcome.abandoned, false);
    assert.equal(world.outcome.success, true);
    assert.ok(world.outcome.score > 0);
  });

  test('the file files it as abandoned, not as satisfactory', () => {
    const campaign = emptyCampaign();
    enlist(campaign, { name: 'Test', background: 'academy', household: 'mother' });
    const world = watch('first-light');
    world.step(0.1);
    world.finish('aborted');
    recordMission(campaign, world.outcome);

    // The history line used to read tier 'satisfactory', and the debrief read
    // that word back under a headline that said the post had been left.
    assert.equal(campaign.history[0].tier, 'abandoned');
    // And the file has something of its own to say about it next time.
    assert.match(briefingNote(campaign), /signed for you/);
  });

  test('the cause clause is one clause, with the clock in it', () => {
    const world = watch('first-light');
    world.step(45);
    world.finish('aborted');
    assert.match(world.outcome.cause, /^YOU LEFT THE POST AT \d+:\d\d\.$/);
    assert.ok(world.outcome.cause.length <= 46,
      `the deck line is set as a headline and must fit like one: "${world.outcome.cause}"`);
    assert.equal(world.outcome.clock, world.outcome.cause.match(/(\d+:\d\d)/)[1]);
  });
});

describe('the number row', () => {
  test('a digit is read off the physical key, shifted or not', () => {
    assert.equal(digitPressed({ key: '1', code: 'Digit1' }), 1);
    // The one that mattered: Shift+1 on a US board delivers '!'.
    assert.equal(digitPressed({ key: '!', code: 'Digit1' }), 1);
    assert.equal(digitPressed({ key: '$', code: 'Digit4' }), 4);
    assert.equal(digitPressed({ key: '3', code: 'Numpad3' }), 3);
    // And still works when only the character survives the trip.
    assert.equal(digitPressed({ key: '!' }), 1);
    assert.equal(digitPressed({ key: 'x', code: 'KeyX' }), null);
  });

  test('the key selects the speed printed on its cap', () => {
    assert.equal(SPEED_BY_KEY[1], 1);
    assert.equal(SPEED_BY_KEY[2], 2);
    assert.equal(SPEED_BY_KEY[4], 4, 'pressing 4 must select 4×, not stop the raid');
    assert.equal(SPEED_BY_KEY[0], 0);
    assert.equal(SPEED_BY_KEY[3], undefined, 'there is no 3× speed, so there is no 3 key');
  });
});

describe('one control, one key, one legend', () => {
  test('a key is stamped as a chip, never appended to the legend', () => {
    const html = legend(CONTROLS.reload, { key: 'R' });
    // The face carries the word and nothing else: appending "· R" to it is
    // what widened every cap until only two fitted on a rack row.
    assert.match(html, /<b>RELOAD<\/b>/);
    assert.doesNotMatch(html, /RELOAD · R/);
    assert.match(html, /<em class="kc">R<\/em>/);
    assert.equal(legend(CONTROLS.reload), '<span class="lg lg-stack"><b>RELOAD</b></span>');
  });

  test('a control legend is English, and one line of it', () => {
    /*
     * The plates carry the Cyrillic; the controls do not. Two languages
     * stacked inside a 45px switch is four lines of 8px type, which is what
     * the emissions switch was — measured, a smear at 100% — and a cap that
     * puts the Cyrillic on the bright line and the English small underneath
     * it is the wrong way round for a player who reads one of them.
     */
    const CYRILLIC = /[Ѐ-ӿ]/;
    for (const entry of Object.values(CONTROLS)) {
      const html = legend(entry, { key: 'Q' });
      assert.ok(!CYRILLIC.test(html.replace(/<em class="kc">.*?<\/em>/, '')),
        `the ${entry.en} control legend still carries Cyrillic`);
    }
    /*
     * And it is ONE line. The speed rack used to carry a dim REAL / FAST / MAX
     * under its figure, which built three caps in a six-cap rail to a
     * different height from the other three and put their key chips somewhere
     * else — four control treatments in four hundred pixels, on the one strip
     * that has to read as a single piece of hardware. The word said nothing
     * the figure did not.
     */
    assert.equal(legend(CONTROLS.speedFast), '<span class="lg lg-stack"><b>2×</b></span>');
    assert.equal(legend(CONTROLS.speedHold), '<span class="lg lg-stack"><b>HOLD</b></span>');
    for (const entry of Object.values(CONTROLS)) {
      assert.doesNotMatch(legend(entry), /<i>/,
        `the ${entry.en} cap carries a second line it did not ask for`);
    }
    // A caller may still hand a cap a state line — the launch cap says what it
    // is waiting for under its verb — and that is a decision at the call site,
    // not a property of the nomenclature.
    assert.match(legend(CONTROLS.launch, { sub: 'RAILS EMPTY' }), /<i>RAILS EMPTY<\/i>/);
  });

  test('every key chip is printed in capitals', () => {
    // 'STAY AT THE POST · Esc' was the one mixed-case hint in the build.
    assert.match(keycap('Esc'), />ESC</);
    assert.equal(keycap(''), '');
    // A chip of more than two glyphs reserves more of the cap's corner for
    // itself, or it is drawn across the legend it belongs to.
    assert.match(keycap('Alt1'), /class="kc kc-wide"/);
    assert.doesNotMatch(keycap('R'), /kc-wide/);
  });

  test('the weapons states are three positions, in one order', () => {
    assert.deepEqual(POSTURE_CYCLE, ['hold', 'tight', 'free']);
    for (const state of POSTURE_CYCLE) {
      assert.ok(CONTROLS[state]?.tm && CONTROLS[state]?.en,
        `the ${state} cap needs both halves of its legend`);
    }
  });

  test('a switch legend is short enough to be printed permanently', () => {
    // Both positions of a switch are engraved beside the lever all night, so
    // neither may be a sentence: RIDE — HOLD THE BEAM did not fit a rack third.
    for (const entry of [CONTROLS.radiate, CONTROLS.silence, CONTROLS.ride, CONTROLS.perDoctrine]) {
      assert.ok(entry.en.length <= 13, `"${entry.en}" is too long for a switch position`);
      assert.ok(entry.tm.length <= 13, `"${entry.tm}" is too long for a switch position`);
    }
  });
});

describe('the console a watch actually fits', () => {
  test('the teaching watch carries none of the three optional caps', () => {
    const caps = consoleCaps(scenarioById('first-light'));
    assert.deepEqual(
      { salvo: caps.salvo, ride: caps.ride, displace: caps.displace },
      { salvo: false, ride: false, displace: false },
    );
  });

  test('displacement appears where something hunts the position', () => {
    assert.equal(consoleCaps(scenarioById('weasel-hour')).displace, true);
    assert.equal(consoleCaps(scenarioById('solo-battery')).displace, false,
      'nothing in that raid carries an anti-radiation round');
  });

  test('a scenario with no console notes still answers', () => {
    const caps = consoleCaps(undefined);
    assert.equal(caps.salvo, true);
    assert.equal(caps.displace, false);
  });
});

describe('the rail steps this seat’s list', () => {
  /*
   * The player: "By removing the graphical launch button you now can't launch
   * on mobile." On a phone the rail is the console, and its NEXT TARGET cap
   * steps through the list this seat is looking at. In the cabin that list is
   * the battery's own picture — what its radar holds, plus what the net has
   * cued it onto — which fills later than the sector's. The cap used to
   * light on the sector's count, so on a two-seat watch a thumb that tapped
   * it while the cabin's list was still empty got nothing. The rule is one
   * function now, and this holds both halves of it.
   */
  test('the cabin’s picture is its own radar’s, and empty while that radar is cold', () => {
    const world = watch('ville-under-fire', { role: 'both' });
    const site = world.siteById.get(world.control.crewedBatteryId);
    assert.ok(site, 'the two-seat watch crews a battery');
    for (const radar of world.radarsOf(site)) world.setRadar(radar.id, false);
    // The sector's sets bring up the picture; the cabin's own set is cold.
    for (let t = 0; t < 600 && world.tracks.size === 0; t += 0.5) world.step(0.5);
    assert.ok(world.tracks.size > 0, 'the sector holds a track');
    assert.ok(seatPicture(world, { view: 'net' }).length > 0, 'the net’s list has the sector’s track');
    assert.equal(seatPicture(world, { view: 'crew' }).length, 0,
      'the cabin’s list is empty while its own radar holds nothing — so NEXT TARGET must be dead there');
  });

  test('the picture arrives on the cabin’s list when its own radar holds it', () => {
    const world = watch('ville-under-fire', { role: 'both' });
    const site = world.siteById.get(world.control.crewedBatteryId);
    for (const radar of world.radarsOf(site)) world.setRadar(radar.id, true);
    let mine = [];
    for (let t = 0; t < 900 && mine.length === 0; t += 0.5) {
      world.step(0.5);
      mine = seatPicture(world, { view: 'crew' });
    }
    assert.ok(mine.length > 0, 'the crewed battery’s own radar picked something up inside fifteen minutes');
    const own = new Set(world.radarsOf(site).map((r) => r.id));
    for (const track of mine) {
      assert.ok(track.sources.some((id) => own.has(id)) || track.assignedTo.includes(site.id),
        `${track.tn} is on the cabin’s list but neither held by its radar nor cued to it`);
    }
    // And the net still sees everything, in the same order the sector sorts it.
    assert.ok(seatPicture(world, { view: 'net' }).length >= mine.length);
  });
});

describe('the cabin knows where it is', () => {
  /*
   * The player: "When you're in SAM operator mode you're instructed to protect
   * something, your PPI doesn't show where any of that stuff is. You have no
   * idea where you are or what you're defending." The plan view is drawn from
   * `planGeography`, so what it answers here is what the operator sees.
   */
  const cabin = (id, opts = {}) => {
    const w = new World(scenarioById(id), { role: 'crew', seed: 5, ...opts });
    const site = w.siteById.get(w.control.crewedBatteryId);
    return { w, site, ground: planGeography(w, site, SAM_TYPES[site.type].maxRangeKm * 1.35) };
  };

  test('the places this battery defends are on its glass, by name, with the river', () => {
    const { site, ground } = cabin('solo-battery');
    assert.equal(site.name, 'LANCE EAST');
    const labels = ground.assets.map((a) => a.label);
    assert.ok(labels.includes('THE VILLE'), `the town is on the glass: ${labels}`);
    assert.ok(labels.includes('BRIDGE'), `the bridge is on the glass: ${labels}`);
    for (const a of ground.assets) {
      assert.ok(a.rangeKm <= SAM_TYPES[site.type].maxRangeKm * 1.35, `${a.label} inside the display`);
      assert.equal(a.designated, false);
      assert.equal(a.destroyed, false);
    }
    assert.ok(ground.rivers.some((r) => r.name === 'River Mordava'), 'the Mordava runs through the picture');
  });

  test('the place the order names is ringed on the cabin as on the command scope', () => {
    const { w, site, ground: before } = cabin('solo-battery');
    assert.equal(before.designatedId, null);
    w.command.constraints.priorityOfFiresId = 'a_bridge';
    w.command.constraints.priorityDesignatedAtS = w.t;
    const after = planGeography(w, site, SAM_TYPES[site.type].maxRangeKm * 1.35);
    assert.equal(after.designatedId, 'a_bridge');
    assert.deepEqual(after.assets.filter((a) => a.designated).map((a) => a.id), ['a_bridge']);
  });

  test('a place that is gone is still on the glass, crossed out', () => {
    const { w, site } = cabin('solo-battery');
    const depot = w.assetById.get('a_depot');
    depot.destroyed = true;
    depot.damage = 10 ** 6;
    const ground = planGeography(w, site, SAM_TYPES[site.type].maxRangeKm * 1.35);
    const drawn = ground.assets.find((a) => a.id === 'a_depot');
    assert.ok(drawn, 'the depot stays on the picture');
    assert.equal(drawn.destroyed, true);
    assert.equal(drawn.hurt, 1);
  });

  test('a town beyond the display is not lettered onto it', () => {
    const { site, ground } = cabin('solo-battery');
    for (const town of ground.towns) {
      assert.ok(Math.hypot(town.pos.x - site.pos.x, town.pos.y - site.pos.y)
        <= SAM_TYPES[site.type].maxRangeKm * 1.35, `${town.name} is inside the display`);
    }
    // The long-range battalion sees the capital from its own cabin.
    const capital = cabin('two-cities', { role: 'both' });
    assert.ok(capital.ground.towns.some((t) => t.name === 'Mostrograd'),
      `a 120 km display reaches the capital: ${capital.ground.towns.map((t) => t.name)}`);
  });
});

describe('the horizon on the range-height chart', () => {
  /*
   * The player: "range/altitude scope's radar horizon looks wrong — verify
   * curve/limit." The chart draws the detection model's own horizon formula,
   * inverted, for the set's own mast; these hold the two to each other and
   * pin the figures the chart prints.
   */
  test('the floor the chart draws is the horizon formula inverted', async () => {
    const { radarHorizonKm, horizonFloorM } = await import('../src/engine/math.js');
    for (const h of [5, 7, 13, 18, 26, 32]) {
      const ground = radarHorizonKm(h, 0);
      assert.equal(horizonFloorM(h, ground * 0.5), 0, 'the ground out to the ground horizon');
      assert.equal(horizonFloorM(h, ground), 0);
      for (const km of [ground + 5, 60, 140, 224]) {
        const floor = horizonFloorM(h, km);
        assert.ok(Math.abs(radarHorizonKm(h, floor) - km) < 1e-9,
          `a target at the floor is exactly at the horizon (${h} m mast, ${km} km)`);
      }
    }
  });

  test('the figures on the battalion\'s and the section\'s charts', async () => {
    const { horizonFloorM } = await import('../src/engine/math.js');
    const { horizonCurve } = await import('../src/ui/console.js');
    // The battalion's search set on its 26 m mast, over the 140 km chart.
    const bastion = horizonCurve(26, 140, 25000);
    assert.ok(Math.abs(bastion.groundKm - 21.0) < 0.05, `ground horizon ${bastion.groundKm}`);
    assert.equal(bastion.curve[0][1], 0);
    assert.equal(bastion.curve[21][1], 0, 'still the ground at 21 km');
    assert.ok(Math.abs(bastion.curve[60][1] - horizonFloorM(26, 60)) < 1e-9);
    assert.ok(Math.abs(horizonFloorM(26, 60) - 89) < 1, `89 m at 60 km, got ${horizonFloorM(26, 60)}`);
    assert.ok(Math.abs(horizonFloorM(26, 140) - 834) < 1, `834 m at 140 km, got ${horizonFloorM(26, 140)}`);
    assert.deepEqual(bastion.marks.map((m) => [m.altM, Math.round(m.km)]), [[100, 62], [300, 92]],
      'a hundred metres by sixty-two kilometres, three hundred by ninety-two; a thousand is off the chart');
    // A medium section's set on a 13 m mast, over its 57 km chart.
    const lance = horizonCurve(13, 57, 16000);
    assert.ok(Math.abs(lance.groundKm - 14.9) < 0.05);
    assert.ok(Math.abs(horizonFloorM(13, 57) - 104) < 1, `104 m at the rim, got ${horizonFloorM(13, 57)}`);
    assert.deepEqual(lance.marks.map((m) => [m.altM, Math.round(m.km)]), [[100, 56]]);
    // Nothing on a point-defence chart: its ring ends long before the horizon matters.
    assert.deepEqual(horizonCurve(5, 21, 7000).marks, []);
  });

  test('every set the chart can be sat at has a mast the formula reads', () => {
    for (const [id, type] of Object.entries(SAM_TYPES)) {
      const radar = type.radar ?? RADAR_TYPES[type.radarType];
      assert.ok(radar && radar.heightM > 0, `${id} carries an antenna height`);
    }
  });
});
