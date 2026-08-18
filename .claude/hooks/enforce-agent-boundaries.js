//
// Orchestrator runs (no CLAUDE_AGENT_ROLE set) and interactive sessions are
// left unrestricted by this hook on purpose.
//
// Multi-agent build workflow (Dog Grooming Clinic Booking): orchestrator +
// frontend + one backend agent per microservice (gateway, appointment-service,
// user-service) + qa + security — see agents/*/CLAUDE.md. The Backend Agent
// is launched once per service, so CLAUDE_AGENT_ROLE is set to the exact
// service name ('gateway' | 'appointment-service' | 'user-service') for
// that invocation, scoping it to that service's own directory only.

import path from 'node:path'

const ALLOWED_WRITE_PREFIXES = {
  orchestrator:          ['.plan/', 'docs/'],
  frontend:              ['frontend/src/', 'docs/api-contract/'],
  gateway:               ['backend/gateway/'],
  'appointment-service': ['backend/appointment-service/'],
  'user-service':        ['backend/user-service/'],
  qa:                    ['frontend/src/', 'backend/', 'tests/e2e/', 'docs/agent-reports/'],
  security:              ['tests/security/', 'docs/agent-reports/'],
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
