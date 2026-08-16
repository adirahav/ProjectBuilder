#!/usr/bin/env node
// PreToolUse guardrail: hard-blocks any tool access to known secret files,
// regardless of which tool is used to reach them (Read, Edit, Write, Bash,
// Grep, Glob...). permissions.deny only covers the exact tool+pattern listed
// and can't see inside a Bash command string - this hook inspects the actual
// tool_input for every call, so reading a real env file via cat, Read, or
// grep is all caught the same way.
//
// Runs even when CLAUDE_PERMISSION_MODE=bypassPermissions (dev-loop.js's
// default for the FE/BE/QA sub-agents) - hooks are a separate enforcement
// layer from the permission system, which is exactly why this demo relies
// on them instead of permissions.deny alone.

// Matched as a suffix fragment (not a full path), so this covers every real
// secret-bearing env file regardless of which package it lives in - the
// repo root's, each backend service's, and the frontend's - without
// hardcoding every service's path. The .example template files carry no
// real secrets and are intentionally NOT matched here.
const SECRET_PATH_FRAGMENTS = [
  '.env.development',
  '.env.production'
]

let input = ''
process.stdin.on('data', chunk => { input += chunk })
process.stdin.on('end', () => {
  let payload
  try {
    payload = JSON.parse(input)
  } catch {
    process.exit(0)
  }

  const toolInput = payload?.tool_input ?? {}
  const haystack = JSON.stringify(toolInput).toLowerCase()

  const match = SECRET_PATH_FRAGMENTS.find(fragment => haystack.includes(fragment.toLowerCase()))

  if (match) {
    console.error(`[guardrail] Blocked ${payload?.tool_name ?? 'tool'} call touching secret file: ${match}`)
    process.exit(2)
  }

  process.exit(0)
})
