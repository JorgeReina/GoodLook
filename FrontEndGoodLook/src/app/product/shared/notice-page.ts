import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { internalReturn } from '../access/return-url';

@Component({
  imports: [RouterLink, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="gl-panel">
      <h1 tabindex="-1">{{ heading }}</h1>
      <p class="gl-lede">{{ message }}</p>
      <div class="gl-actions">
        @if (retryUrl) {
          <a matButton="filled" [routerLink]="retryUrl">Volver a intentar</a>
        }
        <a matButton="outlined" routerLink="/">Volver al catálogo</a>
      </div>
    </div>
  `,
})
export class NoticePage {
  private readonly snapshot = inject(ActivatedRoute).snapshot;
  protected readonly heading = this.snapshot.data['heading'] as string;
  protected readonly message = this.snapshot.data['message'] as string;
  protected readonly retryUrl = this.snapshot.data['retry']
    ? internalReturn(inject(Router), this.snapshot.queryParams['retorno'])
    : null;
}
