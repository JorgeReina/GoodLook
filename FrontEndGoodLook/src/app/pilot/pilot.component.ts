import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { lastValueFrom } from 'rxjs';
import { PilotApiService, type PilotAppointment, type PilotAvailability, type PilotBusiness, type PilotProfessional, type PilotService, type PilotUser } from './pilot-api.service';
const httpStatus = (error: unknown): number => typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number' ? error.status : 0;

@Component({selector:'app-pilot', standalone:true, imports:[CommonModule, FormsModule], templateUrl:'./pilot.component.html'})
export class PilotComponent implements OnInit {
  user: PilotUser | null = null;
  businesses: PilotBusiness[] = [];
  professionals: PilotProfessional[] = [];
  services: PilotService[] = [];
  appointments: PilotAppointment[] = [];
  name = ''; email = ''; password = '';
  businessId = ''; professionalId = ''; serviceId = '';
  selectedSlot = ''; notes = '';
  availability: PilotAvailability | null = null;
  loadingAvailability = false;
  private availabilityRequest = 0;
  readonly deviceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  get businessTimezone(): string { return this.businesses.find(business => business.id === this.businessId)?.timezone ?? ''; }
  busy = false; message = ''; error = '';
  constructor(private readonly api: PilotApiService) {}
  async ngOnInit() {
    try { this.user = await lastValueFrom(this.api.me()); } catch { this.user = null; }
    try { this.businesses = await lastValueFrom(this.api.businesses()); }
    catch { this.error = 'No se puede cargar el catálogo. Comprueba que la nueva API está disponible.'; }
  }
  async register() {
    if (this.busy) return;
    this.busy = true; this.error = ''; this.message = '';
    try { await lastValueFrom(this.api.register(this.name, this.email, this.password)); this.password = ''; this.message = 'Cuenta creada. Inicia sesión para continuar.'; }
    catch (error) { this.error = httpStatus(error) === 409 ? 'Ya existe una cuenta con ese correo.' : 'No se ha podido crear la cuenta. Revisa los datos e inténtalo de nuevo.'; }
    finally { this.busy = false; }
  }
  async login() {
    if (this.busy) return;
    this.busy = true; this.error = ''; this.message = '';
    try { this.user = await lastValueFrom(this.api.login(this.email, this.password)); this.password = ''; this.message = 'Sesión iniciada.'; }
    catch { this.error = 'No se ha podido iniciar sesión. Comprueba tus datos.'; }
    finally { this.busy = false; }
  }
  async logout() {
    if (this.busy) return;
    this.busy = true; this.error = ''; this.message = '';
    try { await lastValueFrom(this.api.logout()); this.user = null; this.appointments = []; this.message = 'Sesión cerrada.'; }
    catch { this.error = 'No se ha podido cerrar la sesión.'; }
    finally { this.busy = false; }
  }
  async chooseBusiness() {
    this.clearAvailability();
    const business = this.businessId;
    this.professionalId = ''; this.serviceId = ''; this.professionals = []; this.services = []; this.error = '';
    if (!business) return;
    try {
      const [professionals, services] = await Promise.all([lastValueFrom(this.api.professionals(business)), lastValueFrom(this.api.services(business))]);
      if (business === this.businessId) { this.professionals = professionals; this.services = services; }
    } catch { if (business === this.businessId) this.error = 'No se pueden cargar los profesionales y servicios.'; }
  }
  private clearAvailability() {
    this.availabilityRequest++;
    this.availability = null; this.selectedSlot = ''; this.loadingAvailability = false;
  }
  formatSlot(startAt: string): string {
    try {
      return new Intl.DateTimeFormat('es-ES', {timeZone: this.availability?.timezone || this.deviceTimezone, weekday:'long', year:'numeric', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit', timeZoneName:'shortOffset'}).format(new Date(startAt));
    } catch { return startAt; }
  }
  async loadAvailability() {
    this.clearAvailability();
    const request = this.availabilityRequest;
    if (!this.businessId || !this.professionalId || !this.serviceId) return;
    this.loadingAvailability = true; this.error = '';
    const from = new Date();
    const to = new Date(from.getTime() + 7 * 86400000);
    try {
      const result = await lastValueFrom(this.api.availability({businessId:this.businessId, professionalId:this.professionalId, serviceId:this.serviceId, from:from.toISOString(), to:to.toISOString()}));
      if (request === this.availabilityRequest) this.availability = result;
    } catch (error) {
      if (request === this.availabilityRequest) this.error = httpStatus(error) === 422 ? 'Este profesional no ofrece ese servicio o no está disponible.' : 'No se pueden consultar los horarios. Inténtalo de nuevo.';
    } finally { if (request === this.availabilityRequest) this.loadingAvailability = false; }
  }
  async reserve() {
    if (this.busy) return;
    this.error = ''; this.message = '';
    if (!this.user || !this.businessId || !this.professionalId || !this.serviceId) {
      this.error = 'Selecciona negocio, servicio y profesional.'; return;
    }
    if (!this.availability?.slots.some(slot => slot.startAt === this.selectedSlot) || Date.parse(this.selectedSlot) <= Date.now()) {
      this.error = 'Selecciona un horario disponible y actualizado.';
      return;
    }
    this.busy = true;
    try {
      await lastValueFrom(this.api.createAppointment({businessId:this.businessId, professionalId:this.professionalId, serviceId:this.serviceId, startAt:this.selectedSlot, notes:this.notes || null}));
      this.message = 'Reserva confirmada.'; this.notes = ''; this.clearAvailability();
    } catch (error) {
      const status = httpStatus(error);
      if (status === 409 || status === 422) this.clearAvailability();
      this.error = status === 409 ? 'Ese horario acaba de ocuparse. Vuelve a consultar los horarios.' : status === 422 ? 'El servicio o el horario no están disponibles para ese profesional.' : status === 401 ? 'Tu sesión ha caducado. Inicia sesión de nuevo.' : 'No se ha podido crear la reserva. Revisa los datos e inténtalo de nuevo.';
    } finally { this.busy = false; }
  }
  async listAppointments() {
    if (this.busy) return;
    this.busy = true; this.error = ''; this.message = '';
    const from = new Date(); const to = new Date(from.getTime() + 30 * 86400000);
    try { this.appointments = await lastValueFrom(this.api.appointments(from.toISOString(), to.toISOString())); this.message = this.appointments.length ? 'Próximas citas cargadas.' : 'No tienes citas en los próximos 30 días.'; }
    catch { this.error = 'No se pueden cargar tus citas.'; }
    finally { this.busy = false; }
  }
}
