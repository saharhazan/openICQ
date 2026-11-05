/** The two sounds ICQ New played for messages (SoundsManager.cpp): incoming and the optional outgoing one. */
export type SoundName = 'incoming' | 'outgoing';

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
 * The original WAV files are copyrighted, so every sound is synthesized:
 * - incoming: "Uh-oh!", a short syllable, a pause, a longer falling one. ICQ New's
 *   incoming.wav (0.404 s) is a re-encoding of the classic Message.wav.
 * - outgoing: a short soft click like sound_outgoing.wav (0.058 s).
 */
const RECIPES: Record<SoundName, Tone[]> = {
  incoming: [
    { at: 0, duration: 0.12, from: 480, to: 460, type: 'sawtooth', gain: 0.32, formant: 900 },
    { at: 0.17, duration: 0.23, from: 360, to: 290, type: 'sawtooth', gain: 0.32, formant: 700 },
  ],
  outgoing: [{ at: 0, duration: 0.058, from: 1400, to: 900, type: 'sine', gain: 0.18 }],
};

export type AudioContextFactory = () => AudioContext;

/** Plays the message sounds with Web Audio synthesis. */
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
      context.resume().catch((error: unknown) => this.#fail(new Error('The browser blocked openICQ sounds.', { cause: error })));
    }
  }

  play(name: SoundName): void {
    const context = this.#ensureContext();
    if (!context) return;
    try {
      const start = context.currentTime + 0.01;
      for (const tone of RECIPES[name]) this.#schedule(context, start, tone);
    } catch (error) {
      this.#fail(new Error('openICQ could not play a sound.', { cause: error }));
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
      this.#fail(new Error('This browser cannot play openICQ sounds (no Web Audio).'));
      return null;
    }
    try {
      this.#context = this.#createContext();
    } catch (error) {
      this.#fail(new Error('openICQ could not start sound output.', { cause: error }));
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
