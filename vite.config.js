import { defineConfig } from 'vite';

// Relative asset paths, so the build works from any sub-path (it is served from /citygame3/).
export default defineConfig({ base: './' });
