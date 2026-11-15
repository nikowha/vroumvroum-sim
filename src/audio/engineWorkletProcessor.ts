// AudioWorklet de l'aperçu temps réel : enveloppe le ProjectRenderer (même DSP que l'export).

import { ENGINE_PROCESSOR_NAME, PLAYHEAD_REPORT_INTERVAL_SECONDS } from '../config.ts';
import { ProjectRenderer } from '../dsp/projectRenderer.ts';
import type { Project } from '../model/project.ts';
import type { WorkletCommand, WorkletEvent } from './messages.ts';

class EngineWorkletProcessor extends AudioWorkletProcessor {
  private readonly renderer = new ProjectRenderer(sampleRate);
  private project: Project | null = null;
  private isPlaying = false;
  private playbackTimeSeconds = 0;
  private lastReportedTimeSeconds = -Infinity;

  constructor() {
    super();
    this.port.onmessage = (messageEvent: MessageEvent<WorkletCommand>) => this.handleCommand(messageEvent.data);
  }

  /**
   * Traite une commande venue du fil principal.
   * @param command commande reçue
   */
  private handleCommand(command: WorkletCommand): void {
    if (command.type === 'setProject') {
      this.project = command.project;
      this.renderer.setProject(command.project);
    } else if (command.type === 'play') {
      this.playbackTimeSeconds = command.fromTimeSeconds;
      this.renderer.primeAt(command.fromTimeSeconds);
      this.isPlaying = true;
      this.lastReportedTimeSeconds = -Infinity;
    } else if (command.type === 'stop') {
      this.isPlaying = false;
    }
  }

  /**
   * Envoie un événement au fil principal.
   * @param workletEvent événement à envoyer
   */
  private sendEvent(workletEvent: WorkletEvent): void {
    this.port.postMessage(workletEvent);
  }

  /**
   * Appelé par le navigateur pour chaque bloc de 128 échantillons.
   * @param _inputs entrées (inutilisées)
   * @param outputs sorties à remplir
   * @returns true pour garder le processeur actif
   */
  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const outputChannels = outputs[0];
    const firstChannel = outputChannels[0];
    if (!this.isPlaying || !this.project) {
      for (const channel of outputChannels) channel.fill(0);
      return true;
    }

    this.renderer.renderBlock(firstChannel, this.playbackTimeSeconds);
    for (let channelIndex = 1; channelIndex < outputChannels.length; channelIndex++) {
      outputChannels[channelIndex].set(firstChannel);
    }
    this.playbackTimeSeconds += firstChannel.length / sampleRate;

    if (this.playbackTimeSeconds >= this.project.durationSeconds) {
      this.isPlaying = false;
      this.sendEvent({ type: 'playhead', timeSeconds: this.project.durationSeconds });
      this.sendEvent({ type: 'ended' });
    } else if (this.playbackTimeSeconds - this.lastReportedTimeSeconds >= PLAYHEAD_REPORT_INTERVAL_SECONDS) {
      this.lastReportedTimeSeconds = this.playbackTimeSeconds;
      this.sendEvent({ type: 'playhead', timeSeconds: this.playbackTimeSeconds });
    }
    return true;
  }
}

registerProcessor(ENGINE_PROCESSOR_NAME, EngineWorkletProcessor);
