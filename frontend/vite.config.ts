import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

declare const process: { env: Record<string, string | undefined> }; // avoids pulling in @types/node

export default defineConfig({
  // GitHub Pages serves the project under /<repo>/; set VITE_BASE for that build.
  base: process.env.VITE_BASE ?? "/",
  plugins: [react()],
  worker: { format: "es" },
  build: {
    rollupOptions: {
      output: {
        manualChunks: { react: ["react", "react-dom", "react-router-dom"], charts: ["recharts"], motion: ["framer-motion"] },
      },
    },
  },
  server: {
    port: 5173,
    proxy: { "/api": { target: "http://127.0.0.1:8000", changeOrigin: false } },
  },
});
