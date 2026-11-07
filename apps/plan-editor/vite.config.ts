import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
export default defineConfig({
  base: './',
  plugins: [svelte(), tailwindcss(), {
    name: 'local-catalog',
    resolveId(id) { if (id === 'virtual:catalog-assets') return '\0catalog'; if (id === '$app/paths') return '\0paths'; },
    load(id) { if (id === '\0catalog') return 'export default {}'; if (id === '\0paths') return 'export const base = ""'; },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'OpenPlan3D-LICENSE.txt', source: readFileSync(new URL('./vendor/openplan3d/LICENSE', import.meta.url), 'utf8') });
    },
  }],
  resolve: { alias: [
    // Maatlabels volgen de interfacetaal; de rest van de vendor-store blijft ongewijzigd.
    { find: /^\$lib\/stores\/settings$/, replacement: fileURLToPath(new URL('./src/settings.ts', import.meta.url)) },
    { find: '$lib', replacement: fileURLToPath(new URL('./vendor/openplan3d', import.meta.url)) },
  ] },
  build: { outDir: 'dist', emptyOutDir: true },
});
