# 🌊 3026 — Interface de jeu multijoueur

> Vinci Energies - 24H du code — 2026

---

## 🎯 Concept

**3026** est un jeu multijoueur en temps réel où chaque équipe pilote un bateau sur une carte océanique.  
L'objectif : explorer la carte, récolter des ressources, découvrir des îles et dominer le marché.

---

## ⚙️ Stack technique

| Couche | Technologie |
|---|---|
| Frontend | **Angular 21** (standalone, signals) |
| Communication | **REST API** (HTTP) + **AMQP** (broker temps réel) |
| Proxy | **Node.js** (contournement headers navigateur) |
| Carte 3D | **Three.js** |

---

## 🗺️ Fonctionnalités

- **Carte 2D / 3D** — fog of war, découverte progressive des cellules
- **Navigation** — D-pad (N / S / E / W / diagonales), recentrage automatique
- **Ressources** — BOISIUM · FERONIUM · CHARBONIUM · OR
- **Marketplace** — achat / vente d'offres entre équipes
- **Bot automatique** — déplacement et trading automatisés
- **Broker AMQP** — événements temps réel (positions, prix)
- **Historique des prix** — graphiques d'évolution des ressources

---

## 🏗️ Architecture

```
src/app/
├── services/          → API, état global (signals), bot, broker, tracker
├── components/
│   ├── game-map/      → Carte 2D interactive
│   ├── three/         → Vue 3D (Three.js)
│   ├── controls/      → Navigation + actions
│   ├── marketplace/   → Achat / vente
│   ├── log-panel/     → Journal temps réel
│   └── recap-panel/   → Tableau de bord équipe
└── app.ts             → Racine + orchestration
```

---

## 🚀 Lancer le projet

```bash
npm install
ng serve
```

Ouvrir [http://localhost:4200](http://localhost:4200)

---

## 👥 Équipe
Mathieu, Léo, Achraf, Esteban, Isaac

24h du code — 2026
