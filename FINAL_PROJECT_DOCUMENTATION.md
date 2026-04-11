# CMMSv2 Final Project Documentation

## 1. Project Summary

CMMSv2 is a multi-organization computerized maintenance management system built for plant operations. The platform supports root-level governance, organization and plant administration, asset and work-order lifecycle management, PM/PD, calibration, AMC, inventory, ESG, reporting, notifications, QR-based machine access, and audit-oriented security operations.

This repository currently contains:

- Frontend: React 18, TypeScript, Vite, React Router, React Query, Tailwind, Radix UI, PWA packaging
- Backend: Express, TypeScript, TypeORM, Zod, JWT auth, refresh-token flow, RBAC, audit logging
- Database: PostgreSQL 16
- Deployment: Docker Compose, secure Nginx frontend container

## 2. Current Architecture Snapshot

### 2.1 Frontend

- Single-page application in `frontend/src`
- Vite-based build and development server in [vite.config.ts](/d:/CMMSv2/frontend/vite.config.ts)
- PWA runtime caching enabled for selected routes and APIs
- Permission-aware navigation and route guards
- SSE-based notifications on `/api/notifications/stream`
- QR flows for assets, public resolver pages, and mobile scan journeys

### 2.2 Backend and APIs

- Express bootstrap in [app.ts](/d:/CMMSv2/backend/src/app.ts)
- Environment validation in [env.ts](/d:/CMMSv2/backend/src/config/env.ts)
- Auth, RBAC, and plant/org scoping in:
  - [auth.routes.ts](/d:/CMMSv2/backend/src/modules/auth/auth.routes.ts)
  - [authMiddleware.ts](/d:/CMMSv2/backend/src/middlewares/authMiddleware.ts)
  - [permissions.ts](/d:/CMMSv2/backend/src/middlewares/permissions.ts)
- API validation with Zod schemas
- QR resolver and asset QR issuance in:
  - [qr.routes.ts](/d:/CMMSv2/backend/src/modules/qr/qr.routes.ts)
  - [qr.shared.ts](/d:/CMMSv2/backend/src/modules/qr/qr.shared.ts)

### 2.3 Database

- PostgreSQL with TypeORM entities and migrations
- Security-relevant tables include:
  - `refresh_tokens`
  - `audit_logs`
  - `security_events`
  - `users`, `profiles`, `user_roles`, `org_roles`, `org_role_permissions`
  - `asset_qr`

### 2.4 Deployment

- Local and production-style Docker orchestration in:
  - [docker-compose.yml](/d:/CMMSv2/docker-compose.yml)
  - [docker-compose.prod.yml](/d:/CMMSv2/docker-compose.prod.yml)
- Frontend static hosting and API forwarding in:
  - [frontend/nginx.prod.conf](/d:/CMMSv2/frontend/nginx.prod.conf)

## 3. Security Controls Already Present

The project already includes a solid baseline that can be used as the starting point for ISO 27001 implementation:

- JWT access tokens plus refresh-token rotation
- CSRF validation for cookie-based refresh flow
- Role-based and plant-scoped authorization
- Org-role permission model for multi-organization access
- Optional MFA/TOTP support
- Rate limiting for auth, mutating APIs, reports, and exports
- Request sanitization middleware
- Security headers with Helmet
- Pino request logging with redaction for sensitive fields
- `audit_logs` and `security_events` persistence
- File validation helpers for image and document uploads
- Security Center views and incident-oriented event reporting

## 4. Key Security and Compliance Gaps Observed

These are the highest-value issues to address before certification or production hardening:

1. Production-secret hygiene is not yet strong enough.
   `backend/src/config/env.ts` still contains default values for highly sensitive settings such as root-admin credentials and encryption-related configuration. In production, startup should fail if defaults are still present.

2. Shared-network usage is currently HTTP-based.
   QR resolver links and LAN access are designed around `http://` endpoints in the current Docker environment. For production and compliance, move to HTTPS everywhere, including QR resolver links and API access.

3. Camera policy must remain aligned with mobile QR requirements.
   [frontend/nginx.prod.conf](/d:/CMMSv2/frontend/nginx.prod.conf) should keep `Permissions-Policy` configured to allow camera use for same-origin QR scanning journeys.

4. Centralized monitoring and log integrity controls are incomplete.
   The app records useful events, but there is no repo-level evidence of immutable log storage, SIEM integration, alert routing, or tamper-evident retention controls.

5. Secure SDLC controls are only partially implemented.
   The repo has builds, tests, and some security checks, but not a full DevSecOps pipeline with SAST, dependency monitoring, container scanning, DAST, threat modeling, and approval gates.

