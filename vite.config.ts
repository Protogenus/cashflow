/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    // Engine unit tests only: pure TS, no DOM. UI tests come with later milestones.
    environment: 'node',
    include: ['src/engine/**/*.test.ts'],
  },
});
