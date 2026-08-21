All checks pass. Here's what I built.

## What changed

**Native platform scaffolding**
- `frontend/capacitor.config.ts` — appId `com.doggroomingstudio.app`, `webDir: 'dist'`, `androidScheme: 'https'`
- `frontend/android/` and `frontend/ios/` scaffolded via `npx cap add`; both verified with `npx cap sync` (Capacitor's own `.gitignore` files correctly exclude the copied `dist` assets and generated config)
- Deps: `@capacitor/app`, `@capacitor/android`, `@capacitor/ios` (dependencies), `@capacitor/cli` (devDependency); scripts `cap:sync`, `cap:open:android`, `cap:open:ios`

**Back-button behaviour** (`frontend/src/native/`)
- `backButtonLogic.ts` — the whole `native-navigation-layer` decision table as one pure function: `{pathname, isAuthenticated, isModalOpen, lastExitPromptAt, now}` → `closeModal | promptExit | exitApp | navigateBack | navigateTo`. Precedence is modal → login-route → guarded-route-without-token → root → linear. No branch returns a no-op, per the "Do Nothing" prohibition.
- `useNativeBackButton.ts` — thin listener mounted once in `AppRoutes`, gated on `Capacitor.isNativePlatform()`. It subscribes **once** and reads state via refs + `useStore.getState()` at event time; re-subscribing per route change would leave a gap where a press falls through to Capacitor's default handler (which exits the app outright).

**Modal interception** — rather than teaching the listener about each dialog (a list that goes stale the moment a fourth dialog is added), the shared `ModalDialog` primitive registers itself in a new `ui.slice.ts` registry while open. `CancelAppointmentDialog`, `DeactivateServiceDialog` and `ServiceForm` are all covered with zero per-dialog wiring. `requestClose` now returns a boolean so a dialog mid-write reports `'blocked'` and gets a toast instead of a silently swallowed press.

**Two judgment calls worth flagging:**
1. Plan step 7 asked me to verify/fix the post-login `replace`. `AdminLoginPage.tsx:62` already used `navigate(..., { replace: true })` — no change needed, so I covered it with a test instead of touching working code.
2. Safe-area: I applied top/bottom insets only. Left/right insets are *physical* directions, and piping them through Tailwind's logical `ps-`/`pe-` utilities would mirror them incorrectly in Hebrew RTL — worse than leaving them off. I also added `viewport-fit=cover` to `index.html`, without which every `env()` inset silently computes to 0 on device.

=== FRONTEND AGENT REPORT ===
```
Ticket: NATIVECA-FE
Pages built/changed: none (AdminLoginPage verified only — already used replace:true)
Components changed: common/ModalDialog.tsx (back-button registry + boolean close),
                    layout/AppHeader.tsx (top safe-area inset), App.tsx (hook mount,
                    bottom safe-area inset)
New modules: src/native/backButtonLogic.ts, src/native/useNativeBackButton.ts
Services built/changed: none
Store slices built/changed: store/slices/ui.slice.ts (new — open-modal registry),
                            store/store.ts (assembles UiSlice)
Other: capacitor.config.ts, android/, ios/, index.html (viewport-fit=cover),
       i18n/strings.ts (nativeBack.* he+en), package.json, README.md
Lint: PASS
Build: PASS
Tests: 511 passed, 0 failed (28 files; 41 of those are new across
       backButtonLogic.test.ts, ui.slice.test.ts, ModalDialog.test.tsx)
API contracts:
  - none — this ticket adds no new/changed endpoints (client-side navigation only)

Handoff to Backend Agent:
- No backend work required for this ticket.

STATUS: DONE
```

**Not verified by me:** the actual native event wiring can't be exercised in jsdom. The decision table, the modal registry and `ModalDialog`'s registration are all under test, but double-press exit, `minimizeApp()`, and on-device safe-area rendering need an Android Studio emulator run (steps documented in `frontend/README.md`). I did not launch an emulator or dev server.

STATUS: DONE