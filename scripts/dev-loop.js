#!/usr/bin/env node
/**
 * TEMPLATE — this file is executable code, not fill-in-the-blank prose, so it
 * cannot be mechanically substituted like the .rule/.claude/skills/agents
 * templates. Only relevant if Part 1 Q9 says multi-agent; if single-agent,
 * delete this file (and the agents/ directory) instead of adapting it.
 *
 * This is a whole-file REWRITE task, proportional to Part 1's answers:
 *   - Q7 (backend shape): every hardcoded service key/name below
 *     (MODEL_FOR, AGENT_IDENTITY, BACKEND_PORTS, API_CONTRACTS, ALL_AGENT_KEYS,
 *     the parallel runAgent() calls under "Step: Backend", makeReportPaths(),
 *     createLinearTickets()'s per-service createIssue() calls) must be
 *     regenerated for the real service list — one block per real service, not
 *     three. For a monolith backend, collapse all of this to a single service.
 *   - Q9 (issue tracker): the Linear-specific code (loadMcpLinear, all
 *     createLinearClient/getTeamStates/createLinearTickets/updateLinearIssue/
 *     waitForLinearIssueState functions) is only relevant if the user picked
 *     Linear. If another tracker, these need an equivalent client; if none,
 *     delete this code path and always use simulateTickets()/terminal approval.
 *   - Any deploy-gateway service (Part 1 Q7's "production gateway") should
 *     follow the common-service pattern below (no API contract, no DB) only
 *     if the new project actually has one — otherwise remove that branch.
 * Keep BACKEND_PORTS, API_CONTRACTS, and the agent-role list consistent with
 * agents/backend/CLAUDE.md and .rule/coding-rules.md's own service list.
 * Also rename the "Dev Loop Orchestrator — Reference App" title in the docstring
 * right below (and the banner("DEV LOOP ORCHESTRATOR — REFERENCE APP") call
 * further down in main()) to {{PROJECT_NAME}} — easy to miss inside a long
 * docstring rewrite, but it's real leftover text, not just a comment.
 * Delete this comment block once the rewrite is confirmed correct.
 */
