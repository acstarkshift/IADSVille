/**
 * Headless smoke test: does the actual page work?
 *
 * The unit tests exercise the simulation, which knows nothing about the DOM.
 * This drives the real thing in a real browser — loads the page, takes a watch
 * in each seat, plays it at four times speed, and fails on any console error or
 * on a mission that never produces a track. It is the check that would catch a
 * broken import, a renderer that throws on the first frame, or a theme that
 * fails to apply.
 *
 * Run with: node tools/smoke.js   (expects playwright available; CI installs it)
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { SCENARIOS } from '../src/engine/scenarios.js';
import { ECHELON_ORDER } from '../src/engine/echelon.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Derived from the process id when not set, so two smoke runs started close
// together do not fight over one port and report a connection refused that has
// nothing to do with the page.
const PORT = Number(process.env.SMOKE_PORT ?? 8100 + (process.pid % 600));
const ORIGIN = `http://127.0.0.1:${PORT}/`;

/**
 * Missions to play, and the seat to play them from.
 *
 * The campaign is a promotion, so most of these watches are not on a fresh
 * record's roster at all. Each run seeds a service record that has stood
 * everything below the echelon it needs, which is also a check on the gating
 * itself: if the appointment logic breaks, these runs stop finding their button.
 */
const RUNS = [
  { mission: 'first-light', role: 'net', theme: 'crt-green', background: 'factory' },
  { mission: 'solo-battery', role: 'crew', theme: 'crt-green', background: 'border' },
  { mission: 'weasel-hour', role: 'net', theme: 'crt-green', background: 'academy' },
  { mission: 'economy-of-force', role: 'net', theme: 'crt-green', background: 'factory' },
  { mission: 'across-the-line', role: 'net', theme: 'crt-green', background: 'border' },
  { mission: 'ville-under-fire', role: 'both', theme: 'ops-modern', background: 'penal' },
  { mission: 'four-sectors', role: 'net', theme: 'ops-modern', background: 'academy' },
  { mission: 'reinforce-the-capital', role: 'net', theme: 'ops-modern', background: 'factory' },
  { mission: 'two-cities', role: 'net', theme: 'ops-modern', background: 'border' },
  // The epilogue needs both gates open: the appointment, and a palace that was
  // still standing at the end of the last watch.
  {
    mission: 'presidents-flight', role: 'net', theme: 'ops-modern', background: 'academy',
    campaignEnding: 'obedient',
  },
];

