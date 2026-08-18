# UI Rules

## Purpose
- Define default UI libraries for common interface elements.

## Library Choices
- Use `sonner` for toast messages.
- Use `lucide-react` for icons.
- Use Tailwind CSS transition/animation utilities for animations and transitions (no separate animation library).

## Usage Notes
- Keep notifications concise and action-oriented — especially for any action on `TimeSlot`/`Appointment` (e.g. "Appointment approved", "That time slot was just taken — pick another").
- Reuse icon names consistently across similar features (e.g. one consistent lucide icon per `TimeSlotStatus`/`AppointmentStatus` value across every view that shows it).
- Prefer Tailwind's transition utilities (`transition`, `duration-*`, `ease-*`) over abrupt state snaps for interactive elements — this applies especially to the TimeSlot picker and the Admin Appointments dashboard, where state changes should animate rather than snap instantly.
