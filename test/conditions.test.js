/**
 * One phosphor, and the watches told apart by other means.
 *
 * The player: "one phosphor colour, levels visually distinct by other means."
 * The glass is one green everywhere; what changes from watch to watch is the
 * hour, the weather and the echelon's hardware, and those are declared on
 * every watch so the console can read them. Pinned here so a watch cannot be
 * added without them, and so the one display stays one.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { SCENARIOS, WEATHER, hourClass, localClock, watchConditions } from '../src/engine/scenarios.js';
import { THEMES } from '../src/ui/themes.js';

describe('one display', () => {
  test('there is one theme, and no watch names one', () => {
    assert.deepEqual(Object.keys(THEMES), ['crt-green']);
    for (const sc of SCENARIOS) assert.equal(sc.theme, undefined, `${sc.id} carries no theme`);
  });
});

describe('the hour and the weather', () => {
  test('every watch declares its hour, its weather and the temperature', () => {
    for (const sc of SCENARIOS) {
      assert.match(sc.hour, /^\d\d:\d\d$/, `${sc.id} has an hour`);
      assert.ok(WEATHER[sc.weather], `${sc.id} has a weather the console can print (${sc.weather})`);
      assert.equal(typeof sc.tempC, 'number', `${sc.id} has a temperature`);
    }
  });

  test('the watches are spread over the day, and every echelon is represented', () => {
    const lights = new Set(SCENARIOS.map((sc) => hourClass(sc.hour)));
    assert.deepEqual([...lights].sort(), ['dawn', 'day', 'dusk', 'night']);
    const echelons = new Set(SCENARIOS.map((sc) => sc.echelon));
    assert.deepEqual([...echelons].sort(), ['battalion', 'national', 'region', 'sector']);
  });

  test('the light follows the clock', () => {
    assert.equal(hourClass('04:59'), 'night');
    assert.equal(hourClass('05:00'), 'dawn');
    assert.equal(hourClass('07:59'), 'dawn');
    assert.equal(hourClass('08:00'), 'day');
    assert.equal(hourClass('16:59'), 'day');
    assert.equal(hourClass('17:00'), 'dusk');
    assert.equal(hourClass('19:59'), 'dusk');
    assert.equal(hourClass('20:00'), 'night');
  });

  test('the glass keeps local time from the watch\'s own hour', () => {
    assert.equal(localClock({ hour: '05:10' }, 0), '05:10');
    assert.equal(localClock({ hour: '05:10' }, 1500), '05:35');
    assert.equal(localClock({ hour: '23:50' }, 900), '00:05', 'and crosses midnight');
    const c = watchConditions({ hour: '14:20', weather: 'snow', tempC: -5 }, 61);
    assert.equal(c.clock, '14:21');
    assert.equal(c.light, 'day');
    assert.equal(c.weather, 'SNOW');
    assert.equal(c.line, '14:21 · SNOW · −5 °C');
    assert.equal(watchConditions({ hour: '11:50', weather: 'clear', tempC: 6 }).line, '11:50 · CLEAR · 6 °C');
  });
});
