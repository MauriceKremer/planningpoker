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
        // Deep warm neutrals — headers, headings, primary text
        mocha: {
          50: '#F6F1EC',
          100: '#EDE3D9',
          200: '#DCCFBE',
          300: '#B8A392',
          400: '#8C6F5C',
          500: '#6D4C41',
          600: '#5D3A29',
          700: '#4E342E',
          800: '#3E2723',
          900: '#2B1A16',
        },
        // Burnt orange — primary actions
        ember: {
          50: '#FBF1EB',
          100: '#F7E0D3',
          200: '#F0C6AF',
          300: '#E4A37F',
          400: '#DD8557',
          500: '#D96B43',
          600: '#C45A35',
          700: '#A34728',
          800: '#83361E',
        },
        // Caramel / tan — secondary controls
        caramel: {
          50: '#FBF5EC',
          100: '#F4E8D4',
          200: '#E8D3B0',
          300: '#D9BC88',
          400: '#C9A263',
          500: '#B98A4B',
          600: '#A5773C',
          700: '#866031',
          800: '#6A4C27',
        },
        // Cream surfaces & borders — cards, dividers, inputs
        cream: {
          25: '#FFFDFA',
          50: '#FDFBF7',
          100: '#F9F5EE',
          200: '#EFE7DA',
          300: '#E8DFD5',
          400: '#D8CCBA',
          500: '#BCA98F',
        },
        // Warm muted rose/clay — destructive actions
        clay: {
          50: '#FAF0ED',
          100: '#F4DED7',
          200: '#E8C4B8',
          300: '#D99C89',
          400: '#C9735E',
          500: '#B85C48',
          600: '#A64B39',
          700: '#8A3D2F',
          800: '#6F3025',
        },
        // Warm sage — success / online status
        sage: {
          50: '#F3F5EE',
          100: '#E5EADC',
          200: '#CFD8BC',
          300: '#AEBE97',
          400: '#8FA26F',
          500: '#758B55',
          600: '#627347',
          700: '#4F5C3A',
        },
        // Honey — moderator highlights / warnings
        honey: {
          50: '#FBF4E2',
          100: '#F6E8C6',
          200: '#EDD49C',
          300: '#E0BC6B',
          400: '#D4A644',
          500: '#C2912F',
          600: '#A2761F',
          700: '#7C5B18',
          800: '#5F4512',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgba(62, 39, 35, 0.06), 0 4px 16px rgba(62, 39, 35, 0.08)',
        'card-lg': '0 2px 4px rgba(62, 39, 35, 0.08), 0 10px 32px rgba(62, 39, 35, 0.14)',
        button: '0 1px 2px rgba(62, 39, 35, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.15)',
      },
    },
  },
  plugins: [],
}