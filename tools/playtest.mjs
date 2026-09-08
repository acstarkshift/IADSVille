/**
 * The playtesting harness: four scripted operators, every seat, every watch.
 *
 *   node tools/playtest.mjs --mission white-noise --seat all --policy all \
 *     --seeds 8 --jobs 4 --md /tmp/white-noise.md
 *
 * The suite proves the engine is correct. This proves the game is playable —
 * which is a different question, and one nothing in the repository could
 * answer before. A watch can be arithmetically perfect and still hand the
 * operator four minutes with nothing to look at, a battery that never gets a
 * legal shot, or a magazine that runs dry ninety seconds into a raid that
 * lasts eight. Those are the failures this measures, and it measures them by
 * PLAYING: it builds a real `World`, drives it through the same public methods
 * the console drives — assign, fire, setRadar, setSalvo, answer, takeDirect,
 * scoot — and writes down what the watch felt like from that seat.
 *
 * Nothing here is a private mechanic. The harness may only touch what a person
 * with a keyboard could touch, which is why it is worth anything at all.
 *
 * ---------------------------------------------------------------------------
 * THE FOUR OPERATORS
 * ---------------------------------------------------------------------------
 * Four players, not one, because the interesting number is almost never a
 * level — it is a difference. A watch where the expert and the spectator score
 * within noise of each other is a watch with no game in it; a watch where the
 * novice scores below the spectator is a watch that punishes participation.
 *
 *   nothing     Never touches a control. Radars stay as the scenario leaves
 *               them, directives time out unanswered. The floor: what the
 *               night does when nobody is in the chair. Every other figure is
 *               only meaningful against this one.
 *
 *   novice      Notices late and fixates. Brings the sets up forty-five
 *               seconds in (a real person reads the brief, then the panel,
 *               then finds the switch), holds `NOVICE_HANDS` contacts at a
 *               time and only once each is firm and already well inside
 *               somebody's envelope — eight seconds of reaction after
 *               noticing — hands each to the NEAREST battery that can take
 *               it, accepts every directive twenty seconds after it arrives,
 *               and in the cabin waits six seconds after READY before
 *               pressing LAUNCH and twenty staring at a red rack before
 *               calling the loaders out. Never displaces, never manages
 *               emissions, never re-pairs. This is the shape of a first
 *               watch, and the thing to watch for is where it scores BELOW
 *               `nothing`: that is the game punishing a beginner for joining
 *               in.
 *
 *   competent   The obvious correct play, no craft. Radiates at once; every
 *               three seconds hands each firm, non-decoy hostile to the
 *               NEAREST of its batteries whose `cannotEngageReason` is null;
 *               never double-assigns (shoot-look-shoot); answers directives
 *               inside eight seconds; shuts a set down with an
 *               anti-radiation round inbound on it and brings it straight
 *               back up afterwards. In the cabin it locks the best shot on
 *               offer and fires when the lamp says READY, taking the
 *               aeroplane before the enemy's round and never launching into a
 *               set that is about to duck.
 *
 *               Nearest-that-can-shoot is deliberate and it is where the net
 *               seat's ladder comes from. This model used to pair on
 *               `engagementValue` — the same arithmetic the expert's global
 *               pass sorts on — and the two players were then reading the
 *               same number in a different order, worth nought to four per
 *               cent on every watch measured. A person with a scope and a
 *               mouse clicks the closest ring that can reach; reading the
 *               shootlist's own ordering instead is a decision, and a
 *               decision is what an expert is.
 *
 *               Anything a competent player cannot do on a watch is a design
 *               problem, not a skill problem.
 *
 *   expert      Competent, plus the six things the game claims to reward:
 *               priority (a global greedy pairing over `engagementValue`,
 *               which already carries the defended-asset weight, so the round
 *               goes where the night's own arithmetic says it should); salvo
 *               sizing on the NET (`setSalvo` to two for a critical or
 *               civilian place, or for a shot the edge of the envelope is
 *               going to spoil, and one otherwise — but never from the cabin,
 *               and the measurement for that is beside the crash load below);
 *               the SWEET SPOT in the cabin (`holdForRange` — wait four or
 *               five seconds for a closing target to come off the rim of the
 *               envelope, where `edgeLaunchPk` is waiting, but only while
 *               the shootlist is clear and never for more than
 *               `CABIN_HOLD_S`); the crash load, which is the cabin's other
 *               piece of craft — the rack fills itself, and knowing that
 *               LOADERS OUT is worth pressing in a lull and not worth
 *               pressing with something in the ring is the whole of it;
 *               emissions discipline (a duty cycle on the battery's own set,
 *               RIDE — hold the beam — when the rounds already in the air
 *               land before the enemy's does, and no duty cycle at all when
 *               the battery's set is the only one looking at the sky);
 *               DISPLACE — one move per battery per watch, taken when the
 *               enemy has demonstrably got this grid (a round tracking one of
 *               its sets, or one that has already arrived) and there is
 *               nothing of ours in the air to drop by going; the RESERVE at
 *               national command — the whole allocation to the one formation
 *               carrying the raid, once the raid is established, because four
 *               minutes on the road means a late release arrives after the
 *               watch; and, at district and national command, standing in the
 *               sector under the main effort
 *               — `takeDirect` on the formation carrying the most threat, but
 *               only when it beats the weakest sector already held by half
 *               again, because a handover costs eighteen or twenty-six seconds
 *               of nobody commanding anything. And it answers the command net
 *               from the table below rather than out of politeness.
 *
 *               DISPLACE and the reserve were added after a scrub found that
 *               no player model had ever pressed either — so D4, the line
 *               that asks whether skill buys anything, was being judged on
 *               three watches without the two most expert-flavoured verbs on
 *               the console. Both are counted per run (`displacements`,
 *               `reserveReleased`) so a reader can see when they fired rather
 *               than taking the blurb's word for it.
 *
 * ---------------------------------------------------------------------------
 * THE EXPERT'S ANSWER TABLE
 * ---------------------------------------------------------------------------
 * Every row is a measurement, and the measurement did not say what it was
 * expected to say. Eight seeds a row, expert play, both arms of each hinge,
 * paired by seed — mean score / mean standing / watches held:
 *
 *   directive           watch                  seat  accept          refuse
 *   expenditureFreeze   economy-of-force       net   1655 /89/ 8-8   1655 /80/ 8-8
 *   expenditureFreeze   economy-of-force       crew  1571 /96/ 8-8   1548 /76/ 8-8
 *   borderRestriction   across-the-line        net    950 /97/ 8-8    950 /72/ 8-8
 *   borderRestriction   across-the-line        crew  1053 /93/ 8-8   1053 /72/ 8-8
 *   withdrawBattalion   reinforce-the-capital  net   1448 /52/ 8-8   1323 / 8/ 8-8
 *   palacePriority      two-cities             net   −622 / 0/ 0-8   −622 / 0/ 0-8
 *   engageCivil         ville-under-fire       net   1037 /62/ 8-8   1037 /50/ 8-8
 *   civilCorridor       white-noise            crew  1456 /92/ 8-8   1462 /94/ 8-8
 *   priority (routine)  white-noise            net   1453 /91/ 8-8   1453 /85/ 8-8
 *   conserve            white-noise            net   1453 /91/ 8-8   1435 /73/ 8-8
 *
 * So this player refuses NOTHING, and the reason is the same in every row:
 * accepting an order binds your SUBORDINATES, not you. The freeze and the
 * border restriction stand the AI's crews and officers down off the
 * struck-off place; they do not stop the person at the console from defending
 * it, and this player defends it anyway. The score is therefore identical to
 * the decimal on both arms of five of these rows, while refusing costs nine
 * to twenty-four points of standing and a referral that stays in the file.
 * That is README's own conclusion arrived at from the other end: quiet
 * insubordination is the score-best play, and this table is what it looks
 * like when a machine works that out on its own.
 *
 * ONE ROW CHANGED SIDES, and it is worth knowing why:
 *
 *   withdrawBattalion   was REFUSE (1242 against 602, ahead on six seeds of
 *                       eight), and is now ACCEPT (1440 against 1309, and
 *                       fifty-two points of standing against eight). Nothing
 *                       about the order moved. What moved is `stepLoading`:
 *                       with the rack coming back a rail at a time instead of
 *                       in a lump ninety-five seconds later, the district's
 *                       remaining batteries cover the ground the battalion
 *                       used to, and this player — who re-pairs every track
 *                       to the best battery every three seconds — is exactly
 *                       the player who can exploit that. The margin is a
 *                       tenth of what refusal's used to be, and it points the
 *                       other way.
 *
 *                       It points the ORIGINAL way for a commander who fights
 *                       the district by hand rather than by greedy
 *                       `engagementValue` pairing: `test/echelon.test.js`
 *                       measures that one over eight seeds and refusal is
 *                       ahead 1662 to 1203, keeps weapons off the district on
 *                       all eight nights (23 leakers against 43), and loses
 *                       seven places against obedience's ten. Two player
 *                       models, two answers, both measured; the harness
 *                       records its own and the README's claim rests on the
 *                       one with a person in it.
 *
 * There is not a single exception left in the table. Five of the ten rows are
 * identical to the decimal on both arms, four are worse for refusing, and the
 * tenth — the civil corridor from the cabin — is six points better for
 * refusing on a watch whose seed-to-seed spread is a hundred times that. Every
 * row costs between two and forty-four points of standing to refuse. This is
 * the harness's own conclusion and not the game's argument: it is what a
 * player who optimises the ledger does, and the whole of Economy of Force is
 * about what that costs the person who does it.
 *
 * Reproduce any row by editing EXPERT_ANSWERS and running the two arms:
 *   node tools/playtest.mjs --mission economy-of-force --seat net \
 *     --policy expert --seeds 8 --md /tmp/freeze.md
 *
 * ---------------------------------------------------------------------------
 * WHAT A HOLE IS
 * ---------------------------------------------------------------------------
 * The watch is sampled once per simulated second. A second is a HOLE when all
 * four of these are true from the player's seat:
 *
 *   - nothing engageable: no live hostile track that any battery of theirs
 *     could legally take (crew seat: their own battery only);
 *   - nothing in flight: not one round alive anywhere, theirs or the enemy's;
 *   - no directive pending on the command net;
 *   - not one line the operator would look up for reached the ticker that
 *     second — chatter, comms, a launch, a kill, a warning, command traffic.
 *
 * That last clause used to read "anything", and it counted the `info` lines
 * the console emits when a switch moves or a set warms up. Those are echoes
 * of the operator's own hands, not the watch giving them something, and with
 * the correlator churning out a fresh NEW CONTACT every few seconds on top of
 * them, this detector reported zero holes on every one of 896 runs — including
 * watches the playtesters described as five silent minutes. It now counts the
 * same `ACTION_KINDS` the end-of-watch measurement counts, and nothing else.
 *
 * A hole is thirty consecutive such seconds. That is the length at which a
 * person puts the controller down. `holes.count` counts them, `longestS` is
 * the worst stretch (reported whatever its length) and `shareOver30s` is how
 * much of the watch is inside one. Lines the player's own switches generate
 * count as ticker activity — but the policies only actuate on a change of
 * state, so a policy cannot paper over a hole by flipping a switch it has
 * already flipped.
 *
 * `engageableShare` is the other side of the same coin and reads backwards
 * until you see why: it is the share of the watch on which some contact was
 * legally shootable and NOBODY OF YOURS HAD IT — a battery already engaged has
 * no free channel, so it stops counting. High is not good. `nothing` scores
 * 90% on First Light because it answers none of them; competent scores 40% on
 * the same watch because it answered them. Read it as unanswered opportunity,
 * and read a policy that cannot get it down as a seat that cannot keep up.
 *
 * `firstInEnvelopeS` is the honest companion to `firstLegalShotS`, and the
 * crew seat's T2 is judged against both. A legal shot means a battery of
 * yours could be given the contact; being IN THE ENVELOPE means the thing is
 * actually in front of you. The two diverge by minutes on the watches where
 * the crewed battery is parked off the raid's axis, and reading only the
 * first of them reported those cabins as busy when they were empty.
 *
 * `blindShare` is the share of the watch on which not one battery of this
 * seat's had a surviving fire-control antenna. It is zero on most watches and
 * it is the whole story on the two where the enemy hunts radars: a cabin
 * whose sets are wreckage has no verbs left, and until this column existed
 * nothing distinguished that from a quiet night.
 *
 * `magazineOnlyLimiterShare` is the share of the watch with no legal shot
 * where the ONLY thing wrong was an empty rack — the contact in the altitude
 * band, in reach, a channel free, and no round to put on it.
 *
 * That figure has two quite different causes and they want different repairs,
 * so `reloadWaitShare` splits out the half that is the loaders' fault: the
 * subset of the same seconds in which the STORE still held rounds. High
 * `reloadWaitShare` is a watch spent watching a reload bar and is a mechanism
 * problem. `magazineOnlyLimiterShare` with `reloadWaitShare` near zero is a
 * battery that has fired its whole allocation, which is an ammunition
 * problem, and no amount of loading faster will touch it.
 *
 * ---------------------------------------------------------------------------
 * SEEDS, AND WHY THE OUTPUT IS BYTE-IDENTICAL
 * ---------------------------------------------------------------------------
 * Seeds are `p1`, `p2`, ... `p<n>` from `--seed-base`, and nothing else. No
 * clock, no PID, no `Math.random` — the engine draws only from its own seeded
 * generator, so the same tree and the same seed produce the same numbers to
 * the last decimal, on any machine, at any `--jobs`. Results are sorted by
 * (mission, seat, policy, seed) before they are written, so the worker count
 * cannot reorder them either. Only `meta` carries wall-clock timing, and the
 * regression test asserts the rest is identical across two runs.
 *
 * Everything is measured from the seat the argument names. `--seat crew`
 * confines the player to the crewed battery, which the engine does NOT do for
 * you: `commandable()` is true for every battery of a formation under your
 * hand even when you are sitting in a cabin that can only see one of them.
 * And a battery you are not sitting in runs its own emissions — `runAiEmcon`
 * rewrites `radar.on` every tick — so the harness only ever works the switches
 * a person in that seat actually has: the surveillance sets on the net, and
 * the sets of the battery you are crewing.
 */

