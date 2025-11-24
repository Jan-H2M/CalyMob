/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class', // Activation du dark mode via classe
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        calypso: {
          blue: '#006994',
          'blue-light': '#0084B8',
          'blue-dark': '#004A6B',
          aqua: '#00A5CF',
          'aqua-light': '#33B9D9',
          'aqua-dark': '#0088A8',
        },
        // Palette Dark Mode
        dark: {
          bg: {
            primary: '#0f172a',    // Fond principal (slate-900)
            secondary: '#1e293b',  // Cards (slate-800)
            tertiary: '#334155',   // Hover states (slate-700)
          },
          text: {
            primary: '#f1f5f9',    // Texte principal (slate-100)
            secondary: '#cbd5e1',  // Texte secondaire (slate-300)
            muted: '#94a3b8',      // Texte désactivé (slate-400)
          },
          border: '#334155',        // Bordures (slate-700)
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      }
    },
  },
  plugins: [],
}