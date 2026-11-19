import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { ActivatedRoute, RouterLink } from '@angular/router';

@Component({
  imports: [RouterLink, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="gl-panel">
      <h1 tabindex="-1">{{ heading }}</h1>
      <p class="gl-lede">Este espacio estará disponible en una próxima entrega.</p>
      <a matButton="outlined" routerLink="/">Volver al catálogo</a>
    </div>
  `,
})
export class PendingPage {
  protected readonly heading = inject(ActivatedRoute).snapshot.data['heading'] as string;
}
