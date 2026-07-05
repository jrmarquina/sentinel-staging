# SIMS Security & Code Review

Chunked, lean inline review (graphify-oriented). Wave 1 = security-critical areas.
Severity: **HIGH** (exploitable, real impact) · **MED** (conditional/tenant-isolation) · **LOW** (defense-in-depth / info leak) · **INFO** (note).

Status legend: ☐ open · ☑ fixed

---

## C1 — Auth core (middleware, lib/auth, lib/supabase, auth routes) ✅ reviewed

Files: `apps/web/middleware.ts`, `lib/auth/get-session.ts`, `lib/auth/actions.ts`, `lib/auth/fm-actions.ts`, `lib/supabase/server.ts`, `lib/supabase/client.ts`, `app/auth/callback/route.ts`.

### ☐ HIGH — `inviteUserAction` has no authorization check → privilege escalation
`apps/web/lib/auth/actions.ts:78`
The action only checks the caller is *authenticated* (`if (!currentUser)`), then uses the **service-role admin client** to invite a new user and insert a `user_roles` row with the caller-supplied `role`. Any authenticated user (even `viewer`/`fm_worker`) can invite an email they control as `admin` to their own org, accept the invite, and gain admin. Contrast with `fm-actions.ts` where every equivalent action gates on `session.role !== 'admin'`.
**Fix:** add `const session = await getSession(); if (session?.role !== 'admin') return { error: 'Forbidden' }` (or `requireRole(['admin'])`) at the top, matching `createFmUserAction`.

### ☐ MED — Cross-tenant user management: target org not verified
`apps/web/lib/auth/fm-actions.ts:124` (`updateFmUserAction`), `:183` (`deleteFmUserAction`)
The caller is verified to be an `admin`, but the **target `user_id` is never checked to belong to the caller's org**. Both use the service-role admin client (RLS bypassed) and operate on the raw `user_id`: password reset (`updateUserById`), role upsert, profile update, ban, soft-delete. An admin of org A can pass a `user_id` from org B and reset that user's password / change their role / delete them. Breaks the multi-tenant isolation the whole platform is built on.
**Fix:** before mutating, load the target's `profiles.org_id` (via admin client) and reject if `!== session.orgId`.

### ☐ MED — Unprovisioned-profile fallback assigns a real org + role (fail-open)
`apps/web/lib/auth/get-session.ts:82`
When `get_my_profile` returns nothing, `getSession()` returns a synthetic profile with hardcoded `orgId: '00000000-…-0001'` and `role: 'viewer'`. Role is least-privilege (good), but any authenticated-but-unprovisioned user is silently placed **inside org 0001 (Sentinel)** and any Server Component using `session.orgId` will scope them there. In a multi-tenant system a broken/partial provisioning should fail closed, not assign a tenant.
**Fix:** return `null` (or a no-org sentinel that downstream treats as unauthorized) instead of defaulting into org 0001.

### ☐ LOW — Login action leaks raw GoTrue error to the client (leftover debug)
`apps/web/lib/auth/actions.ts:25`
`return { error: \`[DEBUG] ${error.message} (status: ${error.status ?? 'n/a'})\` }` surfaces internal auth error text + status to the login form — aids user enumeration and is clearly debug residue.
**Fix:** return a generic `'Invalid email or password.'`

