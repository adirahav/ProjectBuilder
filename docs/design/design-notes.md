# Hila Tours — Design Notes

**Author:** Designer Agent (runs once per project)
**Output:** `docs/design/mockups/*.html` — self-contained, opens directly in a browser (Tailwind CDN).
**Status:** v1, awaiting design review.

These mockups are a *visual reference*, not a component library. The Frontend Agent re-implements
them as real React components (real state, real accessibility, real Tailwind v4 `@theme` tokens per
`.rule/style-rules.md`) — nothing here is copy-pasted into `frontend/src/**`.

---

## 1. Screen selection & reasoning

`docs/PRD.md` defines 4 screens (one with 3 tabs) = 6 distinct surfaces. Four mockups cover the app's
full visual range:

| File | Screen | Why it earns a file |
|---|---|---|
| `gateway-login.html` | Screen 1 — Gateway (Login) | The data-light "decision" layout + the modal + form-field + inline-error pattern used everywhere else. Establishes brand-first impression. |
| `passenger-view.html` | Screen 3 — Passenger View | The most visually distinctive screen: tour/bus selector, the seat map with all four `seatStatus` states, the legend, and the seat-request modal (form + `pickupPoint` select). |
| `admin-seat-management.html` | Screen 4a — Seat Management | Same seat map in an *authenticated admin shell* (top bar, tabs, sidebar quick-actions) — proves the seat grid survives a denser chrome. Includes the manual-assign / move / swap modal. |
| `admin-manifest-report.html` | Screen 4c — Passenger Manifest Report | The product's *other* core layout: list + filter + free-text search + status pills + a table, distinct from the seat-map grid. |

**Deliberately not mocked:** Screen 2 (Admin Signup) is the gateway's form pattern on a standalone
page — zero new visual vocabulary. Tab 4b (Tours & Buses) is CRUD lists + modals already fully
covered by the manifest table (list/filter) and the two modals shown elsewhere.

---

## 2. Visual system

### Direction & language
Hebrew-only, RTL (PRD Non-Functional Requirements). Every mockup sets `dir="rtl" lang="he"` on
`<html>` and uses **logical properties only** (`margin-inline-start`, `padding-inline-end`,
`border-inline-start`, `text-align: start`, Tailwind `ms-*`/`me-*`/`ps-*`/`pe-*`/`text-start`).
No `left`/`right` physical values appear anywhere. See the `css-layer` skill.

### Color palette — "Aegean" (deep sea-teal + sun accent, travel-warm but calm)

**Brand**
| Token | Hex | Use |
|---|---|---|
| `primary-900` | `#0B3A47` | Headings, top bar background, highest-contrast text on light |
| `primary-700` | `#115E75` | Primary button background, active tab underline |
| `primary-500` | `#1A8CA8` | Interactive accents, focus ring, links |
| `primary-100` | `#DCEFF4` | Selected-row tint, subtle brand background |
| `accent-500` | `#E8873A` | Sun accent — single high-emphasis CTA per screen, brand mark |
| `accent-100` | `#FDF0E4` | Accent background tint |

**Semantic**
| Token | Hex | Tint |
|---|---|---|
| `success-600` | `#2F855A` | `success-50` `#E6F4EC` |
| `warning-600` | `#B7791F` | `warning-50` `#FDF3DC` |
| `danger-600`  | `#C53030` | `danger-50`  `#FBEAEA` |
| `info-600`    | `#2B6CB0` | `info-50`    `#E7F0FA` |

**Neutrals**
`n-0 #FFFFFF` · `n-50 #F7F8FA` · `n-100 #EDEFF3` · `n-200 #D8DCE3` · `n-400 #9AA3AF` ·
`n-500 #5B6472` · `n-700 #333B47` · `n-900 #1A1F27`

Page background is `n-50`; surfaces/cards are `n-0`.

### Seat status colors (the one place color encodes domain state)

Chosen so the four are distinguishable by **hue, fill weight, icon, and label** — grayscale-safe
per AC-17. Each also differs in lightness (white → amber tint → mid-gray → violet tint), so they
remain separable with color removed entirely.

| `seatStatus` | Fill | Border | Text | Icon | Hebrew label |
|---|---|---|---|---|---|
| `available` | `#FFFFFF` | `#1A8CA8` | `#0B3A47` | `✓` | פנוי |
| `pending`   | `#FDF3DC` | `#B7791F` | `#7A5312` | `⏳` | ממתין לאישור |
| `taken`     | `#D8DCE3` | `#5B6472` | `#333B47` | `👤` | תפוס |
| `reserved`  | `#EFE9FB` | `#6B46C1` | `#4C2E9E` | `🔒` | שמור |

`reserved` introduces `#6B46C1` / `#EFE9FB` / `#4C2E9E` — the only violet in the system, reserved
(literally) for this one status so admin-held seats never read as "just another taken seat".

Every seat in every mockup carries an `aria-label` of the form `מושב <n> — <status label>` plus a
visible icon. Color is never the sole signal. The Frontend Agent should encode this as a
`seatStatusStyles: Record<SeatStatus, string>` lookup per `.rule/style-rules.md`.

