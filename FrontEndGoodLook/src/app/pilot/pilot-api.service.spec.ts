import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PilotApiService } from './pilot-api.service';

describe('PilotApiService', () => {
  let api: PilotApiService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(PilotApiService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('sends login JSON and uses same-origin cookies', () => {
    api.login('test@example.org', 'passphrase123').subscribe();
    const req = http.expectOne('/api/auth/login');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({email:'test@example.org', password:'passphrase123'});
    expect(req.request.withCredentials).toBeTrue();
    req.flush({id:'id', email:'test@example.org', displayName:'Test'});
  });
  it('registers without creating a session', () => {
    api.register('Test', 'test@example.org', 'passphrase123').subscribe();
    const req = http.expectOne('/api/auth/register');
    expect(req.request.body).toEqual({displayName:'Test', email:'test@example.org', password:'passphrase123'});
    req.flush({id:'id', email:'test@example.org', displayName:'Test'});
  });
  it('queries professionals for the given business', () => {
    api.professionals('business').subscribe();
    const req = http.expectOne('/api/professionals?businessId=business');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });
  it('creates appointments without sending a customer identity', () => {
    const appointment = {businessId:'b', professionalId:'p', serviceId:'s', startAt:'2027-01-01T10:00:00.000Z', notes:'nota'};
    api.createAppointment(appointment).subscribe();
    const req = http.expectOne('/api/appointments');
    expect(req.request.body).toEqual(appointment);
    expect(req.request.withCredentials).toBeTrue();
    req.flush({});
  });
});

describe('availability API', () => {
  let api: PilotApiService;
  let http: HttpTestingController;
  beforeEach(() => { TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] }); api = TestBed.inject(PilotApiService); http = TestBed.inject(HttpTestingController); });
  afterEach(() => http.verify());
  it('queries the selected business, professional, service and UTC range', () => {
    const input = {businessId:'b', professionalId:'p', serviceId:'s', from:'2026-07-01T10:00:00.000Z', to:'2026-07-08T10:00:00.000Z'};
    api.availability(input).subscribe();
    const request = http.expectOne(req => req.url === '/api/appointments/availability');
    for (const [key, value] of Object.entries(input)) expect(request.request.params.get(key)).toBe(value);
    request.flush({timezone:'Europe/Madrid', slots:[]});
  });
});