import { parseArgs } from 'node:util';
import { fork } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { World } from '../src/engine/world.js';
import { SCENARIOS } from '../src/engine/scenarios.js';
import { cannotEngageReason, engagementValue, sortedTracks } from '../src/engine/threat.js';
import { armTimeToImpact, channelsFor, railLoadS, railsOf } from '../src/engine/doctrine.js';
import { inEnvelope, timeToInRangeS } from '../src/engine/weapons.js';
import { AIR_TYPES, ASSET_TYPES, DETECTION, ENGAGEMENT, SAM_TYPES } from '../src/engine/config.js';
import { closureRate, dist, len } from '../src/engine/math.js';

const THIS_FILE = fileURLToPath(import.meta.url);

/** Ticks before a run is abandoned. 40 000 is sixty-six simulated minutes. */
const MAX_TICKS = 40000;
/** Consecutive empty seconds that make a hole. */
const HOLE_S = 30;
/** Firm enough to shoot at, per the detection model's own bar. */
const FIRM = DETECTION.firmQuality;

export const POLICY_ORDER = ['nothing', 'novice', 'competent', 'expert'];
export const SEAT_ORDER = ['net', 'crew', 'both'];
const MISSION_ORDER = SCENARIOS.map((s) => s.id);

/** Log kinds that count as the watch doing something to you, for dead-air. */
const ACTION_KINDS = new Set(['launch', 'good', 'alert', 'warn', 'command', 'comms']);

/**
 * How the expert answers the command net. See the header for the measurement
 * behind each row; anything not named here is accepted.
 */
/*
 * Empty, and that is the finding: measured over eight seeds a row, this player
 * refuses nothing in the whole campaign. The withdrawal of the district
 * battalion was the one exception until the rack started coming back a rail at
 * a time — see the table in the header, which carries both arms of every hinge
 * and the reason that row changed sides. An entry here is a measurement, never
 * a mood; add one only with the two arms that justify it.
 */
export const EXPERT_ANSWERS = {};

/* ------------------------------------------------------------------ *
 * What the seat can touch
 * ------------------------------------------------------------------ */

/**
 * The batteries this seat may give orders to.
 *
 * In the cabin that is one battery — and the engine will not enforce it, so
 * this does. `commandable()` answers a question about the FORMATION, and a
 * crewed battery's formation is under your appointment's hand whether or not
 * you can see any of it from where you are sitting.
 */
function ownSites(w, seat) {
  if (seat === 'crew') {
    const site = w.siteById.get(w.control.crewedBatteryId);
    return site && site.alive ? [site] : [];
  }
  return w.sites.filter((s) => s.alive && w.commandable(s.id));
}

/**
 * The emissions switches this seat actually has, grouped by the battery they
 * belong to — because a battery has one emissions posture, not one per
 * antenna, and `setRadar` on any of its sets moves all of them.
 *
 * Surveillance sets answer to the net. A battery's own sets answer to whoever
 * is sitting in it, and every battery nobody is sitting in is on AI emissions
 * discipline that rewrites `radar.on` every tick — so the harness does not
 * pretend to control those, any more than the console does.
 */
function radarGroups(w, seat) {
  const groups = [];
  if (seat !== 'crew') {
    for (const radar of w.radars) {
      if (radar.alive && !radar.siteId) groups.push({ siteId: null, radars: [radar] });
    }
  }
  const crewedId = w.control.crewedBatteryId;
  const crewed = crewedId ? w.siteById.get(crewedId) : null;
  if (crewed?.alive) {
    const sets = w.radars.filter((r) => r.alive && r.siteId === crewed.id);
    if (sets.length) groups.push({ siteId: crewed.id, radars: sets });
  }
  return groups;
}

/** Bring a group of sets up or down, and say so — but only on a change. */
function setGroup(ctx, group, on) {
  if (group.radars.every((r) => r.on === on)) return false;
  ctx.w.setRadar(group.radars[0].id, on);
  ctx.act(`${on ? 'RADIATE' : 'SILENCE'} ${group.radars[0].label}`);
  return true;
}

/** Seconds until an anti-radiation round reaches any set of this group. */
function armEtaFor(w, group) {
  let soonest = Infinity;
  for (const radar of group.radars) soonest = Math.min(soonest, armTimeToImpact(w, radar));
  return soonest;
}

/**
 * Seconds until this battery's own rounds finish their work.
 *
 * The same arithmetic the crew does when it decides whether to take the hit:
 * a set that shuts down drops the rounds it is guiding, so the question is
 * only ever which arrives first.
 */
function ownRoundEta(w, site) {
  let soonest = Infinity;
  for (const missile of w.missiles) {
    if (!missile.alive || missile.siteId !== site.id) continue;
    const target = w.aircraftById.get(missile.targetId);
    if (!target?.alive) continue;
    const eta = dist(missile.pos, target.pos)
      / Math.max(missile.speed - len(target.vel) * 0.5, 0.2);
    if (eta < soonest) soonest = eta;
  }
  return soonest;
}

/* ------------------------------------------------------------------ *
 * Shared pieces of play
 * ------------------------------------------------------------------ */

/** Is this a contact worth a round at all? */
function shootable(track) {
  return track.hostility === 'hostile'
    && !track.destroyed
    && track.quality >= FIRM
    && track.classification !== 'decoy';
}

/** Answer whatever is on the net, once it has been there long enough. */
function answerAfter(ctx, delayS, chooser) {
  const pending = ctx.w.command.pending;
  if (!pending) return;
  if (ctx.w.t - pending.issuedS < delayS) return;
  const reply = chooser ? chooser(pending.id) : 'accepted';
  ctx.w.answer(reply);
  ctx.act(`${reply.toUpperCase()} ${pending.id}`);
}

/**
 * Hand out targets, best battery first.
 *
 * `flat` is the competent player's pass: walk the threat list, give each
 * unclaimed contact to whichever of your batteries scores highest on it.
 * `greedy` is the expert's: score every (contact, battery) pair the sector
 * can offer and take them best-first, so the highest-value shot in the sector
 * gets the battery it wants rather than whichever contact happened to be
 * higher up the list.
 */
/*
 * A note on what the SECTOR does not do here.
 *
 * The cabin's "wait for the tell" rule (see `crewLoop`) was measured on this
 * pass at the net seat too, and it is wrong there: eight seeds of White Noise,
 * expert against competent, +5.5% winning five became −4.2% winning three on
 * the net and +7.6% winning seven became −11.9% winning two on both seats. The
 * reason is the whole point of a long-range battalion — its value is depth, and
 * a rule that forbids the outer half of a hundred-and-twenty-kilometre ring
 * gives away more than the decoys cost. Discrimination is a medium battery's
 * economy and a battalion's luxury.
 */
function assignPass(ctx, { greedy = false, salvo = false } = {}) {
  const { w } = ctx;
  const pairs = [];
  for (const track of sortedTracks(w)) {
    if (!shootable(track) || track.threat < 1) continue;
    if (track.assignedTo.length > 0) continue;      // shoot-look-shoot
    let best = null;
    for (const site of ctx.own) {
      if (cannotEngageReason(w, site, track)) continue;
      const evaluation = engagementValue(w, site, track);
      if (!evaluation) continue;
      if (greedy) { pairs.push({ track, site, value: evaluation.value }); continue; }
      /*
       * The COMPETENT pass takes the nearest battery that can legally take
       * the contact, and that is the whole of the difference between the two
       * players on the net.
       *
       * It used to take the best `engagementValue` — the same number the
       * expert's global pass sorts on — which meant both players were
       * reading the sector's own arithmetic and the only thing left between
       * them was the order they read it in. Measured over eight seeds, that
       * was worth nought to four per cent on every watch in the set: the
       * priority the game claims to reward did not exist as a skill, because
       * the competent model already had it.
       *
       * Nearest-that-can-shoot is what a person does with a scope and a mouse
       * and no time. `engagementValue` is a real decision on top of it — it
       * carries the defended asset behind the contact, the quality of the
       * shot and what else that battery is for — and it is on the console:
       * the shootlist is sorted by it and the battery cards carry the figure.
       * An operator who reads it beats one who clicks the closest ring, and
       * now the ladder measures that.
       */
      const value = -dist(site.pos, track.pos);
      if (!best || value > best.value) best = { track, site, value };
    }
    if (best) pairs.push(best);
  }
  if (greedy) pairs.sort((a, b) => b.value - a.value);

  const taken = new Set();
  for (const pair of pairs) {
    if (taken.has(pair.track.id)) continue;
    // Re-check: a channel filled by an earlier assignment in this same pass.
    if (cannotEngageReason(w, pair.site, pair.track)) continue;
    if (salvo) sizeSalvo(ctx, pair.site, pair.track);
    if (w.assign(pair.track.id, pair.site.id)) {
      taken.add(pair.track.id);
      ctx.act(`ASSIGN ${pair.track.tn} → ${pair.site.name}`);
    }
  }
}

