/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'card': {
          DEFAULT: '#ffffff',
          'foreground': '#0a0a0a',
        },
        'bullish': '#10b981',
        'bearish': '#ef4444',
      }
    },
  },
  plugins: [],
}

