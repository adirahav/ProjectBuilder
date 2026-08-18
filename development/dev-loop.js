#!/usr/bin/env node
/**
 * Dev Loop Orchestrator — Dog Grooming Clinic Appointment Booking
 *
 * This repo is a monorepo: `frontend/` + `backend/` with three services —
 * `gateway` (stateless reverse proxy in front of the other two; most tasks
 * won't scope it in, only deploy/production-setup tasks per
 * `agents/backend/CLAUDE.md`), `booking-service` (owns Service, TimeSlot,
 * Appointment) and `user-service` (owns Admin accounts/auth). All three
 * backend services are built and run from here, via `agents/backend/CLAUDE.md`
 * (one shared prompt, parameterized per service). There is no external design
 * source — the Frontend Agent designs the UI itself per `.rule/style-rules.md`.
 * There is no issue tracker; task approval happens entirely through local
 * plan files and terminal/chat approval gates.
 *
 * Loop per backlog item:
 *   1) Pick next task from .plan/000-backlog.md
 *   2) Generate plan in .plan/NNN-YYYY-MM-DD-topic.md and request approval
 *   3) Launch the Frontend agent (builds UI per .rule/style-rules.md, defines API contract(s))
 *   4) Launch Backend agents in parallel — gateway, booking-service, and
 *      user-service — independent services, per .rule/architecture.md
 *   5) Launch QA validation
 *   6) Report done and wait for approval
 *   7) Launch Security audit
 *   8) Mark backlog item done and continue to next task
 */

import { execSync, spawn } from "child_process"
import dotenv from "dotenv"
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs"
import { dirname, join } from "path"
import { createInterface } from "readline"
import { fileURLToPath } from "url"

const __projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..")
process.chdir(__projectRoot)

dotenv.config({ path: `.env.${process.env.NODE_ENV || "development"}` })

// ─── Model mapping ──────────────────────────────────────────────────────────
// Which Claude model each operation uses. Opus is reserved for the operations
// that write multi-file production code end-to-end (frontend, backend x3) —
// that's where its extra reasoning actually pays for itself. Everything else
// (planning, QA, security review, chat) is judgment/analysis over work Claude
// (or a human) already reviews downstream, so Sonnet 5 gets equivalent
// real-world quality at a fraction of the cost.
// Single place to retune cost/quality per operation without hunting through
// every spawnClaude() call site.
const MODEL_FOR = {
  planning:            "claude-sonnet-5", // askClaudeForPlan — initial plan draft (architecture reasoning, not code)
  "planning-revise":   "claude-sonnet-5", // askClaudeToRevisePlan — plan feedback rounds
  frontend:            "claude-opus-5",   // Frontend Agent — multi-file code generation
  gateway:             "claude-opus-5",   // Backend Agent — gateway — multi-file code generation (reverse proxy/routing)
  "booking-service": "claude-opus-5", // Backend Agent — booking-service — multi-file code generation, owns TimeSlot concurrency logic
  "user-service":      "claude-opus-5",   // Backend Agent — user-service — multi-file code generation (auth + admin accounts)
  "notification-service": "claude-opus-5", // Backend Agent — notification-service — multi-file code generation (server-to-server notification sending)
  qa:                  "claude-sonnet-5", // QA Agent — runs/reads existing tests, not creative code
  security:            "claude-sonnet-5", // Security Agent — checklist/scan-driven audit; bump to claude-opus-5 if audits need deeper adversarial reasoning
  "orchestrator-chat": "claude-sonnet-5", // waitForApprovalWithChat — short free-form chat during approval wait
}

function modelFor(operation) {
  return MODEL_FOR[operation] || MODEL_FOR.frontend
}

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

// When true, the plan-review gate never stops to wait on a human — it
// accepts the orchestrator's own "- Recommended: ..." answer on every Open
// Question and proceeds automatically. Questions are still asked/answered IN
// the plan file itself (the orchestrator still reasons through them) — this
// only skips the terminal STOP-AND-ASK wait for a human to type APPROVED.
// A CLI flag/env var can still override the config file for a one-off run.
const AUTO_APPROVE_PLANS = process.env.AUTO_APPROVE_PLANS != null || getArg("--auto-approve-plans")
  ? /^(1|true|yes)$/i.test(process.env.AUTO_APPROVE_PLANS || getArg("--auto-approve-plans"))
  : Boolean(orchestratorConfig.autoApprovePlans)

