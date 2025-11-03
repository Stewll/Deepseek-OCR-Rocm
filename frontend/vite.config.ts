import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: process.env.HOST || true,
    port: parseInt(process.env.PORT || '5173'),
    strictPort: true,
  },
  preview: {
    host: process.env.HOST || true,
    port: parseInt(process.env.PORT || '5173'),
    strictPort: true,
  },
  // Define build-time constants
  define: {
    __DEV__: process.env.NODE_ENV === 'development',
  },
});