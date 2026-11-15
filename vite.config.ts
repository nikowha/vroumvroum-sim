import { defineConfig } from 'vite';

// Chemins relatifs : la même build fonctionne sur GitHub Pages (sous-dossier) et plus tard dans Tauri.
export default defineConfig({
  base: './',
  worker: { format: 'es' },
  build: { target: 'es2022' },
});
