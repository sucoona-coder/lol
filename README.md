# 🎮 IMPOSTEUR — Qui se cache parmi vous ?

Jeu multijoueur temps réel style Among Us / Discord.

## Installation

```bash
npm install
npm start
```

Puis ouvrez `http://localhost:3000` dans plusieurs onglets ou appareils sur le même réseau.

## Structure

```
impostor-game/
├── server/
│   └── index.js          # Serveur Node.js + Socket.IO
├── public/
│   ├── css/style.css     # Design sombre
│   ├── js/app.js         # Logique cliente
│   └── js/sounds.js      # Sons Web Audio API
├── views/
│   └── index.html        # Interface principale
├── package.json
└── README.md
```

## Fonctionnalités

- Création/rejoindre une room avec code unique
- Pseudos + avatars emoji
- Lobby avec liste des joueurs en temps réel
- Configuration par l'hôte : nombre d'imposteurs, timer, noms de rôles
- Distribution aléatoire des rôles (anti-doublon)
- Overlay "Ton rôle" privé avec countdown
- Chat temps réel (discussion + vote)
- Système de vote avec timer
- Résolution automatique des votes (égalité ou élimination)
- Révélation du rôle du joueur éliminé
- Détection de victoire (équipiers/imposteurs)
- Écran de résultat avec révélation de tous les rôles
- Rejouer depuis l'écran de résultat
- Transfert d'hôte en cas de déconnexion
- Sons synthétiques via Web Audio API

## Technologies

- **Backend** : Node.js, Express, Socket.IO
- **Frontend** : HTML5, CSS3 (variables, animations, grid), JS vanilla
- **Fonts** : Orbitron + Rajdhani (Google Fonts)
