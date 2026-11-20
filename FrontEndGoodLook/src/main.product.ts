import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { isDevMode } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { productRoutes } from './app/product/product.routes';
import { sessionExpiryInterceptor } from './app/product/session.service';
import { ShellComponent } from './app/product/shell.component';

bootstrapApplication(ShellComponent, {
  providers: [
    provideHttpClient(withInterceptors([sessionExpiryInterceptor])),
    provideRouter(productRoutes),
    provideServiceWorker('ngsw-worker.js', { enabled: !isDevMode(), registrationStrategy: 'registerWhenStable:30000' }),
  ],
}).catch(error => console.error(error));
