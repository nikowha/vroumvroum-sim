// Échappement « à tuyaux » par guides d'onde (inspiré de Baldan et al. 2015 et d'enginesound, MIT) :
// un tuyau de collecteur par cylindre → collecteur commun → tuyau droit → silencieux à plusieurs chambres → sortie.
// Les ondes repartent en arrière à chaque changement de section : les cylindres s'influencent, le timbre change avec le régime.

import { DampedCombFilter, OnePoleLowpass } from './dspPrimitives.ts';

/** Réflexion côté soupape : soupape fermée (fond dur) ou ouverte (l'onde repart dans le cylindre). */
const VALVE_CLOSED_REFLECTION = 0.9;
const VALVE_OPEN_REFLECTION = 0.25;
/** Réflexion à l'entrée du collecteur (élargissement de section → réflexion inversée). */
const COLLECTOR_REFLECTION = -0.35;
/** Réflexion à l'entrée du silencieux. */
const MUFFLER_ENTRY_REFLECTION = -0.5;
/** Part de l'onde revenant du tuyau droit renvoyée dans les tuyaux de collecteur (couplage des cylindres). */
const COLLECTOR_COUPLING = 0.6;
/** Amortissement des hautes fréquences dans les tuyaux (Hz). */
const PIPE_DAMPING_HZ = 6000;
/** Longueurs des chambres du silencieux, en fraction de la longueur du tuyau droit. */
const MUFFLER_CHAMBER_FRACTIONS = [0.13, 0.19, 0.27];
const MUFFLER_CHAMBER_FEEDBACK = 0.55;
/** Rayonnement à la sortie : mélange du signal et de sa variation (une sortie de tuyau favorise les aigus). */
const RADIATION_DIFFERENCE_WEIGHT = 0.7;
/** Écart de longueur entre tuyaux de collecteur (collecteurs de longueurs inégales). */
const HEADER_LENGTH_SPREAD = 0.12;
const GOLDEN_RATIO_FRACTION = 0.618034;

/** Tuyau à deux sens de propagation (lignes à retard aller et retour), avec pertes. */
export class WaveguidePipe {
  private readonly forwardLine: Float32Array;
  private readonly backwardLine: Float32Array;
  private position = 0;
  private readonly endReflection: number;
  private readonly endDamping: OnePoleLowpass;
  private readonly startDamping: OnePoleLowpass;
  /** Onde arrivée au bout de sortie au dernier pas (avant réflexion). */
  arrivingAtEnd = 0;
  /** Onde revenue au bout d'entrée au dernier pas (avant réflexion). */
  arrivingAtStart = 0;

  /**
   * @param sampleRate fréquence d'échantillonnage (Hz)
   * @param lengthMeters longueur du tuyau (m)
   * @param endReflection coefficient de réflexion au bout de sortie (-1 à 1)
   * @param speedOfSound vitesse du son (m/s)
   */
  constructor(sampleRate: number, lengthMeters: number, endReflection: number, speedOfSound: number) {
    const delaySamples = Math.max(2, Math.round((lengthMeters / speedOfSound) * sampleRate));
    this.forwardLine = new Float32Array(delaySamples);
    this.backwardLine = new Float32Array(delaySamples);
    this.endReflection = endReflection;
    this.endDamping = new OnePoleLowpass(sampleRate, PIPE_DAMPING_HZ);
    this.startDamping = new OnePoleLowpass(sampleRate, PIPE_DAMPING_HZ);
  }

  /** Vide le tuyau. */
  reset(): void {
    this.forwardLine.fill(0);
    this.backwardLine.fill(0);
    this.endDamping.reset();
    this.startDamping.reset();
    this.position = 0;
    this.arrivingAtEnd = this.arrivingAtStart = 0;
  }

  /**
   * Avance d'un échantillon.
   * @param inputAtStart onde injectée au bout d'entrée
   * @param inputAtEnd onde injectée au bout de sortie (repart vers l'entrée)
   * @param startReflection coefficient de réflexion au bout d'entrée pour ce pas (ex. soupape ouverte / fermée)
   * @returns pression transmise au-delà du bout de sortie
   */
  step(inputAtStart: number, inputAtEnd: number, startReflection: number): number {
    this.arrivingAtEnd = this.endDamping.process(this.forwardLine[this.position]);
    this.arrivingAtStart = this.startDamping.process(this.backwardLine[this.position]);
    this.forwardLine[this.position] = inputAtStart + this.arrivingAtStart * startReflection;
    this.backwardLine[this.position] = inputAtEnd + this.arrivingAtEnd * this.endReflection;
    this.position = (this.position + 1) % this.forwardLine.length;
    return this.arrivingAtEnd * (1 + this.endReflection);
  }
}

