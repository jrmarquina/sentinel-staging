// Print / report routes — no dashboard chrome, just clean white pages.
// Inherits root layout (fonts, CSS variables) but not the dashboard sidebar or nav.
export default function PrintGroupLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
