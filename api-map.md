# Documentation API Map — Intégration Angular

## Base URL
```
http://localhost:8080
```

---

## Modèles TypeScript

Crée un fichier `src/app/models/map.model.ts` :

```typescript
export interface ShipLevel {
  id: number;
  name: string;
}

export interface Ship {
  level: ShipLevel;
  playerName: string;
  lastMoveAt?: string; // ISO 8601, ex: "2026-03-21T11:52:27.109343"
}

export interface Island {
  id: string;
  name: string;
  bonusQuotient: number;
}

export interface Cell {
  id: string;
  x: number;
  y: number;
  type: 'SEA' | 'SAND' | null; // null = cellule non découverte
  zone: number;
  ships: Ship[];
  island?: Island; // présent uniquement sur les cellules SAND
}

export interface MapState {
  cells: Cell[];
  boatPosition: Cell | null;
}

export interface MovementUpdate {
  discoveredCells: Cell[];
  position: Cell;
}
```

---

## Service Angular

Crée un fichier `src/app/services/map.service.ts` :

```typescript
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { MapState, MovementUpdate } from '../models/map.model';

@Injectable({
  providedIn: 'root'
})
export class MapService {
  private readonly baseUrl = 'http://localhost:8080/api/map';

  constructor(private http: HttpClient) {}

  /**
   * GET /api/map
   * Récupère l'état complet de la carte et la position du bateau.
   */
  getMap(): Observable<MapState> {
    return this.http.get<MapState>(this.baseUrl);
  }

  /**
   * POST /api/map/update
   * Envoie les cellules découvertes et la nouvelle position du bateau.
   */
  updateMap(update: MovementUpdate): Observable<MapState> {
    return this.http.post<MapState>(`${this.baseUrl}/update`, update);
  }
}
```

---

## Configuration HttpClient

Dans `app.config.ts` (Angular 17+ standalone) :

```typescript
import { provideHttpClient } from '@angular/common/http';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient()
  ]
};
```

Ou dans `app.module.ts` (modules classiques) :

```typescript
import { HttpClientModule } from '@angular/common/http';

@NgModule({
  imports: [HttpClientModule]
})
export class AppModule {}
```

---

## Exemples d'utilisation dans un composant

```typescript
import { Component, OnInit } from '@angular/core';
import { MapService } from '../services/map.service';
import { MapState, MovementUpdate } from '../models/map.model';

@Component({
  selector: 'app-map',
  templateUrl: './map.component.html'
})
export class MapComponent implements OnInit {
  mapState: MapState | null = null;

  constructor(private mapService: MapService) {}

  ngOnInit(): void {
    this.loadMap();
  }

  // Charge la carte au démarrage
  loadMap(): void {
    this.mapService.getMap().subscribe({
      next: (state) => {
        this.mapState = state;
        console.log(`Carte chargée : ${state.cells.length} cellules`);
        console.log('Position du bateau :', state.boatPosition);
      },
      error: (err) => console.error('Erreur lors du chargement de la carte', err)
    });
  }

  // À appeler lorsqu'un mouvement est reçu (ex: WebSocket, polling...)
  onMovementReceived(update: MovementUpdate): void {
    this.mapService.updateMap(update).subscribe({
      next: (updatedState) => {
        this.mapState = updatedState;
        console.log('Carte mise à jour. Nouvelle position :', updatedState.boatPosition);
      },
      error: (err) => console.error('Erreur lors de la mise à jour', err)
    });
  }
}
```

---

## Format du payload `POST /api/map/update`

```json
{
  "discoveredCells": [
    {
      "id": "7fd566c8-dbfa-4620-933d-3462e0e5519c",
      "x": 0,
      "y": -6,
      "type": "SEA",
      "zone": 1,
      "ships": []
    },
    {
      "id": "7402ff4b-a81e-4384-8144-04d54b278c44",
      "x": 0,
      "y": -4,
      "type": "SEA",
      "zone": 1,
      "ships": [
        {
          "level": { "id": 1, "name": "barque" },
          "playerName": "Joueur 1"
        }
      ]
    }
  ],
  "position": {
    "id": "0fa50f7b-3bdd-42c5-a173-2a63cfee164c",
    "x": 0,
    "y": -5,
    "type": "SEA",
    "zone": 1,
    "ships": []
  }
}
```

---

## Format de réponse `MapState`

```json
{
  "cells": [
    { "id": "...", "x": 3, "y": -6, "type": "SEA", "zone": 1, "ships": [] },
    { "id": "...", "x": 3, "y": -5, "type": "SAND", "zone": 1, "ships": [], "island": { "id": "...", "name": "Enies Lobby", "bonusQuotient": 0 } },
    { "id": "...", "x": -1, "y": -7, "type": "SAND", "zone": 1, "ships": [{ "level": { "id": 1, "name": "barque" }, "playerName": "LesEkodeurs" }], "island": { "id": "...", "name": "Dressrosa", "bonusQuotient": 0 } }
  ],
  "boatPosition": {
    "id": "0fa50f7b-3bdd-42c5-a173-2a63cfee164c",
    "x": 0,
    "y": -5,
    "type": "SEA",
    "zone": 1,
    "ships": []
  }
}
```

---

## Résumé des endpoints

| Méthode | URL | Description | Corps | Réponse |
|---------|-----|-------------|-------|---------|
| `GET` | `/api/map` | Récupère la carte complète + position bateau | — | `MapState` |
| `POST` | `/api/map/update` | Met à jour la carte avec un mouvement | `MovementUpdate` | `MapState` |

> **CORS** : si Angular tourne sur un port différent (ex: `4200`), ajoute `@CrossOrigin(origins = "http://localhost:4200")` sur le `MapController`, ou configure un proxy Angular dans `proxy.conf.json`.
