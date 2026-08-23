# Product Definition

## Purpose
Define shared product intent so planning, architecture, and delivery stay aligned.

---

## Product Vision
Hila Tours removes the manual, error-prone work of assigning passengers to seats on tour buses. Instead of an admin tracking who sits where by hand (phone calls, spreadsheets, paper lists), the admin sets up a tour with its buses, seat layouts, and pickup points, and passengers browse the tour's live seat map and request their own seat directly. The admin reviews, approves, manually assigns, or reassigns seats from a single dashboard, with the server as the single source of truth for seat state at every step.

---

## Target Users

### Admins (primary)
Tour organizers who run one or more tours end-to-end: creating tours and buses, defining reusable bus-type seat-grid templates, approving or rejecting passenger seat requests, manually assigning or swapping seats when needed, and producing a passenger manifest for the day of the trip. Their core need is full control over seat allocation with minimal manual bookkeeping, plus a fast way to resolve conflicts and produce a shareable roster.

### Passengers (secondary)
Anonymous users who want to see a tour's bus and pick a seat themselves rather than calling the organizer. Their core need is a clear, real-time seat map (never a stale one) and confidence that once they request a seat, it's actually reserved for them, not silently double-booked.

---

## Problem Statement
Without this product, tour admins coordinate seating manually — over phone, WhatsApp, or spreadsheets — which does not scale past a handful of passengers and is highly error-prone when two people are assigned the same seat or an admin loses track of who has and hasn't confirmed. Passengers have no visibility into which seats are free and no way to act on that information themselves; they depend entirely on the admin being reachable. Hila Tours resolves both sides at once: passengers get a live, accurate seat map and self-service booking, while admins get a single dashboard to approve, override, and finalize seating without needing to track anything outside the system.

---

## Value Proposition
Hila Tours turns bus seating from a manual coordination problem into a self-service, real-time workflow the admin only has to supervise, not perform. Unlike a generic booking tool, it is purpose-built around the seat as a contested resource — every request is arbitrated server-side so two passengers can never be confirmed into the same seat, and the admin always retains full manual override.

**Key differentiators:**
- Real-time seat map with color *and* icon/label status (never color-only), so status is legible to everyone including colorblind users.
- Race-safe seat booking — concurrent requests for the same seat are resolved server-side; only one succeeds, the loser gets a conflict response with a refreshed map.
- Reusable bus-type templates mean a new bus can be created from a saved seat-grid layout instead of defined from scratch every time.
- One-click manifest export (copy to clipboard) for sharing the passenger list via WhatsApp or print, with no separate reporting tool needed.

---

## Product Scope

**In scope:**
- Gateway login screen: passenger entry vs. admin login (username/password → JWT) — see `app-layer`.
- Admin signup as a standalone page; new accounts always get `roles: ["user"]`, never `admin` automatically — see `.rule/database-rules.md`.
- Passenger tour/bus browsing and interactive seat map with accessible (non-color-only) status — see `ui-component-layer`, `accessibility-layer`.
- Passenger seat request modal (name, phone, pickup point) — seat moves to `pending`.
- Admin dashboard: seat management (approve/release/reserve/manual-assign/move/swap) — see `seat-concurrency-layer`.
- Admin dashboard: tour and bus CRUD with soft-delete, plus bus-type template management (create/duplicate/reset-to-default/delete, one default template) — see `database-rules`.
- Admin dashboard: passenger manifest report with status filter, free-text search, and copy-to-clipboard.
- Real-time seat-state sync without full page reloads.
- Native Android build via Capacitor, with JWT stored in `@capacitor/preferences` — see `native-navigation-layer`.
- Full RTL Hebrew layout and WCAG 2.1 AA accessibility (semantic HTML, full keyboard nav, focus states).

**Out of scope (v1):**
- Online payment — deferred; no payment processor integration planned for v1.
- Automatic SMS notifications — deferred; manual admin communication (phone/WhatsApp) suffices for v1 scale.
- Multi-language support — never for v1; Hebrew/RTL only by design.
- Per-tour admin ownership vs. a shared admin pool — open question, deferred until multi-org usage is validated.
- A distinct Passenger entity/account system — deferred; passenger identity intentionally lives on the seat record only.
- Automated waitlisting when a bus is full — deferred; admin handles overflow manually for v1.

---

## Success Metrics

**Business metrics:**
- Reduction in admin time spent per tour on manual seat coordination (phone calls, spreadsheet updates).
- Number of tours run through the system without a double-booking incident.

**Product metrics:**
- Seat request → resolution (approved/rejected) turnaround time.
- Conflict rate: percentage of seat requests that hit a concurrency conflict.
- Manifest export usage rate (copies-to-clipboard per tour).

*Baseline values to be defined after first real usage.*

---

## Constraints and Assumptions

**Constraints:**
- The server is the sole source of truth for seat state; the frontend never assumes a seat's status without confirming against the API.
- Every admin action (create/edit/delete/approve/cancel/reserve/assign/swap) requires a valid admin JWT.
- Tour and bus deletion is soft-delete only (`deletedAt`), never a physical row delete.

**Assumptions to validate:**
- Passengers have reliable enough connectivity during booking that a real-time (non-polling-heavy) sync approach is worthwhile.
- A single shared admin pool (rather than per-tour ownership) is acceptable at current scale — revisit if multiple independent organizers use the system concurrently.
- Manual admin approval of every seat request remains fast enough as tour volume grows; high volume may later require auto-approval rules.
- Hebrew-only, RTL-only is sufficient for the initial user base — revisit if non-Hebrew-speaking passengers become common.

---

## Prioritization Rules
- Reduce the admin's manual seating workload before adding new passenger-facing convenience features.
- Lower friction on the core booking flow (browse → pick seat → request → approved) before polishing secondary flows like the manifest report.
- Defer speculative scope (payments, SMS, multi-language, per-tour admin ownership) until the core flow is proven in real use.
- Avoid premature complexity — no feature should compromise the "server is the source of truth for seats" constraint for the sake of a faster-feeling UI.

---

## Update Triggers
Revisit this file when: a new user role is introduced (e.g. a distinct Passenger account system), the admin-ownership model changes (per-tour vs. shared pool), a new platform target is added (e.g. iOS), payment or SMS integration moves into scope, or success metrics are revised after real usage data exists.
