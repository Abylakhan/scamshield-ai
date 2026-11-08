/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { 950: "#03060f", 900: "#060b18", 850: "#0a1122", 800: "#0e1730", 700: "#16213f", 600: "#22305a" },
        line: "#1b2747",
        cyan: { 300: "#7ee8fa", 400: "#22d3ee", 500: "#06b6d4" },
        volt: { 400: "#3b82f6", 500: "#2563eb" },
        safe: { 400: "#34d399", 500: "#10b981" },
        warn: { 400: "#fbbf24" },
        hot: { 400: "#fb7185", 500: "#f43f5e" },
        orange: { 400: "#fb923c" },
      },
      fontFamily: {
        display: ["Unbounded", "system-ui", "sans-serif"],
        sans: ["Onest", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(34,211,238,.25), 0 8px 40px -12px rgba(34,211,238,.35)",
      },
    },
  },
  plugins: [],
};
