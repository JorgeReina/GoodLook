import { Location } from '@angular/common';
import { Component, Injectable, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { SessionService } from '../session.service';
import { StatusMessage } from '../shared/status-message';
import { ManagementApi } from './management-api';

@Injectable({ providedIn: 'root' })
class InvitationSession {
  readonly token = signal('');
}

@Component({
  imports: [RouterLink, StatusMessage],
  template: `
    <h1 tabindex="-1">Invitación</h1>
    <section class="gl-work-panel">
      @if (accepted()) {
        <gl-status>Tu perfil profesional está vinculado.</gl-status>
        <a routerLink="/mi-agenda">Abrir mi agenda</a>
      } @else if (!validLink()) {
        <gl-status kind="error">El enlace de invitación está incompleto.</gl-status>
      } @else if (session.status() === 'checking' || session.status() === 'unchecked') {
        <gl-status>Comprobando sesión…</gl-status>
      } @else if (session.status() === 'unavailable') {
        <gl-status kind="error">No se pudo comprobar la sesión.</gl-status>
        <button type="button" (click)="checkSession()">Volver a intentar</button>
      } @else if (!session.user()) {
        <p>Identifícate para vincular tu cuenta con el perfil profesional.</p>
        <a routerLink="/acceso" [queryParams]="{ retorno: '/invitacion' }">Iniciar sesión</a>
      } @else {
        @if (error()) { <gl-status kind="error">{{ error() }}</gl-status> }
        <p>Vas a vincular la invitación a la cuenta de {{ session.user()?.displayName }}.</p>
        <button type="button" (click)="accept()" [disabled]="busy()">Aceptar invitación</button>
      }
    </section>
  `,
})
export class InvitationPage {
  private readonly invitation = inject(InvitationSession);
  private readonly api = inject(ManagementApi);
  protected readonly session = inject(SessionService);
  protected readonly validLink = computed(() => /^[a-f0-9]{64}$/i.test(this.invitation.token()));
  protected readonly busy = signal(false);
  protected readonly accepted = signal(false);
  protected readonly error = signal('');

  constructor() {
    const fragment = inject(ActivatedRoute).snapshot.fragment;
    if (fragment !== null) {
      const value = new URLSearchParams(fragment).get('token') ?? '';
      this.invitation.token.set(/^[a-f0-9]{64}$/i.test(value) ? value : '');
      inject(Location).replaceState('/invitacion');
    }
    this.checkSession();
  }

  protected checkSession() { void firstValueFrom(this.session.ensure()); }

  protected async accept() {
    if (!this.validLink() || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await firstValueFrom(this.api.accept(this.invitation.token()));
      this.invitation.token.set('');
      this.accepted.set(true);
      await firstValueFrom(this.session.refresh());
    } catch {
      this.error.set('No se pudo aceptar la invitación. Comprueba que aún esté vigente o solicita otro enlace.');
    } finally { this.busy.set(false); }
  }
}
