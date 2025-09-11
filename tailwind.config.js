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
    'bg-background-main',
    'text-text-main',
    'text-text-title',
    'bg-container-and-border',
    'border-container-and-border',
    'text-container-and-border', // Used for muted text
    'from-accent-light', // For gradient
    'to-background-main', // For gradient

    // Status and Accent (already semantic)
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

    // Hover states
    'hover:text-text-main',
    'hover:bg-container-and-border',
  ],
}
