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
        background: "var(--background)",
        foreground: "var(--foreground)",
        // Civil Architect design tokens — used only by dev-theme components
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
    },
  },
  plugins: [],
};
export default config;
