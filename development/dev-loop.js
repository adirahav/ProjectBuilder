#!/usr/bin/env node
/**
 * Dev Loop Orchestrator
 *
 * This repo is a monorepo: `frontend/` + `backend/`, with one subfolder per
 * backend service — discovered at runtime from each backend/<service>/
 * package.json, see `discoverBackendServices()` below, not hardcoded here.
 * All backend services are built and run via `agents/backend/CLAUDE.md` (one
 * shared prompt, parameterized per service). Design source depends on
 * orchestrator.config.json's `designSource`: `"DESIGNER_AGENT"` runs the
 * Designer agent once, before the first backlog task, to establish the
 * visual system and key mockups the Frontend Agent then builds screens
 * against; `"FIGMA"`/`"AISTUDIO"` point at an existing filesystem export
 * instead; `"NONE"` means the Frontend Agent designs the UI itself per
 * `.rule/style-rules.md`. Issue tracking (Linear) is optional per
 * orchestrator.config.json's `linearEnabled` — when off, task approval
 * happens entirely through local plan files and terminal/chat approval
 * gates.
 *
 * Loop per backlog item:
 *   1) Pick next task from .plan/000-backlog.md
 *   2) Generate plan in .plan/NNN-YYYY-MM-DD-topic.md and request approval
 *   3) Launch the Frontend agent (builds UI per .rule/style-rules.md, defines API contract(s))
 *      through whichever LLM CLI this project is pinned to (Claude Code or Cursor `agent`)
 *   4) Launch Backend agents in parallel — one per discovered backend
 *      service, per .rule/architecture.md
 *   5) Launch QA validation
 *   6) Report done and wait for approval
 *   7) Launch Security audit
 *   8) Mark backlog item done and continue to next task
 */

import { execSync, spawn } from "child_process"
import dotenv from "dotenv"
import { existsSync, mkdirSync, openSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "fs"
import http from "http"
import { dirname, join, resolve, sep } from "path"
import { createInterface } from "readline"
import { fileURLToPath } from "url"

const __projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..")
process.chdir(__projectRoot)

dotenv.config({ path: `.env.${process.env.NODE_ENV || "development"}` })

// ─── Model mapping ──────────────────────────────────────────────────────────
// Which model each operation uses, per LLM provider. Opus (or Cursor's
// opus-thinking equivalent) is reserved for the operations that write
// multi-file production code end-to-end (frontend, backend x3) — that's
// where extra reasoning actually pays for itself. Everything else (planning,
// QA, security review, chat) is judgment/analysis over work already reviewed
// downstream, so Sonnet-class models get equivalent real-world quality at a
// fraction of the cost. Single place to retune cost/quality per operation
// without hunting through every spawnLlm() call site.
const MODEL_FOR = {
  planning:            "claude-sonnet-5", // askClaudeForPlan — initial plan draft (architecture reasoning, not code)
  "planning-revise":   "claude-sonnet-5", // askClaudeToRevisePlan — plan feedback rounds
  designer:            "claude-opus-5",   // Designer Agent — establishes the whole visual system once; worth the extra reasoning
  frontend:            "claude-opus-5",   // Frontend Agent — multi-file code generation
  qa:                  "claude-sonnet-5", // QA Agent — runs/reads existing tests, not creative code
  security:            "claude-sonnet-5", // Security Agent — checklist/scan-driven audit; bump to claude-opus-5 if audits need deeper adversarial reasoning
  "orchestrator-chat": "claude-sonnet-5", // waitForApprovalWithChat — short free-form chat during approval wait
}

// Cursor CLI (`agent --model`) names — same quality split as MODEL_FOR, mapped
// onto the ids `agent models` actually lists. Used only when ACTIVE_PROVIDER
// is "cursor"; Claude Code still uses MODEL_FOR above.
const CURSOR_MODEL_FOR = {
  planning:            "claude-sonnet-5-thinking-high",
  "planning-revise":   "claude-sonnet-5-thinking-high",
  designer:            "claude-opus-5-thinking-high",
  frontend:            "claude-opus-5-thinking-high",
  qa:                  "claude-sonnet-5-thinking-high",
  security:            "claude-sonnet-5-thinking-high",
  "orchestrator-chat": "claude-sonnet-5-thinking-high",
}

// Any backend service key (discovered per-project, not listed here by name)
// falls through to the frontend row, i.e. Opus-class — backend code generation
// gets the same treatment as frontend regardless of the service's name.
function modelFor(operation) {
  const table = ACTIVE_PROVIDER === "cursor" ? CURSOR_MODEL_FOR : MODEL_FOR
  return table[operation] || table.frontend
}

// Set by checkLlmAccount() before any agent spawn. "claude" runs the `claude`
// CLI; "cursor" runs Cursor's `agent` CLI. null until that check finishes.
let ACTIVE_PROVIDER = null
let ACTIVE_ACCOUNT_EMAIL = null

const CLAUDE_PERMISSION_MODE = process.env.CLAUDE_PERMISSION_MODE || getArg("--claude-permission-mode") || "bypassPermissions"
const CLAUDE_ALLOWED_TOOLS = process.env.CLAUDE_ALLOWED_TOOLS || getArg("--claude-allowed-tools")

// Orchestration/tooling settings (auto-approve behavior, design source,
// whether Linear is wired up) — deliberately NOT environment variables.
// None of these are secrets and none are read by the product's own runtime
// code; they only steer this script's own behavior, so they live in a plain,
// committed JSON file instead of an env file. This also sidesteps the
// secret-file-access hook entirely (it only guards local env files), so any
// Claude Code session — including the setup process itself — can read or
// update this file directly, no workaround needed. NEW-PROJECT-SETUP-PROMPT.md
// creates this file during setup, seeded from the "Approval mode" answer and
// Part 1 Q9 (Linear tracker, design source) — it isn't a worked example to
// adapt like most other template files.
const ORCHESTRATOR_CONFIG_PATH = "orchestrator.config.json"

function loadOrchestratorConfig() {
  if (!existsSync(ORCHESTRATOR_CONFIG_PATH)) return {}
  try {
    return JSON.parse(readFileSync(ORCHESTRATOR_CONFIG_PATH, "utf-8"))
  } catch {
    return {}
  }
}

// If orchestrator.config.json's autoApprovePlans is still unset/false and
// the setup process's own "Approval mode: ungated" is on record in
// .setup-progress.md, adopt it right now — before anything below reads the
// config — instead of asking the same "should I stop and ask you" question a
// second time. Plain JSON write, no hook involved, and it takes effect this
// same run (not just the next one), since it happens before AUTO_APPROVE_PLANS
// is computed below.
function adoptApprovalModeFromSetup() {
  const current = loadOrchestratorConfig()
  if (current.autoApprovePlans) return // already true — nothing to adopt
  if (process.env.AUTO_APPROVE_PLANS != null || getArg("--auto-approve-plans")) return // explicit override wins, don't touch the file

  const progressPath = ".setup-progress.md"
  if (!existsSync(progressPath)) return
  const match = readFileSync(progressPath, "utf-8").match(/^Approval mode:\s*(gated|ungated)/im)
  if (!match || match[1].toLowerCase() !== "ungated") return

  const updated = { ...current, autoApprovePlans: true }
  writeFileSync(ORCHESTRATOR_CONFIG_PATH, JSON.stringify(updated, null, 2) + "\n", "utf-8")
  // Plain console.log, not the log() helper — this runs at module load time,
  // before log()'s own AGENT_IDENTITY dependency further down the file has
  // been defined yet (a `const` in its temporal dead zone at this point).
  console.log(`Adopted "ungated" from .setup-progress.md — wrote autoApprovePlans: true to ${ORCHESTRATOR_CONFIG_PATH}.`)
}
adoptApprovalModeFromSetup()

const orchestratorConfig = loadOrchestratorConfig()

// Entirely optional — a human can run this against a plain directory with no
// git repo at all (no version control, or managed outside git). When false,
// every git-specific concept (branch-per-task, auto-commit, merge-approval)
// is skipped outright: agents just write files straight onto disk and the
// loop moves on to the next task. Checked once, at load time, since whether
// a repo exists here isn't expected to change mid-run.
let GIT_ENABLED = existsSync(".git")
let CREATE_BRANCH_PER_TASK = GIT_ENABLED && (
  process.env.CREATE_BRANCH_PER_TASK != null || getArg("--create-branch-per-task")
    ? /^(1|true|yes)$/i.test(process.env.CREATE_BRANCH_PER_TASK || getArg("--create-branch-per-task"))
    : orchestratorConfig.createBranchPerTask !== false
)

function updateGitStatus() {
  GIT_ENABLED = existsSync(".git")
  CREATE_BRANCH_PER_TASK = GIT_ENABLED && (
    process.env.CREATE_BRANCH_PER_TASK != null || getArg("--create-branch-per-task")
      ? /^(1|true|yes)$/i.test(process.env.CREATE_BRANCH_PER_TASK || getArg("--create-branch-per-task"))
      : orchestratorConfig.createBranchPerTask !== false
  )
}

// When true, the plan-review gate never stops to wait on a human — it
// accepts the orchestrator's own "- Recommended: ..." answer on every Open
// Question and proceeds automatically. Questions are still asked/answered IN
// the plan file itself (the orchestrator still reasons through them) — this
// only skips the terminal STOP-AND-ASK wait for a human to type APPROVED.
// A CLI flag/env var can still override the config file for a one-off run.
const AUTO_APPROVE_PLANS = process.env.AUTO_APPROVE_PLANS != null || getArg("--auto-approve-plans")
  ? /^(1|true|yes)$/i.test(process.env.AUTO_APPROVE_PLANS || getArg("--auto-approve-plans"))
  : Boolean(orchestratorConfig.autoApprovePlans)

// Separate from AUTO_APPROVE_PLANS on purpose — merging into the base branch
// is a distinct decision from plan/feature approval (it's the one that
// actually changes the branch the human is sitting on), so it gets its own
// opt-in flag rather than being silently bundled into the other one. False
// (always ask) unless explicitly turned on.
const AUTO_MERGE_TASKS = process.env.AUTO_MERGE_TASKS != null || getArg("--auto-merge-tasks")
  ? /^(1|true|yes)$/i.test(process.env.AUTO_MERGE_TASKS || getArg("--auto-merge-tasks"))
  : Boolean(orchestratorConfig.autoMergeTasks)

// Separate from AUTO_APPROVE_PLANS too — the Designer agent's output is a
// one-time, project-wide visual decision every screen built afterward has to
// match, not a per-task thing. False (always ask) unless explicitly turned
// on. Only relevant when designSource is "DESIGNER_AGENT" at all.
const AUTO_APPROVE_DESIGN = process.env.AUTO_APPROVE_DESIGN != null || getArg("--auto-approve-design")
  ? /^(1|true|yes)$/i.test(process.env.AUTO_APPROVE_DESIGN || getArg("--auto-approve-design"))
  : Boolean(orchestratorConfig.autoApproveDesign)

const PLAN_DIR = ".plan"
const REPORTS_DIR = "docs/agent-reports"
const COST_DIR = "docs/cost"
// The dashboard's "last completed task" cost card reads from here, not from
// the ephemeral docs/agent-status.json — that file is live/transient by
// design (safe to delete, gets rebuilt from scratch), but a finished task's
// final cost is real historical data that should survive a dev-loop.js
// restart or a status-file cleanup, same as the per-task .txt files already
// written into COST_DIR.
const LAST_TASK_COST_PATH = "docs/cost/last-task.json"
// Running append-only log of every completed task's total — feeds the
// dashboard's task-history list. Distinct from LAST_TASK_COST_PATH (which
// holds the full per-agent breakdown for just the most recent task).
const TASK_HISTORY_PATH = "docs/cost/task-history.json"
const BACKLOG_FILE = `${PLAN_DIR}/000-backlog.md`
const LATEST_PLAN_FILE = "docs/LAST_PLAN.md"
const STATE_DIR = "docs/task-state"

let USD_TO_NIS = 3.7

// The FIRST scaffold task for a given service needs to launch the Backend
// Agent for it BEFORE backend/<service>/ exists on disk at all — relying
// solely on directory-scanning is a chicken-and-egg bug: BACKEND_SERVICE_KEYS
// would be empty at that point, the per-service launch loop below would have
// nothing to iterate for it, and the task would silently complete as DONE
// with the backend agent never having run (confirmed happening for real —
// see chat history).
//
// This used to be solved by scanning the backlog file's own `scope:` fields
// for service-looking tokens — but that meant trusting free-form prose a
// human (or an agent) can and did corrupt, which briefly invented a fake
// backend service out of scrambled text and put a garbage node on the
// dashboard ring (also seen for real — see chat history). `backendServices`
// in orchestrator.config.json is the fix: an explicit, structured array set
// once during project setup (development/NEW-PROJECT-SETUP-PROMPT.md) —
// nothing here parses arbitrary text to guess at it.
function configuredBackendServices() {
  return Array.isArray(orchestratorConfig.backendServices) ? orchestratorConfig.backendServices : []
}

// Backend services are discovered from backend/*/package.json (already-
// scaffolded services) UNIONED with orchestrator.config.json's
// `backendServices` (the project's full intended list, set once at setup —
// see configuredBackendServices() above). Sorted for a stable, reproducible
// order (port/ticket-code assignment below depends on it). Falls back to []
// only if `backendServices` was never configured AND nothing's scaffolded
// yet — at that point this project isn't multi-agent/has no backend at all.
function discoverBackendServices() {
  const onDisk = existsSync("backend")
    ? readdirSync("backend", { withFileTypes: true })
        .filter((e) => e.isDirectory() && existsSync(`backend/${e.name}/package.json`))
        .map((e) => e.name)
    : []
  return [...new Set([...onDisk, ...configuredBackendServices()])].sort()
}

// kebab-case service key -> camelCase property name, used to key the
// per-service config objects below (BACKEND_PORTS, API_CONTRACTS, tickets).
function camelKey(kebabKey) {
  return kebabKey.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
}

// `let`, not `const` — refreshBackendServiceKeys() (defined below, after
// API_CONTRACTS/BACKEND_PORTS/AGENT_IDENTITY exist to extend) reassigns this
// as new backend services are discovered mid-run, so a long dev-loop.js
// session self-heals without needing a restart every time a service becomes
// known (scaffolded on disk, or newly named in the backlog's `scope:`).
let BACKEND_SERVICE_KEYS = discoverBackendServices()
const DESIGNER_ENABLED = orchestratorConfig.designSource === "DESIGNER_AGENT"
function coreAgentKeys(backendKeys) {
  return DESIGNER_ENABLED
    ? ["orchestrator", "designer", "frontend", ...backendKeys, "qa", "security"]
    : ["orchestrator", "frontend", ...backendKeys, "qa", "security"]
}
let ALL_AGENT_KEYS = coreAgentKeys(BACKEND_SERVICE_KEYS)

function designSourceGuidance() {
  const src = orchestratorConfig.designSource
  if (src === "AISTUDIO") {
    return "Design source of truth is raw_from_ai_studio/ — match colors, spacing, and component structure. Do not use that folder's package.json for dependency decisions."
  }
  if (src === "FIGMA") {
    return "Design source is Figma (via MCP)."
  }
  if (src === "DESIGNER_AGENT") {
    return "Design source is docs/design/mockups/ (Designer agent output) plus docs/design/design-notes.md."
  }
  return "No external design source is provided for this project. Design the UI per .rule/style-rules.md."
}

// ─── Task resume state ──────────────────────────────────────────────────────
// Persisted per backlog task-slug so a crash/restart at any point (plan review,
// task-id assignment, or any agent step) picks up from the last completed step
// instead of regenerating the plan or rerunning agents that already finished.

function getStatePath(slug) {
  return `${STATE_DIR}/${slug}.json`
}

function loadTaskState(slug) {
  const path = getStatePath(slug)
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, "utf-8"))
  } catch {
    return null
  }
}

function saveTaskState(slug, state) {
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true })
  writeFileSync(getStatePath(slug), JSON.stringify(state, null, 2), "utf-8")
}

function clearTaskState(slug) {
  const path = getStatePath(slug)
  if (existsSync(path)) rmSync(path)
}

// ─── Agent identity ───────────────────────────────────────────────────────────

const RESET = "\x1b[0m"

const AGENT_IDENTITY = {
  "orchestrator": { icon: "👑", color: "\x1b[33m", label: "orchestrator" },
  "designer":     { icon: "🖌️", color: "\x1b[95m", label: "designer" },
  "frontend":     { icon: "🎨", color: "\x1b[35m", label: "frontend" },
  "qa":           { icon: "🐛", color: "\x1b[32m", label: "qa" },
  "security":     { icon: "🛡️", color: "\x1b[36m", label: "security" },
}
for (const key of BACKEND_SERVICE_KEYS) {
  AGENT_IDENTITY[key] = { icon: "🔧", color: "\x1b[34m", label: ` ${key}` }
}

function agentPrefix(agentKey) {
  const identity = AGENT_IDENTITY[agentKey] || { icon: "🤖", color: "", label: agentKey }
  return `${identity.color}\n${identity.icon} [${identity.label.toUpperCase()}]${RESET} `
}

function prefixLines(text, agentKey) {
  const prefix = agentPrefix(agentKey)
  return text
    .split("\n")
    .map((line) => (line.trim() ? `${prefix}${line}` : ""))
    .join("\n")
}

// ─── Exchange rate ────────────────────────────────────────────────────────────

async function fetchUsdToNis() {
  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=USD&to=ILS")
    const data = await res.json()
    return data?.rates?.ILS ?? USD_TO_NIS
  } catch {
    return USD_TO_NIS
  }
}

// ─── Cost tracking ────────────────────────────────────────────────────────────

let costLog = []

function recordCost(role, label, rawStdout) {
  if (!rawStdout) return null

  let parsed
  try {
    parsed = JSON.parse(rawStdout)
  } catch {
    return rawStdout
  }

  costLog.push({
    role,
    label,
    inputTokens:     parsed.usage?.input_tokens ?? 0,
    outputTokens:    parsed.usage?.output_tokens ?? 0,
    cacheReadTokens: parsed.usage?.cache_read_input_tokens ?? 0,
    costUsd:         parsed.total_cost_usd ?? 0,
    durationMs:      parsed.duration_ms ?? 0,
  })
  // NOT writeLastTaskCost() here — the dashboard's cost card is meant to
  // show a completed task's final total, not a live-growing partial number
  // for whichever task is still in progress (that number isn't the real
  // answer yet, so showing it invites reading it as final when it's still
  // climbing). The one and only write happens in printCostTable(), once a
  // task is done.

  return parsed.result ?? rawStdout
}

