# CLAUDE.md — SIMS (Sentinel Infrastructure Management System)
## Project Onboarding & Implementation Context

> **This file is the authoritative context document for Claude Code.**
> Read it completely before taking any action. Every architectural decision
> documented here was made deliberately. Do not substitute alternatives
> without flagging the change and explaining why.

> ⚠️ **READ THIS FIRST — the phase plan below is historical.**
> Sections 7 and 12 describe the original greenfield build plan. That plan is
> **done**: the platform is built, deployed, and running in production at
> **sims.sentinelmgpr.com** (staging at staging.sentinelmgpr.com). The app is
> now ~1.1.0, 49 migrations deep, with a full facilities-management suite,
> contracts, projects, potholes, inspections, calendar, and a public weather-ops
> page — none of which the phase plan anticipated. Treat Sections 5, 6, 8, 9, 10
> (the *conventions and rules*) as current and binding. Treat Sections 7 and 12
> (the *phase checklist and status table*) as an archived record of how we got
> here, not a to-do list. **Current reality is Section 12a, immediately below.**

---

## 12a. Current Reality (authoritative — supersedes Sections 7 & 12)

**Product:** SIMS — Sentinel Infrastructure Management System (formerly "Sentinel
Public Works"). First tenant: Municipality of Guaynabo, PR.

**Deployment:**
- Production: `sims.sentinelmgpr.com` (self-hosted Supabase + Next.js on Contabo VPS)
- Staging: `staging.sentinelmgpr.com`, branch `staging` (default working branch)
- Deploy scripts: `deploy-prod.sh`, `deploy-staging.sh` (auto-increment app version
  into `.env.local`); CI in `.github/workflows/` (`deploy-prod.yml`,
  `deploy-staging.yml`, `typecheck.yml`)

**What is built and live:**
- Auth (invite-only, password + reset; no self-registration), 5-role RLS
- Facilities Management suite under `/dashboard/fm/*` — properties, assets,
  work orders, inspections, templates, FCA (facility condition assessment),
  schedules, reports, analytics, team/tenants
- Contracts (with bids, amendments), Projects (with tasks), Potholes (PCI),
  standalone Inspections, Calendar (FullCalendar + `nightly-calendar` cron),
  Map (MapLibre), Reports, Team, Settings, System Health overlay
- Public weather-ops page (`/weather/`) fed by `/api/weather/live` +
  `weather-sync` edge cron (NWS/Open-Meteo/NHC/CoCoRaHS/USGS)
- 52 API routes, PWA (next-pwa), Resend email, in-app notifications via
  Supabase Realtime, nightly encrypted B2 backups (`scripts/backup.sh`)

**Notifications:** Novu was **never deployed**. The shipped approach is direct
Resend email (`apps/web/lib/email/*`) + in-app bell (Supabase Realtime). SMS,
WhatsApp, and Slack channels do **not** exist. When Section 8 references Novu,
treat it as superseded unless a decision is made to revisit it.

**Not built:** citizen service request portal, SAP/ERP integration, in-app
bilingual EN/ES (no i18n framework installed — only the public weather/outreach
pages are bilingual). These remain genuinely pending.

**Known open items (see also the team's running notes):**
- Prod JWT / service-role keys need proper rotation (pending since 2026-06-11)
- Cloudflare API token needs Cache Purge permission added
- `storage_backup` schema on old prod DB should be dropped (leftover from
  sims/prod DB separation)

---

## 1. Who We Are

**Company:** Sentinel Management Group  
**Role:** Technology solutions provider building a custom municipal management platform  
**Developer toolchain:** Claude Code (you) as primary coding agent, supervised by a non-developer principal using VS Code as the IDE  
**Repository:** Private GitHub repo — `jrmarquina/sentinel-staging` (exists; default branch `staging`)

---

## 2. What We Are Building

A **Progressive Web App (PWA)** for municipal public works management. The first client is the **Municipality of Guaynabo, Puerto Rico** (71 km², urban/suburban, just south of San Juan).

The platform is designed to be **multi-tenant from the start** — Guaynabo is client #1, but the architecture must support additional municipalities without re-engineering. Every database table includes an `org_id` foreign key. Every RLS policy is org-scoped.

### The product covers (in order of priority):
1. Work order management (create, assign, track, close)
2. Contract management and vendor follow-up
3. GIS map dashboard (Guaynabo, PostGIS spatial queries)
4. Pothole and road damage tracking with photo + GPS
5. Municipal property damage incident tracking
6. Field inspections and compliance checklists
7. Multi-channel notifications (email, SMS, WhatsApp, Slack, in-app)
8. Reporting and analytics dashboards
9. Citizen service request portal (optional module)
10. SAP / municipal ERP integration (optional, phased)

**Client feature selection is still pending** — the client is completing a requirements intake form. The foundation infrastructure (auth, database, maps, file storage, calendar, notifications, backups, CI/CD) must be built and production-ready BEFORE the client returns their module selections. That is the current scope of work.

---

## 3. What Is Known About the Server

| Property | Value |
|---|---|
| Host | Contabo VPS |
| RAM | 8 GB |
| CPU | 4 vCPU |
| Disk | 200 GB SSD |
| OS | Ubuntu 24.04 LTS |
| State | **Running other production services** ⚠️ |

### CRITICAL — existing services constraint
The VPS is NOT a fresh machine. There are **existing production services** running. This has the following implications:

- **Do NOT assume ports 80, 443, 5432, 8000, or 5433 are free.** Before any Docker Compose deployment, audit what is currently listening: `sudo ss -tlnp | grep -E '80|443|5432|8000|5433|3000|6379|27017'`
- **Do NOT touch or modify any existing Docker networks, volumes, or containers** unless explicitly instructed.
- Our stack must either use **non-standard port mappings** OR integrate into the existing reverse proxy if one is already present.
- The first task on the server must be an **audit step** — discover what is running before deploying anything.
- If Nginx is already running and managing SSL, we integrate INTO it rather than deploying a new Nginx container.

### Swap
8 GB RAM is sufficient for our stack under normal load but can spike during Supabase initialization and under heavy concurrent requests. Add a 4 GB swap file if one does not already exist:
```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf
```

---

## 4. Open Decisions (Confirm Before Executing Affected Phases)

These were not yet answered when this document was created. Flag and ask before proceeding with any phase that depends on them:

| Decision | Impact |
|---|---|
| Domain / DNS status | Determines if SSL (Certbot) can be set up or must wait |
| Dev machine OS | Determines exact CLI commands (WSL2 paths vs macOS vs Linux) |
| Email provider | Needed for Supabase Auth SMTP config and Novu email channel |
| Backup destination | Needed for Phase 7 (rclone config, B2 bucket vs S3) |
| SMS provider (Twilio or other) | Needed for Novu SMS channel setup |
| WhatsApp Business account | Needed for Novu WhatsApp channel |
| Slack workspace | Needed for Novu Slack integration |
| Deployment environments | Determines whether to create a staging Docker Compose profile |
| Language (EN/ES bilingual) | Determines whether next-i18next is configured from day one |
| Auth methods (OAuth, MFA, magic link) | Determines Supabase Auth provider configuration |
| Who SSHes into VPS | Determines whether to write runbook-style instructions or scripts |
| Map tile provider | OpenFreeMap assumed; confirm before MapLibre config |

When you encounter a phase that requires one of these, stop and ask rather than assuming.

---

## 5. Confirmed Technical Decisions

These are locked. Do not propose alternatives.

### Backend
- **Supabase (self-hosted)** — Postgres 16 + PostGIS, Auth, Storage, Realtime, Edge Functions
- **PostGIS** — all geospatial data uses `GEOGRAPHY(POINT, 4326)`. Guaynabo bounding box: SW `[-66.1197, 18.3394]` NE `[-66.0519, 18.4267]`
- **Row Level Security** — enabled on every table, no exceptions. Five roles: `admin`, `supervisor`, `inspector`, `vendor`, `viewer`
- All secrets in `.env` — never hardcoded anywhere, never committed to git

### Frontend
- **Next.js 14** with App Router and React Server Components
- **shadcn/ui + Tailwind CSS** — component library. No other UI library.
- **next-pwa** — configured from day one. The app must be installable as a PWA on any phone browser. No native app, no App Store.
- **MapLibre GL JS** — map renderer. Tile source: OpenFreeMap (confirm with user before switching)
- TypeScript strict mode throughout — `"strict": true` in tsconfig

### Monorepo
- **Turborepo** with pnpm workspaces
- Structure:
  ```
  apps/
    web/          ← Next.js 14 app (dashboard + PWA)
  packages/
    db/           ← Supabase generated TypeScript types (auto-generated, never hand-edited)
    ui/           ← Shared shadcn/ui components
    shared/       ← Zod schemas, constants, utility functions
  supabase/
    migrations/   ← All DB migrations (never run raw SQL manually in production)
    functions/    ← Edge Functions (cron jobs, webhooks)
  ```
- pnpm is the package manager — never use npm or yarn in this project

### Notifications
- **Novu (self-hosted)** — unified hub for all notification channels
- Channels to support: email (Resend), SMS (Twilio), WhatsApp (Twilio gateway), Slack, in-app
- In-app notifications use Supabase Realtime subscription on the `notifications` table

### Infrastructure
- **Docker Compose** — entire stack runs in containers
- **Nginx** — reverse proxy (may already exist on VPS — audit first)
- **Certbot** — Let's Encrypt SSL (only if domain DNS is pointing to VPS)
- **Backblaze B2** (recommended) — encrypted nightly backups via rclone
- **GitHub Actions** — CI/CD pipeline for zero-downtime deploys
- **UptimeRobot** (free) — external uptime monitoring, pings `/api/health`

### Version control
- **Private GitHub repository** — `sentinel-publicworks`
- Branch strategy: `main` (production), `staging` (optional), feature branches
- Commit convention: `type(scope): description` — e.g. `feat(auth): add magic link login`
- `.env` files never committed — `.env.example` committed with placeholder values

---

## 6. Database Schema Principles

Follow these rules for every migration:

1. **Every table has:** `id UUID DEFAULT gen_random_uuid() PRIMARY KEY`, `org_id UUID NOT NULL REFERENCES organizations(id)`, `created_at TIMESTAMPTZ DEFAULT NOW()`, `updated_at TIMESTAMPTZ DEFAULT NOW()`
2. **RLS is always on:** `ALTER TABLE tablename ENABLE ROW LEVEL SECURITY;` — add policies immediately after table creation, never leave a table without policies
3. **Spatial columns:** `geom GEOGRAPHY(POINT, 4326)` with a GiST index: `CREATE INDEX ON tablename USING GIST(geom);`
4. **Soft deletes:** `deleted_at TIMESTAMPTZ` — never hard-delete records, filter with `WHERE deleted_at IS NULL`
5. **Audit trail:** every write operation is logged via a `audit_log` table trigger (implement in Phase 2)
6. **Migrations only:** never use Supabase Studio to create tables. All schema changes go through `supabase/migrations/` and are version-controlled

### Core tables to create in Phase 2 (in dependency order):
```
organizations → profiles → user_roles
locations (PostGIS) → attachments → calendar_events → notifications
```

### Five-role RLS pattern (apply to every table):
```sql
-- Admin: full access within their org
CREATE POLICY "admin_all" ON tablename
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'admin');

-- Supervisor: read/write within org
-- Inspector: read within org, write own records
-- Vendor: read/write own records only
-- Viewer: read only within org
```

---

## 7. Phase Implementation Order

Execute phases strictly in order. Do not start a phase until the previous one is verified working.

### Phase 0 — Dev machine setup (do this first, locally)
**Goal:** Everything needed on the developer PC before any server work.

- [ ] Node.js 20 LTS installed (`node --version` → v20.x)
- [ ] pnpm installed globally (`npm i -g pnpm`, then `pnpm --version`)
- [ ] Docker Desktop installed and running (WSL2 integration enabled if Windows)
- [ ] Claude Code CLI installed (`npm install -g @anthropic-ai/claude-code`)
- [ ] Supabase CLI installed (`npm install -g supabase`, then `supabase --version`)
- [ ] GitHub repo `sentinel-publicworks` created as private
- [ ] SSH key generated and public key added to VPS `~/.ssh/authorized_keys`
- [ ] SSH connection to VPS tested: `ssh user@vps-ip`

**Deliverable:** Developer can SSH into VPS and has all tools available locally.

---

### Phase 1 — VPS audit and hardening
**Goal:** Understand what's running, harden security, deploy our infrastructure without conflicts.

**Step 1.1 — Audit existing services (DO THIS FIRST)**
```bash
# What's listening on which ports?
sudo ss -tlnp

# What Docker containers are running?
docker ps -a

# What Docker networks exist?
docker network ls

# Is Nginx already running?
systemctl status nginx
docker ps | grep nginx

# Is there already a Postgres instance?
sudo ss -tlnp | grep 5432

# Disk usage
df -h
```
**Document the output before proceeding. Share with the user for review.**

**Step 1.2 — Security hardening**
- Disable password SSH auth (key-only): `/etc/ssh/sshd_config` → `PasswordAuthentication no`
- Install and configure fail2ban with SSH jail
- Configure ufw: allow only 22 (or custom SSH port), 80, 443; deny everything else
- Install unattended-upgrades for automatic security patches

**Step 1.3 — Docker Engine (if not already installed)**
```bash
# Check first
docker --version
# Install only if missing — use official Docker repo, not apt default
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

**Step 1.4 — Swap file (if not already present)**
```bash
sudo swapon --show  # Check if swap exists first
# If empty, add 4GB swap (commands in Section 3 above)
```

**Step 1.5 — Nginx and SSL**
- If Nginx is ALREADY running: integrate our vhosts into the existing config
- If Nginx is NOT running: deploy our containerized Nginx + Certbot
- SSL via Let's Encrypt — **only if domain DNS is pointing to VPS IP** (check open decisions)

**Step 1.6 — PostGIS constant**
Store Guaynabo bounding box as an environment variable and a database config row once DB is up:
```
GUAYNABO_SW_LNG=-66.1197
GUAYNABO_SW_LAT=18.3394
GUAYNABO_NE_LNG=-66.0519
GUAYNABO_NE_LAT=18.4267
```

**Deliverable:** VPS is hardened, Docker is available, network map of existing services is documented, Nginx is serving HTTPS (or flagged as blocked pending DNS).

---

### Phase 2 — Monorepo scaffold and database schema
**Goal:** Working codebase skeleton with all core tables and RLS policies.

- [ ] `pnpm create turbo@latest` → choose pnpm workspaces
- [ ] Set up `apps/web` as Next.js 14 with App Router: `pnpm create next-app@latest apps/web --typescript --tailwind --app`
- [ ] Install shadcn/ui: `pnpm dlx shadcn@latest init` inside `apps/web`
- [ ] Create `packages/db`, `packages/ui`, `packages/shared` with proper `package.json`
- [ ] `supabase init` in repo root
- [ ] Deploy self-hosted Supabase to VPS (use official `supabase/supabase` Docker Compose)
  - **Port conflict check first** — if 5432 is in use, remap Supabase Postgres to 5433
  - Set all secrets in `.env` — JWT secret (min 32 chars), DB password, anon key, service role key
- [ ] Enable PostGIS: `CREATE EXTENSION IF NOT EXISTS postgis;` — verify with `SELECT PostGIS_Version();`
- [ ] Write and run migration `001_core_schema.sql` — organizations, profiles, user_roles, enum app_role
- [ ] Write and run migration `002_foundation_tables.sql` — locations, attachments, calendar_events, notifications
- [ ] Write and run migration `003_rls_policies.sql` — all policies for all tables, all five roles
- [ ] Generate TypeScript types: `supabase gen types typescript --linked > packages/db/src/types.ts`
- [ ] Add type generation to `package.json` scripts: `"db:types": "supabase gen types typescript --linked > packages/db/src/types.ts"`
- [ ] `.env.example` committed with placeholder keys — actual `.env` added to `.gitignore`

**Deliverable:** `pnpm dev` runs the Next.js app locally. Supabase Studio is accessible. All core tables exist with RLS policies. TypeScript types are generated.

---

### Phase 3 — Authentication, encryption, and PWA shell
**Goal:** Users can log in. Role-based routing works. App is installable on a phone.

- [ ] Install Supabase SSR: `pnpm add @supabase/ssr @supabase/supabase-js` in `apps/web`
- [ ] Create Supabase server client utility (`packages/shared/src/supabase/server.ts`)
- [ ] Create Supabase browser client utility (`packages/shared/src/supabase/client.ts`)
- [ ] Next.js middleware (`apps/web/middleware.ts`) — protect `/dashboard/**`, redirect unauthenticated to `/login`
- [ ] Build `/login` page — Sentinel-branded, clean, professional. Fields: email + password. Links: forgot password. No self-registration (invite-only system).
- [ ] Build `/auth/callback` route handler for OAuth/magic links
- [ ] Build `/auth/invite` flow — admin sends invite → Supabase sends email → user sets password
- [ ] Role claim in JWT — after login, read `user_roles` table, inject role into session metadata
- [ ] Dashboard layout (`apps/web/app/dashboard/layout.tsx`) — sidebar nav, role-aware menu items, header with user avatar and notification bell
- [ ] Configure `next-pwa`:
  ```bash
  pnpm add next-pwa
  ```
  - Manifest: `name: "Sentinel PW"`, `short_name: "Sentinel"`, `display: "standalone"`, `theme_color: "#0D1B2E"`, icons at 192×192 and 512×512
  - Service worker caches app shell and static assets
  - Offline fallback page at `/offline`
- [ ] Configure Resend (or confirmed email provider) as Supabase SMTP:
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` in Supabase config
  - Test: trigger a password reset email and confirm delivery
- [ ] Rate limiting on auth: 5 failed attempts → 15-minute lockout (Supabase Auth settings)

**Deliverable:** Login works. Admin can invite users. Role-based nav renders. App shows "Add to Home Screen" prompt on mobile. Password reset email delivers.

---

### Phase 4 — Map system (Guaynabo)
**Goal:** Interactive map centered on Guaynabo with PostGIS spatial foundation.

- [ ] Install MapLibre GL JS: `pnpm add maplibre-gl` in `apps/web`
- [ ] Create `MapView` component at `apps/web/components/map/MapView.tsx`
  - Dynamic import with `ssr: false` (canvas element cannot SSR)
  - Default viewport: center `[-66.0858, 18.3830]`, zoom 13
  - Tile source: `https://tiles.openfreemap.org/styles/liberty` (confirm with user)
  - Props: `layers?: LayerSpec[]`, `markers?: MarkerSpec[]`, `onMarkerClick?: (id: string) => void`
- [ ] Layer switcher button — street / topo toggle
- [ ] GPS capture hook `useGeoLocation.ts`:
  - Calls `navigator.geolocation.getCurrentPosition()`
  - Returns `{ lat, lng, accuracy, loading, error }`
  - Used by all field data entry forms to auto-fill location
- [ ] EXIF GPS extraction — install `exifr`: `pnpm add exifr`
  - Extract GPS from photo EXIF before upload
  - Falls back to browser geolocation if no EXIF data
- [ ] PostGIS spatial index and helper SQL functions (add to a migration):
  ```sql
  CREATE INDEX ON locations USING GIST(geom);

  CREATE OR REPLACE FUNCTION locations_within_radius(
    center_lat FLOAT, center_lng FLOAT, radius_meters INT
  ) RETURNS SETOF locations AS $$
    SELECT * FROM locations
    WHERE ST_DWithin(
      geom::geography,
      ST_MakePoint(center_lng, center_lat)::geography,
      radius_meters
    ) AND deleted_at IS NULL;
  $$ LANGUAGE sql STABLE;
  ```
- [ ] Map dashboard page: route `/dashboard/map` — full-screen MapView, empty layers initially. Confirms pipeline end-to-end.

**Deliverable:** `/dashboard/map` shows Guaynabo on screen. GPS capture works on a phone browser. PostGIS spatial functions are queryable.

---

### Phase 5 — File storage and photo pipeline
**Goal:** Photos captured on a phone browser are compressed, geo-tagged, and stored securely.

- [ ] Configure Supabase Storage buckets:
  - `photos` — public read, authenticated write, max 10 MB per file
  - `documents` — private, authenticated access only, signed URLs
  - `avatars` — public read, small files only
  - RLS: users upload only to `org_id/` folder prefix, admins access all
- [ ] `PhotoUpload` component:
  - Mobile: `<input type="file" accept="image/*" capture="environment">` triggers rear camera
  - Desktop: file picker or drag-and-drop zone
  - Client-side compression to max 1.5 MB before upload (Canvas API — no library needed)
  - Progress indicator during upload
  - Preview thumbnail after upload
- [ ] Signed URL utility for `documents` bucket — 1-hour expiry, generated server-side
- [ ] Audit log trigger: every download of a private document writes to `audit_log` table

**Deliverable:** Inspector on a phone can take a photo, it compresses, EXIF GPS extracted, uploads to Supabase Storage, preview renders in the form.

---

### Phase 6 — Calendar engine
**Goal:** Single calendar table feeds work orders, inspections, contracts, and maintenance across all modules.

- [ ] Install FullCalendar:
  ```bash
  pnpm add @fullcalendar/react @fullcalendar/daygrid @fullcalendar/timegrid @fullcalendar/list @fullcalendar/interaction
  ```
- [ ] `calendar_events` table already created in Phase 2. Verify columns: `id`, `org_id`, `title`, `start_at`, `end_at`, `event_type` (enum), `related_id`, `related_table`, `color`, `all_day`, `recurrence_rule`
- [ ] `CalendarView` component — responsive: month/week/day on desktop, list/agenda on mobile
- [ ] Event color coding by type (work_order, inspection, contract_milestone, maintenance)
- [ ] Click event → opens related record (dynamic route based on `related_table`)
- [ ] Drag-to-reschedule (supervisors and admins only, enforced via role check)
- [ ] Nightly cron Edge Function — runs at 02:00 AST:
  - Generates next occurrence for recurring events
  - Inserts `notifications` rows for events due in 24h, 48h, and 7 days
- [ ] Calendar page: route `/dashboard/calendar`

**Deliverable:** Calendar renders at `/dashboard/calendar`. Recurring event engine runs nightly. Deadline notification rows are created automatically.

---

### Phase 7 — Backups, monitoring, and CI/CD
**Goal:** Production-grade reliability before the first client feature is deployed.

- [ ] **Nightly backup script** (`scripts/backup.sh`):
  ```bash
  #!/bin/bash
  TIMESTAMP=$(date +%Y%m%d_%H%M%S)
  pg_dump $DATABASE_URL | gzip | gpg --symmetric --passphrase $BACKUP_PASSPHRASE \
    > /tmp/backup_$TIMESTAMP.sql.gz.gpg
  rclone copy /tmp/backup_$TIMESTAMP.sql.gz.gpg b2:sentinel-backups/db/
  rm /tmp/backup_$TIMESTAMP.sql.gz.gpg
  # Alert if backup file is suspiciously small (silent failure detection)
  ```
  - Cron: `0 2 * * * /opt/sentinel/scripts/backup.sh >> /var/log/sentinel-backup.log 2>&1`
  - Retention: 30 daily, 12 monthly snapshots
- [ ] **Storage backup** — rclone sync of Supabase Storage volume to B2 nightly (incremental)
- [ ] **Health check endpoint** (`apps/web/app/api/health/route.ts`):
  ```typescript
  // Must return 200 within 5 seconds or UptimeRobot alerts
  // Checks: DB ping, Storage ping, app version
  ```
- [ ] **UptimeRobot** — configure free account to ping `/api/health` every 5 minutes, alert to email
- [ ] **Docker restart policy** — `restart: unless-stopped` on all services in Compose file
- [ ] **GitHub Actions CI/CD** (`.github/workflows/deploy.yml`):
  ```yaml
  # On push to main:
  # 1. pnpm install
  # 2. pnpm typecheck
  # 3. pnpm build
  # 4. SSH to VPS
  # 5. git pull
  # 6. docker compose up -d --build
  # Zero-downtime: Nginx buffers requests during container restart
  ```
- [ ] `.github/workflows/typecheck.yml` — runs on every PR, blocks merge if types fail

**Deliverable:** Backup runs nightly and is verifiable in B2. UptimeRobot is monitoring. A `git push` to main automatically deploys to production.

---

### Phase 8 — Notification infrastructure (Novu)
**Goal:** Single notification API for all channels. Email works. Other channels configured when credentials are available.

- [ ] Deploy Novu self-hosted (add to Docker Compose):
  - Services needed: `novu-api`, `novu-worker`, `novu-web`, `novu-ws`, `redis`, `mongodb`
  - Expose Novu dashboard at `notify.yourdomain.com` via Nginx
  - **Port conflict check before adding to Compose**
- [ ] Connect email provider (Resend or confirmed provider) in Novu dashboard
- [ ] Set from address: `alerts@yourdomain.com`
- [ ] Create foundation notification workflows in Novu:
  - `user-invited` — triggered when admin invites a new user
  - `password-reset` — triggered by Supabase Auth (already handled, but add Novu copy for logging)
  - `system-alert` — triggered by health check failures
- [ ] **In-app notification bell** (`apps/web/components/notifications/NotificationBell.tsx`):
  - Supabase Realtime subscription on `notifications` table, filtered by `user_id = auth.uid()`
  - Unread count badge on bell icon in nav header
  - Dropdown: last 20 notifications, mark-read on open
  - All modules will insert rows into `notifications` — this component reacts automatically
- [ ] Placeholder channels (configure when credentials confirmed):
  - SMS via Twilio — add API keys to Novu when available
  - WhatsApp via Twilio gateway — add when available
  - Slack — add webhook URL when available

**Deliverable:** User invitation emails deliver. In-app notification bell works and updates in real time. Other channels ready to activate with credentials.

---

## 8. Code Conventions

### File structure inside `apps/web`
```
app/
  (auth)/
    login/page.tsx
    invite/page.tsx
  (dashboard)/
    layout.tsx          ← role-aware nav, protected route
    map/page.tsx
    calendar/page.tsx
    work-orders/...
    contracts/...
  api/
    health/route.ts
components/
  map/MapView.tsx
  notifications/NotificationBell.tsx
  ui/PhotoUpload.tsx
  ui/GpsCapture.tsx
  layout/Sidebar.tsx
  layout/Header.tsx
hooks/
  useGeoLocation.ts
  useRole.ts
  useNotifications.ts
lib/
  supabase/server.ts
  supabase/client.ts
  supabase/middleware.ts
```

### Naming conventions
- Components: PascalCase (`WorkOrderCard.tsx`)
- Hooks: camelCase with `use` prefix (`useWorkOrders.ts`)
- Server actions: camelCase with `action` suffix (`createWorkOrderAction.ts`)
- Database migrations: `NNN_description.sql` where NNN is zero-padded sequence
- Environment variables: `SCREAMING_SNAKE_CASE`, prefixed `NEXT_PUBLIC_` only for values safe to expose to browser

### TypeScript rules
- No `any` — use `unknown` and narrow
- All database types imported from `packages/db/src/types.ts` — never manually type DB rows
- Zod schemas in `packages/shared/src/schemas/` for all form validation and API input
- Server Components for data fetching — Client Components only when interactivity requires it

### Security rules (non-negotiable)
- Never expose `SERVICE_ROLE_KEY` to the browser — server-side only
- All user input sanitized via Zod before any database operation
- All file uploads validated server-side (type, size, malware scan optional phase 2)
- All private storage accessed via signed URLs only — never direct public paths
- Audit log for all write operations — insert to `audit_log` table via trigger

---

## 9. Environment Variables Reference

Create `.env` in root and `apps/web/.env.local`. Never commit actual values.

```bash
# Supabase (self-hosted)
NEXT_PUBLIC_SUPABASE_URL=https://db.yourdomain.com
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key  # NEVER in NEXT_PUBLIC_

# Database (direct connection for migrations)
DATABASE_URL=postgresql://postgres:password@localhost:5432/postgres

# Email
RESEND_API_KEY=re_xxxx
SMTP_FROM=alerts@yourdomain.com

# Backups
BACKUP_PASSPHRASE=strong-random-passphrase
B2_KEY_ID=your-backblaze-key-id
B2_APPLICATION_KEY=your-backblaze-app-key
B2_BUCKET_NAME=sentinel-backups

# Novu
NOVU_API_KEY=your-novu-api-key
NEXT_PUBLIC_NOVU_APP_ID=your-novu-app-id

# Notifications (add when credentials confirmed)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=
SLACK_WEBHOOK_URL=

# Map (if using a provider that requires a key)
# NEXT_PUBLIC_MAPTILER_KEY=  ← only if switching from OpenFreeMap

# Guaynabo geographic constants
NEXT_PUBLIC_MAP_CENTER_LNG=-66.0858
NEXT_PUBLIC_MAP_CENTER_LAT=18.3830
NEXT_PUBLIC_MAP_ZOOM=13
NEXT_PUBLIC_MAP_BOUNDS_SW="-66.1197,18.3394"
NEXT_PUBLIC_MAP_BOUNDS_NE="-66.0519,18.4267"
```

---

## 10. What NOT to Do

- ❌ Do not run `npm install` — use `pnpm` always
- ❌ Do not create tables in Supabase Studio — use migrations
- ❌ Do not commit `.env` files
- ❌ Do not disable RLS on any table
- ❌ Do not expose `SERVICE_ROLE_KEY` in any client-side code
- ❌ Do not touch existing Docker containers or services on the VPS without explicit instruction
- ❌ Do not use `any` in TypeScript
- ❌ Do not hand-edit `packages/db/src/types.ts` — regenerate with CLI
- ❌ Do not add `npm` or `yarn` lock files alongside `pnpm-lock.yaml`
- ❌ Do not bypass Zod validation on any server action or API route
- ❌ Do not hard-code Guaynabo as the only municipality — always scope queries to `org_id`

---

## 11. First Session Checklist

When starting a fresh Claude Code session, confirm these before any code:

1. Which phase are we working on?
2. Are all prerequisites for that phase complete? (Ask user to confirm)
3. Are there any open decisions from Section 4 that affect this phase?
4. What is the exact task within the phase?

Then proceed step by step, pausing for confirmation when:
- Deploying anything to the VPS
- Running database migrations
- Making changes to `.env` files
- Modifying any existing Docker service
- Making a decision not covered in this document

---

## 12. Current Status — ARCHIVED

> **This table reflects the project's state at initial planning (mid-2026) and is
> kept for historical context only. It is NOT current.** For the real status see
> **Section 12a (Current Reality)** at the top of this document. Phases 0–8 below
> are all complete; the platform is in production at sims.sentinelmgpr.com.

As of the creation of this document (historical):

| Item | Status (at planning time) |
|---|---|
| VPS provisioned | ✅ Done |
| Client requirements form | ⏳ Pending — client has not returned selections |
| Domain and DNS | ❓ Unknown — confirm with user |
| GitHub repo | ⏳ To be created |
| Dev machine tools | ⏳ Phase 0 not started |
| Phase 0 (dev setup) | ⏳ Not started |
| Phase 1 (VPS hardening) | ⏳ Not started — must audit existing services first |
| Phase 2 (monorepo + DB) | ⏳ Not started |
| Phases 3–8 | ⏳ Not started |

*(All of the above are now complete — see Section 12a.)*

---

*This document was generated from a planning session on claude.ai. The phase plan
and status table (Sections 7, 12) are the original build blueprint, now delivered.
Section 12a records current reality. For questions about why a decision was made,
ask the user — they have the full context from the planning conversation.*
