import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { outDir: resolve('out/main') },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { outDir: resolve('out/preload') },
  },
  renderer: {
    root: resolve('src/renderer'),
    plugins: [react(), tailwindcss()],
    build: { outDir: resolve('out/renderer') },
  },
});
