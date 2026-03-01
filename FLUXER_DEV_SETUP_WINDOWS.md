# Fluxer Fork — Windows 11 Dev Setup & PM Integration Guide

> **Current date:** February 2026. This guide targets the `refactor` branch (the active branch).  
> Fluxer's devcontainer support landed just days ago (PR #480), making it the **fastest path on Windows**.

---

## 1. Recommended Environment Choice

### Primary Path: VS Code Dev Container (Docker Desktop + WSL2 backend) ✅

The devcontainer was added four days ago as of late February 2026 and is your best bet on Windows. It:

- Runs **without Nix** (the devcontainer uses plain Docker + dev container features for Node, Go, Rust, Python)
- Starts all backing services (Valkey, Meilisearch, NATS, LiveKit, Mailpit) via Docker Compose automatically
- Hot-reloads the React frontend via Vite HMR through a forwarded port
- Opens your editor in the exact same Linux filesystem as all running processes — **no CIFS/WSL mount lag**
- Has pre-configured VS Code extension recommendations in `.devcontainer/devcontainer.json`

**Iteration speed:** Vite HMR is sub-second. Node.js backend changes restart in ~2-5 s (tsx watch). Erlang gateway recompiles in ~5-15 s.

**Caveats:**
- First `docker compose build` inside the container takes ~10-20 min (downloads language toolchains)
- LiveKit voice/video won't work through localhost forwarding if you're on a VM; works fine on local hardware
- Bluesky OAuth is explicitly disabled in devcontainer (noted in README)

---

### Alternative A: WSL2 + Ubuntu + Nix/devenv

Most reliable long-term (identical to CI), but adds ~30-45 min of Nix setup upfront. Better for contributors sending PRs or if you need Erlang debugger attach. Use this if the devcontainer gives you trouble.

### Alternative B: Native Windows (pnpm + manual services)

**Avoid.** Erlang/OTP on Windows is painful. The gateway build scripts assume bash. Nix does not run on Windows natively. Valkey has no official Windows binary. Unless you enjoy suffering, skip this entirely.

---

## 2. Step-by-Step Installation on Windows 11

### Prerequisites (do these first — ~5 min)

#### 2.1 Enable WSL2 + Virtualization

Open **PowerShell as Administrator**:

```powershell
# Enable WSL2 (required as Docker Desktop backend)
wsl --install
# If wsl is already installed but old:
wsl --update
wsl --set-default-version 2
```

Reboot if prompted. After reboot, Ubuntu 24.04 will finish installing. Set a UNIX username/password.

> **Warning:** If you see "Virtual machine platform not enabled" — go to  
> Windows Features → enable **Virtual Machine Platform** and **Windows Subsystem for Linux**, reboot.

#### 2.2 Install Docker Desktop

1. Download from <https://www.docker.com/products/docker-desktop/>
2. Install with **"Use WSL 2 instead of Hyper-V"** checked
3. After install: Settings → Resources → WSL Integration → enable for `Ubuntu-24.04`
4. Apply & Restart

Verify in PowerShell:
```powershell
docker --version
# Docker version 27.x.x
```

#### 2.3 Install VS Code + Required Extensions

```powershell
winget install Microsoft.VisualStudioCode
```

Then install the Dev Containers extension (this is the only extension you need on the Windows side — everything else installs inside the container):

```powershell
code --install-extension ms-vscode-remote.remote-containers
```

---

### 2.4 Fork & Clone Fluxer

On GitHub, fork `fluxerapp/fluxer` to `YOUR_USERNAME/fluxer`.  
Then in **PowerShell** (or Windows Terminal):

```powershell
# Store repos in WSL2 filesystem for maximum I/O speed
# Open a WSL shell:
wsl

# Now inside Ubuntu:
cd ~
mkdir -p dev && cd dev
git clone https://github.com/YOUR_USERNAME/fluxer.git
cd fluxer

# Track upstream for merging updates later:
git remote add upstream https://github.com/fluxerapp/fluxer.git
git fetch upstream

# The active branch is 'refactor':
git checkout refactor
```

