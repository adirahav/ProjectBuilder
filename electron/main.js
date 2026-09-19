const { app, BrowserWindow, dialog, ipcMain, nativeImage, Menu, shell } = require("electron")
// Without this, Chromium's default autoplay policy blocks the dashboard's
// voice cues (agent-dashboard.html's playCue()) until a real user click has
// happened on that exact page — inside a <webview>, that's an extra,
// confusing "why is there no sound" step. This is a self-contained desktop
// app playing its own bundled cue sounds, not a random web page trying to
// autoplay ads, so the usual reason for the policy doesn't apply here.
// Must be set before app.whenReady() — Chromium reads command-line switches
// at startup, not on demand.
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required")
// Windows taskbar features (overlay icons, jump lists, progress bars) key
// off this id to find "the app's" taskbar button — without it, an
// unpackaged dev run (`electron .`, no proper installed shortcut/AppUserModelID)
// can silently fail to show a setOverlayIcon() badge even though the call
// itself succeeds with no error. Matches package.json's build.appId so a
// packaged build and a dev run resolve to the same taskbar identity.
if (process.platform === "win32") app.setAppUserModelId("com.devloop.desktop")
const path = require("path")
const fs = require("fs")
const crypto = require("crypto")
const { spawn, execSync, execFile } = require("child_process")
const { promisify } = require("util")
const execFileAsync = promisify(execFile)
const { createInterface } = require("readline")

// task-builder.js prints this exact banner line once its dashboard HTTP server
// is actually listening (see startDashboardServer() in task-builder.js) — we
// scrape it out of stdout instead of guessing/hardcoding a port, since the
// project can override DASHBOARD_PORT.
const DASHBOARD_URL_PATTERN = /AGENT DASHBOARD — (http:\/\/localhost:\d+\/)/

// child.kill() only signals the DIRECT child — on Windows, when that child
// was spawned with shell:true (claude, task-builder.js's own node process, ...),
// the direct child is really cmd.exe, and kill() leaves whatever cmd.exe
// itself spawned (the actual claude.exe / node.exe doing the real work)
// completely untouched and running forever. This was confirmed for real
// this session: killing/restarting through several rounds of debugging left
// 5 orphaned claude.exe and ~20 orphaned node.exe processes running in the
// background, still holding files open in (and in one case, still actively
// writing to) a workspace that had already been deleted. `taskkill /T /F`
// kills the whole process tree, not just the immediate child.
function killProcessTree(child) {
  if (!child || child.killed) return
  if (process.platform === "win32") {
    try {
      execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: "ignore" })
    } catch {
      // Already exited between the killed-check above and here — fine.
    }
  } else {
    child.kill()
  }
}

// Directories inside the internal workspace that are junctioned straight
// into the user's chosen visible folder — see ensureWorkspace() below. Only
// the real PRODUCT output lives where the user can see it; everything else
// (agents' prompts, task-builder.js itself, .rule/, docs/, .plan/, reports) stays
// inside the app's own hidden data directory. Add "android" here once a
// Capacitor build step exists (see chat history's roadmap).
const VISIBLE_OUTPUT_DIRS = ["frontend", "backend"]

let mainWindow = null
let devLoopProcess = null
// Set the moment task-builder.js's own dashboard-ready banner is scraped
// from its stdout (see forwardChunk() below), cleared on exit — lets a
// start-dev-loop call that arrives while devLoopProcess is ALREADY running
// (e.g. after a renderer reload/DevTools reload, which wipes all in-page JS
// state but doesn't touch this main-process-owned child) reconnect the UI
// to the live dashboard instead of just rejecting with "already running"
// and leaving the human stuck on the Ready-to-start screen with a live,
// working backend they can no longer reach through the UI at all. Confirmed
// live: exactly this happened.
let lastDashboardUrl = null
// The workspace task-builder.js is currently running against (only ever one
// at a time — see start-dev-loop's own devLoopProcess check) — tracked so
// delete-recent-project can refuse to wipe a workspace out from under a live
// run instead of just checking whether *something* is running.
let activeWorkspacePath = null
let mongodProcess = null
const MONGO_PORT = 27017

// Dev (`npm start`, unpackaged) vs packaged (electron-builder's `extraResources`
// — see electron/package.json's `build.extraResources`) resolve to different
// real paths for the same bundled resource. `app.isPackaged` is the standard
// Electron way to tell them apart; process.resourcesPath only exists/is
// meaningful once packaged.
function getBundledResourcePath(...segments) {
  const base = app.isPackaged ? process.resourcesPath : path.join(__dirname, "resources")
  return path.join(base, ...segments)
}

function getMongodPath() {
  return getBundledResourcePath("mongodb-win-x64", "mongod.exe")
}

function getTemplatePath() {
  return getBundledResourcePath("template")
}

ipcMain.handle("get-mongod-status", () => {
  const mongodPath = getMongodPath()
  return { path: mongodPath, present: fs.existsSync(mongodPath) }
})

// Backs the dashboard's "Open in Browser" button (agent-dashboard.html runs
// inside a <webview>, served by task-builder.js's own plain HTTP server —
// no preload script, no access to window.devLoop at all — so it can't call
// this directly; it just does a normal `window.open(url, "_blank")` and the
// <webview>'s own "new-window" listener below, in the renderer that DOES
// have this API, forwards the URL here instead of letting Electron open it
// in a new BrowserWindow of its own).
ipcMain.handle("open-external", (event, url) => {
  if (typeof url === "string" && /^https?:\/\//i.test(url)) shell.openExternal(url)
})

// Starts the bundled mongod.exe once per app run (idempotent — a second
// call while it's already up just returns the same connection string) with
// its data directory under this app's own userData, never inside a
// project's workspace. `workspacePath`'s own hashed id becomes the database
// name here (only used for this function's own return value — the backend
// itself connects using whatever database name is in the real configured
// URI instead; a single mongod instance serves any database name a client
// asks for, so the two don't need to match). Called automatically by
// start-dev-loop right before a build begins, for the "app provides the
// database for you" path (a plain localhost/127.0.0.1:27017 URI, written
// during setup) — not something the human has to remember to trigger.
async function ensureLocalMongoRunning(workspacePath) {
  const mongodPath = getMongodPath()
  if (!fs.existsSync(mongodPath)) {
    throw new Error(`mongod.exe not found at ${mongodPath} — see electron/resources/mongodb-win-x64/README.md`)
  }

  const dbName = path.basename(workspacePath)
  const connectionString = `mongodb://127.0.0.1:${MONGO_PORT}/${dbName}`

  if (mongodProcess) return connectionString // already running for this app session

  const dataDir = path.join(app.getPath("userData"), "mongo-data")
  fs.mkdirSync(dataDir, { recursive: true })

  mongodProcess = spawn(mongodPath, ["--dbpath", dataDir, "--port", String(MONGO_PORT), "--bind_ip", "127.0.0.1"], {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  })
  mongodProcess.stdout.on("data", (d) => console.log(`[mongod] ${d.toString().trim()}`))
  mongodProcess.stderr.on("data", (d) => console.log(`[mongod] ${d.toString().trim()}`))
  mongodProcess.on("exit", (code) => {
    console.log(`[mongod] exited with code ${code}`)
    mongodProcess = null
  })

  // mongod takes a moment to start listening — a fixed wait is crude but
  // simple; a follow-up could instead poll the port or watch stdout for
  // "Waiting for connections" before resolving.
  await new Promise((resolve) => setTimeout(resolve, 3000))
  return connectionString
}

// Matches development/NEW-PROJECT-SETUP-PROMPT.md's own AI-Studio-export
// convention exactly: "ask for the folder name (defaults to
// raw_from_ai_studio/, matching this template)". Extracting straight into
// that fixed name means the human never has to type a folder name or know
// it exists at all -- pick the ZIP, done, Claude finds it exactly where it
// already expects an AI-Studio export to be.
const AI_STUDIO_EXPORT_DIR = "raw_from_ai_studio"

ipcMain.handle("upload-ai-studio-export", async (event, workspacePath) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [{ name: "ZIP Archives", extensions: ["zip"] }],
  })
  if (result.canceled || result.filePaths.length === 0) return null

  const zipPath = result.filePaths[0]
  const destDir = path.join(workspacePath, AI_STUDIO_EXPORT_DIR)
  fs.rmSync(destDir, { recursive: true, force: true })
  fs.mkdirSync(destDir, { recursive: true })

  try {
    // No extra npm dependency for a one-off unzip — Expand-Archive ships
    // with Windows PowerShell. Single-quoted PS string; the only escaping
    // a real path needs is doubling an embedded single quote.
    const psQuote = (p) => `'${p.replace(/'/g, "''")}'`
    execSync(`powershell -NoProfile -Command "Expand-Archive -LiteralPath ${psQuote(zipPath)} -DestinationPath ${psQuote(destDir)} -Force"`, { stdio: "ignore" })
  } catch (e) {
    return { error: `Failed to extract the ZIP: ${e.message}` }
  }

  const fileCount = fs.readdirSync(destDir, { recursive: true }).length
  if (fileCount === 0) return { error: "The ZIP extracted but appears to be empty." }
  return { folderName: AI_STUDIO_EXPORT_DIR, fileCount }
})

