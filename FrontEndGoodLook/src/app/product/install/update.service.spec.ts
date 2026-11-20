import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { SwUpdate, type VersionEvent } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { BookingDraft } from '../customer/booking-draft';
import { ProductUpdate } from './update.service';

describe('Actualización de producto', () => {
  let events: Subject<VersionEvent>;
  let reload: jasmine.Spy;
  let check: jasmine.Spy;

  beforeEach(() => {
    events = new Subject<VersionEvent>();
    reload = jasmine.createSpy('reload');
    check = jasmine.createSpy('checkForUpdate').and.resolveTo(false);
    TestBed.configureTestingModule({
      providers: [
        { provide: DOCUMENT, useValue: { location: { reload } } },
        { provide: SwUpdate, useValue: { isEnabled: true, versionUpdates: events, checkForUpdate: check } },
      ],
    });
  });

  it('avisa al recibir una versión y solo recarga tras una acción explícita', () => {
    const updates = TestBed.inject(ProductUpdate);
    updates.reload();
    expect(reload).not.toHaveBeenCalled();
    events.next({ type: 'VERSION_DETECTED', version: { hash: 'next' } });
    expect(updates.ready()).toBeFalse();
    events.next({ type: 'VERSION_READY', currentVersion: { hash: 'old' }, latestVersion: { hash: 'next' } });
    expect(updates.ready()).toBeTrue();
    expect(reload).not.toHaveBeenCalled();
    updates.reload();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('conserva la solicitud pendiente de reserva y permite volver a comprobarla', () => {
    const updates = TestBed.inject(ProductUpdate);
    const drafts = TestBed.inject(BookingDraft);
    drafts.open('business', 'service');
    drafts.update({
      attempt: {
        key: 'fixture', userId: 'test',
        body: { businessId: 'business', serviceId: 'service', professionalId: 'pro',
          startAt: '2026-11-20T12:00:00.000Z', notes: null, quote: { priceCents: 1000, currency: 'EUR', durationMinutes: 30 } },
      },
    });
    events.next({ type: 'VERSION_READY', currentVersion: { hash: 'old' }, latestVersion: { hash: 'next' } });
    expect(updates.blocked()).toBeTrue();
    updates.reload();
    expect(reload).not.toHaveBeenCalled();
    expect(drafts.value()?.attempt?.key).toBe('fixture');
    drafts.clear();
    expect(updates.blocked()).toBeFalse();
    updates.reload();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('agrupa las comprobaciones de versión mientras hay una en curso', async () => {
    const updates = TestBed.inject(ProductUpdate);
    await Promise.all([updates.check(), updates.check()]);
    expect(check).toHaveBeenCalledTimes(1);
    await updates.check();
    expect(check).toHaveBeenCalledTimes(2);
  });
});