> **Critical:** Clone into `~/dev/fluxer` inside WSL2 (i.e., `\\wsl$\Ubuntu-24.04\home\youruser\dev\fluxer`), **not** into `C:\Users\...`. Cloning onto the Windows filesystem causes 5-10x slower file I/O inside containers and breaks inotify-based file watchers.

---

### 2.5 Open in Dev Container

```bash
# From inside WSL2, still in ~/dev/fluxer:
code .
```

VS Code opens. You'll see a notification: **"Reopen in Container"** — click it. Or use Command Palette (`Ctrl+Shift+P`): **"Dev Containers: Reopen in Container"**.

**What happens during first open (~10–20 min):**
1. Docker builds the dev container image (installs Node 24, pnpm, Go 1.24, Rust 1.93 + wasm32 target)
2. Docker Compose starts: Valkey, Meilisearch, LiveKit, Mailpit, NATS core, NATS JetStream
3. `onCreateCommand` (`.devcontainer/on-create.sh`) runs — bootstraps config, installs pnpm deps

> **If the build fails with "Erlang not found":** The devcontainer does NOT install Erlang via a devcontainer feature (unlike devenv). The Erlang gateway runs via a separately compiled binary. Check `.devcontainer/on-create.sh` — it likely installs `erlang` via apt. If it fails, file an issue or temporarily skip gateway. The React frontend and Node.js API work without it.

> **Tip:** Watch progress via the "Starting Dev Container" notification → "Show Log". This is the one-time cost.

---

### 2.6 Start All Dev Processes

