# VroumVroum_sim — Recherches

## 2026-11-15 — Recherche initiale

### Références du brief (voir `BRIEF_engine-sound-webapp.md`)
- engine-sound-generator (antonio-r1) : JS + Web Audio, AudioWorklet, Doppler par DelayNode.
- enginesound (DasEtwas, Rust) : tubes / chambres acoustiques, mélange admission / échappement / vibrations. Bonne base pour le futur portage Rust → WASM.
- Baldan et al. 2015 (article de base des deux) : https://core.ac.uk/download/53578982.pdf
- engine-sim (AngeTheGreat, C++, MIT) : référence physique, trop lourd pour le temps réel web.
- Fivem-EngineSound-Simulator : inspiration d'architecture granulaire seulement (dépend de sons GTA, inutilisable).
- Rc_Engine_Sound_ESP32 : sons de camions (idée des couches et des événements : freins pneumatiques, etc.).

### Support navigateur
- `AudioWorklet.addModule` : Chrome/Edge 66+, Safari iOS 14.5+. `OfflineAudioContext` : Safari iOS 14.5+.
  Source : MDN / web-features explorer (https://web-platform-dx.github.io/web-features-explorer/features/offline-audio-context).
- Limites Safari connues : `OfflineAudioContext` refuse > 10 canaux et un sampleRate < 44100 Hz (48 kHz OK).
  Source : README standardized-audio-context (https://npmjs.com/package/standardized-audio-context).
- **Non confirmé** : AudioWorklet *dans* un OfflineAudioContext sur iOS récent. Bug iOS signalé en 2024 (distorsion AudioWorklet + getUserMedia) : https://bugs.webkit.org/show_bug.cgi?id=274507
  → **Décision** : ne pas dépendre de l'AudioWorklet pour l'export (voir DEV.md).

### Pièges Safari iOS (audio)
- L'`AudioContext` doit être créé / repris (`resume()`) dans un geste utilisateur (click / touchend).
- Le bouton silencieux de l'iPhone coupe Web Audio. Contournement : `navigator.audioSession.type = "playback"` (Safari 17+), sinon jouer un `<audio>` silencieux en boucle (libs unmute-ios-audio).
  Sources : https://github.com/feross/unmute-ios-audio , https://github.com/swevans/unmute
- Contexte suspendu quand la page passe en arrière-plan ; état `interrupted` (appel) → écouter `visibilitychange` et `statechange`, puis `resume()`.
  Source : https://bugs.webkit.org/show_bug.cgi?id=263627
- Toujours tester sur un vrai appareil (le simulateur ne reproduit pas tout).

### Version Windows 11 (plus tard)
- **Tauri 2** : utilise WebView2 (Chromium) sur Windows → même Web Audio / AudioWorklet que Chrome/Edge. Installeur ~3–12 Mo contre ~100–200 Mo pour Electron. Rust déjà installé.
- **Electron** : embarque Chromium, plus lourd, aucun avantage audio sur Windows.
- **PWA** (installable depuis Edge/Chrome) : étape zéro effort, possible dès la V0.
  Sources : https://blog.scottlogic.com/2023/02/01/webview2-electron-challengers-and-slightly-lighter-desktop-web-applications.html , https://www.noqta.tn/en/blog/tauri-2-desktop-apps-rust-web-technologies-2026
- Pour un plugin VST3/AUv3 plus tard : il faudra un DSP indépendant du navigateur (Rust ou C++) → raison de plus pour isoler le DSP dès la V0.

## 2026-11-15 — Pourquoi le son fait « synthétique » (diagnostic)

### Comparaison avec enginesound (DasEtwas, `src/gen.rs`, MIT)
Lu dans le code source (https://github.com/DasEtwas/enginesound/blob/master/src/gen.rs) :
- **Chaque cylindre a ses propres guides d'onde** (admission, échappement, extracteur) : des lignes à retard avec réflexions aux extrémités. Les soupapes **modulent les coefficients de réflexion** au cours du cycle (`exhaust_valve`, `intake_valve` = portions de sinus).
- **Collecteur d'échappement commun** : la sortie de chaque cylindre est réinjectée dans les autres (`exhaust_collector`) → les cylindres interagissent, le timbre change avec le régime.
- **Silencieux** = un tuyau droit + plusieurs éléments de longueurs différentes en parallèle → beaucoup de résonances, denses et pas toutes harmoniques.
- **Fluctuation du vilebrequin** : bruit filtré passe-bas ajouté à la position du vilebrequin (`crankshaft_fluctuation`) → chaque cycle est un peu différent.
- **Forme d'impulsion douce** : mouvement du piston (cosinus) + allumage (portion de sinus de durée `ignition_time`), pas un front raide.

### Notre moteur V0 (mesuré)
- Ressemblance entre deux cycles consécutifs : **1,000** (voiture, V8, camion), 0,999 (moto) → cycles strictement identiques, son de « machine parfaite ».
- Impulsion = saut instantané + décroissance exponentielle → clic large bande, timbre « buzzer ».
- Un seul tuyau (peigne) + 3 résonances fixes en parallèle → timbre de synthé à formants, les mêmes pics quel que soit le régime.
- Cylindres indépendants (pas de collecteur commun), aucune variation d'un cycle à l'autre.
- Son « sec » : pas de réflexion du sol, pas de pièce / extérieur, mono.
- Pour un véhicule qui passe : il manque le **bruit de roulement** des pneus et le vent (souvent plus fort que le moteur à vitesse stabilisée), la transmission, etc.

### Causes probables, de la plus importante à la moins importante (à valider à l'oreille)
1. Cycles parfaitement identiques (aucune variation de vitesse de rotation, de force de combustion).
2. Forme d'impulsion trop raide et toujours la même.
3. Échappement trop simple (un tuyau + 3 formants fixes) au lieu de guides d'onde couplés + silencieux.
4. Son sans environnement (pas de réflexion du sol ni d'espace).
5. Sources absentes pour un véhicule en mouvement : roulement, vent, transmission.
