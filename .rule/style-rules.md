# Style Rules

## Purpose
- Define CSS organization and maintainable styling patterns for this app (`frontend/`, ClinicBook).

## Stack
- Tailwind CSS v4 (CSS-first, via `@tailwindcss/vite` — no `tailwind.config.js`) — utility-first styling.
- `cn()` — for conditional class merging (via `clsx` + `tailwind-merge`), located at `frontend/src/lib/utils.ts`.
- Tailwind utilities are the default for all styling. Custom CSS in `main.css` is limited to what utilities genuinely cannot express (see File Structure below).

## Theme Configuration
- All design tokens are defined in `frontend/src/main.css` using Tailwind v4's `@theme` block.
- Do not hardcode colors, fonts, or spacing inline — always reference theme tokens via their generated utility classes.
- Current tokens (extend this list here as new tokens are added — do not let this drift from `main.css`):

```css
/* frontend/src/main.css */
@import "tailwindcss";

@theme {
  /* Colors — no external design source for this project; the Frontend Agent owns these tokens
     and may adjust exact hex values during implementation, but must not introduce ad-hoc colors
     outside this block. */
  --color-primary: #0f766e;      /* teal — primary brand/action color */
  --color-primary-hover: #0d5f59;
  --color-secondary: #f5f5f4;    /* neutral background */
  --color-accent: #f59e0b;       /* amber — highlights, pending state */
  --color-danger: #dc2626;       /* cancelled / errors */
  --color-success: #16a34a;      /* approved / completed */
  --color-warning: #f59e0b;      /* pending / held */
  --color-text: #1c1917;
  --color-text-muted: #78716c;
  --color-border: #e7e5e4;
}
```

- No external design source exists for this project (no Figma/AI-Studio export) — the Frontend Agent designs the UI per this token set and the patterns below, rather than matching an external reference.
- `--radius-*` tokens are not defined separately; use raw Tailwind radius utilities directly (e.g. `rounded-xl`).

## Domain-Specific Color Mapping
`TimeSlot` and `Appointment` are the status-driven entities where color directly encodes domain state. Map each status to a token, not a raw hex value, so the mapping stays centralized and themeable — and always pair color with an icon/label (see `accessibility-layer` skill), never color alone.

| Status | Token |
|---|---|
| `TimeSlot.available` | `--color-success` |
| `TimeSlot.held` / `Appointment.pending` | `--color-warning` |
| `TimeSlot.booked` / `Appointment.approved` | `--color-primary` |
| `TimeSlot.blocked` / `Appointment.cancelled` | `--color-danger` |
| `Appointment.completed` | `--color-text-muted` |

Encode this mapping as a small lookup (e.g. `statusStyles: Record<TimeSlotStatus | AppointmentStatus, string>`) rather than scattering inline conditionals across components.

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
  Submit
</button>
```

## Authoring Rules
- Use Tailwind utility classes directly on elements — do not introduce new custom CSS classes or CSS Modules for component styling.
- Reference `@theme` tokens via Tailwind's generated utilities (e.g. `bg-primary`, `text-secondary`, `border-accent`).
- Use `cn()` whenever classes depend on props, state, or conditions.
- Keep className strings readable — break long strings across lines when needed.
- Do not use `style={{}}` inline styles for anything expressible in Tailwind. Inline styles are only acceptable for genuinely runtime-computed values — never for static styling.

## File Structure
- `frontend/src/main.css` — entry point: `@import "tailwindcss"`, the `@theme` block, and the limited set of things Tailwind utilities can't express.
  - Do not add anything here that a Tailwind utility class could express instead.
- `frontend/src/lib/utils.ts` — `cn()` utility for class merging.

## Open Questions / TBD
- Exact hex values above are Frontend Agent defaults, not a client-approved brand palette — revisit if the business owner supplies brand colors later.
