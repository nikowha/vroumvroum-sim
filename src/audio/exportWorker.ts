// Web Worker d'export : rendu hors ligne (même DSP que l'aperçu) puis encodage WAV, sans bloquer l'interface.

import { SAMPLE_RATE } from '../config.ts';
import type { ExportEvent, ExportRequest } from './messages.ts';
import { normalizePeak, renderProjectOffline } from './offlineRender.ts';
import { encodeWav } from './wavEncoder.ts';

/**
 * Envoie un événement au fil principal.
 * @param exportEvent événement à envoyer
 * @param transfer objets transférés sans copie
 */
function sendExportEvent(exportEvent: ExportEvent, transfer: Transferable[] = []): void {
  self.postMessage(exportEvent, { transfer });
}

self.addEventListener('message', (messageEvent: MessageEvent<ExportRequest>) => {
  try {
    const exportRequest = messageEvent.data;
    const samples = renderProjectOffline(exportRequest.project, SAMPLE_RATE, (progress) => {
      sendExportEvent({ type: 'progress', progress });
    });
    if (exportRequest.shouldNormalize) normalizePeak(samples);
    const wavBuffer = encodeWav([samples], SAMPLE_RATE, exportRequest.sampleFormat);
    sendExportEvent({ type: 'done', wavBuffer }, [wavBuffer]);
  } catch (error) {
    console.error('exportWorker', error);
    sendExportEvent({ type: 'error', message: String(error) });
  }
});
