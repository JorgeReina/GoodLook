import { afterNextRender, ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject, Injector, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, finalize } from 'rxjs';
import { ProductConnection } from './install/connection.service';
import { ProductUpdate } from './install/update.service';
import { SessionService } from './session.service';
import { StatusMessage } from './shared/status-message';

@Component({
  selector: 'gl-product',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, MatButtonModule, StatusMessage],
  templateUrl: './shell.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(window:online)': 'reconnected()',
    '(window:focus)': 'updates.check()',
  },
})
export class ShellComponent {
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly main = viewChild.required<ElementRef<HTMLElement>>('main');
  protected readonly session = inject(SessionService);
  protected readonly updates = inject(ProductUpdate);
  protected readonly online = inject(ProductConnection).online;
  protected readonly endingSession = signal(false);
  protected readonly logoutError = signal(false);
  protected readonly exactLink = { exact: true };

  constructor() {
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd),
      takeUntilDestroyed(),
    ).subscribe(() => afterNextRender(() => {
      const main = this.main().nativeElement;
      (main.querySelector<HTMLElement>('h1') ?? main).focus();
    }, { injector: this.injector }));

    this.session.ensure().pipe(takeUntilDestroyed()).subscribe();
  }

  protected skipToContent() {
    this.main().nativeElement.focus();
  }

  protected reconnected() {
    void this.updates.check();
    if (this.session.status() === 'unavailable') this.retrySession();
  }

  protected retrySession() {
    this.session.ensure().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
  }

  protected logout() {
    if (this.endingSession()) return;

    this.endingSession.set(true);
    this.logoutError.set(false);
    this.session.logout().pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.endingSession.set(false)),
    ).subscribe({
      next: () => { void this.router.navigateByUrl('/', { replaceUrl: true }); },
      error: () => this.logoutError.set(true),
    });
  }
}
