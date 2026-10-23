import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// The backend is reached through this dev server (same origin), so the
// refresh cookie can stay SameSite=Strict and no CORS is needed (docs/19 §6).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    port: 5300,
    strictPort: true,
    proxy: { "/api": { target: "http://localhost:4200", changeOrigin: false } },
  },
  preview: { port: 5300 },
});
