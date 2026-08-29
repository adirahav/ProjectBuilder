const step1El = document.getElementById("step-1")
const stepChatEl = document.getElementById("step-chat")
const step2El = document.getElementById("step-2")
const runAreaEl = document.getElementById("run-area")

const pickBtnMain = document.getElementById("pick-btn-main")
const chatBackBtn = document.getElementById("chat-back-btn")
const chatContinueBtn = document.getElementById("chat-continue")
const chatSendBtn = document.getElementById("chat-send")
const chatInputEl = document.getElementById("chat-input")
const chatMessagesEl = document.getElementById("chat-messages")
const backBtn = document.getElementById("back-btn")
const startBtn = document.getElementById("start-btn")
const stopBtn = document.getElementById("stop-btn")

const projectPathEl = document.getElementById("project-path")
const wizardErrorEl = document.getElementById("wizard-error")
const runStatusEl = document.getElementById("run-status")
const logEl = document.getElementById("log")
const webviewEl = document.getElementById("dashboard-view")

let selectedProjectPath = null
let selectedWorkspacePath = null

function goToStep(n) {
  step1El.classList.toggle("active", n === 1)
  stepChatEl.classList.toggle("active", n === "chat")
  step2El.classList.toggle("active", n === 2)
  runAreaEl.classList.toggle("active", n === "run")
}

function setRunStatus(text) {
  runStatusEl.textContent = text
}

function addChatMessage(role, text) {
  const el = document.createElement("div")
  el.className = `chat-msg ${role}`
  el.textContent = text
  chatMessagesEl.appendChild(el)
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight
  return el
}

// A real bubble (dots + label), not a bare "…" easy to mistake for the
// screen just being empty — that was read as "nothing is happening" before.
function addThinkingMessage() {
  const el = document.createElement("div")
  el.className = "chat-msg thinking"
  el.innerHTML = `<span class="thinking-dots"><span></span><span></span><span></span></span> Thinking…`
  chatMessagesEl.appendChild(el)
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight
  return el
}

// The setup chat's first message (see main.js's SETUP_CHAT_FIRST_MESSAGE)
// asks Claude to end any small-fixed-set question with a machine-readable
// "CHOICES: A | B | C" line — far more reliable than trying to reverse-
// engineer option boundaries out of however it happened to phrase things in
// prose (a bulleted list one time, "**A** or **B**?" inline the next, RTL/
// Hebrew phrasing visually reordering the markdown asterisks in ways that
// broke naive bold-span parsing entirely — see chat history). This strips
// that line out of what's actually shown and returns its options; falls
// back to the old bold-span heuristics for anything from before that
// instruction took effect (e.g. resuming an older session).
function extractChoices(text) {
  const choicesMatch = text.match(/^CHOICES:\s*(.+)$/im)
  if (choicesMatch) {
    const displayText = text.slice(0, choicesMatch.index).trim()
    const labels = choicesMatch[1].split("|").map((s) => s.trim()).filter(Boolean).slice(0, 6)
    return { displayText, labels }
  }

  const bulleted = [...text.matchAll(/^-\s*\*\*(.+?)\*\*/gm)].map((m) => m[1].trim())
  const allBold = [...text.matchAll(/\*\*(.+?)\*\*/g)]
    .map((m) => m[1].trim())
    .filter((s) => s.length <= 50 && !s.endsWith(":"))
  const source = bulleted.length >= 2 ? bulleted : allBold
  return { displayText: text, labels: [...new Set(source)].slice(0, 6) }
}

// Whenever the setup interview asks for a MongoDB connection string, the app
// itself can just provide one — it already bundles mongod.exe (see
// electron/resources/mongodb-win-x64/). Detected by keyword on the
// question text rather than anything Claude has to know about (it doesn't
// need to — see the click handler below, which sends a REAL connection
// string as the literal answer, indistinguishable from the human having
// typed one themselves).
function isMongoConnectionQuestion(text) {
  return /mongo/i.test(text)
}

