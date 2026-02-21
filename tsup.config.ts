import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'dist',
  format: ['esm'],
  target: 'node24',
  platform: 'node',
  sourcemap: true,
  clean: true,
  dts: false,
  banner: {
    js: '#!/usr/bin/env node',
  },
});
