# Product Definition

## Purpose
Define shared product intent so planning, architecture, and delivery stay aligned.

---

## Product Vision
This product removes the manual work of managing appointments for a small clinic/salon business by phone or WhatsApp. Instead of the business owner juggling calls and messages to track who's booked for what, customers browse services and available time slots themselves and book directly — the owner manages services, confirms/cancels/reschedules appointments, and sees the full schedule from a single admin dashboard.

---

## Target Users

**Admin (business owner)** — primary user. Runs the business day to day: defines the service catalog (name, duration, price), reviews incoming appointments, and approves, cancels, or reschedules them. Wants a single place to see the full schedule instead of tracking it across phone calls and messages.

**Customers (anonymous)** — secondary users. Want to see what services are offered, find an open time that works for them, and book it themselves without creating an account — just a name and phone/email at booking time.

---

## Problem Statement
Without this product, a small clinic or salon owner manages appointments manually — by phone or WhatsApp — which means constantly checking availability by memory or a paper/spreadsheet log, double-booking risk when two customers reach out around the same time, and no self-service option for customers who want to book outside business hours. Customers have no visibility into real availability and have to wait for a reply to know if a time is even open. This product gives customers a live view of open time slots and self-service booking, while giving the owner one dashboard to manage the service catalog and every appointment's status.

---

## Value Proposition
The system combines the reach of manual channels (phone/WhatsApp) with the reliability of a real booking system, giving the owner one central place to run both services and appointments — rather than splitting attention between a messaging app and a mental (or paper) schedule.

**Key differentiators:**
- Customers can book any time, 24/7, without waiting for the owner to reply.
- A given time slot can only ever be claimed by one customer — no double-booking, even under concurrent requests.
- Automatic confirmations and reminders (SMS/email) reduce no-shows without manual follow-up.
- One admin dashboard replaces juggling a phone, a messaging app, and a paper/spreadsheet schedule.

---

## Product Scope

**In scope:**
- Customer-facing service catalog browsing (name, duration, price) — see `.doc/glossary.md`, `app-layer`
- Customer-facing available date/time browsing per service — `seat-concurrency-layer` (TimeSlot contention)
- Customer booking flow: pick a slot, submit name + phone/email, confirm — `page-layer`, `service-layer`
- Automatic booking confirmation via SMS/email
- Automatic appointment reminder via SMS/email ahead of the appointment time
- Admin service catalog management (create/edit/deactivate a Service) — `agents/backend/CLAUDE.md` (admin-service)
- Admin appointment management: view all appointments, approve, cancel, reschedule — `agents/backend/CLAUDE.md` (admin-service)
- Concurrency-safe TimeSlot claiming so two customers can't book the same slot — `seat-concurrency-layer`

**Out of scope (v1):**
- Customer accounts/login — deferred; anonymous booking only for v1
- Online payment at booking time — deferred; payment happens in person
- Multi-business / multi-location support — deferred; v1 is single-business
- Native mobile app — deferred; web only per Part 1
- Multi-language / translation — deferred; Hebrew-only for v1
- Staff/employee-level scheduling (multiple staff per service) — deferred; v1 has one shared schedule

---

## Success Metrics

**Business metrics:**
- Reduction in appointments booked/managed manually by phone or WhatsApp
- Reduction in no-show rate, attributable to automatic reminders

**Product metrics:**
- Share of appointments booked without any owner interaction (self-service rate)
- Time from opening the booking page to a confirmed appointment
- Rate of failed/blocked double-booking attempts on the same TimeSlot (concurrency correctness signal)

*Baseline values to be defined after first real usage.*

---

## Constraints and Assumptions

**Constraints:**
- No customer account/login required to book — only name + phone/email captured at booking time
- Appointments are not auto-approved by default — the admin can configure a slot/service as "auto-confirm" or leave it "requires admin approval"
- A TimeSlot must never be double-booked, even when two customers submit at the same instant

**Assumptions to validate:**
- Customers are comfortable providing phone/email without creating an account
- A single shared schedule (no per-staff-member calendars) is sufficient for v1's target businesses
- SMS/email delivery is reliable enough to be the primary confirmation/reminder channel
- Business hours and slot granularity (e.g. 15/30/60 min) are configured by the admin, not hardcoded

---

## Prioritization Rules
- Reducing the owner's manual scheduling workload wins over polish elsewhere.
- Lowering friction on the core booking flow (browse → pick slot → confirm) wins over secondary admin conveniences.
- Concurrency correctness on TimeSlot booking is never traded off for speed of delivery.
- Speculative scope (payments, multi-location, staff calendars) is deferred until v1's core flow is validated.

---

## Update Triggers
Revisit this file when: a new user role is introduced (e.g. staff accounts, multi-admin); the v1 scope changes (e.g. payments or multi-location moves in); a new contested/shared resource beyond TimeSlot appears; the platform target expands beyond web; or success metrics need real baselines once usage data exists.
