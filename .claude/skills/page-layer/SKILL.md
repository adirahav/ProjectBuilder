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
- *Guarded pages:* `AdminDashboardPage` (`/admin`, three tabs — Seat Management, Tours & Buses, Passenger Manifest Report) must verify the logged-in admin's `roles` from the store include `admin`. Unauthorized access (no session) triggers an immediate redirect to `/` (Gateway/Login); a session with only `roles: ["user"]` still reaches the dashboard shell but every mutating action within it is rejected client-side (mirroring the server's `403`) with a clear message, per PRD NFR.
- *Unguarded pages:* `GatewayPage` (`/`, passenger-vs-admin login choice + admin login modal), `AdminSignupPage` (`/signup`), `PassengerViewPage` (`/tours`, `/tours/:tourId/buses/:busId` — tour/bus selector + seat map) require no auth check at all. Do not add a logged-in-user check to these pages.
- Don't build speculative `isLock`/`isComingSoon` feature-flag gating for features that don't exist — every feature in `docs/PRD.md` should be available at launch unless the spec says otherwise.

2. **Data Orchestration (The "Smart" Hub)**
- *Centralized Fetching:* Primary API calls occur at the Page level. Child components receive "finished" data as props.
- *Async Strategy:*
  - Use `useEffect` for initial mounting fetches (e.g. tour list on `PassengerViewPage` mount, bus-type templates on the Tours & Buses tab mount).
  - Staged/two-phase fetching applies to `PassengerViewPage` and the Seat Management tab: render the tour/bus selector structure first, then fetch the live seat map as a second phase once a bus is selected — the page shouldn't block its whole shell on the seat map load.
- *Loading UI:* The Page controls global loading states (Overlays/Skeletons) via `app.slice`. The live seat map is owned by `seat.slice` (see `@state-management-layer/SKILL.md`), not by page-local state.

3. **Event & Logic Handling**
- *Action Controller:* Define event handlers (e.g., `handleApprove`, `handleCancel`, `handleToggleReserve`, `handleManualAssign`, `handleSwapMove`, `handleSeatRequest`) within the Page and pass them down.
- *Computed State:* Perform data transformations (filtering, sorting, aggregations — e.g. the manifest report's status filter and free-text search) before rendering children to keep child components "dumb" and presentational.
- *Navigation:* All `react-router` logic (`useNavigate`, `useParams`) resides exclusively in the Page layer.
- *Conflict Handling:* On a `409` from any seat action, the page-level handler re-syncs `seat.slice` from the response and shows a clear, hardcoded Hebrew message ("that seat was just taken — pick another").

4. **Layout & Accessibility**
- *Directional Integrity:* Every page root follows RTL (Hebrew) and proper text alignment — **except** the interactive seat map component, which stays direction-independent (a spatial diagram, not text — see `@ui-component-layer/SKILL.md` and `@css-layer/SKILL.md`).
- *Responsive Shell:* Use a standardized container: `max-w-7xl mx-auto px-4 md:px-8 py-6 md:py-10`.
- *Standard Components:* Every Page must utilize `PageHeader` for consistent titling, with the title/subtitle passed as plain, hardcoded Hebrew strings (no translation/phrase layer in this project — see `@ui-component-layer/SKILL.md`).

# Implementation Pattern
```typescript
// AdminDashboardPage.tsx — example of an auth-guarded page
const AdminDashboardPage = () => {
  // 1. Hooks & Store
  const navigate = useNavigate()
  const loggedinUser = useStore((state) => state.loggedinUser)
  const { data, isLoading, refresh } = useFetchList()

  // 2. Guard
  if (!loggedinUser) return <Navigate to="/" />

  // 3. Logic
  const handleApprove = async (seatId: string) => {
    await seatService.approve(seatId)
    refresh()
  }

  // 4. Render
  return (
    <main className="page-container animate-in fade-in">
      <PageHeader
        title="לוח בקרה למנהל"
        subtitle="ניהול מושבים, טיולים ואוטובוסים"
      />

      {isLoading ? (
        <SkeletonGrid />
      ) : (
        <SeatManagementTab
          seats={data}
          onApprove={handleApprove}
        />
      )}
    </main>
  )
}
```

```typescript
// PassengerViewPage.tsx — example of an unguarded public page
const PassengerViewPage = () => {
  const { busId } = useParams()
  const { seats, isLoading } = useFetchSeatMap(busId)

  const handleSeatRequest = async (payload) => {
    try {
      await seatService.request({ seatId: payload.seatId, ...payload })
    } catch (err) {
      if (err.response?.status === 409) {
        toast.error('המושב הזה נתפס הרגע — בחר/י מושב אחר')
        refresh() // re-sync seat.slice from the server
      } else {
        toast.error('אירעה שגיאה, נסה/י שוב')
      }
    }
  }

  return (
    <main className="page-container">
      <PageHeader title="בחירת מושב" />
      {isLoading ? <SkeletonGrid /> : <SeatMap seats={seats} onSelect={handleSeatRequest} />}
    </main>
  )
}
```

# Business Rules
- *Naming:* Files must use `PascalCase` and end with `Page.tsx`.

- *No Direct CSS:* All styling must be handled via Tailwind classes or the `cn` utility.

- *Separation of Concerns:* A Page should never contain complex UI internals (like SVG paths, the seat-grid layout markup, or raw HTML tables); these belong in the `ui-component-layer`.