/** Every watch below this one's echelon, which is what its roster entry needs. */
function recordFor(missionId) {
  const scenario = SCENARIOS.find((s) => s.id === missionId);
  const order = ECHELON_ORDER.find((e) => e.id === scenario.echelon).order;
  const completed = {};
  for (const other of SCENARIOS) {
    const otherOrder = ECHELON_ORDER.find((e) => e.id === other.echelon).order;
    if (otherOrder < order) completed[other.id] = { score: 1, tier: 'satisfactory', role: 'net' };
  }
  return completed;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function importPlaywright() {
  for (const name of ['playwright', 'playwright-core']) {
    try {
      return (await import(name)).chromium;
    } catch { /* try the next one */ }
  }
  throw new Error('Playwright is not installed. Run: npm install --no-save playwright');
}

async function main() {
  const chromium = await importPlaywright();

  const server = spawn(process.execPath, [resolve(ROOT, 'tools/serve.js')], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore',
  });
  const shutdown = () => server.kill();
  process.on('exit', shutdown);

  // Give the server a moment, then confirm it is actually answering.
  let up = false;
  for (let i = 0; i < 40 && !up; i++) {
    try {
      const res = await fetch(ORIGIN);
      up = res.ok;
    } catch { await wait(150); }
  }
  if (!up) throw new Error(`Static server never came up on ${ORIGIN}`);

  const browser = await chromium.launch({
    args: ['--no-sandbox'],
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  });

  const failures = [];
  for (const run of RUNS) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));

    /*
     * A gated watch needs a service record that has earned it. The campaign
     * file is written before the page loads, so the game reads it the way it
     * would read a real one rather than being poked into shape afterwards.
     */
    await page.addInitScript((seed) => {
      try {
        const key = 'iadsville.campaign.v1';
        const existing = JSON.parse(window.localStorage.getItem(key) ?? '{}');
        window.localStorage.setItem(key, JSON.stringify({ ...existing, ...seed }));
      } catch { /* the run will fail on the missing mission button instead */ }
    }, { completed: recordFor(run.mission), ...(run.campaignEnding ? { ending: run.campaignEnding } : {}) });

    await page.goto(ORIGIN, { waitUntil: 'networkidle' });

    // A fresh browser profile has no service record, so the first screen is
    // enlistment. Sign on before anything else is reachable.
    if (await page.isVisible('#enlist-confirm')) {
      await page.click(`[data-background="${run.background ?? 'factory'}"]`);
      await page.click(`[data-household="${run.household ?? 'mother'}"]`);
      await page.click('#enlist-confirm');
      await page.waitForSelector('[data-mission]');
    }

    await page.click(`[data-mission="${run.mission}"]`);
    await page.click(`[data-role="${run.role}"]`);
    await page.click('#btn-brief');
    await page.click('#btn-start');
    await page.waitForTimeout(300);

    // A player would bring the sector up before expecting to see anything.
    await page.evaluate(() => {
      for (const radar of window.__world.radars) window.__world.setRadar(radar.id, true);
      for (const site of window.__world.sites) window.__world.setWeaponsState(site.id, 'free');
    });
    await page.click('[data-speed="4"]');

    const theme = await page.evaluate(() => document.body.dataset.theme);
    if (theme !== run.theme) {
      failures.push(`${run.mission}: expected theme ${run.theme}, got ${theme}`);
    }

    let detected = false;
    try {
      await page.waitForFunction(() => window.__world.tracks.size > 0, null, { timeout: 60000 });
      detected = true;
    } catch { /* reported below */ }

    /*
     * The contact's menu: a right click on a row lists the batteries, with a
     * live row for one that can take the contact, and Escape closes it.
     */
    if (detected && run.role === 'net') {
      await page.click('#track-list li[data-track]', { button: 'right' });
      await wait(150);
      const menu = await page.evaluate(() => {
        const m = document.getElementById('context-menu');
        return { open: m && !m.hidden, rows: m?.querySelectorAll('.ctx-row').length ?? 0,
          live: m?.querySelectorAll('.ctx-row.is-live').length ?? 0, why: m?.querySelectorAll('.ctx-why').length ?? 0 };
      });
      if (!menu.open || menu.rows === 0) failures.push(`${run.mission}/${run.role}: right-click on a contact opened no menu`);
      if (menu.rows && menu.live === 0 && menu.why === 0) failures.push(`${run.mission}/${run.role}: the menu offers nothing and explains nothing`);
      await page.keyboard.press('Escape');
      await wait(100);
      if (await page.evaluate(() => !document.getElementById('context-menu').hidden)) failures.push(`${run.mission}/${run.role}: Escape did not close the contact menu`);
    }

    // Exercise both renderers where the seat allows it.
    if (run.role === 'both') {
      await page.click('#view-toggle');
      await page.waitForTimeout(1200);
      await page.click('#view-toggle');
    }
    await page.waitForTimeout(2500);

    const state = await page.evaluate(() => {
      const w = window.__world;
      const rows = [...document.querySelectorAll('#track-list > li')];
      return {
        t: Math.round(w.t), tracks: w.tracks.size, events: w.events.length, phase: w.phase,
        // The operator's record has to reach the simulation, or the whole RPG
        // layer is cosmetic.
        operator: w.character?.name ?? null,
        reaction: w.siteById.get(w.homeBatteryId)?.reactionMult ?? null,
        // The air picture is a set of shootlists: every contact row sits under
        // a heading naming who is on it, or under UNPAIRED. An orphan row is a
        // contact the operator cannot attribute at a glance.
        headings: rows.filter((li) => li.classList.contains('shootlist-head')).length,
        orphans: rows.filter((li, i) => li.dataset.track
          && !rows.slice(0, i).some((prev) => prev.classList.contains('shootlist-head'))).length,
      };
    });

    /*
     * The evening after the watch: leave the post on the first run, and the
     * scenes must play — the printout, the section — and end on the card
     * with the full report behind its button. Driven by the keyboard, one
     * key per line, the way a player would get through them.
     */
    if (run === RUNS[0]) {
      await page.click('#btn-abort');
      await page.click('#abort-confirm');
      await page.waitForSelector('#scene:not([hidden])', { timeout: 10000 })
        .catch(() => failures.push(`${run.mission}/${run.role}: the scenes did not start after leaving the post`));
      const seen = new Set();
      for (let i = 0; i < 80; i++) {
        const kind = await page.evaluate(() => document.getElementById('scene')?.dataset.kind ?? '');
        if (kind) seen.add(kind);
        if (await page.isVisible('#btn-report')) break;
        await page.keyboard.press('Enter');
        await wait(120);
      }
      if (!seen.has('printout') || !seen.has('office')) {
        failures.push(`${run.mission}/${run.role}: the evening skipped a scene (saw ${[...seen].join(', ') || 'nothing'})`);
      }
      if (!await page.isVisible('#btn-report')) {
        failures.push(`${run.mission}/${run.role}: the scenes never reached the end card`);
      } else {
        await page.click('#btn-report');
        await wait(300);
        if (!await page.isVisible('#btn-close-report')) failures.push(`${run.mission}/${run.role}: the full report did not open from the end card`);
        await page.click('#btn-close-report');
        await wait(200);
        if (!await page.isVisible('#btn-again')) failures.push(`${run.mission}/${run.role}: closing the report did not return to the end card`);
      }
    }

    if (!state.operator) failures.push(`${run.mission}/${run.role}: no service record reached the simulation`);
    if (state.tracks > 0 && state.headings < 1) {
      failures.push(`${run.mission}/${run.role}: the air picture rendered no shootlist headings`);
    }
    if (state.orphans > 0) {
      failures.push(`${run.mission}/${run.role}: ${state.orphans} contact rows outside any shootlist`);
    }

    if (!detected) failures.push(`${run.mission}/${run.role}: no contacts detected in 60 s`);
    if (state.t < 10) failures.push(`${run.mission}/${run.role}: clock did not advance (${state.t}s)`);
    if (errors.length) failures.push(`${run.mission}/${run.role}: ${errors.slice(0, 3).join(' | ')}`);

    console.log(`${failures.length ? '·' : '✓'} ${run.mission}/${run.role} `
      + `(${run.theme}, ${run.background}) — ${state.t}s simulated, ${state.tracks} tracks, `
      + `${state.events} events, operator ${state.operator}`);
    await page.close();
  }

  failures.push(...await touchRun(browser));

  await browser.close();
  server.kill();

  if (failures.length) {
    console.error('\nSmoke test failures:');
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log('\nAll smoke runs clean.');
}

