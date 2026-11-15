# Brief — Webapp de sound design de bruit moteur

## Objectif
Webapp pour **designer un son de moteur** (moto, voiture, camion) et l'**exporter en WAV** pour l'utiliser dans une **vidéo**.
Le but n'est pas le réalisme maximal, mais un son **suffisamment réaliste**.
Les paramètres doivent pouvoir être **animés** dans le temps pour coller à l'action de la vidéo.

## Cibles
- Webapp (prioritaire) : doit tourner sur **Windows 11** (Chrome/Edge) et **iOS/iPadOS** (Safari).
- Plus tard, éventuellement : version native ou plugin (JUCE, VST3/AUv3), en réutilisant le même moteur audio.

## Fonctions du prototype (V0)
1. **Vidéo de référence** : import d'une vidéo (`<video>`), lecture et déplacement synchronisés avec la timeline audio, avance image par image.
2. **Timeline avec courbes d'automation** (points-clés, interpolation) :
   - régime (RPM), accélérateur, charge, rapport de boîte
   - position/distance du véhicule → **effet Doppler** + atténuation de volume
3. **Événements ponctuels** : démarrage, arrêt, passage de rapport, rupteur, pétarades.
4. **Moteur procédural** réglable : nombre de cylindres, ordre d'allumage, profils moto / voiture / camion, couches admission / échappement / vibrations.
5. **Aperçu temps réel** (modèle simplifié, AudioWorklet).
6. **Rendu final hors ligne** (OfflineAudioContext ou Worker) → **export WAV 48 kHz**, 24 bits ou float ; option d'export en pistes séparées (moteur, échappement, admission).
7. Sauvegarde et chargement du projet (JSON).

## Décisions techniques
- V0 en **JavaScript/TypeScript + Web Audio API** (AudioWorklet), sans dépendance lourde.
- Ensuite : passer le moteur audio (DSP) en **Rust → WASM** (`wasm-pack` / `wasm-bindgen`). Rust est déjà installé sur le PC.
  - Alternative : C++ avec Emscripten si on veut réutiliser engine-sim ou passer à JUCE pour un plugin ou une app iOS.
- Comme le rendu est **hors ligne**, il peut être plus lent que le temps réel : un modèle plus lourd est acceptable pour l'export final.
- Effet Doppler : DelayNode avec un délai variable égal à distance / vitesse du son (343 m/s), ou PannerNode + délai ; ajouter une atténuation en 1/distance.
- Échappement et admission : ConvolverNode avec des réponses impulsionnelles (idée reprise d'engine-sim).
- Déploiement possible sur **GitHub Pages** (pour tester aussi sur iPad/iPhone).

## Références open source
- **engine-sound-generator (antonio-r1)**, JS + Web Audio, AudioWorklet, Doppler avec DelayNode :
  https://github.com/SpudzzDev/en (démos : http://antonio-r1.github.io/engine-sound-generator/)
- **enginesound (DasEtwas)**, Rust, simulation des tubes et chambres acoustiques, mélange admission/échappement/vibrations :
  https://github.com/DasEtwas/enginesound
- **Article de base pour les deux** : Baldan et al. (2015), *Physically informed car engine sound synthesis for virtual and augmented environments* :
  https://core.ac.uk/download/53578982.pdf
- **engine-sim (AngeTheGreat)**, C++, MIT, simulation physique complète (référence, trop lourd pour du temps réel web) :
  https://github.com/ange-yaghi/engine-sim — fork Linux/macOS : danieljsinclair/engine-sim
- **Fivem-EngineSound-Simulator**, MIT, architecture granulaire Web Audio (couches ralenti, en charge, hors charge, échappement), à prendre seulement comme inspiration ; nécessite des fichiers audio GTA V/FiveM, donc inutilisable tel quel :
  https://github.com/MushroomFleet/Fivem-EngineSound-Simulator
- **Rc_Engine_Sound_ESP32**, sons de camions (Scania, Kenworth, Detroit Diesel, freins pneumatiques) :
  https://github.com/TheDIYGuy999/Rc_Engine_Sound_ESP32

## Ce qui est volontairement laissé de côté
- La simulation physique complète en temps réel dans le navigateur.
- L'intégration comme plugin dans un DAW, FMOD, Wwise, Unity ou Unreal.
- Le calcul GPU pour l'acoustique.
- Le jeu en direct avec une faible latence (pédale, contrôleur MIDI).

## Première tâche dans la session de code
Créer le dépôt `engine-sound-webapp` avec :
- `index.html` + `src/` (TypeScript ou JS modules), avec Vite (ou sans outil de build)
- un AudioWorklet de synthèse moteur simple (impulsions par cylindre + bruit + résonances)
- une timeline minimale : une courbe RPM + une courbe distance (Doppler)
- un bouton « Exporter WAV » (rendu hors ligne, 48 kHz)
