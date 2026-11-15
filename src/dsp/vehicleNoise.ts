// Bruits du véhicule en mouvement, selon la vitesse : roulement des pneus et vent.
// Pneus : surtout un grondement grave / médium (pas de grésillement aigu, qui sonne comme de la pluie),
// un ton qui suit la vitesse (les pavés de la bande de roulement qui frappent la route),
// le rythme de rotation des roues et une texture de route qui varie lentement.

import { NOISE_SEED } from '../config.ts';
import { BandpassFilter, NoiseGenerator, OnePoleLowpass } from './dspPrimitives.ts';

/** Vitesse de référence (km/h) des niveaux ci-dessous. */
const REFERENCE_SPEED_KMH = 100;
const KMH_TO_METERS_PER_SECOND = 1 / 3.6;
/** Le bruit des pneus croît d'environ 35 dB par décade de vitesse → exposant 1,75 sur l'amplitude. */
const TIRE_LEVEL_EXPONENT = 1.75;
/** Le vent croît plus vite (puissance aérodynamique) → exposant 3. */
const WIND_LEVEL_EXPONENT = 3;
/** Gains calibrés (npm run check-levels) : à 5 m, pneus ≈ -4 dB sous une voiture à 3500 tr/min à 100 km/h, vent ≈ -10 dB à 130 km/h. */
const TIRE_GAIN = 0.84;
const WIND_GAIN = 0.43;

// --- Pneus ---
/** Grondement : bruit filtré deux fois vers le grave-médium. */
const TIRE_ROAR_CUTOFF_HZ = 550;
const TIRE_ROAR_GAIN = 1;
/** Grondement très grave (contact, carrosserie). */
const TIRE_RUMBLE_CUTOFF_HZ = 110;
const TIRE_RUMBLE_GAIN = 1.2;
/** Ton de bande de roulement : fréquence = vitesse / écart entre pavés ; résonance assez étroite. */
const TREAD_PITCH_METERS = 0.03;
const TREAD_TONE_QUALITY = 5;
const TREAD_TONE_GAIN = 0.5;
/** Coupe des aigus du bruit de pneu (supprime le chuintement « pluie »). */
const TIRE_TOP_CUTOFF_HZ = 1800;
/** Rotation des roues : circonférence (m) et profondeur de la modulation de volume. */
const WHEEL_CIRCUMFERENCE_METERS = 2;
const WHEEL_RHYTHM_DEPTH = 0.15;
/** Texture de route : variation lente du niveau (nouvelle valeur tous les ~0,3 s, lissée). */
const ROAD_TEXTURE_PERIOD_SECONDS = 0.3;
const ROAD_TEXTURE_SMOOTHING_HZ = 2;
const ROAD_TEXTURE_DEPTH = 0.25;

// --- Vent ---
const WIND_CUTOFF_HZ = 380;
/** Rafales : variation lente du vent. */
const GUST_PERIOD_SECONDS = 0.7;
const GUST_SMOOTHING_HZ = 0.6;
const GUST_DEPTH = 0.35;
const MAX_SPEED_KMH = 400;

/** Valeur aléatoire lente : nouvelle cible à intervalle régulier, lissée. */
class SlowRandomValue {
  private heldTarget = 0;
  private countdown = 0;
  private readonly periodSamples: number;
  private readonly smoothing: OnePoleLowpass;

  /**
   * @param sampleRate fréquence d'échantillonnage (Hz)
   * @param periodSeconds intervalle entre deux nouvelles cibles (s)
   * @param smoothingHz lissage (Hz)
   */
  constructor(sampleRate: number, periodSeconds: number, smoothingHz: number) {
    this.periodSamples = Math.round(periodSeconds * sampleRate);
    this.smoothing = new OnePoleLowpass(sampleRate, smoothingHz);
  }

  /** Remet à zéro. */
  reset(): void {
    this.heldTarget = 0;
    this.countdown = 0;
    this.smoothing.reset();
  }

  /**
   * @param noiseGenerator source aléatoire (déterministe)
   * @returns valeur lissée entre -1 et 1 environ
   */
  next(noiseGenerator: NoiseGenerator): number {
    this.countdown--;
    if (this.countdown <= 0) {
      this.heldTarget = noiseGenerator.nextSample();
      this.countdown = this.periodSamples;
    }
    return this.smoothing.process(this.heldTarget);
  }
}

export class VehicleNoise {
  private readonly sampleRate: number;
  private readonly noiseGenerator = new NoiseGenerator(NOISE_SEED ^ 0x27d4eb2f);
  private readonly tireRoarFilter: OnePoleLowpass;
  private readonly tireRoarSecondFilter: OnePoleLowpass;
  private readonly tireRumbleFilter: OnePoleLowpass;
  private readonly treadToneFilter: BandpassFilter;
  private readonly tireTopFilter: OnePoleLowpass;
  private readonly roadTexture: SlowRandomValue;
  private wheelPhase = 0;
  private readonly windFilter: OnePoleLowpass;
  private readonly windSecondFilter: OnePoleLowpass;
  private readonly gusts: SlowRandomValue;

