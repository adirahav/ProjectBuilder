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
- *Stack Hygiene:* Ensuring strict linear tracking and stripping historical screens (like a login modal) from the history stack once passed.

- *Double-Press to Exit:* Intercepting the root back-button event to show user feedback before sending the app to the background.

- *Modal Dismissal:* Back-button on an open modal closes the modal — it never navigates the underlying page.

- *Context-Aware Back Behavior:* Dynamic evaluation of the user's current route and authentication status before executing navigation.

## Core Principles

### 1. Root & Base Horizon
This app has two navigation roots, one per role/flow (`Customer` guest flow, `Admin` authenticated flow):
- **`/` (Service List)** — root of the guest/customer flow. Pressing the native back button here must trigger the Double-Press Exit sequence (§3), never standard history popping.
- **`/admin/appointments`** — root of the authenticated admin flow (the dashboard landing screen after login). Pressing the native back button here must also trigger the Double-Press Exit sequence (§3) — an admin who just logged in should not be able to back out to the login screen (see §5) or out of the app accidentally.

- *Linear/Browsing Screens:* `/book/:serviceId` (TimeSlot Picker), `/book/:serviceId/:timeSlotId/confirm` (Contact Details & Confirm), `/appointments/:id` (Booking Confirmation), `/admin/login` (Admin Login), and `/admin/services` (Admin Services, reached from the admin dashboard) — back button steps back one level through standard linear history, not a guarded root:
  - From **TimeSlot Picker** → back to **Service List** (releases nothing yet, since no slot is held until one is selected).
  - From **Contact Details & Confirm** → back to **TimeSlot Picker**, and this back navigation must release any `held` `TimeSlot` (call `timeslot.service.ts`'s release/hold-cancel action, or let the hold expire naturally, but prefer an explicit release so the slot frees immediately for other customers) and clear the selection from `booking.slice`.
  - From **Booking Confirmation** → back to **Service List** (root), since this screen is a one-shot confirmation, not a step to redo — do not return to Contact Details (the appointment is already created).
  - From **Admin Login** → back to **Service List** (the public entry point; admin login is reachable from a public app, not its own root — see §4).
  - From **Admin Services** → back to **Admin Appointments** (the admin root).

### 2. Modal & Sub-View Orchestration
- *Modal-First Dismissal:* Any open modal — the **Add/Edit Service modal** (opened from `/admin/services`) and any confirmation dialog (e.g. "confirm cancel appointment" on `/admin/appointments`) — must intercept the back-button event and close itself first — it must never fall through to navigate the page underneath.

- *Tabbed View Handling:* This app has no tabbed views in v1 (no tab groups exist) — this rule is a no-op today but stays documented for if a future admin dashboard adds tabs (e.g. Appointments/Services as tabs instead of separate routes).

- *Sub-Selection as Overlay:* Any selection that opens a modal/overlay rather than a route change (e.g. the Add/Edit Service modal) should have back-button close the modal and return to the underlying view exactly as it was, with no data loss on the in-progress view.

### 3. Double-Press Exit (Root Screens Only)
- *Toast Feedback Interception:* The first back-button press on a root screen must show a non-modal Toast: "לחצו שוב כדי לצאת" ("Press again to exit").

- *Double-Press Background Escape:* If the user presses the native back button a second time within a 2-second threshold on a root screen, the app must gracefully execute `Move App to Background`.

- *The "Do Nothing" Prohibition:* Never ignore a native back-button press completely without visual feedback — a suppressed press with no toast/response creates a frozen UI perception.

### 4. Authentication-Driven Branching
- *Authenticated (`Admin`) flow:* Back button from the authenticated root (`/admin/appointments`) → root behavior (§1/§3). Back button from any authenticated sub-modal → close the modal, stay on the current screen.
- *Logged out (or session expired via a `401`):* Back button from `/admin/login` → the `Customer` entry screen (`/`), not app exit.
- *Unauthenticated (`Customer`) flow:* No auth branching needed — `Customer` never logs in; navigation is purely route-based (§1) plus modal dismissal (§2).

### 5. Memory Stack Safety
- *Destructive Navigation:* When an `Admin` successfully logs in, `replace`/stack-reset `/admin/login` out of history so the back button from `/admin/appointments` never returns to the login screen.
- *Post-Action Confirmation:* After a `Customer` completes a booking, `replace` into `/appointments/:id` rather than pushing it on top of the booking form — the back button from the confirmation screen should not return into a stale, already-submitted contact-details form.

## Implementation Checklist
- [ ] Root views (`/` and `/admin/appointments`) handle exit/background routines instead of standard history popping.

- [ ] All modals (Add/Edit Service, cancel-appointment confirmation) intercept and consume the back-button event before it reaches page-level navigation.

- [ ] No tabbed views exist in v1 — revisit this rule if a future dashboard adds tabs.

- [ ] Root screens implement the Double-Press to Background sequence with a localized Toast warning ("לחצו שוב כדי לצאת").

- [ ] The login route (`/admin/login`) is wiped from history (`replace`) upon successful login, so back from `/admin/appointments` never returns to it.

- [ ] Back button from Contact Details & Confirm releases the held `TimeSlot` before returning to the TimeSlot Picker.

- [ ] Back-button behavior is checked against auth state wherever flows could diverge (admin vs. guest).
