/**
 * The cabin's own authority: a shot the net did not call for.
 *
 * The player: "SAM operator can autonomously lock/engage, drawing anger from
 * up echelon and the political commissar." The seat could always lock what
 * its battery could physically take; what was missing was the answer. These
 * pin the answer: the net objects on the radio at the first round, the
 * standing is charged by what was fired at, the section speaks when it was
 * more than a hostile, and none of it applies to a cue or to a crew freed by
 * order.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { World } from '../src/engine/world.js';
import { scenarioById } from '../src/engine/scenarios.js';
import { COMMAND } from '../src/engine/config.js';
import { beginEngagement } from '../src/engine/doctrine.js';
import { inEnvelope, timeToInRangeS } from '../src/engine/weapons.js';
import { cannotEngageReason } from '../src/engine/threat.js';

/** A crew watch with the operator's own set up, run until `pick` finds a contact. */
function crewWatch(id, pick, { seed = 3, maxS = 900 } = {}) {
  const w = new World(scenarioById(id), { role: 'crew', seed });
  const mine = w.siteById.get(w.control.crewedBatteryId);
  for (const r of w.radars) w.setRadar(r.id, true);
  let track = null;
  for (let i = 0; i < maxS * 10 && !track; i++) {
    w.step(0.1);
    track = [...w.tracks.values()].find((t) => pick(t, mine, w)) ?? null;
  }
  assert.ok(track, `a contact for ${id} appeared`);
  return { w, mine, track };
}

/** A firm hostile the battery can take, and that will be inside its ring within half a minute. */
const takeable = (t, m, w) => t.hostility === 'hostile' && !t.destroyed && !cannotEngageReason(w, m, t)
  && (inEnvelope(m, t.pos, t.altM).ok || timeToInRangeS(m, t) <= 30);

/** Lock a contact the net has not called to the battery, wait for the ring, fire. */
function takeAndFire(w, mine, track, { steps = 3000, beforeFire = null } = {}) {
  // Whatever the net had going on this channel is not the operator's call.
  for (const e of [...mine.engagements]) w.unassign(e.trackId, mine.id);
  assert.ok(w.assign(track.id, mine.id), 'the lock is accepted');
  const own = mine.engagements.find((e) => e.trackId === track.id);
  assert.ok(own && own.manual && !own.cued, 'a lock from the cabin is manual and not cued');
  let launched = 0;
  for (let i = 0; i < steps && !launched; i++) {
    w.step(0.1);
    const e = mine.engagements.find((x) => x.trackId === track.id);
    if (!e) break;
    if (e.state === 'ready' && inEnvelope(mine, track.pos, track.altM).ok) {
      beforeFire?.(w, track);
      launched = w.fire(mine.id, track.id);
    }
  }
  return { launched, own };
}

const ownAuthorityLines = (w) => w.events.filter((e) => /own authority|WHO CLEARED|WITHOUT AN ORDER|NO ORDER ON|CEASE AND REPORT|CEASE FIRE|POLITICAL SECTION/.test(e.text));

