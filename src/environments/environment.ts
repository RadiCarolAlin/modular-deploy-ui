// src/environments/environment.ts
export const environment = {
  production: false,
  // Orchestrator LOCAL (Kestrel ascultă la 8080):
  orchestratorUrl: 'http://34.36.238.69',
  // dacă vrei prin ngrok pentru callbacks Cloud Build,
  // lasă orchestratorUrl tot local; PROGRESS_URL îl pui în orchestrator/appsettings.
};


