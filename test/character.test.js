/**
 * The service record.
 *
 * The rule these tests exist to defend is that nothing in the RPG layer is
 * decorative: a background, a qualification or an injury has to come out the
 * other end as a number the simulation actually uses. Where a test asserts a
 * rank or a decoration, it is checking the bookkeeping; where it builds a World,
 * it is checking that the bookkeeping reaches the equipment.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  RANKS, BACKGROUNDS, SKILLS, DECORATIONS,
  createCharacter, rankOf, backgroundOf, nextRank, experienceFor,
  recordWatch, canLearn, learnSkill, characterModifiers, suggestName, describe as describeChar,
} from '../src/engine/character.js';
import { World } from '../src/engine/world.js';
import { scenarioById } from '../src/engine/scenarios.js';
import { channelsFor } from '../src/engine/doctrine.js';
import { SAM_TYPES, COMMAND, DETECTION } from '../src/engine/config.js';
import { emptyCampaign, enlist, missionModifiers, recordMission, memoryStore, saveCampaign, loadCampaign } from '../src/engine/campaign.js';
import { interruptConsole, consoleDark } from '../src/engine/damage.js';
import { stepRadarPower } from '../src/engine/detection.js';

/** A watch that went well, for feeding the record. */
const goodWatch = (over = {}) => ({
  missionId: 'first-light', role: 'net', reason: 'raid-spent', success: true, score: 1000,
  stats: {
    kills: 4, turnedBack: 2, leakers: 0, sortiesTotal: 10, roundsFired: 9,
    radarsLost: 0, armsIncoming: 0, assetsLost: 0,
  },
  ...over,
});

describe('enlistment', () => {
  test('a new soldier starts at the bottom with nothing', () => {
    const character = createCharacter({ name: 'Мила Стрельник', background: 'border' });
    assert.equal(rankOf(character).id, RANKS[0].id);
    assert.equal(character.xp, 0);
    assert.equal(character.points, 0);
    assert.deepEqual(character.skills, []);
    assert.deepEqual(character.decorations, []);
    assert.equal(character.wounded, false);
    assert.equal(backgroundOf(character).id, 'border');
    assert.match(describeChar(character), /Мила Стрельник/);
  });

  test('a suggested name is always usable', () => {
    for (let i = 0; i < 20; i++) {
      const name = suggestName();
      assert.ok(name.length > 3 && name.includes(' '), name);
    }
  });

  test('an unknown background falls back rather than breaking the campaign', () => {
    const character = createCharacter({ name: 'X', background: 'nonsense' });
    assert.ok(BACKGROUNDS[backgroundOf(character).id]);
  });
});

describe('backgrounds are real trade-offs', () => {
  test('the capital academy starts high and is judged harder', () => {
    const mods = characterModifiers(createCharacter({ background: 'academy' }));
    assert.ok(mods.startingStanding > COMMAND.startingStanding);
    assert.ok(mods.standingLossMult > 1);
  });

  test('a penal transfer starts in disgrace and climbs faster', () => {
    const mods = characterModifiers(createCharacter({ background: 'penal' }));
    assert.ok(mods.startingStanding < COMMAND.startingStanding);
    assert.ok(mods.xpMult > 1);
  });

  test('the border village identifies contacts sooner', () => {
    assert.ok(characterModifiers(createCharacter({ background: 'border' })).idSpeedMult > 1);
  });

  test('the factory town works its machinery faster', () => {
    const mods = characterModifiers(createCharacter({ background: 'factory' }));
    assert.ok(mods.reloadMult < 1 && mods.scootMult < 1);
  });
});

