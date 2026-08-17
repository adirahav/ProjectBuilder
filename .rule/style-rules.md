# Style Rules

## Purpose
- Define CSS organization and maintainable styling patterns for this app (`frontend/`, BookMe).

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
  /* Colors — calm blue/pink palette, chosen for a clinic/spa context (no external design source) */
  --color-primary: #3B82C4;       /* calm blue — primary actions, headers */
  --color-primary-hover: #2E6699;
  --color-accent: #E8A0BC;        /* soft pink — secondary accents, highlights */
  --color-accent-hover: #D98AA8;
  --color-background: #FAFBFC;
  --color-surface: #FFFFFF;
  --color-foreground: #1F2937;
  --color-muted: #6B7280;
  --color-border: #E5E7EB;
  --color-danger: #DC2626;
  --color-success: #16A34A;
  --color-warning: #D97706;
}
```

- All tokens above are confirmed (user-stated brand preference: calm blue/pink, no external design source) — none are TBD.
- `--radius-*` tokens are not defined; use raw Tailwind radius utilities directly (e.g. `rounded-xl`) for consistency with the utility-first approach.

## Domain-Specific Color Mapping
`TimeSlot` and `Appointment` are the status-driven entities in the UI. Map each status to a token, not a raw hex value, so the mapping stays centralized and themeable. Encode both as a lookup (e.g. `timeSlotStatusStyles: Record<TimeSlotStatus, string>`, `appointmentStatusStyles: Record<AppointmentStatus, string>`) rather than scattering inline conditionals across components. Per `.rule/accessibility-layer` and `docs/PRD.md` AC-8, status must always be paired with a text label or icon, never color alone.

| Status | Token |
|---|---|
| `TimeSlot: available` | `--color-success` |
| `TimeSlot: held` | `--color-warning` |
| `TimeSlot: booked` | `--color-muted` |
| `Appointment: pending` | `--color-warning` |
| `Appointment: confirmed` | `--color-success` |
| `Appointment: completed` | `--color-muted` |
| `Appointment: cancelled` | `--color-danger` |

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

