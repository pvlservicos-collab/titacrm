import type { Config } from 'tailwindcss'
import tailwindcssAnimate from 'tailwindcss-animate'

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // accent era '#3B82F6' e não tinha nenhum uso real no projeto (confirmado via
        // grep) — reaproveitada pra virar o azul da marca nova. NÃO declarar uma chave
        // `blue` aqui: 50+ arquivos usam a escala padrão do Tailwind (bg-blue-600 etc)
        // e sobrescrever `blue` quebraria todos eles silenciosamente (merge raso).
        accent: {
          DEFAULT: 'var(--blue)',
          2: 'var(--blue-2)',
          line: 'var(--blue-line)',
        },
        void: 'var(--void)',
        panel: {
          DEFAULT: 'var(--panel)',
          2: 'var(--panel-2)',
        },
        ink: 'var(--ink)',
        muted: 'var(--muted)',
        line: 'var(--line)',
      },
      fontFamily: {
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
        display: ['"Syne"', 'system-ui', 'sans-serif'],
        neuehaas: ['"Neue Haas Grotesk Display Pro"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 40px rgba(61,123,255,.35)',
      },
    },
  },
  plugins: [tailwindcssAnimate],
}
export default config
