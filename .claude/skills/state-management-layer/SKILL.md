---
name: state-management-layer
description: Global state architecture using Zustand with a sliced pattern. Handles modular state, hydration, and direct integration with services.
references:
  - @service-layer/SKILL.md
  - @api-layer/SKILL.md
---

# Zustand Slices Architecture Guidelines
*Goal:* Maintain a "Single Source of Truth" by organizing the application state into scalable, feature-based slices, combined into a unified store.

**Core Principles:**
- **Modular Slices:** Each feature (`auth`, `tour`, `bus`, `busType`, `seat`, `manifest`, `app`) must have its own dedicated slice file.
- **StateCreator Pattern:** Slices are defined as functions that receive `set` and `get`.
- **Atomic Updates:** Define clear, predictable actions within the slice to update the state.
- **No Direct Mutations:** Use Zustand's functional updates to ensure immutability.

# Responsibility & Logic Separation
**Global State (app.slice.ts):** Application-wide data (e.g., global `isLoading`, notifications, `isMenuOpen`).
**Feature State (<feature>.slice.ts):** Feature-specific business logic and data.

## Files Structure
frontend/src/store/
├── slices/
│   ├── app.slice.ts       # Global UI/App state
│   ├── auth.slice.ts      # Authentication state (loggedinUser: Admin | null, token)
│   ├── tour.slice.ts      # Tour list/selected tour
│   ├── bus.slice.ts       # Bus list/selected bus, pickupPoints
│   ├── busType.slice.ts   # Bus-type templates
│   ├── seat.slice.ts      # Live seat map — the high-contention slice, see below
│   ├── manifest.slice.ts  # Passenger manifest report (filtered/searched view)
└── store.ts               # Root Store (Unified Hook)

## Slice Pattern (The "Slices" Way)
A slice encapsulates the interface, initial state, and actions in a single functional creator.

```typescript
// frontend/src/store/slices/feature.slice.ts
import { StateCreator } from 'zustand'
import { RootState } from '../store'

export interface FeatureSlice {
  prop1: boolean
  setProp1: (val: boolean) => void
  resetFeature: () => void
}

export const createFeatureSlice: StateCreator<RootState, [], [], FeatureSlice> = (set, get) => ({
  // State
  prop1: false,

  // Actions
  setProp1: (val) => set({ prop1: val }),

  resetFeature: () => set({ prop1: false })
})
```

## Root Store Integration
```typescript
// frontend/src/store/store.ts
import { create } from 'zustand'
import { createAuthSlice, AuthSlice } from './slices/auth.slice'
import { createAppSlice, AppSlice } from './slices/app.slice'
import { createTourSlice, TourSlice } from './slices/tour.slice'
import { createBusSlice, BusSlice } from './slices/bus.slice'
import { createBusTypeSlice, BusTypeSlice } from './slices/busType.slice'
import { createSeatSlice, SeatSlice } from './slices/seat.slice'
import { createManifestSlice, ManifestSlice } from './slices/manifest.slice'

// Combined Type — one member per feature slice
export type RootState = AuthSlice & AppSlice & TourSlice & BusSlice & BusTypeSlice & SeatSlice & ManifestSlice

export const useStore = create<RootState>((...a) => ({
  ...createAuthSlice(...a),
  ...createAppSlice(...a),
  ...createTourSlice(...a),
  ...createBusSlice(...a),
  ...createBusTypeSlice(...a),
  ...createSeatSlice(...a),
  ...createManifestSlice(...a),
}))

// Usage in components:
// const loggedinUser = useStore((state) => state.loggedinUser)
```

## Data Persistence
- Use `localStorage` for web and `Preferences` (Capacitor) for mobile.

- Auth Persistence: the auth token should be managed via `util.service.ts` and synced with `auth.slice.ts`.

- For global state persistence, use Zustand's `persist` middleware only where strictly necessary.

## High-Contention Slice — Single Source of Truth
`seat.slice.ts` is the one slice with an extra rule: since the live seat map can change from multiple directions at once (a passenger's request, an admin's approve/cancel/toggle-reserve/manual-assign/swap-move, or another passenger racing for the same seat), it must be kept as the single source of truth, not re-derived locally inside components that display it — both the Passenger View's seat map and the Admin Dashboard's Seat Management tab read from the same slice.
- Every service call that changes seat state (success or `409` conflict) must update `seat.slice.ts` directly — components read from the slice, they never keep a parallel local copy.
- On a `409` conflict response, re-sync the affected seat(s) in `seat.slice.ts` from the server's latest response rather than leaving stale local state.

## Utility Functions (frontend/src/services/util.service.ts)
Keep utilities pure. Use Capacitor-aware storage helpers for cross-platform compatibility.

```typescript
import { Capacitor } from "@capacitor/core"
import { Preferences } from "@capacitor/preferences"

export const utilService = {
    async saveToStorage(key: string, value: any) {
        const strValue = JSON.stringify(value)
        if (Capacitor.isNativePlatform()) {
            await Preferences.set({ key, value: strValue })
        } else {
            localStorage.setItem(key, strValue)
        }
    },
    async getFromStorage(key: string) {
        let value
        if (Capacitor.isNativePlatform()) {
            const res = await Preferences.get({ key })
            value = res.value
        } else {
            value = localStorage.getItem(key)
        }
        try { return value ? JSON.parse(value) : null } catch { return value }
    }
}
```

## Type Safety & Integration Rules
- *Typed Selectors:* Always use selectors to prevent unnecessary re-renders.

- *Naming Convention:* Slices should be named `create[Feature]Slice`.

- *Backend Sync:* Pass fields through to services as-is — the backend's camelCase field naming already matches the frontend's convention, no transformation layer needed.
