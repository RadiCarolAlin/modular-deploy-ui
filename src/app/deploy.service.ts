import { Injectable, signal } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { environment } from "../environments/environment";
import * as signalR from "@microsoft/signalr";

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

@Injectable({ providedIn: "root" })
export class DeployService {
  running = signal(false);
  progress = signal(0);
  steps = signal<Step[]>([]);
  status = signal<string>("Ready.");
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
  private currentNamespace: string = "demo-platform";

  isLoadingPlatform = false;
  private lastPlatformLoad = 0;
  private platformLoadDebounce = 1000;

  // SignalR connection
  private hubConnection: signalR.HubConnection | null = null;

  constructor(private http: HttpClient) {
    this.initializeSignalR();
  }

  private initializeSignalR() {
    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl(`${environment.orchestratorUrl}/hub/deploy`, { withCredentials: true })
      .withAutomaticReconnect()
      .build();

    this.hubConnection
      .start()
      .then(() => console.log("✅ SignalR connected"))
      .catch((err: any) => console.error("❌ SignalR connection error:", err));

    // Listen for log updates
    this.hubConnection.on("ProgressUpdate", (data: any) => {
      if (data.allLogs && data.allLogs.length > 0) {
        const parsedLogs = data.allLogs.map((line: string, idx: number) => ({
          ts: new Date(Date.now() + idx).toISOString(),
          line,
        }));
        this.logs.set(parsedLogs);
        console.log("📡 Logs updated", parsedLogs);
        this.handleProgressUpdate(data);
      }
    });
  }

