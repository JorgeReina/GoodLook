import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideZoneChangeDetection } from '@angular/core';
import { PilotComponent } from './app/pilot/pilot.component';

bootstrapApplication(PilotComponent, { providers: [provideHttpClient(withXhr()), provideZoneChangeDetection()] })
  .catch(error => console.error(error));