// Backs the config wizard's "External APIs" question (see setup-wizard.js's
// CLI equivalent for why this lives here rather than a link: one real YAML
// file per external API under docs/api-contract/external/, same convention
// as the per-service contract files the Frontend Agent already writes for
// owned services, so an agent reads a real file instead of having to go
// fetch a URL that could change or go stale).
ipcMain.handle("upload-external-api-spec", async (event, { workspacePath, slug }) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [{ name: "OpenAPI/YAML", extensions: ["yaml", "yml", "json"] }],
  })
  if (result.canceled || result.filePaths.length === 0) return null

  const destDir = path.join(workspacePath, "docs", "api-contract", "external")
  fs.mkdirSync(destDir, { recursive: true })
  const destPath = path.join(destDir, `${slug}.yaml`)
  try {
    fs.copyFileSync(result.filePaths[0], destPath)
  } catch (e) {
    return { error: `Failed to copy the file: ${e.message}` }
  }
  return { fileName: path.basename(result.filePaths[0]) }
})

// No custom menu was ever set here, so Electron falls back to its own
// default one — which binds Ctrl+W to instantly close the focused window,
// no confirmation, no error. That's a real, confirmed-live bug in a chat-
// heavy app like this one: typing in the chat box and hitting Ctrl+W by
// muscle memory (or by accident) silently kills the whole window mid-
// conversation, which then tears down task-builder.js and mongod via
// window-all-closed — with nothing printed anywhere to explain what just
// happened (no crash, no error, the terminal just returns to its prompt).
// Keeping only devtools toggle/reload (still useful for debugging, see
// createWindow()'s own comment) and dropping every default accelerator that
// closes/quits/minimizes anything removes the accidental trigger entirely.
Menu.setApplicationMenu(
  Menu.buildFromTemplate([
    { label: "View", submenu: [{ role: "reload" }, { role: "toggleDevTools" }] },
  ]),
)

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      webviewTag: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"))
  // No longer auto-opened — useful while actively debugging the setup chat
  // (see chat history), annoying on every normal run afterward. Open by
  // hand (Ctrl+Shift+I) when actually needed.
}

// Any folder the human can browse to is acceptable — a brand-new empty one
// for a first project, or one they've already used with this app. Unlike
// the very first version of this shell, this deliberately does NOT require
// development/task-builder.js (or any of our own machinery) to already be
// sitting inside it — the user should never see, need, or be able to poke
// at that. It lives only in the app's own hidden workspace (see
// ensureWorkspace()); this folder only ever receives the actual product.
function validateProjectFolder(folderPath) {
  try {
    fs.accessSync(folderPath, fs.constants.W_OK)
  } catch {
    return { valid: false, reason: "Can't write to that folder — pick one you have write access to." }
  }
  return { valid: true }
}

// A short, stable, filesystem-safe id for a given visible folder path, so
// re-selecting the SAME folder later reuses the same hidden workspace
// instead of re-copying the template and losing all prior progress.
function workspaceIdFor(visibleFolderPath) {
  return crypto.createHash("sha256").update(path.resolve(visibleFolderPath)).digest("hex").slice(0, 16)
}

function copyRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyRecursive(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

// Sets up (or reuses) this project's hidden internal workspace — a full copy
// of the bundled template (agents/, development/task-builder.js, .rule/, docs/,
// .plan/, ...) under this app's own userData directory, never inside the
// folder the user picked. VISIBLE_OUTPUT_DIRS are then created as directory
// junctions pointing INTO the visible folder, so when a Backend/Frontend
// Agent writes to `frontend/`/`backend/` from task-builder.js's point of view,
// those files physically land in the user's own chosen folder — with zero
// copying/syncing needed, and zero orchestration machinery ever visible
// there. Junctions (not symlinks) since they don't require elevated
// permissions on Windows.
function ensureWorkspace(visibleFolderPath) {
  fs.mkdirSync(visibleFolderPath, { recursive: true })

  const workspacePath = path.join(app.getPath("userData"), "projects", workspaceIdFor(visibleFolderPath))
  const isFirstRun = !fs.existsSync(workspacePath)
  if (isFirstRun) {
    copyRecursive(getTemplatePath(), workspacePath)
  } else {
    // development/ (task-builder.js, agent-dashboard/, NEW-PROJECT-SETUP-PROMPT.md,
    // ...) is pure tooling this app ships and updates -- nothing ever writes
    // project content there, unlike agents/ or docs/ which hold this
    // specific project's real PRD/backlog/filled-in rules once configured
    // and must NEVER be overwritten after first run. Re-syncing just this
    // one directory on every run means an existing project actually gets
    // task-builder.js fixes/features from a newer build of this app instead of
    // being frozen at whatever version existed the day its workspace was
    // first created (a real bug: DEV_LOOP_NO_AUTO_OPEN not existing yet in
    // an old copy is exactly why the dashboard was still popping open in
    // the system browser after that fix already shipped — see chat history).
    const devDir = path.join(workspacePath, "development")
    fs.rmSync(devDir, { recursive: true, force: true })
    copyRecursive(path.join(getTemplatePath(), "development"), devDir)
  }

  for (const dirName of VISIBLE_OUTPUT_DIRS) {
    const visibleTarget = path.join(visibleFolderPath, dirName)
    fs.mkdirSync(visibleTarget, { recursive: true })
    const linkPath = path.join(workspacePath, dirName)
    if (!fs.existsSync(linkPath)) {
      fs.symlinkSync(visibleTarget, linkPath, "junction")
    }
  }

  return { workspacePath, isFirstRun }
}

// Presence of .setup-progress.md is the same signal development/task-builder.js
// itself uses (see its adoptApprovalModeFromSetup()) to tell "this project
// has already been through the interview" apart from "fresh template,
// still full of {{PLACEHOLDER}} markers, needs the setup Q&A run first."
// NOTE: .setup-progress.md is only written once Part 1 is confirmed — a
// human who closed the app mid-interview (before Part 1 finished) won't
// have it yet either, which is exactly the case CHAT_STARTED_MARKER below
// exists to still tell apart from a genuinely brand-new project.
// `.setup-progress.md`'s existence is NOT the right signal here — per
// NEW-PROJECT-SETUP-PROMPT.md's own "Resuming" section, that file is
// created early (as soon as Part 1's product description is confirmed,
// long before any real template file gets filled in) and only deleted at
// the very end, once every phase — including writing orchestrator.config.json
// — is actually done. Using its existence as "setup is finished" had it
// backwards: the moment Part 1 finished, this returned true and the app
// skipped straight to "Ready to start" with orchestrator.config.json still
// an empty/nonexistent stub, Phase 0-D never actually done.
//
// orchestrator.config.json itself is the right marker: per that document's
// Phase D item 37, this file "doesn't exist in this template repo at all
// until setup creates it" — the template ships with no such file, and it
// only gets written (with real keys) near the very end of the process.
// `.plan/000-backlog.md` looks tempting too (Phase E, generated even
// later) but doesn't work — the template repo ships one already (a worked
// example, meant to be emptied during setup, not created from scratch), so
// every fresh project already has that file present. Same non-empty check
// start-dev-loop's own orchestrator.config.json sanity check already uses,
// below — kept consistent on purpose.
//
// orchestrator.config.json alone isn't quite enough, though — it's written
// partway through Phase D, well BEFORE Phase E (the backlog, the actual
// last step) even starts. A session that got interrupted mid-Phase-E
// (confirmed live: an 8-minute turn timeout while writing agent CLAUDE.md
// files, or just the app being closed) already has a real
// orchestrator.config.json on disk, so this returned true and sent the
// human straight to "Ready to start" with .plan/000-backlog.md still the
// template's own unfilled worked example — no tasks, and no visible error,
// since the dashboard doesn't distinguish "no tasks because done" from "no
// tasks because setup never finished." NEW-PROJECT-SETUP-PROMPT.md's own
// last step (line ~251) deletes `.setup-progress.md` only once EVERY
// phase, including the backlog, is truly done — so requiring it to be gone
// too closes exactly that gap: still present means Phase E isn't finished,
// route back to resuming the chat instead of the dashboard, no matter how
// far Phase D got.
function isProjectConfigured(workspacePath) {
  const configPath = path.join(workspacePath, "orchestrator.config.json")
  if (!fs.existsSync(configPath)) return false
  if (fs.existsSync(path.join(workspacePath, ".setup-progress.md"))) return false
  try {
    return Object.keys(JSON.parse(fs.readFileSync(configPath, "utf-8"))).length > 1
  } catch {
    return false
  }
}

// Written the first time setup-chat-start actually runs for a workspace —
// lets a later run tell "this chat was started before, reconnect to that
// same Claude session via --continue" apart from "never started, send the
// real Part-1-opening message." Without this, reopening the app after
// closing it mid-interview looked like it "always starts over" (see chat
// history) — not because the underlying Claude session was lost (Claude
// Code keeps per-directory session history on its own), but because this
// app was unconditionally sending the fresh-start message every time
// instead of resuming.
const CHAT_STARTED_MARKER = ".electron-setup-chat-started"

function hasSetupChatStarted(workspacePath) {
  return fs.existsSync(path.join(workspacePath, CHAT_STARTED_MARKER))
}

// Small MRU list of previously-picked project folders — lets step 1 offer
// "continue one of these" instead of the human always having to re-browse
// to the exact same folder in the OS dialog, especially now that resuming
// an in-progress setup conversation actually works (see CHAT_STARTED_MARKER
// above) and is worth surfacing as a real one-click option.
const RECENT_PROJECTS_PATH = path.join(app.getPath("userData"), "recent-projects.json")
const MAX_RECENT_PROJECTS = 6

function loadRecentProjects() {
  try {
    const list = JSON.parse(fs.readFileSync(RECENT_PROJECTS_PATH, "utf-8"))
    // A path can vanish between runs (moved/deleted on disk) — drop those
    // rather than offer a dead shortcut that will just fail validation.
    return Array.isArray(list) ? list.filter((p) => fs.existsSync(p.path)) : []
  } catch {
    return []
  }
}

function recordRecentProject(folderPath) {
  const existing = loadRecentProjects().filter((p) => p.path !== folderPath)
  const updated = [{ path: folderPath, lastUsed: new Date().toISOString() }, ...existing].slice(0, MAX_RECENT_PROJECTS)
  fs.writeFileSync(RECENT_PROJECTS_PATH, JSON.stringify(updated, null, 2), "utf-8")
}

ipcMain.handle("get-recent-projects", () => loadRecentProjects())

// Removes a project from the recent list AND deletes everything this app
// itself created for it (the hidden workspace under userData/projects/<id>
// — orchestration machinery, task history, config, .plan/, everything
// ensureWorkspace() set up) — but never touches the visible folder the user
// picked, which holds their actual product code (frontend/backend). If the
// process is still running for this project, refuse rather than delete out
// from under it.
ipcMain.handle("delete-recent-project", (event, folderPath) => {
  const workspacePath = path.join(app.getPath("userData"), "projects", workspaceIdFor(folderPath))
  if (devLoopProcess && activeWorkspacePath === workspacePath) {
    return { error: "This project is currently running — stop it first." }
  }
  const updated = loadRecentProjects().filter((p) => p.path !== folderPath)
  fs.writeFileSync(RECENT_PROJECTS_PATH, JSON.stringify(updated, null, 2), "utf-8")
  try {
    if (fs.existsSync(workspacePath)) fs.rmSync(workspacePath, { recursive: true, force: true })
  } catch (e) {
    return { error: `Removed from the list, but couldn't delete its workspace data: ${e.message}` }
  }
  return { ok: true }
})

// Shared by both entry points into step 1 — browsing via the OS dialog and
// clicking a recent-project shortcut — so they report the exact same shape
// (valid/workspacePath/setupNeeded/resumeChat) and both update the MRU list.
function prepareProject(folderPath) {
  const check = validateProjectFolder(folderPath)
  if (!check.valid) return { path: folderPath, ...check }

  const { workspacePath } = ensureWorkspace(folderPath)
  const configured = isProjectConfigured(workspacePath)
  recordRecentProject(folderPath)
  return {
    path: folderPath,
    valid: true,
    workspacePath,
    setupNeeded: !configured,
    // Only meaningful when setupNeeded is true — the renderer's Step 1
    // shows the deterministic config-wizard screen first when this is true
    // (a fresh project, .setup-config.json not written yet), and skips
    // straight to the chat step when it's already been done (resuming a
    // project that got as far as the config wizard, or further, before the
    // app was last closed).
    configNeeded: !configured && !fs.existsSync(path.join(workspacePath, ".setup-config.json")),
    // Only meaningful when setupNeeded is true — tells the renderer whether
    // to send the fresh Part-1 opener or a plain "continue where we left
    // off" turn against the already-existing Claude session.
    resumeChat: !configured && hasSetupChatStarted(workspacePath),
  }
}

ipcMain.handle("pick-project-folder", async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ["openDirectory", "createDirectory"] })
  if (result.canceled || result.filePaths.length === 0) return null
  return prepareProject(result.filePaths[0])
})

ipcMain.handle("select-recent-project", (event, folderPath) => prepareProject(folderPath))

// Lets the chat step notice setup finishing on its own, instead of the human
// having to read the AI's closing message and manually re-navigate — see
// isProjectConfigured() above for exactly what "finished" means here.
ipcMain.handle("check-setup-complete", (event, workspacePath) => isProjectConfigured(workspacePath))

// Step 1's config-wizard screen (real radio buttons, no LLM) needs to know
// up front whether to show its git-branching question at all — `.git` is a
// filesystem fact, not a preference, checked the exact same way
// development/task-builder.js's own GIT_ENABLED does. Mirrors
// development/setup-wizard.js's CLI equivalent of this same check.
ipcMain.handle("check-git-status", (event, workspacePath) => {
  return fs.existsSync(path.join(workspacePath, ".git"))
})

// Lets the Setup Wizard's git-branching question offer "Initialize git now"
// instead of just telling a brand-new project (which obviously has no .git
// yet) to go do it in a terminal — same convenience task-builder.js's own
// runtime git-init prompt already gives. Runs inside workspacePath, not the
// visible folder, since that's where task-builder.js itself runs `git`
// commands from (frontend/backend are junctioned in, so git still sees them).
ipcMain.handle("init-git", (event, workspacePath) => {
  try {
    execSync("git init", { cwd: workspacePath, stdio: "ignore" })
    return { ok: true }
  } catch (e) {
    return { error: `git init failed: ${e.message}` }
  }
})