/**
 * Two rounds or one.
 *
 * Rounds cost five points each and a kill is worth twenty-two, so a pair is
 * only ever right when the shot is bad or the place behind it is expensive.
 * Both halves of that are checkable from the seat: what the contact is going
 * for is on the shootlist, and how good the shot is, is the range ring.
 *
 * AND NOT ON A WATCH WHOSE CONSOLE HAS NO SALVO SWITCH. `basicConsole` strips
 * displacement, salvo, RIDE and the exposure gauge off the battery card so
 * that a new operator has two controls in front of them and not ten
 * (`panels.js`, gated on the same flag). The expert model was selecting pairs
 * anyway, which is not a skilled player — it is a player pressing a button
 * that is not on the panel, and paying five points a round for it. Measured on
 * First Light, eight seeds: the expert fired 12.5 rounds against the competent
 * player's 8 for the same six kills, and the entire attention dividend on the
 * net and both-seats configurations was that difference — −1.7% and −1.8%
 * against a bar of +10%. A model must only press what the seat has.
 */
function sizeSalvo(ctx, site, track) {
  if (ctx.w.scenario.basicConsole) return;
  const type = SAM_TYPES[site.type];
  const env = inEnvelope(site, track.pos, track.altM);
  const threatened = track.predictedAssetId ? ctx.w.assetById.get(track.predictedAssetId) : null;
  const assetType = threatened && !threatened.destroyed ? ASSET_TYPES[threatened.type] : null;
  const precious = !!assetType && (assetType.critical || assetType.civilian);
  const awkward = env.rangeKm > type.maxRangeKm * 0.75 || track.altM < type.minAltM * 3;
  /*
   * "Do I have rounds to spare for a second one?" is a question about the
   * STOCK, not the rails, and the bar is two full racks.
   *
   * It used to read `site.readyRounds >= 4`, which was the same question when
   * a rack was either full or empty; with the rack coming back a rail at a
   * time it means an operator on a busy watch never once selects two, and
   * every awkward shot goes single. But `readyRounds + magazine >= 4` is the
   * opposite mistake — it is true of a battery down to its last four rounds —
   * and measured over eight seeds it doubled Low Riders' sector through
   * forty-four rounds for no more kills and left Weasel Hour's expert holding
   * three watches of eight. Two racks in stock is the line where a second
   * round is genuinely spare: Low Riders 1347.5 against the competent
   * player's 1302.3 where four-in-stock scored 1232.8, and Weasel Hour 890.8
   * against 766.8 on four seeds held instead of three.
   */
  /*
   * AND NOT ONCE THE LEDGER HAS STARTED WATCHING.
   *
   * Every watch is issued an allocation, the top bar counts against it from
   * the first round, and logistics comes on the net at sixty per cent of it to
   * say "single rounds only until further notice". An operator who has read
   * the bar knows what that order is going to say before it arrives and stops
   * doubling; the model was doubling until the transmission landed and then
   * being bound by it, which is the difference between discipline and
   * compliance.
   *
   * It matters most where the allocation is deliberately tighter than the
   * raid. Weasel Hour issues eighteen rounds against twenty-three aircraft and
   * says so in the brief, and measured over thirty-two seeds a careful player
   * who kept doubling scored BELOW a competent one on all three seats —
   * −0.4%, −7.7% and −3.7% — because a pair at five points a round buys very
   * little against a suppression package that is going home anyway. Reading
   * the ledger is the verb; this is the model finally pressing it.
   */
  const spent = ctx.w.stats.roundsFired;
  const disciplined = Number.isFinite(ctx.w.roundAllowance)
    && spent >= ctx.w.roundAllowance * 0.6;
  const want = !disciplined && (precious || awkward)
    && site.readyRounds + site.magazine >= railsOf(site) * 2 ? 2 : 1;
  if (site.salvoSize !== want) {
    ctx.w.setSalvo(site.id, want);
    ctx.act(`SALVO ${site.salvoSize} ${site.name}`);
  }
}

/**
 * The cabin: lock what the battery can take, fire what is ready, and crash-load
 * when the rails go bare. `fireDelayS` is how long the operator takes to react
 * to the READY lamp — zero for a drilled crew, six seconds for a first watch.
 *
 * Two rules that are not in the net-seat pass, and are the difference between
 * a crew seat that shoots and one that watches. A battery has two or four
 * channels, not a sector's worth: `cannotEngageReason` will happily bless a
 * lock on something a minute out (the claim horizon is forty-five seconds plus
 * what the battery's reach entitles it to plan), and measured, the cabin then
 * pinned both LANCE channels on distant contacts from 125 s and did not fire
 * a round until 700 s. So the cabin locks what is in the envelope or nearly
 * in it, and lets go of a claim the geometry has taken away.
 */
/**
 * Would a drilled crew hold this shot for a few seconds more range?
 *
 * The netted batteries have done this since `holdFireFraction` was written —
 * a closing target still out near the rim will be markedly deeper in the
 * envelope shortly, Pk decays hard toward the edge, and `edgeLaunchPk` taxes
 * the launch geometry on top of that. The CABIN never did, because a manual
 * engagement reaches 'ready' as soon as the solution is good and the operator
 * decides the rest; and until the loaders ran continuously it hardly mattered,
 * because the rack was empty for most of the seconds the discipline would have
 * applied to. Measured on Weasel Hour's cabin, eight seeds: with rounds always
 * on the rail, 98% of the cabin's launches went at more than 0.72 of maximum
 * range, against 72% before, the whole twenty-four-round allocation was gone
 * by 306 s instead of 435 s, and the raid outlived the magazine by four
 * minutes. The reload cliff had been supplying the cabin's launch discipline
 * by accident.
 *
 * So the EXPERT does it on purpose, from the same numbers, and the seat can see
 * every one of them: the range rings are on the scope, the shootlist row
 * carries the range and the closure, the fire button carries the launch-quality
 * Pk, and the ticker says HOLDING FOR RANGE out loud whenever a netted battery
 * does it. Everybody else shoots when the lamp says READY, because that is what
 * READY means and there is nothing wrong with it.
 *
 * This is the cabin's attention dividend and it is deliberately NOT competent
 * play. A competent operator does the things the briefing tells them to do; an
 * expert reads a number off the button and waits four seconds. Measured, eight
 * seeds, cabin, with the sweet spot given to the competent player as well, the
 * expert's margin over them collapses to nothing on all four of these watches
 * (+4.5 / +3.4 / +0.7 / −8.4 per cent) because there is no verb left between
 * them; with it reserved, see the ladder table in README.
 *
 * Every escape the netted rule has, this has: a crossing or receding target, a
 * terminal one, a battery down to its last pair, and a forty-five second cap,
 * because a shot held past its moment is a leaker.
 */
/**
 * How long the cabin will hold a ready shot while something else is waiting.
 *
 * The sweet-spot hold is free in an empty moment and expensive in a busy one,
 * and the honest rule is neither "always" nor "never" but a short, bounded
 * patience: wait for the range while the shootlist is clear, and give the
 * launcher up after this long if anything unclaimed is inside the ring.
 * Measured over eight seeds a cell on the four watches, expert against
 * competent, seeds won and mean score delta on the seats with a cabin:
 *
 *   cap    Low Riders both   Low Riders cab   Solo Battery   Weasel cab
 *    8 s     3/8  +17.6%       4/8   −4.0%     5/8  +16.7%    4/8  +21.1%
 *   15 s     5/8  +24.3%       3/8   −4.6%     4/8  +15.8%    5/8  +26.5%
 *   25 s     7/8  +25.2%       6/8   +1.3%     5/8  +20.0%    4/8  +28.1%
 *   45 s     4/8   +6.5%       3/8   +3.2%     4/8  +14.1%    4/8  +11.8%
 *
 * Twenty-five. Below it the discipline never gets paid; at forty-five — the
 * netted batteries' own `holdFireMaxS`, which is the right number for a
 * battery with a sector behind it — the launcher is out of the fight long
 * enough to concede the contact it was not looking at.
 */
const CABIN_HOLD_S = 25;

function holdForRange(w, site, engagement, track) {
  const type = SAM_TYPES[site.type];
  const env = inEnvelope(site, track.pos, track.altM);
  if (!env.ok) return false;
  if (w.t - (engagement.readyAtS ?? w.t) >= ENGAGEMENT.holdFireMaxS) return false;
  if ((track.ttiS ?? Infinity) <= ENGAGEMENT.holdFireMinTtiS) return false;
  if (closureRate(track.pos, track.vel, site.pos) <= 0.005) return false;
  if (site.readyRounds + site.magazine <= (engagement.salvo ?? 1) * 2) return false;
  /*
   * AND THE LAUNCHER MUST NOT BE WANTED ELSEWHERE. This is the clause that
   * turns the rule into a judgement, and it is the difference between the
   * discipline paying and costing.
   *
   * A shot held is a LAUNCHER held: forty-five seconds spent aiming at an
   * aeroplane that was already going to die, while something nobody has
   * claimed closes on the town. Measured over eight seeds with this clause
   * missing, the sweet-spot rule was worth +33% on Solo Battery and +16% on
   * Weasel Hour — both watches where the battery has room — and −8% on Low
   * Riders, where nineteen aircraft arrive on four axes and the crewed
   * BASTION is the only set that reaches most of them.
   *
   * It is deliberately the WHOLE shootlist and not merely a full channel
   * count: gated on channels alone the rule still cost Low Riders, because
   * the second contact was on its way to being legal by the time the hold
   * expired. Patience is only free in a genuinely empty moment, and that is
   * the version an operator would describe: "I waited because there was
   * nothing else to shoot at."
   *
   * The seat can see this: the shootlist shows what is unassigned, the fire
   * button carries the Pk, and the channel count sits beside the tube lamps.
   */
  const queue = [...w.tracks.values()].some((other) => other.id !== track.id
    && shootable(other) && other.assignedTo.length === 0
    && inEnvelope(site, other.pos, other.altM).ok);
  if (queue && w.t - (engagement.readyAtS ?? w.t) >= CABIN_HOLD_S) return false;
  return env.rangeKm > type.maxRangeKm * ENGAGEMENT.holdFireFraction;
}

/**
 * A quarter of what this battery started the night with, rounded to a rack.
 *
 * The store is not readable from the seat as a number the player has to hold
 * in their head — the tube lamps show the rails and the panel shows the
 * store — so the threshold is a rack-shaped quantity rather than an exact
 * fraction: "about one more full rack and that is all of it".
 *
 * "Started the night with" is `site.magazineIssued`, not the type's book
 * figure. On a watch that issues half stores the book figure is twice the
 * issue, so a floor computed from it holds back half the night's rounds
 * instead of a quarter — measured on White Noise at half stores, that alone
 * put the expert cabin ten per cent BELOW the competent one and lost it all
 * eight seeds. The model was not worse than the competent player; it was
 * husbanding against an inventory it had not been given.
 */
function reserveFloor(site) {
  const rails = railsOf(site);
  const issued = site.magazineIssued ?? SAM_TYPES[site.type].magazine;
  return Math.max(rails, Math.round((issued + rails) * 0.25));
}

