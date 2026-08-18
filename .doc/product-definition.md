# Product Definition

## Purpose
Define shared product intent so planning, architecture, and delivery stay aligned.

---

## Product Vision
ClinicBook removes the manual back-and-forth of booking an appointment at a small clinic or salon. Instead of phone calls and a paper diary, the business owner (Admin) lists their services with duration and price, and customers browse those services, pick an open time slot, and confirm their own appointment in a few taps — no account, no login. The Admin reviews, approves, or cancels appointments from a single dashboard.

---

## Target Users

### Admin (primary)
The business owner or staff member who runs the clinic/salon day to day. They manage the service catalog (name, duration, price), see which time slots are open or booked, and review, approve, or cancel appointments. Their core need is to spend less time on scheduling admin and avoid double-bookings.

### Customer (secondary)
A guest, unauthenticated visitor who wants to book an appointment without creating an account. They browse available services, pick a date and time slot, fill in their contact details, and receive a confirmation. Their core need is a fast, frictionless booking flow that works in Hebrew or English, on phone or desktop.

---

## Problem Statement
Without ClinicBook, a small clinic or salon relies on phone calls, texts, or a paper/whiteboard diary to track appointments. This is error-prone — double-bookings happen when two customers are offered the same slot, the owner has no live view of the day's schedule, and customers can't self-serve outside business hours. ClinicBook resolves both sides: customers get a live, always-available view of open slots and can book directly; the admin gets a single source of truth for the schedule with no double-booking risk, since the system — not a person — arbitrates who gets a contested time slot.

---

## Value Proposition
ClinicBook gives a small business owner a booking system without the overhead of a general-purpose scheduling platform: it's scoped tightly to one business, one calendar, one set of services, and one admin. The customer-facing flow requires no signup, so nothing stands between a customer and confirming a booking.

**Key differentiators:**
- No customer account required — guest booking end to end
- Slot-level concurrency control — two customers can never both book the same time slot
- Bilingual, RTL-first UI (Hebrew primary, English secondary)
- Works as a web app and as a native Android/iOS app from the same codebase

---

## Product Scope

**In scope:**
- Service catalog management (create/edit/deactivate a Service: name, duration, price) — `catalog-service`
- Time slot generation/management tied to services and admin availability — `appointment-service`
- Customer-facing service browsing and slot picker (guest, no login)
- Customer appointment booking flow: pick service → pick slot → enter details (name, phone, email) → confirm
- Booking confirmation screen/message for the customer
- Admin authentication (login only, single Admin role) — `user-management-service`
- Admin dashboard: view all appointments (upcoming/past), approve, cancel
- Slot-concurrency protection so two customers cannot claim the same time slot
- Hebrew (primary, RTL) + English (secondary, LTR) bilingual UI
- Native app packaging (Capacitor/Android/iOS) alongside the web app

**Out of scope (v1):**
- Customer accounts/login/booking history (guest-only; deferred — no proven need yet)
- Multi-tier admin roles or staff permissions (deferred — single business owner role is enough for v1)
- Payments/deposits at booking time (deferred — payment collected in person)
- SMS/email reminder automation (deferred — nice-to-have, not core to booking)
- Multi-location/multi-branch support (never for v1 — this is a single-location product)
- Recurring/repeat appointments (deferred — one-off bookings only for v1)

---

## Success Metrics

**Business metrics:**
- Reduction in double-booking incidents reported by the admin (target: zero)
- Share of appointments booked without any phone/manual intervention

**Product metrics:**
- Time from "customer opens booking flow" to "confirmation shown" (target: under 2 minutes)
- Slot-booking conflict rate (two customers racing the same slot) resolved correctly by the system
- Admin dashboard load-to-actionable time (time to see and act on a pending appointment)

*Baseline values to be defined after first real usage.*

---

## Constraints and Assumptions

**Constraints:**
- Customers must never be required to create an account or log in to book
- Only one time slot booking may ever succeed per contested slot — the system must guarantee this even under simultaneous requests
- Admin auth is JWT-based and gateway-centralized; downstream services must not be reachable directly from the internet in production

**Assumptions to validate:**
- A single admin/business-owner role is sufficient — no need for multiple staff logins in v1
- Appointment volume is low enough (single clinic/salon) that a simple slot-locking strategy is sufficient without a queueing system
- Hebrew RTL is the primary experience; English is secondary but must not be an afterthought in layout
- Customers primarily book from mobile devices (native app or mobile web), so mobile-first flows take priority

---

## Prioritization Rules
- Reduce manual scheduling workload for the Admin over adding cosmetic features
- Protect the core booking flow's speed and reliability above all secondary features
- Defer anything speculative (payments, reminders, multi-location) until the core flow is proven
- Avoid premature complexity — one admin role, one location, guest-only customers, until real usage proves otherwise

---

## Update Triggers
Revisit this file when: a new user segment is introduced (e.g. customer accounts), the scope changes (e.g. payments added), a success metric is redefined, a new platform target is added, or the admin role model changes (e.g. multi-staff support).
