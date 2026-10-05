import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  // Relative, so that the build works under any path, e.g. on GitHub Pages.
  base: './',
  resolve: {
    // The plugin imports `doc` and `util` from `prettier`, which in the browser
    // come from Prettier's standalone build.
    alias: [{ find: /^prettier$/, replacement: 'prettier/standalone' }]
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Prettier's parsers, mostly TypeScript's, are large.
    chunkSizeWarningLimit: 4000
  }
})
