// Projets de test pour écouter vite le son : ils gardent le moteur et le mixage en cours, et remplacent les courbes.
// Les régimes sont donnés en fraction de la plage ralenti → régime max, pour convenir à tous les profils.

import { REFERENCE_DISTANCE_METERS } from '../config.ts';
import type { AutomationCurve, AutomationPoint } from './automationCurve.ts';
import { PROJECT_FORMAT_VERSION, type Project } from './project.ts';

export type TestProjectId = 'passBy' | 'closeEngine';

/** Point de régime : instant (s) et fraction de la plage ralenti (0) → régime max (1). */
interface RpmFractionPoint {
  time: number;
  rpmFraction: number;
}

interface TestProjectDefinition {
  durationSeconds: number;
  rpmFractions: RpmFractionPoint[];
  distancePoints: AutomationPoint[];
  speedPoints: AutomationPoint[];
}

/** Distance la plus proche qui compte : en dessous, le volume n'augmente plus. */
const CLOSE_ENGINE_DISTANCE_METERS = REFERENCE_DISTANCE_METERS;

const TEST_PROJECT_DEFINITIONS: Record<TestProjectId, TestProjectDefinition> = {
  /** Passage devant le micro avec accélérations (comme la démo), Doppler, pneus et vent. */
  passBy: {
    durationSeconds: 10,
    rpmFractions: [
      { time: 0, rpmFraction: 0 },
      { time: 1.5, rpmFraction: 0 },
      { time: 4, rpmFraction: 0.95 },
      { time: 4.6, rpmFraction: 0.49 },
      { time: 7, rpmFraction: 1 },
      { time: 8, rpmFraction: 0.29 },
      { time: 10, rpmFraction: 0.01 },
    ],
    distancePoints: [
      { time: 0, value: 120 },
      { time: 5.5, value: 6 },
      { time: 10, value: 160 },
    ],
    speedPoints: [
      { time: 0, value: 40 },
      { time: 4, value: 90 },
      { time: 7, value: 100 },
      { time: 10, value: 60 },
    ],
  },
  /** Moteur à l'arrêt, tout près du micro : ralenti, coups d'accélérateur, montée au régime max. Ni Doppler ni pneus. */
  closeEngine: {
    durationSeconds: 12,
    rpmFractions: [
      { time: 0, rpmFraction: 0 },
      { time: 2, rpmFraction: 0 },
      { time: 2.6, rpmFraction: 0.45 },
      { time: 3.6, rpmFraction: 0 },
      { time: 5, rpmFraction: 0 },
      { time: 7.5, rpmFraction: 1 },
      { time: 8.2, rpmFraction: 1 },
      { time: 9.5, rpmFraction: 0 },
      { time: 12, rpmFraction: 0 },
    ],
    distancePoints: [{ time: 0, value: CLOSE_ENGINE_DISTANCE_METERS }],
    speedPoints: [{ time: 0, value: 0 }],
  },
};

/**
 * Crée un projet de test en gardant le moteur et le mixage du projet en cours.
 * @param testProjectId test voulu
 * @param currentProject projet en cours (moteur et effets recopiés)
 * @param idleRpm ralenti du profil en cours (tr/min)
 * @param maxRpm régime max du profil en cours (tr/min)
 * @returns nouveau projet
 */
export function createTestProject(testProjectId: TestProjectId, currentProject: Project, idleRpm: number, maxRpm: number): Project {
  const definition = TEST_PROJECT_DEFINITIONS[testProjectId];
  const rpmPoints = definition.rpmFractions.map((fractionPoint) => ({
    time: fractionPoint.time,
    value: Math.round(idleRpm + fractionPoint.rpmFraction * (maxRpm - idleRpm)),
  }));
  return {
    formatVersion: PROJECT_FORMAT_VERSION,
    durationSeconds: definition.durationSeconds,
    engine: structuredClone(currentProject.engine),
    effects: structuredClone(currentProject.effects),
    curves: {
      rpm: createSmoothCurve(rpmPoints),
      distance: createSmoothCurve(definition.distancePoints),
      speed: createSmoothCurve(definition.speedPoints),
    },
  };
}

/**
 * @param points points de la courbe (copiés)
 * @returns courbe lissée
 */
function createSmoothCurve(points: AutomationPoint[]): AutomationCurve {
  return { interpolation: 'smooth', points: points.map((point) => ({ ...point })) };
}
