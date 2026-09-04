#!/usr/bin/env node
/**
 * Setup Wizard — collects every closed-form/technical answer
 * NEW-PROJECT-SETUP-PROMPT.md needs (approval mode, design source, issue
 * tracker, DB connection string, ...) via plain deterministic prompts,
 * before any LLM agent is involved.
 *
 * Why this exists: none of these questions need judgment or interpretation
 * — each has a small fixed set of valid answers (or a short literal string
 * like a connection string). Asking them through an LLM conversation burns
 * tokens and risks misreading a typed answer ("s" vs "switch", "y" vs
 * "yes") for zero benefit over a numbered menu.
 *
 * What's deliberately NOT here, even though it might look closed-form on
 * the surface: anything that requires understanding the product's own
 * domain to answer correctly — the actual product description (what the
 * app is, its users, its entities), whether a contested/limited resource
 * exists, and how the backend decomposes into services. A blind y/n from
 * someone who hasn't described the product yet is worse than not asking at
 * all — those stay in NEW-PROJECT-SETUP-PROMPT.md's Part 1 Q1-3+, asked by
 * the LLM once it has that context to reason with.
 *
 * Run this FIRST, before opening NEW-PROJECT-SETUP-PROMPT.md with a coding
 * agent. It writes .setup-config.json (read by the prompt in place of
 * re-asking the questions below) and, where a concrete decision already
 * fully determines a file's fate (e.g. web-only -> no native-navigation-layer),
 * makes that filesystem change itself instead of leaving it for the agent
 * to redo.
 */

import { execSync } from "child_process"
import { createInterface } from "readline"
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"

const __projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..")
process.chdir(__projectRoot)

const rl = createInterface({ input: process.stdin, output: process.stdout })
function ask(prompt) {
  return new Promise((resolve) => rl.question(prompt, resolve))
}

async function askChoice(prompt, options) {
  const list = options.map((o, i) => `  ${i + 1}) ${o}`).join("\n")
  for (;;) {
    const answer = (await ask(`${prompt}\n${list}\n> `)).trim()
    const idx = Number(answer) - 1
    if (Number.isInteger(idx) && idx >= 0 && idx < options.length) return options[idx]
    console.log(`Please enter a number from 1 to ${options.length}.`)
  }
}

async function askYesNo(prompt, defaultYes = false) {
  const answer = (await ask(`${prompt} (y/n) [${defaultYes ? "y" : "n"}]: `)).trim().toLowerCase()
  if (!answer) return defaultYes
  return answer.startsWith("y")
}

// A blank answer just re-asks instead of silently accepting an empty
// value — used for fields that don't have a sensible default (a Figma file
// key, a real connection string, ...) and would otherwise let someone
// blow past a required parameter with a bare Enter.
async function askRequired(prompt) {
  for (;;) {
    const answer = (await ask(prompt)).trim()
    if (answer) return answer
    console.log("  This can't be blank.")
  }
}

// Same detection dev-loop.js's own checkLlmAccount()/probeLoggedInProviders()
// use at runtime (getLoggedInClaudeAccountEmail/getLoggedInCursorAccountEmail)
// — duplicated here rather than imported since this script has to run
// standalone, before development/ is necessarily even the final copy in
// place. Kept in sync intentionally: same commands, same parsing.
function cliOnPath(bin) {
  try {
    execSync(`${bin} --version`, { stdio: "ignore" })
    return true
  } catch {
    return false
  }
}

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
    return parsed?.isAuthenticated ? (parsed.userInfo?.email || null) : null
  } catch {
    return null
  }
}

// Returns a GitHub *username*, not an email — Copilot CLI itself
// (`copilot`) has no `auth status`/JSON output at all (its only documented
// login is an interactive `/login` typed inside its own REPL); `gh auth
// status --json hosts` is the only scriptable identity signal available,
// and Copilot CLI does honor gh's stored credentials (GH_TOKEN/GITHUB_TOKEN
// precedence, documented). Confirmed shape: {"hosts":{"github.com":[{
// "active":true,"login":"...","state":"error"|absent-when-healthy,...}]}}.
// Detection only — dev-loop.js does NOT run agents through Copilot CLI
// (no documented headless/print mode to invoke it non-interactively, unlike
// Claude's `-p` or Cursor's `agent -p`), so this is never offered as
// something to pin as expectedLlmProvider, only shown for reference.
function getLoggedInGithubCopilotAccount() {
  try {
    const out = execSync("gh auth status --json hosts", { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] })
    const entries = JSON.parse(out)?.hosts?.["github.com"] || []
    const active = entries.find((e) => e.active)
    return active && !active.error && active.state !== "error" ? (active.login || null) : null
  } catch {
    return null
  }
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "project"
}

