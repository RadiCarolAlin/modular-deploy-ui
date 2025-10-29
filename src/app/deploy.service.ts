import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../environments/environment';

type Step = { id: string; status: string };
type Platform = {
  id: string;
  deployed_apps: string[];
  created_at: string | null;
  last_modified: string | null;
  status: string;
};

@Injectable({ providedIn: 'root' })
export class DeployService {
  running = signal(false);
  progress = signal(0);
  steps = signal<Step[]>([]);
  status = signal<string>('Ready.');
  logsUrl = signal<string | null>(null);
  logs = signal<{ ts: string; line: string }[]>([]);

  // Platform state
  platform = signal<Platform | null>(null);

  private opName: string | null = null;
  private pollTimer: any = null;
  private selected: string[] = [];

  constructor(private http: HttpClient) {}

  // === LOAD PLATFORM STATE ===
  loadPlatform() {
    this.http.get<Platform>(`${environment.orchestratorUrl}/platform`).subscribe({
      next: (res) => {
        this.platform.set(res);
      },
      error: (err) => {
        console.error('Failed to load platform:', err);
        this.status.set(`Error loading platform: ${err?.error ?? err?.message}`);
      }
    });
  }

  // === DEPLOY PLATFORM (Full deployment) ===
  deployPlatform(apps: string[], branch: string) {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }

    this.selected = apps.map(a => a.toLowerCase());
    const seeded: Step[] = this.selected.map(id => ({ id, status: 'RUNNING' }));

    this.steps.set(seeded);
    this.progress.set(this.computePercent(seeded, false));
    this.status.set('Deploying platform...');
    this.logsUrl.set(null);
    this.logs.set([]);
    this.running.set(true);

    this.http.post<{ ok: boolean; operation: string; action: string }>(
        `${environment.orchestratorUrl}/platform/deploy`,
        { Apps: apps, Branch: branch }
    ).subscribe({
      next: (res) => {
        this.opName = res.operation;
        this.status.set(`Platform deployment started. Operation: ${res.operation}`);
        this.startPolling();
        // Reload platform state after starting
        setTimeout(() => this.loadPlatform(), 1000);
      },
      error: (err) => {
        this.running.set(false);
        this.status.set(`Error: ${err?.error?.error ?? err?.message ?? err}`);
      }
    });
  }

  // === ADD APPS (Incremental addition) ===
  addApps(apps: string[], branch: string) {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }

    this.selected = apps.map(a => a.toLowerCase());
    const seeded: Step[] = this.selected.map(id => ({ id, status: 'RUNNING' }));

    this.steps.set(seeded);
    this.progress.set(this.computePercent(seeded, false));
    this.status.set('Adding applications...');
    this.logsUrl.set(null);
    this.logs.set([]);
    this.running.set(true);

    this.http.post<{ ok: boolean; operation: string; action: string; added: string[] }>(
        `${environment.orchestratorUrl}/platform/add`,
        { Apps: apps, Branch: branch }
    ).subscribe({
      next: (res) => {
        this.opName = res.operation;
        this.status.set(`Adding apps: ${res.added.join(', ')}. Operation: ${res.operation}`);
        this.startPolling();
        setTimeout(() => this.loadPlatform(), 1000);
      },
      error: (err) => {
        this.running.set(false);
        this.status.set(`Error: ${err?.error?.error ?? err?.message ?? err}`);
      }
    });
  }

  // === REMOVE APPS (Incremental removal) ===
  removeApps(apps: string[], branch: string) {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }

    this.selected = apps.map(a => a.toLowerCase());
    const seeded: Step[] = this.selected.map(id => ({ id, status: 'RUNNING' }));

    this.steps.set(seeded);
    this.progress.set(this.computePercent(seeded, false));
    this.status.set('Removing applications...');
    this.logsUrl.set(null);
    this.logs.set([]);
    this.running.set(true);

    this.http.post<{ ok: boolean; operation: string; action: string; removed: string[] }>(
        `${environment.orchestratorUrl}/platform/remove`,
        { Apps: apps, Branch: branch }
    ).subscribe({
      next: (res) => {
        this.opName = res.operation;
        this.status.set(`Removing apps: ${res.removed.join(', ')}. Operation: ${res.operation}`);
        this.startPolling();
        setTimeout(() => this.loadPlatform(), 1000);
      },
      error: (err) => {
        this.running.set(false);
        this.status.set(`Error: ${err?.error?.error ?? err?.message ?? err}`);
      }
    });
  }

  // === POLLING (same as before) ===
  private startPolling() {
    const tick = () => {
      if (!this.opName) return;

      this.http.get<any>(
          `${environment.orchestratorUrl}/status`,
          { params: { operation: this.opName } }
      ).subscribe({
        next: (res) => {
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
              : (allSuccess ? 'Finalizing...' : (res?.state ?? 'WORKING'));

          this.steps.set(final);
          this.progress.set(pct);
          this.status.set(stateTxt);
          if (res?.logs) this.logsUrl.set(res.logs);

          if (Array.isArray(res?.events) && res.events.length > 0) {
            const newLogs = (res.events as string[]).map((eventLine: string) => {
              const match = eventLine.match(/^(\d{2}:\d{2}:\d{2})\s+(.+)$/);
              if (match) {
                const now = new Date();
                const [h, m, s] = match[1].split(':').map(Number);
                const ts = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, s);
                return { ts: ts.toISOString(), line: match[2] };
              } else {
                return { ts: new Date().toISOString(), line: eventLine };
              }
            });
            this.logs.set(newLogs);
          }

          if (doneFlag) {
            this.running.set(false);
            if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
            // Reload platform state when done
            this.loadPlatform();
          }
        },
        error: (err) => {
          this.status.set(`Error polling status: ${err?.error ?? err?.message ?? err}`);
        }
      });
    };

    tick();
    this.pollTimer = setInterval(tick, 300);
  }

  private isCanonical(id: string): boolean {
    const CANON = ['frontend', 'backend', 'gitea', 'confluence', 'jira', 'artifactory', 'github'];
    return CANON.includes(id);
  }

  private canonicalOrder(): string[] {
    return this.selected.length ? this.selected : ['frontend', 'backend'];
  }

  private computePercent(steps: Step[], done: boolean): number {
    const doneSet = new Set(['SUCCESS', 'DONE', 'FAILURE', 'CANCELLED', 'INTERNAL_ERROR', 'TIMEOUT']);
    const total = steps.length;
    const finished = steps.filter(s => doneSet.has((s.status ?? '').toUpperCase())).length;
    if (!total) return 0;
    const pct = Math.round((finished * 100) / total);
    return done ? 100 : Math.min(99, pct);
  }
}