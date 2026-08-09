/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        // ── Primary: Sunset Orange ─────────────────────────
        brand: {
          50: '#d0f8f2ff',
          100: '#a3f2e7ff',
          200: '#7ef2d9ff',
          300: '#5aeec0ff',
          400: '#36e9adff',
          500: '#07a38eff', // Primary orange
          600: '#17cf9dff',
          700: '#01e9b2ff',
          800: '#017867ff',
          900: '#017867ff',
        },
        // ── Accent: Warm Amber Gold ────────────────────────
        accent: {
          50: '#fff',
          100: '#e5f9ffff',
          200: '#b8e0fdff',
          300: '#79b6f3ff',
          400: '#07a38eff', // Amber gold accent
          500: '#00e4d0ff',
          600: '#00dd97ff',
          700: '#01c1a5ff',
          800: '#009982ff',
          900: '#017867ff',
        },
        // ── Surfaces: Warm Charcoal/Stone ─────────────────
        surface: {
          0: 'var(--color-surface-0)',
          50: 'var(--color-surface-50)',
          100: 'var(--color-surface-100)',
          200: 'var(--color-surface-200)',
          300: 'var(--color-surface-300)',
          400: 'var(--color-surface-400)',
          500: 'var(--color-surface-500)',
          600: 'var(--color-surface-600)',
          700: 'var(--color-surface-700)',
        },
        // ── Semantic colours ───────────────────────────────
        success: {
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          50: '#052e16',
          100: '#14532d',
        },
        danger: {
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
          50: '#2d0707',
          100: '#450a0a',
        },
      },
      borderRadius: {
        DEFAULT: '0.5rem', // 8px = rounded-lg max
      },
      boxShadow: {
        'card': '0 1px 3px 0 rgba(0,0,0,0.4), 0 0 0 1px rgba(249,115,22,0.06)',
        'card-md': '0 4px 12px 0 rgba(0,0,0,0.5), 0 0 0 1px rgba(249,115,22,0.08)',
        'card-lg': '0 8px 32px 0 rgba(0,0,0,0.6), 0 0 0 1px rgba(249,115,22,0.10)',
        'brand': '0 4px 14px 0 rgba(249,115,22,0.35)',
        'accent': '0 4px 14px 0 rgba(251,191,36,0.28)',
        'glow': '0 0 20px rgba(249,115,22,0.20)',
      },
    },
  },
  plugins: [],
}