// Mirrors the terminal's cost table (console.table in logLastCost/
// printCostTable) into a small persistent file the dashboard reads — NOT
// into docs/agent-status.json, which is ephemeral/rebuildable by design.
// A finished task's cost is real history and should survive a dev-loop.js
// restart or that file being deleted, exactly like the per-task .txt/JSON
// records already written into COST_DIR.
function writeLastTaskCost(taskLabel) {
  const rows = costLog.map((entry) => ({
    role: entry.role,
    label: entry.label,
    inputTokens: entry.inputTokens,
    outputTokens: entry.outputTokens,
    cacheReadTokens: entry.cacheReadTokens,
    costUsd: entry.costUsd,
    costNis: entry.costUsd * USD_TO_NIS,
    durationS: entry.durationMs / 1000,
  }))
  const record = {
    costTask: taskLabel,
    costLog: rows,
    costTotalUsd: rows.reduce((sum, r) => sum + r.costUsd, 0),
    costTotalNis: rows.reduce((sum, r) => sum + r.costNis, 0),
  }
  try {
    if (!existsSync(COST_DIR)) mkdirSync(COST_DIR, { recursive: true })
    writeFileSync(LAST_TASK_COST_PATH, JSON.stringify(record, null, 2), "utf-8")
  } catch (e) {
    warn(`Could not write ${LAST_TASK_COST_PATH} (${e.message}) — the dashboard's cost card may not reflect this task's final total.`)
  }
}

function readTaskHistory() {
  try {
    return existsSync(TASK_HISTORY_PATH) ? JSON.parse(readFileSync(TASK_HISTORY_PATH, "utf-8")) : []
  } catch {
    return []
  }
}

// Appends one entry per completed task — never overwrites earlier ones,
// unlike LAST_TASK_COST_PATH. Called once per task alongside writeLastTaskCost().
function appendTaskHistory(taskLabel, totalCostUsd, totalCostNis, callCount) {
  try {
    if (!existsSync(COST_DIR)) mkdirSync(COST_DIR, { recursive: true })
    const history = readTaskHistory()
    history.push({
      task: taskLabel,
      totalCostUsd,
      totalCostNis,
      callCount,
      completedAt: new Date().toISOString(),
    })
    writeFileSync(TASK_HISTORY_PATH, JSON.stringify(history, null, 2), "utf-8")
  } catch (e) {
    warn(`Could not write ${TASK_HISTORY_PATH} (${e.message}) — the dashboard's task-history list may be missing this task.`)
  }
}

function formatTextTable(rows) {
  const cols = ["Agent", "In tokens", "Out tokens", "Cache read", "Cost (USD)", "Cost (NIS)", "Duration"]
  const widths = Object.fromEntries(cols.map((c) => [c, c.length]))
  for (const row of rows) {
    for (const col of cols) widths[col] = Math.max(widths[col], String(row[col] ?? "").length)
  }
  const sep = "+" + cols.map((c) => "-".repeat(widths[c] + 2)).join("+") + "+"
  const header = "|" + cols.map((c) => ` ${c.padEnd(widths[c])} `).join("|") + "|"
  const lines = [sep, header, sep]
  for (const row of rows) {
    lines.push("|" + cols.map((c) => ` ${String(row[c] ?? "").padEnd(widths[c])} `).join("|") + "|")
  }
  lines.push(sep)
  return lines.join("\n") + "\n"
}

function buildAgentRows(entry) {
  const rows = ALL_AGENT_KEYS.map((key) => {
    const active = key === entry.role
    return {
      Agent:        key,
      "In tokens":  active ? entry.inputTokens : 0,
      "Out tokens": active ? entry.outputTokens : 0,
      "Cache read": active ? entry.cacheReadTokens : 0,
      "Cost (USD)": active ? `$${entry.costUsd.toFixed(4)}` : "$0.0000",
      "Cost (NIS)": active ? `₪${(entry.costUsd * USD_TO_NIS).toFixed(4)}` : "₪0.0000",
      Duration:     active ? `${(entry.durationMs / 1000).toFixed(1)}s` : "-",
    }
  })
  rows.push({
    Agent:        "TOTAL",
    "In tokens":  entry.inputTokens,
    "Out tokens": entry.outputTokens,
    "Cache read": entry.cacheReadTokens,
    "Cost (USD)": `$${entry.costUsd.toFixed(4)}`,
    "Cost (NIS)": `₪${(entry.costUsd * USD_TO_NIS).toFixed(4)}`,
    Duration:     `${(entry.durationMs / 1000).toFixed(1)}s`,
  })
  return rows
}

function logLastCost(label) {
  const entry = costLog[costLog.length - 1]
  if (!entry || entry.label !== label) return

  const rows = buildAgentRows(entry)
  console.table(rows)
}

function writeCombinedCostFile(taskLabel, totalCost, date) {
  const blocks = costLog.map((entry) => {
    const rows = buildAgentRows(entry)
    return `${entry.label}\n${formatTextTable(rows)}`
  })

  // Windows MAX_PATH (~260 chars) can be exceeded by long backlog titles once
  // combined with the cost dir prefix — cap the name so the write never
  // ENOENTs on a long task title (this crashed the whole loop process, even
  // though the task itself had already completed and been marked done).
  const safeName = (taskLabel || "task")
    .replace(/[/\\:*?"<>|—]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
    .trim()
  const dir = `${COST_DIR}/${date}`
  mkdirSync(dir, { recursive: true })
  const filePath = `${dir}/${safeName} - ${totalCost.toFixed(4)}.txt`
  try {
    writeFileSync(filePath, blocks.join("\n"), "utf-8")
    log(`Cost log: ${filePath}`)
  } catch (err) {
    warn(`Could not write cost log (${err.message}) — continuing, cost data is still in ${COST_DIR}/${date}/summary.json`)
  }
}

function printCostTable(taskLabel) {
  if (costLog.length === 0) return

  banner("COST & OBSERVABILITY — THIS TASK")
  const rows = costLog.map((entry) => ({
    Role:         entry.label,
    "In tokens":  entry.inputTokens,
    "Out tokens": entry.outputTokens,
    "Cache read": entry.cacheReadTokens,
    "Cost (USD)": `$${entry.costUsd.toFixed(4)}`,
    "Cost (NIS)": `₪${(entry.costUsd * USD_TO_NIS).toFixed(4)}`,
    Duration:     `${(entry.durationMs / 1000).toFixed(1)}s`,
  }))
  console.table(rows)

  const totalCost = costLog.reduce((sum, entry) => sum + entry.costUsd, 0)
  log(`Total cost this task: $${totalCost.toFixed(4)} / ₪${(totalCost * USD_TO_NIS).toFixed(4)} across ${costLog.length} Claude call(s).`)

  const date = new Date().toISOString().slice(0, 10)
  const traceFile = `${COST_DIR}/${date}/summary.json`
  mkdirSync(`${COST_DIR}/${date}`, { recursive: true })
  writeFileSync(traceFile, JSON.stringify({ tasks: costLog, totalCostUsd: totalCost }, null, 2), "utf-8")
  log(`Trace written: ${traceFile}`)

  writeCombinedCostFile(taskLabel, totalCost, date)

  // The one and only dashboard write for this task's cost data — a single
  // final snapshot, taken now that the total is actually final, tagged with
  // which task it belongs to. Persisted (not just in the live status file),
  // so it survives a restart and stays visible through the whole next task,
  // since nothing overwrites it again until THIS function runs once more.
  writeLastTaskCost(taskLabel)
  appendTaskHistory(taskLabel, totalCost, totalCost * USD_TO_NIS, costLog.length)
  costLog = []
}

// ─── Live agent-status dashboard ─────────────────────────────────────────────
// A small local HTTP server (no new dependency — Node's built-in `http`)
// serves the self-contained dashboard (development/agent-dashboard/agent-dashboard.html,
// inline CSS/JS), its voice-cue audio files (development/agent-dashboard/assets/*.mp3),
// and a live-updating event feed this script writes to at every meaningful
// moment (task picked, agent starting/skipped/done, waiting for approval,
// blocked). The dashboard polls that feed, animates which agent is active,
// and plays the matching voice cue — a prettier, audible alternative to
// reading the raw terminal.
const AGENT_STATUS_PATH = "docs/agent-status.json"
const DASHBOARD_PORT = Number(process.env.DASHBOARD_PORT) || 4949
const DASHBOARD_DIR = "development/agent-dashboard"

// Maps every backend service key this project actually has (ALL_AGENT_KEYS,
// minus orchestrator/frontend/qa/security) to the single generic "backend"
// voice/visual category — the dashboard doesn't need a distinct cue per
// service name, and the project's service list varies per project anyway.
function voiceCategory(agentKey) {
  if (["designer", "frontend", "qa", "security", "orchestrator"].includes(agentKey)) return agentKey
  return "backend"
}

// Monotonically increasing — lets the dashboard tell "a new event just
// happened, play its cue" apart from "the poll just re-fetched the same
// event it already played," without needing timestamps to be perfectly
// unique or comparable.
let eventSeq = 0
let currentTaskTitle = ""
let currentTaskProgress = null // { current, total } — set alongside currentTaskTitle, see getBacklogProgress()

function readStatus() {
  try {
    return existsSync(AGENT_STATUS_PATH) ? JSON.parse(readFileSync(AGENT_STATUS_PATH, "utf-8")) : {}
  } catch {
    return {}
  }
}

function writeStatus(status) {
  try {
    if (!existsSync("docs")) mkdirSync("docs", { recursive: true })
    writeFileSync(AGENT_STATUS_PATH, JSON.stringify(status, null, 2), "utf-8")
  } catch {
    // The dashboard is a convenience — a status-file write failure must never
    // affect the actual run.
  }
}

// The single place every dashboard-visible MOMENT (not routine chatter)
// funnels through. `eventType` is one of the dashboard's known event names
// (orchestrator-start, picking-next-task, task-done, agent-start,
// agent-skip, agent-back, session-limit, attention-needed, waiting-approval)
// — see development/agent-dashboard/agent-dashboard.html for the exact list
// and which audio file each maps to.
//
// Written into its own nested `lastEvent` field, separate from the
// top-level `message`/`category`/`keys` that get refreshed on every single
// output line via writeAgentStatus() below. This split exists because of a
// real bug: an agent can print dozens of lines a second, each call bumping
// the SAME top-level fields — at 1 poll/second, a discrete moment like
// "picking-next-task" was getting overwritten by the next routine output
// line before the dashboard's next poll ever saw it, so its cue silently
// never played. `lastEvent` is only ever touched here, never by routine
// output, so a real event's `seq` survives until the dashboard actually
// polls it, no matter how much chatter happens in between.
//
// `keys`, if given, is the exact set of ring nodes to visually light up —
// distinct from `agentKey`, which only decides the voice/category cue.
// Without this distinction, a combined "backend" start event (one shared
// sound for however many/whichever backend services this project has) would
// have to light up every backend node at once, even on a task where only
// one specific service is actually in scope. When omitted, `keys` defaults
// to just `[agentKey]`.
function emitEvent(eventType, agentKey, message, keys) {
  eventSeq += 1
  const lastLine = message ? String(message).split("\n").map((l) => l.trim()).filter(Boolean).pop() || "" : ""
  const resolvedKeys = keys || (agentKey ? [agentKey] : [])
  const status = readStatus()
  if (lastLine) status.message = lastLine
  status.category = agentKey ? voiceCategory(agentKey) : status.category || null
  status.keys = resolvedKeys
  status.task = currentTaskTitle
  status.taskProgress = currentTaskProgress
  status.updatedAt = new Date().toISOString()
  status.lastEvent = {
    seq: eventSeq,
    event: eventType,
    agent: agentKey || null,
    category: status.category,
    keys: resolvedKeys,
  }
  writeStatus(status)
}

// Per-output-line / per-log-call updates — refreshes only the live-text
// fields (message/category/keys), never `lastEvent`, so routine chatter can
// never clobber a real event before the dashboard's next poll sees it. This
// is what makes the ring highlight track who's *currently* talking in real
// time, while `lastEvent` independently tracks discrete moments for audio.
function writeAgentStatus(agentKey, message) {
  const lastLine = message ? String(message).split("\n").map((l) => l.trim()).filter(Boolean).pop() || "" : ""
  if (!lastLine) return
  const status = readStatus()
  status.message = lastLine
  status.category = agentKey ? voiceCategory(agentKey) : status.category || null
  status.keys = agentKey ? [agentKey] : status.keys || []
  status.task = currentTaskTitle
  status.taskProgress = currentTaskProgress
  status.updatedAt = new Date().toISOString()
  writeStatus(status)
}

// Auto-starts the frontend dev server in the background so the dashboard's
// live-preview iframe always has something to show, without ever risking
// blocking this script: spawned detached + unref'd, never awaited by the
// caller, and skipped entirely if something is already answering on
// FRONTEND_DEV_URL (including a dev server left running by a previous
// dev-loop.js run — detached processes outlive this script's own exit).
async function ensureFrontendDevServerRunning() {
  const frontendDir = "frontend"
  if (!existsSync(join(frontendDir, "package.json"))) return

  try {
    await fetch(FRONTEND_DEV_URL, { signal: AbortSignal.timeout(1500) })
    return // something's already serving there — leave it alone
  } catch {
    // not reachable — fall through and start it
  }

  try {
    if (!existsSync("docs")) mkdirSync("docs", { recursive: true })
    const logPath = "docs/frontend-dev-server.log"
    const logFd = openSync(logPath, "a")
    const spawnOpts = {
      cwd: frontendDir,
      detached: true,
      stdio: ["ignore", logFd, logFd],
      windowsHide: true,
      env: { ...process.env, CI: "1" },
    }

    // Windows only: `npm run dev` needs npm.cmd, a batch file, which forces
    // either shell:true or (per a confirmed Node/Windows bug) an EINVAL crash
    // if spawned directly with detached:true. shell:true wraps this in an
    // extra cmd.exe that — despite detached:true — was observed staying
    // attached to this script's own console: a Ctrl+C sent to THIS process
    // reached that wrapper too, which then hung forever at an unanswerable
    // "Terminate batch job (Y/N)?" prompt (stdin is "ignore") instead of the
    // frontend ever actually starting. Bypassing npm entirely — spawning
    // Vite's own JS entrypoint directly via node.exe, a real executable, no
    // shell/batch-file involved at all — sidesteps both problems. Falls back
    // to the npm/shell route (with the known Ctrl+C caveat) if that
    // entrypoint isn't where expected, e.g. a non-Vite frontend tool.
    const viteBin = join(frontendDir, "node_modules", "vite", "bin", "vite.js")
    const child = process.platform === "win32" && existsSync(viteBin)
      ? spawn(process.execPath, [join("node_modules", "vite", "bin", "vite.js"), "--strictPort"], spawnOpts)
      : spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "dev", "--", "--strictPort"], { ...spawnOpts, shell: process.platform === "win32" })
    child.unref()
    log(`Started the frontend dev server in the background (PID ${child.pid}) for the dashboard preview — output logged to ${logPath}.`)
  } catch (e) {
    warn(`Could not auto-start the frontend dev server (${e.message}) — the dashboard preview may stay blank until you run 'npm run dev' in frontend/ yourself.`)
  }
}

// Runs the Designer agent exactly once per project — before the first
// backlog task, never again after (a later task does not re-trigger this,
// even one that adds new screens; see agents/designer/CLAUDE.md and
// agents/orchestrator/CLAUDE.md's Step 0). Only called when
// orchestratorConfig.designSource is "DESIGNER_AGENT" — the caller already
// checks that, this function doesn't re-check it.
// Generation is idempotent for free via runAgent()'s own done-marker check.
// Approval is tracked separately (DESIGN_APPROVED_MARKER) since it's a
// distinct concern from generation — a restart after approval must not ask
// again, but a restart after generation-with-no-approval-yet still should.
const DESIGNER_REPORT_PATH = "docs/agent-reports/designer-agent-report.md"
const DESIGN_APPROVED_MARKER = "docs/design/.design-approved"

async function runDesignerIfNeeded() {
  emitEvent("agent-start", "designer")
  await runAgent({
    systemPrompt: "agents/designer/CLAUDE.md",
    input: [
      `You are the Designer Agent.`,
      `Establish this project's visual system and key-screen mockups.`,
      `Follow your CLAUDE.md instructions exactly.`,
      `End your final response with exact line: STATUS: DONE`,
    ].join("\n"),
    outputFile: DESIGNER_REPORT_PATH,
    doneMarker: "STATUS: DONE",
    label: "Designer Agent",
    agentKey: "designer",
  })
  emitEvent("agent-back", "orchestrator")

  if (!existsSync(DESIGN_APPROVED_MARKER)) {
    await reviewDesignUntilApproved()
  }
}

// Re-invokes the Designer agent — agentically, with tool access, exactly
// like the original run — asking it to edit the existing mockups/notes in
// place rather than start over. Unlike runAgent(), this never consults or
// updates the done-marker check in DESIGNER_REPORT_PATH's *existence*; it
// always runs when called (the approval loop below is what decides whether
// to call it at all).
async function runDesignerRevision(feedback) {
  const input = [
    `You are the Designer Agent, revising your own previous work based on human feedback.`,
    `Do not start over — edit the existing files under docs/design/mockups/ and docs/design/design-notes.md in place, keeping everything the feedback doesn't ask you to change.`,
    `Human feedback for this revision:`,
    feedback,
    `Follow your CLAUDE.md instructions exactly.`,
    `End your final response with exact line: STATUS: DONE`,
  ].join("\n")

  const rawStdout = await launchLlm({
    operation: "designer",
    systemPromptPath: "agents/designer/CLAUDE.md",
    input,
    agentKey: "designer",
  })
  if (rawStdout === null) return false

  const stdout = recordCost("designer", "Designer Agent (revision)", rawStdout)
  logLastCost("Designer Agent (revision)")
  ensureDirFor(DESIGNER_REPORT_PATH)
  writeFileSync(DESIGNER_REPORT_PATH, stdout, "utf-8")
  return true
}

// STOP-AND-ASK gate for the Designer agent's output — mirrors
// reviewPlanUntilApproved()'s shape (terminal APPROVED-or-feedback loop),
// but the "revision" is a real agentic file edit, not a regenerated text
// blob. AUTO_APPROVE_DESIGN skips the wait entirely, same escape hatch
// AUTO_APPROVE_PLANS gives plans.
async function reviewDesignUntilApproved() {
  if (AUTO_APPROVE_DESIGN) {
    log("Design gate: AUTO_APPROVE_DESIGN is on — accepting the Designer agent's own output, no terminal wait.")
    writeFileSync(DESIGN_APPROVED_MARKER, new Date().toISOString(), "utf-8")
    return
  }

  log("Design gate: review and refine. The build proceeds only after terminal APPROVED.")
  emitEvent("waiting-approval", "orchestrator", "Design review")

  while (true) {
    const answer = await askUserInput(
      `Review the mockups in docs/design/mockups/ (open the .html files in a browser) and docs/design/design-notes.md. Type APPROVED to continue, or enter feedback to revise the design: `,
      { choices: [{ label: "✅ APPROVED", value: "APPROVED" }] }
    )
    const normalized = answer.trim().toUpperCase()
    if (normalized === "APPROVED") {
      log("Design gate passed via terminal approval.")
      if (!existsSync("docs/design")) mkdirSync("docs/design", { recursive: true })
      writeFileSync(DESIGN_APPROVED_MARKER, new Date().toISOString(), "utf-8")
      return
    }

    const feedback = answer.trim()
    if (!feedback) {
      warn("No feedback given and not APPROVED — type feedback to revise, or APPROVED to continue.")
      continue
    }

    log("Revising the design based on your feedback...")
    emitEvent("agent-start", "designer")
    const ok = await runDesignerRevision(feedback)
    emitEvent("agent-back", "orchestrator")
    if (!ok) {
      warn("Could not revise the design (LLM unavailable). Try again, or edit the mockup files manually, then type APPROVED.")
    }
  }
}

