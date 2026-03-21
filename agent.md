# 🧭 Agent Context — Jeu 3026

## 📋 Résumé du projet
Application Angular pour le concours 24h — jeu multijoueur **3026**.
Interface de contrôle et de visualisation communiquant avec les APIs REST du jeu.

## 🌐 API
- **Base URL** : `http://ec2-35-180-187-43.eu-west3.compute.amazonaws.com:8443`
- **Auth** : Token Bearer retourné par `/player/register`

### Endpoints connus (OAS Get-Started)
| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/signupcodes` | Obtenir un code d'inscription |
| POST | `/player/register` | Finaliser l'inscription (retourne le token) |

### Endpoints déduits du guide (OAS complet après palier 1)
| Méthode | Endpoint probable | Description |
|---------|-------------------|-------------|
| GET | `/map` ou `/cells` | Cellules visibles autour du bateau |
| GET | `/player` | Infos joueur |
| POST | `/ship/build` | Construire le bateau |
| POST | `/ship/move` | Déplacer (N/S/E/W) |
| POST | `/ship/upgrade` | Améliorer (1→5) |
| GET | `/ship` | État du bateau |
| GET | `/islands` | Îles découvertes |
| GET | `/resources` | BOISIUM/FERONIUM/CHARBONIUM/OR |
| GET | `/storage` | Capacité entrepôt |
| POST | `/storage/upgrade` | Améliorer entrepôt |
| GET | `/marketplace/offers` | Offres marketplace |
| POST | `/marketplace/offer` | Créer offre de vente |
| POST | `/marketplace/buy` | Acheter offre |
| GET | `/taxes` | Taxes en attente |
| POST | `/taxes/pay` | Payer taxe |

## 🗺️ Carte
- Grille 2D : `SEA` (océan) / `SAND` (plage/île)
- Déplacement sur SEA et SAND sans contrainte
- Visibilité limitée autour du bateau
- Fog of war hors visibilité
- Risques : tempêtes, pirates, kraken, récifs (20%/case)

## ⛵ Bateau
- Niveau 1 (radeau) → 5, upgradeable
- Points de mouvement (recharge sur île connue)
- Panne si 0 mouvement en mer → RESCUE

## 🪵 Ressources
- BOISIUM / FERONIUM / CHARBONIUM (1 seule produite, toutes les 5 min)
- OR = monnaie (îles, marketplace)
- Entrepôt limite le stockage (OR exclu)

## 🏝️ Îles
- Home + découvertes (voir SAND + retour sur île connue)
- Bonus productivité + bonus OR premiers découvreurs

## 🏪 MarketPlace
- Après découverte île Marché Central
- 1 offre active max, achat partiel possible

## 💸 Taxes : RESCUE / CHEAT

## 📝 Broker AMQP
- Endpoint : `b-a5095b9b-3c4d-4fe7-8df1-8031e8808618.mq.eu-west3.on.aws:5671`
- Username : `<nom_equipe>` (espaces → `_`)
- Password/Queue : `<id_equipe>`

## 🏗️ Architecture Angular
```
src/app/
├── services/
│   ├── api.service.ts          → Appels HTTP vers les APIs 3026
│   └── game-state.service.ts   → État réactif global (signals)
├── components/
│   ├── game-map/               → Carte 2D (grille SEA/SAND + bateau)
│   ├── controls/               → D-pad navigation (N/S/E/W) + actions
│   └── log-panel/              → Journal d'événements temps réel
├── app.ts / app.html / app.css → Racine + layout
```

## 🎯 Priorités
1. Inscription (`/signupcodes` + `/player/register`)
2. Carte + Navigation bateau (N/S/E/W)
3. Ressources + entrepôt
4. Bateau (état, upgrade, mouvement)
5. Îles (liste, validation expédition)
6. MarketPlace (offres, achat, vente)
7. Taxes (consultation, paiement)
8. Broker AMQP (événements temps réel)

