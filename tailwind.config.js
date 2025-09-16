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
    // Main theme
    'bg-background',
    'bg-primary',
    'bg-secondary',
    'text-text-primary',
    'text-text-secondary',
    'border-secondary',

    // Status Colors (using theme colors)
    'bg-status-success-light',
    'border-status-success',
    'text-status-success',
    'bg-status-error-light',
    'border-status-error',
    'text-status-error',
    'bg-status-warning-light',
    'border-status-warning',
    'text-status-warning',

    // Hover states
    'hover:text-text-primary',
    'hover:bg-secondary',
  ],
}
