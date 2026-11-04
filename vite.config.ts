/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    // Engine unit tests (pure TS, no DOM) + template regression tests.
    environment: 'node',
    include: ['src/renderer/**/*.test.ts'],
  },
});