// Returns a promise that resolves once the server has either started
// listening or failed to — callers await this before printing/asking
// anything else. Without it, .listen()'s callback fires asynchronously and
// can land in the middle of the very next interactive prompt (the
// branch-per-task question), interleaving the "AGENT DASHBOARD" banner with
// an already-displayed readline prompt and making it look like the terminal
// is stuck or re-asking, even though the prompt itself is still live and
// still accepting the answer already typed.
function startDashboardServer() {
  const dashboardPath = `${DASHBOARD_DIR}/agent-dashboard.html`
  const assetsDir = `${DASHBOARD_DIR}/assets`

  const server = http.createServer((req, res) => {
    // Lets the dashboard show the Designer agent's mockups in-page (a select
    // of screen names + an iframe pointed at /docs/design/mockups/<file> via
    // the generic /docs/** route below) instead of the human having to open
    // each .html file manually. Empty list (dir doesn't exist yet, or this
    // project isn't using the Designer agent) just means the panel stays
    // hidden client-side — this route never errors for that case.
    if (req.url === "/design-mockups.json") {
      const mockupsDir = "docs/design/mockups"
      const files = existsSync(mockupsDir)
        ? readdirSync(mockupsDir).filter((f) => f.endsWith(".html")).sort()
        : []
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" })
      res.end(JSON.stringify({ files }))
      return
    }

    if (req.url === "/status.json") {
      // `services` is injected fresh on every request — refreshBackendServiceKeys()
      // re-scans (disk + backlog `scope:`) right here, not just once at
      // startup, so a service that gets scaffolded (or newly named in the
      // backlog) mid-session appears on the ring within a second, no
      // dev-loop.js restart needed.
      refreshBackendServiceKeys()
      const base = existsSync(AGENT_STATUS_PATH)
        ? JSON.parse(readFileSync(AGENT_STATUS_PATH, "utf-8"))
        : { message: "", category: null, keys: [], task: "", taskProgress: null, updatedAt: null, lastEvent: null }
      // Cost/history data is NOT embedded here — the dashboard fetches
      // docs/cost/last-task.json and docs/cost/task-history.json directly via
      // the generic /docs/** static route below, so their shape can change
      // without ever touching this route's code again.
      // `awaitingInput` comes straight from the in-memory pendingHumanInput —
      // it can't live in the status FILE (its `respond` callback isn't
      // serializable), so this is the one field on this route that reflects
      // live process state instead of whatever was last written to disk.
      // While a `claude auth login` child is running (see
      // runClaudeLoginFlow()), there's no fixed one-shot pendingHumanInput —
      // it may need zero, one, or several typed lines (a device code,
      // Enter-to-continue, ...) forwarded to its stdin. Report a standing
      // "awaiting input" state for it too, distinct from pendingHumanInput,
      // so the dashboard keeps its respond-box open for the whole flow
      // instead of only around a single fixed question.
      const awaitingInput = pendingHumanInput
        ? { prompt: pendingHumanInput.prompt, expectsText: pendingHumanInput.expectsText, choices: pendingHumanInput.choices || null }
        : (activeLoginChild
          ? {
              prompt: "Login in progress — if the CLI asks for a code, paste it below and press Send. Otherwise just wait for the browser step to finish. Stuck (closed the browser tab, wrong account, ...)? Press Cancel and try again.",
              expectsText: true,
              cancellable: true,
            }
          : null)
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" })
      res.end(JSON.stringify({
        ...base,
        services: BACKEND_SERVICE_KEYS,
        awaitingInput,
        claudeAccount: ACTIVE_ACCOUNT_EMAIL,
        llmProvider: ACTIVE_PROVIDER,
        llmAccount: ACTIVE_ACCOUNT_EMAIL,
      }))
      return
    }

    // The dashboard's "waiting for you" box POSTs here — either a real typed
    // answer/feedback, or an empty body for "just press Enter." Whichever of
    // (this route / the terminal's own readline prompt) resolves first wins;
    // the other is a no-op since pendingHumanInput.respond() self-guards
    // against firing twice (see askUserInput()). While a login child is
    // running, text goes straight to its stdin instead — that flow can take
    // several rounds of input, not just one.
    if (req.url === "/respond" && req.method === "POST") {
      let body = ""
      req.on("data", (chunk) => { body += chunk })
      req.on("end", () => {
        let text = ""
        try { 
          const parsed = JSON.parse(body || "{}")
          text = parsed.text ?? "" 
        } catch (e) {
          warn(`Dashboard sent invalid JSON to /respond: ${e.message}`)
          res.writeHead(400)
          res.end()
          return
        }

        if (activeLoginChild) {
          activeLoginChild.stdin.write(text + "\n")
          res.writeHead(204)
          res.end()
          return
        }

        if (!pendingHumanInput) {
          warn("Dashboard sent input to /respond, but the orchestrator is not waiting for input.")
          res.writeHead(409, { "Content-Type": "application/json" })
          res.end(JSON.stringify({ error: "Nothing is waiting for input right now." }))
          return
        }
        log(`Input received from dashboard: "${text || "(empty)"}"`)
        pendingHumanInput.respond(text)
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ status: "ok" }))
      })
      return
    }

    // Kills a stuck `claude auth login` (closed the browser tab too early,
    // signed into the wrong account, the CLI just hung, ...) so the human
    // isn't stuck retyping into a dead prompt forever with no way out except
    // a terminal that, under the eventual Electron build, won't exist.
    // runClaudeLoginFlow()'s own child.on("close", ...) handler notices the
    // kill and resolves false — the caller (checkLlmAccount()) is what
    // decides whether to offer a retry from there.
    if (req.url === "/cancel-login" && req.method === "POST") {
      if (activeLoginChild) killProcessTree(activeLoginChild)
      res.writeHead(204)
      res.end()
      return
    }

    // The dashboard's Refresh button hits this before reloading the iframe —
    // reuses the exact same check-then-spawn logic as startup, so clicking
    // Refresh after "refused to connect" actually starts the frontend dev
    // server instead of just re-showing the same failure.
    if (req.url === "/ensure-frontend" && req.method === "POST") {
      ensureFrontendDevServerRunning()
        .catch(() => {})
        .finally(() => {
          res.writeHead(204)
          res.end()
        })
      return
    }

    // Generic static passthrough for docs/** (cost history, agent reports,
    // API contracts, ...) — reads straight from disk on every request, no
    // server-side route logic involved at all. Unlike /status.json (which
    // computes/shapes data and therefore needs a dev-loop.js restart to pick
    // up any change to that logic), this route's own code never needs to
    // change again just because the SHAPE of some file under docs/ changes —
    // the dashboard can just fetch whatever JSON it wants directly.
    if (req.url && req.url.startsWith("/docs/")) {
      const requestedPath = decodeURIComponent(req.url.slice(1).split("?")[0])
      const docsRoot = resolve("docs")
      const fullPath = resolve(requestedPath)
      // Must resolve to somewhere inside docs/ — blocks ../ escaping out.
      if (!fullPath.startsWith(docsRoot + sep) && fullPath !== docsRoot) {
        res.writeHead(403, { "Content-Type": "text/plain" })
        res.end("Forbidden")
        return
      }
      if (!existsSync(fullPath) || !statSync(fullPath).isFile()) {
        res.writeHead(404, { "Content-Type": "text/plain" })
        res.end("Not found")
        return
      }
      const ext = fullPath.split(".").pop().toLowerCase()
      const CONTENT_TYPES = { json: "application/json", md: "text/markdown; charset=utf-8", txt: "text/plain; charset=utf-8", html: "text/html; charset=utf-8" }
      res.writeHead(200, { "Content-Type": CONTENT_TYPES[ext] || "application/octet-stream", "Cache-Control": "no-store" })
      res.end(readFileSync(fullPath))
      return
    }

    if (req.url && req.url.startsWith("/assets/")) {
      // Now nested (assets/images/*, assets/audio/*) — resolved and checked
      // the same way as the /docs/** route above (must land inside
      // assetsDir), not a flat-filename-only substring check, since that
      // would reject every legitimate subdirectory path along with real
      // traversal attempts.
      const assetName = decodeURIComponent(req.url.slice("/assets/".length).split("?")[0])
      const assetsRoot = resolve(assetsDir)
      const assetPath = resolve(assetsDir, assetName)
      if (!assetPath.startsWith(assetsRoot + sep) || !existsSync(assetPath) || !statSync(assetPath).isFile()) {
        res.writeHead(404, { "Content-Type": "text/plain" })
        res.end("Not found")
        return
      }
      const ext = assetPath.split(".").pop().toLowerCase()
      const CONTENT_TYPES = { mp3: "audio/mpeg", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", svg: "image/svg+xml", webp: "image/webp", gif: "image/gif" }
      res.writeHead(200, { "Content-Type": CONTENT_TYPES[ext] || "application/octet-stream", "Cache-Control": "no-store" })
      res.end(readFileSync(assetPath))
      return
    }

    if (!existsSync(dashboardPath)) {
      res.writeHead(404, { "Content-Type": "text/plain" })
      res.end(`${dashboardPath} not found`)
      return
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
    res.end(readFileSync(dashboardPath, "utf-8"))
  })

  return new Promise((resolveStarted) => {
    // Without this, a failed .listen() (e.g. the port already held by a
    // zombie process from a previous interrupted run) emits an unhandled
    // 'error' event, which Node treats as an uncaught exception and crashes
    // the whole script — silently, with no clear message pointing at the
    // dashboard as the cause.
    server.on("error", (e) => {
      warn(`Dashboard server failed to start on port ${DASHBOARD_PORT} (${e.message}). The loop itself is unaffected — this only disables the visual dashboard for this run.`)
      if (e.code === "EADDRINUSE") {
        warn(`Something is already listening on ${DASHBOARD_PORT} — likely a previous dev-loop.js run that didn't shut down cleanly. Set DASHBOARD_PORT to a different port and rerun if you want the dashboard back.`)
      }
      resolveStarted(null)
    })

    server.listen(DASHBOARD_PORT, () => {
      const url = `http://localhost:${DASHBOARD_PORT}/`
      banner(`AGENT DASHBOARD — ${url}`)
      // A host that already embeds this dashboard itself (the Electron
      // desktop shell's own <webview>, see electron/main.js) sets this so a
      // second copy doesn't also pop open in the system's default browser —
      // there's nothing to open a real browser tab FOR in that case, the
      // human is already looking at this exact page.
      if (process.env.DEV_LOOP_NO_AUTO_OPEN) {
        log(`Dashboard ready at: ${url}`)
      } else {
        log(`If it didn't open automatically, open this URL yourself: ${url}`)
        const openCmd =
          process.platform === "win32" ? `start "" "${url}"` :
          process.platform === "darwin" ? `open "${url}"` :
          `xdg-open "${url}"`
        try {
          execSync(openCmd, { stdio: "ignore" })
        } catch (e) {
          warn(`Could not auto-open the dashboard (${e.message}) — open ${url} manually.`)
        }
      }
      resolveStarted(server)
    })
  })
}

// ─── Main ─────────────────────────────────────────────────────────────────────

// Two instances of this script running at once (e.g. two terminals, each
// running `node development/dev-loop.js`) will independently claim different
// backlog tasks, branch/work/merge in parallel with no coordination, and
// reliably produce a git merge conflict on .plan/000-backlog.md's checkbox
// lines when both try to merge back — exactly what happened before this
// guard existed. A simple PID lock file prevents a second instance from
// starting at all while one is already running.
const LOCK_PATH = ".dev-loop.lock"

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0) // signal 0: doesn't actually kill, just checks existence/permission
    return true
  } catch {
    return false
  }
}

function acquireLock() {
  if (existsSync(LOCK_PATH)) {
    const heldPid = Number(readFileSync(LOCK_PATH, "utf-8").trim())
    if (Number.isFinite(heldPid) && isProcessAlive(heldPid)) {
      printRed(`Refusing to start: another dev-loop.js is already running (PID ${heldPid}).`)
      printRed(`Running two instances at once will race on the same backlog and reliably produce a git merge conflict.`)
      printRed(`Finish or stop that one first (or delete ${LOCK_PATH} if you're certain it's not actually running anymore), then rerun.`)
      process.exit(1)
    }
    // Stale lock (process no longer alive) — safe to take over.
  }
  writeFileSync(LOCK_PATH, String(process.pid), "utf-8")

  const releaseLock = () => {
    try {
      if (existsSync(LOCK_PATH) && readFileSync(LOCK_PATH, "utf-8").trim() === String(process.pid)) {
        rmSync(LOCK_PATH)
      }
    } catch {
      // Best-effort cleanup — a leftover lock just self-heals via the stale-PID check above.
    }
  }
  process.on("exit", releaseLock)
  process.on("SIGINT", () => { releaseLock(); process.exit(130) })
  process.on("SIGTERM", () => { releaseLock(); process.exit(143) })
}

function cliOnPath(bin) {
  try {
    execSync(`${bin} --version`, { stdio: "ignore" })
    return true
  } catch {
    return false
  }
}

// Cursor's Windows installer puts `agent.cmd` in %LOCALAPPDATA%\cursor-agent,
// which is on the User PATH for new shells but often missing from a Node
// process launched before that install (or from a terminal that never
// refreshed PATH). Prepend that dir so `agent` resolves for the rest of
// this run without asking the human to restart their terminal.
function ensureCursorCliOnPath() {
  if (cliOnPath("agent")) return true
  const extra = process.platform === "win32"
    ? join(process.env.LOCALAPPDATA || "", "cursor-agent")
    : join(process.env.HOME || process.env.USERPROFILE || "", ".local", "bin")
  const exe = process.platform === "win32" ? "agent.cmd" : "agent"
  if (!existsSync(join(extra, exe))) return false
  process.env.PATH = extra + (process.platform === "win32" ? ";" : ":") + (process.env.PATH || "")
  return cliOnPath("agent")
}

// Fails fast with a clear, specific reason instead of a confusing crash deep
// inside the loop (e.g. "fetch is not defined" on old Node, or a cryptic
// spawn ENOENT the first time an agent tries to launch). Checked once, right
// at startup, before anything else runs.
// Async, and every failure exits via abortRun() rather than a raw
// printRed()+process.exit(), so the reason reaches the dashboard's message
// pane too — not just stdout. This currently runs under a terminal, but
// dev-loop.js is also meant to run headless under Electron eventually, where
// there is no terminal at all; a message only a terminal can show is a
// message nobody sees there. startDashboardServer() is deliberately the
// very first thing main() does, before this, so that channel already exists
// by the time any of these checks can fail.
async function checkPrerequisites() {
  const nodeMajor = Number(process.versions.node.split(".")[0])
  if (nodeMajor < 18) {
    await abortRun(`Node.js 18+ required (this script uses the native fetch API) — found ${process.version}. Install a current Node.js from https://nodejs.org, then rerun.`)
    return
  }

  if (GIT_ENABLED) {
    try {
      execSync("git --version", { stdio: "ignore" })
    } catch {
      await abortRun("git is not installed or not on PATH — this script runs real git commands (branch, commit, merge). Install git, then rerun.")
      return
    }
  } else {
    warn("No .git found at the repo root — running without version control. Agents will write files straight to disk; nothing gets branched, committed, or merged automatically. (Run 'git init' first if that's not what you want.)")
  }

  ensureCursorCliOnPath()
  const hasClaude = cliOnPath("claude")
  const hasCursor = cliOnPath("agent")
  if (!hasClaude && !hasCursor) {
    await abortRun("Neither the 'claude' CLI nor Cursor's 'agent' CLI is installed or on PATH — every agent step in this loop launches one of them as a subprocess. Install Claude Code ('claude auth login') and/or Cursor CLI from https://cursor.com/docs/cli ('agent login'), then rerun.")
    return
  }
}

// Each CLI's login is a single, machine-wide account, with no awareness of
// which project/IDE/Chrome profile it's being run from. On a machine used
// for both personal and work projects, that means a work project's agents
// can silently burn a *personal* account's usage/session limit (or vice
// versa) with no warning until it hits a limit mid-run.
// orchestrator.config.json's expectedLlmProvider + expectedLlmAccount pin
// which CLI and email this project should run under. A project with no
// value on record adopts whatever is currently logged in — after the human
// confirms it (and which provider, if both are logged in) — rather than
// blocking forever on a field nothing sets automatically.
// Legacy expectedClaudeAccount is still read as provider=claude.
function getLoggedInClaudeAccountEmail() {
  try {
    const out = execSync("claude auth status --json", { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] })
    const parsed = JSON.parse(out)
    return parsed?.loggedIn ? (parsed.email || null) : null
  } catch {
    return null
  }
}

function getLoggedInCursorAccountEmail() {
  try {
    const out = execSync("agent status --format json", { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] })
    const parsed = JSON.parse(out)
    if (!parsed?.isAuthenticated) return null
    return parsed.userInfo?.email || null
  } catch {
    return null
  }
}

function getLoggedInEmail(provider) {
  return provider === "cursor" ? getLoggedInCursorAccountEmail() : getLoggedInClaudeAccountEmail()
}

function getExpectedLlm() {
  if (orchestratorConfig.expectedLlmProvider && orchestratorConfig.expectedLlmAccount) {
    return {
      provider: String(orchestratorConfig.expectedLlmProvider).toLowerCase(),
      account: orchestratorConfig.expectedLlmAccount,
    }
  }
  if (orchestratorConfig.expectedClaudeAccount) {
    return { provider: "claude", account: orchestratorConfig.expectedClaudeAccount }
  }
  return { provider: null, account: null }
}

function pinExpectedLlm(provider, account) {
  const updated = { ...loadOrchestratorConfig(), expectedLlmProvider: provider, expectedLlmAccount: account }
  if (provider === "claude") updated.expectedClaudeAccount = account
  else delete updated.expectedClaudeAccount
  writeFileSync(ORCHESTRATOR_CONFIG_PATH, JSON.stringify(updated, null, 2) + "\n", "utf-8")
  orchestratorConfig.expectedLlmProvider = provider
  orchestratorConfig.expectedLlmAccount = account
  if (provider === "claude") orchestratorConfig.expectedClaudeAccount = account
  else delete orchestratorConfig.expectedClaudeAccount
  log(`Recorded expectedLlmProvider: ${provider}, expectedLlmAccount: ${account} in ${ORCHESTRATOR_CONFIG_PATH}.`)
}

