# UI Rules

## Purpose
- Define default UI libraries for common interface elements.

## Library Choices
- Use `sonner` for toast messages.
- Use `lucide-react` for icons.
- Use `framer-motion` for animations and transitions.

## Usage Notes
- Keep notifications concise and action-oriented — especially for any action on `TimeSlot`/`Appointment` (e.g. "Appointment confirmed", "That time slot was just taken — pick another").
- Reuse icon names consistently across similar features (e.g. one consistent `lucide-react` icon per `TimeSlotStatus`/`AppointmentStatus` value across every view that shows it — e.g. `CheckCircle2` for `confirmed`/`booked`, `Clock` for `pending`/`held`, `XCircle` for `cancelled`).
- Prefer `framer-motion` variants and transitions over CSS animations for interactive elements — this applies especially to the TimeSlot picker and Admin appointments list, where state changes should animate rather than snap instantly.
