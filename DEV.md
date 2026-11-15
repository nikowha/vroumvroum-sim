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
- `npm run check-levels` : niveau de chaque profil à régime constant (5 m), crête avant saturation et gain de sortie conseillé (cible 0,7 au pire cas).
- `npm run check-noise` : part du souffle (combustion + admission) par rapport au moteur, au ralenti et au régime max, et niveau moteur coupé (doit être -inf).
- `npm run make-icons` : régénère les icônes PNG.
- Navigateur intégré : serveurs `vroumvroum-dev` (5195) et `vroumvroum-preview` (5196) dans `D:\CLAUDE\APP_NICO\.claude\launch.json`.

## Architecture
```
src/
├── main.ts                 démarrage, assemblage, transport, export, fichiers
├── config.ts               constantes (48 kHz, blocs de 128, vitesse du son…)
├── model/                  données pures (JSON) : projet, courbes d'automation
├── dsp/                    DSP pur, sans Web Audio (→ futur Rust/WASM)
│   ├── exhaustPipes.ts     guides d'onde : collecteur, tuyau droit, silencieux
│   ├── outdoorReverb.ts    réverbération extérieure (FDN 4 lignes)
│   ├── vehicleNoise.ts     pneus et vent selon la vitesse
│   ├── dspPrimitives.ts    bruit déterministe, passe-bande, passe-bas, peigne amorti, anti-DC
│   ├── vehicleProfiles.ts  profils moto / voiture / camion
│   ├── engineSynth.ts      cycle 720°, impulsions par cylindre, échappement, admission, vibrations
│   ├── dopplerLine.ts      retard variable + 1/distance + absorption de l'air + réflexion du sol
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
- **Gain de sortie calibré par profil** (2026-11-15) : la saturation finale (tanh) n'est plus qu'un limiteur de sécurité ; chaque profil a un `outputGain` réglé avec `npm run check-levels` pour une crête ≤ 0,7 en pleine charge (sur-régime compris). Filtre de « brillance » sur les impulsions (moins de grésillement), limiteur de régime à 125 % du max du profil.
- **Changer de profil remet la courbe de régime à l'échelle** (rapport des régimes max) : sinon une courbe de voiture jouée par un camion part à 6 500 tr/min.
- **Souffle lié au moteur** (2026-11-15) : l'admission suit le débit d'air (impulsions lissées) au lieu d'avoir un plancher constant → silence moteur coupé ; le bruit de combustion suit le carré de l'enveloppe (concentré sur l'attaque) → plus de souffle continu à haut régime. Réglage « Souffle » 0–2 dans le panneau (`engine.noiseAmount`). Cible : souffle ≤ -14 dB sous le moteur au régime max.
- **Export mono** pour l'instant (Doppler = source ponctuelle) ; stéréo / panoramique plus tard si besoin.
- Imports avec extension `.ts` (`allowImportingTsExtensions`) : le même code tourne dans Vite et directement dans Node 24 (script de vérification).
- PWA : service worker « réseau d'abord » → toujours la dernière version en ligne, cache seulement hors ligne.
- Version Windows : PWA installable dès maintenant (Edge/Chrome → Installer) ; Tauri 2 plus tard.
- Orientation : paysage d'abord (panneau à gauche) ; en portrait étroit, le panneau passe au-dessus.

## Réalisme (2026-11-15, accordé et fait : les 5 étapes)
Diagnostic dans RESEARCH.md (« Pourquoi le son fait synthétique »). Étapes, chacune écoutable seule :
1. **Irrégularités** : fluctuation lente du vilebrequin + variation de force d'une explosion à l'autre (réglage « Irrégularité »). Petit changement, gros effet attendu.
2. **Forme d'impulsion** : impulsion douce (piston + combustion, comme enginesound) au lieu du clic exponentiel.
3. **Échappement en guides d'onde** : collecteur commun + tuyau + silencieux à plusieurs éléments (modèle Baldan / enginesound) à la place du peigne + 3 formants. Gros chantier, recalibrer les 12 profils.
4. **Environnement** : réflexion du sol (retard selon distance et hauteur du micro → effet de « phasing » au passage) + petite réverbération extérieure.
5. **Bruits du véhicule** : roulement des pneus et vent selon la vitesse.

Fait : chaque effet a une case (activer / couper) et un curseur de dose dans le panneau « Mixage / réalisme » (`project.effects`, `src/model/effects.ts`) :
souffle, irrégularités, explosion douce, échappement à tuyaux (fondu avec l'ancien modèle simple), réflexion du sol, réverbération, pneus, vent.
Nouvelle courbe **Vitesse (km/h)** pour pneus et vent (la distance reste indépendante : elle règle le Doppler).
Calibrage (`npm run check-levels`) : crête ≤ 0,7 par profil tous effets actifs ; tuyaux ≈ simple à ±2 dB (`pipeExhaustGain` par profil) ;
pneus ≈ -4 dB sous une voiture à 3500 tr/min à 100 km/h (5 m) ; vent ≈ -10 dB à 130 km/h ; réverbération = son direct vers 40 m.
Ressemblance cycle à cycle : 1,000 → 0,97 (irrégularités à 100 %). Limiteur doux final (au-dessus de 0,8).
Rendu ≈ 55–75× plus rapide que le temps réel (contre 200× avant) : large marge pour l'AudioWorklet.

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

## Profils (12)
Motos : monocylindre, bicylindre en V, 3 cylindres, 4 cylindres sportive. Voitures : 3 cylindres, 4 cylindres, boxer (impulsions irrégulières), V6, V8 (bancs de volumes différents → glouglou). Camions et engins : camion 6 cylindres, camion V8, tracteur 3 cylindres. Ajouter un profil = une entrée dans `src/dsp/vehicleProfiles.ts` puis calibrer `outputGain` avec `npm run check-levels`.

## Bugs connus
- Aucun pour l'instant.

## Journal
- 2026-11-15 : deux tests d'écoute ajoutés (`src/model/testProjects.ts`, boutons en haut du panneau) : « Passage » (comme la démo) et « Moteur proche » (5 m constants, vitesse 0, régime ralenti → coups de gaz → max). Régimes en fraction ralenti → max, donc adaptés à chaque profil ; profil et mixage conservés ; lecture lancée au clic.
- 2026-11-15 : dossier, docs, recherche initiale, proposition V0 → accord (dépôt public sans code, paysage d'abord).
- 2026-11-15 : retour « les pneus font du bruit de pluie » → cause : bruit blanc avec bande aiguë (42 % de l'énergie au-dessus de 2 kHz) ; refait en grondement grave/médium + ton de bande de roulement qui suit la vitesse + rythme des roues + texture de route, coupé au-dessus de 1,8 kHz (3 % au-dessus de 2 kHz). Niveau recalé.
- 2026-11-15 : « son trop synthétique » → diagnostic (RESEARCH.md), puis les 5 étapes de réalisme faites, chacune avec case + curseur ; courbe Vitesse ajoutée ; niveaux recalibrés.
- 2026-11-15 : retour utilisateur « bruit de fond derrière le son » → cause : plancher constant du souffle d'admission (audible même moteur coupé, -47 dB) + bruit de combustion continu à haut régime ; corrigé, réglage « Souffle » ajouté, gains recalibrés.
- 2026-11-15 : retour utilisateur « camion sature vers 3000 tr/min » → cause : niveau avant limiteur à 1,2 et courbe de voiture non remise à l'échelle ; corrigé (gain par profil, brillance, limiteur de régime, remise à l'échelle). 9 profils ajoutés (12 au total).
- 2026-11-15 : V0 codée (DSP, AudioWorklet, export Worker, timeline RPM + distance, sauvegarde JSON, PWA), testée dans le navigateur intégré, publiée sur GitHub Pages.
