/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './App.tsx',
    './components/**/*.{ts,tsx}',
    './services/**/*.{ts,tsx}',
    './translations.ts',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
