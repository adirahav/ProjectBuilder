const step1El = document.getElementById("step-1")
const stepConfigEl = document.getElementById("step-config")
const stepModelsEl = document.getElementById("step-models")
const stepChatEl = document.getElementById("step-chat")
const step2El = document.getElementById("step-2")
const runAreaEl = document.getElementById("run-area")

const pickBtnMain = document.getElementById("pick-btn-main")
const configBackBtn = document.getElementById("config-back-btn")
const configFormEl = document.getElementById("config-form")
const configErrorEl = document.getElementById("config-error")
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
const logPaneEl = document.getElementById("log-pane")
const webviewEl = document.getElementById("dashboard-view")

// agent-dashboard.html's own "🌐 Open in Browser" button just does a plain
// `window.open(url, "_blank")` (it has no preload/IPC access of its own —
// served over plain http:// by task-builder.js, not a trusted Electron
// page). This USED to be handled here via the <webview> DOM "new-window"
// event, but that's deprecated since Electron 15 and — confirmed live —
// no longer reliably stops Electron's own default popup handling (a second
// Electron window, inheriting this app's own menu/chrome, kept opening
// regardless of preventDefault()). The real fix is main-process-side now:
// see electron/main.js's "web-contents-created" + setWindowOpenHandler()
// on the webview's own webContents — nothing needed here anymore.

let selectedProjectPath = null
let selectedWorkspacePath = null
let detectedLlmAccounts = { claude: null, cursor: null, githubCopilot: null }
let externalApisState = []
// Where "Back" (and a successful Continue) return to when leaving the
// config step — 1 (folder pick) for the normal first-time flow, or
// wherever "⚙️ Edit Setup" was clicked from (chat / the "Ready to start"
// screen) when reopening an already-completed config step to tweak a gate
// or other answer without losing the in-progress chat session.
let configReturnStep = 1

function goToStep(n) {
  step1El.classList.toggle("active", n === 1)
  stepConfigEl.classList.toggle("active", n === "config")
  stepModelsEl.classList.toggle("active", n === "models")
  stepChatEl.classList.toggle("active", n === "chat")
  step2El.classList.toggle("active", n === 2)
  runAreaEl.classList.toggle("active", n === "run")
}

function setRunStatus(text) {
  runStatusEl.textContent = text
}

// Escapes real HTML first (so nothing in Claude's own output can inject
// markup), THEN turns **bold** into <strong> — order matters, doing it the
// other way round would let the escaping mangle the tags this just added.
function formatChatText(text) {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
  return escaped.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
}

function addChatMessage(role, text) {
  const el = document.createElement("div")
  el.className = `chat-msg ${role}`
  el.innerHTML = formatChatText(text)
  chatMessagesEl.appendChild(el)
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight
  return el
}

// A real bubble (dots + label), not a bare "…" easy to mistake for the
// screen just being empty — that was read as "nothing is happening" before.
// Tracks whichever thinking bubble is currently on screen so
// onSetupChatProgress (below) can update its label in place — e.g. "Writing
// docs/PRD.md…" instead of a static "Thinking…" that gives no sign of life
// during a long multi-file drafting turn (a human watching a silent spinner
// for a full minute-plus otherwise has no way to tell "still working" apart
// from "stuck").
let currentThinkingLabelEl = null

function addThinkingMessage() {
  setAttentionBadge(false) // agent is working now, not waiting on the user
  const el = document.createElement("div")
  el.className = "chat-msg thinking"
  el.innerHTML = `<span class="thinking-dots"><span></span><span></span><span></span></span> <span class="thinking-label">Thinking…</span>`
  chatMessagesEl.appendChild(el)
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight
  currentThinkingLabelEl = el.querySelector(".thinking-label")
  return el
}

window.devLoop.onSetupChatProgress((text) => {
  if (currentThinkingLabelEl) currentThinkingLabelEl.textContent = text
})

function removeThinkingMessage(thinkingEl) {
  thinkingEl.remove()
  currentThinkingLabelEl = null
}

// Claude Code itself detects a hit session/usage limit and just says so in
// plain text (e.g. "You've hit your session limit · resets 11:50pm") — this
// used to come through as an ordinary chat bubble with no way to act on it
// beyond typing into a box that would just fail the same way again until
// the limit actually resets. Same pattern task-builder.js's own
// SESSION_LIMIT_PATTERN uses for the exact same detection elsewhere.
function isSessionLimitMessage(text) {
  return /hit your (?:session|usage) limit|resets?\s+\d{1,2}:\d{2}\s*(?:am|pm)\b/i.test(text)
}

// A transient connection failure (laptop slept, wifi dropped mid-request,
// ...) that Claude Code's own CLI catches internally and prints as plain
// text — confirmed live: "API Error: The socket connection was closed
// unexpectedly..." came back as a completely normal reply.text with exit
// code 0, not as this app's own reply.error (see main.js's runClaudeTurn —
// `code: resultText !== null ? 0 : code` only fires on OUR process-level
// failures, not on an error the CLI itself already caught and reported as
// output). Same fix as session-limit messages: recognizable prose, no
// CHOICES line, needs a retry button instead of being treated as a real
// answer with nothing to click.
function isTransientApiErrorMessage(text) {
  return /API Error:|socket connection was closed|ECONNRESET|network (?:error|timeout)/i.test(text)
}

// Shared by proceedToChat() and sendChatMessage() — both get a reply the
// same shape and need the same handling: normally extractChoices() +
// clickable options, but a session-limit or transient-API-error reply
// instead gets a Retry button (via setup-chat-resume — "re-ask your last
// question, don't restart") in place of answer choices, since there's
// nothing to answer until the underlying condition clears.
// Setup's closing message is generic AI prose written for a plain terminal
// ("Run `node development/task-builder.js`...") — right for the CLI wizard,
// but this app already has its own "Ready to start" screen with a real
// button, so a human reading that line in the GUI has no command line to
// type it into. Checking isProjectConfigured() (main.js) after every reply
// lets the chat step notice setup actually finished and route there itself,
// instead of relying on her to notice/interpret that leftover instruction.
async function renderAssistantReply(text) {
  const { displayText, labels } = extractChoices(text)
  addChatMessage("assistant", displayText)
  if (isSessionLimitMessage(text) || isTransientApiErrorMessage(text)) {
    renderRetryButton()
    setAttentionBadge(true)
    return
  }
  const done = await window.devLoop.checkSetupComplete(selectedWorkspacePath).catch(() => false)
  if (done) {
    addChatMessage("assistant", "✅ Setup is complete — taking you to the start screen…")
    setTimeout(() => goToStep(2), 1500)
    return
  }
  renderAnswerOptions(displayText, labels)
  setAttentionBadge(true) // reply is in, it's the user's turn
}

// Any failed turn (a timeout, a crashed child process, anything
// setup-chat-send/resume/start can return as `reply.error`) is recoverable
// the same way a session-limit message already was — the underlying Claude
// Code session survives even though this one request died, so `--continue`
// (via resumeSetupChat, same as renderRetryButton() below) can just pick up
// again. Before this, a human had to already know to type something into
// the box themselves to trigger that — confusing enough that it wasn't
// obvious even to us. Showing the same 🔄 Retry button here removes that
// guesswork entirely.
function showChatError(errorText) {
  addChatMessage("assistant", `Something went wrong: ${errorText}`)
  renderRetryButton()
  setAttentionBadge(true) // needs a click (Retry) before anything else happens
}

function renderRetryButton() {
  const wrap = document.createElement("div")
  wrap.className = "chat-choices"
  const btn = document.createElement("button")
  btn.className = "chat-choice-btn"
  btn.textContent = "🔄 Retry"
  btn.addEventListener("click", async () => {
    btn.disabled = true
    btn.textContent = "Retrying…"
    chatSendBtn.disabled = true
    chatContinueBtn.disabled = true
    const thinkingEl = addThinkingMessage()
    try {
      const reply = await window.devLoop.resumeSetupChat(selectedWorkspacePath)
      removeThinkingMessage(thinkingEl)
      wrap.remove()
      if (reply.error) {
        showChatError(reply.error)
      } else {
        renderAssistantReply(reply.text)
      }
    } catch (e) {
      removeThinkingMessage(thinkingEl)
      console.error(e)
      addChatMessage("assistant", `Something went wrong (see DevTools console): ${e.message}`)
      setAttentionBadge(true)
    } finally {
      chatSendBtn.disabled = false
    }
  })
  wrap.appendChild(btn)
  chatMessagesEl.appendChild(wrap)
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight
}

// The setup chat's first message (see main.js's SETUP_CHAT_FIRST_MESSAGE)
// asks Claude to end any small-fixed-set question with a machine-readable
// "CHOICES: A | B | C" line — far more reliable than trying to reverse-
// engineer option boundaries out of however it happened to phrase things in
// prose (a bulleted list one time, "**A** or **B**?" inline the next, RTL/
// Hebrew phrasing visually reordering the markdown asterisks in ways that
// broke naive bold-span parsing entirely — see chat history). This strips
// that line out of what's actually shown and returns its options. Used to
// fall back to guessing options out of arbitrary bold spans when this line
// was missing — removed after that fallback kept mistaking recap fields,
// filenames, and question headings for answer choices; see this function's
// own end for what replaced it.
function extractChoices(text) {
  const choicesMatch = text.match(/^CHOICES:\s*(.+)$/im)
  if (choicesMatch) {
    const displayText = text.slice(0, choicesMatch.index).trim()
    const labels = choicesMatch[1].split("|").map((s) => s.trim()).filter(Boolean).slice(0, 6)
    return { displayText, labels }
  }

  // No CHOICES: line means no reliable answer-option signal — this used to
  // fall back to guessing options out of arbitrary bold spans in the prose
  // (a bulleted recap field, a bolded filename, a bolded question-number
  // heading — every one of these showed up live as a nonsense clickable
  // button at some point). Free text is always available regardless via the
  // input box below, so there's no real loss from just showing none instead
  // of guessing wrong.
  return { displayText: text, labels: [] }
}

// A CHOICES label like "AI-Studio export" — not the question text itself —
// is what should trigger the upload flow, and only once the human actually
// picks that option, not as a 5th button sitting alongside the real answer
// choices before they've chosen anything (that's what happened before: it
// showed up on the design-source question itself, ahead of any answer).
function isAiStudioLabel(text) {
  return /ai[\s-]?studio/i.test(text)
}

