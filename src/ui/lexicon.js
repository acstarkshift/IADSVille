/**
 * Panel nomenclature for the Trans-Mordovian People's Air Defence Forces.
 *
 * Every legend plate, switch marking, lamp caption and warning label in the game
 * comes from this table, so the hardware reads consistently and a label can
 * never drift from the control it sits under.
 *
 * Trans Mordovia is invented, and so is its language: a Slavic tongue written in
 * Cyrillic, coined for this game. It is not Russian, Ukrainian, Bulgarian or
 * Serbian, and the resemblance is the same resemblance those languages have to
 * each other. No real state, service or equipment is depicted.
 *
 * Every entry is bilingual on purpose. The Cyrillic is what is stencilled on the
 * panel; the English gloss is etched underneath it in smaller type, the way
 * export-marked equipment genuinely is — which also means the console stays
 * playable for someone who cannot read the Cyrillic, and legible if a font
 * without Cyrillic coverage substitutes.
 */

/** @typedef {{ tm: string, en: string, hint?: string }} Legend */

/** The state, its service, and the things stencilled on the equipment itself. */
export const STATE = {
  country: { tm: 'ТРАНС-МОРДОВИЯ', en: 'TRANS MORDOVIA' },
  service: { tm: 'ВОЙСКА ПРОТИВОВОЗДУШНОЙ ОБОРОНЫ', en: 'AIR DEFENCE FORCES' },
  serviceShort: { tm: 'ВПВО ТМ', en: 'TM ADF' },
  sector: { tm: 'СЕКТОР 4-Б', en: 'SECTOR 4-B' },
  town: { tm: 'ВИЛЛА', en: 'THE VILLE' },
};

/** Controls the operator physically touches. */
export const CONTROLS = {
  radiate: { tm: 'ИЗЛУЧЕНЬ', en: 'RADIATE', hint: 'high voltage to the antenna' },
  silence: { tm: 'ЗАТИХ', en: 'SILENCE', hint: 'kill the transmitter' },
  lock: { tm: 'ЗАХВАТ', en: 'LOCK' },
  launch: { tm: 'ПУСК', en: 'LAUNCH' },
  /*
   * The key still says RELOAD because that is what it is called and what the
   * keyboard hint teaches, but the order it gives is LOADERS OUT: the rack
   * fills itself a rail at a time whenever the rails go bare, and this is the
   * order to send the crew out on a rack that is merely short, or across a
   * guidance run. `startReload` carries the whole rule.
   */
  reload: { tm: 'ПЕРЕЗАРЯД', en: 'RELOAD' },
  displace: { tm: 'СМЕНА МЕСТА', en: 'DISPLACE' },
  salvo: { tm: 'ЗАЛП', en: 'SALVO' },
  range: { tm: 'ДАЛЬ', en: 'RANGE SCALE' },
  acknowledge: { tm: 'ПРИНЯТО', en: 'ACKNOWLEDGE' },
  refuse: { tm: 'ОТКАЗ', en: 'REFUSE' },
  hold: { tm: 'ЗАПРЕТ', en: 'HOLD' },
  tight: { tm: 'КОНТРОЛЬ', en: 'TIGHT' },
  free: { tm: 'СВОБОДНО', en: 'FREE' },
  /** The commander's override on the crew's blink arithmetic. */
  ride: {
    tm: 'ДЕРЖАТЬ ЛУЧ', en: 'RIDE — HOLD THE BEAM',
    hint: 'keep guiding with a round homing on this set',
  },
  perDoctrine: {
    tm: 'ПО УСТАВУ', en: 'EMCON PER DOCTRINE',
    hint: 'the crew blinks when its own arithmetic says so',
  },
  abort: { tm: 'СДАТЬ', en: 'LEAVE POST' },
  /* The two halves of the question the LEAVE POST cap now asks first. */
  abandon: { tm: 'ОСТАВИТЬ ПОСТ', en: 'ABANDON THE WATCH' },
  stay: { tm: 'ОСТАТЬСЯ', en: 'STAY AT THE POST' },
  /* The commander's seat toggle. It says what pressing it will do. */
  takeConsole: { tm: 'ЗАНЯТЬ ПОСТ', en: 'TAKE A CONSOLE' },
  backToNet: { tm: 'НА СЕТЬ', en: 'BACK TO THE NET' },
  /*
   * The four speed caps. They live here rather than as literals in the markup
   * so that each one can carry its key — the number stencilled on the cap is
   * the number that selects it, which it was not: the keyboard used to map the
   * digits by position, so 3 selected the cap marked 4× and 4 stopped the raid.
   * There is no 3× speed and therefore no 3 key.
   */
  speedHold: { tm: 'СТОП', en: 'HOLD', hint: 'the simulation stops; a pending order’s clock does not' },
  speedReal: { tm: '1×', en: 'REAL TIME' },
  speedFast: { tm: '2×', en: 'FAST' },
  speedMax: { tm: '4×', en: 'MAX' },
};

