// Rendu d'un projet complet bloc par bloc : courbes → moteur + pneus/vent → propagation (Doppler, sol) → réverbération.
// Utilisé tel quel par l'AudioWorklet (aperçu) et par le Worker d'export : les deux donnent le même son.

import { MAX_DOPPLER_DISTANCE_METERS, RENDER_BLOCK_SIZE, SPEED_OF_SOUND_METERS_PER_SECOND } from '../config.ts';
import { evaluateCurve } from '../model/automationCurve.ts';
import { getEffectAmount } from '../model/effects.ts';
import type { Project } from '../model/project.ts';
import { DopplerLine, type PropagationSettings } from './dopplerLine.ts';
import { EngineSynth } from './engineSynth.ts';
import { OutdoorReverb } from './outdoorReverb.ts';
import { VehicleNoise } from './vehicleNoise.ts';
import { getVehicleProfile } from './vehicleProfiles.ts';

/** Charge estimée quand le régime est stable. */
const STEADY_LOAD = 0.45;
/** Variation de régime (tr/min par seconde) qui fait passer la charge de stable à pleine. */
const FULL_LOAD_RPM_RATE = 4000;
const MIN_LOAD = 0.05;
/** Lissage de la charge par bloc (0 = figé, 1 = immédiat). */
const LOAD_SMOOTHING_PER_BLOCK = 0.08;
/** Marge ajoutée au pré-rendu : remplit la ligne à retard et installe la réverbération (s). */
const PRIME_MARGIN_SECONDS = 0.4;
/** Volume de la réverbération (dose 1), calibré pour égaler le son direct vers 40 m (npm run check-levels). */
const REVERB_WET_GAIN = 0.13;
/** Limiteur final : linéaire jusqu'à ce seuil, puis arrondi doux vers 1 (évite l'écrêtage dur si tout est poussé à fond). */
const LIMITER_THRESHOLD = 0.8;

export class ProjectRenderer {
  private readonly sampleRate: number;
  private readonly engineSynth: EngineSynth;
  private readonly vehicleNoise: VehicleNoise;
  private readonly dopplerLine: DopplerLine;
  private readonly outdoorReverb: OutdoorReverb;
  private readonly reverbSend = new Float32Array(RENDER_BLOCK_SIZE);
  private project: Project | null = null;
  private currentLoad = STEADY_LOAD;
  private propagationSettings: PropagationSettings = { groundReflectionAmount: 0, sourceHeightMeters: 0.3 };
  private reverbAmount = 0;
  private tireAmount = 0;
  private windAmount = 0;

