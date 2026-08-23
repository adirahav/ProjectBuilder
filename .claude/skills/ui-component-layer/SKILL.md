---
name: ui-component-layer
description: Governs the architecture, styling, and logic of all React components. Ensures atomic design, strict directional support, and consistent handling of all UI copy.
references:
  - @css-layer/SKILL.md
allowed_tools: [read_file, write_file, list_dir]
---

# Mandatory Workflow
1. **Blueprint & Skill Alignment:** Before coding, the agent MUST read the specific component SKILL (e.g., a `logo-component.md` if one exists) and its blueprint.
2. **Copy Handling:** Hardcoded strings in Hebrew — no translation/phrase system in this project (Hebrew-only, no i18n infrastructure per `docs/PRD.md`'s NFRs). UI strings are written directly in JSX as plain Hebrew text — do not invoke a phrase/translation function that doesn't exist in this codebase.

# Execution Flow
1. **Directional Compliance (RTL):** All layouts must be verified for directional compatibility. Prefer Tailwind logical properties (`ps-*`/`pe-*`/`start-*`/`end-*`, per `@css-layer/SKILL.md`) over directional flips like `flex-row-reverse` — logical properties adapt automatically and keep the component reusable, whereas `flex-row-reverse` hardcodes a one-off flip that can silently break if reused elsewhere.
2. **Iconography:** Use the project-standard icon library (`lucide-react`) as defined in `@ui-rules.md`.
3. **State Management:** Distinguish clearly between local UI state (e.g., `isMenuOpen`, a modal's open/close flag) and global Store state (e.g., the logged-in admin, the live `seat.slice`).

## Complex Component Exceptions
`SeatMap` (the interactive seat-grid component, shared by the Passenger View and the Admin Dashboard's Seat Management tab) is the most complex, highest-traffic component in the app and has its own rules layered on top of the general ones above:
- **Read from `seat.slice` only** — never derive or cache seat state locally in the component; the slice is the single source of truth (see `@state-management-layer/SKILL.md`).
- **Status is never color-only** — each of the four `seatStatus` values (`available`/`pending`/`taken`/`reserved`) renders its color *and* a distinct icon/label, per the `accessibility-layer` skill.
- **Directional exception:** `SeatMap` renders with a fixed `dir="ltr"` layout for its seat grid regardless of the surrounding page's direction, since it's a spatial diagram (physical bus layout — door position, driver side), not text (see `@css-layer/SKILL.md`). Everything around it (headers, labels, the seat-request modal's form fields) still follows RTL normally.
- **Motion** — status-change animations (e.g. a seat flashing when it moves to `pending`) respect `prefers-reduced-motion` (see `accessibility-layer` skill); motion is never the only signal a change occurred.

# Global Directory Isolation
- *Components:* `frontend/src/components/`
- *Logic/Utils:* `frontend/src/utils/`
