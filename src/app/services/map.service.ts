import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Cell, MapState, MovementUpdate } from '../models/map.model';

@Injectable({ providedIn: 'root' })
export class MapService {
  private http = inject(HttpClient);
  private readonly baseUrl = 'https://project24h.serveousercontent.com/api/map';

  /**
   * GET /map.json (fichier statique public)
   * Charge la carte de base au démarrage de l'application.
   * Ces données servent de fond permanent — la couche localStorage a la priorité.
   */
  loadStaticMap(): Observable<Cell[]> {
    return this.http.get<{ cells: Cell[] }>('/map.json').pipe(map((data) => data?.cells ?? []));
  }

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
