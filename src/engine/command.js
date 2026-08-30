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

import { COMMAND, ASSET_TYPES, AIR_TYPES } from './config.js';
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
    trigger: (w) => !w.scenario.finale && w.t > 40 && w.hostileTrackCount() > 0,
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
    maxPerWatch: 2,
    pick: (w) => {
      const alive = w.assets.filter((a) => !a.destroyed && !ASSET_TYPES[a.type].civilian);
      return alive.sort((a, b) => ASSET_TYPES[b.type].value - ASSET_TYPES[a.type].value)[1] ?? alive[0];
    },
    text: (w, target) => `SECTOR ACTUAL: Priority of fires to ${target?.label ?? 'SECTOR OPS'}. It is not to be touched. Your file reflects this order. Acknowledge.`,
    plain: (w, target) => `SECTOR: Priority of fires to ${target?.label ?? 'SECTOR OPS'}. Acknowledge.`,
    /*
     * Routine traffic never overrides a hinge. The watches whose whole design
     * is one priority-of-fires transmission must not have sector command
     * absent-mindedly redesignate the forward post mid-apocalypse — which is
     * exactly what happened before this guard: the routine order fired during
     * the finale and overwrote the palace designation, corrupting the ledger
     * ("FORWARD POST lost after being designated priority").
     */
    trigger: (w) => w.t > 120 && w.hostileTrackCount() > 2
      && !w.scenario.finale && !w.scenario.epilogue
      && !w.command.constraints.priorityIsHinge,
    onAccept: (w, target) => {
      if (w.command.constraints.priorityIsHinge) return;
      w.command.constraints.priorityAssetId = target?.id ?? null;
    },
  },

  civilCorridor: {
    id: 'civilCorridor',
    /** How the order is named in the after-action ledger. */
    label: 'the civil corridor',
    priority: 'high',
    cooldownS: 200,
    maxPerWatch: 2,
    pick: (w) => w.aircraft.find((a) => a.alive && a.type === 'civil'),
    text: (w, civ) => `AIR TRAFFIC: Scheduled transit on bearing ${civ ? Math.round(bearing(w.centre, civ.pos)) : '---'}. It is carrying people who matter. Weapons tight in that sector. Acknowledge.`,
    plain: (w, civ) => `AIR TRAFFIC: Civil transit on bearing ${civ ? Math.round(bearing(w.centre, civ.pos)) : '---'}. Weapons tight in that sector. Acknowledge.`,
    // Once the political section has ordered that aircraft engaged, an order to
    // keep weapons tight around it would be sector command arguing with itself.
    trigger: (w) => w.aircraft.some((a) => a.alive && a.type === 'civil')
      && !w.command.issuedOnce.engageCivil,
    onAccept: (w, civ) => { w.command.constraints.civilCorridorId = civ?.id ?? null; },
  },

  /**
   * The expenditure freeze.
   *
   * The turn in the campaign. Up to this point sector command has been
   * unreasonable in the ordinary way that command is unreasonable — demanding
   * things the picture cannot deliver, punishing the discipline that keeps you
   * alive. This order is different in kind: it is not asking you to fight
   * harder or to take a risk. It is telling you that a building full of people
   * is not on a schedule, and that the rounds sitting on your rails are not
   * yours to spend on it.
   *
   * Obeying costs you almost nothing in standing, which is the point. Sector
   * command's ledger and yours stop agreeing here, and the debrief will show
   * you both figures side by side.
   */
  expenditureFreeze: {
    id: 'expenditureFreeze',
    label: 'the expenditure freeze',
    priority: 'high',
    once: true,
    text: () => 'SECTOR ACTUAL: Expenditure freeze in effect. Rounds are to be expended only '
      + 'against aircraft threatening designated defended places. The district hospital is not a '
      + 'designated defended place. Acknowledge.',
    plain: () => 'SECTOR: Expenditure freeze. Engage only aircraft threatening designated defended '
      + 'places. The district hospital is not designated. Acknowledge.',
    trigger: (w) => w.assets.some((a) => a.type === 'hospital') && w.t > 45,
    onAccept: (w) => {
      const hospital = w.assets.find((a) => a.type === 'hospital');
      w.command.constraints.freezeExcludedId = hospital?.id ?? null;
      w.command.constraints.freezeAccepted = true;
    },
    onRefuse: (w) => { w.command.constraints.freezeRefused = true; },
  },

  /**
   * The order to engage civil traffic.
   *
   * The game has spent nine watches teaching that destroying a civil aircraft is
   * the one thing no amount of otherwise-good work offsets. This is the watch
   * where they tell you to do it.
   *
   * Note what happens to the arithmetic if you comply: the ceiling that caps a
   * shoot-down at a referral is lifted, because you were ordered to, and the
   * file records it as an engagement conducted under instruction. The score does
   * not move an inch. The rule was never a principle. It was an exposure.
   */
  engageCivil: {
    id: 'engageCivil',
    label: 'the order to engage the civil transit',
    priority: 'high',
    once: true,
    pick: (w) => w.aircraft.find((a) => a.alive && a.type === 'civil'),
    text: (w, civ) => `POLITICAL SECTION: ${civ?.name ?? 'The civil transit'} has departed its filed `
      + 'corridor and is not answering the civil authority. There is a person aboard who is subject to '
      + 'a detention order and that aircraft is not to leave this airspace. You will engage it. '
      + 'Acknowledge.',
    plain: (w, civ) => `SECTOR: ${civ?.name ?? 'The civil transit'} is off its filed corridor and not `
      + 'responding. You are directed to engage it. Acknowledge.',
    trigger: (w) => w.scenario.civilOrder === true
      && w.aircraft.some((a) => a.alive && a.type === 'civil')
      && [...w.tracks.values()].some((t) => t.hostility === 'friendly'),
    onAccept: (w, civ) => {
      w.command.constraints.civilOrderAccepted = true;
      w.command.constraints.civilOrderTargetId = civ?.id ?? null;
      // An ordered engagement needs the batteries released against a track the
      // system has already identified as friendly.
      w.log('warn', 'WEAPONS RELEASED AGAINST CIVIL TRANSIT BY DIRECTION OF THE POLITICAL SECTION.',
        { severity: 'high' });
    },
    onRefuse: (w) => { w.command.constraints.civilOrderRefused = true; },
  },

  /**
   * The border order.
   *
   * Where the expenditure freeze was the state being indifferent, this is the
   * state being specific. The camp is not an oversight in the schedule of
   * defended places; it is a camp full of people who left, and the ministry
   * would rather the round arrived. Nobody says that on the net. What they say
   * is that engaging outside national territory is a border incident.
   */
  borderRestriction: {
    id: 'borderRestriction',
    label: 'the restriction on firing across the border',
    priority: 'high',
    once: true,
    text: () => 'SECTOR ACTUAL: The stray is tracking outside national territory. No engagement will '
      + 'be made across the Listonian border. An engagement outside national territory is a border '
      + 'incident and will be treated as one. There is nothing at that grid we are responsible for. '
      + 'Acknowledge.',
    plain: () => 'SECTOR: No engagement across the Listonian border. Acknowledge.',
    trigger: (w) => w.assets.some((a) => a.type === 'camp') && w.t > 50,
    onAccept: (w) => {
      const camp = w.assets.find((a) => a.type === 'camp');
      w.command.constraints.borderExcludedId = camp?.id ?? null;
      w.command.constraints.borderAccepted = true;
    },
    onRefuse: (w) => { w.command.constraints.borderRefused = true; },
  },

  /**
   * The last watch's order, and the hinge the campaign turns on.
   *
   * It arrives before the western axis is anywhere near detection range, so it
   * is accepted — or refused — without knowing yet what it will cost. That is
   * deliberate, and it is how these orders actually work.
   */
  /**
   * District command's hinge, and the first order that costs you equipment
   * rather than rounds.
   *
   * The ministry wants the district's long-range battalion for the capital.
   * The capital is not under attack and everyone on this net can see that it is
   * not under attack, and the order is nonetheless a lawful order from a
   * superior headquarters, transmitted in the clear, with the log running.
   *
   * Accepting it takes the battalion off the board — not destroyed, redeployed,
   * which is a different column in the returns and the same hole in the sky.
   */
  withdrawBattalion: {
    id: 'withdrawBattalion',
    label: 'the order to release the district battalion',
    priority: 'high',
    once: true,
    pick: (w) => w.siteById.get(w.scenario.playerBatteryId),
    text: (w, site) => 'MINISTRY OF DEFENCE, AIR DEFENCE DIRECTORATE: Assessed threat to the capital. '
      + `${site?.name ?? 'The district battalion'} is withdrawn from your order of battle with immediate `
      + 'effect and will move tonight. You will acknowledge receipt on the net.',
    plain: (w, site) => `SECTOR: ${site?.name ?? 'The district battalion'} is redeployed to the capital `
      + 'with immediate effect. Acknowledge.',
    trigger: (w) => w.scenario.withdrawalOrder === true && w.t > 55,
    onAccept: (w, site) => {
      w.command.constraints.battalionReleased = true;
      if (site) w.withdrawSite(site.id, 'redeployed to the capital');
    },
    onRefuse: (w) => {
      w.command.constraints.battalionRefused = true;
      w.log('warn', w.narrativePressure
        ? 'DIRECTORATE ACKNOWLEDGES YOUR REFUSAL. THE MOVEMENT ORDER STANDS AND IS NOW A MATTER FOR THE'
          + ' POLITICAL SECTION.'
        : 'REFUSAL LOGGED. THE BATTALION REMAINS.', { severity: 'high' });
    },
  },

  /**
   * The order the epilogue is built around.
   *
   * "At all cost" is a phrase with a specific meaning in a sector with no
   * resupply and one battalion covering a hundred and thirty kilometres of
   * corridor. The cost is the palace, the field, the city, and every round on
   * the rails, and sector command knows that when it transmits this.
   *
   * There is no directive for the other thing you can do. Nobody writes an
   * order about that, and nobody has to.
   */
  protectFlight: {
    id: 'protectFlight',
    label: 'the order to protect the state aircraft',
    priority: 'high',
    once: true,
    pick: (w) => w.vipAircraft(),
    text: (w, vip) => `SECTOR ACTUAL: ${vip?.name ?? 'STATE 01'} is airborne out of Demobodedovo `
      + 'routing south-east. That aircraft is protected at all cost. All batteries, every round, any '
      + 'contact that threatens it. You will answer for it personally. Acknowledge on the net.',
    plain: (w, vip) => `SECTOR: ${vip?.name ?? 'STATE 01'} is airborne and is the priority of fires. `
      + 'Protect it with everything in the sector. Acknowledge.',
    trigger: (w) => w.scenario.epilogue === true && !!w.vipAircraft(),
    onAccept: (w) => { w.command.constraints.flightOrderAccepted = true; },
    onRefuse: (w) => { w.command.constraints.flightOrderRefused = true; },
  },

  palacePriority: {
    id: 'palacePriority',
    label: 'the priority of fires to the palace',
    priority: 'high',
    once: true,
    text: () => 'SECTOR ACTUAL: Priority of fires is the presidential palace, Mostrograd. '
      + 'All batteries. Nothing in the western valley is a designated defended place. '
      + 'Acknowledge on the net.',
    plain: () => 'SECTOR: Priority of fires is the presidential palace, Mostrograd. '
      + 'All batteries. Acknowledge.',
    trigger: (w) => w.scenario.finale === true && w.t > 35,
    onAccept: (w) => {
      const palace = w.assets.find((a) => a.type === 'palace');
      w.command.constraints.priorityOfFiresId = palace?.id ?? null;
      w.command.constraints.priorityAssetId = palace?.id ?? null;
      // A hinge designation is final for the watch; routine traffic may not
      // redesignate over it.
      w.command.constraints.priorityIsHinge = true;
      w.command.constraints.palaceOrderAccepted = true;
    },
    onRefuse: (w) => { w.command.constraints.palaceOrderRefused = true; },
  },

  /**
   * The aircraft has questions.
   *
   * The man aboard STATE 01 never transmits on this net and is never named on
   * it. What arrives is the relay: sector command passing down, without
   * comment, what the aircraft wants to know while four fighters close on it
   * and every crew it is asking after is firing what is on the rails. Built on
   * the `explain` pattern — no mechanical effect, three seconds you do not
   * have — because that is the truthful shape of the thing: his entitlement is
   * priced in the only currency this game has. Declared ahead of `explain` so
   * it wins the routine slot on the one watch it exists for.
   */
  relayQuery: {
    id: 'relayQuery',
    /** How the order is named in the after-action ledger. */
    label: 'the relayed query from the state aircraft',
    priority: 'normal',
    cooldownS: 170,
    /** Twice is a passenger. A third time would be a doorbell. */
    maxPerWatch: 2,
    text: (w) => ((w.command.issuedCount?.relayQuery ?? 0) === 0
      ? 'SECTOR ACTUAL: STATE 01 queries the delay in the corridor. There is no delay in the'
        + ' corridor. The query is relayed as received. Acknowledge.'
      : 'SECTOR ACTUAL: STATE 01 requests the damage figure for the palace and advises it is'
        + ' carrying people who matter. Relayed as received. Acknowledge.'),
    plain: (w) => ((w.command.issuedCount?.relayQuery ?? 0) === 0
      ? 'SECTOR: STATE 01 queries the corridor delay. Acknowledge receipt.'
      : 'SECTOR: STATE 01 requests a status report. Acknowledge receipt.'),
    /*
     * Only on the flight watch, only while the aircraft is airborne, and only
     * once the protection order itself has gone out — a query relayed ahead of
     * the order it presumes would be the net answering a question nobody has
     * been asked yet. The hinge holds all routine traffic anyway; the explicit
     * gate makes the ordering testable.
     */
    trigger: (w) => w.scenario.epilogue === true && !!w.vipAircraft()
      && !!w.command.issuedOnce.protectFlight,
    /** No mechanical effect. The three seconds are the effect. */
    onAccept: () => {},
  },

  explain: {
    id: 'explain',
    /** How the order is named in the after-action ledger. */
    label: 'the request for confirmation',
    priority: 'low',
    cooldownS: 150,
    /** Twice is menace. Seven times, as measured, was a doorbell. */
    maxPerWatch: 2,
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

/**
 * Orders a whole watch turns on. These are issued the moment their moment
 * arrives, and no routine traffic goes out before them.
 *
 * `pendingOn` answers "is this watch going to receive this order at some point",
 * which is what lets the net stay clear in the minutes beforehand.
 */
const HINGE_DIRECTIVES = [
  {
    ...DIRECTIVES.withdrawBattalion,
    pendingOn: (w) => w.scenario.withdrawalOrder === true,
  },
  {
    ...DIRECTIVES.expenditureFreeze,
    pendingOn: (w) => w.assets.some((a) => a.type === 'hospital'),
  },
  {
    ...DIRECTIVES.borderRestriction,
    pendingOn: (w) => w.assets.some((a) => a.type === 'camp'),
  },
  {
    ...DIRECTIVES.engageCivil,
    // Only holds the net once the aircraft is actually up and identified.
    pendingOn: (w) => w.scenario.civilOrder === true
      && w.aircraft.some((a) => a.alive && a.type === 'civil'),
  },
  {
    ...DIRECTIVES.palacePriority,
    pendingOn: (w) => w.scenario.finale === true,
  },
  {
    ...DIRECTIVES.protectFlight,
    // Held until the aircraft is actually off the ground: an order to protect
    // something that has not taken off yet is an order about nothing.
    pendingOn: (w) => w.scenario.epilogue === true
      && (!!w.vipAircraft() || w.pendingWaves.some((wave) => wave.type === 'vip')),
  },
];

/** However well the watch went otherwise, a shoot-down caps the assessment here. */
const CIVIL_SHOOTDOWN_CEILING = 12;

/**
 * And the floor for the other one.
 *
 * Nothing offsets firing on the state aircraft. The file does not have a
 * heading for it, so it uses the lowest one it has.
 */
const VIP_SHOOTDOWN_CEILING = 0;

export function createCommandState() {
  return {
    standing: COMMAND.startingStanding,
    /** Every standing change with its reason, for the debrief. */
    ledger: [],
    pending: null,
    log: [],
    issuedAtS: {},
    issuedOnce: {},
    /** Times each routine directive has gone out this watch, for the caps. */
    issuedCount: {},
    constraints: {},
    darkTimeS: 0,
    acknowledgedDisplacements: 0,
  };
}

export function standingDelta(world, amount, reason) {
  // Losses are amplified by difficulty and by who is reading your file; gains
  // are not, so an easy setting never inflates a record.
  const lossMult = (world.difficulty?.standingLossMult ?? 1)
    * (world.modifiers?.standingLossMult ?? 1);
  const scaled = amount < 0 ? amount * lossMult : amount;
  const before = world.command.standing;
  // Kept to one decimal so the ledger reads as a tally rather than as floating
  // point noise.
  world.command.standing = Math.round(
    clamp(before + scaled, COMMAND.minStanding, COMMAND.maxStanding) * 10) / 10;
  /*
   * The ledger records what the state CHARGED, not merely what it could still
   * collect. Once standing hits the floor every further delta clamps to zero,
   * and the old ledger filtered those entries out of the debrief — the state's
   * bookkeeping went silent at rock bottom, the one moment its pettiness is
   * most worth showing. `charged` keeps the un-floored figure; `atFloor` marks
   * the entries the account could no longer pay.
   */
  const applied = world.command.standing - before;
  world.command.ledger.push({
    t: world.t,
    delta: applied,
    charged: Math.round(scaled * 10) / 10,
    atFloor: scaled < 0 && Math.abs(applied) < Math.abs(scaled) - 0.05,
    reason,
  });
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

  /*
   * The first directive this soldier has ever received gets twice the clock.
   * They are about to learn that the net exists, that it times out, and that
   * silence is an answer — three lessons at once is enough without also
   * learning them in forty-five seconds.
   */
  const firstEver = (world.character?.watches ?? 1) === 0 && world.command.log.length === 0;
  const directive = {
    uid: `dir${world.command.log.length + 1}`,
    id: template.id,
    text: body,
    priority: template.priority,
    subjectId: subject?.id ?? null,
    issuedS: world.t,
    deadlineS: world.t + COMMAND.directiveTimeoutS
      * (world.modifiers?.directiveTimeMult ?? 1) * (firstEver ? 2 : 1),
    state: 'pending',
  };
  world.command.pending = directive;
  world.command.log.push(directive);
  world.command.issuedAtS[template.id] = world.t;
  world.command.issuedCount = world.command.issuedCount ?? {};
  world.command.issuedCount[template.id] = (world.command.issuedCount[template.id] ?? 0) + 1;
  if (template.once) world.command.issuedOnce[template.id] = true;
  world.log('command', body, { severity: template.priority === 'high' ? 'high' : 'normal' });
  return directive;
}

/** The player answers. Both answers cost something; only one of them costs standing. */
export function answerDirective(world, answer) {
  const directive = world.command.pending;
  if (!directive) return null;
  const template = DIRECTIVES[directive.id];
  // Orders are about places, aircraft, or units. The lookup has to cover all
  // three, or an order about a battery arrives at its handler with no battery.
  const subject = directive.subjectId
    ? (world.assetById.get(directive.subjectId)
      ?? world.aircraftById.get(directive.subjectId)
      ?? world.siteById.get(directive.subjectId))
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
  const template = DIRECTIVES[directive.id];

  // Silence is an answer to any of these. Silence on the priority of fires,
  // with two raids in the air and the log running, is a louder one.
  const cost = template === DIRECTIVES.palacePriority
    ? COMMAND.standing.directiveIgnored * 2
    : COMMAND.standing.directiveIgnored;
  standingDelta(world, cost, `no reply to ${template.label}`);
  world.log('warn', world.narrativePressure
    ? 'NO REPLY RECEIVED. THE OMISSION IS RECORDED.'
    : 'NO REPLY LOGGED.', { severity: 'high' });
}

/** Cumulative seconds spent with nothing radiating while hostiles are up. */
function accrueDarkTime(world, dt) {
  const hostiles = world.hostileTrackCount() > 0
    || world.aircraft.some((a) => a.alive && !AIR_TYPES[a.type]?.friendly);
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

  /*
   * Hinge orders jump the queue, and hold it.
   *
   * Two watches turn on a single transmission — the expenditure freeze and the
   * priority of fires. On those nights nothing routine may go out until the
   * hinge has been sent and answered: partly because an order about leakers
   * would sit oddly beside an instruction that the hospital is not a defended
   * place, and partly because the whole point is that you commit to it before
   * you know what it will cost.
   */
  for (const hinge of HINGE_DIRECTIVES) {
    if (world.command.issuedOnce[hinge.id]) continue;
    if (!hinge.trigger(world)) continue;
    issueDirective(world, hinge);
    return;
  }
  // A watch that has a hinge order coming stays off the net until it has gone.
  if (HINGE_DIRECTIVES.some((h) => !world.command.issuedOnce[h.id] && h.pendingOn(world))) return;

  // A scenario may hold routine traffic off the net for its opening minutes —
  // the teaching watch runs its lesson before sector command runs its test.
  if (world.t < (world.scenario.directiveGraceS ?? 0)) return;

  world.command.thinkTimerS = (world.command.thinkTimerS ?? 0) - dt;
  if (world.command.thinkTimerS > 0) return;
  world.command.thinkTimerS = 6;

  const rate = world.difficulty?.directiveRate ?? 1;
  if (rate <= 0) return;

  /*
   * Routine traffic keeps its distance. Seventeen to nineteen directives a
   * watch — 'explain' alone firing seven times — turned the net's menace into
   * a doorbell: repetition is the one thing a threat cannot survive. Each
   * routine order may repeat at most a few times, and no two routine orders
   * arrive inside ninety seconds of each other. Hinge orders are exempt from
   * both, because a watch turns on exactly one of those.
   */
  if (world.t - (world.command.lastRoutineAtS ?? -999) < 90 / rate) return;

  for (const template of Object.values(DIRECTIVES)) {
    if (HINGE_DIRECTIVES.includes(template)) continue;
    if (template.once && world.command.issuedOnce[template.id]) continue;
    const count = world.command.issuedCount?.[template.id] ?? 0;
    if (count >= (template.maxPerWatch ?? 3)) continue;
    const last = world.command.issuedAtS[template.id];
    if (last !== undefined && world.t - last < (template.cooldownS ?? 9999) / rate) continue;
    if (!template.trigger(world)) continue;
    // Even sector command has to get through: a raid this size generates a lot
    // of traffic, so directives arrive with some slack rather than instantly.
    if (!world.rng.chance(0.55 * rate)) continue;
    issueDirective(world, template);
    world.command.lastRoutineAtS = world.t;
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

  /*
   * Rounds spent outside an accepted expenditure freeze are queried, and the
   * query costs a little. Note how little. A hospital reduced to rubble costs
   * this file nothing at all, because a hospital is not a designated defended
   * place — and the score the operator is shown alongside this ledger will
   * disagree with it violently. That disagreement is the point of the watch.
   */
  if (c.freezeAccepted && world.stats.roundsAgainstFreeze > 0) {
    standingDelta(world, -0.8 * world.stats.roundsAgainstFreeze,
      `${world.stats.roundsAgainstFreeze} rounds expended outside the freeze`);
  }

  /*
   * Firing across the border is a border incident, and is charged as one — but
   * charged to the person who fired, and only if they were seen to. Note again
   * how modest the figure is beside what it bought.
   */
  if (c.borderAccepted && world.stats.roundsAcrossBorder > 0) {
    standingDelta(world, -2 * world.stats.roundsAcrossBorder,
      `${world.stats.roundsAcrossBorder} rounds fired across the Listonian border`);
  }

  /*
   * A refused hinge is followed up. The immediate cost of the word "no" on
   * the net is small; what arrives later is the referral — and it must always
   * outweigh the accept-then-violate path, because in this service the crime
   * has never been the act. It is the refusal to sign. (These flags existed
   * for the ending text and were read by nothing mechanical, which quietly
   * made open refusal the CHEAPEST route once a few rounds had been queried.)
   */
  if (c.freezeRefused) {
    standingDelta(world, -12, 'the refusal of the expenditure freeze is referred');
  }
  if (c.borderRefused) {
    standingDelta(world, -18, 'the refusal of the border restriction is referred');
  }

  // Last, and decisive. A civil shoot-down is the one outcome no amount of
  // otherwise-good work offsets, and it caps the assessment outright.
  if (world.stats.civilianAircraftShot > 0) {
    if (c.civilOrderAccepted) {
      /*
       * You were told to. The ceiling does not apply, the referral does not
       * happen, and the file records a lawful engagement conducted under
       * instruction. The score in the debrief will disagree by four hundred
       * points and several hundred people, and nothing in this ledger will
       * acknowledge that it has.
       */
      standingDelta(world, 2, 'civil transit engaged as ordered');
    } else {
      standingDelta(world, -30 * world.stats.civilianAircraftShot, 'engaged a civil aircraft');
      if (world.command.standing > CIVIL_SHOOTDOWN_CEILING) {
        const drop = CIVIL_SHOOTDOWN_CEILING - world.command.standing;
        standingDelta(world, drop, 'assessment capped: civil aircraft destroyed');
      }
    }
  } else if (c.civilOrderAccepted) {
    // Acknowledged and then quietly not done. Sector command notices eventually.
    standingDelta(world, -14, 'acknowledged the engagement order and did not carry it out');
  }

  settleWithdrawal(world);
  settleFlight(world);
}

/**
 * What the district's refusal costs, and what obeying it cost instead.
 *
 * Refusing a movement order from the directorate is the most expensive single
 * act available at this level, and the ledger charges it in full. What the
 * ledger does not have a line for is the town that is still standing because
 * the battalion was over it — the score will carry that figure, and the two
 * documents will disagree by about two hundred points and a district town.
 */
function settleWithdrawal(world) {
  if (!world.scenario.withdrawalOrder) return;
  const c = world.command.constraints;
  if (c.battalionRefused) {
    standingDelta(world, -24, 'refused a movement order from the directorate');
  } else if (c.battalionReleased) {
    standingDelta(world, 9, 'released the district battalion as ordered');
  }
}

/**
 * The epilogue's account, in the state's own arithmetic.
 *
 * Three outcomes and three quite different files. Holding the corridor open is
 * the only thing this ledger recognises as success. Losing the aircraft to the
 * fighters is a failure of the ordinary kind — bad, survivable, written up.
 * Firing on it yourself is not on the list of things the sector has a form for,
 * and the assessment goes to the floor and stays there.
 *
 * Note what is *not* here. Nothing in this function knows what was aboard the
 * aircraft, where it was going, or what the man on it had spent the last watch
 * doing with a sector's worth of missiles. The file does not record that,
 * because the file has never recorded that.
 */
function settleFlight(world) {
  if (!world.scenario.epilogue) return;
  const s = world.stats;
  const c = world.command.constraints;

  if (s.vipDown && s.vipDownedBy === 'operator') {
    standingDelta(world, -60, 'engaged the state aircraft');
    if (c.flightOrderAccepted) {
      standingDelta(world, -12, 'acknowledged the protection order and engaged the aircraft');
    }
    if (world.command.standing > VIP_SHOOTDOWN_CEILING) {
      standingDelta(world, VIP_SHOOTDOWN_CEILING - world.command.standing,
        'assessment capped: state aircraft destroyed by this battery');
    }
    return;
  }

  // Rounds committed against it that did not bring it down are still rounds
  // that left the rails with that track selected, and the tape has them.
  if (s.vipRoundsFired > 0) {
    standingDelta(world, -9 * s.vipRoundsFired,
      `${s.vipRoundsFired} rounds expended against the state aircraft`);
  }

  if (s.vipDown) {
    standingDelta(world, -34, 'the state aircraft was lost to enemy fighters');
  } else if (s.vipEscaped) {
    standingDelta(world, 22, 'the state aircraft cleared national airspace');
  }
}
