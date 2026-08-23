---
name: api-layer
description: Use this skill when connecting frontend components to backend services, replacing mock data, or handling JWT authentication.
---

# API Guidelines
*Goal:* Transform static/mock interfaces into functional, data-driven components whenever a feature requires real-world data or secure authentication.

**Core Responsibilities:**
- *Mock Replacement:* Replacing dummy data with real asynchronous API calls.

- *Authentication:* Implementing secure flows using JWT handling.

- *Standardization:* Establishing an HTTP layer based strictly on the OpenAPI specification.

## API Integration Standard

**Protocol:** All frontend services must strictly follow the OpenAPI specifications located in `docs/api-contract/` (one YAML file per backend service: `tour-service`, `user-management-service`).

**Service Layer:** Use Axios for all HTTP requests. Create a dedicated service file per domain (`tour.service.ts`, `bus.service.ts`, `busType.service.ts`, `seat.service.ts`, `auth.service.ts`), calling through `http.service.ts` — never call Axios or the API directly from a component or another service. Since there is no gateway, each domain service targets the correct backend base URL directly: `tour.service.ts`/`bus.service.ts`/`busType.service.ts`/`seat.service.ts` call `VITE_TOUR_SERVICE_API_URL` (tour-service); `auth.service.ts` calls `VITE_USER_SERVICE_API_URL` (user-management-service).

**Data Handling:** Replace all "Dummy/Mock" data with real async fetch calls. Ensure proper error handling for 4xx and 5xx status codes based on the OpenAPI error schemas — including the special-case code: `409` on `POST /api/seats/bookings` (and the other seat-mutation routes) when the seat's precondition no longer holds (lost the concurrency race) — the seat map must be refreshed from the server on this response, never retried silently.

**Typing:** Always create TypeScript interfaces in `frontend/src/types/<domain>.types.ts` that match the schemas defined in the OpenAPI spec. Do not create a `models/` directory. Follow this project's identity-field convention consistently: every entity exposes `id` (a `uuid` string) to the client, never `_id` (Mongo ObjectId) — see `.rule/database-rules.md`.

**JWT Handling:**
    - Use the `jwt-decode` library for parsing tokens.
    - Usage: `import { jwtDecode } from 'jwt-decode'`.
    - Always cast the decoded token to the relevant model, e.g., `jwtDecode<AdminTokenPayload>(token)` (`{ adminId, roles }` — see `jwt-middleware-layer`).

**Constraints & Guardrails**
Do not use the native `fetch` API. Always use the provided `http.service.ts`.

## Dependencies
Before implementing, ensure the following packages are installed:
- `axios` (for HTTP requests)
- `jwt-decode` (for parsing JWT tokens)

If missing, run:
`npm install axios jwt-decode`

## Implementation: http.service.ts
All API calls must use this centralized service to ensure consistent base URLs, token attachment, and error/session handling. It automatically attaches the JWT token to every outgoing request, and centrally handles session expiry (`401`) — no other file should duplicate either of these concerns. Since there is no gateway, this project actually needs **two** axios instances (or one factory parameterized by base URL) — one per backend service — sharing the same interceptor logic.

**Token storage:** the auth token is persisted via `localStorage` on web and `@capacitor/preferences` on the native Android build — never `sessionStorage`. Unauthenticated requests (the entire Passenger flow: `GET /api/buses/:busId/seats`, `POST /api/seats/bookings`) carry no token at all — passengers never authenticate.

```typescript
import axios from 'axios'
import { Preferences } from '@capacitor/preferences'
import { Capacitor } from '@capacitor/core'

// One instance per backend service — no gateway to front them
const tourServiceHttp = axios.create({ baseURL: import.meta.env.VITE_TOUR_SERVICE_API_URL })
const userServiceHttp = axios.create({ baseURL: import.meta.env.VITE_USER_SERVICE_API_URL })

async function getToken(): Promise<string | null> {
    if (Capacitor.isNativePlatform()) {
        const { value } = await Preferences.get({ key: 'authToken' })
        return value
    }
    return localStorage.getItem('authToken')
}

async function clearToken(): Promise<void> {
    if (Capacitor.isNativePlatform()) {
        await Preferences.remove({ key: 'authToken' })
    } else {
        localStorage.removeItem('authToken')
    }
}

function attachInterceptors(instance: ReturnType<typeof axios.create>) {
    instance.interceptors.request.use(async (config) => {
        const token = await getToken()
        if (token) {
            config.headers.Authorization = `Bearer ${token}`
        }
        return config
    })

    instance.interceptors.response.use(
        (response) => response,
        async (error) => {
            if (error.response?.status === 401) {
                await clearToken()
                useStore.setState({ loggedinUser: null, token: null })
                window.location.href = '/'
            }
            return Promise.reject(error)
        }
    )
}

attachInterceptors(tourServiceHttp)
attachInterceptors(userServiceHttp)

function buildHttpService(instance: ReturnType<typeof axios.create>) {
    return {
        async get<T>(endpoint: string): Promise<T> {
            const response = await instance.get(endpoint)
            return response.data
        },
        async post<T>(endpoint: string, data: any): Promise<T> {
            const response = await instance.post(endpoint, data)
            return response.data
        },
        async put<T>(endpoint: string, data: any): Promise<T> {
            const response = await instance.put(endpoint, data)
            return response.data
        },
        async delete<T>(endpoint: string): Promise<T> {
            const response = await instance.delete(endpoint)
            return response.data
        },
        async patch<T>(endpoint: string, data: any): Promise<T> {
            const response = await instance.patch(endpoint, data)
            return response.data
        }
    }
}

export const tourHttpService = buildHttpService(tourServiceHttp)
export const userHttpService = buildHttpService(userServiceHttp)
```

**Authentication Headers:**
- Every request automatically includes the `Authorization` header if a token exists (web or native storage) — this is handled once, centrally, in each instance's request interceptor above. Domain services never attach this header themselves.

**Session Expiry (401):**
- The response interceptor above is the single place `401` is handled: it clears the stored token, resets the relevant auth state, and redirects to `/` (the Gateway/Login screen). Domain services must not add their own `401` handling.

**Error Mapping (non-401 errors):**
- `http.service.ts` (or the calling service/hook) must never let a raw `error.message`/response body reach the UI. Map every user-facing error to a clear, hardcoded Hebrew message before showing it in a toast (no translation/phrase layer in this project — see `ui-component-layer` skill).
- Treat `409` (seat conflict) as its own case — not a generic failure — and surface a specific, actionable message ("that seat was just taken — pick another"), then refresh the relevant seat map from the server.