// Same detection development/task-builder.js's own checkLlmAccount() uses at
// build time (getLoggedInClaudeAccountEmail/getLoggedInCursorAccountEmail)
// — duplicated here rather than shared since main.js and task-builder.js are
// separate Node processes with no shared module today. Never launches a
// login flow itself, only reads whoever's already logged in; a real OAuth
// popup belongs to the chat step / task-builder.js's own attemptLogin(), not a
// background detection call.
// Confirmed live: this used to run all 5 of these as execSync — each one a
// real child process spawn that BLOCKS Electron's entire main process until
// it returns (no UI paint, no other IPC, nothing) — sequentially, on every
// single visit to the config wizard's LLM-account question and the AI
// Models step. On a machine where any of these CLIs is slow to start
// (PATH search, antivirus scanning the exe, a CLI that's just slow), that's
// several blocking spawns in a row on the one thread the whole app runs
// on — exactly what "the window goes gray, title says (Not Responding)"
// looks like. execFile (async) + Promise.all (parallel, not sequential)
// fixes both: the main process keeps pumping its event loop throughout, and
// the three checks overlap instead of queueing behind each other.
//
// `shell: true` is required on `claude`/`agent` specifically — confirmed
// live: both resolve to a `.cmd` batch shim on Windows (`where claude` ->
// ...\claude.cmd, `where agent` -> ...\agent.cmd), not a real .exe. execSync
// used to work here because it runs through a shell by default (which knows
// PATHEXT and can launch a .cmd); plain execFile does NOT — it calls
// CreateProcess directly, which can't launch a batch file with no shell
// involved, so account detection silently failed and reported "not logged
// in" even when it genuinely was. `gh` doesn't need this (it's a real
// gh.exe), but shell:true is harmless there too.
async function detectClaudeAccount() {
  try {
    await execFileAsync("claude", ["--version"], { shell: true, windowsHide: true })
    const { stdout } = await execFileAsync("claude", ["auth", "status", "--json"], { shell: true, windowsHide: true })
    const parsed = JSON.parse(stdout)
    return parsed?.loggedIn ? (parsed.email || null) : null
  } catch {
    return null // not installed, not logged in, or unparseable output
  }
}
async function detectCursorAccount() {
  try {
    await execFileAsync("agent", ["--version"], { shell: true, windowsHide: true })
    const { stdout } = await execFileAsync("agent", ["status", "--format", "json"], { shell: true, windowsHide: true })
    const parsed = JSON.parse(stdout)
    return parsed?.isAuthenticated ? (parsed.userInfo?.email || null) : null
  } catch {
    return null
  }
}
// Reference-only — see development/setup-wizard.js's
// getLoggedInGithubCopilotAccount() for why this is a GitHub *username*
// (via `gh auth status`, not Copilot CLI itself, which has no `auth
// status`) and why it's never treated as pinnable the way claude/cursor
// are: task-builder.js has no headless invocation for `copilot` to actually
// run agents through, unlike Claude's `-p` or Cursor's `agent -p`.
async function detectGithubCopilotAccount() {
  try {
    const { stdout } = await execFileAsync("gh", ["auth", "status", "--json", "hosts"], { shell: true, windowsHide: true })
    const entries = JSON.parse(stdout)?.hosts?.["github.com"] || []
    const active = entries.find((e) => e.active)
    return active && !active.error && active.state !== "error" ? (active.login || null) : null
  } catch {
    return null // gh not installed / not authenticated / unparseable
  }
}

ipcMain.handle("detect-llm-accounts", async () => {
  const [claude, cursor, githubCopilot] = await Promise.all([
    detectClaudeAccount(),
    detectCursorAccount(),
    detectGithubCopilotAccount(),
  ])
  return { claude, cursor, githubCopilot }
})

// Backs the "AI Models" step's live Cursor-model validation. `agent models`
// (confirmed real via `agent --help` -> `models  List available models for
// this account`) is the only model-listing source either CLI actually
// offers — Claude Code has no equivalent, which is why that step's Claude
// rows are plain free text with no live check. Output is plain text, one
// `<id> - <Display Name>` per line after a blank "Available models" header
// line — no --json flag exists (checked `agent models --help`), so this is
// parsed by hand rather than JSON.parsed.
ipcMain.handle("list-cursor-models", async () => {
  try {
    const { stdout } = await execFileAsync("agent", ["models"], { shell: true, windowsHide: true }) // async + shell:true — see detectClaudeAccount()'s own comment above
    const models = []
    for (const line of stdout.split("\n")) {
      const match = line.match(/^([^\s]+)\s+-\s+(.+)$/)
      if (match) models.push({ id: match[1].trim(), label: match[2].trim() })
    }
    return { models }
  } catch (e) {
    return { error: e.message }
  }
})

// development/model-config.json — read/write straight from the workspace's
// own copy (ensureWorkspace() already put one there from the bundled
// template) so the "AI Models" step edits the exact file task-builder.js's
// own modelFor() reads, not a separate copy that could drift.
ipcMain.handle("read-model-config", (event, workspacePath) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(workspacePath, "development", "model-config.json"), "utf-8"))
  } catch {
    return null
  }
})

ipcMain.handle("write-model-config", (event, { workspacePath, config }) => {
  try {
    fs.writeFileSync(path.join(workspacePath, "development", "model-config.json"), JSON.stringify(config, null, 2) + "\n", "utf-8")
    return { ok: true }
  } catch (e) {
    return { error: e.message }
  }
})

// The Electron equivalent of development/setup-wizard.js — same questions,
// same deterministic outputs (.setup-config.json, .setup-secrets.json's
// MONGODB_URI, the conditional file deletions that don't need product
// judgment), just collected via the renderer's radio-button form instead of
// a terminal prompt. Keep both in sync if either changes — see that file's
// own header comment for why these particular questions live here and not
// in the LLM chat step.
// Fired on every change in the config-wizard form (see renderer.js's
// saveConfigDraft()) so .setup-config.json on disk never goes stale while
// someone is still filling the form out or revisiting an earlier answer —
// deliberately just the plain write, none of write-setup-config's side
// effects (.setup-secrets.json, the conditional file deletions), which
// only make sense once, on actual submit, not replayed on every keystroke.
// Lets the config-wizard screen prefill from whatever was already answered
// — needed for "⚙️ Edit Setup" (see renderer.js's openConfigStep()), which
// reopens this screen after it's already been completed once, and must
// show the existing answers instead of resetting everyone back to defaults.
// Backs the run-area's "⚙️ Edit Setup" panel (see renderer.js's
// live-gates-* elements) — the ONLY three orchestrator.config.json fields
// that still mean something once task-builder.js is already running (it
// re-reads them fresh on every check — see task-builder.js's
// getAutoApprovePlans()/getAutoMergeTasks()/getCreateBranchPerTask()), as
// opposed to the full Step 2 config wizard, which edits .setup-config.json
// and is already fully consumed by the time a project reaches this stage.
ipcMain.handle("read-live-gates", (event, workspacePath) => {
  const configPath = path.join(workspacePath, "orchestrator.config.json")
  if (!fs.existsSync(configPath)) return null
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf-8"))
    return {
      autoApprovePlans: Boolean(parsed.autoApprovePlans),
      autoMergeTasks: Boolean(parsed.autoMergeTasks),
      createBranchPerTask: parsed.createBranchPerTask !== false,
    }
  } catch {
    return null
  }
})

// Replaces the small notification-dot badge Windows draws on the taskbar
// icon with a per-agent glyph, so it's visible which agent is currently
// running without switching to this window. setOverlayIcon is Windows-only
// (undefined on other platforms) — the renderer still renders the canvas
// dataURL either way, this handler just no-ops there. A null dataUrl clears
// the overlay back to nothing (task-builder.js stopped/exited).
ipcMain.handle("set-taskbar-overlay", (event, { dataUrl, description }) => {
  const debugLog = path.join(app.getPath("userData"), "taskbar-overlay-debug.log")
  const line = (msg) => { try { fs.appendFileSync(debugLog, `${new Date().toISOString()} ${msg}\n`) } catch {} }
  line(`invoked, dataUrl=${dataUrl ? "present" : "null"}, mainWindow=${Boolean(mainWindow)}, hasFn=${typeof mainWindow?.setOverlayIcon === "function"}`)
  if (typeof mainWindow?.setOverlayIcon !== "function") return
  try {
    mainWindow.setOverlayIcon(dataUrl ? nativeImage.createFromDataURL(dataUrl) : null, description || "")
    line("setOverlayIcon call completed with no exception")
  } catch (e) {
    line(`setOverlayIcon threw: ${e.message}`)
  }
})

