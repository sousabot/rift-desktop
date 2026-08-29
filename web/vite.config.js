import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { serveDocsLanding } from './serve-docs-landing.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), serveDocsLanding()],
  root: path.resolve(__dirname),
  base: './',
  publicDir: path.resolve(__dirname, 'public'),
  server: {
    port: 5174,
    strictPort: true,
    fs: {
      allow: [path.resolve(__dirname, '..')],
    },
  },
  build: {
    outDir: path.resolve(__dirname, '../docs/app'),
    emptyOutDir: true,
  },
});
