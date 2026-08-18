// Central log buffer for the in-app log viewer (see .rule/error-handling-rules.md).
//
// Tagged calls — console.log('[TAG] message') — are intercepted here and kept in
// a bounded in-memory ring so the native build can surface them without a
// devtools connection. Untagged console output is passed straight through.
//
// Never pass a token, password or raw response body into a tagged log.

export interface LogEntry {
  tag: string
  message: string
  at: string
}

const MAX_ENTRIES = 200
const TAGGED_PREFIX = /^\[([A-Z0-9_-]+)\]\s*/

const entries: LogEntry[] = []

export function getLogEntries(): LogEntry[] {
  return [...entries]
}

export function clearLogEntries(): void {
  entries.length = 0
}

export function recordLog(rawMessage: string): LogEntry | null {
  const match = TAGGED_PREFIX.exec(rawMessage)
  if (!match) return null

  const entry: LogEntry = {
    tag: match[1],
    message: rawMessage.slice(match[0].length),
    at: new Date().toISOString(),
  }

  entries.push(entry)
  if (entries.length > MAX_ENTRIES) entries.shift()

  return entry
}

let isInstalled = false

export function installLogger(): void {
  if (isInstalled) return
  isInstalled = true

  const original = console.log.bind(console)
  console.log = (...args: unknown[]) => {
    if (typeof args[0] === 'string') recordLog(args[0])
    original(...args)
  }
}
