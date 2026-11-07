/** @type {import('tailwindcss').Config} */
const v = (name) => `hsl(var(--${name}) / <alpha-value>)`;
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        background: v('background'),
        foreground: v('foreground'),
        card: v('card'),
        border: v('border'),
        secondary: v('secondary'),
        muted: { foreground: v('muted-foreground') },
        primary: { DEFAULT: v('primary'), foreground: v('primary-foreground') },
        destructive: v('destructive'),
      },
    },
  },
  plugins: [],
};
