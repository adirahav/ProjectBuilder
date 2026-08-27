const pickBtn = document.getElementById("pick-btn")
const pickBtnMain = document.getElementById("pick-btn-main")
const startBtn = document.getElementById("start-btn")
const stopBtn = document.getElementById("stop-btn")
const projectPathEl = document.getElementById("project-path")
const statusEl = document.getElementById("status")
const logEl = document.getElementById("log")
const webviewEl = document.getElementById("dashboard-view")
const toolbarEl = document.getElementById("toolbar")
const welcomeScreenEl = document.getElementById("welcome-screen")
const welcomeErrorEl = document.getElementById("welcome-error")

let selectedProjectPath = null

function setStatus(text) {
  statusEl.textContent = text
}

async function pickProjectFolder() {
  const result = await window.devLoop.pickProjectFolder()
  if (!result) return
  if (!result.valid) {
    welcomeErrorEl.textContent = result.reason
    setStatus(result.reason)
    startBtn.disabled = true
    return
  }
  welcomeErrorEl.textContent = ""
  selectedProjectPath = result.path
  projectPathEl.textContent = result.path
  startBtn.disabled = false
  // Step 1 is done — hand off to the toolbar (Start/Stop) for everything
  // after this; the centered welcome screen was only ever the entry point.
  welcomeScreenEl.classList.add("hidden")
  toolbarEl.classList.add("visible")
  setStatus("Project selected — ready to start.")
}

pickBtn.addEventListener("click", pickProjectFolder)
pickBtnMain.addEventListener("click", pickProjectFolder)

startBtn.addEventListener("click", async () => {
  if (!selectedProjectPath) return
  logEl.textContent = ""
  logEl.classList.remove("hidden")
  webviewEl.classList.remove("active")
  const result = await window.devLoop.start(selectedProjectPath)
  if (!result.started) {
    setStatus(result.reason)
    return
  }
  startBtn.disabled = true
  pickBtn.disabled = true
  stopBtn.disabled = false
  setStatus("Working…")
})

stopBtn.addEventListener("click", async () => {
  await window.devLoop.stop()
  startBtn.disabled = false
  pickBtn.disabled = false
  stopBtn.disabled = true
  setStatus("Stopped.")
})

window.devLoop.onLog((text) => {
  logEl.textContent += text
  logEl.scrollTop = logEl.scrollHeight
})

window.devLoop.onDashboardUrl((url) => {
  // Once dev-loop.js's own dashboard server is up, this window switches
  // from raw log output to showing that dashboard directly — same page a
  // browser would show at localhost, just embedded here instead.
  webviewEl.src = url
  webviewEl.classList.add("active")
  logEl.classList.add("hidden")
  setStatus("Running.")
})

// Dev-time convenience — confirms whether mongod.exe actually landed in
// resources/mongodb-win-x64/ (see its README) before anything tries to use
// it. Mongo isn't launched by this shell yet; this just surfaces presence.
window.devLoop.getMongodStatus().then((status) => {
  if (!status.present) {
    console.warn(`mongod.exe not found at ${status.path} — see electron/resources/mongodb-win-x64/README.md`)
  }
})

window.devLoop.onExit((code) => {
  startBtn.disabled = false
  pickBtn.disabled = false
  stopBtn.disabled = true
  webviewEl.classList.remove("active")
  logEl.classList.remove("hidden")
  setStatus(code === 0 ? "Finished." : "Stopped unexpectedly — check the log below.")
})
