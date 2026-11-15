// Mesure du niveau par profil à régime constant, micro à 5 m (gain de distance = 1).
// Affiche le niveau AVANT la saturation finale : au-dessus de ~1, le son sature audiblement.
// Lancement : npm run check-levels

import { SAMPLE_RATE, RENDER_BLOCK_SIZE } from '../src/config.ts';
import { EngineSynth } from '../src/dsp/engineSynth.ts';
import { getDefaultFiringOrder, VEHICLE_PROFILES } from '../src/dsp/vehicleProfiles.ts';

const MEASURE_SECONDS = 1.5;
const RPM_FRACTIONS_OF_MAX = [0, 0.5, 1, 1.25];
const TEST_LOADS = [0.45, 1];
/** Crête visée avant saturation, au pire cas (pleine charge, sur-régime compris). */
const TARGET_WORST_PEAK = 0.7;

for (const profile of Object.values(VEHICLE_PROFILES)) {
  const resultTexts: string[] = [];
  let worstPeak = 0;
  for (const rpmFraction of RPM_FRACTIONS_OF_MAX) {
    const rpm = rpmFraction === 0 ? profile.idleRpm : profile.maxRpm * rpmFraction;
    for (const load of TEST_LOADS) {
      const engineSynth = new EngineSynth(SAMPLE_RATE);
      engineSynth.configure({
        profileId: profile.id,
        cylinderCount: profile.defaultCylinderCount,
        firingOrder: getDefaultFiringOrder(profile, profile.defaultCylinderCount),
        masterGain: 1,
      });
      const block = new Float32Array(RENDER_BLOCK_SIZE);
      let peakBeforeSaturation = 0;
      const blockCount = Math.ceil((MEASURE_SECONDS * SAMPLE_RATE) / RENDER_BLOCK_SIZE);
      for (let blockIndex = 0; blockIndex < blockCount; blockIndex++) {
        engineSynth.renderBlock(block, rpm, rpm, load, load);
        if (blockIndex > blockCount / 3) peakBeforeSaturation = Math.max(peakBeforeSaturation, engineSynth.getBlockPeakBeforeSaturation());
      }
      worstPeak = Math.max(worstPeak, peakBeforeSaturation);
      resultTexts.push(`${Math.round(rpm)}rpm/L${load}=${peakBeforeSaturation.toFixed(2)}`);
    }
  }
  const suggestedGain = (profile.outputGain * TARGET_WORST_PEAK) / worstPeak;
  console.log(`${profile.id.padEnd(18)} worst=${worstPeak.toFixed(2)} gain=${profile.outputGain} (conseillé ${suggestedGain.toFixed(2)})  ${resultTexts.join('  ')}`);
}
