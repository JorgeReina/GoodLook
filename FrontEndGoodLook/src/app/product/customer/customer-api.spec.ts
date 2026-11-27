import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { CATALOG_PAGE_SIZE, CustomerApi } from './customer-api';

const studio = { id: 'studio', name: 'Estudio', timezone: 'Europe/Madrid' };
const salon = { id: 'salon', name: 'Salón', timezone: 'Europe/Madrid' };

describe('CustomerApi: catálogo de negocios', () => {
  let api: CustomerApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(CustomerApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('pide la primera página sin query y trata la ausencia de X-Has-More como final', async () => {
    const result = firstValueFrom(api.businesses());
    const request = http.expectOne('/api/catalog/businesses');
    expect(request.request.params.keys().length).toBe(0);
    request.flush([studio]);
    await expectAsync(result).toBeResolvedTo({ items: [studio], hasMore: false });
  });

  it('interpreta X-Has-More y envía page y limit en las páginas siguientes', async () => {
    const first = firstValueFrom(api.businesses());
    http.expectOne('/api/catalog/businesses').flush([studio], { headers: { 'X-Has-More': 'true' } });
    await expectAsync(first).toBeResolvedTo({ items: [studio], hasMore: true });

    const second = firstValueFrom(api.businesses(2));
    const request = http.expectOne(item => item.url === '/api/catalog/businesses');
    expect(request.request.params.get('page')).toBe('2');
    expect(request.request.params.get('limit')).toBe(String(CATALOG_PAGE_SIZE));
    request.flush([salon], { headers: { 'X-Has-More': 'FALSE' } });
    await expectAsync(second).toBeResolvedTo({ items: [salon], hasMore: false });
  });

  it('pide un negocio por id sin confundirlo con el listado', async () => {
    const result = firstValueFrom(api.business(studio.id));
    const request = http.expectOne('/api/catalog/businesses/studio');
    expect(request.request.method).toBe('GET');
    request.flush(studio);
    await expectAsync(result).toBeResolvedTo(studio);
  });
});
