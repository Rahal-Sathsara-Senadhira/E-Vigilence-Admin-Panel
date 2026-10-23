import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The public notice page — a separate build from the admin panel (docs/17 §2).
// In development the API is reached through this server, as in apps/web.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5290,
    strictPort: true,
    proxy: { "/api": { target: "http://localhost:4100", changeOrigin: false } },
  },
  preview: { port: 5290 },
});
