import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'gl-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="gl-status" [class.gl-status-error]="kind() === 'error'"
         [attr.role]="kind() === 'error' ? 'alert' : 'status'">
      <ng-content />
    </div>
  `,
})
export class StatusMessage {
  readonly kind = input<'loading' | 'empty' | 'error' | 'success'>('loading');
}