/**
 * A finger, on a phone, with no keyboard at all.
 *
 * Touch is a first-class input: everything a key does has to be doable by tap
 * at phone widths. It was not — the launch cap sat off the bottom of a
 * scrolling panel in portrait and off the screen entirely in landscape, and a
 * tap that moved the panel a pixel was cancelled and committed nothing, so
 * there was no way to fire a round with a finger. This drives every seat a
 * watch can be fought from, end to end, using only touch, in both
 * orientations, and fails if a control the watch needs is off screen, if a
 * tap that rolled a few pixels does not commit, or if no round leaves a rail.
 *
 * Three seats, because a launch is possible from three:
 *   the cabin (Solo Battery, crew) — NEXT TARGET, LOCK, LAUNCH;
 *   the net (First Light, net) — NEXT TARGET, ASSIGN, and the battery fires;
 *   the commander (Ville Under Fire, both) — the seat cap on the rail, which
 *   is the only way to a LAUNCH cap on a phone, where the topbar's seat
 *   toggle is not drawn; then the cabin's own NEXT TARGET, LOCK, LAUNCH,
 *   and the seat cap back to the net.
 */
async function touchRun(browser) {
  const failures = [];
  const seats = [
    { name: 'portrait', viewport: { width: 390, height: 844 } },
    { name: 'landscape', viewport: { width: 844, height: 390 } },
  ];
  const runs = [
    { mission: 'solo-battery', role: 'crew' },
    { mission: 'first-light', role: 'net' },
    { mission: 'ville-under-fire', role: 'both' },
  ];
  for (const seat of seats) {
    for (const run of runs) {
      const context = await browser.newContext({
        ...seat, deviceScaleFactor: 3, hasTouch: true, isMobile: true,
      });
      const page = await context.newPage();
      const label = `touch/${run.role}/${seat.name}`;
      const errors = [];
      page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      await page.addInitScript((seed) => {
        try {
          window.localStorage.setItem('iadsville.campaign.v1', JSON.stringify({ completed: seed }));
        } catch { /* the run fails on the missing mission button instead */ }
      }, recordFor(run.mission));
      const cdp = await context.newCDPSession(page);

      /** Where a control is, and whether a finger can reach it right now. */
      const locate = (selector, scroll = false) => page.evaluate(([sel, doScroll]) => {
        const el = document.querySelector(sel);
        if (!el) return { state: 'absent' };
        if (doScroll) el.scrollIntoView({ block: 'center' });
        const r = el.getBoundingClientRect();
        if (!r.width) return { state: 'absent' };
        if (r.top < 0 || r.bottom > window.innerHeight) return { state: 'off-screen' };
        return { state: el.disabled ? 'disabled' : 'ready', x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }, [selector, scroll]);

      /** Tap a control where it is. `scroll` only for the full-page screens. */
      const tap = async (selector, { scroll = false } = {}) => {
        const at = await locate(selector, scroll);
        if (at.state === 'ready') await page.touchscreen.tap(at.x, at.y);
        return at.state;
      };

      /**
       * A thumb that rolls: contact here, release six pixels away. That is
       * what most real taps are, and it is the case that used to commit
       * nothing — the browser reads the roll as the start of a pan and sends
       * pointercancel instead of pointerup. Driven through CDP because
       * Playwright's tap is a perfect one.
       */
      const rolledTap = async (selector) => {
        const at = await locate(selector);
        if (at.state !== 'ready') return at.state;
        const start = [{ x: at.x, y: at.y }];
        const end = [{ x: at.x + 4, y: at.y + 5 }];
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: start });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: end });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        return 'ready';
      };

      /** Wait for a control to be live, then tap it (the rail repaints at a few hertz). */
      const tapWhenLive = async (selector, timeoutMs, tapper = tap) => {
        const until = Date.now() + timeoutMs;
        let state = 'absent';
        while (Date.now() < until) {
          state = (await locate(selector)).state;
          if (state === 'ready') return tapper(selector);
          if (state === 'absent' || state === 'off-screen') return state;
          await wait(250);
        }
        return state;
      };

      try {
        await page.goto(ORIGIN, { waitUntil: 'networkidle' });
        if (await page.isVisible('#enlist-confirm')) {
          await tap('[data-background="academy"]', { scroll: true });
          await tap('[data-household="mother"]', { scroll: true });
          await tap('#enlist-confirm', { scroll: true });
          await page.waitForSelector('[data-mission]');
        }
        await tap(`[data-mission="${run.mission}"]`, { scroll: true });
        await tap(`[data-role="${run.role}"]`, { scroll: true });
        await tap('#btn-brief', { scroll: true });
        await tap('#btn-start', { scroll: true });
        await page.waitForSelector('#scope');
        await wait(400);

        if (run.role === 'both') {
          /*
           * The commander's phone: the topbar's seat toggle is not drawn at
           * this width, so the rail carries the seat. One tap into the cabin
           * puts LOCK and LAUNCH on the rail, and from there the watch is
           * fought exactly as the crew seat is, below.
           */
          const seatCap = await tap('.ab-caps [data-act="seat"]');
          if (seatCap !== 'ready') failures.push(`${label}: seat cap ${seatCap}`);
          await wait(400);
          const view = await page.evaluate(() => window.__ui.view);
          if (view !== 'crew') failures.push(`${label}: the seat cap did not take the console (view ${view})`);
          for (const sel of ['.ab-caps [data-act="lock"]', '.ab-caps [data-act="fire"]', '.ab-caps .sw']) {
            const at = await locate(sel);
            if (at.state === 'absent' || at.state === 'off-screen') failures.push(`${label}: ${sel} ${at.state} in the cabin`);
          }
        }

        /*
         * Every legend on the rail is whole. A control that cannot show its
         * own name is not a control: on the five-cap rail the switch's
         * RADIATE was once cut to RADIAT… and NEXT TARGET to NEXT TAR….
         */
        const cut = await page.$$eval('.ab-caps > *', (caps) => caps.filter((c) => {
          const b = c.querySelector('.lg b') ?? c;
          const legends = [...c.querySelectorAll('.sw-pos')];
          return b.scrollWidth > b.clientWidth + 1 || legends.some((l) => l.scrollWidth > l.clientWidth + 1);
        }).map((c) => c.textContent.replace(/\s+/g, ' ').trim()));
        if (cut.length) failures.push(`${label}: rail legend clipped: ${cut.join(', ')}`);

        // Every verb below is on the rail, and every one is reached by tap only.
        const emissions = await tap('.ab-caps .sw');
        if (emissions !== 'ready') failures.push(`${label}: emissions switch ${emissions}`);
        await wait(400);
        if (!await page.evaluate(() => window.__world.radars.some((r) => r.on))) {
          failures.push(`${label}: tapping the emissions switch did not bring a set up`);
          await page.evaluate(() => {
            for (const r of window.__world.radars) window.__world.setRadar(r.id, true);
          });
        }
        await tap('[data-speed="4"]');
        await page.waitForFunction(() => window.__world.tracks.size > 0, null, { timeout: 90000 });

        /*
         * NEXT TARGET lights when this seat's list has a row to step to. The
         * cabin's list is the battery's own picture and fills later than the
         * sector's — on the two-seat watch about a minute of simulated time
         * after the first sector track — so the cap is waited for, and a cap
         * that is live must select something the first time it is tapped.
         */
        const step = await tapWhenLive('.ab-caps [data-act="step-target"]', 60000);
        if (step !== 'ready') failures.push(`${label}: NEXT TARGET ${step}`);
        await wait(300);
        if (!await page.evaluate(() => window.__ui.selectedTrackId)) {
          failures.push(`${label}: NEXT TARGET selected nothing`);
        }

        let fired = 0;
        if (run.role !== 'net') {
          const lock = await tapWhenLive('.ab-caps [data-act="lock"]', 40000, rolledTap);
          if (lock === 'absent' || lock === 'off-screen') failures.push(`${label}: LOCK ${lock}`);
          await wait(400);
          if (!await page.evaluate(() => window.__world.siteById.get(window.__world.control.crewedBatteryId).engagements.length)) {
            failures.push(`${label}: a rolled tap on LOCK committed nothing`);
          }
          // The launch cap arms when the solution is ready; tap it until it
          // takes — rolled and perfect taps alternately, because both happen.
          let sawCap = false;
          for (let i = 0; i < 40 && fired === 0; i++) {
            await wait(700);
            const state = await (i % 2 ? rolledTap : tap)('.ab-caps [data-act="fire"]');
            if (state === 'absent' || state === 'off-screen') {
              failures.push(`${label}: LAUNCH ${state}`);
              break;
            }
            sawCap = true;
            fired = await page.evaluate(() => window.__world.stats.roundsFired);
          }
          if (sawCap && fired === 0) failures.push(`${label}: no round left the rail by touch in 28 s`);
        } else {
          // The net's launch is the assignment: hand the contact over and the
          // battery fires it. A rolled tap, because that is the one that failed.
          const assign = await tapWhenLive('.ab-caps [data-act="assign"]', 40000, rolledTap);
          if (assign !== 'ready') failures.push(`${label}: ASSIGN ${assign}`);
          await wait(600);
          if (!await page.evaluate(() => window.__world.sites.some((s) => s.engagements.length))) {
            failures.push(`${label}: a rolled tap on ASSIGN handed nothing over`);
          }
          for (let i = 0; i < 60 && fired === 0; i++) {
            await wait(700);
            fired = await page.evaluate(() => window.__world.stats.roundsFired);
          }
          if (fired === 0) failures.push(`${label}: the assigned battery fired nothing in 42 s`);
        }
        if (run.role === 'both') {
          // And one tap hands the net back, with its ASSIGN cap.
          const back = await tap('.ab-caps [data-act="seat"]');
          await wait(400);
          if (back !== 'ready' || (await page.evaluate(() => window.__ui.view)) !== 'net') {
            failures.push(`${label}: the seat cap did not hand the net back`);
          }
          if ((await locate('.ab-caps [data-act="assign"]')).state === 'absent') {
            failures.push(`${label}: ASSIGN missing after returning to the net`);
          }
        }
        if (errors.length) failures.push(`${label}: ${errors.slice(0, 3).join(' | ')}`);
        console.log(`${failures.length ? '·' : '✓'} ${label} `
          + `(${seat.viewport.width}x${seat.viewport.height}) — ${fired} round(s) fired by touch`);
      } catch (err) {
        failures.push(`${label}: ${String(err).split('\n')[0]}`);
      }
      await context.close();
    }
  }
  return failures;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
