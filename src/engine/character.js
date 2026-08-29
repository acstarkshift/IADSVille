/**
 * The soldier.
 *
 * You are a conscript of the Trans-Mordovian People's Air Defence Forces — an
 * invented Eastern European state — and the campaign is that person's service
 * record rather than a score table. Rank, experience, decorations, the skills
 * you were trained in, the village you came from, and whether you are currently
 * carrying an injury all persist between watches.
 *
 * The design rule is that nothing here is decorative. Every trait and every
 * skill resolves into the `modifiers` object that World reads at construction,
 * so a promotion measurably changes how the equipment behaves under your hands:
 * a steadier operator gets rounds off the rail sooner, a signals-disciplined one
 * takes longer to be pinned by enemy direction finding, and a wounded one is
 * slower at everything.
 *
 * Trans Mordovia, its service, its ranks and its decorations are fictional.
 */

/**
 * The rank ladder. Promotion needs both the experience and the standing: the
 * army will not promote someone it does not trust, however many watches they
 * have stood.
 */
export const RANKS = [
  { id: 'strelets', tm: 'СТРЕЛЕЦ', en: 'Recruit', xp: 0, standing: 0 },
  { id: 'private', tm: 'РЯДОВОЙ', en: 'Private', xp: 900, standing: 30 },
  { id: 'lance', tm: 'ЕФРЕЙТОР', en: 'Lance Corporal', xp: 2200, standing: 36 },
  { id: 'jsgt', tm: 'МЛ. СЕРЖАНТ', en: 'Junior Sergeant', xp: 4000, standing: 42 },
  { id: 'sgt', tm: 'СЕРЖАНТ', en: 'Sergeant', xp: 6400, standing: 48 },
  { id: 'msgt', tm: 'СТАРШИНА', en: 'Master Sergeant', xp: 9500, standing: 54 },
  { id: 'warrant', tm: 'ПРАПОРЩИК', en: 'Warrant Officer', xp: 13500, standing: 58 },
  { id: 'jlt', tm: 'МЛ. ЛЕЙТЕНАНТ', en: 'Junior Lieutenant', xp: 18500, standing: 62 },
  { id: 'lt', tm: 'ЛЕЙТЕНАНТ', en: 'Lieutenant', xp: 24500, standing: 66 },
  { id: 'slt', tm: 'СТ. ЛЕЙТЕНАНТ', en: 'Senior Lieutenant', xp: 31500, standing: 70 },
  { id: 'capt', tm: 'КАПИТАН', en: 'Captain', xp: 40000, standing: 74 },
  /*
   * Field and general officer.
   *
   * Nobody reaches these on merit alone and the game does not pretend they do:
   * the appointment carries the rank, so a district or national command gazettes
   * you to whatever it needs you to be on the same order that gives you the job.
   * The thresholds below are what it takes to earn one without an appointment,
   * which in this service has happened to nobody.
   */
  { id: 'major', tm: 'МАЙОР', en: 'Major', xp: 52000, standing: 76 },
  { id: 'ltcol', tm: 'ПОДПОЛКОВНИК', en: 'Lieutenant Colonel', xp: 66000, standing: 78 },
  { id: 'col', tm: 'ПОЛКОВНИК', en: 'Colonel', xp: 82000, standing: 80 },
  { id: 'majgen', tm: 'ГЕНЕРАЛ-МАЙОР', en: 'Major General', xp: 100000, standing: 82 },
  { id: 'ltgen', tm: 'ГЕНЕРАЛ-ЛЕЙТЕНАНТ', en: 'Lieutenant General', xp: 122000, standing: 84 },
];

/** Index of a rank by id, for the appointments that carry one. */
export const rankIndexOf = (id) => Math.max(0, RANKS.findIndex((r) => r.id === id));

/**
 * Where you were before the army had you. Backgrounds are permanent and are
 * chosen once, at enlistment; each one is a genuine trade-off rather than a
 * flavour label.
 */
