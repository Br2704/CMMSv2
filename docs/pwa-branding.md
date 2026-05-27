Summary of PWA & Branding updates

What I changed:
- Centralized branding constants in `frontend/src/config/branding.ts` and `backend/src/config/branding.ts`.
- Updated dynamic browser title formatting to `"<Page> | TamOptiX Technologies - CMMS"` in `MainLayout` and `Login`.
- Added `VITE_APP_SHORT_NAME` support and propagated to Docker and env examples.
- Upgraded `vite-plugin-pwa` manifest: set `short_name`, expanded icon list, and precached `offline.html`.
- Added `offline.html` fallback page and precached it via VitePWA.
- Added icon generation script `frontend/scripts/generate-icons.js` and `npm run generate:icons` task.
- Added `CommandPalette` (Ctrl/Cmd+K) for quick navigation.
- Added `Skeleton` component and integrated Suspense fallback in `MainLayout`.
- Accessibility: added `skip-to-content` link, `role="main"`, focus-visible styles, and reduced-motion support.
- Performance: lazy-loading for logo images, async decoding, and runtime caching rules exist in `vite.config.ts`.
- Utilities: responsive table wrapper, fluid typography helper, dialog overflow handling in `frontend/src/App.css`.

Files to review:
- `frontend/src/config/branding.ts`
- `backend/src/config/branding.ts`
- `frontend/vite.config.ts`
- `frontend/index.html`
- `frontend/public/offline.html`
- `frontend/scripts/generate-icons.js`
- `frontend/src/components/CommandPalette.tsx`
- `frontend/src/components/Skeleton.tsx`
- `frontend/src/components/layout/MainLayout.tsx`
- `frontend/src/App.css`

Rebuild steps:

1) Install frontend dependencies and generate icons (optional, requires `sharp`):

```bash
cd frontend
npm ci
npm run generate:icons
```

2) Build frontend:

```bash
npm run build
```

3) Or build via Docker Compose:

```bash
docker-compose build frontend backend
docker-compose up -d
```

Notes:
- The icon generation requires `tamoptix-logo.svg` in `frontend/public/tamoptix/` as the source.
- You may want to run a Lighthouse audit after building to validate PWA and performance scores.
- Next recommended tasks: full responsive audit across pages, lazy-loading of heavy charts, add push-notification service wiring, accessibility audit and remediation, theme switch refinements and dark-mode polish.
