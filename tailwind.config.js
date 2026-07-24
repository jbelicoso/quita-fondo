/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef6ff',
          100: '#d9ecff',
          400: '#4f9dff',
          500: '#2b7fff',
          600: '#1866f0',
          700: '#1553c4',
        },
      },
      boxShadow: {
        soft: '0 10px 40px -12px rgba(0,0,0,0.25)',
      },
    },
  },
  plugins: [],
};
