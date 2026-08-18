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
- **Modular Slices:** Each feature (`app`, `auth`, `service`, `booking`, `appointment`) must have its own dedicated slice file.
- **StateCreator Pattern:** Slices are defined as functions that receive `set` and `get`.
- **Atomic Updates:** Define clear, predictable actions within the slice to update the state.
- **No Direct Mutations:** Use Zustand's functional updates to ensure immutability.

# Responsibility & Logic Separation
**Global State (app.slice.ts):** Application-wide data (e.g., global `isLoading`, notifications, `isMenuOpen`).
**Feature State (<feature>.slice.ts):** Feature-specific business logic and data.

## Files Structure
frontend/src/store/
├── slices/
│   ├── app.slice.ts          # Global UI/App state (isLoading, toasts, isMenuOpen)
│   ├── auth.slice.ts         # Admin authentication state (JWT, loggedinUser)
│   ├── service.slice.ts      # Service list (public list + admin CRUD state)
│   ├── booking.slice.ts      # Current booking-flow selection: chosen service, chosen TimeSlot, hold state
│   ├── appointment.slice.ts  # Appointment records (customer confirmation view + admin dashboard list)
└── store.ts                   # Root Store (Unified Hook)

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

// Combined Type — add one member per feature slice (app, auth, service, booking, appointment)
export type RootState = AuthSlice & AppSlice & ServiceSlice & BookingSlice & AppointmentSlice

export const useStore = create<RootState>((...a) => ({
  ...createAuthSlice(...a),
  ...createAppSlice(...a),
}))

// Usage in components:
// const loggedinUser = useStore((state) => state.loggedinUser)
```

## Data Persistence
- Use `localStorage` for web and `Preferences` (Capacitor) for mobile.

- Auth Persistence: the auth token should be managed via `util.service.ts` and synced with `auth.slice.ts`.

- For global state persistence, use Zustand's `persist` middleware only where strictly necessary.

## High-Contention Slice — Single Source of Truth
`booking.slice.ts` (and, by extension, the `TimeSlot` data it references) is a slice with an extra rule: since a `TimeSlot`'s status can change from multiple directions at once (another customer's concurrent hold/booking attempt, or the hold timing out server-side), it must be kept as the single source of truth, not re-derived locally inside components that display it.
- Every service call that changes this state (success or conflict) must update the slice directly — components read from the slice, they never keep a parallel local copy of a `TimeSlot`'s status.
- On a `409` conflict response (the slot was already held/booked by someone else), re-sync the affected `TimeSlot` in the slice from the server's latest response rather than leaving stale local state, and clear any locally-held slot reference.

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

- *Backend Sync:* Pass fields through to services as-is if the backend's field casing already matches the frontend's convention — no transformation layer needed unless the contracts diverge.
- *Identity:* Every entity in state uses `id: string` (uuid) — never `_id`.
