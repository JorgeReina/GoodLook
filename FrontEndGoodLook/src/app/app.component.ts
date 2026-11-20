import { Component, ChangeDetectionStrategy } from '@angular/core';
import { Router } from '@angular/router';

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class AppComponent {
  title = 'FrontEndGoodLook';
  constructor(public readonly router: Router) {}
  get pilotActive(): boolean { return this.router.parseUrl(this.router.url).root.children['primary']?.segments[0]?.path === 'piloto'; }
}
