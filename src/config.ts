// Constantes globales partagées par le DSP, l'aperçu temps réel et l'export.

/** Fréquence d'échantillonnage de l'aperçu et de l'export (Hz). */
export const SAMPLE_RATE = 48000;

/** Taille d'un bloc de rendu (identique à l'AudioWorklet pour que l'export soit identique à l'aperçu). */
export const RENDER_BLOCK_SIZE = 128;

/** Vitesse du son dans l'air (m/s), utilisée pour le retard Doppler. */
export const SPEED_OF_SOUND_METERS_PER_SECOND = 343;

/** Distance maximale prise en charge par la ligne à retard Doppler (m). */
export const MAX_DOPPLER_DISTANCE_METERS = 500;

/** Distance à laquelle le volume vaut 1 ; en dessous, le volume n'augmente plus (m). */
export const REFERENCE_DISTANCE_METERS = 5;

/** Intervalle entre deux envois de la position de lecture par l'AudioWorklet (s). */
export const PLAYHEAD_REPORT_INTERVAL_SECONDS = 1 / 30;

/** Graine du générateur de bruit : même graine = même son à l'aperçu et à l'export. */
export const NOISE_SEED = 0x2545f491;

/** Nom d'enregistrement du processeur AudioWorklet du moteur. */
export const ENGINE_PROCESSOR_NAME = 'engine-processor';
