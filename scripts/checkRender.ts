// Vérification du DSP dans Node (sans navigateur) : rend le projet de démo pour chaque profil,
// affiche crête / RMS / vitesse et écrit les WAV dans renders/ pour écoute.
// Lancement : npm run check-render

import { mkdirSync, writeFileSync } from 'node:fs';
import { SAMPLE_RATE } from '../src/config.ts';
import { measurePeak, renderProjectOffline } from '../src/audio/offlineRender.ts';
import { encodeWav } from '../src/audio/wavEncoder.ts';
import { getDefaultFiringOrder, VEHICLE_PROFILES } from '../src/dsp/vehicleProfiles.ts';
import { createDefaultProject } from '../src/model/project.ts';

/**
 * Calcule la valeur efficace (RMS) d'un signal.
 * @param samples échantillons
 * @returns RMS
 */
function measureRms(samples: Float32Array): number {
  let sumOfSquares = 0;
  for (const sample of samples) sumOfSquares += sample * sample;
  return Math.sqrt(sumOfSquares / samples.length);
}

mkdirSync('renders', { recursive: true });
for (const profile of Object.values(VEHICLE_PROFILES)) {
  const project = createDefaultProject();
  project.engine.profileId = profile.id;
  project.engine.cylinderCount = profile.defaultCylinderCount;
  project.engine.firingOrder = getDefaultFiringOrder(profile, profile.defaultCylinderCount);
  const rpmScale = profile.maxRpm / 7000;
  for (const rpmPoint of project.curves.rpm.points) rpmPoint.value *= rpmScale;

  const startMilliseconds = performance.now();
  const samples = renderProjectOffline(project, SAMPLE_RATE);
  const elapsedMilliseconds = performance.now() - startMilliseconds;
  const hasInvalidSample = samples.some((sample) => !Number.isFinite(sample));
  console.log(
    `${profile.id.padEnd(10)} peak=${measurePeak(samples).toFixed(3)} rms=${measureRms(samples).toFixed(4)} ` +
      `invalid=${hasInvalidSample} render=${elapsedMilliseconds.toFixed(0)}ms for ${project.durationSeconds}s`,
  );
  writeFileSync(`renders/${profile.id}.wav`, new Uint8Array(encodeWav([samples], SAMPLE_RATE, 'pcm24')));
}
