import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import type { Subscription } from 'rxjs';
import { StatusMessage } from '../shared/status-message';
import { type CustomerAppointment, CustomerApi } from './customer-api';
import { price, slotDate, timeWindow } from './customer-display';

const PERIOD_DAYS = 30;
const PERIOD_MS = PERIOD_DAYS * 86_400_000;
const statusLabels: Record<string, string> = {
  booked: 'Confirmada', completed: 'Completada', cancelled: 'Cancelada', no_show: 'No presentada',
};

@Component({
  imports: [MatButtonModule, RouterLink, StatusMessage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="gl-panel">
      <h1 tabindex="-1">Mis citas</h1>
      <p>{{ period() === 0 ? 'Próximos 30 días' : periodLabel() }}</p>
      <div class="gl-actions">
        <button matButton="outlined" (click)="changePeriod(-1)">30 días anteriores</button>
        <button matButton="outlined" [disabled]="period() === 0" (click)="goToUpcoming()">Volver a próximas</button>
        <button matButton="outlined" (click)="changePeriod(1)">30 días siguientes</button>
      </div>
      @if (citas().length) {
        <ul class="appointments">
          @for (cita of citas(); track cita.id) {
            <li>
              <h2>{{ cita.serviceName }}</h2>
              <p>{{ cita.businessName }} · {{ cita.professionalName }}</p>
              <p>{{ slotDate(cita.startAt, cita.timezone) }} ({{ cita.timezone }})</p>
              <p>{{ statusLabel(cita.status) }} · {{ price(cita.priceCents, cita.currency) }}</p>
            </li>
          }
        </ul>
      }
      @if (loading()) {
        <gl-status>Cargando citas…</gl-status>
      } @else if (failed()) {
        <gl-status kind="error">No pudimos cargar tus citas.</gl-status>
        <button matButton="outlined" (click)="load()">Volver a intentar</button>
      } @else if (!citas().length) {
        <gl-status kind="empty">No hay citas en este periodo. <a routerLink="/">Explorar negocios</a></gl-status>
      }
      @if (cursor() && !loading() && !failed()) {
        <button matButton="outlined" (click)="load()">Ver más citas</button>
      }
    </section>
  `,
  styles: `
    .gl-actions { margin-block-end: 1.25rem; }
    .appointments { padding: 0; list-style: none; }
    .appointments li { border-block-start: 1px solid var(--gl-line); padding-block: .8rem; overflow-wrap: anywhere; }
    .appointments h2, .appointments p { margin: .35rem 0; }
  `,
})
export class MyBookingsPage {
  private readonly api = inject(CustomerApi);
  private readonly destroy = inject(DestroyRef);
  private readonly now = Date.now();
  private request?: Subscription;
  protected readonly period = signal(0);
  protected readonly citas = signal<CustomerAppointment[]>([]);
  protected readonly cursor = signal<string | null>(null);
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly price = price;
  protected readonly slotDate = slotDate;
  protected readonly statusLabel = (status: string) => statusLabels[status] ?? 'Estado desconocido';

  constructor() {
    this.load();
  }

  protected changePeriod(direction: number) {
    this.selectPeriod(this.period() + direction);
  }

  protected goToUpcoming() {
    this.selectPeriod(0);
  }

  protected periodLabel() {
    const { from, to } = this.window();
    const fmt = new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium' });
    return fmt.format(new Date(from)) + ' – ' + fmt.format(new Date(to));
  }

  protected load() {
    this.request?.unsubscribe();
    const cursor = this.cursor();
    const { from, to } = this.window();
    this.loading.set(true);
    this.failed.set(false);
    this.request = this.api.appointments(from, to, cursor ?? undefined).pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: response => {
        this.loading.set(false);
        this.citas.update(items => cursor ? [...items, ...response.items] : response.items);
        this.cursor.set(response.nextCursor);
      },
      error: () => {
        this.loading.set(false);
        this.failed.set(true);
      },
    });
  }

  private selectPeriod(period: number) {
    this.period.set(period);
    this.citas.set([]);
    this.cursor.set(null);
    this.load();
  }

  private window() {
    return timeWindow(this.now + this.period() * PERIOD_MS, PERIOD_DAYS);
  }
}
