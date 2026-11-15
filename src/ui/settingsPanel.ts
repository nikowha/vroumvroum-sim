// Panneau des réglages moteur et projet : relie les champs du HTML aux données du projet.

import { isValidFiringOrder } from '../dsp/engineSynth.ts';
import { getDefaultFiringOrder, getVehicleProfile, VEHICLE_PROFILES } from '../dsp/vehicleProfiles.ts';
import type { Project, VehicleProfileId } from '../model/project.ts';

export interface SettingsPanelCallbacks {
  onEngineChanged: () => void;
  onDurationChanged: () => void;
}

const MIN_DURATION_SECONDS = 1;
const MAX_DURATION_SECONDS = 600;

/**
 * Récupère un élément du HTML par son id, avec une erreur claire s'il manque.
 * @param elementId id de l'élément
 * @returns élément trouvé
 */
export function getRequiredElement<ElementType extends HTMLElement>(elementId: string): ElementType {
  const element = document.getElementById(elementId);
  if (!element) throw new Error(`getRequiredElement: élément #${elementId} introuvable`);
  return element as ElementType;
}

/**
 * Formate un ordre d'allumage pour l'affichage (ex. « 1-3-4-2 »).
 * @param firingOrder ordre d'allumage
 * @returns texte
 */
function formatFiringOrder(firingOrder: number[]): string {
  return firingOrder.join('-');
}

/**
 * Lit un ordre d'allumage tapé par l'utilisateur (séparateurs libres : « 1-3-4-2 », « 1 3 4 2 »…).
 * @param text texte saisi
 * @returns numéros de cylindres
 */
function parseFiringOrder(text: string): number[] {
  return text
    .split(/[^0-9]+/)
    .filter((part) => part.length > 0)
    .map(Number);
}

export class SettingsPanel {
  private readonly getProject: () => Project;
  private readonly callbacks: SettingsPanelCallbacks;
  private readonly profileSelect = getRequiredElement<HTMLSelectElement>('profileSelect');
  private readonly cylinderCountInput = getRequiredElement<HTMLInputElement>('cylinderCountInput');
  private readonly firingOrderInput = getRequiredElement<HTMLInputElement>('firingOrderInput');
  private readonly masterGainInput = getRequiredElement<HTMLInputElement>('masterGainInput');
  private readonly durationInput = getRequiredElement<HTMLInputElement>('durationInput');

  /**
   * @param getProject renvoie le projet courant
   * @param callbacks fonctions appelées après une modification
   */
  constructor(getProject: () => Project, callbacks: SettingsPanelCallbacks) {
    this.getProject = getProject;
    this.callbacks = callbacks;
    for (const profile of Object.values(VEHICLE_PROFILES)) {
      this.profileSelect.add(new Option(profile.label, profile.id));
    }
    this.profileSelect.addEventListener('change', () => this.applyProfile());
    this.cylinderCountInput.addEventListener('change', () => this.applyCylinderCount());
    this.firingOrderInput.addEventListener('input', () => this.applyFiringOrder());
    this.masterGainInput.addEventListener('input', () => this.applyMasterGain());
    this.durationInput.addEventListener('change', () => this.applyDuration());
    this.refreshFromProject();
  }

  /** Recopie les valeurs du projet dans les champs (après chargement d'un fichier, par exemple). */
  refreshFromProject(): void {
    const project = this.getProject();
    this.profileSelect.value = project.engine.profileId;
    this.cylinderCountInput.value = String(project.engine.cylinderCount);
    this.firingOrderInput.value = formatFiringOrder(project.engine.firingOrder);
    this.firingOrderInput.classList.remove('is-invalid');
    this.masterGainInput.value = String(project.engine.masterGain);
    this.durationInput.value = String(project.durationSeconds);
  }

  /** Nouveau profil : reprend son nombre de cylindres et son ordre d'allumage par défaut. */
  private applyProfile(): void {
    const engine = this.getProject().engine;
    const profile = getVehicleProfile(this.profileSelect.value as VehicleProfileId);
    engine.profileId = profile.id;
    engine.cylinderCount = profile.defaultCylinderCount;
    engine.firingOrder = getDefaultFiringOrder(profile, profile.defaultCylinderCount);
    this.refreshFromProject();
    this.callbacks.onEngineChanged();
  }

  /** Nouveau nombre de cylindres : ordre d'allumage remis par défaut. */
  private applyCylinderCount(): void {
    const engine = this.getProject().engine;
    const MAX_CYLINDER_COUNT = 16;
    const cylinderCount = Math.min(MAX_CYLINDER_COUNT, Math.max(1, Math.round(Number(this.cylinderCountInput.value) || 1)));
    engine.cylinderCount = cylinderCount;
    engine.firingOrder = getDefaultFiringOrder(getVehicleProfile(engine.profileId), cylinderCount);
    this.refreshFromProject();
    this.callbacks.onEngineChanged();
  }

  /** Ordre d'allumage saisi : appliqué seulement s'il est valide (sinon le champ passe en rouge). */
  private applyFiringOrder(): void {
    const engine = this.getProject().engine;
    const firingOrder = parseFiringOrder(this.firingOrderInput.value);
    const isValid = isValidFiringOrder(firingOrder, engine.cylinderCount);
    this.firingOrderInput.classList.toggle('is-invalid', !isValid);
    if (!isValid) return;
    engine.firingOrder = firingOrder;
    this.callbacks.onEngineChanged();
  }

  /** Volume général. */
  private applyMasterGain(): void {
    this.getProject().engine.masterGain = Number(this.masterGainInput.value);
    this.callbacks.onEngineChanged();
  }

  /** Durée du projet (s). */
  private applyDuration(): void {
    const durationSeconds = Math.min(MAX_DURATION_SECONDS, Math.max(MIN_DURATION_SECONDS, Number(this.durationInput.value) || MIN_DURATION_SECONDS));
    this.getProject().durationSeconds = durationSeconds;
    this.durationInput.value = String(durationSeconds);
    this.callbacks.onDurationChanged();
  }
}
