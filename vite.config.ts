/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig(({ command }) => ({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __WELDING_INCLUDE_SAMPLE_DATA__: JSON.stringify(command === 'serve'),
  },
  // Relative asset paths are required when the build is served from the Capacitor WebView.
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2022',
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
}));