/**
 * The order the three weapons states cycle in, shared by the panel that draws
 * the cap and the handler that presses it.
 *
 * They used to be two separate literals, and the cap printed the state the
 * formation was IN while the click moved it to the next one — so a player who
 * read a sector's card as TIGHT and pressed twice to reach FREE landed on HOLD,
 * and disarmed the sector the briefing had just told them was under attack.
 * Measured in a browser watch of Four Sectors: two sectors sat on HOLD with
 * twenty-eight rounds apiece through the last five minutes of the raid, with
 * one small ticker line to say so. The cap now says what pressing it will DO;
 * the card's ORDER figure still says what the formation is on.
 */
export const POSTURE_CYCLE = ['hold', 'tight', 'free'];

/** Lamps and status legends — the things that light up at you. */
export const STATUS = {
  ready: { tm: 'ГОТОВ', en: 'READY' },
  radiating: { tm: 'ИЗЛУЧАЕТ', en: 'RADIATING' },
  warming: { tm: 'НАКАЛ', en: 'WARMING' },
  fault: { tm: 'АВАРА', en: 'FAULT' },
  guiding: { tm: 'ВЕДЁТ', en: 'GUIDING' },
  noGuidance: { tm: 'НЕТ ВЕДЕНЬЯ', en: 'NO GUIDANCE' },
  antennasGone: {
    tm: 'АНТЕННЫ УНИЧТОЖЕНЫ', en: 'ANTENNAS DESTROYED',
    hint: 'the guidance set is wreckage — nothing can be locked or launched from here',
  },
  emconHeld: {
    tm: 'ПО ПРИКАЗУ', en: 'BY ORDER',
    hint: 'this battery holds the emissions posture you gave it; its crew will not change it back',
  },
  inEnvelope: { tm: 'В ЗОНЕ', en: 'IN ENVELOPE' },
  outOfZone: { tm: 'ВНЕ ЗОНЫ', en: 'OUT OF ZONE' },
  noSolution: { tm: 'НЕТ РЕШЕНЬЯ', en: 'NO FIRING SOLUTION' },
  armWarning: { tm: 'ОБЛУЧЕНЬЕ', en: 'INBOUND ARM', hint: 'a round is homing on you' },
  protectedFlight: {
    tm: 'ОСОБО ОХРАНЯЕМЫЙ БОРТ',
    en: 'PROTECTED FLIGHT',
    hint: 'sector command answers for this one personally',
  },
  fusion: { tm: 'ЕДИНАЯ КАРТА', en: 'FUSED PICTURE' },
  localControl: { tm: 'МЕСТНОЕ УПР.', en: 'LOCAL CONTROL' },
  airPicture: { tm: 'ВОЗДУШНАЯ ОБСТАНОВКА', en: 'AIR PICTURE' },
  /** The heading over the rack, as against CONTROLS.hold/tight/free. */
  weaponsPanel: { tm: 'ОГНЕВЫЕ СРЕДСТВА', en: 'WEAPONS' },
  standing: { tm: 'АТТЕСТАЦИЯ', en: 'STANDING' },
  commandNet: { tm: 'СЕТЬ КОМАНДОВАНЬЯ', en: 'COMMAND NET' },
  rounds: { tm: 'РАСХОД', en: 'EXPENDED' },
  airborne: { tm: 'В ВОЗДУХЕ', en: 'AIRBORNE' },
  clock: { tm: 'ВРЕМЯ', en: 'TIME' },
  channels: { tm: 'КАНАЛЫ', en: 'CHANNELS' },
  exposure: { tm: 'ЗАСВЕТКА', en: 'ELINT EXPOSURE', hint: 'how well they have you pinned' },
  fireControl: {
    tm: 'СТАНЦИЯ НАВЕДЕНЬЯ', en: 'FIRE CONTROL',
    hint: 'where the guidance antenna is pointing, and whether the target is inside its arc',
  },
  shotQuality: {
    tm: 'ВЕР. ПОРАЖЕНИЯ', en: 'EST. KILL PROB',
    hint: 'what the firing tables say this shot is worth right now',
  },
  target: { tm: 'ЦЕЛЬ', en: 'TARGET' },
  sequence: { tm: 'ЦИКЛ', en: 'SEQUENCE' },
  crew: { tm: 'РАСЧЁТ', en: 'CREW' },
  standby: { tm: 'ОЖИДАНИЕ', en: 'STANDBY' },
  preparing: { tm: 'ПОДГОТОВКА', en: 'PREPARING' },
  inFlight: { tm: 'В ПОЛЁТЕ', en: 'ROUNDS IN FLIGHT' },
  holding: { tm: 'ВЫЖИДАНИЕ', en: 'HOLDING FOR RANGE', hint: 'the shot improves every second the target closes' },
  noTarget: { tm: 'ЦЕЛЬ НЕ НАЗНАЧЕНА', en: 'NO TARGET DESIGNATED' },
  yourSeat: { tm: 'ВАШ ПОСТ', en: 'YOUR POST' },
  destroyed: { tm: 'УНИЧТОЖЕН', en: 'DESTROYED' },
  displacing: { tm: 'НА МАРШЕ', en: 'DISPLACING' },
  /**
   * ЗАРЯЖАНИЕ is the whole operation; ПОДАЧА is the hoist putting the next
   * round on the rail, which is what the bar counts down now the rack fills
   * one at a time. The two are different words on the panel because they are
   * different lengths of wait: the second is the one you can shoot after.
   */
  loading: { tm: 'ПОДАЧА', en: 'LOADING' },
};

