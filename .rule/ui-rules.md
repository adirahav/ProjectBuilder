# UI Rules

## Purpose
- Define default UI libraries for common interface elements.

## Library Choices
- Use `sonner` for toast messages.
- Use `lucide-react` for icons.
- Use Tailwind CSS transitions/utilities (and, where a genuinely richer interaction is needed, `framer-motion`) for animations and transitions.

## Usage Notes
- Keep notifications concise and action-oriented — especially for any action on `seat` (e.g. "Seat approved" / "המושב אושר", "That seat was just taken — pick another" / "המושב הזה כבר נתפס — בחר/י מושב אחר").
- Reuse icon names consistently across similar features — one consistent Lucide icon per `seatStatus` value (`available`, `pending`, `taken`, `reserved`) across every view that shows it (passenger seat map, admin seat management tab).
- Prefer animated transitions over instant snaps for interactive elements — this applies especially to the seat map, where status changes (e.g. `available` → `pending` on request, `pending` → `taken` on approve) should animate rather than snap instantly.
