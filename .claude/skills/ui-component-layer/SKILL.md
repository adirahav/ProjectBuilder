---
name: ui-component-layer
description: Governs the architecture, styling, and logic of all React components. Ensures atomic design, strict directional support, and consistent handling of all UI copy.
references:
  - @css-layer/SKILL.md
allowed_tools: [read_file, write_file, list_dir]
---

# Mandatory Workflow
1. **Blueprint & Skill Alignment:** Before coding, the agent MUST read the specific component SKILL (e.g., a `logo-component.md` if one exists) and its blueprint.
2. **Copy Handling:** Hardcoded strings in Hebrew (no translation/phrase system for v1). UI strings are written directly in JSX as plain Hebrew text — do not invoke a phrase/translation function that doesn't exist in this codebase.

# Execution Flow
1. **Directional Compliance (RTL):** All layouts must be verified for directional compatibility. Prefer Tailwind logical properties (`ps-*`/`pe-*`/`start-*`/`end-*`, per `@css-layer/SKILL.md`) over directional flips like `flex-row-reverse` — logical properties adapt automatically and keep the component reusable, whereas `flex-row-reverse` hardcodes a one-off flip that can silently break if reused elsewhere.
2. **Iconography:** Use the project-standard icon library (`lucide-react`) as defined in `@ui-rules.md`.
3. **State Management:** Distinguish clearly between local UI state (e.g., `isMenuOpen`, a modal's open/close flag) and global Store state (e.g., the logged-in user, `timeSlot.slice.ts`).

## Complex Component Exceptions
`TimeSlotGrid` (used on the TimeSlot Picker screen) is the most complex, highest-traffic component in the app and has its own rules layered on top of the general ones above:
- **Read from `timeSlot.slice.ts` only** — never derive or cache its state locally in the component; the slice is the single source of truth (see `@state-management-layer/SKILL.md`).
- **Status is never color-only** — each `TimeSlotStatus` renders its color *and* a distinct icon/label, per the `accessibility-layer` skill.
- **No directional exception** — `TimeSlotGrid` is a simple grid of time labels, not a spatial diagram, so it follows the page's normal RTL direction like everything else; there is no component in this product needing a fixed-direction exception.
- **Motion** — status-change animations respect `prefers-reduced-motion` (see `accessibility-layer` skill); motion is never the only signal a change occurred.

# Global Directory Isolation
- *Components:* `frontend/src/components/`
- *Logic/Utils:* `frontend/src/utils/`