/** Equipment nomenclature. Every system carries a type and a works number. */
export const EQUIPMENT = {
  ewr: { tm: 'П-31 «ШИРОКИЙ ГЛАЗ»', en: 'P-31 WIDE EYE' },
  gapfiller: { tm: 'П-14 «НИЗКИЙ ВЗГЛЯД»', en: 'P-14 LOW LOOK' },
  bastion: { tm: 'С-200 «БАСТИОН»', en: 'S-200 BASTION' },
  lance: { tm: 'С-75 «ЛАНЦА»', en: 'S-75 LANCE' },
  thistle: { tm: 'С-12 «ОСОТ»', en: 'S-12 THISTLE' },
  hammer: { tm: 'ЗУ-4 «МОЛОТ»', en: 'ZU-4 HAMMER' },
};

/**
 * Wording for the plates riveted to the console itself. These are set dressing,
 * but they are the details that make a panel feel manufactured rather than drawn.
 */
export const PLATES = {
  type: { tm: 'ТИП 4М-2', en: 'TYPE 4M-2' },
  works: { tm: 'ЗАВ. № 118-44', en: 'WORKS NO. 118-44' },
  factory: { tm: 'ЗАВОД ИМ. КОРНЕЛА', en: 'KORNEL WORKS' },
  standard: { tm: 'ТМСТ 4471-Б', en: 'TMST 4471-B' },
  warning: { tm: 'ВЫСОКОЕ НАПРЯЖЕНИЕ', en: 'HIGH VOLTAGE' },
  caution: { tm: 'НЕ ВСКРЫВАТЬ ПОД ТОКОМ', en: 'DO NOT OPEN UNDER POWER' },
};

/**
 * Render a legend as engraved markup: the Cyrillic large, the English small
 * underneath. `inline` keeps it on one line for tight controls.
 *
 * `key` stencils the keyboard shortcut onto the gloss line — ЗАХВАТ / LOCK · L
 * — which is the same convention `stampLegends` applies to the fixed legends in
 * the markup through `data-key`. A key that is printed on the cap it operates
 * is a key the player does not have to go and look up.
 */
export function legend(entry, { inline = false, glossOnly = false, key = '' } = {}) {
  if (!entry) return '';
  const gloss = key ? `${entry.en} · ${key}` : entry.en;
  if (glossOnly) return escapeHtml(gloss);
  if (inline) {
    return `<span class="lg"><b>${escapeHtml(entry.tm)}</b><i>${escapeHtml(gloss)}</i></span>`;
  }
  return `<span class="lg lg-stack"><b>${escapeHtml(entry.tm)}</b><i>${escapeHtml(gloss)}</i></span>`;
}

/** Plain text form, for canvas drawing and tooltips. */
export function legendText(entry, { both = true } = {}) {
  if (!entry) return '';
  return both ? `${entry.tm} · ${entry.en}` : entry.tm;
}

/**
 * Pair any Cyrillic string with its English counterpart.
 *
 * The rule this enforces is that no Cyrillic ever appears on this console
 * without its translation *beside* it — not in a tooltip, not on hover, beside
 * it. Export-marked equipment is genuinely stencilled this way, and it means a
 * player who cannot read the Cyrillic never has to guess what a control does,
 * or what a place is called, or what a lamp is telling them.
 *
 * Takes either a {tm, en} entry or the two strings directly.
 */
export function pair(tmOrEntry, en) {
  if (tmOrEntry && typeof tmOrEntry === 'object') {
    return tmOrEntry.en ? `${tmOrEntry.tm} · ${tmOrEntry.en}` : tmOrEntry.tm;
  }
  return en ? `${tmOrEntry} · ${en}` : String(tmOrEntry ?? '');
}

/** Markup form of the same pairing: Cyrillic, then the gloss in smaller type. */
export function pairHtml(tmOrEntry, en) {
  const tm = typeof tmOrEntry === 'object' ? tmOrEntry?.tm : tmOrEntry;
  const gloss = typeof tmOrEntry === 'object' ? tmOrEntry?.en : en;
  if (!tm) return '';
  return `<span class="lg"><b>${escapeHtml(tm)}</b>${gloss ? `<i>${escapeHtml(gloss)}</i>` : ''}</span>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