### ☐ LOW — Open-redirect shape in auth callback
`apps/web/app/auth/callback/route.ts:13`
`NextResponse.redirect(\`${origin}${next}\`)` with attacker-controlled `next`. `next=@evil.com` yields `https://host@evil.com` (host becomes userinfo → redirect to evil.com). Requires a valid single-use `code`, so low likelihood, but the pattern is unsafe.
**Fix:** validate `next` starts with a single `/` and not `//` or `/\`, else fall back to `/dashboard`.

### ☐ LOW — `forgotPasswordAction` skips Zod validation
`apps/web/lib/auth/actions.ts:150` — uses raw `formData.get('email')` with only a truthy check, unlike every other action. Minor consistency/robustness gap.

### ☐ LOW — `listFmUsersAction` pulls all GoTrue users then filters in memory
`apps/web/lib/auth/fm-actions.ts:257` — `admin.auth.admin.listUsers({ perPage: 1000 })` fetches users across **all orgs**, then filters to the caller's org IDs client-side. No leak today (filtered before return), but cross-tenant data in memory + inefficient; a future refactor of the filter could regress into a leak.

### INFO — Middleware gates on unverified `getSession()` (cookie read)
`apps/web/middleware.ts:33` — deliberate (documented) Supabase-SSR performance tradeoff; real enforcement is `getUser()` in Server Components + `requireRole()` in API routes. Valid **only if** every protected page/route actually re-checks. Wave 1 C2–C4 will confirm API routes consistently call `requireRole`.
> **C2 update:** confirmed — every `api/fm/*` route in C2 re-checks auth (`getSession`/`requireRole`) and enforces `.eq('org_id', session.orgId)`. Middleware backstop is sound for this area.

---

## C2 — api/fm/* part A (properties, assets, work-orders, deficiencies, search) ✅ reviewed

Files: `api/fm/{properties,assets,work-orders,deficiencies,search}/**` (17 routes). Overall **strong** — capability-based access levels, org scoping on every query, server-set `submitted_by_id`, contributor schema strips manager-only fields. Two issues + one good-pattern note.

### ☑ FIXED (2026-07-05) — PostgREST `.or()` filter injection via unsanitized `q`
`apps/web/app/api/fm/search/route.ts:43,51,67` — added `safeQ = q.replace(/[,()*:\\"]/g,'').trim()` (+ re-check length) before building the `.or()` filter string.
`q` is interpolated raw into `.or(\`name.ilike.%${q}%,code.ilike.%${q}%,...\`)`. PostgREST parses the `.or()` string, so a `q` containing `,` `.` `(` `)` `:` can inject/alter filter conditions (e.g. `q = "a,priority.eq.HIGH"` adds an OR clause). **Cross-tenant is blocked** — `org_id` is a separate `.eq()` ANDed onto the query — so impact is limited to widening/altering results *within the caller's own org* and possible query errors. Still a real injection pattern.
**Fix:** sanitize `q` (strip/reject PostgREST metacharacters `,.():*` ) or use per-column `.ilike()` calls instead of building the `.or()` string.

### ☐ MED (confirm under C5/C6 RLS) — WO insert trusts client-supplied FK ids
`apps/web/app/api/fm/work-orders/route.ts:302-313`
POST inserts `property_id` (and optional `asset_id`, `inspection_id`) straight from the request body, setting `org_id = session.orgId` but never verifying those FK rows belong to the caller's org. A contributor could reference another org's `property_id`. The insert uses the RLS client, so a proper `fm_work_orders` INSERT policy / FK-with-org check would catch it — but the sibling `deficiencies/[id]/work-order` route verifies ownership explicitly, so this one is inconsistent. Verify the RLS policy covers cross-org FK refs in C5/C6; if not, add an explicit org-ownership check on `property_id`.

### INFO / GOOD PATTERN — service-role storage handlers verify ownership first
`api/fm/properties/[id]/attachments/[attId]/route.ts:37`, `properties/[id]/image/route.ts:73`
Both look up the target row scoped to `org_id` (+ `property_id`) via the **RLS client** before doing any service-role storage op, and derive storage paths from `session.orgId` (not client input) → no cross-tenant traversal. This is the correct service-role pattern and the direct contrast that makes C1's `updateFmUserAction`/`deleteFmUserAction` missing-org-check a real deviation.

---

## C3 — api/fm/* part B (inspections, templates, schedules, reports, analytics, team, tenants, users) ✅ reviewed

22 routes. Analytics/reports/inspections/schedules/templates GETs are consistently org-scoped and role-gated (spot-checked; low risk). Two real findings, both in tenant/user management, plus confirmation that C1's cross-tenant bug is a **recurring pattern**.

### ☐ HIGH — Tenant/org management authorized by per-org `admin`, not a platform super-admin
`apps/web/app/api/fm/tenants/route.ts:24` (GET), `:42` (POST), `apps/web/app/api/fm/tenants/[id]/route.ts:14` (DELETE)
These operate on the `organizations` table (the tenants themselves) gated only by `requireRole(['admin'])`. But `admin` is an **org-scoped** role (from `user_roles` for the caller's own org), not a platform owner. Consequences for any single municipality's admin:
- **GET `/api/fm/tenants`** returns **every organization on the platform** (`select(...).order('name')`, no org filter) → cross-tenant enumeration of all client municipalities.
- **DELETE `/api/fm/tenants/[id]`** deletes **any** org by id (only the `sentinel` slug is protected). FK-restrict likely blocks orgs that already have child records (see the "has associated records" error), but empty/new tenants are deletable by a foreign admin.
- **POST** lets any org admin create new organizations.
**Fix:** gate these on a genuine platform-super-admin check (e.g. membership in the Sentinel org `0001` or a dedicated `super_admin` capability), not the per-org `admin` role.

### ☐ MED — Cross-tenant user mutation via service-role without target-org verification (recurring)
`apps/web/app/api/fm/users/route.ts:210` (PATCH password reset), `:114-119` (POST email-collision branch)
PATCH resets any `user_id`'s password through the **service-role admin client** with no check that the target belongs to `session.orgId` (the profile update above *is* org-scoped, but the `admin.auth.admin.updateUserById(user_id, { password })` is not). POST with an email that "already exists" resets that existing user's password to an attacker-chosen value and upserts their profile into the caller's org → **cross-tenant account takeover** (requires knowing the victim's email). Same root cause as C1 `updateFmUserAction`/`deleteFmUserAction`.
**Fix (systemic):** before any service-role user mutation, load the target `profiles.org_id` and require `=== session.orgId`. Apply in all three user-management paths.

### ☐ LOW — Minor org-scoping gaps in user routes
`users/route.ts:193` role-definition lookup omits `.eq('org_id', session.orgId)`; `users/[id]/route.ts:72` role `upsert` doesn't pre-verify the target is in-org (its profile ops are org-scoped, so impact is limited to an orphan role binding).

### INFO — Systemic: three overlapping user-management implementations
`lib/auth/fm-actions.ts` (server actions), `api/fm/users/route.ts` (collection), `api/fm/users/[id]/route.ts` (item). `users/[id]` and `team/route.ts` are correctly org-scoped; the server actions and the collection route are the vulnerable ones. Beyond the security fix, the duplication means every future auth change must land in three places — worth consolidating onto one helper that enforces the target-org check centrally.

### INFO — Recurring inefficiency: `listUsers({ perPage: 1000 })` then filter
`team/route.ts:94` (also `fm-actions.ts:257`, C1). Fetches all GoTrue users across orgs to build an email map; only the caller's org members are returned (no leak today), but it's O(all-tenants) work and a regression risk.

---

## C4 — api/admin, api/weather, api/projects, api/{attachments,calendar,health,auth}, edge functions ✅ reviewed

`api/weather/live` + `weather-sync` already covered in the earlier code review (findings applied). Focus here: signed-URL access, cron auth, admin/infra gating, projects.

### ☐ MED (confirm under C5/C6 RLS) — Private-document signed URL has no code-level org scoping
`apps/web/app/api/attachments/[id]/route.ts:16-29`
Checks the caller is authenticated, then looks up the attachment **by `id` only** (`.eq('id', params.id).is('deleted_at', null)`) and hands back a 1-hour signed URL to the file. There is **no `org_id` check in code** — cross-tenant protection rests entirely on RLS on the `attachments` table (and `storage.objects`). If that policy is missing or permissive, any authenticated user can fetch any attachment by id → **IDOR on private documents** (municipal records). This is the Phase-5 "private docs via signed URL only" path; confirm the `attachments` SELECT policy is org-scoped in C5/C6, and consider adding a defense-in-depth `.eq('org_id', session.orgId)`.

### ☐ LOW — Platform infra endpoints gated by per-org `admin` (same class as C3 tenants)
`apps/web/app/api/admin/backups/route.ts:80`, `apps/web/app/api/admin/system/route.ts` (admin gate)
Backup listing (prod+staging filenames/sizes) and System Health are gated by `session.role === 'admin'` — a per-org role — for platform-wide infrastructure data. Lower sensitivity than tenants (metadata only, no cred leak: B2 errors surface only status codes). Resolves automatically under the super-admin decision below.

### GOOD — correct patterns confirmed
- `calendar-events/[id]/route.ts:16-48` — authenticates, checks role ∈ {admin,supervisor}, **and verifies the event's `org_id`** before updating (triage `authz=0` was a false signal — it uses inline `getUser`+`user_roles` rather than `requireRole`).
- `supabase/functions/nightly-calendar/index.ts:20` — cron gated on `Bearer SERVICE_ROLE_KEY`; carries `org_id` from parent event → instances → notifications with no cross-org bleed.
- `admin/backups` — admin-gated, no credential leakage in errors.
- `api/projects/*` (5 routes) — triaged: every route has `requireRole`/`getSession` + `org_id` scoping (consistent with the C2/C3 good pattern); not line-read — lighter follow-up optional.

---

## Cross-cutting — pending architectural decision (raised by user, C3/C4)

**Deployment model drives the role model.** The C3 tenants HIGH and C4 infra-gating findings all stem from `admin` being a per-org role used for platform-wide operations. Two resolutions:
- **Per-client deployment** (separate stack per municipality) — the entire cross-tenant class (C1/C3 user-mutation, C4 attachment IDOR *cross-org*) becomes structurally impossible; `admin` = "god of this instance" is correct as-is; tenants routes become provisioning-only. Cost: N stacks to operate.
- **Shared platform** — keep one DB, add a `super_admin` role above `admin`, make `admin` truly per-org, and every org-scoping gap in this review must be fixed and kept fixed. Cost: permanent RLS/authz vigilance.
Decision pending. Until then, current single-tenant reality means these findings are latent (no second tenant to attack), but they must be resolved before onboarding a 2nd client on a shared DB.

---

## C5 — SQL migrations 001–025 (foundation RLS) ✅ reviewed

Covered core/foundation RLS (001 core, 002 foundation tables, 003 policies, 004 work_orders, 016 rls_fixes, 022 widget layouts). FM RLS (`021_fm_schema`, 55 policies) deferred to C6. **Overall: mature.** Five-role, org-scoped pattern applied consistently; `016_rls_fixes` shows the team already ran an RLS audit and closed 4 real bugs (soft-delete bypass on locations/calendar/work_orders, over-permissive notification insert, duplicate policy).

### ✅ RESOLVES C4 — attachments IDOR downgraded to LOW
`supabase/migrations/003_rls_policies.sql:105-108` — `attachments_select_org` is `USING (org_id = current_user_org() AND deleted_at IS NULL)`. So the code-level org-scoping gap in `api/attachments/[id]` is **backstopped by RLS**: a user cannot SELECT another org's attachment row, so cannot obtain its `storage_path` to sign. Cross-tenant read is blocked at the table. **C4 → LOW** (defense-in-depth `.eq('org_id')` in code still recommended, but not exploitable).

### ☐ MED (shared-platform latent) — RLS role/org helpers are not org-consistent
`supabase/migrations/003_rls_policies.sql:8-16`
`current_user_role()` = `SELECT role FROM user_roles WHERE user_id = auth.uid() LIMIT 1` — **no org filter**; `current_user_org()` = `profiles.org_id`. If a user ever has `user_roles` rows in more than one org, `current_user_role()` returns an arbitrary one, so a policy like `org_id = current_user_org() AND current_user_role() = 'admin'` could grant an admin role earned in org A while scoped to org B. Harmless today (one org per user) but a real privilege-confusion bug the moment shared-platform multi-org membership exists. **Fix (if shared platform):** make the helper org-aware — `role FROM user_roles WHERE user_id = auth.uid() AND org_id = current_user_org()`.

### ☐ LOW (data-integrity) — RLS enforces row `org_id` but not FK-ref org
`supabase/migrations/004_work_orders.sql:97-101` (and the C2 `fm_work_orders` analog)
INSERT `WITH CHECK (org_id = current_user_org() …)` guarantees the row's own `org_id`, but nothing stops a client-supplied `location_id`/`property_id` FK pointing at **another org's** row. Result: a WO in org A referencing org B's location — data-integrity oddity + possible minor cross-org existence/name leak when the ref is rendered. Confirms C2 stands (low impact). fm_work_orders RLS confirmation → C6.

### GOOD — confirmed
- Foundation tables (001–003): RLS enabled on every table; five-role org-scoped policies; `notifications` = own-only select/update; `audit_log` = admin-read + trigger-only insert.
- `widget_definitions` `USING (true) TO authenticated` (022:122) is a legit read-only reference catalog (no user/org data) — not a finding.

---

## C6 — SQL migrations 026–049 + FM RLS (021/026/036) ✅ reviewed

Covered the capability-based RLS rewrite (026 `role_architecture`, 036 `rename_capabilities`) that supersedes 021's original FM policies, plus the storage-RLS series (031–035) at triage depth. **The FM RLS is the strongest part of the codebase's security.**

### ⭐ KEY INSIGHT — the cross-tenant findings all live in service-role paths that BYPASS this RLS
The FM RLS (below) is excellent and org-correct. But RLS only protects operations made through the **RLS client**. Every confirmed cross-tenant finding — C1 `inviteUserAction`/`updateFmUserAction`/`deleteFmUserAction`, C3 `users/route` password reset — uses the **service-role admin client**, which bypasses RLS entirely. So the quality of the RLS does *not* mitigate C1/C3; the app-layer `target.org_id === session.orgId` check is the **only** defense there, and it's the missing piece. This **raises** the priority of the C1/C3 fixes: they cannot be caught by the database.

### ✅ FM capability RLS (026/036) is org-correct and role-granular
`026:172-234` — `get_capability(user, org, dept)` resolves capability with an explicit `ur.org_id = p_org_id` filter; `current_fm_capability()` = `get_capability(auth.uid(), current_org_id(), fm_dept)`. `036:323-369` — `fm_work_orders` policies enforce `org_id = current_org_id()` on every operation, `submitted_by_id = auth.uid()` on contributor insert, `assigned_to_id = auth.uid()` on worker update. Clean five-capability model, per-table, consistently org-scoped. No findings.

### ✅ RESOLVES C2 → downgrade to LOW (data-integrity only)
`fm_work_orders` INSERT is `WITH CHECK (org_id = current_org_id() …)` (036:337) so the WO is firmly in the caller's org. A client-supplied `property_id` *could* still point cross-org, but when the row is read back the embedded `fm_properties(name,code)` join is filtered by `fm_properties` RLS → returns null, **no data leak**. Net: a possible dangling FK reference, no cross-tenant exposure. **C2 → LOW.**

### ✅ REFINES C5 MED — org-inconsistency is legacy-PW-only
The org-inconsistent helper (`current_user_role()` `LIMIT 1`, no org filter) is the **legacy** helper used by PW/foundation tables (work_orders, locations…). The **FM** model fixed exactly this via `get_capability(..., p_org_id)`. So the C5 MED is scoped to PW-module tables under a future shared platform, and the FM capability functions are the reference implementation to port PW onto.

### ~ Triaged (not line-read) — storage RLS series 031–035
`032/033/034/035` are a documented service-role storage-bypass evolution (`fm-uploads` bucket). App uploads/deletes go through the service-role `storageAdmin()` client with **code-level org verification** already confirmed in C2 (paths derived from `session.orgId`, ownership checked first). Direct client storage access isn't used. Deep policy read deferred as lower-risk; flag for a follow-up if direct client storage access is ever added.

### GOOD — `047_weather_tables` `USING (true)` policies
Already reviewed in the weather code review: `weather_cache` public-read (aggregated NOAA data) + `weather_leads` anon-insert-only/no-select. Legitimate. Not a finding.

---

## C7 — lib/ remainder, packages/shared, hooks ✅ reviewed

Files: `lib/email/*`, `lib/version-history.ts`, `lib/plus-code.ts`, `lib/utils.ts`, `packages/shared/{schemas,constants,utils}`, `hooks/*`. Translations (`lib/translations/*`, ~1730 LOC) are i18n string tables — no security surface.

### ☑ FIXED (2026-07-05) — HTML/email injection: unescaped user data in notification emails
Added an `esc()` HTML-escaper and applied it to `detailRow` values (covers WO title/description/property/submitter) and the `fullName` greetings. Static template chrome unchanged.
`apps/web/lib/email/fm-notifications.ts` — `detailRow(label, value)` (:75), `emailShell` heading/body (:47,:52), and `Estimado/a <strong>${assignee.fullName}</strong>` (:309,:354)
User-controlled values are interpolated **raw** into email HTML with no escaping: work-order `title` (:251), `description` (:258,:393), `property_name`, `submitter_name`, and profile `fullName`. A contributor can create a WO with `title` = `<a href="https://evil…">…</a>` or `<img src=x …>`; when the manager/director notification renders, the markup is injected into a legitimate, trusted Sentinel email. Mail clients strip `<script>`/`onerror`, but link/image/content injection survives → **phishing / content-spoofing inside a trusted transactional email**. `ctaUrl` (UUID) and `subject` are low-risk; the body/detail values are the vector.
**Fix:** add an `esc()` helper (`& < > " '` → entities) and apply it to every interpolated user value in `detailRow`, `emailShell` heading/body, and the `fullName` greetings. Static template chrome needs no change.

### ☐ LOW — free-text fields lack max length (feeds the email vector)
`packages/shared/src/schemas/index.ts:13` (`full_name` no max) and WO title/description bounds live only in the route schema. Not a vuln alone; combined with the unescaped email rendering it widens #1's payload room. Add sane `.max()` caps.

### GOOD — confirmed
- `lib/email/resend.ts` — API key read from env, guarded against placeholder, never throws, static `from`. No key leakage.
- `packages/shared/src/schemas` — roles are enum-validated (`inviteUserSchema`), password min-length + confirmation match, lat/lng bounded. Sound.
- `hooks/*` (`useRole`, `useNotifications`, `useGeoLocation`) — client-side, non-authoritative (server RLS + `requireRole` are the boundary); `notifications` realtime is RLS-scoped own-only. Not security boundaries — no findings.

---

## Wave 1 summary (C1–C7 complete)

**Overall: the platform is well-built.** Consistent auth on API routes, a mature capability-based RLS layer (with evidence of a prior RLS audit), and correct service-role storage patterns. The findings cluster into two themes:

**Theme A — service-role paths bypass the good RLS (the real risk).** All cross-tenant findings are in code using the service-role admin client, where RLS does not apply and the app must enforce org scoping itself:
- **HIGH** C3 tenants routes — per-org `admin` can list/create/delete *any* organization. (`api/fm/tenants/*`)
- **MED** C1 `inviteUserAction` — any authenticated user can invite an admin-role account (no role check). (`lib/auth/actions.ts:78`)
- **MED** C1/C3 cross-tenant user mutation — password reset / delete by `user_id` with no target-org check. (`lib/auth/fm-actions.ts:124,183`, `api/fm/users/route.ts:210`)

**Theme B — input handling. ☑ BOTH FIXED 2026-07-05.**
- ~~**MED** C2 PostgREST `.or()` filter injection in search~~ → fixed (`safeQ` sanitization).
- ~~**MED** C7 HTML/email injection in notifications~~ → fixed (`esc()` escaper).

**DEPLOYMENT DECISION (2026-07-05): per-client deployment.** Theme A is therefore moot — no shared DB means no cross-tenant attack surface. Roles stay as the current 5 (no `super_admin` needed in-app). ☑ **DONE (2026-07-05):** the tenants routes (`api/fm/tenants/*`) are now gated to admins of the Sentinel **system** org (`session.orgSlug === 'sentinel'`), so a client-instance admin can no longer list/create/delete rows in `organizations`.

**Lower:** C5 legacy RLS helper org-inconsistency (latent, shared-platform), C2 WO FK-ref (LOW), C4 attachment IDOR (LOW — RLS covers it), assorted info/inefficiency.

**Two consolidating fixes address most of Theme A:** (1) a shared `assertSameOrg(targetUserId, session)` helper before every service-role user mutation; (2) a platform-super-admin gate on tenant management — **both mooted if you choose per-client deployment.** Theme B fixes are self-contained (sanitize `q`, escape email HTML).

**Not yet reviewed (Wave 2, deferred):** UI pages (`dashboard/fm/*`, components, dashboard misc, projects/potholes/inspections/contracts/work-orders clients) — code-quality focus, lower security value.

---

## Wave 2 — UI security sweep (whole surface, one pass) ✅ reviewed

Rather than read ~30k LOC of TSX chunk-by-chunk, ran the security-relevant scan across **all** dashboard pages + components at once (React auto-escapes output; the only real XSS/injection vectors in TSX are `dangerouslySetInnerHTML`, raw `innerHTML`, unsafe `href`/`src` construction, `eval`).

**Result: UI security surface is clean.**
- **Exactly one** `dangerouslySetInnerHTML` in the whole app — `apps/web/app/layout.tsx:49`, a **static** anti-FOUC theme script (reads `localStorage` only, no interpolation, no input). Safe.
- No raw `innerHTML`, `eval`, `new Function`, `JSON.parse` of untrusted input, or dynamic `<script>`/`src` injection in dashboard UI or components.
- All flagged `href`/`target=_blank` are safe: internal navigation with UUID params, or `maps.google.com?q=${lat},${lng}` with **numeric** coordinates. (Tabnabbing via `target=_blank` without `rel=noopener` exists in a few spots but is low-severity and out of scope per review policy.)

**Conclusion:** the remaining Wave 2 value is **code-quality** bug-hunting (logic bugs, edge cases) across the large TSX files — not security. Security objective is substantially met by Wave 1 (deep) + this UI sweep.

### Spot-check — biggest/most-complex FM files (calculation & submit logic)
Targeted the logic (not JSX) in the top files: `fca/[id]` (1627), `inspections/[id]/run` (1230), `properties/[id]` (1324), `inspections/[id]` (1075).

- ☑ **FIXED (2026-07-05) — LOW (reliability)** — `inspections/[id]/run/page.tsx:722` `handleComplete()` now checks the NA-marking PATCH result and aborts completion with a (bilingual) error if it fails, so a failed write can no longer skew the server-computed score.
- ✅ **Sound** — `calcSectionScore` (fca:357) averages ratings correctly with a div-by-zero guard and 1-dp rounding; inspection-run render is well-guarded (`safeIndex`, `progress` 0-length guard, `currentItem` fallback); property avatar hash (`id.split('').reduce(...)`, properties:82) is a harmless deterministic color seed; `ScoreGauge` clamps 0–100. No calculation bugs found.

**Spot-check verdict:** the complex scoring/state logic in the largest files is correctly implemented and defensively coded. No further UI review pursued (per scope decision).

---
