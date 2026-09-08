/**
 * Reproduces the README's Across the Line table.
 *
 *   node tools/measure-border.mjs            # the eight seeds the README quotes
 *   node tools/measure-border.mjs a b c      # any seeds you like
 *
 * The companion to `tools/measure-moral.mjs`. That one measures what obeying
 * the expenditure freeze costs a hospital; this one measures what obeying the
 * border restriction costs a refugee camp six kilometres inside Listonia, on
 * the watch where sector command's position is that there is nothing at that
 * grid we are responsible for.
 *
 * Two roads, fought by the same scripted hand so the table is about the
 * decision and not about the skill:
 *
 *   accept   acknowledge the restriction, and thereafter decline every track
 *            committed to the camp — which is what acknowledging it means: no
 *            officer and no crew on weapons free will take that shot on its
 *            own authority afterwards, so the camp is defended by the person
 *            at the console or by nobody.
 *   refuse   refuse it on the net, and take the shot.
 *
 * The hand: firm hostile tracks, decoys declined, nearest battery that can
 * legally take it. The refuser additionally reserves whichever battery can
 * reach the camp for anything running west at it. Deterministic per seed.
 */

import { World } from '../src/engine/world.js';
import { scenarioById } from '../src/engine/scenarios.js';
import { engagementValue } from '../src/engine/threat.js';
import { dist, closureRate } from '../src/engine/math.js';

function play(seed, mode) {
  const w = new World(scenarioById('across-the-line'), { role: 'net', seed });
  w.control.netIsHuman = true;
  const camp = w.assets.find((a) => a.type === 'camp');

  let n = 0;
  while (w.phase === 'running' && n < 40000) {
    for (const r of w.radars) if (r.alive && !r.siteId) r.on = true;
    w.step(0.1);
    if (w.command.pending) {
      const id = w.command.pending.id;
      w.answer(mode === 'refuse' && id === 'borderRestriction' ? 'refused' : 'accepted');
    }
    for (const t of w.tracks.values()) {
      if (t.destroyed || t.hostility !== 'hostile') continue;
      const towardCamp = t.predictedAssetId === camp.id
        || (dist(t.pos, camp.pos) < 90 && closureRate(t.pos, t.vel, camp.pos) > 0.02);
      if (mode === 'accept' && towardCamp) {
        for (const siteId of [...t.assignedTo]) w.unassign(t.id, siteId);
        continue;
      }
      if (t.assignedTo.length) continue;
      // The refuser is LOOKING for the stray, so it claims it as soon as the
      // track is worth believing rather than waiting for the firmness bar.
      if (mode === 'refuse' && towardCamp && (t.quality ?? 0) >= 0.35) {
        const taker = w.sites
          .filter((s) => w.commandable(s.id) && engagementValue(w, s, t))
          .sort((a, b) => dist(a.pos, t.pos) - dist(b.pos, t.pos))[0];
        if (taker) w.assign(t.id, taker.id, { salvo: 2 });
        continue;
      }
      if ((t.quality ?? 0) < 0.5) continue;
      if (t.classification === 'decoy') continue;
      const best = w.sites
        .filter((s) => w.commandable(s.id) && engagementValue(w, s, t))
        .sort((a, b) => dist(a.pos, t.pos) - dist(b.pos, t.pos))[0];
      if (best) w.assign(t.id, best.id);
    }
    n++;
  }
  const hp = w.assets.find((a) => a.id === camp.id);
  return {
    standing: Math.round(w.outcome?.standing ?? w.command.standing),
    score: Math.round(w.outcome?.score ?? NaN),
    campPct: Math.round(100 * Math.min(1, hp.damage / 90)),
    dead: hp.casualties ?? 0,
    borderRounds: w.stats.roundsAcrossBorder,
  };
}

const seeds = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'];

const label = { accept: 'Acknowledge the restriction', refuse: 'Refuse it and take the shot' };
console.log(`across-the-line, ${seeds.length} seeds: ${seeds.join(' ')}\n`);
console.log('| | Camp destroyed | Dead | Standing | Score |');
console.log('|---|--:|--:|--:|--:|');
for (const mode of ['accept', 'refuse']) {
  const rows = seeds.map((s) => play(s, mode));
  const mean = (k) => Math.round(rows.reduce((a, r) => a + r[k], 0) / rows.length);
  console.log(`| ${label[mode]} | ${mean('campPct')}% | ${mean('dead')} | ${mean('standing')} | ${mean('score')} |`
    + `   <!-- border rounds ${rows.map((r) => r.borderRounds).join(',')} -->`);
}
