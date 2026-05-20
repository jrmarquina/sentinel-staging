import withPWA from 'next-pwa'
import { readFileSync } from 'fs'

const { version: APP_VERSION } = JSON.parse(readFileSync('./package.json', 'utf-8'))

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
  env: {
    NEXT_PUBLIC_APP_VERSION: APP_VERSION,
  },
  staticPageGenerationTimeout: 180,
  experimental: {
    serverActions: {
      allowedOrigins: [
        'localhost:3000',
        'localhost:3002',
        'pw.sentinelmgpr.com',
        'staging.sentinelmgpr.com',
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
