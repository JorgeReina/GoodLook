import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map } from 'rxjs';
import type { PublicBusiness } from '../api/contracts';

export const CATALOG_PAGE_SIZE = 50;

export interface CatalogListPage<T> {
  items: T[];
  hasMore: boolean;
}

function catalogHasMore(headers: HttpHeaders): boolean {
  return headers.get('X-Has-More')?.trim().toLowerCase() === 'true';
}

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

  businesses(page = 1) {
    const options = {
      observe: 'response' as const,
      params: page > 1
        ? new HttpParams({ fromObject: { page: String(page), limit: String(CATALOG_PAGE_SIZE) } })
        : undefined,
    };
    return this.http.get<PublicBusiness[]>('/api/catalog/businesses', options).pipe(
      map(response => ({
        items: response.body ?? [],
        hasMore: catalogHasMore(response.headers),
      } satisfies CatalogListPage<PublicBusiness>)),
    );
  }

  business(id: string) {
    return this.http.get<PublicBusiness>(this.businessUrl(id));
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