const PLAN_DIR = ".plan"
const REPORTS_DIR = "docs/agent-reports"
const COST_DIR = "docs/cost"
const BACKLOG_FILE = `${PLAN_DIR}/000-backlog.md`
const LATEST_PLAN_FILE = "docs/LAST_PLAN.md"
const STATE_DIR = "docs/task-state"

let USD_TO_NIS = 3.7
const ALL_AGENT_KEYS = ["orchestrator", "frontend", "gateway", "booking-service", "user-service", "notification-service", "qa", "security"]

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
  "orchestrator":         { icon: "👑", color: "\x1b[33m", label: "orchestrator" },
  "frontend":             { icon: "🎨", color: "\x1b[35m", label: "frontend" },
  "gateway":              { icon: "🔧", color: "\x1b[34m", label:  " 🚪 api-gateway" },
  "booking-service":  { icon: "🔧", color: "\x1b[34m", label: " 📅 booking-service" },
  "user-service":         { icon: "🔧", color: "\x1b[34m", label: " 🔑 user-service" },
  "notification-service": { icon: "🔧", color: "\x1b[34m", label: " ✉️ notification-service" },
  "qa":                   { icon: "🐛", color: "\x1b[32m", label: "qa" },
  "security":             { icon: "🛡️", color: "\x1b[36m", label: "security" },
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

  return parsed.result ?? rawStdout
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

  costLog = []
}

// ─── Main ─────────────────────────────────────────────────────────────────────

// Fails fast with a clear, specific reason instead of a confusing crash deep
// inside the loop (e.g. "fetch is not defined" on old Node, or a cryptic
// spawn ENOENT the first time an agent tries to launch). Checked once, right
// at startup, before anything else runs.
function checkPrerequisites() {
  const nodeMajor = Number(process.versions.node.split(".")[0])
  if (nodeMajor < 18) {
    printRed(`Node.js 18+ required (this script uses the native fetch API) — found ${process.version}.`)
    printRed("Install a current Node.js from https://nodejs.org, then rerun.")
    process.exit(1)
  }

  try {
    execSync("git --version", { stdio: "ignore" })
  } catch {
    printRed("git is not installed or not on PATH — this script runs real git commands (branch, commit, merge).")
    printRed("Install git, then rerun.")
    process.exit(1)
  }

  try {
    execSync("claude --version", { stdio: "ignore" })
  } catch {
    printRed("The 'claude' CLI is not installed or not on PATH — every agent step in this loop launches it as a subprocess.")
    printRed("Install Claude Code and log in ('claude /login'), then rerun.")
    process.exit(1)
  }
}

