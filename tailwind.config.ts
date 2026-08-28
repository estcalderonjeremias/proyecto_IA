import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0B0F17",
        surface: {
          DEFAULT: "#1E2640",
          hover: "#283354",
          border: "rgba(255, 255, 255, 0.08)",
        },
        neon: {
          emerald: "#10B981",
          green: "#22C55E",
          glow: "rgba(34, 197, 94, 0.4)",
        },
        status: {
          success: "#22C55E",
          warning: "#F59E0B",
          error: "#EF4444",
        },
        text: {
          main: "#F9FAFB",
          muted: "#9CA3AF",
          dim: "#6B7280",
        },
      },
      boxShadow: {
        'neon': '0 0 20px rgba(34, 197, 94, 0.35)',
        'neon-lg': '0 0 35px rgba(34, 197, 94, 0.55)',
        'card': '0 10px 30px -5px rgba(0, 0, 0, 0.6)',
      },
      fontFamily: {
        sans: ['var(--font-outfit)', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      animation: {
        'laser-scan': 'laserScan 2.4s infinite ease-in-out alternate',
        'pulse-glow': 'pulseGlow 2s infinite ease-in-out',
      },
      keyframes: {
        laserScan: {
          '0%': { top: '5%', opacity: '0.8' },
          '50%': { opacity: '1' },
          '100%': { top: '95%', opacity: '0.8' },
        },
        pulseGlow: {
          '0%, 100%': { borderColor: 'rgba(34, 197, 94, 0.4)', boxShadow: '0 0 15px rgba(34, 197, 94, 0.2)' },
          '50%': { borderColor: 'rgba(34, 197, 94, 0.9)', boxShadow: '0 0 30px rgba(34, 197, 94, 0.5)' },
        },
      },
    },
  },
  plugins: [],
};
export default config;
