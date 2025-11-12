import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../environments/environment';

type Step = { id: string; status: string };
type Platform = {
  id: string;
  namespace_name: string;
  deployed_apps: string[];
  user_email: string;
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

  platform = signal<Platform | null>(null);
  availablePlatforms = signal<Platform[]>([]);

  private _isCompletelyIdle = signal(true);
  isCompletelyIdle = this._isCompletelyIdle.asReadonly();

  private opName: string | null = null;
  private pollTimer: any = null;
  private selected: string[] = [];
  private isStopping = false;
  private safetyTimeout: any = null;
  private currentNamespace: string = 'demo-platform';

  isLoadingPlatform = false;
  private lastPlatformLoad = 0;
  private platformLoadDebounce = 1000;

  constructor(private http: HttpClient) {}

  loadAllPlatforms() {
    this.http.get<Platform[]>(`${environment.orchestratorUrl}/platforms`).subscribe({
      next: (platforms) => {
        this.availablePlatforms.set(platforms);
        console.log('📋 Loaded all platforms:', platforms);
      },
      error: (err) => {
        console.error('❌ Failed to load platforms:', err);
      }
    });
  }

  loadPlatform(namespace?: string) {
    const targetNamespace = namespace || this.currentNamespace;

    const now = Date.now();
    if (now - this.lastPlatformLoad < this.platformLoadDebounce) {
      console.log('⏱️ Platform load debounced (too soon)');
      return;
    }

    if (this.isLoadingPlatform) {
      console.log('⏱️ Platform load already in progress');
      return;
    }

    this.isLoadingPlatform = true;
    this.lastPlatformLoad = now;
    this._isCompletelyIdle.set(false);

    const url = namespace
        ? `${environment.orchestratorUrl}/platform/${namespace}`
        : `${environment.orchestratorUrl}/platform`;

    this.http.get<Platform>(url).subscribe({
      next: (res) => {
        this.platform.set(res);
        this.currentNamespace = res.namespace_name || res.id;
        this.isLoadingPlatform = false;

        if (!this.running()) {
          this._isCompletelyIdle.set(true);
        }

        console.log('✅ Platform loaded:', res);
      },
      error: (err) => {
        this.isLoadingPlatform = false;
        this._isCompletelyIdle.set(true);
        console.error('❌ Failed to load platform:', err);
        this.status.set(`Error loading platform: ${err?.error ?? err?.message}`);
      }
    });
  }

  deployPlatform(apps: string[], branch: string, namespace: string, userEmail: string) {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
    if (this.safetyTimeout) { clearTimeout(this.safetyTimeout); this.safetyTimeout = null; }
    this._isCompletelyIdle.set(false);

    this.currentNamespace = namespace;
    this.selected = apps.map(a => a.toLowerCase());
    const seeded: Step[] = this.selected.map(id => ({ id, status: 'RUNNING' }));

    this.steps.set(seeded);
    this.progress.set(this.computePercent(seeded, false));
    this.status.set('Deploying platform...');
    this.logsUrl.set(null);
    this.logs.set([]);
    this.running.set(true);

    console.log('🚀 Starting deploy with apps:', apps);
    console.log('📦 Namespace:', namespace);
    console.log('👤 User:', userEmail);

    this.http.post<{ ok: boolean; operation: string; action: string; namespace_name: string }>(
        `${environment.orchestratorUrl}/platform/deploy`,
        { Apps: apps, Branch: branch, Namespace: namespace, UserEmail: userEmail }
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
        this._isCompletelyIdle.set(true);
        this.status.set(`Error: ${err?.error?.error ?? err?.message ?? err}`);
      }
    });
  }

  addApps(apps: string[], branch: string, namespace: string) {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
    if (this.safetyTimeout) { clearTimeout(this.safetyTimeout); this.safetyTimeout = null; }
    this._isCompletelyIdle.set(false);

    this.currentNamespace = namespace;
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
        { Apps: apps, Branch: branch, Namespace: namespace }
    ).subscribe({
      next: (res) => {
        this.opName = res.operation;
        console.log('✅ Add started. Operation ID:', res.operation);
        this.status.set(`Adding apps: ${res.added.join(', ')}. Operation: ${res.operation}`);
        this.startPolling();
      },
      error: (err) => {
        console.error('❌ Add failed:', err);
        this.running.set(false);
        this._isCompletelyIdle.set(true);
        this.status.set(`Error: ${err?.error?.error ?? err?.message ?? err}`);
      }
    });
  }

  removeApps(apps: string[], branch: string, namespace: string) {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
    if (this.safetyTimeout) { clearTimeout(this.safetyTimeout); this.safetyTimeout = null; }
    this._isCompletelyIdle.set(false);

    this.currentNamespace = namespace;
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
        { Apps: apps, Branch: branch, Namespace: namespace }
    ).subscribe({
      next: (res) => {
        this.opName = res.operation;
        console.log('✅ Remove started. Operation ID:', res.operation);
        this.status.set(`Removing apps: ${res.removed.join(', ')}. Operation: ${res.operation}`);
        this.startPolling();
      },
      error: (err) => {
        console.error('❌ Remove failed:', err);
        this.running.set(false);
        this._isCompletelyIdle.set(true);
        this.status.set(`Error: ${err?.error?.error ?? err?.message ?? err}`);
      }
    });
  }

  deletePlatform(branch: string, namespace: string) {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
    if (this.safetyTimeout) { clearTimeout(this.safetyTimeout); this.safetyTimeout = null; }
    this._isCompletelyIdle.set(false);

    this.currentNamespace = namespace;
    const currentPlatform = this.platform();
    if (!currentPlatform || currentPlatform.deployed_apps.length === 0) {
      this.status.set('No platform to delete');
      this._isCompletelyIdle.set(true);
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
        { Branch: branch, Namespace: namespace }
    ).subscribe({
      next: (res) => {
        this.opName = res.operation;
        console.log('✅ Delete started. Operation ID:', res.operation);
        this.status.set(`Platform deletion started. Operation: ${res.operation}`);
        this.startPolling();
      },
      error: (err) => {
        console.error('❌ Delete failed:', err);
        this.running.set(false);
        this._isCompletelyIdle.set(true);
        this.status.set(`Error: ${err?.error?.error ?? err?.message ?? err}`);
      }
    });
  }

  private startPolling() {
    let pollCount = 0;
    let completedPollId: number | null = null;
    this.isStopping = false;
    this._isCompletelyIdle.set(false);

    const tick = () => {
      if (this.isStopping) return;
      if (!this.opName) {
        console.warn('⚠️ No operation name, stopping poll');
        return;
      }

      pollCount++;
      const thisPollId = pollCount;

      this.http.get<any>(
          `${environment.orchestratorUrl}/status`,
          { params: { operation: this.opName } }
      ).subscribe({
        next: (res) => {
          if (completedPollId !== null) return;

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

          if (Array.isArray(res?.events) && res.events.length > 0) {
            const newLogs = (res.events as string[]).map((eventLine: string, idx: number) => {
              const match = eventLine.match(/^(\d{2}:\d{2}:\d{2})\s+(.+)$/);
              if (match) {
                const now = new Date();
                const [h, m, s] = match[1].split(':').map(Number);
                const ts = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, s);
                return { ts: ts.toISOString(), line: match[2] };
              } else {
                const ts = new Date(Date.now() + idx);
                return { ts: ts.toISOString(), line: eventLine };
              }
            });
            this.logs.set(newLogs);
          }

          if (doneFlag) {
            completedPollId = thisPollId;
            this.isStopping = true;

            if (this.pollTimer) {
              clearInterval(this.pollTimer);
              this.pollTimer = null;
            }

            console.log('✅ Operation complete after', thisPollId, 'polls');
            this.running.set(false);

            if (this.safetyTimeout) {
              clearTimeout(this.safetyTimeout);
              this.safetyTimeout = null;
            }

            console.log('⏳ Waiting 3 seconds for backend to stabilize...');
            this.safetyTimeout = setTimeout(() => {
              this.safetyTimeout = null;
              this.loadPlatform(this.currentNamespace);
              this.loadAllPlatforms();
              console.log('✅ Platform reload initiated');
            }, 3000);
          }
        },
        error: (err) => {
          console.error('❌ Polling error:', err);
          this.status.set(`Error polling status: ${err?.error ?? err?.message ?? err}`);
          this._isCompletelyIdle.set(true);
          this.isStopping = true;
          if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
          }
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