function renderAnswerOptions(displayText, labels) {
  const hasChoices = labels.length >= 2
  const offerLocalMongo = isMongoConnectionQuestion(displayText)
  if (!hasChoices && !offerLocalMongo) return null

  const wrap = document.createElement("div")
  wrap.className = "chat-choices"

  if (hasChoices) {
    for (const label of labels) {
      const btn = document.createElement("button")
      btn.className = "chat-choice-btn"
      btn.textContent = label
      btn.addEventListener("click", () => {
        for (const b of wrap.querySelectorAll("button")) b.disabled = true
        sendChatMessage(label)
      })
      wrap.appendChild(btn)
    }
  }

  if (offerLocalMongo) {
    const btn = document.createElement("button")
    btn.className = "chat-choice-btn"
    btn.textContent = "🗄️ Use this app's built-in local database"
    btn.addEventListener("click", async () => {
      for (const b of wrap.querySelectorAll("button")) b.disabled = true
      btn.textContent = "Starting local database…"
      const result = await window.devLoop.startLocalMongo(selectedWorkspacePath)
      if (result.error) {
        console.error(result.error)
        btn.textContent = "Failed to start — see DevTools console"
        for (const b of wrap.querySelectorAll("button")) b.disabled = false
        return
      }
      sendChatMessage(`Use this connection string — it's a local database this app manages automatically: ${result.connectionString}`)
    })
    wrap.appendChild(btn)
  }

  chatMessagesEl.appendChild(wrap)
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight
  return wrap
}

// Shared by both ways of landing here — browsing via the OS dialog and
// clicking a recent-project shortcut (see renderRecentProjects() below) —
// so picking up an in-progress setup or jumping straight to Start behaves
// identically either way.
async function handleProjectSelected(result) {
  if (!result) return
  if (!result.valid) {
    wizardErrorEl.textContent = result.reason
    return
  }
  wizardErrorEl.textContent = ""
  selectedProjectPath = result.path
  selectedWorkspacePath = result.workspacePath
  projectPathEl.textContent = result.path

  if (result.setupNeeded) {
    chatMessagesEl.innerHTML = ""
    if (result.resumeChat) {
      // The conversation history from before isn't replayed here (only
      // Claude's own session remembers it, these chat bubbles are just this
      // window's ephemeral display) — but the underlying session really is
      // continued via --continue, so Claude picks the interview back up
      // wherever it actually left off instead of restarting Part 1.
      addChatMessage("assistant", "Picking up where we left off…")
    }
    goToStep("chat")
    const thinkingEl = addThinkingMessage()
    chatSendBtn.disabled = true
    chatContinueBtn.disabled = true
    try {
      const reply = result.resumeChat
        ? await window.devLoop.resumeSetupChat(selectedWorkspacePath)
        : await window.devLoop.startSetupChat(selectedWorkspacePath)
      thinkingEl.remove()
      if (reply.error) {
        addChatMessage("assistant", `Something went wrong: ${reply.error}`)
      } else {
        const { displayText, labels } = extractChoices(reply.text)
        addChatMessage("assistant", displayText)
        renderAnswerOptions(displayText, labels)
      }
    } catch (e) {
      // An IPC call that throws in main.js otherwise rejects silently here
      // and leaves the thinking placeholder stuck forever with no visible
      // cause — this is exactly the failure mode this catch exists to rule out.
      thinkingEl.remove()
      console.error(e)
      addChatMessage("assistant", `Something went wrong (see DevTools console): ${e.message}`)
    } finally {
      chatSendBtn.disabled = false
      chatContinueBtn.disabled = false
    }
  } else {
    goToStep(2)
  }
}

pickBtnMain.addEventListener("click", async () => {
  handleProjectSelected(await window.devLoop.pickProjectFolder())
})