describe('a shot on your own authority', () => {
  test('a firm hostile the net did not call to you: the net asks who cleared it, and the file notes it', () => {
    const { w, mine, track } = crewWatch('solo-battery', takeable);
    const { launched } = takeAndFire(w, mine, track);
    assert.ok(launched > 0, 'the round left the rail');
    assert.equal(w.stats.ownAuthorityEngagements, 1);
    assert.equal(w.stats.roundsOnOwnAuthority, launched);
    const entry = w.command.ledger.find((l) => /on your own authority/.test(l.reason));
    assert.ok(entry, 'the ledger carries the charge');
    assert.equal(entry.charged, COMMAND.standing.ownAuthorityHostile * (w.difficulty?.standingLossMult ?? 1));
    assert.ok(entry.charged < 0, 'and it is a charge, whatever the account could still pay');
    const challenge = w.events.find((e) => e.kind === 'comms' && /WHO CLEARED THAT SHOT\? YOU HAVE NO ORDER ON/.test(e.text));
    assert.ok(challenge, `the net answered on the radio: ${ownAuthorityLines(w).map((e) => e.text).join(' | ')}`);
    assert.match(challenge.text, new RegExp(`${mine.name}, WHO CLEARED THAT SHOT\\? YOU HAVE NO ORDER ON ${track.tn}\\.`));
    // A hostile draws the net, not the section: no political line for one shot.
    for (let i = 0; i < 120; i++) w.step(0.1);
    assert.ok(!w.events.some((e) => /POLITICAL SECTION/.test(e.text)), 'the section says nothing about one hostile');
  });

  test('a second round on the same engagement costs rounds, not a second charge', () => {
    const { w, mine, track } = crewWatch('solo-battery', takeable);
    const { launched } = takeAndFire(w, mine, track);
    assert.ok(launched > 0);
    // The engagement is stamped, so the fall of the aircraft can be read back.
    const own = mine.engagements.find((e) => e.trackId === track.id);
    assert.equal(own?.ownAuthority, true);
    for (const id of own.missileIds) assert.equal(w.missiles.find((m) => m.id === id)?.ownAuthority, true);
    // Simulate the shoot-look-shoot: a second salvo on the same engagement.
    own.state = 'ready';
    const again = w.fire(mine.id, track.id);
    if (again > 0) {
      assert.equal(w.stats.ownAuthorityEngagements, 1, 'still one engagement');
      assert.equal(w.stats.roundsOnOwnAuthority, launched + again, 'every round counted');
      assert.equal(w.command.ledger.filter((l) => /on your own authority/.test(l.reason)).length, 1, 'charged once');
    }
  });

  test('a cue from the net is not your own authority', () => {
    const { w, mine, track } = crewWatch('solo-battery', takeable);
    for (const e of [...mine.engagements]) w.unassign(e.trackId, mine.id);
    const cue = beginEngagement(w, mine, track, { manual: true, origin: 'assigned', cued: true });
    assert.ok(cue, 'the cue is accepted');
    let launched = 0;
    for (let i = 0; i < 3000 && !launched; i++) {
      w.step(0.1);
      const e = mine.engagements.find((x) => x.trackId === track.id);
      if (!e) break;
      if (e.state === 'ready' && inEnvelope(mine, track.pos, track.altM).ok) launched = w.fire(mine.id, track.id);
    }
    assert.ok(launched > 0, 'the cued round left the rail');
    assert.equal(w.stats.ownAuthorityEngagements, 0);
    assert.equal(w.stats.roundsOnOwnAuthority, 0);
    assert.ok(!w.command.ledger.some((l) => /own authority/.test(l.reason)));
    assert.ok(!w.events.some((e) => /WHO CLEARED THAT SHOT/.test(e.text)));
  });

  test('a crew freed by order is on its own authority by order, and nobody objects', () => {
    const { w, mine, track } = crewWatch('solo-battery', takeable);
    const formation = w.formationById.get(mine.formationId);
    formation.posture = 'free';
    const { launched, own } = takeAndFire(w, mine, track);
    assert.ok(launched > 0);
    assert.equal(own.ownAuthority, 'by order');
    assert.equal(w.stats.ownAuthorityEngagements, 0);
    assert.ok(!w.command.ledger.some((l) => /own authority/.test(l.reason)));
    assert.ok(!w.events.some((e) => /WHO CLEARED THAT SHOT/.test(e.text)));
  });

  test('the crew’s own switch is not an order: WEAPONS FREE on the console changes nothing', () => {
    const { w, mine, track } = crewWatch('solo-battery', takeable);
    w.setWeaponsState(mine.id, 'free');
    assert.equal(w.formationById.get(mine.formationId).posture, 'tight', 'the order in force is still TIGHT');
    const { launched } = takeAndFire(w, mine, track);
    assert.ok(launched > 0);
    assert.equal(w.stats.ownAuthorityEngagements, 1);
  });

  test('a friendly contact: cease fire on the radio, a heavier charge, and the section opens a file', () => {
    // The picture's word for the contact at the moment of the shot is what the
    // charge reads; the identification is flipped under the operator's finger.
    const { w, mine, track } = crewWatch('solo-battery', takeable);
    const { launched } = takeAndFire(w, mine, track, { beforeFire: (_, t) => { t.hostility = 'friendly'; } });
    assert.ok(launched > 0, 'the round left the rail');
    const entry = w.command.ledger.find((l) => /a friendly contact, on your own authority/.test(l.reason));
    assert.ok(entry, `charged as a friendly: ${w.command.ledger.map((l) => l.reason).join(' | ')}`);
    assert.equal(entry.charged, COMMAND.standing.ownAuthorityFriendly * (w.difficulty?.standingLossMult ?? 1));
    assert.ok(w.events.some((e) => e.kind === 'comms' && /CEASE FIRE\. CEASE FIRE\./.test(e.text)), 'the net said cease fire');
    for (let i = 0; i < 80; i++) w.step(0.1);
    assert.ok(w.events.some((e) => /POLITICAL SECTION: .* FRIENDLY CONTACT WITHOUT ORDERS\. THE FILE IS OPEN\./.test(e.text)),
      `the section spoke: ${ownAuthorityLines(w).map((e) => e.text).join(' | ')}`);
  });

  test('an unidentified contact: cease and report, and the section refers it', () => {
    const { w, mine, track } = crewWatch('solo-battery', takeable);
    const { launched } = takeAndFire(w, mine, track, { beforeFire: (_, t) => { t.hostility = 'pending'; } });
    assert.ok(launched > 0, 'the round left the rail');
    const entry = w.command.ledger.find((l) => /unidentified, on your own authority/.test(l.reason));
    assert.ok(entry, 'charged as unidentified');
    assert.equal(entry.charged, COMMAND.standing.ownAuthorityUnknown * (w.difficulty?.standingLossMult ?? 1));
    assert.ok(w.events.some((e) => e.kind === 'comms' && /IS NOT IDENTIFIED AND YOU HAVE NO ORDER ON IT\. CEASE AND REPORT\./.test(e.text)));
    for (let i = 0; i < 100; i++) w.step(0.1);
    assert.ok(w.events.some((e) => /POLITICAL SECTION: THE EXPENDITURE AT .* AGAINST AN UNIDENTIFIED CONTACT WAS NOT ORDERED\. IT IS REFERRED\./.test(e.text)));
  });

  test('the office reads it back in the evening', async () => {
    const { scenesFor } = await import('../src/ui/scenes.js');
    const { createCharacter } = await import('../src/engine/character.js');
    const character = createCharacter({ name: 'Test' });
    const state = { narrativePressure: true, campaign: { character, completed: {}, family: {}, revelations: [] } };
    const result = { success: true, held: true, missionId: 'solo-battery', stats: { kills: 1, leakers: 0, roundsFired: 2, assetsLost: 0, turnedBack: 0 },
      ledger: [{ t: 100, delta: -2, charged: -2, reason: 'engaged T-004 on your own authority' }], assets: [], score: 300, standing: 48, tier: { id: 'satisfactory', label: 'SATISFACTORY' }, score: 300 };
    const office = scenesFor(state, result, {}).find((s) => s.id === 'commissar');
    assert.ok(office.lines.some((l) => /The log says: engaged T-004 on your own authority\. The section notes it\./.test(l)), office.lines.join(' | '));
  });
});
