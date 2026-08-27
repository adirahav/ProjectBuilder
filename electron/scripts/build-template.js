#!/usr/bin/env node
/**
 * Snapshots the orchestration template (agents/, development/, .rule/, .doc/,
 * .claude/, docs/, .plan/, AGENTS.md, team-members.json, .env.example,
 * .gitignore) from the repo root into electron/resources/template/, so
 * electron-builder can bundle it as a packaged resource (see
 * electron/package.json's `build.extraResources`).
 *
 * Deliberately excludes `frontend/` and `backend/` — those are NOT part of
 * the bundled template. At runtime, main.js creates them as directory
 * junctions pointing straight into the user's own chosen project folder, so
 * a Backend/Frontend Agent's output lands there directly. The end user only
 * ever sees their own product's frontend/backend/android code — never the
 * orchestration machinery (agents' prompts, dev-loop.js, rules, this app's
 * own internal working files). That separation is the whole point of this
 * script existing instead of just using the repo root as-is.
 *
 * Not run automatically on every `npm start` — run by hand (or by `npm run
 * dist`, see package.json) whenever the template itself changes and the
 * bundled copy needs refreshing. electron/resources/template/ is gitignored
 * (generated, not source) so there's exactly one place the real template
 * content lives (the repo root), not two copies to keep in sync by hand.
 */
const fs = require("fs")
const path = require("path")

const REPO_ROOT = path.resolve(__dirname, "..", "..")
const DEST = path.join(__dirname, "..", "resources", "template")

const INCLUDE = [
  ".claude",
  ".doc",
  ".rule",
  ".env.example",
  ".gitignore",
  ".plan",
  "AGENTS.md",
  "agents",
  "development",
  "docs",
  "team-members.json",
]

const EXCLUDE_DIR_NAMES = new Set(["node_modules", ".git"])

function copyRecursive(src, dest) {
  const stat = fs.statSync(src)
  if (stat.isDirectory()) {
    if (EXCLUDE_DIR_NAMES.has(path.basename(src))) return
    fs.mkdirSync(dest, { recursive: true })
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry))
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(src, dest)
  }
}

if (fs.existsSync(DEST)) {
  fs.rmSync(DEST, { recursive: true, force: true })
}
fs.mkdirSync(DEST, { recursive: true })

for (const name of INCLUDE) {
  const src = path.join(REPO_ROOT, name)
  if (!fs.existsSync(src)) {
    console.warn(`[build-template] Skipping missing: ${name}`)
    continue
  }
  copyRecursive(src, path.join(DEST, name))
}

console.log(`[build-template] Wrote template snapshot to ${DEST}`)
