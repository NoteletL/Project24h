
import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { MapResponse } from './map.types';

@Injectable({ providedIn: 'root' })
export class MapService {
  constructor(private http: HttpClient) {}

  getMap() {
    // Ex: return this.http.get<MapResponse>('/api/map');
    return this.http.get<MapResponse>('assets/map.json');
  }

  async getMapOnce(): Promise<MapResponse> {
    return await firstValueFrom(this.getMap());
  }
}
