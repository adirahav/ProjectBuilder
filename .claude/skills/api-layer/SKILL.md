---
name: api-layer
description: Use this skill when connecting frontend components to backend services, replacing mock data, or handling JWT authentication.
---

<!--
TEMPLATE — fill during project setup. Placeholders:
  {{BACKEND_SERVICES}}       — list of backend services (single monolith, or e.g. "user-management-service, tour-service")
  {{DOMAIN_SERVICES}}        — frontend service files per domain, e.g. auth.service.ts, order.service.ts
  {{ID_FIELD_CONVENTION}}    — "id (uuid), never _id" or whatever this project uses
  {{SPECIAL_ERROR_CODES}}    — any non-standard status codes needing special UI handling (e.g. a 409 conflict), if any
  {{UNAUTHENTICATED_ENDPOINTS}} — any endpoints/requests that carry no auth token, if any
Ask the user: "How many backend services, and what does each own?" "What are your main domain entities (for service file naming)?" "Any special error codes (like a 409 conflict) needing distinct UI handling?" "Are there any endpoints that intentionally carry no auth token?"
-->

# API Guidelines
*Goal:* Transform static/mock interfaces into functional, data-driven components whenever a feature requires real-world data or secure authentication.

**Core Responsibilities:**
- *Mock Replacement:* Replacing dummy data with real asynchronous API calls.

- *Authentication:* Implementing secure flows using JWT handling.

- *Standardization:* Establishing an HTTP layer based strictly on the OpenAPI specification.

## API Integration Standard

**Protocol:** All frontend services must strictly follow the OpenAPI specifications located in `docs/api-contract/` (one YAML file per backend service: {{BACKEND_SERVICES}}).

**Service Layer:** Use Axios for all HTTP requests. Create a dedicated service file per domain (e.g., {{DOMAIN_SERVICES}}), calling through `http.service.ts` — never call Axios or the API directly from a component or another service.

**Data Handling:** Replace all "Dummy/Mock" data with real async fetch calls. Ensure proper error handling for 4xx and 5xx status codes based on the OpenAPI error schemas — including any special-case codes: {{SPECIAL_ERROR_CODES}}.

**Typing:** Always create TypeScript interfaces in `frontend/src/types/<domain>.types.ts` that match the schemas defined in the OpenAPI spec. Do not create a `models/` directory. Follow this project's identity-field convention consistently: {{ID_FIELD_CONVENTION}}.

**JWT Handling:**
    - Use the `jwt-decode` library for parsing tokens.
    - Usage: `import { jwtDecode } from 'jwt-decode'`.
    - Always cast the decoded token to the relevant model, e.g., `jwtDecode<UserData>(token)`.

**Constraints & Guardrails**
Do not use the native `fetch` API. Always use the provided `http.service.ts`.

## Dependencies
Before implementing, ensure the following packages are installed:
- `axios` (for HTTP requests)
- `jwt-decode` (for parsing JWT tokens)

If missing, run:
`npm install axios jwt-decode`

## Implementation: http.service.ts
All API calls must use this centralized service to ensure consistent base URLs, token attachment, and error/session handling. It automatically attaches the JWT token to every outgoing request, and centrally handles session expiry (`401`) — no other file should duplicate either of these concerns.

**Token storage:** the auth token is persisted via `localStorage` on web and `@capacitor/preferences` on the native Android build (if this project targets native) — never `sessionStorage`. Unauthenticated requests (if any: {{UNAUTHENTICATED_ENDPOINTS}}) carry no token at all.

```typescript
import axios from 'axios'
import { Preferences } from '@capacitor/preferences'
import { Capacitor } from '@capacitor/core'

const BASE_URL = import.meta.env.VITE_API_URL // or the relevant VITE_*_API_URL for the service being called

const axiosInstance = axios.create({
    baseURL: BASE_URL,
})

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

// Authentication Headers Interceptor
axiosInstance.interceptors.request.use(async (config) => {
    const token = await getToken()
    if (token) {
        config.headers.Authorization = `Bearer ${token}`
    }
    return config
})

// Session Expiry Interceptor
axiosInstance.interceptors.response.use(
    (response) => response,
    async (error) => {
        if (error.response?.status === 401) {
            await clearToken()
            useStore.setState({ loggedinUser: null, token: null })
            window.location.href = '/login'
        }
        return Promise.reject(error)
    }
)

export const httpService = {
    async get<T>(endpoint: string): Promise<T> {
        const response = await axiosInstance.get(endpoint)
        return response.data
    },
    async post<T>(endpoint: string, data: any): Promise<T> {
        const response = await axiosInstance.post(endpoint, data)
        return response.data
    },
    async put<T>(endpoint: string, data: any): Promise<T> {
        const response = await axiosInstance.put(endpoint, data)
        return response.data
    },
    async delete<T>(endpoint: string): Promise<T> {
        const response = await axiosInstance.delete(endpoint)
        return response.data
    },
    async patch<T>(endpoint: string, data: any): Promise<T> {
        const response = await axiosInstance.patch(endpoint, data)
        return response.data
    }
}
```

**Authentication Headers:**
- Every request automatically includes the `Authorization` header if a token exists (web or native storage) — this is handled once, centrally, in the request interceptor above. Domain services never attach this header themselves.

**Session Expiry (401):**
- The response interceptor above is the single place `401` is handled: it clears the stored token, resets the relevant auth state, and redirects to `/login`. Domain services must not add their own `401` handling.

**Error Mapping (non-401 errors):**
- `http.service.ts` (or the calling service/hook) must never let a raw `error.message`/response body reach the UI. Map every user-facing error to a clear, hardcoded message before showing it in a toast (unless this project has a translation/phrase layer — see `ui-component-layer` skill).
- Treat any special-case status code ({{SPECIAL_ERROR_CODES}}) as its own case — not a generic failure — and surface a specific, actionable message, then refresh the relevant view.
