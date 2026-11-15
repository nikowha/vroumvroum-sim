// Profils de véhicule : réglages acoustiques par défaut (motos, voitures, camions et engins).

import type { VehicleProfileId } from '../model/project.ts';

export interface Resonance {
  frequencyHz: number;
  quality: number;
  gain: number;
}

export type VehicleCategory = 'motorcycle' | 'car' | 'heavy';

export const VEHICLE_CATEGORY_LABELS: Record<VehicleCategory, string> = {
  motorcycle: 'Motos',
  car: 'Voitures',
  heavy: 'Camions et engins',
};

export interface VehicleProfile {
  id: VehicleProfileId;
  category: VehicleCategory;
  label: string;
  defaultCylinderCount: number;
  defaultFiringOrder: number[];
  /** Angles d'allumage (degrés sur 720°) pour un allumage irrégulier ; utilisés seulement avec le nombre de cylindres par défaut. */
  unevenFiringAnglesDegrees: number[] | null;
  /** Volume relatif de chaque cylindre (ex. deux bancs d'un V8) ; utilisé seulement avec le nombre de cylindres par défaut. */
  cylinderGainPattern: number[] | null;
  idleRpm: number;
  maxRpm: number;
  /** Durée de décroissance d'une impulsion de combustion (s). */
  pulseDecaySeconds: number;
  /** Fréquence de coupure appliquée aux impulsions (Hz) : plus bas = son plus rond, moins grésillant. */
  pulseBrightnessHz: number;
  combustionNoiseAmount: number;
  exhaustPipeLengthMeters: number;
  exhaustPipeFeedback: number;
  exhaustResonances: Resonance[];
  intakeNoiseAmount: number;
  mechanicalAmount: number;
  /** Gain de sortie calibré (npm run check-levels) pour garder de la marge avant saturation et un volume proche entre profils. */
  outputGain: number;
}

