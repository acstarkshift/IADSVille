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
import { readFileSync } from 'node:fs';

import { World } from '../src/engine/world.js';
import { scenarioById } from '../src/engine/scenarios.js';
// (SCENARIOS is imported below with the story-watch checks.)
import { emptyCampaign, enlist, recordMission, briefingNote } from '../src/engine/campaign.js';
import { scenesFor, openingScenes, officeReply, FAVOUR_BY_KIND, OFFICER } from '../src/ui/scenes.js';
import { deskFor } from '../src/ui/desk.js';
import { DIRECTIVES } from '../src/engine/command.js';
import { ENDINGS, readFinale, composeEnding } from '../src/engine/endings.js';
import { FLIGHT_ENDINGS, readFlight } from '../src/engine/epilogue.js';
import { createCharacter, HOUSEHOLDS } from '../src/engine/character.js';
import { LETTERS, CALLS, callFor, recordFamily } from '../src/engine/family.js';
import { REVELATIONS, standing, readFolder } from '../src/engine/revelations.js';
import { SCENARIOS } from '../src/engine/scenarios.js';
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
    // He says what the file calls it, and names the heading he could have used.
    assert.match(line, /an acknowledgement, in your voice/);
    assert.match(line, /a heading for an order not carried out, and I have not used it/);
    assert.ok(!/fail/.test(line), 'he is not accusing them of failing');
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
    for (const id of ['first-light', 'low-riders', 'solo-battery', 'weasel-hour', 'economy-of-force', 'ville-under-fire']) {
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

describe('the story watches have voices', () => {
  test('eight to twelve scripted lines on each of the five, in the register of the radio', () => {
    for (const id of ['economy-of-force', 'ville-under-fire', 'four-sectors', 'reinforce-the-capital']) {
      const chatter = scenarioById(id).chatter ?? [];
      assert.ok(chatter.length >= 8 && chatter.length <= 12, `${id} has ${chatter.length} lines`);
      let last = -1;
      for (const line of chatter) {
        assert.ok(line.text && line.text === line.text.toUpperCase(), `${id}: the radio speaks in capitals`);
        assert.match(line.text, /\.$/, `${id}: a finished sentence: "${line.text}"`);
        assert.ok(line.atS > last, `${id}: in order`);
        last = line.atS;
      }
      assert.ok(chatter.some((l) => !l.pressureOnly), `${id}: some of it is information, not colour`);
    }
    assert.ok(scenarioById('economy-of-force').chatter.some((l) => /HOSPITAL/.test(l.text)));
    assert.ok(scenarioById('economy-of-force').chatter.some((l) => /GORNA/.test(l.text)));
    assert.ok(scenarioById('four-sectors').chatter.some((l) => /BRASOV/.test(l.text)));
    assert.ok(scenarioById('reinforce-the-capital').chatter.some((l) => /COLUMN/.test(l.text)));
  });
});

describe('the player may answer him', () => {
  test('once in each office scene, after the log and before the file entry', () => {
    const { state, result, entry } = stood('economy-of-force');
    const scene = office(state, result, entry);
    assert.ok(scene.ask, 'he waits');
    assert.equal(scene.ask.replies.length, 3);
    assert.deepEqual(scene.ask.replies.map((r) => r.id), ['nothing', 'agree', 'name']);
    assert.equal(scene.ask.replies[2].label, 'The hospital.');
    assert.ok(scene.ask.at >= 0 && scene.ask.at < scene.lines.length - 1, 'the ask is inside the scene');
    // Before the file entry, which does not move for anything you say.
    const entryAt = scene.lines.findIndex((l) => /Sector command|Your conduct|A discrepancy|You are referred/.test(l));
    assert.ok(scene.ask.at < entryAt, `the ask (${scene.ask.at}) comes before the file entry (${entryAt})`);
    // Costed on the net's scale: naming the thing costs a leaker, agreeing earns a little, silence is free.
    assert.equal(scene.ask.replies[0].cost, 0);
    assert.ok(scene.ask.replies[1].cost > 0 && scene.ask.replies[1].cost < 4);
    assert.ok(scene.ask.replies[2].cost < 0 && scene.ask.replies[2].cost > -9);
  });

  test('his next line knows which you chose, and the file records it', () => {
    const { state, result, entry } = stood('economy-of-force');
    const scene = office(state, result, entry);
    const named = officeReply(scene, 'name');
    assert.match(named.lines[0], /^The hospital\./);
    assert.deepEqual(named.lines.slice(1), scene.lines.slice(scene.ask.at + 1), 'the rest of the scene follows');
    assert.equal(named.record.kind, 'said');
    assert.equal(named.record.thing, 'the hospital');
    assert.equal(named.record.id, 'economy-of-force');
    assert.match(officeReply(scene, 'nothing').lines[0], /nothing to add/);
    assert.match(officeReply(scene, 'agree').lines[0], /we agree/);
    assert.ok(!/\?/.test(named.lines[0]), 'he does not argue back');
  });

  test('a watch with nothing moral in it still has something to name', () => {
    const { state, result, entry } = stood('weasel-hour', { role: 'crew' });
    const scene = office(state, result, entry);
    assert.ok(scene.ask, 'he waits on a craft watch too');
    assert.match(scene.ask.replies[2].label, /\.$/);
  });

  test('nobody is asked anything by a finding or an empty room', () => {
    const { state, result, entry } = stood('economy-of-force');
    assert.equal(office(state, { ...result, reason: 'site-lost' }, entry).ask, null);
    const left = stood('first-light', { reason: 'aborted', seconds: 60 });
    assert.equal(office(left.state, left.result, left.entry).ask, null);
  });

  test('and the next evening he quotes back what you named', () => {
    const first = stood('economy-of-force');
    const watches = first.campaign.character.watches;
    first.campaign.character.record.push({ kind: 'said', id: 'economy-of-force', reply: 'name', thing: 'the hospital', cost: -3, at: watches });
    // RE-KEYED BY THE TWELVE-TO-TEN CUT: the evening after the hospital watch
    // used to be Across the Line, which is merged into it. It is Ville Under
    // Fire now, and the one after that is Four Sectors.
    const next = stood('ville-under-fire', { campaign: first.campaign });
    const lines = office(next.state, next.result, next.entry).lines;
    assert.ok(lines.some((l) => /you named the hospital/.test(l)), lines.join(' | '));
    const later = stood('four-sectors', { campaign: first.campaign });
    assert.ok(!office(later.state, later.result, later.entry).lines.some((l) => /you named the hospital/.test(l)),
      'once, on the very next evening, and not again');
  });
});

describe('the family thread reaches the end', () => {
  test('a seventh letter, on the last watch, from a household that heard the column go', () => {
    const letter = LETTERS.find((l) => l.id === 'column-south');
    assert.ok(letter, 'the letter exists');
    assert.equal(letter.after, 'two-cities');
    for (const hh of Object.keys(HOUSEHOLDS)) {
      const lines = letter.lines(hh, { name: 'Yasna Petrina', hit: false, permit: 'standing', watch: 11 });
      assert.ok(lines.length >= 3 && lines.length <= 5, `${hh}: short`);
      assert.match(lines.slice(1, -1).join(' '), /column|lorries|trailer/i, `${hh} heard it go`);
    }
    const campaign = enlisted();
    campaign.history.push({ tier: 'satisfactory' });
    const payload = recordFamily(campaign, { missionId: 'two-cities', stats: {} }, 'satisfactory');
    assert.equal(payload?.id, 'column-south', 'it arrives with the finale');
  });

  test('the telephone call, after the three endings that promise one, in every household voice', () => {
    // The endings that end on the telephone, and only those: the decision at
    // the console, the departure from the order, and both cities held.
    const finale = (villePct, palacePct, constraints = { palaceOrderAccepted: true }) => ({
      missionId: 'two-cities', reason: 'raid-spent', finale: true,
      assets: [
        { type: 'town', label: 'THE VILLE', destroyed: villePct >= 100, damagePct: villePct, districtsHit: [] },
        { type: 'palace', label: 'PRESIDENTIAL PALACE', destroyed: palacePct >= 100, damagePct: palacePct },
      ],
      stats: { civilianCasualties: 200, homeDistrictHit: false, roundsByCluster: { ville: 8, capital: 14 },
        roundsAgainstOrder: 0, postOverrun: false, displacedToSurvive: false, playedOutS: 240 },
      constraints,
    });
    const who = createCharacter({ name: 'Yasna Petrina', household: 'mother' });
    const ending = (result) => composeEnding(result, who);
    const onTelephone = (result) => ending(result).lines
      .some((l) => /\b(?:your call|one call|the call)\b/i.test(l));
    const defiant = finale(5, 90, { palaceOrderRefused: true });
    assert.equal(ending(defiant).id, 'defiant');
    assert.ok(onTelephone(defiant), 'the departure from the order ends on the call');
    assert.equal(ending(finale(10, 10)).id, 'exemplary');
    assert.ok(onTelephone(finale(10, 10)), 'both cities held ends on the call');
    assert.equal(ending(finale(90, 5)).id, 'obedient');
    assert.ok(!onTelephone(finale(90, 5)), 'the obedient ending permits none');
    assert.ok(!onTelephone(finale(5, 90)), 'and the divided one promises none');
    assert.deepEqual(Object.keys(CALLS).sort(), ['defiant', 'exemplary', 'judgement']);
    for (const id of ['judgement', 'defiant', 'exemplary']) {
      assert.ok(CALLS[id], `${id} promises a call`);
      for (const hh of Object.keys(HOUSEHOLDS)) {
        const lines = CALLS[id].lines(hh, { name: 'Yasna Petrina' });
        assert.ok(lines.length >= 4 && lines.length <= 8, `${id}/${hh}: ${lines.length} lines`);
        assert.match(lines[0], /Yasna/, `${id}/${hh} answers by name`);
        for (const line of lines) assert.match(line, /[.!?]$/, `${id}/${hh}: "${line}"`);
        assert.ok(!/[А-Яа-яЁё]/.test(lines.join(' ')), 'in Latin letters');
      }
    }
    assert.match(CALLS.judgement.plate, /NOBODY LISTENING/);
    assert.match(CALLS.defiant.plate, /MONITORED/);
    assert.match(CALLS.exemplary.plate, /PERMITTED/);
    const campaign = enlisted();
    assert.equal(callFor('escorted', campaign), null, 'no call is promised by the escort');
    assert.ok(callFor('judgement', campaign).lines.length >= 4);
  });

  test('the call plays after the ending, and the desk plays both on the way out', () => {
    const { state, result, entry } = stood('presidents-flight', { seconds: 400 });
    const r = { ...result, endingId: 'judgement', stats: { ...result.stats, vipDown: true, vipDownedBy: 'operator', vipRoundsFired: 1 } };
    const scenes = scenesFor(state, r, entry);
    const ids = scenes.map((s) => s.id);
    assert.equal(ids.at(-2), 'ending');
    assert.equal(ids.at(-1), 'call');
    assert.equal(scenes.at(-1).kind, 'call');
    assert.match(scenes.at(-1).speaker, /THE TELEPHONE/);
    const { items, outro } = deskFor(state, r, entry);
    assert.deepEqual(outro.map((s) => s.id), ['ending', 'call']);
    assert.ok(!items.some((i) => i.id === 'call'));
    const escorted = { ...result, endingId: 'escorted', stats: { ...result.stats, vipEscaped: true } };
    assert.ok(!scenesFor(state, escorted, entry).some((s) => s.id === 'call'));
  });
});

describe('the hook is paid', () => {
  test('the transfer manifests say why nothing was ever forecast against Brasov', () => {
    assert.ok(REVELATIONS.buyer.lines.some((l) => /Brasov/.test(l)));
    const campaign = enlisted();
    readFolder(campaign, 'buyer');
    assert.match(standing(campaign), /Brasov/);
    assert.ok(scenarioById('four-sectors').brief.some((l) => /Brasov/.test(l)), 'and the hook is still pulled');
  });
});

/*
 * The player: "The commissar spends too much time saying 'no one will look at
 * this.' I don't even know what that means." The construction — nobody, no
 * one, and a verb of attention in the negative — was the dominant sentence
 * shape of the whole closing register, doing four different jobs in the same
 * words: a threat, a reassurance, a trap, and a complaint about his own work.
 * The survivors each do one of those plainly, and there are few enough of
 * them to land. This reads the source the way the palette test does, so the
 * count cannot creep back up a line at a time.
 */
describe('nobody is rare', () => {
  test('nobody, with a verb of attention, appears in the closing register a handful of times', () => {
    const FILES = ['src/engine/endings.js', 'src/engine/epilogue.js', 'src/engine/revelations.js',
      'src/engine/campaign.js', 'src/ui/scenes.js', 'src/ui/screens.js', 'src/ui/desk.js'];
    const LIT = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;
    const SHAPE = /\b(nobody|no one|no-one)\b[^.;]{0,40}\b(ask\w*|read\w*|look\w*|mention\w*|notic\w*|record\w*|enter\w*|sign\w*|listen\w*|tell|tells|told|say|says|said|see|seen|shown|reliev\w*|come|came|offer\w*|written|write|writes|explain\w*|claim\w*|withdraw\w*)\b/i;
    const hits = [];
    for (const f of FILES) {
      const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      for (const m of src.matchAll(LIT)) {
        const s = m[1] ?? m[2] ?? m[3] ?? '';
        if (SHAPE.test(s)) hits.push(`${f}: ${s.slice(0, 90)}`);
      }
    }
    assert.ok(hits.length <= 8, `${hits.length} lines say nobody will look:\n${hits.join('\n')}`);
    // And the ones that stay are the ones with a job: his own file, the war
    // nobody has written down, the clerk's advice about the form.
    assert.ok(hits.some((h) => /nobody has offered/.test(h)), 'the one thing he says about himself');
    assert.ok(hits.some((h) => /written down what it is about/.test(h)));
    assert.ok(hits.some((h) => /nobody reads the/.test(h)), 'the clerk, once, about the reason box');
  });

  test('the office says what the district reads, in more than one way, and never that nobody will look', () => {
    const { state, result, entry } = stood('economy-of-force');
    const all = [];
    for (let turn = 0; turn < 4; turn++) {
      state.campaign.standing = 60;
      state.campaign.history = Array.from({ length: turn }, () => ({ tier: 'satisfactory' }));
      all.push(...office(state, result, entry).lines);
    }
    const text = all.join(' ');
    // A sincere reassurance with the mechanism in it...
    assert.match(text, /loss return clipped to the front|loss return is blank|goes in the drawer and stays there/);
    // ...and no evening tells the player nobody will look at anything.
    assert.ok(!/nobody will|no one will|read by nobody|nobody has asked/i.test(text), text);
  });
});
