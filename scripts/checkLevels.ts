// Calibrage des niveaux (Node, sans navigateur). Lancement : npm run check-levels
// 1. Crête avant saturation par profil, tous effets actifs (régime constant, 5 m) → gain de sortie conseillé.
// 2. Volume de l'échappement à tuyaux par rapport à l'échappement simple → PIPE_EXHAUST_GAIN.
// 3. Pneus / vent à 100 et 130 km/h par rapport au moteur d'une voiture à mi-régime.
// 4. Réverbération par rapport au son direct à 5 m → distance où les deux sont égaux.

import { RENDER_BLOCK_SIZE, SAMPLE_RATE } from '../src/config.ts';
import { EngineSynth } from '../src/dsp/engineSynth.ts';
import { ProjectRenderer } from '../src/dsp/projectRenderer.ts';
import { getDefaultFiringOrder, VEHICLE_PROFILES, type VehicleProfile } from '../src/dsp/vehicleProfiles.ts';
import { createDefaultEffectSettings, type EffectKey, type EffectSettings } from '../src/model/effects.ts';
import { createDefaultProject, type Project } from '../src/model/project.ts';

const MEASURE_SECONDS = 1.5;
const RPM_FRACTIONS_OF_MAX = [0, 0.5, 1, 1.25];
const TEST_LOADS = [0.45, 1];
/** Crête visée avant saturation, au pire cas (pleine charge, sur-régime compris). */
const TARGET_WORST_PEAK = 0.7;

/**
 * Réglages d'effets par défaut, avec certains effets forcés à une dose.
 * @param overrides doses à imposer
 * @returns réglages d'effets
 */
function createEffects(overrides: Partial<Record<EffectKey, number>>): EffectSettings {
  const effectSettings = createDefaultEffectSettings();
  for (const [effectKey, amount] of Object.entries(overrides)) effectSettings[effectKey as EffectKey].amount = amount;
  return effectSettings;
}

/**
 * Rend un régime constant avec le moteur seul.
 * @param profile profil
 * @param rpm régime (tr/min)
 * @param load charge (0 à 1)
 * @param effectSettings doses d'effets
 * @returns crête avant saturation et RMS (sur les 2/3 de fin)
 */
function measureEngine(profile: VehicleProfile, rpm: number, load: number, effectSettings: EffectSettings): { peak: number; rms: number } {
  const engineSynth = new EngineSynth(SAMPLE_RATE);
  engineSynth.configure(
    { profileId: profile.id, cylinderCount: profile.defaultCylinderCount, firingOrder: getDefaultFiringOrder(profile, profile.defaultCylinderCount), masterGain: 1 },
    effectSettings,
  );
  const block = new Float32Array(RENDER_BLOCK_SIZE);
  const blockCount = Math.ceil((MEASURE_SECONDS * SAMPLE_RATE) / RENDER_BLOCK_SIZE);
  let peak = 0;
  let sumOfSquares = 0;
  let sampleCount = 0;
  for (let blockIndex = 0; blockIndex < blockCount; blockIndex++) {
    engineSynth.renderBlock(block, rpm, rpm, load, load);
    if (blockIndex < blockCount / 3) continue;
    peak = Math.max(peak, engineSynth.getBlockPeakBeforeSaturation());
    for (const sample of block) sumOfSquares += sample * sample;
    sampleCount += block.length;
  }
  return { peak, rms: Math.sqrt(sumOfSquares / sampleCount) };
}

/**
 * Rend un projet à courbes constantes avec le rendu complet.
 * @param project projet (courbes constantes)
 * @returns RMS (sur les 2/3 de fin)
 */
function measureProjectRms(project: Project): number {
  const renderer = new ProjectRenderer(SAMPLE_RATE);
  renderer.setProject(project);
  renderer.primeAt(0);
  const block = new Float32Array(RENDER_BLOCK_SIZE);
  const blockCount = Math.ceil((MEASURE_SECONDS * SAMPLE_RATE) / RENDER_BLOCK_SIZE);
  let sumOfSquares = 0;
  let sampleCount = 0;
  for (let blockIndex = 0; blockIndex < blockCount; blockIndex++) {
    renderer.renderBlock(block, (blockIndex * RENDER_BLOCK_SIZE) / SAMPLE_RATE);
    if (blockIndex < blockCount / 3) continue;
    for (const sample of block) sumOfSquares += sample * sample;
    sampleCount += block.length;
  }
  return Math.sqrt(sumOfSquares / sampleCount);
}