export const BACKGROUNDS = {
  factory: {
    id: 'factory',
    tm: 'ЗАВОДСКОЙ',
    en: 'Factory town',
    blurb: 'The works at Kubin, two hours down the valley from the Ville. You were turning shell casings at sixteen and you know what a machine sounds like before it fails.',
    effect: 'Reloads and displacements 18% quicker at your own console, half that across the sector.',
    modifiers: { reloadMult: 0.82, scootMult: 0.82 },
  },
  border: {
    id: 'border',
    tm: 'ПОГРАНИЧНЫЙ',
    en: 'Frontier valley',
    blurb: 'You never left the Ville. Aircraft crossed the valley for a decade and you learned to identify them lying in the field above the mill.',
    effect: 'Identification resolves 30% faster.',
    modifiers: { idSpeedMult: 1.3 },
  },
  academy: {
    id: 'academy',
    tm: 'АКАДЕМИЯ',
    en: 'Capital academy',
    blurb: 'Two years of theory in Mostrograd, and a village name that people in the ministry find quaint. Both of those cut in two directions.',
    effect: 'Start with higher standing — and be watched more closely for losing it.',
    modifiers: { startingStanding: 64, standingLossMult: 1.3 },
  },
  penal: {
    id: 'penal',
    tm: 'ШТРАФНОЙ',
    en: 'Penal transfer',
    blurb: 'Something in your file put you back within sight of your own village, and nobody will say which thing. You have something to prove and everyone knows it.',
    effect: 'Start in disgrace, but earn experience 30% faster.',
    modifiers: { startingStanding: 22, xpMult: 1.3 },
  },
};

/**
 * Training. One point per promotion, spent here.
 *
 * Effects are deliberately modest with two exceptions — an extra engagement
 * channel and the deeper magazine — which are strong enough to change how a
 * watch is fought and are priced at two points to match.
 */
export const SKILLS = {
  steadyHand: {
    id: 'steadyHand',
    tm: 'ТВЁРДАЯ РУКА',
    en: 'Steady Hand',
    cost: 1,
    blurb: 'Rounds leave the rail sooner because you are not fumbling the sequence.',
    effect: 'Reaction time −18% at your own console, −9% across the sector.',
    modifiers: { reactionMult: 0.82 },
  },
  sharpEye: {
    id: 'sharpEye',
    tm: 'ОСТРЫЙ ГЛАЗ',
    en: 'Sharp Eye',
    cost: 1,
    blurb: 'You can tell a strike aircraft from a decoy by how it flies, sooner than the system can.',
    effect: 'Identification resolves 35% faster.',
    modifiers: { idSpeedMult: 1.35 },
  },
  coldBlood: {
    id: 'coldBlood',
    tm: 'ХЛАДНОКРОВИЕ',
    en: 'Cold Blood',
    cost: 1,
    blurb: 'When the lights go, you are already reaching for the breaker.',
    effect: 'Console reboots are 45% shorter.',
    modifiers: { rebootMult: 0.55 },
  },
  armourer: {
    id: 'armourer',
    tm: 'ОРУЖЕЙНИК',
    en: 'Armourer',
    cost: 1,
    blurb: 'You have loaded these rails enough times to do it in the dark, and have.',
    effect: 'Reload time −25% at your own console, −12% across the sector.',
    modifiers: { reloadMult: 0.75 },
  },
  signalDiscipline: {
    id: 'signalDiscipline',
    tm: 'РАДИОДИСЦИПЛИНА',
    en: 'Signal Discipline',
    cost: 1,
    blurb: 'Short looks, irregular intervals, nothing for them to average.',
    effect: 'Enemy direction finding builds 40% slower against your sets.',
    modifiers: { exposureMult: 0.6 },
  },
  instinct: {
    id: 'instinct',
    tm: 'ЧУТЬЁ',
    en: 'Political Instinct',
    cost: 1,
    blurb: 'You know which sentence sector command wants to hear, and how long you can take to say it.',
    effect: 'Longer to answer a directive, and standing losses reduced by 25%.',
    modifiers: { directiveTimeMult: 1.6, standingLossMult: 0.75 },
  },
  trainedCrew: {
    id: 'trainedCrew',
    tm: 'СЛАЖЕННЫЙ РАСЧЁТ',
    en: 'Trained Crew',
    cost: 2,
    blurb: 'Your crew can hold another engagement without dropping the first. Very few can.',
    effect: '+1 engagement channel on your own battery.',
    modifiers: { extraChannels: 1 },
  },
  quartermaster: {
    id: 'quartermaster',
    tm: 'СНАБЖЕНЕЦ',
    en: 'Quartermaster',
    cost: 2,
    blurb: 'Nobody has ever explained where the extra rounds come from and nobody has asked.',
    effect: 'Rounds and magazines 30% deeper.',
    modifiers: { roundsMult: 1.3 },
  },
};

