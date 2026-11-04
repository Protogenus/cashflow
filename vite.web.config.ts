// Web build config — builds the renderer as a plain static site into dist/
// for the Vercel deployment. (The Electron build uses electron.vite.config.ts;
// vite.config.ts is the shared dev/vitest config.)
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  build: { outDir: resolve(__dirname, 'dist') },
  plugins: [react(), tailwindcss()],
});