// One-click shortcuts for folders this app has already been pointed at —
// beats re-browsing the OS dialog to the exact same path every time,
// especially now that resuming an in-progress setup conversation actually
// works (see main.js's CHAT_STARTED_MARKER) and is worth surfacing here as
// a real option, not just possible if you happen to pick the right folder.
async function renderRecentProjects() {
  const wrap = document.getElementById("recent-projects")
  const projects = await window.devLoop.getRecentProjects()
  if (!projects.length) {
    wrap.innerHTML = ""
    return
  }
  const label = document.createElement("div")
  label.className = "recent-label"
  label.textContent = "Or continue a recent project"
  wrap.innerHTML = ""
  wrap.appendChild(label)
  for (const project of projects) {
    const btn = document.createElement("button")
    btn.className = "recent-project-btn"
    btn.title = project.path
    btn.textContent = project.path
    btn.addEventListener("click", async () => {
      handleProjectSelected(await window.devLoop.selectRecentProject(project.path))
    })
    wrap.appendChild(btn)
  }
}
renderRecentProjects()

// The only way back to folder-picking is this explicit Back button — there
// is no "change folder" affordance once past step 1, on purpose (a human
// mid-run must never accidentally repoint a run already under way).
backBtn.addEventListener("click", () => {
  goToStep(1)
  renderRecentProjects()
})
chatBackBtn.addEventListener("click", () => {
  goToStep(1)
  renderRecentProjects()
})

async function sendChatMessage(presetText) {
  const text = presetText ?? chatInputEl.value.trim()
  if (!text) return
  addChatMessage("user", text)
  if (!presetText) chatInputEl.value = ""
  chatSendBtn.disabled = true
  chatContinueBtn.disabled = true
  const thinkingEl = addThinkingMessage()
  try {
    const reply = await window.devLoop.sendSetupChatMessage(selectedWorkspacePath, text)
    thinkingEl.remove()
    if (reply.error) {
      addChatMessage("assistant", `Something went wrong: ${reply.error}`)
    } else {
      const { displayText, labels } = extractChoices(reply.text)
      addChatMessage("assistant", displayText)
      renderChoiceButtons(labels)
    }
  } catch (e) {
    thinkingEl.remove()
    console.error(e)
    addChatMessage("assistant", `Something went wrong (see DevTools console): ${e.message}`)
  } finally {
    chatSendBtn.disabled = false
    chatContinueBtn.disabled = false
  }
}
chatSendBtn.addEventListener("click", () => sendChatMessage())
chatInputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault()
    sendChatMessage()
  }
})

// The human decides when the conversation has covered enough to move on —
// there's no reliable automatic "setup is definitely finished" signal to
// detect here, so this is a deliberate manual handoff rather than guessing.
chatContinueBtn.addEventListener("click", () => {
  goToStep(2)
})

startBtn.addEventListener("click", async () => {
  if (!selectedProjectPath) return
  logEl.textContent = ""
  logEl.classList.remove("hidden")
  webviewEl.classList.remove("active")
  startBtn.disabled = true
  const result = await window.devLoop.start(selectedProjectPath)
  if (!result.started) {
    startBtn.disabled = false
    wizardErrorEl.textContent = result.reason
    goToStep(2)
    return
  }
  goToStep("run")
  setRunStatus("Working…")
})

stopBtn.addEventListener("click", async () => {
  await window.devLoop.stop()
  startBtn.disabled = false
  goToStep(2)
})

window.devLoop.onLog((text) => {
  logEl.textContent += text
  logEl.scrollTop = logEl.scrollHeight
})

window.devLoop.onDashboardUrl((url) => {
  // Once the internal process's own dashboard server is up, this window
  // switches from raw log output to showing that dashboard directly.
  webviewEl.src = url
  webviewEl.classList.add("active")
  logEl.classList.add("hidden")
  setRunStatus("Running.")
})

window.devLoop.onExit((code) => {
  startBtn.disabled = false
  webviewEl.classList.remove("active")
  logEl.classList.remove("hidden")
  setRunStatus(code === 0 ? "Finished." : "Stopped unexpectedly — check the log below.")
})

// Dev-time convenience — confirms whether mongod.exe actually landed in
// resources/mongodb-win-x64/ (see its README) before anything tries to use
// it. Mongo isn't launched by this shell yet; this just surfaces presence.
window.devLoop.getMongodStatus().then((status) => {
  if (!status.present) {
    console.warn(`mongod.exe not found at ${status.path} — see electron/resources/mongodb-win-x64/README.md`)
  }
})
