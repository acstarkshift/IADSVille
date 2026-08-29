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

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.SMOKE_PORT ?? 8181);
const ORIGIN = `http://127.0.0.1:${PORT}/`;

/** Missions to play, and the seat to play them from. */
const RUNS = [
  { mission: 'first-light', role: 'net', theme: 'crt-green' },
  { mission: 'solo-battery', role: 'crew', theme: 'crt-green' },
  { mission: 'weasel-hour', role: 'net', theme: 'crt-amber' },
  { mission: 'ville-under-fire', role: 'both', theme: 'ops-modern' },
];

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

    await page.goto(ORIGIN, { waitUntil: 'networkidle' });
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
      return { t: Math.round(w.t), tracks: w.tracks.size, events: w.events.length, phase: w.phase };
    });

    if (!detected) failures.push(`${run.mission}/${run.role}: no contacts detected in 60 s`);
    if (state.t < 10) failures.push(`${run.mission}/${run.role}: clock did not advance (${state.t}s)`);
    if (errors.length) failures.push(`${run.mission}/${run.role}: ${errors.slice(0, 3).join(' | ')}`);

    console.log(`${failures.length ? '·' : '✓'} ${run.mission}/${run.role} `
      + `(${run.theme}) — ${state.t}s simulated, ${state.tracks} tracks, ${state.events} events`);
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
