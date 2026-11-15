// Mesure du bruit de fond : part du souffle (bruit) dans le son, à régime constant, et niveau moteur coupé.
// Lancement : npm run check-noise

import { RENDER_BLOCK_SIZE, SAMPLE_RATE } from '../src/config.ts';
import { EngineSynth } from '../src/dsp/engineSynth.ts';
import { getDefaultFiringOrder, VEHICLE_PROFILES, type VehicleProfile } from '../src/dsp/vehicleProfiles.ts';

const MEASURE_SECONDS = 1;

/**
 * Rend un régime constant et renvoie la valeur efficace (RMS).
 * @param profile profil (éventuellement modifié)
 * @param rpm régime (tr/min)
 * @returns RMS du signal
 */
function measureSteadyRms(profile: VehicleProfile, rpm: number): number {
  const engineSynth = new EngineSynth(SAMPLE_RATE);
  engineSynth.configureWithProfile(profile, {
    profileId: profile.id,
    cylinderCount: profile.defaultCylinderCount,
    firingOrder: getDefaultFiringOrder(profile, profile.defaultCylinderCount),
    masterGain: 1,
    noiseAmount: 1,
  });
  const block = new Float32Array(RENDER_BLOCK_SIZE);
  let sumOfSquares = 0;
  let sampleCount = 0;
  const blockCount = Math.ceil((MEASURE_SECONDS * SAMPLE_RATE) / RENDER_BLOCK_SIZE);
  for (let blockIndex = 0; blockIndex < blockCount; blockIndex++) {
    engineSynth.renderBlock(block, rpm, rpm, 0.45, 0.45);
    if (blockIndex < blockCount / 3) continue;
    for (const sample of block) sumOfSquares += sample * sample;
    sampleCount += block.length;
  }
  return Math.sqrt(sumOfSquares / sampleCount);
}

/**
 * @param linearValue rapport de niveaux
 * @returns décibels
 */
function toDecibels(linearValue: number): string {
  return linearValue > 0 ? `${(20 * Math.log10(linearValue)).toFixed(1)} dB` : '-inf';
}

for (const profile of Object.values(VEHICLE_PROFILES)) {
  const silentProfile = { ...profile, intakeNoiseAmount: 0, combustionNoiseAmount: 0 };
  const results = [profile.idleRpm, profile.maxRpm].map((rpm) => {
    const fullRms = measureSteadyRms(profile, rpm);
    const noiselessRms = measureSteadyRms(silentProfile, rpm);
    const noiseRms = Math.sqrt(Math.max(fullRms * fullRms - noiselessRms * noiselessRms, 0));
    const intakeOnlyRms = measureSteadyRms({ ...profile, combustionNoiseAmount: 0 }, rpm);
    const intakeRms = Math.sqrt(Math.max(intakeOnlyRms * intakeOnlyRms - noiselessRms * noiselessRms, 0));
    return `${rpm}rpm souffle/moteur=${toDecibels(noiseRms / noiselessRms)} (admission ${toDecibels(intakeRms / noiselessRms)})`;
  });
  const stoppedRms = measureSteadyRms(profile, 0);
  console.log(`${profile.id.padEnd(18)} ${results.join('  ')}  coupé=${toDecibels(stoppedRms)}`);
}
