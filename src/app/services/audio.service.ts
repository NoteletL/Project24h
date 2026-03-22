import { Injectable, signal } from '@angular/core';

// ─── Constantes musicales ─────────────────────────────────────────────────────
const BPM = 138;
const q   = 60 / BPM;   // noire (s)
const h   = q * 2;       // blanche
const e   = q / 2;       // croche
const dq  = q * 1.5;     // noire pointée
const R   = 0;           // silence

// Fréquences Hz — ré mineur naturel
const D3 = 146.83, A3 = 220.00, Bb3 = 233.08, G3 = 196.00,
      C4 = 261.63, D4 = 293.66, Eb4 = 311.13, F4 = 349.23,
      G4 = 392.00, A4 = 440.00, Bb4 = 466.16, C5 = 523.25,
      D5 = 587.33, Eb5 = 622.25;

/** Mélodie principale — style pirates, ré mineur. [fréquence Hz, durée s] */
const MELODY: [number, number][] = [
  // ── Phrase A ──────────────────────────────────────────────────────
  [D4, e], [D4, e], [D4, dq], [C4, e], [D4, q], [Eb4, h],
  [D4, e], [C4, e], [D4, h], [R, q],
  // ── Phrase B (tierce haute) ───────────────────────────────────────
  [F4, e], [F4, e], [F4, dq], [Eb4, e], [F4, q], [G4, h],
  [F4, e], [Eb4, e], [F4, h], [R, q],
  // ── Phrase C (quinte haute) ───────────────────────────────────────
  [A4, e], [A4, e], [A4, dq], [G4, e], [A4, q], [Bb4, h],
  [A4, e], [G4, e], [A4, h], [R, q],
  // ── Climax ────────────────────────────────────────────────────────
  [D5, q], [C5, e], [D5, e], [Eb5, h], [D5, q],
  [C5, e], [Bb4, e], [A4, q], [G4, h + q],
  // ── Résolution ────────────────────────────────────────────────────
  [F4, e], [G4, e], [A4, q], [Bb4, e], [A4, e], [G4, q],
  [F4, e], [Eb4, e], [D4, q], [D4, h + q], [R, q * 3],
];

/** Ostinato de basse — 4 mesures en boucle */
const BASS_LOOP: [number, number][] = [
  [D3, h], [A3, h], [Bb3, h], [A3, h],
  [D3, h], [A3, h], [G3, h],  [A3, h],
];

@Injectable({ providedIn: 'root' })
export class AudioService {
  private ctx:        AudioContext   | null = null;
  private masterGain: GainNode       | null = null;
  private reverbNode: ConvolverNode  | null = null;
  private reverbSend: GainNode       | null = null;
  private dangerOsc:  OscillatorNode | null = null;
  private dangerGain: GainNode       | null = null;

  private melodyIdx   = 0;
  private bassIdx     = 0;
  private melodyTimer: ReturnType<typeof setTimeout> | null = null;
  private bassTimer:   ReturnType<typeof setTimeout> | null = null;

  readonly isPlaying = signal(false);
  readonly volume    = signal(0.35);

  // ── API publique ──────────────────────────────────────────────────

  toggle(): void { this.isPlaying() ? this.stop() : this.start(); }

  start(): void {
    if (!this.ctx) {
      this.initContext();
    } else {
      this.ctx.resume().then(() => {
        if (!this.melodyTimer) this.scheduleMelody();
        if (!this.bassTimer)   this.scheduleBass();
      });
    }
    this.isPlaying.set(true);
  }

  stop(): void {
    this.clearTimers();
    this.stopDangerLayer();
    this.ctx?.suspend();
    this.isPlaying.set(false);
  }

