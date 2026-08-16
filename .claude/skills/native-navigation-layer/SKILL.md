---
name: native-navigation-layer
description: Use this skill to orchestrate native back-button behavior and screen navigation stacks in mobile environments (Capacitor/Android). Enforces precise UX rules for each user flow, modal dismissal, and double-press app exit logic to ensure a predictable and non-frustrating user experience.
allowed_tools: [read_file]
examples:
   - input: "Handle native back button on the app's entry screen"
     output: "App.addListener('backButton', () => { moveAppToBackground(); });"
---

<!--
TEMPLATE — fill during project setup. Placeholders:
  {{ROOT_SCREENS}}       — screens acting as navigation "roots" per flow/role (e.g. entry screen, authenticated dashboard)
  {{ROLES}}              — roles/flows the app distinguishes (e.g. guest, admin)
  {{LINEAR_SCREENS}}      — screens with standard linear back-navigation, not guarded roots
  {{MODAL_LIST}}          — every modal that must intercept the back button
  {{TAB_GROUPS}}          — any tabbed screen where tab switches must not create history entries
  {{EXIT_TOAST_TEXT}}     — localized "press again to exit" text
  {{LOGIN_ROUTE}}         — login route, if any, to be wiped from history on success
Ask the user: "What screens act as navigation 'roots' per role/flow?" "List all modals that must intercept back-button." "Any tabbed views where tab switches shouldn't add history?"
-->

# Native Navigation & Back-Button Architecture (UX/Nav)
*Objective:* Control the native navigation ecosystem to ensure the hardware/gesture back-button mirrors the user's cognitive model. This layer prevents accidental app exits, eliminates navigation loops, and elegantly handles each distinct flow in this app.

**Key Focus Areas:**
- *Stack Hygiene:* Ensuring strict linear tracking and stripping historical screens (like a login modal) from the history stack once passed.

- *Double-Press to Exit:* Intercepting the root back-button event to show user feedback before sending the app to the background.

- *Modal Dismissal:* Back-button on an open modal closes the modal — it never navigates the underlying page.

- *Context-Aware Back Behavior:* Dynamic evaluation of the user's current route and authentication status before executing navigation.

## Core Principles

### 1. Root & Base Horizon
{{ROOT_SCREENS}} — each is a navigation root for its flow/role ({{ROLES}}). Pressing the native back button from a root screen must trigger the Double-Press Exit sequence (§3), never standard history popping.

- *Linear/Browsing Screens:* {{LINEAR_SCREENS}} — back button steps back one level through standard linear history, not a guarded root.

### 2. Modal & Sub-View Orchestration
- *Modal-First Dismissal:* Any open modal ({{MODAL_LIST}}) must intercept the back-button event and close itself first — it must never fall through to navigate the page underneath.

- *Tabbed View Handling:* Switching tabs within {{TAB_GROUPS}} must NOT push new history entries — back button from any tab returns to that view's root behavior (§1), not to a previously-viewed tab.

- *Sub-Selection as Overlay:* Any selection that opens a modal/overlay rather than a route change should have back-button close the modal and return to the underlying view exactly as it was, with no data loss on the in-progress view.

### 3. Double-Press Exit (Root Screens Only)
- *Toast Feedback Interception:* The first back-button press on a root screen must show a non-modal Toast: "{{EXIT_TOAST_TEXT}}".

- *Double-Press Background Escape:* If the user presses the native back button a second time within a 2-second threshold on a root screen, the app must gracefully execute `Move App to Background`.

- *The "Do Nothing" Prohibition:* Never ignore a native back-button press completely without visual feedback — a suppressed press with no toast/response creates a frozen UI perception.

### 4. Authentication-Driven Branching
- *Authenticated flow:* Back button from the authenticated root → root behavior (§1/§3). Back button from any authenticated sub-modal → close the modal, stay on the current screen.
- *Logged out (or session expired via a `401`):* Back button from `{{LOGIN_ROUTE}}` → the unauthenticated entry screen, not app exit.
- *Unauthenticated flow (if any role never logs in):* No auth branching needed — navigation is purely route-based (§1) plus modal dismissal (§2).

### 5. Memory Stack Safety
- *Destructive Navigation:* When a user successfully logs in, `replace`/stack-reset `{{LOGIN_ROUTE}}` out of history so the back button from the authenticated root never returns to the login screen.
- *Post-Action Confirmation:* After a significant one-shot user action completes (submission, booking, purchase), do not push a separate "confirmation" route that could be navigated back into inconsistently — close the relevant modal/overlay and reflect the new state in place.

## Implementation Checklist
- [ ] Root views handle exit/background routines instead of standard history popping.

- [ ] All modals intercept and consume the back-button event before it reaches page-level navigation.

- [ ] Tabbed-view tab switches do not create additional back-button history entries.

- [ ] Root screens implement the Double-Press to Background sequence with a localized Toast warning.

- [ ] The login route is wiped from history (`replace`) upon successful login.

- [ ] Back-button behavior is checked against auth state wherever flows could diverge.
