/**
 * Tagged-console-log interceptor backing the in-app log viewer.
 *
 * Any `console.log('[TAG] message')` call whose first argument starts with a
 * `[TAG]` prefix is captured into an in-memory ring buffer, in addition to
 * being forwarded to the real console. Untagged logs pass through untouched.
 *
 * Per .rule/error-handling-rules.md: never log tokens, passwords, or full
 * response bodies.
 */

export type LogEntry = {
  id: number
  tag: string
  message: string
  timestamp: string
}

type LogListener = (entries: LogEntry[]) => void

const MAX_ENTRIES = 500
const TAG_PATTERN = /^\[([A-Z0-9_-]+)\]\s*/i

let entries: LogEntry[] = []
let nextId = 0
let isInstalled = false

const listeners = new Set<LogListener>()

function notify() {
  for (const listener of listeners) listener(entries)
}

function serialize(args: unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === 'string') return arg
      if (arg instanceof Error) return `${arg.name}: ${arg.message}`
      try {
        return JSON.stringify(arg)
      } catch {
        return String(arg)
      }
    })
    .join(' ')
}

function record(args: unknown[]) {
  const [first] = args
  if (typeof first !== 'string') return

  const match = TAG_PATTERN.exec(first)
  if (!match) return

  const entry: LogEntry = {
    id: nextId++,
    tag: match[1].toUpperCase(),
    message: serialize([first.slice(match[0].length), ...args.slice(1)]).trim(),
    timestamp: new Date().toISOString(),
  }

  entries = [...entries, entry].slice(-MAX_ENTRIES)
  notify()
}

/** Installs the console interceptor. Safe to call more than once. */
export function installLogger() {
  if (isInstalled) return
  isInstalled = true

  const original = console.log.bind(console)
  console.log = (...args: unknown[]) => {
    record(args)
    original(...args)
  }
}

/** Current captured entries, oldest first. */
export function getLogEntries(): LogEntry[] {
  return entries
}

/** Subscribes to log-buffer changes. Returns an unsubscribe function. */
export function subscribeToLogs(listener: LogListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function clearLogEntries() {
  entries = []
  notify()
}
