---
name: ui-component-layer
description: Governs the architecture, styling, and logic of all React components. Ensures atomic design, strict directional support, and consistent handling of all UI copy.
references:
  - @css-layer/SKILL.md
allowed_tools: [read_file, write_file, list_dir]
---

# Mandatory Workflow
1. **Blueprint & Skill Alignment:** Before coding, the agent MUST read the specific component SKILL (e.g., a `logo-component.md` if one exists) and its blueprint.
2. **Copy Handling:** ClinicBook is bilingual — every UI string goes through a lightweight phrase-dictionary lookup keyed by the active language (Hebrew primary, English secondary), not hardcoded single-language text. Store phrases in `frontend/src/i18n/` (one dictionary per language) and reference them via a small `t('key')`-style helper; do not invoke a heavier translation framework than this needs.

# Execution Flow
1. **Directional Compliance (RTL primary / LTR secondary):** All layouts must be verified for directional compatibility in both Hebrew (`dir="rtl"`) and English (`dir="ltr"`). Prefer Tailwind logical properties (`ps-*`/`pe-*`/`start-*`/`end-*`, per `@css-layer/SKILL.md`) over directional flips like `flex-row-reverse` — logical properties adapt automatically and keep the component reusable, whereas `flex-row-reverse` hardcodes a one-off flip that can silently break if reused elsewhere.
2. **Iconography:** Use the project-standard icon library (`lucide-react`) as defined in `@ui-rules.md`.
3. **State Management:** Distinguish clearly between local UI state (e.g., `isMenuOpen`, a modal's open/close flag) and global Store state (e.g., the logged-in admin, the `TimeSlot`/`Appointment` slices).

## Complex Component Exceptions
The `TimeSlotPicker` grid is the most complex, highest-traffic component in the app and has its own rules layered on top of the general ones above:
- **Read from `timeSlot.slice.ts` only** — never derive or cache slot availability locally in the component; the slice is the single source of truth (see `@state-management-layer/SKILL.md`).
- **Status is never color-only** — each `TimeSlotStatus`/`AppointmentStatus` renders its color *and* a distinct icon/label, per the `accessibility-layer` skill.
- **No directional exception needed** — the slot grid is a normal RTL/LTR-following layout (time labels, not a spatial diagram), so it follows the page's normal direction like everything else.
- **Motion** — status-change animations (a slot flipping to booked/blocked) respect `prefers-reduced-motion` (see `accessibility-layer` skill); motion is never the only signal a change occurred.

# Global Directory Isolation
- *Components:* `frontend/src/components/`
- *Logic/Utils:* `frontend/src/utils/`
