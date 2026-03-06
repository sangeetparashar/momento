import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        momento: {
          bg: '#0D0D0D',
          'bg-secondary': '#1A1A1A',
          'bg-tertiary': '#242424',
          primary: '#00FF88',
          'primary-muted': 'rgba(0, 255, 136, 0.15)',
          'text-primary': '#FFFFFF',
          'text-secondary': '#8A8A8A',
          'text-tertiary': '#555555',
          border: '#2A2A2A',
          error: '#FF4444',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'monospace'],
      },
      animation: {
        'ticker-scroll': 'ticker 30s linear infinite',
      },
      keyframes: {
        ticker: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      },
    },
  },
  plugins: [],
};
export default config;
