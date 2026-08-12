import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// SINGLE=1 produces one self contained HTML file for review.
// The normal build produces the site bundle deployed under /app/.
const single = process.env.SINGLE === '1';

export default defineConfig({
  base: './',
  plugins: [react(), ...(single ? [viteSingleFile()] : [])],
  build: {
    outDir: single ? 'dist-single' : 'dist',
    emptyOutDir: true,
    target: 'es2022',
    assetsInlineLimit: single ? 100000000 : 4096,
  },
});
