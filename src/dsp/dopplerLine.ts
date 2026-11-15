// Effet de distance : retard variable (Doppler), atténuation en 1/distance et absorption de l'air (aigus).

import { REFERENCE_DISTANCE_METERS, SPEED_OF_SOUND_METERS_PER_SECOND } from '../config.ts';
import { OnePoleLowpass } from './dspPrimitives.ts';

/** Fréquence de coupure de l'absorption de l'air : de NEAR (tout près) vers FAR (très loin). */
const AIR_ABSORPTION_NEAR_CUTOFF_HZ = 18000;
const AIR_ABSORPTION_FAR_CUTOFF_HZ = 1800;
const AIR_ABSORPTION_DISTANCE_SCALE_METERS = 120;

export class DopplerLine {
  private readonly sampleRate: number;
  private readonly delayBuffer: Float32Array;
  private writeIndex = 0;
  private readonly airAbsorption: OnePoleLowpass;

  /**
   * @param sampleRate fréquence d'échantillonnage (Hz)
   * @param maxDistanceMeters distance maximale prise en charge (m)
   */
  constructor(sampleRate: number, maxDistanceMeters: number) {
    this.sampleRate = sampleRate;
    const maxDelaySamples = Math.ceil((maxDistanceMeters / SPEED_OF_SOUND_METERS_PER_SECOND) * sampleRate);
    this.delayBuffer = new Float32Array(maxDelaySamples + 4);
    this.airAbsorption = new OnePoleLowpass(sampleRate, AIR_ABSORPTION_NEAR_CUTOFF_HZ);
  }

  /** Vide la ligne à retard. */
  reset(): void {
    this.delayBuffer.fill(0);
    this.writeIndex = 0;
    this.airAbsorption.reset();
  }

  /**
   * Distance maximale réellement utilisable (m).
   * @returns distance maximale
   */
  getMaxDistanceMeters(): number {
    return ((this.delayBuffer.length - 4) / this.sampleRate) * SPEED_OF_SOUND_METERS_PER_SECOND;
  }

  /**
   * Applique retard, atténuation et absorption sur un bloc, sur place. La distance est interpolée sur le bloc.
   * @param block échantillons (modifiés)
   * @param startDistance distance au début du bloc (m)
   * @param endDistance distance à la fin du bloc (m)
   */
  processBlock(block: Float32Array, startDistance: number, endDistance: number): void {
    const bufferLength = this.delayBuffer.length;
    const maxDistance = this.getMaxDistanceMeters();
    const blockLength = block.length;
    const middleDistance = Math.min(Math.max((startDistance + endDistance) / 2, 0), maxDistance);
    this.airAbsorption.setCutoff(computeAirAbsorptionCutoff(middleDistance));

    for (let frameIndex = 0; frameIndex < blockLength; frameIndex++) {
      const rawDistance = startDistance + ((endDistance - startDistance) * frameIndex) / blockLength;
      const distance = Math.min(Math.max(rawDistance, 0), maxDistance);
      this.delayBuffer[this.writeIndex] = block[frameIndex];

      const delaySamples = (distance / SPEED_OF_SOUND_METERS_PER_SECOND) * this.sampleRate;
      let readPosition = this.writeIndex - delaySamples;
      if (readPosition < 0) readPosition += bufferLength;
      const readIndex = Math.floor(readPosition);
      const fraction = readPosition - readIndex;
      const nextReadIndex = (readIndex + 1) % bufferLength;
      const delayedSample = this.delayBuffer[readIndex] * (1 - fraction) + this.delayBuffer[nextReadIndex] * fraction;

      const distanceGain = REFERENCE_DISTANCE_METERS / Math.max(distance, REFERENCE_DISTANCE_METERS);
      block[frameIndex] = this.airAbsorption.process(delayedSample) * distanceGain;
      this.writeIndex = (this.writeIndex + 1) % bufferLength;
    }
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
