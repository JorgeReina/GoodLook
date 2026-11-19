import { Injectable, signal } from '@angular/core';
import type { BookingRequest, Quote, Slot } from './customer-api';
import { timeWindow, type Window } from './customer-display';

export interface Attempt {
  body: BookingRequest;
  key: string;
  userId: string;
}

export interface Draft {
  businessId: string;
  serviceId: string;
  professionalId: string;
  slot: Slot | null;
  notes: string;
  ownerId?: string;
  window: Window;
  weekOffset: number;
  quote: Quote | null;
  attempt: Attempt | null;
}

@Injectable({ providedIn: 'root' })
export class BookingDraft {
  readonly value = signal<Draft | null>(null);

  open(businessId: string, serviceId = '') {
    if (this.value()?.businessId === businessId) return;
    this.value.set({
      businessId, serviceId, professionalId: '', slot: null, notes: '',
      window: timeWindow(Date.now(), 7), weekOffset: 0, attempt: null, quote: null,
    });
  }

  update(patch: Partial<Draft>) {
    const draft = this.value();
    if (draft) this.value.set({ ...draft, ...patch });
  }

  clear() {
    this.value.set(null);
  }
}
