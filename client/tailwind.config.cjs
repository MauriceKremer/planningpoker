/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'Oxygen',
          'Ubuntu', 'Cantarell', '"Fira Sans"', '"Droid Sans"', '"Helvetica Neue"',
          'Arial', 'sans-serif',
        ],
      },
      colors: {
        // Semantic color keys. Values are CSS variables so seasons can redefine
        // the palette at runtime by setting [data-theme] overrides.
        // Each variable holds an RGB triplet; Tailwind replaces <alpha-value>
        // when opacity modifiers like bg-cream-25/95 are used.
        mocha: {
          50: 'rgb(var(--c-mocha-50) / <alpha-value>)',
          100: 'rgb(var(--c-mocha-100) / <alpha-value>)',
          200: 'rgb(var(--c-mocha-200) / <alpha-value>)',
          300: 'rgb(var(--c-mocha-300) / <alpha-value>)',
          400: 'rgb(var(--c-mocha-400) / <alpha-value>)',
          500: 'rgb(var(--c-mocha-500) / <alpha-value>)',
          600: 'rgb(var(--c-mocha-600) / <alpha-value>)',
          700: 'rgb(var(--c-mocha-700) / <alpha-value>)',
          800: 'rgb(var(--c-mocha-800) / <alpha-value>)',
          900: 'rgb(var(--c-mocha-900) / <alpha-value>)',
        },
        ember: {
          50: 'rgb(var(--c-ember-50) / <alpha-value>)',
          100: 'rgb(var(--c-ember-100) / <alpha-value>)',
          200: 'rgb(var(--c-ember-200) / <alpha-value>)',
          300: 'rgb(var(--c-ember-300) / <alpha-value>)',
          400: 'rgb(var(--c-ember-400) / <alpha-value>)',
          500: 'rgb(var(--c-ember-500) / <alpha-value>)',
          600: 'rgb(var(--c-ember-600) / <alpha-value>)',
          700: 'rgb(var(--c-ember-700) / <alpha-value>)',
          800: 'rgb(var(--c-ember-800) / <alpha-value>)',
        },
        caramel: {
          50: 'rgb(var(--c-caramel-50) / <alpha-value>)',
          100: 'rgb(var(--c-caramel-100) / <alpha-value>)',
          200: 'rgb(var(--c-caramel-200) / <alpha-value>)',
          300: 'rgb(var(--c-caramel-300) / <alpha-value>)',
          400: 'rgb(var(--c-caramel-400) / <alpha-value>)',
          500: 'rgb(var(--c-caramel-500) / <alpha-value>)',
          600: 'rgb(var(--c-caramel-600) / <alpha-value>)',
          700: 'rgb(var(--c-caramel-700) / <alpha-value>)',
          800: 'rgb(var(--c-caramel-800) / <alpha-value>)',
        },
        cream: {
          25: 'rgb(var(--c-cream-25) / <alpha-value>)',
          50: 'rgb(var(--c-cream-50) / <alpha-value>)',
          100: 'rgb(var(--c-cream-100) / <alpha-value>)',
          200: 'rgb(var(--c-cream-200) / <alpha-value>)',
          300: 'rgb(var(--c-cream-300) / <alpha-value>)',
          400: 'rgb(var(--c-cream-400) / <alpha-value>)',
          500: 'rgb(var(--c-cream-500) / <alpha-value>)',
        },
        clay: {
          50: 'rgb(var(--c-clay-50) / <alpha-value>)',
          100: 'rgb(var(--c-clay-100) / <alpha-value>)',
          200: 'rgb(var(--c-clay-200) / <alpha-value>)',
          300: 'rgb(var(--c-clay-300) / <alpha-value>)',
          400: 'rgb(var(--c-clay-400) / <alpha-value>)',
          500: 'rgb(var(--c-clay-500) / <alpha-value>)',
          600: 'rgb(var(--c-clay-600) / <alpha-value>)',
          700: 'rgb(var(--c-clay-700) / <alpha-value>)',
          800: 'rgb(var(--c-clay-800) / <alpha-value>)',
        },
        sage: {
          50: 'rgb(var(--c-sage-50) / <alpha-value>)',
          100: 'rgb(var(--c-sage-100) / <alpha-value>)',
          200: 'rgb(var(--c-sage-200) / <alpha-value>)',
          300: 'rgb(var(--c-sage-300) / <alpha-value>)',
          400: 'rgb(var(--c-sage-400) / <alpha-value>)',
          500: 'rgb(var(--c-sage-500) / <alpha-value>)',
          600: 'rgb(var(--c-sage-600) / <alpha-value>)',
          700: 'rgb(var(--c-sage-700) / <alpha-value>)',
        },
        honey: {
          50: 'rgb(var(--c-honey-50) / <alpha-value>)',
          100: 'rgb(var(--c-honey-100) / <alpha-value>)',
          200: 'rgb(var(--c-honey-200) / <alpha-value>)',
          300: 'rgb(var(--c-honey-300) / <alpha-value>)',
          400: 'rgb(var(--c-honey-400) / <alpha-value>)',
          500: 'rgb(var(--c-honey-500) / <alpha-value>)',
          600: 'rgb(var(--c-honey-600) / <alpha-value>)',
          700: 'rgb(var(--c-honey-700) / <alpha-value>)',
          800: 'rgb(var(--c-honey-800) / <alpha-value>)',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgb(var(--c-mocha-800) / 0.06), 0 4px 16px rgb(var(--c-mocha-800) / 0.08)',
        'card-lg': '0 2px 4px rgb(var(--c-mocha-800) / 0.08), 0 10px 32px rgb(var(--c-mocha-800) / 0.14)',
        button: '0 1px 2px rgb(var(--c-mocha-800) / 0.18), inset 0 1px 0 rgb(255 255 255 / 0.15)',
      },
    },
  },
  plugins: [],
}