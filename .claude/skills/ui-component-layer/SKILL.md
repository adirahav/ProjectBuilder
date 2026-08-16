---
name: ui-component-layer
description: Governs the architecture, styling, and logic of all React components. Ensures atomic design, strict directional support, and consistent handling of all UI copy.
references:
  - @css-layer/SKILL.md
allowed_tools: [read_file, write_file, list_dir]
---

<!--
TEMPLATE — fill during project setup. Placeholders:
  {{I18N_STRATEGY}}         — "hardcoded strings in <language>" or "translation/phrase system (name it)"
  {{PRIMARY_LANGUAGE}}
  {{RTL_OR_LTR}}
  {{ICON_LIBRARY}}          — e.g. lucide-react
  {{COMPLEX_COMPONENT}}     — the most complex/highest-traffic component, if it has its own extra rules (e.g. a live map, a complex form)
  {{SPATIAL_EXCEPTION}}     — whether {{COMPLEX_COMPONENT}} needs a fixed direction regardless of page RTL/LTR
Ask the user: "Hardcoded strings, or a translation/phrase system?" "Which icon library?" "Any components needing exceptions to standard layout rules (e.g. a spatial diagram)?"
-->

# Mandatory Workflow
1. **Blueprint & Skill Alignment:** Before coding, the agent MUST read the specific component SKILL (e.g., a `logo-component.md` if one exists) and its blueprint.
2. **Copy Handling:** {{I18N_STRATEGY}}. If hardcoded, UI strings are written directly in JSX as plain {{PRIMARY_LANGUAGE}} text — do not invoke a phrase/translation function that doesn't exist in this codebase.

# Execution Flow
1. **Directional Compliance ({{RTL_OR_LTR}}):** All layouts must be verified for directional compatibility. Prefer Tailwind logical properties (`ps-*`/`pe-*`/`start-*`/`end-*`, per `@css-layer/SKILL.md`) over directional flips like `flex-row-reverse` — logical properties adapt automatically and keep the component reusable, whereas `flex-row-reverse` hardcodes a one-off flip that can silently break if reused elsewhere.
2. **Iconography:** Use the project-standard icon library (`{{ICON_LIBRARY}}`) as defined in `@ui-rules.md`.
3. **State Management:** Distinguish clearly between local UI state (e.g., `isMenuOpen`, a modal's open/close flag) and global Store state (e.g., the logged-in user, any live/real-time slice).

## Complex Component Exceptions (fill in if applicable)
`{{COMPLEX_COMPONENT}}` is the most complex, highest-traffic component in the app and has its own rules layered on top of the general ones above:
- **Read from its dedicated slice only** — never derive or cache its state locally in the component; the slice is the single source of truth (see `@state-management-layer/SKILL.md`).
- **Status is never color-only** — each status renders its color *and* a distinct icon/label, per the `accessibility-layer` skill.
- **Directional exception (if applicable):** `{{SPATIAL_EXCEPTION}}` — this component renders a fixed direction regardless of the surrounding page's direction, since it's a spatial diagram, not text (see `@css-layer/SKILL.md`). Everything around it still follows the page's normal direction.
- **Motion** — status-change animations respect `prefers-reduced-motion` (see `accessibility-layer` skill); motion is never the only signal a change occurred.

# Global Directory Isolation
- *Components:* `frontend/src/components/`
- *Logic/Utils:* `frontend/src/utils/`
