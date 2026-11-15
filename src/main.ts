// Démarrage : assemble le projet, l'aperçu audio, la timeline, les réglages et l'export.

import './style.css';
import { RealtimePlayer } from './audio/realtimePlayer.ts';
import type { WavSampleFormat } from './audio/wavEncoder.ts';
import { exportProjectToWav } from './audio/wavExporter.ts';
import { getVehicleProfile } from './dsp/vehicleProfiles.ts';
import { createDefaultProject, parseProject, type Project } from './model/project.ts';
import { createTestProject, type TestProjectId } from './model/testProjects.ts';
import { createFileTimestamp, downloadBlob, pickTextFile } from './ui/fileTransfer.ts';
import { EffectsPanel } from './ui/effectsPanel.ts';
import { getRequiredElement, SettingsPanel } from './ui/settingsPanel.ts';
import { TimelineEditor, type LaneDefinition } from './ui/timelineEditor.ts';

const RPM_LANE_HEADROOM = 1.15;
const RPM_LANE_ROUNDING = 1000;
const DISTANCE_LANE_MAX_METERS = 300;
const SPEED_LANE_MAX_KMH = 250;

const TIMELINE_LANES: LaneDefinition[] = [
  {
    curveKey: 'rpm',
    label: 'Régime (tr/min)',
    color: '#ff7a45',
    minValue: 0,
    getMaxValue: (project) =>
      Math.ceil((getVehicleProfile(project.engine.profileId).maxRpm * RPM_LANE_HEADROOM) / RPM_LANE_ROUNDING) * RPM_LANE_ROUNDING,
    valueDecimals: 0,
  },
  {
    curveKey: 'distance',
    label: 'Distance au micro (m)',
    color: '#4fc3f7',
    minValue: 0,
    getMaxValue: () => DISTANCE_LANE_MAX_METERS,
    valueDecimals: 1,
  },
  {
    curveKey: 'speed',
    label: 'Vitesse (km/h)',
    color: '#9ccc65',
    minValue: 0,
    getMaxValue: () => SPEED_LANE_MAX_KMH,
    valueDecimals: 0,
  },
];

let currentProject: Project = createDefaultProject();
let playheadTimeSeconds = 0;
let isPlaying = false;

const playButton = getRequiredElement<HTMLButtonElement>('playButton');
const timeReadout = getRequiredElement<HTMLSpanElement>('timeReadout');
const exportButton = getRequiredElement<HTMLButtonElement>('exportButton');
const exportStatus = getRequiredElement<HTMLSpanElement>('exportStatus');
const exportFormatSelect = getRequiredElement<HTMLSelectElement>('exportFormatSelect');
const normalizeCheckbox = getRequiredElement<HTMLInputElement>('normalizeCheckbox');
const projectFileInput = getRequiredElement<HTMLInputElement>('projectFileInput');

const realtimePlayer = new RealtimePlayer({
  onPlayheadChanged: (timeSeconds) => {
    if (isPlaying) setPlayheadTime(timeSeconds);
  },
  onEnded: () => setPlayingState(false),
});

const timelineEditor = new TimelineEditor(getRequiredElement<HTMLCanvasElement>('timelineCanvas'), TIMELINE_LANES, () => currentProject, {
  onCurvesChanged: () => realtimePlayer.setProject(currentProject),
  onSeek: (timeSeconds) => seekTo(timeSeconds),
});

const settingsPanel = new SettingsPanel(() => currentProject, {
  onEngineChanged: () => {
    realtimePlayer.setProject(currentProject);
    timelineEditor.requestRender();
  },
  onDurationChanged: () => {
    realtimePlayer.setProject(currentProject);
    setPlayheadTime(Math.min(playheadTimeSeconds, currentProject.durationSeconds));
  },
});

const effectsPanel = new EffectsPanel(getRequiredElement<HTMLDivElement>('effectsContainer'), () => currentProject, () =>
  realtimePlayer.setProject(currentProject),
);

/**
 * Met à jour la tête de lecture (affichage seulement).
 * @param timeSeconds instant (s)
 */
function setPlayheadTime(timeSeconds: number): void {
  playheadTimeSeconds = timeSeconds;
  timeReadout.textContent = `${timeSeconds.toFixed(2)} s`;
  timelineEditor.setPlayheadTime(timeSeconds);
}

/**
 * Change l'état lecture / arrêt et le libellé du bouton.
 * @param shouldPlay true pendant la lecture
 */
function setPlayingState(shouldPlay: boolean): void {
  isPlaying = shouldPlay;
  playButton.textContent = shouldPlay ? '❚❚ Pause' : '▶ Lecture';
  playButton.classList.toggle('is-active', shouldPlay);
}

