/** @type {import('tailwindcss').Config} */
const colors = require('./color/theme.js');

module.exports = {
  content: [
    "./content_script.js",
    "./components/*.js",
    "./panel/*.html",
    "./panel/*.jsx"
  ],
  theme: {
    extend: {
      colors: {
        ...colors
      }
    },
  },
  plugins: [],
  safelist: [
    'bg-light-beige',
    'text-charcoal-gray',
    'bg-taupe-gray',
    'text-taupe-gray',
    'bg-status-success-light',
    'border-status-success',
    'text-status-success',
    'bg-status-error-light',
    'border-status-error',
    'text-status-error',
    'bg-status-warning-light',
    'border-status-warning',
    'text-status-warning',
    'bg-accent-light',
    'border-accent',
    'text-accent',
    'from-accent-light',
    'to-light-beige',
    'hover:text-charcoal-gray',
    'hover:bg-taupe-gray',
  ],
}
