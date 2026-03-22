import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { MapState, MovementUpdate } from '../models/map.model';

@Injectable({ providedIn: 'root' })
export class MapService {
  private http = inject(HttpClient);
  private readonly baseUrl = 'https://foreign-shape-down-particularly.trycloudflare.com/api/map';

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
