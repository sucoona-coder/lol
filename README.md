# 👁️ IMPOSTEUR — Qui se cache parmi vous ?

Jeu multijoueur temps réel, déployable sur **Vercel** + **Pusher** (tous deux gratuits).

---

## 🚀 Mise en ligne en 5 étapes

### 1. Créer un compte Pusher (gratuit)

1. Va sur [pusher.com](https://pusher.com) → **Sign up**
2. Crée une app : **Channels** → **Create app**
   - Name : `impostor-game` (peu importe)
   - Cluster : choisis **eu** (Europe) ou celui le plus proche de toi
   - Frontend : Vanilla JS
   - Backend : Node.js
3. Dans l'app créée, va dans **App Keys** et note :
   - `app_id`
   - `key`
   - `secret`
   - `cluster`

---

### 2. Mettre le projet sur GitHub

```bash
# Dans le dossier du projet
git init
git add .
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/TON_USERNAME/impostor-game.git
git push -u origin main
```

---

### 3. Déployer sur Vercel

1. Va sur [vercel.com](https://vercel.com) → **Sign up with GitHub**
2. Clique **Add New Project** → importe ton repo `impostor-game`
3. Vercel détecte automatiquement le projet — **ne change rien**, clique **Deploy**
4. Le déploiement échoue au premier essai (variables manquantes) → c'est normal, on les ajoute à l'étape suivante

---

### 4. Ajouter les variables d'environnement Vercel

Dans ton projet Vercel : **Settings → Environment Variables**

Ajoute ces 4 variables (valeurs récupérées depuis Pusher App Keys) :

| Nom | Valeur |
|-----|--------|
| `PUSHER_APP_ID` | ton app_id Pusher |
| `PUSHER_KEY` | ta key Pusher |
| `PUSHER_SECRET` | ton secret Pusher |
| `PUSHER_CLUSTER` | ex: `eu` |

Puis : **Deployments → ton dernier déploiement → Redeploy**

---

### 5. Jouer !

Ton app est en ligne sur `https://impostor-game-xxx.vercel.app` 🎉

- Ouvre l'URL sur plusieurs appareils ou onglets
- Un joueur crée une room → partage le code à 6 lettres
- L'hôte configure les rôles et lance la partie

---

## 💻 Dev local

```bash
npm install -g vercel   # une seule fois
npm install

# Crée .env.local avec tes clés Pusher
cp .env.example .env.local
# Remplis les valeurs dans .env.local

vercel dev              # lance sur http://localhost:3000
```

---

## 📁 Structure

```
impostor-vercel/
├── api/
│   ├── config.js         # Expose Pusher key/cluster au frontend
│   ├── create-room.js    # Créer une room
│   ├── join-room.js      # Rejoindre une room
│   ├── update-config.js  # Modifier la config (hôte)
│   ├── start-game.js     # Lancer la partie + distribuer les rôles
│   ├── phase.js          # Changer de phase (discussion/vote)
│   ├── chat.js           # Envoyer un message
│   ├── vote.js           # Voter + résolution automatique
│   └── leave.js          # Quitter la room
├── lib/
│   ├── store.js          # Stockage en mémoire (rooms)
│   └── pusher.js         # Client Pusher serveur
├── public/
│   ├── index.html        # Interface unique (SPA)
│   ├── css/style.css     # Design sombre Among Us / Discord
│   └── js/
│       ├── app.js        # Logique frontend
│       └── sounds.js     # Sons Web Audio API
├── vercel.json           # Config routing Vercel
├── package.json
├── .env.example
└── .gitignore
```

---

## 🎮 Fonctionnalités

- Room avec code unique à 6 caractères
- Pseudos + 32 avatars emoji au choix
- Lobby temps réel avec liste des joueurs
- Config hôte : nombre d'imposteurs (1 à N/2), timer, noms de rôles personnalisés
- Distribution anti-doublon (Fisher-Yates)
- Overlay "Ton rôle" privé — les autres ne voient pas ton rôle
- Chat temps réel pendant la discussion
- Phase de vote avec timer 30s
- Résolution automatique : élimination ou égalité
- Révélation du rôle de l'éliminé
- Détection de victoire (équipiers / imposteurs)
- Écran fin de partie avec révélation de tous les rôles
- Rejouer depuis l'écran de résultat (hôte)
- Sons synthétiques via Web Audio API
- Design responsive mobile/desktop

---

## ⚠️ Limitation importante

Vercel est **serverless** : chaque requête API peut tourner sur une instance différente.  
Le stockage en mémoire (`lib/store.js`) fonctionne parfaitement en **dev local** et pour des démonstrations, mais en production avec du trafic simultané, des rooms sur des instances différentes ne se verront pas.

**Pour une vraie production** : remplace `lib/store.js` par [Vercel KV](https://vercel.com/storage/kv) (Redis, gratuit jusqu'à 256MB).  
C'est un remplacement de `getRoom/setRoom` par `kv.get/kv.set` — environ 10 lignes à changer.
