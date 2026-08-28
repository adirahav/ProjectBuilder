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

// Pulls "- **Label** ..." bullet options out of an assistant message (the
// setup interview's own established way of presenting a small fixed choice,
// e.g. Gated/Ungated) and renders them as real clickable buttons right
// under that message — clicking one sends its label as the answer, exactly
// as if it had been typed. Free text stays available regardless (for an
// "other" answer, or any message that isn't multiple-choice at all); this
// only ever ADDS an affordance, never removes the text path.
function renderChoiceButtons(text) {
  const matches = [...text.matchAll(/^-\s*\*\*(.+?)\*\*/gm)].map((m) => m[1].trim())
  const labels = [...new Set(matches)].slice(0, 6)
  if (labels.length < 2) return null

  const wrap = document.createElement("div")
  wrap.className = "chat-choices"
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
  chatMessagesEl.appendChild(wrap)
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight
  return wrap
}

pickBtnMain.addEventListener("click", async () => {
  const result = await window.devLoop.pickProjectFolder()
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
    goToStep("chat")
    const thinkingEl = addThinkingMessage()
    chatSendBtn.disabled = true
    chatContinueBtn.disabled = true
    try {
      const reply = await window.devLoop.startSetupChat(selectedWorkspacePath)
      thinkingEl.remove()
      if (reply.error) {
        addChatMessage("assistant", `Something went wrong: ${reply.error}`)
      } else {
        addChatMessage("assistant", reply.text)
        renderChoiceButtons(reply.text)
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
})

// The only way back to folder-picking is this explicit Back button — there
// is no "change folder" affordance once past step 1, on purpose (a human
// mid-run must never accidentally repoint a run already under way).
backBtn.addEventListener("click", () => {
  goToStep(1)
})
chatBackBtn.addEventListener("click", () => {
  goToStep(1)
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
      addChatMessage("assistant", reply.text)
      renderChoiceButtons(reply.text)
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
