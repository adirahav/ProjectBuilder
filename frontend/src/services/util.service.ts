import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

// Cross-platform persistence. The same call works on web (localStorage) and on
// the Capacitor Android/iOS build (Preferences), so no caller ever has to
// branch on the platform itself.
export const utilService = {
  async saveToStorage(key: string, value: unknown): Promise<void> {
    const strValue = JSON.stringify(value)

    if (Capacitor.isNativePlatform()) {
      await Preferences.set({ key, value: strValue })
    } else {
      localStorage.setItem(key, strValue)
    }
  },

  async getFromStorage<T = unknown>(key: string): Promise<T | null> {
    const value = Capacitor.isNativePlatform()
      ? (await Preferences.get({ key })).value
      : localStorage.getItem(key)

    if (value === null) return null

    // A value written by an older build (or by hand) may not be valid JSON —
    // fall back to the raw string instead of throwing at every read site.
    try {
      return JSON.parse(value) as T
    } catch {
      return value as unknown as T
    }
  },

  async removeFromStorage(key: string): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      await Preferences.remove({ key })
    } else {
      localStorage.removeItem(key)
    }
  },
}
