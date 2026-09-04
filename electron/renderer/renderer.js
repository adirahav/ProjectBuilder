const step1El = document.getElementById("step-1")
const stepConfigEl = document.getElementById("step-config")
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
// the limit actually resets. Same pattern dev-loop.js's own
// SESSION_LIMIT_PATTERN uses for the exact same detection elsewhere.
function isSessionLimitMessage(text) {
  return /hit your (?:session|usage) limit|resets?\s+\d{1,2}:\d{2}\s*(?:am|pm)\b/i.test(text)
}

// Shared by proceedToChat() and sendChatMessage() — both get a reply the
// same shape and need the same handling: normally extractChoices() +
// clickable options, but a session-limit reply instead gets a Retry button
// (via setup-chat-resume — "re-ask your last question, don't restart") in
// place of answer choices, since there's nothing to answer until the limit
// actually resets.
function renderAssistantReply(text) {
  const { displayText, labels } = extractChoices(text)
  addChatMessage("assistant", displayText)
  if (isSessionLimitMessage(text)) {
    renderRetryButton()
  } else {
    renderAnswerOptions(displayText, labels)
  }
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
        addChatMessage("assistant", `Something went wrong: ${reply.error}`)
      } else {
        renderAssistantReply(reply.text)
      }
    } catch (e) {
      removeThinkingMessage(thinkingEl)
      console.error(e)
      addChatMessage("assistant", `Something went wrong (see DevTools console): ${e.message}`)
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
      addChatMessage("assistant", `Something went wrong: ${reply.error}`)
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
  } finally {
    chatSendBtn.disabled = false
    // Continue stays disabled here, deliberately — this is only the very
    // first question landing (or "picking up where we left off"), before
    // the human has actually said anything back yet. Nothing to
    // "continue" from at this point. It's enabled the moment a real reply
    // goes out, in sendChatMessage()'s own `finally` below — not here.
  }
}

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
    pendingResumeChat = !!result.resumeChat
    // Always through Step 2 (config wizard) then Step 3 (chat), in order,
    // for as long as the project hasn't reached Step 4 (the dashboard) —
    // never silently skipped, even when .setup-config.json already exists
    // from a previous visit. initConfigStep() prefills from it (existing
    // answers show pre-selected, e.g. "ungated" already checked) so
    // re-confirming is quick, but the human still sees and passes through
    // the screen itself, not just its result. Once the dashboard is
    // actually reached, "⚙️ Edit Setup" there is the only way back in —
    // see the run-area button, a deliberately different, narrower path
    // (three live gates in orchestrator.config.json, not this whole wizard).
    configReturnStep = 1
    initConfigStep()
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
// Goes to Step 2 (the config wizard), not all the way back to Step 1
// (folder pick) — reuses openConfigStep() (defined below) exactly like
// "⚙️ Edit Setup" does elsewhere, so Continue/Back from there return here
// to chat instead of starting a fresh session. Folder-repicking mid-project
// is still only reachable from the config wizard's own Back button once
// configReturnStep is back to 1 (i.e. only for a project that was never
// past Step 2 in the first place).
chatBackBtn.addEventListener("click", () => {
  openConfigStep("chat")
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
      // electron/resources/mongodb-win-x64/) — the "use local db" choice
      // above only WRITES a localhost connection string; this button
      // actually starts that bundled server so it's really there once
      // dev-loop.js reaches the point of needing it. Optional — dev-loop.js's
      // own ensureBackendEnv can still start it later if this is skipped.
      mongoFollowupEl.innerHTML = `<button type="button" id="cfg-start-mongo-btn" class="config-secondary-btn">🗄️ Start the built-in local database now</button>` +
        `<div id="cfg-start-mongo-status" class="config-note"></div>`
      document.getElementById("cfg-start-mongo-btn").addEventListener("click", async (e) => {
        const btn = e.currentTarget
        const statusEl = document.getElementById("cfg-start-mongo-status")
        btn.disabled = true
        btn.textContent = "Starting…"
        const result = await window.devLoop.startLocalMongo(selectedWorkspacePath)
        if (result.error) {
          console.error(result.error)
          statusEl.textContent = `❌ ${result.error}`
          btn.disabled = false
          btn.textContent = "🗄️ Start the built-in local database now"
        } else {
          statusEl.textContent = `✓ Running at ${result.connectionString}`
          btn.textContent = "✓ Started"
        }
      })
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
  // (team-members.json, dev-loop.js's ticket-assignment logic) — Jira and
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
  // development/setup-wizard.js's CLI equivalent.
  const gitEnabled = await window.devLoop.checkGitStatus(selectedWorkspacePath)
  if (!gitEnabled) {
    gitBodyEl.innerHTML = `<div class="config-note">No .git found here — this section is skipped. Run 'git init' before or after this setup if you want version control.</div>`
  } else {
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

  // Detects whoever's already logged in (never launches a login flow
  // itself — that's a real OAuth popup, which belongs to the chat step /
  // dev-loop.js's own attemptLogin(), not a background detection call on
  // this screen). If nothing's pinned here, dev-loop.js's own first run
  // asks then, exactly as it already does for a project with no
  // wizard-set value at all.
  const llmAccountBodyEl = document.getElementById("llm-account-body")
  const accounts = await window.devLoop.detectLlmAccounts()
  detectedLlmAccounts = accounts
  if (!accounts.claude && !accounts.cursor) {
    llmAccountBodyEl.innerHTML = `<div class="config-note">No LLM account (Claude or Cursor) detected as logged in — this is skipped; dev-loop.js will ask the first time it runs.</div>`
  } else {
    let optionsHtml = ""
    if (accounts.claude) optionsHtml += `<label class="radio-option"><input type="radio" name="llmAccountChoice" value="claude" checked> Claude (${accounts.claude})</label>`
    if (accounts.cursor) optionsHtml += `<label class="radio-option"><input type="radio" name="llmAccountChoice" value="cursor" ${accounts.claude ? "" : "checked"}> Cursor (${accounts.cursor})</label>`
    optionsHtml += `<label class="radio-option"><input type="radio" name="llmAccountChoice" value="none"> Don't pin one now — ask at build time</label>`
    llmAccountBodyEl.innerHTML = optionsHtml
    if (existingConfig?.expectedLlmProvider) setRadioChecked("llmAccountChoice", existingConfig.expectedLlmProvider)
  }
  // Shown, never selectable as a pin — dev-loop.js has no headless way to
  // actually run agents through Copilot CLI (no `-p`/print-mode equivalent,
  // unlike Claude/Cursor), so offering it as a radio option here would
  // claim something that isn't true. See main.js's detect-llm-accounts
  // handler for the detection mechanics (via `gh`, not `copilot` itself).
  if (accounts.githubCopilot) {
    llmAccountBodyEl.innerHTML += `<div class="config-note">Also detected: GitHub Copilot as ${accounts.githubCopilot} — reference only, dev-loop.js doesn't run agents through it.</div>`
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
    // away an in-progress conversation. Only the normal first-time flow
    // (configReturnStep === 1) advances into chat.
    if (configReturnStep === 1) {
      await proceedToChat()
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
      addChatMessage("assistant", `Something went wrong: ${reply.error}`)
    } else {
      renderAssistantReply(reply.text)
    }
  } catch (e) {
    removeThinkingMessage(thinkingEl)
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
// dev-loop.js is already running (see main.js's read-live-gates/
// write-live-gates and dev-loop.js's getAutoApprovePlans() etc., which
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
    liveGatesStatusEl.textContent = "✓ Saved — takes effect on the next gate dev-loop.js hits."
  } catch (err) {
    console.error(err)
    liveGatesErrorEl.textContent = `Something went wrong (see DevTools console): ${err.message}`
  }
})

window.devLoop.onLog((text) => {
  logEl.textContent += text
  logEl.scrollTop = logEl.scrollHeight
})

// Fallback input for when dev-loop.js's own dashboard never loaded into the
// webview (its server failed to bind — confirmed live: a stale orphaned
// process was still holding the port — or just hasn't started yet this
// early in the run). Sends straight to dev-loop.js's stdin; an empty send
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
})

// Dev-time convenience — confirms whether mongod.exe actually landed in
// resources/mongodb-win-x64/ (see its README) before anything tries to use
// it. Mongo isn't launched by this shell yet; this just surfaces presence.
window.devLoop.getMongodStatus().then((status) => {
  if (!status.present) {
    console.warn(`mongod.exe not found at ${status.path} — see electron/resources/mongodb-win-x64/README.md`)
  }
})