### Typography
- **Stack:** `'Heebo', 'Segoe UI', system-ui, -apple-system, sans-serif` — Heebo is a Hebrew-first
  Google font with full Latin coverage, loaded from the Google Fonts CDN.
- **Scale (only these six sizes are used):**

| Name | Size / line-height | Weight | Use |
|---|---|---|---|
| `display` | 30px / 38px | 700 | Gateway brand title only |
| `h1` | 24px / 32px | 700 | Screen title |
| `h2` | 20px / 28px | 600 | Card / section title, modal title |
| `body` | 16px / 24px | 400 | Default body, form inputs |
| `label` | 14px / 20px | 500 | Field labels, table headers, buttons |
| `caption` | 12px / 16px | 500 | Helper text, badges, seat numbers |

Numerals (seat numbers, phone numbers) render LTR inside RTL text via `direction: ltr; unicode-bidi: isolate`.

### Spacing scale
Exactly seven values — **4, 8, 12, 16, 24, 32, 48 px** (Tailwind `1, 2, 3, 4, 6, 8, 12`).
Nothing else. Conventional usage: `8` inside controls, `16` inside cards, `24` between cards,
`32`/`48` for page gutters on desktop. Seat grid gap is `8`.

### Radius
- `8px` — buttons, inputs, seats, badges-with-square-feel
- `12px` — cards, modals, panels
- `999px` — status pills, avatars, toggle chips

### Elevation
- `shadow-sm` — `0 1px 2px rgba(16,24,40,.06)` — resting cards
- `shadow-md` — `0 4px 12px rgba(16,24,40,.08)` — dropdowns, sticky bars
- `shadow-lg` — `0 12px 32px rgba(16,24,40,.16)` — modals

### Component conventions
- **Buttons** — `8px` radius, `label` type (14/500), height 40px (`py-2 px-4`), 32px for compact
  table-row actions.
  - *Primary:* `primary-700` fill, white text. Hover `primary-900`.
  - *Accent:* `accent-500` fill, white text — at most **one per screen** (the main CTA).
  - *Secondary:* `n-0` fill, `n-200` border, `n-700` text. Hover `n-50`.
  - *Ghost:* transparent, `primary-700` text. Hover `primary-100`.
  - *Danger:* `danger-50` fill, `danger-600` text/border.
  - *Disabled:* 45% opacity, `cursor: not-allowed`.
- **Focus** — a single global convention: `outline: 2px solid #1A8CA8; outline-offset: 2px`.
  Always visible, never removed (WCAG 2.1 AA, keyboard nav).
- **Cards** — `n-0` surface, `1px solid n-100` border, `12px` radius, `shadow-sm`, `16px` padding
  (`24px` on desktop). Optional header row separated by a `n-100` hairline.
- **Form fields** — stacked label above input; input is 40px tall, `8px` radius, `1px solid n-200`,
  `n-0` fill, `16px` text. Focus adds the global ring + `primary-500` border. Error state:
  `danger-600` border + a `caption` message in `danger-600` beneath, with `aria-describedby`.
- **Modals** — centered, `12px` radius, `shadow-lg`, max-width 480px (forms) / 560px (swap-move),
  scrim `rgba(11,58,71,.55)`. Title `h2`, close "✕" in the inline-start corner (RTL-correct),
  actions right-aligned to the inline-end edge.
- **Status pills** — full radius, `caption` text, tinted background + matching 600-level text,
  always icon + text.
- **Tabs** — text tabs with a 2px `primary-700` underline on the active tab; inactive `n-500`.
- **Tables** — `n-50` header row with `label` type, `n-100` row hairlines, hover `primary-100/40`,
  no vertical rules.

### Responsiveness
Mobile-first (PRD NFR). Mockups are authored at the mobile layout and use `md:` upgrades:
the admin shell collapses its side panel below `md`, the manifest table becomes stacked cards, and
the seat map keeps its natural grid at all widths (it is intrinsically narrow).

---

## 3. Handoff to `.rule/style-rules.md`

The `@theme` block currently marked "TBD from mockups" maps directly:

```css
--color-primary:        #115E75;
--color-secondary:      #0B3A47;
--color-accent:         #E8873A;
--color-danger:         #C53030;
--color-success:        #2F855A;
--color-warning:        #B7791F;

--color-seat-available: #FFFFFF; /* border #1A8CA8 */
--color-seat-pending:   #FDF3DC; /* border #B7791F */
--color-seat-taken:     #D8DCE3; /* border #5B6472 */
--color-seat-reserved:  #EFE9FB; /* border #6B46C1 */
```

Radius: use raw Tailwind utilities (`rounded-lg` = 8px, `rounded-xl` = 12px, `rounded-full`) — no
custom `--radius-*` tokens needed, since the system only uses three values that already map cleanly.

Icons: mockups use emoji as stand-ins so the files stay dependency-free. The real implementation
should substitute Lucide icons — `Check` (available), `Clock` (pending), `User` (taken),
`Lock` (reserved) — keeping the same text labels.
