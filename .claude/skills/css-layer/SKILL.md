---
name: css-layer
description: Use this skill for all UI/UX implementation tasks. Enforces a 100% Tailwind CSS (Utility-first) workflow. Focuses on pure functional CSS for layout, branding, and responsiveness. Ensures direction-ready designs using logical properties and a config-driven architecture.
allowed_tools: [read_file]
examples:
   - input: "Create a primary button"
     output: '<Button className="bg-primary hover:bg-primary/90 text-white rounded-xl shadow-lg shadow-primary/20">Book Appointment</Button>'
---

# CSS Layer - 100% Tailwind CSS Architecture (v4)
*Objective:* Build high-fidelity, responsive, RTL-ready UI using a pure Tailwind CSS architecture. Custom CSS/SCSS files, `@apply` directives, and BEM naming conventions are strictly prohibited.

**Key Focus Areas:**
- *Utility-First:* 100% styling via Tailwind classes directly in the JSX/TSX.

- *Theme-Driven:* Branding (colors, spacing, shadows, radius) must be defined in the `@theme` block in `frontend/src/main.css` — this project uses Tailwind v4 (CSS-first), there is no `tailwind.config.js`.

- *Logical Properties:* Full directional support using `ps-*`, `pe-*`, `start-*`, `end-*` for native RTL/LTR behavior.

- *Dynamic Merging:* Use the `cn` utility to handle conditional styles and class conflicts.

## Core Principles

### 1. Style Standardization
- **Zero-CSS Policy:** Do not create `.css`/`.scss` files. All styling logic belongs in the component's `className`.

- **Theme as Truth:** Every custom design token (e.g., `--color-primary`, `--shadow-card`) must be registered in the `@theme` block in `frontend/src/main.css`, then consumed via its generated utility class (`bg-primary`, `shadow-card`). Never use "magic numbers" or arbitrary hex codes in a component unless they are truly one-off exceptions (using the `[...]` arbitrary-value syntax).

- **No @apply:** Avoid using `@apply` in CSS files to create "fake" components. Instead, create real React components that encapsulate their Tailwind classes.

### 2. Layout & Grid
- **Flex & Grid:** Use `flex`, `grid`, `grid-cols-*`, and `gap-*` for all layouts.
- **Main Layout:** Implement page-level constraints using `container mx-auto px-4`.
- **Spacing:** Use consistent spacing scales (e.g., `p-4`, `m-6`) to maintain vertical and horizontal rhythm.

### 3. Directional (RTL/LTR) Support
Required — Hebrew (RTL, default) and English (LTR).

- **Mandatory Logical Properties:** Use logical utilities to support RTL without extra code:
  - `ps-*` / `pe-*` (Padding Start/End) instead of `pl`/`pr`.
  - `ms-*` / `me-*` (Margin Start/End) instead of `ml`/`mr`.
  - `start-*` / `end-*` for positioning.
  - `rounded-s-*` / `rounded-e-*` for corners.

- **Natural Flow:** Rely on `text-start` and `flex-row`. When the parent container has `dir="rtl"`, these will automatically align correctly.

- **Bi-Directional Icons:** Use the `rtl:rotate-180` modifier for icons that must flip direction (like arrows, back/forward chevrons).

- **Spatial Component Exception:** the Time Slot Picker's date/time grid is not text — it must NOT flip with `dir="rtl"`. Render its container with a fixed `dir="ltr"` regardless of the surrounding RTL layout. Everything else on the page still follows RTL normally.

### 4. Responsiveness & Interaction
- **Mobile-First:** Classes without a prefix are for mobile. Use `md:` for tablets/desktop.

- **State Utilities:** Use `hover:`, `focus-visible:`, `active:`, and `disabled:` for all interactive feedback.

- **Group/Peer Logic:** Leverage `group` and `peer` classes for complex parent-child or sibling-based interactions.

### 5. Status Color Mapping
- Map each `TimeSlot`/`Appointment` status value to a `@theme` token, not a raw hex value (see `.rule/style-rules.md`'s Domain-Specific Color Mapping).
- Per `accessibility-layer` skill, color is never the only signal: pair each status's background color with the corresponding icon/label (color alone is insufficient and non-compliant).
- Encode the mapping as a single lookup (e.g. a `Record<Status, string>`) rather than inline conditionals scattered across components.

### 6. Implementation Pattern (The 'cn' Utility)
Every component must use the `cn` helper for class merging to ensure that Tailwind utilities override each other correctly according to the specificity rules of `tailwind-merge`. The utility already exists at `frontend/src/lib/utils.ts` — import it from there, do not redefine it locally in a component.

```typescript
// frontend/src/lib/utils.ts (existing — import from here, do not redefine)
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```
