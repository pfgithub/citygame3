import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths, so the build works from any sub-path (it is served from /citygame3/).
  base: './',
  // Box2D v3: the single-threaded, non-SIMD build. (The package's own entry picks a threaded
  // build when the page is cross-origin isolated, which GitHub Pages is not.)
  resolve: { alias: { 'box2d-compat': decodeURIComponent(new URL('./node_modules/box2d3-wasm/build/dist/es/compat/Box2D.compat.mjs', import.meta.url).pathname) } },
  // three.js is most of the bundle (~600 kB minified however it is imported, since the renderer
  // pulls in nearly all of it); don't warn about that.
  build: {
    chunkSizeWarningLimit: 800, target: 'es2022',
    // the game, and a standalone demo of the thin-wall physics solver (served at demos/physics-solver/)
    rollupOptions: { input: { main: 'index.html', solver: 'demos/physics-solver/index.html' } },
  },
});