  /**
   * @param sampleRate fréquence d'échantillonnage (Hz)
   */
  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
    this.engineSynth = new EngineSynth(sampleRate);
    this.vehicleNoise = new VehicleNoise(sampleRate);
    this.dopplerLine = new DopplerLine(sampleRate, MAX_DOPPLER_DISTANCE_METERS);
    this.outdoorReverb = new OutdoorReverb(sampleRate);
  }

  /**
   * Remplace le projet rendu, reconfigure le moteur et relit les doses d'effets.
   * @param project projet à rendre
   */
  setProject(project: Project): void {
    this.project = project;
    this.engineSynth.configure(project.engine, project.effects);
    const profile = getVehicleProfile(project.engine.profileId);
    this.propagationSettings = {
      groundReflectionAmount: Math.min(1, getEffectAmount(project.effects, 'groundReflection')),
      sourceHeightMeters: profile.exhaustHeightMeters,
    };
    this.reverbAmount = getEffectAmount(project.effects, 'reverb');
    this.tireAmount = getEffectAmount(project.effects, 'tireNoise') * profile.tireNoiseScale;
    this.windAmount = getEffectAmount(project.effects, 'windNoise');
  }

  /**
   * Remet tout à zéro puis pré-calcule (sans le garder) le son juste avant `startTimeSeconds`,
   * pour que la ligne Doppler et la réverbération soient déjà remplies au début de la lecture ou de l'export.
   * @param startTimeSeconds instant de départ (s)
   */
  primeAt(startTimeSeconds: number): void {
    const project = this.project;
    if (!project) return;
    this.engineSynth.reset();
    this.vehicleNoise.reset();
    this.dopplerLine.reset();
    this.outdoorReverb.reset();
    this.currentLoad = STEADY_LOAD;

    const startDistance = Math.min(evaluateCurve(project.curves.distance, startTimeSeconds), this.dopplerLine.getMaxDistanceMeters());
    const primeSeconds = startDistance / SPEED_OF_SOUND_METERS_PER_SECOND + PRIME_MARGIN_SECONDS;
    const primeBlockCount = Math.ceil((primeSeconds * this.sampleRate) / RENDER_BLOCK_SIZE);
    const scratchBlock = new Float32Array(RENDER_BLOCK_SIZE);
    let blockTime = startTimeSeconds - (primeBlockCount * RENDER_BLOCK_SIZE) / this.sampleRate;
    for (let blockIndex = 0; blockIndex < primeBlockCount; blockIndex++) {
      this.renderBlock(scratchBlock, blockTime);
      blockTime += RENDER_BLOCK_SIZE / this.sampleRate;
    }
  }

  /**
   * Calcule un bloc d'échantillons mono à partir de l'instant donné (au plus RENDER_BLOCK_SIZE échantillons).
   * @param output tampon à remplir (sa longueur fixe la taille du bloc)
   * @param startTimeSeconds instant du premier échantillon (s)
   */
  renderBlock(output: Float32Array, startTimeSeconds: number): void {
    const project = this.project;
    if (!project) {
      output.fill(0);
      return;
    }
    const blockDuration = output.length / this.sampleRate;
    const endTimeSeconds = startTimeSeconds + blockDuration;
    const curves = project.curves;
    const startRpm = Math.max(0, evaluateCurve(curves.rpm, startTimeSeconds));
    const endRpm = Math.max(0, evaluateCurve(curves.rpm, endTimeSeconds));

    const startLoad = this.currentLoad;
    const targetLoad = estimateEngineLoad((endRpm - startRpm) / blockDuration);
    this.currentLoad += (targetLoad - this.currentLoad) * LOAD_SMOOTHING_PER_BLOCK;

    this.engineSynth.renderBlock(output, startRpm, endRpm, startLoad, this.currentLoad);
    this.vehicleNoise.processBlockAdd(
      output,
      evaluateCurve(curves.speed, startTimeSeconds),
      evaluateCurve(curves.speed, endTimeSeconds),
      this.tireAmount,
      this.windAmount,
    );

    const reverbSend = this.reverbSend.subarray(0, output.length);
    this.dopplerLine.processBlock(
      output,
      evaluateCurve(curves.distance, startTimeSeconds),
      evaluateCurve(curves.distance, endTimeSeconds),
      this.propagationSettings,
      reverbSend,
    );
    if (this.reverbAmount > 0) this.outdoorReverb.processBlockAdd(reverbSend, output, this.reverbAmount * REVERB_WET_GAIN);
    for (let frameIndex = 0; frameIndex < output.length; frameIndex++) output[frameIndex] = applySoftLimiter(output[frameIndex]);
  }
}

/**
 * Estime la charge moteur à partir de la variation de régime : accélération = pleine charge, décélération = frein moteur.
 * (En attendant une vraie courbe d'accélérateur dans la timeline.)
 * @param rpmRate variation de régime (tr/min par seconde)
 * @returns charge entre MIN_LOAD et 1
 */
function estimateEngineLoad(rpmRate: number): number {
  return Math.min(1, Math.max(MIN_LOAD, STEADY_LOAD + rpmRate / FULL_LOAD_RPM_RATE));
}

/**
 * Limiteur doux : inchangé sous LIMITER_THRESHOLD, puis compression progressive qui ne dépasse jamais 1.
 * @param sample échantillon
 * @returns échantillon limité
 */
function applySoftLimiter(sample: number): number {
  const magnitude = Math.abs(sample);
  if (magnitude <= LIMITER_THRESHOLD) return sample;
  const headroom = 1 - LIMITER_THRESHOLD;
  const limitedMagnitude = LIMITER_THRESHOLD + headroom * Math.tanh((magnitude - LIMITER_THRESHOLD) / headroom);
  return Math.sign(sample) * limitedMagnitude;
}
