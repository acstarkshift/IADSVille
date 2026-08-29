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
  ministry: { tm: 'МИНИСТЕРСТВО ОБОРОНЫ', en: 'MINISTRY OF DEFENCE' },
  politicalSection: { tm: 'ПОЛИТИЧЕСКИЙ ОТДЕЛ', en: 'POLITICAL SECTION' },
  town: { tm: 'ВИЛЛА', en: 'THE VILLE' },
};

/** Controls the operator physically touches. */
export const CONTROLS = {
  radiate: { tm: 'ИЗЛУЧЕНЬ', en: 'RADIATE', hint: 'high voltage to the antenna' },
  silence: { tm: 'ЗАТИХ', en: 'SILENCE', hint: 'kill the transmitter' },
  power: { tm: 'ЖИВЛЕНЬ', en: 'POWER' },
  filament: { tm: 'НАКАЛ', en: 'FILAMENT', hint: 'warming up' },
  search: { tm: 'ПОШУК', en: 'SEARCH' },
  lock: { tm: 'ЗАХВАТ', en: 'LOCK' },
  launch: { tm: 'ПУСК', en: 'LAUNCH' },
  reload: { tm: 'ПЕРЕЗАРЯД', en: 'RELOAD' },
  displace: { tm: 'СМЕНА МЕСТА', en: 'DISPLACE' },
  salvo: { tm: 'ЗАЛП', en: 'SALVO' },
  gain: { tm: 'ПОСИЛ', en: 'GAIN' },
  brightness: { tm: 'ЯСНОТА', en: 'BRIGHTNESS' },
  range: { tm: 'ДАЛЬ', en: 'RANGE SCALE' },
  scale: { tm: 'МАСШТАБ', en: 'SCALE' },
  acknowledge: { tm: 'ПРИНЯТО', en: 'ACKNOWLEDGE' },
  refuse: { tm: 'ОТКАЗ', en: 'REFUSE' },
  hold: { tm: 'ЗАПРЕТ', en: 'HOLD' },
  tight: { tm: 'КОНТРОЛЬ', en: 'TIGHT' },
  free: { tm: 'СВОБОДНО', en: 'FREE' },
  weapons: { tm: 'ОРУЖИЕ', en: 'WEAPONS' },
  abort: { tm: 'СДАТЬ ПОСТ', en: 'LEAVE POST' },
};

/** Lamps and status legends — the things that light up at you. */
export const STATUS = {
  ready: { tm: 'ГОТОВ', en: 'READY' },
  radiating: { tm: 'ИЗЛУЧАЕТ', en: 'RADIATING' },
  dark: { tm: 'ТИХО', en: 'DARK' },
  warming: { tm: 'НАКАЛ', en: 'WARMING' },
  fault: { tm: 'АВАРА', en: 'FAULT' },
  guiding: { tm: 'ВЕДЁТ', en: 'GUIDING' },
  noGuidance: { tm: 'НЕТ ВЕДЕНЬЯ', en: 'NO GUIDANCE' },
  inEnvelope: { tm: 'В ЗОНЕ', en: 'IN ENVELOPE' },
  outOfZone: { tm: 'ВНЕ ЗОНЫ', en: 'OUT OF ZONE' },
  noSolution: { tm: 'НЕТ РЕШЕНЬЯ', en: 'NO FIRING SOLUTION' },
  armWarning: { tm: 'ОБЛУЧЕНЬЕ', en: 'INBOUND ARM', hint: 'a round is homing on you' },
  fusion: { tm: 'ЕДИНАЯ КАРТА', en: 'FUSED PICTURE' },
  localControl: { tm: 'МЕСТНОЕ УПР.', en: 'LOCAL CONTROL' },
  airPicture: { tm: 'ВОЗДУШНАЯ ОБСТАНОВКА', en: 'AIR PICTURE' },
  standing: { tm: 'АТТЕСТАЦИЯ', en: 'STANDING' },
  commandNet: { tm: 'СЕТЬ КОМАНДОВАНЬЯ', en: 'COMMAND NET' },
  rounds: { tm: 'РАСХОД', en: 'EXPENDED' },
  airborne: { tm: 'В ВОЗДУХЕ', en: 'AIRBORNE' },
  clock: { tm: 'ВРЕМЯ', en: 'TIME' },
  channels: { tm: 'КАНАЛЫ', en: 'CHANNELS' },
  exposure: { tm: 'ЗАСВЕТКА', en: 'ELINT EXPOSURE', hint: 'how well they have you pinned' },
  target: { tm: 'ЦЕЛЬ', en: 'TARGET' },
  survival: { tm: 'ЖИВУЧЕСТЬ', en: 'SURVIVAL' },
  sequence: { tm: 'ЦИКЛ', en: 'SEQUENCE' },
  crew: { tm: 'РАСЧЁТ', en: 'CREW' },
  standby: { tm: 'ОЖИДАНИЕ', en: 'STANDBY' },
  preparing: { tm: 'ПОДГОТОВКА', en: 'PREPARING' },
  inFlight: { tm: 'В ПОЛЁТЕ', en: 'ROUNDS IN FLIGHT' },
  noTarget: { tm: 'ЦЕЛЬ НЕ НАЗНАЧЕНА', en: 'NO TARGET DESIGNATED' },
  rangeHeight: { tm: 'ДАЛЬ / ВЫСОТА', en: 'RANGE / HEIGHT' },
  horizon: { tm: 'ГОРИЗОНТ', en: 'HORIZON' },
  beyond: { tm: 'ЗА ПРЕДЕЛОМ', en: 'BEYOND' },
  cue: { tm: 'НАВОДКА', en: 'CUE' },
  yourSeat: { tm: 'ВАШ ПОСТ', en: 'YOUR POST' },
  destroyed: { tm: 'УНИЧТОЖЕН', en: 'DESTROYED' },
  displacing: { tm: 'НА МАРШЕ', en: 'DISPLACING' },
  reloading: { tm: 'ЗАРЯЖАНИЕ', en: 'RELOADING' },
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
  year: { tm: 'ГОД ВЫПУСКА 19__', en: 'YEAR OF MANUFACTURE 19__' },
  factory: { tm: 'ЗАВОД ИМ. КОРНЕЛА', en: 'KORNEL WORKS' },
  standard: { tm: 'ТМСТ 4471-Б', en: 'TMST 4471-B' },
  warning: { tm: 'ВЫСОКОЕ НАПРЯЖЕНИЕ', en: 'HIGH VOLTAGE' },
  caution: { tm: 'НЕ ВСКРЫВАТЬ ПОД ТОКОМ', en: 'DO NOT OPEN UNDER POWER' },
};

/**
 * Render a legend as engraved markup: the Cyrillic large, the English small
 * underneath. `inline` keeps it on one line for tight controls.
 */
export function legend(entry, { inline = false, glossOnly = false } = {}) {
  if (!entry) return '';
  if (glossOnly) return escapeHtml(entry.en);
  if (inline) {
    return `<span class="lg"><b>${escapeHtml(entry.tm)}</b><i>${escapeHtml(entry.en)}</i></span>`;
  }
  return `<span class="lg lg-stack"><b>${escapeHtml(entry.tm)}</b><i>${escapeHtml(entry.en)}</i></span>`;
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
