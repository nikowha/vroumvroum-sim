// Aperçu temps réel : AudioContext + AudioWorklet, avec les précautions Safari iOS (geste, mode silencieux, arrière-plan).

import { ENGINE_PROCESSOR_NAME, SAMPLE_RATE } from '../config.ts';
import type { Project } from '../model/project.ts';
import type { WorkletCommand, WorkletEvent } from './messages.ts';
import engineWorkletUrl from './engineWorkletProcessor.ts?worker&url';

export interface RealtimePlayerCallbacks {
  onPlayheadChanged: (timeSeconds: number) => void;
  onEnded: () => void;
}

export class RealtimePlayer {
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private startPromise: Promise<void> | null = null;
  private pendingProject: Project | null = null;
  private readonly callbacks: RealtimePlayerCallbacks;

  /**
   * @param callbacks fonctions appelées quand la tête de lecture avance ou que la lecture se termine
   */
  constructor(callbacks: RealtimePlayerCallbacks) {
    this.callbacks = callbacks;
  }

  /**
   * Crée l'AudioContext et charge l'AudioWorklet (une seule fois). Doit être appelé pendant un geste utilisateur (iOS).
   * @returns promesse résolue quand l'aperçu est prêt
   */
  private ensureStarted(): Promise<void> {
    if (!this.startPromise) this.startPromise = this.startAudio();
    return this.startPromise;
  }

  /**
   * Démarre la chaîne audio : contexte, mode « lecture » iOS, module AudioWorklet, nœud.
   */
  private async startAudio(): Promise<void> {
    enableIosPlaybackAudioSession();
    const audioContext = new AudioContext({ sampleRate: SAMPLE_RATE, latencyHint: 'interactive' });
    this.audioContext = audioContext;
    // resume() lancé tout de suite, encore dans le geste utilisateur (exigence Safari).
    const resumePromise = audioContext.resume();
    await audioContext.audioWorklet.addModule(engineWorkletUrl);
    const workletNode = new AudioWorkletNode(audioContext, ENGINE_PROCESSOR_NAME, {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    workletNode.port.onmessage = (messageEvent: MessageEvent<WorkletEvent>) => this.handleWorkletEvent(messageEvent.data);
    workletNode.connect(audioContext.destination);
    this.workletNode = workletNode;
    if (this.pendingProject) this.sendCommand({ type: 'setProject', project: this.pendingProject });
    document.addEventListener('visibilitychange', () => this.resumeIfVisible());
    await resumePromise;
  }

  /**
   * Relance l'AudioContext quand la page redevient visible (Safari le suspend en arrière-plan).
   */
  private resumeIfVisible(): void {
    if (document.visibilityState === 'visible' && this.audioContext && this.audioContext.state !== 'running') {
      this.audioContext.resume().catch((error: unknown) => console.error('RealtimePlayer.resumeIfVisible', error));
    }
  }

  /**
   * Traite un événement venu de l'AudioWorklet.
   * @param workletEvent événement reçu
   */
  private handleWorkletEvent(workletEvent: WorkletEvent): void {
    if (workletEvent.type === 'playhead') this.callbacks.onPlayheadChanged(workletEvent.timeSeconds);
    else if (workletEvent.type === 'ended') this.callbacks.onEnded();
  }

  /**
   * Envoie une commande à l'AudioWorklet s'il est prêt.
   * @param command commande à envoyer
   */
  private sendCommand(command: WorkletCommand): void {
    this.workletNode?.port.postMessage(command);
  }

  /**
   * Transmet le projet (copie) à l'aperçu ; gardé en attente si l'audio n'est pas encore démarré.
   * @param project projet courant
   */
  setProject(project: Project): void {
    this.pendingProject = structuredClone(project);
    this.sendCommand({ type: 'setProject', project: this.pendingProject });
  }

  /**
   * Lance la lecture à partir d'un instant. À appeler depuis un geste utilisateur.
   * @param fromTimeSeconds instant de départ (s)
   */
  async play(fromTimeSeconds: number): Promise<void> {
    await this.ensureStarted();
    await this.audioContext?.resume();
    this.sendCommand({ type: 'play', fromTimeSeconds });
  }

  /** Arrête la lecture. */
  stop(): void {
    this.sendCommand({ type: 'stop' });
  }
}

/**
 * Sur iOS 17+ : classe la page comme lecteur audio pour que le bouton silencieux ne coupe pas le son.
 */
function enableIosPlaybackAudioSession(): void {
  const navigatorWithAudioSession = navigator as Navigator & { audioSession?: { type: string } };
  if (navigatorWithAudioSession.audioSession) navigatorWithAudioSession.audioSession.type = 'playback';
}
