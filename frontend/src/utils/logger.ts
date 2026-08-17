const MAX_ENTRIES = 200

export interface LogEntry {
  tag: string
  message: string
  timestamp: string
}

const entries: LogEntry[] = []

/**
 * Intercepts tagged `console.log('[TAG] ...')` calls so they can be surfaced
 * in an in-app log viewer. Untagged logs pass through untouched.
 */
export function initLogger() {
  const originalLog = console.log

  console.log = (...args: unknown[]) => {
    const first = args[0]
    const match = typeof first === 'string' ? /^\[([A-Z0-9_-]+)\]\s*(.*)$/.exec(first) : null

    if (match) {
      entries.push({
        tag: match[1] ?? '',
        message: [match[2], ...args.slice(1).map(String)].filter(Boolean).join(' '),
        timestamp: new Date().toISOString(),
      })
      if (entries.length > MAX_ENTRIES) entries.shift()
    }

    originalLog(...args)
  }
}

export function getLogEntries(): readonly LogEntry[] {
  return entries
}

export function clearLogEntries() {
  entries.length = 0
}
