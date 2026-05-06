import { Resend } from 'resend'

let _client: Resend | null = null

function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY
  if (!key || key.startsWith('re_xxx')) return null
  if (!_client) _client = new Resend(key)
  return _client
}

const FROM = 'Sentinel FM <noreply@sentinelmgpr.com>'

/**
 * Send an email via Resend.
 *
 * Silently skips when RESEND_API_KEY is missing or still a placeholder.
 * Never throws — email failure must never break an API response.
 */
export async function sendEmail(opts: {
  to: string | string[]
  subject: string
  html: string
}): Promise<void> {
  const client = getClient()
  if (!client) {
    console.log('[email] Resend not configured — skipped:', opts.subject)
    return
  }

  const to = Array.isArray(opts.to) ? opts.to : [opts.to]
  if (to.length === 0) return

  try {
    await client.emails.send({ from: FROM, to, subject: opts.subject, html: opts.html })
  } catch (e) {
    console.error('[email] Send failed:', e)
  }
}
