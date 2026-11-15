// Synthèse du moteur (signal « sec », sans Doppler ni environnement).
// Inspiré de Baldan et al. 2015 et d'enginesound (MIT) :
// explosions par cylindre (clic sec ou impulsion douce) + irrégularités → échappement (simple ou à tuyaux) ; admission ; vibrations.

import { NOISE_SEED, SPEED_OF_SOUND_METERS_PER_SECOND } from '../config.ts';
import { getEffectAmount, type EffectSettings } from '../model/effects.ts';
import type { EngineSettings } from '../model/project.ts';
import { BandpassFilter, DampedCombFilter, DcBlocker, NoiseGenerator, OnePoleLowpass } from './dspPrimitives.ts';
import { ExhaustPipeSystem } from './exhaustPipes.ts';
import { getDefaultFiringOrder, getVehicleProfile, type VehicleProfile } from './vehicleProfiles.ts';

/** Un allumage dans le cycle de 720° : position dans le cycle (0 à 1) et cylindre concerné. */
interface FiringSlot {
  cyclePosition: number;
  cylinderIndex: number;
}

/** Doses des effets utilisés par le moteur (0 = effet coupé). */
interface EngineEffectAmounts {
  breath: number;
  irregularity: number;
  softPulse: number;
  pipeExhaust: number;
}

const DEGREES_PER_ENGINE_CYCLE = 720;
/** En dessous de ce régime, le moteur est considéré comme arrêté (pas d'allumage). */
const ENGINE_STOPPED_RPM = 120;
const MAX_CYLINDER_COUNT = 16;
const INTAKE_CUTOFF_HZ = 900;
/** Lissage du débit d'air de l'admission (Hz) : suit le rythme des allumages, s'éteint moteur coupé. */
const AIRFLOW_SMOOTHING_HZ = 25;
const AIRFLOW_GAIN = 0.6;
/** Écart de volume fixe entre cylindres. */
const CYLINDER_GAIN_SPREAD = 0.15;
const GOLDEN_RATIO_FRACTION = 0.618034;
const MECHANICAL_HARMONIC_GAIN = 0.5;
/** Limiteur de régime : au-delà de ce multiple du régime max du profil, le régime n'augmente plus. */
const OVER_REV_LIMIT = 1.25;

// --- Irrégularités (dose 1) ---
/** Variation de vitesse du vilebrequin (fraction du régime). */
const CRANK_SPEED_VARIATION = 0.02;
/** Lissage de la variation de vitesse (Hz) : variations lentes, sur quelques cycles. */
const CRANK_SPEED_SMOOTHING_HZ = 4;
/** Variation de force d'une explosion à l'autre. */
const COMBUSTION_STRENGTH_VARIATION = 0.18;
/** Au ralenti, probabilité d'une explosion faible (ralenti « qui cogne »), qui diminue quand le régime monte. */
const WEAK_COMBUSTION_PROBABILITY_AT_IDLE = 0.06;
const WEAK_COMBUSTION_STRENGTH = 0.45;

// --- Explosion douce ---
/** Rapport entre la dépression qui suit l'explosion et l'explosion elle-même. */
const SOFT_PULSE_UNDERSHOOT = 0.35;
/** Durée d'ouverture de la soupape d'échappement (fraction du cycle 720°, environ 240°). */
const EXHAUST_VALVE_OPEN_CYCLE_FRACTION = 0.33;
/** Cylindre inactif : grande valeur de « cycles depuis l'allumage ». */
const INACTIVE_CYLINDER_CYCLES = 1e9;


