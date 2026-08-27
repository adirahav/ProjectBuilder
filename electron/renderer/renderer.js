const pickBtn = document.getElementById("pick-btn")
const startBtn = document.getElementById("start-btn")
const stopBtn = document.getElementById("stop-btn")
const projectPathEl = document.getElementById("project-path")
const statusEl = document.getElementById("status")
const logEl = document.getElementById("log")
const webviewEl = document.getElementById("dashboard-view")

let selectedProjectPath = null

function setStatus(text) {
  statusEl.textContent = text
}

pickBtn.addEventListener("click", async () => {
  const result = await window.devLoop.pickProjectFolder()
  if (!result) return
  if (!result.valid) {
    setStatus(result.reason)
    startBtn.disabled = true
    return
  }
  selectedProjectPath = result.path
  projectPathEl.textContent = result.path
  startBtn.disabled = false
  setStatus("Project selected — ready to start.")
})

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
  setStatus("dev-loop.js running — waiting for its dashboard to come up…")
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
  setStatus(`Dashboard live: ${url}`)
})

window.devLoop.onExit((code) => {
  startBtn.disabled = false
  pickBtn.disabled = false
  stopBtn.disabled = true
  webviewEl.classList.remove("active")
  logEl.classList.remove("hidden")
  setStatus(`dev-loop.js exited (code ${code}).`)
})