/** Système d'échappement complet : collecteur (un tuyau par cylindre), tuyau droit, silencieux, sortie. */
export class ExhaustPipeSystem {
  private readonly headerPipes: WaveguidePipe[];
  private readonly straightPipe: WaveguidePipe;
  private readonly mufflerChambers: DampedCombFilter[];
  private previousOutletSample = 0;
  private returningFromStraightPipe = 0;

  /**
   * @param sampleRate fréquence d'échantillonnage (Hz)
   * @param cylinderCount nombre de cylindres (un tuyau de collecteur chacun)
   * @param headerLengthMeters longueur moyenne des tuyaux de collecteur (m)
   * @param straightPipeLengthMeters longueur du tuyau droit (m)
   * @param speedOfSound vitesse du son (m/s)
   */
  constructor(sampleRate: number, cylinderCount: number, headerLengthMeters: number, straightPipeLengthMeters: number, speedOfSound: number) {
    this.headerPipes = Array.from({ length: cylinderCount }, (_unused, cylinderIndex) => {
      const lengthVariation = 1 + HEADER_LENGTH_SPREAD * (((cylinderIndex * GOLDEN_RATIO_FRACTION) % 1) - 0.5);
      return new WaveguidePipe(sampleRate, headerLengthMeters * lengthVariation, COLLECTOR_REFLECTION, speedOfSound);
    });
    this.straightPipe = new WaveguidePipe(sampleRate, straightPipeLengthMeters, MUFFLER_ENTRY_REFLECTION, speedOfSound);
    this.mufflerChambers = MUFFLER_CHAMBER_FRACTIONS.map(
      (chamberFraction) => new DampedCombFilter(sampleRate, straightPipeLengthMeters * chamberFraction, MUFFLER_CHAMBER_FEEDBACK, speedOfSound),
    );
  }

  /** Vide tous les tuyaux. */
  reset(): void {
    for (const headerPipe of this.headerPipes) headerPipe.reset();
    this.straightPipe.reset();
    for (const mufflerChamber of this.mufflerChambers) mufflerChamber.reset();
    this.previousOutletSample = 0;
    this.returningFromStraightPipe = 0;
  }

  /**
   * Avance d'un échantillon.
   * @param cylinderSignals signal de chaque cylindre (pression à la soupape)
   * @param valveOpenness ouverture de la soupape d'échappement de chaque cylindre (0 fermée, 1 ouverte)
   * @returns son rayonné à la sortie de l'échappement
   */
  process(cylinderSignals: Float32Array, valveOpenness: Float32Array): number {
    const headerCount = this.headerPipes.length;
    const couplingWave = (this.returningFromStraightPipe * COLLECTOR_COUPLING) / headerCount;
    let collectorSum = 0;
    for (let cylinderIndex = 0; cylinderIndex < headerCount; cylinderIndex++) {
      const openness = valveOpenness[cylinderIndex];
      const valveReflection = VALVE_CLOSED_REFLECTION + (VALVE_OPEN_REFLECTION - VALVE_CLOSED_REFLECTION) * openness;
      collectorSum += this.headerPipes[cylinderIndex].step(cylinderSignals[cylinderIndex], couplingWave, valveReflection);
    }
    const collectorSignal = collectorSum / Math.sqrt(headerCount);

    const mufflerInput = this.straightPipe.step(collectorSignal, 0, 0);
    this.returningFromStraightPipe = this.straightPipe.arrivingAtStart;

    let mufflerOutput = 0;
    for (const mufflerChamber of this.mufflerChambers) mufflerOutput += mufflerChamber.process(mufflerInput);
    mufflerOutput /= this.mufflerChambers.length;

    const radiatedSample = mufflerOutput + RADIATION_DIFFERENCE_WEIGHT * (mufflerOutput - this.previousOutletSample);
    this.previousOutletSample = mufflerOutput;
    return radiatedSample;
  }
}