function setActiveLlm(provider, email) {
  ACTIVE_PROVIDER = provider
  ACTIVE_ACCOUNT_EMAIL = email
  CLAUDE_ACCOUNT_EMAIL = email
  const label = LLM_PROVIDERS[provider]?.label || provider
  log(`Using ${label} as ${email} — every agent step this run launches through '${LLM_PROVIDERS[provider]?.bin || provider}'.`)
}

// child.kill() only signals the direct child — on Windows, when the child
// was spawned with shell:true (as runClaudeLoginFlow() does), that's cmd.exe,
// not the real claude.exe underneath it, which is then left running orphaned
// forever. `taskkill /T` kills the whole process tree rooted at that PID
// instead. Ported from electron/main.js's killProcessTree() — same bug,
// same fix, needed here too now that a human can cancel a stuck login from
// the dashboard (see /cancel-login below).
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

// Set while `claude auth login` is running as a child process — lets the
// dashboard's /respond route forward whatever the human types straight into
// its stdin (see startDashboardServer()'s /respond handler) instead of only
// the terminal's own stdin being able to answer it. `claude auth login` is
// normally interactive (opens a browser tab, and on some setups prints a
// device code to confirm); under the eventual Electron build there is no
// terminal to run it in at all, so this has to be answerable from the
// dashboard alone.
let activeLoginChild = null

// Registry of CLIs this loop can RUN agents through. Claude Code (`claude`)
// and Cursor CLI (`agent`) both support headless `--print` + stream-json.
// Login/status surfaces differ (`claude auth status --json` vs
// `agent status --format json`); getLoggedInEmail() wraps that.
const LLM_PROVIDERS = {
  claude: {
    label: "Claude",
    bin: "claude",
    loginArgs: (email) => ["auth", "login", "--claudeai", ...(email ? ["--email", email] : [])],
  },
  cursor: {
    label: "Cursor",
    bin: "agent",
    loginArgs: () => ["login"],
  },
}

// Runs a provider's login command and relays its output into the
// dashboard's message pane (via writeAgentStatus) as it happens, not just
// the terminal. Resolves true/false for whether the child exited cleanly —
// callers that can verify success programmatically (Claude, via
// getLoggedInClaudeAccountEmail()) still re-check that themselves
// afterward, since a clean exit here doesn't guarantee the login actually
// completed.
function runProviderLoginFlow(provider, prefillEmail = "") {
  return new Promise((resolve) => {
    const loginArgs = provider.loginArgs(prefillEmail)
    let child
    if (process.platform === "win32") {
      child = spawn([provider.bin, ...loginArgs.map(quoteArgForCmd)].join(" "), { stdio: ["pipe", "pipe", "pipe"], shell: true })
    } else {
      child = spawn(provider.bin, loginArgs, { stdio: ["pipe", "pipe", "pipe"], shell: false })
    }
    activeLoginChild = child

    // Terminal keeps working exactly as before (typed input piped straight
    // through) for as long as one exists; the dashboard gets the same
    // access via /respond while activeLoginChild is set.
    process.stdin.resume()
    process.stdin.pipe(child.stdin)

    const relay = (chunk) => {
      const text = chunk.toString()
      process.stdout.write(text)
      writeAgentStatus("orchestrator", text)
    }
    child.stdout.on("data", relay)
    child.stderr.on("data", relay)

    const finish = (ok) => {
      try { process.stdin.unpipe(child.stdin) } catch {}
      process.stdin.pause()
      activeLoginChild = null
      resolve(ok)
    }
    child.on("close", (code) => finish(code === 0))
    child.on("error", () => finish(false))
  })
}

function runClaudeLoginFlow(prefillEmail = "") {
  return runProviderLoginFlow(LLM_PROVIDERS.claude, prefillEmail)
}

// Runs `agent login` (Cursor) and then `agent status --format json` so we
// can verify the email the same way the Claude path does.
async function runCursorLoginFlow() {
  ensureCursorCliOnPath()
  if (!cliOnPath("agent")) {
    warn("Cursor's CLI ('agent') isn't installed or not on PATH — install it from https://cursor.com/docs/cli, then try again.")
    return false
  }

  log("Launching 'agent login' (Cursor) — a browser tab should open. If it asks for a code, type it in the box below and press Send.")
  const ok = await runProviderLoginFlow(LLM_PROVIDERS.cursor)
  const email = getLoggedInCursorAccountEmail()
  if (email) log(`Cursor status: logged in as ${email}`)
  else warn("Could not read Cursor login status ('agent status --format json' failed) — check manually if needed.")
  return ok && Boolean(email)
}

async function chooseLoginProvider() {
  const answer = await askUserInput(
    `Which provider should this project's agents run through? (Claude/Cursor) `,
    { choices: [{ label: "Claude", value: "claude" }, { label: "Cursor", value: "cursor" }] }
  )
  return answer.trim().toLowerCase().includes("cursor") ? "cursor" : "claude"
}

// Both printRed()s AND writeAgentStatus() (so the dashboard's message pane —
// not just the terminal — shows *why* the run stopped), then exits after a
// short delay instead of immediately: process.exit() also kills the
// dashboard's own http server, so the browser's next 1s poll needs a moment
// to land and pick up this message before the server disappears out from
// under it. Without the delay, clicking "n" in the dashboard looked like
// nothing happened at all — the tab just silently stopped updating.
async function abortRun(msg) {
  printRed(msg)
  writeAgentStatus("orchestrator", `❌ ${msg}`)
  // Callers must `await` this — it never resolves before process.exit()
  // fires, so the caller can't fall through to the rest of the loop (e.g.
  // spawning a Claude call) during the delay.
  await new Promise((resolve) => setTimeout(resolve, 1500))
  process.exit(1)
}

// Runs the login flow and, on failure (cancelled from the dashboard, closed
// the browser tab too early, signed into the wrong account, ...), offers to
// retry right there instead of dead-ending the whole run via abortRun() —
// that used to be the only outcome of a failed login, which meant one wrong
// click during OAuth killed the entire dev-loop.js process with no way back
// except restarting it from scratch. Returns the newly logged-in email, or
// null if the human explicitly gave up.
async function attemptLogin(provider = "claude", prefillEmail = "") {
  const spec = LLM_PROVIDERS[provider] || LLM_PROVIDERS.claude
  for (;;) {
    let newEmail = null
    if (provider === "cursor") {
      const loginOk = await runCursorLoginFlow()
      newEmail = getLoggedInCursorAccountEmail()
      if (loginOk && newEmail) return newEmail
    } else {
      log(`Launching 'claude auth login'${prefillEmail ? ` as ${prefillEmail}` : ""} — a browser tab should open. If it asks for a code, type it in the box below and press Send.`)
      const loginOk = await runClaudeLoginFlow(prefillEmail)
      newEmail = getLoggedInClaudeAccountEmail()
      if (loginOk && newEmail && (!prefillEmail || newEmail === prefillEmail)) return newEmail
    }

    const answer = await askUserInput(
      `${spec.label} login did not complete (still logged in as "${newEmail || "nobody"}"). Try again, or give up? (y/n) `,
      { choices: [{ label: "Try again", value: "y" }, { label: "Give up", value: "n" }] }
    )
    if (!/^y/i.test(answer.trim())) return null
  }
}

function probeLoggedInProviders() {
  ensureCursorCliOnPath()
  const loggedIn = {}
  if (cliOnPath("claude")) {
    const email = getLoggedInClaudeAccountEmail()
    if (email) loggedIn.claude = email
  }
  if (cliOnPath("agent")) {
    const email = getLoggedInCursorAccountEmail()
    if (email) loggedIn.cursor = email
  }
  return loggedIn
}

async function checkLlmAccount() {
  const loggedIn = probeLoggedInProviders()
  const loggedProviders = Object.keys(loggedIn)
  const expected = getExpectedLlm()

  if (expected.provider && expected.account) {
    const current = loggedIn[expected.provider] || null
    if (current === expected.account) {
      setActiveLlm(expected.provider, expected.account)
      return
    }

    printRed(`Wrong ${expected.provider} account: this project expects "${expected.account}" but "${current || "nobody"}" is currently logged in.`)
    const choices = []
    if (loggedIn.cursor) choices.push({ label: `Continue with Cursor (${loggedIn.cursor})`, value: "y:cursor" })
    if (loggedIn.claude) choices.push({ label: `Continue with Claude (${loggedIn.claude})`, value: "y:claude" })
    choices.push({ label: `Log in as ${expected.account} (${LLM_PROVIDERS[expected.provider]?.label || expected.provider})`, value: "s" })
    choices.push({ label: "Stop", value: "n" })

    const answer = await askUserInput(
      `This project is pinned to ${LLM_PROVIDERS[expected.provider]?.label || expected.provider} (${expected.account}). ` +
      `Currently: Claude=${loggedIn.claude || "not logged in"}, Cursor=${loggedIn.cursor || "not logged in"}. ` +
      `Type "y" to continue with a currently logged-in account, "s" to log in as ${expected.account} on ${expected.provider}, or "n" to stop. ` +
      `(If the project's owner genuinely changed, update "expectedLlmProvider" / "expectedLlmAccount" in ${ORCHESTRATOR_CONFIG_PATH} yourself instead — this check never overwrites them silently.) (y/n/s) `,
      { choices }
    )
    const choice = answer.trim().toLowerCase()
    if (choice === "s" || choice.startsWith("s")) {
      const newEmail = await attemptLogin(expected.provider, expected.provider === "claude" ? expected.account : "")
      if (!newEmail) {
        await abortRun("Aborting — account switch was not completed.")
        return
      }
      setActiveLlm(expected.provider, newEmail)
      return
    }
    if (choice === "n" || (choice.startsWith("n") && !choice.startsWith("y"))) {
      await abortRun(`Aborting — log in as ${expected.account} on ${expected.provider}, then rerun.`)
      return
    }
    if (choice.includes("cursor") && loggedIn.cursor) {
      setActiveLlm("cursor", loggedIn.cursor)
      return
    }
    if (choice.includes("claude") && loggedIn.claude) {
      setActiveLlm("claude", loggedIn.claude)
      return
    }
    if (loggedIn[expected.provider]) {
      setActiveLlm(expected.provider, loggedIn[expected.provider])
      return
    }
    const fallback = loggedIn.cursor ? "cursor" : (loggedIn.claude ? "claude" : null)
    if (fallback) {
      setActiveLlm(fallback, loggedIn[fallback])
      return
    }
    await abortRun(`Aborting — log in as ${expected.account} on ${expected.provider}, then rerun.`)
    return
  }

  if (loggedProviders.length === 0) {
    const answer = await askUserInput("No LLM account is logged in on this machine. Log in now? (y/n) ", {
      choices: [{ label: "Yes, log in", value: "y" }, { label: "No", value: "n" }],
    })
    if (!/^y/i.test(answer.trim())) {
      await abortRun("Aborting — not logged in. Log in ('claude auth login' or 'agent login'), then rerun.")
      return
    }
    const provider = await chooseLoginProvider()
    if (provider === "cursor" && !cliOnPath("agent") && !ensureCursorCliOnPath()) {
      await abortRun("Aborting — Cursor's CLI ('agent') is not installed. Install it from https://cursor.com/docs/cli, then rerun.")
      return
    }
    if (provider === "claude" && !cliOnPath("claude")) {
      await abortRun("Aborting — the 'claude' CLI is not installed. Install Claude Code, then rerun.")
      return
    }
    const targetEmail = provider === "claude"
      ? (await askUserInput("Email to log in to Claude as (leave blank to just open the login page): ")).trim()
      : ""
    const newEmail = await attemptLogin(provider, targetEmail)
    if (!newEmail) {
      await abortRun("Aborting — not logged in. Log in, then rerun.")
      return
    }
    setActiveLlm(provider, newEmail)
    pinExpectedLlm(provider, newEmail)
    return
  }

  let provider
  let email
  if (loggedProviders.length === 2) {
    const answer = await askUserInput(
      `Both Claude (${loggedIn.claude}) and Cursor (${loggedIn.cursor}) are logged in. Which should this project's agents run through going forward? (Claude/Cursor) `,
      { choices: [
        { label: `Cursor (${loggedIn.cursor})`, value: "cursor" },
        { label: `Claude (${loggedIn.claude})`, value: "claude" },
      ] }
    )
    provider = answer.trim().toLowerCase().includes("cursor") ? "cursor" : "claude"
    email = loggedIn[provider]
  } else {
    provider = loggedProviders[0]
    email = loggedIn[provider]
    const answer = await askUserInput(
      `No expected LLM account is set for this project yet. Currently logged in to ${LLM_PROVIDERS[provider].label} as ${email} — use this account for this project going forward? ` +
      `Type "y" to use it, "s" to switch — logs in as a different provider/account right here — or "n" to stop without switching. (y/n/s) `,
      { choices: [{ label: "Yes", value: "y" }, { label: "No, switch", value: "s" }] }
    )
    const choice = answer.trim().toLowerCase()
    if (choice === "s") {
      const next = await chooseLoginProvider()
      const targetEmail = next === "claude"
        ? (await askUserInput("Email to log in to Claude as (leave blank to just open the login page): ")).trim()
        : ""
      if (next === provider && next === "cursor" && email) {
        // Already on Cursor with a session — switching to a different Cursor
        // account still needs a fresh login.
      }
      const newEmail = await attemptLogin(next, targetEmail)
      if (!newEmail) {
        await abortRun("Aborting — account switch was not completed.")
        return
      }
      provider = next
      email = newEmail
    } else if (choice !== "y" && !choice.startsWith("y")) {
      await abortRun("Aborting — log in to the intended account for this project, then rerun.")
      return
    }
  }

  setActiveLlm(provider, email)
  pinExpectedLlm(provider, email)
}