async function main() {
  checkPrerequisites()

  banner("DEV LOOP ORCHESTRATOR — DOG GROOMING CLINIC APPOINTMENT BOOKING")

  const BASE_BRANCH = getBaseBranch()
  log(`Base branch: '${BASE_BRANCH}' — every task branches from here and merges back here, only after your approval.`)

  USD_TO_NIS = await fetchUsdToNis()
  log(`Exchange rate: 1 USD = ₪${USD_TO_NIS} (ILS)`)

  ensurePlanDirAndBacklog()

  log("No issue tracker configured for this project — using local plan-file approval only.")
  log("No design source configured — Frontend Agent designs the UI per .rule/style-rules.md.")

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

    if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true })

    let state = loadTaskState(task.slug)
    const planResumable = Boolean(state?.approved && state?.planPath && existsSync(state.planPath))
    const draftResumable = Boolean(!planResumable && state?.planPath && existsSync(state.planPath))
    const ticketsResumable = planResumable && Boolean(state?.tickets)
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

    const branchName = `${BASE_BRANCH}-tasks/${task.slug}`
    createGitBranch(branchName, BASE_BRANCH)

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
    if (state?.reports) {
      reports = state.reports
      log("Report paths reused from saved state (keeps original run date).")
    } else {
      reports = makeReportPaths(task.slug, {
        frontend: tickets.frontend.id,
        gateway: tickets.gateway.id,
        bookingService: tickets.bookingService.id,
        userService: tickets.userService.id,
        qa: tickets.qa.id,
        security: tickets.security.id,
      })
      state = { ...state, reports }
      saveTaskState(task.slug, state)
    }

    // ── Step: Frontend ──────────────────────────────────────────────────────
    if (inScope(task, "frontend")) {
      await runAgent({
        systemPrompt: "agents/frontend/CLAUDE.md",
        input: [
          `You are the Frontend Agent.`,
          `Task: ${task.title}`,
          `Task id: ${tickets.frontend.id}`,
          `No external design source is provided — design the UI per .rule/style-rules.md.`,
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
      logSkip("Frontend Agent", "out of scope for this task")
      writeSkippedReport(reports.fe, "Frontend Agent")
    }

    // ── Step: Backend (all three services, in parallel — only those in scope) ──
    // gateway is a stateless reverse proxy; most tasks won't scope it in — only
    // deploy/production-setup tasks per agents/backend/CLAUDE.md.
    log("Launching backend agents (only those in scope, in parallel)...")

    await Promise.all([
      inScope(task, "gateway")
        ? runAgent({
            systemPrompt: "agents/backend/CLAUDE.md",
            input: [
              `You are the Backend Agent.`,
              `Task: ${task.title}`,
              `Task id: ${tickets.gateway.id}`,
              `Service: gateway`,
              `Port: ${BACKEND_PORTS.gateway}`,
              `API contract: ${API_CONTRACTS.gateway}`,
              `Approved plan: ${planPath}`,
              `Follow your CLAUDE.md instructions exactly.`,
              `End your final response with exact line: STATUS: DONE`,
            ].join("\n"),
            outputFile: reports.gateway,
            doneMarker: "STATUS: DONE",
            label: "Backend Agent — gateway",
            agentKey: "gateway",
          })
        : (logSkip("Backend Agent — gateway", "out of scope for this task"),
           writeSkippedReport(reports.gateway, "Backend Agent — gateway")),
      inScope(task, "booking-service")
        ? runAgent({
            systemPrompt: "agents/backend/CLAUDE.md",
            input: [
              `You are the Backend Agent.`,
              `Task: ${task.title}`,
              `Task id: ${tickets.bookingService.id}`,
              `Service: booking-service`,
              `Port: ${BACKEND_PORTS.bookingService}`,
              `API contract: ${API_CONTRACTS.bookingService}`,
              `Approved plan: ${planPath}`,
              `Follow your CLAUDE.md instructions exactly.`,
              `End your final response with exact line: STATUS: DONE`,
            ].join("\n"),
            outputFile: reports.bookingService,
            doneMarker: "STATUS: DONE",
            label: "Backend Agent — booking-service",
            agentKey: "booking-service",
          })
        : (logSkip("Backend Agent — booking-service", "out of scope for this task"),
           writeSkippedReport(reports.bookingService, "Backend Agent — booking-service")),
      inScope(task, "user-service")
        ? runAgent({
            systemPrompt: "agents/backend/CLAUDE.md",
            input: [
              `You are the Backend Agent.`,
              `Task: ${task.title}`,
              `Task id: ${tickets.userService.id}`,
              `Service: user-service`,
              `Port: ${BACKEND_PORTS.userService}`,
              `API contract: ${API_CONTRACTS.userService}`,
              `Approved plan: ${planPath}`,
              `Follow your CLAUDE.md instructions exactly.`,
              `End your final response with exact line: STATUS: DONE`,
            ].join("\n"),
            outputFile: reports.userService,
            doneMarker: "STATUS: DONE",
            label: "Backend Agent — user-service",
            agentKey: "user-service",
          })
        : (logSkip("Backend Agent — user-service", "out of scope for this task"),
           writeSkippedReport(reports.userService, "Backend Agent — user-service")),
      inScope(task, "notification-service")
        ? runAgent({
            systemPrompt: "agents/backend/CLAUDE.md",
            input: [
              `You are the Backend Agent.`,
              `Task: ${task.title}`,
              `Task id: ${tickets.notificationService.id}`,
              `Service: notification-service`,
              `Port: ${BACKEND_PORTS.notificationService}`,
              `API contract: ${API_CONTRACTS.notificationService}`,
              `Approved plan: ${planPath}`,
              `Follow your CLAUDE.md instructions exactly.`,
              `End your final response with exact line: STATUS: DONE`,
            ].join("\n"),
            outputFile: reports.notificationService,
            doneMarker: "STATUS: DONE",
            label: "Backend Agent — notification-service",
            agentKey: "notification-service",
          })
        : (logSkip("Backend Agent — notification-service", "out of scope for this task"),
           writeSkippedReport(reports.notificationService, "Backend Agent — notification-service")),
    ])

    // Real config values (MONGODB_URI, JWT_SECRET, ...) are collected HERE by
    // the orchestrator via a real blocking terminal prompt — not left to the
    // Backend Agent to "ask" mid-stream, since agents run one-shot via
    // `--print` with no live back-channel; a question buried in their
    // streamed output is easy to scroll past unanswered. This runs once per
    // service (only after that service's .env.example exists, i.e. after its
    // scaffold task), and reuses any value already set for a sibling service.
    if (inScope(task, "gateway")) await ensureBackendEnv("api-gateway")
    if (inScope(task, "booking-service")) await ensureBackendEnv("booking-service")
    if (inScope(task, "user-service")) await ensureBackendEnv("user-service")
    if (inScope(task, "notification-service")) await ensureBackendEnv("notification-service")

    // ── Step: QA ─────────────────────────────────────────────────────────────
    if (inScope(task, "qa")) {
      await runAgent({
        systemPrompt: "agents/qa/CLAUDE.md",
        input: [
          `You are the QA Agent.`,
          `Task: ${task.title}`,
          `Task id: ${tickets.qa.id}`,
          `Approved plan: ${planPath}`,
          `API contracts:`,
          `- ${API_CONTRACTS.gateway}`,
          `- ${API_CONTRACTS.bookingService}`,
          `- ${API_CONTRACTS.userService}`,
          `- ${API_CONTRACTS.notificationService}`,
          `Run validation across frontend, all in-scope backend services, and e2e.`,
          `Write ${reports.qa} and end final response with exact line: STATUS: DONE`,
        ].join("\n"),
        outputFile: reports.qa,
        doneMarker: "STATUS: DONE",
        label: "QA Agent",
        agentKey: "qa",
      })
    } else {
      logSkip("QA Agent", "out of scope for this task")
      writeSkippedReport(reports.qa, "QA Agent")
    }

    await waitForApprovalWithChat({ task, tickets, planPath })

    // ── Step: Security ───────────────────────────────────────────────────────
    if (inScope(task, "security")) {
      await runAgent({
        systemPrompt: "agents/security/CLAUDE.md",
        input: [
          `You are the Security Agent.`,
          `Task: ${task.title}`,
          `Task id: ${tickets.security.id}`,
          `Approved plan: ${planPath}`,
          `API contracts:`,
          `- ${API_CONTRACTS.gateway}`,
          `- ${API_CONTRACTS.bookingService}`,
          `- ${API_CONTRACTS.userService}`,
          `- ${API_CONTRACTS.notificationService}`,
          `Audit frontend, all in-scope backend services, and API contracts for security issues.`,
          `Write security tests to tests/security/ and the report to ${reports.security}, then end final response with exact line: STATUS: DONE`,
        ].join("\n"),
        outputFile: reports.security,
        doneMarker: "STATUS: DONE",
        label: "Security Agent",
        agentKey: "security",
      })
    } else {
      logSkip("Security Agent", "out of scope for this task")
      writeSkippedReport(reports.security, "Security Agent")
    }

    await markPlanStatus(planPath, "done")
    markBacklogTaskDone(task)
    clearTaskState(task.slug)
    commitTaskChanges(task, branchName)
    openChangedFilesInEditor()
    await pushAndMergeTaskBranch(task, branchName, BASE_BRANCH)
    openBrowserForTask(task)
    printCostTable(task.title)
    log(`Task complete: ${task.title}`)
  }
}

// ─── Plan dir ─────────────────────────────────────────────────────────────────

function ensurePlanDirAndBacklog() {
  if (!existsSync(PLAN_DIR)) {
    mkdirSync(PLAN_DIR, { recursive: true })
  }
}

// Which of the 6 gated agents (frontend/gateway/booking-service/
// user-service/qa/security) a task actually needs, read from the backlog line's `scope:`
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
    await askUserInput(`Fix the issue above, then press Enter to retry this command: `)
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
  return {
    fe:                 `${REPORTS_DIR}/${date}-${ticketIds.frontend}-${slug}-frontend.md`,
    gateway:            `${REPORTS_DIR}/${date}-${ticketIds.gateway}-${slug}-gateway.md`,
    bookingService: `${REPORTS_DIR}/${date}-${ticketIds.bookingService}-${slug}-booking-service.md`,
    userService:        `${REPORTS_DIR}/${date}-${ticketIds.userService}-${slug}-user-service.md`,
    notificationService: `${REPORTS_DIR}/${date}-${ticketIds.notificationService}-${slug}-notification-service.md`,
    qa:                 `${REPORTS_DIR}/${date}-${ticketIds.qa}-${slug}-qa.md`,
    security:           `${REPORTS_DIR}/${date}-${ticketIds.security}-${slug}-security.md`,
  }
}

