# VroumVroum_sim

Webapp de sound design de bruit moteur (moto, voiture, camion) : on dessine le régime et la distance au micro dans le temps, on écoute, puis on exporte un WAV 48 kHz pour le montage vidéo.

**Adresse de test : https://nikowha.github.io/vroumvroum-sim/**
(sur Safari, faire un rechargement forcé si l'ancienne version reste affichée)

## Utilisation
- **Test d'écoute** (bouton en haut du panneau) : chaque clic passe d'un test à l'autre et lance la lecture. *Passage* = le véhicule arrive, passe devant le micro et repart (Doppler, distance, pneus, vent) ; *Moteur proche* = moteur à l'arrêt à 5 m du micro, ralenti, coups d'accélérateur puis montée au régime max, sans effet de distance. Garde le profil et le mixage, remplace les courbes.
- **Profil** (12) : motos (monocylindre, bicylindre en V, 3 et 4 cylindres), voitures (3 et 4 cylindres, boxer, V6, V8), camions et engins (6 cylindres, V8 diesel, tracteur). On peut changer le nombre de cylindres, l'ordre d'allumage (ex. `1-3-4-2`) et la quantité de **souffle** (bruit de combustion et d'admission, 0 à 2). Changer de profil remet la courbe de régime à l'échelle du nouveau moteur.
- **Mixage / réalisme** : chaque effet a une case pour l'activer ou le couper et un curseur de dose (double-clic sur le nom = dose par défaut) :
  souffle, irrégularités (moteur moins « parfait »), explosion douce, échappement à tuyaux (0 = ancien modèle simple), réflexion du sol, réverbération extérieure, pneus, vent.
- **Timeline** :
  - piste *Régime* (tr/min) : 0 = moteur coupé ; quand le régime monte, le moteur est « en charge », quand il descend, c'est le frein moteur ;
  - piste *Distance au micro* (m) : donne l'effet Doppler, la baisse de volume, la perte d'aigus et le rebond sur le sol ;
  - piste *Vitesse* (km/h) : bruit des pneus et du vent.
- Clic / tap dans une piste : ajouter un point, puis glisser. Double-clic (souris) ou appui long (doigt / Pencil) sur un point : le supprimer.
- Règle du haut : déplacer la tête de lecture. Barre d'espace : lecture / pause.
- **Exporter WAV** : 48 kHz, 24 bits ou 32 bits float, mono, normalisation à -1 dBFS en option. L'export est identique à ce qu'on entend.
- **Enregistrer / Ouvrir** : projet en `.json`.

## Installer comme une app sur Windows 11
Dans Edge ou Chrome, ouvrir l'adresse de test puis menu → « Applications » → « Installer VroumVroum_sim ».

## Appareils testés
- PC Windows 11, navigateur Chromium : OK (2026-11-15).
- iPad / iPhone : pas encore testé.