ipcMain.handle("write-live-gates", (event, { workspacePath, gates }) => {
  const configPath = path.join(workspacePath, "orchestrator.config.json")
  const existing = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, "utf-8")) : {}
  const updated = {
    ...existing,
    autoApprovePlans: gates.autoApprovePlans,
    autoMergeTasks: gates.autoMergeTasks,
    createBranchPerTask: gates.createBranchPerTask,
  }
  fs.writeFileSync(configPath, JSON.stringify(updated, null, 2) + "\n", "utf-8")
  return { ok: true }
})

// Backs the "Picking up where we left off…" resume message (see
// renderer.js's proceedToChat()) — instead of that bare placeholder with no
// content, show what Claude actually understood about the product so far.
// .setup-progress.md already holds exactly this (its own documented
// format, from NEW-PROJECT-SETUP-PROMPT.md's "Resuming" section: a "## Part
// 1 answers" section, one line per question, written once Part 1 is
// confirmed) — reading it directly is free (no extra LLM call) and more
// reliable than asking Claude to regenerate a summary from a session it's
// only just resuming.
// Backs the chat step's "📄 View Files" panel — lets a human watch the
// files Claude is actually drafting about THEIR OWN product (PRD,
// architecture notes, glossary) without leaving this window to dig through
// the hidden internal workspace (see ensureWorkspace() — it's not the
// visible project folder the human picked, only frontend/backend are
// junctioned out there). Read-only, and deliberately scoped to
// project-specific content only — NOT .claude/skills, .rule, or agents/,
// which are this app's own reusable orchestration engine (the same files,
// close to verbatim, in every project it builds). Exposing those through an
// in-app browser would let anyone running the packaged EXE casually copy
// out the prompt engineering this whole tool is built on, for zero reason a
// legitimate end user would ever need it. This doesn't make those files
// secret (they still sit in plain text under the app's own userData
// directory, since the LLM CLI has to read them directly) — it just removes
// the easy in-app path to them. `.plan` (the backlog) belongs here too —
// it's the human's own TODO queue for THIS project, generated from their
// own product description, exactly the kind of project-specific content
// this panel exists to show (NEW-PROJECT-SETUP-PROMPT.md's own Phase E
// section says to "present it to the user for review" once written — this
// is how they'd actually see it, since the setup chat's own recap only
// ever gave a task count, never the task list itself).
const VIEWABLE_FILE_DIRS = ["docs", ".doc", ".plan"]

// Pure internal bookkeeping under docs/ — live status ticker, raw dev-server
// output (ANSI escape codes, unreadable as plain text), per-task resume
// state, cost dumps already shown properly in the dashboard's own COST tab.
// None of this is project content a user would recognize or want to read;
// it's noise that just crowds out the real files (PRD, design, api-contract,
// agent-reports) in the list.
const HIDDEN_DOC_PATHS = ["docs/agent-status.json", "docs/frontend-dev-server.log"]
const HIDDEN_DOC_DIR_PREFIXES = ["docs/task-state/", "docs/cost/"]
function isHiddenDocFile(relPath) {
  return HIDDEN_DOC_PATHS.includes(relPath) || HIDDEN_DOC_DIR_PREFIXES.some((prefix) => relPath.startsWith(prefix))
}

function listProjectFilesRecursive(dir, baseDir, out) {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      listProjectFilesRecursive(full, baseDir, out)
    } else {
      out.push(path.relative(baseDir, full).split(path.sep).join("/"))
    }
  }
}

// A file the setup process hasn't actually drafted yet is still the raw
// template copy — NEW-PROJECT-SETUP-PROMPT.md's own convention is an HTML
// comment instruction block starting "TEMPLATE — ..." right after the
// heading, which every file-drafting step is explicitly told to delete once
// that file is actually filled in. Checking just the first ~500 chars (not
// the whole file) keeps this cheap and avoids a false match on some
// unrelated later mention of the word "template" in real written content.
function isStillTemplate(fullPath) {
  try {
    const head = fs.readFileSync(fullPath, "utf-8").slice(0, 500)
    return /TEMPLATE\s*[—-]/.test(head)
  } catch {
    return false
  }
}

ipcMain.handle("list-project-files", (event, workspacePath) => {
  const out = []
  for (const dir of VIEWABLE_FILE_DIRS) {
    listProjectFilesRecursive(path.join(workspacePath, dir), workspacePath, out)
  }
  return out
    .filter((relPath) => !isHiddenDocFile(relPath) && !isStillTemplate(path.join(workspacePath, relPath)))
    .sort()
})

ipcMain.handle("read-project-file", (event, { workspacePath, relPath }) => {
  const root = path.resolve(workspacePath)
  const full = path.resolve(workspacePath, relPath)
  // Must resolve to somewhere inside the workspace — blocks ../ escaping
  // out to read arbitrary files on the human's machine via a crafted path.
  if (!full.startsWith(root + path.sep) && full !== root) return { error: "Invalid path." }
  if (!fs.existsSync(full)) return { error: "File not found." }
  try {
    return { content: fs.readFileSync(full, "utf-8") }
  } catch (e) {
    return { error: e.message }
  }
})

ipcMain.handle("read-part1-summary", (event, workspacePath) => {
  const progressPath = path.join(workspacePath, ".setup-progress.md")
  if (!fs.existsSync(progressPath)) return null
  try {
    const text = fs.readFileSync(progressPath, "utf-8")
    const match = text.match(/## Part 1 answers[^\n]*\n([\s\S]*?)(?:\n##\s|$)/)
    return match ? match[1].trim() : null
  } catch {
    return null
  }
})

ipcMain.handle("read-setup-config", (event, workspacePath) => {
  const configPath = path.join(workspacePath, ".setup-config.json")
  if (!fs.existsSync(configPath)) return null
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf-8"))
  } catch {
    return null
  }
})

ipcMain.handle("save-config-draft", (event, { workspacePath, config }) => {
  fs.writeFileSync(path.join(workspacePath, ".setup-config.json"), JSON.stringify(config, null, 2) + "\n", "utf-8")
  return { ok: true }
})

ipcMain.handle("write-setup-config", (event, { workspacePath, config }) => {
  if (config.mongoUri) {
    const secretsPath = path.join(workspacePath, ".setup-secrets.json")
    const existing = fs.existsSync(secretsPath) ? JSON.parse(fs.readFileSync(secretsPath, "utf-8")) : {}
    existing.MONGODB_URI = config.mongoUri
    fs.writeFileSync(secretsPath, JSON.stringify(existing, null, 2) + "\n", "utf-8")
  }

  const rm = (relPath) => {
    const full = path.join(workspacePath, relPath)
    if (fs.existsSync(full)) fs.rmSync(full, { recursive: true, force: true })
  }
  if (!config.targetsNative) rm(".claude/skills/native-navigation-layer")
  if (config.designSource !== "Designer agent") rm("agents/designer/CLAUDE.md")
  if (config.issueTracker !== "Linear") rm("team-members.json")

  fs.writeFileSync(path.join(workspacePath, ".setup-config.json"), JSON.stringify(config, null, 2) + "\n", "utf-8")
  return { ok: true }
})

