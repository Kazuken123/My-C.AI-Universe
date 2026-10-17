import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class', '[data-theme="vanguard"]'],
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        canvas: {
          DEFAULT: 'var(--bg-canvas)',
          mesh: 'var(--bg-canvas-mesh)',
        },
        core: {
          DEFAULT: 'var(--bg-core)',
          elevated: 'var(--bg-core-elevated)',
        },
        shell: 'var(--bg-shell)',
        rail: 'var(--bg-rail)',
        input: {
          DEFAULT: 'var(--bg-input)',
          focus: 'var(--bg-input-focus)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)',
          soft: 'var(--accent-soft)',
          border: 'var(--accent-border)',
        },
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
          faint: 'var(--text-faint)',
          'on-accent': 'var(--text-on-accent)',
        },
        border: {
          hairline: 'var(--border-hairline)',
          subtle: 'var(--border-subtle)',
          strong: 'var(--border-strong)',
        },
        bubble: {
          user: 'var(--user-bubble)',
          'user-border': 'var(--user-bubble-border)',
          ai: 'var(--ai-bubble)',
          'ai-border': 'var(--ai-bubble-border)',
        },
      },
      borderRadius: {
        shell: 'var(--radius-shell)',
        core: 'var(--radius-core)',
        lg: 'var(--radius-lg)',
        md: 'var(--radius-md)',
        sm: 'var(--radius-sm)',
        pill: 'var(--radius-pill)',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        'card-hover': 'var(--shadow-card-hover)',
        'inner-highlight': 'var(--inner-highlight)',
        'accent-glow': 'var(--accent-glow)',
      },
      fontFamily: {
        display: ['var(--font-display)', 'Cabinet Grotesk', '-apple-system', 'sans-serif'],
        sans: ['var(--font-sans)', 'Satoshi', '-apple-system', 'sans-serif'],
        mono: ['var(--font-mono)', 'JetBrains Mono', 'monospace'],
        serif: ['var(--font-serif)', 'Instrument Serif', 'Georgia', 'serif'],
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.32, 0.72, 0, 1)',
        glow: 'cubic-bezier(0.16, 1, 0.3, 1)',
        tactile: 'cubic-bezier(0.23, 1, 0.32, 1)',
      },
      transitionDuration: {
        '280': '280ms',
        '400': '400ms',
      },
    },
  },
  plugins: [],
};

export default config;
