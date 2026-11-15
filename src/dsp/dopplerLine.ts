// Propagation jusqu'au micro : retard variable (Doppler), atténuation en 1/distance, absorption de l'air (aigus),
// réflexion du sol (deuxième trajet, un peu plus long), et envoi vers la réverbération.

import { REFERENCE_DISTANCE_METERS, SPEED_OF_SOUND_METERS_PER_SECOND } from '../config.ts';
import { OnePoleLowpass } from './dspPrimitives.ts';

/** Fréquence de coupure de l'absorption de l'air : de NEAR (tout près) vers FAR (très loin). */
const AIR_ABSORPTION_NEAR_CUTOFF_HZ = 18000;
const AIR_ABSORPTION_FAR_CUTOFF_HZ = 1800;
const AIR_ABSORPTION_DISTANCE_SCALE_METERS = 120;
/** Hauteur du micro au-dessus du sol (m). */
export const MICROPHONE_HEIGHT_METERS = 1.5;
/** Part du son renvoyée par le sol (asphalte ≈ très réfléchissant, mais un peu sourd). */
const GROUND_REFLECTION_COEFFICIENT = 0.8;
const GROUND_ABSORPTION_CUTOFF_HZ = 6000;

export interface PropagationSettings {
  /** Dose de réflexion du sol (0 = coupée). */
  groundReflectionAmount: number;
  /** Hauteur de la source (sortie d'échappement) au-dessus du sol (m). */
  sourceHeightMeters: number;
}

export class DopplerLine {
  private readonly sampleRate: number;
  private readonly delayBuffer: Float32Array;
  private writeIndex = 0;
  private readonly airAbsorption: OnePoleLowpass;
  private readonly groundAbsorption: OnePoleLowpass;

  /**
   * @param sampleRate fréquence d'échantillonnage (Hz)
   * @param maxDistanceMeters distance maximale prise en charge (m)
   */
  constructor(sampleRate: number, maxDistanceMeters: number) {
    this.sampleRate = sampleRate;
    // Marge pour le trajet réfléchi par le sol, un peu plus long que le trajet direct.
    const MAX_GROUND_PATH_EXTRA_METERS = 10;
    const maxDelaySamples = Math.ceil(((maxDistanceMeters + MAX_GROUND_PATH_EXTRA_METERS) / SPEED_OF_SOUND_METERS_PER_SECOND) * sampleRate);
    this.delayBuffer = new Float32Array(maxDelaySamples + 4);
    this.airAbsorption = new OnePoleLowpass(sampleRate, AIR_ABSORPTION_NEAR_CUTOFF_HZ);
    this.groundAbsorption = new OnePoleLowpass(sampleRate, GROUND_ABSORPTION_CUTOFF_HZ);
    this.maxDistanceMeters = maxDistanceMeters;
  }

  private readonly maxDistanceMeters: number;

  /** Vide la ligne à retard. */
  reset(): void {
    this.delayBuffer.fill(0);
    this.writeIndex = 0;
    this.airAbsorption.reset();
    this.groundAbsorption.reset();
  }

  /**
   * Distance maximale utilisable (m).
   * @returns distance maximale
   */
  getMaxDistanceMeters(): number {
    return this.maxDistanceMeters;
  }

  /**
   * Applique la propagation sur un bloc, sur place. La distance est interpolée sur le bloc.
   * @param block échantillons émis par le véhicule (remplacés par ce qu'entend le micro)
   * @param startDistance distance au début du bloc (m)
   * @param endDistance distance à la fin du bloc (m)
   * @param settings réflexion du sol et hauteur de la source
   * @param reverbSend reçoit le son retardé, sans atténuation de distance (entrée de la réverbération)
   */
  processBlock(block: Float32Array, startDistance: number, endDistance: number, settings: PropagationSettings, reverbSend: Float32Array): void {
    const blockLength = block.length;
    const middleDistance = Math.min(Math.max((startDistance + endDistance) / 2, 0), this.maxDistanceMeters);
    this.airAbsorption.setCutoff(computeAirAbsorptionCutoff(middleDistance));
    const heightDifference = MICROPHONE_HEIGHT_METERS - settings.sourceHeightMeters;
    const heightSum = MICROPHONE_HEIGHT_METERS + settings.sourceHeightMeters;

    for (let frameIndex = 0; frameIndex < blockLength; frameIndex++) {
      const rawDistance = startDistance + ((endDistance - startDistance) * frameIndex) / blockLength;
      const directDistance = Math.min(Math.max(rawDistance, 0), this.maxDistanceMeters);
      this.delayBuffer[this.writeIndex] = block[frameIndex];

      const directSample = this.readDelayed(directDistance);
      const directGain = REFERENCE_DISTANCE_METERS / Math.max(directDistance, REFERENCE_DISTANCE_METERS);
      let heardSample = directSample * directGain;

      if (settings.groundReflectionAmount > 0) {
        // Trajet par le sol : même distance au sol que le trajet direct, mais source « miroir » sous le sol.
        const groundDistance = Math.sqrt(Math.max(directDistance * directDistance - heightDifference * heightDifference, 0));
        const reflectedDistance = Math.hypot(groundDistance, heightSum);
        const reflectedGain = REFERENCE_DISTANCE_METERS / Math.max(reflectedDistance, REFERENCE_DISTANCE_METERS);
        const reflectedSample = this.groundAbsorption.process(this.readDelayed(reflectedDistance));
        heardSample += reflectedSample * reflectedGain * GROUND_REFLECTION_COEFFICIENT * settings.groundReflectionAmount;
      }

      block[frameIndex] = this.airAbsorption.process(heardSample);
      reverbSend[frameIndex] = directSample;
      this.writeIndex = (this.writeIndex + 1) % this.delayBuffer.length;
    }
  }

  /**
   * Lit le son émis il y a « distance / vitesse du son » secondes (interpolation linéaire).
   * @param distanceMeters longueur du trajet (m)
   * @returns échantillon retardé
   */
  private readDelayed(distanceMeters: number): number {
    const bufferLength = this.delayBuffer.length;
    const delaySamples = (distanceMeters / SPEED_OF_SOUND_METERS_PER_SECOND) * this.sampleRate;
    let readPosition = this.writeIndex - delaySamples;
    if (readPosition < 0) readPosition += bufferLength;
    const readIndex = Math.floor(readPosition);
    const fraction = readPosition - readIndex;
    const nextReadIndex = (readIndex + 1) % bufferLength;
    return this.delayBuffer[readIndex] * (1 - fraction) + this.delayBuffer[nextReadIndex] * fraction;
  }
}

/**
 * Fréquence de coupure simulant la perte d'aigus avec la distance.
 * @param distanceMeters distance (m)
 * @returns fréquence de coupure (Hz)
 */
function computeAirAbsorptionCutoff(distanceMeters: number): number {
  const farness = 1 - Math.exp(-distanceMeters / AIR_ABSORPTION_DISTANCE_SCALE_METERS);
  return AIR_ABSORPTION_NEAR_CUTOFF_HZ + (AIR_ABSORPTION_FAR_CUTOFF_HZ - AIR_ABSORPTION_NEAR_CUTOFF_HZ) * farness;
}
