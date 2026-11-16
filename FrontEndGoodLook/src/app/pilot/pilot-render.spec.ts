import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { Subject, of, throwError } from 'rxjs';
import { PilotComponent } from './pilot.component';
import { PilotApiService, PilotUser } from './pilot-api.service';

describe('Pilot asynchronous rendering', () => {
  it('enables registration and shows confirmation when the request completes', async () => {
    const registration = new Subject<PilotUser>();
    const api = { me: () => throwError(() => new Error('not signed in')), businesses: () => of([]), register: () => registration };
    await TestBed.configureTestingModule({ imports: [PilotComponent], providers: [provideZonelessChangeDetection(), { provide: PilotApiService, useValue: api }] }).compileComponents();
    const fixture = TestBed.createComponent(PilotComponent);
    await fixture.whenStable();
    const button = [...fixture.nativeElement.querySelectorAll('button')].find((element: HTMLButtonElement) => element.textContent?.includes('Crear cuenta')) as HTMLButtonElement;
    button.click();
    await fixture.whenStable();
    expect(button.disabled).toBeTrue();
    registration.next({ id:'user',email:'user@example.test',displayName:'User' });
    registration.complete();
    await Promise.resolve();
    await fixture.whenStable();
    expect(button.disabled).toBeFalse();
    expect(fixture.nativeElement.textContent).toContain('Cuenta creada. Inicia sesión para continuar.');
  });

  it('renders a signed-in user after the login request completes', async () => {
    const login = new Subject<PilotUser>();
    const api = { me: () => throwError(() => new Error('not signed in')), businesses: () => of([]), login: () => login };
    await TestBed.configureTestingModule({ imports: [PilotComponent], providers: [provideZonelessChangeDetection(), { provide: PilotApiService, useValue: api }] }).compileComponents();
    const fixture = TestBed.createComponent(PilotComponent);
    await fixture.whenStable();
    const button = [...fixture.nativeElement.querySelectorAll('button')].find((element: HTMLButtonElement) => element.textContent?.includes('Iniciar sesión')) as HTMLButtonElement;
    button.click();
    await fixture.whenStable();
    expect(button.disabled).toBeTrue();
    login.next({ id:'user',email:'user@example.test',displayName:'Cliente de prueba' });
    login.complete();
    await Promise.resolve();
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Sesión: Cliente de prueba');
    expect(fixture.nativeElement.textContent).toContain('Solicitar cita');
  });
});