function crewLoop(ctx, fireDelayS, craft = {}) {
  const { w, mem } = ctx;
  const site = ctx.crewed;
  if (!site?.alive || site.scootRemainingS > 0) return;

  /*
   * When the shootlist first prints DECOY beside a track number, the operator
   * learns what kind of night this is. That is a thing a person remembers and
   * a thing the console says out loud, so the model is allowed to remember it.
   */
  if (mem.sawDecoyAtS === undefined
    && [...w.tracks.values()].some((t) => t.classification === 'decoy')) {
    mem.sawDecoyAtS = w.t;
    ctx.act('READS THE PICTURE — THERE ARE DECOYS IN THIS RAID');
  }

  for (const engagement of [...site.engagements]) {
    if (engagement.state !== 'ready') continue;
    if (w.t - (engagement.readyAtS ?? w.t) < fireDelayS) continue;
    /*
     * A drilled crew does not fire half a salvo. The rack refills a rail at a
     * time, so the SALVO selector can be sitting on two with one round on the
     * rails and the hoist twelve seconds from the next; a crew that presses
     * FIRE anyway throws the round away at the edge of the envelope and then
     * shoots the second one at the same target on its own a moment later.
     * Both the tube lamps and the loading bar say which it is, so this is a
     * judgement the seat can actually make — the novice below does not make
     * it, and that difference is worth measuring. Bounded by the same
     * `salvoWaitMaxS` the netted batteries use, and abandoned outright when
     * the store is empty or the target is terminal: there is no second round
     * coming and no time to wait for one.
     */
    const shortBy = (engagement.salvo ?? 1) - site.readyRounds;
    const track = w.tracks.get(engagement.trackId);
    const timeToSpare = (track?.ttiS ?? Infinity) > ENGAGEMENT.holdFireMinTtiS;
    const salvoInS = site.reloadRemainingS + (shortBy - 1) * railLoadS(site);
    if (shortBy > 0 && site.magazine > 0 && timeToSpare
      && salvoInS <= ENGAGEMENT.salvoWaitMaxS
      && w.t - (engagement.readyAtS ?? w.t) < ENGAGEMENT.salvoWaitMaxS) continue;
    if (craft.sweetSpot && track && holdForRange(w, site, engagement, track)) continue;
    /*
     * And do not launch into a shutdown. A set that ducks drops what it is
     * guiding, so a round released with an anti-radiation weapon fifteen
     * seconds off the battery's own antenna is a round bought and thrown
     * away — the crew will be dark before it arrives. Both cabin operators
     * know this, because both of them are the ones who duck; it is the same
     * arithmetic `expertEmcon` does from the other end when it decides
     * whether to RIDE. It costs nothing to wait: the round is still on the
     * rail afterwards, and Weasel Hour is the watch that charges for
     * forgetting.
     */
    const armEta = Math.min(...w.radarsOf(site).map((r) => armTimeToImpact(w, r)));
    if (armEta < 18 && site.emconOrder !== 'ride') continue;
    const launched = w.fire(site.id, engagement.trackId);
    if (launched > 0) ctx.act(`FIRE ${launched} on ${engagement.trackId}`);
  }

  for (const engagement of [...site.engagements]) {
    if (engagement.state === 'guiding') continue;
    if (w.t - engagement.startedS < 20) continue;
    const track = w.tracks.get(engagement.trackId);
    // NaN is a course not yet established, and that one the crew takes on
    // faith — the same call `cannotEngageReason` makes.
    const toRange = track ? timeToInRangeS(site, track) : Infinity;
    const coming = Number.isNaN(toRange) || toRange <= 45;
    const stale = !track || (!inEnvelope(site, track.pos, track.altM).ok && !coming);
    if (stale && w.unassign(engagement.trackId, site.id)) ctx.act(`BREAK OFF ${engagement.trackId}`);
  }

  if (site.engagements.length < channelsFor(site) && site.readyRounds > 0) {
    let best = null;
    let bestValue = -Infinity;
    let bestIsWeapon = true;
    for (const track of sortedTracks(w)) {
      if (!shootable(track)) continue;
      if (site.engagements.some((e) => e.trackId === track.id)) continue;
      if (cannotEngageReason(w, site, track)) continue;
      const evaluation = engagementValue(w, site, track);
      if (!evaluation) continue;
      /*
       * WHAT IS COMING, NOT ONLY WHAT IS HERE — and this is the cabin's
       * biggest single skill, hiding in a column the console already prints.
       *
       * A channel takes the reaction sequence to build whether the target is
       * in the envelope or thirty kilometres short of it, so a crew that
       * starts the sequence on a contact that will be in reach in a minute is
       * ready when it arrives, while a crew that waits until it is inside the
       * ring pays the timer with the aircraft already crossing. The console
       * says exactly how long: the shootlist's IN RANGE IN column, and the
       * battery card's refusal line, "CANNOT LOCK T-002 — OUT OF REACH FOR
       * 68S". `cannotEngageReason` will accept a lock forty-five seconds plus
       * four tenths of the battery's reach ahead of time, which is a minute
       * and a half for a long-range battalion, and the sector's own officers
       * have always planned that far. The cabin never did.
       *
       * Measured on Low Riders, sixteen seeds: this is the difference between
       * a competent cabin that scores below a novice one and an expert cabin
       * that beats both. The novice's apparent advantage was never frugality —
       * it was that a slow operator leaves their channels for the net above
       * them to fill, and the net was planning ahead while the cabin was not.
       */
      const horizon = craft.lookahead ? 45 + SAM_TYPES[site.type].maxRangeKm * 0.4 : 30;
      if (!evaluation.inEnvelope && !(evaluation.timeToRangeS <= horizon)) continue;
      /*
       * DOWN TO THE LAST QUARTER, THE ROUNDS BELONG TO WHAT ONLY YOU CAN
       * REACH. This is the cabin's version of the decision the net makes with
       * a priority of fires, and it is the one judgement Low Riders is
       * actually about from the inside of a long-range set.
       *
       * A battalion with a hundred-and-twenty-metre floor reaches eleven of
       * that watch's twenty-eight aircraft; the other seventeen are the
       * point-defence sections' problem and nothing the cabin does changes
       * that. Which means every round the cabin spends on something a gun
       * section could also have taken is a round missing when the next high
       * package arrives — and the high packages are the ONLY ones the cabin
       * can answer. Both halves are on the console: the shootlist is grouped
       * by which battery can take what, and the tube lamps and store readout
       * say how much is left.
       *
       * The bar is a quarter of the allocation, because above that there is
       * enough for both and hoarding is just timidity. Below it, an aircraft
       * sitting inside a friendly ring that is not this one is somebody
       * else's, and the cabin waits.
       */
      if (craft.reserveForOurs && site.readyRounds + site.magazine <= reserveFloor(site)) {
        const coveredByAnother = w.sites.some((other) => other.id !== site.id
          && other.alive && other.readyRounds > 0
          && !cannotEngageReason(w, other, track));
        if (coveredByAnother) continue;
      }
      /*
       * ONCE YOU HAVE SEEN ONE GHOST, DO NOT SPEND THE EDGE OF THE RING ON THE
       * NEXT ONE.
       *
       * A decoy reads as a strike aircraft — the track says STRIKE, because
       * that is what it is built to say — until it crosses forty kilometres of
       * the sector centre, where its impossibly steady flight gives it away
       * for free. Every round released outside that circle at an unresolved
       * contact is a coin toss, and on a watch that issues twenty-two rounds
       * against thirty-four objects the toss is the whole night.
       *
       * The trade is real and it is paid in geometry: waiting means taking the
       * shot deeper, closer to the target's release point and with less room
       * for a second one. So the rule is only about the OUTER half of the
       * envelope, and it only switches on once the shootlist has actually
       * relabelled something DECOY — which is the moment a person at the
       * console learns what kind of night this is.
       */
      if (craft.decoyTell && mem.sawDecoyAtS !== undefined
        && track.classification === 'striker'
        && len(track.pos) > AIR_TYPES.decoy.tellRangeKm + 4
        && dist(site.pos, track.pos) > SAM_TYPES[site.type].maxRangeKm * 0.55
        && (track.ttiS ?? Infinity) > 40) continue;
      /*
       * The aeroplane before the bomb, and the sector says so out loud: an
       * enemy round on the plot is announced with "LOW SECTIONS TAKE IT",
       * because a point-defence gun that can reach it has a far better shot
       * at it than a long-range battalion does and no strike aircraft to
       * spend its rounds on. The AI's own free crews have followed this rule
       * since it was written; the cabin never did, and it hardly showed while
       * the rack spent most of a suppression watch empty. With rounds always
       * on the rail it shows immediately: measured on Weasel Hour, seed p1,
       * the cabin put TWELVE of its twenty-four rounds into anti-radiation
       * rounds — half the BASTION's whole allocation — against three before,
       * and the strike package that arrived afterwards found a battalion with
       * an empty store. Aircraft first; the enemy's rounds when there is
       * nothing else in front of the battery.
       *
       * Two softer readings of the rule were measured against this one over
       * sixteen seeds of Weasel Hour's cabin and both are worse where it
       * matters. "Take the round if it is homing on a set of yours that is
       * still radiating" costs the competent operator three and a half
       * minutes of watch and six points of dead air (949 s / 6.0% against
       * 753 s / 0.0%). "Take the round if it is inside half your maximum
       * range — a point-defence shot" is worse again, at 935 s / 9.8%. The
       * flat rule is also the one already written down in `doctrine.js` for
       * the AI's own free crews, and a player model that follows the sector's
       * doctrine is the honest one to measure with.
       */
      const isWeapon = !!w.truthOf(track)?.contactType;
      if (bestIsWeapon !== isWeapon) {
        if (isWeapon) continue;                    // an aircraft already wins
      } else if (evaluation.value <= bestValue) continue;
      bestValue = evaluation.value; best = track; bestIsWeapon = isWeapon;
    }
    if (best && w.assign(best.id, site.id)) ctx.act(`LOCK ${best.tn}`);
  }

  /*
   * NOT salvo sizing, and the reason is worth keeping. The SALVO switch is
   * live in the cabin and every operator here leaves it on one, which looks
   * like a missing verb until it is measured: the net's own rule — two rounds
   * when the shot is awkward and the stock covers it — read from a cabin
   * spends the store faster than the watch does. Re-measured on the raid
   * tables that ship, eight seeds a cell: giving the expert cabin the net's
   * salvo rule costs Low Riders' cabin 8%, Solo Battery 12% and First Light
   * 2%, moves Weasel Hour 24% the other way on four seeds of eight, and adds
   * three rounds a watch everywhere. A commander with a sector can afford to
   * double because somebody else covers what the rounds do not; a crew with
   * one store cannot.
   *
   * LOADERS OUT is the verb the cabin's expert actually has, and it is one
   * button with a three-step ladder on it, which is unusual enough to be
   * worth saying plainly:
   *
   *   competent   never touches it. Doctrine fills a bare rack by itself and
   *               a competent operator lets it.
   *   novice      mashes it twenty seconds after the lamps go red, out of
   *               alarm rather than judgement, which is a first watch exactly.
   *   expert      presses it in the ONE state doctrine will not act in: the
   *               rails bare, a hostile inside the ring, and the launcher
   *               still guiding a round of its own, so `stepLoading` is
   *               deliberately holding the loaders back. That safety is the
   *               right default — see the note in `doctrine.js` and the
   *               attention dividend it protects — and overruling it is a
   *               judgement a person makes with a raid on top of them.
   *
   * WHAT IT BUYS IS TEMPO, NOT ROUNDS, and the measurement is unusually
   * clean about that. Sixteen seeds a watch, expert in the cabin, against an
   * operator who never touches the key, the sole-limiter share — the share of
   * the watch with a legal target in reach and nothing on the rails:
   *
   *                    never        crash load
   *   Solo Battery       4%             1%
   *   First Light       15%             2%
   *   Low Riders         8%             6%
   *   Weasel Hour       16%            19%
   *
   * and the score does NOT move outside the noise on any of them (751.9 vs
   * 769.0, 1190.9 vs 1190.4, 1244.6 vs 1200.6, 1194.2 vs 1129.2, with a
   * per-seed spread several times those gaps). That is the honest finding and
   * it is the right one: a store is a store. Every round the key puts on the
   * rails now is a round not on the rails later, so what changes is WHEN the
   * battery can shoot, not how often — which is precisely what the operator
   * in the cabin experiences and precisely what the ledger cannot see.
   *
   * Two other rules for the key were measured over the same sixteen seeds and
   * both are worse than doing nothing: "top up whenever the rack is short and
   * nothing is in the ring" (749.6 / 1190.9 / 1230.9 / 1162.8, and 13 of 16
   * watches held on Solo Battery against 14) and "whenever it is below half"
   * (754.1 / 1190.9 / 1205.2 / 1195.6). Both spend the store into a lull.
   */
  if (craft.topUp && !site.loading && site.magazine > 0 && site.readyRounds === 0) {
    const inRing = [...w.tracks.values()].some((track) => shootable(track)
      && inEnvelope(site, track.pos, track.altM).ok);
    if (inRing && w.reload(site.id)) ctx.act('LOADERS OUT');
  }
}

