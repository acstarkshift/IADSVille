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
    if (!on) this.stopArmWarning();
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
