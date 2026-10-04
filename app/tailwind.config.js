/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}', './index.js'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // From the old app's brand tokens.
        brand: { DEFAULT: '#0f7a3d', mid: '#1b9750', deep: '#0a4d27', soft: '#e6f4ec', soft2: '#d6ecdf' },
        ink: { DEFAULT: '#0d1f16', soft: '#48584f', muted: '#8a988f' },
        line: { DEFAULT: '#e3eae5', soft: '#eef3f0' },
        field: '#f5f8f6',
        canvas: '#f4f7f5',
        danger: { DEFAULT: '#d24b4b', soft: '#fcecec' },
        warn: { DEFAULT: '#cf8a1a', soft: '#fbf1dd' },
        info: { DEFAULT: '#1769d6', soft: '#e7f0fc' },
      },
    },
  },
  plugins: [],
};
