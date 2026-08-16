---
name: accessibility-layer
description: Use this skill to ensure all UI/UX implementations meet global A11y (Accessibility) standards. Enforces WCAG 2.1 Level AA compliance, semantic HTML architecture, and inclusive design principles to support screen readers, keyboard navigation, and visual impairments.
allowed_tools: [read_file]
references:
  - @css-layer/SKILL.md
examples:
   - input: "Create a functional icon button for closing a modal"
     output: "<button onClick={onClose} className={cn('p-2 hover:bg-slate-100 rounded-full transition-colors')} aria-label='{{CLOSE_LABEL_TEXT}}' title='{{CLOSE_LABEL_TEXT}}'><X size={20} aria-hidden='true' /></button>"
---

<!--
TEMPLATE — fill during project setup. Placeholders used in this file:
  {{PROJECT_NAME}}          — the app's name
  {{RTL_OR_LTR}}            — "RTL (Hebrew)" / "LTR" / "bidirectional"
  {{PRIMARY_LANGUAGE}}      — e.g. Hebrew, English
  {{MULTI_STATE_ENTITY}}    — a domain entity with a visual multi-state status (e.g. seat/order/ticket), if any — omit section 3b if none
  {{STATUS_VALUES}}         — the entity's status enum (e.g. available/pending/taken)
  {{KEY_FORMS_LIST}}        — the app's main forms needing aria-describedby error association
Ask the user: "Is this app RTL or LTR (or both)?" / "Does any entity have a multi-state visual status that needs non-color cues?" / "What are the main forms in the app?"
-->

# Accessibility & Inclusive Design Layer (A11y)
*Objective:* Build digital experiences that are perceivable, operable, understandable, and robust for all users. This layer ensures {{PROJECT_NAME}} is not just "compliant" but truly inclusive by design.

**Key Focus Areas:**
- *WCAG 2.1 Level AA:* Strict adherence to color contrast (4.5:1), text scaling, and focus indicators.

- *Semantic HTML:* Using the right tags for the right job (e.g., `<main>`, `<nav>`, `<h1>`-`<h6>`).

- *Keyboard Orchestration:* Full operability via `Tab`, `Enter`, and `Space`.

- *Screen Reader Support:* Meaningful `aria-*` attributes and hidden structural labels.

- *Motion Sensitivity:* Respect the user's motion preferences — animation is never the only way to perceive a change.

## Core Principles

### 1. Semantic Architecture
- *Tag Integrity:* Never use a `<div>` or `<span>` for interactive elements. Use `<button>` for actions and `<a>` for navigation.

- *Landmarks:* Every page must contain a single `<main>` element. Headers and Footers must use `<header>` and `<footer>` tags.

- *Heading Hierarchy:* Use headings in sequential order. Never skip levels (e.g., `h1` directly to `h3`) for visual styling. Use Tailwind classes for font size, not tags.

### 2. Interaction & Keyboard Logic
- *Focus States:* Never suppress the default focus ring without providing a custom, high-visibility alternative (e.g., `focus-visible:ring-2 focus-visible:ring-offset-2`).

- *Skip Links:* Implement a "Skip to Content" link for keyboard users to bypass navigation.

- *Modals & Dialogs:* Must implement focus trapping (focus stays inside the modal) and close on `Esc` key. Use `role="dialog"` and `aria-modal="true"`.

### 3. Visual & Cognitive Inclusion
- *Contrast Ratios:* Text-to-background contrast must meet a minimum of 4.5:1. Use tools to verify color combinations.

- *No Color-Only Cues:* Information must not be conveyed by color alone (e.g., an error should have an icon or text, not just red color).

- *Multi-State Entity ({{PROJECT_NAME}}-specific — fill in if applicable):* If a domain entity like `{{MULTI_STATE_ENTITY}}` has a `status` (`{{STATUS_VALUES}}`), it must never rely on color alone. Each status should carry a distinct icon plus a text label reachable via tooltip/`aria-label`, so the UI is usable by colorblind users and in grayscale/high-contrast display modes.

- *Text Scaling:* Ensure layout remains functional when font size is increased by 200% via the Accessibility Menu or browser settings.

### 4. ARIA & Screen Reader Mastery
- *Aria-Labels:* Every icon-only button must have a descriptive, hardcoded `aria-label` in `{{PRIMARY_LANGUAGE}}` (unless the project has a translation/phrase layer — see `ui-component-layer` skill).

- *Aria-Hidden:* Decorative icons and images that do not add information must have `aria-hidden="true"` to reduce screen reader noise.

- *Live Regions:* Use `aria-live="polite"` for dynamic content updates (loading states, toasts, real-time status changes) so screen readers announce changes without the user needing to re-navigate.

- *Error Association:* Every inline validation error must be linked to its input via `aria-describedby`, so screen readers announce the error when the field receives focus — not only when it's visually next to the field. Applies to every form in the app: {{KEY_FORMS_LIST}}.

### 5. Motion Sensitivity
- *Respect `prefers-reduced-motion`:* When set, disable or drastically reduce animation-library transitions in favor of instant state changes. Motion must never be the only signal that a change occurred; it's an enhancement, not a requirement, for perceiving the update.

### 6. Directional Accessibility ({{RTL_OR_LTR}})
- *Directional Clarity:* Ensure the reading order for screen readers follows the {{RTL_OR_LTR}} flow.

- *Logical Mapping:* Focus order must follow the visual flow for the project's primary direction.

## Implementation Checklist
- [ ] Element uses semantic tag (`<button>`, `<section>`, etc.).

- [ ] Interactive elements have a visible focus state.

- [ ] Color contrast is verified for all background/foreground pairs.

- [ ] All icon-only actions have descriptive `aria-label` strings.

- [ ] Logical `Tab` order is maintained.

- [ ] Any multi-state entity status is conveyed via icon/label in addition to color, not color alone.

- [ ] Real-time status changes are announced via an `aria-live="polite"` region.

- [ ] Inline form errors are linked to their input via `aria-describedby`.

- [ ] Animations respect `prefers-reduced-motion` and are never the sole signal of a state change.
