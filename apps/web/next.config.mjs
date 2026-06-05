import withPWA from 'next-pwa'

const pwa = withPWA({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
  fallbacks: {
    document: '/offline',
  },
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  // NEXT_PUBLIC_APP_VERSION is set in .env.local by deploy-staging.sh (auto-incremented).
  // Do NOT set it here — next.config.mjs would override .env.local with package.json version.
  async headers() {
    return [
      {
        // Prevent Cloudflare (and other CDNs) from caching server-rendered HTML pages.
        // Static assets (JS/CSS/images) are fine to cache via their hashed filenames.
        source: '/((?!_next/static|_next/image|favicon|icons|manifest).*)',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate' },
          { key: 'Pragma', value: 'no-cache' },
        ],
      },
    ]
  },
  staticPageGenerationTimeout: 180,
  experimental: {
    serverActions: {
      allowedOrigins: [
        'localhost:3000',
        'localhost:3002',
        'sims.sentinelmgpr.com',
        'staging.sentinelmgpr.com',
        'pw.sentinelmgpr.com', // legacy — keep until migration complete
      ],
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
    ],
  },
}

export default pwa(nextConfig)
