// Messages échangés entre le fil principal, l'AudioWorklet et le Worker d'export.

import type { Project } from '../model/project.ts';
import type { WavSampleFormat } from './wavEncoder.ts';

/** Fil principal → AudioWorklet. */
export type WorkletCommand =
  | { type: 'setProject'; project: Project }
  | { type: 'play'; fromTimeSeconds: number }
  | { type: 'stop' };

/** AudioWorklet → fil principal. */
export type WorkletEvent =
  | { type: 'playhead'; timeSeconds: number }
  | { type: 'ended' };

/** Fil principal → Worker d'export. */
export interface ExportRequest {
  project: Project;
  sampleFormat: WavSampleFormat;
  shouldNormalize: boolean;
}

/** Worker d'export → fil principal. */
export type ExportEvent =
  | { type: 'progress'; progress: number }
  | { type: 'done'; wavBuffer: ArrayBuffer }
  | { type: 'error'; message: string };
