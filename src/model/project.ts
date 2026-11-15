// Données du projet (réglages moteur + courbes). Sérialisable en JSON, sans DOM.

import type { AutomationCurve } from './automationCurve.ts';
import { completeEffectSettings, createDefaultEffectSettings, type EffectSettings } from './effects.ts';

export type VehicleProfileId =
  | 'motorcycleSingle'
  | 'motorcycle'
  | 'motorcycleTriple'
  | 'motorcycleInline4'
  | 'carInline3'
  | 'car'
  | 'carBoxer4'
  | 'carV6'
  | 'carV8'
  | 'truck'
  | 'truckV8'
  | 'tractor';

export interface EngineSettings {
  profileId: VehicleProfileId;
  cylinderCount: number;
  /** Ordre d'allumage, numéros de cylindres à partir de 1 (ex. [1, 3, 4, 2]). */
  firingOrder: number[];
  masterGain: number;
}

export interface ProjectCurves {
  rpm: AutomationCurve;
  distance: AutomationCurve;
  /** Vitesse du véhicule (km/h) : bruit des pneus et du vent. */
  speed: AutomationCurve;
}

export type CurveKey = keyof ProjectCurves;

export interface Project {
  formatVersion: 1;
  durationSeconds: number;
  engine: EngineSettings;
  effects: EffectSettings;
  curves: ProjectCurves;
}

export const PROJECT_FORMAT_VERSION = 1;

/**
 * Crée le projet de démonstration : voiture 4 cylindres qui accélère et passe devant le micro.
 * @returns nouveau projet
 */
export function createDefaultProject(): Project {
  return {
    formatVersion: PROJECT_FORMAT_VERSION,
    durationSeconds: 10,
    engine: { profileId: 'car', cylinderCount: 4, firingOrder: [1, 3, 4, 2], masterGain: 0.8 },
    effects: createDefaultEffectSettings(),
    curves: {
      rpm: {
        interpolation: 'smooth',
        points: [
          { time: 0, value: 850 },
          { time: 1.5, value: 850 },
          { time: 4, value: 6200 },
          { time: 4.6, value: 3600 },
          { time: 7, value: 6500 },
          { time: 8, value: 2500 },
          { time: 10, value: 900 },
        ],
      },
      distance: {
        interpolation: 'smooth',
        points: [
          { time: 0, value: 120 },
          { time: 5.5, value: 6 },
          { time: 10, value: 160 },
        ],
      },
      speed: {
        interpolation: 'smooth',
        points: [
          { time: 0, value: 40 },
          { time: 4, value: 90 },
          { time: 7, value: 100 },
          { time: 10, value: 60 },
        ],
      },
    },
  };
}

/**
 * Vérifie et complète un projet chargé depuis un fichier JSON.
 * @param rawData objet issu de JSON.parse
 * @returns projet valide
 * @throws Error si les données ne ressemblent pas à un projet
 */
export function parseProject(rawData: unknown): Project {
  const candidate = rawData as Partial<Project> | null;
  if (!candidate || typeof candidate !== 'object' || !candidate.curves || !candidate.engine) {
    throw new Error('parseProject: fichier de projet invalide (curves / engine manquants)');
  }
  const defaults = createDefaultProject();
  return {
    formatVersion: PROJECT_FORMAT_VERSION,
    durationSeconds: Number(candidate.durationSeconds) > 0 ? Number(candidate.durationSeconds) : defaults.durationSeconds,
    engine: { ...defaults.engine, ...candidate.engine },
    effects: completeEffectSettings(candidate.effects ?? migrateOldBreathSetting(candidate.engine)),
    curves: {
      rpm: candidate.curves.rpm ?? defaults.curves.rpm,
      distance: candidate.curves.distance ?? defaults.curves.distance,
      speed: candidate.curves.speed ?? defaults.curves.speed,
    },
  };
}

/**
 * Anciens fichiers : le souffle était réglé par engine.noiseAmount ; on le reprend dans les effets.
 * @param oldEngine réglages moteur lus dans le fichier
 * @returns réglages d'effets partiels, ou undefined
 */
function migrateOldBreathSetting(oldEngine: unknown): Partial<EffectSettings> | undefined {
  const oldNoiseAmount = (oldEngine as { noiseAmount?: unknown }).noiseAmount;
  if (typeof oldNoiseAmount !== 'number') return undefined;
  return { breath: { isEnabled: true, amount: oldNoiseAmount } };
}
