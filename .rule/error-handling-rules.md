# Error Handling Rules

## Purpose
- Define consistent patterns for detecting, classifying, logging, and displaying errors in the BookMe frontend.

## Core Principles
- Fail fast on invalid input (validate before calling the API).
- Show safe, actionable messages to the user — never raw API/error payloads.
- Keep internal details (stack traces, raw response bodies) in logs, not in the UI.

## Error Categories
- Validation errors — **displayed inline (red text under the field), never via `sonner`**
  - Input is missing, malformed, or out of allowed range (caught client-side before the API call) — e.g. Booking Form submitted without a name or without phone/email.
- API/response errors — **displayed via `sonner`**
  - The API returns a non-2xx status or an error payload from a backend service.
- Network/infrastructure errors — **displayed via `sonner`**
  - Request timeout, offline, DNS/connection failure.
- Authorization and authentication errors — **displayed via `sonner`** (except the 401 global-redirect flow, which doesn't need a toast at all — see below)
  - Missing/expired `admin` token, 401/403 from a protected route.
- Conflict errors (TimeSlot no longer available) — **displayed via `sonner`**
  - A customer's `hold`/`book` action on a `TimeSlot` targets a slot that's no longer `available` (already held/booked by another customer). Treat this as a distinct, expected case — not a generic API error — since it happens in normal concurrent use.

## Consuming API Errors
- Never surface the raw `error.message`/status body from the API directly to the user; map it to a clear, hardcoded Hebrew message (single-language for v1, no translation layer).
- Treat `401` as session expiry, not a generic error — handled globally (see below), not per-call.
- Treat a `409 Conflict` response from a `TimeSlot` hold/book attempt as its own case: show a clear, specific message ("התור הזה כבר נתפס — בחר/י שעה אחרת") and refresh the TimeSlot Picker, rather than a generic error toast.
- Never log or display secrets, tokens, or raw provider payloads.

## Frontend and UX Rules
- Never let raw errors reach the UI; always catch at the call site (page/hook) and translate to a clear, hardcoded Hebrew message.
- Use `sonner` (`toast.success(...)` / `toast.error(...)`) for submit-level success/failure feedback. A single toaster is mounted once at the app root (`src/App.tsx`) — do not render additional toaster instances per page.
- **Client-side validation errors never use `sonner`.** Show them as red inline text directly beneath the relevant field, driven by local `useState` field-level `error` state — never a toast for a validation failure the client itself caught before calling the API.
- **`sonner` is reserved for server/API outcomes only** — anything that required a network round-trip to know. If the client can determine the problem without calling the server, it's a validation error and must render inline, not as a toast.
- Wrap async operations in the standard pattern: `setIsLoading(true) → try { await service.call(); toast.success('...') } catch { toast.error('...') } finally { setIsLoading(false) }` — replace the example strings with the specific, hardcoded message for that action. This pattern is for the server-error path only; run client-side validation *before* this block and short-circuit with the inline red-text error if it fails.
- For any `TimeSlot` hold/book/cancel/reschedule action, re-fetch or re-sync the affected view (TimeSlot Picker or Admin Appointments Dashboard) after both success and conflict failure, so the UI never shows stale slot state.
- Do not add local try/catch in service functions unless the failure must be handled differently there. By default let errors propagate from services to the calling page/hook.
- Log all caught errors with a tagged `console.log('[TAG] message')` so they're captured by a central logger utility. Never log raw tokens, passwords, or full response bodies.
- `http.service.ts` already handles session expiry globally (401 → clear auth state, redirect to Admin Login). Do not duplicate 401 handling in individual services or pages.
- If there is no global React error boundary yet, treat this as a known gap; if adding new top-level routes/pages, consider whether they need local safeguards until a boundary is introduced.

## Open Questions / TBD
- Confirm the backend consistently returns `409` for the TimeSlot-no-longer-available conflict case, so the frontend can branch on it correctly rather than treating it as a generic 4xx.
