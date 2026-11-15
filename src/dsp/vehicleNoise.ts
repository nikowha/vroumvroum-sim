// Bruits du véhicule en mouvement, selon la vitesse : roulement des pneus et vent.

import { NOISE_SEED } from '../config.ts';
import { BandpassFilter, NoiseGenerator, OnePoleLowpass } from './dspPrimitives.ts';

/** Vitesse de référence (km/h) des niveaux ci-dessous. */
const REFERENCE_SPEED_KMH = 100;
/** Le bruit des pneus croît d'environ 35 dB par décade de vitesse → exposant 1,75 sur l'amplitude. */
const TIRE_LEVEL_EXPONENT = 1.75;
/** Le vent croît plus vite (puissance aérodynamique) → exposant 3. */
const WIND_LEVEL_EXPONENT = 3;
/** Gains calibrés (npm run check-levels) : à 5 m, pneus ≈ -4 dB sous une voiture à 3500 tr/min à 100 km/h, vent ≈ -10 dB à 130 km/h. */
const TIRE_GAIN = 0.44;
const WIND_GAIN = 0.34;
/** Bandes du bruit de pneu : pic principal vers 1 kHz, sifflement plus aigu, grondement grave. */
const TIRE_MAIN_BAND = { frequencyHz: 950, quality: 0.8, gain: 1 };
const TIRE_HIGH_BAND = { frequencyHz: 2600, quality: 1.2, gain: 0.45 };
const TIRE_RUMBLE_CUTOFF_HZ = 140;
const TIRE_RUMBLE_GAIN = 0.8;
const WIND_CUTOFF_HZ = 380;
/** Rafales : variation lente du vent (Hz) et profondeur. */
const GUST_SMOOTHING_HZ = 0.6;
const GUST_DEPTH = 0.35;
const MAX_SPEED_KMH = 400;

export class VehicleNoise {
  private readonly noiseGenerator = new NoiseGenerator(NOISE_SEED ^ 0x27d4eb2f);
  private readonly tireMainFilter: BandpassFilter;
  private readonly tireHighFilter: BandpassFilter;
  private readonly tireRumbleFilter: OnePoleLowpass;
  private readonly windFilter: OnePoleLowpass;
  private readonly windSecondFilter: OnePoleLowpass;
  private readonly gustFilter: OnePoleLowpass;
  private heldGustTarget = 0;
  private gustCountdown = 0;
  private readonly sampleRate: number;

  /**
   * @param sampleRate fréquence d'échantillonnage (Hz)
   */
  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
    this.tireMainFilter = new BandpassFilter(sampleRate, TIRE_MAIN_BAND.frequencyHz, TIRE_MAIN_BAND.quality);
    this.tireHighFilter = new BandpassFilter(sampleRate, TIRE_HIGH_BAND.frequencyHz, TIRE_HIGH_BAND.quality);
    this.tireRumbleFilter = new OnePoleLowpass(sampleRate, TIRE_RUMBLE_CUTOFF_HZ);
    this.windFilter = new OnePoleLowpass(sampleRate, WIND_CUTOFF_HZ);
    this.windSecondFilter = new OnePoleLowpass(sampleRate, WIND_CUTOFF_HZ);
    this.gustFilter = new OnePoleLowpass(sampleRate, GUST_SMOOTHING_HZ);
  }

  /** Remet les bruits à zéro. */
  reset(): void {
    this.noiseGenerator.reset();
    this.tireMainFilter.reset();
    this.tireHighFilter.reset();
    this.tireRumbleFilter.reset();
    this.windFilter.reset();
    this.windSecondFilter.reset();
    this.gustFilter.reset();
    this.heldGustTarget = 0;
    this.gustCountdown = 0;
  }

  /**
   * Ajoute pneus et vent au bloc ; la vitesse est interpolée sur le bloc.
   * @param block bloc auquel les bruits sont ajoutés
   * @param startSpeedKmh vitesse au début du bloc (km/h)
   * @param endSpeedKmh vitesse à la fin du bloc (km/h)
   * @param tireAmount dose de bruit de pneus (déjà multipliée par l'échelle du profil)
   * @param windAmount dose de bruit de vent
   */
  processBlockAdd(block: Float32Array, startSpeedKmh: number, endSpeedKmh: number, tireAmount: number, windAmount: number): void {
    if (tireAmount <= 0 && windAmount <= 0) return;
    if (startSpeedKmh <= 0 && endSpeedKmh <= 0) return;
    const blockLength = block.length;
    for (let frameIndex = 0; frameIndex < blockLength; frameIndex++) {
      const speedKmh = Math.min(Math.max(startSpeedKmh + ((endSpeedKmh - startSpeedKmh) * frameIndex) / blockLength, 0), MAX_SPEED_KMH);
      const relativeSpeed = speedKmh / REFERENCE_SPEED_KMH;
      const noiseSample = this.noiseGenerator.nextSample();

      const tireSample =
        this.tireMainFilter.process(noiseSample) * TIRE_MAIN_BAND.gain +
        this.tireHighFilter.process(noiseSample) * TIRE_HIGH_BAND.gain +
        this.tireRumbleFilter.process(noiseSample) * TIRE_RUMBLE_GAIN;
      const tireLevel = tireAmount * TIRE_GAIN * Math.pow(relativeSpeed, TIRE_LEVEL_EXPONENT);

      const gust = 1 + GUST_DEPTH * this.nextGustValue();
      const windSample = this.windSecondFilter.process(this.windFilter.process(noiseSample));
      const windLevel = windAmount * WIND_GAIN * Math.pow(relativeSpeed, WIND_LEVEL_EXPONENT) * gust;

      block[frameIndex] += tireSample * tireLevel + windSample * windLevel;
    }
  }

  /**
   * Valeur lente et aléatoire des rafales (nouvelle cible environ toutes les 0,7 s, lissée).
   * @returns valeur entre -1 et 1 environ
   */
  private nextGustValue(): number {
    const GUST_TARGET_PERIOD_SECONDS = 0.7;
    this.gustCountdown--;
    if (this.gustCountdown <= 0) {
      this.heldGustTarget = this.noiseGenerator.nextSample();
      this.gustCountdown = Math.round(GUST_TARGET_PERIOD_SECONDS * this.sampleRate);
    }
    return this.gustFilter.process(this.heldGustTarget);
  }
}