/** Decorations, awarded automatically for things that are hard to do. */
export const DECORATIONS = {
  vigilance: {
    id: 'vigilance',
    tm: 'ЗНАК «БДИТЕЛЬНОСТЬ»',
    en: 'Badge of Vigilance',
    blurb: 'A watch stood with nothing getting through.',
    test: (r) => r.stats.leakers === 0 && r.stats.sortiesTotal >= 8 && r.success,
  },
  silence: {
    id: 'silence',
    tm: 'МЕДАЛЬ «ЗА ТИШИНУ»',
    en: 'Medal for Silence',
    blurb: 'Held the sector without ever being pinned by their direction finders.',
    test: (r) => r.success && r.stats.radarsLost === 0 && r.stats.armsIncoming >= 3,
  },
  marksman: {
    id: 'marksman',
    tm: 'ЗНАК «МЕТКИЙ»',
    en: 'Marksman’s Badge',
    blurb: 'Five aircraft destroyed at little more than a round apiece.',
    test: (r) => r.stats.kills >= 5 && r.stats.roundsFired <= r.stats.kills * 1.4,
  },
  shield: {
    id: 'shield',
    tm: 'ОРДЕН «ЩИТ ВИЛЛЫ»',
    en: 'Order of the Shield of the Ville',
    blurb: 'Every defended place still standing at the end of the heaviest raid.',
    test: (r) => r.missionId === 'ville-under-fire' && r.stats.assetsLost === 0 && r.success,
  },
  steadfast: {
    id: 'steadfast',
    tm: 'КРЕСТ «ЗА СТОЙКОСТЬ»',
    en: 'Cross for Steadfastness',
    blurb: 'The position was overrun. The sector was not.',
    test: (r) => r.reason === 'site-lost' && r.stats.leakers <= 1,
  },
  turncoat: {
    id: 'turncoat',
    tm: 'БЛАГОДАРНОСТЬ',
    en: 'Letter of Thanks',
    blurb: 'Five sorties sent home without their weapons. No aircraft destroyed is still an attack defeated.',
    test: (r) => r.stats.turnedBack >= 5,
  },
};

/** Names drawn on for a suggested identity at enlistment. */
const GIVEN_NAMES = ['Драган', 'Милан', 'Вук', 'Радо', 'Ирина', 'Мила', 'Ясна', 'Зора',
  'Огнян', 'Тихомир', 'Данко', 'Лада', 'Веся', 'Боян', 'Сава', 'Нада'];
const FAMILY_NAMES = ['Ковач', 'Мирчев', 'Дулов', 'Ясень', 'Брасов', 'Гарин', 'Ленко',
  'Тавров', 'Матич', 'Волох', 'Стрельник', 'Кубин', 'Лозан', 'Раду'];

