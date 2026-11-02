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
        success: { DEFAULT: '#5CA97A', soft: 'rgb(92 169 122 / 0.12)' },
      },
      fontSize: {
        caption: ['11px', { lineHeight: '1.5' }],
        label: ['12px', { lineHeight: '1.5' }],
        body: ['13px', { lineHeight: '1.5' }],
        title: ['15px', { lineHeight: '1.4' }],
        heading: ['18px', { lineHeight: '1.3' }],
        display: ['28px', { lineHeight: '1.2' }],
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter Variable', 'Inter', 'Noto Sans Devanagari', 'SF Pro Display', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      boxShadow: { ring: 'inset 0 0 0 1px rgb(255 255 255 / 0.12)' },
    },
  },
}
