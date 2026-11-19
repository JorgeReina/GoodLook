import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { productRoutes } from './product.routes';
import { ShellComponent } from './shell.component';

describe('Carcasa GoodLook', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter(productRoutes), provideHttpClient(), provideHttpClientTesting()],
    });
  });

  it('muestra los espacios de un dueño con perfil, enfoca la nueva página y borra el menú al salir', async () => {
    const fixture = TestBed.createComponent(ShellComponent);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne('/api/auth/me').flush({ id: 'person', email: 'person@example.test', displayName: 'Persona de prueba' });
    http.expectOne('/api/me/memberships').flush([
      { businessId: 'studio', businessName: 'Estudio', timezone: 'Europe/Madrid', role: 'owner', professionalId: 'profile' },
    ]);
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/gestion');
    fixture.detectChanges();
    await fixture.whenStable();

    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelector('main h1')).toBe(document.activeElement);
    expect(host.querySelector('nav a[href="/gestion"]')?.getAttribute('aria-current')).toBe('page');
    expect(host.querySelector('nav a[href="/mi-agenda"]')).not.toBeNull();
    expect(host.querySelector('nav a[href="/mis-citas"]')).not.toBeNull();

    const logout = Array.from(host.querySelectorAll('button')).find(button => button.textContent?.trim() === 'Cerrar sesión');
    logout?.click();
    http.expectOne({ url: '/api/auth/logout', method: 'POST' }).flush(null);
    await fixture.whenStable();
    fixture.detectChanges();
    http.expectOne('/api/businesses').flush([]);
    expect(router.url).toBe('/');
    expect(host.querySelector('nav a[href="/gestion"]')).toBeNull();
    expect(host.querySelector('nav a[href="/mi-agenda"]')).toBeNull();
    expect(host.querySelector('nav a[href="/acceso"]')).not.toBeNull();
    http.verify();
  });

  it('crea la cuenta, abre la sesión y recupera el destino privado solicitado', async () => {
    const fixture = TestBed.createComponent(ShellComponent);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne('/api/auth/me').flush(null, { status: 401, statusText: 'Unauthorized' });
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/acceso?modo=registro&retorno=%2Fmis-citas');
    fixture.detectChanges();

    const host: HTMLElement = fixture.nativeElement;
    const setField = (selector: string, value: string) => {
      const input = host.querySelector<HTMLInputElement>(selector)!;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    setField('input[autocomplete="name"]', 'Persona de prueba');
    setField('input[type="email"]', 'person@example.test');
    setField('input[type="password"]', 'prueba-local-123');
    host.querySelector('form')!.requestSubmit();

    const registered = { id: 'person', email: 'person@example.test', displayName: 'Persona de prueba' };
    const register = http.expectOne({ method: 'POST', url: '/api/auth/register' });
    expect(register.request.body).toEqual({
      displayName: 'Persona de prueba', email: 'person@example.test', password: 'prueba-local-123',
    });
    register.flush(registered, { status: 201, statusText: 'Created' });
    http.expectOne({ method: 'POST', url: '/api/auth/login' }).flush(registered);
    http.expectOne('/api/me/memberships').flush([]);

    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(router.url).toBe('/mis-citas');
    expect(host.querySelector('nav a[href="/mis-citas"]')?.getAttribute('aria-current')).toBe('page');
    expect(host.querySelector('nav a[href="/gestion"]')).toBeNull();
    http.verify();
  });
});
