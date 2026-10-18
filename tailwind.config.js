/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        nvidia: {
          bg: '#0D1112',
          surface: '#171E1F',
          surfaceElevated: '#1F282A',
          lime: '#B7F45B',
          limeHover: '#A4E045',
          limeMuted: 'rgba(183, 244, 91, 0.12)',
          text: '#F5F7F2',
          muted: '#8E9B9A',
          border: '#242E30',
          borderSubtle: '#1B2325',
          danger: '#FF5C5C',
          warning: '#F5A623',
          info: '#56CCF2',
        },
      },
      fontFamily: {
        sans: ['"Times New Roman"', 'Times', 'serif'],
        serif: ['"Times New Roman"', 'Times', 'serif'],
        mono: ['"Times New Roman"', 'Times', 'serif'],
      },
    },
  },
  plugins: [],
};
