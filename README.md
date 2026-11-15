# VroumVroum_sim

Webapp de sound design de bruit moteur (moto, voiture, camion) : on dessine le régime et la distance au micro dans le temps, on écoute, puis on exporte un WAV 48 kHz pour le montage vidéo.

**Adresse de test : https://nikowha.github.io/vroumvroum-sim/**
(sur Safari, faire un rechargement forcé si l'ancienne version reste affichée)

## Utilisation
- **Profil** : moto (bicylindre en V), voiture (4 cylindres), camion (6 cylindres diesel). On peut changer le nombre de cylindres et l'ordre d'allumage (ex. `1-3-4-2`).
- **Timeline** :
  - piste *Régime* (tr/min) : 0 = moteur coupé ; quand le régime monte, le moteur est « en charge », quand il descend, c'est le frein moteur ;
  - piste *Distance au micro* (m) : donne l'effet Doppler, la baisse de volume et la perte d'aigus avec la distance.
- Clic / tap dans une piste : ajouter un point, puis glisser. Double-clic (souris) ou appui long (doigt / Pencil) sur un point : le supprimer.
- Règle du haut : déplacer la tête de lecture. Barre d'espace : lecture / pause.
- **Exporter WAV** : 48 kHz, 24 bits ou 32 bits float, mono, normalisation à -1 dBFS en option. L'export est identique à ce qu'on entend.
- **Enregistrer / Ouvrir** : projet en `.json`.

## Installer comme une app sur Windows 11
Dans Edge ou Chrome, ouvrir l'adresse de test puis menu → « Applications » → « Installer VroumVroum_sim ».

## Appareils testés
- PC Windows 11, navigateur Chromium : OK (2026-11-15).
- iPad / iPhone : pas encore testé.
