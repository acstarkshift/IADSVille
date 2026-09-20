/**
 * Sound, synthesised on the fly.
 *
 * No audio files: every cue is a few oscillators, so the game stays a pure
 * static site and loads instantly. The palette is deliberately sparse — a
 * console that beeps constantly stops meaning anything. Four sounds carry real
 * information (launch, splash, impact, and the anti-radiation warble that means
 * a round is tracking *you*), and one low pulse rises as a striker approaches
 * its release point, so the tension you feel is telling you something true.
 *
 * Everything is wrapped so a browser that blocks audio, or a user who never
 * clicks, degrades to silence rather than errors.
 */

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.armOsc = null;
    this.pulseLevel = 0;
    /** The continuous bed: fans, racks, sweep. See `startRoom`. */
    this.room = null;
  }

  /** Must be called from a user gesture; browsers require it. */
  resume() {
    if (!this.enabled) return;
    try {
      if (!this.ctx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) { this.enabled = false; return; }
        this.ctx = new Ctx();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.32;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch {
      this.enabled = false;
    }
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? 0.32 : 0;
    if (!on) { this.stopArmWarning(); this.stopRoom(); }
  }

  /** One shaped tone. Everything else is built from this. */
  tone({ freq = 440, to = null, dur = 0.15, type = 'sine', gain = 0.3, delay = 0 }) {
    if (!this.enabled || !this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(0.02, dur * 0.2));
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(env).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** Filtered noise burst, for impacts. */
  noise({ dur = 0.4, gain = 0.4, freq = 320 }) {
    if (!this.enabled || !this.ctx) return;
    const t0 = this.ctx.currentTime;
    const frames = Math.floor(this.ctx.sampleRate * dur);
    const buffer = this.ctx.createBuffer(1, frames, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const env = this.ctx.createGain();
    env.gain.value = gain;
    src.connect(filter).connect(env).connect(this.master);
    src.start(t0);
  }

  /* ------------------------------------------------------------ the room */

  /**
   * THE ROOM, AND THE ROOM IS A READOUT.
   *
   * Two critics asked for this independently and neither asked for music.
   * The experience critic: "What is missing is the room: a rack hum that
   * changes pitch when a set comes up... Half the dead air I measured would
   * stop being dead air if the room were audible — a scope with nothing on it
   * and a hum is a watch; a scope with nothing on it and silence is a paused
   * game." The narrative critic, separately: "Not music — the room... In a
   * game whose entire subject is transmitting and being heard, the one sense
   * it does not use is the one the fiction is about."
   *
   * And the experience critic's own warning about it, which is the design:
   * "A hum that never changes becomes wallpaper. Tie its pitch and level to
   * the number of sets radiating, so the sound of the room is also a readout
   * of the trade."
   *
   * So the bed is three layers and every one of them is an instrument:
   *
   *   - THE FANS. Filtered noise, always there while a console is powered.
   *     This is the floor: the difference between a quiet watch and a dead
   *     game.
   *   - THE RACKS. Mains hum at the fundamental and its second harmonic,
   *     whose level and brightness rise with the number of surveillance sets
   *     actually RADIATING. Everything cold is a nearly silent room — which
   *     is the honest sound of being blind, and is the first thing the whole
   *     game is about. Throw the switch and you hear the racks take the
   *     current, over about a second and a half, so the change is a change
   *     and not a step.
   *   - THE SWEEP. One soft click per pass of the antenna, struck by
   *     `sweepTick` from the frame loop when the beam comes round. A set on
   *     the circle ticks at its own scan period; a set HOLDING A SECTOR ticks
   *     six times as often, because it is looking at a sixth of the sky six
   *     times as hard. The trade the whole seat is built on is audible.
   *
   * Nothing is loaded from a file: the game stays a folder you can open.
   */
  startRoom() {
    if (!this.enabled || !this.ctx || this.room) return;
    const t = this.ctx.currentTime;

    // Fans: two seconds of noise on a loop, well under the cutoff so it is
    // air moving rather than hiss.
    const frames = Math.floor(this.ctx.sampleRate * 2);
    const buffer = this.ctx.createBuffer(1, frames, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let prev = 0;
    for (let i = 0; i < frames; i++) {
      // A one-pole lowpass on white noise: brown-ish, which is what a cabinet
      // fan at three metres actually sounds like.
      prev = prev * 0.96 + (Math.random() * 2 - 1) * 0.04;
      data[i] = prev * 3;
    }
    // Cross-fade the last quarter-second into the first so the loop seam is
    // not a click every two seconds.
    const blend = Math.floor(this.ctx.sampleRate * 0.25);
    for (let i = 0; i < blend; i++) {
      const k = i / blend;
      data[i] = data[i] * k + data[frames - blend + i] * (1 - k);
    }
    const fans = this.ctx.createBufferSource();
    fans.buffer = buffer;
    fans.loop = true;
    const fanFilter = this.ctx.createBiquadFilter();
    fanFilter.type = 'lowpass';
    fanFilter.frequency.value = 420;
    const fanGain = this.ctx.createGain();
    fanGain.gain.value = 0.05;
    fans.connect(fanFilter).connect(fanGain).connect(this.master);
    fans.start(t);

    // Racks: the mains and its second harmonic, silent until a set comes up.
    const hum = this.ctx.createOscillator();
    const hum2 = this.ctx.createOscillator();
    hum.type = 'sine';
    hum2.type = 'triangle';
    hum.frequency.value = 50;
    hum2.frequency.value = 100;
    const humGain = this.ctx.createGain();
    const hum2Gain = this.ctx.createGain();
    humGain.gain.value = 0;
    hum2Gain.gain.value = 0;
    hum.connect(humGain).connect(this.master);
    hum2.connect(hum2Gain).connect(this.master);
    hum.start(t);
    hum2.start(t);

    this.room = { fans, fanGain, fanFilter, hum, hum2, humGain, hum2Gain };
  }

  stopRoom() {
    if (!this.room) return;
    try {
      this.room.fans.stop();
      this.room.hum.stop();
      this.room.hum2.stop();
    } catch { /* already stopped */ }
    this.room = null;
  }

  /**
   * How loud the room is, and it is the number of sets radiating.
   *
   * `sets` is how many surveillance sets are up, `of` how many the sector
   * owns. Nothing up is a room with only its fans in it. Glided rather than
   * set, over about a second and a half, so throwing the switch sounds like a
   * rack taking current instead of like a value changing.
   */
  setRoom(sets, of = Math.max(sets, 1)) {
    if (!this.enabled || !this.room || !this.ctx) return;
    const share = Math.max(0, Math.min(1, sets / Math.max(of, 1)));
    const lit = sets > 0 ? 0.35 + share * 0.65 : 0;
    const t = this.ctx.currentTime;
    const glide = (param, to) => {
      try {
        param.cancelScheduledValues(t);
        param.setValueAtTime(param.value, t);
        param.linearRampToValueAtTime(to, t + 1.5);
      } catch { /* context torn down mid-frame */ }
    };
    glide(this.room.humGain.gain, 0.030 * lit);
    glide(this.room.hum2Gain.gain, 0.016 * lit);
    // The fans lift a little when the racks are loaded, and the whole room
    // opens up: a cabinet with its valves hot is brighter as well as louder.
    glide(this.room.fanGain.gain, 0.045 + 0.030 * lit);
    glide(this.room.fanFilter.frequency, 380 + 340 * lit);
  }

  /**
   * One pass of the antenna. Struck by the frame loop, not by a timer, so it
   * is the beam's own rate — including six times a circuit when the set is
   * holding a sector rather than turning.
   */
  sweepTick() {
    this.tone({ freq: 196, to: 150, dur: 0.055, type: 'triangle', gain: 0.022 });
  }

  /**
   * The net opening before somebody speaks. A carrier clicking in, which is
   * what the console's whole subject is, and quiet enough to live under a
   * sentence rather than in front of it.
   */
  netOpen() {
    this.noise({ dur: 0.05, gain: 0.05, freq: 2200 });
    this.tone({ freq: 520, dur: 0.02, type: 'square', gain: 0.012 });
  }

  /**
   * THE PRINTER, WHICH IS THE ONE SOUND THE NARRATIVE CRITIC ASKED FOR BY
   * NAME: "If the budget is one sound, make it the printer."
   *
   * The evening opens on a dot-matrix machine putting the night's tape into
   * the operator's hands, and the scene player has been calling `tick()` —
   * a 1050 Hz square blip — once per character at fifty-five characters a
   * second. Fifty-five thirty-millisecond square tones a second overlapping
   * each other is a whine, and a whine is not a print head.
   *
   * A print head is a row of pins hitting a ribbon: an impact, not a pitch.
   * So it is a two-millisecond noise burst with a wooden body under it, and
   * it fires every third character — about eighteen a second, which is the
   * rasp a nine-pin head makes and not a buzz. `printReturn` is the carriage
   * coming back at the end of a line, which is the sound that tells you a
   * line finished without your having to read it.
   */
  printHead(n = 0) {
    if (!this.enabled || !this.ctx || (n % 3)) return;
    this.noise({ dur: 0.012, gain: 0.05, freq: 3200 });
    this.tone({ freq: 210 + (n % 5) * 14, dur: 0.012, type: 'square', gain: 0.012 });
  }

  /** The carriage, at the end of a line. */
  printReturn() {
    if (!this.enabled || !this.ctx) return;
    this.noise({ dur: 0.09, gain: 0.06, freq: 1400 });
    this.tone({ freq: 150, to: 96, dur: 0.07, type: 'square', gain: 0.02 });
  }

  newTrack() { this.tone({ freq: 1320, dur: 0.05, type: 'square', gain: 0.05 }); }
  /** An assignment taken up: the smallest confirmation the console makes. */
  tick() { this.tone({ freq: 1050, dur: 0.03, type: 'square', gain: 0.04 }); }
  /**
   * A bomb that nearly had you. Not the flat double-blip of your own round
   * missing — a body blow, low and wrong, because the two events shared one
   * sound for far too long and they are not remotely the same news.
   */
  thud() {
    this.noise({ dur: 0.35, gain: 0.34, freq: 160 });
    this.tone({ freq: 95, to: 40, dur: 0.4, type: 'sine', gain: 0.26 });
  }
  /** Your own equipment taking a hit and surviving it: metal, then silence. */
  clank() {
    this.noise({ dur: 0.22, gain: 0.3, freq: 2400 });
    this.tone({ freq: 520, to: 180, dur: 0.28, type: 'square', gain: 0.12 });
  }
  /** A raid breaking off: two falling notes, quiet, like a breath let out. */
  relief() {
    this.tone({ freq: 620, to: 470, dur: 0.16, type: 'sine', gain: 0.09 });
    this.tone({ freq: 470, to: 340, dur: 0.22, type: 'sine', gain: 0.08, delay: 0.18 });
  }
  launch() {
    this.tone({ freq: 180, to: 900, dur: 0.5, type: 'sawtooth', gain: 0.16 });
    this.tone({ freq: 90, to: 400, dur: 0.6, type: 'triangle', gain: 0.12 });
  }
  splash() {
    // The payoff sound. Longer and prouder than it was: the fall, a thump with
    // a mid-range body small speakers can actually reproduce, and a breath of
    // debris. A kill earns two-thirds of a second.
    this.tone({ freq: 520, to: 90, dur: 0.45, type: 'triangle', gain: 0.26 });
    this.tone({ freq: 210, to: 140, dur: 0.3, type: 'sine', gain: 0.2, delay: 0.1 });
    this.noise({ dur: 0.5, gain: 0.24, freq: 1100 });
  }
  /** A round gone past its target: flat, wrong, and impossible to miss-hear. */
  miss() {
    this.tone({ freq: 340, dur: 0.07, type: 'square', gain: 0.11 });
    this.tone({ freq: 250, dur: 0.11, type: 'square', gain: 0.11, delay: 0.09 });
  }
  /*
   * The hardware. The whole console is bat-handle toggles, legend-cap buttons
   * and a rotary range knob, drawn with real care and — measured — completely
   * mute: not one of them made a sound, including the RADIATE switch the game
   * is built around. Three noises, kept small enough to live under everything
   * else, because a console you can hear yourself operating is most of what
   * "hardware" means.
   */
  /** A bat-handle toggle thrown: a hard, short mechanical click. */
  toggleSwitch(on = true) {
    this.tone({ freq: on ? 1900 : 1500, to: on ? 900 : 700, dur: 0.035, type: 'square', gain: 0.055 });
    this.noise({ dur: 0.03, gain: 0.05, freq: 3200 });
  }
  /** A legend-cap button pressed: softer, with a little travel. */
  press() {
    this.tone({ freq: 1150, to: 640, dur: 0.045, type: 'triangle', gain: 0.05 });
  }
  /**
   * A cap that went down and did nothing, because the clock is stopped. Half
   * the press, no travel, and a flat low tone rather than a falling one: the
   * sound a switch makes against a dead panel.
   */
  deny() {
    this.tone({ freq: 190, dur: 0.055, type: 'square', gain: 0.035 });
  }
  /** The range knob: one detent. */
  detent() {
    this.tone({ freq: 2400, dur: 0.02, type: 'square', gain: 0.035 });
  }

  /*
   * A round whose radar went off the air under it. This is what the whole
   * game's central trade actually sounds like when you take the other side of
   * it, and it had no sound at all: a quarter to a third of every round fired
   * on the suppression watches ended this way, silently. A falling tone that
   * gives out — the guidance going, rather than a bang.
   */
  guidanceLost() {
    this.tone({ freq: 700, to: 120, dur: 0.55, type: 'sawtooth', gain: 0.1 });
    this.noise({ dur: 0.2, gain: 0.07, freq: 900 });
  }
  /** Weapons seen leaving an attacking aircraft — the bad kind of launch. */
  release() {
    this.tone({ freq: 980, to: 620, dur: 0.18, type: 'square', gain: 0.1 });
    this.tone({ freq: 980, to: 620, dur: 0.18, type: 'square', gain: 0.1, delay: 0.22 });
  }
  impact() {
    // The 70Hz body alone was below what a laptop speaker reproduces at all;
    // the mid-range layer carries the hit on small hardware, the sub layer
    // stays for anyone with real speakers.
    this.noise({ dur: 0.9, gain: 0.5, freq: 220 });
    this.tone({ freq: 160, to: 90, dur: 0.5, type: 'triangle', gain: 0.24 });
    this.tone({ freq: 70, to: 35, dur: 0.8, type: 'sine', gain: 0.3 });
  }
  command() {
    this.tone({ freq: 660, dur: 0.09, type: 'square', gain: 0.1 });
    this.tone({ freq: 880, dur: 0.09, type: 'square', gain: 0.1, delay: 0.12 });
  }
  boot() {
    this.tone({ freq: 120, to: 60, dur: 0.6, type: 'sawtooth', gain: 0.12 });
    this.tone({ freq: 1400, dur: 0.04, type: 'square', gain: 0.06, delay: 0.7 });
  }

  /**
   * A continuous warble while an anti-radiation round is tracking one of your
   * radars. It stops the moment the threat does — which, satisfyingly, is also
   * the moment you shut the radar down.
   */
  startArmWarning() {
    if (!this.enabled || !this.ctx || this.armOsc) return;
    const osc = this.ctx.createOscillator();
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    const env = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 740;
    lfo.frequency.value = 7;
    lfoGain.gain.value = 180;
    lfo.connect(lfoGain).connect(osc.frequency);
    env.gain.value = 0.055;
    // A slow square that chops the warble into bursts while the round is
    // still distant. A three-minute continuous tone is wallpaper by the second
    // minute; a tone that comes and goes stays a warning. The chop depth is
    // driven to zero in the terminal phase so the last seconds are unbroken.
    const chop = this.ctx.createOscillator();
    const chopGain = this.ctx.createGain();
    chop.type = 'square';
    chop.frequency.value = 0.55;
    chopGain.gain.value = 0.05;
    chop.connect(chopGain).connect(env.gain);
    osc.connect(env).connect(this.master);
    osc.start();
    lfo.start();
    chop.start();
    this.armOsc = { osc, lfo, env, chop, chopGain };
  }

  stopArmWarning() {
    if (!this.armOsc) return;
    try {
      this.armOsc.osc.stop();
      this.armOsc.lfo.stop();
      this.armOsc.chop?.stop();
    } catch { /* already stopped */ }
    this.armOsc = null;
  }

  /**
   * The warble quickens as the round gets close. A fixed tone running for two
   * minutes straight decays from terror into wallpaper; a rhythm that tracks
   * the actual time-to-impact keeps meaning something, the way the last
   * seconds of it mean the most.
   */
  setArmUrgency(etaS) {
    if (!this.armOsc || !Number.isFinite(etaS)) return;
    // Escalation begins at forty-five seconds out, not twenty — measured, the
    // old curve left three-quarters of every episode droning at its bored
    // base rate. Under twenty-two seconds the chop opens up and the warble
    // runs unbroken to impact, which is the shape of the real thing.
    const urgency = Math.max(0, Math.min(1, 1 - etaS / 45));
    try {
      this.armOsc.lfo.frequency.value = 5 + urgency * 13;
      this.armOsc.env.gain.value = 0.045 + urgency * 0.055;
      this.armOsc.chopGain.gain.value = etaS > 22 ? 0.05 : 0;
      this.armOsc.chop.frequency.value = 0.4 + urgency * 0.5;
    } catch { /* context torn down mid-frame */ }
  }

  /**
   * The heartbeat. Level rises as something inbound gets close to releasing on
   * a defended asset; it is the only sound that plays continuously, and it is
   * meant to be felt rather than noticed.
   */
  pulse(level) {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    if (level <= 0.02) { this.pulseLevel = level; return; }
    const interval = 1.1 - level * 0.65;
    if (now - (this.lastPulseAt ?? 0) < interval) return;
    this.lastPulseAt = now;
    // Two layers: the sub-bass thump for hardware that has it, and a quiet
    // octave-up partial for the laptop speakers on which the original 58Hz
    // sine simply did not exist.
    this.tone({ freq: 58 + level * 22, dur: 0.16, type: 'sine', gain: 0.05 + level * 0.13 });
    this.tone({ freq: 116 + level * 44, dur: 0.14, type: 'sine', gain: 0.02 + level * 0.05 });
  }
}
