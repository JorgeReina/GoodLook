import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { productRoutes } from './product.routes';
import { SessionService, sessionExpiryInterceptor } from './session.service';
import { internalReturn } from './access/return-url';

const user = { id: 'person', email: 'person@example.test', displayName: 'Persona de prueba' };
const access = { businessId: 'studio', businessName: 'Estudio de prueba', timezone: 'Europe/Madrid' };

describe('Producto: sesión y espacios', () => {
  let http: HttpTestingController;
  let router: Router;
  let session: SessionService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(productRoutes),
        provideHttpClient(withInterceptors([sessionExpiryInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    session = TestBed.inject(SessionService);
  });

  afterEach(() => http.verify());

  async function restore(memberships: unknown[]) {
    const restored = firstValueFrom(session.ensure());
    http.expectOne('/api/auth/me').flush(user);
    http.expectOne('/api/me/memberships').flush(memberships);
    await restored;
  }

  it('redirecciona al visitante al acceso y guarda la ruta privada original', async () => {
    const navigation = router.navigateByUrl('/mis-citas');
    await new Promise(resolve => setTimeout(resolve, 0));
    http.expectOne('/api/auth/me').flush({}, { status: 401, statusText: 'Unauthorized' });
    await navigation;
    const url = router.parseUrl(router.url);
    expect(url.root.children['primary'].segments[0].path).toBe('acceso');
    expect(url.queryParams['retorno']).toBe('/mis-citas');
  });

  it('restaura la cookie en una entrada directa antes de abrir Mis citas', async () => {
    const navigation = router.navigateByUrl('/mis-citas');
    await new Promise(resolve => setTimeout(resolve, 0));
    http.expectOne('/api/auth/me').flush(user);
    http.expectOne('/api/me/memberships').flush([]);
    await navigation;
    expect(router.url).toBe('/mis-citas');
    await router.navigateByUrl('/gestion');
    expect(router.url).toBe('/sin-acceso');
  });

  it('permite a un profesional vinculado abrir agenda solo para su negocio y perfil', async () => {
    await restore([{ ...access, role: 'professional', professionalId: 'profile' }]);
    await router.navigateByUrl('/mi-agenda?negocio=studio&profesional=profile');
    expect(router.url).toBe('/mi-agenda?negocio=studio&profesional=profile');
    await router.navigateByUrl('/mi-agenda?negocio=other&profesional=profile');
    expect(router.url).toBe('/sin-acceso');
    await router.navigateByUrl('/mi-agenda?negocio=studio&profesional=other');
    expect(router.url).toBe('/sin-acceso');
    await router.navigateByUrl('/gestion');
    expect(router.url).toBe('/sin-acceso');
  });

  it('permite al dueño con perfil vinculado gestionar y consultar su agenda', async () => {
    await restore([{ ...access, role: 'owner', professionalId: 'profile' }]);
    await router.navigateByUrl('/gestion?negocio=studio');
    expect(router.url).toBe('/gestion?negocio=studio');
    await router.navigateByUrl('/mi-agenda');
    expect(router.url).toBe('/mi-agenda');
    await router.navigateByUrl('/gestion?negocio=other');
    expect(router.url).toBe('/sin-acceso');
  });

  it('invalida el usuario y las pertenencias cuando expira una sesión activa', async () => {
    await restore([{ ...access, role: 'owner', professionalId: 'profile' }]);
    await router.navigateByUrl('/gestion');
    const result = firstValueFrom(TestBed.inject(HttpClient).get('/api/me/bookings')).catch(() => undefined);
    http.expectOne('/api/me/bookings').flush({}, { status: 401, statusText: 'Unauthorized' });
    await result;
    expect(session.user()).toBeNull();
    expect(session.memberships()).toEqual([]);
    await router.navigateByUrl('/mis-citas');
    expect(router.url).toBe('/acceso?retorno=%2Fmis-citas');
  });

  it('acepta solo rutas internas previstas para reanudar el recorrido', () => {
    expect(internalReturn(router, '/reservar/studio?servicio=1')?.toString()).toBe('/reservar/studio?servicio=1');
    for (const value of ['//externo.test', '/\\externo.test', 'https://externo.test', '/acceso', '/api/auth/me', '/mis-citas(aux:otro)']) {
      expect(internalReturn(router, value)).toBeNull();
    }
  });
});
