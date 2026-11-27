import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Closure, WorkingHour } from '../agenda/agenda-api';

export interface Business {
  id: string; name: string; sector: string | null; address: string | null; timezone: string; isPublic: boolean;
}

export interface Service {
  id: string; name: string; description: string | null; durationMinutes: number; priceCents: number; currency: string; active: boolean;
}

export interface Staff {
  id: string; displayName: string; active: boolean; linked: boolean; serviceIds: string[];
}

export interface BusinessDetail { business: Business; services: Service[]; staff: Staff[]; }
export interface Mutation { method: 'POST' | 'PATCH' | 'PUT' | 'DELETE'; path: string; body?: object; }

@Injectable({ providedIn: 'root' })
export class ManagementApi {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/manage/businesses';

  detail(id: string) { return this.http.get<BusinessDetail>(this.base + '/' + id); }
  hours(id: string, staff: string) { return this.http.get<{ hours: WorkingHour[] }>(this.base + '/' + id + '/staff/' + staff + '/hours'); }
  closures(id: string, staff: string) { return this.http.get<{ closures: Closure[] }>(this.base + '/' + id + '/staff/' + staff + '/closures'); }
  mutate<T>(action: Mutation, impact?: string) {
    const headers = impact ? { 'X-GoodLook-Impact': impact } : undefined;
    return this.http.request<T>(action.method, this.base + action.path, { body: action.body, headers });
  }
  invite(businessId: string, professionalId: string) {
    return this.http.post<{ token: string; expiresInSeconds: number }>('/api/invitations', { businessId, professionalId });
  }
  accept(token: string) { return this.http.post<void>('/api/invitations/accept', { token }); }
}