export class EngineSynth {
  private readonly sampleRate: number;
  private profile: VehicleProfile = getVehicleProfile('car');
  private masterGain = 0.8;
  private effectAmounts: EngineEffectAmounts = { breath: 1, irregularity: 1, softPulse: 1, pipeExhaust: 1 };
  private firingSlots: FiringSlot[] = [];
  private cylinderEnvelopes = new Float32Array(1);
  private cylinderGains = new Float32Array(1);
  private cylinderPulseAmplitudes = new Float32Array(1);
  private cylinderCyclesSinceFiring = new Float32Array(1);
  private cylinderSignals = new Float32Array(1);
  private valveOpenness = new Float32Array(1);
  private pulseDecayFactor = 0;
  private cyclePosition = 0;
  private crankPhase = 0;
  private heldSpeedOffset = 0;
  private simpleExhaustPipe: DampedCombFilter;
  private exhaustResonators: BandpassFilter[] = [];
  private exhaustResonatorGains: number[] = [];
  private pipeExhaust: ExhaustPipeSystem;
  private readonly intakeFilter: OnePoleLowpass;
  private readonly intakeSecondFilter: OnePoleLowpass;
  private readonly pulseBrightnessFilter: OnePoleLowpass;
  private readonly pipeBrightnessFilter: OnePoleLowpass;
  private readonly airflowFilter: OnePoleLowpass;
  private readonly crankSpeedFilter: OnePoleLowpass;
  private readonly dcBlocker = new DcBlocker();
  private readonly noiseGenerator = new NoiseGenerator(NOISE_SEED);
  private readonly irregularityRandom = new NoiseGenerator(NOISE_SEED ^ 0x5bd1e995);
  private blockPeakBeforeSaturation = 0;

