import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { EMPTY, fromEvent, map, merge } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ProductConnection {
  private readonly window = inject(DOCUMENT).defaultView;

  readonly online = toSignal(this.window ? merge(
    fromEvent(this.window, 'online').pipe(map(() => true)),
    fromEvent(this.window, 'offline').pipe(map(() => false)),
  ) : EMPTY, { initialValue: this.window?.navigator.onLine ?? true });
}