Once VS Code is connected to the container, open the integrated terminal (`Ctrl+` `` ` ``):

```bash
# Start all services (Caddy proxy + all app processes via process-compose):
process-compose -f .devcontainer/process-compose.yml up
```

Or if the devcontainer wired it into a task, run:
```
Ctrl+Shift+P → Tasks: Run Task → "Start Dev Environment"
```

**Verify everything is running:**

| Service | URL |
|---|---|
| Full Fluxer web app | `http://localhost:48763` |
| Dev email inbox (Mailpit) | `http://localhost:48763/mailpit/` |
| Meilisearch | `http://localhost:7700` |
| LiveKit | `http://localhost:7880` |
| process-compose dashboard | `http://localhost:8090` |

> VS Code automatically forwards these ports — check the **Ports** panel (bottom status bar → Ports). Open `http://localhost:48763` in your Windows Chrome/Edge browser directly.

**First run — create a dev account:**
1. Go to `http://localhost:48763` → Register
2. Verification email is captured by Mailpit at `http://localhost:48763/mailpit/`
3. Copy the code from Mailpit → complete registration

---

### 2.7 VS Code Extension Recommendations

The devcontainer already installs these automatically (from `devcontainer.json`):

| Extension | Purpose |
|---|---|
| `biomejs.biome` | Linting + formatting (replaces ESLint+Prettier in this project) |
| `rust-lang.rust-analyzer` | Rust/WASM code |
| `golang.go` | Go tooling |
| `pgourlain.erlang` | Gateway Erlang syntax |
| `clinyong.vscode-css-modules` | CSS modules in React |
| `TypeScriptTeam.native-preview` | Faster TS language server |

Add these manually via Quick Open (`Ctrl+Shift+X`) inside the container:

```
bradlc.vscode-tailwindcss       (if Fluxer uses Tailwind — check; they use CSS modules)
formulahendry.auto-rename-tag   (React JSX editing)
streetsidesoftware.code-spell-checker
```

---

## 3. Fast Iteration Workflow Inside VS Code

### 3.1 Frontend Hot-Reload (fluxer_app — Vite + React)

The `fluxer_app` process runs Vite's dev server on port 49427 (proxied through Caddy at 48763).  
**Vite HMR is active** — save a `.tsx`/`.css` file and the browser updates in **<500ms**, often without a full page reload.

```bash
# Restart only the frontend if Vite gets stuck:
# In the process-compose TUI (http://localhost:8090), select fluxer_app → restart
# Or from terminal:
pkill -f "fluxer_app" && pnpm --filter fluxer_app dev
```

**Edit → browser update time:** ~200-500ms for component changes, ~1-2s for new file adds.

### 3.2 Backend Changes (fluxer_server, fluxer_api)

`fluxer_server` uses `tsx --watch` (or similar), so Node.js services auto-restart on save.  
**Restart time:** ~2-5 seconds.

```bash
# Manual restart of a specific service via process-compose:
# http://localhost:8090 → click the service → Restart button
# Or from terminal, kill and re-run:
pnpm --filter fluxer_server dev
```

For `fluxer_api` (the REST HTTP API service):
```bash
pnpm --filter fluxer_api dev
```

### 3.3 Erlang Gateway Changes (fluxer_gateway)

The gateway is Erlang/OTP compiled with rebar3. Changes require recompilation:

```bash
cd fluxer_gateway
rebar3 compile
# Hot code reload in Erlang (no restart needed for function-body changes):
# Connect to the running node and reload:
# erl -name debug@127.0.0.1 -remsh fluxer_gateway@127.0.0.1
# > l(module_name).
```

For structural changes (new modules, supervisor changes), restart via process-compose.  
**Recompile time:** ~5-15s after initial build.

### 3.4 Adding a New Sidebar Tab (e.g., "Projects")

**File locations to understand first:**

```
fluxer_app/src/
├── components/          # All React UI components
│   ├── sidebar/         # Left sidebar panels (explore this)
│   ├── channel/         # Channel view area
│   └── modals/          # Modal dialogs
├── router/              # TanStack Router or similar route definitions
├── Routes.tsx           # Top-level route definitions
├── stores/              # Zustand or similar state stores
└── contexts/            # React contexts (auth, presence, etc.)
```

**Step 1 — Explore the sidebar structure:**
```bash
# From the container terminal:
find fluxer_app/src/components -type d | head -30
# Look for nav/sidebar directories
ls fluxer_app/src/components/
```

**Step 2 — Add a dummy "Projects" tab component:**

```bash
mkdir -p fluxer_app/src/apps/whiteboard
```

Create `fluxer_app/src/apps/whiteboard/WhiteboardApp.tsx`:
```tsx
import React, { useEffect, useRef } from "react";
import styles from "./WhiteboardApp.module.css";

interface WhiteboardAppProps {
  channelId: string;
}

/**
 * Phase 1: iframe-embedded Excalidraw instance.
 * Replace with the @excalidraw/excalidraw React component in phase 2.
 */
export function WhiteboardApp({ channelId }: WhiteboardAppProps) {
  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <span className={styles.title}>Whiteboard</span>
        <span className={styles.channelTag}>#{channelId}</span>
      </div>
      <iframe
        className={styles.frame}
        src="https://excalidraw.com"
        title="Whiteboard"
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}
```

Create `fluxer_app/src/apps/whiteboard/WhiteboardApp.module.css`:
```css
.container {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background: var(--background-primary);
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  height: 48px;
  border-bottom: 1px solid var(--background-modifier-accent);
  flex-shrink: 0;
}

.title {
  font-weight: 600;
  font-size: 16px;
}

.channelTag {
  font-size: 12px;
  color: var(--text-muted);
}

.frame {
  flex: 1;
  border: none;
  width: 100%;
}
```

**Step 3 — Wire it into the router/sidebar:**

Explore `fluxer_app/src/Routes.tsx` and the sidebar component to find where channel types are rendered. Look for something like `if (channel.type === 'text')` and add a new branch:

```tsx
// In the channel router/view component — exact file TBD after exploration:
import { WhiteboardApp } from "../apps/whiteboard/WhiteboardApp";

// Add a new channel type check:
if (channel.type === "whiteboard") {
  return <WhiteboardApp channelId={channel.id} />;
}
```

### 3.5 Running the Desktop Electron App (fluxer_desktop)

```bash
# From container terminal:
pnpm --filter fluxer_desktop dev

# Electron requires a display. Inside the devcontainer, you need:
# Option A: X11 forwarding (complex on Windows — skip for web-first dev)
# Option B: Build and run the Electron app on the Windows side:

# From Windows PowerShell:
cd \\wsl$\Ubuntu-24.04\home\youruser\dev\fluxer\fluxer_desktop
# But electron needs native binaries — easiest: test in browser first,
# build Electron as a final packaging step
```

> **Recommendation:** Develop and test in the browser (Chrome DevTools) until your feature is solid. Only run Electron for final QA of desktop-specific behavior (system tray, deep links, etc.).

### 3.6 Debugging

**React frontend (Chrome DevTools):**
- Open `http://localhost:48763` in Chrome
- DevTools → Sources → webpack/Vite source maps are enabled in dev mode
- React DevTools browser extension works normally

**Node.js backend (VS Code debugger attach):**

The devcontainer includes pre-configured launch targets in `.vscode/launch.json`. Use `F5` or Run & Debug panel. For manual attach:

```json
// .vscode/launch.json — add if not present:
{
  "type": "node",
  "request": "attach",
  "name": "Attach to fluxer_server",
  "port": 9229,
  "localRoot": "${workspaceFolder}/fluxer_server",
  "remoteRoot": "/workspace/fluxer_server",
  "restart": true
}
```

Start the server with inspector:
```bash
pnpm --filter fluxer_server exec node --inspect=0.0.0.0:9229 dist/index.js
```

**Erlang gateway:**
```bash
# Attach to running Erlang node:
erl -name debug@127.0.0.1 -setcookie <cookie_from_dev_gateway_startup>
# Then use observer:
observer:start().
```

### 3.7 Git Workflow

```bash
# Branch naming convention for your PM features:
git checkout -b feat/pm-whiteboard
git checkout -b feat/pm-kanban-vikunja
git checkout -b feat/pm-calendar
git checkout -b feat/pm-documents-appflowy
git checkout -b chore/pm-shared-auth

# Keep your fork in sync with upstream regularly:
git fetch upstream
git rebase upstream/refactor
# (prefer rebase over merge to keep a clean history)

# Commit style (Fluxer uses conventional commits):
git commit -m "feat(app): add whiteboard channel type with Excalidraw embed"
git commit -m "feat(server): add whiteboard channel type API endpoint"
git commit -m "fix(app): whiteboard iframe scroll on Windows"
```

---

## 4. Integration Starter Plan — Phase 1 MVP (2–4 weeks)

### Priority Order (easiest win first)

1. **Excalidraw embed** (React component, zero backend) — 1-2 days
2. **Vikunja Kanban** (Docker service + iframe or API integration) — 3-5 days
3. **FullCalendar** (pure React, zero backend) — 2-3 days
4. **AppFlowy/Affine documents** (Docker service + iframe) — 4-7 days

---

### 4.1 Folder Structure Additions

```
fluxer_app/src/
└── apps/                          # NEW: PM tool panels
    ├── whiteboard/
    │   ├── WhiteboardApp.tsx       # Excalidraw React component (phase 2)
    │   ├── WhiteboardApp.module.css
    │   └── useWhiteboardSync.ts   # Persist board data via fluxer_server
    ├── kanban/
    │   ├── KanbanApp.tsx           # Vikunja iframe or Focalboard embed
    │   └── KanbanApp.module.css
    ├── calendar/
    │   ├── CalendarApp.tsx         # FullCalendar React component
    │   └── CalendarApp.module.css
    └── documents/
        ├── DocumentsApp.tsx        # AppFlowy/Affine iframe
        └── DocumentsApp.module.css

fluxer_server/src/
└── apps/                          # NEW: PM tool API routes
    ├── whiteboard/
    │   └── whiteboard.routes.ts   # Store/load board JSON in SQLite
    └── kanban/
        └── kanban.proxy.ts        # Optional: proxy Vikunja API with Fluxer auth

compose.override.yaml              # NEW: extra services for PM tools
```

### 4.2 Native Excalidraw React Component (Phase 2 — recommended over iframe)

```bash
# Install inside the container:
pnpm --filter fluxer_app add @excalidraw/excalidraw
```

```tsx
// fluxer_app/src/apps/whiteboard/WhiteboardApp.tsx
import React, { useCallback, useEffect, useState } from "react";
import { Excalidraw, serializeAsJSON, restore } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/types/element/types";
import type { AppState } from "@excalidraw/excalidraw/types/types";
import { useFluxerAuth } from "../../contexts/AuthContext"; // adjust import path
import styles from "./WhiteboardApp.module.css";

interface Props {
  channelId: string;
}

export function WhiteboardApp({ channelId }: Props) {
  const { token } = useFluxerAuth(); // Fluxer's existing auth context
  const [initialData, setInitialData] = useState(null);

  // Load persisted board state on mount
  useEffect(() => {
    fetch(`/api/v1/apps/whiteboard/${channelId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => data && setInitialData(restore(data, null, null)))
      .catch(() => {}); // graceful no-op on first use
  }, [channelId, token]);

  // Debounced autosave on every change
  const handleChange = useCallback(
    debounce((elements: readonly ExcalidrawElement[], state: AppState) => {
      const json = serializeAsJSON(elements, state, {}, "database");
      fetch(`/api/v1/apps/whiteboard/${channelId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: json,
      }).catch(() => {});
    }, 1500),
    [channelId, token]
  );

  return (
    <div className={styles.container}>
      <Excalidraw
        initialData={initialData}
        onChange={handleChange}
        // Theme follows Fluxer's dark/light mode:
        theme="dark"
        UIOptions={{ canvasActions: { export: { saveFileToDisk: true } } }}
      />
    </div>
  );
}

function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: any[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}
```

### 4.3 Sharing Fluxer Auth with External Tools

**Strategy:** Use Fluxer's existing JWT/session token as a shared credential.

For **iframe-based tools** (Vikunja, AppFlowy): pass the token as a URL hash or use a shared cookie:
```tsx
// In KanbanApp.tsx:
const { token } = useFluxerAuth();
const vikunjaUrl = `http://localhost:3456/projects?token=${token}`;
// Note: Vikunja uses its own auth — set up Vikunja with Fluxer as OIDC provider,
// or use Vikunja's API key approach for phase 1.
```

**Best long-term approach:** Configure Vikunja/AppFlowy to accept Fluxer as an **OIDC provider**. Fluxer would need to expose an OAuth2/OIDC-compatible endpoint — this is a backend task for phase 2+. For phase 1, use API keys stored in Fluxer's config.

### 4.4 Docker Compose Override for PM Services

Create `compose.override.yaml` in the repo root (Docker Compose picks this up automatically):

```yaml
# compose.override.yaml — PM tool extra services
# Run: docker compose -f compose.yaml -f compose.override.yaml up
services:
  vikunja:
    image: vikunja/vikunja:latest
    restart: unless-stopped
    environment:
      VIKUNJA_SERVICE_JWTSECRET: "change-me-in-prod"
      VIKUNJA_DATABASE_TYPE: "sqlite"
      VIKUNJA_DATABASE_PATH: "/app/vikunja/vikunja.db"
      VIKUNJA_SERVICE_FRONTENDURL: "http://localhost:48763/kanban/"
    volumes:
      - vikunja-data:/app/vikunja
    ports:
      - "127.0.0.1:3456:3456"

  affine:
    image: ghcr.io/toeverything/affine-graphql:stable
    restart: unless-stopped
    ports:
      - "127.0.0.1:3010:3010"
    volumes:
      - affine-data:/root/.affine

volumes:
  vikunja-data:
  affine-data:
```

Add Caddy reverse proxy rules to `dev/Caddyfile.dev`:
```caddyfile
# Add to the existing Caddy config:
handle /kanban/* {
    reverse_proxy localhost:3456
}

handle /docs/* {
    reverse_proxy localhost:3010
}
```

### 4.5 New "Tool Tab" Component Pseudocode

```tsx
// fluxer_app/src/components/channel/ChannelView.tsx (or equivalent)
// Add to whichever component renders the main channel content area:

import { WhiteboardApp } from "../../apps/whiteboard/WhiteboardApp";
import { KanbanApp } from "../../apps/kanban/KanbanApp";
import { CalendarApp } from "../../apps/calendar/CalendarApp";

type ChannelType = "text" | "voice" | "announcement" | "whiteboard" | "kanban" | "calendar";

function ChannelView({ channel }) {
  switch (channel.type as ChannelType) {
    case "whiteboard":
      return <WhiteboardApp channelId={channel.id} />;
    case "kanban":
      return <KanbanApp channelId={channel.id} />;
    case "calendar":
      return <CalendarApp channelId={channel.id} />;
    default:
      return <TextChannelView channel={channel} />;
  }
}
```

You'll also need to:
1. Add `"whiteboard" | "kanban" | "calendar"` to the channel type enum in `packages/` (shared types)
2. Add a migration to `fluxer_api` to allow these new channel types in the DB
3. Add UI to channel creation modal to select the new types

---

## 5. Common Windows/WSL Gotchas & Fixes

### 5.1 File Watching / Performance

**Problem:** inotify-based file watchers (Vite, tsx --watch) don't work on Windows filesystem mounts (`/mnt/c/...`).  
**Fix:** Always keep the repo in the WSL2 native filesystem (`~/dev/fluxer`), not in `/mnt/c/`. This is why step 2.4 clones into `~`.

**Problem:** VS Code might default to opening the Windows path when you `code .` from PowerShell.  
**Fix:** Always `wsl` first, then `cd ~/dev/fluxer && code .`

**Problem:** pnpm install is slow on first run.  
**Fix:** This is normal — it's downloading ~700 MB of Node modules. Subsequent installs use the pnpm store cache inside the container volume.

### 5.2 Port Forwarding (Container → Windows Browser)

VS Code Dev Containers automatically forward ports listed in `devcontainer.json`:
- 48763 → Fluxer app
- 6379 → Valkey
- 7700 → Meilisearch
- 7880 → LiveKit
- 9229 → Node.js debugger

If a port isn't auto-forwarding:
1. Go to **Ports panel** (bottom status bar → Ports)
2. Click **Forward a Port** → enter the port number
3. Access as `http://localhost:PORT` in Windows browser

**If `localhost:48763` gives connection refused:**
```bash
# Inside container, check if Caddy is running:
ps aux | grep caddy
# Check process-compose status:
curl http://localhost:8090/processes
```

### 5.3 LiveKit UDP Ports for Voice

LiveKit requires UDP ports for WebRTC media. Through the devcontainer, these are not forwarded (TCP only via VS Code port forwarding).

**For local development:** Voice works if you're on the same machine (browser → localhost → LiveKit in container is localhost → localhost).

**If voice fails:** Add to `compose.override.yaml`:
```yaml
services:
  # Note: the livekit service is inside the main container, not a compose service.
  # For devcontainer, add these ports to the app service:
  app:
    ports:
      - "7881:7881/tcp"   # ICE-TCP
      - "3478:3478/udp"   # STUN/TURN
      - "50000-50100:50000-50100/udp"  # RTP media
```

> **Warning:** The UDP port range `50000-50100` is 100 ports — Docker Desktop on Windows handles this but it does slow down container startup. Only add this range if you're actively testing voice.

### 5.4 Direnv + .envrc Auto-loading

The repo has a `.envrc` file for the devenv/Nix path. **In the devcontainer, this is irrelevant** — the environment variables are set directly in `devcontainer.json` via `remoteEnv`.

If you add your own `.envrc` for local config overrides:
```bash
# Install direnv inside the container:
curl -sfL https://direnv.net/install.sh | bash
echo 'eval "$(direnv hook bash)"' >> ~/.bashrc
source ~/.bashrc
# In repo root:
direnv allow
```

VS Code picks up `.envrc` values if you open a new terminal — they won't auto-inject into running processes. Use `devenv.local.nix` (devenv path) or a `config/config.json` override (devcontainer path) for persistent local config.

### 5.5 If Docker Desktop is Unbearably Slow

**Symptoms:** `docker compose up` takes >2 min, file changes don't reflect quickly.

**Fixes in order of impact:**
1. WSL2 resource limits — create/edit `C:\Users\YourName\.wslconfig`:
   ```ini
   [wsl2]
   memory=8GB
   processors=4
   swap=4GB
   ```
   Then run `wsl --shutdown` and restart Docker Desktop.

2. Enable **VirtioFS** in Docker Desktop: Settings → General → "Use VirtioFS for file sharing" (faster than gRPC-FUSE)

3. Check antivirus — Windows Defender scanning WSL2 virtual disk (`ext4.vhdx`) causes severe slowdowns. Add an exclusion for `%LOCALAPPDATA%\Docker` and `%LOCALAPPDATA%\Packages\CanonicalGroupLimited.*`.

4. If Docker Desktop itself is the problem, try **Rancher Desktop** (free, uses containerd, often faster):
   ```powershell
   winget install SUSE.RancherDesktop
   ```
   It uses the same devcontainer spec.

### 5.6 Fallback: WSL2 + Nix/devenv (if devcontainer breaks)

If the devcontainer is giving you grief:

```bash
# Inside WSL2 Ubuntu terminal:
# Install Nix (Determinate Systems installer — handles user namespaces correctly):
curl --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix | sh -s -- install

# Restart shell, then install devenv:
nix profile install nixpkgs#devenv
# Or the official way:
nix-env -iA devenv -f https://github.com/NixOS/nixpkgs/archive/nixpkgs-unstable.tar.gz

# In the Fluxer repo:
cd ~/dev/fluxer
devenv shell   # Takes 10-20 min first time (downloads everything)
devenv up      # Starts all services
```

**Common Nix WSL2 error:** `error: user namespaces not available`  
**Fix:**
```bash
sudo sysctl -w kernel.unprivileged_userns_clone=1
echo 'kernel.unprivileged_userns_clone=1' | sudo tee /etc/sysctl.d/nix.conf
```

**Nix store too slow on first build?** Add Cachix binary cache — devenv uses this automatically (`cachix.pull = ["devenv"]` is in `devenv.nix`). Make sure you're not behind a VPN that blocks the cache CDN.

---

## Quick Reference Cheatsheet

```bash
# Start everything:
process-compose -f .devcontainer/process-compose.yml up

# Restart a single service (e.g., after backend change):
# → http://localhost:8090 → select service → Restart

# Add a pnpm dependency to fluxer_app:
pnpm --filter fluxer_app add <package>

# Run typechecks:
pnpm --filter fluxer_app typecheck

# Lint + format (Biome):
pnpm --filter fluxer_app lint
pnpm biome check --write .

# Sync with upstream:
git fetch upstream && git rebase upstream/refactor

# Build for production (test locally):
pnpm --filter fluxer_app build
pnpm --filter fluxer_server build
```

---

## Realistic Timeline

| Week | What to achieve |
|------|-----------------|
| Day 1 (today) | Devcontainer running, Fluxer app loading at localhost:48763, dev account registered |
| Day 2 | Explore codebase, find sidebar/channel routing, add dummy "Projects" route |
| Days 3-5 | Wire in `@excalidraw/excalidraw` React component, persist state to `fluxer_server` SQLite |
| Week 2 | Add Vikunja via Docker compose override, iframe it into a "Kanban" channel type |
| Week 3 | FullCalendar React component, share channel data with calendar events |
| Week 4 | Affine/AppFlowy documents, start OIDC/shared-auth integration groundwork |

The devcontainer path means you can be **editing React components within 30-60 minutes** of starting this guide. The Excalidraw embed with persistence is achievable in a single focused day of work once the environment is running.