/**
 * Déplace la tête de lecture ; si la lecture est en cours, elle reprend depuis le nouvel instant.
 * @param timeSeconds instant (s)
 */
function seekTo(timeSeconds: number): void {
  setPlayheadTime(timeSeconds);
  if (isPlaying) void realtimePlayer.play(timeSeconds);
}

/** Bouton lecture / pause (et barre d'espace). À la fin du projet, la lecture repart du début. */
async function togglePlayback(): Promise<void> {
  if (isPlaying) {
    realtimePlayer.stop();
    setPlayingState(false);
    return;
  }
  const isAtEnd = playheadTimeSeconds >= currentProject.durationSeconds - 0.01;
  const startTimeSeconds = isAtEnd ? 0 : playheadTimeSeconds;
  setPlayingState(true);
  try {
    await realtimePlayer.play(startTimeSeconds);
  } catch (error) {
    console.error('togglePlayback', error);
    setPlayingState(false);
    alert(`Impossible de démarrer l'audio : ${String(error)}`);
  }
}

/** Arrête et revient au début. */
function stopAndRewind(): void {
  realtimePlayer.stop();
  setPlayingState(false);
  setPlayheadTime(0);
}

/** Rend le projet en WAV (Worker) et le propose au téléchargement. */
async function exportWav(): Promise<void> {
  exportButton.disabled = true;
  try {
    const sampleFormat = exportFormatSelect.value as WavSampleFormat;
    const wavBlob = await exportProjectToWav(currentProject, sampleFormat, normalizeCheckbox.checked, (progress) => {
      exportStatus.textContent = `Rendu… ${Math.round(progress * 100)} %`;
    });
    downloadBlob(wavBlob, `vroumvroum_${createFileTimestamp()}.wav`);
    exportStatus.textContent = 'WAV exporté';
  } catch (error) {
    console.error('exportWav', error);
    exportStatus.textContent = 'Erreur d’export';
  } finally {
    exportButton.disabled = false;
  }
}

/** Enregistre le projet en JSON. */
function saveProject(): void {
  const projectJson = JSON.stringify(currentProject, null, 2);
  downloadBlob(new Blob([projectJson], { type: 'application/json' }), `vroumvroum_${createFileTimestamp()}.json`);
}

/**
 * Remplace le projet en cours, revient au début et met à jour tous les panneaux.
 * @param newProject projet à afficher et à écouter
 */
function replaceProject(newProject: Project): void {
  currentProject = newProject;
  stopAndRewind();
  settingsPanel.refreshFromProject();
  effectsPanel.refreshFromProject();
  realtimePlayer.setProject(currentProject);
  timelineEditor.requestRender();
}

/**
 * Charge un projet de test (même moteur, même mixage) et lance la lecture depuis le début.
 * @param testProjectId test voulu
 */
function loadTestProject(testProjectId: TestProjectId): void {
  const profile = getVehicleProfile(currentProject.engine.profileId);
  replaceProject(createTestProject(testProjectId, currentProject, profile.idleRpm, profile.maxRpm));
  void togglePlayback();
}

/** Ouvre un projet JSON. */
async function loadProject(): Promise<void> {
  try {
    const projectText = await pickTextFile(projectFileInput);
    replaceProject(parseProject(JSON.parse(projectText)));
  } catch (error) {
    console.error('loadProject', error);
    alert(`Projet illisible : ${String(error)}`);
  }
}

playButton.addEventListener('click', () => void togglePlayback());
getRequiredElement<HTMLButtonElement>('stopButton').addEventListener('click', stopAndRewind);
exportButton.addEventListener('click', () => void exportWav());
getRequiredElement<HTMLButtonElement>('saveProjectButton').addEventListener('click', saveProject);
getRequiredElement<HTMLButtonElement>('loadProjectButton').addEventListener('click', () => void loadProject());
getRequiredElement<HTMLButtonElement>('passByTestButton').addEventListener('click', () => loadTestProject('passBy'));
getRequiredElement<HTMLButtonElement>('closeEngineTestButton').addEventListener('click', () => loadTestProject('closeEngine'));
window.addEventListener('keydown', (keyboardEvent) => {
  const isTyping = keyboardEvent.target instanceof HTMLInputElement || keyboardEvent.target instanceof HTMLSelectElement;
  if (keyboardEvent.code === 'Space' && !isTyping) {
    keyboardEvent.preventDefault();
    void togglePlayback();
  }
});

realtimePlayer.setProject(currentProject);
setPlayheadTime(0);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch((error: unknown) => console.error('serviceWorker.register', error));
}
