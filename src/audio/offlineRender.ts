// Rendu hors ligne d'un projet entier (sans Web Audio) : utilisé par le Worker d'export et par le script de vérification Node.

import { RENDER_BLOCK_SIZE } from '../config.ts';
import { ProjectRenderer } from '../dsp/projectRenderer.ts';
import type { Project } from '../model/project.ts';

/** Niveau crête visé par la normalisation (-1 dBFS). */
export const NORMALIZE_TARGET_PEAK = 0.891;

/**
 * Calcule tout le son d'un projet, du temps 0 à la fin.
 * @param project projet à rendre
 * @param sampleRate fréquence d'échantillonnage (Hz)
 * @param onProgress appelé régulièrement avec l'avancement (0 à 1)
 * @returns échantillons mono
 */
export function renderProjectOffline(project: Project, sampleRate: number, onProgress?: (progress: number) => void): Float32Array {
  const PROGRESS_REPORT_EVERY_BLOCKS = 200;
  const renderer = new ProjectRenderer(sampleRate);
  renderer.setProject(project);
  renderer.primeAt(0);

  const totalFrameCount = Math.ceil(project.durationSeconds * sampleRate);
  const samples = new Float32Array(totalFrameCount);
  let blockIndex = 0;
  for (let frameOffset = 0; frameOffset < totalFrameCount; frameOffset += RENDER_BLOCK_SIZE) {
    const blockEnd = Math.min(frameOffset + RENDER_BLOCK_SIZE, totalFrameCount);
    renderer.renderBlock(samples.subarray(frameOffset, blockEnd), frameOffset / sampleRate);
    blockIndex++;
    if (onProgress && blockIndex % PROGRESS_REPORT_EVERY_BLOCKS === 0) onProgress(blockEnd / totalFrameCount);
  }
  onProgress?.(1);
  return samples;
}

/**
 * Mesure le niveau crête d'un signal.
 * @param samples échantillons
 * @returns valeur absolue maximale
 */
export function measurePeak(samples: Float32Array): number {
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  return peak;
}

/**
 * Normalise sur place le signal à -1 dBFS crête.
 * @param samples échantillons (modifiés)
 */
export function normalizePeak(samples: Float32Array): void {
  const peak = measurePeak(samples);
  if (peak <= 0) return;
  const gain = NORMALIZE_TARGET_PEAK / peak;
  for (let frameIndex = 0; frameIndex < samples.length; frameIndex++) samples[frameIndex] *= gain;
}
