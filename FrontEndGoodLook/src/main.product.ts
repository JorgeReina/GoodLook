import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { productRoutes } from './app/product/product.routes';
import { sessionExpiryInterceptor } from './app/product/session.service';
import { ShellComponent } from './app/product/shell.component';

bootstrapApplication(ShellComponent, {
  providers: [
    provideHttpClient(withInterceptors([sessionExpiryInterceptor])),
    provideRouter(productRoutes),
  ],
}).catch(error => console.error(error));
