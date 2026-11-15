// Réverbération extérieure légère (réseau de 4 lignes à retard avec matrice de Hadamard, « FDN »).
// Son niveau ne dépend pas de la distance : quand le véhicule s'éloigne, le son direct baisse et la réverbération domine.

import { OnePoleLowpass } from './dspPrimitives.ts';

/** Longueurs des lignes (échantillons à 48 kHz, nombres premiers entre eux pour éviter les résonances). */
const DELAY_LENGTHS_AT_48K = [1693, 2357, 3011, 3533];
const REFERENCE_SAMPLE_RATE = 48000;
/** Temps de décroissance de 60 dB (s) : extérieur avec quelques bâtiments. */
const DECAY_TIME_SECONDS = 1.1;
/** Amortissement des aigus dans la réverbération (Hz). */
const DAMPING_CUTOFF_HZ = 4500;
const HADAMARD_SCALE = 0.5;

export class OutdoorReverb {
  private readonly delayLines: Float32Array[];
  private readonly feedbackGains: number[];
  private readonly dampingFilters: OnePoleLowpass[];
  private readonly positions: number[];
  private readonly lineOutputs = new Float64Array(4);

  /**
   * @param sampleRate fréquence d'échantillonnage (Hz)
   */
  constructor(sampleRate: number) {
    const lengths = DELAY_LENGTHS_AT_48K.map((lengthAt48k) => Math.round((lengthAt48k * sampleRate) / REFERENCE_SAMPLE_RATE));
    this.delayLines = lengths.map((lineLength) => new Float32Array(lineLength));
    this.feedbackGains = lengths.map((lineLength) => Math.pow(10, (-3 * lineLength) / (DECAY_TIME_SECONDS * sampleRate)));
    this.dampingFilters = lengths.map(() => new OnePoleLowpass(sampleRate, DAMPING_CUTOFF_HZ));
    this.positions = lengths.map(() => 0);
  }

  /** Vide la réverbération. */
  reset(): void {
    for (const delayLine of this.delayLines) delayLine.fill(0);
    for (const dampingFilter of this.dampingFilters) dampingFilter.reset();
    this.positions.fill(0);
  }

  /**
   * Ajoute la réverbération du signal d'envoi au bloc de sortie.
   * @param sendBlock signal envoyé dans la réverbération
   * @param outputBlock bloc auquel la réverbération est ajoutée
   * @param wetGain volume de la réverbération
   */
  processBlockAdd(sendBlock: Float32Array, outputBlock: Float32Array, wetGain: number): void {
    const lineOutputs = this.lineOutputs;
    for (let frameIndex = 0; frameIndex < sendBlock.length; frameIndex++) {
      for (let lineIndex = 0; lineIndex < 4; lineIndex++) {
        const delayLine = this.delayLines[lineIndex];
        lineOutputs[lineIndex] = this.dampingFilters[lineIndex].process(delayLine[this.positions[lineIndex]]) * this.feedbackGains[lineIndex];
      }
      const [firstOutput, secondOutput, thirdOutput, fourthOutput] = lineOutputs;
      // Matrice de Hadamard 4×4 : mélange sans perte d'énergie entre les lignes.
      const mixedValues = [
        (firstOutput + secondOutput + thirdOutput + fourthOutput) * HADAMARD_SCALE,
        (firstOutput - secondOutput + thirdOutput - fourthOutput) * HADAMARD_SCALE,
        (firstOutput + secondOutput - thirdOutput - fourthOutput) * HADAMARD_SCALE,
        (firstOutput - secondOutput - thirdOutput + fourthOutput) * HADAMARD_SCALE,
      ];
      const inputSample = sendBlock[frameIndex];
      for (let lineIndex = 0; lineIndex < 4; lineIndex++) {
        const delayLine = this.delayLines[lineIndex];
        delayLine[this.positions[lineIndex]] = inputSample + mixedValues[lineIndex];
        this.positions[lineIndex] = (this.positions[lineIndex] + 1) % delayLine.length;
      }
      outputBlock[frameIndex] += (firstOutput + secondOutput + thirdOutput + fourthOutput) * HADAMARD_SCALE * wetGain;
    }
  }
}
