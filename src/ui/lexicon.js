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
 * Every entry is bilingual, and where the Cyrillic is printed the English is
 * printed beside it. WHERE it is printed is the rule that changed:
 *
 *   The plates carry the Cyrillic. The controls do not.
 *
 * A nomenclature plate, the works plate, a placard and a rubber stamp are
 * objects with a foundry's lettering on them, and they read as manufactured
 * because of it. A cap, a switch position, a lamp caption and a readout are
 * things the operator must read at a glance while something is inbound, and
 * two languages stacked in a 45-pixel switch is not a glance — measured, the
 * ИЗЛУЧЕНЬ / RADIATE / ЗАТИХ / SILENCE stack set four lines of 8px type with
 * 8.4px leading inside a 34px box, which at 100% is a grey smear. So the
 * control legends are English, one line, at a size a person can actually read,
 * and every letter of Cyrillic that was on them has gone to the plates.
 *
 * `tm` is therefore what a plate would be stencilled with; `en` is what the
 * control says. `legend()` prints the second, `pair()` and `plateHtml()` the
 * pair. Nothing prints `tm` alone.
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
  /*
   * The other half of the LOCK cap. LOCK is a toggle — a second press hands
   * the channel back — and the cap said ЗАХВАТ / LOCK in both states, so the
   * one control that can throw away a firing solution was the only control on
   * the console that did not say what pressing it would do. Every other toggle
   * here flips its legend (RADIATE/SILENCE, TAKE/RELEASE); this one does now.
   */
  breakOff: { tm: 'СБРОС', en: 'BREAK OFF', hint: 'hand the channel back and drop this contact' },
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
  /**
   * The commander's override on the crew's blink arithmetic, as the two
   * permanently engraved positions of one switch. Both legends are short
   * because both are printed at once, beside the lever, all night — a switch
   * whose caption changes with its state is a button wearing a lever's coat.
   */
  ride: {
    tm: 'ДЕРЖАТЬ ЛУЧ', en: 'HOLD BEAM',
    hint: 'keep guiding with a round homing on this set',
  },
  perDoctrine: {
    tm: 'ПО УСТАВУ', en: 'PER DOCTRINE',
    hint: 'the crew blinks when its own arithmetic says so',
  },
  abort: { tm: 'СДАТЬ', en: 'LEAVE POST' },
  /*
   * The thumb rail's own verbs. A phone has no keyboard, so the two things the
   * keys did that no cap on the console did — step the selection, and hand the
   * selected contact to the selected battery — are controls here.
   */
  nextTarget: { tm: 'СЛЕД. ЦЕЛЬ', en: 'NEXT TARGET', hint: 'step to the next contact on the board' },
  assign: { tm: 'НАЗНАЧИТЬ', en: 'ASSIGN', hint: 'hand the selected contact to the selected battery' },
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
  /*
   * `cap` is the face of the control where the face is a figure rather than a
   * word: the rack reads 1× 2× 4× because that is what a speed selector is
   * marked with.
   *
   * It used to carry a second line as well — a dim REAL / FAST / MAX under the
   * figure — which made three caps in the rack two lines tall while HOLD and
   * HELP beside them were one, so six controls in four hundred pixels were
   * built to three different heights with the key chip in two different
   * places. The word said nothing the figure did not; it is in the cap's own
   * tooltip and on the CONTROLS page, and the rack is now one cap six times.
   */
  speedReal: { tm: '1×', en: 'REAL', cap: '1×' },
  speedFast: { tm: '2×', en: 'FAST', cap: '2×' },
  speedMax: { tm: '4×', en: 'MAX', cap: '4×' },
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
  /*
   * The fire-control channels, one row each.
   *
   * The cabin used to state the whole of its channel business as one fraction
   * — CHANNELS 3/4 — beside a TARGET row that showed only whatever the player
   * had last clicked. Three engagements the seat could not see, name or break
   * off, reported as a debug counter. A channel is a thing with a target and a
   * state, so it is a row with a target and a state.
   */
  channel: { tm: 'КАНАЛ', en: 'CHANNEL' },
  channelFree: { tm: 'СВОБОДЕН', en: 'FREE' },
  /**
   * The two ammunition readouts, named after what they show rather than after
   * the buttons near them. The rail lamps were captioned LAUNCH and the store
   * figure RELOAD, which put both control legends on the panel twice and left
   * neither row named after its own subject.
   */
  rails: { tm: 'СТВОЛЫ', en: 'RAILS' },
  magazine: { tm: 'БОЕЗАПАС', en: 'MAGAZINE' },
  /** What the equipment can reach, as engraved reference on the seat's own card. */
  reach: { tm: 'ДАЛЬНОСТЬ', en: 'REACH' },
  altitudeBand: { tm: 'ВЫСОТА', en: 'ALTITUDE' },
  /**
   * The battery's own condition, as the one banner across the top of the seat.
   *
   * It reads IN ACTION for the whole of an ordinary watch and changes to one
   * of the other three when the position is hurt. That it is always there is
   * the point: the strip is a fixed row, so the controls below it do not walk
   * up the card the moment the battery goes on the road — and "out of action"
   * has exactly one place on the panel to appear, with exactly one clock.
   *
   * The strip prints the English face. These are states, not stencils: the
   * Trans-Mordovian is kept here as the table's record of the word, and the
   * Cyrillic the seat actually shows is on the nomenclature plate at the head
   * of the same card.
   */
  inAction: { tm: 'В БОЮ', en: 'IN ACTION' },
  outOfAction: { tm: 'ВНЕ БОЯ', en: 'OUT OF ACTION' },
  exposure: { tm: 'ЗАСВЕТКА', en: 'ELINT EXPOSURE', hint: 'how well they have you pinned' },
  fireControl: {
    tm: 'СТАНЦИЯ НАВЕДЕНЬЯ', en: 'FIRE CONTROL',
    hint: 'where the guidance antenna is pointing, and whether the target is inside its arc',
  },
  shotQuality: {
    tm: 'ВЕР. ПОРАЖЕНИЯ', en: 'EST. KILL PROB',
    hint: 'what the firing tables say this shot is worth right now',
  },
  crew: { tm: 'РАСЧЁТ', en: 'CREW' },
  inFlight: { tm: 'В ПОЛЁТЕ', en: 'ROUNDS IN FLIGHT' },
  /*
   * ЦЕЛЬ / TARGET, ЦИКЛ / SEQUENCE, ОЖИДАНИЕ / STANDBY, ПОДГОТОВКА /
   * PREPARING, ВЫЖИДАНИЕ / HOLDING and ЦЕЛЬ НЕ НАЗНАЧЕНА / NO TARGET
   * DESIGNATED were six legends for one fact. The cabin used to carry a TARGET
   * row and a SEQUENCE row about whichever contact the mouse had last touched,
   * and a NO TARGET row that said the same thing a third time in a third
   * treatment; the channel block says all of it once, per channel, as the
   * state of a channel — which is what a sequence IS. They went with the rows.
   */
  yourSeat: { tm: 'ВАШ ПОСТ', en: 'YOUR POST' },
  /** The stamp the file puts on a watch that was walked out of. */
  postAbandoned: { tm: 'ПОСТ ОСТАВЛЕН', en: 'POST ABANDONED' },
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
  works: { tm: 'ЗАВ. 118-44', en: 'WORKS NO. 118-44' },
  factory: { tm: 'ЗАВОД ИМ. КОРНЕЛА', en: 'KORNEL WORKS' },
  standard: { tm: 'ТМСТ 4471-Б', en: 'TMST 4471-B' },
  warning: { tm: 'ВЫСОКОЕ НАПРЯЖЕНИЕ', en: 'HIGH VOLTAGE' },
  caution: { tm: 'НЕ ВСКРЫВАТЬ ПОД ТОКОМ', en: 'DO NOT OPEN UNDER POWER' },
};