  private handleProgressUpdate(data: {
    step: string;
    status: string;
    log: string;
    allLogs?: string[];
  }) {
    // Update steps
    const current = this.steps();
    const stepExists = current.find((s) => s.id === data.step);

    let updated: Step[];
    if (stepExists) {
      updated = current.map((s) =>
        s.id === data.step ? { ...s, status: data.status } : s
      );
    } else {
      updated = [...current, { id: data.step, status: data.status }];
    }

    this.steps.set(updated);
    this.progress.set(this.computePercent(updated, false));

    if (data.allLogs && data.allLogs.length > 0) {
      const parsedLogs = data.allLogs.map((eventLine: string, idx: number) => {
        const match = eventLine.match(/^(\d{2}:\d{2}:\d{2})\s+(.+)$/);
        if (match) {
          const now = new Date();
          const [h, m, s] = match[1].split(":").map(Number);
          const ts = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            h,
            m,
            s
          );
          return { ts: ts.toISOString(), line: match[2] };
        } else {
          return {
            ts: new Date(Date.now() + idx).toISOString(),
            line: eventLine,
          };
        }
      });

      this.logs.set(parsedLogs);
    }
  }

  loadAllPlatforms() {
    this.http
      .get<Platform[]>(`${environment.orchestratorUrl}/platforms`)
      .subscribe({
        next: (platforms) => {
          this.availablePlatforms.set(platforms);
          console.log("📋 Loaded all platforms:", platforms);
        },
        error: (err) => {
          console.error("❌ Failed to load platforms:", err);
        },
      });
  }

  loadPlatform(namespace?: string) {
    const targetNamespace = namespace || this.currentNamespace;

    const now = Date.now();
    if (now - this.lastPlatformLoad < this.platformLoadDebounce) {
      console.log("⏱️ Platform load debounced (too soon)");
      return;
    }

    if (this.isLoadingPlatform) {
      console.log("⏱️ Platform load already in progress");
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

        console.log("✅ Platform loaded:", res);
      },
      error: (err) => {
        this.isLoadingPlatform = false;
        this._isCompletelyIdle.set(true);
        console.error("❌ Failed to load platform:", err);
        this.status.set(
          `Error loading platform: ${err?.error ?? err?.message}`
        );
      },
    });
  }

  deployPlatform(
    apps: string[],
    branch: string,
    namespace: string,
    userEmail: string
  ) {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.safetyTimeout) {
      clearTimeout(this.safetyTimeout);
      this.safetyTimeout = null;
    }
    this._isCompletelyIdle.set(false);

    this.currentNamespace = namespace;
    this.selected = apps.map((a) => a.toLowerCase());
    const seeded: Step[] = this.selected.map((id) => ({
      id,
      status: "RUNNING",
    }));

    this.steps.set(seeded);
    this.progress.set(this.computePercent(seeded, false));
    this.status.set("Deploying platform...");
    this.logsUrl.set(null);
    this.logs.set([]);
    this.running.set(true);

    console.log("🚀 Starting deploy with apps:", apps);
    console.log("📦 Namespace:", namespace);
    console.log("👤 User:", userEmail);

    this.http
      .post<{
        ok: boolean;
        operation: string;
        action: string;
        namespace_name: string;
      }>(`${environment.orchestratorUrl}/platform/deploy`, {
        Apps: apps,
        Branch: branch,
        Namespace: namespace,
        UserEmail: userEmail,
      })
      .subscribe({
        next: (res) => {
          this.opName = res.operation;
          console.log("✅ Deploy started. Operation ID:", res.operation);
          this.status.set(
            `Platform deployment started. Operation: ${res.operation}`
          );

          // Subscribe to SignalR updates for this operation
          this.subscribeToOperation(res.operation);

          // Start lightweight polling ONLY for "done" check (every 2 seconds)
          this.startDonePolling();
        },
        error: (err) => {
          console.error("❌ Deploy failed:", err);
          this.running.set(false);
          this._isCompletelyIdle.set(true);
          this.status.set(`Error: ${err?.error?.error ?? err?.message ?? err}`);
        },
      });
  }

  addApps(apps: string[], branch: string, namespace: string) {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.safetyTimeout) {
      clearTimeout(this.safetyTimeout);
      this.safetyTimeout = null;
    }
    this._isCompletelyIdle.set(false);

    this.currentNamespace = namespace;
    this.selected = apps.map((a) => a.toLowerCase());
    const seeded: Step[] = this.selected.map((id) => ({
      id,
      status: "RUNNING",
    }));

    this.steps.set(seeded);
    this.progress.set(this.computePercent(seeded, false));
    this.status.set("Adding applications...");
    this.logsUrl.set(null);
    this.logs.set([]);
    this.running.set(true);

    console.log("➕ Adding apps:", apps);

    this.http
      .post<{
        ok: boolean;
        operation: string;
        action: string;
        added: string[];
      }>(`${environment.orchestratorUrl}/platform/add`, {
        Apps: apps,
        Branch: branch,
        Namespace: namespace,
      })
      .subscribe({
        next: (res) => {
          this.opName = res.operation;
          console.log("✅ Add started. Operation ID:", res.operation);
          this.status.set(
            `Adding apps: ${res.added.join(", ")}. Operation: ${res.operation}`
          );

          this.subscribeToOperation(res.operation);
          this.startDonePolling();
        },
        error: (err) => {
          console.error("❌ Add failed:", err);
          this.running.set(false);
          this._isCompletelyIdle.set(true);
          this.status.set(`Error: ${err?.error?.error ?? err?.message ?? err}`);
        },
      });
  }

  removeApps(apps: string[], branch: string, namespace: string) {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.safetyTimeout) {
      clearTimeout(this.safetyTimeout);
      this.safetyTimeout = null;
    }
    this._isCompletelyIdle.set(false);

    this.currentNamespace = namespace;
    this.selected = apps.map((a) => a.toLowerCase());
    const seeded: Step[] = this.selected.map((id) => ({
      id,
      status: "RUNNING",
    }));

    this.steps.set(seeded);
    this.progress.set(this.computePercent(seeded, false));
    this.status.set("Removing applications...");
    this.logsUrl.set(null);
    this.logs.set([]);
    this.running.set(true);

    console.log("🗑️ Removing apps:", apps);

    this.http
      .post<{
        ok: boolean;
        operation: string;
        action: string;
        removed: string[];
      }>(`${environment.orchestratorUrl}/platform/remove`, {
        Apps: apps,
        Branch: branch,
        Namespace: namespace,
      })
      .subscribe({
        next: (res) => {
          this.opName = res.operation;
          console.log("✅ Remove started. Operation ID:", res.operation);
          this.status.set(
            `Removing apps: ${res.removed.join(", ")}. Operation: ${
              res.operation
            }`
          );

          this.subscribeToOperation(res.operation);
          this.startDonePolling();
        },
        error: (err) => {
          console.error("❌ Remove failed:", err);
          this.running.set(false);
          this._isCompletelyIdle.set(true);
          this.status.set(`Error: ${err?.error?.error ?? err?.message ?? err}`);
        },
      });
  }

  deletePlatform(branch: string, namespace: string) {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.safetyTimeout) {
      clearTimeout(this.safetyTimeout);
      this.safetyTimeout = null;
    }
    this._isCompletelyIdle.set(false);

    this.currentNamespace = namespace;
    const currentPlatform = this.platform();
    if (!currentPlatform || currentPlatform.deployed_apps.length === 0) {
      this.status.set("No platform to delete");
      this._isCompletelyIdle.set(true);
      return;
    }

    this.selected = currentPlatform.deployed_apps.map((a) => a.toLowerCase());
    const seeded: Step[] = this.selected.map((id) => ({
      id,
      status: "RUNNING",
    }));

    this.steps.set(seeded);
    this.progress.set(this.computePercent(seeded, false));
    this.status.set("Deleting entire platform...");
    this.logsUrl.set(null);
    this.logs.set([]);
    this.running.set(true);

    console.log("🗑️ Deleting platform with apps:", this.selected);

    this.http
      .post<{ ok: boolean; operation: string; action: string }>(
        `${environment.orchestratorUrl}/platform/delete`,
        { Branch: branch, Namespace: namespace }
      )
      .subscribe({
        next: (res) => {
          this.opName = res.operation;
          console.log("✅ Delete started. Operation ID:", res.operation);
          this.status.set(
            `Platform deletion started. Operation: ${res.operation}`
          );

          this.subscribeToOperation(res.operation);
          this.startDonePolling();
        },
        error: (err) => {
          console.error("❌ Delete failed:", err);
          this.running.set(false);
          this._isCompletelyIdle.set(true);
          this.status.set(`Error: ${err?.error?.error ?? err?.message ?? err}`);
        },
      });
  }

  private subscribeToOperation(operationId: string) {
    if (this.hubConnection?.state === signalR.HubConnectionState.Connected) {
      this.hubConnection
        .invoke("SubscribeToOperation", operationId)
        .then(() => console.log("📡 Subscribed to operation:", operationId))
        .catch((err: any) => console.error("❌ Subscribe error:", err));
    }
  }

  private unsubscribeFromOperation(operationId: string) {
    if (this.hubConnection?.state === signalR.HubConnectionState.Connected) {
      this.hubConnection
        .invoke("UnsubscribeFromOperation", operationId)
        .then(() => console.log("📡 Unsubscribed from operation:", operationId))
        .catch((err: any) => console.error("❌ Unsubscribe error:", err));
    }
  }

  private startDonePolling() {
    this.isStopping = false;

    const checkDone = () => {
      if (this.isStopping || !this.opName) return;

      this.http
        .get<any>(`${environment.orchestratorUrl}/status`, {
          params: { operation: this.opName },
        })
        .subscribe({
          next: (res) => {
            // Update logUrl if available
            if (res?.logs) this.logsUrl.set(res.logs);

            // Check if done
            if (res?.done) {
              this.isStopping = true;

              if (this.pollTimer) {
                clearInterval(this.pollTimer);
                this.pollTimer = null;
              }

              console.log("✅ Operation complete!");
              this.running.set(false);
              this.progress.set(100);
              this.status.set("SUCCESS (done)");

              // Unsubscribe from SignalR
              if (this.opName) {
                this.unsubscribeFromOperation(this.opName);
              }

              if (this.safetyTimeout) {
                clearTimeout(this.safetyTimeout);
                this.safetyTimeout = null;
              }

              console.log("⏳ Waiting 3 seconds for backend to stabilize...");
              this.safetyTimeout = setTimeout(() => {
                this.safetyTimeout = null;
                this.loadPlatform(this.currentNamespace);
                this.loadAllPlatforms();
                console.log("✅ Platform reload initiated");
              }, 3000);
            }
          },
          error: (err) => {
            console.error("❌ Done polling error:", err);
            this.status.set(
              `Error polling status: ${err?.error ?? err?.message ?? err}`
            );
            this._isCompletelyIdle.set(true);
            this.isStopping = true;
            if (this.pollTimer) {
              clearInterval(this.pollTimer);
              this.pollTimer = null;
            }
          },
        });
    };

    console.log("🔄 Starting lightweight done polling every 3 seconds");
    checkDone();
    this.pollTimer = setInterval(checkDone, 2000); // Every 2 seconds
  }

  private isCanonical(id: string): boolean {
    const CANON = [
      "frontend",
      "backend",
      "gitea",
      "confluence",
      "jira",
      "artifactory",
      "github",
    ];
    return CANON.includes(id);
  }

  private canonicalOrder(): string[] {
    return this.selected.length ? this.selected : ["frontend", "backend"];
  }

  private computePercent(steps: Step[], done: boolean): number {
    const doneSet = new Set([
      "SUCCESS",
      "DONE",
      "FAILURE",
      "CANCELLED",
      "INTERNAL_ERROR",
      "TIMEOUT",
    ]);
    const total = steps.length;
    const finished = steps.filter((s) =>
      doneSet.has((s.status ?? "").toUpperCase())
    ).length;
    if (!total) return 0;
    const pct = Math.round((finished * 100) / total);
    return done ? 100 : Math.min(99, pct);
  }
}