/* ------------------------------------------------------------------ *
 * The four operators
 * ------------------------------------------------------------------ */

/**
 * How many contacts the novice can hold in their head at once.
 *
 * This used to be one, and one is not a beginner — it is a person with a
 * single eye. A first-watch operator is SLOW and unsystematic; they are not
 * incapable of noticing that there are three aircraft on the scope. The
 * difference matters because this model is the bottom of the ladder every
 * difficulty measurement in the repository is read against, and at one contact
 * it was not a bottom, it was a floor through which nothing could be measured:
 * on the net seat the novice conceded three to six leakers a watch and held
 * ZERO seeds of eight on Low Riders and on Weasel Hour from both seats, while
 * the competent player conceded nought to one and held all eight. There is no
 * watch that can be tuned to sit between those two, so the band the novice is
 * supposed to occupy — a learner who wins some and loses some — could not
 * exist on any mission at any raid size.
 *
 * Two, measured, on the four watches this was tuned on — eight seeds a cell,
 * all seats, against the raid tables of the day:
 *
 *   hands   watches held   leakers a watch   cells at 0/8 or 8/8
 *     1          59%            0 to 6              7 of 10
 *     2          79%            0 to 5              4 of 10
 *     3          93%            0 to 3              4 of 10
 *     4          90%            0 to 2              4 of 10
 *
 * One hand is not a floor, it is a trapdoor: four of the ten cells sat at 0 of
 * 8 or 8 of 8 and the middle band the novice is supposed to occupy did not
 * exist at any raid size, because there is nothing to tune between a player
 * who concedes six leakers and one who concedes none. Two hands puts the model
 * on the same curve as everybody else, which is the only thing that makes a
 * difficulty band measurable at all. Three is where it stops being a novice:
 * it starts holding watches by attrition rather than by judgement, and the
 * leaker range collapses to the competent player's.
 *
 * Everything else about the model is unchanged and every one of those things
 * is a real beginner's fault: forty-five seconds to find the radiate switch,
 * eight seconds from noticing a contact to doing anything about it, the
 * NEAREST battery rather than the best one, no salvo sizing, no emissions
 * discipline, no re-pairing when the geometry moves, twenty seconds to answer
 * the net, and twenty seconds of staring at a red rack before it occurs to
 * them to call the loaders out.
 */
const NOVICE_HANDS = 2;

export const POLICIES = {
  nothing: {
    id: 'nothing',
    blurb: 'never touches a control; directives time out',
    tick() {},
  },

  novice: {
    id: 'novice',
    blurb: `radiates at 45s, ${NOVICE_HANDS} contacts at a time, 8s to react, 20s to answer`,
    tick(ctx) {
      const { w, mem } = ctx;
      if (w.t >= 45 && !mem.radiated) {
        mem.radiated = true;
        for (const group of ctx.groups) setGroup(ctx, group, true);
      }
      answerAfter(ctx, 20);

      /*
       * A few contacts at a time, each held until it is gone. `NOVICE_HANDS`
       * is the whole of this model's capacity and the note beside it carries
       * the measurement that set it.
       */
      mem.focus = (mem.focus ?? []).filter((f) => {
        const track = w.tracks.get(f.id);
        if (!track || track.destroyed) return false;
        if (f.assigned) return track.assignedTo.length > 0;
        // Patience is not infinite: a contact that will not become assignable
        // is eventually forgotten rather than fixated on for the whole watch.
        return w.t - f.noticedAtS <= 45;
      });

      if (mem.focus.length < NOVICE_HANDS) {
        for (const track of sortedTracks(w)) {
          if (!shootable(track) || track.assignedTo.length > 0) continue;
          if (mem.focus.some((f) => f.id === track.id)) continue;
          if (!ctx.own.some((s) => wellInside(s, track))) continue;
          mem.focus.push({ id: track.id, noticedAtS: w.t, assigned: false });
          ctx.act(`NOTICES ${track.tn}`);
          break;                                   // one new thing per tick
        }
      }

      for (const f of mem.focus) {
        if (f.assigned || w.t - f.noticedAtS < 8) continue;
        const track = w.tracks.get(f.id);
        const site = ctx.own
          .filter((s) => wellInside(s, track) && !cannotEngageReason(w, s, track))
          .sort((a, b) => dist(a.pos, track.pos) - dist(b.pos, track.pos))[0];
        if (site && w.assign(track.id, site.id)) {
          f.assigned = true;
          ctx.act(`ASSIGN ${track.tn} → ${site.name}`);
        }
      }

      if (ctx.crewed) {
        crewLoopNovice(ctx);
      }
    },
  },

  competent: {
    id: 'competent',
    blurb: 'radiates at once, assigns every 3s by engagementValue, blinks under ARM',
    tick(ctx) {
      const { w, mem } = ctx;
      for (const group of ctx.groups) setGroup(ctx, group, armEtaFor(w, group) >= 18);
      answerAfter(ctx, 6);
      if (ctx.seat !== 'crew' && w.t - (mem.lastPassS ?? -99) >= 3) {
        mem.lastPassS = w.t;
        assignPass(ctx, {});
      }
      if (ctx.crewed) crewLoop(ctx, 0);
    },
  },

  expert: {
    id: 'expert',
    blurb: 'greedy priority, salvo, EMCON, plans a channel ahead, holds the last rack',
    tick(ctx) {
      const { w, mem } = ctx;
      expertEmcon(ctx);
      answerAfter(ctx, 6, (id) => EXPERT_ANSWERS[id] ?? 'accepted');
      if (ctx.seat !== 'crew' && w.t - (mem.lastPassS ?? -99) >= 3) {
        mem.lastPassS = w.t;
        assignPass(ctx, { greedy: true, salvo: true });
      }
      if (ctx.crewed) {
        crewLoop(ctx, 0, {
          topUp: true, sweetSpot: true, reserveForOurs: true, lookahead: true, decoyTell: true,
        });
      }
      expertDisplace(ctx);
      if (ctx.seat !== 'crew') {
        standInTheMainEffort(ctx);
        commitTheReserve(ctx);
      }
    },
  },
};

/**
 * DISPLACE — one move, and only when the enemy has your grid.
 *
 * The most expensive verb on the console: forty seconds for a gun section,
 * three and a half minutes for a battalion, and the battery is out of the
 * fight for all of it with its sets down. It buys one thing, and it is the
 * only thing that buys it — the enemy's targeting is a grid reference, and
 * after a displacement that reference is an empty field. `startScoot` zeroes
 * the set's exposure and clears its battle damage with it.
 *
 * So the trigger is the two cases where the grid itself is the target rather
 * than the antenna on it.
 *
 * THE POSITION IS THE OBJECTIVE. A hostile is tracking toward something that
 * lives with this battery — the forward post that packs up and drives out
 * with it. That is the enemy coming for the ground you are standing on, and
 * no amount of blinking answers it: measured on the finale, whose third axis
 * is exactly this, one displacement of the home battery is the difference
 * between a scripted overrun and a watch held.
 *
 * DUCKING HAS STOPPED WORKING. A round is tracking one of this battery's
 * sets, or arrived inside the last minute and a half, AND the battery has
 * already been hurt by the hunt — a set destroyed, a wedge of sky burned out
 * of one, casualties, damage on the position. A round against an intact
 * battery is answered by the blink at a cost of twenty-five seconds; a
 * battery that has been hit is one the enemy has ranged.
 *
 * Two guards make it a decision rather than a reflex: nothing of ours in the
 * air, because a set that packs up drops what it is guiding, and once per
 * battery per watch, because a battery that spends the night driving defends
 * nothing. Measured, three and a half minutes off the air for a battalion is
 * a bad trade against an anti-radiation round it can simply duck — the
 * looser "any round inbound" trigger cost Weasel Hour's net expert a watch in
 * eight and gained nothing anywhere else.
 */
function expertDisplace(ctx) {
  const { w, mem } = ctx;
  mem.moved = mem.moved ?? new Set();
  for (const site of ctx.own) {
    if (!site.alive || site.scootRemainingS > 0 || mem.moved.has(site.id)) continue;
    if (site.readyRounds <= 0 && site.magazine <= 0) continue;
    if (w.missiles.some((m) => m.alive && m.siteId === site.id)) continue;

    const travelsWithUs = w.assets
      .filter((a) => a.follows === site.id && !a.destroyed).map((a) => a.id);
    const comingForUs = travelsWithUs.length > 0
      && [...w.tracks.values()].some((t) => t.hostility === 'hostile' && !t.destroyed
        && t.quality >= FIRM && travelsWithUs.includes(t.predictedAssetId));

    const sets = w.radarsOf(site);
    const hunted = sets.some((radar) => radar.alive
      && (Number.isFinite(armTimeToImpact(w, radar))
        || w.t - (radar.armWarningAtS ?? -9999) < 90));
    const hurt = site.damage > 0 || (site.crewLosses ?? 0) > 0
      || sets.some((radar) => !radar.alive || radar.deadSectors.length > 0);

    if (!comingForUs && !(hunted && hurt)) continue;
    if (w.scoot(site.id)) {
      mem.moved.add(site.id);
      ctx.act(`DISPLACE ${site.name}`);
    }
  }
}

/**
 * The strategic reserve — sixteen rounds, four minutes on the road, and a
 * question rather than a resource.
 *
 * National command only, and the whole allocation goes to one formation
 * because splitting it is how you fail to save either place. The timing is
 * the craft: released before the raid has declared itself it goes to the
 * wrong valley, and released late it arrives after the debrief, so this waits
 * until the picture is established and then sends everything to whichever
 * formation is carrying the most threat. No player model had ever touched it.
 */
