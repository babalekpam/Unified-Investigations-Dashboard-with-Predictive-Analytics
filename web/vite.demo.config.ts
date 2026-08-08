import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Build config for the offline walkthrough in `demo/`.
 *
 * Separate from the application build on purpose: the fetch stub and the captured
 * payloads must never end up in the bundle that is deployed. Everything is emitted as a
 * single JS and CSS pair with assets inlined, because the artifact this feeds is one
 * self-contained HTML file.
 */
export default defineConfig({
  plugins: [react()],
  root: '.',
  base: './',
  build: {
    outDir: 'demo-dist',
    emptyOutDir: true,
    // Fonts are inlined as data URIs by the packaging step; keeping Vite's own inline
    // limit at zero means it does not do it twice.
    assetsInlineLimit: 0,
    rollupOptions: {
      input: 'demo/index.html',
      output: {
        entryFileNames: 'demo.js',
        assetFileNames: '[name][extname]',
      },
    },
  },
})
