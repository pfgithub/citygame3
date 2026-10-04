import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths, so the build works from any sub-path (it is served from /citygame3/).
  base: './',
  // three.js is most of the bundle (~600 kB minified however it is imported, since the renderer
  // pulls in nearly all of it); don't warn about that.
  build: { chunkSizeWarningLimit: 800 },
});
