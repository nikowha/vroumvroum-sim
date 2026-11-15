// Briques DSP de base (filtres, bruit). Aucune API Web Audio : utilisables dans l'AudioWorklet, un Worker ou Node.

/** Générateur de bruit blanc déterministe (xorshift32) : même graine = même suite d'échantillons. */
export class NoiseGenerator {
  private state: number;
  private readonly seed: number;

  /**
   * @param seed graine entière non nulle
   */
  constructor(seed: number) {
    this.seed = seed | 0 || 1;
    this.state = this.seed;
  }

  /** Remet le générateur à sa graine de départ. */
  reset(): void {
    this.state = this.seed;
  }

  /**
   * @returns échantillon de bruit blanc entre -1 et 1
   */
  nextSample(): number {
    let state = this.state;
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    this.state = state;
    return (state | 0) / 2147483648;
  }
}

/** Filtre passe-bande biquad (formule RBJ, gain 0 dB au pic). */
export class BandpassFilter {
  private feedforward0 = 0;
  private feedforward2 = 0;
  private feedback1 = 0;
  private feedback2 = 0;
  private inputDelay1 = 0;
  private inputDelay2 = 0;
  private outputDelay1 = 0;
  private outputDelay2 = 0;

  /**
   * @param sampleRate fréquence d'échantillonnage (Hz)
   * @param frequencyHz fréquence centrale (Hz)
   * @param quality facteur de qualité Q
   */
  constructor(sampleRate: number, frequencyHz: number, quality: number) {
    this.sampleRate = sampleRate;
    this.setFrequency(frequencyHz, quality);
  }

  private readonly sampleRate: number;

  /**
   * Change la fréquence centrale et le Q sans vider la mémoire (filtre qui suit une vitesse, par exemple).
   * @param frequencyHz fréquence centrale (Hz)
   * @param quality facteur de qualité Q
   */
  setFrequency(frequencyHz: number, quality: number): void {
    const sampleRate = this.sampleRate;
    const angularFrequency = (2 * Math.PI * Math.min(Math.max(frequencyHz, 1), sampleRate * 0.45)) / sampleRate;
    const alpha = Math.sin(angularFrequency) / (2 * quality);
    const normalization = 1 + alpha;
    this.feedforward0 = alpha / normalization;
    this.feedforward2 = -alpha / normalization;
    this.feedback1 = (-2 * Math.cos(angularFrequency)) / normalization;
    this.feedback2 = (1 - alpha) / normalization;
  }

  /** Vide la mémoire du filtre. */
  reset(): void {
    this.inputDelay1 = this.inputDelay2 = this.outputDelay1 = this.outputDelay2 = 0;
  }

  /**
   * @param inputSample échantillon d'entrée
   * @returns échantillon filtré
   */
  process(inputSample: number): number {
    const outputSample =
      this.feedforward0 * inputSample +
      this.feedforward2 * this.inputDelay2 -
      this.feedback1 * this.outputDelay1 -
      this.feedback2 * this.outputDelay2;
    this.inputDelay2 = this.inputDelay1;
    this.inputDelay1 = inputSample;
    this.outputDelay2 = this.outputDelay1;
    this.outputDelay1 = outputSample;
    return outputSample;
  }
}

/** Filtre passe-bas à un pôle (6 dB/octave), fréquence de coupure modifiable à chaque échantillon. */
export class OnePoleLowpass {
  private smoothingFactor = 1;
  private memory = 0;
  private readonly sampleRate: number;

  /**
   * @param sampleRate fréquence d'échantillonnage (Hz)
   * @param cutoffHz fréquence de coupure initiale (Hz)
   */
  constructor(sampleRate: number, cutoffHz: number) {
    this.sampleRate = sampleRate;
    this.setCutoff(cutoffHz);
  }

  /**
   * Change la fréquence de coupure.
   * @param cutoffHz fréquence de coupure (Hz)
   */
  setCutoff(cutoffHz: number): void {
    this.smoothingFactor = 1 - Math.exp((-2 * Math.PI * cutoffHz) / this.sampleRate);
  }

  /** Vide la mémoire du filtre. */
  reset(): void {
    this.memory = 0;
  }

  /**
   * @param inputSample échantillon d'entrée
   * @returns échantillon filtré
   */
  process(inputSample: number): number {
    this.memory += this.smoothingFactor * (inputSample - this.memory);
    return this.memory;
  }
}

/** Filtre en peigne amorti : simule l'aller-retour de l'onde de pression dans un tuyau d'échappement. */
export class DampedCombFilter {
  private readonly buffer: Float32Array;
  private writeIndex = 0;
  private readonly feedback: number;
  private readonly damping: OnePoleLowpass;

  /**
   * @param sampleRate fréquence d'échantillonnage (Hz)
   * @param pipeLengthMeters longueur du tuyau (m)
   * @param feedback réinjection (0 à <1)
   * @param speedOfSound vitesse du son (m/s)
   */
  constructor(sampleRate: number, pipeLengthMeters: number, feedback: number, speedOfSound: number) {
    const roundTripSeconds = (2 * pipeLengthMeters) / speedOfSound;
    const MAX_DAMPING_CUTOFF_HZ = 4000;
    this.buffer = new Float32Array(Math.max(1, Math.round(roundTripSeconds * sampleRate)));
    this.feedback = feedback;
    this.damping = new OnePoleLowpass(sampleRate, MAX_DAMPING_CUTOFF_HZ);
  }

  /** Vide la mémoire du tuyau. */
  reset(): void {
    this.buffer.fill(0);
    this.damping.reset();
    this.writeIndex = 0;
  }

  /**
   * @param inputSample échantillon d'entrée
   * @returns échantillon avec les réflexions du tuyau
   */
  process(inputSample: number): number {
    const delayedSample = this.buffer[this.writeIndex];
    const outputSample = inputSample + this.feedback * this.damping.process(delayedSample);
    this.buffer[this.writeIndex] = outputSample;
    this.writeIndex = (this.writeIndex + 1) % this.buffer.length;
    return outputSample;
  }
}

/** Supprime la composante continue (passe-haut très bas). */
export class DcBlocker {
  private previousInput = 0;
  private previousOutput = 0;
  private static readonly POLE = 0.995;

  /** Vide la mémoire du filtre. */
  reset(): void {
    this.previousInput = this.previousOutput = 0;
  }

  /**
   * @param inputSample échantillon d'entrée
   * @returns échantillon sans composante continue
   */
  process(inputSample: number): number {
    const outputSample = inputSample - this.previousInput + DcBlocker.POLE * this.previousOutput;
    this.previousInput = inputSample;
    this.previousOutput = outputSample;
    return outputSample;
  }
}
