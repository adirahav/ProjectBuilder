const { app, BrowserWindow, dialog, ipcMain } = require("electron")
const path = require("path")
const fs = require("fs")
const crypto = require("crypto")
const { spawn } = require("child_process")

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

ipcMain.handle("pick-project-folder", async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ["openDirectory", "createDirectory"] })
  if (result.canceled || result.filePaths.length === 0) return null
  const folderPath = result.filePaths[0]
  const check = validateProjectFolder(folderPath)
  return { path: folderPath, ...check }
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
    env: { ...process.env },
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

app.whenReady().then(createWindow)

app.on("window-all-closed", () => {
  if (devLoopProcess) devLoopProcess.kill()
  if (process.platform !== "darwin") app.quit()
})

app.on("before-quit", () => {
  if (devLoopProcess) devLoopProcess.kill()
})

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
