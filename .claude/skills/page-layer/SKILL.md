---
name: page-layer-skill
description: Strict architectural guidelines for the Page Layer. Defines the responsibilities of "Smart Components" including API orchestration, authorization guards, and state management.
references:
  - @ui-component-layer/SKILL.md
  - @service-layer/SKILL.md
  - @state-management-layer/SKILL.md
---

# Page Layer Responsibilities
1. **Authorization & Guards**
- *Guarded pages:* `/admin` (Services management), `/admin/appointments` (Appointments dashboard) must verify the logged-in Admin from the store. Unauthorized access must trigger an immediate redirect to `/admin/login`.
- *Unguarded pages:* `/` (Service List), `/book/:serviceId` (Time Slot Picker + Customer Details Form), `/confirmation/:appointmentId`, `/admin/login` require no auth check at all. Do not add a logged-in-user check to these pages.
- Don't build speculative `isLock`/`isComingSoon` feature-flag gating for features that don't exist — every feature in the product spec should be available at launch unless the spec says otherwise.

2. **Data Orchestration (The "Smart" Hub)**
- *Centralized Fetching:* Primary API calls occur at the Page level. Child components should receive "finished" data as props.
- *Async Strategy:*
  - Use `useEffect` for initial mounting fetches.
  - The Time Slot Picker page fetches in two phases: the `Service` details first (renders immediately), then the open `TimeSlot`s for the selected date (secondary/live data) — so the page structure appears before slot availability loads.
- *Loading UI:* The Page controls global loading states (Overlays/Skeletons) via `app.slice`. Any live/real-time data is owned by its dedicated slice (see `@state-management-layer/SKILL.md`), not by page-local state.

3. **Event & Logic Handling**
- *Action Controller:* Define event handlers (e.g., `handleApprove`, `handleSelect`, `handleCancel`) within the Page and pass them down.
- *Computed State:* Perform data transformations (filtering, sorting, aggregations) before rendering children to keep child components "dumb" and presentational.
- *Navigation:* All `react-router` logic (`useNavigate`, `useParams`) resides exclusively in the Page layer.
- *Conflict Handling:* On a `409` from a `TimeSlot` hold attempt, the page-level handler re-syncs `timeSlot.slice.ts` from the response and shows a clear, hardcoded message ("That time slot was just taken").

4. **Layout & Accessibility**
- *Directional Integrity:* Every page root follows the active locale's direction (`rtl` for Hebrew, default; `ltr` for English) and proper text alignment — **except** the date/time-slot grid, which stays direction-independent (calendar/grid layouts read the same numeric order regardless of text direction; see `@ui-component-layer/SKILL.md`).
- *Responsive Shell:* Use a standardized container: `max-w-7xl mx-auto px-4 md:px-8 py-6 md:py-10`.
- *Standard Components:* Every Page must utilize `PageHeader` for consistent titling, with the title/subtitle passed as plain, hardcoded strings routed through the app's i18n layer (see `@ui-component-layer/SKILL.md`).

# Implementation Pattern
```typescript
// ExampleGuardedPage.tsx — example of an auth-guarded page
const ExampleGuardedPage = () => {
  // 1. Hooks & Store
  const navigate = useNavigate()
  const loggedinUser = useStore((state) => state.loggedinUser)
  const { data, isLoading, refresh } = useFetchList()

  // 2. Guard
  if (!loggedinUser) return <Navigate to="/login" />

  // 3. Logic
  const handleAction = async (payload) => {
    await exampleService.save(payload)
    refresh()
  }

  // 4. Render
  return (
    <main className="page-container animate-in fade-in">
      <PageHeader
        title="..."
        subtitle="..."
      />

      {isLoading ? (
        <SkeletonGrid />
      ) : (
        <PresentationalComponent
          items={data}
          onAction={handleAction}
        />
      )}
    </main>
  )
}
```

```typescript
// ExampleUnguardedPage.tsx — example of an unguarded public page
const ExampleUnguardedPage = () => {
  const { id } = useParams()
  const { item, isLoading } = useFetchItem(id)

  const handleRequest = async (payload) => {
    try {
      await exampleService.request(id, payload)
    } catch (err) {
      if (err.response?.status === 409) {
        toast.error('...')
        refresh() // re-sync the relevant slice from the server
      } else {
        toast.error('...')
      }
    }
  }

  return (
    <main className="page-container">
      <PageHeader title="..." />
      {isLoading ? <SkeletonGrid /> : <ItemView item={item} onSelect={handleRequest} />}
    </main>
  )
}
```

# Business Rules
- *Naming:* Files must use `PascalCase` and end with `Page.tsx`.

- *No Direct CSS:* All styling must be handled via Tailwind classes or the `cn` utility.

- *Separation of Concerns:* A Page should never contain complex UI internals (like SVG paths, complex grid markup, or raw HTML tables); these belong in the `ui-component-layer`.
