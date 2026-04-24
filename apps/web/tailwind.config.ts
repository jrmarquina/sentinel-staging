import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: 'class',
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── Tailwind body aliases (used by Next.js defaults) ──────────────────
        background: "var(--background)",
        foreground: "var(--foreground)",

        // ── Classic / shared token palette ────────────────────────────────────
        // These map to var(--*) which are defined in globals.css for both
        // Classic and CA modes, so any component using these tokens adapts
        // automatically when the theme changes.
        card:       "var(--card)",
        "card-b":   "var(--card-b)",
        border:     "var(--border)",
        muted:      "var(--muted)",
        faint:      "var(--faint)",
        primary:    "var(--primary)",
        "primary-c":"var(--primary-c)",
        teal:       "var(--teal)",
        "teal-c":   "var(--teal-c)",
        red:        "var(--red)",
        "red-c":    "var(--red-c)",
        amber:      "var(--amber)",
        "amber-c":  "var(--amber-c)",
        orange:     "var(--orange)",
        "orange-c": "var(--orange-c)",
        violet:     "var(--violet)",
        "violet-c": "var(--violet-c)",

        // ── Civil Architect design tokens ─────────────────────────────────────
        // Only used by design-dev (CA) components.
        ca: {
          base:          "var(--ca-base)",
          section:       "var(--ca-section)",
          card:          "var(--ca-card)",
          "card-high":   "var(--ca-card-high)",
          "card-highest":"var(--ca-card-highest)",
          ink:           "var(--ca-ink)",
          "ink-muted":   "var(--ca-ink-muted)",
          "ink-faint":   "var(--ca-ink-faint)",
          primary:       "var(--ca-primary)",
          "primary-dim": "var(--ca-primary-dim)",
          "primary-c":   "var(--ca-primary-c)",
          "on-primary":  "var(--ca-on-primary)",
          teal:          "var(--ca-teal)",
          "teal-c":      "var(--ca-teal-c)",
          red:           "var(--ca-red)",
          "red-c":       "var(--ca-red-c)",
          amber:         "var(--ca-amber)",
          "amber-c":     "var(--ca-amber-c)",
          border:        "var(--ca-border)",
        },
      },

      boxShadow: {
        card:    "var(--shadow)",
        "card-lg": "var(--shadow-lg)",
      },
    },
  },
  plugins: [],
};
export default config;
