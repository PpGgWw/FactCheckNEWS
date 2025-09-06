/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./content_script.js",
    "./components/*.js",
    "./panel/*.html",
    "./panel/*.jsx"
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
