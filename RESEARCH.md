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
