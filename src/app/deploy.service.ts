import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../environments/environment';

type Step = { id: string; status: string };

@Injectable({ providedIn: 'root' })
export class DeployService {
  running  = signal(false);
  progress = signal(0);
  steps    = signal<Step[]>([]);
  status   = signal<string>('Ready.');
  logsUrl  = signal<string | null>(null);

  // === LOGS - folosim events din /status în loc de /logs separat ===
  logs = signal<{ ts: string; line: string }[]>([]);

  private opName: string | null = null;
  private pollTimer: any = null;

  private selected: string[] = [];

  constructor(private http: HttpClient) {}

  run(targetsCsv: string, branch: string) {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }

    this.selected = targetsCsv
        .split(',')
        .map(s => s.trim().toLowerCase())
        .filter(Boolean);

    const seeded: Step[] = this.canonicalOrder().map(id => ({ id, status: 'RUNNING' }));
    this.steps.set(seeded);
    this.progress.set(this.computePercent(seeded, false));
    this.status.set('WORKING');
    this.logsUrl.set(null);
    this.logs.set([]); // curățăm logurile
    this.running.set(true);

    this.http.post<{ ok: boolean; operation: string }>(
        `${environment.orchestratorUrl}/run`,
        { Targets: targetsCsv, Branch: branch || 'main' }
    ).subscribe({
      next: (res) => {
        this.opName = res.operation;
        this.status.set(`Pornit. Operation: ${res.operation}`);
        this.startPolling();
      },
      error: (err) => {
        this.running.set(false);
        this.status.set(`Eroare start: ${err?.error ?? err?.message ?? err}`);
      }
    });
  }

  private startPolling() {
    const tick = () => {
      if (!this.opName) return;

      this.http.get<any>(
          `${environment.orchestratorUrl}/status`,
          { params: { operation: this.opName } }
      ).subscribe({
        next: (res) => {
          // === STEPS ===
          const old = this.steps();
          const map = new Map<string, Step>();
          for (const s of old) map.set(s.id.toLowerCase(), s);

          if (Array.isArray(res?.steps)) {
            for (const s of res.steps as Step[]) {
              const rawId = (s.id ?? '').toLowerCase();
              if (!rawId) continue;
              if (!this.isCanonical(rawId)) continue;
              map.set(rawId, { id: rawId, status: (s.status ?? 'UNKNOWN').toUpperCase() });
            }
          }

          const byId = new Map([...map.values()].map(s => [s.id, s]));
          const final: Step[] = this.canonicalOrder()
              .map(id => byId.get(id) ?? { id, status: 'RUNNING' })
              .filter(Boolean) as Step[];

          const doneFlag = !!res?.done;
          const pct = doneFlag ? 100 : this.computePercent(final, doneFlag);

          const allSuccess = final.length > 0 && final.every(s => (s.status ?? '').toUpperCase() === 'SUCCESS');
          const stateTxt = doneFlag
              ? 'SUCCESS (done)'
              : (allSuccess ? 'Finalizare (commit & loguri)...' : (res?.state ?? 'WORKING'));

          this.steps.set(final);
          this.progress.set(pct);
          this.status.set(stateTxt);
          if (res?.logs) this.logsUrl.set(res.logs);

          // === LOGS - folosim "events" din răspunsul /status ===
          if (Array.isArray(res?.events) && res.events.length > 0) {
            const newLogs = (res.events as string[]).map((eventLine: string) => {
              // Parsează timestamp-ul dacă e în format "HH:mm:ss  mesaj"
              const match = eventLine.match(/^(\d{2}:\d{2}:\d{2})\s+(.+)$/);
              if (match) {
                // Construiește un timestamp complet (adaugă data curentă)
                const now = new Date();
                const [h, m, s] = match[1].split(':').map(Number);
                const ts = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, s);
                return { ts: ts.toISOString(), line: match[2] };
              } else {
                return { ts: new Date().toISOString(), line: eventLine };
              }
            });

            // Setăm logurile (nu adăugăm, înlocuim - events din backend sunt deja cumulative)
            this.logs.set(newLogs);
          }

          if (doneFlag) {
            this.running.set(false);
            if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
          }
        },
        error: (err) => {
          this.status.set(`Eroare status: ${err?.error ?? err?.message ?? err}`);
        }
      });
    };

    tick();
    this.pollTimer = setInterval(tick, 300);
  }

  // === Helpers ===
  private isCanonical(id: string): boolean {
    const CANON = ['frontend', 'backend', 'gitea', 'confluence', 'jira', 'artifactory', 'github'];
    return CANON.includes(id);
  }

  private canonicalOrder(): string[] {
    return this.selected.length ? this.selected : ['frontend', 'backend'];
  }

  private computePercent(steps: Step[], done: boolean): number {
    const doneSet = new Set(['SUCCESS','DONE','FAILURE','CANCELLED','INTERNAL_ERROR','TIMEOUT']);
    const total = steps.length;
    const finished = steps.filter(s => doneSet.has((s.status ?? '').toUpperCase())).length;
    if (!total) return 0;
    const pct = Math.round((finished * 100) / total);
    return done ? 100 : Math.min(99, pct);
  }
}