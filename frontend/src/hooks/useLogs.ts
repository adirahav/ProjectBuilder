import { useSyncExternalStore } from 'react'
import { getLogEntries, subscribeToLogs, type LogEntry } from '../utils/logger'

/** Live view of the tagged-log buffer, for the in-app log viewer. */
export function useLogs(): LogEntry[] {
  return useSyncExternalStore(subscribeToLogs, getLogEntries, getLogEntries)
}
