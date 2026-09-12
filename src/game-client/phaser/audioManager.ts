export type AudioCue =
  | "open"
  | "dice"
  | "move"
  | "victory"
  | "build"
  | "hotel"
  | "demolish"
  | "explode";

interface ToneSequenceOptions {
  type: OscillatorType;
  noteSpacing: number;
  noteDuration: number;
  peak: number;
  attack?: number;
}

interface ToneSweepOptions {
  type: OscillatorType;
  fromFrequency: number;
  toFrequency: number;
  duration: number;
  peak: number;
}

interface NoiseBurstOptions {
  duration: number;
  peak: number;
  highpassFrequency?: number;
  lowpassFrequency?: number;
}

const PATTERNS: Record<"open" | "dice" | "move" | "victory", number[]> = {
  open: [260, 420],
  dice: [440, 560, 690],
  move: [340, 420],
  victory: [520, 640, 780, 960],
};

export class GameAudioManager {
  enabled = true;

  toggle() {
    this.enabled = !this.enabled;
  }

  play(cue: AudioCue) {
    if (!this.enabled || typeof window === "undefined") {
      return;
    }

    const ContextClass =
      window.AudioContext ||
      (window as typeof window & {
        webkitAudioContext?: typeof AudioContext;
      }).webkitAudioContext;

    if (!ContextClass) {
      return;
    }

    const context = new ContextClass();
    const startAt = context.currentTime + 0.02;
    let closeAfterMs = 900;

    switch (cue) {
      case "open":
        this.playToneSequence(context, PATTERNS.open, startAt, {
          type: "square",
          noteSpacing: 0.1,
          noteDuration: 0.12,
          peak: 0.07,
        });
        break;
      case "dice":
        this.playToneSequence(context, PATTERNS.dice, startAt, {
          type: "square",
          noteSpacing: 0.1,
          noteDuration: 0.12,
          peak: 0.07,
        });
        break;
      case "move":
        this.playToneSequence(context, PATTERNS.move, startAt, {
          type: "square",
          noteSpacing: 0.1,
          noteDuration: 0.12,
          peak: 0.07,
        });
        break;
      case "victory":
        this.playToneSequence(context, PATTERNS.victory, startAt, {
          type: "triangle",
          noteSpacing: 0.1,
          noteDuration: 0.12,
          peak: 0.07,
        });
        closeAfterMs = 980;
        break;
      case "build":
        this.playToneSequence(context, [220, 277, 330], startAt, {
          type: "square",
          noteSpacing: 0.09,
          noteDuration: 0.1,
          peak: 0.05,
        });
        this.playNoiseBurst(context, startAt + 0.02, {
          duration: 0.08,
          peak: 0.028,
          highpassFrequency: 1200,
          lowpassFrequency: 3800,
        });
        this.playNoiseBurst(context, startAt + 0.18, {
          duration: 0.07,
          peak: 0.02,
          highpassFrequency: 900,
          lowpassFrequency: 3000,
        });
        closeAfterMs = 760;
        break;
      case "hotel":
        this.playToneSequence(context, [392, 523, 659, 784], startAt, {
          type: "triangle",
          noteSpacing: 0.08,
          noteDuration: 0.18,
          peak: 0.055,
          attack: 0.03,
        });
        this.playToneSweep(context, startAt, {
          type: "sine",
          fromFrequency: 760,
          toFrequency: 1180,
          duration: 0.42,
          peak: 0.018,
        });
        this.playNoiseBurst(context, startAt + 0.06, {
          duration: 0.24,
          peak: 0.015,
          highpassFrequency: 2600,
          lowpassFrequency: 6200,
        });
        closeAfterMs = 1100;
        break;
      case "demolish":
        this.playToneSequence(context, [246, 220, 196], startAt, {
          type: "sawtooth",
          noteSpacing: 0.08,
          noteDuration: 0.12,
          peak: 0.04,
        });
        this.playNoiseBurst(context, startAt + 0.02, {
          duration: 0.18,
          peak: 0.04,
          highpassFrequency: 260,
          lowpassFrequency: 2200,
        });
        closeAfterMs = 840;
        break;
      case "explode":
        this.playToneSweep(context, startAt, {
          type: "sawtooth",
          fromFrequency: 180,
          toFrequency: 42,
          duration: 0.32,
          peak: 0.08,
        });
        this.playToneSequence(context, [62, 48], startAt + 0.05, {
          type: "triangle",
          noteSpacing: 0.11,
          noteDuration: 0.18,
          peak: 0.028,
        });
        this.playNoiseBurst(context, startAt, {
          duration: 0.34,
          peak: 0.08,
          highpassFrequency: 80,
          lowpassFrequency: 1400,
        });
        closeAfterMs = 1080;
        break;
      default:
        break;
    }

    window.setTimeout(() => {
      void context.close();
    }, closeAfterMs);
  }

  private playToneSequence(
    context: AudioContext,
    frequencies: number[],
    startAt: number,
    options: ToneSequenceOptions,
  ) {
    const attack = options.attack ?? 0.02;

    frequencies.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const noteStart = startAt + index * options.noteSpacing;
      const noteEnd = noteStart + options.noteDuration;

      oscillator.type = options.type;
      oscillator.frequency.setValueAtTime(frequency, noteStart);

      gain.gain.setValueAtTime(0.0001, noteStart);
      gain.gain.exponentialRampToValueAtTime(options.peak, noteStart + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);

      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(noteStart);
      oscillator.stop(noteEnd);
    });
  }

  private playToneSweep(
    context: AudioContext,
    startAt: number,
    options: ToneSweepOptions,
  ) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const endAt = startAt + options.duration;

    oscillator.type = options.type;
    oscillator.frequency.setValueAtTime(options.fromFrequency, startAt);
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(24, options.toFrequency),
      endAt,
    );

    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(options.peak, startAt + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, endAt);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startAt);
    oscillator.stop(endAt);
  }

  private playNoiseBurst(
    context: AudioContext,
    startAt: number,
    options: NoiseBurstOptions,
  ) {
    const frameCount = Math.max(1, Math.floor(context.sampleRate * options.duration));
    const buffer = context.createBuffer(1, frameCount, context.sampleRate);
    const data = buffer.getChannelData(0);

    for (let index = 0; index < frameCount; index += 1) {
      const decay = 1 - index / frameCount;
      data[index] = (Math.random() * 2 - 1) * decay;
    }

    const source = context.createBufferSource();
    source.buffer = buffer;

    let tail: AudioNode = source;

    if (options.highpassFrequency) {
      const highpass = context.createBiquadFilter();
      highpass.type = "highpass";
      highpass.frequency.setValueAtTime(options.highpassFrequency, startAt);
      tail.connect(highpass);
      tail = highpass;
    }

    if (options.lowpassFrequency) {
      const lowpass = context.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.setValueAtTime(options.lowpassFrequency, startAt);
      tail.connect(lowpass);
      tail = lowpass;
    }

    const gain = context.createGain();
    const endAt = startAt + options.duration;
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(options.peak, startAt + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, endAt);

    tail.connect(gain);
    gain.connect(context.destination);
    source.start(startAt);
    source.stop(endAt);
  }
}
