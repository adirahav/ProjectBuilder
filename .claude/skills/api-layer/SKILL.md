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

**Protocol:** All frontend services must strictly follow the OpenAPI specifications located in `docs/api-contract/` (one YAML file per backend service — the frontend only ever calls `api-gateway`; `appointment-service`, `catalog-service`, and `user-management-service` are internal and never called directly).

**Service Layer:** Use Axios for all HTTP requests. Create a dedicated service file per domain (`service.service.ts`, `appointment.service.ts`, `timeSlot.service.ts`, `auth.service.ts`), calling through `http.service.ts` — never call Axios or the API directly from a component or another service.

**Data Handling:** Replace all "Dummy/Mock" data with real async fetch calls. Ensure proper error handling for 4xx and 5xx status codes based on the OpenAPI error schemas — including the `409 Conflict` case when a `TimeSlot` is no longer available.

**Typing:** Always create TypeScript interfaces in `frontend/src/types/<domain>.types.ts` that match the schemas defined in the OpenAPI spec. Do not create a `models/` directory. Follow this project's identity-field convention consistently: `id` (a uuid string), never `_id`.

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

**Token storage:** the admin auth token is persisted via `localStorage` on web and `@capacitor/preferences` on the native Android/iOS build — never `sessionStorage`. Every customer-facing request (service listing, time-slot listing, booking) carries no token at all — there is no customer session to attach.

```typescript
import axios from 'axios'
import { Preferences } from '@capacitor/preferences'
import { Capacitor } from '@capacitor/core'

const BASE_URL = import.meta.env.VITE_API_GATEWAY_URL // all frontend calls go through api-gateway, never a downstream service directly

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
- `http.service.ts` (or the calling service/hook) must never let a raw `error.message`/response body reach the UI. Map every user-facing error to a clear, hardcoded message in the active language before showing it in a toast — see the bilingual phrase-dictionary layer in `ui-component-layer` skill.
- Treat `409 Conflict` (a `TimeSlot` was booked/blocked by someone else between selection and submit) as its own case — not a generic failure — and surface a specific, actionable message ("That time slot was just taken — pick another"), then refresh the relevant view.
