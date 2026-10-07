import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// Cliente empaquetable: recursos locales, sin servidor Node ni secretos. Comparte tokens CSS y catálogos con la web.
export default defineConfig({
  plugins: [react()],
  resolve: { dedupe: ["react", "react-dom"], alias: { "@shared": resolve(__dirname, "../../src/lib"), "@css": resolve(__dirname, "../../src/app/globals.css") } },
  server: { port: 5173, strictPort: true, fs: { allow: [resolve(__dirname, "../..")] } },
  build: { outDir: "dist", sourcemap: false, target: "es2022" },
  envPrefix: "VITE_",
});
