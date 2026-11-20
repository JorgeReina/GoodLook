import { DOCUMENT } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { afterNextRender, Component, computed, ElementRef, inject, Injector, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom, forkJoin } from 'rxjs';
import { AgendaWeek } from '../agenda/agenda-week';
import { Closure, WorkingHour } from '../agenda/agenda-api';
import { displayInstant } from '../agenda/week';
import { SessionService } from '../session.service';
import { StatusMessage } from '../shared/status-message';
import { centsFromInput, localDateTime } from './input';
import { Business, BusinessDetail, ManagementApi, Mutation, Staff } from './management-api';

type Impact = { action: Mutation; affectedCount: number; token: string };
const blankProfile = () => ({ name: '', sector: '', address: '', timezone: 'Europe/Madrid' });
const blankService = () => ({ id: '', name: '', description: '', price: '', currency: 'EUR', durationMinutes: 30, active: true });

@Component({
  imports: [FormsModule, MatButtonModule, StatusMessage, AgendaWeek],
  templateUrl: './management-page.html',
})
export class ManagementPage {
  private readonly api = inject(ManagementApi);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly route = inject(ActivatedRoute);
  private readonly session = inject(SessionService);
  protected readonly memberships = this.session.managementMemberships;
  protected readonly creating = signal(this.route.snapshot.queryParamMap.get('alta') === '1');
  protected readonly businessId = signal(this.route.snapshot.queryParamMap.get('negocio') ?? this.memberships()[0]?.businessId ?? '');
  protected readonly owner = computed(() => this.memberships().some(item => item.businessId === this.businessId() && item.role === 'owner'));
  protected readonly detail = signal<BusinessDetail | null>(null);
  protected readonly selectedStaff = signal('');
  protected readonly staff = computed(() => this.detail()?.staff.find(member => member.id === this.selectedStaff()));
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly feedback = signal('');
  protected readonly impact = signal<Impact | null>(null);
  private readonly impactNotice = viewChild<ElementRef<HTMLElement>>('impactNotice');
  protected readonly invitation = signal('');
  protected readonly revision = signal(0);
  protected readonly localTime = displayInstant;
  protected readonly weekdays = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  protected profile = blankProfile();
  protected service = blankService();
  protected staffName = '';
  protected hours: WorkingHour[] = [];
  protected closures: Closure[] = [];
  protected closureStart = '';
  protected closureEnd = '';
  protected assigned: string[] = [];
  protected staffEditName = '';
  protected scheduleReady = signal(false);

  constructor() {
    if (this.businessId() && !this.creating()) void this.selectBusiness(this.businessId());
  }

  protected beginCreate() {
    this.creating.set(true);
    this.profile = blankProfile();
    this.clearMessages();
  }

  protected async selectBusiness(id: string) {
    if (!id || this.busy()) return;
    this.creating.set(false);
    this.businessId.set(id);
    this.selectedStaff.set('');
    this.detail.set(null);
    this.clearMessages();
    await this.run(async () => this.refreshDetail());
  }

  private async refreshDetail() {
    const detail = await firstValueFrom(this.api.detail(this.businessId()));
    this.detail.set(detail);
    const { name, sector, address, timezone } = detail.business;
    this.profile = { name, sector: sector ?? '', address: address ?? '', timezone };
    this.service = blankService();
    const staff = detail.staff.find(member => member.id === this.selectedStaff()) ?? detail.staff[0];
    this.selectedStaff.set('');
    if (staff) await this.loadStaff(staff);
  }

  protected async selectStaff(id: string) {
    if (this.busy()) return;
    const staff = this.detail()?.staff.find(member => member.id === id);
    if (!staff) return;
    this.clearMessages();
    await this.run(async () => this.loadStaff(staff));
  }

  private async loadStaff(staff: Staff) {
    this.selectedStaff.set(staff.id);
    this.scheduleReady.set(false);
    this.invitation.set('');
    this.staffEditName = staff.displayName;
    this.assigned = [...staff.serviceIds];
    this.hours = [];
    this.closures = [];
    this.closureStart = '';
    this.closureEnd = '';
    const data = await firstValueFrom(forkJoin({
      hours: this.api.hours(this.businessId(), staff.id),
      closures: this.api.closures(this.businessId(), staff.id),
    }));
    this.hours = data.hours.hours.map(hour => ({ ...hour }));
    this.closures = data.closures.closures;
    this.scheduleReady.set(true);
  }

  private clearMessages() {
    this.impact.set(null);
    this.error.set('');
    this.feedback.set('');
  }

  private async run(action: () => Promise<void>) {
    if (this.busy()) return;
    this.busy.set(true);
    try { await action(); }
    catch (error) { this.showError(error); }
    finally { this.busy.set(false); }
  }

  private showError(error: unknown, action?: Mutation) {
    const body = error instanceof HttpErrorResponse ? error.error : null;
    if (action && body?.code === 'impact_confirmation_required' && typeof body.impactToken === 'string') {
      this.impact.set({ action, affectedCount: body.affectedCount, token: body.impactToken });
      afterNextRender(() => this.impactNotice()?.nativeElement.focus(), { injector: this.injector });
      return;
    }
    const messages: Record<string, string> = {
      timezone_has_bookings: 'El negocio tiene próximas citas confirmadas. Conserva su zona horaria actual.',
      publication_incomplete: 'Completa la ficha y configura una oferta reservable antes de publicar.',
      invalid_input: 'Revisa los campos, los intervalos y la zona horaria.',
      forbidden: 'Tu cuenta no tiene permiso para realizar este cambio.',
    };
    this.error.set(messages[body?.code] ?? 'No se pudo completar la operación. Vuelve a intentarlo.');
  }

