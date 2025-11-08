// src/app/app.component.ts
import { Component, signal, OnInit, AfterViewChecked, computed, DoCheck } from '@angular/core';
import { NgIf, NgFor, DatePipe, TitleCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DeployService } from './deploy.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [NgIf, NgFor, DatePipe, TitleCasePipe, FormsModule],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent implements OnInit, AfterViewChecked, DoCheck {
  private _currentTab = signal('deploy');
  get currentTab() { return this._currentTab(); }
  set currentTab(value: string) {
    // SINGLE GUARD: Check if completely idle
    if (!this.isCompletelyIdle()) {
      console.warn('⚠️ Cannot switch tabs - system is busy');
      this.deploy.status.set('⚠️ Please wait until operation fully completes...');
      return;
    }

    // Reset all checkboxes when changing tabs
    if (this._currentTab() !== value) {
      console.log(`🔄 Switching from ${this._currentTab()} to ${value}`);
      this.resetAllCheckboxes();
      this._currentTab.set(value);
    }
  }

  branch = 'main';
  namespace = ''; // Platform namespace/name
  userEmail = ''; // User email for deployment
  deleteConfirmed = false; // For delete platform confirmation

  // === DEPLOY PLATFORM CHECKBOXES ===
  private _deployGitea = signal(true);
  private _deployConfluence = signal(true);
  private _deployJira = signal(false);
  private _deployArtifactory = signal(false);
  private _deployGithub = signal(false);

  deployGitea = this._deployGitea.asReadonly();
  deployConfluence = this._deployConfluence.asReadonly();
  deployJira = this._deployJira.asReadonly();
  deployArtifactory = this._deployArtifactory.asReadonly();
  deployGithub = this._deployGithub.asReadonly();

  // === ADD APPS CHECKBOXES ===
  private _addGitea = signal(false);
  private _addConfluence = signal(false);
  private _addJira = signal(false);
  private _addArtifactory = signal(false);
  private _addGithub = signal(false);

  addGitea = this._addGitea.asReadonly();
  addConfluence = this._addConfluence.asReadonly();
  addJira = this._addJira.asReadonly();
  addArtifactory = this._addArtifactory.asReadonly();
  addGithub = this._addGithub.asReadonly();

  // === REMOVE APPS CHECKBOXES ===
  private _removeGitea = signal(false);
  private _removeConfluence = signal(false);
  private _removeJira = signal(false);
  private _removeArtifactory = signal(false);
  private _removeGithub = signal(false);

  removeGitea = this._removeGitea.asReadonly();
  removeConfluence = this._removeConfluence.asReadonly();
  removeJira = this._removeJira.asReadonly();
  removeArtifactory = this._removeArtifactory.asReadonly();
  removeGithub = this._removeGithub.asReadonly();

  // === SERVICE SIGNALS ===
  running = this.deploy.running.asReadonly();
  progress = this.deploy.progress.asReadonly();
  steps = this.deploy.steps.asReadonly();
  status = this.deploy.status.asReadonly();
  logsUrl = this.deploy.logsUrl.asReadonly();
  platform = this.deploy.platform.asReadonly();
  logs = this.deploy.logs.asReadonly();

  // NEW: Track if service is completely idle (no operation AND no loading)
  isCompletelyIdle = this.deploy.isCompletelyIdle;

  // === COMPUTED: Check which apps are deployed (for disabling checkboxes) ===
  isAppDeployed = computed(() => {
    const p = this.platform();
    if (!p || !p.deployed_apps) return {
      gitea: false,
      confluence: false,
      jira: false,
      artifactory: false,
      github: false
    };

    const deployed = p.deployed_apps.map(a => a.toLowerCase());
    return {
      gitea: deployed.includes('gitea'),
      confluence: deployed.includes('confluence'),
      jira: deployed.includes('jira'),
      artifactory: deployed.includes('artifactory'),
      github: deployed.includes('github')
    };
  });

  // === COMPUTED: Memoized steps to prevent flickering ===
  private _lastStepsSnapshot: any[] = [];
  stableSteps = computed(() => {
    const current = this.steps();

    // Only update if there's an actual change in status
    const hasChanged = current.length !== this._lastStepsSnapshot.length ||
        current.some((step, idx) => {
          const old = this._lastStepsSnapshot[idx];
          return !old || old.id !== step.id || old.status !== step.status;
        });

    if (hasChanged) {
      this._lastStepsSnapshot = current.map(s => ({...s}));
    }

    return this._lastStepsSnapshot;
  });

  constructor(public deploy: DeployService) {}

  private _lastPlatformCheck = '';

  ngOnInit() {
    // Load platform state on startup
    this.deploy.loadPlatform();
    console.log('🎯 Component initialized, loading platform...');
  }

  // Debug: Log platform state changes (reduced frequency)
  ngDoCheck() {
    const platform = this.platform();
    if (platform && this._lastPlatformCheck !== JSON.stringify(platform.deployed_apps)) {
      this._lastPlatformCheck = JSON.stringify(platform.deployed_apps);
      // Only log if there's an actual change in deployed apps
      console.log('📊 Platform state changed');
      console.log('   └─ Deployed apps:', platform.deployed_apps);
      console.log('   └─ Status:', platform.status);
    }
  }

  // Auto-scroll logs to bottom when new logs arrive
  ngAfterViewChecked() {
    if (this.logs().length > 0) {
      this.scrollLogsToBottom();
    }
  }

  private scrollLogsToBottom() {
    try {
      const logsContainer = document.querySelector('.logs-container') as HTMLElement;
      if (logsContainer) {
        logsContainer.scrollTop = logsContainer.scrollHeight;
      }
    } catch (err) {
      // Ignore scroll errors
    }
  }

  // === DEPLOY PLATFORM TOGGLES ===
  onToggleDeployGitea(v: boolean) { this._deployGitea.set(v); }
  onToggleDeployConfluence(v: boolean) { this._deployConfluence.set(v); }
  onToggleDeployJira(v: boolean) { this._deployJira.set(v); }
  onToggleDeployArtifactory(v: boolean) { this._deployArtifactory.set(v); }
  onToggleDeployGithub(v: boolean) { this._deployGithub.set(v); }

  // === ADD APPS TOGGLES ===
  onToggleAddGitea(v: boolean) { this._addGitea.set(v); }
  onToggleAddConfluence(v: boolean) { this._addConfluence.set(v); }
  onToggleAddJira(v: boolean) { this._addJira.set(v); }
  onToggleAddArtifactory(v: boolean) { this._addArtifactory.set(v); }
  onToggleAddGithub(v: boolean) { this._addGithub.set(v); }

  // === REMOVE APPS TOGGLES ===
  onToggleRemoveGitea(v: boolean) { this._removeGitea.set(v); }
  onToggleRemoveConfluence(v: boolean) { this._removeConfluence.set(v); }
  onToggleRemoveJira(v: boolean) { this._removeJira.set(v); }
  onToggleRemoveArtifactory(v: boolean) { this._removeArtifactory.set(v); }
  onToggleRemoveGithub(v: boolean) { this._removeGithub.set(v); }

  // === ACTIONS ===
  runDeployPlatform() {
    // Guard: wait until completely idle
    if (!this.isCompletelyIdle()) {
      console.warn('⚠️ System is busy, please wait...');
      this.deploy.status.set('⚠️ Please wait until previous operation fully completes...');
      return;
    }

    // Validate required fields
    if (!this.namespace || this.namespace.trim() === '') {
      this.deploy.status.set('❌ Platform namespace is required');
      return;
    }

    if (!this.userEmail || this.userEmail.trim() === '') {
      this.deploy.status.set('❌ User email is required');
      return;
    }

    const apps: string[] = ['frontend', 'backend']; // Always required
    if (this._deployGitea()) apps.push('gitea');
    if (this._deployConfluence()) apps.push('confluence');
    if (this._deployJira()) apps.push('jira');
    if (this._deployArtifactory()) apps.push('artifactory');
    if (this._deployGithub()) apps.push('github');

    this.deploy.deployPlatform(apps, this.branch || 'main', this.namespace.trim(), this.userEmail.trim());
  }

  runAddApps() {
    // Guard: wait until completely idle
    if (!this.isCompletelyIdle()) {
      console.warn('⚠️ System is busy, please wait...');
      this.deploy.status.set('⚠️ Please wait until previous operation fully completes...');
      return;
    }

    const apps: string[] = [];
    if (this._addGitea()) apps.push('gitea');
    if (this._addConfluence()) apps.push('confluence');
    if (this._addJira()) apps.push('jira');
    if (this._addArtifactory()) apps.push('artifactory');
    if (this._addGithub()) apps.push('github');

    console.log('➕ ADD APPS - Selected checkboxes:', {
      gitea: this._addGitea(),
      confluence: this._addConfluence(),
      jira: this._addJira(),
      artifactory: this._addArtifactory(),
      github: this._addGithub()
    });
    console.log('➕ ADD APPS - Apps to add:', apps);
    console.log('➕ ADD APPS - Currently deployed:', this.platform()?.deployed_apps);

    if (apps.length === 0) {
      this.deploy.status.set('Please select at least one app to add');
      return;
    }

    this.deploy.addApps(apps, this.branch || 'main');
  }

  runRemoveApps() {
    // Guard: wait until completely idle
    if (!this.isCompletelyIdle()) {
      console.warn('⚠️ System is busy, please wait...');
      this.deploy.status.set('⚠️ Please wait until previous operation fully completes...');
      return;
    }

    const apps: string[] = [];
    if (this._removeGitea()) apps.push('gitea');
    if (this._removeConfluence()) apps.push('confluence');
    if (this._removeJira()) apps.push('jira');
    if (this._removeArtifactory()) apps.push('artifactory');
    if (this._removeGithub()) apps.push('github');

    console.log('🗑️ REMOVE APPS - Selected checkboxes:', {
      gitea: this._removeGitea(),
      confluence: this._removeConfluence(),
      jira: this._removeJira(),
      artifactory: this._removeArtifactory(),
      github: this._removeGithub()
    });
    console.log('🗑️ REMOVE APPS - Apps to remove:', apps);
    console.log('🗑️ REMOVE APPS - Currently deployed:', this.platform()?.deployed_apps);
    console.log('🗑️ REMOVE APPS - isAppDeployed:', this.isAppDeployed());

    if (apps.length === 0) {
      this.deploy.status.set('Please select at least one app to remove');
      return;
    }

    this.deploy.removeApps(apps, this.branch || 'main');
  }

  runDeletePlatform() {
    // Guard: wait until completely idle
    if (!this.isCompletelyIdle()) {
      console.warn('⚠️ System is busy, please wait...');
      this.deploy.status.set('⚠️ Please wait until previous operation fully completes...');
      return;
    }

    if (!this.deleteConfirmed) {
      this.deploy.status.set('Please confirm deletion by checking the checkbox');
      return;
    }

    if (!confirm('Are you ABSOLUTELY SURE you want to delete the entire platform? This cannot be undone!')) {
      return;
    }

    this.deploy.deletePlatform(this.branch || 'main');
    this.deleteConfirmed = false; // Reset confirmation
  }

  // Get icon for each app
  getAppIcon(app: string): string {
    const icons: { [key: string]: string } = {
      'frontend': '⚛️',
      'backend': '🔧',
      'gitea': '🦊',
      'confluence': '📚',
      'jira': '📋',
      'artifactory': '📦',
      'github': '🐙'
    };
    return icons[app.toLowerCase()] || '🔹';
  }

  // Get completed steps for progress bar
  getCompletedSteps() {
    return this.stableSteps().filter(st =>
        st.status === 'SUCCESS' || st.status === 'DONE'
    );
  }

  // TrackBy functions to prevent flickering
  trackByStepId(index: number, step: any): string {
    return step.id;
  }

  trackByLogTimestamp(index: number, log: any): string {
    return log.ts + log.line;
  }

  // Reset all checkboxes when switching tabs
  private resetAllCheckboxes() {
    // Reset Deploy checkboxes (keep defaults)
    this._deployGitea.set(true);
    this._deployConfluence.set(true);
    this._deployJira.set(false);
    this._deployArtifactory.set(false);
    this._deployGithub.set(false);

    // Reset Add checkboxes
    this._addGitea.set(false);
    this._addConfluence.set(false);
    this._addJira.set(false);
    this._addArtifactory.set(false);
    this._addGithub.set(false);

    // Reset Remove checkboxes
    this._removeGitea.set(false);
    this._removeConfluence.set(false);
    this._removeJira.set(false);
    this._removeArtifactory.set(false);
    this._removeGithub.set(false);

    // Reset delete confirmation
    this.deleteConfirmed = false;
  }
}