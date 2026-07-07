/**
 * Version history for Sentinel Infrastructure Management System.
 * Format: MAJOR.MINOR.PATCH.BUILD
 *
 * When to bump:
 *   MAJOR — architecture overhaul, breaking changes, new platform capability
 *   MINOR — new user-facing module or significant feature set
 *   PATCH — a logical group of related fixes or small improvements (decided manually)
 *   BUILD — every deploy (auto-incremented by deploy-staging.sh)
 *
 * GitHub Releases (ChangelogTile) = stakeholder-facing "What's New" per PATCH
 * This file (VersionHistoryTile) = engineering audit trail per BUILD
 */

export interface BuildEntry {
  build:       string   // e.g. "1.1.0.4"
  commitSha?:  string   // short 7-char sha
  description: string   // brief what changed
}

export interface PatchEntry {
  patch:       string         // e.g. "1.1.0"
  summary:     string         // one-liner for the patch
  builds:      BuildEntry[]
}

export interface MinorEntry {
  minor:       string         // e.g. "1.1"
  summary:     string         // what this minor version introduced
  patches:     PatchEntry[]
}

export interface MajorEntry {
  major:       string         // e.g. "1"
  summary:     string         // major milestone description
  minors:      MinorEntry[]
}

export const VERSION_HISTORY: MajorEntry[] = [
  {
    major: '1',
    summary: 'Foundation platform — auth, FM dashboard, infrastructure, System Health monitoring',
    minors: [
      {
        minor: '1.1',
        summary: 'Production readiness — System Health, SMTP email, CI/CD pipeline, calendar engine, FM tab titles',
        patches: [
          {
            patch: '1.1.0',
            summary: 'Platform hardening — CI/CD pipeline, System Health, version tracking, SMTP email, calendar engine, FM improvements',
            builds: [
              { build: '1.1.0.57', commitSha: '3f3a0f5', description: 'Schedule workspace: Resource + Week views for the unified FM calendar (calendar roadmap, phase 1 UI)' },
              { build: '1.1.0.56', commitSha: '847f70f', description: 'Unified schedule read API — merges inspections, work orders, and repair-plan project tasks into one model (calendar roadmap, phase 1)' },
              { build: '1.1.0.55', commitSha: 'c099526', description: 'PRODUCTION PROMOTION (code-only, no pending migrations): System Maps node graph gets live particle-flow, hub-pulse, hover, and blast-radius animations (overlay canvas; physics frozen for 60fps on a ~1900-node graph); promotes all 1.1.0.29–55 features to sims.sentinelmgpr.com' },
              { build: '1.1.0.54', commitSha: '14214d2', description: 'System Maps: node data rewritten to the real per-client prod stack — removed Novu/Redis/MongoDB/Twilio/Slack (never deployed), added Cloudflare/Kong/PostgREST/Edge Functions' },
              { build: '1.1.0.53', commitSha: '12606d2', description: 'Settings: new full-screen System Maps viewer (Services/Data Flow/Dependencies + new Nodes tab), theme-synced with the app' },
              { build: '1.1.0.52', commitSha: '853f1ff', description: 'Security: sanitize FM search filter input (PostgREST injection) and escape notification email HTML; guard inspection-complete write; restrict tenant routes to platform admin; add SECURITY_REVIEW.md' },
              { build: '1.1.0.51', commitSha: '42088fa', description: 'Register graphify Claude Code integration; auto-refresh the knowledge graph on deploy' },
              { build: '1.1.0.50', commitSha: 'ac69557', description: 'Remove orphaned weather subscribe endpoint and the debug-auth endpoint (hardcoded admin credentials — security fix); correct CLAUDE.md to reflect production reality; add graphify config' },
              { build: '1.1.0.49', commitSha: '9cd84f4', description: 'Weather-sync cron edge function; SIMS rebrand (from Sentinel Public Works); FCA facility-assessment tool; hurricane preparedness materials; FM analytics mockup' },
              { build: '1.1.0.48', commitSha: '7272db2', description: 'Weather: alert prose parsing, isohyet dry craters, zoom transform fixes' },
              { build: '1.1.0.47', commitSha: '394448e', description: "Weather: isohyet panning lag fixed via CSS translate during move + re-render on end" },
              { build: '1.1.0.46', commitSha: '6c512cf', description: 'Weather: remove QPF HTML markers covering the isohyet canvas' },
              { build: '1.1.0.45', commitSha: 'd413a29', description: 'Weather: isohyet transparent no-rain areas, inverted color ramp, station-radius masking' },
              { build: '1.1.0.44', commitSha: '5db6f9a', description: 'Weather: replace station markers with an isohyet contour canvas layer' },
              { build: '1.1.0.43', commitSha: '3805ad1', description: "Weather: fix MapLibre 'load' event never firing with OpenFreeMap tiles (use style.load instead)" },
              { build: '1.1.0.42', commitSha: 'd3adb98', description: 'Weather: debug logging for station marker creation' },
              { build: '1.1.0.41', commitSha: '5157260', description: "Weather: fetch station data directly in map on('load') to avoid a race (build failed)" },
              { build: '1.1.0.40', commitSha: 'b70b8a5', description: 'Weather: handle both directions of the station-marker race condition' },
              { build: '1.1.0.39', commitSha: 'bd74d91', description: 'Weather: create station markers reactively via a prop instead of inside map load' },
              { build: '1.1.0.38', commitSha: '8e73d9a', description: 'Weather: use Puerto Rico local date for the CoCoRaHS URL' },
              { build: '1.1.0.37', commitSha: 'a1621f4', description: 'Weather: add CoCoRaHS + USGS rain gauge stations to the Rainfall map layer' },
              { build: '1.1.0.36', commitSha: 'cef74c2', description: 'Weather: parse NWS bulletin format into clean detail text' },
              { build: '1.1.0.35', commitSha: 'a4ee7f7', description: 'Weather: wind particles on MapLibre, layer toggle + map resize fixes' },
              { build: '1.1.0.34', commitSha: 'bb63887', description: 'Weather: wind particles on MapLibre, layer toggle + map resize (initial)' },
              { build: '1.1.0.33', commitSha: '508e057', description: 'Weather: self-fetch NWS/Open-Meteo when the cache is cold' },
              { build: '1.1.0.32', commitSha: 'f77af32', description: 'Weather: add public weather API, live data tables, and map UI fixes' },
              { build: '1.1.0.31', commitSha: 'b08b2e1', description: 'Deploy: hard-fail if /opt/sentinel/.env is missing or has the wrong Supabase URL' },
              { build: '1.1.0.30', commitSha: 'bf92dd6', description: 'docs(version): add the 1.1.0.27 production promotion entry (this CI run was cancelled; content landed via the next run)' },
              { build: '1.1.0.29', commitSha: '9dc5515', description: 'docs(version): add build history 1.1.0.20–1.1.0.26 to System Health' },
              // NOTE: 1.1.0.28 could not be reconstructed from available CI/git history — the
              // build counter (verified live at 57) implies one more deploy run occurred between
              // 1.1.0.27 and 1.1.0.29 than the CI run log shows, likely an untracked retry or a
              // cancelled run that still incremented the counter. Left as a documented gap rather
              // than a guessed entry. See staging_cleanup memory (2026-07-07) for the reconstruction method.
              { build: '1.1.0.27', commitSha: 'fedce2c', description: 'PRODUCTION PROMOTION: all 1.1.0.26 features promoted to production; created /opt/sentinel/.env (was missing) so deploy-prod.sh can inject Supabase credentials at build time' },
              { build: '1.1.0.26', commitSha: 'fedce2c', description: 'Mobile: work order/inspection/reports bottom margins; PDF thumbnails via pdfjs-dist; multi-page PDF viewer (embed); project edit form reachable on mobile; force-dynamic on API routes; fix concurrent-build .next corruption' },
              { build: '1.1.0.25', commitSha: 'a0f8f0a', description: 'Performance: mobile fast-path (?view=mobile) cuts dashboard payload ~90%; COUNT-only queries; Cache-Control headers on all FM API routes; dashboard stat cards tappable' },
              { build: '1.1.0.24', commitSha: '4382d07', description: 'Mobile FM: bottom nav overlap fixed across all pages; two-month calendar added to FM dashboard; FCA detail stacked layout on mobile; property detail portrait-mode fix' },
              { build: '1.1.0.23', commitSha: '4e3aff1', description: 'Mobile UI: FM module Warmth/Command layout; iOS photo library selection fix in FCA; property tab strip horizontally scrollable' },
              { build: '1.1.0.22', commitSha: 'f0f9772', description: 'Fix iOS camera/photo-library restriction in FCA — capture attribute removed so both are available' },
              { build: '1.1.0.21', commitSha: 'eb0542e', description: 'FM schema fixes: portfolio analytics and team API column mismatches; settings payload trimmed; 16 missing FK indexes added (migration 049)' },
              { build: '1.1.0.20', commitSha: '2931d3a', description: 'Staging QA sweep: GoTrue empty-role regression re-fixed; B2 backup status fetched on settings mount; auth diagnostic endpoint (removed after QA)' },
              { build: '1.1.0.19', commitSha: '9f9a56a', description: 'FM layout metadata fix — all FM pages now show correct browser tab title (was stale "Sentinel Public Works")' },
              { build: '1.1.0.18', commitSha: 'ffbc963', description: 'Calendar: add recurring event generation (60-day lookahead, rrule) + PATCH API for drag-to-reschedule; migration 048 adds parent_event_id' },
              { build: '1.1.0.17', commitSha: '7d57676', description: 'Contabo tile: switch from /snapshots to /v1/backups endpoint (correct API for auto-backup schedule)' },
              { build: '1.1.0.16', commitSha: '9a0fb1f', description: 'Production deploy script (deploy-prod.sh) + workflow_dispatch CI job for staging → production promotion' },
              { build: '1.1.0.15', commitSha: '93dee4d', description: 'GitHub Actions timeout raised to 40m; webpack workers capped at 2 to reduce CPU contention during build' },
              { build: '1.1.0.14', commitSha: '52d764e', description: 'Remove package.json version override in next.config (was overriding .env.local build counter); Cache-Control: no-store headers to prevent Cloudflare HTML caching' },
              { build: '1.1.0.13', commitSha: 'c79d225', description: 'B2 credential name fix (B2_KEY_ID not B2_ACCOUNT_ID); org_admin default route → FM dashboard; seed migration guard in deploy script' },
              { build: '1.1.0.12', commitSha: 'c2e4ab0', description: 'NODE_OPTIONS heap 3072 MB to prevent OOM crash mid-build; fix APP_VERSION dedup in .env.local' },
              { build: '1.1.0.11', commitSha: '856d93a', description: 'NODE_OPTIONS --max-old-space-size=3072 to prevent OOM crash; fix APP_VERSION dedup (keep last occurrence only)' },
              { build: '1.1.0.10', commitSha: '953cff6', description: 'Move build counter to /srv/sentinel/staging/build-number.txt outside git repo — git reset was resetting it on each deploy' },
              { build: '1.1.0.9',  commitSha: 'dcb03ae', description: 'System Health: CI tile expanded to 2-col with commit SHA + description; collapsible version history accordion added; WorkflowRun gains commitSha field' },
              { build: '1.1.0.8',  commitSha: '0a9590a', description: 'System Health: CI run entries now show date + time; CPU utilization label clarified vs load average' },
              { build: '1.1.0.7',  commitSha: '53b3548', description: 'Actions timeout 25m; deploy script copies admin credentials to .env.local (not just NEXT_PUBLIC_*); disk display GiB fix' },
              { build: '1.1.0.6',  commitSha: 'd5f0893', description: 'System Health: correct disk GiB calculation (was showing 0); CPU core count context; RAM shown in GB' },
              { build: '1.1.0.5',  commitSha: '1780b48', description: 'Remove rm -rf .next before build — caused ENOTEMPTY race condition' },
              { build: '1.1.0.4',  commitSha: 'e2672cf', description: 'Safe env file parsing (IFS= read loop) to handle special chars in credentials; CI run date+time display; CPU core context' },
              { build: '1.1.0.3',  commitSha: 'd9b6a18', description: 'Auto-increment BUILD counter on every staging deploy via /srv/sentinel/staging/build-number.txt' },
              { build: '1.1.0.2',  commitSha: 'e2672cf', description: 'Safe env parsing (special chars crash fix); CI run date+time display; CPU core context in System Health' },
              { build: '1.1.0.1',  commitSha: 'd9b6a18', description: 'Auto-increment version numbering on every deploy' },
              { build: '1.1.0.0',  commitSha: '15f7ff4', description: 'Revert unstable_cache (was caching null profile → viewer fallback for all users)' },
            ],
          },
        ],
      },
      {
        minor: '1.0',
        summary: 'FM dashboard, portfolio analytics, FCA inspections, auth routing, performance',
        patches: [
          {
            patch: '1.0.0',
            summary: 'Initial FM module — progressive dashboard, analytics, FCA reports, auth fixes, performance',
            builds: [
              { build: '1.0.0.x', commitSha: '6b0f56d', description: 'FM sidebar mode now derived from pathname — FM routes always show FM menu regardless of localStorage' },
              { build: '1.0.0.x', commitSha: '970ee27', description: 'Revert SUPABASE_INTERNAL_URL — was breaking cookie storage key, causing redirect loops' },
              { build: '1.0.0.x', commitSha: '4ace4f1', description: 'Fix TypeScript error in loginAction nested join type' },
              { build: '1.0.0.x', commitSha: '3ac70e5', description: 'Use admin client for post-login redirect; remove getSession from Server Action (cookie timing bug)' },
              { build: '1.0.0.x', commitSha: 'de137e1', description: 'Projects menu visible to FM supervisors; fix null-capability role fallback' },
              { build: '1.0.0.x', commitSha: 'c53e1e3', description: 'FM reports: add print/view page for portfolio and inspection reports' },
              { build: '1.0.0.x', commitSha: '41e68ab', description: 'FM scoring: use avg(rating)/5×100 methodology everywhere; fix Amelia FCA stored score' },
              { build: '1.0.0.x', commitSha: '4f86702', description: 'Portfolio Analytics page — life safety deficiency tracking across all properties' },
              { build: '1.0.0.x', commitSha: 'aada138', description: 'Portfolio analytics embedded into Reports → Analytics tab' },
              { build: '1.0.0.x', commitSha: '9175df4', description: 'RICS-style commentary fields added to FCA inspections' },
              { build: '1.0.0.x', commitSha: '6f0534d', description: 'FCA: AI Status copy button for Claude Project workflow' },
              { build: '1.0.0.x', commitSha: '65200dd', description: 'Three-layer latency reduction for server-side rendering' },
              { build: '1.0.0.x', commitSha: '5b446a4', description: 'FM dashboard as default for org_admin + progressive KPI loading' },
            ],
          },
        ],
      },
    ],
  },
]
