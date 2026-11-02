/** Same monochrome tokens as the Edito editor, so chat-web feels like the same product. */
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: { 0: '#050506', 1: '#0B0B0D', 2: '#111114', 3: '#17171A', 4: '#1F1F23' },
        ink: { 0: '#F6F6F4', 1: '#C9C9CE', 2: '#9B9BA3', 3: '#8E8E97', 4: '#80808A', disabled: '#4C4C54' },
        line: { DEFAULT: 'rgb(255 255 255 / 0.07)', strong: 'rgb(255 255 255 / 0.14)' },
        danger: { DEFAULT: '#E0565C', soft: 'rgb(224 86 92 / 0.12)' },
        warning: { DEFAULT: '#D8A64B', soft: 'rgb(216 166 75 / 0.12)' },
        accent: { DEFAULT: '#A5AEFF', soft: 'rgb(165 174 255 / 0.12)', line: 'rgb(165 174 255 / 0.35)' },
        success: { DEFAULT: '#5CA97A', soft: 'rgb(92 169 122 / 0.12)' },
      },
      fontSize: {
        caption: ['11px', { lineHeight: '1.5' }],
        label: ['12px', { lineHeight: '1.5' }],
        body: ['13px', { lineHeight: '1.5' }],
        prose: ['14.5px', { lineHeight: '1.65', letterSpacing: '-0.006em' }],
        title: ['15px', { lineHeight: '1.4' }],
        heading: ['18px', { lineHeight: '1.3' }],
        display: ['28px', { lineHeight: '1.2' }],
        hero: ['44px', { lineHeight: '1.08', letterSpacing: '-0.015em' }],
      },
      fontFamily: {
        serif: ['Instrument Serif', 'Noto Sans Devanagari', 'Georgia', 'serif'],
        mono: ['JetBrains Mono Variable', 'JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Consolas', 'monospace'],
        sans: ['Inter Variable', 'Inter', 'Noto Sans Devanagari', 'SF Pro Display', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        ring: 'inset 0 0 0 1px rgb(255 255 255 / 0.12)',
        lift: '0 1px 0 rgb(255 255 255 / 0.04) inset, 0 12px 32px -12px rgb(0 0 0 / 0.7)',
        composer: '0 1px 0 rgb(255 255 255 / 0.05) inset, 0 20px 50px -20px rgb(0 0 0 / 0.9)',
      },
      keyframes: {
        rise: { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'none' } },
        pulseRing: { '0%': { boxShadow: '0 0 0 0 rgb(165 174 255 / 0.45)' }, '100%': { boxShadow: '0 0 0 8px rgb(165 174 255 / 0)' } },
        sheen: { from: { transform: 'translateX(-100%)' }, to: { transform: 'translateX(250%)' } },
        fadeHint: { '0%': { opacity: '0', transform: 'translateY(3px)' }, '100%': { opacity: '1', transform: 'none' } },
      },
      animation: {
        rise: 'rise 0.35s cubic-bezier(0.2,0.7,0.2,1) both',
        'pulse-ring': 'pulseRing 1.8s ease-out infinite',
        sheen: 'sheen 1.8s ease-in-out infinite',
        'fade-hint': 'fadeHint 0.4s ease both',
      },
    },
  },
}