// Matches development/task-builder.js's own quoteArgForCmd() exactly (doubled
// internal quotes, not backslash-escaped) — cmd.exe's quoting rules are not
// the same as POSIX shells', and this is the proven-working form already
// used everywhere else `claude` gets spawned via a Windows shell in this
// codebase.
function quoteArgForCmd(value) {
  const s = String(value)
  if (!/[\s"]/u.test(s)) return s
  return `"${s.replace(/"/g, '""')}"`
}

// On Windows, `claude` is a .cmd shim — spawning it directly (no shell)
// intermittently fails to resolve on PATH, the same reason
// development/task-builder.js's own spawnClaude() always goes through a shell
// on win32. Mirrored here rather than reusing that function directly, since
// this runs BEFORE task-builder.js exists anywhere writable (the setup
// interview happens pre-workspace-configured).
//
// A hard timeout is essential here specifically because this runs from
// Electron's own main process, not a terminal a human is watching — if the
// child hangs (wrong PATH, an unexpected permission prompt, anything), the
// renderer's "…" would otherwise wait forever with zero information. Killing
// it and surfacing that clearly beats a silent infinite spinner.
//
// 90s was too short for real use: once the interview reaches "confirm and
// I'll start drafting," Claude isn't just answering a question anymore, it's
// actually writing files to disk (PRD, glossary, rule files, ...) -- a much
// heavier turn that legitimately runs past a minute and a half. A false
// timeout there kills real, in-progress work, not a hang. 8 minutes is a
// generous ceiling for a single turn; a genuine hang still gets caught, just
// later, and a real drafting turn no longer gets mistaken for one.
const CLAUDE_TURN_TIMEOUT_MS = 8 * 60 * 1000

// A tool_use block's own name -> what to show the human while it runs.
// Anything not listed here (Read, Bash, Grep, ...) just isn't worth
// surfacing as a distinct progress line -- only the "I'm writing your files"
// signal is what "is it stuck?" is actually asking about.
const PROGRESS_TOOL_LABELS = { Write: "Writing", Edit: "Editing" }

// Pure internal bookkeeping this app/the setup process itself maintains —
// never a real deliverable file, so a raw "Editing .setup-progress.md…"
// progress line is just confusing (why is it "editing progress" — that
// isn't a project file at all). Suppressed entirely rather than shown.
const INTERNAL_PROGRESS_FILES = new Set([".setup-progress.md", ".setup-config.json", ".setup-secrets.json", ".electron-setup-chat-started"])

// Turns a bare "Writing docs/PRD.md…" progress line into "Writing docs/PRD.md
// (4 of 30)…" by finding that same path in .setup-progress.md's own `##
// Files` list (see NEW-PROJECT-SETUP-PROMPT.md's Resuming section for its
// format) — the single source of truth for how many files this setup run
// covers and where the current one falls in that order. Returns the plain
// label unchanged if that section doesn't exist yet (Part 1, before any
// real file has been seeded) or the path isn't found in it.
function progressLabelWithCount(workspacePath, label, relPath) {
  try {
    const progressPath = path.join(workspacePath, ".setup-progress.md")
    if (!fs.existsSync(progressPath)) return label
    const text = fs.readFileSync(progressPath, "utf-8")
    const filesMatch = text.match(/## Files\n([\s\S]*)/)
    if (!filesMatch) return label
    const lines = filesMatch[1].split("\n").filter((l) => /^-\s*\[/.test(l))
    if (lines.length === 0) return label
    // .setup-progress.md always uses forward slashes (it's Markdown, not a
    // Windows path) — normalize before comparing, since path.relative()
    // returns backslash-separated segments on Windows and would otherwise
    // never match.
    const normalizedRelPath = relPath.split(path.sep).join("/")
    const idx = lines.findIndex((l) => l.includes(normalizedRelPath))
    if (idx === -1) return label
    return `${label} (${idx + 1} of ${lines.length})`
  } catch {
    return label
  }
}

// Streams `--output-format stream-json` (same format/shape
// development/task-builder.js's own spawnClaude() already parses) instead of
// waiting for one plain-text blob at the end -- lets onProgress fire in
// real time as Claude actually writes files, e.g. "Writing docs/PRD.md…",
// instead of a static "Thinking…" that gives no sign of life during a long
// drafting turn.
function runClaudeTurn(workspacePath, args, inputText, onProgress) {
  return new Promise((resolve) => {
    const streamArgs = [...args, "--verbose", "--output-format", "stream-json"]
    const commandString = ["claude", ...streamArgs.map(quoteArgForCmd)].join(" ")
    // Prints straight to the terminal `npm start` is running in — this is
    // the fastest way to tell "child never spawned" apart from "spawned but
    // hung" apart from "IPC never even reached main.js" while debugging
    // live, without needing DevTools open.
    console.log(`[setup-chat] spawning in ${workspacePath}: ${commandString}`)

    const child =
      process.platform === "win32"
        ? spawn(commandString, { cwd: workspacePath, stdio: ["pipe", "pipe", "pipe"], shell: true, windowsHide: true })
        : spawn("claude", streamArgs, { cwd: workspacePath, stdio: ["pipe", "pipe", "pipe"], shell: false })

    console.log(`[setup-chat] spawned, pid=${child.pid}`)

    let assistantText = ""
    let resultText = null
    let err = ""
    let settled = false
    let capturedSessionId = null
    const settle = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      console.log(`[setup-chat] settled: code=${result.code} out.length=${result.out.length} err=${result.err.slice(0, 300)}`)
      resolve(result)
    }
    // An idle timeout, not a flat per-turn ceiling: a real drafting turn that
    // batches many files ("fill all 12 skill files in parallel") keeps
    // emitting stream-json events (assistant text, tool_use) the whole time
    // it's working, so it's making progress even past 8 minutes — killing it
    // anyway just discarded real work and forced a --continue retry that ran
    // straight back into the same wall on the next batch. Resetting the timer
    // on every event means the process only dies when it's actually gone
    // silent for CLAUDE_TURN_TIMEOUT_MS, which is what "hung" should mean.
    let timer
    const armTimer = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        console.log(`[setup-chat] TIMEOUT firing, killing pid=${child.pid}`)
        killProcessTree(child)
        settle({ out: "", err: `Timed out after ${CLAUDE_TURN_TIMEOUT_MS / 1000}s with no response. Raw output so far: ${assistantText || "(none)"} / stderr: ${err || "(none)"}`, code: -1 })
      }, CLAUDE_TURN_TIMEOUT_MS)
    }
    armTimer()

    const rl = createInterface({ input: child.stdout })
    rl.on("line", (line) => {
      if (settled || !line.trim()) return
      let event
      try { event = JSON.parse(line) } catch { return }
      armTimer()
      if (event.session_id) capturedSessionId = event.session_id

      if (event.type === "assistant" && Array.isArray(event.message?.content)) {
        for (const block of event.message.content) {
          if (block.type === "text" && block.text) {
            assistantText += block.text + "\n"
          } else if (block.type === "tool_use" && PROGRESS_TOOL_LABELS[block.name]) {
            const filePath = block.input?.file_path || block.input?.path
            if (filePath && onProgress) {
              const relPath = path.relative(workspacePath, filePath) || filePath
              if (!INTERNAL_PROGRESS_FILES.has(relPath)) {
                onProgress(`${progressLabelWithCount(workspacePath, `${PROGRESS_TOOL_LABELS[block.name]} ${relPath}`, relPath)}…`)
              }
            }
          }
        }
      }
      if (event.type === "result") resultText = event.result ?? assistantText
    })

    child.stderr.on("data", (d) => { err += d.toString(); console.log(`[setup-chat] stderr chunk: ${d.toString().slice(0, 200)}`) })
    child.on("close", (code) => {
      const out = (resultText ?? assistantText).trim()
      settle({ out, err: err.trim(), code: resultText !== null ? 0 : code, sessionId: capturedSessionId })
    })
    child.on("error", (e) => { console.log(`[setup-chat] spawn error event: ${e.message}`); settle({ out: "", err: e.message, code: -1 }) })
    child.stdin.write(inputText)
    child.stdin.end()
  })
}

// First turn of the setup interview — establishes a real Claude Code
// session in workspacePath (development/NEW-PROJECT-SETUP-PROMPT.md is the
// system prompt) that `setup-chat-send` below continues via `--continue`.
// This is the ONLY place the human-facing side of onboarding happens —
// nothing about task-builder.js, agents, or the template is ever named to them;
// the chat is just "tell me about your app."
// --permission-mode bypassPermissions is not optional here — without it,
// the moment Claude tries to actually read/write a file (which the setup
// interview does constantly, per its own instructions), the CLI blocks
// waiting for an interactive y/n permission prompt that can never arrive
// over a plain piped stdin/stdout — the process just hangs forever with no
// error, which is exactly what silently happened before this was added
// (task-builder.js's own spawnClaude() already learned this lesson — see
// CLAUDE_PERMISSION_MODE — this mirrors it instead of re-discovering it).
const SETUP_CHAT_ARGS = ["--print", "--permission-mode", "bypassPermissions"]

