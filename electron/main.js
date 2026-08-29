const { app, BrowserWindow, dialog, ipcMain } = require("electron")
const path = require("path")
const fs = require("fs")
const crypto = require("crypto")
const { spawn, execSync } = require("child_process")
const { createInterface } = require("readline")

// dev-loop.js prints this exact banner line once its dashboard HTTP server
// is actually listening (see startDashboardServer() in dev-loop.js) — we
// scrape it out of stdout instead of guessing/hardcoding a port, since the
// project can override DASHBOARD_PORT.
const DASHBOARD_URL_PATTERN = /AGENT DASHBOARD — (http:\/\/localhost:\d+\/)/

// Directories inside the internal workspace that are junctioned straight
// into the user's chosen visible folder — see ensureWorkspace() below. Only
// the real PRODUCT output lives where the user can see it; everything else
// (agents' prompts, dev-loop.js itself, .rule/, docs/, .plan/, reports) stays
// inside the app's own hidden data directory. Add "android" here once a
// Capacitor build step exists (see chat history's roadmap).
const VISIBLE_OUTPUT_DIRS = ["frontend", "backend"]

let mainWindow = null
let devLoopProcess = null
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

// Starts the bundled mongod.exe once per app run (idempotent — a second
// call while it's already up just returns the same connection string) with
// its data directory under this app's own userData, never inside a
// project's workspace. `workspacePath`'s own hashed id becomes the database
// name, so different projects the human picks don't collide in the same
// local Mongo instance. This is the "app provides the database for you"
// path offered as a CHOICES option alongside "provide a real connection
// string yourself" — see the setup chat's own instructions.
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

ipcMain.handle("start-local-mongo", async (event, workspacePath) => {
  try {
    const connectionString = await ensureLocalMongoRunning(workspacePath)
    return { connectionString }
  } catch (e) {
    return { error: e.message }
  }
})

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
// development/dev-loop.js (or any of our own machinery) to already be
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
// of the bundled template (agents/, development/dev-loop.js, .rule/, docs/,
// .plan/, ...) under this app's own userData directory, never inside the
// folder the user picked. VISIBLE_OUTPUT_DIRS are then created as directory
// junctions pointing INTO the visible folder, so when a Backend/Frontend
// Agent writes to `frontend/`/`backend/` from dev-loop.js's point of view,
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
    // development/ (dev-loop.js, agent-dashboard/, NEW-PROJECT-SETUP-PROMPT.md,
    // ...) is pure tooling this app ships and updates -- nothing ever writes
    // project content there, unlike agents/ or docs/ which hold this
    // specific project's real PRD/backlog/filled-in rules once configured
    // and must NEVER be overwritten after first run. Re-syncing just this
    // one directory on every run means an existing project actually gets
    // dev-loop.js fixes/features from a newer build of this app instead of
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

// Presence of .setup-progress.md is the same signal development/dev-loop.js
// itself uses (see its adoptApprovalModeFromSetup()) to tell "this project
// has already been through the interview" apart from "fresh template,
// still full of {{PLACEHOLDER}} markers, needs the setup Q&A run first."
// NOTE: .setup-progress.md is only written once Part 1 is confirmed — a
// human who closed the app mid-interview (before Part 1 finished) won't
// have it yet either, which is exactly the case CHAT_STARTED_MARKER below
// exists to still tell apart from a genuinely brand-new project.
function isProjectConfigured(workspacePath) {
  return fs.existsSync(path.join(workspacePath, ".setup-progress.md"))
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

// Matches development/dev-loop.js's own quoteArgForCmd() exactly (doubled
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
// development/dev-loop.js's own spawnClaude() always goes through a shell
// on win32. Mirrored here rather than reusing that function directly, since
// this runs BEFORE dev-loop.js exists anywhere writable (the setup
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

// Streams `--output-format stream-json` (same format/shape
// development/dev-loop.js's own spawnClaude() already parses) instead of
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
        ? spawn(commandString, { cwd: workspacePath, stdio: ["pipe", "pipe", "pipe"], shell: true })
        : spawn("claude", streamArgs, { cwd: workspacePath, stdio: ["pipe", "pipe", "pipe"], shell: false })

    console.log(`[setup-chat] spawned, pid=${child.pid}`)

    let assistantText = ""
    let resultText = null
    let err = ""
    let settled = false
    const settle = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      console.log(`[setup-chat] settled: code=${result.code} out.length=${result.out.length} err=${result.err.slice(0, 300)}`)
      resolve(result)
    }
    const timer = setTimeout(() => {
      console.log(`[setup-chat] TIMEOUT firing, killing pid=${child.pid}`)
      child.kill()
      settle({ out: "", err: `Timed out after ${CLAUDE_TURN_TIMEOUT_MS / 1000}s with no response. Raw output so far: ${assistantText || "(none)"} / stderr: ${err || "(none)"}`, code: -1 })
    }, CLAUDE_TURN_TIMEOUT_MS)

    const rl = createInterface({ input: child.stdout })
    rl.on("line", (line) => {
      if (settled || !line.trim()) return
      let event
      try { event = JSON.parse(line) } catch { return }

      if (event.type === "assistant" && Array.isArray(event.message?.content)) {
        for (const block of event.message.content) {
          if (block.type === "text" && block.text) {
            assistantText += block.text + "\n"
          } else if (block.type === "tool_use" && PROGRESS_TOOL_LABELS[block.name]) {
            const filePath = block.input?.file_path || block.input?.path
            if (filePath && onProgress) onProgress(`${PROGRESS_TOOL_LABELS[block.name]} ${path.relative(workspacePath, filePath) || filePath}…`)
          }
        }
      }
      if (event.type === "result") resultText = event.result ?? assistantText
    })

    child.stderr.on("data", (d) => { err += d.toString(); console.log(`[setup-chat] stderr chunk: ${d.toString().slice(0, 200)}`) })
    child.on("close", (code) => {
      const out = (resultText ?? assistantText).trim()
      settle({ out, err: err.trim(), code: resultText !== null ? 0 : code })
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
// nothing about dev-loop.js, agents, or the template is ever named to them;
// the chat is just "tell me about your app."
// --permission-mode bypassPermissions is not optional here — without it,
// the moment Claude tries to actually read/write a file (which the setup
// interview does constantly, per its own instructions), the CLI blocks
// waiting for an interactive y/n permission prompt that can never arrive
// over a plain piped stdin/stdout — the process just hangs forever with no
// error, which is exactly what silently happened before this was added
// (dev-loop.js's own spawnClaude() already learned this lesson — see
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
  'Whenever a question has a small fixed set of options (e.g. a yes/no or A-vs-B choice), end your response with one extra line in exactly this format: CHOICES: Option one | Option two | Option three (2-6 options, each a short label in the same language as your question, no markdown formatting on that line). Omit this line entirely for open-ended questions with no fixed options.',
].join(" ")

function sendChatProgress(text) {
  mainWindow?.webContents.send("setup-chat-progress", text)
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
  }
  return result.code === 0 ? { text: result.out } : { error: result.err || `Exited with code ${result.code}` }
})