function commitTheReserve(ctx) {
  const { w, mem } = ctx;
  if (mem.reserveSent || !(w.reserve?.rounds > 0) || w.reserve.frozen) return;
  // Four minutes on the road: released after this it is a delivery to a
  // finished watch. Held before the raid declares itself it goes nowhere useful.
  if (w.t < 120) return;

  const subordinate = w.formations.filter((f) => !f.hq && w.sitesOf(f).length);
  if (!subordinate.length) return;
  const mass = new Map(subordinate.map((f) => [f.id, 0]));
  for (const track of w.tracks.values()) {
    if (track.hostility !== 'hostile' || track.destroyed || !(track.threat > 0)) continue;
    let nearest = null;
    let best = Infinity;
    for (const formation of subordinate) {
      for (const site of w.sitesOf(formation)) {
        const d = dist(site.pos, track.pos);
        if (d < best) { best = d; nearest = formation; }
      }
    }
    if (nearest) mass.set(nearest.id, mass.get(nearest.id) + track.threat);
  }
  const top = subordinate.sort((a, b) => mass.get(b.id) - mass.get(a.id))[0];
  if (!top || mass.get(top.id) <= 0) return;
  const sent = w.commitReserve(top.id, w.reserve.rounds);
  if (sent > 0) {
    mem.reserveSent = true;
    ctx.act(`RESERVE ${sent} → ${top.name}`);
  }
}

/** A novice's cabin: the same loop, six seconds slower, and a late crash load. */
function crewLoopNovice(ctx) {
  const { w, mem } = ctx;
  const site = ctx.crewed;
  if (!site?.alive) return;
  for (const engagement of [...site.engagements]) {
    if (engagement.state !== 'ready') continue;
    if (w.t - (engagement.readyAtS ?? w.t) < 6) continue;
    const launched = w.fire(site.id, engagement.trackId);
    if (launched > 0) ctx.act(`FIRE ${launched} on ${engagement.trackId}`);
  }
  // Twenty seconds to notice the red lamps, which is a first watch all over.
  if (site.readyRounds <= 0 && site.magazine > 0) {
    mem.dryAtS = mem.dryAtS ?? w.t;
    if (w.t - mem.dryAtS >= 20 && w.reload(site.id)) { mem.dryAtS = Infinity; ctx.act('CRASH LOAD'); }
  } else if (site.readyRounds > 0) {
    mem.dryAtS = null;
  }
}

/** Firm, in the altitude band, and already well inside the ring — a beginner's bar. */
function wellInside(site, track) {
  if (!track) return false;
  const type = SAM_TYPES[site.type];
  if (track.altM > type.maxAltM || track.altM < type.minAltM) return false;
  return dist(site.pos, track.pos) <= type.maxRangeKm * 0.8;
}

/**
 * The expert's emissions.
 *
 * Surveillance stays up unless something is homing on it. The battery's own
 * set is the interesting one, and it is the whole game in one switch: up when
 * there is anything to look at or anything to guide, a duty cycle otherwise so
 * the enemy's direction-finders never get a steady bearing, and — with an
 * anti-radiation round inbound — the RIDE order when the rounds already in the
 * air will land first, because a set that ducks drops what it is guiding.
 */
function expertEmcon(ctx) {
  const { w } = ctx;
  for (const group of ctx.groups) {
    const armEta = armEtaFor(w, group);
    if (!group.siteId) { setGroup(ctx, group, armEta >= 18); continue; }

    const site = w.siteById.get(group.siteId);
    if (!site?.alive) continue;
    if (armEta < 18) {
      const roundEta = ownRoundEta(w, site);
      if (roundEta + 8 < armEta) {
        if (w.setEmconOrder(site.id, 'ride')) ctx.act('RIDE — HOLD THE BEAM');
        setGroup(ctx, group, true);
      } else {
        w.setEmconOrder(site.id, 'doctrine');
        setGroup(ctx, group, false);
      }
      ctx.mem.blinkUntilS = w.t + 25;
      continue;
    }
    w.setEmconOrder(site.id, 'doctrine');
    if (w.t < (ctx.mem.blinkUntilS ?? 0)) continue;

    const type = SAM_TYPES[site.type];
    const work = site.engagements.length > 0
      || [...w.tracks.values()].some((t) => t.hostility !== 'friendly' && t.quality > 0.3
        && dist(site.pos, t.pos) < type.maxRangeKm * 1.3);
    if (work) { setGroup(ctx, group, true); ctx.mem.searchUntilS = 0; continue; }
    /*
     * A duty cycle is a bet that somebody else is watching while you blink.
     * On Solo Battery nobody is — the scenario ships no surveillance radar at
     * all, and the isolation is the lesson — so blinking there is not
     * discipline, it is closing your eyes. Measured, eight seeds: the expert
     * duty-cycled the only set on the board and reached its first legal shot
     * at 149 s against the competent player's 84 s, then spent fourteen per
     * cent of the watch in dead air it had made itself. An operator who knows
     * there is no second set does not blink, and takes the anti-radiation
     * risk on the chin — which is the whole argument of the watch after it.
     */
    const anotherSetIsLooking = w.radars.some((r) => r.alive && r.on && !r.siteId)
      || w.radars.some((r) => r.alive && r.on && r.siteId && r.siteId !== site.id);
    if (!anotherSetIsLooking) { setGroup(ctx, group, true); continue; }
    /*
     * And the same bet is a different bet from inside the cabin. On the net a
     * duty cycle on one battery's set costs the SECTOR a little search
     * coverage it has elsewhere; sitting in that battery it costs you the
     * continuity of your own guidance and the whole of your own picture, and
     * the anti-radiation duck (`armEta < 18` above) and RIDE are already doing
     * the part of the job that the exposure is actually about.
     *
     * Measured, sixteen seeds, expert in the cabin: blinking the set you are
     * sitting in costs Weasel Hour's operator thirty points and a watch held
     * in seven (1098 / 13 of 16 against 1128 / 14 of 16), and the same watch
     * from BOTH seats a hundred and forty-four points and a whole watch (1103
     * / 15 against 1247 / 16). Low Riders gains thirteen points in the cabin
     * and forty-seven from both seats. It costs First Light's cabin seven
     * points, which is a watch with a cut-down console and nothing to blink
     * for. So the expert blinks everybody's set but its own.
     */
    if (ctx.crewed?.id === site.id) { setGroup(ctx, group, true); continue; }
    if (w.t < (ctx.mem.searchUntilS ?? 0)) { setGroup(ctx, group, true); continue; }
    if (w.t > (ctx.mem.nextSearchS ?? 0)) {
      ctx.mem.searchUntilS = w.t + 18;
      ctx.mem.nextSearchS = w.t + 18 + 40;
      setGroup(ctx, group, true);
      continue;
    }
    setGroup(ctx, group, false);
  }
}

/**
 * Stand where the fight is.
 *
 * Only means anything from district command up, where the appointment holds
 * fewer sectors than it owns. Threat mass is summed per formation by which
 * formation each hostile is nearest, and the hand only moves when the loose
 * sector beats the weakest held one by half again — a handover is eighteen
 * seconds at district and twenty-six at national, during which nobody is
 * commanding either of them, so thrashing is worse than being in the wrong
 * place.
 */
function standInTheMainEffort(ctx) {
  const { w, mem } = ctx;
  if (!Number.isFinite(w.echelon.directLimit)) return;
  if (w.t - (mem.lastLookS ?? -99) < 45) return;
  mem.lastLookS = w.t;

  const subordinate = w.formations.filter((f) => !f.hq);
  if (subordinate.length <= w.echelon.directLimit) return;

  const centreOf = (formation) => {
    if (formation.pos) return formation.pos;
    const sites = w.sitesOf(formation);
    if (!sites.length) return null;
    return {
      x: sites.reduce((n, s) => n + s.pos.x, 0) / sites.length,
      y: sites.reduce((n, s) => n + s.pos.y, 0) / sites.length,
    };
  };
  const mass = new Map(subordinate.map((f) => [f.id, 0]));
  for (const track of w.tracks.values()) {
    if (track.hostility !== 'hostile' || track.destroyed || !(track.threat > 0)) continue;
    let nearest = null;
    let best = Infinity;
    for (const formation of subordinate) {
      const centre = centreOf(formation);
      if (!centre) continue;
      const d = dist(centre, track.pos);
      if (d < best) { best = d; nearest = formation; }
    }
    if (nearest) mass.set(nearest.id, mass.get(nearest.id) + track.threat);
  }

  const held = subordinate.filter((f) => f.direct);
  const loose = subordinate.filter((f) => !f.direct);
  const top = loose.sort((a, b) => mass.get(b.id) - mass.get(a.id))[0];
  if (!top || mass.get(top.id) <= 0) return;
  const weakest = held.sort((a, b) => mass.get(a.id) - mass.get(b.id))[0];
  const room = held.length < w.echelon.directLimit;
  if (!room && (!weakest || mass.get(top.id) < mass.get(weakest.id) * 1.5)) return;
  if (w.takeDirect(top.id)) ctx.act(`TAKE ${top.name}`);
}

/* ------------------------------------------------------------------ *
 * One run
 * ------------------------------------------------------------------ */

/**
 * Could this battery shoot this contact if only it had a round on the rail?
 *
 * `cannotEngageReason` answers with the FIRST thing that is wrong, and an
 * empty rack is checked before reach and channels — so "no rounds" alone does
 * not mean the magazine is the binding constraint. This asks the rest of the
 * question, and it is the difference between a watch that is quiet and a watch
 * whose player is watching a reload bar.
 */
function magazineIsTheOnlyLimit(w, site, track) {
  if (site.readyRounds > 0) return false;
  const type = SAM_TYPES[site.type];
  if (track.altM > type.maxAltM || track.altM < type.minAltM) return false;
  if (site.engagements.length >= channelsFor(site)) return false;
  const toRange = timeToInRangeS(site, track);
  if (toRange === Infinity) return false;
  const horizonS = 45 + type.maxRangeKm * 0.4;
  if (Number.isFinite(toRange) && toRange > horizonS) return false;
  // And the same plausible band `cannotEngageReason` keeps faith in for an
  // unsettled course, or the empty rack gets blamed for a contact the battery
  // was never going to reach.
  if (Number.isNaN(toRange)
    && dist(site.pos, track.pos) - type.maxRangeKm > horizonS * DETECTION.maxTargetSpeedKmS) {
    return false;
  }
  return true;
}

const r1 = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : null);
const r3 = (x) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null);

