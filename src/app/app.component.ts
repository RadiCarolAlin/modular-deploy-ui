// src/app/app.component.ts
import { Component, signal } from '@angular/core';
import { NgIf, NgFor, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DeployService } from './deploy.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [NgIf, NgFor, DatePipe, FormsModule],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent {
  // Branch + selecții
  branch = 'main';

  // semnale private (mutabile)
  private _fe = signal(true);
  private _be = signal(true);
  private _gitea = signal(true);
  private _conf = signal(true);
  private _jira = signal(false);
  private _artifactory = signal(false);
  private _github = signal(false);

  // expuneri readonly pt. template (apelabile cu fe(), be() etc.)
  fe = this._fe.asReadonly();
  be = this._be.asReadonly();
  gitea = this._gitea.asReadonly();
  confluence = this._conf.asReadonly();
  jira = this._jira.asReadonly();
  artifactory = this._artifactory.asReadonly();
  github = this._github.asReadonly();

  // din service (deja sunt signals)
  running  = this.deploy.running.asReadonly();
  progress = this.deploy.progress.asReadonly();
  steps    = this.deploy.steps.asReadonly();
  status   = this.deploy.status.asReadonly();
  logsUrl  = this.deploy.logsUrl.asReadonly();

  constructor(public deploy: DeployService) {}

  // toggle handlers – setează pe semnalele private
  onToggleFe(v: boolean)         { this._fe.set(v); }
  onToggleBe(v: boolean)         { this._be.set(v); }
  onToggleGitea(v: boolean)      { this._gitea.set(v); }
  onToggleConfluence(v: boolean) { this._conf.set(v); }
  onToggleJira(v: boolean)       { this._jira.set(v); }
  onToggleArtifactory(v: boolean) { this._artifactory.set(v); }
  onToggleGithub(v: boolean)     { this._github.set(v); }

  runSelected() {
    const selected: string[] = [];
    if (this._fe())         selected.push('frontend');
    if (this._be())         selected.push('backend');
    if (this._gitea())      selected.push('gitea');
    if (this._conf())       selected.push('confluence');
    if (this._jira())       selected.push('jira');
    if (this._artifactory()) selected.push('artifactory');
    if (this._github())     selected.push('github');

    this.deploy.run(selected.join(','), this.branch || 'main');
  }
}