6. Public QR access needs stronger governance.
   Public QR token resolution exists for asset lookup. Add token expiry, rotation policy, rate limiting, abuse monitoring, and business approval for what data can be exposed before authentication.

7. Offline/PWA caching needs formal data classification review.
   The frontend caches some API GET responses. That behavior should be explicitly reviewed against data classification, retention, privacy, and shared-device risk.

8. Compliance evidence is fragmented.
   Policies, risk registers, SoA, supplier controls, IR drills, internal audit records, and management-review evidence are not yet represented as a formal ISO 27001 evidence set.

## 5. ISO 27001 Compliance Plan for This Application

## 5.1 Phase 1: Define ISMS Scope and Context

Scope the ISMS to the systems and people that actually operate this platform:

- React frontend
- Express backend APIs
- PostgreSQL database
- Docker hosts and container images
- Nginx reverse proxy
- Authentication and email infrastructure
- Backups, logs, and support/admin operations
- Developers, admins, operators, and support staff

Implementation steps:

1. Define scope statement covering production, staging, CI/CD, backups, and support functions.
2. Identify interested parties: customers, plant admins, root admins, developers, hosting providers, auditors, regulators.
3. List compliance obligations: contractual security terms, privacy requirements, employment obligations, incident reporting obligations, retention requirements.
4. Approve an information security policy and ISMS charter.

## 5.2 Phase 2: Asset Inventory and Classification

Build an asset register that includes:

- Source code repositories
- Docker images and registries
- Servers and cloud/VPS resources
- Databases and backups
- Secrets and certificates
- User identities and admin accounts
- Logs and audit trails
- Uploaded files and branding assets
- QR token workflows and public links

Classify data handled by the app:

- Public: static branding assets, public landing content
- Internal: operational dashboards, machine metadata
- Confidential: user records, role mappings, audit data, vendor contacts
- Restricted: passwords, refresh tokens, MFA secrets, encryption keys, security-event evidence

Implementation steps:

1. Create an asset inventory spreadsheet or GRC record.
2. Assign data owners for every major dataset.
3. Mark retention, backup, encryption, and access requirements for each class.

## 5.3 Phase 3: Risk Assessment and Risk Treatment

Use a repeatable risk methodology:

- Likelihood: 1 to 5
- Impact: 1 to 5
- Risk score: likelihood x impact
- Treatment options: mitigate, transfer, avoid, accept

Suggested initial high risks for this app:

- Hardcoded/default production secrets
- Weak transport security on LAN/shared-network deployments
- Broken object or function authorization in APIs
- Sensitive data leakage through logs, caches, or public QR routes
- Container/image vulnerabilities
- Lack of centralized alerting for auth abuse and privileged actions
- Backup compromise or failed restore recovery
- PWA caching of data on shared or unmanaged devices

Implementation steps:

1. Create a formal risk register.
2. Record owners, current controls, residual risk, and due dates.
3. Link every accepted mitigation to the Statement of Applicability and implementation backlog.

## 5.4 Phase 4: Statement of Applicability and Annex A Control Adoption

Build a Statement of Applicability that maps applicable Annex A controls to real implementation evidence. For this application, focus first on the controls below.

### Organizational Controls

- Information security policies
- Roles and responsibilities
- Segregation of duties
- Asset inventory and acceptable use
- Information classification and handling
- Supplier and cloud-service security
- Secure project management and change control
- Incident management and evidence handling
- Business continuity and ICT readiness
- Legal, privacy, and contractual compliance tracking

Implementation steps:

1. Approve policy set: information security, access control, secure development, incident response, backup, encryption, change management.
2. Document system ownership for frontend, backend, DB, infra, and customer support.
3. Separate root-admin governance, app administration, and database/host administration duties.
4. Formalize change approval for schema changes, RBAC changes, and public QR behavior.

### People Controls

- Background checks where legally appropriate
- Security awareness and role-based training
- Confidentiality obligations
- Secure offboarding and access removal
- Remote working controls
- Security event reporting responsibilities

Implementation steps:

1. Make MFA mandatory for privileged roles.
2. Train developers on OWASP ASVS and OWASP API Security Top 10.
3. Train support teams on incident escalation, evidence handling, and least privilege.
4. Add joiner-mover-leaver procedures for root admins, superadmins, and engineering staff.

### Physical Controls

- Hosting-site physical protections
- Device security for admin endpoints
- Backup media handling
- Secure disposal

Implementation steps:

1. Document the physical control reliance on the hosting provider or on-prem server room.
2. Enforce full-disk encryption and device lock policy for admin laptops.
3. Restrict backup export/download rights.

### Technological Controls

