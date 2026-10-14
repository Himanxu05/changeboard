import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // In development, forward API calls to the Express server so the browser
  // sees one origin (same as production behind nginx, so no CORS needed).
  server: { proxy: { "/api": "http://localhost:4000" } },
});
