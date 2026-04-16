# CMMSv2 Project Analysis Report

## Project Overview

CMMSv2 is a multi-organization computerized maintenance management system for plant operations. The repository describes it as a full-stack CMMS with a React frontend, Express backend, PostgreSQL persistence, Docker deployment, RBAC, notifications, QR-based asset access, audit logging, and PWA support. The consolidated handover and security plan lives in [README.md](README.md#L3) and [FINAL_PROJECT_DOCUMENTATION.md](FINAL_PROJECT_DOCUMENTATION.md#L5).

The application is built to serve both operational maintenance teams and higher-level governance users. It supports root-level administration, organization and plant management, asset and work-order workflows, preventive maintenance, calibration, AMC, inventory, ESG, reporting, notifications, QR journeys, gate entry, visitor experience, and security operations.

## Purpose And Core Functionality

- Centralize maintenance operations across multiple organizations and plants.
- Give technicians, supervisors, admins, and root admins different experiences and permissions based on scope.
- Track the lifecycle of assets, work orders, PM schedules, calibration tasks, AMC visits, inventory actions, safety incidents, ESG data, and gate activity.
- Surface operational state through dashboards, notifications, alerts, reports, and health views.
- Support mobile and QR-driven workflows for field and shop-floor usage.

## Target Audience And Use Cases

- Maintenance technicians who need mobile-friendly access to work orders, scans, and quick asset views.
- Plant admins and maintenance managers who need work execution, scheduling, approvals, inventory, and reporting.
- Security and gate teams who need visitor and gate entry processing.
- Root admins and super admins who need organization, plant, role, and permission governance.
- Compliance and operations teams who need audit trails, security center views, system health, and exportable reports.

## Features

### Identity, Sessions, And Access Control

- Login, refresh, logout, profile retrieval, and MFA setup/enable/disable are implemented in the auth routes. The backend uses JWT access tokens, rotating refresh tokens, CSRF validation for cookie-based refresh, and session cookies, which reduces token theft risk and supports safer browser sessions. See [backend/src/modules/auth/auth.routes.ts](backend/src/modules/auth/auth.routes.ts#L670) and [backend/src/middlewares/authMiddleware.ts](backend/src/middlewares/authMiddleware.ts#L1).
- Role and permission enforcement is applied at request time and is scope-aware. The permission middleware blocks unauthorized organization, plant, and role-access mutations and records security events for denials. See [backend/src/middlewares/permissions.ts](backend/src/middlewares/permissions.ts#L1).
- The frontend mirrors those rules with route guards and role-aware redirects, which improves usability by sending users directly to the right area for their scope. See [frontend/src/App.tsx](frontend/src/App.tsx#L1) and [frontend/src/store/auth.store.ts](frontend/src/store/auth.store.ts#L40).

### Dashboard And Shell

- The app shell uses a responsive sidebar, topbar, footer, and mobile bottom navigation. That structure keeps the primary work areas visible on desktop while still being usable on phones and tablets. See [frontend/src/components/layout/MainLayout.tsx](frontend/src/components/layout/MainLayout.tsx#L15), [frontend/src/components/layout/Sidebar.tsx](frontend/src/components/layout/Sidebar.tsx#L1), [frontend/src/components/layout/Topbar.tsx](frontend/src/components/layout/Topbar.tsx#L1), and [frontend/src/components/layout/BottomNav.tsx](frontend/src/components/layout/BottomNav.tsx#L1).
- Dynamic branding updates the browser title, favicon, manifest, and brand colors at runtime based on organization context. This is useful for multi-tenant deployments and white-label style usage. See [backend/src/modules/branding/branding.routes.ts](backend/src/modules/branding/branding.routes.ts#L181) and [frontend/src/components/layout/MainLayout.tsx](frontend/src/components/layout/MainLayout.tsx#L104).
- The shell also loads organization features and branding as soon as authentication is established, so module visibility adapts to the current tenant. See [frontend/src/store/features.store.ts](frontend/src/store/features.store.ts#L1) and [frontend/src/store/branding.store.ts](frontend/src/store/branding.store.ts#L1).

### Work Orders And Maintenance Execution

- Work orders support listing, queue summaries, activity timelines, triage, start, submit for approval, approve, reject, create, update, and delete. This covers the full maintenance execution flow from intake to closure. See [backend/src/modules/workorders/workorders.routes.ts](backend/src/modules/workorders/workorders.routes.ts#L1).
- The frontend exposes work order pages, technician views, and mobile QR flows, which makes the product usable both in office and on the shop floor. See [frontend/src/App.tsx](frontend/src/App.tsx#L1).

### Asset Management And QR Access

- Asset management includes list, create, update, delete, asset overview, template options, energy meter configs, and work-order linkage. That gives the platform a proper asset master and operational view. See [backend/src/modules/assets/assets.routes.ts](backend/src/modules/assets/assets.routes.ts#L138).
- QR issuance, rotation, public resolution, and resolve-by-code flows are built into the backend. That enables machine labels, field scanning, and public resolver pages without exposing internal identifiers. See [backend/src/modules/qr/qr.routes.ts](backend/src/modules/qr/qr.routes.ts#L1).
- The frontend supports QR scan resolution, live camera scanning, machine quick cards, and public QR asset pages. This is a strong field-operations feature set for technicians and visitors. See [frontend/src/App.tsx](frontend/src/App.tsx#L1).

### PM, Calibration, And AMC

- Preventive maintenance schedules support list, detail, create, update, and delete operations. This is the scheduling backbone for recurring maintenance. See [backend/src/modules/pmSchedules/pmschedules.routes.ts](backend/src/modules/pmSchedules/pmschedules.routes.ts#L199).
- Calibration supports multiple routes and lifecycle actions across templates, records, and scheduling, which suggests a specialized quality-maintenance workflow rather than a simple checklist app. See [backend/src/modules/calibration/calibration.routes.ts](backend/src/modules/calibration/calibration.routes.ts#L324).
- AMC supports dashboards, portal views, visits, service reports, asset summaries, visit-task generation, vendor notifications, and CRUD operations. That makes it useful for service contracts and external maintenance vendors. See [backend/src/modules/amc/amc.routes.ts](backend/src/modules/amc/amc.routes.ts#L358).

### Inventory And Spare Maintenance

- Inventory includes spare master records plus stock-request workflows with create, update, and delete actions. This gives the application a spare-parts control layer alongside maintenance execution. See [backend/src/modules/inventory/inventory.routes.ts](backend/src/modules/inventory/inventory.routes.ts#L63).

### Notifications And Realtime Updates

- Notifications support server-sent event streaming, list retrieval, unread counts, mark-as-read, bulk read, single-item updates, creation, role-based fan-out, and deletion. That makes operational alerts actionable rather than passive. See [backend/src/modules/notifications/notifications.routes.ts](backend/src/modules/notifications/notifications.routes.ts#L38) and [backend/src/modules/notifications/notification-stream.ts](backend/src/modules/notifications/notification-stream.ts#L1).
- The frontend topbar consumes notifications directly and lets users open, mark, or clear them in place. That improves response time for urgent work and security events. See [frontend/src/components/layout/Topbar.tsx](frontend/src/components/layout/Topbar.tsx#L1).
- Dashboard refreshes are also pushed over WebSocket after successful mutations and on a periodic interval, which reduces stale dashboard state. See [backend/src/realtime/dashboard-socket.ts](backend/src/realtime/dashboard-socket.ts#L1) and [backend/src/app.ts](backend/src/app.ts#L73).

### Gate Entry, Visitor Experience, And Security

- Gate management includes gate definitions, gate templates, template fields, template users, gate entries, exit actions, vehicle/material entries, dashboard summaries, reports, and token-based gate passes. That is a substantial access-control and site-operations subsystem. See [backend/src/modules/gates/gates.routes.ts](backend/src/modules/gates/gates.routes.ts#L671).
- Visitor experience routes and smart visitor flows extend the gate domain into front-office and check-in use cases. This makes the app useful beyond pure maintenance. See [backend/src/routes/index.ts](backend/src/routes/index.ts#L1) and [frontend/src/App.tsx](frontend/src/App.tsx#L1).
- Security Center provides security events, acknowledgements, exports, audit logs, control-operation records, backup recovery drills, file-security reviews, supplier-security attestations, dashboard views, and compliance views. This is one of the strongest platform-level differentiators. See [backend/src/modules/security/security.routes.ts](backend/src/modules/security/security.routes.ts#L251).
- Alerts provide alert-log review, acknowledgement, resolution, and export functionality, which complements the security center with operational incident tracking. See [backend/src/modules/alerts/alerts.routes.ts](backend/src/modules/alerts/alerts.routes.ts#L42).

### Reporting, Analytics, And Decision Support

- Reports support report definitions, schedules, history, on-demand sending, test email, report email delivery, advanced reliability reporting, and exports. This supports both recurring management reporting and ad hoc analysis. See [backend/src/modules/reports/reports.routes.ts](backend/src/modules/reports/reports.routes.ts#L310).
- Benchmarking provides asset-type comparison, asset comparison, and compare views for super-admin analysis. This is helpful for cross-site performance review. See [backend/src/modules/benchmarking/benchmarking.routes.ts](backend/src/modules/benchmarking/benchmarking.routes.ts#L58).
- ESG supports access control, master KPIs, emission factors, targets, authorized users, analytics, dashboards, daily data entry, energy, water, emissions, waste, production, locking, and reporting. This is a mature operational sustainability module. See [backend/src/modules/esg/esg.routes.ts](backend/src/modules/esg/esg.routes.ts#L425).
- Safety supports incidents and metrics with full CRUD-style coverage for reporting and follow-up. See [backend/src/modules/safety/safety.routes.ts](backend/src/modules/safety/safety.routes.ts#L45).

### Master Data And Administration

- Users support list, profiles, create, profile update, role assignment, password updates, and deletion. This covers day-to-day identity management. See [backend/src/modules/users/users.routes.ts](backend/src/modules/users/users.routes.ts#L197).
- Organizations support list, detail, create, update, and delete, with scope enforcement and protection for reserved identities. See [backend/src/modules/organizations/organizations.routes.ts](backend/src/modules/organizations/organizations.routes.ts#L185).
- Plants are managed through a CRUD router and are the basis for plant scoping throughout the platform. See [backend/src/modules/plants/plants.routes.ts](backend/src/modules/plants/plants.routes.ts#L1).
- Roles and permissions are split into catalog, user-role assignment, permission listing, and role-permission assignment. This is a flexible RBAC layer, not just a static role enum. See [backend/src/modules/roles/roles.routes.ts](backend/src/modules/roles/roles.routes.ts#L60) and [backend/src/modules/permissions/permissions.routes.ts](backend/src/modules/permissions/permissions.routes.ts#L26).
- Modules and features are first-class platform concepts, which supports per-organization rollout and modular UI gating. See [backend/src/modules/modules/modules.routes.ts](backend/src/modules/modules/modules.routes.ts#L17) and [backend/src/modules/features/features.routes.ts](backend/src/modules/features/features.routes.ts#L1).
- The root-admin area provides governance over organizations, plants, users, and role access. This is important for multi-tenant control and platform administration. See [frontend/src/App.tsx](frontend/src/App.tsx#L1) and [frontend/src/components/layout/Sidebar.tsx](frontend/src/components/layout/Sidebar.tsx#L1).

### System, Branding, And Operational Health

- Branding routes expose logo, favicon, current branding, version, and manifest endpoints. This enables runtime brand switching and PWA metadata changes per organization. See [backend/src/modules/branding/branding.routes.ts](backend/src/modules/branding/branding.routes.ts#L181).
- System routes expose health, detailed health, performance, and error views. That makes the platform more supportable in production and easier to monitor. See [backend/src/modules/system/system.routes.ts](backend/src/modules/system/system.routes.ts#L11).
- The frontend PWA runtime registers the service worker, background sync, and periodic sync for offline mutation handling, which is especially useful for field users. See [frontend/src/mobile/runtime.ts](frontend/src/mobile/runtime.ts#L1).

## Technology Stack

### Frontend

- React 18 and TypeScript provide the component model and type safety.
- Vite provides fast development and production builds.
- React Router manages nested app routing and protected/public route separation.
- TanStack Query manages remote state and retry behavior.
- Zustand stores auth, branding, and feature state with low ceremony.
- Tailwind CSS and Radix UI provide the styling system and accessible primitives.
- Framer Motion supports animated shell interactions.
- Vite PWA packaging gives installability and runtime caching.
- html5-qrcode, qrcode, and camera-aware UI support QR scanning journeys.
- Recharts supports chart and dashboard visualization.
- Sonner and UI toast components handle feedback and error surfacing.

### Backend

- Express is the HTTP application layer.
- TypeScript adds compile-time safety to routes, services, and middleware.
- TypeORM manages entities, migrations, and repository access.
- Zod validates request payloads and environment configuration.
- JWT powers access, refresh, and challenge tokens.
- Helmet, CORS, cookie-parser, and express-rate-limit provide transport and abuse controls.
- Pino and pino-http provide structured logging with redaction.
- ws and server-sent events provide realtime dashboard and notification delivery.
- bcryptjs, crypto helpers, and AES-GCM utilities support password and sensitive-value handling.
- node-cron drives scheduled maintenance, reports, and notification jobs.
- Nodemailer supports email reporting.

### Database And Persistence

- PostgreSQL 16 is the deployed default database, with TypeORM entities and migrations as the persistence model. See [FINAL_PROJECT_DOCUMENTATION.md](FINAL_PROJECT_DOCUMENTATION.md#L9) and [backend/src/database/data-source.ts](backend/src/database/data-source.ts#L1).
- The database-selection layer is abstracted, but the current app is configured around PostgreSQL in practice. The selection and auto-create logic live in [backend/src/config/database.selection.ts](backend/src/config/database.selection.ts#L1) and [backend/src/database/ensure-database.ts](backend/src/database/ensure-database.ts#L1).
- The data model is broad and includes assets, work orders, users, profiles, refresh tokens, audit logs, security events, notifications, gate entities, ESG entities, calibration entities, inventory entities, and branding metadata. See [backend/src/database/entities](backend/src/database/entities).

### APIs And Integration

- REST APIs are the primary integration surface.
- SSE is used for notification streaming.
- WebSockets are used for dashboard refresh events.
- The frontend talks to the backend through a thin HTTP client with refresh-token recovery, session hints, and request retry logic. See [frontend/src/api/http.ts](frontend/src/api/http.ts#L1).
- Dynamic branding APIs let the frontend adjust manifest and logos at runtime. See [frontend/src/api/branding.ts](frontend/src/api/branding.ts#L1).

### Deployment And Runtime

- Docker Compose defines the local and production-style stack, including PostgreSQL, backend, and frontend containers. See [docker-compose.yml](docker-compose.yml#L1) and [docker-compose.prod.yml](docker-compose.prod.yml#L1).
- The production frontend is served by Nginx with API and WebSocket proxying, security headers, and camera permissions policy for QR use cases. See [frontend/nginx.prod.conf](frontend/nginx.prod.conf#L1).
- The backend bootstrap initializes the database, boots schedulers, starts the HTTP server, and wires the dashboard socket server. See [backend/src/app.ts](backend/src/app.ts#L1) and [backend/src/server.ts](backend/src/server.ts#L1).

## Advantages

- Strong multi-tenant design: organization, plant, role, and feature scoping are all native.
- Broad operational coverage: the app spans work orders, assets, PM, calibration, AMC, inventory, ESG, safety, gate, visitor, and reporting workflows.
- Better field usability: QR scanning, mobile navigation, PWA support, and responsive shell design make the platform practical for shop-floor use.
- Better governance: root-admin controls, role-permission granularity, feature flags, and security center views are stronger than many generic CMMS products.
- Better observability: audit logs, security events, health endpoints, performance views, and realtime refresh mechanisms improve supportability.
- Better security posture: request validation, sanitization, rate limiting, logging redaction, permission checks, CSRF protection, and secure headers are already present. See [backend/src/middlewares/validate.ts](backend/src/middlewares/validate.ts#L1), [backend/src/middlewares/sanitizeInput.ts](backend/src/middlewares/sanitizeInput.ts#L1), [backend/src/middlewares/rateLimiter.ts](backend/src/middlewares/rateLimiter.ts#L1), and [backend/src/config/security.ts](backend/src/config/security.ts#L1).

## Future Improvements And Scope

- Enforce HTTPS end-to-end and remove the remaining HTTP-based LAN assumptions for QR and shared-device access.
- Remove default or weak production secrets from environment defaults and fail startup when they are present.
- Add centralized logging, SIEM integration, tamper-evident retention, and alert routing.
- Expand test coverage for authorization boundaries, public QR behavior, and mobile/PWA cache policy.
- Add SAST, dependency scanning, secret scanning, container scanning, and DAST to the delivery pipeline.
- Formalize QR token expiry, rotation, and public-data minimization rules.
- Review PWA offline caches against data classification, retention, and shared-device risk.
- Add more enterprise integrations such as ERP, MES, SSO/IdP, SMS, WhatsApp, and external BI tools.
- Scale realtime delivery with explicit backpressure and multi-instance fan-out if the deployment grows beyond a single application node.

## Scalability Roadmap

- Modular routes and feature flags already make the system suitable for incremental expansion.
- The current Docker and TypeORM structure makes it straightforward to move between local, staging, and production environments.
- The next scaling step is to separate operational workloads from analytics workloads, introduce centralized monitoring, and externalize secrets and session management.
- For larger deployments, the app could evolve into a service-oriented stack with dedicated notification, reporting, and analytics services while keeping the CMMS domain model intact.

## Conclusion

CMMSv2 is already a substantial enterprise CMMS rather than a prototype. It has a broad maintenance feature set, serious governance capabilities, mobile and QR support, strong role-based access control, realtime notification delivery, and a polished frontend shell. The long-term vision is credible: harden the security and compliance foundations, add deeper integrations, and scale the platform into a full operational system of record for multi-plant maintenance organizations.
