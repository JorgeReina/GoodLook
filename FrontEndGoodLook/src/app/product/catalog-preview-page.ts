import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import type { PublicBusiness } from './api/contracts';
import { ProductApiService } from './api/product-api.service';
import { StatusMessage } from './shared/status-message';

type CatalogState =
  | { kind: 'loading' | 'error' }
  | { kind: 'ready'; businesses: PublicBusiness[] };

@Component({
  imports: [MatButtonModule, StatusMessage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="catalog-hero" aria-labelledby="catalog-heading">
      <h1 id="catalog-heading" tabindex="-1">Encuentra tu próximo<br class="catalog-break"> lugar de cuidado</h1>
      <p>Peluquerías, barberías y centros de estética.</p>
    </section>
    <section class="catalog-section" aria-labelledby="listing-heading">
      <h2 id="listing-heading">Negocios publicados</h2>
      @let catalog = state();
      @switch (catalog.kind) {
        @case ('loading') {
          <gl-status>Cargando negocios…</gl-status>
        }
        @case ('error') {
          <gl-status kind="error">No pudimos cargar los negocios.</gl-status>
          <button class="catalog-retry" matButton="outlined" type="button" (click)="load()">Volver a intentar</button>
        }
        @case ('ready') {
          @if (catalog.businesses.length) {
            <ul class="catalog-list">
              @for (business of catalog.businesses; track business.id) {
                <li>
                  <h3>{{ business.name }}</h3>
                  @if (business.sector) { <p>{{ business.sector }}</p> }
                  @if (business.address) { <p>{{ business.address }}</p> }
                </li>
              }
            </ul>
          } @else {
            <gl-status kind="empty">Todavía no hay negocios publicados.</gl-status>
          }
        }
      }
    </section>
  `,
  styles: `
    .catalog-hero {
      background: var(--gl-green);
      color: var(--gl-surface);
      border-radius: 1.5rem;
      padding: clamp(2rem, 6vw, 5rem) clamp(1.25rem, 7vw, 5.25rem);
    }
    .catalog-hero h1 { max-width: 14ch; font-size: clamp(2.4rem, 7vw, 5.25rem); line-height: 1.02; }
    .catalog-hero h1:focus-visible { outline-color: var(--gl-surface); }
    .catalog-hero p { margin: 1.25rem 0 0; max-width: 34ch; }
    .catalog-section { padding: clamp(1.5rem, 4vw, 3.5rem) 0 0; }
    .catalog-section h2 { margin: 0 0 1rem; font-size: clamp(1.7rem, 4vw, 2.5rem); }
    .catalog-list { list-style: none; padding: 0; display: grid; gap: 1rem;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr)); }
    .catalog-list li {
      background: var(--gl-surface);
      border: 1px solid var(--gl-line);
      border-radius: 1rem;
      padding: 1.25rem;
      overflow-wrap: anywhere;
    }
    .catalog-list h3 { margin: 0; font-size: 1.4rem; }
    .catalog-list p { margin: .5rem 0 0; color: var(--gl-muted); }
    .catalog-retry { margin-top: 1rem; }
    @media (max-width: 460px) { .catalog-break { display: none; } }
  `,
})
export class CatalogPreviewPage {
  private readonly api = inject(ProductApiService);
  private readonly destroy = inject(DestroyRef);
  protected readonly state = signal<CatalogState>({ kind: 'loading' });

  constructor() {
    this.load();
  }

  protected load() {
    this.state.set({ kind: 'loading' });
    this.api.businesses().pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: businesses => this.state.set({ kind: 'ready', businesses }),
      error: () => this.state.set({ kind: 'error' }),
    });
  }
}
