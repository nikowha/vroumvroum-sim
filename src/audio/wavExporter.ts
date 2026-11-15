// Côté fil principal de l'export : lance le Worker et renvoie le fichier WAV.

import type { Project } from '../model/project.ts';
import type { ExportEvent, ExportRequest } from './messages.ts';
import type { WavSampleFormat } from './wavEncoder.ts';

/**
 * Rend le projet en WAV dans un Worker.
 * @param project projet à exporter
 * @param sampleFormat 'pcm24' ou 'float32'
 * @param shouldNormalize normaliser à -1 dBFS crête
 * @param onProgress avancement (0 à 1)
 * @returns fichier WAV
 */
export function exportProjectToWav(
  project: Project,
  sampleFormat: WavSampleFormat,
  shouldNormalize: boolean,
  onProgress: (progress: number) => void,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const exportWorker = new Worker(new URL('./exportWorker.ts', import.meta.url), { type: 'module' });
    exportWorker.addEventListener('message', (messageEvent: MessageEvent<ExportEvent>) => {
      const exportEvent = messageEvent.data;
      if (exportEvent.type === 'progress') {
        onProgress(exportEvent.progress);
      } else if (exportEvent.type === 'done') {
        exportWorker.terminate();
        resolve(new Blob([exportEvent.wavBuffer], { type: 'audio/wav' }));
      } else {
        exportWorker.terminate();
        reject(new Error(`exportProjectToWav: ${exportEvent.message}`));
      }
    });
    exportWorker.addEventListener('error', (errorEvent) => {
      exportWorker.terminate();
      reject(new Error(`exportProjectToWav: ${errorEvent.message}`));
    });
    const exportRequest: ExportRequest = { project: structuredClone(project), sampleFormat, shouldNormalize };
    exportWorker.postMessage(exportRequest);
  });
}
