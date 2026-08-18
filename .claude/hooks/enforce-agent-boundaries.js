//
// Orchestrator runs (no CLAUDE_AGENT_ROLE set) and interactive sessions are
// left unrestricted by this hook on purpose.
//
// Multi-agent build workflow (agents/*/CLAUDE.md). Backend agents are always
// launched scoped to exactly one of the four real services below — the
// backend-agent process itself only ever receives one service name via its
// launch input, so a single 'backend/' prefix is sufficient here; the actual
// per-service isolation is enforced by agents/backend/CLAUDE.md's own
// "Allowed Paths" instructions (the agent is told which single
// backend/<service>/ directory it may touch) plus this hook's blanket
// backend/ boundary against frontend/ and other top-level directories.

import path from 'node:path'

// Real services: api-gateway, booking-service, user-service, notification-service
const ALLOWED_WRITE_PREFIXES = {
  orchestrator:          ['.plan/'],
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
