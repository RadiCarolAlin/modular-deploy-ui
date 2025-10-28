# Modular Deploy UI - Frontend

Frontend Angular pentru orchestrarea deploy-urilor modular în Google Cloud Build.

## 📋 Descriere

UI interactiv pentru selectarea și deploy-ul componentelor platformei:
- ✅ Selectare modulară (Frontend, Backend, Gitea, Confluence, Jira)
- 📊 Progress bar în timp real
- 📝 Live logs din Cloud Build
- 🎯 Step-by-step status updates
- 🔗 Link direct la Cloud Build logs

---

## 🚀 Cerințe

- **Node.js 18+** și **npm 9+**
- **Angular CLI 17+**
- **Backend Orchestrator** rulând pe `http://localhost:8080` (vezi [Orchestrator.Local](https://github.com/RadiCarolAlin/Orchestrator.Local))

---

## ⚙️ Setup

### 1. Clonează repository

```bash
git clone https://github.com/RadiCarolAlin/modular-deploy-ui.git
cd modular-deploy-ui
```

### 2. Instalează dependencies

```bash
npm install
```

### 3. Configurează environment

Editează `src/environments/environment.ts`:

```typescript
export const environment = {
  production: false,
  orchestratorUrl: 'http://localhost:8080'  // URL-ul backend-ului local
};
```

---

## 🏃 Rulare Development

```bash
# Start dev server
ng serve

# Deschide browser la: http://localhost:4200
```

**Important:** Backend-ul trebuie să fie pornit pe `http://localhost:8080` pentru ca UI-ul să funcționeze!

---

## 🎮 Workflow Complet de Rulare

### Terminal 1: Backend (din Orchestrator.Local/)
```bash
cd Orchestrator.Local
dotnet run

# Backend pornește pe http://localhost:8080
```

### Terminal 2: ngrok (din Orchestrator.Local/)
```bash
ngrok http http://localhost:8080 --region=eu --host-header=rewrite

# Copiază URL-ul ngrok și actualizează appsettings.json
# Restart backend după actualizare
```

### Terminal 3: Frontend (din modular-deploy-ui/)
```bash
cd modular-deploy-ui
ng serve

# Frontend pornește pe http://localhost:4200
```

### Browser
```
Deschide: http://localhost:4200

UI Flow:
1. Selectează aplicațiile: ☑ Frontend ☑ Gitea ☑ Jira
2. Setează branch (default: main)
3. Click "Run selected"
4. Urmărește:
   - Progress bar (0-100%)
   - Steps status (RUNNING → SUCCESS)
   - Live logs în panoul de jos
```

---

## 🎨 Features

### ✅ Selectare Modulară

Selectează doar componentele pe care vrei să le deploy-ezi:

```
Branch: [main    ]

☑ Frontend  ☑ Backend  ☑ Gitea  ☐ Confluence  ☑ Jira

[Run selected]
```

### 📊 Progress în Timp Real

Progress bar animat care arată % completion bazat pe step-urile finalizate:

```
████████████████████░░░░░░░░ 65%
```

### 📝 Live Logs

Panoul de logs afișează în timp real:

```
Live logs
─────────────────────────────────
10:51:25 — [frontend] START
10:51:27 — [frontend] DONE
10:51:28 — [backend] START
10:51:30 — [backend] DONE
10:51:31 — [gitea] START
```

### 🎯 Step Status

Lista step-urilor cu status-uri color-coded:

```
• frontend — SUCCESS
• backend — SUCCESS  
• gitea — RUNNING
```

---

## 📁 Structură Proiect

```
modular-deploy-ui/
├── src/
│   ├── app/
│   │   ├── app.component.ts          # Main component
│   │   ├── app.component.html        # UI template
│   │   ├── app.component.css         # Styles
│   │   ├── app.config.ts             # App configuration
│   │   └── deploy.service.ts         # Service pentru API calls
│   ├── environments/
│   │   └── environment.ts            # Backend URL config
│   ├── index.html
│   └── main.ts
├── angular.json
├── package.json
├── tsconfig.json
└── README.md
```

---

## 🔧 Servicii

### DeployService

Service principal pentru interacțiunea cu backend-ul:

**Signals expuse:**
- `running()` - boolean - deploy în curs
- `progress()` - number (0-100) - procentaj completion
- `steps()` - Step[] - lista step-urilor cu status
- `status()` - string - mesaj status general
- `logsUrl()` - string | null - link la Cloud Build logs
- `logs()` - LogEntry[] - logurile live

**Metodă principală:**
``` typescript
run(targets: string, branch: string): void
```

---

## 🐛 Troubleshooting

### ❌ CORS Errors în browser console

**Simptom:**
```
Access to XMLHttpRequest at 'http://localhost:8080/run' from origin 'http://localhost:4200' 
has been blocked by CORS policy
```

**Cauză:** Backend nu permite requests de la portul frontend-ului.

**Soluție:** Verifică în backend (`Program.cs`) că portul 4200 e permis:

```csharp
opt.AddPolicy("ui", p => p
    .WithOrigins("http://localhost:4200", "http://127.0.0.1:4200")
    .AllowAnyHeader()
    .AllowAnyMethod());
```

---

### ❌ Backend Connection Refused

**Simptom:** Erori în browser console `ERR_CONNECTION_REFUSED`

**Cauză:** Backend nu rulează.

**Soluție:**
```bash
# Terminal 1
cd Orchestrator.Local
dotnet run

# Verifică că vezi:
# Now listening on: http://0.0.0.0:8080
```

---

### ❌ "Run selected" button nu face nimic

**Debug:**
1. Deschide browser DevTools (F12)
2. Mergi la tab-ul **Network**
3. Click "Run selected"
4. Verifică request-urile:
   - Ar trebui să vezi `POST http://localhost:8080/run`
   - Dacă request-ul e roșu → vezi **Response** pentru detalii eroare

---

### ❌ Progress bar rămâne la 0%

**Cauză:** Backend nu primește callbacks de la Cloud Build.

**Verifică:**
1. ngrok rulează și URL-ul e corect în `appsettings.json`
2. Deschide `http://127.0.0.1:4040` (ngrok dashboard)
3. După ce apesi "Run selected", ar trebui să vezi request-uri POST /progress

---

### ❌ Logs nu apar în panoul "Live logs"

**Cauză:** Vezi documentul `FIX_COMPLETE_GUIDE.md` pentru fix-ul complet.

**Quick check:** Verifică în browser DevTools → Network → `status?operation=...` că răspunsul conține `events: [...]` cu date.

---

## 💡 Tips & Tricks

### Tip 1: Hot Reload

Angular CLI are hot reload - modificările în cod se reflectă automat în browser fără refresh manual.

```bash
# Rulează cu:
ng serve

# Editează orice fișier .ts/.html/.css
# Browser-ul se va reîncărca automat ✨
```

### Tip 2: Port Custom

Dacă 4200 e deja ocupat:

```bash
ng serve --port 4300

# NU uita să actualizezi CORS în backend pentru portul nou!
```

### Tip 3: Deschide Automat Browser

```bash
ng serve --open

# Deschide automat http://localhost:4200 în browser default
```

### Tip 4: Build pentru Verificare

Înainte de commit, verifică că build-ul production funcționează:

```bash
ng build

# Output în: dist/modular-deploy-ui/
# Dacă sunt erori TypeScript, rezolvă-le înainte de commit
```

---

## 🎯 Cum Funcționează (Intern)

### 1. User Click "Run selected"

```typescript
runSelected()
{
  const selected = ['frontend', 'gitea', 'jira'];
  this.deploy.run(selected.join(','), 'main');
}
```

### 2. Service Apelează Backend

```typescript
this.http.post('/run', { Targets: 'frontend,gitea,jira', Branch: 'main' })
```

### 3. Service Start Polling

```typescript
setInterval(() => {
  this.http.get('/status?operation=...').subscribe(res => {
    this.steps.set(res.steps);
    this.progress.set(res.percent);
    this.logs.set(res.events);
  });
}, 300); // La 300ms
```

### 4. UI Se Actualizează Automat

Signals din Angular → UI reactive:

```html
<div*ngIf="running()">
  Progress: {{ progress() }}%
  
  <div*ngFor="let step of steps()">
    {{ step.id }} — {{ step.status }}
  </div>
  
  <div*ngFor="let log of deploy.logs()">
    {{ log.ts | date:'mediumTime' }} — {{ log.line }}
  </div>
</div>
```

---

## 🔐 Security Notes

- Backend-ul e fără authentication pentru simplitate în development
- În production, adaugă OAuth2/API keys
- NU expune frontend-ul public fără authentication pe backend

---

## 📝 Git Workflow

```bash
# Crează branch pentru feature
git checkout -b feature/my-feature

# Fă modificări
# ...

# Commit
git add .
git commit -m "Add my feature"

# Push
git push origin feature/my-feature

# Creează Pull Request pe GitHub
```

---

## 📄 License

MIT License

---

## 📞 Support

Pentru probleme sau întrebări, deschide un issue pe GitHub.

---

## 🚀 Next Steps

După ce funcționează local:
1. Deploy pe Firebase Hosting / Netlify / Vercel
2. Conectează la backend deployed pe Cloud Run
3. Adaugă authentication
4. Extinde cu mai multe features (history, rollback, etc.)