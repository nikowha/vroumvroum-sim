# VroumVroum_sim — Développement

## État (2026-11-15)
Recherche initiale faite (`RESEARCH.md`). **Aucun code** : en attente du feu vert sur la proposition ci-dessous.

## Proposition V0 (en attente d'accord)

### Architecture
- **Vite + TypeScript**, modules ES, aucune dépendance audio externe.
- **DSP pur** dans `src/dsp/` (aucune API Web Audio dedans) : une fonction `renderBlock(state, params, output)` qui calcule les échantillons.
  - Utilisé **en temps réel** par un AudioWorklet (aperçu).
  - Utilisé **hors ligne** par un Web Worker (export) qui appelle directement le même DSP → aperçu et export identiques, pas de dépendance à `OfflineAudioContext` + AudioWorklet (non garanti sur iOS).
  - Plus tard : ce module sera remplacé tel quel par Rust → WASM (même interface), puis réutilisable pour Tauri / plugin.
- **Doppler + atténuation 1/distance calculés dans le DSP** (ligne à retard à lecture interpolée), pas avec DelayNode → identique en temps réel et à l'export.
- **Export WAV** écrit à la main (48 kHz, 24 bits PCM ou 32 bits float).

### Fonctions de la première livraison
1. Synthèse moteur simple : impulsion par cylindre (selon ordre d'allumage) + bruit + quelques résonances (filtres), réglages : nb cylindres, profil moto / voiture / camion.
2. Timeline minimale : courbe **RPM** et courbe **distance** (points-clés, interpolation linéaire / lissée), édition souris + doigt + Pencil (Pointer Events).
3. Lecture / pause / curseur de lecture.
4. Bouton **Exporter WAV** (rendu hors ligne 48 kHz).
5. Publication GitHub Pages.

Ensuite (V0 suite) : vidéo de référence synchronisée, courbes accélérateur / charge / rapport, événements (démarrage, rapport, rupteur, pétarades), pistes séparées, sauvegarde JSON, convolution échappement / admission.

### Version Windows 11
- Dès la V0 : **PWA installable** (Edge/Chrome → « Installer l'application »).
- Plus tard : **Tauri 2** (WebView2, Rust déjà installé, léger) plutôt qu'Electron.

### Orientation
- PC : fenêtre large. iPad : **paysage** prioritaire (timeline large), portrait toléré.

### Risques
- Safari iOS : déblocage audio au geste, bouton silencieux (`navigator.audioSession`), arrière-plan.
- Qualité du son « suffisamment réaliste » avec un modèle simple : à itérer à l'oreille.

## Questions ouvertes
- Nom du dépôt GitHub, public / privé, code d'accès ?
- Orientation iPad confirmée ?

## Journal
- 2026-11-15 : dossier, docs, recherche initiale, proposition V0.