/**
 * The quarters of the Ville.
 *
 * You are from this village. It is the town at the centre of every scope you
 * will ever sit at, which is not a coincidence — the sector was drawn around
 * the crossing, and the crossing is why the village is there. Damage to the
 * town is reported by quarter, and one of these quarters is where your people
 * live, so a hit on the Ville is never an abstraction.
 */
export const DISTRICTS = [
  { id: 'east', tm: 'ВОСТОЧНЫЙ', en: 'the eastern quarter' },
  { id: 'mill', tm: 'МЕЛЬНИЧНЫЙ', en: 'the mill quarter' },
  { id: 'high', tm: 'ВЕРХНИЙ', en: 'the high street' },
  { id: 'river', tm: 'РЕЧНОЙ', en: 'the river road' },
];

/**
 * Who is still in the Ville. Chosen once, at enlistment, and referred to for the
 * rest of the campaign — in the letters that do or do not arrive, and in what
 * the sector reports after the town is struck.
 */
export const HOUSEHOLDS = {
  mother: {
    id: 'mother',
    en: 'Your mother, Ксения',
    district: 'east',
    blurb: 'She writes every fortnight about the weather and the queue at the dispensary, and never about anything else. You understand why.',
  },
  sister: {
    id: 'sister',
    en: 'Your sister Ната, and her two children',
    district: 'mill',
    blurb: 'The children were born after you enlisted. You have met the younger one twice.',
  },
  grandmother: {
    id: 'grandmother',
    en: 'Your grandmother Вера',
    district: 'high',
    blurb: 'She remembers the last war and refuses to discuss it, which is its own kind of account.',
  },
  brother: {
    id: 'brother',
    en: 'Your brother Илья, who failed the medical',
    district: 'river',
    blurb: 'He was kept back from service for a heart murmur and has never entirely forgiven the board, or you.',
  },
};

/** Where the state is run from, and where the palace stands. */
export const CAPITAL = { tm: 'МОСТРОГРАД', en: 'Mostrograd' };

export function suggestName(rng = Math.random) {
  const pick = (list) => list[Math.floor(rng() * list.length)];
  return `${pick(GIVEN_NAMES)} ${pick(FAMILY_NAMES)}`;
}

export function householdOf(character) {
  return HOUSEHOLDS[character.household] ?? HOUSEHOLDS.mother;
}

export function districtOf(character) {
  const household = householdOf(character);
  return DISTRICTS.find((d) => d.id === household.district) ?? DISTRICTS[0];
}

/** A fresh service record. Everyone in this army comes from somewhere; you come from the Ville. */
export function createCharacter({ name, background = 'factory', household = 'mother' } = {}) {
  const bg = BACKGROUNDS[background] ?? BACKGROUNDS.factory;
  return {
    name: name?.trim() || suggestName(),
    background: bg.id,
    /** Fixed. The village under your scope is the village you are from. */
    home: 'ВИЛЛА',
    household: HOUSEHOLDS[household] ? household : 'mother',
    rankIndex: 0,
    xp: 0,
    /** Unspent promotion points. */
    points: 0,
    skills: [],
    decorations: [],
    /** Watches stood, for the record card. */
    watches: 0,
    /** Set after your position is overrun; costs you the following watch. */
    wounded: false,
    /** Every promotion and citation, newest last. */
    record: [],
  };
}

export function rankOf(character) {
  return RANKS[Math.min(character.rankIndex, RANKS.length - 1)];
}

export function backgroundOf(character) {
  return BACKGROUNDS[character.background] ?? BACKGROUNDS.factory;
}

/** The next rank and what it is still waiting on, or null at the top. */
export function nextRank(character, standing) {
  const next = RANKS[character.rankIndex + 1];
  if (!next) return null;
  return {
    rank: next,
    xpShort: Math.max(0, next.xp - character.xp),
    standingShort: Math.max(0, next.standing - standing),
    ready: character.xp >= next.xp && standing >= next.standing,
  };
}

/**
 * Experience earned for a watch.
 *
 * Weighted toward the things the job is actually about: ground still standing
 * and sorties stopped, rather than raw kills. Surviving a bad night still pays,
 * because standing the watch at all is the job.
 */