describe('progression', () => {
  test('experience rewards the job, not just the kills', () => {
    const stopped = experienceFor(goodWatch({ stats: { ...goodWatch().stats, kills: 0, turnedBack: 6 } }));
    const killed = experienceFor(goodWatch({ stats: { ...goodWatch().stats, kills: 6, turnedBack: 0 } }));
    assert.ok(stopped > killed, 'sorties sent home are worth more than sorties destroyed');
  });

  test('leakers cost experience', () => {
    const clean = experienceFor(goodWatch());
    const leaked = experienceFor(goodWatch({ stats: { ...goodWatch().stats, leakers: 4 } }));
    assert.ok(leaked < clean);
  });

  test('promotion needs the standing as well as the experience', () => {
    const character = createCharacter({ name: 'A', background: 'factory' });
    character.xp = 99999;
    assert.equal(nextRank(character, 5).ready, false, 'the army will not promote who it does not trust');
    assert.equal(nextRank(character, 90).ready, true);
  });

  test('a promotion grants exactly one training point', () => {
    const character = createCharacter({ name: 'A' });
    const before = character.rankIndex;
    character.xp = RANKS[1].xp;
    const outcome = recordWatch(character, goodWatch(), 90);
    assert.ok(outcome.promotion);
    assert.equal(character.rankIndex, before + 1);
    assert.equal(character.points, 1);
  });

  test('a disastrous standing costs you rank, but never your training', () => {
    const character = createCharacter({ name: 'A' });
    character.rankIndex = 4;
    character.points = 1;
    learnSkill(character, 'steadyHand');
    const outcome = recordWatch(character, goodWatch({ score: -400 }), 5);
    assert.ok(outcome.demotion);
    assert.equal(character.rankIndex, 3);
    assert.deepEqual(character.skills, ['steadyHand'], 'what you were taught stays taught');
  });

  test('the record keeps every promotion, award and injury', () => {
    const character = createCharacter({ name: 'A' });
    character.xp = RANKS[1].xp;
    recordWatch(character, goodWatch(), 90);
    assert.ok(character.record.some((e) => e.kind === 'promotion'));
    recordWatch(character, goodWatch({ reason: 'site-lost' }), 90);
    assert.ok(character.record.some((e) => e.kind === 'wounded'));
  });

  test('being overrun wounds you, and one clean watch mends it', () => {
    const character = createCharacter({ name: 'A' });
    recordWatch(character, goodWatch({ reason: 'site-lost' }), 60);
    assert.equal(character.wounded, true);
    const wounded = characterModifiers(character);
    assert.ok(wounded.reactionMult > 1 && wounded.reloadMult > 1);

    const outcome = recordWatch(character, goodWatch(), 60);
    assert.equal(character.wounded, false);
    assert.equal(outcome.recovered, true);
  });
});

describe('decorations', () => {
  test('a clean watch earns the badge of vigilance, and only once', () => {
    const character = createCharacter({ name: 'A' });
    const first = recordWatch(character, goodWatch(), 60);
    assert.ok(first.awarded.some((d) => d.id === 'vigilance'));
    const second = recordWatch(character, goodWatch(), 60);
    assert.ok(!second.awarded.some((d) => d.id === 'vigilance'), 'not awarded twice');
    assert.equal(character.decorations.filter((d) => d === 'vigilance').length, 1);
  });

  test('the cross for steadfastness is for losing the position but holding the sector', () => {
    assert.ok(DECORATIONS.steadfast.test({ reason: 'site-lost', stats: { leakers: 0 } }));
    assert.ok(!DECORATIONS.steadfast.test({ reason: 'site-lost', stats: { leakers: 5 } }));
  });

  test('the marksman’s badge needs economy, not volume', () => {
    assert.ok(DECORATIONS.marksman.test({ stats: { kills: 6, roundsFired: 7 } }));
    assert.ok(!DECORATIONS.marksman.test({ stats: { kills: 6, roundsFired: 20 } }));
  });
});

