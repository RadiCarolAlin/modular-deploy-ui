// src/environments/environment.ts
export const environment = {
  production: false,
  // Orchestrator LOCAL (Kestrel ascultă la 8080):
  orchestratorUrl: 'http://localhost:8080',
  // dacă vrei prin ngrok pentru callbacks Cloud Build,
  // lasă orchestratorUrl tot local; PROGRESS_URL îl pui în orchestrator/appsettings.
};


