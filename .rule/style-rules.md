# Style Rules

## Purpose
- Define CSS organization and maintainable styling patterns for this app (`frontend/`, Dog Grooming Clinic Booking).

## Stack
- Tailwind CSS v4 (CSS-first, via `@tailwindcss/vite` — no `tailwind.config.js`) — utility-first styling.
- `cn()` — for conditional class merging (via `clsx` + `tailwind-merge`), located at `frontend/src/lib/utils.ts`.
- Tailwind utilities are the default for all styling. Custom CSS in `main.css` is limited to what utilities genuinely cannot express (see File Structure below).

## Theme Configuration
- There is no external design source (no Figma file, no AI-Studio export) for this project — the Frontend Agent designs the UI itself, per this file and the `css-layer`/`ui-component-layer` skills: a warm, approachable, clean palette appropriate for a small dog grooming clinic (calm, trustworthy, not clinical), a simple spacing scale, and consistent component patterns, rather than matching an external reference.
- All design tokens are defined in `frontend/src/main.css` using Tailwind v4's `@theme` block.
- Do not hardcode colors, fonts, or spacing inline — always reference theme tokens via their generated utility classes.
- Starting tokens (extend this list here as new tokens are added — do not let this drift from `main.css`):

```css
/* frontend/src/main.css */
@import "tailwindcss";

@theme {
  /* Colors */
  --color-primary: #2f6f5e;      /* brand teal-green — calm, clinical-but-warm */
  --color-primary-hover: #255a4c;
  --color-accent: #e5a35a;       /* warm accent — CTA highlights, booking buttons */
  --color-background: #fdfbf8;
  --color-surface: #ffffff;
  --color-text: #2a2a2a;
  --color-text-muted: #6b6b6b;
  --color-border: #e5e0d8;
  --color-success: #3a8f5b;
  --color-danger: #c9483a;
  --color-warning: #d99a2b;
}
```

- Confirmed for v1: `--color-primary`, `--color-accent`, `--color-background`, `--color-surface`, `--color-text`, `--color-text-muted`, `--color-border`, `--color-success`, `--color-danger`, `--color-warning`, and a `--color-primary-hover` hover-state variant. Still open/TBD: a dedicated typography token (font family beyond the Tailwind default), and any dark-mode token set (not in scope for v1).
- `--radius-*` tokens are not defined separately — use raw Tailwind radius utilities directly (e.g. `rounded-xl`, `rounded-full`) for consistency without an extra indirection layer.

## Domain-Specific Color Mapping
- `TimeSlot.status` is the one place in the UI where color directly encodes domain state (the customer-facing slot picker). Map each status to a token, not a raw hex value, so the mapping stays centralized and themeable:
  - `available` → `--color-success` (selectable, shown as an active/clickable button)
  - `held` → `--color-warning` (temporarily unavailable — shown dimmed/disabled with a "reserving..." hint)
  - `booked` → `--color-text-muted` (unavailable — shown dimmed/disabled, not clickable)
- `Appointment.status` gets a secondary mapping for the admin dashboard's list/badges:
  - `pending` → `--color-warning`
  - `confirmed` → `--color-success`
  - `cancelled` → `--color-text-muted`
  - `completed` → `--color-primary`
- Encode both mappings as small lookups (e.g. `timeSlotStatusStyles: Record<TimeSlotStatus, string>`, `appointmentStatusStyles: Record<AppointmentStatus, string>`) rather than scattering inline conditionals across components.

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
  isAvailable ? 'bg-accent text-white' : 'bg-text-muted text-white',
  disabled && 'opacity-50 cursor-not-allowed'
)}>
  Book
</button>
```

## Authoring Rules
- Use Tailwind utility classes directly on elements — do not introduce new custom CSS classes or CSS Modules for component styling.
- Reference `@theme` tokens via Tailwind's generated utilities (e.g. `bg-primary`, `text-text-muted`, `border-border`).
- Use `cn()` whenever classes depend on props, state, or conditions.
- Keep className strings readable — break long strings across lines when needed.
- Do not use `style={{}}` inline styles for anything expressible in Tailwind. Inline styles are only acceptable for genuinely runtime-computed values — never for static styling.
- Use Tailwind's logical properties (`ps-*`/`pe-*`, `ms-*`/`me-*`, `text-start`/`text-end`) instead of physical `left`/`right` utilities, so layout flips correctly between the Hebrew (RTL) default and English (LTR).

## File Structure
- `frontend/src/main.css` — entry point: `@import "tailwindcss"`, the `@theme` block, and the limited set of things Tailwind utilities can't express.
  - Do not add anything here that a Tailwind utility class could express instead.
- `frontend/src/lib/utils.ts` — `cn()` utility for class merging.

## Open Questions / TBD
- Final hex values above are a starting proposal (no client brand guidelines exist yet) — confirm/adjust with the clinic owner before ship, and update `main.css` + this file together if they change.
- Typography token and dark-mode support remain undecided — treat as out of scope until explicitly requested.
