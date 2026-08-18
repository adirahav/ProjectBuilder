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
- *Guarded pages:* `/admin/appointments` and `/admin/services` (`AdminAppointmentsPage.tsx`, `AdminServicesPage.tsx`) must verify the logged-in admin's role (`role: admin`) from `auth.slice`. Unauthorized access must trigger an immediate redirect to `/admin/login`.
- *Unguarded pages:* `/` (Service List), `/book/:serviceId` (TimeSlot Picker), `/book/:serviceId/:timeSlotId/confirm` (Contact Details & Confirm), `/appointments/:id` (Booking Confirmation), and `/admin/login` (Admin Login) require no auth check at all. Do not add a logged-in-user check to these pages.
- Don't build speculative `isLock`/`isComingSoon` feature-flag gating for features that don't exist — every feature in the product spec should be available at launch unless the spec says otherwise.

2. **Data Orchestration (The "Smart" Hub)**
- *Centralized Fetching:* Primary API calls occur at the Page level. Child components should receive "finished" data as props.
- *Async Strategy:*
  - Use `useEffect` for initial mounting fetches.
  - `TimeSlotPickerPage` (`/book/:serviceId`) needs staged/two-phase fetching: first the selected `Service` (name/duration/price for the header), then the `TimeSlot`s for the currently selected date — treat these as separate phases so the page can render its structure (service header, date picker) before the slot grid arrives.
- *Loading UI:* The Page controls global loading states (Overlays/Skeletons) via `app.slice`. Any live/real-time data is owned by its dedicated slice (see `@state-management-layer/SKILL.md`), not by page-local state.

3. **Event & Logic Handling**
- *Action Controller:* Define event handlers (e.g., `handleApprove`, `handleSelect`, `handleCancel`) within the Page and pass them down.
- *Computed State:* Perform data transformations (filtering, sorting, aggregations) before rendering children to keep child components "dumb" and presentational.
- *Navigation:* All `react-router` logic (`useNavigate`, `useParams`) resides exclusively in the Page layer.
- *Conflict Handling:* On a `409` from booking a `TimeSlot` (it was already held/booked by someone else), the page-level handler (`ContactDetailsPage`, `/book/:serviceId/:timeSlotId/confirm`) re-syncs `booking.slice` from the response, shows a clear "this slot is no longer available" message, and navigates back to `TimeSlotPickerPage`.

4. **Layout & Accessibility**
- *Directional Integrity:* Every page root follows the active document direction (RTL for Hebrew, LTR for English — switched per-language, Hebrew is default) and proper text alignment. There is no spatial/diagram component in this app that needs a directional exception — every page uses the standard logical-property layout described in `@css-layer/SKILL.md`.
- *Responsive Shell:* Use a standardized container: `max-w-7xl mx-auto px-4 md:px-8 py-6 md:py-10`.
- *Standard Components:* Every Page must utilize `PageHeader` for consistent titling, with the title/subtitle passed as plain, hardcoded strings in the active language (Hebrew default, English alternate — no translation/phrase system exists in this codebase, see `@ui-component-layer/SKILL.md`).

# Implementation Pattern
```typescript
// AdminAppointmentsPage.tsx — example of an auth-guarded page
const AdminAppointmentsPage = () => {
  // 1. Hooks & Store
  const navigate = useNavigate()
  const loggedinUser = useStore((state) => state.loggedinUser)
  const { data, isLoading, refresh } = useFetchAppointments()

  // 2. Guard
  if (!loggedinUser) return <Navigate to="/admin/login" />

  // 3. Logic
  const handleConfirm = async (appointmentId: string) => {
    await appointmentService.confirm(appointmentId)
    refresh()
  }

  // 4. Render
  return (
    <main className="page-container animate-in fade-in">
      <PageHeader
        title="ניהול תורים"
        subtitle="צפייה ואישור תורים לפי תאריך"
      />

      {isLoading ? (
        <SkeletonGrid />
      ) : (
        <AppointmentList
          items={data}
          onConfirm={handleConfirm}
        />
      )}
    </main>
  )
}
```

```typescript
// ContactDetailsPage.tsx — example of an unguarded public page
const ContactDetailsPage = () => {
  const { serviceId, timeSlotId } = useParams()
  const navigate = useNavigate()
  const { item: timeSlot, isLoading } = useFetchTimeSlot(timeSlotId)

  const handleBook = async (payload) => {
    try {
      const appointment = await appointmentService.book({ serviceId, timeSlotId, ...payload })
      navigate(`/appointments/${appointment.id}`)
    } catch (err) {
      if (err.response?.status === 409) {
        toast.error('התור כבר אינו זמין')
        navigate(`/book/${serviceId}`) // re-sync happens in booking.slice from the response
      } else {
        toast.error('אירעה שגיאה, נסו שוב')
      }
    }
  }

  return (
    <main className="page-container">
      <PageHeader title="פרטי קשר ואישור" />
      {isLoading ? <SkeletonGrid /> : <ContactDetailsForm timeSlot={timeSlot} onSubmit={handleBook} />}
    </main>
  )
}
```

# Business Rules
- *Naming:* Files must use `PascalCase` and end with `Page.tsx` (e.g. `ServiceListPage.tsx`, `TimeSlotPickerPage.tsx`, `ContactDetailsPage.tsx`, `BookingConfirmationPage.tsx`, `AdminLoginPage.tsx`, `AdminAppointmentsPage.tsx`, `AdminServicesPage.tsx`).

- *No Direct CSS:* All styling must be handled via Tailwind classes or the `cn` utility.

- *Separation of Concerns:* A Page should never contain complex UI internals (like SVG paths, complex grid markup, or raw HTML tables); these belong in the `ui-component-layer`.
