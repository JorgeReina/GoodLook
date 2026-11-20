import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import { productRoutes } from '../product.routes';
import { SessionService } from '../session.service';

const business = { id: 'studio', name: 'Estudio de prueba', timezone: 'Europe/Madrid', sector: 'Estética', address: 'Calle de prueba' };
const service = { id: 'cut', name: 'Corte', durationMinutes: 30, priceCents: 2200, currency: 'EUR' };
const professional = { id: 'ana', displayName: 'Ana', serviceIds: ['cut'] };
const slot = { startAt: '2030-01-01T17:00:00.000Z', endAt: '2030-01-01T17:30:00.000Z' };
const user = { id: 'customer', email: 'customer@example.test', displayName: 'Cliente' };

describe('Recorrido cliente de producto', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  const sessionUser = signal<typeof user | null>(user);
  const sessionStatus = signal<'active' | 'anonymous'>('active');

  beforeEach(async () => {
    sessionUser.set(user);
    sessionStatus.set('active');
    TestBed.configureTestingModule({ providers: [
      provideRouter(productRoutes), provideHttpClient(), provideHttpClientTesting(),
      { provide: SessionService, useValue: {
        user: sessionUser, status: sessionStatus, ensure: () => of({ status: sessionStatus() }),
      } },
    ] });
    harness = await RouterTestingHarness.create();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const render = () => harness.detectChanges();
  const content = () => harness.routeNativeElement!;

  function button(label: string): HTMLButtonElement {
    const match = Array.from(content().querySelectorAll<HTMLButtonElement>('button'))
      .find(item => item.textContent?.trim() === label);
    if (!match) throw new Error('Botón no encontrado: ' + label);
    return match;
  }

  function choose(label: string, value: string) {
    const select = content().querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!;
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    render();
  }

  function availability() {
    return http.expectOne(request => request.url === '/api/appointments/availability' &&
      request.params.get('serviceId') === service.id && request.params.get('professionalId') === professional.id);
  }

  async function startBooking() {
    await harness.navigateByUrl('/reservar/studio');
    http.expectOne('/api/catalog/businesses').flush([business]);
    http.expectOne('/api/catalog/businesses/studio/services').flush([service]);
    render();
    http.expectNone(request => request.url.includes('/professionals'));
    choose('Servicio', 'cut');
    http.expectOne('/api/catalog/businesses/studio/professionals?serviceId=cut').flush([professional]);
    render();
    choose('Profesional', 'ana');
    availability().flush({ timezone: business.timezone, slots: [slot] });
    render();
    const input = content().querySelector<HTMLInputElement>('input[type=radio]')!;
    input.click();
    render();
  }

  it('navega del catálogo a una ficha con servicios reservables', async () => {
    await harness.navigateByUrl('/');
    http.expectOne('/api/catalog/businesses').flush([business]);
    render();
    expect(content().querySelector('a[href="/negocios/studio"]')?.textContent).toContain('Estudio de prueba');

    await harness.navigateByUrl('/negocios/studio');
    http.expectOne('/api/catalog/businesses').flush([business]);
    http.expectOne('/api/catalog/businesses/studio/services').flush([service]);
    render();
    expect(content().textContent).toContain('Corte');
    expect(content().querySelector('a[href="/reservar/studio?servicio=cut"]')).not.toBeNull();
  });

  it('mantiene la clave y el cuerpo al reintentar una reserva de resultado incierto', async () => {
    await startBooking();
    button('Confirmar reserva').click();
    const request = http.expectOne({ method: 'POST', url: '/api/bookings' });
    const idempotencyKey = request.request.headers.get('Idempotency-Key');
    const body = request.request.body;
    expect(idempotencyKey).toMatch(/^[a-f0-9-]{36}$/i);
    expect(body).toEqual({
      businessId: business.id, serviceId: service.id, professionalId: professional.id,
      startAt: slot.startAt, notes: null, quote: { priceCents: 2200, currency: 'EUR', durationMinutes: 30 },
    });
    request.error(new ProgressEvent('error'));
    render();
    expect(content().textContent).not.toContain('Cita confirmada');
    button('Reintentar confirmación').click();
    const retry = http.expectOne('/api/bookings');
    expect(retry.request.headers.get('Idempotency-Key')).toBe(idempotencyKey);
    expect(retry.request.body).toEqual(body);
    retry.flush({ id: 'booking', ...slot, priceCents: 2200, currency: 'EUR', status: 'booked' });
    render();
    expect(content().textContent).toContain('Cita confirmada');
  });

  it('muestra un cambio de oferta y espera otra confirmación antes de enviar', async () => {
    await startBooking();
    button('Confirmar reserva').click();
    const previous = http.expectOne('/api/bookings');
    const quote = { priceCents: 2600, currency: 'EUR', durationMinutes: 30 };
    previous.flush({ code: 'offer_changed', quote }, { status: 409, statusText: 'Conflict' });
    render();
    expect(content().textContent).toContain('La oferta ha cambiado');
    http.expectNone('/api/bookings');
    button('Confirmar reserva').click();
    const request = http.expectOne('/api/bookings');
    expect(request.request.body.quote).toEqual(quote);
    expect(request.request.headers.get('Idempotency-Key')).not.toBe(previous.request.headers.get('Idempotency-Key'));
    request.flush({ code: 'slot_unavailable' }, { status: 409, statusText: 'Conflict' });
    availability().flush({ timezone: business.timezone, slots: [] });
    render();
    expect(content().textContent).toContain('Ese hueco ya no está disponible');
    expect(content().textContent).not.toContain('Cita confirmada');
  });

  it('descarta la consulta anterior cuando se elige otro profesional', async () => {
    const second = { ...professional, id: 'bea', displayName: 'Bea' };
    await harness.navigateByUrl('/reservar/studio?servicio=cut');
    http.expectOne('/api/catalog/businesses').flush([business]);
    http.expectOne('/api/catalog/businesses/studio/services').flush([service]);
    http.expectOne('/api/catalog/businesses/studio/professionals?serviceId=cut').flush([professional, second]);
    render();

    choose('Profesional', 'ana');
    const oldQuery = availability();
    choose('Profesional', 'bea');
    expect(oldQuery.cancelled).toBeTrue();
    http.expectOne(request => request.url === '/api/appointments/availability' &&
      request.params.get('professionalId') === second.id).flush({ timezone: business.timezone, slots: [slot] });
    render();
    content().querySelector<HTMLInputElement>('input[type=radio]')!.click();
    render();
    expect(content().textContent).toContain('Corte · Bea');
  });

  it('reanuda el hueco seleccionado al regresar desde el acceso', async () => {
    sessionUser.set(null);
    sessionStatus.set('anonymous');
    await startBooking();
    const signIn = content().querySelector<HTMLAnchorElement>('a[href^="/acceso"]')!;
    const router = TestBed.inject(Router);
    expect(router.parseUrl(signIn.getAttribute('href')!).queryParams['retorno']).toBe('/reservar/studio');
    await harness.navigateByUrl(signIn.getAttribute('href')!);
    sessionUser.set(user);
    sessionStatus.set('active');
    await harness.navigateByUrl('/reservar/studio');
    http.expectOne('/api/catalog/businesses').flush([business]);
    http.expectOne('/api/catalog/businesses/studio/services').flush([service]);
    render();
    http.expectOne('/api/catalog/businesses/studio/professionals?serviceId=cut').flush([professional]);
    render();
    availability().flush({ timezone: business.timezone, slots: [slot] });
    render();
    expect(content().querySelector<HTMLInputElement>('input[type=radio]')!.checked).toBeTrue();
    expect(button('Confirmar reserva').disabled).toBeFalse();
  });

  it('presenta el nombre, hora e importe histórico devueltos por Mis citas', async () => {
    await harness.navigateByUrl('/mis-citas');
    const request = http.expectOne(item => item.url === '/api/me/bookings' && !!item.params.get('from') && !!item.params.get('to'));
    const appointment = { id: 'booking', businessId: business.id, businessName: business.name, timezone: business.timezone,
      professionalId: professional.id, professionalName: professional.displayName, serviceId: service.id, serviceName: service.name,
      ...slot, priceCents: 1800, currency: 'EUR', status: 'booked' };
    request.flush({ items: [appointment], nextCursor: 'next' });
    render();
    expect(content().textContent).toContain('Estudio de prueba');
    expect(content().textContent).toContain('18,00');
    expect(content().textContent).toContain('18:00');

    button('Ver más citas').click();
    const more = http.expectOne(item => item.url === '/api/me/bookings' && item.params.get('cursor') === 'next');
    expect(more.request.params.get('from')).toBe(request.request.params.get('from'));
    more.flush({ items: [{ ...appointment, id: 'second', serviceName: 'Peinado', priceCents: 2600 }], nextCursor: null });
    render();
    expect(content().textContent).toContain('18,00');
    expect(content().textContent).toContain('26,00');
  });
});
