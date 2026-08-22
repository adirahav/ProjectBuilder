//
// Orchestrator runs (no CLAUDE_AGENT_ROLE set) and interactive sessions are
// left unrestricted by this hook on purpose.
//
// TEMPLATE — only relevant if Part 1 Q9 says this project uses the
// multi-agent build workflow (agents/*/CLAUDE.md). If single-agent, this
// whole file (and its wiring in .claude/settings.json) should be deleted
// along with the agents/ directory.
// ALLOWED_WRITE_PREFIXES below encodes two things from Part 1:
//   - one entry per agent role actually used (Q9) — drop roles that don't apply.
//   - each role's prefixes must match the real backend topology (Q7): a single
//     backend/ folder for a monolith, or one prefix per microservice directory
//     (e.g. 'backend/user-management-service/') if multiple services exist,
//     so a backend agent scoped to one service can't write into another's.
// Ask the user: "What are the final agent roles and their exact write-scoped directories?"
// Delete this comment block once confirmed.

import path from 'node:path'

const ALLOWED_WRITE_PREFIXES = {
  orchestrator:          ['.plan/'],
  // Only present if Part 1 Q9's design source is "Designer agent" — drop
  // this entry (and delete agents/designer/) otherwise, per that file's own
  // TEMPLATE comment block.
  designer:              ['docs/design/'],
  frontend:              ['frontend/', 'docs/api-contract/', 'docs/agent-reports/'],
  backend:               ['backend/', 'docs/agent-reports/'],
  qa:                    ['docs/agent-reports/'],
  security:              ['docs/tests/security/', 'docs/agent-reports/'],
}

let input = ''
process.stdin.on('data', chunk => { input += chunk })
process.stdin.on('end', () => {
  const role = process.env.CLAUDE_AGENT_ROLE
  const allowedPrefixes = role && ALLOWED_WRITE_PREFIXES[role]
  if (!allowedPrefixes) {
    process.exit(0) // no role set (orchestrator / interactive) - not this hook's job
  }

  let payload
  try {
    payload = JSON.parse(input)
  } catch {
    process.exit(0)
  }

  const rawPath = payload?.tool_input?.file_path ?? ''
  if (!rawPath) {
    process.exit(0)
  }

  // tool_input.file_path is absolute (Claude resolves it against its cwd,
  // which dev-loop.js sets to the repo root before spawning). Resolve it
  // relative to the repo root before comparing against the relative
  // ALLOWED_WRITE_PREFIXES below — comparing an absolute path against a
  // relative prefix like "frontend/" via startsWith() never matches.
  const filePath = path.relative(process.cwd(), rawPath).replace(/\\/g, '/').replace(/^\.\//, '')

  const isAllowed = allowedPrefixes.some(prefix => filePath.startsWith(prefix))
  if (!isAllowed) {
    console.error(
      `[guardrail] "${role}" agent tried to write outside its allowed paths: "${filePath}". ` +
      `Allowed: ${allowedPrefixes.join(', ')}`
    )
    process.exit(2)
  }

  process.exit(0)
})
