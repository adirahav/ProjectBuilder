# UI Rules

## Purpose
- Define default UI libraries for common interface elements.

## Library Choices
- Use `sonner` for toast messages.
- Use `lucide-react` for icons.
- Use `framer-motion` for animations and transitions.

## Usage Notes
- Keep notifications concise and action-oriented — especially for any action on `TimeSlot`/`Appointment` (e.g. "התור אושר", "התור הזה כבר נתפס — בחר/י שעה אחרת").
- Reuse icon names consistently across similar features (e.g. one consistent icon per status value across every view that shows it — see `.rule/style-rules.md`'s status-color mapping for the paired token).
- Prefer `framer-motion` variants and transitions over CSS animations for interactive elements — this applies especially to the TimeSlot Picker and Admin Appointments Dashboard, where state changes (a slot becoming unavailable, a status updating) should animate rather than snap instantly.
