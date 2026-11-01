// Every sound in the cave is made here with Web Audio: knocks, the door, steps, things breaking, the street's rain,
// the dread that builds when the family notices you, and the family's own gibberish voices. Nothing is downloaded.

import type { Tone, Who } from "./script";

const PITCH: Record<Who, number> = { mr: 140, ms: 235, tick: 340, tock: 410 };

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private dread: { gain: GainNode; nodes: AudioScheduledSourceNode[] } | null = null;
  private bed: { gain: GainNode; filter: BiquadFilterNode; src: AudioBufferSourceNode } | null = null;
  private tvNoise: { gain: GainNode; src: AudioBufferSourceNode } | null = null;
  muted = false;

  /** Call from a click: browsers only start audio after the visitor does something. */
  start() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.85;
    this.master.connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    // The bed under everything: rain on the street, a low room tone indoors.
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1400;
    const gain = ctx.createGain();
    gain.gain.value = 0.05;
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
    this.bed = { gain, filter, src };
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(muted ? 0 : 0.85, this.ctx.currentTime, 0.05);
  }

  /** Quiet while the tab is hidden. */
  pause(paused: boolean) {
    if (this.ctx) void (paused ? this.ctx.suspend() : this.ctx.resume());
  }

  dispose() {
    void this.ctx?.close();
    this.ctx = null;
  }

  private out(pan: number, gain: number) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.value = gain;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    g.connect(p).connect(this.master!);
    return g;
  }

  private tone(freq: number, dur: number, o: { type?: OscillatorType; gain?: number; pan?: number; at?: number; slide?: number } = {}) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + (o.at ?? 0);
    const osc = ctx.createOscillator();
    osc.type = o.type ?? "sine";
    osc.frequency.setValueAtTime(freq, t);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * o.slide), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.gain ?? 0.3, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.out(o.pan ?? 0, 1));
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  private hiss(dur: number, o: { freq?: number; q?: number; type?: BiquadFilterType; gain?: number; pan?: number; at?: number } = {}) {
    const ctx = this.ctx;
    if (!ctx || !this.noise) return;
    const t = ctx.currentTime + (o.at ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = o.type ?? "bandpass";
    f.frequency.value = o.freq ?? 1000;
    f.Q.value = o.q ?? 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(o.gain ?? 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.out(o.pan ?? 0, 1));
    src.start(t, Math.random());
    src.stop(t + dur + 0.03);
  }

  knock(pan = 0, times = 3) {
    for (let i = 0; i < times; i++) {
      this.tone(92, 0.14, { gain: 0.7, at: i * 0.21, slide: 0.55, pan });
      this.hiss(0.05, { freq: 700, q: 0.7, gain: 0.35, at: i * 0.21, pan });
    }
  }
  creak(pan = 0) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(190, t);
    osc.frequency.linearRampToValueAtTime(330, t + 0.5);
    osc.frequency.linearRampToValueAtTime(240, t + 0.9);
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 900;
    f.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1);
    osc.connect(f).connect(g).connect(this.out(pan, 1));
    osc.start(t);
    osc.stop(t + 1.05);
  }
  slam(pan = 0) {
    this.tone(55, 0.45, { gain: 0.9, slide: 0.5, pan });
    this.hiss(0.3, { freq: 380, type: "lowpass", gain: 0.6, pan });
  }
  step(pan = 0, gain = 1) {
    this.hiss(0.05, { freq: 650 + Math.random() * 300, q: 1.4, gain: 0.07 * gain, pan });
  }
  smash(pan = 0) {
    this.hiss(0.8, { freq: 3800, type: "highpass", gain: 0.45, pan });
    this.tone(120, 0.22, { gain: 0.45, slide: 0.45, pan });
    for (let i = 0; i < 9; i++) this.tone(1800 + Math.random() * 3600, 0.16, { type: "triangle", gain: 0.08, at: Math.random() * 0.45, pan });
  }
  thud(pan = 0) {
    this.tone(78, 0.2, { gain: 0.55, slide: 0.5, pan });
    this.hiss(0.08, { freq: 320, type: "lowpass", gain: 0.3, pan });
  }
  bonk(pan = 0) {
    this.tone(540, 0.2, { type: "square", gain: 0.12, slide: 0.35, pan });
  }
  click() {
    this.tone(1900, 0.03, { type: "square", gain: 0.07 });
  }
  alarm(pan = 0) {
    for (let i = 0; i < 12; i++) this.tone(2300, 0.09, { type: "square", gain: 0.1, at: i * 0.17, pan });
  }
  sweep(pan = 0) {
    this.hiss(0.22, { freq: 2600, q: 0.7, gain: 0.1, pan });
  }
  clink(pan = 0) {
    this.tone(2600 + Math.random() * 900, 0.12, { type: "triangle", gain: 0.05, pan });
  }
  /** The moment they realise someone is there. */
  stinger() {
    for (const f of [110, 116.5, 155.6, 1244]) this.tone(f, 2.2, { type: f > 1000 ? "sine" : "sawtooth", gain: f > 1000 ? 0.05 : 0.09 });
  }

  /** A typewriter blip for the dialogue box. */
  blip(pitch = 1) {
    this.tone(520 * pitch * (0.96 + Math.random() * 0.08), 0.045, { type: "square", gain: 0.05 });
  }
  /** One tooth of a zip going past the slider. */
  zip(pan = 0) {
    this.hiss(0.025, { freq: 5200 + Math.random() * 1600, q: 2.5, gain: 0.16, pan });
    this.tone(2400 + Math.random() * 500, 0.012, { type: "square", gain: 0.03, pan });
  }
  /** Fabric giving way: the zip open all the way, or the whoosh of a hand snatching it. */
  rip() {
    this.hiss(0.5, { freq: 900, q: 0.6, type: "bandpass", gain: 0.4 });
    this.hiss(0.3, { freq: 3000, q: 0.8, gain: 0.2, at: 0.05 });
  }
  /** Door-light and the warp: a rising roar, then the arrival. */
  warp(seconds: number) {
    const ctx = this.ctx;
    if (!ctx || !this.noise) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 1.4;
    f.frequency.setValueAtTime(200, t);
    f.frequency.exponentialRampToValueAtTime(5200, t + seconds);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + seconds * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + seconds + 0.2);
    src.connect(f).connect(g).connect(this.out(0, 1));
    src.start(t);
    src.stop(t + seconds + 0.3);
    this.tone(90, seconds, { type: "sawtooth", gain: 0.12, slide: 6 });
  }
  boom() {
    this.tone(48, 1.1, { gain: 0.9, slide: 0.45 });
    this.hiss(0.9, { freq: 300, type: "lowpass", gain: 0.5 });
  }
  /** A kick: a whoosh, and a thump if it lands. */
  kick(hit: boolean, pan = 0) {
    this.hiss(0.12, { freq: 1600, q: 0.8, gain: 0.25, pan });
    if (hit) {
      this.tone(140, 0.16, { gain: 0.8, slide: 0.4, pan, at: 0.05 });
      this.tone(620, 0.25, { type: "square", gain: 0.08, slide: 0.3, pan, at: 0.05 });
    }
  }
  /** Getting hit: a dull thud in the chest. */
  ouch() {
    this.tone(70, 0.3, { gain: 0.9, slide: 0.6 });
    this.hiss(0.2, { freq: 260, type: "lowpass", gain: 0.5 });
  }
  /** Laughter in the dark: a deep one under a high one, each "ha" falling, with an echo. */
  laugh() {
    const ctx = this.ctx;
    if (!ctx) return;
    const echo = ctx.createDelay(1);
    echo.delayTime.value = 0.23;
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    const wet = this.out(0, 0.6);
    echo.connect(fb).connect(echo);
    echo.connect(wet);
    for (const [base, at0, n] of [
      [120, 0, 7],
      [260, 0.5, 6],
      [340, 0.9, 5],
    ] as const)
      for (let i = 0; i < n; i++) {
        const t = ctx.currentTime + at0 + i * 0.21;
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        const f = base * (1.18 - i * 0.04);
        osc.frequency.setValueAtTime(f, t);
        osc.frequency.exponentialRampToValueAtTime(f * 0.7, t + 0.16);
        const form = ctx.createBiquadFilter();
        form.type = "bandpass";
        form.frequency.value = base < 200 ? 650 : 1100;
        form.Q.value = 3;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(base < 200 ? 0.5 : 0.25, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
        osc.connect(form).connect(g);
        g.connect(this.out(0, 1));
        g.connect(echo);
        osc.start(t);
        osc.stop(t + 0.2);
      }
  }
  /** His roar when he grows: low, rough and falling. */
  roar() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 128 - 1) * 4;
      curve[i] = Math.tanh(x);
    }
    shaper.curve = curve;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
    shaper.connect(g).connect(this.out(0, 1));
    for (const f of [62, 93, 124]) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(f * 1.3, t);
      osc.frequency.exponentialRampToValueAtTime(f * 0.6, t + 2.1);
      osc.connect(shaper);
      osc.start(t);
      osc.stop(t + 2.25);
    }
    this.hiss(1.8, { freq: 420, q: 0.5, gain: 0.35 });
  }
  /** A giant's footstep, as loud as it is near. */
  stomp(gain = 1, pan = 0) {
    this.tone(42, 0.4, { gain: 0.9 * gain, slide: 0.5, pan });
    this.hiss(0.25, { freq: 180, type: "lowpass", gain: 0.6 * gain, pan });
  }
  /** Three more seconds. */
  chime() {
    this.tone(1318, 0.12, { type: "triangle", gain: 0.16 });
    this.tone(1976, 0.22, { type: "triangle", gain: 0.14, at: 0.08 });
  }
  /** A hack picked up, and used. */
  pickup() {
    for (const [i, f] of [660, 880, 1320].entries()) this.tone(f, 0.08, { type: "square", gain: 0.06, at: i * 0.05 });
  }
  hack() {
    for (let i = 0; i < 8; i++) this.tone(300 + Math.random() * 1800, 0.05, { type: "square", gain: 0.07, at: i * 0.03 });
    this.tone(220, 0.5, { type: "sawtooth", gain: 0.08, slide: 0.25 });
  }
  /** The last seconds: one beep a second, higher when it is nearly over. */
  beep(urgent: boolean) {
    this.tone(urgent ? 1760 : 1320, 0.07, { type: "square", gain: 0.07 });
  }
  /** His barriers slamming down across the avenue. */
  slamBarrier(pan = 0) {
    this.slam(pan);
    this.tone(60, 0.9, { type: "sawtooth", gain: 0.12, slide: 1.04, pan });
    this.hiss(0.6, { freq: 6000, type: "highpass", gain: 0.12, pan });
  }
  /** The littlest one, pleading. */
  whimper() {
    for (const [i, f] of [880, 830, 784, 698, 660].entries()) this.tone(f, 0.32, { type: "sine", gain: 0.08, at: i * 0.3, slide: 0.94 });
  }
  /** Torches: the odd crackle. */
  crackle(gain = 1) {
    this.hiss(0.03, { freq: 2200 + Math.random() * 2000, q: 1.5, gain: 0.05 * gain });
  }

  /** The street's rain and the house's quiet: one noise bed, filtered differently. */
  setPlace(place: "street" | "house" | "cave") {
    if (!this.ctx || !this.bed) return;
    const t = this.ctx.currentTime;
    this.bed.filter.frequency.setTargetAtTime(place === "street" ? 1400 : place === "cave" ? 240 : 380, t, 0.4);
    this.bed.gain.gain.setTargetAtTime(place === "street" ? 0.05 : place === "cave" ? 0.04 : 0.03, t, 0.4);
  }

  /** A low drone that rises with their fear, 0 to 1. */
  setDread(level: number) {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    if (!this.dread) {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 320;
      gain.connect(this.master);
      filter.connect(gain);
      const nodes: AudioScheduledSourceNode[] = [];
      for (const f of [55, 55.8, 82.4]) {
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.value = f;
        osc.connect(filter);
        osc.start();
        nodes.push(osc);
      }
      this.dread = { gain, nodes };
    }
    this.dread.gain.gain.setTargetAtTime(Math.max(0, Math.min(1, level)) * 0.16, ctx.currentTime, 0.8);
  }

  setTv(on: boolean, pan = 0) {
    const ctx = this.ctx;
    if (!ctx || !this.noise) return;
    if (on && !this.tvNoise) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = 3200;
      f.Q.value = 0.6;
      const gain = ctx.createGain();
      gain.gain.value = 0.06;
      src.connect(f).connect(gain).connect(this.out(pan, 1));
      src.start();
      this.tvNoise = { gain, src };
    } else if (!on && this.tvNoise) {
      this.tvNoise.src.stop();
      this.tvNoise = null;
    }
  }

  /** Gibberish, a blip per syllable at the speaker's own pitch. Returns how long the line takes, in seconds. */
  voice(who: Who, text: string, tone: Tone = "say", pan = 0, near = 1) {
    const letters = text.replace(/[^a-z]/gi, "").length;
    const n = Math.min(24, Math.max(3, Math.round(letters / 2.6)));
    let at = 0;
    if (!this.ctx) return n * 0.09;
    const base = PITCH[who] * (tone === "shout" ? 1.22 : 1);
    for (let i = 0; i < n; i++) {
      const f = base * (0.84 + Math.random() * 0.46);
      if (tone === "whisper") this.hiss(0.07, { freq: 1800 + Math.random() * 1600, q: 3, gain: 0.07 * near, at, pan });
      else {
        const g = (tone === "shout" ? 0.13 : 0.08) * near;
        this.tone(f, 0.075, { type: who === "mr" ? "square" : "triangle", gain: g, at, pan, slide: 0.9 + Math.random() * 0.25 });
        this.tone(f * 2.4, 0.055, { gain: g * 0.35, at, pan });
      }
      const ch = text[Math.min(text.length - 1, Math.floor(((i + 1) / n) * text.length))] ?? "";
      at += 0.088 + (/[,.!?…]/.test(ch) ? 0.14 : 0);
    }
    return at;
  }
}
