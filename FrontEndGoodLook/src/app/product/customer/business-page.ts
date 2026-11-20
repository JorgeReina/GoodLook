import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, forkJoin, map, of, startWith, Subject, switchMap } from 'rxjs';
import type { PublicBusiness } from '../api/contracts';
import { StatusMessage } from '../shared/status-message';
import { type CatalogService, CustomerApi } from './customer-api';
import { price } from './customer-display';

type State = 'loading' | 'ready' | 'missing' | 'error';

@Component({
  imports: [MatButtonModule, RouterLink, StatusMessage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink="/">Volver al catálogo</a>
    <section class="gl-panel">
      <h1 tabindex="-1">{{ business()?.name ?? 'Ficha del negocio' }}</h1>
      @switch (state()) {
        @case ('loading') { <gl-status>Cargando la ficha…</gl-status> }
        @case ('missing') { <gl-status kind="empty">El negocio no está disponible.</gl-status> }
        @case ('error') {
          <gl-status kind="error">No pudimos cargar la ficha.</gl-status>
          <button matButton="outlined" (click)="retry()">Volver a intentar</button>
        }
        @case ('ready') {
          @if (business()?.sector) { <p>{{ business()?.sector }}</p> }
          @if (business()?.address) { <p>{{ business()?.address }}</p> }
          <h2>Servicios</h2>
          @if (services().length) {
            <ul class="services">
              @for (service of services(); track service.id) {
                <li>
                  <h3>{{ service.name }}</h3>
                  @if (service.description) { <p>{{ service.description }}</p> }
                  <p>{{ service.durationMinutes }} min · {{ price(service.priceCents, service.currency) }}</p>
                  <a matButton="outlined" [routerLink]="['/reservar', business()?.id]" [queryParams]="{ servicio: service.id }"
                     [attr.aria-label]="'Reservar ' + service.name">Reservar {{ service.name }}</a>
                </li>
              }
            </ul>
          } @else {
            <gl-status kind="empty">Todavía no hay servicios reservables.</gl-status>
          }
        }
      }
    </section>
  `,
  styles: `
    .gl-panel { margin-block-start: 1rem; }
    h1, h3 { overflow-wrap: anywhere; }
    .services { padding: 0; list-style: none; }
    .services li { border-block-start: 1px solid var(--gl-line); padding-block: 1rem; }
    .services h3, .services p { margin: 0 0 .5rem; overflow-wrap: anywhere; }
  `,
})
export class BusinessPage {
  private readonly api = inject(CustomerApi);
  private readonly route = inject(ActivatedRoute);
  protected readonly business = signal<PublicBusiness | null>(null);
  protected readonly services = signal<CatalogService[]>([]);
  protected readonly state = signal<State>('loading');
  protected readonly price = price;
  private readonly reload = new Subject<void>();

  constructor() {
    this.route.paramMap.pipe(
      switchMap(params => this.reload.pipe(
        startWith(undefined),
        switchMap(() => {
          this.business.set(null);
          this.state.set('loading');
          const id = (params.get('id') ?? '').toLowerCase();
          return forkJoin({ businesses: this.api.businesses(), services: this.api.services(id) })
            .pipe(
              map(({ businesses, services }) => ({ business: businesses.find(item => item.id === id), services })),
              catchError((error: unknown) => of(error instanceof HttpErrorResponse && [400, 404].includes(error.status)
                ? 'missing' as const : 'error' as const)),
            );
        }),
      )),
      takeUntilDestroyed(),
    ).subscribe(result => {
      if (typeof result === 'string') {
        this.state.set(result);
      } else if (result.business) {
        this.business.set(result.business);
        this.services.set(result.services);
        this.state.set('ready');
      } else {
        this.state.set('missing');
      }
    });
  }

  protected retry() {
    this.reload.next();
  }
}