/** Play one watch and write down what it was like. Deterministic in `job`. */
export function playRun(job) {
  const { mission, seat, policy: policyId, seed } = job;
  const scenario = SCENARIOS.find((s) => s.id === mission);
  if (!scenario) throw new Error(`no such mission: ${mission}`);
  if (!scenario.roles.includes(seat)) throw new Error(`${mission} has no ${seat} seat`);
  const model = POLICIES[policyId];
  if (!model) throw new Error(`no such policy: ${policyId}`);

  const w = new World(scenario, { role: seat, seed });
  const trace = job.trace ? [`### ${mission} · ${seat} · ${policyId} · ${seed}`] : null;
  const lastHostileSpawnS = w.pendingWaves
    .filter((wave) => !AIR_TYPES[wave.type]?.friendly)
    .reduce((m, wave) => Math.max(m, wave.atS), 0);

  const isOwn = (siteId) => {
    if (!siteId) return false;
    if (seat === 'crew') return siteId === w.control.crewedBatteryId;
    return w.commandable(siteId);
  };

  let sawLine = false;
  let lastActionS = 0;
  let firstLaunchS = null;
  let ownRounds = 0;
  const realLog = w.log.bind(w);
  w.log = (kind, text, meta = {}) => {
    // Everything except the debrief's own headline, which is logged AFTER the
    // last thing that happened and would otherwise report every watch as
    // ending on the beat. `endAfterLastActionS` is exactly the dead coda the
    // "bookends are alive" work went after, so it must not measure itself.
    if (ACTION_KINDS.has(kind) && !text.startsWith('WATCH ENDS')) {
      lastActionS = w.t;
      // And the same set breaks a hole. This used to be set by ANY line,
      // including the `info` echo of the operator's own switch and a set
      // reporting that it is warming up, which is not the watch giving
      // anybody something to do.
      sawLine = true;
    }
    if (kind === 'launch' && isOwn(meta.siteId)) {
      if (firstLaunchS === null) firstLaunchS = w.t;
      const away = /— (\d+) AWAY ON/.exec(text);
      ownRounds += away ? Number(away[1]) : 1;
    }
    if (trace && trace.length < 40000) trace.push(`${w.t.toFixed(1)} ${kind} ${text}`);
    return realLog(kind, text, meta);
  };

  const mem = {};
  const act = trace
    ? (text) => { if (trace.length < 40000) trace.push(`${w.t.toFixed(1)} play ${text}`); }
    : () => {};

  const holeFlags = [];
  const opportunities = new Set();
  let samples = 0;
  let engageableS = 0;
  let workingS = 0;
  let magOnlyS = 0;
  let reloadWaitS = 0;
  let firstContactS = null;
  let firstLegalShotS = null;
  let firstInEnvelopeS = null;
  let blindS = 0;
  let ticks = 0;
  let capHit = false;

  while (w.phase === 'running') {
    if (ticks >= MAX_TICKS) { capHit = true; break; }
    w.step(0.1);
    ticks++;
    if (ticks % 10 !== 0) continue;

    const own = ownSites(w, seat);
    let engageable = false;
    let magOnly = false;
    let waiting = false;
    let inEnv = false;
    for (const track of w.tracks.values()) {
      if (track.destroyed || track.hostility !== 'hostile') continue;
      for (const site of own) {
        if (inEnvelope(site, track.pos, track.altM).ok) inEnv = true;
        if (cannotEngageReason(w, site, track) === null) {
          engageable = true;
          opportunities.add(track.id);
        } else if (magazineIsTheOnlyLimit(w, site, track)) {
          magOnly = true;
          // Rounds in the store and none on the rail: the loaders are the
          // constraint, not the allocation.
          if (site.magazine > 0) waiting = true;
        }
      }
    }
    // A seat with no surviving fire-control antenna anywhere has no verbs
    // left, whatever else the numbers say about it.
    if (own.length && !own.some((site) => {
      const fc = w.radarById.get(site.fcRadarId ?? site.radarId);
      return fc?.alive;
    })) blindS++;
    if (firstContactS === null && w.tracks.size > 0) firstContactS = w.t;
    if (firstLegalShotS === null && engageable) firstLegalShotS = w.t;
    if (firstInEnvelopeS === null && inEnv) firstInEnvelopeS = w.t;
    samples++;
    if (engageable) engageableS++;
    else if (magOnly) { magOnlyS++; if (waiting) reloadWaitS++; }
    /*
     * `engageableShare` counts seconds in which a NEW shot was legal, and on a
     * two-channel battery that is a poor reading of whether the seat has
     * anything to do: `cannotEngageReason` says "channels full" for exactly
     * the stretch in which the operator is busiest. Measured on Solo Battery,
     * whose LANCE has two channels and no surveillance set behind it, the
     * competent cabin's engageable share is 16% while the trace shows
     * continuous engagements from 81 s to 540 s — the seat is saturated, and
     * the figure reads as idle.
     *
     * `busyShare` is the honest companion: a shot is legal, or a round of this
     * battery's is in the air, or one of its channels is committed. Read them
     * together — a low engageable share beside a high busy share is a
     * launcher working at its ceiling, and a low busy share is a seat with
     * nothing in front of it.
     */
    if (engageable || own.some((site) => site.engagements.length > 0
      || w.missiles.some((m) => m.alive && m.siteId === site.id))) workingS++;
    holeFlags.push(!engageable
      && !w.missiles.some((m) => m.alive)
      && !w.command.pending
      && !sawLine);
    sawLine = false;

    model.tick({
      w,
      seat,
      mem,
      act,
      own,
      groups: radarGroups(w, seat),
      crewed: w.control.crewedBatteryId ? w.siteById.get(w.control.crewedBatteryId) : null,
    });
  }

  const outcome = w.outcome ?? w.result('raid-spent');
  const watchS = w.t;
  const holes = holeStats(holeFlags, watchS);
  const directives = { issued: 0, accepted: 0, refused: 0, timedOut: 0 };
  for (const entry of w.command.log) {
    directives.issued++;
    if (entry.state === 'accepted') directives.accepted++;
    else if (entry.state === 'refused') directives.refused++;
    else if (entry.state === 'ignored') directives.timedOut++;
  }

  const run = {
    mission,
    seat,
    policy: policyId,
    seed,
    watchS: r1(watchS),
    capHit,
    firstContactS: r1(firstContactS),
    firstLegalShotS: r1(firstLegalShotS),
    firstInEnvelopeS: r1(firstInEnvelopeS),
    firstLaunchS: r1(firstLaunchS),
    lastHostileSpawnS: r1(lastHostileSpawnS),
    endAfterLastActionS: r1(Math.max(0, watchS - lastActionS)),
    holes,
    engageableShare: r3(samples ? engageableS / samples : 0),
    busyShare: r3(samples ? workingS / samples : 0),
    legalShotOpportunities: opportunities.size,
    magazineOnlyLimiterShare: r3(samples ? magOnlyS / samples : 0),
    reloadWaitShare: r3(samples ? reloadWaitS / samples : 0),
    blindShare: r3(samples ? blindS / samples : 0),
    displacements: outcome.stats.displacements ?? 0,
    reserveReleased: w.reserve?.released ?? 0,
    /*
     * The decapitation, which the harness could not see at all.
     *
     * Ville Under Fire's whole brief is about the moment the fused picture
     * dies, and there was no column for it — so the fact that it fired on
     * ZERO of eight competent nights, and that where it fired the watch was
     * already lost, had to be dug out of trace files by hand. `fusionLostAtS`
     * is when the centre stopped reconciling; `criticalLost` is whether the
     * building itself went. A watch where those two are the same number is a
     * watch with two states and nothing in between.
     */
    fusionLostAtS: r1(w.c2LostAtS ?? null),
    criticalLost: w.assets.some((a) => ASSET_TYPES[a.type].critical && a.destroyed),
    rounds: outcome.stats.roundsFired,
    ownRounds,
    kills: outcome.stats.kills,
    leakers: outcome.stats.leakers,
    assetsLost: outcome.stats.assetsLost,
    score: outcome.score,
    standing: outcome.standing,
    held: outcome.success,
    headline: outcome.headline,
    tier: outcome.tier,
    directives,
    ending: outcome.endingId ?? null,
  };
  return trace ? { run, trace } : { run };
}

/**
 * And WHERE they are, not only how long the worst one was.
 *
 * The count and the worst length say a watch has a hundred-second silence in
 * it; they do not say whether that silence is the minute before the second
 * package or the four minutes after the last one, and those want opposite
 * repairs — one is a wave that arrives too late, the other is a watch that
 * ends too late. `windows` is every hole of thirty seconds or more as a
 * `[startS, endS]` pair, in the JSON only (the table has no room for them and
 * they are a working number, not a headline). Act 1's pacing pass was written
 * against this column: solo-battery's competent hole turned out to be
 * 300-400 s, between the second package turning for home and the cruise
 * stream painting, which is a chatter problem, and weasel-hour's both-seat
 * hole turned out to be the last two minutes, which is not.
 */
function holeStats(flags, watchS) {
  let count = 0;
  let longestS = 0;
  let insideS = 0;
  let run = 0;
  const windows = [];
  const close = (endIndex) => {
    if (run > longestS) longestS = run;
    if (run >= HOLE_S) { count++; insideS += run; windows.push([endIndex - run, endIndex]); }
    run = 0;
  };
  flags.forEach((flag, i) => { if (flag) run++; else close(i); });
  close(flags.length);
  return { count, longestS, shareOver30s: r3(watchS > 0 ? insideS / watchS : 0), windows };
}

/* ------------------------------------------------------------------ *
 * The matrix
 * ------------------------------------------------------------------ */

export function buildJobs({ missions, seats, policies, seeds, seedBase, trace }) {
  const jobs = [];
  for (const mission of missions) {
    const scenario = SCENARIOS.find((s) => s.id === mission);
    if (!scenario) throw new Error(`no such mission: ${mission}`);
    for (const seat of SEAT_ORDER) {
      if (!seats.includes(seat) || !scenario.roles.includes(seat)) continue;
      for (const policy of POLICY_ORDER) {
        if (!policies.includes(policy)) continue;
        for (let i = 0; i < seeds; i++) {
          jobs.push({
            mission,
            seat,
            policy,
            seed: `p${seedBase + i}`,
            trace: trace && i === 0,
          });
        }
      }
    }
  }
  return jobs;
}

const sortKey = (job) => [
  MISSION_ORDER.indexOf(job.mission),
  SEAT_ORDER.indexOf(job.seat),
  POLICY_ORDER.indexOf(job.policy),
  job.seed,
];

