/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/admin/importer/**/*.{js,jsx,ts,tsx}',
  ],
  corePlugins: {
    preflight: false, // Don't reset existing global styles
  },
  theme: {
    extend: {},
  },
  plugins: [],
};