function renderAnswerOptions(displayText, labels) {
  const hasChoices = labels.length >= 2
  if (!hasChoices) return null

  const wrap = document.createElement("div")
  wrap.className = "chat-choices"

  if (hasChoices) {
    for (const label of labels) {
      const btn = document.createElement("button")
      btn.className = "chat-choice-btn"
      btn.textContent = label

      if (isAiStudioLabel(label)) {
        // Picking "AI-Studio export" immediately prompts for the ZIP —
        // extracted into raw_from_ai_studio/ (see main.js's
        // AI_STUDIO_EXPORT_DIR, the exact folder name the setup prompt's own
        // AI-Studio-export instructions already expect) — and the resulting
        // real fact is what gets sent as the answer, not just the label. If
        // the human cancels the file dialog, the plain label still gets
        // sent (they may just want to say "AI-Studio" and upload later).
        btn.addEventListener("click", async () => {
          const result = await window.devLoop.uploadAiStudioExport(selectedWorkspacePath)
          for (const b of wrap.querySelectorAll("button")) b.disabled = true
          if (!result) {
            sendChatMessage(label)
          } else if (result.error) {
            console.error(result.error)
            sendChatMessage(label)
          } else {
            sendChatMessage(`${label} — I uploaded it, extracted into the ${result.folderName}/ folder (${result.fileCount} file(s)).`)
          }
        })
      } else {
        btn.addEventListener("click", () => {
          for (const b of wrap.querySelectorAll("button")) b.disabled = true
          sendChatMessage(label)
        })
      }

      wrap.appendChild(btn)
    }
  }

  chatMessagesEl.appendChild(wrap)
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight
  return wrap
}

// Shared by both ways of landing here — browsing via the OS dialog and
// clicking a recent-project shortcut (see renderRecentProjects() below) —
// so picking up an in-progress setup or jumping straight to Start behaves
// identically either way.
let pendingResumeChat = false

async function proceedToChat() {
  chatMessagesEl.innerHTML = ""
  if (pendingResumeChat) {
    // The conversation history from before isn't replayed here (only
    // Claude's own session remembers it, these chat bubbles are just this
    // window's ephemeral display) — but the underlying session really is
    // continued via --continue, so Claude picks the interview back up
    // wherever it actually left off instead of restarting Part 1. A bare
    // "Picking up where we left off…" said nothing about what was actually
    // understood so far — read it straight out of .setup-progress.md's own
    // "Part 1 answers" section (free, no extra LLM call) and show that
    // first, so it's clear what's being picked up FROM.
    const summary = await window.devLoop.readPart1Summary(selectedWorkspacePath)
    if (summary) {
      addChatMessage("assistant", `Here's what I understood so far:\n\n${summary}`)
    }
    addChatMessage("assistant", "Picking up where we left off…")
  }
  goToStep("chat")
  const thinkingEl = addThinkingMessage()
  chatSendBtn.disabled = true
  chatContinueBtn.disabled = true
  try {
    const reply = pendingResumeChat
      ? await window.devLoop.resumeSetupChat(selectedWorkspacePath)
      : await window.devLoop.startSetupChat(selectedWorkspacePath)
    removeThinkingMessage(thinkingEl)
    if (reply.error) {
      showChatError(reply.error)
    } else {
      renderAssistantReply(reply.text)
    }
  } catch (e) {
    // An IPC call that throws in main.js otherwise rejects silently here
    // and leaves the thinking placeholder stuck forever with no visible
    // cause — this is exactly the failure mode this catch exists to rule out.
    removeThinkingMessage(thinkingEl)
    console.error(e)
    addChatMessage("assistant", `Something went wrong (see DevTools console): ${e.message}`)
    setAttentionBadge(true)
  } finally {
    chatSendBtn.disabled = false
    // Continue stays disabled here, deliberately — this is only the very
    // first question landing (or "picking up where we left off"), before
    // the human has actually said anything back yet. Nothing to
    // "continue" from at this point. It's enabled the moment a real reply
    // goes out, in sendChatMessage()'s own `finally` below — not here.
  }
}

// Step 1's own click-to-disable — a slow disk/network folder or an
// accidental double-click otherwise had no visible feedback at all (see the
// dashboard's own respond-choice-btn fix for the same underlying
// complaint): every button here gets disabled the instant one is clicked,
// re-enabled only if the user ends up staying on this screen (an invalid
// folder, or the OS picker was cancelled) — moving on to the next step
// replaces this screen's buttons entirely via renderRecentProjects()'s own
// next render, so there's nothing stale left to re-enable in that case.
function setStep1BtnsDisabled(disabled) {
  pickBtnMain.disabled = disabled
  document.querySelectorAll(".recent-project-btn, .recent-project-delete-btn").forEach((b) => { b.disabled = disabled })
}

async function handleProjectSelected(result) {
  if (!result) {
    setStep1BtnsDisabled(false)
    return
  }
  if (!result.valid) {
    wizardErrorEl.textContent = result.reason
    setStep1BtnsDisabled(false)
    return
  }
  wizardErrorEl.textContent = ""
  selectedProjectPath = result.path
  selectedWorkspacePath = result.workspacePath
  projectPathEl.textContent = result.path

  if (result.setupNeeded) {
    pendingResumeChat = !!result.resumeChat
    configReturnStep = 1
    if (result.configNeeded) {
      // Nothing filled in yet for this project — Step 2 (config wizard) is
      // genuinely the furthest point reached, so that's where it starts.
      initConfigStep()
    } else if (result.resumeChat) {
      // Config AND models were already completed last time (that's the only
      // way the chat could have started at all) — jump straight back to
      // Step 4 and resume, instead of making her click back through the
      // config wizard and models step she already answered. "⚙️ Edit Setup"
      // from the chat/dashboard is still there for anyone who wants to
      // revisit an earlier answer; there's no reason to force everyone
      // through it just to get back to where they left off.
      await proceedToChat()
    } else {
      // Config is done (`.setup-config.json` exists) but the chat was never
      // actually started yet — the furthest point reached is the models
      // step, so land there instead of re-showing the config wizard.
      goToStep("models")
      const config = await window.devLoop.readSetupConfig(selectedWorkspacePath)
      await initModelsStep(config?.expectedLlmProvider)
    }
  } else {
    // Fully configured and the backlog's ready — there's nothing left for a
    // "Ready to start" screen to actually confirm (the folder's already
    // fixed, changing it means picking a different project entirely), so it
    // was just one extra click on every single reopen. Go straight for the
    // dashboard/log view instead — launchDevLoop() itself falls back to
    // goToStep(2) with the real reason shown if starting fails for any
    // reason (already running elsewhere, workspace problem, ...), so this
    // never fails silently.
    launchDevLoop()
  }
}

