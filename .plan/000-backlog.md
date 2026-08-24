# Prioritized Backlog

Current queue:

- [x] Scaffold frontend project (Vite + React + TS + Tailwind v4 + Zustand + Lucide React) | scope: frontend
- [x] Scaffold tour-service backend project (package.json, Express, Mongoose, MONGODB_URI) | scope: tour-service
- [ ] Scaffold user-management-service backend project (package.json, Express, Mongoose, MONGODB_URI, JWT) | scope: user-management-service
- [ ] Install root/frontend/backend dependencies | scope: none
- [ ] Admin signup page | scope: frontend,user-management-service,qa | url: /signup
- [ ] Gateway (login) screen — passenger vs admin entry, admin login modal | scope: frontend,user-management-service,qa,security | url: /
- [ ] Passenger view — tour/bus selector + interactive seat map | scope: frontend,tour-service,qa | url: /tours
- [ ] Seat-request modal (name, phone, pickup point) with concurrency-safe request handling | scope: frontend,tour-service,qa,security | url: /tours
- [ ] Admin dashboard shell with 3 tabs (Seat Management, Tours & Buses, Passenger Manifest Report) | scope: frontend,qa,security | url: /admin
- [ ] Admin dashboard — Seat Management tab (approve/cancel/toggle-reserve quick actions) | scope: frontend,tour-service,qa,security | url: /admin
- [ ] Admin dashboard — manual-assign / move / swap modal | scope: frontend,tour-service,qa,security | url: /admin
- [ ] Admin dashboard — Tours & Buses tab (tour CRUD, soft-delete) | scope: frontend,tour-service,qa
- [ ] Admin dashboard — Tours & Buses tab (bus CRUD, pickup-points list, create-from-busType) | scope: frontend,tour-service,qa
- [ ] Admin dashboard — bus-type template management (add/duplicate/reset-to-default/delete, one default) | scope: frontend,tour-service,qa
- [ ] Admin dashboard — Passenger Manifest Report tab (filter, search, copy report) | scope: frontend,tour-service,qa,security
- [ ] Admin promotion — roles endpoint and UI affordance (`PATCH /api/admins/:id/roles`) | scope: frontend,user-management-service,qa,security
- [ ] Native Android build via Capacitor, JWT in @capacitor/preferences | scope: frontend,qa
