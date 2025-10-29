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
        console.log('✅ Platform loaded:', res);
      },
      error: (err) => {
        console.error('❌ Failed to load platform:', err);
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

    console.log('🚀 Starting deploy with apps:', apps);

    this.http.post<{ ok: boolean; operation: string; action: string }>(
        `${environment.orchestratorUrl}/platform/deploy`,
        { Apps: apps, Branch: branch }
    ).subscribe({
      next: (res) => {
        this.opName = res.operation;
        console.log('✅ Deploy started. Operation ID:', res.operation);
        this.status.set(`Platform deployment started. Operation: ${res.operation}`);
        this.startPolling();
      },
      error: (err) => {
        console.error('❌ Deploy failed:', err);
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

    console.log('➕ Adding apps:', apps);

    this.http.post<{ ok: boolean; operation: string; action: string; added: string[] }>(
        `${environment.orchestratorUrl}/platform/add`,
        { Apps: apps, Branch: branch }
    ).subscribe({
      next: (res) => {
        this.opName = res.operation;
        console.log('✅ Add started. Operation ID:', res.operation);
        this.status.set(`Adding apps: ${res.added.join(', ')}. Operation: ${res.operation}`);
        this.startPolling();
        setTimeout(() => this.loadPlatform(), 1000);
      },
      error: (err) => {
        console.error('❌ Add failed:', err);
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

    console.log('🗑️ Removing apps:', apps);

    this.http.post<{ ok: boolean; operation: string; action: string; removed: string[] }>(
        `${environment.orchestratorUrl}/platform/remove`,
        { Apps: apps, Branch: branch }
    ).subscribe({
      next: (res) => {
        this.opName = res.operation;
        console.log('✅ Remove started. Operation ID:', res.operation);
        this.status.set(`Removing apps: ${res.removed.join(', ')}. Operation: ${res.operation}`);
        this.startPolling();
        setTimeout(() => this.loadPlatform(), 1000);
      },
      error: (err) => {
        console.error('❌ Remove failed:', err);
        this.running.set(false);
        this.status.set(`Error: ${err?.error?.error ?? err?.message ?? err}`);
      }
    });
  }

  // === DELETE PLATFORM (Complete deletion) ===
  deletePlatform(branch: string) {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }

    const currentPlatform = this.platform();
    if (!currentPlatform || currentPlatform.deployed_apps.length === 0) {
      this.status.set('No platform to delete');
      return;
    }

    this.selected = currentPlatform.deployed_apps.map(a => a.toLowerCase());
    const seeded: Step[] = this.selected.map(id => ({ id, status: 'RUNNING' }));

    this.steps.set(seeded);
    this.progress.set(this.computePercent(seeded, false));
    this.status.set('Deleting entire platform...');
    this.logsUrl.set(null);
    this.logs.set([]);
    this.running.set(true);

    console.log('🗑️ Deleting platform with apps:', this.selected);

    this.http.post<{ ok: boolean; operation: string; action: string }>(
        `${environment.orchestratorUrl}/platform/delete`,
        { Branch: branch }
    ).subscribe({
      next: (res) => {
        this.opName = res.operation;
        console.log('✅ Delete started. Operation ID:', res.operation);
        this.status.set(`Platform deletion started. Operation: ${res.operation}`);
        this.startPolling();
        setTimeout(() => this.loadPlatform(), 1000);
      },
      error: (err) => {
        console.error('❌ Delete failed:', err);
        this.running.set(false);
        this.status.set(`Error: ${err?.error?.error ?? err?.message ?? err}`);
      }
    });
  }

  // === POLLING ===
  private startPolling() {
    let pollCount = 0;

    const tick = () => {
      if (!this.opName) {
        console.warn('⚠️ No operation name, stopping poll');
        return;
      }

      pollCount++;

      this.http.get<any>(
          `${environment.orchestratorUrl}/status`,
          { params: { operation: this.opName } }
      ).subscribe({
        next: (res) => {
          if (pollCount === 1) {
            console.log('📊 First poll response:', res);
          }

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

          // === IMPROVED LOGS PARSING ===
          if (Array.isArray(res?.events) && res.events.length > 0) {
            console.log(`📝 Received ${res.events.length} log events`);

            const newLogs = (res.events as string[]).map((eventLine: string, idx: number) => {
              // Try to parse timestamp from log line
              const match = eventLine.match(/^(\d{2}:\d{2}:\d{2})\s+(.+)$/);

              if (match) {
                const now = new Date();
                const [h, m, s] = match[1].split(':').map(Number);
                const ts = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, s);
                return { ts: ts.toISOString(), line: match[2] };
              } else {
                // If no timestamp in line, use current time with incrementing milliseconds
                const ts = new Date(Date.now() + idx);
                return { ts: ts.toISOString(), line: eventLine };
              }
            });

            this.logs.set(newLogs);

            if (pollCount <= 3) {
              console.log('📝 Sample logs:', newLogs.slice(0, 3));
            }
          } else {
            if (pollCount === 1) {
              console.log('⚠️ No events in response');
            }
          }

          if (doneFlag) {
            console.log('✅ Operation complete after', pollCount, 'polls');
            this.running.set(false);
            if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
            this.loadPlatform();
          }
        },
        error: (err) => {
          console.error('❌ Polling error:', err);
          this.status.set(`Error polling status: ${err?.error ?? err?.message ?? err}`);
        }
      });
    };

    console.log('🔄 Starting polling every 300ms');
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