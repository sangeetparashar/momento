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
          bg: '#000000',
          'bg-secondary': '#111111',
          'bg-tertiary': '#1A1A1A',
          primary: '#00FF88',
          'primary-muted': 'rgba(0, 255, 136, 0.15)',
          accent: '#00CC6A',
          glow: 'rgba(0, 255, 136, 0.3)',
          'text-primary': '#FFFFFF',
          'text-secondary': '#666666',
          'text-tertiary': '#444444',
          border: 'rgba(255, 255, 255, 0.06)',
          error: '#FF4444',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Space Grotesk', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'monospace'],
      },
      backdropBlur: {
        xs: '2px',
        '2xl': '40px',
        '3xl': '64px',
      },
      boxShadow: {
        'glow-sm': '0 0 8px rgba(0, 255, 136, 0.15), 0 0 20px rgba(0, 255, 136, 0.05)',
        'glow-md': '0 0 20px rgba(0, 255, 136, 0.2), 0 0 60px rgba(0, 255, 136, 0.08)',
        'glow-lg': '0 0 40px rgba(0, 255, 136, 0.25), 0 0 100px rgba(0, 255, 136, 0.1)',
      },
      animation: {
        'ticker-scroll': 'ticker 30s linear infinite',
        'float': 'float 4s ease-in-out infinite',
        'float-slow': 'float-slow 6s ease-in-out infinite',
        'float-delayed': 'float-delayed 8s ease-in-out infinite 2s',
        'pulse-glow': 'pulse-glow 4s ease-in-out infinite',
        'bounce-gentle': 'bounce-gentle 2s ease-in-out infinite',
        'shimmer': 'shimmer 2s ease-in-out infinite',
        'count-up': 'count-up 1s ease-out forwards',
        'slide-up': 'slide-up 0.6s ease-out forwards',
        'slide-in-left': 'slide-in-left 0.6s ease-out forwards',
        'slide-in-right': 'slide-in-right 0.6s ease-out forwards',
        'scale-in': 'scale-in 0.5s ease-out forwards',
        'gradient-shift': 'gradient-shift 8s ease infinite',
        'breathe-glow': 'breathe-glow 4s ease-in-out infinite',
        'flutter': 'flutter 6s ease-in-out infinite',
        'grain': 'grain 0.5s steps(1) infinite',
        'fade-in': 'fade-in 0.7s ease-out forwards',
        'fade-in-up': 'fade-in-up 0.6s ease-out forwards',
        'polaroid-float': 'polaroid-float 4s ease-in-out infinite',
        'pulse-dot': 'pulse-dot 1.5s ease-in-out infinite',
        'expand-line': 'expand-line 2s ease-out forwards',
        'stagger-in': 'fade-in-up 0.5s ease-out forwards',
      },
      keyframes: {
        ticker: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        'float-slow': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        'float-delayed': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-12px)' },
        },
        'pulse-glow': {
          '0%, 100%': { opacity: '1', transform: 'translate(-50%, -50%) scale(1)' },
          '50%': { opacity: '0.6', transform: 'translate(-50%, -50%) scale(1.05)' },
        },
        'bounce-gentle': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(6px)' },
        },
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        'count-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(30px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-left': {
          '0%': { opacity: '0', transform: 'translateX(-30px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'slide-in-right': {
          '0%': { opacity: '0', transform: 'translateX(30px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.9)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'gradient-shift': {
          '0%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        },
        'breathe-glow': {
          '0%, 100%': { opacity: '0.4', filter: 'blur(60px)' },
          '50%': { opacity: '0.8', filter: 'blur(80px)' },
        },
        flutter: {
          '0%': { transform: 'translate(0, 0) scale(1)' },
          '25%': { transform: 'translate(3px, -5px) scale(1.02)' },
          '50%': { transform: 'translate(-2px, 3px) scale(0.98)' },
          '75%': { transform: 'translate(4px, 1px) scale(1.01)' },
          '100%': { transform: 'translate(0, 0) scale(1)' },
        },
        grain: {
          '0%, 100%': { transform: 'translate(0, 0)' },
          '10%': { transform: 'translate(-1%, -1%)' },
          '30%': { transform: 'translate(1%, 0%)' },
          '50%': { transform: 'translate(-1%, 1%)' },
          '70%': { transform: 'translate(1%, -1%)' },
          '90%': { transform: 'translate(0%, 1%)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'polaroid-float': {
          '0%, 100%': { transform: 'rotate(-2deg) translateY(0)' },
          '50%': { transform: 'rotate(-1deg) translateY(-8px)' },
        },
        'pulse-dot': {
          '0%, 100%': { opacity: '0.3', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.2)' },
        },
        'expand-line': {
          '0%': { width: '0%', opacity: '0' },
          '50%': { opacity: '1' },
          '100%': { width: '60px', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
export default config;
