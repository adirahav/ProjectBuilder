# Prioritized Backlog

Each line is one task, consumed in order by `development/dev-loop.js` (`getNextBacklogTask`). Format:
`- [ ] <Title> | <field>: <value> | scope: <agentKey1,agentKey2,...>`

Recognized fields: `cmd:` (a literal shell command run directly, no agent), `scope:` (comma-separated subset of `frontend, gateway, appointment-service, user-service, qa, security`, or `none`), `url:` (route opened in the browser once the task finishes). This file is meant to be curated by hand before running `development/dev-loop.js` — prune, reorder, or add tasks as needed.

Current queue:

- [ ] Create frontend project (Vite + React + TypeScript) | cmd: npm create vite@latest frontend -- --template react-ts | scope: none
- [ ] Install frontend dependencies (Tailwind v4, Zustand, Lucide React, react-hot-toast, react-router-dom) | scope: frontend
- [ ] Scaffold gateway service package.json (Express, http-proxy-middleware, jsonwebtoken) | scope: gateway
- [ ] Scaffold appointment-service package.json (Express, Mongoose, jsonwebtoken not required) | scope: appointment-service
- [ ] Scaffold user-service package.json (Express, Mongoose, jsonwebtoken, bcrypt) | scope: user-service
- [ ] Set up shared backend env (backend/.env.shared from backend/.env.shared.example: MONGODB_URI, JWT_SECRET, JWT_EXPIRES_IN, FRONTEND_ORIGIN) | scope: none
- [ ] Public service list screen | scope: frontend,appointment-service,qa | url: /
- [ ] TimeSlot picker screen (date/time selection, hold-on-select) | scope: frontend,appointment-service,qa,security | url: /book/:serviceId
- [ ] Contact details & confirm booking screen | scope: frontend,appointment-service,qa,security | url: /book/:serviceId/:timeSlotId/confirm
- [ ] Booking confirmation screen | scope: frontend,appointment-service,qa | url: /appointments/:id
- [ ] Admin login screen | scope: frontend,user-service,qa,security | url: /admin/login
- [ ] Admin dashboard — appointments (list, confirm, cancel) | scope: frontend,appointment-service,qa,security | url: /admin/appointments
- [ ] Admin dashboard — services (list, create, edit, deactivate) | scope: frontend,appointment-service,qa | url: /admin/services
- [ ] Gateway deploy/production setup (static frontend serving + reverse proxy) | scope: gateway,frontend,security