  protected async saveProfile() {
    if (!this.creating()) {
      await this.mutate({ method: 'PATCH', path: this.businessPath('/profile'), body: { ...this.profile } });
      return;
    }
    this.clearMessages();
    await this.run(async () => {
      const result = await firstValueFrom(this.api.mutate<Business>({ method: 'POST', path: '', body: { ...this.profile } }));
      this.businessId.set(result.id);
      this.selectedStaff.set('');
      await firstValueFrom(this.session.refresh());
      this.creating.set(false);
      void this.router.navigate(['/gestion'], { queryParams: { negocio: result.id }, replaceUrl: true });
      await this.refreshDetail();
      this.feedback.set('Negocio creado como privado.');
    });
  }

  protected toggleVisibility(business: Business) {
    void this.mutate({ method: 'PUT', path: this.businessPath('/visibility'), body: { isPublic: !business.isPublic } });
  }

  protected editService(id: string) {
    const item = this.detail()?.services.find(service => service.id === id);
    this.service = item ? { ...item, description: item.description ?? '', price: (item.priceCents / 100).toFixed(2) } : blankService();
  }

  protected saveService() {
    const priceCents = centsFromInput(this.service.price);
    if (priceCents === null) { this.error.set('Introduce un precio válido con hasta dos decimales.'); return; }
    const { id, name, description, durationMinutes, currency, active } = this.service;
    const body = { name, description, durationMinutes, priceCents, currency: currency.toUpperCase() };
    void this.mutate(id
      ? { method: 'PATCH', path: this.businessPath('/services/' + id), body: { ...body, active } }
      : { method: 'POST', path: this.businessPath('/services'), body });
  }

  protected async addStaff() {
    const saved = await this.mutate({
      method: 'POST', path: this.businessPath('/staff'), body: { displayName: this.staffName },
    });
    if (saved) this.staffName = '';
  }

  protected saveStaff(active: boolean) {
    void this.mutate({ method: 'PATCH', path: this.staffPath(), body: { displayName: this.staffEditName, active } });
  }

  protected toggleAssignment(id: string, selected: boolean) {
    this.assigned = selected ? [...this.assigned, id] : this.assigned.filter(value => value !== id);
  }

  protected saveAssignments() {
    void this.mutate({ method: 'PUT', path: this.staffPath('/services'), body: { serviceIds: [...this.assigned] } });
  }

  protected addHour() { this.hours = [...this.hours, { weekday: 1, startTime: '09:00', endTime: '17:00' }]; }
  protected removeHour(index: number) { this.hours = this.hours.filter((_item, position) => index !== position); }
  protected saveHours() {
    void this.mutate({ method: 'PUT', path: this.staffPath('/hours'), body: { hours: this.hours.map(hour => ({ ...hour })) } });
  }

  protected addClosure(timezone: string) {
    const startAt = localDateTime(this.closureStart, timezone), endAt = localDateTime(this.closureEnd, timezone);
    if (!startAt || !endAt || startAt >= endAt) {
      this.error.set('El cierre necesita un inicio y un fin válidos. Evita horas ambiguas en el cambio de hora.');
      return;
    }
    void this.mutate({ method: 'POST', path: this.staffPath('/closures'), body: { startAt, endAt } });
  }

  protected removeClosure(id: string) {
    void this.mutate({ method: 'DELETE', path: this.staffPath('/closures/' + id) });
  }

  protected async invite() {
    this.clearMessages();
    this.invitation.set('');
    await this.run(async () => {
      const { token } = await firstValueFrom(this.api.invite(this.businessId(), this.selectedStaff()));
      const url = new URL('invitacion', this.document.baseURI);
      url.hash = 'token=' + encodeURIComponent(token);
      this.invitation.set(url.href);
    });
  }

  protected async copyInvitation() {
    try { await this.document.defaultView?.navigator.clipboard.writeText(this.invitation()); this.feedback.set('Enlace copiado.'); }
    catch { this.error.set('Selecciona y copia el enlace manualmente.'); }
  }

  protected async revokeInvitation() {
    await this.mutate({ method: 'DELETE', path: this.staffPath('/invitation') });
  }

  protected confirmImpact(impact: Impact) { void this.mutate(impact.action, impact.token); }

  private async mutate(action: Mutation, token?: string): Promise<boolean> {
    let saved = false;
    this.clearMessages();
    await this.run(async () => {
      try { await firstValueFrom(this.api.mutate(action, token)); }
      catch (error) { this.showError(error, action); return; }
      saved = true;
      this.feedback.set('Cambios guardados.');
      this.revision.update(value => value + 1);
      await this.refreshDetail();
    });
    return saved;
  }

  private businessPath(path = '') { return '/' + this.businessId() + path; }
  private staffPath(path = '') { return this.businessPath('/staff/' + this.selectedStaff() + path); }
}
