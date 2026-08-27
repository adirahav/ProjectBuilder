const { app, BrowserWindow, dialog, ipcMain } = require("electron")
const path = require("path")
const fs = require("fs")
const { spawn } = require("child_process")

// dev-loop.js prints this exact banner line once its dashboard HTTP server
// is actually listening (see startDashboardServer() in dev-loop.js) — we
// scrape it out of stdout instead of guessing/hardcoding a port, since the
// project can override DASHBOARD_PORT.
const DASHBOARD_URL_PATTERN = /AGENT DASHBOARD — (http:\/\/localhost:\d+\/)/

let mainWindow = null
let devLoopProcess = null

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

// A "real project" here means one already bootstrapped from this template
// (via development/NEW-PROJECT-SETUP-PROMPT.md) — this shell launches an
// EXISTING project's own dev-loop.js, it doesn't scaffold a new one yet.
// That's a deliberately separate, later step (see chat history).
function validateProjectFolder(folderPath) {
  const devLoopPath = path.join(folderPath, "development", "dev-loop.js")
  if (!fs.existsSync(devLoopPath)) {
    return { valid: false, reason: `No development/dev-loop.js found in this folder — pick a project already set up from the template.` }
  }
  return { valid: true }
}

ipcMain.handle("pick-project-folder", async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ["openDirectory"] })
  if (result.canceled || result.filePaths.length === 0) return null
  const folderPath = result.filePaths[0]
  const check = validateProjectFolder(folderPath)
  return { path: folderPath, ...check }
})

ipcMain.handle("start-dev-loop", (event, projectPath) => {
  if (devLoopProcess) return { started: false, reason: "dev-loop.js is already running." }

  const check = validateProjectFolder(projectPath)
  if (!check.valid) return { started: false, reason: check.reason }

  // stdin is intentionally left with nothing writing to it — dev-loop.js's
  // terminal prompts (askUserInput) are also answerable through its own
  // dashboard /respond endpoint (see dev-loop.js's pendingHumanInput), which
  // is the intended path here: this window IS the dashboard, once loaded.
  devLoopProcess = spawn("node", ["development/dev-loop.js"], {
    cwd: projectPath,
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