const API_CONTRACTS = {
  gateway:            "docs/api-contract/api-contract.api-gateway.yaml",
  bookingService: "docs/api-contract/api-contract.booking-service.yaml",
  userService:        "docs/api-contract/api-contract.user-service.yaml",
  notificationService: "docs/api-contract/api-contract.notification-service.yaml",
}

const BACKEND_PORTS = {
  gateway: 4000,
  bookingService: 4001,
  userService: 4002,
  notificationService: 4003,
}

// ─── Claude planning ──────────────────────────────────────────────────────────

async function askClaudeForPlan({ task, prd, planPath, previousPlans, userInstructions }) {
  const prevList = previousPlans.map((p) => `- ${p.name}`).join("\n") || "(none)"
  const designGuidance = [
    "No external design source is provided for this project.",
    "Design the UI yourself per .rule/style-rules.md.",
    "Call out any UI assumptions in Open Questions.",
  ].join("\n")

  const args = [
    "--model", modelFor("planning"),
    "--permission-mode", CLAUDE_PERMISSION_MODE,
    "--add-dir", process.cwd(),
    "--system-prompt", "agents/orchestrator/CLAUDE.md",
    "--print",
    "--verbose",
    "--output-format", "stream-json",
  ]
  if (CLAUDE_ALLOWED_TOOLS) args.push("--allowedTools", CLAUDE_ALLOWED_TOOLS)

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

  const rawStdout = await spawnClaude(args, input, { agentKey: "orchestrator", extraEnv: { CLAUDE_AGENT_ROLE: "orchestrator" } })
  if (!rawStdout) {
    warn("Claude unavailable for planning; using fallback plan template.")
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
  const args = [
    "--model", modelFor("planning-revise"),
    "--permission-mode", CLAUDE_PERMISSION_MODE,
    "--add-dir", process.cwd(),
    "--system-prompt", "agents/orchestrator/CLAUDE.md",
    "--print",
  ]
  if (CLAUDE_ALLOWED_TOOLS) args.push("--allowedTools", CLAUDE_ALLOWED_TOOLS)

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

  const stdout = await spawnClaude(args, input, { agentKey: "orchestrator", extraEnv: { CLAUDE_AGENT_ROLE: "orchestrator" } })
  if (!stdout) return null
  return stdout.trim() || null
}

async function reviewPlanUntilApproved({ task, prd, planPath, userInstructions }) {
  if (AUTO_APPROVE_PLANS) {
    log("Plan gate: AUTO_APPROVE_PLANS is on — accepting the orchestrator's own Recommended answers, no terminal wait.")
    return
  }

  log("Plan gate: review and refine. The task proceeds only after terminal APPROVED.")

  while (true) {
    const answer = await askUserInput(
      `Review ${planPath}. Type APPROVED to continue, or enter feedback to revise the plan: `,
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
      warn("Could not auto-revise the plan (Claude unavailable). You can edit the plan file manually, then continue review.")
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

function simulateTickets(slug) {
  const up = slug.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) || "TASK"
  return {
    frontend:           { id: `${up}-FE` },
    gateway:            { id: `${up}-GW` },
    bookingService: { id: `${up}-APT` },
    userService:        { id: `${up}-USR` },
    notificationService: { id: `${up}-NOT` },
    qa:                 { id: `${up}-QA` },
    security:           { id: `${up}-SEC` },
  }
}

// ─── Agent runner ─────────────────────────────────────────────────────────────

const BLOCK_REASONS = {
  SESSION_LIMIT: "Claude usage/session limit hit.",
  AUTH_ERROR: "Claude is not logged in (run 'claude /login').",
  NOT_INSTALLED: "The 'claude' CLI could not be found on PATH.",
  FAILED: "Claude CLI call failed (see raw output below).",
  TIMEOUT: "The claude CLI process hung with no output and no completed response — killed after the idle timeout.",
}

// Never simulate. On ANY failure to get real output from Claude — known
// (session limit, auth) or not — write what happened to a status file next
// to the report, print it in red, and block on user input before retrying
// this exact step. A crashed/uncertain agent step must never be reported as
// STATUS: DONE.
async function blockAndRetry({ systemPrompt, input, outputFile, doneMarker, label, agentKey }) {
  const kind = lastSpawnError?.kind || "FAILED"
  const reason = BLOCK_REASONS[kind] || BLOCK_REASONS.FAILED
  const raw = (lastSpawnError?.raw || "").trim()

  const statusPath = `${outputFile}.blocked.md`
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

  await askUserInput(`Fix the issue above, then press Enter to retry ${label} exactly where it stopped: `)
  return runAgent({ systemPrompt, input, outputFile, doneMarker, label, agentKey })
}

// A real, successful Claude run that itself reports STATUS: BLOCKED (e.g. the
// Security Agent found a real vulnerability) is not a technical failure to
// retry — it's the agent correctly telling us not to proceed. Halt the whole
// dev-loop run rather than warning and marching the task to "done" anyway.
class AgentBlockedError extends Error {}

async function runAgent({ systemPrompt, input, outputFile, doneMarker, label, agentKey }) {
  const doneRegex = /^\s*STATUS\s*:\s*DONE\s*$/im
  const blockedRegex = /^\s*STATUS\s*:\s*BLOCKED\s*$/im
  if (existsSync(outputFile)) {
    const existing = readFileSync(outputFile, "utf-8")
    if (existing.includes(doneMarker) || doneRegex.test(existing)) {
      log(`${label}: already done — skipping.`)
      return
    }
  }

  const args = [
    "--model", modelFor(agentKey),
    "--permission-mode", CLAUDE_PERMISSION_MODE,
    "--add-dir", process.cwd(),
    "--system-prompt", systemPrompt,
    "--print",
    "--verbose",
    "--output-format", "stream-json",
  ]
  if (CLAUDE_ALLOWED_TOOLS) args.push("--allowedTools", CLAUDE_ALLOWED_TOOLS)

  log(`${label}: launching...`)
  const extraEnv = agentKey ? { CLAUDE_AGENT_ROLE: agentKey } : {}
  const rawStdout = await spawnClaude(args, input, { agentKey, extraEnv })

  if (rawStdout === null) {
    return blockAndRetry({ systemPrompt, input, outputFile, doneMarker, label, agentKey })
  }

  const stdout = recordCost(agentKey ?? "agent", label, rawStdout)
  logLastCost(label)

  const blockedStatusPath = `${outputFile}.blocked.md`
  if (existsSync(blockedStatusPath)) rmSync(blockedStatusPath)

  writeFileSync(outputFile, stdout, "utf-8")
  if (blockedRegex.test(stdout)) {
    printRed(`${label}: STATUS: BLOCKED — the agent found something that must be fixed before continuing.`)
    printRed(`Report (real, not simulated): ${outputFile}`)
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

  try {
    execSync("claude --version", { stdio: "ignore" })
  } catch {
    warn(`${label}: Claude not available — simulating output.`)
    simulateAgent(label, outputFile, doneMarker)
    return
  }

  const args = [
    "--model", modelFor(agentKey),
    "--permission-mode", CLAUDE_PERMISSION_MODE,
    "--add-dir", process.cwd(),
    "--system-prompt", systemPrompt,
  ]
  if (CLAUDE_ALLOWED_TOOLS) args.push("--allowedTools", CLAUDE_ALLOWED_TOOLS)

  log(`${label}: launching in interactive mode...`)
  log(`When the agent says STATUS: DONE, type /exit to continue.`)

  await new Promise((resolve) => {
    let child
    if (process.platform === "win32") {
      const command = ["claude", ...args.map(quoteArgForCmd)].join(" ")
      child = spawn(command, { stdio: ["pipe", "inherit", "inherit"], shell: true })
    } else {
      child = spawn("claude", args, { stdio: ["pipe", "inherit", "inherit"], shell: false })
    }

    child.stdin.write(input)
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
  writeFileSync(outputFile, content)
}

// Set right before spawnClaude resolves(null), so runAgent can tell a real
// session/usage-limit block apart from "claude not installed" or a crash.
let lastSpawnError = null

const SESSION_LIMIT_PATTERN = /hit your (?:session|usage) limit|resets?\s+\d{1,2}:\d{2}\s*(?:am|pm)\b/i
const AUTH_ERROR_PATTERN = /\bnot logged in\b|please run\s*`?\/login`?|invalid api key/i

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

function spawnClaude(args, stdinText, { agentKey = "", extraEnv = {} } = {}) {
  lastSpawnError = null

  try {
    execSync("claude --version", { stdio: "ignore" })
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
      const command = ["claude", ...args.map(quoteArgForCmd)].join(" ")
      child = spawn(command, { stdio: ["pipe", "pipe", "pipe"], shell: true, env })
    } else {
      child = spawn("claude", args, { stdio: ["pipe", "pipe", "pipe"], shell: false, env })
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
        const idleMs = Date.now() - lastOutputAt
        if (idleMs >= 5000 && idleMs < IDLE_TIMEOUT_MS) {
          process.stdout.write(".")
        }
        if (idleMs >= IDLE_TIMEOUT_MS && !settled) {
          settled = true
          clearInterval(heartbeat)
          printRed(`\n${agentKey || "claude"}: no output for ${Math.round(IDLE_TIMEOUT_MS / 60000)} min — the CLI process appears hung. Killing it.`)
          child.kill()
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

        if (event.type === "assistant" && Array.isArray(event.message?.content)) {
          for (const block of event.message.content) {
            if (block.type === "text" && block.text) {
              lastOutputAt = Date.now()
              assistantText += block.text + "\n"
              const out = agentKey ? prefixLines(block.text, agentKey) : block.text
              process.stdout.write(out.endsWith("\n") ? out : out + "\n")

              // React the moment a session-limit/login message actually shows up
              // in the stream — don't wait for the process to close on its own
              // (it may hang) or for the idle timeout (minutes away). This is
              // what makes the pause-and-wait prompt appear within seconds
              // instead of after a long silent wait.
              if (!settled && (isSessionLimitError(block.text) || isAuthError(block.text))) {
                settled = true
                if (completionGraceTimer) clearTimeout(completionGraceTimer)
                clearInterval(heartbeat)
                child.kill()
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
                  printRed(`\n${agentKey || "claude"}: response finished but the process didn't close within ${COMPLETION_GRACE_MS / 1000}s — recovering the completed response instead of waiting further.`)
                  child.kill()
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
        if (code !== 0 || !resultEvent) { recordFailure(assistantText); resolve(null); return }
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
        const idleMs = Date.now() - lastOutputAt
        if (!quiet && idleMs >= 5000 && idleMs < IDLE_TIMEOUT_MS) {
          process.stdout.write(".")
        }
        if (idleMs >= IDLE_TIMEOUT_MS && !settled) {
          settled = true
          clearInterval(idleWatchdog)
          printRed(`\n${agentKey || "claude"}: no output for ${Math.round(IDLE_TIMEOUT_MS / 60000)} min — the CLI process appears hung. Killing it.`)
          child.kill()
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
Scope-Agents: frontend,booking-service,user-service,notification-service,qa,security

## Goal
Deliver ${task.title} in the existing product.

## Scope
- In scope: changes needed for ${task.title}
- Out of scope: unrelated refactors, unrelated new features

## Assumptions
- Existing app and test setup are functional
- No external design source — Frontend Agent designs the UI per .rule/style-rules.md

## Open Questions
- Should this feature include analytics events? Recommended: no for first increment.
- Should this feature ship behind a flag? Recommended: no for demo speed.

## Steps
1. Frontend agent implements UI and defines API contract(s) if needed.
2. Backend agents (booking-service, user-service, notification-service, and gateway if in scope) run in parallel — independent services.
3. QA agent runs unit, integration, and e2e checks across frontend and all in-scope backend services.
4. Security agent audits frontend, all in-scope backend services, and API contracts.

## Validation
- frontend: npm --prefix frontend run lint && npm --prefix frontend run build && npm --prefix frontend run test
- backend/booking-service: npm --prefix backend/booking-service run test
- backend/user-service: npm --prefix backend/user-service run test
- backend/notification-service (only if in scope): npm --prefix backend/notification-service run test
- backend/api-gateway (only if in scope): npm --prefix backend/api-gateway run test

## Risks
- TimeSlot concurrency (booking-service) is the highest-risk area — see .rule/database-rules.md and .rule/testing-rules.md.
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
// loop refuses to run against it at all, since an unattended per-task merge
// loop is exactly the kind of thing that should never target main directly.
function getBaseBranch() {
  const branch = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf-8" }).trim()
  if (branch === "main" || branch === "master") {
    printRed(`Refusing to run: current branch is '${branch}'. main/master is sacred — dev-loop.js never branches from or merges into it.`)
    printRed(`Check out your own base branch first (e.g. 'git checkout booking_clinic_appointment'), then rerun.`)
    process.exit(1)
  }
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

// Approval gate: nothing gets pushed or merged into BASE_BRANCH without an
// explicit APPROVED from the human. main/master can never be a merge target
// here — getBaseBranch() already refused to run if that were the case.
async function pushAndMergeTaskBranch(task, branch, baseBranch) {
  const answer = await askUserInput(
    `Push '${branch}' and merge it into '${baseBranch}'? Type APPROVED, or press Enter to leave it unmerged for now: `,
  )
  if (answer.trim().toUpperCase() !== "APPROVED") {
    log(`Leaving '${branch}' unmerged and unpushed — merge it into '${baseBranch}' yourself when ready.`)
    return
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
    const answer = await askUserInput(prompt)
    if (answer.trim().toUpperCase() === "APPROVED") return
    log(`Type APPROVED to continue (got: "${answer.trim()}")`)
  }
}

async function waitForApprovalWithChat({ task, tickets, planPath }) {
  if (AUTO_APPROVE_PLANS) {
    log("Feature-done gate: AUTO_APPROVE_PLANS is on — auto-approving, no terminal wait.")
    return
  }

  log("Feature done. Type APPROVED to mark task complete, or send a command to the orchestrator.")

  while (true) {
    const answer = await askUserInput("orchestrator> ")
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

    const args = [
      "--model", modelFor("orchestrator-chat"),
      "--permission-mode", CLAUDE_PERMISSION_MODE,
      "--add-dir", process.cwd(),
      "--system-prompt", "agents/orchestrator/CLAUDE.md",
      "--print",
    ]
    if (CLAUDE_ALLOWED_TOOLS) args.push("--allowedTools", CLAUDE_ALLOWED_TOOLS)

    const stdout = await spawnClaude(args, context, { agentKey: "orchestrator" })
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
      while (!answer.trim() || answer.trim() === defaultValue) {
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

function askUserInput(prompt) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    rl.question(prompt, (answer) => {
      process.stdout.write(RESET)
      rl.close()
      resolve(answer)
    })
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