// Reconnects to the SAME Claude Code session setup-chat-start began (Claude
// Code keeps per-directory session history on its own — --continue just
// finds "the most recent session in this cwd") instead of sending the
// fresh Part-1-opening message again, which would otherwise look
// indistinguishable from actually restarting the interview from scratch.
// Used when pick-project-folder reports resumeChat: true.
ipcMain.handle("setup-chat-resume", async (event, workspacePath) => {
  const result = await runClaudeTurn(
    workspacePath,
    [...SETUP_CHAT_ARGS, "--continue"],
    "Continue exactly where we left off — re-ask your last question if you need to, don't restart the interview.",
    sendChatProgress,
  )
  return result.code === 0 ? { text: result.out } : { error: result.err || `Exited with code ${result.code}` }
})

ipcMain.handle("setup-chat-send", async (event, { workspacePath, message }) => {
  const result = await runClaudeTurn(workspacePath, [...SETUP_CHAT_ARGS, "--continue"], message, sendChatProgress)
  return result.code === 0 ? { text: result.out } : { error: result.err || `Exited with code ${result.code}` }
})

ipcMain.handle("start-dev-loop", (event, visibleFolderPath) => {
  if (devLoopProcess) return { started: false, reason: "dev-loop.js is already running." }

  const check = validateProjectFolder(visibleFolderPath)
  if (!check.valid) return { started: false, reason: check.reason }

  const { workspacePath } = ensureWorkspace(visibleFolderPath)

  // stdin is intentionally left with nothing writing to it — dev-loop.js's
  // terminal prompts (askUserInput) are also answerable through its own
  // dashboard /respond endpoint (see dev-loop.js's pendingHumanInput), which
  // is the intended path here: this window IS the dashboard, once loaded.
  devLoopProcess = spawn("node", ["development/dev-loop.js"], {
    cwd: workspacePath,
    stdio: ["ignore", "pipe", "pipe"],
    // DEV_LOOP_NO_AUTO_OPEN: this window's own <webview> already shows the
    // dashboard (see onDashboardUrl below) — without this, dev-loop.js also
    // pops the same page open in the system's default browser, which is
    // exactly the "why is Chrome opening" confusion this flag exists to
    // avoid entirely.
    env: { ...process.env, DEV_LOOP_NO_AUTO_OPEN: "1" },
  })

  let dashboardUrlSent = false
  const forwardChunk = (chunk) => {
    const text = chunk.toString()
    mainWindow?.webContents.send("dev-loop-log", text)
    if (!dashboardUrlSent) {
      const match = text.match(DASHBOARD_URL_PATTERN)
      if (match) {
        dashboardUrlSent = true
        mainWindow?.webContents.send("dev-loop-dashboard-url", match[1])
      }
    }
  }
  devLoopProcess.stdout.on("data", forwardChunk)
  devLoopProcess.stderr.on("data", forwardChunk)

  devLoopProcess.on("exit", (code) => {
    mainWindow?.webContents.send("dev-loop-exit", code)
    devLoopProcess = null
  })
  devLoopProcess.on("error", (err) => {
    mainWindow?.webContents.send("dev-loop-log", `\n[electron] Failed to launch dev-loop.js: ${err.message}\n`)
    devLoopProcess = null
  })

  return { started: true }
})

ipcMain.handle("stop-dev-loop", () => {
  if (!devLoopProcess) return { stopped: false, reason: "Not running." }
  devLoopProcess.kill()
  devLoopProcess = null
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

app.on("window-all-closed", () => {
  if (devLoopProcess) devLoopProcess.kill()
  if (mongodProcess) mongodProcess.kill()
  if (process.platform !== "darwin") app.quit()
})

app.on("before-quit", () => {
  if (devLoopProcess) devLoopProcess.kill()
  if (mongodProcess) mongodProcess.kill()
})

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
