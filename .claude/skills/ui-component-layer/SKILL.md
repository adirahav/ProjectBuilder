---
name: ui-component-layer
description: Governs the architecture, styling, and logic of all React components. Ensures atomic design, strict directional support, and consistent handling of all UI copy.
references:
  - @css-layer/SKILL.md
allowed_tools: [read_file, write_file, list_dir]
---

# Mandatory Workflow
1. **Blueprint & Skill Alignment:** Before coding, the agent MUST read the specific component SKILL (e.g., a `logo-component.md` if one exists) and its blueprint.
2. **Copy Handling:** Hardcoded strings in Hebrew (default) or English (alternate, per the active language switch) — there is no design source to match (the Frontend Agent designs the UI itself per `.rule/style-rules.md`). If hardcoded, UI strings are written directly in JSX as plain text in the active language — do not invoke a phrase/translation function that doesn't exist in this codebase.

# Execution Flow
1. **Directional Compliance (RTL for Hebrew / LTR for English):** All layouts must be verified for directional compatibility. Prefer Tailwind logical properties (`ps-*`/`pe-*`/`start-*`/`end-*`, per `@css-layer/SKILL.md`) over directional flips like `flex-row-reverse` — logical properties adapt automatically and keep the component reusable, whereas `flex-row-reverse` hardcodes a one-off flip that can silently break if reused elsewhere.
2. **Iconography:** Use the project-standard icon library (`lucide-react`) as defined in `@ui-rules.md`.
3. **State Management:** Distinguish clearly between local UI state (e.g., `isMenuOpen`, a modal's open/close flag) and global Store state (e.g., the logged-in admin, the `booking.slice` live selection state).

## Complex Component Exceptions
`TimeSlotGrid` (used by `TimeSlotPickerPage`) is the most complex, highest-traffic component in the app and has its own rules layered on top of the general ones above:
- **Read from its dedicated slice only** — never derive or cache `TimeSlot` status locally in the component; `booking.slice` is the single source of truth (see `@state-management-layer/SKILL.md`).
- **Status is never color-only** — each `TimeSlot` status (`available`/`held`/`booked`) renders its color *and* a distinct icon/label, per the `accessibility-layer` skill.
- **Directional exception:** none — `TimeSlotGrid` is a simple time-label grid, not a spatial diagram, so it follows the page's normal RTL/LTR direction like everything else (see `@css-layer/SKILL.md`). There is no component in this app that needs a fixed-direction exception.
- **Motion** — status-change animations respect `prefers-reduced-motion` (see `accessibility-layer` skill); motion is never the only signal a change occurred.

# Global Directory Isolation
- *Components:* `frontend/src/components/`
- *Logic/Utils:* `frontend/src/utils/`
