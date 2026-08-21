import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Capacitor wrapper config for the Android/iOS builds of this same React app.
 *
 * `webDir` points at Vite's build output, so the native flow is always
 * `npm run build && npx cap sync` — the native projects never contain a
 * hand-edited copy of the web assets.
 *
 * `androidScheme: 'https'` keeps the WebView origin on https rather than the
 * legacy `http://localhost`, which is what lets the app talk to the api-gateway
 * over https without Android's cleartext policy rejecting it.
 */
const config: CapacitorConfig = {
  appId: 'com.doggroomingstudio.app',
  appName: 'Dog Grooming Studio',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
}

export default config
