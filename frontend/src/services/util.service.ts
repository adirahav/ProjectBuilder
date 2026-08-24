/**
 * Platform storage access.
 *
 * The admin JWT and any other persisted value goes through here — never
 * `localStorage` scattered ad hoc across components.
 *
 * On the native Android (Capacitor) build this delegates to
 * `@capacitor/preferences`; on web it falls back to `localStorage`. Capacitor is
 * not wired up yet (separate ticket), so only the web path is implemented — the
 * API is already async so adding the native path later is not a breaking change.
 */

const AUTH_TOKEN_KEY = 'hila.auth.token'

function isStorageAvailable(): boolean {
  try {
    return typeof globalThis.localStorage !== 'undefined'
  } catch {
    return false
  }
}

export async function getStorageItem(key: string): Promise<string | null> {
  if (!isStorageAvailable()) return null
  try {
    return globalThis.localStorage.getItem(key)
  } catch (err) {
    console.log('[STORAGE] failed to read key', key, err)
    return null
  }
}

export async function setStorageItem(key: string, value: string): Promise<void> {
  if (!isStorageAvailable()) return
  try {
    globalThis.localStorage.setItem(key, value)
  } catch (err) {
    console.log('[STORAGE] failed to write key', key, err)
  }
}

export async function removeStorageItem(key: string): Promise<void> {
  if (!isStorageAvailable()) return
  try {
    globalThis.localStorage.removeItem(key)
  } catch (err) {
    console.log('[STORAGE] failed to remove key', key, err)
  }
}

export function getAuthToken(): Promise<string | null> {
  return getStorageItem(AUTH_TOKEN_KEY)
}

export function setAuthToken(token: string): Promise<void> {
  return setStorageItem(AUTH_TOKEN_KEY, token)
}

export function clearAuthToken(): Promise<void> {
  return removeStorageItem(AUTH_TOKEN_KEY)
}
