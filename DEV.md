# VroumVroum_sim — Développement

## État (2026-11-15)
**V0 première livraison en ligne** : https://nikowha.github.io/vroumvroum-sim/
Testé sur PC (navigateur intégré Chromium) : lecture / pause / reprise, ajout et glisser de points, export WAV, service worker actif, aucune erreur console.
**Pas encore testé** : écoute réelle du son, iPad / iPhone (Safari), installation PWA sur Windows 11.

## Dépôt et publication
- Dépôt public : https://github.com/nikowha/vroumvroum-sim (branche `main`)
- Publication : automatique à chaque `git push` sur `main` (GitHub Actions → Pages, `.github/workflows/deploy.yml`).
- Identité git du dépôt : `nikowha` / adresse noreply GitHub (pas de vrai nom ni email).

## Commandes
- `npm install` puis `npm run dev` (serveur de dev) ; `npm run build` (vérif TypeScript + build dans `dist/`) ; `npm run preview`.
- `npm run check-render` : rend la démo pour chaque profil dans Node, affiche crête / RMS / vitesse et écrit `renders/*.wav` (ignoré par git) pour écoute.
- `npm run make-icons` : régénère les icônes PNG.
- Navigateur intégré : serveurs `vroumvroum-dev` (5195) et `vroumvroum-preview` (5196) dans `D:\CLAUDE\APP_NICO\.claude\launch.json`.

## Architecture
```
src/
├── main.ts                 démarrage, assemblage, transport, export, fichiers
├── config.ts               constantes (48 kHz, blocs de 128, vitesse du son…)
├── model/                  données pures (JSON) : projet, courbes d'automation
├── dsp/                    DSP pur, sans Web Audio (→ futur Rust/WASM)
│   ├── dspPrimitives.ts    bruit déterministe, passe-bande, passe-bas, peigne amorti, anti-DC
│   ├── vehicleProfiles.ts  profils moto / voiture / camion
│   ├── engineSynth.ts      cycle 720°, impulsions par cylindre, échappement, admission, vibrations
│   ├── dopplerLine.ts      retard variable + 1/distance + absorption de l'air
│   └── projectRenderer.ts  courbes → moteur → Doppler, bloc par bloc
├── audio/
│   ├── engineWorkletProcessor.ts  AudioWorklet (aperçu)
│   ├── realtimePlayer.ts          AudioContext, précautions iOS
│   ├── exportWorker.ts / wavExporter.ts / offlineRender.ts  export hors ligne
│   └── wavEncoder.ts              WAV 24 bits / float 32
└── ui/                     timeline canvas, panneau de réglages, fichiers
```

## Décisions
- **Un seul DSP pour l'aperçu et l'export** (2026-11-15) : l'AudioWorklet et le Worker appellent le même `ProjectRenderer`, avec des blocs de 128 et un bruit à graine fixe → l'export est identique à ce qu'on entend. Évite de dépendre d'AudioWorklet dans OfflineAudioContext (non garanti sur iOS, voir RESEARCH.md).
- **Doppler dans le DSP** plutôt qu'avec DelayNode : même résultat en aperçu et à l'export. Pré-rendu (`primeAt`) pour remplir la ligne à retard avant le début.
- **Charge moteur déduite de la pente du régime** en attendant une courbe d'accélérateur : accélération = pleine charge, décélération = frein moteur.
- **Export mono** pour l'instant (Doppler = source ponctuelle) ; stéréo / panoramique plus tard si besoin.
- Imports avec extension `.ts` (`allowImportingTsExtensions`) : le même code tourne dans Vite et directement dans Node 24 (script de vérification).
- PWA : service worker « réseau d'abord » → toujours la dernière version en ligne, cache seulement hors ligne.
- Version Windows : PWA installable dès maintenant (Edge/Chrome → Installer) ; Tauri 2 plus tard.
- Orientation : paysage d'abord (panneau à gauche) ; en portrait étroit, le panneau passe au-dessus.

## À faire (suite V0, ordre proposé)
1. Écoute et réglage du son par profil (à l'oreille, avec l'utilisateur).
2. Test iPad / iPhone (Safari) : déblocage audio, bouton silencieux, export / téléchargement.
3. Vidéo de référence synchronisée (`<video>`, image par image).
4. Courbes accélérateur, charge, rapport de boîte ; zoom / défilement de la timeline.
5. Événements ponctuels : démarrage, arrêt, passage de rapport, rupteur, pétarades.
6. Export en pistes séparées (moteur, échappement, admission).
7. Convolution échappement / admission (réponses impulsionnelles).
8. Annuler / rétablir.
9. Plus tard : DSP en Rust → WASM, app Tauri.

## Bugs connus
- Aucun pour l'instant.

## Journal
- 2026-11-15 : dossier, docs, recherche initiale, proposition V0 → accord (dépôt public sans code, paysage d'abord).
- 2026-11-15 : V0 codée (DSP, AudioWorklet, export Worker, timeline RPM + distance, sauvegarde JSON, PWA), testée dans le navigateur intégré, publiée sur GitHub Pages.
