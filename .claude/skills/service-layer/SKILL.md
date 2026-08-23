---
name: service-layer
description: Use this skill when implementing business logic, managing data persistence, or creating reusable utility functions outside of React components.
references:
  - @api-layer/SKILL.md
  - @state-management-layer/SKILL.md
---

# Service Layer Guidelines
*Goal:* Centralize the application's core logic and data management to keep components "lean" and focused only on UI.

**Core Responsibilities:**
- *Data Persistence:* Managing how data is saved and retrieved (via `tour-service` and `user-management-service` — no gateway, each service file targets its owning service's base URL directly).

- *Business Logic:* Implementing data transformations and request/response shaping between the API and the UI.

- *Utility Functions:* Creating reusable helpers (dates, strings, etc.) that aren't tied to a specific UI.

## File Location
- Place services in `frontend/src/services/`
- Name files with `.service.ts` suffix: `tour.service.ts`, `bus.service.ts`, `busType.service.ts`, `seat.service.ts`, `auth.service.ts`, `manifest.service.ts`
- Create a corresponding `.test.ts` file for tests

## Service Pattern
Services are pure functions, not classes. Export named functions:

```typescript
// tour.service.ts
import { tourHttpService } from "./http.service"

const BASE_URL = 'tours/'

export interface Tour {
    id?: string
    name: string
    date: string
    description: string
    createdBy?: string
    deletedAt?: string | null
    [key: string]: any
}

export const tourService = {
    getList,
    getById,
    save,
    remove
}

async function getList(): Promise<Tour[]> {
    try {
        const items = await tourHttpService.get<Tour[]>(BASE_URL)
        return items
    } catch (err) {
        console.error(`Had problems getting the list`)
        throw err
    }
}

async function getById(id: string): Promise<Tour> {
    try {
        const item = await tourHttpService.get<Tour>(`${BASE_URL}${id}`)
        return item
    } catch (err) {
        console.error(`Had problems getting item ${id}`)
        throw err
    }
}

async function save(itemToSave: Tour): Promise<Tour> {
    const method: 'put' | 'post' = itemToSave.id ? 'put' : 'post'
    const endpoint = itemToSave.id ? `${BASE_URL}${itemToSave.id}` : BASE_URL

    const saved = await tourHttpService[method]<Tour>(endpoint, itemToSave)
    return saved
}

async function remove(id: string): Promise<any> {
    // Soft-delete — sets deletedAt server-side, does not remove the document
    const result = await tourHttpService.delete<any>(`${BASE_URL}${id}`)
    return result
}
```

`bus.service.ts` and `busType.service.ts` follow the identical CRUD shape (both against `tour-service`, both using `tourHttpService`) — `bus.service.ts`'s `remove` is soft-delete like `tour.service.ts`; `busType.service.ts`'s `remove` is a real hard delete (see `mongoose-models-layer`), plus its own named actions `duplicate(id)` and `resetToDefault(id)`.

`seat.service.ts` is a custom-action service, not CRUD — it has no `save`/`remove`, only named actions matching the six seat routes, each calling `tourHttpService` directly:

```typescript
// seat.service.ts
import { tourHttpService } from "./http.service"

export const seatService = {
    getSeatMap,
    request,
    approve,
    cancel,
    toggleReserve,
    manualAssign,
    swapMove,
}

async function getSeatMap(busId: string): Promise<Seat[]> {
    return tourHttpService.get<Seat[]>(`buses/${busId}/seats`)
}

async function request(payload: { seatId: string; name: string; phone: string; pickupPointName: string }): Promise<Seat> {
    return tourHttpService.post<Seat>('seats/bookings', payload)
}

async function approve(seatId: string): Promise<Seat> {
    return tourHttpService.post<Seat>('seats/approve', { seatId })
}

async function cancel(seatId: string): Promise<Seat> {
    return tourHttpService.post<Seat>('seats/cancel', { seatId })
}

async function toggleReserve(seatId: string): Promise<Seat> {
    return tourHttpService.post<Seat>('seats/toggle-reserve', { seatId })
}

async function manualAssign(payload: { seatId: string; name: string; phone: string; pickupPointName: string }): Promise<Seat> {
    return tourHttpService.post<Seat>('seats/manual-assign', payload)
}

async function swapMove(payload: { fromSeatId: string; toSeatId: string }): Promise<Seat[]> {
    return tourHttpService.post<Seat[]>('seats/swap-move', payload)
}
```

`auth.service.ts` (against `user-management-service`, using `userHttpService`) follows the same named-action pattern: `login`, `signup`, `promote(adminId)` (calls `PATCH /api/admins/:id/roles`).

`manifest.service.ts` is a single read-only function against `tour-service`: `getManifest(busId)` → `GET /api/buses/:busId/manifest`.

## Data Persistence
- Use `localStorage` for client-side persistence in web applications, and use the native `Preferences` API for mobile/native platforms.
- Always handle JSON parse errors gracefully
- Return empty arrays/objects as defaults, never undefined

## Utility Functions
`frontend/src/services/util.service.ts` is owned by `state-management-layer` (Capacitor-aware storage helpers: `saveToStorage`, `getFromStorage`). Do not redefine it here — see @state-management-layer/SKILL.md for the canonical signature.

Non-storage utilities (dates, strings, formatting, e.g. clipboard-formatting the manifest report for the "Copy report" button) that aren't tied to state persistence can live in their own `*.service.ts` files under `frontend/src/services/`, following the same pure-function pattern as above.

## Testing Services
```typescript
// tour.service.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { tourService } from './tour.service'

describe('Tour Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should fetch the list', async () => {
    const items = await tourService.getList()
    expect(Array.isArray(items)).toBe(true)
  })
})
```

## Type Safety
- Define types in `frontend/src/types/<domain>.types.ts` per domain (`tour.types.ts`, `bus.types.ts`, `busType.types.ts`, `seat.types.ts`, `admin.types.ts`).
- Use strict typing for all function parameters and returns.
- Avoid `any` type — `[key: string]: any` is a placeholder for a rough draft only; replace it with explicit fields once the contract is finalized.

## API Endpoints Mapping
Frontend services never call the backend directly: always route through `http.service.ts`. Do not hardcode routes from memory; the endpoint contract is the source of truth and lives in `docs/api-contract/api-contract.<service-name>.yaml`. Read the relevant contract file before implementing a service function, and keep endpoint paths/methods in sync with it rather than duplicating a route list in this skill.

## Implementation Guidelines for the AI
Dynamic Parameters: Always use the `:id`-style naming convention in service calls to match the API contract's path parameters (e.g. `:busId` in `buses/:busId/seats`).

Middleware Awareness: Ensure `http.service.ts` includes the JWT token in the Authorization header for protected calls (see @api-layer/SKILL.md) — services don't attach it themselves. `seat.service.ts`'s passenger-facing calls (`getSeatMap`, `request`) intentionally carry no token — passengers are never authenticated.

Data Formatting:
- Pass fields through as-is (no casing transformation) — the backend already uses camelCase matching the frontend's convention.
- Any seat-mutation service function exposed to the `409` conflict status must surface it as a distinct case, not a generic error — let the caller (page/hook) show an actionable message and refresh the seat map. Never silently swallow or retry it inside the service.