/**
 * Projet de test : voiture, courbes constantes.
 * @param rpm régime (tr/min)
 * @param distanceMeters distance (m)
 * @param speedKmh vitesse (km/h)
 * @param effectOverrides doses d'effets imposées
 * @returns projet
 */
function createConstantProject(rpm: number, distanceMeters: number, speedKmh: number, effectOverrides: Partial<Record<EffectKey, number>>): Project {
  const project = createDefaultProject();
  project.engine.masterGain = 1;
  project.effects = createEffects(effectOverrides);
  project.curves.rpm.points = [{ time: 0, value: rpm }];
  project.curves.distance.points = [{ time: 0, value: distanceMeters }];
  project.curves.speed.points = [{ time: 0, value: speedKmh }];
  return project;
}

const decibels = (ratio: number): string => `${(20 * Math.log10(ratio)).toFixed(1)} dB`;

console.log('--- 1. Crête avant saturation (tous effets), gain conseillé ---');
for (const profile of Object.values(VEHICLE_PROFILES)) {
  let worstPeak = 0;
  for (const rpmFraction of RPM_FRACTIONS_OF_MAX) {
    const rpm = rpmFraction === 0 ? profile.idleRpm : profile.maxRpm * rpmFraction;
    for (const load of TEST_LOADS) worstPeak = Math.max(worstPeak, measureEngine(profile, rpm, load, createDefaultEffectSettings()).peak);
  }
  const suggestedGain = (profile.outputGain * TARGET_WORST_PEAK) / worstPeak;
  console.log(`${profile.id.padEnd(18)} worst=${worstPeak.toFixed(2)} gain=${profile.outputGain} (conseillé ${suggestedGain.toFixed(2)})`);
}

console.log('--- 2. Échappement à tuyaux / simple (RMS, mi-régime) ---');
for (const profile of Object.values(VEHICLE_PROFILES)) {
  const midRpm = profile.maxRpm * 0.5;
  const pipeRms = measureEngine(profile, midRpm, 0.6, createEffects({ pipeExhaust: 1 })).rms;
  const simpleRms = measureEngine(profile, midRpm, 0.6, createEffects({ pipeExhaust: 0 })).rms;
  console.log(`${profile.id.padEnd(18)} tuyaux/simple = ${decibels(pipeRms / simpleRms)}`);
}

console.log('--- 3. Pneus et vent / moteur (voiture 3500 tr/min, 5 m) ---');
const engineOnlyRms = measureProjectRms(createConstantProject(3500, 5, 0, { tireNoise: 0, windNoise: 0, reverb: 0, groundReflection: 0 }));
for (const speedKmh of [50, 100, 130]) {
  const tireRms = measureProjectRms(createConstantProject(0, 5, speedKmh, { windNoise: 0, reverb: 0, groundReflection: 0 }));
  const windRms = measureProjectRms(createConstantProject(0, 5, speedKmh, { tireNoise: 0, reverb: 0, groundReflection: 0 }));
  console.log(`${speedKmh} km/h : pneus/moteur = ${decibels(tireRms / engineOnlyRms)}, vent/moteur = ${decibels(windRms / engineOnlyRms)}`);
}

console.log('--- 4. Réverbération / son direct (voiture 3500 tr/min, 5 m) ---');
// Mesurée à 400 m, où le son direct est très faible ; la réverbération ne dépend pas de la distance.
const FAR_DISTANCE_METERS = 400;
const directRms = engineOnlyRms;
const farWithoutReverbRms = measureProjectRms(createConstantProject(3500, FAR_DISTANCE_METERS, 0, { tireNoise: 0, windNoise: 0, groundReflection: 0, reverb: 0 }));
const farWithReverbRms = measureProjectRms(createConstantProject(3500, FAR_DISTANCE_METERS, 0, { tireNoise: 0, windNoise: 0, groundReflection: 0 }));
const reverbRms = Math.sqrt(Math.max(farWithReverbRms ** 2 - farWithoutReverbRms ** 2, 0));
const equalDistance = (5 * directRms) / reverbRms;
console.log(`réverb/direct à 5 m = ${decibels(reverbRms / directRms)} → égaux vers ${equalDistance.toFixed(0)} m`);
