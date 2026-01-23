import { defineConfig } from 'tsup';

export default defineConfig([
  // Main entry point - full controller
  {
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    minify: false,
    treeshake: true,
    splitting: false,
    outDir: 'dist',
    external: [],
    platform: 'browser',
    target: 'es2020',
    outExtension({ format }) {
      return {
        js: format === 'cjs' ? '.cjs' : '.js'
      };
    },
  },
  // Stega entry point - lightweight utilities
  {
    entry: { 'stega/index': 'src/stega/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    minify: false,
    treeshake: true,
    splitting: false,
    outDir: 'dist',
    external: [],
    platform: 'browser',
    target: 'es2020',
    outExtension({ format }) {
      return {
        js: format === 'cjs' ? '.cjs' : '.js'
      };
    },
  },
]);
