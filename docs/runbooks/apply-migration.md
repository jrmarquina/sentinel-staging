# Runbook — Applying a Supabase Migration

> Authoritative, hand-written runbook. Claude follows this verbatim
> whenever a migration needs to land on staging or production. Do not
> use Supabase Studio. Do not run raw SQL ad-hoc — only files committed
> to `supabase/migrations/`.

---

## Hosts and ports

| Env | Host | Postgres container | Port (host) | Compose project |
|-----|------|--------------------|-------------|-----------------|
| **staging** | `root@217.216.92.232` | `supabase-staging-db-1` | `5434` | `supabase-staging` |
| **production** | `root@217.216.92.232` | `supabase-db` | `5432` | `supabase` |

SSH config alias: `sentinel-vps` (key: `~/.ssh/id_sentinel_vps`).

The Postgres password lives in the env file on the VPS — do not embed
it in commands. `docker exec` against the container does not need it.

---

## Standard procedure (staging)

Replace `<NNN>_<name>.sql` with the migration filename.

```bash
# 1. Sanity: file exists locally and is the next sequential number
ls -1 supabase/migrations/ | tail -5

# 2. Upload to a tmp path on the VPS
scp -i ~/.ssh/id_sentinel_vps \
    supabase/migrations/<NNN>_<name>.sql \
    root@217.216.92.232:/tmp/<NNN>_<name>.sql

# 3. Apply, with ON_ERROR_STOP so partial failures abort the whole script
ssh -i ~/.ssh/id_sentinel_vps root@217.216.92.232 \
  "docker exec -i supabase-staging-db-1 \
    psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
    < /tmp/<NNN>_<name>.sql"

# 4. Verify with a targeted SELECT (varies per migration — examples below)
```

### Verification examples

After a schema migration:

```bash
ssh -i ~/.ssh/id_sentinel_vps root@217.216.92.232 \
  "docker exec -i supabase-staging-db-1 psql -U postgres -d postgres \
   -c \"SELECT tablename FROM pg_tables WHERE tablename = 'fm_my_new_table';\""
```

After an RLS / storage-policy migration:

```bash
ssh -i ~/.ssh/id_sentinel_vps root@217.216.92.232 \
  "docker exec -i supabase-staging-db-1 psql -U postgres -d postgres \
   -c \"SELECT policyname, cmd FROM pg_policies
        WHERE schemaname='storage' AND policyname LIKE '<prefix>%';\""
```

After a storage-bucket migration:

```bash
ssh -i ~/.ssh/id_sentinel_vps root@217.216.92.232 \
  "docker exec -i supabase-staging-db-1 psql -U postgres -d postgres \
   -c \"SELECT id, public, file_size_limit FROM storage.buckets WHERE id = '<bucket>';\""
```

---

## Production procedure

Same shape, but use the prod container/project:

```bash
scp -i ~/.ssh/id_sentinel_vps \
    supabase/migrations/<NNN>_<name>.sql \
    root@217.216.92.232:/tmp/<NNN>_<name>.sql

ssh -i ~/.ssh/id_sentinel_vps root@217.216.92.232 \
  "docker exec -i supabase-db \
    psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
    < /tmp/<NNN>_<name>.sql"
```

**Production rules:**
1. Always apply to staging first and verify before touching production.
2. Always run a backup immediately before: `bash /opt/sentinel/scripts/backup.sh`.
3. Never apply destructive migrations (DROP TABLE, DROP COLUMN without `IF EXISTS`, etc.) without explicit user confirmation in the chat.

---

## Common pitfalls

- **Heredoc vs `<` redirection.** `psql -f` reads a path inside the container — the file isn't there. Always pipe stdin from the host (`< /tmp/file.sql`) which `docker exec -i` forwards.
- **Forgetting `ON_ERROR_STOP=1`.** Without it, a failing statement only logs and the script reports success. Always pass it.
- **Idempotency.** Migrations should re-run safely: use `CREATE ... IF NOT EXISTS`, `DROP POLICY IF EXISTS` before re-creating, `INSERT ... ON CONFLICT DO NOTHING`. The migration runner has no state — same file may be re-applied during recovery.
- **Self-hosted storage RLS.** The service-role key does NOT bypass RLS on `storage.objects` reliably in this setup. For storage operations, write SQL policies that allow `authenticated` writes scoped by org folder, then call the storage REST API with the user's session JWT.
- **Cleanup.** Tmp files on the VPS persist. Periodically: `ssh sentinel-vps 'rm -f /tmp/[0-9][0-9][0-9]_*.sql'`.

---

## When something goes wrong

If a migration partially applied:

```bash
# Inspect what landed
ssh -i ~/.ssh/id_sentinel_vps root@217.216.92.232 \
  "docker exec -i supabase-staging-db-1 psql -U postgres -d postgres \
   -c \"\\dt\" -c \"\\dp <table>\""

# Manually roll back the half-applied state with a corrective .sql,
# committed as the NEXT migration number (do NOT edit the failed one
# in place — that breaks reproducibility).
```

Never edit a migration after it has run anywhere. Add a fix-forward
migration with the next sequential number.
