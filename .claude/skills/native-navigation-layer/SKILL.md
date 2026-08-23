---
name: native-navigation-layer
description: Use this skill to orchestrate native back-button behavior and screen navigation stacks in mobile environments (Capacitor/Android). Enforces precise UX rules for each user flow, modal dismissal, and double-press app exit logic to ensure a predictable and non-frustrating user experience.
allowed_tools: [read_file]
examples:
   - input: "Handle native back button on the app's entry screen"
     output: "App.addListener('backButton', () => { moveAppToBackground(); });"
---

# Native Navigation & Back-Button Architecture (UX/Nav)
*Objective:* Control the native navigation ecosystem to ensure the hardware/gesture back-button mirrors the user's cognitive model. This layer prevents accidental app exits, eliminates navigation loops, and elegantly handles each distinct flow in this app.

**Key Focus Areas:**
- *Stack Hygiene:* Ensuring strict linear tracking and stripping historical screens (like the admin login modal) from the history stack once passed.

- *Double-Press to Exit:* Intercepting the root back-button event to show user feedback before sending the app to the background.

- *Modal Dismissal:* Back-button on an open modal closes the modal — it never navigates the underlying page.

- *Context-Aware Back Behavior:* Dynamic evaluation of the user's current route and authentication status before executing navigation.

## Core Principles

### 1. Root & Base Horizon
- **`GatewayPage` (`/`)** — the navigation root for the unauthenticated/passenger-choice flow. Pressing the native back button here must trigger the Double-Press Exit sequence (§3), never standard history popping.
- **`AdminDashboardPage` (`/admin`)** — the navigation root for the authenticated admin flow, regardless of which of the three tabs (Seat Management, Tours & Buses, Passenger Manifest Report) is active. Pressing back here also triggers the Double-Press Exit sequence (§3) — an admin backing out of the dashboard root is exiting the app, not logging out.

- *Linear/Browsing Screens:* `AdminSignupPage` (`/signup`) and `PassengerViewPage` (`/tours`, `/tours/:tourId/buses/:busId`) — back button steps back one level through standard linear history (signup → gateway; bus seat map → tour selector → gateway), not a guarded root.

### 2. Modal & Sub-View Orchestration
- *Modal-First Dismissal:* Any open modal — the Admin Login modal, the Seat Request modal (passenger name/phone/pickup point), the Manual Assign / Move / Swap modal, and any confirmation dialog (e.g. before canceling a taken seat) — must intercept the back-button event and close itself first — it must never fall through to navigate the page underneath.

- *Tabbed View Handling:* Switching tabs within `AdminDashboardPage` (Seat Management / Tours & Buses / Passenger Manifest Report) must NOT push new history entries — back button from any tab returns to that view's root behavior (§1), not to a previously-viewed tab.

- *Sub-Selection as Overlay:* Selecting a seat on the seat map (opening the Seat Request modal, or the admin's Manual Assign/Move/Swap modal) is an overlay, not a route change — back-button closes the modal and returns to the underlying seat map exactly as it was, with no loss of the currently-selected tour/bus.

### 3. Double-Press Exit (Root Screens Only)
- *Toast Feedback Interception:* The first back-button press on `GatewayPage` or `AdminDashboardPage` must show a non-modal Toast: "לחץ/י שוב ליציאה מהאפליקציה".

- *Double-Press Background Escape:* If the user presses the native back button a second time within a 2-second threshold on a root screen, the app must gracefully execute `Move App to Background`.

- *The "Do Nothing" Prohibition:* Never ignore a native back-button press completely without visual feedback — a suppressed press with no toast/response creates a frozen UI perception.

### 4. Authentication-Driven Branching
- *Authenticated flow:* Back button from `AdminDashboardPage` → root behavior (§1/§3). Back button from any authenticated sub-modal (Manual Assign/Move/Swap, edit-tour/bus/busType dialogs) → close the modal, stay on the current dashboard tab.
- *Logged out (or session expired via a `401`):* Back button from anywhere in the authenticated flow, once the session has expired, routes to `GatewayPage` (`/`) — the unauthenticated entry screen, not app exit.
- *Unauthenticated flow (passenger):* Passengers never log in — navigation for `PassengerViewPage` is purely route-based (§1) plus modal dismissal (§2), no auth branching needed.

### 5. Memory Stack Safety
- *Destructive Navigation:* When an admin successfully logs in from the Admin Login modal, `replace`/stack-reset `GatewayPage` (`/`) out of history so the back button from `AdminDashboardPage` never returns to the login modal/gateway screen.
- *Post-Action Confirmation:* After a significant one-shot user action completes (a passenger's seat request submission, an admin's approve/cancel/manual-assign/swap-move), do not push a separate "confirmation" route that could be navigated back into inconsistently — close the relevant modal/overlay and reflect the new seat state in place on the seat map.

## Implementation Checklist
- [ ] Root views (`GatewayPage`, `AdminDashboardPage`) handle exit/background routines instead of standard history popping.

- [ ] All modals (Admin Login, Seat Request, Manual Assign/Move/Swap, confirmation dialogs) intercept and consume the back-button event before it reaches page-level navigation.

- [ ] `AdminDashboardPage` tab switches do not create additional back-button history entries.

- [ ] Root screens implement the Double-Press to Background sequence with the localized Hebrew Toast warning.

- [ ] `GatewayPage` is wiped from history (`replace`) upon successful admin login.

- [ ] Back-button behavior is checked against auth state wherever flows could diverge (session expiry mid-dashboard).