  /**
   * @param sampleRate fréquence d'échantillonnage (Hz)
   */
  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
    this.simpleExhaustPipe = new DampedCombFilter(sampleRate, 1, 0, SPEED_OF_SOUND_METERS_PER_SECOND);
    this.pipeExhaust = new ExhaustPipeSystem(sampleRate, 1, 1, 1, SPEED_OF_SOUND_METERS_PER_SECOND);
    this.intakeFilter = new OnePoleLowpass(sampleRate, INTAKE_CUTOFF_HZ);
    this.intakeSecondFilter = new OnePoleLowpass(sampleRate, INTAKE_CUTOFF_HZ);
    this.pulseBrightnessFilter = new OnePoleLowpass(sampleRate, this.profile.pulseBrightnessHz);
    this.pipeBrightnessFilter = new OnePoleLowpass(sampleRate, this.profile.pulseBrightnessHz);
    this.airflowFilter = new OnePoleLowpass(sampleRate, AIRFLOW_SMOOTHING_HZ);
    this.crankSpeedFilter = new OnePoleLowpass(sampleRate, CRANK_SPEED_SMOOTHING_HZ);
  }

  /**
   * Applique les réglages moteur et les doses d'effets, et reconstruit les filtres.
   * @param settings réglages moteur du projet
   * @param effectSettings réglages de mixage / réalisme du projet
   */
  configure(settings: EngineSettings, effectSettings: EffectSettings): void {
    this.configureWithProfile(getVehicleProfile(settings.profileId), settings, effectSettings);
  }

  /**
   * Comme configure, mais avec un profil fourni directement (profil modifié pour les mesures, futur profil personnalisé).
   * @param profile profil de véhicule
   * @param settings réglages moteur du projet (cylindres, ordre d'allumage, volume)
   * @param effectSettings réglages de mixage / réalisme
   */
  configureWithProfile(profile: VehicleProfile, settings: EngineSettings, effectSettings: EffectSettings): void {
    const cylinderCount = Math.max(1, Math.min(MAX_CYLINDER_COUNT, Math.round(settings.cylinderCount)));
    this.profile = profile;
    this.masterGain = settings.masterGain;
    this.effectAmounts = {
      breath: getEffectAmount(effectSettings, 'breath'),
      irregularity: getEffectAmount(effectSettings, 'irregularity'),
      softPulse: Math.min(1, getEffectAmount(effectSettings, 'softPulse')),
      pipeExhaust: Math.min(1, getEffectAmount(effectSettings, 'pipeExhaust')),
    };
    this.firingSlots = buildFiringSlots(profile, cylinderCount, settings.firingOrder);
    this.cylinderEnvelopes = new Float32Array(cylinderCount);
    this.cylinderPulseAmplitudes = new Float32Array(cylinderCount);
    this.cylinderCyclesSinceFiring = new Float32Array(cylinderCount).fill(INACTIVE_CYLINDER_CYCLES);
    this.cylinderSignals = new Float32Array(cylinderCount);
    this.valveOpenness = new Float32Array(cylinderCount);
    const gainPattern =
      profile.cylinderGainPattern && profile.cylinderGainPattern.length === cylinderCount ? profile.cylinderGainPattern : null;
    this.cylinderGains = Float32Array.from({ length: cylinderCount }, (_unused, cylinderIndex) => {
      const fixedIrregularity = 1 - CYLINDER_GAIN_SPREAD * ((cylinderIndex * GOLDEN_RATIO_FRACTION) % 1);
      return fixedIrregularity * (gainPattern ? gainPattern[cylinderIndex] : 1);
    });
    this.pulseBrightnessFilter.setCutoff(profile.pulseBrightnessHz);
    this.pipeBrightnessFilter.setCutoff(profile.pulseBrightnessHz);
    this.pulseDecayFactor = Math.exp(-1 / (profile.pulseDecaySeconds * this.sampleRate));
    this.simpleExhaustPipe = new DampedCombFilter(
      this.sampleRate,
      profile.exhaustPipeLengthMeters,
      profile.exhaustPipeFeedback,
      SPEED_OF_SOUND_METERS_PER_SECOND,
    );
    this.exhaustResonators = profile.exhaustResonances.map(
      (resonance) => new BandpassFilter(this.sampleRate, resonance.frequencyHz, resonance.quality),
    );
    this.exhaustResonatorGains = profile.exhaustResonances.map((resonance) => resonance.gain);
    this.pipeExhaust = new ExhaustPipeSystem(
      this.sampleRate,
      cylinderCount,
      profile.headerLengthMeters,
      profile.exhaustPipeLengthMeters,
      SPEED_OF_SOUND_METERS_PER_SECOND,
    );
  }

  /** Remet le moteur à zéro (phase, enveloppes, filtres, bruits) : utile avant un rendu reproductible. */
  reset(): void {
    this.cyclePosition = 0;
    this.crankPhase = 0;
    this.heldSpeedOffset = 0;
    this.cylinderEnvelopes.fill(0);
    this.cylinderPulseAmplitudes.fill(0);
    this.cylinderCyclesSinceFiring.fill(INACTIVE_CYLINDER_CYCLES);
    this.simpleExhaustPipe.reset();
    for (const resonator of this.exhaustResonators) resonator.reset();
    this.pipeExhaust.reset();
    this.intakeFilter.reset();
    this.intakeSecondFilter.reset();
    this.pulseBrightnessFilter.reset();
    this.pipeBrightnessFilter.reset();
    this.airflowFilter.reset();
    this.crankSpeedFilter.reset();
    this.dcBlocker.reset();
    this.noiseGenerator.reset();
    this.irregularityRandom.reset();
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
    const effectAmounts = this.effectAmounts;
    const rpmLimit = profile.maxRpm * OVER_REV_LIMIT;
    let blockPeak = 0;
    for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
      const blockProgress = frameIndex / frameCount;
      const rpm = Math.min(startRpm + (endRpm - startRpm) * blockProgress, rpmLimit);
      const load = startLoad + (endLoad - startLoad) * blockProgress;

      const cyclesAdvanced = this.advanceCycleAndFire(rpm, load);
      const noiseSample = this.noiseGenerator.nextSample();
      const envelopeSum = this.updateCylinderSignals(cyclesAdvanced, noiseSample, load);

      const exhaustSample = this.processExhaust();
      // Admission : souffle sourd (filtré deux fois) proportionnel au débit d'air (impulsions lissées), donc nul moteur coupé.
      const airflow = this.airflowFilter.process(envelopeSum) * AIRFLOW_GAIN;
      const intakeSample =
        this.intakeSecondFilter.process(this.intakeFilter.process(noiseSample)) *
        airflow *
        effectAmounts.breath *
        profile.intakeNoiseAmount *
        (0.3 + load);
      const mechanicalSample = this.computeMechanicalVibration(rpm);

      const drivenSample = this.dcBlocker.process(exhaustSample + intakeSample + mechanicalSample) * profile.outputGain;
      blockPeak = Math.max(blockPeak, Math.abs(drivenSample));
      output[frameIndex] = Math.tanh(drivenSample) * this.masterGain;
    }
    this.blockPeakBeforeSaturation = blockPeak;
  }

  /**
   * Niveau crête du dernier bloc avant la saturation douce finale (limiteur de sécurité : au-dessus de ~0,8, elle s'entend).
   * @returns crête avant saturation
   */
  getBlockPeakBeforeSaturation(): number {
    return this.blockPeakBeforeSaturation;
  }

  /**
   * Avance la position dans le cycle 720° (avec la variation lente de vitesse du vilebrequin)
   * et déclenche les cylindres dont l'angle d'allumage est franchi.
   * @param rpm régime courant (tr/min)
   * @param load charge courante (0 à 1)
   * @returns fraction de cycle parcourue pendant cet échantillon
   */
  private advanceCycleAndFire(rpm: number, load: number): number {
    const irregularity = this.effectAmounts.irregularity;
    const speedOffset = this.crankSpeedFilter.process(this.heldSpeedOffset);
    const speedFactor = 1 + irregularity * CRANK_SPEED_VARIATION * speedOffset;
    const cyclesAdvanced = ((rpm / 120) * speedFactor) / this.sampleRate;

    const previousPosition = this.cyclePosition;
    let currentPosition = previousPosition + cyclesAdvanced;
    const hasWrapped = currentPosition >= 1;
    if (hasWrapped) currentPosition -= Math.floor(currentPosition);
    this.cyclePosition = currentPosition;
    if (rpm < ENGINE_STOPPED_RPM) return cyclesAdvanced;

    for (const firingSlot of this.firingSlots) {
      const slotPosition = firingSlot.cyclePosition;
      const isCrossed = hasWrapped
        ? slotPosition > previousPosition || slotPosition <= currentPosition
        : slotPosition > previousPosition && slotPosition <= currentPosition;
      if (isCrossed) this.fireCylinder(firingSlot.cylinderIndex, rpm, load);
    }
    return cyclesAdvanced;
  }

  /**
   * Déclenche l'explosion d'un cylindre, avec sa force propre et, selon la dose d'irrégularités,
   * une variation aléatoire de force, parfois une explosion faible au ralenti, et un nouveau tirage de vitesse du vilebrequin.
   * @param cylinderIndex cylindre concerné
   * @param rpm régime courant (tr/min)
   * @param load charge courante (0 à 1)
   */
  private fireCylinder(cylinderIndex: number, rpm: number, load: number): void {
    const irregularity = this.effectAmounts.irregularity;
    const strengthVariation = 1 + irregularity * COMBUSTION_STRENGTH_VARIATION * this.irregularityRandom.nextSample();
    const idleCloseness = Math.max(0, 1 - (rpm - this.profile.idleRpm) / this.profile.idleRpm);
    const weakChance = irregularity * WEAK_COMBUSTION_PROBABILITY_AT_IDLE * idleCloseness;
    const isWeakCombustion = (this.irregularityRandom.nextSample() + 1) / 2 < weakChance;
    const amplitude =
      (0.5 + 0.5 * load) * this.cylinderGains[cylinderIndex] * strengthVariation * (isWeakCombustion ? WEAK_COMBUSTION_STRENGTH : 1);

    this.cylinderEnvelopes[cylinderIndex] = amplitude;
    this.cylinderPulseAmplitudes[cylinderIndex] = amplitude;
    this.cylinderCyclesSinceFiring[cylinderIndex] = 0;
    this.heldSpeedOffset = this.irregularityRandom.nextSample();
  }

  /**
   * Calcule le signal de chaque cylindre (mélange clic sec / impulsion douce + bruit de combustion)
   * et l'ouverture de sa soupape d'échappement.
   * @param cyclesAdvanced fraction de cycle parcourue pendant cet échantillon
   * @param noiseSample échantillon de bruit blanc
   * @param load charge courante (0 à 1)
   * @returns somme des enveloppes des cylindres (sert au débit d'air de l'admission)
   */
  private updateCylinderSignals(cyclesAdvanced: number, noiseSample: number, load: number): number {
    const profile = this.profile;
    const softPulseAmount = this.effectAmounts.softPulse;
    const noiseScale = this.effectAmounts.breath * profile.combustionNoiseAmount * (0.5 + load);
    let envelopeSum = 0;
    for (let cylinderIndex = 0; cylinderIndex < this.cylinderEnvelopes.length; cylinderIndex++) {
      const envelope = this.cylinderEnvelopes[cylinderIndex];
      this.cylinderEnvelopes[cylinderIndex] = envelope * this.pulseDecayFactor;
      envelopeSum += envelope;

      const cyclesSinceFiring = this.cylinderCyclesSinceFiring[cylinderIndex];
      this.cylinderCyclesSinceFiring[cylinderIndex] = cyclesSinceFiring + cyclesAdvanced;
      const softPulse =
        this.cylinderPulseAmplitudes[cylinderIndex] * computeSoftPulseShape(cyclesSinceFiring / profile.pulseDurationCycleFraction);
      // Le bruit suit le carré de l'enveloppe : concentré sur l'attaque, pas de souffle continu à haut régime.
      const combustionNoise = noiseScale * noiseSample * envelope * envelope;
      this.cylinderSignals[cylinderIndex] = envelope + (softPulse - envelope) * softPulseAmount + combustionNoise;
      this.valveOpenness[cylinderIndex] = computeExhaustValveOpenness(cyclesSinceFiring);
    }
    return envelopeSum;
  }

  /**
   * Échappement : mélange du modèle simple (tuyau + résonances) et du modèle à tuyaux (collecteur, tuyau, silencieux).
   * Seul le modèle utilisé est calculé quand la dose vaut 0 ou 1.
   * @returns échantillon d'échappement
   */
  private processExhaust(): number {
    const pipeAmount = this.effectAmounts.pipeExhaust;
    let simpleSample = 0;
    let pipeSample = 0;
    if (pipeAmount < 1) {
      let cylinderSum = 0;
      for (const cylinderSignal of this.cylinderSignals) cylinderSum += cylinderSignal;
      simpleSample = this.processSimpleExhaust(this.pulseBrightnessFilter.process(cylinderSum));
    }
    if (pipeAmount > 0) {
      pipeSample = this.pipeBrightnessFilter.process(this.pipeExhaust.process(this.cylinderSignals, this.valveOpenness)) * this.profile.pipeExhaustGain;
    }
    return simpleSample + (pipeSample - simpleSample) * pipeAmount;
  }

  /**
   * Modèle simple : un tuyau (peigne amorti) puis les résonances du profil en parallèle.
   * @param combustionSample somme des signaux des cylindres
   * @returns échantillon d'échappement
   */
  private processSimpleExhaust(combustionSample: number): number {
    const pipeSample = this.simpleExhaustPipe.process(combustionSample);
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
 * Forme de l'explosion douce : une bosse de pression (demi-sinus) suivie d'une petite dépression.
 * @param pulseProgress temps depuis l'allumage, en durées d'explosion (0 = allumage)
 * @returns valeur de la forme (0 en dehors de l'explosion)
 */
function computeSoftPulseShape(pulseProgress: number): number {
  if (pulseProgress < 1) return Math.sin(Math.PI * pulseProgress);
  if (pulseProgress < 2) return -SOFT_PULSE_UNDERSHOOT * Math.sin(Math.PI * (pulseProgress - 1));
  return 0;
}

/**
 * Ouverture de la soupape d'échappement après l'allumage (demi-sinus sur environ 240°).
 * @param cyclesSinceFiring fraction de cycle écoulée depuis l'allumage du cylindre
 * @returns ouverture de 0 (fermée) à 1 (grande ouverte)
 */
function computeExhaustValveOpenness(cyclesSinceFiring: number): number {
  if (cyclesSinceFiring >= EXHAUST_VALVE_OPEN_CYCLE_FRACTION) return 0;
  return Math.sin((Math.PI * cyclesSinceFiring) / EXHAUST_VALVE_OPEN_CYCLE_FRACTION);
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
