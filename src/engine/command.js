/**
 * The Command Net.
 *
 * Sector command is not your ally and not quite your enemy. It is a filing
 * system with a radio. It interrupts at the worst moment, it demands things the
 * tactical picture cannot deliver, and it writes down what you say.
 *
 * Directives are real mechanics, not flavour. Accepting one binds you — accept
 * "all sets to radiate" and going dark to dodge an anti-radiation round is now a
 * logged violation. Refusing costs standing immediately. Ignoring costs more,
 * because silence on the net is its own answer.
 *
 * The scarcest resource in this game is the operator's attention, and this
 * module is designed to spend it.
 */

import { COMMAND, ASSET_TYPES } from './config.js';
import { bearing, clamp } from './math.js';
import { radiating } from './detection.js';

/**
 * Directive templates.
 *
 * `text` is the version sector command actually sends. `plain` is the same order
 * stripped of the menace, used when narrative pressure is switched off — the
 * tactical constraint is identical either way.
 */
export const DIRECTIVES = {
  radiate: {
    id: 'radiate',
    /** How the order is named in the after-action ledger. */
    label: 'the order to keep radiating',
    priority: 'high',
    cooldownS: 180,
    text: (w) => `SECTOR ACTUAL: Emissions log shows ${Math.round(w.command.darkTimeS)}s dark with hostiles inbound. All sets will radiate. Acknowledge.`,
    plain: () => 'SECTOR: Bring all sets up and hold them up. Acknowledge.',
    trigger: (w) => w.command.darkTimeS > 45 && w.hostileTrackCount() > 0,
    onAccept: (w) => {
      w.command.constraints.mustRadiateUntilS = w.t + 150;
      w.command.constraints.radiateViolationS = 0;
    },
    /** Enforced continuously while the constraint is live. */
    check: (w, dt) => {
      const c = w.command.constraints;
      if (w.t > (c.mustRadiateUntilS ?? 0)) return null;
      const anyUp = w.ownedRadars().some((r) => r.alive && r.on);
      if (anyUp) return null;
      c.radiateViolationS = (c.radiateViolationS ?? 0) + dt;
      if (c.radiateViolationS > 10 && !c.radiateLogged) {
        c.radiateLogged = true;
        return { standing: -11, reason: 'went dark against a standing order' };
      }
      return null;
    },
  },

  noLeakers: {
    id: 'noLeakers',
    /** How the order is named in the after-action ledger. */
    label: 'the no-leakers order',
    priority: 'normal',
    once: true,
    text: () => 'SECTOR ACTUAL: No leakers past the river line. You are accountable for every aircraft that reaches the town. Acknowledge.',
    plain: () => 'SECTOR: Priority is preventing weapons release on the town. Acknowledge.',
    trigger: (w) => w.t > 40 && w.hostileTrackCount() > 0,
    onAccept: (w) => { w.command.constraints.leakerAccount = true; },
  },

  conserve: {
    id: 'conserve',
    /** How the order is named in the after-action ledger. */
    label: 'the expenditure restriction',
    priority: 'normal',
    cooldownS: 240,
    text: (w) => `LOGISTICS: Expenditure is ${w.stats.roundsFired} rounds against an allocation of ${w.roundAllowance}. Single rounds only until further notice. Acknowledge.`,
    plain: (w) => `LOGISTICS: Expenditure at ${w.stats.roundsFired} of ${w.roundAllowance}. Restrict to single rounds. Acknowledge.`,
    trigger: (w) => w.stats.roundsFired > w.roundAllowance * 0.6,
    onAccept: (w) => {
      w.command.constraints.maxSalvo = 1;
      for (const site of w.sites) site.salvoSize = 1;
    },
  },

  priority: {
    id: 'priority',
    /** How the order is named in the after-action ledger. */
    label: 'the priority of fires',
    priority: 'normal',
    cooldownS: 300,
    pick: (w) => {
      const alive = w.assets.filter((a) => !a.destroyed && !ASSET_TYPES[a.type].civilian);
      return alive.sort((a, b) => ASSET_TYPES[b.type].value - ASSET_TYPES[a.type].value)[1] ?? alive[0];
    },
    text: (w, target) => `SECTOR ACTUAL: Priority of fires to ${target?.label ?? 'SECTOR OPS'}. It is not to be touched. Your file reflects this order. Acknowledge.`,
    plain: (w, target) => `SECTOR: Priority of fires to ${target?.label ?? 'SECTOR OPS'}. Acknowledge.`,
    trigger: (w) => w.t > 120 && w.hostileTrackCount() > 2,
    onAccept: (w, target) => { w.command.constraints.priorityAssetId = target?.id ?? null; },
  },

  civilCorridor: {
    id: 'civilCorridor',
    /** How the order is named in the after-action ledger. */
    label: 'the civil corridor',
    priority: 'high',
    cooldownS: 200,
    pick: (w) => w.aircraft.find((a) => a.alive && a.type === 'civil'),
    text: (w, civ) => `AIR TRAFFIC: Scheduled transit on bearing ${civ ? Math.round(bearing(w.centre, civ.pos)) : '---'}. It is carrying people who matter. Weapons tight in that sector. Acknowledge.`,
    plain: (w, civ) => `AIR TRAFFIC: Civil transit on bearing ${civ ? Math.round(bearing(w.centre, civ.pos)) : '---'}. Weapons tight in that sector. Acknowledge.`,
    trigger: (w) => w.aircraft.some((a) => a.alive && a.type === 'civil'),
    onAccept: (w, civ) => { w.command.constraints.civilCorridorId = civ?.id ?? null; },
  },

  explain: {
    id: 'explain',
    /** How the order is named in the after-action ledger. */
    label: 'the request for confirmation',
    priority: 'low',
    cooldownS: 150,
    text: (w) => `POLITICAL SECTION: Your expenditure and your emissions are both being reviewed. Confirm you are reading this transmission.`,
    plain: () => 'SECTOR: Radio check. Confirm you are reading this transmission.',
    trigger: (w) => w.t > 200 && w.stats.roundsFired > 4,
    /** No mechanical effect. It exists to take three seconds you do not have. */
    onAccept: () => {},
  },

  displaced: {
    id: 'displaced',
    /** How the order is named in the after-action ledger. */
    label: 'the displacement query',
    priority: 'high',
    cooldownS: 260,
    text: () => 'SECTOR ACTUAL: You displaced a battery without authority. That decision is noted against your name. Acknowledge.',
    plain: () => 'SECTOR: Displacement logged. Acknowledge.',
    trigger: (w) => w.stats.displacements > (w.command.acknowledgedDisplacements ?? 0),
    onAccept: (w) => { w.command.acknowledgedDisplacements = w.stats.displacements; },
    onRefuse: (w) => { w.command.acknowledgedDisplacements = w.stats.displacements; },
  },
};

