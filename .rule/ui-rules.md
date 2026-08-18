# UI Rules

## Purpose
- Define default UI libraries for common interface elements.

## Library Choices
- Use `sonner` for toast messages.
- Use `Lucide React` for icons.
- Use Tailwind CSS transitions/animations (e.g. `transition-colors`, `animate-pulse`) for animations and transitions — no separate animation library.

## Usage Notes
- Keep notifications concise and action-oriented — especially for any action on `TimeSlot`/`Appointment` (e.g. "Appointment confirmed", "That time slot was just taken — pick another").
- Reuse icon names consistently across similar features (e.g. one consistent icon per `TimeSlotStatus`/`AppointmentStatus` value across every view that shows it — a clock icon for `pending`/`held`, a check icon for `confirmed`/`booked`, an X icon for `cancelled`).
- Prefer Tailwind's built-in transition utilities over ad-hoc CSS animations for interactive elements — this applies especially to the `TimeSlot` picker, where a slot's state should transition smoothly (e.g. fading to disabled) rather than snap instantly when it becomes unavailable.
