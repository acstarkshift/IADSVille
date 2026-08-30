/**
 * Reproduces the README's Economy of Force table.
 *
 *   node tools/measure-moral.mjs            # the eight seeds the README quotes
 *   node tools/measure-moral.mjs a b c      # any seeds you like
 *
 * Three roads through the expenditure freeze, each fought competently by the
 * same scripted hand — the point of the table is the decision, not the skill:
 *
 *   obey    accept the freeze and honour it with your own eyes as well as the
 *           file's field: no fire on anything predicted at the hospital, nor on
 *           anything visibly running in on it, even while the prediction wobbles.
 *   defend  accept the freeze on the net and quietly shoot the hospital
 *           package anyway.
 *   refuse  refuse the order outright, then fight the same night as `defend`.
 *
 * The hand: firm hostile tracks, decoys declined, best battery by the game's
 * own engagementValue hint, two-round salvos. Deterministic per seed.
 */

import { World } from '../src/engine/world.js';
import { scenarioById } from '../src/engine/scenarios.js';
import { engagementValue } from '../src/engine/threat.js';
import { dist } from '../src/engine/math.js';

function play(seed, mode) {
  const w = new World(scenarioById('economy-of-force'), { role: 'net', seed });
  w.control.netIsHuman = true;
  const hospital = w.assets.find((a) => a.type === 'hospital');

  let n = 0;
  while (w.phase === 'running' && n < 40000) {
    for (const r of w.radars) if (r.alive && !r.siteId) r.on = true;
    w.step(0.1);
    if (w.command.pending) {
      const id = w.command.pending.id;
      w.answer(mode === 'refuse' && id === 'expenditureFreeze' ? 'refused' : 'accepted');
    }
    for (const t of w.tracks.values()) {
      if (t.destroyed || t.hostility !== 'hostile') continue;
      // Obedience as the file reads it: the struck-off place's tracks are
      // declined — and, per the order's own arithmetic, an engagement already
      // running when the track commits to the hospital is CALLED OFF. That
      // second half is the part that costs something to do.
      if (mode === 'obey' && t.predictedAssetId === hospital.id) {
        for (const siteId of [...t.assignedTo]) w.unassign(t.id, siteId);
        continue;
      }
      if ((t.quality ?? 0) < 0.5 || t.assignedTo.length) continue;
      if (t.classification === 'decoy') continue;
      const best = w.sites
        .filter((s) => w.commandable(s.id) && engagementValue(w, s, t))
        .sort((a, b) => dist(a.pos, t.pos) - dist(b.pos, t.pos))[0];
      if (best) w.assign(t.id, best.id, { salvo: 2 });
    }
    n++;
  }
  return {
    standing: Math.round(w.outcome?.standing ?? w.command.standing),
    score: Math.round(w.outcome?.score ?? NaN),
    hospitalLost: !!hospital.destroyed,
    freezeRounds: w.stats.roundsAgainstFreeze,
  };
}

const seeds = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8'];

const label = { obey: 'Obey the freeze', defend: 'Defend it anyway', refuse: 'Refuse the order outright' };
console.log(`economy-of-force, ${seeds.length} seeds: ${seeds.join(' ')}\n`);
console.log('| | Standing | Score |');
console.log('|---|---|---|');
for (const mode of ['obey', 'defend', 'refuse']) {
  const rows = seeds.map((s) => play(s, mode));
  const mean = (k) => Math.round(rows.reduce((a, r) => a + r[k], 0) / rows.length);
  const lost = rows.filter((r) => r.hospitalLost).length;
  console.log(`| ${label[mode]} | ${mean('standing')} | ${mean('score')} |`
    + `   <!-- hospital lost ${lost}/${rows.length}, freeze rounds ${rows.map((r) => r.freezeRounds).join(',')} -->`);
}