  setVolume(v: number): void {
    this.volume.set(v);
    if (this.masterGain && this.ctx)
      this.masterGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  /** Active / désactive la couche sonore de tension (zone à risque). */
  setDanger(on: boolean): void {
    if (!this.ctx || !this.masterGain) return;
    if (on && !this.dangerOsc)  this.startDangerLayer();
    if (!on && this.dangerOsc)  this.stopDangerLayer();
  }

  // ── Privé ─────────────────────────────────────────────────────────

  private initContext(): void {
    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.volume();
    this.masterGain.connect(this.ctx.destination);

    this.reverbNode = this.createReverb();
    this.reverbSend = this.ctx.createGain();
    this.reverbSend.gain.value = 0.30;
    this.reverbSend.connect(this.reverbNode);
    this.reverbNode.connect(this.masterGain);

    this.createOcean();
    this.scheduleMelody();
    this.scheduleBass();
  }

  /** Réverb artificielle : bruit blanc décroissant (ConvolverNode). */
  private createReverb(): ConvolverNode {
    const ctx = this.ctx!;
    const sr  = ctx.sampleRate;
    const len = Math.round(sr * 2.5);
    const buf = ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++)
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
    }
    const conv = ctx.createConvolver();
    conv.buffer = buf;
    return conv;
  }

  /** Ambiance océan : bruit blanc → passe-bas → LFO d'amplitude. */
  private createOcean(): void {
    const ctx  = this.ctx!;
    const sr   = ctx.sampleRate;
    const buf  = ctx.createBuffer(1, sr * 4, sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    const src  = ctx.createBufferSource();
    src.buffer = buf;
    src.loop   = true;

    const lpf = ctx.createBiquadFilter();
    lpf.type            = 'lowpass';
    lpf.frequency.value = 200;
    lpf.Q.value         = 0.9;

    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.10;
    lfoGain.gain.value  = 0.035;

    const waveGain = ctx.createGain();
    waveGain.gain.value = 0.08;

    lfo.connect(lfoGain);
    lfoGain.connect(waveGain.gain);
    src.connect(lpf);
    lpf.connect(waveGain);
    waveGain.connect(this.masterGain!);
    lfo.start();
    src.start();
  }

  /** Drone grave + trémolo — couche de tension danger. */
  private startDangerLayer(): void {
    const ctx = this.ctx!;
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    this.dangerGain = ctx.createGain();
    this.dangerOsc  = ctx.createOscillator();

    this.dangerOsc.type            = 'sawtooth';
    this.dangerOsc.frequency.value = 55;  // A1 — très grave
    lfo.frequency.value            = 8;   // trémolo ~8 Hz
    lfoGain.gain.value             = 0.05;
    this.dangerGain.gain.value     = 0.09;

    lfo.connect(lfoGain);
    lfoGain.connect(this.dangerGain.gain);
    this.dangerOsc.connect(this.dangerGain);
    this.dangerGain.connect(this.masterGain!);
    lfo.start();
    this.dangerOsc.start();
  }

  private stopDangerLayer(): void {
    if (!this.dangerOsc) return;
    try { this.dangerOsc.stop(); } catch { /* déjà stoppé */ }
    this.dangerGain?.disconnect();
    this.dangerOsc  = null;
    this.dangerGain = null;
  }

  // ── Séquenceur ────────────────────────────────────────────────────

  private scheduleMelody(): void {
    if (!this.ctx || !this.isPlaying()) return;
    const [freq, dur] = MELODY[this.melodyIdx];
    this.melodyIdx = (this.melodyIdx + 1) % MELODY.length;
    if (freq > 0) this.playNote(freq, dur * 0.86, 0.22, 'sawtooth');
    this.melodyTimer = setTimeout(() => this.scheduleMelody(), dur * 1000);
  }

  private scheduleBass(): void {
    if (!this.ctx || !this.isPlaying()) return;
    const [freq, dur] = BASS_LOOP[this.bassIdx];
    this.bassIdx = (this.bassIdx + 1) % BASS_LOOP.length;
    if (freq > 0) this.playNote(freq, dur * 0.72, 0.10, 'triangle');
    this.bassTimer = setTimeout(() => this.scheduleBass(), dur * 1000);
  }

  /** Joue une note avec enveloppe ADSR + envoi en réverb (wet/dry). */
  private playNote(freq: number, dur: number, vol: number, type: OscillatorType): void {
    const ctx  = this.ctx!;
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type            = type;
    osc.frequency.value = freq;

    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol,   t + 0.02);
    gain.gain.setValueAtTime(vol,             t + dur * 0.65);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    osc.connect(gain);
    gain.connect(this.masterGain!);
    if (this.reverbSend) gain.connect(this.reverbSend);
    osc.start(t);
    osc.stop(t + dur + 0.01);
  }

  private clearTimers(): void {
    if (this.melodyTimer) { clearTimeout(this.melodyTimer); this.melodyTimer = null; }
    if (this.bassTimer)   { clearTimeout(this.bassTimer);   this.bassTimer   = null; }
  }
}