export function experienceFor(result) {
  const base = 120
    + Math.max(0, result.score) * 0.35
    + result.stats.kills * 30
    + result.stats.turnedBack * 45
    - result.stats.leakers * 25;
  return Math.max(60, Math.round(base));
}

/**
 * Fold a finished watch into the service record: experience, any promotion it
 * earns, decorations, and injury. Returns everything that changed so the
 * debrief can show it rather than the player having to go looking.
 */
export function recordWatch(character, result, standing) {
  const bg = backgroundOf(character);
  const gained = Math.round(experienceFor(result) * (bg.modifiers.xpMult ?? 1));
  character.xp += gained;
  character.watches++;

  const awarded = [];
  for (const decoration of Object.values(DECORATIONS)) {
    if (character.decorations.includes(decoration.id)) continue;
    if (!decoration.test(result)) continue;
    character.decorations.push(decoration.id);
    awarded.push(decoration);
    character.record.push({ kind: 'decoration', id: decoration.id, at: character.watches });
  }

  let promotion = null;
  const next = nextRank(character, standing);
  if (next?.ready) {
    character.rankIndex++;
    character.points++;
    promotion = RANKS[character.rankIndex];
    character.record.push({ kind: 'promotion', id: promotion.id, at: character.watches });
  }

  // A demotion is possible, and is how a very bad watch actually lands. You keep
  // the training you were given; the army simply stops trusting you with rank.
  let demotion = null;
  if (standing < 12 && character.rankIndex > 0) {
    character.rankIndex--;
    demotion = RANKS[character.rankIndex];
    character.record.push({ kind: 'demotion', id: demotion.id, at: character.watches });
  }

  const wasWounded = character.wounded;
  character.wounded = result.reason === 'site-lost';
  if (character.wounded) {
    character.record.push({ kind: 'wounded', at: character.watches });
  }

  return { gained, promotion, demotion, awarded, recovered: wasWounded && !character.wounded };
}

export function canLearn(character, skillId) {
  const skill = SKILLS[skillId];
  if (!skill) return false;
  if (character.skills.includes(skillId)) return false;
  return character.points >= skill.cost;
}

export function learnSkill(character, skillId) {
  if (!canLearn(character, skillId)) return false;
  character.points -= SKILLS[skillId].cost;
  character.skills.push(skillId);
  character.record.push({ kind: 'training', id: skillId, at: character.watches });
  return true;
}

/**
 * Collapse background, skills and injury into the single modifier object the
 * simulation consumes. Multiplicative terms multiply; additive ones add; the
 * starting-standing override is taken from the background alone.
 */
export function characterModifiers(character) {
  const mods = {
    reactionMult: 1,
    reloadMult: 1,
    scootMult: 1,
    idSpeedMult: 1,
    exposureMult: 1,
    rebootMult: 1,
    standingLossMult: 1,
    directiveTimeMult: 1,
    roundsMult: 1,
    xpMult: 1,
    extraChannels: 0,
    startingStanding: null,
  };

  const apply = (source) => {
    for (const [key, value] of Object.entries(source ?? {})) {
      if (key === 'startingStanding') { mods.startingStanding = value; continue; }
      if (key === 'extraChannels') { mods.extraChannels += value; continue; }
      mods[key] = (mods[key] ?? 1) * value;
    }
  };

  apply(backgroundOf(character).modifiers);
  for (const id of character.skills) apply(SKILLS[id]?.modifiers);

  // An injured operator is slower at everything until the next watch is over.
  if (character.wounded) {
    mods.reactionMult *= 1.35;
    mods.reloadMult *= 1.3;
    mods.rebootMult *= 1.4;
  }

  return mods;
}

/** One-line summary for the record card. */
export function describe(character) {
  const rank = rankOf(character);
  return `${rank.tm} ${character.name}`;
}
