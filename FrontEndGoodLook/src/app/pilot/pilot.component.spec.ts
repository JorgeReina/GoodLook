import { Subject, of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { PilotComponent } from './pilot.component';
import { PilotApiService, type PilotAvailability } from './pilot-api.service';

describe('Pilot availability', () => {
  let api: jasmine.SpyObj<PilotApiService>;
  let component: PilotComponent;
  beforeEach(() => {
    api = jasmine.createSpyObj<PilotApiService>('PilotApiService', ['availability','createAppointment']);
    component = new PilotComponent(api);
    component.businessId = 'business'; component.professionalId = 'professional'; component.serviceId = 'service';
    component.user = {id:'user',email:'user@example.test',displayName:'User'};
  });
  it('ignores stale responses after a different professional is selected', async () => {
    const oldRequest = new Subject<PilotAvailability>();
    const newRequest = new Subject<PilotAvailability>();
    api.availability.and.returnValues(oldRequest, newRequest);
    const first = component.loadAvailability();
    component.professionalId = 'new-professional';
    const second = component.loadAvailability();
    newRequest.next({timezone:'UTC',slots:[{startAt:'2030-01-01T12:00:00.000Z',endAt:'2030-01-01T12:30:00.000Z'}]}); newRequest.complete();
    await second;
    oldRequest.next({timezone:'UTC',slots:[]}); oldRequest.complete();
    await first;
    expect(component.availability?.slots.length).toBe(1);
    expect(component.loadingAvailability).toBeFalse();
  });
  it('only books a returned future slot and invalidates it after conflict', async () => {
    const startAt = new Date(Date.now() + 3600000).toISOString();
    component.availability = {timezone:'UTC', slots:[{startAt,endAt:new Date(Date.now()+5400000).toISOString()}]};
    component.selectedSlot = startAt;
    api.createAppointment.and.returnValue(throwError(() => new HttpErrorResponse({status:409})));
    await component.reserve();
    expect(api.createAppointment).toHaveBeenCalled();
    expect(component.availability).toBeNull();
    expect(component.error).toContain('ocuparse');
  });
  it('does not submit an invented slot', async () => {
    component.selectedSlot = new Date(Date.now() + 3600000).toISOString();
    component.availability = {timezone:'UTC',slots:[]};
    await component.reserve();
    expect(api.createAppointment).not.toHaveBeenCalled();
  });
});