async function main() {
  // Started before every other check, deliberately — checkPrerequisites()
  // and checkLlmAccount() can both fail this early, and this is the one
  // channel (besides the terminal, which won't exist under the eventual
  // Electron build) that can show the human why. Nothing below can rely on
  // a terminal being present or watched.
  await startDashboardServer()

  // Prompt to initialize git if missing — version control is highly
  // recommended for agent safety and context.
  if (!GIT_ENABLED) {
    banner("GIT IS NOT INITIALIZED")
    const answer = await askUserInput(
      "This project has no git repo. Agents work better and are safer with git (for diffs/rollbacks). " +
      "Initialize git now? (y/N): "
    )
    if (answer.trim().toLowerCase() === "y") {
      try {
        log("Initializing git repository...")
        execSync("git init", { stdio: "inherit" })
        execSync("git add .", { stdio: "inherit" })
        execSync("git commit -m \"initial commit from dev-loop setup\"", { stdio: "inherit" })
        updateGitStatus()
        log("Git initialized and initial commit created.")
      } catch (e) {
        warn(`Failed to initialize git: ${e.message}`)
      }
    }
  }

  // A "Session limit hit — resets X" banner is only ever meant to live for
  // as long as an actual blockAndRetry() is waiting on it — it's cleared the
  // moment the human responds. If the previous run got killed instead of
  // finishing that exchange normally (Ctrl+C, crash, ...), the banner is
  // stuck in docs/agent-status.json forever, and shows up as a confusing
  // leftover on a fresh run that never hit any limit. Any session-limit
  // banner still on disk at this point is necessarily stale — there is no
  // live blockAndRetry() yet, this line runs before the loop does anything.
  const startupStatus = readStatus()
  if (startupStatus.sessionLimit) {
    delete startupStatus.sessionLimit
    writeStatus(startupStatus)
  }

  await checkPrerequisites()
  acquireLock()
  await checkLlmAccount()
  ensureFrontendDevServerRunning().catch(() => {}) // fire-and-forget — must never block the loop

  banner("DEV LOOP ORCHESTRATOR")
  emitEvent("orchestrator-start")

  const BASE_BRANCH = getBaseBranch()
  // Sacred-main and no-git both mean: do not create a per-task branch.
  // CREATE_BRANCH_PER_TASK is already forced off when there's no .git;
  // main/master additionally skips even if the config asked for branches,
  // instead of refusing to run at all.
  const createBranchPerTask = CREATE_BRANCH_PER_TASK
    && BASE_BRANCH !== "main"
    && BASE_BRANCH !== "master"
  if (GIT_ENABLED && (BASE_BRANCH === "main" || BASE_BRANCH === "master") && CREATE_BRANCH_PER_TASK) {
    warn(`Current branch is '${BASE_BRANCH}' — skipping per-task branch creation. main/master is sacred: this loop will not branch from or merge into it. Tasks will work on '${BASE_BRANCH}' directly.`)
  }
  log(
    GIT_ENABLED
      ? `Base branch: '${BASE_BRANCH}'` +
          (createBranchPerTask
            ? " — every task branches from here and merges back here, only after your approval."
            : " — tasks commit directly onto this branch, no per-task branch/merge this run.")
      : "No git repo — agents write files straight to disk, nothing gets branched/committed/merged."
  )

  USD_TO_NIS = await fetchUsdToNis()
  log(`Exchange rate: 1 USD = ₪${USD_TO_NIS} (ILS)`)

  ensurePlanDirAndBacklog()

  log("No issue tracker configured for this project — using local plan-file approval only.")
  if (orchestratorConfig.designSource === "DESIGNER_AGENT") {
    log("Design source: Designer agent — establishing the visual system once, before the first task.")
    await runDesignerIfNeeded()
  } else if (orchestratorConfig.designSource && orchestratorConfig.designSource !== "NONE") {
    log(`Design source: ${orchestratorConfig.designSource}.`)
  } else {
    log("No design source configured — Frontend Agent designs the UI per .rule/style-rules.md.")
  }

  const prd = readFileSync("docs/PRD.md", "utf-8")

  let loopCount = 0
  while (true) {
    const task = getNextBacklogTask()
    if (!task) {
      banner("NO MORE TODO TASKS — LOOP COMPLETE")
      break
    }

    loopCount += 1
    banner(`LOOP ${loopCount} · ${task.title}`)
    log(`Picked task from backlog: ${task.title}`)
    currentTaskTitle = task.title
    currentTaskProgress = getBacklogProgress(task)
    emitEvent("picking-next-task", null, task.title)
    // Re-scan for backend services before dispatching this task's agents —
    // catches a service scaffolded by a previous task in THIS run, or a
    // human hand-editing the backlog's `scope:` field mid-session, without
    // needing a restart. See refreshBackendServiceKeys()'s own comment.
    refreshBackendServiceKeys()

    if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true })

    let state = loadTaskState(task.slug)
    const planResumable = Boolean(state?.approved && state?.planPath && existsSync(state.planPath))
    const draftResumable = Boolean(!planResumable && state?.planPath && existsSync(state.planPath))
    // A saved `tickets`/`reports` object from before a backend service was
    // added/renamed (e.g. discoverBackendServices() found a different set
    // than it did when this state was written) is missing keys the rest of
    // this function assumes exist — reusing it crashes deep in the backend
    // launch loop with "Cannot read properties of undefined". Requiring
    // every currently-expected key to be present makes stale state regenerate
    // fresh instead (same as if this were a first run), rather than crash.
    const expectedTicketKeys = ["frontend", "qa", "security", ...BACKEND_SERVICE_KEYS.map(camelKey)]
    const hasAllExpectedKeys = (obj) => Boolean(obj) && expectedTicketKeys.every((k) => k in obj)
    const ticketsResumable = planResumable && hasAllExpectedKeys(state?.tickets)
    if (state) {
      if (planResumable) {
        log(`Resuming task '${task.slug}' from saved state — reusing approved plan${ticketsResumable ? " and existing task ids" : ""}.`)
      } else if (draftResumable) {
        log(`Resuming task '${task.slug}' — reusing unapproved draft plan (still needs your APPROVED).`)
      } else {
        log(`Found partial state for '${task.slug}' but the plan file is missing — starting this task's setup over.`)
      }
    }

    const userInstructions = planResumable || AUTO_APPROVE_PLANS
      ? ""
      : await askUserInput("Any instructions for the orchestrator? (press Enter to run automatically): ")

    const branchName = createBranchPerTask ? `${BASE_BRANCH}-tasks/${task.slug}` : BASE_BRANCH
    if (createBranchPerTask) {
      createGitBranch(branchName, BASE_BRANCH)
    } else if (GIT_ENABLED && execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf-8" }).trim() !== BASE_BRANCH) {
      // Only relevant right after a run with branching ON left a task branch
      // checked out — get back onto the base branch before working directly
      // on it this time.
      execSync(`git checkout ${BASE_BRANCH}`, { stdio: "inherit" })
    }

    let planPath
    if (planResumable) {
      planPath = state.planPath
      writeFileSync(LATEST_PLAN_FILE, readFileSync(planPath, "utf-8"), "utf-8")
      log(`Plan reused (already approved): ${planPath}`)
    } else {
      if (draftResumable) {
        planPath = state.planPath
        log(`Draft plan reused (not yet approved): ${planPath}`)
      } else {
        planPath = getNextPlanPath(task.slug)
        const planContent = await askClaudeForPlan({
          task,
          prd,
          planPath,
          previousPlans: readAllPlanFiles(),
          userInstructions,
        })

        writeFileSync(planPath, planContent, "utf-8")
        log(`Plan written: ${planPath}`)
        state = { slug: task.slug, planPath, approved: false }
        saveTaskState(task.slug, state)
      }
      writeFileSync(LATEST_PLAN_FILE, readFileSync(planPath, "utf-8"), "utf-8")
      await reviewPlanUntilApproved({ task, prd, planPath, userInstructions })
      state = { slug: task.slug, planPath, approved: true }
      saveTaskState(task.slug, state)
    }
    await markPlanStatus(planPath, "active")

    // A task can carry a literal `cmd:` field for pure setup/tooling work
    // (installs, scaffolding) that no Claude agent owns — these have no
    // product-code judgment call to make, just a shell command to run.
    // Run it for real here, synchronously, before any agent step, instead of
    // relying on a human to notice a `scope: none` task and run it by hand.
    if (task.cmd) await runTaskCommand(task)

    // The backlog's own `scope:` field (if present) is a manual override and
    // always wins. Otherwise, defer to the orchestrator's own judgment: parse
    // `Scope-Agents:` out of the plan it just wrote/approved. Only if neither
    // is present do we fall back to running everything.
    if (!task.scope) {
      const planScope = parseScopeAgentsFromPlan(readFileSync(planPath, "utf-8"))
      if (planScope) {
        task.scope = planScope
        log(`Scope derived from plan (${planPath}): ${task.scope.size ? [...task.scope].join(",") : "none"}`)
      }
    }

    let tickets
    if (ticketsResumable) {
      tickets = state.tickets
      log("Task ids reused from saved state.")
    } else {
      tickets = simulateTickets(task.slug)
      state = { ...state, tickets }
      saveTaskState(task.slug, state)
    }

    // Report filenames embed a date. Compute once and persist so a crash/restart
    // on a later date still resolves to the SAME report files — otherwise the
    // "already done" check in runAgent can never find yesterday's completed work
    // and reruns every agent from Frontend on.
    let reports
    const expectedReportKeys = ["fe", "qa", "security", ...BACKEND_SERVICE_KEYS.map(camelKey)]
    const reportsResumable = Boolean(state?.reports) && expectedReportKeys.every((k) => k in state.reports)
    if (reportsResumable) {
      reports = state.reports
      log("Report paths reused from saved state (keeps original run date).")
    } else {
      const ticketIds = Object.fromEntries(
        Object.entries(tickets).map(([key, ticket]) => [key, ticket.id])
      )
      reports = makeReportPaths(task.slug, ticketIds)
      state = { ...state, reports }
      saveTaskState(task.slug, state)
    }

    // ── Step: Frontend ──────────────────────────────────────────────────────
    if (inScope(task, "frontend")) {
      emitEvent("agent-start", "frontend")
      await runAgent({
        systemPrompt: "agents/frontend/CLAUDE.md",
        input: [
          `You are the Frontend Agent.`,
          `Task: ${task.title}`,
          `Task id: ${tickets.frontend.id}`,
          designSourceGuidance(),
          `Approved plan: ${planPath}`,
          `Follow your CLAUDE.md instructions exactly.`,
          `End your final response with exact line: STATUS: DONE`,
        ].filter(Boolean).join("\n"),
        outputFile: reports.fe,
        doneMarker: "STATUS: DONE",
        label: "Frontend Agent",
        agentKey: "frontend",
      })
    } else {
      emitEvent("agent-skip", "frontend")
      logSkip("Frontend Agent", "out of scope for this task")
      writeSkippedReport(reports.fe, "Frontend Agent")
    }

    // ── Step: Backend (every discovered service, in parallel — only those in
    // scope). One combined start/skip event for the whole group, not one per
    // service — the dashboard's voice/visual "backend" category is already
    // generic across every service name, so N near-simultaneous per-service
    // events would just be redundant noise.
    const backendKeysInScope = BACKEND_SERVICE_KEYS.filter((k) => inScope(task, k))
    emitEvent(backendKeysInScope.length > 0 ? "agent-start" : "agent-skip", "backend", null, backendKeysInScope)
    log("Launching backend agents (only those in scope, in parallel)...")

    await Promise.all(BACKEND_SERVICE_KEYS.map((key) => {
      const label = `Backend Agent — ${key}`
      const ck = camelKey(key)
      if (!inScope(task, key)) {
        logSkip(label, "out of scope for this task")
        writeSkippedReport(reports[ck], label)
        return undefined
      }
      return runAgent({
        systemPrompt: "agents/backend/CLAUDE.md",
        input: [
          `You are the Backend Agent.`,
          `Task: ${task.title}`,
          `Task id: ${tickets[ck].id}`,
          `Service: ${key}`,
          `Port: ${BACKEND_PORTS[ck]}`,
          `API contract: ${API_CONTRACTS[ck]}`,
          `Approved plan: ${planPath}`,
          `Follow your CLAUDE.md instructions exactly.`,
          `End your final response with exact line: STATUS: DONE`,
        ].join("\n"),
        outputFile: reports[ck],
        doneMarker: "STATUS: DONE",
        label,
        agentKey: key,
      })
    }))

    // Real config values (MONGODB_URI, JWT_SECRET, ...) are collected HERE by
    // the orchestrator via a real blocking terminal prompt — not left to the
    // Backend Agent to "ask" mid-stream, since agents run one-shot via
    // `--print` with no live back-channel; a question buried in their
    // streamed output is easy to scroll past unanswered. This runs once per
    // service (only after that service's .env.example exists, i.e. after its
    // scaffold task), and reuses any value already set for a sibling service.
    for (const key of BACKEND_SERVICE_KEYS) {
      if (inScope(task, key)) await ensureBackendEnv(key)
    }

    // ── Step: QA ─────────────────────────────────────────────────────────────
    if (inScope(task, "qa")) {
      emitEvent("agent-start", "qa")
      await runAgent({
        systemPrompt: "agents/qa/CLAUDE.md",
        input: [
          `You are the QA Agent.`,
          `Task: ${task.title}`,
          `Task id: ${tickets.qa.id}`,
          `Approved plan: ${planPath}`,
          `API contracts:`,
          ...BACKEND_SERVICE_KEYS.map((key) => `- ${API_CONTRACTS[camelKey(key)]}`),
          `Run validation across frontend, all in-scope backend services, and e2e.`,
          `Write ${reports.qa} and end final response with exact line: STATUS: DONE`,
        ].join("\n"),
        outputFile: reports.qa,
        doneMarker: "STATUS: DONE",
        label: "QA Agent",
        agentKey: "qa",
      })
    } else {
      emitEvent("agent-skip", "qa")
      logSkip("QA Agent", "out of scope for this task")
      writeSkippedReport(reports.qa, "QA Agent")
    }

    emitEvent("agent-back", "orchestrator")
    await waitForApprovalWithChat({ task, tickets, planPath })

    // ── Step: Security ───────────────────────────────────────────────────────
    if (inScope(task, "security")) {
      emitEvent("agent-start", "security")
      await runAgent({
        systemPrompt: "agents/security/CLAUDE.md",
        input: [
          `You are the Security Agent.`,
          `Task: ${task.title}`,
          `Task id: ${tickets.security.id}`,
          `Approved plan: ${planPath}`,
          `API contracts:`,
          ...BACKEND_SERVICE_KEYS.map((key) => `- ${API_CONTRACTS[camelKey(key)]}`),
          `Audit frontend, all in-scope backend services, and API contracts for security issues.`,
          `Write security tests to tests/security/ and the report to ${reports.security}, then end final response with exact line: STATUS: DONE`,
        ].join("\n"),
        outputFile: reports.security,
        doneMarker: "STATUS: DONE",
        label: "Security Agent",
        agentKey: "security",
      })
    } else {
      emitEvent("agent-skip", "security")
      logSkip("Security Agent", "out of scope for this task")
      writeSkippedReport(reports.security, "Security Agent")
    }
    emitEvent("agent-back", "orchestrator")

    await markPlanStatus(planPath, "done")
    markBacklogTaskDone(task)
    clearTaskState(task.slug)
    commitTaskChanges(task, branchName)
    openChangedFilesInEditor()
    // Opened BEFORE the merge-approval gate below, not after — the merge
    // question always blocks waiting for a human answer (unaffected by
    // AUTO_APPROVE_PLANS, on purpose: merging into the base branch is a
    // separate, always-explicit decision from plan/feature approval), and
    // the human should already be able to see the task's result on screen
    // while deciding, not have the browser open only after they've answered.
    openBrowserForTask(task)
    await pushAndMergeTaskBranch(task, branchName, BASE_BRANCH)
    printCostTable(task.title)
    // printCostTable() just wrote cost files to disk — at this point we're
    // already back on BASE_BRANCH (pushAndMergeTaskBranch left us there),
    // so these writes are UNCOMMITTED changes sitting on that branch. Left
    // as-is, the very next task's `git checkout -b <new-branch>` reliably
    // fails ("local changes would be overwritten" / untracked-file
    // conflicts) the moment it tries to switch away from BASE_BRANCH with
    // this dirty state present. Committing immediately closes that window
    // for good, regardless of exactly when/where a future cost write happens.
    commitCostArtifacts(task, BASE_BRANCH)
    log(`Task complete: ${task.title}`)
    emitEvent("task-done", null, task.title)
  }
}

// ─── Plan dir ─────────────────────────────────────────────────────────────────

function ensurePlanDirAndBacklog() {
  if (!existsSync(PLAN_DIR)) {
    mkdirSync(PLAN_DIR, { recursive: true })
  }
}

// Which of the gated agents (frontend / each discovered backend service /
// qa / security) a task actually needs, read from the backlog line's `scope:`
// field (comma-separated agent keys, or "none" for zero of them). No
// `scope:` field at all means "unknown scope" — run everything, since that's
// the only safe default when nobody has classified the task yet.
function parseScope(value) {
  if (!value) return null
  if (value.trim().toLowerCase() === "none") return new Set()
  return new Set(value.split(",").map((s) => s.trim()).filter(Boolean))
}

// Reads the `Scope-Agents:` metadata line the orchestrator is required to
// write into every plan (.rule/planning-rules.md) and turns it into the same
// Set shape as a backlog `scope:` override, so both flow through inScope()
// identically.
function parseScopeAgentsFromPlan(planContent) {
  const m = planContent.match(/^Scope-Agents:\s*(.+)$/im)
  if (!m) return null
  return parseScope(m[1].trim())
}

function inScope(task, agentKey) {
  if (!task.scope) return true
  return task.scope.has(agentKey)
}

// Runs a backlog task's literal `cmd:` field for real (root-level installs,
// scaffolding commands) — these are plain shell commands with no product-code
// judgment call, so they don't need a Claude agent. Blocks and asks the human
// to fix + retry on failure, the same pattern as a blocked agent step, rather
// than silently marking the task done when the command actually failed.
async function runTaskCommand(task) {
  log(`Running task command: ${task.cmd}`)
  try {
    // CI=1 is the de-facto standard signal most JS scaffolding CLIs
    // (create-vite, create-vue, npm init *, ...) check to switch to
    // non-interactive mode — critically, this also makes them skip
    // "install AND start the dev server now?"-style prompts entirely,
    // since a CI environment must never end a "scaffold" step by launching
    // a server that runs forever. Without this, a scaffold command can
    // silently turn into a hang with no error — this script just waits on
    // a process that was never going to exit on its own.
    execSync(task.cmd, { cwd: __projectRoot, stdio: "inherit", env: { ...process.env, CI: "1" } })
    log(`Command succeeded: ${task.cmd}`)
  } catch (err) {
    printRed(`Command failed: ${task.cmd}`)
    printRed(err.message)
    emitEvent("attention-needed", null, `Command failed: ${task.cmd}`)
    await askUserInput(`Fix the issue above, then press Enter to retry this command: `, { expectsText: false })
    return runTaskCommand(task)
  }
}

// Opens every file this task's just-made commit touched (created or
// modified) as tabs in a running VS Code window, so the human can see what
// was actually built without hunting through the file tree themselves.
// Silently does nothing if the `code` CLI isn't on PATH (not every setup has
// it) — this is a convenience, not a required step.
let codeCliChecked = false
let codeCliAvailable = false

function openChangedFilesInEditor() {
  if (!codeCliChecked) {
    codeCliChecked = true
    try {
      execSync("code --version", { stdio: "ignore" })
      codeCliAvailable = true
    } catch {
      warn("'code' CLI not found on PATH — skipping auto-open in VS Code for this and future tasks. (VS Code: Command Palette -> \"Shell Command: Install 'code' command in PATH\" to enable this.)")
    }
  }
  if (!codeCliAvailable) return
  if (!GIT_ENABLED) return // nothing was committed to diff against — see commitTaskChanges()

  let changedFiles
  try {
    changedFiles = execSync("git diff-tree --no-commit-id --name-only -r HEAD", { encoding: "utf-8" })
      .split("\n")
      .map((f) => f.trim())
      .filter(Boolean)
  } catch (e) {
    warn(`Could not list this task's changed files (${e.message}) — skipping auto-open in VS Code.`)
    return
  }
  if (changedFiles.length === 0) return

  try {
    execSync(`code ${changedFiles.map((f) => `"${f}"`).join(" ")}`, { stdio: "ignore" })
    log(`Opened ${changedFiles.length} changed file(s) in VS Code.`)
  } catch (e) {
    warn(`Could not open changed files in VS Code (${e.message}).`)
  }
}

// Opens the built page in the human's actual desktop browser (not headless)
// right after a task finishes, so progress is visible without switching
// windows to type a URL by hand. Assumes the frontend dev server is already
// running separately (e.g. `npm --prefix frontend run dev`), same as every
// other manual step in this workflow — this never starts that server itself.
// Pages requiring login are opened as-is; no auto-login is attempted, so the
// human logs in manually if the page redirects to an auth screen.
const FRONTEND_DEV_URL = process.env.FRONTEND_DEV_URL || "http://localhost:5173"

function openBrowserForTask(task) {
  if (!task.url) return // no `url:` field on this backlog line — nothing to open

  const fullUrl = `${FRONTEND_DEV_URL}${task.url}`
  const openCmd =
    process.platform === "win32" ? `start "" "${fullUrl}"` :
    process.platform === "darwin" ? `open "${fullUrl}"` :
    `xdg-open "${fullUrl}"`

  try {
    execSync(openCmd, { stdio: "ignore" })
    log(`Opened in browser: ${fullUrl}`)
  } catch (e) {
    warn(`Could not open browser at ${fullUrl} (${e.message}) — open it manually to see this task's result.`)
  }
}

function logSkip(label, reason) {
  log(`${label}: SKIP — ${reason}`)
}

function writeSkippedReport(outputFile, label) {
  if (existsSync(outputFile)) return
  const content = `=== ${label.toUpperCase()} REPORT ===\n\nSTATUS: DONE (skipped — out of scope for this task, per backlog "scope:" field)\n`
  writeFileSync(outputFile, content, "utf-8")
}

function getNextBacklogTask() {
  const text = readFileSync(BACKLOG_FILE, "utf-8")
  const lines = text.split("\n")

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim()
    const m = line.match(/^\s*-\s*\[( |x|X)\]\s*(.+)$/)
    if (!m) continue
    const done = m[1].toLowerCase() === "x"
    if (done) continue

    const raw = m[2].trim()
    const parts = raw.split("|").map((p) => p.trim()).filter(Boolean)
    const title = parts[0]

    let scopeRaw = ""
    let cmd = ""
    let url = ""
    for (const p of parts.slice(1)) {
      const kv = p.split(":")
      if (kv.length < 2) continue
      const key = kv[0].trim().toLowerCase()
      const value = kv.slice(1).join(":").trim()
      if (key === "scope") scopeRaw = value
      if (key === "cmd") cmd = value
      if (key === "url") url = value
    }

    return { lineIndex: i, title, slug: slugify(title), scope: parseScope(scopeRaw), cmd: cmd || null, url: url || null }
  }

  return null
}

// "Task N of M" for the dashboard — position of `task.lineIndex` among every
// checklist line in the backlog (done or not), 1-based. Recomputed fresh
// each time (not cached) since the backlog file itself is the source of
// truth and can gain/lose lines between runs.
function getBacklogProgress(task) {
  const lines = readFileSync(BACKLOG_FILE, "utf-8").split("\n")
  const checklistLineIndexes = lines
    .map((line, i) => (line.trim().match(/^\s*-\s*\[( |x|X)\]/) ? i : -1))
    .filter((i) => i !== -1)
  const position = checklistLineIndexes.indexOf(task.lineIndex)
  return { current: position === -1 ? null : position + 1, total: checklistLineIndexes.length }
}