pickBtnMain.addEventListener("click", async () => {
  setStep1BtnsDisabled(true)
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
    const row = document.createElement("div")
    row.className = "recent-project-row"

    const btn = document.createElement("button")
    btn.className = "recent-project-btn"
    btn.title = project.path
    btn.textContent = project.path
    btn.addEventListener("click", async () => {
      setStep1BtnsDisabled(true)
      handleProjectSelected(await window.devLoop.selectRecentProject(project.path))
    })

    const deleteBtn = document.createElement("button")
    deleteBtn.className = "recent-project-delete-btn"
    deleteBtn.textContent = "✕"
    deleteBtn.title = "Remove this project"
    deleteBtn.addEventListener("click", () => {
      // Inline confirm in place of the row's own two buttons — only deletes
      // what this app created for the project (its hidden workspace: task
      // history, config, .plan/, ...), never the visible folder itself
      // (the user's real frontend/backend code).
      row.innerHTML = ""
      const confirmEl = document.createElement("div")
      confirmEl.className = "recent-project-confirm"
      confirmEl.innerHTML =
        `<span>Remove this project and delete its build data? The frontend/backend code stays untouched.</span>` +
        `<button type="button" class="danger" id="recent-confirm-yes">Yes, delete</button>` +
        `<button type="button" id="recent-confirm-no">Cancel</button>`
      row.appendChild(confirmEl)
      confirmEl.querySelector("#recent-confirm-no").addEventListener("click", () => renderRecentProjects())
      confirmEl.querySelector("#recent-confirm-yes").addEventListener("click", async () => {
        const result = await window.devLoop.deleteRecentProject(project.path)
        if (result?.error) {
          confirmEl.innerHTML = `<span style="color:#f87171">${result.error}</span>`
          return
        }
        renderRecentProjects()
      })
    })

    row.appendChild(btn)
    row.appendChild(deleteBtn)
    wrap.appendChild(row)
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
// Goes to Step 3 (AI models), the step immediately before chat in the
// forward flow (config -> models -> chat) — NOT all the way back to Step 2
// (the config wizard), which is what this used to do before the models
// step existed (confirmed live: after the models step was added, this was
// never updated, so "← Back" from chat skipped straight past it, an
// inconsistent 4->2 jump instead of a normal 4->3->2 sequential one).
// Simple sequential back-navigation, same as models-back-btn/configBackBtn's
// own unconditional "always the previous step" behavior — no need to track
// where THIS click came from, since models-continue-btn already calls
// proceedToChat() regardless, which resumes (not restarts) an in-progress
// chat via pendingResumeChat, already set from before this button was ever
// clicked.
chatBackBtn.addEventListener("click", async () => {
  goToStep("models")
  const config = await window.devLoop.readSetupConfig(selectedWorkspacePath)
  await initModelsStep(config?.expectedLlmProvider)
})
// Always Step 1, unconditionally — simple sequential back-navigation
// (1→2→3→4), same as chat's own "← Back" goes to Step 2. configReturnStep
// still governs where a successful Continue goes (back to chat if that's
// where "← Back" was clicked FROM, so submitting doesn't blow away an
// in-progress session) — that's a different concern from this button.
configBackBtn.addEventListener("click", () => {
  goToStep(1)
  renderRecentProjects()
})

// Reopens the config step (Step 2) from later in the flow to tweak an
// earlier answer without losing an in-progress chat session the way going
// all the way back to Step 1 and re-picking the project would.
// initConfigStep() (below) loads the existing .setup-config.json into the
// form instead of resetting to defaults, and Continue/Back return to
// `returnStep` instead of advancing to chat, since configReturnStep is no
// longer 1. Two entry points: chat's own "← Back" button (returnStep
// "chat", see chatBackBtn above), and "⚙️ Edit Setup" on the "Ready to
// start" screen (returnStep 2) — there is deliberately no "Edit Setup"
// button ON the chat screen itself; "← Back" already does that job there.
async function openConfigStep(returnStep) {
  configReturnStep = returnStep
  await initConfigStep()
}
document.getElementById("ready-edit-setup-btn").addEventListener("click", () => openConfigStep(2))

// Step 1's second screen — collects every closed-form/technical answer
// NEW-PROJECT-SETUP-PROMPT.md needs (approval mode, design source, issue
// tracker, DB connection string, git branching, ...) via real radio
// buttons, before the LLM chat step even starts. Mirrors
// development/setup-wizard.js's CLI equivalent question-for-question — see
// that file's header comment for why these specific questions live here
// and not in the chat step (they don't need product/domain understanding
// to answer, unlike Q1-3 and the contested-resource/backend-services
// questions, which stay conversational).
function radioValue(name) {
  const checked = configFormEl.querySelector(`input[name="${name}"]:checked`)
  return checked ? checked.value : null
}

const TOTAL_CONFIG_QUESTIONS = 11
const configQuestionEls = Array.from(document.querySelectorAll(".config-question"))

// Cumulative reveal, not swap-in-place: every question from 1 up through
// the current frontier stays visible and fully editable (its radios still
// just work — no separate "edit mode"), so changing an earlier answer never
// needs a Back button. Only the Next button on the CURRENT frontier
// question is shown — earlier questions already advanced past don't need
// theirs again, revealing it there would look like the question wants
// re-answering.
let configRevealedUpTo = 1

function updateConfigVisibility() {
  configQuestionEls.forEach((el) => {
    const step = Number(el.dataset.step)
    el.classList.toggle("active", step <= configRevealedUpTo)
    const nav = el.querySelector(".config-question-nav")
    if (nav) nav.classList.toggle("hidden", step !== configRevealedUpTo)
  })
  // #config-error is a single shared node (not duplicated per question) so
  // a validation error stays visible regardless of which question raised
  // it — moved here, right above whichever Next/Continue button is
  // currently the visible one, instead of sitting fixed at the very bottom
  // of the form (below the frontier question, easy to miss/mistake for
  // belonging to a later, not-yet-reached question).
  const currentEl = configQuestionEls.find((el) => Number(el.dataset.step) === configRevealedUpTo)
  const currentNav = currentEl?.querySelector(".config-question-nav")
  if (currentNav) currentNav.before(configErrorEl)
}

// Checked both when leaving a question (its own Next button) AND again on
// final submit (see the form's submit handler below) — the cumulative
// reveal (see updateConfigVisibility()) lets someone scroll back up and
// blank out an already-passed answer (e.g. clear the Figma file key after
// picking Figma), so a one-time check on the way past isn't enough on its
// own; the field could be empty again by the time Continue is actually
// clicked. Returns an error string, or null if step is fine.
function validateStep(step) {
  if (step === 3 && !document.getElementById("cfg-projectName").value.trim()) {
    return "Project name is required."
  }
  if (step === 6) {
    const designSource = radioValue("designSource")
    if (designSource === "Figma" && !document.getElementById("cfg-figmaFileKey")?.value.trim()) {
      return "Figma file key is required."
    }
  }
  if (step === 7) {
    const issueTracker = radioValue("issueTracker")
    if (issueTracker === "Linear" && !document.getElementById("cfg-linearTeamId")?.value.trim()) {
      return "Linear Team ID is required."
    }
    if (issueTracker === "Jira" && !document.getElementById("cfg-jiraProjectKey")?.value.trim()) {
      return "Jira project key is required."
    }
    if (issueTracker === "GitHub Issues" && !document.getElementById("cfg-githubRepo")?.value.trim()) {
      return "GitHub repo (owner/repo) is required."
    }
  }
  if (step === 9 && radioValue("mongoChoice") === "have" && !document.getElementById("cfg-mongoUri")?.value.trim()) {
    return "MongoDB connection string is required (or switch to \"I don't have one\")."
  }
  return null
}

// Attached once, not per initConfigStep() call, since the buttons
// themselves are static markup — each button belongs to a fixed question
// (found via closest(), not "whichever is currently active"), matching
// development/setup-wizard.js's CLI equivalent question-for-question.
document.querySelectorAll(".config-next-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const step = Number(btn.closest(".config-question").dataset.step)
    const error = validateStep(step)
    if (error) {
      configErrorEl.textContent = error
      return
    }
    configErrorEl.textContent = ""
    if (step === configRevealedUpTo && step < TOTAL_CONFIG_QUESTIONS) {
      configRevealedUpTo = step + 1
      updateConfigVisibility()
      const revealed = configQuestionEls.find((el) => Number(el.dataset.step) === configRevealedUpTo)
      revealed?.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  })
})

// Sets a radio's checked state by name+value if a saved value exists and a
// matching input is currently in the DOM — used throughout initConfigStep()
// to prefill from an existing .setup-config.json (see openConfigStep()).
// Silently does nothing for a radio that doesn't exist yet (a followup not
// rendered for the current value) or a null/undefined saved value.
function setRadioChecked(name, value) {
  if (value == null) return
  const input = configFormEl.querySelector(`input[name="${name}"][value="${value}"]`)
  if (input) input.checked = true
}