// The setup prompt's own instructions describe asking questions via an
// interactive structured-question tool (mirroring how a real Claude Code
// session would) — which genuinely doesn't exist in this one-shot --print
// mode. Left unprompted, Claude notices, tries it, and narrates the failure
// ("It seems the interactive question tool isn't available...") before
// falling back to plain text — meta-commentary a human using this chat has
// no reason to see. Telling it up front skips the failed attempt entirely,
// not just its explanation.
// Also asks for a machine-readable CHOICES line on any small-fixed-set
// question, instead of leaving the renderer to guess option boundaries out
// of however Claude happens to phrase them in prose (a bulleted list one
// time, "**A** or **B**?" inline the next, RTL/Hebrew phrasing reordering
// the markdown asterisks visually in ways that broke naive parsing — see
// chat history). This sidesteps all of that: renderer.js just looks for a
// line starting with "CHOICES:" and strips it from what's actually shown.
const SETUP_CHAT_FIRST_MESSAGE = [
  "Let's begin. Start with Part 1's questions.",
  "Note: there is no interactive question tool available in this session — ask every question as plain text in your response, never attempt to invoke one.",
  'Whenever a question has a small fixed set of options (e.g. a yes/no or A-vs-B choice), end your response with one extra line in exactly this format: CHOICES: Option one | Option two | Option three (2-6 options, each a short label in the same language as your question, no markdown formatting on that line). Every option must be a direct answer to the question you just asked in this same message — never list filenames, file paths, or other items you just mentioned/reviewed as if they were answer choices, even if your message discussed several of them; a "review this batch of files, approve or flag changes" message still gets exactly one CHOICES line answering THAT question (e.g. CHOICES: Approved, no changes | I have changes), not one option per file. Omit the CHOICES line entirely for open-ended questions with no fixed options.',
].join(" ")

function sendChatProgress(text) {
  mainWindow?.webContents.send("setup-chat-progress", text)
}

// `--continue` isn't "reconnect to a specific conversation" — it's "resume
// the most recent session in this cwd," full stop. That's a real bug here:
// once real build work starts, development/task-builder.js's own agents
// (runAgent() in task-builder.js) spawn their OWN `claude` sessions with the
// exact same cwd (process.cwd() === this same workspacePath) — so the moment
// any agent turn runs AFTER the setup interview's last turn, "most recent
// session in this cwd" silently stops meaning the setup interview at all.
// Confirmed live: reopening the app mid-build routed back into this chat
// (since .setup-progress.md hadn't been cleaned up yet), sent the resume
// nudge below, and Claude just carried on the Frontend Agent's actual
// Task-1 scaffold work (writing real components) instead of the interview —
// because that, not the interview, was genuinely the most recent session in
// that directory.
//
// Fix: every stream-json event carries the CLI's own real session_id
// (runClaudeTurn captures it as result.sessionId) — persist that after each
// successful turn and always resume with --resume <that exact id> instead of
// bare --continue, so this chat stays pinned to itself no matter what else
// has run in the same cwd since. A project whose chat was already started
// before this fix has no saved id yet; the very first resume/send call below
// falls back to --continue for that one call (same as the old behavior,
// nothing worse), but captures and saves whatever session id comes back, so
// every call after that is correctly pinned.
const SETUP_CHAT_SESSION_ID_FILE = ".setup-chat-session-id"

function readSetupChatSessionId(workspacePath) {
  try {
    return fs.readFileSync(path.join(workspacePath, SETUP_CHAT_SESSION_ID_FILE), "utf-8").trim() || null
  } catch {
    return null
  }
}

function saveSetupChatSessionId(workspacePath, sessionId) {
  if (!sessionId) return
  fs.writeFileSync(path.join(workspacePath, SETUP_CHAT_SESSION_ID_FILE), sessionId, "utf-8")
}

ipcMain.handle("setup-chat-start", async (event, workspacePath) => {
  const result = await runClaudeTurn(
    workspacePath,
    [...SETUP_CHAT_ARGS, "--system-prompt", "development/NEW-PROJECT-SETUP-PROMPT.md"],
    SETUP_CHAT_FIRST_MESSAGE,
    sendChatProgress,
  )
  if (result.code === 0) {
    fs.writeFileSync(path.join(workspacePath, CHAT_STARTED_MARKER), new Date().toISOString(), "utf-8")
    saveSetupChatSessionId(workspacePath, result.sessionId)
  }
  return result.code === 0 ? { text: result.out } : { error: result.err || `Exited with code ${result.code}` }
})

// Reconnects to the SAME Claude Code session setup-chat-start began, by its
// saved session id (see above) rather than bare --continue's ambiguous
// "most recent in this cwd" — instead of sending the fresh Part-1-opening
// message again, which would otherwise look indistinguishable from actually
// restarting the interview from scratch. Used when pick-project-folder
// reports resumeChat: true.
ipcMain.handle("setup-chat-resume", async (event, workspacePath) => {
  const sessionId = readSetupChatSessionId(workspacePath)
  const result = await runClaudeTurn(
    workspacePath,
    [...SETUP_CHAT_ARGS, ...(sessionId ? ["--resume", sessionId] : ["--continue"])],
    "Continue exactly where we left off — re-ask your last question if you need to, don't restart the interview.",
    sendChatProgress,
  )
  if (result.code === 0) saveSetupChatSessionId(workspacePath, result.sessionId)
  return result.code === 0 ? { text: result.out } : { error: result.err || `Exited with code ${result.code}` }
})

ipcMain.handle("setup-chat-send", async (event, { workspacePath, message }) => {
  const sessionId = readSetupChatSessionId(workspacePath)
  const result = await runClaudeTurn(
    workspacePath,
    [...SETUP_CHAT_ARGS, ...(sessionId ? ["--resume", sessionId] : ["--continue"])],
    message,
    sendChatProgress,
  )
  if (result.code === 0) saveSetupChatSessionId(workspacePath, result.sessionId)
  return result.code === 0 ? { text: result.out } : { error: result.err || `Exited with code ${result.code}` }
})

// True from the moment start-dev-loop claims the lock until either the real
// child process is assigned to devLoopProcess or a failure path releases it.
// Needed because the check below (`if (devLoopProcess) return ...`) is
// synchronous, but the actual `devLoopProcess = spawn(...)` assignment only
// happens after `await ensureLocalMongoRunning(...)` further down — two
// start-dev-loop IPC calls arriving close together (confirmed live: this is
// exactly how task-builder.js ended up running TWICE at once, each spawning
// its own full set of backend dev servers on the same ports) both see
// devLoopProcess still null and both pass the guard, since neither has
// reached the assignment yet. Claiming this flag synchronously, before any
// await, closes that window; devLoopStartingLock itself is never awaited on,
// only checked/set/cleared synchronously, so there's no equivalent race on it.
let devLoopStartingLock = false