- Identity and privileged access management
- Authentication information protection
- Secure configuration and hardening
- Vulnerability management
- Malware protection and endpoint hygiene
- Logging, monitoring, and alerting
- Backup and restore controls
- Encryption and key management
- Network security and segmentation
- Secure coding and application testing
- Secure development, test, and production separation
- Change management and release controls
- Data masking, deletion, and leakage prevention where relevant

Implementation steps:

1. Remove all production defaults for secrets, credentials, and encryption keys.
2. Move secrets to a vault or managed secret store.
3. Enforce TLS for frontend, APIs, and QR links.
4. Add SAST, dependency scanning, secret scanning, and container scanning in CI.
5. Add DAST against staging APIs and authenticated app flows.
6. Centralize logs into a SIEM with alerting on auth abuse, privilege changes, QR abuse, and repeated authorization failures.
7. Enforce environment separation and production change approval.
8. Test restores from backup on a schedule and record evidence.

## 6. Secure Coding Plan for This Stack

Use OWASP ASVS as the application security baseline and OWASP API Security Top 10 for API-specific abuse cases.

### Backend Secure Coding

- Require schema validation for every external input
- Maintain explicit authorization checks for every route and every record scope
- Add unit and integration tests for BOLA, BFLA, and plant/org scope boundaries
- Ensure logs never contain passwords, tokens, MFA secrets, DB credentials, or raw cookies
- Enforce explicit allowlists for file types and maximum sizes
- Review every public endpoint for information disclosure
- Add token expiry/rotation controls for public QR tokens

### Frontend Secure Coding

- Avoid storing tokens in localStorage
- Minimize sensitive data cached by the PWA
- Review runtime caching rules for work orders, notifications, and asset responses
- Keep route guards aligned with backend authorization but never treat frontend checks as security boundaries
- Sanitize and validate any rich text or uploaded-content previews

### Database and ORM

- Use least-privilege DB accounts
- Limit direct SQL execution
- Keep migrations reviewed and version-controlled
- Encrypt backups and protect backup restore credentials
- Enable regular vulnerability patching for PostgreSQL and container base images

## 7. Authentication and Authorization Improvements

This app already has strong foundations with refresh rotation, CSRF checks, and optional MFA. To improve it significantly:

1. Make MFA mandatory for:
   - Root Admin
   - Super Admin
   - Security Center users
   - Anyone with privileged master-data access

2. Add password and session governance:
   - Block weak/default passwords in seed and runtime flows
   - Require password rotation only for compromise or high-risk roles, not arbitrary frequent rotation
   - Add session inventory and forced logout for suspicious sessions
   - Add step-up authentication for destructive admin actions

3. Strengthen authorization testing:
   - Negative tests for org/plant boundary bypass
   - Negative tests for root-only pages and governance mutations
   - API tests for record-level access on work orders, assets, PM schedules, ESG data, and notifications

4. Formalize privileged access management:
   - Named admin accounts only
   - No shared credentials
   - Quarterly privilege review
   - Logged approval for role changes and cross-org access grants

## 8. Data Protection Plan

### Data in Transit

- Enforce HTTPS on all user-facing endpoints
- Redirect HTTP to HTTPS
- Use strong TLS configuration and certificate lifecycle management
- Ensure QR resolver URLs always use the canonical secure public URL

### Data at Rest

- Encrypt database storage and backups
- Use managed key rotation where possible
- Remove default `DATA_ENCRYPTION_KEY` values from production startup
- Encrypt exported reports if they contain confidential data

### Privacy and Minimization

- Define data retention periods for:
  - audit logs
  - security events
  - refresh session records
  - uploaded files
  - notifications
  - visitor or gate-entry records
- Add deletion and archival procedures
- Review whether PWA offline caches may retain confidential operational data longer than intended

## 9. Logging, Monitoring, and Alerting

Current logging is useful, but ISO 27001 and serious operational security require a more complete monitoring design.

Implementation steps:

1. Centralize application, Nginx, database, and host logs.
2. Define alert rules for:
   - repeated login failures
   - account lockouts
   - repeated 403 authorization denials
   - role or permission changes
   - suspicious QR token resolution volume
   - failed refresh/CSRF events
   - high-severity security events
3. Protect logs against tampering and unauthorized deletion.
4. Define retention per log type and legal/compliance requirement.
5. Create dashboard views for auth abuse, admin actions, and incident triage.

Recommended fields in every security-relevant event:

- timestamp
- actor/user id
- organization id
- plant id
- source IP
- user agent
- module
- action
- target entity id
- outcome
- correlation/request id

## 10. Incident Response Plan

Base the procedure on NIST incident-response guidance and link it to ISO 27001 corrective action requirements.

### Preparation

- Define severity levels
- Maintain contact list and on-call roles
- Ensure evidence-preservation process exists
- Document legal/contractual reporting triggers

