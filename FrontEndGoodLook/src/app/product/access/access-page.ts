import { HttpErrorResponse } from '@angular/common/http';
import { afterNextRender, ChangeDetectionStrategy, Component, ElementRef, inject, Injector, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom, switchMap } from 'rxjs';
import { SessionService } from '../session.service';
import { StatusMessage } from '../shared/status-message';
import { internalReturn } from './return-url';

@Component({
  imports: [ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, RouterLink, StatusMessage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './access-page.html',
})
export class AccessPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly session = inject(SessionService);
  protected readonly isRegistration = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly created = signal(false);
  protected readonly form = inject(FormBuilder).nonNullable.group({
    displayName: ['', [Validators.maxLength(120), Validators.pattern(/.*\S.*/)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    password: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(128)]],
  });

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe(params => {
      this.isRegistration.set(params.get('modo') === 'registro');
      this.form.controls.displayName.setValidators(this.isRegistration()
        ? [Validators.required, Validators.maxLength(120), Validators.pattern(/.*\S.*/)]
        : null);
      this.form.controls.displayName.updateValueAndValidity();
      this.form.controls.password.reset();
      this.error.set('');
    });
  }

  protected async submit() {
    if (this.busy()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('input.ng-invalid')?.focus(), {
        injector: this.injector,
      });
      return;
    }

    const registration = this.isRegistration();
    const { displayName, email, password } = this.form.getRawValue();
    const credentials = { email: email.trim(), password };
    this.error.set('');
    this.created.set(false);
    this.busy.set(true);

    try {
      const login = () => this.session.login(credentials);
      const state = await firstValueFrom(registration
        ? this.session.register({ displayName: displayName.trim(), ...credentials }).pipe(switchMap(() => {
            this.created.set(true);
            return login();
          }))
        : login());

      if (state.status === 'active') {
        await this.resume();
      } else if (state.status === 'unavailable') {
        this.error.set('No pudimos comprobar la sesión. Vuelve a intentarlo.');
      } else {
        this.error.set('No se pudo abrir la sesión. Comprueba que tu navegador admite las cookies de GoodLook.');
      }
    } catch (error) {
      this.error.set(this.messageFor(error));
    } finally {
      this.busy.set(false);
      this.form.controls.password.reset();
    }

    if (this.created() && this.error()) {
      const message = this.error();
      await this.router.navigate([], { relativeTo: this.route, queryParams: { modo: null }, queryParamsHandling: 'merge', replaceUrl: true });
      this.error.set(message);
    }
  }

  protected resume() {
    const url = internalReturn(this.router, this.route.snapshot.queryParams['retorno']);
    return this.router.navigateByUrl(url ?? '/', { replaceUrl: true });
  }

  private messageFor(error: unknown): string {
    const status = error instanceof HttpErrorResponse ? error.status : 0;
    switch (status) {
      case 400: return 'Revisa el correo, la contraseña y los datos del formulario.';
      case 401: return 'El correo o la contraseña no son correctos.';
      case 409: return 'Ya existe una cuenta con ese correo. Prueba a iniciar sesión.';
      case 429: return 'Se han hecho demasiados intentos. Espera unos minutos.';
      default: return 'No se pudo completar la solicitud. Comprueba la conexión y vuelve a intentarlo.';
    }
  }
}
