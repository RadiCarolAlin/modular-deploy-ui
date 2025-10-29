// src/app/app.component.ts
import { Component, signal, OnInit } from '@angular/core';
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
export class AppComponent implements OnInit {
  currentTab = 'deploy'; // deploy | add | remove | delete
  branch = 'main';
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

  constructor(public deploy: DeployService) {}

  ngOnInit() {
    // Load platform state on startup
    this.deploy.loadPlatform();
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
    const apps: string[] = ['frontend', 'backend']; // Always required
    if (this._deployGitea()) apps.push('gitea');
    if (this._deployConfluence()) apps.push('confluence');
    if (this._deployJira()) apps.push('jira');
    if (this._deployArtifactory()) apps.push('artifactory');
    if (this._deployGithub()) apps.push('github');

    this.deploy.deployPlatform(apps, this.branch || 'main');
  }

  runAddApps() {
    const apps: string[] = [];
    if (this._addGitea()) apps.push('gitea');
    if (this._addConfluence()) apps.push('confluence');
    if (this._addJira()) apps.push('jira');
    if (this._addArtifactory()) apps.push('artifactory');
    if (this._addGithub()) apps.push('github');

    if (apps.length === 0) {
      this.deploy.status.set('Please select at least one app to add');
      return;
    }

    this.deploy.addApps(apps, this.branch || 'main');
  }

  runRemoveApps() {
    const apps: string[] = [];
    if (this._removeGitea()) apps.push('gitea');
    if (this._removeConfluence()) apps.push('confluence');
    if (this._removeJira()) apps.push('jira');
    if (this._removeArtifactory()) apps.push('artifactory');
    if (this._removeGithub()) apps.push('github');

    if (apps.length === 0) {
      this.deploy.status.set('Please select at least one app to remove');
      return;
    }

    this.deploy.removeApps(apps, this.branch || 'main');
  }

  runDeletePlatform() {
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
}