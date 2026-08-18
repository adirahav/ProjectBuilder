# Error Handling Rules

## Purpose
- Define consistent patterns for detecting, classifying, logging, and displaying errors in the Dog Grooming Appointment Booking System frontend.

## Core Principles
- Fail fast on invalid input (validate before calling the API).
- Show safe, actionable messages to the user — never raw API/error payloads.
- Keep internal details (stack traces, raw response bodies) in logs, not in the UI.

## Error Categories
- Validation errors — **displayed inline (red text under the field), never via toast**
  - Input is missing, malformed, or out of allowed range (caught client-side before the API call).
- API/response errors — **displayed via toast (`sonner`)**
  - The API returns a non-2xx status or an error payload from a backend service.
- Network/infrastructure errors — **displayed via toast**
  - Request timeout, offline, DNS/connection failure.
- Authorization and authentication errors — **displayed via toast** (except the 401 global-redirect flow, which doesn't need a toast at all — see below)
  - Missing/expired Admin token, 401/403 from a protected route.
- Conflict errors (domain-specific) — **displayed via toast**
  - A hold/booking action on `TimeSlot` targets a slot that's no longer `open` (someone else claimed it first, HTTP 409). Treat this as a distinct, expected case — not a generic API error — since it happens in normal concurrent use.

## Consuming API Errors
- Never surface the raw `error.message`/status body from the API directly to the user; map it to a clear, hardcoded message (Hebrew/English strings via the app's i18n layer — see `ui-component-layer`).
- Treat `401` as session expiry, not a generic error — handled globally (see below), not per-call.
- Treat a `409` conflict response (slot no longer `open`) as its own case: show a clear, specific message ("This time slot was just taken — please pick another") and refresh the affected TimeSlot list, rather than a generic error toast.
- Never log or display secrets, tokens, or raw provider payloads.

## Frontend and UX Rules
- Never let raw errors reach the UI; always catch at the call site (page/hook) and translate to a clear, hardcoded message (localized per the app's i18n strategy).
- Use `sonner` (`toast.success(...)` / `toast.error(...)`) for submit-level success/failure feedback. A single toaster is mounted once at the app root (`frontend/src/App.tsx`) — do not render additional toaster instances per page.
- **Client-side validation errors never use toast.** Show them as red inline text directly beneath the relevant field, driven by local `useState` field-level `error` state — never a toast for a validation failure the client itself caught before calling the API.
- **Toast is reserved for server/API outcomes only** — anything that required a network round-trip to know. If the client can determine the problem without calling the server, it's a validation error and must render inline, not as a toast.
- Wrap async operations in the standard pattern: `setIsLoading(true) → try { await service.call(); toast.success('...') } catch { toast.error('...') } finally { setIsLoading(false) }` — replace the example strings with the specific, hardcoded message for that action. This pattern is for the server-error path only; run client-side validation *before* this block and short-circuit with the inline red-text error if it fails.
- For any hold/book/cancel action on `TimeSlot`/`Appointment`, re-fetch or re-sync the affected view after both success and conflict failure, so the UI never shows stale state.
- Do not add local try/catch in service functions unless the failure must be handled differently there. By default let errors propagate from services to the calling page/hook.
- Log all caught errors with a tagged `console.log('[TAG] message')` so they're captured by a central logger utility. Never log raw tokens, passwords, or full response bodies.
- `http.service.ts` already handles session expiry globally (401 → clear auth state, redirect to Admin Login). Do not duplicate 401 handling in individual services or pages.
- If there is no global React error boundary yet, treat this as a known gap; if adding new top-level routes/pages, consider whether they need local safeguards until a boundary is introduced.

## Open Questions / TBD
- Confirm the exact HTTP status the backend returns for a `TimeSlot` hold conflict (409 assumed above) once `booking-service`'s `timeSlot.controller.ts` is implemented.
