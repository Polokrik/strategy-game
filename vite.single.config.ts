import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// Version « un seul fichier » : tout (code, styles, polices) est dans un HTML qui s'ouvre d'un double-clic, sans Node.
export default defineConfig({
  plugins: [viteSingleFile()],
  build: { outDir: "dist-single", assetsInlineLimit: 100_000_000 },
});
