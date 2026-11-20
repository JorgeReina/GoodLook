import { DOCUMENT } from '@angular/common';
import { computed, Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SwUpdate } from '@angular/service-worker';
import { BookingDraft } from '../customer/booking-draft';

@Injectable({ providedIn: 'root' })
export class ProductUpdate {
  private readonly worker = inject(SwUpdate, { optional: true });
  private readonly document = inject(DOCUMENT);
  private readonly draft = inject(BookingDraft).value;
  private readonly versionReady = signal(false);
  private checking?: Promise<void>;

  readonly ready = this.versionReady.asReadonly();
  readonly blocked = computed(() => Boolean(this.draft()?.attempt));
  readonly hasSelection = computed(() => {
    const draft = this.draft();
    return Boolean(draft && (draft.serviceId || draft.professionalId || draft.slot || draft.notes));
  });

  constructor() {
    if (!this.worker?.isEnabled) return;
    this.worker.versionUpdates.pipe(takeUntilDestroyed()).subscribe(event => {
      if (event.type === 'VERSION_READY') this.versionReady.set(true);
    });
  }

  check() {
    if (!this.worker?.isEnabled || this.ready()) return;
    // Worker failures (for example during a temporary disconnection) do not
    // interrupt this version. A later focus or reconnect checks again.
    this.checking ??= this.worker.checkForUpdate()
      .then(() => undefined, () => undefined)
      .finally(() => { this.checking = undefined; });
    return this.checking;
  }

  reload() {
    if (this.ready() && !this.blocked()) this.document.location.reload();
  }
}
