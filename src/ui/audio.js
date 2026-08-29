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
  launch() {
    this.tone({ freq: 180, to: 900, dur: 0.5, type: 'sawtooth', gain: 0.16 });
    this.tone({ freq: 90, to: 400, dur: 0.6, type: 'triangle', gain: 0.12 });
  }
  splash() {
    this.tone({ freq: 420, to: 110, dur: 0.32, type: 'triangle', gain: 0.22 });
    this.noise({ dur: 0.25, gain: 0.18, freq: 900 });
  }
  impact() {
    this.noise({ dur: 0.9, gain: 0.5, freq: 220 });
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
    env.gain.value = 0.06;
    osc.connect(env).connect(this.master);
    osc.start();
    lfo.start();
    this.armOsc = { osc, lfo, env };
  }

  stopArmWarning() {
    if (!this.armOsc) return;
    try {
      this.armOsc.osc.stop();
      this.armOsc.lfo.stop();
    } catch { /* already stopped */ }
    this.armOsc = null;
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
    this.tone({ freq: 58 + level * 22, dur: 0.16, type: 'sine', gain: 0.05 + level * 0.13 });
  }
}