### Detection and Analysis

- Triage alerts from `security_events`, `audit_logs`, nginx, and DB monitoring
- Confirm scope: affected orgs, plants, users, assets, and data types
- Preserve evidence before major cleanup

### Containment

- Disable compromised users
- Revoke refresh sessions
- Rotate secrets, tokens, and QR public tokens where needed
- Restrict ingress at Nginx, firewall, or cloud controls

### Eradication and Recovery

- Patch the exploited weakness
- Validate RBAC, scopes, and logs
- Restore clean data if necessary
- Monitor closely after recovery

### Lessons Learned

- Hold a post-incident review
- Update the risk register, SoA, runbooks, and secure coding checklist
- Track corrective actions to closure

## 11. Compliance Documentation Pack to Maintain

To achieve ISO 27001, maintain these documents and records outside code as formal evidence:

- ISMS scope statement
- Information security policy
- Risk assessment methodology
- Risk register
- Risk treatment plan
- Statement of Applicability
- Asset inventory
- Data classification and handling standard
- Access control policy
- Secure development policy
- Vulnerability management procedure
- Logging and monitoring standard
- Backup and restore procedure
- Incident response plan and incident records
- Supplier security assessments
- Change management records
- Internal audit plan and audit reports
- Management review minutes
- Corrective action register
- Security awareness training records
- Business continuity and disaster recovery test evidence

## 12. Recommended Tooling

### Code and Dependency Security

- GitHub Advanced Security or GitLab security features
- Semgrep or SonarQube for SAST
- Gitleaks or TruffleHog for secret scanning
- Dependabot, Renovate, or Snyk for dependency monitoring
- npm audit as a minimum baseline

### Container and Infrastructure Security

- Trivy or Grype for container/image scanning
- Docker Bench or CIS-aligned host hardening checks
- Cloud security posture tooling if moving to managed cloud

### DAST and API Testing

- OWASP ZAP for web DAST
- Postman/Newman or Bruno for regression suites
- API authorization abuse tests mapped to OWASP API Top 10

### Logging and Monitoring

- ELK / OpenSearch / Grafana Loki
- Prometheus + Grafana for metrics
- Wazuh, Splunk, or equivalent SIEM/SOC workflow

### Secret and Key Management

- HashiCorp Vault
- AWS Secrets Manager / Azure Key Vault / GCP Secret Manager

## 13. Practical 90-Day Execution Roadmap

### Days 1-30

- Remove default production secrets and fail startup if defaults are detected
- Move secrets to managed storage
- Enforce HTTPS and canonical secure URLs
- Review and fix proxy `Permissions-Policy` for camera-based QR scanning
- Build asset inventory, scope statement, risk register, and policy set
- Add secret scanning, SAST, and dependency scanning to CI

### Days 31-60

- Add DAST for authenticated app flows and APIs
- Add role-boundary and scope-boundary authorization tests
- Centralize logs and define high-risk alerts
- Review PWA cache scope against data classification
- Implement QR token expiry/rotation/monitoring policy
- Run first vulnerability remediation sprint

### Days 61-90

- Complete Statement of Applicability
- Run backup-restore test and incident-response tabletop exercise
- Conduct internal access review and supplier review
- Perform internal ISO readiness audit
- Close corrective actions and prepare certification evidence

## 14. Final Recommendation

This application already has stronger-than-average foundations for a plant-operations web app because it includes RBAC, scoped authorization, refresh-token rotation, CSRF controls, MFA readiness, rate limiting, audit logging, and security-event capture. The fastest path to ISO 27001 readiness is not to rebuild the product; it is to formalize governance, remove insecure defaults, strengthen operational controls around secrets, transport, logging, and incident response, and build consistent evidence for those controls.

Priority order:

1. Secret management and HTTPS everywhere
2. Formal risk register and Statement of Applicability
3. Centralized logging, alerting, and incident response
4. Secure SDLC with SAST, DAST, container scanning, and authorization regression tests
5. Audit-ready documentation, reviews, and management evidence

## 15. External References

- ISO/IEC 27001 overview: https://www.iso.org/standard/27001
- NIST Secure Software Development Framework (SP 800-218): https://csrc.nist.gov/publications/detail/sp/800-218/final
- NIST incident response update notice for SP 800-61: https://csrc.nist.gov/news/2025/nist-revises-sp-800-61
- NIST Digital Identity Guidelines (SP 800-63-4): https://csrc.nist.gov/pubs/sp/800/63/4/final
- OWASP ASVS: https://owasp.org/www-project-application-security-verification-standard/
- OWASP API Security Top 10: https://owasp.org/API-Security/
- OWASP Logging Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
