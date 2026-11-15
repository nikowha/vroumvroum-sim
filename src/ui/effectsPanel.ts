// Panneau « Mixage / réalisme » : une ligne par effet (case pour activer / couper, curseur de dose, valeur).

import { EFFECT_DEFINITIONS, type EffectDefinition, type EffectKey } from '../model/effects.ts';
import type { Project } from '../model/project.ts';

interface EffectRowControls {
  enabledCheckbox: HTMLInputElement;
  amountSlider: HTMLInputElement;
  valueLabel: HTMLSpanElement;
}

const SLIDER_STEP = 0.05;

export class EffectsPanel {
  private readonly getProject: () => Project;
  private readonly onEffectsChanged: () => void;
  private readonly rowControls = new Map<EffectKey, EffectRowControls>();

  /**
   * @param container élément qui reçoit les lignes
   * @param getProject renvoie le projet courant
   * @param onEffectsChanged appelé après chaque modification
   */
  constructor(container: HTMLElement, getProject: () => Project, onEffectsChanged: () => void) {
    this.getProject = getProject;
    this.onEffectsChanged = onEffectsChanged;
    for (const definition of EFFECT_DEFINITIONS) container.append(this.createEffectRow(definition));
    this.refreshFromProject();
  }

  /**
   * Crée la ligne d'un effet et branche ses événements.
   * @param definition description de l'effet
   * @returns élément de la ligne
   */
  private createEffectRow(definition: EffectDefinition): HTMLElement {
    const rowElement = document.createElement('div');
    rowElement.className = 'effect-row';
    rowElement.title = definition.description;

    const enabledCheckbox = document.createElement('input');
    enabledCheckbox.type = 'checkbox';
    enabledCheckbox.setAttribute('aria-label', `Activer ${definition.label}`);
    const nameLabel = document.createElement('span');
    nameLabel.className = 'effect-name';
    nameLabel.textContent = definition.label;
    const valueLabel = document.createElement('span');
    valueLabel.className = 'effect-value';
    const amountSlider = document.createElement('input');
    amountSlider.type = 'range';
    amountSlider.min = '0';
    amountSlider.max = String(definition.maxAmount);
    amountSlider.step = String(SLIDER_STEP);
    amountSlider.setAttribute('aria-label', `Dose ${definition.label}`);

    enabledCheckbox.addEventListener('change', () => this.applyRow(definition.key));
    amountSlider.addEventListener('input', () => this.applyRow(definition.key));
    // Double-clic / double-tap sur le nom : remet la dose par défaut.
    nameLabel.addEventListener('dblclick', () => {
      amountSlider.value = String(definition.defaultAmount);
      this.applyRow(definition.key);
    });

    rowElement.append(enabledCheckbox, nameLabel, valueLabel, amountSlider);
    this.rowControls.set(definition.key, { enabledCheckbox, amountSlider, valueLabel });
    return rowElement;
  }

  /**
   * Recopie une ligne dans le projet et prévient l'application.
   * @param effectKey effet modifié
   */
  private applyRow(effectKey: EffectKey): void {
    const controls = this.rowControls.get(effectKey);
    if (!controls) return;
    const effectSetting = this.getProject().effects[effectKey];
    effectSetting.isEnabled = controls.enabledCheckbox.checked;
    effectSetting.amount = Number(controls.amountSlider.value);
    this.updateRowAppearance(controls, effectSetting.isEnabled, effectSetting.amount);
    this.onEffectsChanged();
  }

  /**
   * Met à jour la valeur affichée et grise la ligne si l'effet est coupé.
   * @param controls éléments de la ligne
   * @param isEnabled effet actif
   * @param amount dose
   */
  private updateRowAppearance(controls: EffectRowControls, isEnabled: boolean, amount: number): void {
    controls.valueLabel.textContent = isEnabled ? `${Math.round(amount * 100)} %` : 'coupé';
    controls.amountSlider.disabled = !isEnabled;
    controls.enabledCheckbox.closest('.effect-row')?.classList.toggle('is-disabled', !isEnabled);
  }

  /** Recopie les réglages du projet dans les lignes (après chargement d'un fichier). */
  refreshFromProject(): void {
    const effectSettings = this.getProject().effects;
    for (const [effectKey, controls] of this.rowControls) {
      const effectSetting = effectSettings[effectKey];
      controls.enabledCheckbox.checked = effectSetting.isEnabled;
      controls.amountSlider.value = String(effectSetting.amount);
      this.updateRowAppearance(controls, effectSetting.isEnabled, effectSetting.amount);
    }
  }
}
