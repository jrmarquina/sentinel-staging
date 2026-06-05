/**
 * Version history for Sentinel Infrastructure Management System.
 * Format: MAJOR.MINOR.PATCH.BUILD
 *
 * When to bump:
 *   MAJOR — architecture overhaul, breaking changes, new platform capability
 *   MINOR — new user-facing module or significant feature set
 *   PATCH — a logical group of related fixes or small improvements (decided by Claude)
 *   BUILD — every deploy (auto-incremented by deploy-staging.sh)
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
        summary: 'System stability and observability — zombie process cleanup, System Health overlay, progressive FM dashboard loading, login routing, CI/CD pipeline hardening',
        patches: [
          {
            patch: '1.1.0',
            summary: 'Initial hardening — performance optimizations, System Health dashboard, login/routing fixes, CI/CD fixes',
            builds: [
              { build: '1.1.0.2', commitSha: 'd9b6a18', description: 'Auto-increment version numbering on every deploy' },
              { build: '1.1.0.1', commitSha: 'e2672cf', description: 'Safe env parsing (special chars crash fix); CI run date+time display; CPU core context in System Health' },
              { build: '1.1.0.0', commitSha: '15f7ff4', description: 'Revert unstable_cache (was caching null profile → viewer fallback for all users)' },
              { build: '1.0.0.x', commitSha: '6b0f56d', description: 'FM sidebar derives mode from pathname — FM routes always show FM menu regardless of localStorage' },
              { build: '1.0.0.x', commitSha: '970ee27', description: 'Revert SUPABASE_INTERNAL_URL — was breaking cookie storage key, causing redirect loops' },
              { build: '1.0.0.x', commitSha: '4ace4f1', description: 'Fix TypeScript error in loginAction nested join type' },
              { build: '1.0.0.x', commitSha: '3ac70e5', description: 'Use admin client for post-login redirect; remove getSession from Server Action (cookie timing bug)' },
              { build: '1.0.0.x', commitSha: '53b3548', description: 'GitHub Actions timeout 10m→25m; deploy script copies admin credentials to .env.local; disk GiB display fix' },
              { build: '1.0.0.x', commitSha: '0a9590a', description: 'CI/CD tile: add date+time to deployments; clarify CPU utilization vs load average labels' },
              { build: '1.0.0.x', commitSha: 'd5f0893', description: 'System Health: fix disk GB display (was showing 0); add CPU core count context; RAM in GB' },
            ],
          },
        ],
      },
    ],
  },
]
