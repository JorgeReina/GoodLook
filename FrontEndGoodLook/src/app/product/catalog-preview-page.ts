import { afterNextRender, ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject, Injector, signal, viewChildren } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import type { Subscription } from 'rxjs';
import type { PublicBusiness } from './api/contracts';
import { CustomerApi } from './customer/customer-api';
import { StatusMessage } from './shared/status-message';

export function appendUniqueById<T extends { id: string }>(previous: T[], incoming: T[]) {
  const seen = new Set(previous.map(item => item.id));
  const added: T[] = [];
  for (const item of incoming) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    added.push(item);
  }
  return { items: previous.concat(added), added };
}

type CatalogState =
  | { kind: 'loading' | 'error' }
  | {
    kind: 'ready';
    businesses: PublicBusiness[];
    hasMore: boolean;
    loadingMore: boolean;
    moreError: boolean;
  };

@Component({
  imports: [MatButtonModule, RouterLink, StatusMessage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="catalog-hero" aria-labelledby="catalog-heading">
      <h1 id="catalog-heading" tabindex="-1">Encuentra tu próximo<br class="catalog-break"> lugar de cuidado</h1>
      <p>Peluquerías, barberías y centros de estética.</p>
    </section>
    <section class="catalog-section" aria-labelledby="listing-heading"
             [attr.aria-busy]="catalogBusy() ? 'true' : null">
      <h2 id="listing-heading">Negocios publicados</h2>
      <p class="gl-skip" aria-live="polite">{{ announcement() }}</p>
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
                  <h3><a #businessLink [routerLink]="['/negocios', business.id]">{{ business.name }}</a></h3>
                  @if (business.sector) { <p>{{ business.sector }}</p> }
                  @if (business.address) { <p>{{ business.address }}</p> }
                </li>
              }
            </ul>
          } @else {
            <gl-status kind="empty">Todavía no hay negocios publicados.</gl-status>
          }
          @if (catalog.moreError) {
            <gl-status kind="error">No pudimos cargar más negocios.</gl-status>
          }
          @if (catalog.loadingMore) {
            <gl-status>Cargando más negocios…</gl-status>
          }
          @if (catalog.hasMore) {
            <div class="catalog-more">
              <button matButton="outlined" type="button"
                      [disabled]="catalog.loadingMore"
                      (click)="loadMore()">Cargar más</button>
            </div>
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
    .catalog-retry, .catalog-more { margin-top: 1rem; }
    .catalog-more { display: flex; flex-wrap: wrap; align-items: center; gap: .75rem; }
    @media (max-width: 460px) { .catalog-break { display: none; } }
  `,
})
export class CatalogPreviewPage {
  private readonly api = inject(CustomerApi);
  private readonly destroy = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly businessLinks = viewChildren<ElementRef<HTMLAnchorElement>>('businessLink');
  private request?: Subscription;
  private nextPage = 1;
  protected readonly state = signal<CatalogState>({ kind: 'loading' });
  protected readonly announcement = signal('');

  constructor() {
    this.load();
  }

  protected catalogBusy() {
    const catalog = this.state();
    return catalog.kind === 'ready' && catalog.loadingMore;
  }

  protected load() {
    this.nextPage = 1;
    this.announcement.set('');
    this.state.set({ kind: 'loading' });
    this.fetchPage(false);
  }

  protected loadMore() {
    const catalog = this.state();
    if (catalog.kind !== 'ready' || catalog.loadingMore || !catalog.hasMore) return;
    this.state.set({ ...catalog, loadingMore: true, moreError: false });
    this.fetchPage(true);
  }

  private fetchPage(append: boolean) {
    this.request?.unsubscribe();
    const page = this.nextPage;
    this.request = this.api.businesses(page).pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: result => {
        const current = this.state();
        const previous = append && current.kind === 'ready' ? current.businesses : [];
        const { items: businesses, added } = appendUniqueById(previous, result.items);
        this.nextPage = page + 1;
        this.state.set({
          kind: 'ready',
          businesses,
          hasMore: result.hasMore,
          loadingMore: false,
          moreError: false,
        });
        if (append) this.announceAdded(added.length, businesses.length);
        else this.announcement.set('');
        if (append && added.length) this.focusBusiness(previous.length);
      },
      error: () => {
        if (append && this.state().kind === 'ready') {
          this.state.update(current => current.kind === 'ready'
            ? { ...current, loadingMore: false, moreError: true }
            : current);
        } else {
          this.state.set({ kind: 'error' });
        }
      },
    });
  }

  private announceAdded(added: number, total: number) {
    const addedLabel = added === 1 ? 'Se ha añadido 1 negocio' : `Se han añadido ${added} negocios`;
    this.announcement.set(`${addedLabel}. Hay ${total} en total.`);
  }

  private focusBusiness(index: number) {
    afterNextRender(() => {
      this.businessLinks()[index]?.nativeElement.focus();
    }, { injector: this.injector });
  }
}