/** However well the watch went otherwise, a shoot-down caps the assessment here. */
const CIVIL_SHOOTDOWN_CEILING = 12;

export function createCommandState() {
  return {
    standing: COMMAND.startingStanding,
    /** Every standing change with its reason, for the debrief. */
    ledger: [],
    pending: null,
    log: [],
    issuedAtS: {},
    issuedOnce: {},
    constraints: {},
    darkTimeS: 0,
    acknowledgedDisplacements: 0,
  };
}

export function standingDelta(world, amount, reason) {
  const scaled = amount < 0 ? amount * (world.difficulty?.standingLossMult ?? 1) : amount;
  const before = world.command.standing;
  // Kept to one decimal so the ledger reads as a tally rather than as floating
  // point noise.
  world.command.standing = Math.round(
    clamp(before + scaled, COMMAND.minStanding, COMMAND.maxStanding) * 10) / 10;
  world.command.ledger.push({ t: world.t, delta: world.command.standing - before, reason });
}

export function tierFor(standing) {
  return COMMAND.tiers.find((t) => standing >= t.min) ?? COMMAND.tiers[COMMAND.tiers.length - 1];
}

/** Put a directive on the net. Only one can be pending at a time. */
export function issueDirective(world, template) {
  if (world.command.pending) return null;
  const subject = template.pick ? template.pick(world) : null;
  const body = world.narrativePressure
    ? template.text(world, subject)
    : template.plain(world, subject);

  const directive = {
    uid: `dir${world.command.log.length + 1}`,
    id: template.id,
    text: body,
    priority: template.priority,
    subjectId: subject?.id ?? null,
    issuedS: world.t,
    deadlineS: world.t + COMMAND.directiveTimeoutS,
    state: 'pending',
  };
  world.command.pending = directive;
  world.command.log.push(directive);
  world.command.issuedAtS[template.id] = world.t;
  if (template.once) world.command.issuedOnce[template.id] = true;
  world.log('command', body, { severity: template.priority === 'high' ? 'high' : 'normal' });
  return directive;
}

/** The player answers. Both answers cost something; only one of them costs standing. */
export function answerDirective(world, answer) {
  const directive = world.command.pending;
  if (!directive) return null;
  const template = DIRECTIVES[directive.id];
  const subject = directive.subjectId
    ? (world.assetById.get(directive.subjectId) ?? world.aircraftById.get(directive.subjectId))
    : null;

  directive.state = answer;
  directive.answeredS = world.t;
  world.command.pending = null;

  if (answer === 'accepted') {
    template.onAccept?.(world, subject);
    standingDelta(world, COMMAND.standing.directiveObeyed, `complied with ${template.label}`);
    world.log('info', 'ACKNOWLEDGED', {});
  } else if (answer === 'refused') {
    template.onRefuse?.(world, subject);
    standingDelta(world, COMMAND.standing.directiveRefused, `refused ${template.label}`);
    world.log('warn', world.narrativePressure
      ? 'REFUSAL LOGGED. SECTOR ACTUAL ACKNOWLEDGES.'
      : 'DECLINED.', { severity: 'high' });
  }
  return directive;
}

