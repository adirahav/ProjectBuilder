# Style Rules

## Purpose
- Define CSS organization and maintainable styling patterns for this app (`frontend/`, Hila Tours).

## Stack
- Tailwind CSS v4 (CSS-first, via `@tailwindcss/vite` — no `tailwind.config.js`) — utility-first styling.
- `cn()` — for conditional class merging (via `clsx` + `tailwind-merge`), located at `frontend/src/lib/utils.ts`.
- Tailwind utilities are the default for all styling. Custom CSS in `main.css` is limited to what utilities genuinely cannot express (see File Structure below).
- Full RTL layout, Hebrew only — use Tailwind's logical properties (`ps-*`/`pe-*`, `ms-*`/`me-*`, `text-start`/`text-end`) instead of physical `left`/`right` utilities so the layout stays direction-correct; set `dir="rtl"` and `lang="he"` on the document root.

## Theme Configuration
- All design tokens are defined in `frontend/src/main.css` using Tailwind v4's `@theme` block.
- Do not hardcode colors, fonts, or spacing inline — always reference theme tokens via their generated utility classes.
- Design source of truth: `docs/design/mockups/` (self-contained HTML/Tailwind mockups produced by the Designer agent, once per project). Once the Designer agent's mockups are approved, extract the exact color/spacing/typography values used there into the `@theme` block below — do not invent separate values.
- Current tokens (extend this list here as new tokens are added — do not let this drift from `main.css`):

```css
/* frontend/src/main.css */
@import "tailwindcss";

@theme {
  /* Colors — extracted from docs/design/mockups/ once approved */
  --color-primary: /* TBD from mockups */;
  --color-secondary: /* TBD from mockups */;
  --color-accent: /* TBD from mockups */;
  --color-danger: /* TBD from mockups */;
  --color-success: /* TBD from mockups */;
  --color-warning: /* TBD from mockups */;

  /* Seat status colors */
  --color-seat-available: /* TBD from mockups */;
  --color-seat-pending: /* TBD from mockups */;
  --color-seat-taken: /* TBD from mockups */;
  --color-seat-reserved: /* TBD from mockups */;
}
```

- All color tokens above are TBD pending the Designer agent's mockups (`docs/design/mockups/`) — fill in the real hex values once those are generated and approved, and remove the "TBD" framing.
- Decide whether `--radius-*` tokens are defined, or whether raw Tailwind radius utilities are used directly (e.g. `rounded-xl`) — follow whatever the mockups establish.

## Domain-Specific Color Mapping — seat status
- `seat` is the one place in the UI where color directly encodes domain state. Map each `seatStatus` value (`available`, `pending`, `taken`, `reserved`) to a token (`--color-seat-available`, etc.), not a raw hex value, so the mapping stays centralized and themeable.
- Encode this mapping as a small lookup (e.g. `seatStatusStyles: Record<SeatStatus, string>`) rather than scattering inline conditionals across components — used consistently in both the passenger seat map (Screen 3) and the admin seat management tab (Screen 4a).
- Per `accessibility-layer`/PRD AC-17, color alone must never be the only signal — every seat status also carries a distinct Lucide icon and text label/`aria-label`.

## Conditional Classes
- Use `cn()` for all conditional or merged class strings.
- Never use string concatenation or ternary strings for class names.

```ts
// frontend/src/lib/utils.ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

```tsx
// Usage
<button className={cn(
  'px-4 py-2 rounded-xl font-medium',
  isValid ? 'bg-accent text-white' : 'bg-danger text-white',
  disabled && 'opacity-50 cursor-not-allowed'
)}>
  שלח
</button>
```

## Authoring Rules
- Use Tailwind utility classes directly on elements — do not introduce new custom CSS classes or CSS Modules for component styling.
- Reference `@theme` tokens via Tailwind's generated utilities (e.g. `bg-primary`, `text-secondary`, `border-accent`, `bg-seat-available`).
- Use `cn()` whenever classes depend on props, state, or conditions.
- Keep className strings readable — break long strings across lines when needed.
- Do not use `style={{}}` inline styles for anything expressible in Tailwind. Inline styles are only acceptable for genuinely runtime-computed values (e.g. a seat's computed grid position from `bus.seatLayout`) — never for static styling.
- Use logical spacing/alignment utilities (`ps-*`, `pe-*`, `ms-*`, `me-*`, `text-start`, `text-end`) rather than `pl-*`/`pr-*`/`ml-*`/`mr-*`/`text-left`/`text-right`, so nothing needs a separate LTR pass — this app is RTL-only but logical properties keep intent explicit and future-proof.

## File Structure
- `frontend/src/main.css` — entry point: `@import "tailwindcss"`, the `@theme` block, and the limited set of things Tailwind utilities can't express.
  - Do not add anything here that a Tailwind utility class could express instead.
- `frontend/src/lib/utils.ts` — `cn()` utility for class merging.

## Open Questions / TBD
- Confirm the real design tokens once `docs/design/mockups/` is generated and approved by the Designer agent (see `agents/designer/CLAUDE.md`); replace every "TBD from mockups" value above and remove this note.
- Lock in the final `seatStatus` → color mapping once the mockups establish it.
