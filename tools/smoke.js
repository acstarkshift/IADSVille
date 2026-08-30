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
  { mission: 'weasel-hour', role: 'net', theme: 'crt-amber', background: 'academy' },
  { mission: 'economy-of-force', role: 'net', theme: 'crt-amber', background: 'factory' },
  { mission: 'across-the-line', role: 'net', theme: 'crt-amber', background: 'border' },
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

  await browser.close();
  server.kill();

  if (failures.length) {
    console.error('\nSmoke test failures:');
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log('\nAll smoke runs clean.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
