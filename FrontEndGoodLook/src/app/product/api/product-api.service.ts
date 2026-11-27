import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { Credentials, Membership, Registration, SessionUser } from './contracts';

@Injectable({ providedIn: 'root' })
export class ProductApiService {
  private readonly http = inject(HttpClient);

  me() {
    return this.http.get<SessionUser>('/api/auth/me');
  }

  memberships() {
    return this.http.get<Membership[]>('/api/me/memberships');
  }

  login({ email, password }: Credentials) {
    return this.http.post<SessionUser>('/api/auth/login', { email, password });
  }

  register(registration: Registration) {
    return this.http.post<SessionUser>('/api/auth/register', registration);
  }

  logout() {
    return this.http.post<void>('/api/auth/logout', {});
  }
}
