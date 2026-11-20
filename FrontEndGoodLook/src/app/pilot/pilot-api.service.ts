import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';

export interface PilotUser { id: string; email: string; displayName: string; }
export interface PilotBusiness { id: string; name: string; timezone: string; }
export interface PilotService { id: string; businessId: string; name: string; durationMinutes: number; priceCents: number; currency: string; }
export interface PilotProfessional { id: string; businessId: string; displayName: string; }
export interface NewPilotAppointment { businessId: string; professionalId: string; serviceId: string; startAt: string; notes?: string | null; }
export interface PilotAppointment extends NewPilotAppointment { id: string; endAt: string; status: string; priceCents: number; currency: string; }
export interface PilotAvailability { timezone: string; slots: {startAt: string; endAt: string}[]; }
export interface AvailabilityQuery { businessId: string; professionalId: string; serviceId: string; from: string; to: string; }

/** API same-origin; la sesión vive en una cookie HttpOnly gestionada por el servidor. */
@Injectable({providedIn: 'root'})
export class PilotApiService {
  constructor(private readonly http: HttpClient) {}
  register(displayName: string, email: string, password: string) {
    return this.http.post<PilotUser>('/api/auth/register', {displayName, email, password}, {withCredentials:true});
  }
  login(email: string, password: string) {
    return this.http.post<PilotUser>('/api/auth/login', {email, password}, {withCredentials:true});
  }
  me() { return this.http.get<PilotUser>('/api/auth/me', {withCredentials:true}); }
  logout() { return this.http.post<void>('/api/auth/logout', {}, {withCredentials:true}); }
  businesses() { return this.http.get<PilotBusiness[]>('/api/businesses'); }
  services(businessId: string) { return this.http.get<PilotService[]>('/api/services', {params: new HttpParams().set('businessId', businessId)}); }
  professionals(businessId: string) {
    return this.http.get<PilotProfessional[]>('/api/professionals', {params: new HttpParams().set('businessId', businessId)});
  }
  availability(input: AvailabilityQuery) {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(input)) params = params.set(key, value);
    return this.http.get<PilotAvailability>('/api/appointments/availability', {params});
  }
  createAppointment(input: NewPilotAppointment) {
    const {businessId, professionalId, serviceId, startAt, notes} = input;
    return this.http.post<PilotAppointment>('/api/appointments', {businessId, professionalId, serviceId, startAt, notes}, {withCredentials:true});
  }
  appointments(from: string, to: string) {
    const params = new HttpParams().set('from', from).set('to', to);
    return this.http.get<PilotAppointment[]>('/api/appointments/me', {params, withCredentials:true});
  }
}