/** Ordre d'affichage dans la liste. */
export const VEHICLE_PROFILES: Record<VehicleProfileId, VehicleProfile> = {
  motorcycleSingle: {
    id: 'motorcycleSingle',
    category: 'motorcycle',
    label: 'Monocylindre (trail, 125)',
    defaultCylinderCount: 1,
    defaultFiringOrder: [1],
    unevenFiringAnglesDegrees: null,
    cylinderGainPattern: null,
    idleRpm: 1300,
    maxRpm: 9500,
    pulseDecaySeconds: 0.003,
    pulseBrightnessHz: 5000,
    combustionNoiseAmount: 0.3,
    exhaustPipeLengthMeters: 1.1,
    exhaustPipeFeedback: 0.45,
    exhaustResonances: [
      { frequencyHz: 180, quality: 1.8, gain: 1.0 },
      { frequencyHz: 620, quality: 3, gain: 0.5 },
      { frequencyHz: 2000, quality: 4, gain: 0.25 },
    ],
    intakeNoiseAmount: 0.12,
    mechanicalAmount: 0.05,
    outputGain: 1.2,
  },
  motorcycle: {
    id: 'motorcycle',
    category: 'motorcycle',
    label: 'Bicylindre en V (custom)',
    defaultCylinderCount: 2,
    defaultFiringOrder: [1, 2],
    unevenFiringAnglesDegrees: [0, 315],
    cylinderGainPattern: null,
    idleRpm: 1000,
    maxRpm: 9000,
    pulseDecaySeconds: 0.004,
    pulseBrightnessHz: 4500,
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
    outputGain: 1.3,
  },
  motorcycleTriple: {
    id: 'motorcycleTriple',
    category: 'motorcycle',
    label: '3 cylindres en ligne (roadster)',
    defaultCylinderCount: 3,
    defaultFiringOrder: [1, 2, 3],
    unevenFiringAnglesDegrees: null,
    cylinderGainPattern: null,
    idleRpm: 1100,
    maxRpm: 12000,
    pulseDecaySeconds: 0.002,
    pulseBrightnessHz: 6000,
    combustionNoiseAmount: 0.25,
    exhaustPipeLengthMeters: 1.0,
    exhaustPipeFeedback: 0.45,
    exhaustResonances: [
      { frequencyHz: 170, quality: 1.8, gain: 1.0 },
      { frequencyHz: 700, quality: 3, gain: 0.5 },
      { frequencyHz: 2200, quality: 4, gain: 0.25 },
    ],
    intakeNoiseAmount: 0.14,
    mechanicalAmount: 0.04,
    outputGain: 1.25,
  },
  motorcycleInline4: {
    id: 'motorcycleInline4',
    category: 'motorcycle',
    label: '4 cylindres en ligne (sportive)',
    defaultCylinderCount: 4,
    defaultFiringOrder: [1, 2, 4, 3],
    unevenFiringAnglesDegrees: null,
    cylinderGainPattern: null,
    idleRpm: 1200,
    maxRpm: 14000,
    pulseDecaySeconds: 0.0015,
    pulseBrightnessHz: 7000,
    combustionNoiseAmount: 0.2,
    exhaustPipeLengthMeters: 0.8,
    exhaustPipeFeedback: 0.4,
    exhaustResonances: [
      { frequencyHz: 220, quality: 1.8, gain: 1.0 },
      { frequencyHz: 900, quality: 3, gain: 0.5 },
      { frequencyHz: 2800, quality: 4, gain: 0.3 },
    ],
    intakeNoiseAmount: 0.16,
    mechanicalAmount: 0.03,
    outputGain: 1.35,
  },
  carInline3: {
    id: 'carInline3',
    category: 'car',
    label: '3 cylindres (citadine)',
    defaultCylinderCount: 3,
    defaultFiringOrder: [1, 2, 3],
    unevenFiringAnglesDegrees: null,
    cylinderGainPattern: null,
    idleRpm: 850,
    maxRpm: 6500,
    pulseDecaySeconds: 0.003,
    pulseBrightnessHz: 3500,
    combustionNoiseAmount: 0.25,
    exhaustPipeLengthMeters: 2.0,
    exhaustPipeFeedback: 0.5,
    exhaustResonances: [
      { frequencyHz: 110, quality: 1.5, gain: 1.0 },
      { frequencyHz: 420, quality: 3, gain: 0.5 },
      { frequencyHz: 1300, quality: 4, gain: 0.22 },
    ],
    intakeNoiseAmount: 0.1,
    mechanicalAmount: 0.05,
    outputGain: 1.25,
  },
  car: {
    id: 'car',
    category: 'car',
    label: '4 cylindres en ligne',
    defaultCylinderCount: 4,
    defaultFiringOrder: [1, 3, 4, 2],
    unevenFiringAnglesDegrees: null,
    cylinderGainPattern: null,
    idleRpm: 800,
    maxRpm: 7000,
    pulseDecaySeconds: 0.003,
    pulseBrightnessHz: 3500,
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
    outputGain: 1.6,
  },
  carBoxer4: {
    id: 'carBoxer4',
    category: 'car',
    label: '4 cylindres à plat (boxer)',
    defaultCylinderCount: 4,
    defaultFiringOrder: [1, 3, 2, 4],
    // Collecteurs de longueurs inégales : les impulsions arrivent irrégulièrement → grondement typique.
    unevenFiringAnglesDegrees: [0, 165, 360, 555],
    cylinderGainPattern: [1, 0.85, 1, 0.85],
    idleRpm: 750,
    maxRpm: 7000,
    pulseDecaySeconds: 0.0035,
    pulseBrightnessHz: 3000,
    combustionNoiseAmount: 0.25,
    exhaustPipeLengthMeters: 2.6,
    exhaustPipeFeedback: 0.5,
    exhaustResonances: [
      { frequencyHz: 85, quality: 1.5, gain: 1.0 },
      { frequencyHz: 300, quality: 3, gain: 0.5 },
      { frequencyHz: 950, quality: 4, gain: 0.22 },
    ],
    intakeNoiseAmount: 0.1,
    mechanicalAmount: 0.04,
    outputGain: 1.7,
  },
  carV6: {
    id: 'carV6',
    category: 'car',
    label: 'V6',
    defaultCylinderCount: 6,
    defaultFiringOrder: [1, 2, 3, 4, 5, 6],
    unevenFiringAnglesDegrees: null,
    cylinderGainPattern: [1, 0.85, 1, 0.85, 1, 0.85],
    idleRpm: 700,
    maxRpm: 7000,
    pulseDecaySeconds: 0.0028,
    pulseBrightnessHz: 3500,
    combustionNoiseAmount: 0.22,
    exhaustPipeLengthMeters: 2.8,
    exhaustPipeFeedback: 0.5,
    exhaustResonances: [
      { frequencyHz: 100, quality: 1.5, gain: 1.0 },
      { frequencyHz: 380, quality: 3, gain: 0.5 },
      { frequencyHz: 1200, quality: 4, gain: 0.22 },
    ],
    intakeNoiseAmount: 0.12,
    mechanicalAmount: 0.04,
    outputGain: 1.65,
  },
  carV8: {
    id: 'carV8',
    category: 'car',
    label: 'V8 (muscle car)',
    defaultCylinderCount: 8,
    defaultFiringOrder: [1, 8, 4, 3, 6, 5, 7, 2],
    unevenFiringAnglesDegrees: null,
    // Vilebrequin croisé : chaque banc reçoit ses impulsions irrégulièrement → « glouglou » du V8.
    cylinderGainPattern: [1, 1, 1, 1, 0.7, 0.7, 0.7, 0.7],
    idleRpm: 650,
    maxRpm: 6500,
    pulseDecaySeconds: 0.003,
    pulseBrightnessHz: 2800,
    combustionNoiseAmount: 0.25,
    exhaustPipeLengthMeters: 3.0,
    exhaustPipeFeedback: 0.55,
    exhaustResonances: [
      { frequencyHz: 75, quality: 1.5, gain: 1.0 },
      { frequencyHz: 260, quality: 2.5, gain: 0.55 },
      { frequencyHz: 850, quality: 3.5, gain: 0.25 },
    ],
    intakeNoiseAmount: 0.12,
    mechanicalAmount: 0.05,
    outputGain: 1.4,
  },
  truck: {
    id: 'truck',
    category: 'heavy',
    label: 'Camion 6 cylindres diesel',
    defaultCylinderCount: 6,
    defaultFiringOrder: [1, 5, 3, 6, 2, 4],
    unevenFiringAnglesDegrees: null,
    cylinderGainPattern: null,
    idleRpm: 600,
    maxRpm: 2500,
    pulseDecaySeconds: 0.006,
    pulseBrightnessHz: 2200,
    combustionNoiseAmount: 0.4,
    exhaustPipeLengthMeters: 3.5,
    exhaustPipeFeedback: 0.5,
    exhaustResonances: [
      { frequencyHz: 60, quality: 1.5, gain: 1.0 },
      { frequencyHz: 210, quality: 2.5, gain: 0.6 },
      { frequencyHz: 800, quality: 3, gain: 0.35 },
    ],
    intakeNoiseAmount: 0.18,
    mechanicalAmount: 0.08,
    outputGain: 1.4,
  },
  truckV8: {
    id: 'truckV8',
    category: 'heavy',
    label: 'Camion V8 diesel',
    defaultCylinderCount: 8,
    defaultFiringOrder: [1, 5, 4, 2, 6, 3, 7, 8],
    unevenFiringAnglesDegrees: null,
    cylinderGainPattern: [1, 1, 1, 1, 0.75, 0.75, 0.75, 0.75],
    idleRpm: 550,
    maxRpm: 2200,
    pulseDecaySeconds: 0.007,
    pulseBrightnessHz: 2000,
    combustionNoiseAmount: 0.4,
    exhaustPipeLengthMeters: 3.8,
    exhaustPipeFeedback: 0.5,
    exhaustResonances: [
      { frequencyHz: 50, quality: 1.5, gain: 1.0 },
      { frequencyHz: 180, quality: 2.5, gain: 0.6 },
      { frequencyHz: 650, quality: 3, gain: 0.35 },
    ],
    intakeNoiseAmount: 0.2,
    mechanicalAmount: 0.08,
    outputGain: 1,
  },
  tractor: {
    id: 'tractor',
    category: 'heavy',
    label: 'Tracteur 3 cylindres diesel',
    defaultCylinderCount: 3,
    defaultFiringOrder: [1, 2, 3],
    unevenFiringAnglesDegrees: null,
    cylinderGainPattern: null,
    idleRpm: 750,
    maxRpm: 2400,
    pulseDecaySeconds: 0.006,
    pulseBrightnessHz: 2500,
    combustionNoiseAmount: 0.5,
    exhaustPipeLengthMeters: 1.5,
    exhaustPipeFeedback: 0.45,
    exhaustResonances: [
      { frequencyHz: 70, quality: 1.5, gain: 1.0 },
      { frequencyHz: 250, quality: 2.5, gain: 0.6 },
      { frequencyHz: 900, quality: 3, gain: 0.4 },
    ],
    intakeNoiseAmount: 0.15,
    mechanicalAmount: 0.1,
    outputGain: 1.05,
  },
};

/**
 * Renvoie le profil demandé, ou le 4 cylindres si l'identifiant est inconnu (ancien fichier, faute de frappe).
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