  /**
   * @param sampleRate fréquence d'échantillonnage (Hz)
   */
  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
    this.tireRoarFilter = new OnePoleLowpass(sampleRate, TIRE_ROAR_CUTOFF_HZ);
    this.tireRoarSecondFilter = new OnePoleLowpass(sampleRate, TIRE_ROAR_CUTOFF_HZ);
    this.tireRumbleFilter = new OnePoleLowpass(sampleRate, TIRE_RUMBLE_CUTOFF_HZ);
    this.treadToneFilter = new BandpassFilter(sampleRate, 500, TREAD_TONE_QUALITY);
    this.tireTopFilter = new OnePoleLowpass(sampleRate, TIRE_TOP_CUTOFF_HZ);
    this.roadTexture = new SlowRandomValue(sampleRate, ROAD_TEXTURE_PERIOD_SECONDS, ROAD_TEXTURE_SMOOTHING_HZ);
    this.windFilter = new OnePoleLowpass(sampleRate, WIND_CUTOFF_HZ);
    this.windSecondFilter = new OnePoleLowpass(sampleRate, WIND_CUTOFF_HZ);
    this.gusts = new SlowRandomValue(sampleRate, GUST_PERIOD_SECONDS, GUST_SMOOTHING_HZ);
  }

  /** Remet les bruits à zéro. */
  reset(): void {
    this.noiseGenerator.reset();
    this.tireRoarFilter.reset();
    this.tireRoarSecondFilter.reset();
    this.tireRumbleFilter.reset();
    this.treadToneFilter.reset();
    this.tireTopFilter.reset();
    this.roadTexture.reset();
    this.wheelPhase = 0;
    this.windFilter.reset();
    this.windSecondFilter.reset();
    this.gusts.reset();
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
    // Le ton de bande de roulement suit la vitesse : fréquence mise à jour une fois par bloc.
    const middleSpeedMetersPerSecond = (Math.max(0, (startSpeedKmh + endSpeedKmh) / 2) * KMH_TO_METERS_PER_SECOND);
    this.treadToneFilter.setFrequency(middleSpeedMetersPerSecond / TREAD_PITCH_METERS, TREAD_TONE_QUALITY);

    for (let frameIndex = 0; frameIndex < blockLength; frameIndex++) {
      const speedKmh = Math.min(Math.max(startSpeedKmh + ((endSpeedKmh - startSpeedKmh) * frameIndex) / blockLength, 0), MAX_SPEED_KMH);
      const relativeSpeed = speedKmh / REFERENCE_SPEED_KMH;
      const noiseSample = this.noiseGenerator.nextSample();

      const tireSample = this.computeTireSample(noiseSample, speedKmh);
      const tireLevel = tireAmount * TIRE_GAIN * Math.pow(relativeSpeed, TIRE_LEVEL_EXPONENT);

      const gust = 1 + GUST_DEPTH * this.gusts.next(this.noiseGenerator);
      const windSample = this.windSecondFilter.process(this.windFilter.process(noiseSample));
      const windLevel = windAmount * WIND_GAIN * Math.pow(relativeSpeed, WIND_LEVEL_EXPONENT) * gust;

      block[frameIndex] += tireSample * tireLevel + windSample * windLevel;
    }
  }

  /**
   * Un échantillon de bruit de pneu (avant le niveau lié à la vitesse) : grondement + ton de bande de roulement,
   * modulés par la rotation des roues et la texture de la route, sans aigus.
   * @param noiseSample bruit blanc
   * @param speedKmh vitesse (km/h)
   * @returns échantillon
   */
  private computeTireSample(noiseSample: number, speedKmh: number): number {
    this.wheelPhase += (speedKmh * KMH_TO_METERS_PER_SECOND) / WHEEL_CIRCUMFERENCE_METERS / this.sampleRate;
    this.wheelPhase -= Math.floor(this.wheelPhase);
    const wheelRhythm = 1 + WHEEL_RHYTHM_DEPTH * Math.sin(2 * Math.PI * this.wheelPhase);
    const roadTexture = 1 + ROAD_TEXTURE_DEPTH * this.roadTexture.next(this.noiseGenerator);

    const roarSample = this.tireRoarSecondFilter.process(this.tireRoarFilter.process(noiseSample)) * TIRE_ROAR_GAIN;
    const rumbleSample = this.tireRumbleFilter.process(noiseSample) * TIRE_RUMBLE_GAIN;
    const treadSample = this.treadToneFilter.process(noiseSample) * TREAD_TONE_GAIN;
    return this.tireTopFilter.process(roarSample + rumbleSample + treadSample) * wheelRhythm * roadTexture;
  }
}
