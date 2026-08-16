# UI Rules

<!--
TEMPLATE — fill during project setup. Placeholders:
  {{TOAST_LIBRARY}}, {{ICON_LIBRARY}}, {{ANIMATION_LIBRARY}}, {{CONTESTED_ENTITY}}
Ask the user: "Which UI libraries do you standardize on for toasts/icons/animation?"
Delete this comment block once filled.
-->

## Purpose
- Define default UI libraries for common interface elements.

## Library Choices
- Use `{{TOAST_LIBRARY}}` for toast messages.
- Use `{{ICON_LIBRARY}}` for icons.
- Use `{{ANIMATION_LIBRARY}}` for animations and transitions.

## Usage Notes
- Keep notifications concise and action-oriented — especially for any action on `{{CONTESTED_ENTITY}}` (e.g. "Item approved", "That item was just taken — pick another").
- Reuse icon names consistently across similar features (e.g. one consistent icon per status value across every view that shows it).
- Prefer `{{ANIMATION_LIBRARY}}` variants and transitions over CSS animations for interactive elements — this applies especially to any high-traffic, status-driven view, where state changes should animate rather than snap instantly.
