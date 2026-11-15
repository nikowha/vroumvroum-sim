// Synthèse du moteur (signal « sec », sans Doppler) : impulsions par cylindre + bruit + résonances.
// Modèle simplifié inspiré de Baldan et al. 2015 : combustion → tuyau d'échappement → résonances ; admission ; vibrations.

import { NOISE_SEED, SPEED_OF_SOUND_METERS_PER_SECOND } from '../config.ts';
import type { EngineSettings } from '../model/project.ts';
import { BandpassFilter, DampedCombFilter, DcBlocker, NoiseGenerator, OnePoleLowpass } from './dspPrimitives.ts';
import { getDefaultFiringOrder, getVehicleProfile, type VehicleProfile } from './vehicleProfiles.ts';

/** Un allumage dans le cycle de 720° : position dans le cycle (0 à 1) et cylindre concerné. */
interface FiringSlot {
  cyclePosition: number;
  cylinderIndex: number;
}

const DEGREES_PER_ENGINE_CYCLE = 720;
/** En dessous de ce régime, le moteur est considéré comme arrêté (pas d'allumage). */
const ENGINE_STOPPED_RPM = 120;
const INTAKE_CUTOFF_HZ = 900;
/** Écart de volume maximal entre cylindres (irrégularités réalistes). */
const CYLINDER_GAIN_SPREAD = 0.15;
const GOLDEN_RATIO_FRACTION = 0.618034;
/** Gain appliqué avant la saturation douce finale. */
const OUTPUT_DRIVE = 2.2;
const MECHANICAL_HARMONIC_GAIN = 0.5;

export class EngineSynth {
  private readonly sampleRate: number;
  private profile: VehicleProfile = getVehicleProfile('car');
  private masterGain = 0.8;
  private firingSlots: FiringSlot[] = [];
  private cylinderEnvelopes = new Float32Array(1);
  private cylinderGains = new Float32Array(1);
  private pulseDecayFactor = 0;
  private cyclePosition = 0;
  private crankPhase = 0;
  private exhaustPipe: DampedCombFilter;
  private exhaustResonators: BandpassFilter[] = [];
  private exhaustResonatorGains: number[] = [];
  private readonly intakeFilter: OnePoleLowpass;
  private readonly dcBlocker = new DcBlocker();
  private readonly noiseGenerator = new NoiseGenerator(NOISE_SEED);

