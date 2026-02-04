/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        arabic: ['IBM Plex Sans Arabic', 'system-ui', 'sans-serif'],
      },
      colors: {
        surface: {
          DEFAULT: '#0a0a0a',
          elevated: '#141414',
          card: '#171717',
          border: 'rgba(255,255,255,0.06)',
        },
        accent: {
          DEFAULT: '#6366f1',
          hover: '#4f46e5',
          muted: 'rgba(99,102,241,0.15)',
        },
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease-out',
      },
      boxShadow: {
        'card': '0 1px 0 0 rgba(255,255,255,0.04)',
        'btn': '0 1px 2px rgba(0,0,0,0.2)',
      },
    },
  },
  plugins: [],
}