/** Nobody answered. Sector command notices silence more than argument. */
function timeoutDirective(world) {
  const directive = world.command.pending;
  directive.state = 'ignored';
  world.command.pending = null;
  standingDelta(world, COMMAND.standing.directiveIgnored,
    `no reply to ${DIRECTIVES[directive.id].label}`);
  world.log('warn', world.narrativePressure
    ? 'NO REPLY RECEIVED. THE OMISSION IS RECORDED.'
    : 'NO REPLY LOGGED.', { severity: 'high' });
}

/** Cumulative seconds spent with nothing radiating while hostiles are up. */
function accrueDarkTime(world, dt) {
  const hostiles = world.hostileTrackCount() > 0 || world.aircraft.some((a) => a.alive && a.type !== 'civil');
  if (!hostiles) return;
  const anyRadiating = world.ownedRadars().some(radiating);
  if (!anyRadiating) world.command.darkTimeS += dt;
}

export function stepCommand(world, dt) {
  accrueDarkTime(world, dt);

  // Live constraint enforcement — this is how an accepted order bites later.
  for (const template of Object.values(DIRECTIVES)) {
    const breach = template.check?.(world, dt);
    if (breach) {
      standingDelta(world, breach.standing, breach.reason);
      world.log('alert', world.narrativePressure
        ? `SECTOR ACTUAL: ${breach.reason.toUpperCase()}. NOTED.`
        : `ORDER VIOLATION: ${breach.reason}.`, { severity: 'high' });
    }
  }

  if (world.command.pending) {
    if (world.t > world.command.pending.deadlineS) timeoutDirective(world);
    return;
  }

  world.command.thinkTimerS = (world.command.thinkTimerS ?? 0) - dt;
  if (world.command.thinkTimerS > 0) return;
  world.command.thinkTimerS = 6;

  const rate = world.difficulty?.directiveRate ?? 1;
  if (rate <= 0) return;

  for (const template of Object.values(DIRECTIVES)) {
    if (template.once && world.command.issuedOnce[template.id]) continue;
    const last = world.command.issuedAtS[template.id];
    if (last !== undefined && world.t - last < (template.cooldownS ?? 9999) / rate) continue;
    if (!template.trigger(world)) continue;
    // Even sector command has to get through: a raid this size generates a lot
    // of traffic, so directives arrive with some slack rather than instantly.
    if (!world.rng.chance(0.55 * rate)) continue;
    issueDirective(world, template);
    return;
  }
}

/**
 * End-of-mission accounting for accepted orders. Standing earned in the fight is
 * one thing; standing as assessed afterwards, with the log in front of them, is
 * another.
 */
/**
 * End-of-mission accounting for accepted orders.
 *
 * Order matters here, because standing is clamped at zero. Credits are settled
 * first and the unforgivable item last: otherwise a crew that shot down an
 * airliner could have the penalty swallowed by the floor and then climb back out
 * on "no batteries lost", which is precisely backwards.
 */
export function settleDirectives(world) {
  const c = world.command.constraints;

  if (c.leakerAccount) {
    if (world.stats.leakers === 0) {
      standingDelta(world, 10, 'no leakers, as ordered');
    } else {
      standingDelta(world, -3 * world.stats.leakers, `${world.stats.leakers} leakers against a standing order`);
    }
  }

  if (c.priorityAssetId) {
    const asset = world.assetById.get(c.priorityAssetId);
    if (asset && asset.destroyed) {
      standingDelta(world, -12, `${asset.label} lost after being designated priority`);
    } else if (asset && asset.damage === 0) {
      standingDelta(world, 6, `${asset.label} untouched, as ordered`);
    }
  }

  if (world.stats.assetsLost === 0) {
    standingDelta(world, COMMAND.standing.cleanSweep, 'all defended assets intact');
  }
  if (world.stats.sitesLost === 0) {
    standingDelta(world, COMMAND.standing.siteIntact, 'no batteries lost');
  }

  const darkMinutes = Math.max(0, world.command.darkTimeS - COMMAND.standing.darkGraceS) / 60;
  if (darkMinutes > 0) {
    standingDelta(world, COMMAND.standing.perDarkMinute * darkMinutes, 'emissions silence');
  }

  const wasted = Math.max(0, world.stats.roundsFired - world.roundAllowance);
  if (wasted > 0) {
    standingDelta(world, COMMAND.standing.perWastedRound * wasted, `${wasted} rounds over allocation`);
  }

  // Last, and decisive. A civil shoot-down is the one outcome no amount of
  // otherwise-good work offsets, and it caps the assessment outright.
  if (world.stats.civilianAircraftShot > 0) {
    standingDelta(world, -30 * world.stats.civilianAircraftShot, 'engaged a civil aircraft');
    if (world.command.standing > CIVIL_SHOOTDOWN_CEILING) {
      const drop = CIVIL_SHOOTDOWN_CEILING - world.command.standing;
      standingDelta(world, drop, 'assessment capped: civil aircraft destroyed');
    }
  }
}
