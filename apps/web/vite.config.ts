import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The API is reached through this dev server (same origin), so the refresh
// cookie stays SameSite=Strict and no CORS is needed in development.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5280,
    strictPort: true,
    proxy: { "/api": { target: "http://localhost:4100", changeOrigin: false } },
  },
  preview: { port: 5280 },
});
