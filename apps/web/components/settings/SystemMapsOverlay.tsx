'use client'

import { useEffect, useRef, useState } from 'react'
import { X, Maximize2 } from 'lucide-react'

/**
 * Full-screen viewer for the standalone System Maps artifact
 * (apps/web/public/system-maps/index.html — Services / Data Flow /
 * Dependencies / Nodes graph). Served as a static asset and embedded in an
 * iframe so its D3 + vis-network animations run untouched.
 *
 * Theme-follow: the current app theme (dark/light) is passed as a URL param on
 * first load and re-sent via postMessage whenever the user toggles the app
 * theme while the viewer is open.
 */
function currentTheme(): 'dark' | 'light' {
  if (typeof document === 'undefined') return 'dark'
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

export function SystemMapsOverlay({ onClose }: { onClose: () => void }) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [theme] = useState<'dark' | 'light'>(currentTheme)

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Live theme sync — watch the <html> `dark` class and post changes to the iframe
  useEffect(() => {
    const post = () => {
      iframeRef.current?.contentWindow?.postMessage(
        { type: 'sims-theme', theme: currentTheme() },
        '*'
      )
    }
    const observer = new MutationObserver(post)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  return (
    <div className="fixed inset-0 z-[200] bg-slate-950">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 h-12 flex items-center justify-between px-4 bg-slate-900/80 backdrop-blur border-b border-white/10 z-10">
        <div className="flex items-center gap-2">
          <Maximize2 size={14} className="text-slate-400" />
          <span className="text-sm font-bold text-white">System Maps</span>
          <span className="text-xs text-slate-500 hidden sm:inline">Services · Data Flow · Dependencies · Nodes</span>
        </div>
        <button
          onClick={onClose}
          title="Close (Esc)"
          className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {/* Maps artifact */}
      <iframe
        ref={iframeRef}
        src={`/system-maps/index.html?theme=${theme}`}
        title="SIMS System Maps"
        className="absolute inset-0 top-12 w-full h-[calc(100%-3rem)] border-0"
      />
    </div>
  )
}
