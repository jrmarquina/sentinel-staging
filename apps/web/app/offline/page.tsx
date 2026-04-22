export const metadata = { title: 'Offline — Sentinel Public Works' }

export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-[#0D1B2E] flex items-center justify-center p-4">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 rounded-2xl bg-slate-700 flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M18.364 5.636a9 9 0 010 12.728m-3.536-3.536a4 4 0 010-5.656M6.343 6.343a9 9 0 000 12.728m3.536-3.536a4 4 0 000-5.656M12 12h.01" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-white mb-2">You&apos;re offline</h1>
        <p className="text-slate-400 text-sm mb-6">
          Check your connection and try again. Your work is saved locally.
        </p>
        <a
          href="/"
          className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Try again
        </a>
      </div>
    </div>
  )
}
