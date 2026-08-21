# Prioritized Backlog

Current queue:

- [x] Scaffold frontend project (Vite + React + TypeScript + Tailwind v4) | scope: none | cmd: npm create vite@latest frontend -- --template react-ts
- [x] Install root and frontend dependencies (Zustand, Axios, lucide-react, sonner, framer-motion, clsx, tailwind-merge) | scope: none
- [x] Scaffold api-gateway service (package.json, Express, health check) | scope: api-gateway
- [x] Scaffold booking-service (package.json, Express, Mongoose, health check) | scope: booking-service
- [x] Scaffold user-service (package.json, Express, Mongoose, JWT libs, health check) | scope: user-service
- [x] Scaffold notification-service (package.json, Express, health check) | scope: notification-service
- [x] Service List page (public Customer screen) | scope: frontend,booking-service,qa | url: /
- [x] Time Slot Picker page (date/slot selection, hold-on-select) | scope: frontend,booking-service,qa,security | url: /book/example-service-id
- [x] Customer Details Form (name/phone/email, creates Appointment) | scope: frontend,booking-service,notification-service,qa,security | url: /book/example-service-id
- [x] Booking Confirmation page | scope: frontend,booking-service,qa | url: /confirmation/example-appointment-id
- [x] Admin Login page and auth flow | scope: frontend,user-service,api-gateway,qa,security | url: /admin/login
- [x] Admin Dashboard: Services management (create/edit/deactivate) | scope: frontend,booking-service,api-gateway,qa,security | url: /admin
- [x] Admin Dashboard: Appointments management (confirm/cancel) | scope: frontend,booking-service,api-gateway,qa,security | url: /admin/appointments
- [x] Hebrew/English i18n + RTL/LTR direction toggle | scope: frontend,qa
- [ ] Native (Capacitor) Android/iOS wrap-up and back-button navigation | scope: frontend,qa
- [ ] Deploy setup: api-gateway serves built frontend and reverse-proxies | scope: api-gateway,frontend
