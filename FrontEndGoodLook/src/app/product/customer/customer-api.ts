import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { PublicBusiness } from '../api/contracts';

export interface Quote {
  priceCents: number;
  currency: string;
  durationMinutes: number;
}

export interface CatalogService extends Quote {
  id: string;
  name: string;
  description: string | null;
}

export interface CatalogProfessional {
  id: string;
  displayName: string;
}

export interface Slot { startAt: string; endAt: string; }

export interface BookingRequest {
  businessId: string;
  serviceId: string;
  professionalId: string;
  startAt: string;
  notes: string | null;
  quote: Quote;
}

export interface BookingReceipt extends Slot {
  id: string;
  priceCents: number;
  currency: string;
  status: string;
}

export interface CustomerAppointment extends BookingReceipt {
  businessId: string;
  businessName: string;
  timezone: string;
  professionalId: string;
  professionalName: string;
  serviceId: string;
  serviceName: string;
}

@Injectable({ providedIn: 'root' })
export class CustomerApi {
  private readonly http = inject(HttpClient);

  businesses() {
    return this.http.get<PublicBusiness[]>('/api/catalog/businesses');
  }

  services(businessId: string) {
    return this.http.get<CatalogService[]>(this.businessUrl(businessId) + '/services');
  }

  professionals(businessId: string, serviceId: string) {
    return this.http.get<CatalogProfessional[]>(this.businessUrl(businessId) + '/professionals', { params: { serviceId } });
  }

  availability(businessId: string, serviceId: string, professionalId: string, from: string, to: string) {
    return this.http.get<{ timezone: string; slots: Slot[] }>('/api/appointments/availability', {
      params: { businessId, serviceId, professionalId, from, to },
    });
  }

  book(body: BookingRequest, key: string) {
    return this.http.post<BookingReceipt>('/api/bookings', body, { headers: { 'Idempotency-Key': key } });
  }

  appointments(from: string, to: string, cursor?: string) {
    return this.http.get<{ items: CustomerAppointment[]; nextCursor: string | null }>('/api/me/bookings', {
      params: cursor ? { from, to, cursor } : { from, to },
    });
  }

  private businessUrl(id: string) {
    return '/api/catalog/businesses/' + encodeURIComponent(id);
  }
}
