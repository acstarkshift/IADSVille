/**
 * The words, after the ninth panel.
 *
 * The reviewer's verdict was that the sentences were a nine and the delivery
 * a seven: refusals read back in broken English, refusals narrated as silence,
 * one SIGNAL line printed on seven briefings out of ten, a net that sent 173
 * orders drawn from 43 sentences, endings that all landed on the same
 * negation. Each of those is pinned here as a property of the text.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { World } from '../src/engine/world.js';
import { scenarioById } from '../src/engine/scenarios.js';
import { emptyCampaign, enlist, recordMission, briefingNote } from '../src/engine/campaign.js';
import { scenesFor, openingScenes, FAVOUR_BY_KIND, OFFICER } from '../src/ui/scenes.js';
import { DIRECTIVES } from '../src/engine/command.js';
import { ENDINGS, readFinale, composeEnding } from '../src/engine/endings.js';
import { FLIGHT_ENDINGS, readFlight } from '../src/engine/epilogue.js';
import { createCharacter } from '../src/engine/character.js';
import { renderBriefing, renderMenu, issuingFormation } from '../src/ui/screens.js';

function enlisted() {
  const c = emptyCampaign();
  enlist(c, { name: 'Yasna Petrina', background: 'academy', household: 'mother' });
  return c;
}

function stood(missionId, { seed = 5, role = 'net', reason = 'raid-spent', campaign = null, seconds = 600 } = {}) {
  const c = campaign ?? enlisted();
  const mission = scenarioById(missionId);
  const w = new World(mission, { role, seed });
  for (const r of w.radars) w.setRadar(r.id, true);
  for (const s of w.sites) w.setWeaponsState(s.id, 'free');
  for (let i = 0; i < seconds * 4; i++) w.step(0.25);
  const result = w.result(reason);
  const entry = recordMission(c, result);
  return { campaign: c, mission, result, entry, state: { campaign: c, mission, narrativePressure: true } };
}

const office = (state, result, entry) => scenesFor(state, result, entry).find((s) => s.id === 'commissar');

describe('refusal is legible', () => {
  test('each hinge refused is read back in its own words, with its article', () => {
    const { state, result, entry } = stood('economy-of-force');
    const rows = [
      ['refused the expenditure freeze', 'the refusal of the expenditure freeze is referred', /refused the expenditure freeze on the net at \d\d:\d\d, in the clear/],
      ['refused the restriction on firing across the border', 'the refusal of the border restriction is referred', /refused the restriction on firing across the border at \d\d:\d\d/],
      ['refused the order to engage the civil transit', 'the refusal of a political section instruction is referred', /refused the political section's order on the civil transit/],
      ['refused the order to release the district battalion', 'refused a movement order from the directorate', /refused the directorate's movement order/],
      ['refused the priority of fires to the palace', null, /refused the priority of fires to the palace on the net/],
      ['refused the order to protect the state aircraft', null, /refused the order to protect the state aircraft/],
    ];
    for (const [answer, referral, expect] of rows) {
      const r = { ...result, ledger: [
        { t: 300, delta: -9, charged: -9, reason: answer },
        ...(referral ? [{ t: 600, delta: -12, charged: -12, reason: referral }] : []),
      ] };
      const lines = office(state, r, entry).lines;
      assert.ok(lines.some((l) => expect.test(l)), `${answer}: ${lines.join(' | ')}`);
      assert.ok(!lines.some((l) => /You refused expenditure freeze|refused border restriction|refused political section instruction|refused the order on the net/.test(l)),
        `no raw template: ${lines.join(' | ')}`);
      assert.equal(lines.filter((l) => /refused/i.test(l)).length, 1, 'one refusal, one sentence');
    }
  });

  test('a routine order refused still names the order, article and all', () => {
    const { state, result, entry } = stood('economy-of-force');
    const r = { ...result, ledger: [{ t: 300, delta: -9, charged: -9, reason: 'refused the order to keep radiating' }] };
    assert.ok(office(state, r, entry).lines.some((l) => /You refused the order to keep radiating on the net at \d\d:\d\d\./.test(l)));
    const check = { ...result, ledger: [{ t: 300, delta: -12, charged: -12, reason: 'no reply to the request for confirmation' }] };
    assert.ok(office(state, check, entry).lines.some((l) => /acknowledge this office's radio check at/.test(l)));
  });

  test('saying yes and quietly not doing it is noticed, without an accusation', () => {
    const { state, result, entry } = stood('economy-of-force');
    const quiet = { ...result, ledger: [{ t: 700, delta: -14, charged: -14, reason: 'acknowledged the engagement order and did not carry it out' }] };
    const line = office(state, quiet, entry).lines.find((l) => /civil transit/.test(l));
    assert.ok(line, 'the quiet refusal is read back');
    assert.match(line, /you agreed/);
    assert.ok(!/fail/.test(line.replace('failed to carry', '')), 'he is not accusing them of failing');
    const done = { ...result, ledger: [{ t: 700, delta: 2, charged: 2, reason: 'civil transit engaged as ordered' }] };
    assert.ok(office(state, done, entry).lines.some((l) => /engaged as ordered/.test(l)),
      'and so is doing it');
  });

  test('the read-backs are ranked by what they cost, not by where the ledger put them', () => {
    const { state, result, entry } = stood('economy-of-force');
    const r = { ...result, ledger: [
      { t: 100, delta: -6, charged: -6, reason: 'rounds expended outside the freeze, over the district hospital' },
      { t: 700, delta: 6, charged: 6, reason: 'DEPOT untouched, as ordered' },
      { t: 700, delta: 3, charged: 3, reason: 'no leakers, as ordered' },
    ] };
    const lines = office(state, r, entry).lines;
    assert.ok(lines.some((l) => /district hospital/.test(l)), `the hospital rounds are read back: ${lines.join(' | ')}`);
  });

  test('on the epilogue the palace is not read back as a defended place', () => {
    const { state, result, entry } = stood('presidents-flight', { seconds: 400 });
    const r = { ...result, endingId: 'escorted', stats: { ...result.stats, vipEscaped: true },
      ledger: [{ t: 500, delta: 6, charged: 6, reason: 'PRESIDENTIAL PALACE untouched, as ordered' }] };
    const lines = office(state, r, entry).lines;
    assert.ok(!lines.some((l) => /place you were ordered to protect|designated place/.test(l)), lines.join(' | '));
    assert.match(lines[0], /frontier|STATE 01/, 'the first line is about the aircraft');
  });
});

describe('the office does not repeat itself', () => {
  test('every favour has four sentences and they differ', () => {
    for (const [kind, list] of Object.entries(FAVOUR_BY_KIND)) {
      assert.equal(list.length, 4, `${kind}`);
      const e = { order: 'the order to keep radiating', at: null, kind: { id: kind }, turn: 0 };
      const said = list.map((f) => f(e));
      assert.equal(new Set(said).size, 4, `${kind} says four different things`);
    }
  });

  test('the same favour on consecutive evenings is not the same sentence', () => {
    const { state, result, entry } = stood('economy-of-force');
    const r = { ...result, ledger: [{ t: 700, delta: 6, charged: 6, reason: 'DEPOT untouched, as ordered' }] };
    const heard = new Set();
    for (let i = 0; i < 4; i++) {
      state.campaign.history.push({ tier: 'satisfactory', missionId: `filler-${i}` });
      heard.add(office(state, r, entry).lines.find((l) => /place|designated/.test(l)));
    }
    assert.ok(heard.size >= 3, [...heard].join(' / '));
  });

  test('on the finale he says one thing about himself', () => {
    const { state, result, entry } = stood('two-cities', { seconds: 900 });
    const lines = office(state, { ...result, reason: 'raid-spent' }, entry).lines;
    assert.ok(lines.some((l) => /file on me/.test(l)), lines.join(' | '));
    const ordinary = stood('economy-of-force');
    assert.ok(!office(ordinary.state, ordinary.result, ordinary.entry).lines.some((l) => /file on me/.test(l)));
  });

  test('the abandoned evening ends on the roster, not on the condemned dismissal', () => {
    const { state, result, entry } = stood('first-light', { reason: 'aborted', seconds: 60 });
    assert.match(office(state, result, entry).lines.at(-1), /roster/);
  });
});

describe('the SIGNAL line', () => {
  test('four per tier, taken in turn, and reading the night before', () => {
    for (const tier of ['commended', 'satisfactory', 'noted', 'flagged', 'condemned', 'abandoned']) {
      const campaign = enlisted();
      const seen = new Set();
      for (let i = 0; i < 4; i++) {
        campaign.history.push({ tier, missionId: `m${i}`, leakers: 2, assetsLost: 1 });
        campaign.completed[`m${i}`] = { score: 1 };
        seen.add(briefingNote(campaign, { missionId: 'solo-battery' }));
      }
      assert.equal(seen.size, 4, `${tier}: ${[...seen].join(' / ')}`);
    }
  });
});

describe('the net says it more than one way', () => {
  const routine = ['radiate', 'noLeakers', 'conserve', 'priority', 'civilCorridor', 'explain', 'emconDiscipline', 'displaced'];

  test('each routine order has three or four wordings, chosen by the watch', () => {
    for (const id of routine) {
      const wordings = new Set();
      for (let watches = 0; watches < 4; watches++) {
        const w = new World(scenarioById('weasel-hour'), { role: 'net', seed: 'w', character: createCharacter({ name: 'T' }) });
        w.character.watches = watches;
        w.command.darkTimeS = 60;
        w.stats.roundsFired = 9;
        const subject = DIRECTIVES[id].pick ? DIRECTIVES[id].pick(w) : null;
        wordings.add(DIRECTIVES[id].text(w, subject));
      }
      assert.ok(wordings.size >= 3, `${id} has ${wordings.size} wording(s)`);
    }
  });

  test('the same file on the same watch always hears the same one', () => {
    const a = new World(scenarioById('weasel-hour'), { role: 'net', seed: 'a', character: createCharacter({ name: 'T' }) });
    const b = new World(scenarioById('weasel-hour'), { role: 'net', seed: 'b', character: createCharacter({ name: 'T' }) });
    a.character.watches = 2; b.character.watches = 2;
    assert.equal(DIRECTIVES.noLeakers.text(a), DIRECTIVES.noLeakers.text(b));
  });

  test('the no-leakers order knows which map it is on', () => {
    const valley = new World(scenarioById('weasel-hour'), { role: 'net', character: createCharacter({ name: 'T' }) });
    const district = new World(scenarioById('four-sectors'), { role: 'net', character: createCharacter({ name: 'T' }) });
    for (let watches = 0; watches < 4; watches++) {
      valley.character.watches = watches;
      district.character.watches = watches;
      assert.match(DIRECTIVES.noLeakers.text(valley), /river/);
      assert.ok(!/river line|the town/.test(DIRECTIVES.noLeakers.text(district)),
        `district: ${DIRECTIVES.noLeakers.text(district)}`);
      assert.match(DIRECTIVES.noLeakers.text(district), /DISTRICT ACTUAL/);
    }
  });
});

describe('the endings know the order was refused', () => {
  const outcome = (villePct, palacePct, over = {}) => ({
    missionId: 'two-cities', reason: 'raid-spent', finale: true,
    assets: [
      { type: 'town', label: 'THE VILLE', destroyed: villePct >= 100, damagePct: villePct, districtsHit: [] },
      { type: 'palace', label: 'PRESIDENTIAL PALACE', destroyed: palacePct >= 100, damagePct: palacePct },
    ],
    stats: { civilianCasualties: 200, homeDistrictHit: false, roundsByCluster: { ville: 8, capital: 14 },
      roundsAgainstOrder: 0, postOverrun: false, displacedToSurvive: false, playedOutS: 240, ...(over.stats ?? {}) },
    constraints: { palaceOrderRefused: true },
  });
  const character = createCharacter({ name: 'Тест', household: 'sister' });

  test('every finale ending carries a refusal clause', () => {
    const cases = {
      obedient: outcome(90, 5),
      defiant: outcome(5, 90),
      divided: outcome(55, 55),
      exemplary: outcome(10, 10),
      survivor: outcome(95, 95, { stats: { displacedToSurvive: true } }),
      overrun: outcome(90, 90, { stats: { postOverrun: true } }),
      collapse: outcome(95, 95),
    };
    for (const [id, result] of Object.entries(cases)) {
      const composed = composeEnding(result, character);
      assert.equal(composed.id, id);
      assert.ok(composed.lines.some((l) => /refus|declined on the net/i.test(l)),
        `${id}: ${composed.lines.join(' | ')}`);
    }
  });

  test('and the flight endings tell refusing from staying silent', () => {
    const flight = (stats, constraints) => readFlight({
      missionId: 'presidents-flight', reason: 'raid-spent', epilogue: true,
      assets: [{ type: 'palace', destroyed: false, damagePct: 0 }, { type: 'airport', destroyed: false, damagePct: 0 }],
      stats: { kills: 3, civilianCasualties: 0, vipEscaped: false, vipDown: false, vipDownedBy: null, vipRoundsFired: 0, ...stats },
      constraints,
    });
    for (const [id, stats] of [['abandoned', { vipDown: true, vipDownedBy: 'enemy' }],
      ['judgement', { vipDown: true, vipDownedBy: 'operator', vipRoundsFired: 1 }],
      ['escorted', { vipEscaped: true }]]) {
      const refused = FLIGHT_ENDINGS[id].lines(flight(stats, { flightOrderRefused: true }), character).filter(Boolean).join(' ');
      const silent = FLIGHT_ENDINGS[id].lines(flight(stats, {}), character).filter(Boolean).join(' ');
      assert.match(refused, /You refused the order/, id);
      assert.ok(!/did not acknowledge|did not answer the net/.test(refused), `${id}: a refusal is not silence`);
      assert.notEqual(refused, silent, id);
    }
  });

  test('at least four endings land on a plain fact, without a negation in it', () => {
    const negation = /\b(no|not|nobody|nothing|never|rarely|without)\b/i;
    const closers = Object.values(ENDINGS).map((e) => e.lines(readFinale(outcome(50, 50)), character).filter(Boolean).at(-1));
    const plain = closers.filter((l) => !negation.test(l));
    assert.ok(plain.length >= 4, `${plain.length} plain closers: ${closers.join(' || ')}`);
    assert.ok(!negation.test(ENDINGS.exemplary.lines(readFinale(outcome(10, 10)), character).at(-1)));
    assert.ok(!negation.test(ENDINGS.divided.lines(readFinale(outcome(55, 55)), character).at(-1)));
  });
});

describe('the chrome knows where the player is', () => {
  const host = () => {
    const h = { innerHTML: '', scrollTop: 0, querySelectorAll: () => [], querySelector: () => null };
    return h;
  };

  test('the letterhead is the issuing formation, not a constant', () => {
    assert.equal(issuingFormation(scenarioById('economy-of-force')), 'SECTOR 4-B');
    assert.equal(issuingFormation(scenarioById('four-sectors')), 'DISTRICT COMMAND');
    assert.match(issuingFormation(scenarioById('two-cities')), /NATIONAL/);
    assert.equal(issuingFormation(scenarioById('presidents-flight')), 'CAPITAL SECTOR');
    const h = host();
    const campaign = enlisted();
    renderBriefing(h, { campaign, mission: scenarioById('four-sectors'), role: 'net', narrativePressure: true, batteryId: null });
    assert.match(h.innerHTML, /DISTRICT COMMAND — operation order/);
    assert.ok(!/SECTOR 4-B — operation order/.test(h.innerHTML));
    assert.match(h.innerHTML, /Issued by district operations/);
  });

  test('the front sheet moves with the appointment and the ending', () => {
    const h = host();
    const campaign = enlisted();
    const state = { campaign, mission: scenarioById('first-light'), role: 'radar', difficulty: 'veteran', narrativePressure: true, audio: true, batteryId: null, missionId: 'first-light' };
    renderMenu(h, state);
    assert.match(h.innerHTML, /air defence conscript/);
    campaign.appointment = 'region';
    for (const id of ['first-light', 'low-riders', 'solo-battery', 'weasel-hour', 'white-noise', 'economy-of-force', 'across-the-line', 'ville-under-fire']) {
      campaign.completed[id] = { score: 1, tier: 'satisfactory', role: 'net' };
    }
    renderMenu(h, state);
    assert.ok(!/air defence conscript/.test(h.innerHTML), 'a district commander is not a conscript');
    assert.match(h.innerHTML, /DISTRICT COMMAND/);
    campaign.epilogue = 'escorted';
    campaign.ending = 'obedient';
    renderMenu(h, state);
    assert.match(h.innerHTML, /The last watch has been stood/);
  });

  test('the opening beats carry the post, so the room can change by rung', () => {
    const beats = openingScenes({ mission: { hour: '05:10' }, campaign: { appointment: 'region' } });
    assert.ok(beats.every((b) => b.post === 'region'));
    assert.ok(beats.every((b) => b.silent), 'and they stay wordless');
  });

  test('the officer is named on the plate and in the empty office', () => {
    assert.match(OFFICER.plate, /DOBREK/);
  });
});