/** Run a job list, in this process or across `jobs` children. Order-stable. */
export async function runMatrix(opts) {
  const jobs = buildJobs(opts);
  if (!jobs.length) {
    throw new Error('nothing to play — every mission asked for refuses every seat asked for '
      + `(seats ${opts.seats.join(',')}; the roster's seats come from each scenario's roles)`);
  }
  const workers = Math.max(1, Math.min(opts.jobs ?? 1, jobs.length));
  const started = Date.now();
  const results = new Array(jobs.length);
  let done = 0;
  const progress = (index) => {
    done++;
    if (!opts.quiet) {
      const job = jobs[index];
      process.stderr.write(`[${String(done).padStart(4)}/${jobs.length}] `
        + `${job.mission} ${job.seat} ${job.policy} ${job.seed}\n`);
    }
  };

  if (workers === 1) {
    for (let i = 0; i < jobs.length; i++) { results[i] = playRun(jobs[i]); progress(i); }
  } else {
    await new Promise((done_, fail) => {
      let next = 0;
      let live = workers;
      for (let n = 0; n < workers; n++) {
        const child = fork(THIS_FILE, ['--worker'], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
        let current = -1;
        const feed = () => {
          if (next >= jobs.length) { child.disconnect(); return; }
          current = next++;
          child.send(jobs[current]);
        };
        child.on('message', (message) => {
          if (message.error) { fail(new Error(message.error)); return; }
          results[current] = message.result;
          progress(current);
          feed();
        });
        child.on('exit', () => { if (--live === 0) done_(); });
        child.on('error', fail);
        feed();
      }
    });
  }

  const order = jobs.map((job, i) => i)
    .sort((a, b) => {
      const ka = sortKey(jobs[a]);
      const kb = sortKey(jobs[b]);
      for (let i = 0; i < ka.length; i++) {
        if (ka[i] < kb[i]) return -1;
        if (ka[i] > kb[i]) return 1;
      }
      return 0;
    });
  const runs = order.map((i) => results[i].run);
  const traces = order.filter((i) => results[i].trace).map((i) => results[i].trace);
  const wallS = (Date.now() - started) / 1000;

  return {
    meta: {
      runs: runs.length,
      workers,
      wallS: Math.round(wallS * 10) / 10,
      secondsPerRun: Math.round((wallS / Math.max(1, runs.length)) * 1000) / 1000,
    },
    runs,
    aggregates: aggregate(runs),
    traces,
  };
}

/* ------------------------------------------------------------------ *
 * Aggregation
 * ------------------------------------------------------------------ */

const median = (xs) => {
  const clean = xs.filter((x) => x !== null && Number.isFinite(x)).sort((a, b) => a - b);
  if (!clean.length) return null;
  const mid = clean.length >> 1;
  return r1(clean.length % 2 ? clean[mid] : (clean[mid - 1] + clean[mid]) / 2);
};
const mean = (xs) => {
  const clean = xs.filter((x) => x !== null && Number.isFinite(x));
  return clean.length ? clean.reduce((a, b) => a + b, 0) / clean.length : null;
};

const TIMINGS = ['watchS', 'firstContactS', 'firstLegalShotS', 'firstInEnvelopeS', 'firstLaunchS',
  'endAfterLastActionS', 'engageableShare', 'busyShare', 'magazineOnlyLimiterShare', 'reloadWaitShare',
  'blindShare', 'legalShotOpportunities', 'rounds', 'ownRounds', 'kills', 'leakers', 'assetsLost',
  'displacements', 'reserveReleased'];

export function aggregate(runs) {
  const cells = new Map();
  for (const run of runs) {
    const key = `${run.mission}|${run.seat}|${run.policy}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(run);
  }

  const rows = [];
  for (const [key, group] of cells) {
    const [mission, seat, policy] = key.split('|');
    const scores = group.map((r) => r.score);
    const m = mean(scores);
    const variance = scores.length > 1
      ? scores.reduce((a, s) => a + (s - m) ** 2, 0) / (scores.length - 1)
      : 0;
    const row = {
      mission,
      seat,
      policy,
      n: group.length,
      heldRate: r3(group.filter((r) => r.held).length / group.length),
      meanScore: r1(m),
      medianScore: median(scores),
      scoreCV: m === 0 ? null : r3(Math.sqrt(variance) / Math.abs(m)),
      capHits: group.filter((r) => r.capHit).length,
      holeCount: median(group.map((r) => r.holes.count)),
      longestHoleS: median(group.map((r) => r.holes.longestS)),
      holeShare: r3(mean(group.map((r) => r.holes.shareOver30s)) ?? 0),
      directives: {
        issued: median(group.map((r) => r.directives.issued)),
        accepted: median(group.map((r) => r.directives.accepted)),
        refused: median(group.map((r) => r.directives.refused)),
        timedOut: median(group.map((r) => r.directives.timedOut)),
      },
    };
    for (const field of TIMINGS) row[field] = median(group.map((r) => r[field]));
    rows.push(row);
  }
  rows.sort((a, b) => MISSION_ORDER.indexOf(a.mission) - MISSION_ORDER.indexOf(b.mission)
    || SEAT_ORDER.indexOf(a.seat) - SEAT_ORDER.indexOf(b.seat)
    || POLICY_ORDER.indexOf(a.policy) - POLICY_ORDER.indexOf(b.policy));

  return { cells: rows, paired: pairedComparisons(runs) };
}

/**
 * The only numbers that mean anything on their own: the same seed, the same
 * watch, two different players. Per-seed score variance on a busy watch is
 * several times the effect any policy has, so a mean over unpaired runs is
 * measuring the sample.
 */
function pairedComparisons(runs) {
  const byKey = new Map();
  for (const run of runs) byKey.set(`${run.mission}|${run.seat}|${run.policy}|${run.seed}`, run);

  const out = [];
  const combos = new Map();
  for (const run of runs) combos.set(`${run.mission}|${run.seat}`, [run.mission, run.seat]);

  for (const [, [mission, seat]] of combos) {
    for (const [better, worse] of [['competent', 'nothing'], ['expert', 'competent']]) {
      const deltas = [];
      let won = 0;
      let heldBetter = 0;
      let heldWorse = 0;
      for (const run of runs) {
        if (run.mission !== mission || run.seat !== seat || run.policy !== better) continue;
        const other = byKey.get(`${mission}|${seat}|${worse}|${run.seed}`);
        if (!other) continue;
        if (run.score > other.score) won++;
        if (run.held) heldBetter++;
        if (other.held) heldWorse++;
        const base = Math.abs(other.score);
        deltas.push(base > 1 ? ((run.score - other.score) / base) * 100 : null);
      }
      if (!deltas.length) continue;
      out.push({
        mission,
        seat,
        comparison: `${better}-vs-${worse}`,
        n: deltas.length,
        seedsWon: won,
        meanDeltaPct: r1(mean(deltas)),
        heldBetter,
        heldWorse,
      });
    }
  }
  out.sort((a, b) => MISSION_ORDER.indexOf(a.mission) - MISSION_ORDER.indexOf(b.mission)
    || SEAT_ORDER.indexOf(a.seat) - SEAT_ORDER.indexOf(b.seat)
    || a.comparison.localeCompare(b.comparison));
  return out;
}

/* ------------------------------------------------------------------ *
 * Output
 * ------------------------------------------------------------------ */

const cell = (x) => (x === null || x === undefined ? '—' : String(x));
const pct = (x) => (x === null || x === undefined ? '—' : `${Math.round(x * 100)}%`);

export function toMarkdown(result, opts) {
  const lines = [];
  lines.push('# IADSVille playtest');
  lines.push('');
  lines.push(`${result.meta.runs} runs, ${result.meta.workers} worker(s), `
    + `${result.meta.wallS}s wall, ${result.meta.secondsPerRun}s a run.`);
  const capped = result.runs.filter((r) => r.capHit);
  if (capped.length) {
    lines.push('');
    lines.push(`**${capped.length} run(s) hit the 40 000-tick cap and never finished: `
      + `${capped.map((r) => `${r.mission}/${r.seat}/${r.policy}/${r.seed}`).join(', ')}.** `
      + 'Their figures are provisional.');
  }
  if (opts?.command) lines.push('');
  if (opts?.command) lines.push(`\`${opts.command}\``);
  lines.push('');
  lines.push('| watch | seat | player | n | held | score | med | CV | 1st legal | 1st env | 1st away'
    + ' | eng% | busy% | mag% | wait% | blind% | holes | worst | dead end | rnds | kills | leak | lost'
    + ' | disp | res | dir a/r/t |');
  lines.push('|---|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|---|');
  for (const row of result.aggregates.cells) {
    lines.push(`| ${row.mission} | ${row.seat} | ${row.policy} | ${row.n}`
      + ` | ${pct(row.heldRate)} | ${cell(row.meanScore)} | ${cell(row.medianScore)}`
      + ` | ${cell(row.scoreCV)} | ${cell(row.firstLegalShotS)} | ${cell(row.firstInEnvelopeS)}`
      + ` | ${cell(row.firstLaunchS)}`
      + ` | ${pct(row.engageableShare)} | ${pct(row.busyShare)} | ${pct(row.magazineOnlyLimiterShare)}`
      + ` | ${pct(row.reloadWaitShare)} | ${pct(row.blindShare)}`
      + ` | ${cell(row.holeCount)} | ${cell(row.longestHoleS)} | ${cell(row.endAfterLastActionS)}`
      + ` | ${cell(row.rounds)} | ${cell(row.kills)} | ${cell(row.leakers)} | ${cell(row.assetsLost)}`
      + ` | ${cell(row.displacements)} | ${cell(row.reserveReleased)}`
      + ` | ${cell(row.directives.accepted)}/${cell(row.directives.refused)}/`
      + `${cell(row.directives.timedOut)} |`);
  }
  if (result.aggregates.paired.length) {
    lines.push('');
    lines.push('## Paired, seed by seed');
    lines.push('');
    lines.push('| watch | seat | comparison | n | seeds won | mean Δ% | held |');
    lines.push('|---|---|---|--:|--:|--:|---|');
    for (const row of result.aggregates.paired) {
      lines.push(`| ${row.mission} | ${row.seat} | ${row.comparison} | ${row.n}`
        + ` | ${row.seedsWon} | ${cell(row.meanDeltaPct)} | ${row.heldBetter} vs ${row.heldWorse} |`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

function write(path, text) {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(resolve(path), text);
}

/* ------------------------------------------------------------------ *
 * CLI
 * ------------------------------------------------------------------ */

export function parseCli(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      mission: { type: 'string', default: 'all' },
      seat: { type: 'string', default: 'all' },
      policy: { type: 'string', default: 'competent' },
      seeds: { type: 'string', default: '8' },
      'seed-base': { type: 'string', default: '1' },
      json: { type: 'string' },
      md: { type: 'string' },
      trace: { type: 'string' },
      jobs: { type: 'string', default: '1' },
      quiet: { type: 'boolean', default: false },
      worker: { type: 'boolean', default: false },
    },
    allowPositionals: false,
  });

  const missions = values.mission === 'all' ? MISSION_ORDER : values.mission.split(',');
  const seats = values.seat === 'all' ? SEAT_ORDER : values.seat.split(',');
  const policies = values.policy === 'all' ? POLICY_ORDER : values.policy.split(',');
  for (const seat of seats) {
    if (!SEAT_ORDER.includes(seat)) throw new Error(`no such seat: ${seat}`);
  }
  for (const policy of policies) {
    if (!POLICY_ORDER.includes(policy)) throw new Error(`no such policy: ${policy}`);
  }
  return {
    missions,
    seats,
    policies,
    seeds: Number(values.seeds),
    seedBase: Number(values['seed-base']),
    jobs: Number(values.jobs),
    json: values.json ?? null,
    md: values.md ?? null,
    trace: values.trace ?? null,
    quiet: values.quiet,
  };
}

async function main() {
  const opts = parseCli(process.argv.slice(2));
  const result = await runMatrix({ ...opts, trace: !!opts.trace });
  const command = `node tools/playtest.mjs ${process.argv.slice(2).join(' ')}`;
  const markdown = toMarkdown(result, { command });

  if (opts.json) {
    write(opts.json, `${JSON.stringify({
      meta: result.meta, runs: result.runs, aggregates: result.aggregates,
    }, null, 2)}\n`);
  }
  if (opts.md) write(opts.md, markdown);
  else process.stdout.write(markdown);
  if (opts.trace) write(opts.trace, `${result.traces.map((t) => t.join('\n')).join('\n\n')}\n`);

  process.stderr.write(`\n${result.meta.runs} runs in ${result.meta.wallS}s `
    + `(${result.meta.secondsPerRun}s a run, ${result.meta.workers} worker(s))\n`);
}

if (process.argv.includes('--worker')) {
  process.on('message', (job) => {
    try {
      process.send({ result: playRun(job) });
    } catch (error) {
      process.send({ error: `${job.mission}/${job.seat}/${job.policy}/${job.seed}: ${error.message}` });
    }
  });
} else if (process.argv[1] && resolve(process.argv[1]) === resolve(THIS_FILE)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack}\n`);
    process.exitCode = 1;
  });
}
