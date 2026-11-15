// Profils de véhicule : réglages acoustiques par défaut (moto, voiture, camion).

import type { VehicleProfileId } from '../model/project.ts';

export interface Resonance {
  frequencyHz: number;
  quality: number;
  gain: number;
}

export interface VehicleProfile {
  id: VehicleProfileId;
  label: string;
  defaultCylinderCount: number;
  defaultFiringOrder: number[];
  /** Angles d'allumage (degrés sur 720°) pour un allumage irrégulier ; utilisés seulement avec le nombre de cylindres par défaut. */
  unevenFiringAnglesDegrees: number[] | null;
  idleRpm: number;
  maxRpm: number;
  /** Durée de décroissance d'une impulsion de combustion (s). */
  pulseDecaySeconds: number;
  combustionNoiseAmount: number;
  exhaustPipeLengthMeters: number;
  exhaustPipeFeedback: number;
  exhaustResonances: Resonance[];
  intakeNoiseAmount: number;
  mechanicalAmount: number;
}

export const VEHICLE_PROFILES: Record<VehicleProfileId, VehicleProfile> = {
  motorcycle: {
    id: 'motorcycle',
    label: 'Moto (bicylindre en V)',
    defaultCylinderCount: 2,
    defaultFiringOrder: [1, 2],
    unevenFiringAnglesDegrees: [0, 315],
    idleRpm: 1000,
    maxRpm: 9000,
    pulseDecaySeconds: 0.004,
    combustionNoiseAmount: 0.35,
    exhaustPipeLengthMeters: 0.9,
    exhaustPipeFeedback: 0.45,
    exhaustResonances: [
      { frequencyHz: 130, quality: 1.8, gain: 1.0 },
      { frequencyHz: 480, quality: 3, gain: 0.55 },
      { frequencyHz: 1500, quality: 4, gain: 0.25 },
    ],
    intakeNoiseAmount: 0.12,
    mechanicalAmount: 0.05,
  },
  car: {
    id: 'car',
    label: 'Voiture (4 cylindres en ligne)',
    defaultCylinderCount: 4,
    defaultFiringOrder: [1, 3, 4, 2],
    unevenFiringAnglesDegrees: null,
    idleRpm: 800,
    maxRpm: 7000,
    pulseDecaySeconds: 0.003,
    combustionNoiseAmount: 0.25,
    exhaustPipeLengthMeters: 2.5,
    exhaustPipeFeedback: 0.5,
    exhaustResonances: [
      { frequencyHz: 95, quality: 1.5, gain: 1.0 },
      { frequencyHz: 340, quality: 3, gain: 0.5 },
      { frequencyHz: 1100, quality: 4, gain: 0.22 },
    ],
    intakeNoiseAmount: 0.1,
    mechanicalAmount: 0.04,
  },
  truck: {
    id: 'truck',
    label: 'Camion (6 cylindres diesel)',
    defaultCylinderCount: 6,
    defaultFiringOrder: [1, 5, 3, 6, 2, 4],
    unevenFiringAnglesDegrees: null,
    idleRpm: 600,
    maxRpm: 2500,
    pulseDecaySeconds: 0.006,
    combustionNoiseAmount: 0.6,
    exhaustPipeLengthMeters: 3.5,
    exhaustPipeFeedback: 0.55,
    exhaustResonances: [
      { frequencyHz: 60, quality: 1.5, gain: 1.0 },
      { frequencyHz: 210, quality: 2.5, gain: 0.6 },
      { frequencyHz: 800, quality: 3, gain: 0.4 },
    ],
    intakeNoiseAmount: 0.18,
    mechanicalAmount: 0.08,
  },
};

/**
 * Renvoie le profil demandé, ou le profil voiture si l'identifiant est inconnu.
 * @param profileId identifiant du profil
 * @returns profil de véhicule
 */
export function getVehicleProfile(profileId: VehicleProfileId): VehicleProfile {
  return VEHICLE_PROFILES[profileId] ?? VEHICLE_PROFILES.car;
}

/**
 * Ordre d'allumage par défaut pour un nombre de cylindres : celui du profil s'il correspond, sinon 1, 2, 3…
 * @param profile profil de véhicule
 * @param cylinderCount nombre de cylindres
 * @returns ordre d'allumage (numéros à partir de 1)
 */
export function getDefaultFiringOrder(profile: VehicleProfile, cylinderCount: number): number[] {
  if (cylinderCount === profile.defaultCylinderCount) return [...profile.defaultFiringOrder];
  return Array.from({ length: cylinderCount }, (_unused, cylinderIndex) => cylinderIndex + 1);
}
