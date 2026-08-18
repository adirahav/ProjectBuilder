# Product Definition

## Purpose
Define shared product intent so planning, architecture, and delivery stay aligned.

---

## Product Vision
This product removes the manual work of booking appointments at a small dog grooming clinic. Instead of the owner tracking availability and appointments by phone, notebook, or spreadsheet, the clinic sets up its services (haircut, nail trim, spa, etc.) with duration and price, and customers browse those services, pick an open time slot, and book their own appointment — the owner manages, confirms, and cancels appointments from an admin dashboard.

---

## Target Users

**Customers (primary)** — dog owners who want to book a grooming appointment quickly, without calling or waiting for a reply. They want to see what services are offered, what they cost, what's actually available, and get a confirmed booking in a few taps — as a guest, with no account required.

**Admin / business owner (primary)** — the clinic owner who runs day-to-day operations: defining which services are offered, seeing the day's/week's appointments at a glance, and confirming or cancelling bookings. They want to stop juggling phone calls and manually tracking a paper or spreadsheet calendar.

---

## Problem Statement
Today, booking a grooming appointment at a small clinic means calling or messaging the owner, waiting for a reply, and hoping the desired time is actually free — the owner has no live view of demand and often double-books or has to manually track everything by hand. Customers get no self-service visibility into availability, and the owner loses time re-answering the same "are you free at X" question over and over. This product gives customers a live, self-service view of real availability and gives the owner a single dashboard to manage services and appointments without manual coordination.

---

## Value Proposition
The core value is turning appointment booking from a back-and-forth conversation into a two-minute self-service flow, while giving the owner full visibility and control without extra admin overhead.

**Key differentiators:**
- Customers see real-time slot availability instead of guessing or waiting for a reply.
- No account/signup required to book — low friction for a small local business's customer base.
- Owner manages services (name, duration, price) and appointments from one dashboard, no external tools.
- Built-in protection against double-booking the same time slot, even under concurrent requests.

---

## Product Scope

**In scope:**
- Public service list with duration and price (see `naming-rules`, `mongoose-models-layer`)
- Date/time slot picker showing real availability (`seat-concurrency-layer`, adapted for TimeSlot)
- Guest booking flow: pick service → pick slot → enter customer details → confirm
- Concurrency-safe slot reservation so two customers can't book the same slot (`seat-concurrency-layer`)
- Admin authentication (`jwt-middleware-layer`, `app-layer`)
- Admin dashboard: manage services (create/edit/deactivate), view appointments, confirm/cancel
- Hebrew + English UI with RTL/LTR support (`css-layer`, `accessibility-layer`)
- Native app shell (Capacitor/Android/iOS) alongside web (`native-navigation-layer`)

**Out of scope (v1):**
- Customer accounts/login/booking history (deferred — guest-only for v1, keeps friction low)
- Online payments (deferred — payment happens in person at the clinic)
- SMS/email appointment reminders (deferred — nice-to-have, not core to booking)
- Multi-staff/multi-groomer scheduling (deferred — single clinic, single implicit "resource" per slot for v1)
- Recurring/repeat appointments (deferred — one-off bookings only for v1)
- Customer-initiated rescheduling or cancellation (deferred — customer contacts the clinic directly for changes in v1)

---

## Success Metrics

**Business metrics:**
- Reduction in phone/message-based booking inquiries the owner has to personally handle
- Growth in appointments booked per week through the app vs. manual channels

**Product metrics:**
- Booking completion rate (started booking flow → confirmed appointment)
- Slot-conflict rate (attempted bookings that hit an already-taken slot)
- Time-to-book (service selection to confirmation)

*Baseline values to be defined after first real usage.*

---

## Constraints and Assumptions

**Constraints:**
- A TimeSlot can be held by at most one confirmed Appointment at a time — no double-booking, even under concurrent requests.
- Customers can book as guests; no authentication required for the booking flow.
- Only the admin role can manage services or confirm/cancel appointments — enforced server-side, not just hidden in the UI.

**Assumptions to validate:**
- Single clinic, single implicit resource per time slot is sufficient (no per-groomer/per-station scheduling needed yet)
- Guest-only booking (no accounts) doesn't create a spam/no-show problem serious enough to need accounts in v1
- Phone number collected at booking is enough to identify/contact a customer (no email required)
- Slot granularity (e.g. 30 vs. 60 minutes) is decided at setup and rarely changes

---

## Prioritization Rules

- Reduce the owner's manual coordination work over adding customer-facing bells and whistles.
- Lower friction on the core booking flow (service → slot → confirm) before anything adjacent.
- Defer speculative scope (payments, reminders, multi-staff) until the core flow is proven.
- Avoid premature complexity — one clinic, one resource per slot, until real usage shows otherwise.

---

## Update Triggers
Revisit this file when: a new user segment is added (e.g. customer accounts, multiple staff/groomers), the in-scope/out-of-scope list changes, success metrics are revised with real baseline data, or a new platform target is added beyond web + native.
