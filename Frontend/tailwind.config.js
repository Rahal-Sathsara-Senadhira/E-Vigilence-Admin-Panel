/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      // Theme tokens — values live in src/index.css (light on :root, dark on .dark).
      colors: {
        brand: {
          blue: '#2a73c5',
          orange: '#f2833a',
        },
        canvas: 'rgb(var(--canvas) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        raised: 'rgb(var(--raised) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        primary: 'rgb(var(--primary) / <alpha-value>)',
        attention: {
          DEFAULT: 'rgb(var(--attention) / <alpha-value>)',
          ink: 'rgb(var(--attention-ink) / <alpha-value>)',
        },
        st: {
          open: 'rgb(var(--st-open) / <alpha-value>)',
          pending: 'rgb(var(--st-pending) / <alpha-value>)',
          review: 'rgb(var(--st-in-review) / <alpha-value>)',
          verified: 'rgb(var(--st-verified) / <alpha-value>)',
          resolved: 'rgb(var(--st-resolved) / <alpha-value>)',
          rejected: 'rgb(var(--st-rejected) / <alpha-value>)',
        },
      }
    },
  },
  plugins: [],
}