/**
 * Render a control's legend: one English line, at a size a person can read.
 *
 * This used to stack the Cyrillic over the English on every cap and every
 * switch position, which put four lines of 8px type inside a 34px switch and
 * made the two most-used controls on the console a grey smear. The plates keep
 * the Cyrillic — see `plateHtml` — because a plate is read once, at leisure,
 * and it is what makes the panel look manufactured. A control is read in a
 * second, with something inbound.
 *
 * `sub` (or the entry's own) is a second, quieter line, used only where the
 * face of the control is a figure rather than a word: the speed rack is marked
 * 1× 2× 4× and says REAL / FAST / MAX underneath, the way a speed selector is.
 *
 * `key` is stamped as a fixed-width chip in the control's own corner —
 * `keycap()` below — rather than appended to the legend, so the key costs the
 * caption no width and every key on the console is printed in the same place.
 */
export function legend(entry, { inline = false, glossOnly = false, key = '', sub = null } = {}) {
  if (!entry) return '';
  const face = entry.cap ?? entry.en;
  if (glossOnly) return escapeHtml(key ? `${face} · ${key}` : face);
  const under = sub ?? entry.sub ?? '';
  const cls = inline ? 'lg' : 'lg lg-stack';
  return `<span class="${cls}"><b>${escapeHtml(face)}</b>${
    under ? `<i>${escapeHtml(under)}</i>` : ''}</span>` + keycap(key);
}

/**
 * The key stencilled in the corner of the control it presses.
 *
 * One key per control, always in the same corner, always in capitals, always
 * in a chip of one size — the chip is sized for the widest legend the console
 * uses, so a two-glyph key does not make one cap's chip fatter and darker than
 * its neighbours'. `wide` is for the three- and four-glyph keys (ESC, ALT1)
 * that only appear on cards with room for them.
 */
export function keycap(key) {
  if (!key) return '';
  const text = String(key).toUpperCase();
  return `<em class="kc${text.length > 2 ? ' kc-wide' : ''}">${escapeHtml(text)}</em>`;
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

/**
 * A nomenclature plate: the Cyrillic stencil with its English gloss under it.
 *
 * This is the ONE form on the console that still carries Cyrillic, and it is
 * deliberate — the type plate riveted to a battery, the works plate on the
 * bezel, the placard over the high-voltage cabinet. Controls use `legend`.
 */
export function plateHtml(entry) {
  return pairHtml(entry);
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
