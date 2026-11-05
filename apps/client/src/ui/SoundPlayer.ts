import type { SoundName } from '../state/effects';

/** One synthesized note: an oscillator through an optional band-pass "voice" filter. */
interface Tone {
  /** Start offset in seconds. */
  at: number;
  duration: number;
  /** Start and end frequency in Hz (a glide when they differ). */
  from: number;
  to: number;
  type: OscillatorType;
  gain: number;
  /** Centre of a band-pass filter, for vowel-like timbre. */
  formant?: number;
}

/**
 * The original WAV files are copyrighted, so every sound is synthesized,
 * shaped after the timing measured in the research (docs/research, Q14):
 * - message: "Uh-oh!", a short syllable, a pause, a longer falling one (0.45 s).
 * - online: a few quick knocks spread over about 1.2 s.
 * - notice: the System Message chime (0.7 s).
 * - auth: the Authorization Message call, a slower rising triad.
 * - startup: the ICQ Startup jingle.
 */
const RECIPES: Record<SoundName, Tone[]> = {
  message: [
    { at: 0, duration: 0.12, from: 480, to: 460, type: 'sawtooth', gain: 0.32, formant: 900 },
    { at: 0.17, duration: 0.28, from: 360, to: 290, type: 'sawtooth', gain: 0.32, formant: 700 },
  ],
  online: [
    { at: 0, duration: 0.07, from: 620, to: 600, type: 'square', gain: 0.14 },
    { at: 0.16, duration: 0.07, from: 620, to: 600, type: 'square', gain: 0.14 },
    { at: 0.32, duration: 0.07, from: 740, to: 720, type: 'square', gain: 0.14 },
    { at: 0.62, duration: 0.09, from: 880, to: 860, type: 'square', gain: 0.12 },
    { at: 0.9, duration: 0.25, from: 990, to: 1046, type: 'triangle', gain: 0.18 },
  ],
  notice: [
    { at: 0, duration: 0.18, from: 988, to: 988, type: 'triangle', gain: 0.35 },
    { at: 0.22, duration: 0.18, from: 784, to: 784, type: 'triangle', gain: 0.35 },
    { at: 0.44, duration: 0.26, from: 988, to: 988, type: 'triangle', gain: 0.3 },
  ],
  auth: [
    { at: 0, duration: 0.3, from: 523, to: 523, type: 'triangle', gain: 0.3 },
    { at: 0.35, duration: 0.3, from: 659, to: 659, type: 'triangle', gain: 0.3 },
    { at: 0.7, duration: 0.5, from: 784, to: 784, type: 'triangle', gain: 0.3 },
  ],
  startup: [
    { at: 0, duration: 0.14, from: 392, to: 392, type: 'square', gain: 0.12 },
    { at: 0.16, duration: 0.14, from: 523, to: 523, type: 'square', gain: 0.12 },
    { at: 0.32, duration: 0.14, from: 659, to: 659, type: 'square', gain: 0.12 },
    { at: 0.5, duration: 0.45, from: 784, to: 784, type: 'triangle', gain: 0.25 },
  ],
};

export type AudioContextFactory = () => AudioContext;

/** Plays the ICQ event sounds with Web Audio synthesis. */
export class SoundPlayer {
  readonly #createContext: AudioContextFactory | null;
  readonly #onError: (error: Error) => void;
  #context: AudioContext | null = null;
  #failed = false;

  constructor(onError: (error: Error) => void, createContext?: AudioContextFactory) {
    this.#onError = onError;
    const Ctor: typeof AudioContext | undefined = globalThis.AudioContext;
    this.#createContext = createContext ?? (Ctor ? () => new Ctor() : null);
  }

  /** Must run inside a user gesture once, so later sounds are allowed to start. */
  unlock(): void {
    const context = this.#ensureContext();
    if (context && context.state === 'suspended') {
      context.resume().catch((error: unknown) => this.#fail(new Error('The browser blocked ICQ sounds.', { cause: error })));
    }
  }

  play(name: SoundName): void {
    const context = this.#ensureContext();
    if (!context) return;
    try {
      const start = context.currentTime + 0.01;
      for (const tone of RECIPES[name]) this.#schedule(context, start, tone);
    } catch (error) {
      this.#fail(new Error('ICQ could not play a sound.', { cause: error }));
    }
  }

  #schedule(context: AudioContext, start: number, tone: Tone): void {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const t0 = start + tone.at;
    const t1 = t0 + tone.duration;
    oscillator.type = tone.type;
    oscillator.frequency.setValueAtTime(tone.from, t0);
    oscillator.frequency.linearRampToValueAtTime(tone.to, t1);
    envelope.gain.setValueAtTime(0.0001, t0);
    envelope.gain.exponentialRampToValueAtTime(tone.gain, t0 + 0.015);
    envelope.gain.setValueAtTime(tone.gain, t1 - 0.04);
    envelope.gain.exponentialRampToValueAtTime(0.0001, t1);
    if (tone.formant) {
      const filter = context.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = tone.formant;
      filter.Q.value = 1.2;
      oscillator.connect(filter).connect(envelope);
    } else {
      oscillator.connect(envelope);
    }
    envelope.connect(context.destination);
    oscillator.start(t0);
    oscillator.stop(t1 + 0.02);
  }

  #ensureContext(): AudioContext | null {
    if (this.#context) return this.#context;
    if (this.#failed) return null;
    if (!this.#createContext) {
      this.#fail(new Error('This browser cannot play ICQ sounds (no Web Audio).'));
      return null;
    }
    try {
      this.#context = this.#createContext();
    } catch (error) {
      this.#fail(new Error('ICQ could not start sound output.', { cause: error }));
      return null;
    }
    return this.#context;
  }

  /** Reports once; after a failure the player stays silent instead of repeating the same dialog. */
  #fail(error: Error): void {
    if (this.#failed) return;
    this.#failed = true;
    this.#onError(error);
  }
}
