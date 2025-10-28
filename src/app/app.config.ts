// src/app/app.config.ts
import { ApplicationConfig, importProvidersFrom } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { FormsModule } from '@angular/forms';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(withFetch()),
    importProvidersFrom(FormsModule),
  ]
};
