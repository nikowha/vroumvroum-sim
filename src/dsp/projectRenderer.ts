// Rendu d'un projet complet bloc par bloc : courbes → moteur → Doppler.
// Utilisé tel quel par l'AudioWorklet (aperçu) et par le Worker d'export : les deux donnent le même son.

import { MAX_DOPPLER_DISTANCE_METERS, RENDER_BLOCK_SIZE, SPEED_OF_SOUND_METERS_PER_SECOND } from '../config.ts';
import { evaluateCurve } from '../model/automationCurve.ts';
import type { Project } from '../model/project.ts';
import { DopplerLine } from './dopplerLine.ts';
import { EngineSynth } from './engineSynth.ts';

/** Charge estimée quand le régime est stable. */
const STEADY_LOAD = 0.45;
/** Variation de régime (tr/min par seconde) qui fait passer la charge de stable à pleine. */
const FULL_LOAD_RPM_RATE = 4000;
const MIN_LOAD = 0.05;
/** Lissage de la charge par bloc (0 = figé, 1 = immédiat). */
const LOAD_SMOOTHING_PER_BLOCK = 0.08;
/** Marge ajoutée au pré-rendu pour remplir la ligne à retard (s). */
const PRIME_MARGIN_SECONDS = 0.05;

export class ProjectRenderer {
  private readonly sampleRate: number;
  private readonly engineSynth: EngineSynth;
  private readonly dopplerLine: DopplerLine;
  private project: Project | null = null;
  private currentLoad = STEADY_LOAD;

  /**
   * @param sampleRate fréquence d'échantillonnage (Hz)
   */
  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
    this.engineSynth = new EngineSynth(sampleRate);
    this.dopplerLine = new DopplerLine(sampleRate, MAX_DOPPLER_DISTANCE_METERS);
  }

  /**
   * Remplace le projet rendu et reconfigure le moteur.
   * @param project projet à rendre
   */
  setProject(project: Project): void {
    this.project = project;
    this.engineSynth.configure(project.engine);
  }

  /**
   * Remet tout à zéro puis pré-calcule (sans le garder) le son juste avant `startTimeSeconds`,
   * pour que la ligne Doppler soit déjà remplie au début de la lecture ou de l'export.
   * @param startTimeSeconds instant de départ (s)
   */
  primeAt(startTimeSeconds: number): void {
    const project = this.project;
    if (!project) return;
    this.engineSynth.reset();
    this.dopplerLine.reset();
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
   * Calcule un bloc d'échantillons mono à partir de l'instant donné.
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
    const startRpm = Math.max(0, evaluateCurve(project.curves.rpm, startTimeSeconds));
    const endRpm = Math.max(0, evaluateCurve(project.curves.rpm, endTimeSeconds));

    const startLoad = this.currentLoad;
    const targetLoad = estimateEngineLoad((endRpm - startRpm) / blockDuration);
    this.currentLoad += (targetLoad - this.currentLoad) * LOAD_SMOOTHING_PER_BLOCK;

    this.engineSynth.renderBlock(output, startRpm, endRpm, startLoad, this.currentLoad);
    this.dopplerLine.processBlock(
      output,
      evaluateCurve(project.curves.distance, startTimeSeconds),
      evaluateCurve(project.curves.distance, endTimeSeconds),
    );
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