/**
 * Dev Loop Orchestrator — Reference App
 *
 * This repo is a monorepo: `frontend/` + `backend/` with three microservices
 * (`user-management-service`, `tour-service`, `common-service`). All three backend
 * services are built and run from here, via `agents/backend/CLAUDE.md` (one shared
 * prompt, parameterized per service). `common-service` is a stateless production
 * gateway (static hosting + reverse proxy) and only runs on tasks whose scope
 * includes it — typically deploy/production-setup tasks, not regular features.
 *
 * Loop per backlog item:
 *   1) Pick next task from .plan/000-backlog.md
 *   2) Read design files (raw_from_ai_studio/ or Figma if provided)
 *   3) Generate plan in .plan/NNN-YYYY-MM-DD-topic.md and request approval
 *   4) Launch the Frontend agent (builds UI, defines API contract(s))
 *   5) Launch Backend agents in parallel — user-management-service, tour-service,
 *      and (only when in scope) common-service — independent services, per
 *      .rule/architecture.md
 *   6) Launch QA validation
 *   7) Report done and wait for approval
 *   8) Launch Security audit
 *   9) Mark backlog item done and continue to next task
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
// Which Claude model each operation uses. Opus is reserved for the two
// operations that write multi-file production code end-to-end (frontend,
// backend x2) — that's where its extra reasoning actually pays for itself.
// Everything else (planning, QA, security review, tickets, chat) is
// judgment/analysis over work Claude (or a human) already reviews downstream,
// so Sonnet 5 gets equivalent real-world quality at a fraction of the cost.
// Single place to retune cost/quality per operation without hunting through
// every spawnClaude() call site.
const MODEL_FOR = {
  planning:                  "claude-sonnet-5", // askClaudeForPlan — initial plan draft (architecture reasoning, not code)
  "planning-revise":         "claude-sonnet-5", // askClaudeToRevisePlan — plan feedback rounds
  "ticket-creation":         "claude-sonnet-5", // askClaudeToCreateTickets (unused currently) — mechanical Linear calls
  frontend:                  "claude-opus-5",   // Frontend Agent — multi-file code generation
  "user-management-service": "claude-opus-5",   // Backend Agent — user-management-service — multi-file code generation
  "tour-service":            "claude-opus-5",   // Backend Agent — tour-service — multi-file code generation
  "common-service":          "claude-sonnet-5", // Backend Agent — common-service — single-file stateless proxy/static gateway, no business logic
  qa:                        "claude-sonnet-5", // QA Agent — runs/reads existing tests, not creative code
  security:                  "claude-sonnet-5", // Security Agent — checklist/scan-driven audit; bump to claude-opus-5 if audits need deeper adversarial reasoning
  "orchestrator-chat":       "claude-sonnet-5", // waitForApprovalWithChat — short free-form chat during approval wait
}

function modelFor(operation) {
  return MODEL_FOR[operation] || MODEL_FOR.frontend
}

function loadMcpLinear() {
  try {
    const mcp = JSON.parse(readFileSync(".mcp.json", "utf-8"))
    const linear = mcp?.mcpServers?.linear || {}
    const auth = linear?.headers?.Authorization || ""
    const apiKey = auth.replace(/^Bearer\s+/i, "") || undefined
    const teamId = linear.LINEAR_TEAM_ID || undefined
    const projectId = linear.LINEAR_PROJECT_ID || undefined
    const teamFile = linear.LINEAR_TEAM_FILE || undefined
    const agentsTeam = teamFile && existsSync(teamFile)
      ? JSON.parse(readFileSync(teamFile, "utf-8"))
      : {}
    return { apiKey, teamId, projectId, agentsTeam }
  } catch {
    return {}
  }
}

// ============
const LINEAR_ENABLED = String(process.env.VITE_LINEAR_ENABLED ?? "true").toLowerCase() !== "false"
const FIGMA_ENABLED = String(process.env.VITE_FIGMA_ENABLED ?? "true").toLowerCase() !== "false"
console.log("LINEAR_ENABLED=" + process.env.VITE_LINEAR_ENABLED)
console.log("FIGMA_ENABLED=" + process.env.VITE_FIGMA_ENABLED)
// ============

const mcpLinear = loadMcpLinear()

const FIGMA_URL = FIGMA_ENABLED ? (process.env.FIGMA_URL || getArg("--figma") || "") : ""
const LINEAR_KEY = mcpLinear.apiKey
const LINEAR_TEAM = mcpLinear.teamId

const LINEAR_PROJECT = mcpLinear.projectId
const LINEAR_AGENTS_TEAM = mcpLinear.agentsTeam
const CLAUDE_PERMISSION_MODE = process.env.CLAUDE_PERMISSION_MODE || getArg("--claude-permission-mode") || "bypassPermissions"
const CLAUDE_ALLOWED_TOOLS = process.env.CLAUDE_ALLOWED_TOOLS || getArg("--claude-allowed-tools")

const PLAN_DIR = ".plan"
const REPORTS_DIR = "docs/agent-reports"
const COST_DIR = "docs/cost"
const BACKLOG_FILE = `${PLAN_DIR}/000-backlog.md`
const LATEST_PLAN_FILE = "docs/LAST_PLAN.md"
const TICKETS_FILE = "docs/tickets.json"
const STATE_DIR = "docs/task-state"

let USD_TO_NIS = 3.7
const ALL_AGENT_KEYS = ["orchestrator", "frontend", "user-management-service", "tour-service", "common-service", "qa", "security"]

// ─── Task resume state ──────────────────────────────────────────────────────
// Persisted per backlog task-slug so a crash/restart at any point (plan review,
// ticket creation, or any agent step) picks up from the last completed step
// instead of regenerating the plan / duplicating Linear tickets / rerunning
// agents that already finished.

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
  "orchestrator":            { icon: "👑", color: "\x1b[33m", label: "orchestrator" },
  "frontend":                { icon: "🎨", color: "\x1b[35m", label: "frontend" },
  "user-management-service": { icon: "🔧", color: "\x1b[34m", label: " 👥 user-management-service" },
  "tour-service":            { icon: "🔧", color: "\x1b[34m", label: " 🚌 tour-service" },
  "common-service":          { icon: "🔧", color: "\x1b[34m", label: " 🌐 common-service" },
  "qa":                      { icon: "🐛", color: "\x1b[32m", label: "qa" },
  "security":                { icon: "🛡️", color: "\x1b[36m", label: "security" },
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

async function main() {
  banner("DEV LOOP ORCHESTRATOR — REFERENCE APP")

  USD_TO_NIS = await fetchUsdToNis()
  log(`Exchange rate: 1 USD = ₪${USD_TO_NIS} (ILS)`)

  ensurePlanDirAndBacklog()

  log(`Linear tickets: ${LINEAR_ENABLED ? "enabled" : "disabled (LINEAR_ENABLED=false) — skipping ticket creation"}`)
  log(`Figma: ${FIGMA_ENABLED ? "enabled" : "disabled (FIGMA_ENABLED=false) — ignoring Figma links, using raw_from_ai_studio/ only"}`)

  const prd = readFileSync("docs/PRD.md", "utf-8")
  const linearClient = LINEAR_ENABLED && LINEAR_KEY ? createLinearClient(LINEAR_KEY) : null
  const linearStates = linearClient && LINEAR_TEAM ? await getTeamStates(linearClient, LINEAR_TEAM) : null

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
        log(`Resuming task '${task.slug}' from saved state — reusing approved plan${ticketsResumable ? " and existing tickets" : ""}.`)
      } else if (draftResumable) {
        log(`Resuming task '${task.slug}' — reusing unapproved draft plan (still needs your APPROVED).`)
      } else {
        log(`Found partial state for '${task.slug}' but the plan file is missing — starting this task's setup over.`)
      }
    }

    const userInstructions = planResumable
      ? ""
      : await askUserInput("Any instructions for the orchestrator? (press Enter to run automatically): ")

    const branchName = `task/${task.slug}`
    createGitBranch(branchName)

    const figmaUrl = FIGMA_ENABLED ? (task.figmaUrl || FIGMA_URL) : ""

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
          figmaUrl,
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
      await reviewPlanUntilApproved({ task, prd, figmaUrl, planPath, userInstructions })
      state = { slug: task.slug, planPath, approved: true }
      saveTaskState(task.slug, state)
    }
    await markPlanStatus(planPath, "active")

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
      writeFileSync(TICKETS_FILE, JSON.stringify(tickets, null, 2))
      log("Tickets reused from saved state — no new Linear tickets created.")
    } else if (linearClient && LINEAR_TEAM) {
      tickets = await createLinearTickets({ client: linearClient, teamId: LINEAR_TEAM, states: linearStates, task, planPath })
      writeFileSync(TICKETS_FILE, JSON.stringify(tickets, null, 2))
      state = { ...state, tickets }
      saveTaskState(task.slug, state)
    } else {
      warn("No Linear configured. Using simulated tickets after terminal approval.")
      tickets = simulateTickets(task.slug)
      writeFileSync(TICKETS_FILE, JSON.stringify(tickets, null, 2))
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
        userManagementService: tickets.userManagementService.id,
        tourService: tickets.tourService.id,
        commonService: tickets.commonService.id,
        qa: tickets.qa.id,
        security: tickets.security.id,
      })
      state = { ...state, reports }
      saveTaskState(task.slug, state)
    }

    // ── Step: Frontend ──────────────────────────────────────────────────────
    if (linearClient && linearStates?.inProgress) {
      await updateLinearIssue(linearClient, tickets.frontend.issueId, { stateId: linearStates.inProgress })
    }

    if (inScope(task, "frontend")) {
      await runAgent({
        systemPrompt: "agents/frontend/CLAUDE.md",
        input: [
          `You are the Frontend Agent.`,
          `Task: ${task.title}`,
          `Linear ticket: ${tickets.frontend.url}`,
          figmaUrl ? `Figma: ${figmaUrl}` : "",
          `Design source: raw_from_ai_studio/`,
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

    if (linearClient && linearStates?.done) {
      await updateLinearIssue(linearClient, tickets.frontend.issueId, { stateId: linearStates.done })
      if (linearStates.inProgress) {
        await updateLinearIssue(linearClient, tickets.userManagementService.issueId, { stateId: linearStates.inProgress })
        await updateLinearIssue(linearClient, tickets.tourService.issueId, { stateId: linearStates.inProgress })
        if (inScope(task, "common-service")) {
          await updateLinearIssue(linearClient, tickets.commonService.issueId, { stateId: linearStates.inProgress })
        }
      }
    }

    // ── Step: Backend (all microservices, in parallel — only those in scope) ──
    log("Launching backend agents (only those in scope, in parallel)...")

    await Promise.all([
      inScope(task, "user-management-service")
        ? runAgent({
            systemPrompt: "agents/backend/CLAUDE.md",
            input: [
              `You are the Backend Agent.`,
              `Task: ${task.title}`,
              `Linear ticket: ${tickets.userManagementService.url}`,
              `Service: user-management-service`,
              `Port: ${BACKEND_PORTS.userManagementService}`,
              `API contract: ${API_CONTRACTS.userManagementService}`,
              `Approved plan: ${planPath}`,
              `Follow your CLAUDE.md instructions exactly.`,
              `End your final response with exact line: STATUS: DONE`,
            ].join("\n"),
            outputFile: reports.userManagement,
            doneMarker: "STATUS: DONE",
            label: "Backend Agent — user-management-service",
            agentKey: "user-management-service",
          })
        : (logSkip("Backend Agent — user-management-service", "out of scope for this task"),
           writeSkippedReport(reports.userManagement, "Backend Agent — user-management-service")),
      inScope(task, "tour-service")
        ? runAgent({
            systemPrompt: "agents/backend/CLAUDE.md",
            input: [
              `You are the Backend Agent.`,
              `Task: ${task.title}`,
              `Linear ticket: ${tickets.tourService.url}`,
              `Service: tour-service`,
              `Port: ${BACKEND_PORTS.tourService}`,
              `API contract: ${API_CONTRACTS.tourService}`,
              `Approved plan: ${planPath}`,
              `Follow your CLAUDE.md instructions exactly.`,
              `End your final response with exact line: STATUS: DONE`,
            ].join("\n"),
            outputFile: reports.tourService,
            doneMarker: "STATUS: DONE",
            label: "Backend Agent — tour-service",
            agentKey: "tour-service",
          })
        : (logSkip("Backend Agent — tour-service", "out of scope for this task"),
           writeSkippedReport(reports.tourService, "Backend Agent — tour-service")),
      inScope(task, "common-service")
        ? runAgent({
            systemPrompt: "agents/backend/CLAUDE.md",
            input: [
              `You are the Backend Agent.`,
              `Task: ${task.title}`,
              `Linear ticket: ${tickets.commonService.url}`,
              `Service: common-service`,
              `Port: ${BACKEND_PORTS.commonService}`,
              `No API contract for this service — it is a stateless production gateway (static hosting + reverse proxy), not a business-logic service.`,
              `Approved plan: ${planPath}`,
              `Follow your CLAUDE.md instructions exactly.`,
              `End your final response with exact line: STATUS: DONE`,
            ].join("\n"),
            outputFile: reports.commonService,
            doneMarker: "STATUS: DONE",
            label: "Backend Agent — common-service",
            agentKey: "common-service",
          })
        : (logSkip("Backend Agent — common-service", "out of scope for this task"),
           writeSkippedReport(reports.commonService, "Backend Agent — common-service")),
    ])

    if (linearClient && linearStates?.done) {
      await updateLinearIssue(linearClient, tickets.userManagementService.issueId, { stateId: linearStates.done })
      await updateLinearIssue(linearClient, tickets.tourService.issueId, { stateId: linearStates.done })
      if (inScope(task, "common-service")) {
        await updateLinearIssue(linearClient, tickets.commonService.issueId, { stateId: linearStates.done })
      }
      if (linearStates.inProgress) {
        await updateLinearIssue(linearClient, tickets.qa.issueId, { stateId: linearStates.inProgress })
      }
    }

    // ── Step: QA ─────────────────────────────────────────────────────────────
    if (inScope(task, "qa")) {
      await runAgent({
        systemPrompt: "agents/qa/CLAUDE.md",
        input: [
          `You are the QA Agent.`,
          `Task: ${task.title}`,
          `Linear ticket: ${tickets.qa.url}`,
          `Approved plan: ${planPath}`,
          `API contracts:`,
          `- ${API_CONTRACTS.userManagementService}`,
          `- ${API_CONTRACTS.tourService}`,
          `common-service has no API contract — it's a stateless gateway; verify its proxy/static behavior directly if it's in scope for this task.`,
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

    if (linearClient) {
      const reviewState = linearStates?.inReview || linearStates?.todo
      if (reviewState) {
        await updateLinearIssue(linearClient, tickets.qa.issueId, { stateId: reviewState })
      }
      log("Feature gate: approve completion by moving QA ticket to Done in Linear.")
      await waitForLinearIssueState({
        client: linearClient,
        issueId: tickets.qa.issueId,
        targetKinds: ["completed", "done"],
        label: `${tickets.qa.id} feature approval`,
      })
    } else {
      await waitForApprovalWithChat({ task, tickets, planPath })
    }

    // ── Step: Security ───────────────────────────────────────────────────────
    if (linearClient && linearStates?.inProgress) {
      await updateLinearIssue(linearClient, tickets.security.issueId, { stateId: linearStates.inProgress })
    }

    if (inScope(task, "security")) {
      await runAgent({
        systemPrompt: "agents/security/CLAUDE.md",
        input: [
          `You are the Security Agent.`,
          `Task: ${task.title}`,
          `Linear ticket: ${tickets.security.url}`,
          `Approved plan: ${planPath}`,
          `API contracts:`,
          `- ${API_CONTRACTS.userManagementService}`,
          `- ${API_CONTRACTS.tourService}`,
          `common-service has no API contract — if it's in scope for this task, audit it as a gateway (open-proxy/SSRF risk, unmodified Authorization header passthrough) per agents/security/CLAUDE.md.`,
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

    if (linearClient && linearStates?.done) {
      await updateLinearIssue(linearClient, tickets.security.issueId, { stateId: linearStates.done })
    }

    await markPlanStatus(planPath, "done")
    markBacklogTaskDone(task)
    clearTaskState(task.slug)
    commitTaskChanges(task, branchName)
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

// Which of the 5 gated agents (frontend/user-management-service/tour-service/
// qa/security) a task actually needs, read from the backlog line's `scope:`
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

    let figmaUrl = ""
    let scopeRaw = ""
    for (const p of parts.slice(1)) {
      const kv = p.split(":")
      if (kv.length < 2) continue
      const key = kv[0].trim().toLowerCase()
      const value = kv.slice(1).join(":").trim()
      if (key === "figma") figmaUrl = value
      if (key === "scope") scopeRaw = value
    }

    return { lineIndex: i, line, title, slug: slugify(title), figmaUrl, scope: parseScope(scopeRaw) }
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
    fe:             `${REPORTS_DIR}/${date}-${ticketIds.frontend}-${slug}-frontend.md`,
    userManagement: `${REPORTS_DIR}/${date}-${ticketIds.userManagementService}-${slug}-user-management-service.md`,
    tourService:    `${REPORTS_DIR}/${date}-${ticketIds.tourService}-${slug}-tour-service.md`,
    commonService:  `${REPORTS_DIR}/${date}-${ticketIds.commonService}-${slug}-common-service.md`,
    qa:             `${REPORTS_DIR}/${date}-${ticketIds.qa}-${slug}-qa.md`,
    security:       `${REPORTS_DIR}/${date}-${ticketIds.security}-${slug}-security.md`,
  }
}

const API_CONTRACTS = {
  userManagementService: "docs/api-contract/api-contract.user-management-service.yaml",
  tourService:            "docs/api-contract/api-contract.tour-service.yaml",
}

const BACKEND_PORTS = {
  userManagementService: 3032,
  tourService: 3033,
  commonService: 3034,
}

// ─── Claude planning ──────────────────────────────────────────────────────────

async function askClaudeForPlan({ task, prd, figmaUrl, planPath, previousPlans, userInstructions }) {
  const prevList = previousPlans.map((p) => `- ${p.name}`).join("\n") || "(none)"
  const figmaTaskLine = figmaUrl ? `- figma: ${figmaUrl}` : "- figma: (none provided)"
  const designGuidance = figmaUrl
    ? [
        "Use your Figma tool to discover and inspect relevant frames for this task.",
        "Also read relevant design files from raw_from_ai_studio/ if available.",
        "In the plan, include a short section listing selected frames (name + id).",
      ].join("\n")
    : [
        "No Figma link was provided for this task.",
        "Read relevant design files from raw_from_ai_studio/ (discovery allowed).",
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
${figmaTaskLine}

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
- Note which design files are relevant to this task
- Open Questions section: each question gets exactly ONE answer line, formatted "- Recommended: <answer>". Do not add a second line repeating/labeling that same answer again (e.g. a further "Recommended answer: ..." bullet) — one line per question, period.
- Do NOT write a "*HUMAN ANSWER:*" line on this draft — you have not received any human review yet. Older plans in .plan/ may show that line because a real human typed a real answer during their review; it is a record of that event, not boilerplate to reproduce.
- Scope-Agents metadata field is load-bearing: the orchestrator will run ONLY the agents you list there (plus qa unless you deliberately omit it). Get this right — cross-check it against your own Risks section before finalizing (a backend service flagged as a risk there must be included even if you also wrote "no new endpoints expected").
${userInstructions ? `\nUser instructions for this run:\n${userInstructions}` : ""}`

  const rawStdout = await spawnClaude(args, input, { agentKey: "orchestrator", extraEnv: { CLAUDE_AGENT_ROLE: "orchestrator" } })
  if (!rawStdout) {
    warn("Claude unavailable for planning; using fallback plan template.")
    return generatePlanFallback({ task, figmaUrl })
  }
  const stdout = recordCost("orchestrator", "Orchestrator (planning)", rawStdout)
  logLastCost("Orchestrator (planning)")

  if (existsSync(planPath)) {
    const written = readFileSync(planPath, "utf-8")
    if (written.trim().length > 200) return written
  }

  return stdout
}

async function askClaudeToRevisePlan({ task, prd, figmaUrl, planPath, currentPlan, feedback, userInstructions }) {
  const figmaTaskLine = figmaUrl ? `- figma: ${figmaUrl}` : "- figma: (none provided)"

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
${figmaTaskLine}

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

async function reviewPlanUntilApproved({ task, prd, figmaUrl, planPath, userInstructions }) {
  log("Plan gate: review and refine. Tickets will be created only after terminal APPROVED.")

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
    const revised = await askClaudeToRevisePlan({ task, prd, figmaUrl, planPath, currentPlan, feedback, userInstructions })
    if (!revised) {
      warn("Could not auto-revise the plan (Claude unavailable). You can edit the plan file manually, then continue review.")
      continue
    }

    writeFileSync(planPath, revised, "utf-8")
    writeFileSync(LATEST_PLAN_FILE, revised, "utf-8")
    log(`Plan updated: ${planPath}`)
  }
}

// ─── Tickets ──────────────────────────────────────────────────────────────────

async function askClaudeToCreateTickets({ teamId, task, planPath, userInstructions }) {
  const plan = existsSync(planPath) ? readFileSync(planPath, "utf-8") : ""
  const args = [
    "--model", modelFor("ticket-creation"),
    "--permission-mode", CLAUDE_PERMISSION_MODE,
    "--add-dir", process.cwd(),
    "--system-prompt", "agents/orchestrator/CLAUDE.md",
    "--print",
  ]
  if (CLAUDE_ALLOWED_TOOLS) args.push("--allowedTools", CLAUDE_ALLOWED_TOOLS)

  const input = `Using your Linear tool, create six issues in team ${teamId} for this task:
- ${task.title}

Plan file: ${planPath}
Plan content:
${plan}

Create exactly:
1) Frontend implementation ticket
2) Backend ticket — user-management-service (port ${BACKEND_PORTS.userManagementService})
3) Backend ticket — tour-service (port ${BACKEND_PORTS.tourService})
4) Backend ticket — common-service (port ${BACKEND_PORTS.commonService}) — stateless production gateway, no API contract, no database
5) QA / E2E validation ticket
6) Security audit ticket

Use Todo state and medium priority.
${LINEAR_PROJECT ? `Assign all issues to project: ${LINEAR_PROJECT}` : ""}
${userInstructions ? `\nUser instructions for this run:\n${userInstructions}\n` : ""}
Output exactly this block and nothing else around it:
TICKETS_JSON
{"frontend":{"id":"<identifier>","issueId":"<uuid>","url":"<url>"},"userManagementService":{"id":"<identifier>","issueId":"<uuid>","url":"<url>"},"tourService":{"id":"<identifier>","issueId":"<uuid>","url":"<url>"},"commonService":{"id":"<identifier>","issueId":"<uuid>","url":"<url>"},"qa":{"id":"<identifier>","issueId":"<uuid>","url":"<url>"},"security":{"id":"<identifier>","issueId":"<uuid>","url":"<url>"}}
END_TICKETS_JSON`

  const stdout = await spawnClaude(args, input, { agentKey: "orchestrator", extraEnv: { CLAUDE_AGENT_ROLE: "orchestrator" } })
  if (!stdout) return null
  return parseTicketsFromOutput(stdout)
}

function parseTicketsFromOutput(stdout) {
  const match = stdout.match(/TICKETS_JSON\s*\n({[\s\S]+?})\s*\nEND_TICKETS_JSON/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[1])
    if (!parsed.frontend || !parsed.userManagementService || !parsed.tourService || !parsed.commonService || !parsed.qa || !parsed.security) return null
    return parsed
  } catch {
    return null
  }
}

// ─── Linear ───────────────────────────────────────────────────────────────────

function createLinearClient(apiKey) {
  const headers = { "Content-Type": "application/json", Authorization: apiKey }

  return {
    async graphql(query, variables = {}) {
      const body = JSON.stringify({ query, variables })
      const res = await fetch("https://api.linear.app/graphql", { method: "POST", headers, body })
      const json = await res.json()
      if (json?.errors?.length) throw new Error(`Linear API error: ${JSON.stringify(json.errors)}`)
      return json.data
    },
  }
}

async function getTeamStates(client, teamId) {
  const query = `
    query TeamStates($teamId: String!) {
      team(id: $teamId) {
        states { nodes { id name type } }
      }
    }
  `
  const data = await client.graphql(query, { teamId })
  const nodes = data?.team?.states?.nodes || []
  return {
    todo:       findStateId(nodes, ["unstarted", "backlog", "todo", "triage"]),
    inProgress: findStateId(nodes, ["started", "in progress", "inprogress", "doing"]),
    inReview:   findStateId(nodes, ["in review", "review", "for review"]),
    done:       findStateId(nodes, ["completed", "done"]),
  }
}

function findStateId(nodes, candidates) {
  const lowered = candidates.map((x) => x.toLowerCase())
  for (const node of nodes) {
    const name = String(node?.name || "").toLowerCase()
    const type = String(node?.type || "").toLowerCase()
    if (lowered.includes(type) || lowered.includes(name)) return node.id
  }
  return undefined
}

async function createLinearTickets({ client, teamId, states, task, planPath }) {
  const plan = existsSync(planPath) ? readFileSync(planPath, "utf-8") : ""

  async function createIssue(title, description, role) {
    const query = `
      mutation CreateIssue($input: IssueCreateInput!) {
        issueCreate(input: $input) {
          success
          issue { id identifier url }
        }
      }
    `
    const input = { teamId, title, description, priority: 2 }
    if (states?.todo) input.stateId = states.todo
    if (LINEAR_PROJECT) input.projectId = LINEAR_PROJECT
    const assigneeId = LINEAR_AGENTS_TEAM?.[role]?.linearUserId
    if (assigneeId) input.assigneeId = assigneeId
    const data = await client.graphql(query, { input })
    const issue = data?.issueCreate?.issue
    if (!issue) throw new Error("Linear API error: issueCreate returned no issue")
    return issue
  }

  const planBlock = plan.trim()
    ? `## Plan (\`${planPath}\`)\n\n${plan.trim()}`
    : `Plan: ${planPath} (file not found on disk)`

  const fe  = await createIssue(`[FE] ${task.title}`, `Implement frontend scope for:\n${task.title}\n\n${planBlock}`, "frontend-user")
  const um  = await createIssue(`[BE] user-management-service — ${task.title}`, `Implement user-management-service (port ${BACKEND_PORTS.userManagementService}) for:\n${task.title}\n\nAPI contract: ${API_CONTRACTS.userManagementService}\n\n${planBlock}`, "backend-user")
  const ts  = await createIssue(`[BE] tour-service — ${task.title}`, `Implement tour-service (port ${BACKEND_PORTS.tourService}) for:\n${task.title}\n\nAPI contract: ${API_CONTRACTS.tourService}\n\n${planBlock}`, "backend-user")
  const cs  = await createIssue(`[BE] common-service — ${task.title}`, `Implement common-service (port ${BACKEND_PORTS.commonService}) for:\n${task.title}\n\nStateless production gateway — no API contract, no database. See agents/backend/CLAUDE.md's common-service section.\n\n${planBlock}`, "backend-user")
  const qa  = await createIssue(`[QA] ${task.title}`, `Validate feature and run E2E for:\n${task.title}\n\n${planBlock}`, "qa-user")
  const sec = await createIssue(`[SEC] ${task.title}`, `Run security audit across frontend, both backend services, and API contracts for:\n${task.title}\n\n${planBlock}`, "security-user")

  return {
    frontend:               { id: fe.identifier, issueId: fe.id, url: fe.url },
    userManagementService:  { id: um.identifier, issueId: um.id, url: um.url },
    tourService:            { id: ts.identifier, issueId: ts.id, url: ts.url },
    commonService:          { id: cs.identifier, issueId: cs.id, url: cs.url },
    qa:                     { id: qa.identifier, issueId: qa.id, url: qa.url },
    security:               { id: sec.identifier, issueId: sec.id, url: sec.url },
  }
}

async function getLinearIssueState(client, issueId) {
  const query = `
    query IssueState($issueId: String!) {
      issue(id: $issueId) {
        id identifier
        state { id name type }
      }
    }
  `
  const data = await client.graphql(query, { issueId })
  return data?.issue?.state || null
}

async function waitForLinearIssueState({ client, issueId, targetKinds, label }) {
  const targets = targetKinds.map((x) => x.toLowerCase())
  log(`Waiting for Linear approval: ${label}`)
  while (true) {
    const state = await getLinearIssueState(client, issueId)
    const type = String(state?.type || "").toLowerCase()
    const name = String(state?.name || "").toLowerCase()
    if (targets.includes(type) || targets.includes(name)) {
      log(`Linear gate passed: ${label} -> ${state?.name || state?.type}`)
      return
    }
    await sleep(8000)
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function updateLinearIssue(client, issueId, input) {
  const query = `
    mutation UpdateIssue($issueId: String!, $input: IssueUpdateInput!) {
      issueUpdate(id: $issueId, input: $input) { success }
    }
  `
  await client.graphql(query, { issueId, input })
}

function simulateTickets(slug) {
  const up = slug.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) || "TASK"
  return {
    frontend:              { id: `${up}-FE`,  issueId: "sim-fe",  url: `https://linear.app/demo/issue/${up}-FE` },
    userManagementService: { id: `${up}-UM`,  issueId: "sim-um",  url: `https://linear.app/demo/issue/${up}-UM` },
    tourService:           { id: `${up}-TS`,  issueId: "sim-ts",  url: `https://linear.app/demo/issue/${up}-TS` },
    commonService:         { id: `${up}-CS`,  issueId: "sim-cs",  url: `https://linear.app/demo/issue/${up}-CS` },
    qa:                    { id: `${up}-QA`,  issueId: "sim-qa",  url: `https://linear.app/demo/issue/${up}-QA` },
    security:              { id: `${up}-SEC`, issueId: "sim-sec", url: `https://linear.app/demo/issue/${up}-SEC` },
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

function generatePlanFallback({ task, figmaUrl }) {
  const today = new Date().toISOString().slice(0, 10)
  return `# Plan: ${task.title}

Status: draft
Owner: Orchestrator
Last updated: ${today}
Scope-Agents: frontend,user-management-service,tour-service,qa,security

## Goal
Deliver ${task.title} in the existing product.

## Scope
- In scope: changes needed for ${task.title}
- Out of scope: unrelated refactors, unrelated new features

## Assumptions
- Existing app and test setup are functional
- Design source: raw_from_ai_studio/${figmaUrl ? `\n- Figma: ${figmaUrl}` : ""}

## Open Questions
- Should this feature include analytics events? Recommended: no for first increment.
- Should this feature ship behind a flag? Recommended: no for demo speed.

## Steps
1. Frontend agent implements UI and defines API contract(s) if needed.
2. Backend agents (user-management-service, tour-service) run in parallel — independent microservices.
3. QA agent runs unit, integration, and e2e checks across frontend and both backend services.
4. Security agent audits frontend, both backend services, and API contracts.

## Validation
- frontend: npm --prefix frontend run lint && npm --prefix frontend run build && npm --prefix frontend run test
- backend/user-management-service: npm --prefix backend/user-management-service run test
- backend/tour-service: npm --prefix backend/tour-service run test

## Risks
- Seat-lifecycle concurrency (tour-service) is the highest-risk area — see .rule/database-rules.md and .rule/testing-rules.md.
- Existing tests may fail due to unrelated baseline issues.

## Rollout Order
1. FE changes
2. BE changes (parallel)
3. QA verification
4. Security audit

## Rollback
- Revert branch commits for this task.
- Restore previous ticket states and mark plan superseded if replaced.
`
}

// ─── Git ──────────────────────────────────────────────────────────────────────

function createGitBranch(branch) {
  try {
    execSync(`git rev-parse --verify ${branch}`, { stdio: "ignore" })
    log(`Git branch '${branch}' already exists — checking it out.`)
    execSync(`git checkout ${branch}`, { stdio: "inherit" })
  } catch {
    log(`Creating git branch: ${branch}`)
    execSync(`git checkout -b ${branch}`, { stdio: "inherit" })
  }
}

// Commits everything this task touched, LOCALLY, on the task's own branch —
// and nothing more. dev-loop.js never pushes and never merges/switches to
// main; that is always a deliberate, separate action for a human to take.
// Without this, a whole task's work (and everything from the previous task,
// if this step is ever skipped) sits as uncommitted working-tree state that
// the next task's `git checkout -b` can silently carry forward or clobber.
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
        "Not pushed, not merged to main — review and do that yourself when ready.",
      ].join("\n"),
      "utf-8",
    )
    execSync(`git commit -F "${msgFile}"`, { stdio: "inherit" })
    rmSync(msgFile)
    log(`Committed locally on branch '${branch}'. Nothing was pushed or merged — that's on you: review, then push/merge to main when you're ready.`)
  } catch (e) {
    warn(`Auto-commit failed (${e.message}). Your changes for '${task.title}' are still sitting uncommitted on branch '${branch}' — commit them manually before letting the loop continue.`)
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
  log("Feature done. Type APPROVED to mark task complete, or send a command to the orchestrator.")

  while (true) {
    const answer = await askUserInput("orchestrator> ")
    if (answer.trim().toUpperCase() === "APPROVED") return

    const context = `
Current task: ${task.title}
Plan: ${planPath}
Tickets (may be simulated): ${JSON.stringify(tickets, null, 2)}
Tickets file: ${TICKETS_FILE}

The user says: "${answer}"

Act on the request. If you create real Linear tickets, save them to ${TICKETS_FILE}.
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
