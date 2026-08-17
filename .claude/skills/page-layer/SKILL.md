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
- *Guarded pages (role `admin`):* `/admin` (Admin Appointments Dashboard), `/admin/services` (Admin Services Management) must verify the logged-in user's role from the store. Unauthorized access must trigger an immediate redirect to `/admin/login`.
- *Unguarded pages:* `/` (Services List), `/services/:id/timeslots` (TimeSlot Picker), `/services/:id/timeslots/:timeSlotId/book` (Booking Form), `/booking/:appointmentId/confirmation` (Booking Confirmation), `/admin/login` (Admin Login) require no auth check at all. Do not add a logged-in-user check to these pages.
- Don't build speculative `isLock`/`isComingSoon` feature-flag gating for features that don't exist — every feature in the product spec should be available at launch unless the spec says otherwise.

2. **Data Orchestration (The "Smart" Hub)**
- *Centralized Fetching:* Primary API calls occur at the Page level. Child components should receive "finished" data as props.
- *Async Strategy:*
  - Use `useEffect` for initial mounting fetches.
  - The TimeSlot Picker page fetches in two phases: the `Service` summary first (so the page can render its header immediately), then the available `TimeSlots` for the selected date — treat these as separate phases so the page renders its structure before the slot grid arrives.
- *Loading UI:* The Page controls global loading states (Overlays/Skeletons) via `app.slice`. `TimeSlot` state is owned by `timeSlot.slice.ts` (see `@state-management-layer/SKILL.md`), not by page-local state.

3. **Event & Logic Handling**
- *Action Controller:* Define event handlers (e.g., `handleApprove`, `handleSelect`, `handleCancel`) within the Page and pass them down.
- *Computed State:* Perform data transformations (filtering, sorting, aggregations) before rendering children to keep child components "dumb" and presentational.
- *Navigation:* All `react-router` logic (`useNavigate`, `useParams`) resides exclusively in the Page layer.
- *Conflict Handling:* On a `409` from any `TimeSlot` hold/book action, the page-level handler re-syncs `timeSlot.slice.ts` from the response and shows a clear, hardcoded Hebrew message.

4. **Layout & Accessibility**
- *Directional Integrity:* Every page root follows RTL (Hebrew) and proper text alignment — no spatial exceptions exist in this product (no seat-map-style layout requiring direction-independence).
- *Responsive Shell:* Use a standardized container: `max-w-7xl mx-auto px-4 md:px-8 py-6 md:py-10`.
- *Standard Components:* Every Page must utilize `PageHeader` for consistent titling, with the title/subtitle passed as plain, hardcoded Hebrew strings (no translation/phrase layer for v1).

# Implementation Pattern
```typescript
// AdminAppointmentsDashboardPage.tsx — example of an auth-guarded page
const AdminAppointmentsDashboardPage = () => {
  // 1. Hooks & Store
  const navigate = useNavigate()
  const loggedinUser = useStore((state) => state.loggedinUser)
  const { appointments, isLoading, refresh } = useFetchAppointments()

  // 2. Guard
  if (!loggedinUser) return <Navigate to="/admin/login" />

  // 3. Logic
  const handleApprove = async (id) => {
    await appointmentService.approve(id)
    refresh()
  }

  // 4. Render
  return (
    <main className="page-container animate-in fade-in">
      <PageHeader
        title="ניהול תורים"
        subtitle="כל התורים במקום אחד"
      />

      {isLoading ? (
        <SkeletonGrid />
      ) : (
        <AppointmentsTable
          items={appointments}
          onApprove={handleApprove}
        />
      )}
    </main>
  )
}
```

```typescript
// TimeSlotPickerPage.tsx — example of an unguarded public page
const TimeSlotPickerPage = () => {
  const { id } = useParams()
  const { timeSlots, isLoading } = useFetchTimeSlots(id)

  const handleHold = async (timeSlotId) => {
    try {
      await timeSlotService.hold(timeSlotId)
      navigate(`/services/${id}/timeslots/${timeSlotId}/book`)
    } catch (err) {
      if (err.response?.status === 409) {
        toast.error('התור הזה כבר נתפס — בחר/י שעה אחרת')
        refresh() // re-sync timeSlot.slice.ts from the server
      } else {
        toast.error('משהו השתבש, נסה/י שוב')
      }
    }
  }

  return (
    <main className="page-container">
      <PageHeader title="בחר/י שעה" />
      {isLoading ? <SkeletonGrid /> : <TimeSlotGrid timeSlots={timeSlots} onSelect={handleHold} />}
    </main>
  )
}
```

# Business Rules
- *Naming:* Files must use `PascalCase` and end with `Page.tsx`.

- *No Direct CSS:* All styling must be handled via Tailwind classes or the `cn` utility.

- *Separation of Concerns:* A Page should never contain complex UI internals (like SVG paths, complex grid markup, or raw HTML tables); these belong in the `ui-component-layer`.
