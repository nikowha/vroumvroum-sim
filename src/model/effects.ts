// Réglages de mixage / réalisme : chaque effet peut être activé ou non et dosé. Données pures, sans DOM.

export type EffectKey =
  | 'breath'
  | 'irregularity'
  | 'softPulse'
  | 'pipeExhaust'
  | 'groundReflection'
  | 'reverb'
  | 'tireNoise'
  | 'windNoise';

export interface EffectSetting {
  isEnabled: boolean;
  amount: number;
}

export type EffectSettings = Record<EffectKey, EffectSetting>;

export interface EffectDefinition {
  key: EffectKey;
  label: string;
  description: string;
  maxAmount: number;
  defaultAmount: number;
}

/** Liste des effets, dans l'ordre d'affichage du panneau « Mixage / réalisme ». */
export const EFFECT_DEFINITIONS: EffectDefinition[] = [
  { key: 'breath', label: 'Souffle', description: 'Bruit de combustion et d’admission', maxAmount: 2, defaultAmount: 1 },
  { key: 'irregularity', label: 'Irrégularités', description: 'Variations de vitesse et de force d’un cycle à l’autre', maxAmount: 2, defaultAmount: 1 },
  { key: 'softPulse', label: 'Explosion douce', description: '0 = clic sec, 1 = impulsion douce (piston + combustion)', maxAmount: 1, defaultAmount: 1 },
  { key: 'pipeExhaust', label: 'Échappement à tuyaux', description: '0 = résonances simples, 1 = collecteur + tuyau + silencieux', maxAmount: 1, defaultAmount: 1 },
  { key: 'groundReflection', label: 'Réflexion du sol', description: 'Rebond sur le sol (effet de phasing au passage)', maxAmount: 1, defaultAmount: 1 },
  { key: 'reverb', label: 'Réverbération', description: 'Espace extérieur : plus présent quand le véhicule est loin', maxAmount: 2, defaultAmount: 1 },
  { key: 'tireNoise', label: 'Pneus', description: 'Bruit de roulement selon la vitesse', maxAmount: 2, defaultAmount: 1 },
  { key: 'windNoise', label: 'Vent', description: 'Bruit aérodynamique à grande vitesse', maxAmount: 2, defaultAmount: 1 },
];

/**
 * Crée les réglages par défaut (tous les effets actifs à leur dose par défaut).
 * @returns réglages d'effets
 */
export function createDefaultEffectSettings(): EffectSettings {
  const effectSettings = {} as EffectSettings;
  for (const definition of EFFECT_DEFINITIONS) {
    effectSettings[definition.key] = { isEnabled: true, amount: definition.defaultAmount };
  }
  return effectSettings;
}

/**
 * Dose effective d'un effet (0 s'il est désactivé).
 * @param effectSettings réglages d'effets
 * @param effectKey effet voulu
 * @returns dose effective
 */
export function getEffectAmount(effectSettings: EffectSettings, effectKey: EffectKey): number {
  const effectSetting = effectSettings[effectKey];
  return effectSetting && effectSetting.isEnabled ? Math.max(0, effectSetting.amount) : 0;
}

/**
 * Complète des réglages lus dans un fichier (effets absents = valeur par défaut).
 * @param rawSettings réglages lus (peuvent être incomplets ou absents)
 * @returns réglages complets
 */
export function completeEffectSettings(rawSettings: Partial<EffectSettings> | undefined): EffectSettings {
  const effectSettings = createDefaultEffectSettings();
  for (const definition of EFFECT_DEFINITIONS) {
    const rawSetting = rawSettings?.[definition.key];
    if (rawSetting && typeof rawSetting.amount === 'number') {
      effectSettings[definition.key] = { isEnabled: rawSetting.isEnabled !== false, amount: rawSetting.amount };
    }
  }
  return effectSettings;
}
