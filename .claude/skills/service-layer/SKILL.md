---
name: service-layer
description: Use this skill when implementing business logic, managing data persistence, or creating reusable utility functions outside of React components.
references:
  - @api-layer/SKILL.md
  - @state-management-layer/SKILL.md
---

<!--
TEMPLATE — fill during project setup. Placeholders:
  {{BACKEND_SERVICES}}       — backend service(s) this frontend talks to
  {{DOMAIN_SERVICE_FILES}}   — list of *.service.ts files by domain
  {{EXAMPLE_ENTITY}}         — a representative CRUD entity for the code sample (e.g. Tour, Product, Order)
  {{CUSTOM_ACTION_SERVICE}}  — a service with custom (non-CRUD) actions, if any
  {{SPECIAL_ERROR_CODE}}     — a domain-specific conflict status code, if any
Ask the user: "List entities needing CRUD services vs. custom-action services."
-->

# Service Layer Guidelines
*Goal:* Centralize the application's core logic and data management to keep components "lean" and focused only on UI.

**Core Responsibilities:**
- *Data Persistence:* Managing how data is saved and retrieved (via {{BACKEND_SERVICES}}).

- *Business Logic:* Implementing data transformations and request/response shaping between the API and the UI.

- *Utility Functions:* Creating reusable helpers (dates, strings, etc.) that aren't tied to a specific UI.

## File Location
- Place services in `frontend/src/services/`
- Name files with `.service.ts` suffix (e.g., {{DOMAIN_SERVICE_FILES}})
- Create a corresponding `.test.ts` file for tests

## Service Pattern
Services are pure functions, not classes. Export named functions:

```typescript
// {{EXAMPLE_ENTITY}}.service.ts
import { httpService } from "./http.service"

const BASE_URL = '{{EXAMPLE_ENTITY_LOWER}}/'

export interface {{EXAMPLE_ENTITY}} {
    id?: string
    // ...domain fields...
    deletedAt?: string | null
    [key: string]: any
}

export const {{EXAMPLE_ENTITY_LOWER}}Service = {
    getList,
    getById,
    save,
    remove
}

async function getList(): Promise<{{EXAMPLE_ENTITY}}[]> {
    try {
        const items = await httpService.get<{{EXAMPLE_ENTITY}}[]>(BASE_URL)
        return items
    } catch (err) {
        console.error(`Had problems getting the list`)
        throw err
    }
}

async function getById(id: string): Promise<{{EXAMPLE_ENTITY}}> {
    try {
        const item = await httpService.get<{{EXAMPLE_ENTITY}}>(`${BASE_URL}${id}`)
        return item
    } catch (err) {
        console.error(`Had problems getting item ${id}`)
        throw err
    }
}

async function save(itemToSave: {{EXAMPLE_ENTITY}}): Promise<{{EXAMPLE_ENTITY}}> {
    const method: 'put' | 'post' = itemToSave.id ? 'put' : 'post'
    const endpoint = itemToSave.id ? `${BASE_URL}${itemToSave.id}` : BASE_URL

    const saved = await httpService[method]<{{EXAMPLE_ENTITY}}>(endpoint, itemToSave)
    return saved
}

async function remove(id: string): Promise<any> {
    // Soft-delete — sets deletedAt server-side, does not remove the document
    const result = await httpService.delete<any>(`${BASE_URL}${id}`)
    return result
}
```

`{{CUSTOM_ACTION_SERVICE}}` (if applicable) follows the same pattern for its own named actions rather than the generic `getList`/`save`/`remove` shape above — each is its own named function calling the corresponding endpoint (see the relevant API contract file), since custom actions aren't simple CRUD.

## Data Persistence
- Use `localStorage` for client-side persistence in web applications, and use the native `Preferences` API for mobile/native platforms.
- Always handle JSON parse errors gracefully
- Return empty arrays/objects as defaults, never undefined

## Utility Functions
`frontend/src/services/util.service.ts` is owned by `state-management-layer` (Capacitor-aware storage helpers: `saveToStorage`, `getFromStorage`). Do not redefine it here — see @state-management-layer/SKILL.md for the canonical signature.

Non-storage utilities (dates, strings, formatting) that aren't tied to state persistence can live in their own `*.service.ts` files under `frontend/src/services/`, following the same pure-function pattern as above.

## Testing Services
```typescript
// {{EXAMPLE_ENTITY}}.service.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { {{EXAMPLE_ENTITY_LOWER}}Service } from './{{EXAMPLE_ENTITY}}.service'

describe('{{EXAMPLE_ENTITY}} Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should fetch the list', async () => {
    const items = await {{EXAMPLE_ENTITY_LOWER}}Service.getList()
    expect(Array.isArray(items)).toBe(true)
  })
})
```

## Type Safety
- Define types in `frontend/src/types/<domain>.types.ts` per domain.
- Use strict typing for all function parameters and returns.
- Avoid `any` type — `[key: string]: any` is a placeholder for a rough draft only; replace it with explicit fields once the contract is finalized.

## API Endpoints Mapping
Frontend services never call the backend directly: always route through `http.service.ts`. Do not hardcode routes from memory; the endpoint contract is the source of truth and lives in `docs/api-contract/api-contract.<service-name>.yaml`. Read the relevant contract file before implementing a service function, and keep endpoint paths/methods in sync with it rather than duplicating a route list in this skill.

## Implementation Guidelines for the AI
Dynamic Parameters: Always use the `:id`-style naming convention in service calls to match the API contract's path parameters.

Middleware Awareness: Ensure `http.service.ts` includes the JWT token in the Authorization header for protected calls (see @api-layer/SKILL.md) — services don't attach it themselves.

Data Formatting:
- Pass fields through as-is (no casing transformation) if the backend already matches the frontend's naming convention.
- Any service exposed to a special-case conflict status ({{SPECIAL_ERROR_CODE}}) must surface it as a distinct case, not a generic error — let the caller (page/hook) show an actionable message and refresh. Never silently swallow or retry it inside the service.
