# Style Rules

<!--
TEMPLATE — fill during project setup. Placeholders:
  {{PROJECT_NAME}}, {{DESIGN_TOKENS}} (color hex values), {{DESIGN_SOURCE}} (e.g. Figma, AI Studio export — if no design source exists per Part 1 Q9, {{DESIGN_TOKENS}} come from the user's brand preferences instead, and every {{DESIGN_SOURCE}} reference below should read "the user's stated brand preferences" rather than an external file/tool)
  {{CONTESTED_ENTITY}}, {{STATUS_VALUES}} — if a status-driven entity with color mapping exists
Ask the user: "What are your brand color tokens (hex values)?" "Does any domain status value need a dedicated color mapping?"
Delete this comment block once filled.
-->

## Purpose
- Define CSS organization and maintainable styling patterns for this app (`frontend/`, {{PROJECT_NAME}}).

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
  {{DESIGN_TOKENS}}
}
```

- List which tokens are confirmed (from {{DESIGN_SOURCE}}) vs. still open, e.g. hover-state variants, danger/success/warning colors, a typography token, a subtle-border token — add them once decided, and remove the "TBD" framing once done.
- Decide whether `--radius-*` tokens are defined, or whether raw Tailwind radius utilities are used directly (e.g. `rounded-xl`).

## Domain-Specific Color Mapping (fill in if a status-driven entity exists)
- If `{{CONTESTED_ENTITY}}` exists, it's likely the one place in the UI where color directly encodes domain state. Map each status ({{STATUS_VALUES}}) to a token, not a raw hex value, so the mapping stays centralized and themeable.
- Once this mapping is decided, encode it as a small lookup (e.g. `statusStyles: Record<Status, string>`) rather than scattering inline conditionals across components.

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
- Confirm any not-yet-decided design tokens.
- Decide the final color-to-status mapping above (if applicable) and remove the "TBD" framing once locked in.
