# Style Rules

## Purpose
- Define CSS organization and maintainable styling patterns for this app (`frontend/`, Dog Grooming Appointment Booking System). There is no external design source (no Figma/AI-Studio export) — the Frontend Agent designs the UI itself, choosing tokens below to fit a warm, approachable pet-care brand feel, and keeping this file as the single source of truth for them.

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
  /* Colors */
  --color-primary: #2f6f4f;      /* deep grooming-brand green */
  --color-primary-light: #eaf5ee;
  --color-accent: #d98c3d;       /* warm accent (paw/amber) */
  --color-danger: #c0392b;
  --color-success: #2f6f4f;
  --color-warning: #d98c3d;
  --color-neutral-50: #fafafa;
  --color-neutral-900: #1f2320;
}
```

- Confirmed tokens: `primary`, `primary-light`, `accent`, `danger`, `success`, `warning`, `neutral-50`, `neutral-900` (above). Open/TBD: hover-state variants, a dedicated typography token, a subtle-border token — add them here once decided during Frontend Agent implementation.
- `--radius-*` tokens are not defined separately; use raw Tailwind radius utilities directly (e.g. `rounded-xl`).

## Domain-Specific Color Mapping
- `TimeSlot.status` (`open`/`held`/`booked`) and `Appointment.status` (`pending`/`confirmed`/`cancelled`) are the two places color directly encodes domain state. Map each status to a token, not a raw hex value:
  - `open` → `success` token (available), `held` → `warning` token (transiently claimed), `booked` → `neutral-900`/muted (unavailable).
  - `pending` → `warning` token, `confirmed` → `success` token, `cancelled` → `danger` token.
- Encode each mapping as a small lookup (e.g. `timeSlotStatusStyles: Record<TimeSlotStatus, string>`, `appointmentStatusStyles: Record<AppointmentStatus, string>`) rather than scattering inline conditionals across components. Per `accessibility-layer`, color is always paired with a text label or icon — never the sole signal.

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
- Hover-state variants, typography token, and subtle-border token not yet decided — finalize during initial Frontend Agent build-out.
