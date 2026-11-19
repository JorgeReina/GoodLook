import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, finalize, map, Observable, of, shareReplay, switchMap, tap, throwError } from 'rxjs';
import type { Credentials, Membership, Registration, SessionUser } from './api/contracts';
import { ProductApiService } from './api/product-api.service';

type SessionState =
  | { status: 'unchecked' | 'checking' | 'anonymous' | 'unavailable' }
  | { status: 'active'; user: SessionUser; memberships: readonly Membership[] };

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly api = inject(ProductApiService);
  private readonly state = signal<SessionState>({ status: 'unchecked' });
  private pending?: Observable<SessionState>;

  readonly status = computed(() => this.state().status);
  readonly user = computed(() => {
    const state = this.state();
    return state.status === 'active' ? state.user : null;
  });
  readonly memberships = computed(() => {
    const state = this.state();
    return state.status === 'active' ? state.memberships : [];
  });
  readonly agendaMemberships = computed(() => this.memberships().filter(({ professionalId }) => professionalId !== null));
  readonly managementMemberships = computed(() => this.memberships().filter(({ role }) => role === 'owner' || role === 'admin'));

  ensure(): Observable<SessionState> {
    if (this.pending) return this.pending;
    const state = this.state();
    if (state.status === 'active' || state.status === 'anonymous') return of(state);

    return this.load(this.api.me());
  }

  login(credentials: Credentials): Observable<SessionState> {
    return this.api.login(credentials).pipe(switchMap(user => this.load(of(user))));
  }

  register(registration: Registration) {
    return this.api.register(registration);
  }

  logout() {
    return this.api.logout().pipe(tap(() => this.expire()));
  }

  refresh(): Observable<SessionState> {
    return this.load(this.api.me());
  }

  expire() {
    this.pending = undefined;
    this.state.set({ status: 'anonymous' });
  }

  private load(user$: Observable<SessionUser>): Observable<SessionState> {
    const checking: SessionState = { status: 'checking' };
    this.state.set(checking);
    const request = user$.pipe(
      switchMap(user => this.api.memberships().pipe(
        map((memberships): SessionState => ({ status: 'active', user, memberships })),
      )),
      catchError((error: unknown) => of<SessionState>({
        status: error instanceof HttpErrorResponse && error.status === 401 ? 'anonymous' : 'unavailable',
      })),
      map(result => {
        if (this.state() === checking) this.state.set(result);
        return this.state();
      }),
      finalize(() => {
        if (this.pending === request) this.pending = undefined;
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    this.pending = request;
    return request;
  }
}

export const sessionExpiryInterceptor: HttpInterceptorFn = (request, next) => {
  if (!request.url.startsWith('/api/') || request.url.startsWith('/api/auth/')) return next(request);

  const session = inject(SessionService);
  const membershipSnapshot = session.memberships();
  const hadSession = session.status() === 'active';
  const router = inject(Router);
  return next(request).pipe(catchError((error: unknown) => {
    // Ignore responses from requests made before a login, logout or previous expiry.
    if (hadSession && session.status() === 'active' && session.memberships() === membershipSnapshot &&
        error instanceof HttpErrorResponse && error.status === 401) {
      session.expire();
      let route = router.routerState.snapshot.root;
      while (route.firstChild) route = route.firstChild;
      if (route.data['space']) {
        void router.navigate(['/acceso'], { queryParams: { retorno: router.url }, replaceUrl: true });
      }
    }
    return throwError(() => error);
  }));
};
