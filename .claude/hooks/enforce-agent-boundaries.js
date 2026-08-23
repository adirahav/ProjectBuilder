//
// Orchestrator runs (no CLAUDE_AGENT_ROLE set) and interactive sessions are
// left unrestricted by this hook on purpose.
//
// Hila Tours — multi-agent build workflow (agents/*/CLAUDE.md). Backend is
// two microservices, no gateway: tour-service and user-management-service.
// development/dev-loop.js sets CLAUDE_AGENT_ROLE to the real backend service
// key (e.g. "tour-service") when spawning a backend agent — not a generic
// "backend" role — so each service gets its own entry here, scoped only to
// its own directory, so a backend agent working on one service can't write
// into the other's. Designer agent is used (designSource: DESIGNER_AGENT),
// so it keeps its own entry too.

import path from 'node:path'

const ALLOWED_WRITE_PREFIXES = {
  orchestrator:               ['.plan/'],
  designer:                   ['docs/design/'],
  frontend:                   ['frontend/', 'docs/api-contract/', 'docs/agent-reports/'],
  'tour-service':             ['backend/tour-service/', 'docs/agent-reports/'],
  'user-management-service':  ['backend/user-management-service/', 'docs/agent-reports/'],
  qa:                         ['docs/agent-reports/'],
  security:                   ['docs/tests/security/', 'docs/agent-reports/'],
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