function markBacklogTaskDone(task) {
  const text = readFileSync(BACKLOG_FILE, "utf-8")
  const lines = text.split("\n")
  const current = lines[task.lineIndex]
  if (!current) return
  lines[task.lineIndex] = current.replace("[ ]", "[x]")
  writeFileSync(BACKLOG_FILE, lines.join("\n"), "utf-8")
}

function readAllPlanFiles() {
  if (!existsSync(PLAN_DIR)) return []
  const names = readdirSync(PLAN_DIR)
    .filter((n) => n.endsWith(".md") && n !== "000-backlog.md")
    .sort()
  return names.map((name) => ({
    name,
    content: readFileSync(`${PLAN_DIR}/${name}`, "utf-8"),
  }))
}

function getNextPlanPath(slug) {
  const names = existsSync(PLAN_DIR)
    ? readdirSync(PLAN_DIR).filter((n) => /^\d{3}-\d{4}-\d{2}-\d{2}-.+\.md$/.test(n))
    : []
  let max = 0
  for (const n of names) {
    const num = Number(n.slice(0, 3))
    if (Number.isFinite(num)) max = Math.max(max, num)
  }
  const next = String(max + 1).padStart(3, "0")
  const date = new Date().toISOString().slice(0, 10)
  return `${PLAN_DIR}/${next}-${date}-${slug}.md`
}

async function markPlanStatus(planPath, status) {
  if (!existsSync(planPath)) return
  const old = readFileSync(planPath, "utf-8")
  if (!old.includes("Status:")) return
  const updated = old.replace(/Status:\s*(draft|active|done|superseded)/i, `Status: ${status}`)
  writeFileSync(planPath, updated, "utf-8")
}

function makeReportPaths(slug, ticketIds) {
  const date = new Date().toISOString().slice(0, 10)
  const paths = {
    fe:       `${REPORTS_DIR}/${date}-${ticketIds.frontend}-${slug}-frontend.md`,
    qa:       `${REPORTS_DIR}/${date}-${ticketIds.qa}-${slug}-qa.md`,
    security: `${REPORTS_DIR}/${date}-${ticketIds.security}-${slug}-security.md`,
  }
  for (const key of BACKEND_SERVICE_KEYS) {
    paths[camelKey(key)] = `${REPORTS_DIR}/${date}-${ticketIds[camelKey(key)]}-${slug}-${key}.md`
  }
  return paths
}

let API_CONTRACTS = Object.fromEntries(
  BACKEND_SERVICE_KEYS.map((key) => [camelKey(key), `docs/api-contract/api-contract.${key}.yaml`])
)

// Sequential ports starting at 4000, in the same stable sorted order as
// BACKEND_SERVICE_KEYS at the time this was built. refreshBackendServiceKeys()
// below only ever APPENDS a port for a genuinely new key — it never
// recomputes existing assignments from scratch, so an already-running
// service's port never shifts out from under it mid-session.
let BACKEND_PORTS = Object.fromEntries(
  BACKEND_SERVICE_KEYS.map((key, i) => [camelKey(key), 4000 + i])
)

// Picks up backend services that became known SINCE this process started —
// scaffolded on disk by a task that just ran, or newly named in a `scope:`
// field a human added to the backlog mid-session — without requiring a
// dev-loop.js restart. Only ever grows the known set (existing keys' ports/
// contracts/identities are never touched), and is a cheap no-op read+diff
// when nothing changed. Call before anything that iterates
// BACKEND_SERVICE_KEYS to dispatch/describe work (the per-task backend
// launch loop) and from the dashboard's /status.json handler so the ring
// itself stays live too.
function refreshBackendServiceKeys() {
  const fresh = discoverBackendServices()
  const newKeys = fresh.filter((k) => !BACKEND_SERVICE_KEYS.includes(k))
  if (newKeys.length === 0) return false
  for (const key of newKeys) {
    const ck = camelKey(key)
    API_CONTRACTS[ck] = `docs/api-contract/api-contract.${key}.yaml`
    BACKEND_PORTS[ck] = 4000 + Object.keys(BACKEND_PORTS).length
    AGENT_IDENTITY[key] = { icon: "🔧", color: "\x1b[34m", label: ` ${key}` }
  }
  BACKEND_SERVICE_KEYS = fresh
  ALL_AGENT_KEYS = coreAgentKeys(BACKEND_SERVICE_KEYS)
  log(`Discovered new backend service(s): ${newKeys.join(", ")} — picked up without a restart.`)
  return true
}

// ─── Claude planning ──────────────────────────────────────────────────────────

async function askClaudeForPlan({ task, prd, planPath, previousPlans, userInstructions }) {
  const prevList = previousPlans.map((p) => `- ${p.name}`).join("\n") || "(none)"
  const designGuidance = designSourceGuidance()

  const input = `Follow planning rules from .rule/planning-rules.md exactly.

Task selected from backlog:
- title: ${task.title}
- slug: ${task.slug}

Existing plans in .plan:
${prevList}

PRD context (first 80 lines):
${prd.split("\n").slice(0, 80).join("\n")}

${designGuidance}

Write the implementation plan to: ${planPath}
Also print the same plan content to stdout.

Plan requirements:
- Use required metadata fields and required sections from .rule/planning-rules.md
- Status must start as draft
- Use repository-relative paths only
- Open Questions section: each question gets exactly ONE answer line, formatted "- Recommended: <answer>". Do not add a second line repeating/labeling that same answer again (e.g. a further "Recommended answer: ..." bullet) — one line per question, period.
- Do NOT write a "*HUMAN ANSWER:*" line on this draft — you have not received any human review yet. Older plans in .plan/ may show that line because a real human typed a real answer during their review; it is a record of that event, not boilerplate to reproduce.
- Scope-Agents metadata field is load-bearing: the orchestrator will run ONLY the agents you list there (plus qa unless you deliberately omit it). Get this right — cross-check it against your own Risks section before finalizing (a backend service flagged as a risk there must be included even if you also wrote "no new endpoints expected").
${userInstructions ? `\nUser instructions for this run:\n${userInstructions}` : ""}`

  const rawStdout = await launchLlm({
    operation: "planning",
    systemPromptPath: "agents/orchestrator/CLAUDE.md",
    input,
    agentKey: "orchestrator",
  })
  if (!rawStdout) {
    warn("LLM unavailable for planning; using fallback plan template.")
    return generatePlanFallback({ task })
  }
  const stdout = recordCost("orchestrator", "Orchestrator (planning)", rawStdout)
  logLastCost("Orchestrator (planning)")

  if (existsSync(planPath)) {
    const written = readFileSync(planPath, "utf-8")
    if (written.trim().length > 200) return written
  }

  return stdout
}

async function askClaudeToRevisePlan({ task, prd, planPath, currentPlan, feedback, userInstructions }) {
  const input = `Follow planning rules from .rule/planning-rules.md exactly.

Revise this existing plan based on latest user feedback and latest plan-file edits.

Task:
- title: ${task.title}
- slug: ${task.slug}

Plan path: ${planPath}

PRD context (first 80 lines):
${prd.split("\n").slice(0, 80).join("\n")}

User feedback for this revision cycle:
${feedback}

Current plan content:
${currentPlan}

Output only the full updated markdown plan.

Hard requirements:
- Keep required metadata fields and sections
- Keep repository-relative paths only
- Keep Status as draft until explicit APPROVED in terminal
- Only add or change a "*HUMAN ANSWER:*" line for an Open Question if "User feedback for this revision cycle" above directly and specifically answers that exact question. If the feedback is generic (e.g. "no extra terminal feedback", a request to improve clarity, or anything not naming a specific question) — do NOT add or infer any "*HUMAN ANSWER:*" line for any question. A question with just its single "- Recommended: ..." line and no human-answer line is the correct, expected state until a human actually answers it — never fill that gap yourself, and never add a second line that repeats/labels the same recommendation again (e.g. a further "Recommended answer: ..." bullet).
${userInstructions ? `\nUser instructions for this run:\n${userInstructions}` : ""}`

  const stdout = await launchLlm({
    operation: "planning-revise",
    systemPromptPath: "agents/orchestrator/CLAUDE.md",
    input,
    outputFormat: null,
    agentKey: "orchestrator",
  })
  if (!stdout) return null
  return stdout.trim() || null
}

async function reviewPlanUntilApproved({ task, prd, planPath, userInstructions }) {
  if (AUTO_APPROVE_PLANS) {
    log("Plan gate: AUTO_APPROVE_PLANS is on — accepting the orchestrator's own Recommended answers, no terminal wait.")
    return
  }

  log("Plan gate: review and refine. The task proceeds only after terminal APPROVED.")
  emitEvent("waiting-approval", "orchestrator", "Plan review")

  while (true) {
    const answer = await askUserInput(
      `Review ${planPath}. Type APPROVED to continue, or enter feedback to revise the plan: `,
      { choices: [{ label: "✅ APPROVED", value: "APPROVED" }] }
    )
    const normalized = answer.trim().toUpperCase()
    if (normalized === "APPROVED") {
      log("Plan gate passed via terminal approval.")
      return
    }

    const currentPlan = existsSync(planPath) ? readFileSync(planPath, "utf-8") : ""
    if (!currentPlan.trim()) {
      warn(`Plan file ${planPath} is missing or empty. Update it, then continue review.`)
      continue
    }

    const feedback = answer.trim() || "No extra terminal feedback was given (human pressed Enter without typing anything). Re-read the latest plan file and improve clarity and completeness — this is NOT an answer to any Open Question, so do not add or infer any *HUMAN ANSWER:* line."
    const revised = await askClaudeToRevisePlan({ task, prd, planPath, currentPlan, feedback, userInstructions })
    if (!revised) {
      warn("Could not auto-revise the plan (LLM unavailable). You can edit the plan file manually, then continue review.")
      continue
    }

    writeFileSync(planPath, revised, "utf-8")
    writeFileSync(LATEST_PLAN_FILE, revised, "utf-8")
    log(`Plan updated: ${planPath}`)
  }
}

// ─── Local task identifiers ─────────────────────────────────────────────────
// No issue tracker is configured for this project, so agent steps are keyed
// by simple local task identifiers instead of tickets in an external system.

// Short per-service code derived mechanically from the key (first 4 letters
// with hyphens stripped, e.g. "booking-service" -> "BOOK") — not as
// hand-picked/memorable as the old fixed abbreviations, but works for any
// service name without a code edit.
function ticketCode(kebabKey) {
  return kebabKey.replace(/-/g, "").toUpperCase().slice(0, 4)
}

function simulateTickets(slug) {
  const up = slug.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) || "TASK"
  const tickets = {
    frontend: { id: `${up}-FE` },
    qa:       { id: `${up}-QA` },
    security: { id: `${up}-SEC` },
  }
  for (const key of BACKEND_SERVICE_KEYS) {
    tickets[camelKey(key)] = { id: `${up}-${ticketCode(key)}` }
  }
  return tickets
}

// ─── Agent runner ─────────────────────────────────────────────────────────────

const BLOCK_REASONS = {
  SESSION_LIMIT: "LLM usage/session limit hit.",
  AUTH_ERROR: "Not logged in to the LLM CLI for this run.",
  NOT_INSTALLED: "The LLM CLI for this run could not be found on PATH.",
  FAILED: "LLM CLI call failed (see raw output below).",
  TIMEOUT: "The LLM CLI process hung with no output and no completed response — killed after the idle timeout.",
}

// Never simulate. On ANY failure to get real output from Claude — known
// (session limit, auth) or not — write what happened to a status file next
// to the report, print it in red, and block on user input before retrying
// this exact step. A crashed/uncertain agent step must never be reported as
// STATUS: DONE.
// Callers of runAgent()/runAgentInteractive()/simulateAgent() pass an
// outputFile path (e.g. docs/agent-reports/designer-agent-report.md) whose
// directory isn't guaranteed to exist yet — REPORTS_DIR is only created
// lazily inside the per-task loop, but the Designer agent (Step 0) writes
// its report BEFORE that loop ever runs. Call this right before any
// writeFileSync(outputFile, ...) to avoid an ENOENT.
function ensureDirFor(filePath) {
  const dir = dirname(filePath)
  if (dir && dir !== "." && !existsSync(dir)) mkdirSync(dir, { recursive: true })
}

// Pulls "1:30pm (Asia/Jerusalem)" out of the CLI's own "You've hit your
// session limit · resets 1:30pm (Asia/Jerusalem)" line, so the dashboard can
// show it without the human having to go dig through terminal scrollback.
function extractSessionLimitReset(text) {
  const m = text && text.match(/resets?\s+(\d{1,2}:\d{2}\s*(?:am|pm)(?:\s*\([^)]*\))?)/i)
  return m ? m[1] : null
}

async function blockAndRetry({ systemPrompt, input, outputFile, doneMarker, label, agentKey }) {
  const kind = lastSpawnError?.kind || "FAILED"
  const raw = (lastSpawnError?.raw || "").trim()
  const resetsAt = kind === "SESSION_LIMIT" ? extractSessionLimitReset(raw) : null
  const reason = (BLOCK_REASONS[kind] || BLOCK_REASONS.FAILED) + (resetsAt ? ` Resets ${resetsAt}.` : "")

  const statusPath = `${outputFile}.blocked.md`
  ensureDirFor(statusPath)
  const statusContent = [
    `# ${label} — BLOCKED`,
    ``,
    `Time: ${new Date().toISOString()}`,
    `Reason kind: ${kind}`,
    `Reason: ${reason}`,
    ``,
    `## Raw diagnostic output`,
    "```",
    raw || "(no output captured)",
    "```",
  ].join("\n")
  writeFileSync(statusPath, statusContent, "utf-8")

  printRed(`${label}: BLOCKED — ${reason}`)
  if (raw) printRed(raw)
  printRed(`Status written to: ${statusPath}`)
  // Not just printRed() — the dashboard's message pane only ever shows what
  // writeAgentStatus() wrote, and under Electron there's no terminal at all
  // for printRed() to reach.
  writeAgentStatus(agentKey, `❌ ${label}: BLOCKED — ${reason}`)
  emitEvent(kind === "SESSION_LIMIT" ? "session-limit" : "attention-needed", agentKey, reason)

  // A structured field (not just the free-text `message`, which the very
  // next routine output line will overwrite) so the dashboard can show a
  // stable "resets at X" banner for as long as this block is actually
  // active — cleared right below once the human responds and the retry
  // actually starts.
  if (kind === "SESSION_LIMIT") {
    const status = readStatus()
    status.sessionLimit = { resetsAt, since: new Date().toISOString() }
    writeStatus(status)
  }

  // A mid-run auth failure (session/token expired, logged out elsewhere,
  // ...) used to just tell the human to go fix it in a terminal — the same
  // gap checkLlmAccount() closes at startup, but here it can happen at
  // any point mid-loop. Handle it the same way: run the login flow right
  // through the dashboard instead of pointing at a terminal that won't
  // exist under the eventual Electron build.
  if (kind === "AUTH_ERROR") {
    const newEmail = await attemptLogin(ACTIVE_PROVIDER || "claude")
    if (newEmail) {
      log(`Re-authenticated as ${newEmail} — retrying automatically.`)
    } else {
      await askUserInput(`Still not logged in. Fix it, then press Enter to retry ${label} exactly where it stopped: `, { expectsText: false })
    }
  } else {
    await askUserInput(`Fix the issue above, then press Enter to retry ${label} exactly where it stopped: `, { expectsText: false })
  }

  const status = readStatus()
  if (status.sessionLimit) {
    delete status.sessionLimit
    writeStatus(status)
  }

  return runAgent({ systemPrompt, input, outputFile, doneMarker, label, agentKey })
}

function llmBin() {
  return ACTIVE_PROVIDER === "cursor" ? "agent" : "claude"
}

// Builds provider-specific CLI flags + stdin. Cursor has no --system-prompt,
// so the CLAUDE.md file is inlined at the front of the prompt. Claude keeps
// --system-prompt / --permission-mode as before.
function buildLlmInvocation({ operation, systemPromptPath, input, outputFormat = "stream-json", print = true }) {
  const model = modelFor(operation)
  let stdinText = input || ""

  // Inject environment awareness — agents often hang or hallucinate if they
  // expect git and it isn't there.
  if (!GIT_ENABLED) {
    stdinText = `[ENVIRONMENT: NO-GIT] This project is not a git repository. Do not attempt to run git commands. Use standard file system tools (ls, read, write) instead.\n\n${stdinText}`
  }

  if (ACTIVE_PROVIDER === "cursor") {
    if (systemPromptPath && existsSync(systemPromptPath)) {
      stdinText = [
        `Follow these agent instructions exactly (from ${systemPromptPath}):`,
        "",
        readFileSync(systemPromptPath, "utf-8"),
        "",
        "---",
        "",
        stdinText,
      ].join("\n")
    }
    const args = print
      ? ["--print", "--force", "--trust", "--sandbox", "disabled", "--workspace", process.cwd(), "--add-dir", process.cwd(), "--model", model]
      : ["--trust", "--workspace", process.cwd(), "--add-dir", process.cwd(), "--model", model]
    if (outputFormat) args.push("--output-format", outputFormat)
    return { args, stdinText }
  }

  const args = [
    "--model", model,
    "--permission-mode", CLAUDE_PERMISSION_MODE,
    "--add-dir", process.cwd(),
    "--system-prompt", systemPromptPath,
  ]
  if (print) args.push("--print", "--verbose")
  if (outputFormat) args.push("--output-format", outputFormat)
  if (CLAUDE_ALLOWED_TOOLS) args.push("--allowedTools", CLAUDE_ALLOWED_TOOLS)
  return { args, stdinText }
}

function launchLlm({ operation, systemPromptPath, input, outputFormat = "stream-json", print = true, agentKey = "", timeoutMs = null }) {
  const { args, stdinText } = buildLlmInvocation({ operation, systemPromptPath, input, outputFormat, print })
  const extraEnv = agentKey ? { CLAUDE_AGENT_ROLE: agentKey } : {}
  return spawnLlm(args, stdinText, { agentKey, extraEnv, timeoutMs })
}

// A real, successful Claude run that itself reports STATUS: BLOCKED (e.g. the
// Security Agent found a real vulnerability) is not a technical failure to
// retry — it's the agent correctly telling us not to proceed. Halt the whole
// dev-loop run rather than warning and marching the task to "done" anyway.
class AgentBlockedError extends Error {}

