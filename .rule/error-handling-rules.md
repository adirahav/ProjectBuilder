# Error Handling Rules

<!--
TEMPLATE — fill during project setup. Placeholders:
  {{PROJECT_NAME}}, {{PRIMARY_LANGUAGE}}, {{TOAST_LIBRARY}} (e.g. sonner), {{APP_ROOT_LAYOUT_FILE}}
  {{CONTESTED_ENTITY}}, {{SPECIAL_ERROR_CODE}} — a domain conflict status code, if applicable
  {{ROLE_NAME}} — the authenticated role, for the 401/session-expiry note
  {{I18N_STRATEGY}} — hardcoded strings vs. a phrase/translation layer
Ask the user: "What language should user-facing error messages be in?" "Is there a concurrency-conflict domain case needing a special error path?"
Delete this comment block once filled.
-->

## Purpose
- Define consistent patterns for detecting, classifying, logging, and displaying errors in the {{PROJECT_NAME}} frontend.

## Core Principles
- Fail fast on invalid input (validate before calling the API).
- Show safe, actionable messages to the user — never raw API/error payloads.
- Keep internal details (stack traces, raw response bodies) in logs, not in the UI.

## Error Categories
- Validation errors — **displayed inline (red text under the field), never via `{{TOAST_LIBRARY}}`**
  - Input is missing, malformed, or out of allowed range (caught client-side before the API call).
- API/response errors — **displayed via `{{TOAST_LIBRARY}}`**
  - The API returns a non-2xx status or an error payload from a backend service.
- Network/infrastructure errors — **displayed via `{{TOAST_LIBRARY}}`**
  - Request timeout, offline, DNS/connection failure.
- Authorization and authentication errors — **displayed via `{{TOAST_LIBRARY}}`** (except the 401 global-redirect flow, which doesn't need a toast at all — see below)
  - Missing/expired {{ROLE_NAME}} token, 401/403 from a protected route.
- Conflict errors (domain-specific, fill in if applicable) — **displayed via `{{TOAST_LIBRARY}}`**
  - An action on `{{CONTESTED_ENTITY}}` targets a resource that's no longer in the expected state. Treat this as a distinct, expected case — not a generic API error — since it happens in normal concurrent use.

## Consuming API Errors
- Never surface the raw `error.message`/status body from the API directly to the user; map it to a clear, hardcoded message ({{I18N_STRATEGY}}).
- Treat `401` as session expiry, not a generic error — handled globally (see below), not per-call.
- Treat a conflict response (e.g. `{{SPECIAL_ERROR_CODE}}`) as its own case: show a clear, specific message and refresh the affected view, rather than a generic error toast.
- Never log or display secrets, tokens, or raw provider payloads.

## Frontend and UX Rules
- Never let raw errors reach the UI; always catch at the call site (page/hook) and translate to a clear, hardcoded message ({{I18N_STRATEGY}}).
- Use `{{TOAST_LIBRARY}}` (`toast.success(...)` / `toast.error(...)`) for submit-level success/failure feedback. A single toaster is mounted once at the app root (`{{APP_ROOT_LAYOUT_FILE}}`) — do not render additional toaster instances per page.
- **Client-side validation errors never use `{{TOAST_LIBRARY}}`.** Show them as red inline text directly beneath the relevant field, driven by local `useState` field-level `error` state — never a toast for a validation failure the client itself caught before calling the API.
- **`{{TOAST_LIBRARY}}` is reserved for server/API outcomes only** — anything that required a network round-trip to know. If the client can determine the problem without calling the server, it's a validation error and must render inline, not as a toast.
- Wrap async operations in the standard pattern: `setIsLoading(true) → try { await service.call(); toast.success('...') } catch { toast.error('...') } finally { setIsLoading(false) }` — replace the example strings with the specific, hardcoded message for that action. This pattern is for the server-error path only; run client-side validation *before* this block and short-circuit with the inline red-text error if it fails.
- For any action on `{{CONTESTED_ENTITY}}`, re-fetch or re-sync the affected view after both success and conflict failure, so the UI never shows stale state.
- Do not add local try/catch in service functions unless the failure must be handled differently there. By default let errors propagate from services to the calling page/hook.
- Log all caught errors with a tagged `console.log('[TAG] message')` so they're captured by a central logger utility. Never log raw tokens, passwords, or full response bodies.
- `http.service.ts` already handles session expiry globally (401 → clear auth state, redirect to login). Do not duplicate 401 handling in individual services or pages.
- If there is no global React error boundary yet, treat this as a known gap; if adding new top-level routes/pages, consider whether they need local safeguards until a boundary is introduced.

## Open Questions / TBD
- Confirm the actual HTTP status the backend returns for the domain conflict case (`{{SPECIAL_ERROR_CODE}}` assumed above) so the frontend can branch on it correctly.