describe('training', () => {
  test('a qualification costs its points and cannot be taken twice', () => {
    const character = createCharacter({ name: 'A' });
    character.points = 2;
    assert.ok(canLearn(character, 'trainedCrew'));
    assert.ok(learnSkill(character, 'trainedCrew'));
    assert.equal(character.points, 0);
    assert.equal(canLearn(character, 'trainedCrew'), false);
    assert.equal(learnSkill(character, 'trainedCrew'), false);
  });

  test('an unaffordable qualification is refused', () => {
    const character = createCharacter({ name: 'A' });
    character.points = 1;
    assert.equal(canLearn(character, 'quartermaster'), false, 'two-point skills need two points');
    assert.ok(canLearn(character, 'steadyHand'));
  });

  test('qualifications compound in the modifier table', () => {
    const character = createCharacter({ name: 'A', background: 'factory' });
    character.points = 4;
    learnSkill(character, 'armourer');
    const mods = characterModifiers(character);
    assert.ok(mods.reloadMult < BACKGROUNDS.factory.modifiers.reloadMult,
      'background and training stack rather than one replacing the other');
  });
});

describe('the record reaches the equipment', () => {
  /** Build a world for a character, the way the game does. */
  const worldFor = (character, role = 'crew') => {
    const campaign = emptyCampaign(character);
    return new World(scenarioById('weasel-hour'), {
      role,
      modifiers: missionModifiers(campaign),
      character,
    });
  };

  test('a trained crew adds a channel to your own battery and nobody else’s', () => {
    const character = createCharacter({ name: 'A' });
    character.points = 2;
    learnSkill(character, 'trainedCrew');
    const world = worldFor(character);
    const mine = world.siteById.get(world.homeBatteryId);
    const theirs = world.sites.find((s) => s.id !== world.homeBatteryId);
    assert.equal(channelsFor(mine), SAM_TYPES[mine.type].channels + 1);
    assert.equal(channelsFor(theirs), SAM_TYPES[theirs.type].channels);
  });

  test('a steady hand shortens reaction fully at home and partly elsewhere', () => {
    const character = createCharacter({ name: 'A' });
    character.points = 1;
    learnSkill(character, 'steadyHand');
    const world = worldFor(character);
    const mine = world.siteById.get(world.homeBatteryId);
    const theirs = world.sites.find((s) => s.id !== world.homeBatteryId);
    assert.ok(Math.abs(mine.reactionMult - SKILLS.steadyHand.modifiers.reactionMult) < 1e-9);
    assert.ok(theirs.reactionMult > mine.reactionMult && theirs.reactionMult < 1,
      'the sector gets half the benefit, not none and not all');
  });

  test('signal discipline slows enemy direction finding against your sets', () => {
    const plain = worldFor(createCharacter({ name: 'A' }));
    const quiet = (() => {
      const c = createCharacter({ name: 'B' });
      c.points = 1;
      learnSkill(c, 'signalDiscipline');
      return worldFor(c);
    })();

    /*
     * Measure the rate, not the ceiling. Exposure saturates at 1, so running
     * both sets until they are fully pinned compares two identical numbers —
     * warm up first, zero the meter, then time a fixed window.
     */
    const exposureOver = (world, seconds) => {
      const radar = world.radars[0];
      radar.on = true;
      for (let i = 0; i < 200; i++) stepRadarPower(radar, 0.5);   // through warmup
      radar.exposure = 0;
      for (let i = 0; i < seconds * 2; i++) stepRadarPower(radar, 0.5);
      return radar.exposure;
    };

    const plainExposure = exposureOver(plain, 30);
    const quietExposure = exposureOver(quiet, 30);
    assert.ok(plainExposure > 0.05 && plainExposure < 0.95, `test window is off: ${plainExposure}`);
    assert.ok(quietExposure < plainExposure * 0.75,
      `a disciplined operator is pinned more slowly: ${quietExposure} vs ${plainExposure}`);
  });

  test('a cool head shortens the blackout after a hit', () => {
    const plain = worldFor(createCharacter({ name: 'A' }));
    const cool = (() => {
      const c = createCharacter({ name: 'B' });
      c.points = 1;
      learnSkill(c, 'coldBlood');
      return worldFor(c);
    })();

    interruptConsole(plain, 10, 'TEST');
    interruptConsole(cool, 10, 'TEST');
    assert.ok(cool.console.rebootUntilS < plain.console.rebootUntilS);
    assert.ok(consoleDark(cool));
  });

  test('the quartermaster’s rounds actually appear on the rails', () => {
    const plain = worldFor(createCharacter({ name: 'A' }));
    const supplied = (() => {
      const c = createCharacter({ name: 'B' });
      c.points = 2;
      learnSkill(c, 'quartermaster');
      return worldFor(c);
    })();
    assert.ok(supplied.sites[0].readyRounds > plain.sites[0].readyRounds);
  });

  test('an injury slows the operator down measurably', () => {
    const character = createCharacter({ name: 'A' });
    const fit = worldFor(character);
    character.wounded = true;
    const hurt = worldFor(character);
    assert.ok(hurt.siteById.get(hurt.homeBatteryId).reactionMult
      > fit.siteById.get(fit.homeBatteryId).reactionMult);
  });

  test('training reaches the battery in either seat', () => {
    const character = createCharacter({ name: 'A' });
    character.points = 2;
    learnSkill(character, 'trainedCrew');
    for (const role of ['crew', 'net']) {
      const world = worldFor(character, role);
      assert.equal(channelsFor(world.siteById.get(world.homeBatteryId)),
        SAM_TYPES[world.siteById.get(world.homeBatteryId).type].channels + 1,
        `${role} seat keeps the qualification`);
    }
  });
});