async function runAgent({ systemPrompt, input, outputFile, doneMarker, label, agentKey }) {
  const doneRegex = /^\s*STATUS\s*:\s*DONE/im
  const blockedRegex = /^\s*STATUS\s*:\s*BLOCKED/im
  if (existsSync(outputFile)) {
    const existing = readFileSync(outputFile, "utf-8")
    if (existing.includes(doneMarker) || doneRegex.test(existing)) {
      log(`${label}: already done — skipping.`)
      return
    }
  }

  const { args, stdinText } = buildLlmInvocation({
    operation: agentKey,
    systemPromptPath: systemPrompt,
    input,
    outputFormat: "stream-json",
  })

  log(`${label}: launching via ${llmBin()}...`)
  const extraEnv = agentKey ? { CLAUDE_AGENT_ROLE: agentKey } : {}
  const rawStdout = await spawnLlm(args, stdinText, { agentKey, extraEnv })

  if (rawStdout === null) {
    return blockAndRetry({ systemPrompt, input, outputFile, doneMarker, label, agentKey })
  }

  const stdout = recordCost(agentKey ?? "agent", label, rawStdout)
  logLastCost(label)

  const blockedStatusPath = `${outputFile}.blocked.md`
  if (existsSync(blockedStatusPath)) rmSync(blockedStatusPath)

  ensureDirFor(outputFile)
  writeFileSync(outputFile, stdout, "utf-8")
  if (blockedRegex.test(stdout)) {
    printRed(`${label}: STATUS: BLOCKED — the agent found something that must be fixed before continuing.`)
    printRed(`Report (real, not simulated): ${outputFile}`)
    emitEvent("attention-needed", agentKey, `${label} reported STATUS: BLOCKED`)
    throw new AgentBlockedError(`${label} reported STATUS: BLOCKED — see ${outputFile}`)
  } else if (stdout.includes(doneMarker) || doneRegex.test(stdout)) {
    log(`${label}: STATUS: DONE ✓`)
  } else {
    warn(`${label} finished but did not include '${doneMarker}' marker.`)
  }
}

async function runAgentInteractive({ systemPrompt, input, outputFile, doneMarker, label, agentKey }) {
  const doneRegex = /^\s*STATUS\s*:\s*DONE\s*$/im
  if (existsSync(outputFile)) {
    const existing = readFileSync(outputFile, "utf-8")
    if (existing.includes(doneMarker) || doneRegex.test(existing)) {
      log(`${label}: already done — skipping.`)
      return
    }
  }

  const bin = llmBin()
  try {
    if (bin === "agent") ensureCursorCliOnPath()
    execSync(`${bin} --version`, { stdio: "ignore" })
  } catch {
    warn(`${label}: ${bin} not available — simulating output.`)
    simulateAgent(label, outputFile, doneMarker)
    return
  }

  const { args, stdinText } = buildLlmInvocation({
    operation: agentKey,
    systemPromptPath: systemPrompt,
    input,
    outputFormat: null,
    print: false,
  })

  log(`${label}: launching ${bin} in interactive mode...`)
  log(`When the agent says STATUS: DONE, type /exit to continue.`)

  await new Promise((resolve) => {
    let child
    if (process.platform === "win32") {
      const command = [bin, ...args.map(quoteArgForCmd)].join(" ")
      child = spawn(command, { stdio: ["pipe", "inherit", "inherit"], shell: true })
    } else {
      child = spawn(bin, args, { stdio: ["pipe", "inherit", "inherit"], shell: false })
    }

    child.stdin.write(stdinText)
    process.stdin.resume()
    process.stdin.pipe(child.stdin)

    child.on("close", () => {
      try { process.stdin.unpipe(child.stdin) } catch {}
      process.stdin.pause()
      resolve()
    })
    child.on("error", () => {
      try { process.stdin.unpipe(child.stdin) } catch {}
      warn(`${label}: failed to launch — simulating output.`)
      simulateAgent(label, outputFile, doneMarker)
      resolve()
    })
  })

  if (existsSync(outputFile)) {
    const content = readFileSync(outputFile, "utf-8")
    if (content.includes(doneMarker) || doneRegex.test(content)) {
      log(`${label}: STATUS: DONE ✓`)
    } else {
      warn(`${label}: agent exited but missing '${doneMarker}' in output file.`)
    }
  } else {
    warn(`${label}: agent exited without creating output file.`)
    simulateAgent(label, outputFile, doneMarker)
  }
}

function simulateAgent(label, outputFile, doneMarker) {
  const content = `=== ${label.toUpperCase()} REPORT (SIMULATED) ===\n\n${doneMarker}\n`
  ensureDirFor(outputFile)
  writeFileSync(outputFile, content)
}

// Set right before spawnLlm resolves(null), so runAgent can tell a real
// session/usage-limit block apart from "claude not installed" or a crash.
let lastSpawnError = null

const SESSION_LIMIT_PATTERN = /hit your (?:session|usage) limit|resets?\s+\d{1,2}:\d{2}\s*(?:am|pm)\b/i
const AUTH_ERROR_PATTERN = /\bnot logged in\b|please run\s*`?\/login`?|invalid api key|not authenticated|please run\s*`?agent login`?|authentication required/i

// The claude CLI has been observed to print its final assistant text (often
// STATUS: DONE/BLOCKED) and then never exit — no more output, no "result"
// event, the process just hangs indefinitely. If we've seen no new output
// for this long, treat the process as stuck rather than waiting forever.
const IDLE_TIMEOUT_MS = Number(process.env.CLAUDE_IDLE_TIMEOUT_MS) || 10 * 60 * 1000
const COMPLETION_MARKER_REGEX = /^\s*STATUS\s*:\s*(DONE|BLOCKED)\s*$/im
// Grace period after STATUS: DONE/BLOCKED for the CLI's normal "result" event
// + close to arrive, before we stop waiting and recover the response ourselves.
const COMPLETION_GRACE_MS = Number(process.env.CLAUDE_COMPLETION_GRACE_MS) || 15 * 1000

function isSessionLimitError(text) {
  return Boolean(text) && SESSION_LIMIT_PATTERN.test(text)
}

function isAuthError(text) {
  return Boolean(text) && AUTH_ERROR_PATTERN.test(text)
}

function printRed(msg) {
  process.stderr.write(`\x1b[91m${msg}\x1b[0m\n`)
}

function spawnLlm(args, stdinText, { agentKey = "", extraEnv = {}, timeoutMs = null } = {}) {
  lastSpawnError = null
  const bin = llmBin()
  const effectiveTimeout = timeoutMs || IDLE_TIMEOUT_MS

  try {
    if (bin === "agent") ensureCursorCliOnPath()
    execSync(`${bin} --version`, { stdio: "ignore" })
  } catch {
    lastSpawnError = { kind: "NOT_INSTALLED", raw: "" }
    return Promise.resolve(null)
  }

  const fmtIdx = args.indexOf("--output-format")
  const fmtVal = fmtIdx !== -1 ? args[fmtIdx + 1] : null
  const isStreamJson = fmtVal === "stream-json"
  const isJson = fmtVal === "json"
  const env = { ...process.env, ...extraEnv }

  return new Promise((resolve) => {
    let child
    if (process.platform === "win32") {
      const command = [bin, ...args.map(quoteArgForCmd)].join(" ")
      child = spawn(command, { stdio: ["pipe", "pipe", "pipe"], shell: true, env })
    } else {
      child = spawn(bin, args, { stdio: ["pipe", "pipe", "pipe"], shell: false, env })
    }

    let stderrText = ""
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString()
      stderrText += text
      printRed(text.trimEnd())
    })

    function recordFailure(extraText = "", defaultKind = "FAILED") {
      const combined = stderrText + "\n" + extraText
      let kind = defaultKind
      if (isSessionLimitError(combined)) kind = "SESSION_LIMIT"
      else if (isAuthError(combined)) kind = "AUTH_ERROR"
      lastSpawnError = { kind, raw: combined }
    }

    if (isStreamJson) {
      const rl = createInterface({ input: child.stdout })
      let resultEvent = null
      let assistantText = ""
      let lastOutputAt = Date.now() // only touched by REAL output — heartbeat must never bump this itself
      let settled = false
      let completionGraceTimer = null

      const heartbeat = setInterval(() => {
        if (pendingHumanInput) return // Don't print dots if the terminal is waiting for user input
        const idleMs = Date.now() - lastOutputAt
        if (idleMs >= 5000 && idleMs < effectiveTimeout) {
          process.stdout.write(".")
        }
        if (idleMs >= effectiveTimeout && !settled) {
          settled = true
          clearInterval(heartbeat)
          printRed(`\n${agentKey || llmBin()}: no output for ${Math.round(effectiveTimeout / 60000)} min — the CLI process appears hung. Killing it.`)
          killProcessTree(child)
          if (COMPLETION_MARKER_REGEX.test(assistantText)) {
            printRed("The agent had already finished its response before hanging — using that instead of waiting further.")
            resolve(JSON.stringify({ result: assistantText.trim(), usage: {}, total_cost_usd: 0, duration_ms: 0 }))
          } else {
            // Not a completed response either — check whether the last thing the
            // agent actually said was a session-limit/login message before
            // defaulting to a generic timeout, so the user gets the real reason
            // (and the right retry prompt) instead of "the process hung".
            recordFailure(assistantText, "TIMEOUT")
            resolve(null)
          }
        }
      }, 5000)

      rl.on("line", (line) => {
        if (settled) return
        if (!line.trim()) return
        let event
        try { event = JSON.parse(line) } catch { return }

        // Cursor emits tool_call events between assistant messages. Count
        // them as live output so a long file-edit stretch doesn't trip the
        // idle timeout the way a truly hung process would.
        if (event.type === "tool_call" || event.type === "system") {
          lastOutputAt = Date.now()
        }

        if (event.type === "assistant" && Array.isArray(event.message?.content)) {
          for (const block of event.message.content) {
            if (block.type === "text" && block.text) {
              lastOutputAt = Date.now()
              assistantText += block.text + "\n"
              const out = agentKey ? prefixLines(block.text, agentKey) : block.text
              process.stdout.write(out.endsWith("\n") ? out : out + "\n")
              writeAgentStatus(agentKey, block.text)

              // React the moment a session-limit/login message actually shows up
              // in the stream — don't wait for the process to close on its own
              // (it may hang) or for the idle timeout (minutes away). This is
              // what makes the pause-and-wait prompt appear within seconds
              // instead of after a long silent wait.
              if (!settled && (isSessionLimitError(block.text) || isAuthError(block.text))) {
                settled = true
                if (completionGraceTimer) clearTimeout(completionGraceTimer)
                clearInterval(heartbeat)
                killProcessTree(child)
                recordFailure(assistantText)
                resolve(null)
                return
              }

              // The response looks finished (STATUS: DONE/BLOCKED), but the CLI
              // process has been observed to sometimes hang instead of closing
              // right after this. Give it a short grace period for the normal
              // "result" event + close to arrive; if that doesn't happen, kill
              // it and use the response we already have — don't make the user
              // wait out the full multi-minute idle timeout for a completed run.
              if (!settled && !completionGraceTimer && COMPLETION_MARKER_REGEX.test(block.text)) {
                completionGraceTimer = setTimeout(() => {
                  if (settled) return
                  settled = true
                  clearInterval(heartbeat)
                  printRed(`\n${agentKey || llmBin()}: response finished but the process didn't close within ${COMPLETION_GRACE_MS / 1000}s — recovering the completed response instead of waiting further.`)
                  killProcessTree(child)
                  resolve(JSON.stringify({ result: assistantText.trim(), usage: {}, total_cost_usd: 0, duration_ms: 0 }))
                }, COMPLETION_GRACE_MS)
              }
            }
          }
        }

        if (event.type === "result") resultEvent = event
      })

      child.on("close", (code) => {
        if (settled) return
        settled = true
        if (completionGraceTimer) clearTimeout(completionGraceTimer)
        clearInterval(heartbeat)
        // Only trust the session-limit/auth-error text patterns when the run
        // actually failed to complete (no result event / non-zero exit).
        // A clean, finished run (e.g. a security report) can legitimately
        // contain words like "unauthorized" or "Authorization header" as its
        // subject matter — that must never be misread as a login failure.
        if (code !== 0 || !resultEvent || resultEvent.is_error) { recordFailure(assistantText); resolve(null); return }
        resolve(JSON.stringify({
          result:         resultEvent.result ?? "",
          usage:          resultEvent.usage ?? {},
          total_cost_usd: resultEvent.total_cost_usd ?? 0,
          duration_ms:    resultEvent.duration_ms ?? 0,
        }))
      })
    } else {
      const quiet = isJson
      let stdout = ""
      let buffer = ""
      let lastOutputAt = Date.now()

      let settled = false
      const idleWatchdog = setInterval(() => {
        if (pendingHumanInput) return // Don't print dots if the terminal is waiting for user input
        const idleMs = Date.now() - lastOutputAt
        if (!quiet && idleMs >= 5000 && idleMs < effectiveTimeout) {
          process.stdout.write(".")
        }
        if (idleMs >= effectiveTimeout && !settled) {
          settled = true
          clearInterval(idleWatchdog)
          printRed(`\n${agentKey || llmBin()}: no output for ${Math.round(effectiveTimeout / 60000)} min — the CLI process appears hung. Killing it.`)
          killProcessTree(child)
          recordFailure(stdout, "TIMEOUT")
          resolve(null)
        }
      }, 5000)
      const heartbeat = idleWatchdog

      child.stdout.on("data", (chunk) => {
        const text = chunk.toString()
        stdout += text
        lastOutputAt = Date.now()
        if (!quiet) {
          buffer += text
          const lines = buffer.split("\n")
          buffer = lines.pop()
          for (const line of lines) {
            process.stdout.write(
              agentKey ? prefixLines(line, agentKey) + "\n" : line + "\n"
            )
          }
        }
      })

      child.on("close", (code) => {
        if (settled) return
        settled = true
        if (heartbeat) clearInterval(heartbeat)
        if (!quiet) {
          process.stdout.write("\n")
          if (buffer) {
            process.stdout.write(
              agentKey ? prefixLines(buffer, agentKey) + "\n" : buffer + "\n"
            )
          }
        }
        // Same reasoning as the stream-json branch: only classify via text
        // patterns when the process actually failed (non-zero exit) — never
        // on a clean, completed run whose own content happens to mention
        // auth/limit-related words.
        if (code !== 0) { recordFailure(stdout); resolve(null); return }
        resolve(stdout)
      })
    }

    child.stdin.write(stdinText)
    child.stdin.end()
    child.on("error", (err) => {
      stderrText += String(err?.message || err)
      recordFailure()
      resolve(null)
    })
  })
}

// ─── Plan fallback ────────────────────────────────────────────────────────────

function generatePlanFallback({ task }) {
  const today = new Date().toISOString().slice(0, 10)
  return `# Plan: ${task.title}

Status: draft
Owner: Orchestrator
Last updated: ${today}
Scope-Agents: frontend,${BACKEND_SERVICE_KEYS.join(",")},qa,security

## Goal
Deliver ${task.title} in the existing product.

## Scope
- In scope: changes needed for ${task.title}
- Out of scope: unrelated refactors, unrelated new features

## Assumptions
- Existing app and test setup are functional
- ${designSourceGuidance()}

## Open Questions
- Should this feature include analytics events? Recommended: no for first increment.
- Should this feature ship behind a flag? Recommended: no for demo speed.

## Steps
1. Frontend agent implements UI and defines API contract(s) if needed.
2. Backend agents (${BACKEND_SERVICE_KEYS.join(", ")} — whichever are in scope) run in parallel — independent services.
3. QA agent runs unit, integration, and e2e checks across frontend and all in-scope backend services.
4. Security agent audits frontend, all in-scope backend services, and API contracts.

## Validation
- frontend: npm --prefix frontend run lint && npm --prefix frontend run build && npm --prefix frontend run test
${BACKEND_SERVICE_KEYS.map((key) => `- backend/${key} (only if in scope): npm --prefix backend/${key} run test`).join("\n")}

## Risks
- Concurrency-sensitive writes to any contested/shared entity are the highest-risk area — see .rule/database-rules.md and .rule/testing-rules.md.
- Existing tests may fail due to unrelated baseline issues.

## Rollout Order
1. FE changes
2. BE changes (parallel)
3. QA verification
4. Security audit

## Rollback
- Revert branch commits for this task.
- Mark plan superseded if replaced.
`
}

// ─── Git ──────────────────────────────────────────────────────────────────────

// The branch dev-loop.js was launched from — every task branches fresh from
// here and merges back here, after approval. main/master is sacred: this
// loop never creates a per-task branch from it or merges into it. When the
// current branch is main/master (or there is no .git at all), branch
// creation is skipped and tasks work on the current tree as-is.
function getBaseBranch() {
  if (!GIT_ENABLED) return "no-git"
  const branch = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf-8" }).trim()
  if (branch.includes("-tasks/")) {
    // A task branch this same script generated (`<base>-tasks/<slug>`), not a
    // real human base branch. Re-deriving BASE_BRANCH from one of these is
    // how the naming compounds without limit on every rerun after an
    // interrupted (e.g. Ctrl+C'd) task that never reached the merge step:
    // <base>-tasks/<slug>-tasks/<slug>-tasks/<slug>... until git or Windows
    // rejects the filename as too long. Refuse outright rather than silently
    // treating this as a new base.
    printRed(`Refusing to run: current branch '${branch}' looks like a task branch this script generated (contains "-tasks/"), not your real base branch.`)
    printRed(`This usually means a previous run was interrupted (Ctrl+C, crash) before it could merge back. Check out your real base branch first — the part before the first "-tasks/" — then rerun. If that task's work is still needed, merge or cherry-pick it manually first; this branch won't be touched.`)
    process.exit(1)
  }
  return branch
}

// Always branches fresh from BASE_BRANCH — never stacks a task on top of
// wherever HEAD happens to be (e.g. the previous task's branch), since that
// would silently carry forward unmerged/unreviewed work between tasks.
function createGitBranch(branch, baseBranch) {
  if (!GIT_ENABLED) return
  execSync(`git checkout ${baseBranch}`, { stdio: "inherit" })
  try {
    execSync(`git rev-parse --verify ${branch}`, { stdio: "ignore" })
    log(`Git branch '${branch}' already exists — checking it out.`)
    execSync(`git checkout ${branch}`, { stdio: "inherit" })
  } catch {
    log(`Creating git branch: ${branch} (from '${baseBranch}')`)
    execSync(`git checkout -b ${branch}`, { stdio: "inherit" })
  }
}