  /**
   * @param sampleRate fréquence d'échantillonnage (Hz)
   */
  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
    this.exhaustPipe = new DampedCombFilter(sampleRate, 1, 0, SPEED_OF_SOUND_METERS_PER_SECOND);
    this.intakeFilter = new OnePoleLowpass(sampleRate, INTAKE_CUTOFF_HZ);
  }

  /**
   * Applique les réglages moteur (profil, cylindres, ordre d'allumage, volume) et reconstruit les filtres.
   * @param settings réglages moteur du projet
   */
  configure(settings: EngineSettings): void {
    const profile = getVehicleProfile(settings.profileId);
    const cylinderCount = Math.max(1, Math.min(16, Math.round(settings.cylinderCount)));
    this.profile = profile;
    this.masterGain = settings.masterGain;
    this.firingSlots = buildFiringSlots(profile, cylinderCount, settings.firingOrder);
    this.cylinderEnvelopes = new Float32Array(cylinderCount);
    this.cylinderGains = Float32Array.from({ length: cylinderCount }, (_unused, cylinderIndex) => {
      return 1 - CYLINDER_GAIN_SPREAD * ((cylinderIndex * GOLDEN_RATIO_FRACTION) % 1);
    });
    this.pulseDecayFactor = Math.exp(-1 / (profile.pulseDecaySeconds * this.sampleRate));
    this.exhaustPipe = new DampedCombFilter(
      this.sampleRate,
      profile.exhaustPipeLengthMeters,
      profile.exhaustPipeFeedback,
      SPEED_OF_SOUND_METERS_PER_SECOND,
    );
    this.exhaustResonators = profile.exhaustResonances.map(
      (resonance) => new BandpassFilter(this.sampleRate, resonance.frequencyHz, resonance.quality),
    );
    this.exhaustResonatorGains = profile.exhaustResonances.map((resonance) => resonance.gain);
  }

  /** Remet le moteur à zéro (phase, enveloppes, filtres, bruit) : utile avant un rendu reproductible. */
  reset(): void {
    this.cyclePosition = 0;
    this.crankPhase = 0;
    this.cylinderEnvelopes.fill(0);
    this.exhaustPipe.reset();
    for (const resonator of this.exhaustResonators) resonator.reset();
    this.intakeFilter.reset();
    this.dcBlocker.reset();
    this.noiseGenerator.reset();
  }

  /**
   * Calcule un bloc d'échantillons ; régime et charge sont interpolés linéairement sur le bloc.
   * @param output tampon à remplir
   * @param startRpm régime au début du bloc (tr/min)
   * @param endRpm régime à la fin du bloc (tr/min)
   * @param startLoad charge moteur au début du bloc (0 à 1)
   * @param endLoad charge moteur à la fin du bloc (0 à 1)
   */
  renderBlock(output: Float32Array, startRpm: number, endRpm: number, startLoad: number, endLoad: number): void {
    const frameCount = output.length;
    const profile = this.profile;
    for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
      const blockProgress = frameIndex / frameCount;
      const rpm = startRpm + (endRpm - startRpm) * blockProgress;
      const load = startLoad + (endLoad - startLoad) * blockProgress;

      this.advanceCycleAndFire(rpm, load);
      const pulseSum = this.decayCylinderEnvelopes();
      const noiseSample = this.noiseGenerator.nextSample();

      const combustionSample = pulseSum * (1 + profile.combustionNoiseAmount * (0.5 + load) * noiseSample);
      const exhaustSample = this.processExhaust(combustionSample);
      const intakeSample =
        this.intakeFilter.process(noiseSample) * (0.2 + pulseSum) * profile.intakeNoiseAmount * (0.3 + load);
      const mechanicalSample = this.computeMechanicalVibration(rpm);

      const mixedSample = this.dcBlocker.process(exhaustSample + intakeSample + mechanicalSample);
      output[frameIndex] = Math.tanh(mixedSample * OUTPUT_DRIVE) * this.masterGain;
    }
  }

  /**
   * Avance la position dans le cycle 720° et déclenche les cylindres dont l'angle d'allumage est franchi.
   * @param rpm régime courant (tr/min)
   * @param load charge courante (0 à 1)
   */
  private advanceCycleAndFire(rpm: number, load: number): void {
    const cyclesPerSecond = rpm / 120;
    const previousPosition = this.cyclePosition;
    let currentPosition = previousPosition + cyclesPerSecond / this.sampleRate;
    const hasWrapped = currentPosition >= 1;
    if (hasWrapped) currentPosition -= Math.floor(currentPosition);
    this.cyclePosition = currentPosition;
    if (rpm < ENGINE_STOPPED_RPM) return;

    const pulseAmplitude = 0.5 + 0.5 * load;
    for (const firingSlot of this.firingSlots) {
      const slotPosition = firingSlot.cyclePosition;
      const isCrossed = hasWrapped
        ? slotPosition > previousPosition || slotPosition <= currentPosition
        : slotPosition > previousPosition && slotPosition <= currentPosition;
      if (isCrossed) {
        this.cylinderEnvelopes[firingSlot.cylinderIndex] = pulseAmplitude * this.cylinderGains[firingSlot.cylinderIndex];
      }
    }
  }

  /**
   * Fait décroître l'enveloppe de chaque cylindre et renvoie leur somme.
   * @returns somme des impulsions de combustion
   */
  private decayCylinderEnvelopes(): number {
    let pulseSum = 0;
    for (let cylinderIndex = 0; cylinderIndex < this.cylinderEnvelopes.length; cylinderIndex++) {
      const envelope = this.cylinderEnvelopes[cylinderIndex];
      pulseSum += envelope;
      this.cylinderEnvelopes[cylinderIndex] = envelope * this.pulseDecayFactor;
    }
    return pulseSum;
  }

  /**
   * Passe le signal de combustion dans le tuyau d'échappement puis dans les résonances en parallèle.
   * @param combustionSample échantillon de combustion
   * @returns échantillon d'échappement
   */
  private processExhaust(combustionSample: number): number {
    const pipeSample = this.exhaustPipe.process(combustionSample);
    let resonatedSample = 0;
    for (let resonatorIndex = 0; resonatorIndex < this.exhaustResonators.length; resonatorIndex++) {
      resonatedSample += this.exhaustResonators[resonatorIndex].process(pipeSample) * this.exhaustResonatorGains[resonatorIndex];
    }
    return resonatedSample;
  }

  /**
   * Vibration mécanique : fondamentale et 2e harmonique de la rotation du vilebrequin.
   * @param rpm régime courant (tr/min)
   * @returns échantillon de vibration
   */
  private computeMechanicalVibration(rpm: number): number {
    this.crankPhase += rpm / 60 / this.sampleRate;
    this.crankPhase -= Math.floor(this.crankPhase);
    if (rpm < ENGINE_STOPPED_RPM) return 0;
    const angle = 2 * Math.PI * this.crankPhase;
    return this.profile.mechanicalAmount * (Math.sin(angle) + MECHANICAL_HARMONIC_GAIN * Math.sin(2 * angle));
  }
}

/**
 * Construit la liste des allumages dans un cycle 720°.
 * Allumage régulier (720° / nb cylindres), sauf si le profil a des angles irréguliers pour ce nombre de cylindres.
 * @param profile profil de véhicule
 * @param cylinderCount nombre de cylindres
 * @param firingOrder ordre d'allumage (numéros à partir de 1) ; remplacé par l'ordre par défaut s'il est invalide
 * @returns allumages triés par position dans le cycle
 */
function buildFiringSlots(profile: VehicleProfile, cylinderCount: number, firingOrder: number[]): FiringSlot[] {
  const validFiringOrder = isValidFiringOrder(firingOrder, cylinderCount)
    ? firingOrder
    : getDefaultFiringOrder(profile, cylinderCount);
  const unevenAngles =
    profile.unevenFiringAnglesDegrees && profile.unevenFiringAnglesDegrees.length === cylinderCount
      ? profile.unevenFiringAnglesDegrees
      : null;
  return validFiringOrder.map((cylinderNumber, slotIndex) => {
    const angleDegrees = unevenAngles ? unevenAngles[slotIndex] : (slotIndex * DEGREES_PER_ENGINE_CYCLE) / cylinderCount;
    return { cyclePosition: angleDegrees / DEGREES_PER_ENGINE_CYCLE, cylinderIndex: cylinderNumber - 1 };
  });
}

/**
 * Vérifie qu'un ordre d'allumage contient chaque cylindre de 1 à N exactement une fois.
 * @param firingOrder ordre d'allumage
 * @param cylinderCount nombre de cylindres
 * @returns true si l'ordre est valide
 */
export function isValidFiringOrder(firingOrder: number[], cylinderCount: number): boolean {
  if (firingOrder.length !== cylinderCount) return false;
  const sortedNumbers = [...firingOrder].sort((firstNumber, secondNumber) => firstNumber - secondNumber);
  return sortedNumbers.every((cylinderNumber, cylinderIndex) => cylinderNumber === cylinderIndex + 1);
}