// Total count of main (top-level) questions below — every call to next()
// advances one step of this total. Conditional follow-ups (the design-source
// sub-questions, MongoDB's own value prompt, ...) stay unnumbered/indented
// under their parent question instead of consuming their own slot, since
// whether they're asked at all depends on the parent's answer.
const TOTAL_QUESTIONS = 11
let questionIndex = 0
function next(prompt) {
  questionIndex += 1
  return `\n[${questionIndex}/${TOTAL_QUESTIONS}] ${prompt}`
}

async function main() {
  console.log("=== Setup Wizard — configuration questions (no LLM needed for these) ===")

  const config = {}

  // Two DIFFERENT gates, deliberately not derived from one another — one
  // for standing up the infrastructure (PRD, .rule/*.md, skills, agents/*.md
  // — NEW-PROJECT-SETUP-PROMPT.md's own file-by-file drafting), one for
  // building the actual product afterward (development/dev-loop.js's
  // per-task plan approval, once real features start getting built). A
  // project can reasonably want a human reviewing every scaffolding file
  // yet let routine feature tasks fly through unattended, or the reverse —
  // conflating them into a single answer was the earlier version's mistake.
  const infraChoice = await askChoice(
    next("Setting up the infrastructure (PRD, rules, agent configs, ...) — after each file is drafted, do you want to…"),
    ["Stop and approve it before continuing (gated)", "Keep going and review everything at the end (ungated)"]
  )
  config.approvalMode = infraChoice.startsWith("Stop") ? "gated" : "ungated"

  const buildChoice = await askChoice(
    next("Building the actual project (dev-loop.js) — after each task's plan is drafted, do you want to…"),
    ["Stop and approve it before continuing (gated)", "Let it proceed automatically (ungated)"]
  )
  config.buildApprovalMode = buildChoice.startsWith("Stop") ? "gated" : "ungated"

  config.projectName = await askRequired(next("Project name (used for the default database name): "))

  config.direction = await askChoice(next("Primary direction for the product's own UI:"), ["LTR", "RTL"])

  config.platforms = await askChoice(
    next("Platform targets:"),
    ["Web only", "Web + Android", "Web + iOS", "Web + Android + iOS", "Android + iOS (no web)"]
  )
  config.targetsNative = config.platforms !== "Web only"
  config.targetsWeb = config.platforms !== "Android + iOS (no web)"
  if (!config.targetsWeb) {
    console.log(
      "  Note: this template's native support is Capacitor, which wraps an existing React web app — " +
      "there's no separate native-only build path. \"Android + iOS (no web)\" still means a full React " +
      "web app gets built, just with no route to visit it directly outside the wrapped app. Flag this " +
      "to whoever runs NEW-PROJECT-SETUP-PROMPT.md next in case that's not actually what's wanted."
    )
  }

  // Deliberately NOT asked here, even though it's a y/n on the surface:
  // whether a contested resource exists, and how the backend actually
  // decomposes into services, both require understanding the product's own
  // domain (what entities exist, what they mean) — that's exactly what
  // Part 1 Q1-3's conversational interview is for. A blind y/n from someone
  // who hasn't described the product yet is worse than not asking at all.
  // NEW-PROJECT-SETUP-PROMPT.md asks both once it has that context.

  config.designSource = await askChoice(
    next("Design source of truth:"),
    ["AI-Studio export", "Figma", "Designer agent", "No design source"]
  )
  if (config.designSource === "AI-Studio export") {
    config.designSourceFolder = (await ask("  Folder name [raw_from_ai_studio/]: ")).trim() || "raw_from_ai_studio/"
  } else if (config.designSource === "Figma") {
    config.figmaFileKey = await askRequired("  Figma file key: ")
    console.log("  (The Figma API key itself is a secret — add it to .mcp.json's figma entry as an env var, never hardcoded here.)")
  } else if (config.designSource === "Designer agent") {
    config.autoApproveDesign = !(await askYesNo(
      "  Stop and wait for your approval (or feedback for a revision) after the Designer agent produces mockups, before the build continues?",
      true
    ))
  }

  config.issueTracker = await askChoice(next("Issue tracker:"), ["Linear", "Jira", "GitHub Issues", "None"])
  // The identifier itself is safe to collect here (not a secret); each
  // tracker's real API key/token stays out of this wizard entirely — same
  // rule as Figma's file key above — added to .mcp.json as an env var
  // during the next (LLM) step instead. NOTE: as of this writing, only
  // Linear actually has any working integration code in this template
  // (team-members.json, dev-loop.js's ticket-assignment logic) — Jira and
  // GitHub Issues are asked for consistency/future-proofing, but picking
  // them doesn't wire up anything yet; NEW-PROJECT-SETUP-PROMPT.md should
  // say so plainly rather than imply otherwise.
  if (config.issueTracker === "Linear") {
    config.linearTeamId = await askRequired("  Linear Team ID: ")
  } else if (config.issueTracker === "Jira") {
    config.jiraProjectKey = await askRequired("  Jira project key: ")
  } else if (config.issueTracker === "GitHub Issues") {
    config.githubRepo = await askRequired("  GitHub repo (owner/repo): ")
  }

  const dbChoice = await askChoice(
    next("MongoDB connection string:"),
    ["I have a connection string", "I don't have one (use local db)"]
  )
  config.mongoUri = dbChoice === "I have a connection string"
    ? await askRequired("  MongoDB connection string: ")
    : `mongodb://localhost:27017/${slugify(config.projectName)}`

  // `.git` is a filesystem fact, not a preference — checked the same way
  // dev-loop.js's own GIT_ENABLED does (existsSync(".git")), not asked as a
  // question the user could get wrong or that could go stale the moment
  // they run `git init` a minute later. When it's missing, the two
  // branching questions below are skipped entirely rather than asked about
  // a git workflow that doesn't exist yet — createBranchPerTask/
  // autoMergeTasks are simply never consulted by dev-loop.js without a repo
  // (see "Version control is optional" in NEW-PROJECT-SETUP-PROMPT.md), so
  // asking them here would be asking about nothing.
  const gitEnabled = existsSync(".git")
  if (!gitEnabled) {
    console.log(
      next("No .git found here — every git-specific setting below is skipped; run 'git init' before or after this setup if you want version control (see NEW-PROJECT-SETUP-PROMPT.md's \"Version control is optional\").")
    )
    config.createBranchPerTask = false
    config.autoMergeTasks = false
  } else {
    const branchStrategy = await askChoice(
      next("Git branching for this project:"),
      ["Everything on one branch (no per-task branches)", "Each task gets its own branch"]
    )
    config.createBranchPerTask = branchStrategy === "Each task gets its own branch"
    config.autoMergeTasks = config.createBranchPerTask
      ? await askYesNo("  Automatically merge each finished task branch into the base branch, with no approval stop?", false)
      : false
  }

  // Independent of whether this project HAS its own backend (that question
  // stays conversational — see Q7 in NEW-PROJECT-SETUP-PROMPT.md, since
  // deciding it needs product context) — a project can call external APIs
  // either way (Stripe from a self-built backend, or straight from the
  // frontend if there's no owned backend at all). One YAML file per API
  // under docs/api-contract/external/, same convention as the per-service
  // contract files the Frontend Agent already writes for owned services —
  // so agents read a real file, not a link they'd have to go fetch (and
  // that could change/go stale) each time.
  const wantsExternalApis = await askYesNo(
    next("Does this project call any external/third-party APIs (payment, SMS, maps, ...) the agents should know about?"),
    false
  )
  const externalApis = []
  if (wantsExternalApis) {
    console.log("  Enter each one (blank name to finish):")
    for (;;) {
      const name = (await ask(`  API name (e.g. "Stripe", "Twilio") — blank to finish: `)).trim()
      if (!name) break
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || `api-${externalApis.length + 1}`
      const specPath = (await ask(`    Path to its OpenAPI/YAML spec file (blank to add docs/api-contract/external/${slug}.yaml yourself later): `)).trim()
      if (specPath) {
        try {
          mkdirSync("docs/api-contract/external", { recursive: true })
          writeFileSync(`docs/api-contract/external/${slug}.yaml`, readFileSync(specPath, "utf-8"), "utf-8")
          console.log(`    Copied to docs/api-contract/external/${slug}.yaml`)
        } catch (e) {
          console.log(`    Could not read that file (${e.message}) — add docs/api-contract/external/${slug}.yaml yourself later.`)
        }
      }
      externalApis.push({ name, slug })
    }
  }
  config.externalApis = externalApis

  // Detects whoever's ALREADY logged in (claude auth status / agent status)
  // — this never launches a login flow itself (that's real interactive
  // OAuth, which belongs to dev-loop.js's checkLlmAccount()/attemptLogin()
  // at build time, with dashboard support under Electron; a plain wizard
  // question isn't the place for a browser popup). If nothing's detected,
  // or the human doesn't want to pin one yet, this is simply left unset —
  // dev-loop.js's own first run asks then, exactly as it already does for
  // a project with no wizard-set value at all.
  const claudeEmail = cliOnPath("claude") ? getLoggedInClaudeAccountEmail() : null
  const cursorEmail = cliOnPath("agent") ? getLoggedInCursorAccountEmail() : null
  if (claudeEmail || cursorEmail) {
    const options = []
    if (claudeEmail) options.push(`Claude (${claudeEmail})`)
    if (cursorEmail) options.push(`Cursor (${cursorEmail})`)
    options.push("Don't pin one now — ask at build time")
    const choice = await askChoice(next("Pin which LLM account this project's agents run through?"), options)
    if (choice.startsWith("Claude")) {
      config.expectedLlmProvider = "claude"
      config.expectedLlmAccount = claudeEmail
    } else if (choice.startsWith("Cursor")) {
      config.expectedLlmProvider = "cursor"
      config.expectedLlmAccount = cursorEmail
    }
  } else {
    console.log(next("No LLM account (Claude or Cursor) detected as logged in — skipped; dev-loop.js will ask the first time it runs."))
  }

  // GitHub Copilot is detected but never offered as a pin above — unlike
  // Claude/Cursor, dev-loop.js has no way to actually RUN agents through it
  // (see getLoggedInGithubCopilotAccount()'s comment), so pinning it as
  // expectedLlmProvider would silently mean something different from what
  // it says. Stored separately, reference-only.
  const githubCopilotAccount = cliOnPath("gh") ? getLoggedInGithubCopilotAccount() : null
  if (githubCopilotAccount) {
    config.githubCopilotAccount = githubCopilotAccount
    console.log(`  (Also detected: GitHub Copilot as ${githubCopilotAccount} — reference only, dev-loop.js doesn't run agents through it.)`)
  }

  rl.close()

  // .setup-secrets.json is the only place a real secret value is allowed to
  // land during setup (gitignored) — same rule NEW-PROJECT-SETUP-PROMPT.md's
  // Part 1 Q11 already documented; this script just performs it directly
  // instead of leaving it for the agent to redo from the same answer.
  if (config.mongoUri) {
    const secretsPath = ".setup-secrets.json"
    const existing = existsSync(secretsPath) ? JSON.parse(readFileSync(secretsPath, "utf-8")) : {}
    existing.MONGODB_URI = config.mongoUri
    writeFileSync(secretsPath, JSON.stringify(existing, null, 2) + "\n", "utf-8")
    console.log(`\nWrote MONGODB_URI to ${secretsPath}.`)
  }

  // Deterministic file deletions — these follow mechanically from a single
  // closed-form answer above, with no product judgment involved, so there's
  // no reason to make the LLM agent re-derive and re-confirm them.
  // seat-concurrency-layer is NOT deleted here — whether a contested
  // resource exists needs the product interview (Part 1 Q1-3), which this
  // wizard deliberately doesn't do; NEW-PROJECT-SETUP-PROMPT.md's Phase B
  // item 13 still owns that deletion once it actually knows the answer.
  if (!config.targetsNative && existsSync(".claude/skills/native-navigation-layer")) {
    rmSync(".claude/skills/native-navigation-layer", { recursive: true, force: true })
    console.log("Deleted .claude/skills/native-navigation-layer/ (web-only).")
  }
  if (config.designSource !== "Designer agent" && existsSync("agents/designer/CLAUDE.md")) {
    rmSync("agents/designer/CLAUDE.md", { force: true })
    console.log("Deleted agents/designer/CLAUDE.md (design source isn't the Designer agent).")
  }
  if (config.issueTracker !== "Linear" && existsSync("team-members.json")) {
    rmSync("team-members.json", { force: true })
    console.log("Deleted team-members.json (Linear isn't the tracker).")
  }

  writeFileSync(".setup-config.json", JSON.stringify(config, null, 2) + "\n", "utf-8")
  console.log(
    "\nWrote .setup-config.json.\n" +
    "Now open development/NEW-PROJECT-SETUP-PROMPT.md with your coding agent — it reads this file " +
    "instead of re-asking these questions, and only interviews you on the actual product " +
    "(what the app is, its users, its domain entities)."
  )
}

main()