describe('the campaign file carries the soldier', () => {
  test('enlisting sets the opening standing from the background', () => {
    const campaign = emptyCampaign();
    enlist(campaign, { name: 'A', background: 'academy' });
    assert.ok(campaign.standing > COMMAND.startingStanding);
    assert.equal(campaign.character.name, 'A');
  });

  test('a finished watch updates both the standing and the record', () => {
    const campaign = emptyCampaign();
    enlist(campaign, { name: 'A', background: 'factory' });
    campaign.character.xp = RANKS[1].xp;
    const entry = recordMission(campaign, {
      ...goodWatch(), standing: 90, missionId: 'first-light',
    });
    assert.ok(entry.service, 'the debrief is handed the service outcome');
    assert.ok(entry.service.gained > 0);
    assert.equal(campaign.character.watches, 1);
  });

  test('supply and training both move the round count', () => {
    const campaign = emptyCampaign();
    enlist(campaign, { name: 'A', background: 'factory' });
    campaign.character.points = 2;
    learnSkill(campaign.character, 'quartermaster');
    campaign.standing = 90;                       // commended: supply increased too
    const mods = missionModifiers(campaign);
    assert.ok(mods.roundsMult > 1.3, `expected both to compound, got ${mods.roundsMult}`);
  });

  test('the soldier survives a save and reload', () => {
    const store = memoryStore();
    const campaign = emptyCampaign();
    enlist(campaign, { name: 'Драган Ковач', background: 'penal', home: 'Кубин' });
    campaign.character.points = 2;
    learnSkill(campaign.character, 'sharpEye');
    campaign.character.decorations.push('vigilance');
    saveCampaign(store, campaign);

    const loaded = loadCampaign(store);
    assert.equal(loaded.character.name, 'Драган Ковач');
    assert.equal(loaded.character.background, 'penal');
    assert.deepEqual(loaded.character.skills, ['sharpEye']);
    assert.deepEqual(loaded.character.decorations, ['vigilance']);
    assert.ok(characterModifiers(loaded.character).idSpeedMult > 1);
  });

  test('a file saved before the service record existed still loads', () => {
    const store = memoryStore();
    store.set('iadsville.campaign.v1', JSON.stringify({ standing: 61, history: [], completed: {} }));
    const loaded = loadCampaign(store);
    assert.equal(loaded.standing, 61);
    assert.equal(loaded.character, null, 'and asks the player to enlist');
  });
});
