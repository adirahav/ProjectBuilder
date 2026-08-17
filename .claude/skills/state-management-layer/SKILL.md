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
- **Modular Slices:** Each feature (`auth`, `app`, `service`, `appointment`, `timeSlot`) must have its own dedicated slice file.
- **StateCreator Pattern:** Slices are defined as functions that receive `set` and `get`.
- **Atomic Updates:** Define clear, predictable actions within the slice to update the state.
- **No Direct Mutations:** Use Zustand's functional updates to ensure immutability.

# Responsibility & Logic Separation
**Global State (app.slice.ts):** Application-wide data (e.g., global `isLoading`, notifications, `isMenuOpen`).
**Feature State (<feature>.slice.ts):** Feature-specific business logic and data.

## Files Structure
frontend/src/store/
├── slices/
│   ├── app.slice.ts        # Global UI/App state
│   ├── auth.slice.ts       # Authentication state (admin session only)
│   ├── service.slice.ts    # Service catalog
│   ├── appointment.slice.ts # Appointment list/status (admin dashboard)
│   ├── timeSlot.slice.ts   # TimeSlot state — single source of truth, see below
└── store.ts                # Root Store (Unified Hook)

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

// Combined Type — one member per slice: auth, app, service, appointment, timeSlot
export type RootState = AuthSlice & AppSlice & ServiceSlice & AppointmentSlice & TimeSlotSlice

export const useStore = create<RootState>((...a) => ({
  ...createAuthSlice(...a),
  ...createAppSlice(...a),
  ...createServiceSlice(...a),
  ...createAppointmentSlice(...a),
  ...createTimeSlotSlice(...a),
}))

// Usage in components:
// const loggedinUser = useStore((state) => state.loggedinUser)
```

## Data Persistence
- Use `localStorage` — web only, no native target.

- Auth Persistence: the auth token should be managed via `util.service.ts` and synced with `auth.slice.ts`.

- For global state persistence, use Zustand's `persist` middleware only where strictly necessary.

## High-Contention Slice — Single Source of Truth
`timeSlot.slice.ts` is a slice with an extra rule: since `TimeSlot` state can change from multiple directions at once (another customer holding/booking it, a hold expiring, an admin cancelling/rescheduling), it must be kept as the single source of truth, not re-derived locally inside components that display it.
- Every service call that changes `TimeSlot` state (success or conflict) must update the slice directly — components (TimeSlot Picker, Admin Appointments Dashboard) read from the slice, they never keep a parallel local copy.
- On a `409` conflict response (slot no longer `available`), re-sync the affected `TimeSlot`(s) in the slice from the server's latest response rather than leaving stale local state.

## Utility Functions (frontend/src/services/util.service.ts)
Keep utilities pure.

```typescript
export const utilService = {
    async saveToStorage(key: string, value: any) {
        const strValue = JSON.stringify(value)
        localStorage.setItem(key, strValue)
    },
    async getFromStorage(key: string) {
        const value = localStorage.getItem(key)
        try { return value ? JSON.parse(value) : null } catch { return value }
    }
}
```

## Type Safety & Integration Rules
- *Typed Selectors:* Always use selectors to prevent unnecessary re-renders.

- *Naming Convention:* Slices should be named `create[Feature]Slice`.

- *Backend Sync:* Pass fields through to services as-is if the backend's field casing already matches the frontend's convention — no transformation layer needed unless the contracts diverge.
