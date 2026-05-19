import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/get-session'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export interface BackupFile {
  name:    string
  env:     'prod' | 'staging'
  date:    string   // ISO timestamp parsed from filename
  size:    number   // bytes
  type:    'daily' | 'monthly'
}

interface B2AuthResponse {
  apiUrl:             string
  authorizationToken: string
  allowed: {
    bucketId:   string
    bucketName: string
  }
}

interface B2FileEntry {
  fileName:    string
  contentLength: number
  uploadTimestamp: number
}

interface B2ListResponse {
  files: B2FileEntry[]
}

async function b2Authorize(): Promise<B2AuthResponse> {
  const id  = process.env.B2_ACCOUNT_ID!
  const key = process.env.B2_APPLICATION_KEY!
  const creds = Buffer.from(`${id}:${key}`).toString('base64')

  const res = await fetch('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
    headers: { Authorization: `Basic ${creds}` },
    next: { revalidate: 0 },
  })
  if (!res.ok) throw new Error(`B2 auth failed: ${res.status}`)
  return res.json()
}

async function b2ListPrefix(
  apiUrl: string,
  token: string,
  bucketId: string,
  prefix: string,
): Promise<B2FileEntry[]> {
  const res = await fetch(`${apiUrl}/b2api/v2/b2_list_file_names`, {
    method: 'POST',
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ bucketId, prefix, maxFileCount: 100 }),
    next: { revalidate: 0 },
  })
  if (!res.ok) throw new Error(`B2 list failed for ${prefix}: ${res.status}`)
  const data: B2ListResponse = await res.json()
  return data.files
}

function parseBackupDate(filename: string): string {
  // filename format: prod_20260519_095324.sql.gz.gpg
  const m = filename.match(/_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/)
  if (!m) return new Date().toISOString()
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+00:00`
}

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const bucket = process.env.B2_BUCKET_NAME ?? 'SIMS-backups'
    const auth   = await b2Authorize()
    const { apiUrl, authorizationToken: token, allowed: { bucketId } } = auth

    const prefixes: Array<{ prefix: string; env: 'prod' | 'staging'; type: 'daily' | 'monthly' }> = [
      { prefix: 'db/prod/daily/',     env: 'prod',    type: 'daily'   },
      { prefix: 'db/staging/daily/',  env: 'staging', type: 'daily'   },
      { prefix: 'db/prod/monthly/',   env: 'prod',    type: 'monthly' },
      { prefix: 'db/staging/monthly/',env: 'staging', type: 'monthly' },
    ]

    // Fetch all prefixes in parallel
    const results = await Promise.allSettled(
      prefixes.map(({ prefix }) => b2ListPrefix(apiUrl, token, bucketId, prefix))
    )

    const files: BackupFile[] = []
    for (let i = 0; i < prefixes.length; i++) {
      const { env, type } = prefixes[i]
      const result = results[i]
      if (result.status === 'rejected') continue
      for (const f of result.value) {
        const basename = f.fileName.split('/').pop() ?? f.fileName
        files.push({
          name: basename,
          env,
          type,
          date: parseBackupDate(basename),
          size: f.contentLength,
        })
      }
    }

    // Sort reverse-chronological
    files.sort((a, b) => b.date.localeCompare(a.date))

    return NextResponse.json({ files, bucket })
  } catch (err) {
    console.error('Backups API error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch backups' },
      { status: 500 }
    )
  }
}