ipcMain.handle("start-dev-loop", async (event, visibleFolderPath) => {
  if (devLoopProcess) {
    // Re-deliver the dashboard URL right now, synchronously — the renderer
    // that's asking is a fresh page load (or it wouldn't be asking to
    // start something that's already running) with no listener race to
    // worry about, unlike the original forwardChunk() send which only
    // fires once, the moment the banner is first seen.
    if (lastDashboardUrl) mainWindow?.webContents.send("dev-loop-dashboard-url", lastDashboardUrl)
    return { started: true, alreadyRunning: true }
  }
  if (devLoopStartingLock) return { started: false, reason: "task-builder.js is already running." }
  devLoopStartingLock = true

  const check = validateProjectFolder(visibleFolderPath)
  if (!check.valid) {
    devLoopStartingLock = false
    return { started: false, reason: check.reason }
  }

  const { workspacePath } = ensureWorkspace(visibleFolderPath)

  // Sanity check before ever spawning: a real, completed setup writes a
  // multi-key orchestrator.config.json (designSource, backendServices,
  // autoApprovePlans, ...). A file with only 0-1 keys means something went
  // wrong writing it (seen for real: task-builder.js's own
  // adoptApprovalModeFromSetup() overwrote a genuinely complete config with
  // a bare {"autoApprovePlans": true} stub, and every question this app
  // asks afterward silently used wrong defaults — designSource missing
  // meant "no Designer agent" even though one was actually configured. This
  // catches that class of bug before it wastes a real build run instead of
  // after.
  const configPath = path.join(workspacePath, "orchestrator.config.json")
  let orchestratorConfig = {}
  if (fs.existsSync(configPath)) {
    try { orchestratorConfig = JSON.parse(fs.readFileSync(configPath, "utf-8")) } catch { /* treated as empty below */ }
  }
  if (Object.keys(orchestratorConfig).length <= 1) {
    devLoopStartingLock = false
    return {
      started: false,
      reason: `orchestrator.config.json at ${configPath} looks incomplete (only ${Object.keys(orchestratorConfig).length} key(s)) — setup may not have finished writing it correctly. Check that file before starting.`,
    }
  }

  // Read directly instead of letting task-builder.js's own
  // adoptApprovalModeFromSetup() infer/write it — passing it explicitly via
  // env makes that function's own early-return trigger (see
  // `process.env.AUTO_APPROVE_PLANS != null`), skipping its write path
  // entirely. This app already knows the real answer (from the SAME
  // .setup-progress.md that function would otherwise re-parse) with no risk
  // of the race that corrupted the config above.
  let approvalMode = null
  const progressPath = path.join(workspacePath, ".setup-progress.md")
  if (fs.existsSync(progressPath)) {
    const match = fs.readFileSync(progressPath, "utf-8").match(/^Approval mode:\s*(gated|ungated)/im)
    if (match) approvalMode = match[1].toLowerCase()
  }

  // stdin is piped (not ignored) as a FALLBACK path only — task-builder.js's
  // terminal prompts (askUserInput) are normally answered through its own
  // dashboard /respond endpoint (see task-builder.js's pendingHumanInput) once
  // the <webview> below loads it. But the dashboard server can fail to
  // start entirely (confirmed live: a previous run's orphaned node.exe was
  // still holding port 4949, so this run's own dashboard never bound, and
  // a human was stuck staring at a "git init? (y/N)" prompt in the
  // read-only log with no way to answer it at all). See the
  // "send-dev-loop-input" handler below, wired to the log view's own
  // fallback input box in the renderer.
  // The "use local db" wizard choice only ever WRITES a localhost connection
  // string — it doesn't itself guarantee anything is actually listening
  // there (that used to require the wizard's own optional "Start the
  // built-in local database now" button, easy to miss/skip since nothing
  // else ever started it). Starting it here instead, automatically, right
  // before every run, means the choice a user made during setup actually
  // works whether or not they remembered that button.
  try {
    const secretsPath = path.join(workspacePath, ".setup-secrets.json")
    const secrets = fs.existsSync(secretsPath) ? JSON.parse(fs.readFileSync(secretsPath, "utf-8")) : {}
    const mongoUri = secrets.MONGODB_URI || ""
    if (/^mongodb:\/\/(127\.0\.0\.1|localhost):27017\//.test(mongoUri)) {
      await ensureLocalMongoRunning(workspacePath)
    }
  } catch (e) {
    devLoopStartingLock = false
    return { started: false, reason: `Couldn't start the local database: ${e.message}` }
  }

  activeWorkspacePath = workspacePath
  // Spawning real "node" here means task-builder.js's own process is a
  // genuine console-subsystem executable — `windowsHide` is supposed to
  // suppress its window, but confirmed live: on a machine with Windows 11's
  // "Default terminal application" set to Windows Terminal (the out-of-the-
  // box default), Windows Terminal has a known bug where it does NOT
  // reliably honor CREATE_NO_WINDOW (what `windowsHide` maps to) — the
  // window shows anyway. That's a per-machine OS setting no packaged app can
  // ship a fix for or expect an end user to go change.
  // The real fix: run task-builder.js under Electron's OWN binary instead of
  // a separate node.exe. `ELECTRON_RUN_AS_NODE=1` makes this exact
  // executable (`process.execPath` — electron.exe in dev, or this app's own
  // packaged .exe once built) behave as a plain, fully Node-compatible
  // runtime (same technique VS Code and other Electron apps use) — but it's
  // a GUI-subsystem binary, not a console-subsystem one, so Windows never
  // allocates it a console window in the first place, regardless of the
  // Windows Terminal setting. task-builder.js's OWN child spawns for the
  // frontend/backend dev servers already invoke `process.execPath` directly
  // (see ensureFrontendDevServerRunning/ensureBackendServicesRunning) and
  // already spread `...process.env` into their own env — so both
  // `process.execPath` and `ELECTRON_RUN_AS_NODE` propagate down to those
  // automatically, fixing their windows too, not just this outer one.
  devLoopProcess = spawn(process.execPath, ["development/task-builder.js"], {
    cwd: workspacePath,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      // DEV_LOOP_NO_AUTO_OPEN: this window's own <webview> already shows the
      // dashboard (see onDashboardUrl below) — without this, task-builder.js also
      // pops the same page open in the system's default browser, which is
      // exactly the "why is Chrome opening" confusion this flag exists to
      // avoid entirely.
      DEV_LOOP_NO_AUTO_OPEN: "1",
      ...(approvalMode ? { AUTO_APPROVE_PLANS: approvalMode === "ungated" ? "true" : "false" } : {}),
    },
  })
  devLoopStartingLock = false

  let dashboardUrlSent = false
  const forwardChunk = (chunk) => {
    const text = chunk.toString()
    mainWindow?.webContents.send("dev-loop-log", text)
    if (!dashboardUrlSent) {
      const match = text.match(DASHBOARD_URL_PATTERN)
      if (match) {
        dashboardUrlSent = true
        lastDashboardUrl = match[1]
        mainWindow?.webContents.send("dev-loop-dashboard-url", match[1])
      }
    }
  }
  devLoopProcess.stdout.on("data", forwardChunk)
  devLoopProcess.stderr.on("data", forwardChunk)

  devLoopProcess.on("exit", (code) => {
    mainWindow?.webContents.send("dev-loop-exit", code)
    devLoopProcess = null
    activeWorkspacePath = null
    lastDashboardUrl = null
  })
  devLoopProcess.on("error", (err) => {
    mainWindow?.webContents.send("dev-loop-log", `\n[electron] Failed to launch task-builder.js: ${err.message}\n`)
    devLoopProcess = null
    activeWorkspacePath = null
    lastDashboardUrl = null
  })

  return { started: true }
})

// Fallback for when task-builder.js's own dashboard never loaded into the
// <webview> (its server failed to bind, or hasn't started yet this early
// in the run) — the log view's own input box sends straight to this
// process's stdin, exactly what a terminal running task-builder.js directly
// would do. Text, not JSON — task-builder.js's askUserInput() reads plain
// readline lines.
ipcMain.handle("send-dev-loop-input", (event, text) => {
  if (!devLoopProcess || !devLoopProcess.stdin.writable) return { sent: false }
  devLoopProcess.stdin.write(text + "\n")
  return { sent: true }
})

ipcMain.handle("stop-dev-loop", () => {
  if (!devLoopProcess) return { stopped: false, reason: "Not running." }
  killProcessTree(devLoopProcess)
  devLoopProcess = null
  activeWorkspacePath = null
  return { stopped: true }
})

// Without this, running `npm start` again while an earlier instance is
// still alive opens a SECOND window/process pair — easy to do by accident,
// and then it's genuinely ambiguous which window matches which terminal's
// log output (exactly what happened debugging the setup chat — see chat
// history). Losing the lock means another instance already holds it; quit
// immediately instead of spawning a confusing duplicate.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(createWindow)
}

// Backs the dashboard's "🌐 Open in Browser" button. The <webview> tag's own
// DOM "new-window" event (handled renderer-side, with preventDefault()) is
// deprecated since Electron 15 and — confirmed live — no longer reliably
// stops Electron's own default popup handling: a second Electron window
// (inheriting this app's own menu/chrome) kept opening alongside/instead of
// the real browser tab. setWindowOpenHandler() on the guest's own
// webContents (available here, main-process side, via "web-contents-created"
// — the renderer has no direct handle to it) is the current, non-deprecated
// way to intercept this: returning { action: "deny" } stops Electron from
// creating anything at all, and shell.openExternal() is the only thing that
// actually happens.
app.on("web-contents-created", (_event, contents) => {
  if (contents.getType() !== "webview") return
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: "deny" }
  })
})

app.on("window-all-closed", () => {
  killProcessTree(devLoopProcess)
  killProcessTree(mongodProcess)
  if (process.platform !== "darwin") app.quit()
})

app.on("before-quit", () => {
  killProcessTree(devLoopProcess)
  killProcessTree(mongodProcess)
})

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