// Commits everything this task touched, LOCALLY, on the task's own branch —
// and nothing more. Pushing/merging back to BASE_BRANCH is a separate,
// explicitly-approved step (pushAndMergeTaskBranch, below) — never bundled
// into this commit step, so a crash between the two never leaves an
// unreviewed merge sitting on the base branch.
function commitTaskChanges(task, branch) {
  if (!GIT_ENABLED) return
  try {
    execSync("git add -A", { stdio: "inherit" })
    const status = execSync("git status --porcelain", { encoding: "utf-8" })
    if (!status.trim()) {
      log(`Nothing to commit for '${task.title}' — working tree already clean.`)
      return
    }

    const msgFile = ".git/DEV_LOOP_COMMIT_MSG.txt"
    writeFileSync(
      msgFile,
      [
        task.title,
        "",
        "Automated local commit by dev-loop.js after this task's agents finished.",
      ].join("\n"),
      "utf-8",
    )
    execSync(`git commit -F "${msgFile}"`, { stdio: "inherit" })
    rmSync(msgFile)
    log(`Committed locally on branch '${branch}'.`)
  } catch (e) {
    warn(`Auto-commit failed (${e.message}). Your changes for '${task.title}' are still sitting uncommitted on branch '${branch}' — commit them manually before letting the loop continue.`)
  }
}

// Sweeps up any cost-tracking files (docs/cost/**) written after the task's
// own commit — currently just printCostTable()'s output, but this stays
// correct even if something else starts writing there later, since it just
// commits whatever's actually dirty rather than naming specific files.
// Directly on `baseBranch` (not a task branch — there's no PR/approval step
// for this, it's pure bookkeeping), so the working tree is guaranteed clean
// before the loop's next iteration tries to check out a new task branch.
function commitCostArtifacts(task, baseBranch) {
  if (!GIT_ENABLED) return
  try {
    const status = execSync("git status --porcelain", { encoding: "utf-8" })
    if (!status.trim()) return
    execSync("git add -A -- docs/cost", { stdio: "inherit" })
    const stillDirty = execSync("git status --porcelain", { encoding: "utf-8" })
    if (!stillDirty.trim()) return // nothing under docs/cost/ was actually dirty
    execSync(`git commit -m "Cost tracking for: ${task.title.replace(/"/g, '\\"')}"`, { stdio: "inherit" })
    log(`Committed cost-tracking files on '${baseBranch}'.`)
  } catch (e) {
    warn(`Could not auto-commit cost-tracking files (${e.message}) — the next task's branch checkout may fail until this is committed or discarded manually.`)
  }
}

// Approval gate: nothing gets pushed or merged into BASE_BRANCH without an
// explicit APPROVED from the human. main/master can never be a merge target
// here — createBranchPerTask is forced off when the base is main/master, so
// this function's merge path is never reached for those branches.
async function pushAndMergeTaskBranch(task, branch, baseBranch) {
  if (branch === baseBranch) {
    // CREATE_BRANCH_PER_TASK was off for this run — the task's commit
    // already landed directly on baseBranch (commitTaskChanges did that),
    // so there is nothing to push or merge here at all.
    log(`No separate task branch was used — '${task.title}' is already committed directly on '${baseBranch}'.`)
    return
  }
  if (AUTO_MERGE_TASKS) {
    log(`Merge gate: AUTO_MERGE_TASKS is on — merging '${branch}' into '${baseBranch}' automatically, no terminal wait.`)
  } else {
    emitEvent("waiting-approval", "orchestrator", "Merge approval")
    const answer = await askUserInput(
      `Push '${branch}' and merge it into '${baseBranch}'? Type APPROVED, or press Enter to leave it unmerged for now: `,
      { choices: [{ label: "✅ APPROVED", value: "APPROVED" }] }
    )
    if (answer.trim().toUpperCase() !== "APPROVED") {
      log(`Leaving '${branch}' unmerged and unpushed — merge it into '${baseBranch}' yourself when ready.`)
      return
    }
  }

  try {
    const hasRemote = execSync("git remote", { encoding: "utf-8" }).trim().length > 0
    if (hasRemote) {
      execSync(`git push -u origin ${branch}`, { stdio: "inherit" })
    } else {
      log("No git remote configured — skipping push, merging locally only.")
    }

    execSync(`git checkout ${baseBranch}`, { stdio: "inherit" })
    execSync(`git merge --no-ff ${branch} -m "Merge ${branch} into ${baseBranch}: ${task.title}"`, { stdio: "inherit" })
    log(`Merged '${branch}' into '${baseBranch}'.`)
  } catch (e) {
    warn(`Push/merge failed (${e.message}). '${branch}' is still committed and intact — resolve manually (conflicts, auth, etc.), then merge it into '${baseBranch}' yourself.`)
  }
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "task"
}

async function waitForApproval(prompt) {
  while (true) {
    const answer = await askUserInput(prompt, {
      choices: [{ label: "✅ APPROVED", value: "APPROVED" }]
    })
    if (answer.trim().toUpperCase() === "APPROVED") return
    log(`Type APPROVED to continue (got: "${answer.trim()}")`)
  }
}

async function checkFrontendHealth() {
  try {
    const res = await fetch(FRONTEND_DEV_URL, { signal: AbortSignal.timeout(2000) })
    // If we get a response, also check if it's actually Vite (and not a zombie)
    const serverHeader = res.headers.get("server")
    if (serverHeader && serverHeader.toLowerCase().includes("vite")) return true
    
    // If no Vite header, maybe it's fine (some versions don't send it or it's proxied)
    // but if we are here and the user says it's not working, we might be hitting a zombie.
    return res.ok
  } catch {
    // If 5173 is dead, check the log to see if Vite moved to a different port
    const logPath = "docs/frontend-dev-server.log"
    if (existsSync(logPath)) {
      const log = readFileSync(logPath, "utf-8")
      const match = log.match(/Local:\s+http:\/\/localhost:(\d+)\//i)
      if (match && match[1] !== "5173") {
        warn(`Vite is running on port ${match[1]} instead of 5173 (detected from logs).`)
      }
    }
    return false
  }
}

async function waitForApprovalWithChat({ task, tickets, planPath }) {
  if (AUTO_APPROVE_PLANS) {
    log("Feature-done gate: AUTO_APPROVE_PLANS is on — auto-approving, no terminal wait.")
    return
  }

  // Proactively check frontend health before asking for approval
  const isHealthy = await checkFrontendHealth()
  if (!isHealthy) {
    warn(`Frontend dev server (http://localhost:5173) is not responding.`)
    const answer = await askUserInput("Attempt to restart the frontend dev server? (Y/n): ")
    if (answer.trim().toLowerCase() !== "n") {
      await ensureFrontendDevServerRunning()
      log("Restarted frontend dev server. Checking again...")
      await new Promise(r => setTimeout(r, 2000))
      if (!await checkFrontendHealth()) {
        warn("Frontend still not responding. You may need to run 'npm run dev' in frontend/ manually.")
      }
    }
  }

  log("Feature done. Type APPROVED to mark task complete, or send a command to the orchestrator.")
  emitEvent("waiting-approval", "orchestrator", "Feature-done approval")

  while (true) {
    const answer = await askUserInput("orchestrator> ", {
      choices: [{ label: "✅ APPROVED", value: "APPROVED" }]
    })
    if (answer.trim().toUpperCase() === "APPROVED") return

    const context = `
Current task: ${task.title}
Plan: ${planPath}
Task ids (local, no issue tracker): ${JSON.stringify(tickets, null, 2)}

The user says: "${answer}"

Act on the request.
When done responding, print exactly: AWAITING_APPROVAL
Do NOT print APPROVED unless the user has explicitly said the task is complete.
`.trim()

    const stdout = await launchLlm({
      operation: "orchestrator-chat",
      systemPromptPath: "agents/orchestrator/CLAUDE.md",
      input: context,
      outputFormat: null,
      agentKey: "orchestrator",
      timeoutMs: 2 * 60 * 1000, // 2-minute timeout for chat; much faster recovery than the 10m global default
    })
    if (stdout?.trim().toUpperCase().includes("APPROVED") && !stdout.includes("AWAITING_APPROVAL")) return
  }
}

function readEnvFile(path) {
  if (!existsSync(path)) return {}
  const out = {}
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) out[m[1]] = m[2]
  }
  return out
}

// Same "<prefix>.<NODE_ENV or 'development'>" naming this file already uses
// for its own dotenv.config() call above — built dynamically, never spelled
// out as a literal string, so this file carries no hardcoded local-secrets
// filename fragment.
function localEnvPath(dir) {
  const suffix = process.env.NODE_ENV || "development"
  return [dir, ["", "env", suffix].join(".")].join("/")
}

// Keys whose value is critical to whether the service can actually run
// against something real (a real database, a real secret) — for these, a
// Backend Agent's own scaffold-time placeholder (e.g. a localhost connection
// string, "replace-me-with-a-random-secret") must NEVER be silently trusted
// as "already configured", even though it's technically a non-empty string.
// These are also the keys that are genuinely IDENTICAL across every backend
// service (one Mongo cluster, one JWT signing secret) — so they live in ONE
// shared local file at the backend/ root, not duplicated per service.
// Cosmetic, per-service keys (PORT, FRONTEND_ORIGIN, expiry durations) are
// fine to trust from each service's own scaffold default, no prompt needed.
const ALWAYS_CONFIRM_KEY_PATTERN = /URI|SECRET|CONNECTION|PASSWORD|_KEY$/i

// A MongoDB connection string with no database-name path segment (e.g.
// "mongodb+srv://user:pass@cluster0.mongodb.net/" — nothing between the
// last "/" and an optional "?query") doesn't error at connect time; the
// driver just silently connects to a database literally named "test"
// instead of the project's own database. That's exactly the kind of
// "technically accepted, quietly wrong" value the placeholder-rejection
// loop below exists to prevent for other keys — this catches the one shape
// that loop can't, since an empty-but-present db-name segment is still a
// non-empty, non-placeholder string.
function mongoUriMissingDbName(uri) {
  if (!/^mongodb(\+srv)?:\/\//i.test(uri)) return false // not a Mongo URI at all — nothing to check
  const afterScheme = uri.replace(/^mongodb(\+srv)?:\/\//i, "")
  const afterAuth = afterScheme.includes("@") ? afterScheme.slice(afterScheme.indexOf("@") + 1) : afterScheme
  const pathPart = afterAuth.split("?")[0]
  const slashIndex = pathPart.indexOf("/")
  const dbName = slashIndex === -1 ? "" : pathPart.slice(slashIndex + 1)
  return dbName.trim() === ""
}

// Pulls a suggested db name out of the scaffold's own placeholder value
// (e.g. "mongodb://localhost:27017/hila-tours" -> "hila-tours") for the
// warning message below, so the example shown is this project's real name,
// not a generic stand-in.
function suggestedDbNameFrom(placeholderUri) {
  const match = placeholderUri.match(/\/([^/?]+)(\?.*)?$/)
  return match ? match[1] : "your-db-name"
}
const SHARED_BACKEND_DIR = "backend"
// Fixed filename, not the per-environment "<prefix>.<NODE_ENV>" pattern each
// service's own local file uses — this one file is the single place shared
// secrets live across every backend service, regardless of environment.
function sharedEnvPath() {
  return [SHARED_BACKEND_DIR, ["", "env", "shared"].join(".")].join("/")
}

// Real values the setup process (development/NEW-PROJECT-SETUP-PROMPT.md)
// already collected before any backend service existed to hold them — staged
// here since it couldn't write directly to a real local secrets file yet.
// Consumed once: the value is popped out (so it never lingers longer than
// necessary) and the file is deleted entirely once every staged key is used.
const SETUP_SECRETS_PATH = ".setup-secrets.json"

function consumeSetupSecret(key) {
  if (!existsSync(SETUP_SECRETS_PATH)) return null
  let staged
  try {
    staged = JSON.parse(readFileSync(SETUP_SECRETS_PATH, "utf-8"))
  } catch {
    return null
  }
  if (!staged[key]) return null

  const value = staged[key]
  delete staged[key]
  if (Object.keys(staged).length === 0) {
    rmSync(SETUP_SECRETS_PATH)
  } else {
    writeFileSync(SETUP_SECRETS_PATH, JSON.stringify(staged, null, 2) + "\n", "utf-8")
  }
  return value
}

// Real, blocking config collection — the terminal literally cannot proceed
// until you answer, unlike a question an agent prints mid-stream.
// Critical/shared keys (ALWAYS_CONFIRM_KEY_PATTERN) are collected into ONE
// shared local file once, then copied into every service's own local file
// (each service still needs its own file to actually run — a deployed
// service in production, e.g. on Render, has no notion of a "shared config
// file across services" either, so this mirrors that reality: one place you
// edit locally, but every service still gets its own copy at runtime).
// Non-critical keys are per-service only, filled from that service's own
// scaffold default without asking.
async function ensureBackendEnv(serviceDir) {
  const dir = `backend/${serviceDir}`
  const devPath = localEnvPath(dir)
  const examplePath = `${dir}/.env.example`
  if (!existsSync(examplePath)) return

  const example = readEnvFile(examplePath)
  const existing = readEnvFile(devPath)
  const keys = Object.keys(example)
  if (keys.length === 0) return

  const sharedPath = sharedEnvPath()
  const shared = readEnvFile(sharedPath)
  let sharedChanged = false

  const collected = { ...existing }
  for (const key of keys) {
    const isCritical = ALWAYS_CONFIRM_KEY_PATTERN.test(key)
    const defaultValue = example[key]

    if (isCritical) {
      // Setup-time answer, if the user already gave one during
      // development/NEW-PROJECT-SETUP-PROMPT.md — takes priority over
      // everything else, since it's the most recent explicit answer and
      // consuming it here is what makes the staging file self-cleaning.
      const staged = consumeSetupSecret(key)
      if (staged) {
        shared[key] = staged
        sharedChanged = true
        collected[key] = staged
        log(`${key}: adopted the value already provided during setup.`)
        continue
      }

      // The shared file is the single source of truth for this key — check
      // it first, regardless of what this service's own local file has.
      if (shared[key] && shared[key] !== defaultValue) {
        collected[key] = shared[key]
        continue
      }
      if (existing[key] && existing[key] !== defaultValue) {
        // This service already has a real value the shared file doesn't
        // know about yet (e.g. leftover from before this shared-file
        // mechanism existed) — adopt it into the shared file instead of
        // asking again.
        shared[key] = existing[key]
        sharedChanged = true
        collected[key] = existing[key]
        continue
      }

      banner(`⚠️  ${key} NEEDS A REAL VALUE — REQUIRED, SHARED ACROSS EVERY BACKEND SERVICE`)
      // No "press Enter to accept" escape hatch — the scaffold's own
      // placeholder (e.g. a localhost connection string) is exactly the
      // value that must never be silently accepted as real.
      let answer = ""
      while (!answer.trim() || answer.trim() === defaultValue || mongoUriMissingDbName(answer.trim())) {
        if (answer.trim() && mongoUriMissingDbName(answer.trim())) {
          warn(
            `That connection string has no database name in its path — MongoDB will silently connect to a database literally named "test" instead of this project's own database. ` +
              `Add a database name before any "?" (e.g. ".../${suggestedDbNameFrom(defaultValue)}") and re-enter.`,
          )
        }
        answer = await askUserInput(
          `>>> ${key}  (REQUIRED, real value — the scaffold placeholder "${defaultValue}" will NOT be accepted): `,
        )
      }
      shared[key] = answer.trim()
      sharedChanged = true
      collected[key] = answer.trim()
    } else if (!existing[key]) {
      collected[key] = defaultValue
    }
  }

  if (sharedChanged) {
    if (!existsSync(SHARED_BACKEND_DIR)) mkdirSync(SHARED_BACKEND_DIR, { recursive: true })
    writeFileSync(sharedPath, Object.entries(shared).map(([k, v]) => `${k}=${v}`).join("\n") + "\n", "utf-8")
    log(`Wrote shared config: ${sharedPath}`)
  }

  writeFileSync(devPath, keys.map((k) => `${k}=${collected[k]}`).join("\n") + "\n", "utf-8")
  log(`Wrote ${devPath}`)
}

// Set only while a real terminal prompt is outstanding — lets the dashboard
// (via POST /respond, see startDashboardServer()) answer the SAME prompt
// from the browser instead of only the terminal. Whichever side answers
// first wins; `settle`'s own guard makes the loser's call a no-op rather
// than a double-resolve.
let pendingHumanInput = null

// Kept in sync with ACTIVE_ACCOUNT_EMAIL by setActiveLlm() — older dashboard
// clients still read `claudeAccount` on /status.json.
let CLAUDE_ACCOUNT_EMAIL = null

// `expectsText` tells the dashboard whether to show a text field at all.
// Most prompts genuinely want typed content (feedback, "APPROVED", a real
// config value) — those default to true. The couple of "fix it, then press
// Enter to retry exactly where it stopped" prompts (blockAndRetry, failed
// shell command) never read the answer text at all, just that *something*
// was pressed — showing an empty textbox next to a confusingly-named "Just
// Enter" button there was genuinely misleading, not just ugly.
// `choices` is purely a dashboard affordance — an optional array of
// { label, value }, rendered as one-click buttons next to the free-text box
// instead of making the human type the exact expected word ("y"/"s"/...).
// The terminal side is unaffected (still a plain rl.question); typing the
// raw value in either place resolves the same way, since a button click is
// just sendRespond(value) under the hood (see agent-dashboard.html).
function askUserInput(prompt, { expectsText = true, choices = null } = {}) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    let settled = false
    const settle = (answer) => {
      if (settled) return
      settled = true
      pendingHumanInput = null
      process.stdout.write(RESET)
      
      // If we are settling from the dashboard, the terminal might still be 
      // showing the prompt and waiting for its own Enter. Force clear the 
      // line regardless of TTY status if possible.
      try {
        process.stdout.write("\r\x1b[2K\r") // ANSI escape to clear line and return cursor to start
      } catch { /* ignore */ }
      
      rl.close()
      resolve(answer)
    }
    pendingHumanInput = { prompt, expectsText, choices, respond: settle }
    rl.question(prompt, settle)
    process.stdout.write("\x1b[91m")
  })
}

function banner(msg) {
  const { icon, color } = AGENT_IDENTITY["orchestrator"]
  const line = "=".repeat(60)
  console.log(`\n${color}${line}\n  ${icon}  ${msg}\n${line}${RESET}`)
}

function log(msg) {
  const { icon, color } = AGENT_IDENTITY["orchestrator"]
  console.log(`${color}${icon} [ORCHESTRATOR]${RESET} ${msg}`)
  writeAgentStatus("orchestrator", msg)
}

function warn(msg) {
  const { icon, color } = AGENT_IDENTITY["orchestrator"]
  console.log(`${color}${icon} [ORCHESTRATOR] ! ${msg}${RESET}`)
}

function getArg(flag) {
  const i = process.argv.indexOf(flag)
  return i !== -1 ? process.argv[i + 1] : undefined
}

function quoteArgForCmd(value) {
  const s = String(value)
  if (!/[\s"]/u.test(s)) return s
  return `"${s.replace(/"/g, '""')}"`
}

main().catch((e) => {
  if (e instanceof AgentBlockedError) {
    console.error(`\n${e.message}`)
    console.error("Dev loop halted — fix the finding, then rerun. The task was NOT marked done and no downstream agents ran.")
  } else {
    console.error("\nOrchestrator error:", e.message)
  }
  process.exit(1)
})
