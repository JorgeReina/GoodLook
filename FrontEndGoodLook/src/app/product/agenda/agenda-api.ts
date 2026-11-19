import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';

export interface WorkingHour { weekday: number; startTime: string; endTime: string; }
export interface Closure { id: string; startAt: string; endAt: string; }
export interface AgendaItem {
  id: string; serviceName: string; customerName: string; startAt: string; endAt: string;
  status: string; notes: string | null;
}
export interface Agenda {
  timezone: string; from: string; to: string; hours: WorkingHour[]; closures: Closure[]; appointments: AgendaItem[];
}

@Injectable({ providedIn: 'root' })
export class AgendaApi {
  private readonly http = inject(HttpClient);

  week(businessId: string, professionalId: string, weekStart: string) {
    return this.http.get<Agenda>('/api/agenda', { params: { businessId, professionalId, weekStart } });
  }
}
