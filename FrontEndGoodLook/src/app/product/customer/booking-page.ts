import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin, type Subscription } from 'rxjs';
import type { PublicBusiness } from '../api/contracts';
import { SessionService } from '../session.service';
import { StatusMessage } from '../shared/status-message';
import { type Attempt, BookingDraft } from './booking-draft';
import { type BookingReceipt, type CatalogProfessional, type CatalogService, CustomerApi, type Quote, type Slot } from './customer-api';
import { groupSlots, price, slotDate, slotTime, timeWindow, windowDates } from './customer-display';

type Load = 'idle' | 'loading' | 'ready' | 'missing' | 'error';

@Component({
  imports: [MatButtonModule, RouterLink, StatusMessage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './booking-page.html',
  styleUrl: './booking-page.css',
})
export class BookingPage {
  private readonly api = inject(CustomerApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroy = inject(DestroyRef);
  private readonly drafts = inject(BookingDraft);
  protected readonly session = inject(SessionService);
  protected readonly draft = this.drafts.value.asReadonly();
  protected readonly businessId = signal('');
  protected readonly business = signal<PublicBusiness | null>(null);
  protected readonly services = signal<CatalogService[]>([]);
  protected readonly staff = signal<CatalogProfessional[]>([]);
  protected readonly catalogState = signal<Load>('loading');
  protected readonly staffState = signal<Load>('idle');
  protected readonly availabilityState = signal<Load>('idle');
  protected readonly slots = signal<Slot[]>([]);
  protected readonly timezone = signal('UTC');
  protected readonly submitting = signal(false);
  protected readonly message = signal('');
  protected readonly receipt = signal<BookingReceipt | null>(null);
  protected readonly service = computed(() => this.services().find(item => item.id === this.draft()?.serviceId));
  protected readonly professional = computed(() => this.staff().find(item => item.id === this.draft()?.professionalId));
  protected readonly days = computed(() => groupSlots(this.slots(), this.timezone()));
  protected readonly price = price;
  protected readonly slotDate = slotDate;
  protected readonly slotTime = slotTime;
  protected readonly notes = computed(() => {
    const draft = this.draft();
    return draft?.ownerId && draft.ownerId === this.session.user()?.id ? draft.notes : '';
  });
  protected readonly noteCount = computed(() => Array.from(this.notes()).length);
  protected readonly range = computed(() => {
    const window = this.draft()?.window;
    return window ? windowDates(window, this.timezone()) : '';
  });
  protected readonly quote = computed(() => this.draft()?.quote ?? this.service());
  protected readonly returnTo = () => ({ retorno: this.router.url });

  private catalogRequest?: Subscription;
  private staffRequest?: Subscription;
  private availabilityRequest?: Subscription;

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe(params => {
      const id = (params.get('id') ?? '').toLowerCase();
      this.businessId.set(id);
      const selected = this.route.snapshot.queryParamMap.get('servicio') ?? '';
      this.drafts.open(id, selected);
      const draft = this.draft();
      if (selected && draft && selected !== draft.serviceId && !draft.attempt) {
        this.drafts.update({ serviceId: selected, professionalId: '', slot: null, quote: null });
      }
      this.receipt.set(null);
      this.message.set('');
      this.loadCatalog();
    });
    effect(() => {
      const user = this.session.user();
      if (!user) return;
      untracked(() => {
        const draft = this.draft();
        if (draft?.ownerId && draft.ownerId !== user.id) {
          this.drafts.update({ attempt: null, notes: '', ownerId: user.id });
        }
      });
    });
  }

  protected loadCatalog() {
    const draft = this.draft();
    if (!draft) return;
    this.catalogRequest?.unsubscribe();
    this.staffRequest?.unsubscribe();
    this.resetAvailability();
    this.catalogState.set('loading');
    this.staffState.set('idle');
    this.business.set(null);
    this.services.set([]);
    this.staff.set([]);
    this.catalogRequest = forkJoin({
      businesses: this.api.businesses(),
      services: this.api.services(draft.businessId),
    }).pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: ({ businesses, services }) => {
        const business = businesses.find(item => item.id === draft.businessId);
        if (!business) {
          this.catalogState.set('missing');
          return;
        }
        this.business.set(business);
        this.timezone.set(business.timezone);
        this.services.set(services);
        this.catalogState.set('ready');
        if (this.service()) {
          this.loadStaff();
        } else if (!this.draft()?.attempt) {
          this.drafts.update({ serviceId: '', professionalId: '', slot: null, quote: null });
        }
      },
      error: (error: unknown) => this.catalogState.set(
        error instanceof HttpErrorResponse && [400, 404].includes(error.status) ? 'missing' : 'error',
      ),
    });
  }

  protected selectService(serviceId: string) {
    this.drafts.update({ serviceId, professionalId: '', slot: null, quote: null });
    this.message.set('');
    this.loadStaff();
  }

  protected loadStaff() {
    const draft = this.draft();
    this.staffRequest?.unsubscribe();
    this.resetAvailability();
    this.staff.set([]);
    this.staffState.set('idle');
    if (!draft?.serviceId) return;

    this.staffState.set('loading');
    this.staffRequest = this.api.professionals(draft.businessId, draft.serviceId)
      .pipe(takeUntilDestroyed(this.destroy)).subscribe({
        next: staff => {
          this.staff.set(staff);
          this.staffState.set('ready');
          if (this.professional()) {
            this.loadAvailability();
          } else if (!this.draft()?.attempt) {
            this.drafts.update({ professionalId: '', slot: null });
          }
        },
        error: () => this.staffState.set('error'),
      });
  }

  protected selectProfessional(professionalId: string) {
    this.drafts.update({ professionalId, slot: null });
    this.message.set('');
    this.loadAvailability();
  }

  protected changeWeek(direction: number) {
    const draft = this.draft();
    if (!draft) return;
    const now = Date.now();
    const from = Date.parse(draft.window.from);
    const next = Math.max(now, from + direction * 7 * 86_400_000);
    const weekOffset = Math.max(0, draft.weekOffset + direction);
    this.drafts.update({ window: timeWindow(next, 7), weekOffset, slot: null });
    this.message.set('');
    this.loadAvailability();
  }

  protected loadAvailability() {
    const draft = this.draft();
    this.resetAvailability();
    if (!draft?.professionalId) return;
    this.availabilityState.set('loading');
    const { businessId, serviceId, professionalId, window } = draft;
    this.availabilityRequest = this.api.availability(businessId, serviceId, professionalId, window.from, window.to)
      .pipe(takeUntilDestroyed(this.destroy)).subscribe({
        next: ({ timezone, slots }) => {
          this.timezone.set(timezone);
          this.slots.set(slots);
          this.availabilityState.set('ready');
          const current = this.draft();
          if (current?.slot && !current.attempt && !slots.some(slot => slot.startAt === current.slot?.startAt)) {
            this.drafts.update({ slot: null });
            this.message.set('Ese hueco ya no está disponible. Elige otro horario.');
          }
        },
        error: (error: unknown) => this.availabilityState.set(
          error instanceof HttpErrorResponse && error.status === 422 ? 'missing' : 'error',
        ),
      });
  }

  protected selectSlot(slot: Slot) {
    this.drafts.update({ slot });
    this.message.set('');
  }

  protected changeNotes(notes: string) {
    const ownerId = this.session.user()?.id;
    if (ownerId) this.drafts.update({ notes, ownerId });
  }

  protected confirm() {
    const draft = this.draft();
    const user = this.session.user();
    if (!user || !draft || this.submitting()) return;

    let attempt = draft.attempt;
    if (attempt && attempt.userId !== user.id) return;
    if (!attempt) {
      const quote = this.quote();
      if (!quote || !this.professional() || !draft.slot || this.availabilityState() !== 'ready' ||
          this.noteCount() > 500) return;
      const { priceCents, currency, durationMinutes } = quote;
      attempt = {
        body: {
          businessId: draft.businessId, serviceId: draft.serviceId, professionalId: draft.professionalId,
          startAt: draft.slot.startAt, notes: this.notes().trim() || null, quote: { priceCents, currency, durationMinutes },
        },
        key: globalThis.crypto.randomUUID(), userId: user.id,
      };
      this.drafts.update({ attempt, ownerId: user.id });
    }

    this.message.set('');
    this.submitting.set(true);
    const activeAttempt = attempt;
    this.api.book(attempt.body, attempt.key).pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: receipt => {
        this.submitting.set(false);
        if (!this.isCurrentAttempt(activeAttempt)) return;
        if (!receipt?.id || !receipt.status) {
          this.handleBookingError(null);
          return;
        }
        this.receipt.set(receipt);
        this.drafts.clear();
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        if (this.isCurrentAttempt(activeAttempt)) this.handleBookingError(error);
      },
    });
  }

  private isCurrentAttempt(attempt: Attempt) {
    return this.draft()?.attempt === attempt;
  }

  private resetAvailability() {
    this.availabilityRequest?.unsubscribe();
    this.slots.set([]);
    this.availabilityState.set('idle');
  }

  private handleBookingError(error: unknown) {
    if (!(error instanceof HttpErrorResponse) || error.status === 0 || error.status === 408 || error.status >= 500) {
      this.message.set('No pudimos comprobar si se confirmó la cita. Reintenta la misma solicitud antes de reservar otro hueco.');
      return;
    }
    if (error.status === 401) {
      this.session.expire();
      this.message.set('La sesión caducó. Inicia sesión con la misma cuenta para recuperar la solicitud.');
      return;
    }

    this.drafts.update({ attempt: null });
    const code = error.error?.code;
    const quote = error.error?.quote as Quote | undefined;
    if (code === 'offer_changed' && quote) {
      this.drafts.update({ quote });
      this.message.set('La oferta ha cambiado. Revisa el importe y la duración antes de confirmar.');
    } else if (code === 'slot_unavailable') {
      this.drafts.update({ slot: null });
      this.message.set('Ese hueco ya no está disponible. Elige otro horario.');
      this.loadAvailability();
    } else if (code === 'idempotency_conflict') {
      this.drafts.update({ slot: null });
      this.message.set('Esta solicitud ya se utilizó. Revisa Mis citas antes de confirmar otra reserva.');
    } else {
      this.message.set('No pudimos reservar. Revisa los datos y vuelve a intentarlo.');
    }
  }
}