async function initConfigStep() {
  goToStep("config")
  configErrorEl.textContent = ""
  configRevealedUpTo = 1
  updateConfigVisibility()

  // Loaded once per visit to this screen — non-null exactly when
  // "⚙️ Edit Setup" (or resuming a project already past this step) reopens
  // a config that was already saved at least once. Every prefill below is
  // a no-op when this is null (fresh project, nothing to load).
  const existingConfig = await window.devLoop.readSetupConfig(selectedWorkspacePath)
  if (existingConfig) {
    // Revealed right away, before the git-status/LLM-account detection
    // below (each its own IPC round-trip, ~seconds combined) — otherwise
    // question 1 sits alone on screen for that whole stretch and the rest
    // pop in all at once afterward, looking like a stall rather than an
    // already-answered form.
    configRevealedUpTo = TOTAL_CONFIG_QUESTIONS
    updateConfigVisibility()
    setRadioChecked("approvalMode", existingConfig.approvalMode)
    setRadioChecked("buildApprovalMode", existingConfig.buildApprovalMode)
    document.getElementById("cfg-projectName").value = existingConfig.projectName || ""
    setRadioChecked("direction", existingConfig.direction)
    setRadioChecked("platforms", existingConfig.platforms)
    setRadioChecked("designSource", existingConfig.designSource)
    setRadioChecked("issueTracker", existingConfig.issueTracker)
    // mongoChoice itself was never saved (only the resulting mongoUri) —
    // inferred by whether it matches the auto-generated local default for
    // this project name, same slugify logic buildConfigFromForm() uses.
    const slug = (existingConfig.projectName || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "project"
    const isDefaultMongoUri = existingConfig.mongoUri === `mongodb://localhost:27017/${slug}`
    setRadioChecked("mongoChoice", isDefaultMongoUri ? "none" : "have")
  }

  const designFollowupEl = document.getElementById("design-source-followup")
  const platformsNoteEl = document.getElementById("platforms-note")
  const mongoFollowupEl = document.getElementById("mongo-followup")
  const issueTrackerFollowupEl = document.getElementById("issue-tracker-followup")
  const gitBodyEl = document.getElementById("git-fieldset-body")
  const externalApisListEl = document.getElementById("external-apis-list")
  const externalApisFollowupEl = document.getElementById("external-apis-followup")
  // { name, slug, fileName }[] — reset each time this screen opens; read
  // from buildConfigFromForm() below via the same closure, same pattern as
  // detectedLlmAccounts is read from outside this function.
  externalApisState = []

  function renderDesignFollowup() {
    const value = radioValue("designSource")
    if (value === "AI-Studio export") {
      designFollowupEl.innerHTML =
        `<label>Folder name<input type="text" id="cfg-designFolder" class="text-input" placeholder="raw_from_ai_studio/"></label>` +
        `<button type="button" id="cfg-upload-zip-btn" class="config-secondary-btn">📁 Upload ZIP…</button>` +
        `<div id="cfg-upload-zip-status" class="config-note"></div>`
      // Reuses the exact same extraction main.js already does for the chat
      // flow (see isAiStudioLabel() above) — into raw_from_ai_studio/ by
      // default, so it lines up with this field's own placeholder/default
      // without the human having to type anything if they just want to
      // upload and go.
      document.getElementById("cfg-upload-zip-btn").addEventListener("click", async () => {
        const statusEl = document.getElementById("cfg-upload-zip-status")
        const result = await window.devLoop.uploadAiStudioExport(selectedWorkspacePath)
        if (!result) return // dialog cancelled — leave whatever was there
        if (result.error) {
          statusEl.textContent = `❌ ${result.error}`
          return
        }
        document.getElementById("cfg-designFolder").value = `${result.folderName}/`
        statusEl.textContent = `✓ Extracted ${result.fileCount} file(s) into ${result.folderName}/`
      })
    } else if (value === "Figma") {
      designFollowupEl.innerHTML = `<label>Figma file key<input type="text" id="cfg-figmaFileKey" class="text-input"></label>` +
        `<div class="config-note">The Figma API key itself is a secret — add it to .mcp.json's figma entry as an env var in the next step, never entered here.</div>`
    } else if (value === "Designer agent") {
      designFollowupEl.innerHTML =
        `<label class="radio-option"><input type="radio" name="autoApproveDesign" value="wait" checked> Stop and wait for my approval after mockups are produced</label>` +
        `<label class="radio-option"><input type="radio" name="autoApproveDesign" value="auto"> Accept them automatically and keep building</label>`
    } else {
      designFollowupEl.innerHTML = ""
    }
  }

  function renderPlatformsNote() {
    const value = radioValue("platforms")
    platformsNoteEl.textContent = value === "Android + iOS (no web)"
      ? "Note: this template's native support is Capacitor, which wraps an existing React web app — a full web app still gets built either way, just with no direct browser route to it."
      : ""
  }

  function renderMongoFollowup() {
    const value = radioValue("mongoChoice")
    if (value === "have") {
      mongoFollowupEl.innerHTML = `<label>Connection string<input type="text" id="cfg-mongoUri" class="text-input" placeholder="mongodb://..."></label>`
    } else if (value === "none") {
      // This app bundles its own mongod.exe (see
      // electron/resources/mongodb-win-x64/) and starts it automatically
      // right before the build begins whenever the configured connection
      // string points at it (see main.js's start-dev-loop handler) — no
      // manual step needed here anymore. This used to be a button the human
      // had to remember to click, and nothing else ever started it if they
      // didn't.
      mongoFollowupEl.innerHTML = `<div class="config-note">The built-in local database starts automatically when the build begins — nothing to do here.</div>`
    } else {
      mongoFollowupEl.innerHTML = ""
    }
  }

  // One real YAML file per external API under docs/api-contract/external/,
  // not a link — same reasoning as design source's own Figma/AI-Studio
  // handling: an agent should read a real file, not have to go fetch a URL
  // that could change or go stale. Independent of whether this project has
  // its own backend at all (that's a chat question — see Q7 in
  // NEW-PROJECT-SETUP-PROMPT.md).
  function renderExternalApiList() {
    externalApisListEl.innerHTML = ""
    externalApisState.forEach((api, i) => {
      const row = document.createElement("div")
      row.className = "external-api-row"
      row.innerHTML =
        `<span class="external-api-name">${api.name}</span>` +
        `<span class="external-api-status">${api.fileName ? `✓ ${api.fileName}` : "no spec file yet"}</span>` +
        `<button type="button" class="external-api-remove">✕</button>`
      row.querySelector(".external-api-remove").addEventListener("click", () => {
        externalApisState.splice(i, 1)
        renderExternalApiList()
        saveConfigDraft()
      })
      externalApisListEl.appendChild(row)
    })
  }

  function renderExternalApisFollowup() {
    if (radioValue("hasExternalApis") !== "yes") {
      externalApisFollowupEl.innerHTML = ""
      return
    }
    externalApisFollowupEl.innerHTML =
      `<label>API name (e.g. "Stripe")<input type="text" id="cfg-new-api-name" class="text-input" placeholder="Stripe"></label>` +
      `<button type="button" id="cfg-add-api-btn" class="config-secondary-btn">＋ Add API</button>`
    document.getElementById("cfg-add-api-btn").addEventListener("click", async () => {
      const nameInput = document.getElementById("cfg-new-api-name")
      const name = nameInput.value.trim()
      if (!name) return
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || `api-${externalApisState.length + 1}`
      const entry = { name, slug, fileName: null }
      externalApisState.push(entry)
      nameInput.value = ""
      renderExternalApiList()
      saveConfigDraft()
      // File picker right after adding — optional (can be skipped and
      // added to docs/api-contract/external/<slug>.yaml by hand later).
      const result = await window.devLoop.uploadExternalApiSpec(selectedWorkspacePath, slug)
      if (result && !result.error) {
        entry.fileName = result.fileName
        renderExternalApiList()
        saveConfigDraft()
      } else if (result?.error) {
        console.error(result.error)
      }
    })
  }

  // Each tracker's identifier is a plain string (safe to collect here); the
  // real API key/token is a secret — same rule as Figma's file key above —
  // so it's never typed into this config wizard, only added to .mcp.json
  // as an env var during the next (chat) step. NOTE: as of this writing,
  // only Linear actually has working integration code in this template
  // (team-members.json, task-builder.js's ticket-assignment logic) — Jira and
  // GitHub Issues are asked for consistency/future-proofing, but picking
  // them doesn't wire anything up yet, hence the extra note on those two.
  function renderIssueTrackerFollowup() {
    const value = radioValue("issueTracker")
    if (value === "Linear") {
      issueTrackerFollowupEl.innerHTML =
        `<label>Linear Team ID<input type="text" id="cfg-linearTeamId" class="text-input"></label>` +
        `<div class="config-note">The Linear API key itself is a secret — add it to .mcp.json's linear entry as an env var in the next step, never entered here.</div>`
    } else if (value === "Jira") {
      issueTrackerFollowupEl.innerHTML =
        `<label>Jira project key<input type="text" id="cfg-jiraProjectKey" class="text-input"></label>` +
        `<div class="config-note">Jira has no working integration in this template yet (unlike Linear) — this is stored for when that gets built. The API token stays out of this wizard either way.</div>`
    } else if (value === "GitHub Issues") {
      issueTrackerFollowupEl.innerHTML =
        `<label>GitHub repo (owner/repo)<input type="text" id="cfg-githubRepo" class="text-input" placeholder="owner/repo"></label>` +
        `<div class="config-note">GitHub Issues has no working integration in this template yet (unlike Linear) — this is stored for when that gets built. The PAT stays out of this wizard either way.</div>`
    } else {
      issueTrackerFollowupEl.innerHTML = ""
    }
  }

  configFormEl.querySelectorAll('input[name="designSource"]').forEach((el) => el.addEventListener("change", renderDesignFollowup))
  configFormEl.querySelectorAll('input[name="platforms"]').forEach((el) => el.addEventListener("change", renderPlatformsNote))
  configFormEl.querySelectorAll('input[name="mongoChoice"]').forEach((el) => el.addEventListener("change", renderMongoFollowup))
  configFormEl.querySelectorAll('input[name="issueTracker"]').forEach((el) => el.addEventListener("change", renderIssueTrackerFollowup))
  configFormEl.querySelectorAll('input[name="hasExternalApis"]').forEach((el) => el.addEventListener("change", renderExternalApisFollowup))
  renderIssueTrackerFollowup()
  renderDesignFollowup()
  renderPlatformsNote()
  renderMongoFollowup()
  renderExternalApisFollowup()
  renderExternalApiList()

  // Followup fields only exist in the DOM once their parent render*() call
  // above has run (they're conditional on the just-set radio value), so
  // this has to happen after all four, not alongside the radios above.
  if (existingConfig) {
    if (existingConfig.designSource === "AI-Studio export") {
      const el = document.getElementById("cfg-designFolder")
      if (el) el.value = existingConfig.designSourceFolder || ""
    } else if (existingConfig.designSource === "Figma") {
      const el = document.getElementById("cfg-figmaFileKey")
      if (el) el.value = existingConfig.figmaFileKey || ""
    } else if (existingConfig.designSource === "Designer agent") {
      setRadioChecked("autoApproveDesign", existingConfig.autoApproveDesign ? "auto" : "wait")
    }
    if (existingConfig.issueTracker === "Linear") {
      const el = document.getElementById("cfg-linearTeamId")
      if (el) el.value = existingConfig.linearTeamId || ""
    } else if (existingConfig.issueTracker === "Jira") {
      const el = document.getElementById("cfg-jiraProjectKey")
      if (el) el.value = existingConfig.jiraProjectKey || ""
    } else if (existingConfig.issueTracker === "GitHub Issues") {
      const el = document.getElementById("cfg-githubRepo")
      if (el) el.value = existingConfig.githubRepo || ""
    }
    if (radioValue("mongoChoice") === "have") {
      const el = document.getElementById("cfg-mongoUri")
      if (el) el.value = existingConfig.mongoUri || ""
    }
    if (Array.isArray(existingConfig.externalApis) && existingConfig.externalApis.length) {
      setRadioChecked("hasExternalApis", "yes")
      renderExternalApisFollowup()
      // File existence isn't tracked in .setup-config.json (only name/slug
      // are), so a reloaded entry shows no "✓ filename" status until the
      // user re-uploads it on this screen.
      externalApisState = existingConfig.externalApis.map((api) => ({ name: api.name, slug: api.slug, fileName: null }))
      renderExternalApiList()
    }
  }

  // `.git` is a filesystem fact, not a preference — checked once per visit
  // to this screen rather than asked, same reasoning as
  // development/setup-wizard.js's CLI equivalent. A brand-new project
  // obviously has no .git yet, so rather than just telling the user to go
  // run it themselves in a terminal they may not have, offer to do it right
  // here (same convenience task-builder.js's own runtime git-init prompt
  // already gives, just reachable one step earlier).
  async function renderGitSection() {
    const gitEnabled = await window.devLoop.checkGitStatus(selectedWorkspacePath)
    if (!gitEnabled) {
      gitBodyEl.innerHTML =
        `<div class="config-note">No .git found here — this section is skipped until one exists. This is local version control only — no GitHub/GitLab account or remote repository needed; nothing gets pushed anywhere.</div>` +
        `<button type="button" id="cfg-git-init-btn" class="config-secondary-btn">Initialize git now</button>` +
        `<div id="cfg-git-init-error" style="color:#f87171;font-size:12px;margin-top:6px;"></div>`
      document.getElementById("cfg-git-init-btn").addEventListener("click", async (e) => {
        e.target.disabled = true
        const result = await window.devLoop.initGit(selectedWorkspacePath)
        if (result?.error) {
          document.getElementById("cfg-git-init-error").textContent = result.error
          e.target.disabled = false
        } else {
          renderGitSection()
        }
      })
      return
    }
    gitBodyEl.innerHTML =
      `<label class="radio-option"><input type="radio" name="branchStrategy" value="single" checked> Everything on one branch (no per-task branches)</label>` +
      `<label class="radio-option"><input type="radio" name="branchStrategy" value="perTask"> Each task gets its own branch</label>` +
      `<div id="automerge-followup" class="config-followup"></div>`
    const renderAutoMerge = () => {
      const followup = document.getElementById("automerge-followup")
      followup.innerHTML = radioValue("branchStrategy") === "perTask"
        ? `<label class="radio-option"><input type="radio" name="autoMergeTasks" value="no" checked> Ask before merging each finished task branch</label>` +
          `<label class="radio-option"><input type="radio" name="autoMergeTasks" value="yes"> Merge automatically, no approval stop</label>`
        : ""
    }
    gitBodyEl.querySelectorAll('input[name="branchStrategy"]').forEach((el) => el.addEventListener("change", renderAutoMerge))
    renderAutoMerge()
    if (existingConfig) {
      setRadioChecked("branchStrategy", existingConfig.createBranchPerTask ? "perTask" : "single")
      renderAutoMerge()
      setRadioChecked("autoMergeTasks", existingConfig.autoMergeTasks ? "yes" : "no")
    }
  }
  await renderGitSection()

  // Detects whoever's already logged in (never launches a login flow
  // itself — that's a real OAuth popup, which belongs to the chat step /
  // task-builder.js's own attemptLogin(), not a background detection call on
  // this screen). If nothing's pinned here, task-builder.js's own first run
  // asks then, exactly as it already does for a project with no
  // wizard-set value at all.
  const llmAccountBodyEl = document.getElementById("llm-account-body")
  const accounts = await window.devLoop.detectLlmAccounts()
  detectedLlmAccounts = accounts
  if (!accounts.claude && !accounts.cursor) {
    llmAccountBodyEl.innerHTML = `<div class="config-note">No LLM account (Claude or Cursor) detected as logged in — this is skipped; you'll be asked the first time a build starts.</div>`
  } else {
    let optionsHtml = ""
    if (accounts.claude) optionsHtml += `<label class="radio-option"><input type="radio" name="llmAccountChoice" value="claude" checked> Claude (${accounts.claude})</label>`
    if (accounts.cursor) optionsHtml += `<label class="radio-option"><input type="radio" name="llmAccountChoice" value="cursor" ${accounts.claude ? "" : "checked"}> Cursor (${accounts.cursor})</label>`
    optionsHtml += `<label class="radio-option"><input type="radio" name="llmAccountChoice" value="none"> Don't pin one now — ask at build time</label>`
    llmAccountBodyEl.innerHTML = optionsHtml
    if (existingConfig?.expectedLlmProvider) setRadioChecked("llmAccountChoice", existingConfig.expectedLlmProvider)
  }
  // Shown, never selectable as a pin — task-builder.js has no headless way to
  // actually run agents through Copilot CLI (no `-p`/print-mode equivalent,
  // unlike Claude/Cursor), so offering it as a radio option here would
  // claim something that isn't true. See main.js's detect-llm-accounts
  // handler for the detection mechanics (via `gh`, not `copilot` itself).
  if (accounts.githubCopilot) {
    llmAccountBodyEl.innerHTML += `<div class="config-note">Also detected: GitHub Copilot as ${accounts.githubCopilot} — reference only, agents can't run through it.</div>`
  }

  // Delegated on the form itself (not per-input) so it also covers fields
  // added later by the followup-rendering functions above (design source,
  // mongo, issue tracker, git, llm account) without needing its own
  // addEventListener call at each of those call sites. "change" covers
  // radios; "input" covers text fields as the human types, not just on blur.
  configFormEl.addEventListener("change", saveConfigDraft)
  configFormEl.addEventListener("input", saveConfigDraft)

  // (Reveal-all-at-once for an existing config already happened right
  // after existingConfig loaded, above — see its comment.)

  saveConfigDraft() // capture the current (possibly just-prefilled) state immediately
}

// Reads the form's current state into a plain config object — shared by
// the live draft-save (see saveConfigDraft() below, fired on every change
// so .setup-config.json is never stale while filling this out) and the
// final submit (which additionally triggers side effects: .setup-secrets.json,
// the conditional file deletions — those only make sense once, on submit,
// not replayed on every keystroke).
function buildConfigFromForm() {
  const projectName = document.getElementById("cfg-projectName").value.trim()
  const slug = projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "project"

  const config = {
    approvalMode: radioValue("approvalMode"),
    buildApprovalMode: radioValue("buildApprovalMode"),
    projectName,
    direction: radioValue("direction"),
    platforms: radioValue("platforms"),
  }
  config.targetsNative = config.platforms !== "Web only"
  config.targetsWeb = config.platforms !== "Android + iOS (no web)"

  config.designSource = radioValue("designSource")
  if (config.designSource === "AI-Studio export") {
    config.designSourceFolder = document.getElementById("cfg-designFolder")?.value.trim() || "raw_from_ai_studio/"
  } else if (config.designSource === "Figma") {
    config.figmaFileKey = document.getElementById("cfg-figmaFileKey")?.value.trim() || ""
  } else if (config.designSource === "Designer agent") {
    config.autoApproveDesign = radioValue("autoApproveDesign") === "auto"
  }

  config.issueTracker = radioValue("issueTracker")
  if (config.issueTracker === "Linear") {
    config.linearTeamId = document.getElementById("cfg-linearTeamId")?.value.trim() || ""
  } else if (config.issueTracker === "Jira") {
    config.jiraProjectKey = document.getElementById("cfg-jiraProjectKey")?.value.trim() || ""
  } else if (config.issueTracker === "GitHub Issues") {
    config.githubRepo = document.getElementById("cfg-githubRepo")?.value.trim() || ""
  }

  const gitBodyEl = document.getElementById("git-fieldset-body")
  const gitEnabled = !!gitBodyEl?.querySelector('input[name="branchStrategy"]')
  if (gitEnabled) {
    config.createBranchPerTask = radioValue("branchStrategy") === "perTask"
    config.autoMergeTasks = config.createBranchPerTask ? radioValue("autoMergeTasks") === "yes" : false
  } else {
    config.createBranchPerTask = false
    config.autoMergeTasks = false
  }

  const mongoChoice = radioValue("mongoChoice")
  config.mongoUri = mongoChoice === "have"
    ? (document.getElementById("cfg-mongoUri")?.value.trim() || `mongodb://localhost:27017/${slug}`)
    : `mongodb://localhost:27017/${slug}`

  config.externalApis = radioValue("hasExternalApis") === "yes"
    ? externalApisState.map(({ name, slug }) => ({ name, slug }))
    : []

  const llmAccountChoice = radioValue("llmAccountChoice")
  if (llmAccountChoice === "claude" || llmAccountChoice === "cursor") {
    config.expectedLlmProvider = llmAccountChoice
    config.expectedLlmAccount = detectedLlmAccounts[llmAccountChoice]
  }
  if (detectedLlmAccounts.githubCopilot) {
    config.githubCopilotAccount = detectedLlmAccounts.githubCopilot
  }

  return config
}

// Fired on every change anywhere in the form (see the listener registered
// in initConfigStep()) — keeps .setup-config.json on disk matching what's
// on screen at all times, not just once at the very end. Debounced past a
// single microtask isn't needed: writeFileSync in main.js is cheap and
// change events don't fire fast enough to matter. Errors are swallowed
// (logged only) — a failed draft save must never interrupt someone still
// filling out the form; the real save (and its own error handling) happens
// on submit.
let saveDraftTimer = null
function saveConfigDraft() {
  if (!selectedWorkspacePath) return
  clearTimeout(saveDraftTimer)
  saveDraftTimer = setTimeout(() => {
    window.devLoop.saveConfigDraft(selectedWorkspacePath, buildConfigFromForm()).catch((err) => {
      console.error("Draft save failed:", err)
    })
  }, 150)
}

configFormEl.addEventListener("submit", async (e) => {
  e.preventDefault()
  configErrorEl.textContent = ""

  // Every question, not just the current one — cumulative reveal lets an
  // earlier answer get blanked out again after its own Next already passed
  // (see validateStep()'s comment), so Continue has to be the final,
  // authoritative check across the whole form, not just question 10's own.
  for (let step = 1; step <= TOTAL_CONFIG_QUESTIONS; step++) {
    const error = validateStep(step)
    if (error) {
      configErrorEl.textContent = error
      const el = configQuestionEls.find((q) => Number(q.dataset.step) === step)
      const nav = el?.querySelector(".config-question-nav")
      if (nav) nav.before(configErrorEl) // move the error right next to the question that actually failed, not wherever it last sat
      el?.scrollIntoView({ behavior: "smooth", block: "start" })
      return
    }
  }

  const config = buildConfigFromForm()

  const continueBtn = document.getElementById("config-continue-btn")
  continueBtn.disabled = true
  try {
    await window.devLoop.writeSetupConfig(selectedWorkspacePath, config)
    // Opened via "⚙️ Edit Setup" (configReturnStep !== 1): just go back to
    // wherever that was — starting a fresh chat session here would throw
    // away an in-progress conversation, and the model review step already
    // happened the first time through. Only the normal first-time flow
    // (configReturnStep === 1) goes on to the model review step next.
    if (configReturnStep === 1) {
      goToStep("models")
      await initModelsStep(config.expectedLlmProvider)
    } else {
      goToStep(configReturnStep)
    }
  } catch (err) {
    console.error(err)
    configErrorEl.textContent = `Something went wrong (see DevTools console): ${err.message}`
  } finally {
    continueBtn.disabled = false
  }
})

// ─── Step 3: AI model review ────────────────────────────────────────────────
// Lets the human see (and override) which model each build step runs under,
// right after the config wizard and before the product-description chat
// begins. Cursor has a real live source (`agent models`) to validate
// against — an id no longer in that list blocks Continue until replaced.
// Claude Code has no equivalent listing command (confirmed — there isn't
// one), so its rows are plain free text with no live validation at all,
// rather than faking a check against a source that doesn't exist.

const OPERATIONS = [
  ["planning", "Planning"],
  ["planning-revise", "Planning (revisions)"],
  ["designer", "Designer Agent"],
  ["frontend", "Frontend Agent"],
  ["qa", "QA Agent"],
  ["security", "Security Agent"],
  ["orchestrator-chat", "Orchestrator chat"],
]

let modelsConfigState = null // { claude: {...}, cursor: {...} } — mutated in place as the human edits rows
let cursorModelsList = null // [{id, label}] once loaded, or null if never fetched/unavailable

// Only understands this app's own naming conventions for Claude-family
// model ids on Cursor's list ("claude-sonnet-5-high" / "claude-4.6-sonnet-
// medium") — anything else (GPT/Gemini/Grok ids, or an unrecognized Claude
// shape) just doesn't get a version-comparison warning. This is a soft
// "something newer exists" nudge based only on what's visible in the same
// live list, not a real deprecation signal (neither CLI exposes one).
function extractClaudeFamilyVersion(id) {
  let m = id.match(/^claude-(sonnet|opus|fable)-(\d+(?:\.\d+)?)/)
  if (m) return { family: m[1], version: parseFloat(m[2]) }
  m = id.match(/^claude-(\d+(?:\.\d+)?)-(sonnet|opus|fable)/)
  if (m) return { family: m[2], version: parseFloat(m[1]) }
  return null
}

function findNewerCursorVersionWarning(selectedId) {
  const info = extractClaudeFamilyVersion(selectedId)
  if (!info || !cursorModelsList) return null
  let best = info
  for (const m of cursorModelsList) {
    const other = extractClaudeFamilyVersion(m.id)
    if (other && other.family === info.family && other.version > best.version) best = other
  }
  return best.version > info.version ? `A newer ${best.family} version is available (v${best.version}).` : null
}

// Disables whichever "commit these choices" button belongs to the rows
// container that changed — checked against BOTH known containers (the
// wizard step's and the "🧠 Edit Models" overlay's) rather than tracking
// which one is currently open, since a missing element here is a no-op and
// only one of the two is ever actually visible at a time anyway.
function updateModelsContinueState() {
  for (const [rowsId, btnId] of [["models-cursor-rows", "models-continue-btn"], ["live-models-cursor-rows", "live-models-save-btn"]]) {
    const btn = document.getElementById(btnId)
    if (!btn) continue
    btn.disabled = !!document.querySelector(`#${rowsId} select[data-invalid="true"]`)
  }
}

function renderCursorModelRow(key, opLabel) {
  const row = document.createElement("div")
  row.className = "model-row"
  const currentValue = modelsConfigState.cursor?.[key] || ""

  if (!cursorModelsList) {
    // Cursor CLI unavailable/not installed on this machine — no live list to
    // validate against, so fall back to the same plain-text treatment as
    // Claude rather than blocking a human who isn't even using Cursor.
    row.innerHTML =
      `<span class="model-row-label">${opLabel}</span>` +
      `<input type="text" class="text-input" data-cursor-op="${key}" value="${currentValue}">`
    row.querySelector("input").addEventListener("input", (e) => {
      modelsConfigState.cursor[key] = e.target.value
    })
    return row
  }

  const isKnown = cursorModelsList.some((m) => m.id === currentValue)
  let optionsHtml = ""
  if (!isKnown && currentValue) {
    optionsHtml += `<option value="${currentValue}" data-invalid="true" selected>⚠ ${currentValue} — no longer available, pick a replacement</option>`
  }
  optionsHtml += cursorModelsList
    .map((m) => `<option value="${m.id}"${m.id === currentValue ? " selected" : ""}>${m.label} (${m.id})</option>`)
    .join("")

  row.innerHTML = `<span class="model-row-label">${opLabel}</span><select data-cursor-op="${key}">${optionsHtml}</select>`
  const selectEl = row.querySelector("select")
  selectEl.dataset.invalid = String(!isKnown)

  const warningEl = document.createElement("div")
  const applyRowState = () => {
    const invalid = selectEl.selectedOptions[0]?.dataset.invalid === "true"
    selectEl.dataset.invalid = String(invalid)
    if (invalid) {
      warningEl.className = "model-row-unavailable"
      warningEl.textContent = "This model is no longer available — choose a replacement above."
    } else {
      const warning = findNewerCursorVersionWarning(selectEl.value)
      warningEl.className = "model-row-warning"
      warningEl.textContent = warning || ""
    }
    updateModelsContinueState()
  }
  applyRowState()
  selectEl.addEventListener("change", () => {
    modelsConfigState.cursor[key] = selectEl.value
    // Re-selecting a real option removes the synthetic "⚠ ..." entry —
    // it only ever exists to show what the stale value WAS.
    const staleOption = selectEl.querySelector('option[data-invalid="true"]')
    if (staleOption && selectEl.value !== staleOption.value) staleOption.remove()
    applyRowState()
  })

  const wrap = document.createElement("div")
  wrap.appendChild(row)
  wrap.appendChild(warningEl)
  return wrap
}

function renderClaudeModelRow(key, opLabel) {
  const row = document.createElement("div")
  row.className = "model-row"
  const currentValue = modelsConfigState.claude?.[key] || ""
  row.innerHTML =
    `<span class="model-row-label">${opLabel}</span>` +
    `<input type="text" class="text-input" data-claude-op="${key}" value="${currentValue}">`
  row.querySelector("input").addEventListener("input", (e) => {
    modelsConfigState.claude[key] = e.target.value
  })
  return row
}

// `provider` is the SAME choice made one screen earlier (the config
// wizard's own "Pin which LLM account" question — see buildConfigFromForm's
// expectedLlmProvider) — only that one provider's models are worth showing;
// a human who picked Claude has no use for a Cursor model table (and vice
// versa), and it was actively confusing to show both. Falls back to
// detectedLlmAccounts (whichever CLI is actually logged in) if the wizard
// question was left on "don't pin one now," and shows both only as a last
// resort when neither signal exists at all.
function resolveModelsProvider(provider) {
  if (provider === "claude" || provider === "cursor") return provider
  const hasClaude = !!detectedLlmAccounts.claude
  const hasCursor = !!detectedLlmAccounts.cursor
  if (hasClaude && !hasCursor) return "claude"
  if (hasCursor && !hasClaude) return "cursor"
  return "both"
}

// Shared by the Step 3 wizard screen and the "🧠 Edit Models" overlay
// (reachable again once the build is already running) — same rows, same
// live Cursor validation, same provider-narrowing, just rendered into
// whichever set of containers the caller passes in. `els.cursorSectionEl`/
// `claudeSectionEl` are optional (the overlay doesn't wrap each provider in
// its own hideable section the way the wizard step does; passing undefined
// just skips the show/hide toggle).
async function loadModelsInto(els, pinnedProvider) {
  els.cursorRowsEl.innerHTML = ""
  els.claudeRowsEl.innerHTML = ""

  const provider = resolveModelsProvider(pinnedProvider)
  const showCursor = provider === "cursor" || provider === "both"
  const showClaude = provider === "claude" || provider === "both"
  if (els.cursorSectionEl) els.cursorSectionEl.hidden = !showCursor
  if (els.claudeSectionEl) els.claudeSectionEl.hidden = !showClaude

  modelsConfigState = (await window.devLoop.readModelConfig(selectedWorkspacePath)) || { claude: {}, cursor: {} }
  modelsConfigState.claude = modelsConfigState.claude || {}
  modelsConfigState.cursor = modelsConfigState.cursor || {}

  if (showCursor) {
    if (els.cursorStatusEl) els.cursorStatusEl.textContent = "Checking which Cursor models are currently available…"
    const cursorResult = await window.devLoop.listCursorModels()
    if (cursorResult?.models?.length) {
      cursorModelsList = cursorResult.models
      if (els.cursorStatusEl) els.cursorStatusEl.textContent = ""
    } else {
      cursorModelsList = null
      if (els.cursorStatusEl) els.cursorStatusEl.textContent = "Cursor CLI not detected — showing these as plain text instead, no live check."
    }
  } else {
    cursorModelsList = null
  }

  for (const [key, label] of OPERATIONS) {
    if (showCursor) els.cursorRowsEl.appendChild(renderCursorModelRow(key, label))
    if (showClaude) els.claudeRowsEl.appendChild(renderClaudeModelRow(key, label))
  }
}

async function initModelsStep(pinnedProvider) {
  const errorEl = document.getElementById("models-error")
  errorEl.textContent = ""
  await loadModelsInto({
    cursorSectionEl: document.getElementById("models-cursor-section"),
    claudeSectionEl: document.getElementById("models-claude-section"),
    cursorRowsEl: document.getElementById("models-cursor-rows"),
    claudeRowsEl: document.getElementById("models-claude-rows"),
    cursorStatusEl: document.getElementById("models-cursor-status"),
  }, pinnedProvider)
  updateModelsContinueState()
}

document.getElementById("models-back-btn").addEventListener("click", () => goToStep("config"))

document.getElementById("models-continue-btn").addEventListener("click", async (e) => {
  const errorEl = document.getElementById("models-error")
  errorEl.textContent = ""
  e.target.disabled = true
  try {
    const result = await window.devLoop.writeModelConfig(selectedWorkspacePath, modelsConfigState)
    if (result?.error) {
      errorEl.textContent = result.error
      return
    }
    await proceedToChat()
  } catch (err) {
    console.error(err)
    errorEl.textContent = `Something went wrong (see DevTools console): ${err.message}`
  } finally {
    e.target.disabled = false
  }
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
    removeThinkingMessage(thinkingEl)
    if (reply.error) {
      showChatError(reply.error)
    } else {
      renderAssistantReply(reply.text)
    }
  } catch (e) {
    removeThinkingMessage(thinkingEl)
    console.error(e)
    addChatMessage("assistant", `Something went wrong (see DevTools console): ${e.message}`)
    setAttentionBadge(true)
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

// Manual escape hatch — renderAssistantReply() above already auto-advances
// once isProjectConfigured() says setup is genuinely done, but this stays as
// a way out if she wants to jump to the start screen herself before that.
chatContinueBtn.addEventListener("click", () => {
  goToStep(2)
})

const runStartBtn = document.getElementById("run-start-btn")
// Set right before a deliberate Stop click, cleared on a fresh launch —
// lets onExit() (fired by the process actually dying, always a beat after
// the click) tell "stopped because I asked it to" apart from "died on its
// own", instead of both saying "unexpectedly".
let stoppedByUser = false

// Shared by the "Ready to start" screen's own Start button AND the
// dashboard's own "▶ Start" (shown in place of Stop once stopped — see
// stopBtn below) — restarting from the dashboard reuses the exact same
// launch path, just without leaving the run screen first.
async function launchDevLoop() {
  if (!selectedProjectPath) {
    // Used to fail completely silently here — no error, no visible change,
    // just nothing happening on click. If this still fires, it's now at
    // least visible instead of a silent dead end.
    console.error("Start clicked with no selectedProjectPath set — this shouldn't happen; please report it.")
    wizardErrorEl.textContent = "No project selected — go back and pick the project folder again."
    goToStep(1)
    renderRecentProjects()
    return
  }
  stoppedByUser = false
  const readyErrorEl = document.getElementById("ready-error")
  readyErrorEl.textContent = ""
  // Only reset to the raw log if nothing better (the dashboard webview) is
  // already showing — restarting from the dashboard itself shouldn't blank
  // it back to plain text while the new run spins up.
  if (!webviewEl.classList.contains("active")) {
    logEl.textContent = ""
    logPaneEl.classList.remove("hidden")
  }
  startBtn.disabled = true
  runStartBtn.disabled = true
  const result = await window.devLoop.start(selectedProjectPath)
  if (!result.started) {
    startBtn.disabled = false
    runStartBtn.disabled = false
    // This screen's OWN error element, not #wizard-error — that one only
    // ever renders on Step 1 (folder pick), so a failure reaching this
    // point used to just vanish: goToStep(2) landed back on the exact
    // screen already showing, with the reason written somewhere invisible.
    // Looked exactly like "nothing happens" on click.
    readyErrorEl.textContent = result.reason
    goToStep(2)
    return
  }
  stopBtn.style.display = ""
  runStartBtn.style.display = "none"
  goToStep("run")
  setRunStatus("Working…")
}

startBtn.addEventListener("click", launchDevLoop)
runStartBtn.addEventListener("click", launchDevLoop)

// Stays on the run screen, deliberately — no more jumping back to "Ready to
// start". The dashboard webview (or log) just stays exactly as it was, now
// frozen; agent-dashboard.html's own poll() notices the server died and
// dims every agent on its own (see its onLog/poll catch handler). Only the
// button and status line change: Stop becomes Start, ready to relaunch
// without leaving this screen.
stopBtn.addEventListener("click", async () => {
  stoppedByUser = true
  await window.devLoop.stop()
  startBtn.disabled = false
  stopBtn.style.display = "none"
  runStartBtn.style.display = ""
  setRunStatus("Stopped.")
})

// Read-only viewer for the files Claude is actually drafting in the chat
// step (PRD, rules, skills, agent configs) — see main.js's
// list-project-files/read-project-file. Opened via the chat header's "📄
// View Files" button; works at any point in the conversation, showing
// whatever's on disk right now.
const viewFilesOverlay = document.getElementById("view-files-overlay")
const viewFilesListEl = document.getElementById("view-files-list")
const viewFilesContentEl = document.getElementById("view-files-content")
const viewFilesCurrentPathEl = document.getElementById("view-files-current-path")
let viewFilesCurrentPath = null

async function openFile(relPath) {
  viewFilesCurrentPath = relPath
  viewFilesCurrentPathEl.textContent = relPath
  viewFilesContentEl.textContent = "Loading…"
  viewFilesListEl.querySelectorAll(".view-files-item").forEach((el) => {
    el.classList.toggle("active", el.dataset.path === relPath)
  })
  const result = await window.devLoop.readProjectFile(selectedWorkspacePath, relPath)
  if (viewFilesCurrentPath !== relPath) return // a newer click landed first
  viewFilesContentEl.textContent = result.error ? `❌ ${result.error}` : result.content
}

async function refreshFileList() {
  const files = await window.devLoop.listProjectFiles(selectedWorkspacePath)
  viewFilesListEl.innerHTML = ""
  if (!files.length) {
    viewFilesListEl.innerHTML = `<div class="config-note">No files yet — nothing drafted so far.</div>`
    return
  }
  for (const relPath of files) {
    const btn = document.createElement("button")
    btn.className = "view-files-item"
    btn.dataset.path = relPath
    btn.textContent = relPath
    btn.classList.toggle("active", relPath === viewFilesCurrentPath)
    btn.addEventListener("click", () => openFile(relPath))
    viewFilesListEl.appendChild(btn)
  }
  // If the file currently open got rewritten since the list was last
  // fetched, refresh its content too, not just the list — this button is
  // the one way to actually watch a file update as Claude keeps drafting.
  if (viewFilesCurrentPath && files.includes(viewFilesCurrentPath)) {
    openFile(viewFilesCurrentPath)
  }
}

// Auto-refreshes while the panel is open (every 3s) so a file being
// actively drafted visibly updates without needing to click Refresh
// repeatedly — this is meant to be watched passively, on screen, while
// Claude works. Stopped the moment the panel closes, not left running in
// the background.
let viewFilesAutoRefreshTimer = null

document.getElementById("view-files-btn").addEventListener("click", async () => {
  viewFilesOverlay.classList.add("active")
  await refreshFileList()
  clearInterval(viewFilesAutoRefreshTimer)
  viewFilesAutoRefreshTimer = setInterval(refreshFileList, 3000)
})
document.getElementById("view-files-refresh-btn").addEventListener("click", refreshFileList)
document.getElementById("view-files-close-btn").addEventListener("click", () => {
  viewFilesOverlay.classList.remove("active")
  clearInterval(viewFilesAutoRefreshTimer)
})
viewFilesOverlay.addEventListener("click", (e) => {
  if (e.target === viewFilesOverlay) {
    viewFilesOverlay.classList.remove("active")
    clearInterval(viewFilesAutoRefreshTimer)
  }
})

// Live build settings — the small overlay for the three
// orchestrator.config.json gates that still mean something once
// task-builder.js is already running (see main.js's read-live-gates/
// write-live-gates and task-builder.js's getAutoApprovePlans() etc., which
// re-read the file fresh on every check). This is NOT the Step 2 config
// wizard — that edits .setup-config.json, already fully consumed by the
// time a project reaches the dashboard.
const liveGatesOverlay = document.getElementById("live-gates-overlay")
const liveGatesErrorEl = document.getElementById("live-gates-error")
const liveGatesStatusEl = document.getElementById("live-gates-status")

function liveGateRadioValue(name) {
  const checked = document.querySelector(`input[name="${name}"]:checked`)
  return checked ? checked.value === "true" : false
}
function setLiveGateRadio(name, value) {
  const input = document.querySelector(`input[name="${name}"][value="${value ? "true" : "false"}"]`)
  if (input) input.checked = true
}

document.getElementById("live-gates-btn").addEventListener("click", async () => {
  liveGatesErrorEl.textContent = ""
  liveGatesStatusEl.textContent = ""
  const gates = await window.devLoop.readLiveGates(selectedWorkspacePath)
  if (!gates) {
    liveGatesErrorEl.textContent = "Couldn't read orchestrator.config.json for this project."
  } else {
    setLiveGateRadio("liveAutoApprovePlans", gates.autoApprovePlans)
    setLiveGateRadio("liveAutoMergeTasks", gates.autoMergeTasks)
    setLiveGateRadio("liveCreateBranchPerTask", gates.createBranchPerTask)
  }
  liveGatesOverlay.classList.add("active")
})
document.getElementById("live-gates-close-btn").addEventListener("click", () => {
  liveGatesOverlay.classList.remove("active")
})
liveGatesOverlay.addEventListener("click", (e) => {
  if (e.target === liveGatesOverlay) liveGatesOverlay.classList.remove("active") // click on the dim backdrop, not the panel itself
})
document.getElementById("live-gates-save-btn").addEventListener("click", async () => {
  liveGatesErrorEl.textContent = ""
  liveGatesStatusEl.textContent = ""
  try {
    await window.devLoop.writeLiveGates(selectedWorkspacePath, {
      autoApprovePlans: liveGateRadioValue("liveAutoApprovePlans"),
      autoMergeTasks: liveGateRadioValue("liveAutoMergeTasks"),
      createBranchPerTask: liveGateRadioValue("liveCreateBranchPerTask"),
    })
    liveGatesStatusEl.textContent = "✓ Saved — takes effect on the next gate the build hits."
  } catch (err) {
    console.error(err)
    liveGatesErrorEl.textContent = `Something went wrong (see DevTools console): ${err.message}`
  }
})

// "☑️ All Tasks" — a read-only view of .plan/000-backlog.md (the same
// checklist Phase E wrote and the human is expected to prune/reorder by
// hand before the build starts), reachable from the running dashboard where
// there was previously no way to see the full task list at all. Never
// editable from here — task-builder.js's own markBacklogTaskDone() is the
// single source of truth for which checkbox is ticked; letting a human
// toggle it from a second place risks the two drifting out of sync.
const viewTasksOverlay = document.getElementById("view-tasks-overlay")
const viewTasksBodyEl = document.getElementById("view-tasks-body")

// Parses the exact checklist-line shape getNextBacklogTask() itself reads
// in task-builder.js ("- [ ] Title | scope: ... | cmd: ... | url: ...") —
// only the checked state and the title (before the first "|") matter for
// display; the rest is metadata this view has no reason to show.
function parseBacklogChecklist(text) {
  const items = []
  for (const rawLine of text.split("\n")) {
    const match = rawLine.trim().match(/^-\s*\[( |x|X)\]\s*(.+)$/)
    if (!match) continue
    const done = match[1].toLowerCase() === "x"
    const title = match[2].split("|")[0].trim()
    items.push({ done, title })
  }
  return items
}

// Mirrors task-builder.js's own slugify(title) exactly (lowercase, non-
// alphanumeric runs -> single hyphen, trimmed, truncated to 60) — report
// filenames embed this same slug (`${date}-${TICKET}-${slug}-${agentKey}.md`),
// so recomputing it here is how a report gets matched back to the backlog
// line it belongs to without task-builder.js needing to expose any new
// lookup of its own.
function slugifyTaskTitle(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "task"
}

// A report's own filename has no delimiter marking where the slug ends and
// the trailing `-<agentKey>.md` begins (both are just hyphen-joined), so this
// matches by substring rather than an exact split — safe in practice since
// the slug itself is already a highly specific, near-full-title string.
function reportsForTaskSlug(reportPaths, slug) {
  return reportPaths.filter((p) => p.split("/").pop().includes(slug))
}

// Report filenames end in `-<agentKey>.md` (frontend, api-gateway, qa,
// security, ...) — pulled out just to label each option with which agent
// wrote it, since the rest of the filename is the same slug repeated for
// every report under one task and isn't worth showing.
function agentKeyFromReportPath(reportPath, slug) {
  const fileName = reportPath.split("/").pop().replace(/\.md$/, "")
  const afterSlug = fileName.split(slug).pop().replace(/^-+/, "")
  return afterSlug || fileName
}

// The leading `YYYY-MM-DD` a report filename always starts with — a task
// redone on a later day (see chat history: resetting a task for a redo
// leaves its OLD dated reports on disk alongside the new ones, since they
// don't collide by path) produces more than one report for the same agent
// key, which the dropdown label needs to distinguish or they're just
// identical-looking duplicate entries.
function dateFromReportPath(reportPath) {
  const m = reportPath.split("/").pop().match(/^(\d{4}-\d{2}-\d{2})-/)
  return m ? m[1] : ""
}

async function openReportViewer(relPath, label) {
  document.getElementById("report-viewer-inline")?.remove()
  const box = document.createElement("div")
  box.id = "report-viewer-inline"
  box.innerHTML = `<div class="report-viewer-header"><strong>${label}</strong><button type="button" id="report-viewer-close">✕</button></div><pre id="report-viewer-content">Loading…</pre>`
  document.getElementById("view-tasks-panel").appendChild(box)
  box.querySelector("#report-viewer-close").addEventListener("click", () => box.remove())
  const result = await window.devLoop.readProjectFile(selectedWorkspacePath, relPath)
  box.querySelector("#report-viewer-content").textContent = result?.error ? `Couldn't load this report: ${result.error}` : result.content
}

document.getElementById("view-tasks-btn").addEventListener("click", async () => {
  viewTasksOverlay.classList.add("active")
  viewTasksBodyEl.innerHTML = `<div style="font-size:13px;color:var(--dim);">Loading…</div>`
  const [backlogResult, allFiles] = await Promise.all([
    window.devLoop.readProjectFile(selectedWorkspacePath, ".plan/000-backlog.md"),
    window.devLoop.listProjectFiles(selectedWorkspacePath),
  ])
  if (backlogResult?.error) {
    viewTasksBodyEl.innerHTML = `<div style="font-size:13px;color:#f87171;">Couldn't load the task list: ${backlogResult.error}</div>`
    return
  }
  const items = parseBacklogChecklist(backlogResult.content || "")
  if (items.length === 0) {
    viewTasksBodyEl.innerHTML = `<div style="font-size:13px;color:var(--dim);">No tasks found in the backlog.</div>`
    return
  }
  const reportPaths = (Array.isArray(allFiles) ? allFiles : []).filter((p) => p.startsWith("docs/agent-reports/"))
  viewTasksBodyEl.innerHTML = items
    .map((item) => {
      const slug = slugifyTaskTitle(item.title)
      const matches = reportsForTaskSlug(reportPaths, slug)
      const sortedMatches = [...matches].sort().reverse() // newest date first (filenames start with YYYY-MM-DD)
      const reportsHtml = matches.length
        ? `<div class="view-task-reports">📄 <select class="view-task-report-select">` +
          `<option value="" selected disabled>${matches.length} report${matches.length === 1 ? "" : "s"} — pick one…</option>` +
          sortedMatches
            .map((p) => {
              const agentKey = agentKeyFromReportPath(p, slug)
              const date = dateFromReportPath(p)
              return `<option value="${p}">${agentKey}${date ? ` (${date})` : ""}</option>`
            })
            .join("") +
          `</select></div>`
        : ""
      return (
        `<div class="view-task-row${item.done ? " done" : ""}">` +
        `<span class="view-task-check">${item.done ? "✅" : "⬜"}</span>` +
        `<span class="view-task-text">${item.title}${reportsHtml}</span>` +
        `</div>`
      )
    })
    .join("")
  viewTasksBodyEl.querySelectorAll(".view-task-report-select").forEach((select) => {
    select.addEventListener("change", () => {
      const chosen = select.selectedOptions[0]
      openReportViewer(chosen.value, `${chosen.textContent} report`)
    })
  })
})
document.getElementById("view-tasks-close-btn").addEventListener("click", () => {
  viewTasksOverlay.classList.remove("active")
  document.getElementById("report-viewer-inline")?.remove()
})
viewTasksOverlay.addEventListener("click", (e) => {
  if (e.target === viewTasksOverlay) {
    viewTasksOverlay.classList.remove("active") // click on the dim backdrop, not the panel
    document.getElementById("report-viewer-inline")?.remove()
  }
})

// "🧠 Edit Models" — the same model review as Step 3, reachable again once
// the build is already running (people change their mind, a model gets
// deprecated mid-project, ...). Reads the pinned provider straight from the
// persisted .setup-config.json (not the in-memory detectedLlmAccounts the
// wizard step relies on) since this overlay can be opened after a fresh app
// launch that skipped straight to an already-configured project's
// dashboard, where that in-memory state was never populated this session.
const liveModelsOverlay = document.getElementById("live-models-overlay")
const liveModelsErrorEl = document.getElementById("live-models-error")
const liveModelsStatusEl = document.getElementById("live-models-status")

document.getElementById("live-models-btn").addEventListener("click", async () => {
  liveModelsErrorEl.textContent = ""
  liveModelsStatusEl.textContent = ""
  liveModelsOverlay.classList.add("active")
  const config = await window.devLoop.readSetupConfig(selectedWorkspacePath)
  await loadModelsInto({
    cursorSectionEl: document.getElementById("live-models-cursor-section"),
    claudeSectionEl: document.getElementById("live-models-claude-section"),
    cursorRowsEl: document.getElementById("live-models-cursor-rows"),
    claudeRowsEl: document.getElementById("live-models-claude-rows"),
    cursorStatusEl: document.getElementById("live-models-cursor-status"),
  }, config?.expectedLlmProvider)
  updateModelsContinueState()
})
document.getElementById("live-models-close-btn").addEventListener("click", () => {
  liveModelsOverlay.classList.remove("active")
})
liveModelsOverlay.addEventListener("click", (e) => {
  if (e.target === liveModelsOverlay) liveModelsOverlay.classList.remove("active") // click on the dim backdrop, not the panel itself
})
document.getElementById("live-models-save-btn").addEventListener("click", async (e) => {
  liveModelsErrorEl.textContent = ""
  liveModelsStatusEl.textContent = ""
  e.target.disabled = true
  try {
    const result = await window.devLoop.writeModelConfig(selectedWorkspacePath, modelsConfigState)
    if (result?.error) {
      liveModelsErrorEl.textContent = result.error
    } else {
      liveModelsStatusEl.textContent = "✓ Saved — takes effect on the next agent this build launches."
    }
  } catch (err) {
    console.error(err)
    liveModelsErrorEl.textContent = `Something went wrong (see DevTools console): ${err.message}`
  } finally {
    e.target.disabled = false
  }
})

window.devLoop.onLog((text) => {
  logEl.textContent += text
  logEl.scrollTop = logEl.scrollHeight
})

// Fallback input for when task-builder.js's own dashboard never loaded into the
// webview (its server failed to bind — confirmed live: a stale orphaned
// process was still holding the port — or just hasn't started yet this
// early in the run). Sends straight to task-builder.js's stdin; an empty send
// (just pressing Enter) still goes through, matching a plain terminal's
// bare-Enter answer to a "press Enter to continue" style prompt.
function sendLogInput() {
  const input = document.getElementById("log-input")
  const text = input.value
  input.value = ""
  window.devLoop.sendDevLoopInput(text).catch((err) => console.error(err))
}
document.getElementById("log-send-btn").addEventListener("click", sendLogInput)
document.getElementById("log-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendLogInput()
})

window.devLoop.onDashboardUrl((url) => {
  // Once the internal process's own dashboard server is up, this window
  // switches from raw log output to showing that dashboard directly.
  webviewEl.src = url
  webviewEl.classList.add("active")
  logPaneEl.classList.add("hidden")
  setRunStatus("Running.")
  startTaskbarOverlayPolling(url)
  webviewEl.focus()
})

// A <webview> is its own separate content process/frame — a click that
// lands on it while it does NOT already have focus gets consumed just to
// focus it (standard Electron/Chromium behavior), not delivered to the page
// as a real click. Confirmed live: this is exactly why every "y/N" choice
// button on the dashboard (git-init prompt, etc.) needed two clicks — the
// window had focus, but the webview inside it didn't yet. Refocusing the
// webview the moment this window itself regains OS focus (alt-tabbing back,
// clicking the taskbar icon, dismissing DevTools, ...) means it's already
// focused by the time a real click happens, so the first click actually
// registers instead of being silently spent on focus.
window.addEventListener("focus", () => {
  if (webviewEl.classList.contains("active")) webviewEl.focus()
})

window.devLoop.onExit((code) => {
  // Deliberately does NOT touch webviewEl/logPaneEl visibility — whichever
  // was showing (dashboard or raw log) stays exactly as it was, now frozen,
  // instead of snapping back to the log view every time the process exits.
  // stopBtn's own click handler already flips the button/status for a
  // deliberate Stop; this only needs to handle the process dying on its
  // own (a crash, or finishing the whole backlog) — same button swap, but
  // with an accurate status message.
  startBtn.disabled = false
  runStartBtn.disabled = false
  stopBtn.style.display = "none"
  runStartBtn.style.display = ""
  if (!stoppedByUser) {
    setRunStatus(code === 0 ? "Finished." : "Stopped unexpectedly — check the log/dashboard above.")
  }
  stopTaskbarOverlayPolling()
})

// Simple "you need to do something" taskbar badge — a plain red circle,
// deliberately NOT per-agent (earlier attempt drew a colored circle + the
// active agent's emoji; user explicitly asked for just a badge, no agent
// picture). Shared by both the chat step (Step 4) and the Agent Dashboard.
let attentionBadgeCanvas = null
function renderAttentionBadge() {
  if (!attentionBadgeCanvas) {
    attentionBadgeCanvas = document.createElement("canvas")
    attentionBadgeCanvas.width = 32
    attentionBadgeCanvas.height = 32
  }
  const ctx = attentionBadgeCanvas.getContext("2d")
  ctx.clearRect(0, 0, 32, 32)
  ctx.beginPath()
  ctx.arc(16, 16, 15, 0, Math.PI * 2)
  ctx.fillStyle = "#e0393e"
  ctx.fill()
  ctx.strokeStyle = "#1a1a1a"
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.fillStyle = "#ffffff"
  ctx.font = "bold 20px 'Segoe UI', sans-serif"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText("!", 16, 17)
  return attentionBadgeCanvas.toDataURL("image/png")
}

let attentionBadgeOn = false
function setAttentionBadge(on) {
  if (on === attentionBadgeOn) return
  attentionBadgeOn = on
  if (on) {
    window.devLoop.setTaskbarOverlay(renderAttentionBadge(), "Waiting for you").catch(() => {})
  } else {
    window.devLoop.setTaskbarOverlay(null, "").catch(() => {})
  }
}

let taskbarOverlayPollHandle = null

function stopTaskbarOverlayPolling() {
  if (taskbarOverlayPollHandle) {
    clearInterval(taskbarOverlayPollHandle)
    taskbarOverlayPollHandle = null
  }
  setAttentionBadge(false)
}

// Polls the SAME /status.json the embedded dashboard webview itself reads
// (see agent-dashboard.html's own poll()) — kept as a fully separate fetch
// loop here rather than reaching into the webview's isolated content
// process, since a <webview>'s page has no bridge back to this window's own
// preload/IPC. Badge tracks the same `awaitingInput` field the dashboard's
// own respond-box visibility is driven by.
function startTaskbarOverlayPolling(dashboardUrl) {
  stopTaskbarOverlayPolling()
  // dashboardUrl comes from main.js's own capture of task-builder.js's
  // "AGENT DASHBOARD — http://localhost:4949/" banner line, WITH the
  // trailing slash (it's also used as-is for webviewEl.src, where a
  // trailing slash is harmless). Naively appending "/status.json" here
  // produced "http://localhost:4949//status.json" — a double slash that
  // task-builder.js's exact `req.url === "/status.json"` route match never
  // matches, silently falling through to the dashboard's own catch-all
  // static route and returning its HTML instead of JSON. res.json() then
  // threw on every single poll tick, forever, swallowed by the catch below
  // — the badge code was never once reached. Confirmed live: zero
  // taskbar-overlay IPC calls ever logged despite a real, open approval
  // gate the whole time.
  const base = dashboardUrl.replace(/\/+$/, "")
  taskbarOverlayPollHandle = setInterval(async () => {
    try {
      const res = await fetch(`${base}/status.json`)
      const data = await res.json()
      setAttentionBadge(Boolean(data.awaitingInput))
    } catch {
      // Dashboard not reachable yet/anymore this tick — leave whatever
      // badge state is currently showing rather than flicker it off.
    }
  }, 2500)
}

// Dev-time convenience — confirms whether mongod.exe actually landed in
// resources/mongodb-win-x64/ (see its README) before anything tries to use
// it. Mongo isn't launched by this shell yet; this just surfaces presence.
window.devLoop.getMongodStatus().then((status) => {
  if (!status.present) {
    console.warn(`mongod.exe not found at ${status.path} — see electron/resources/mongodb-win-x64/README.md`)
  }
})
