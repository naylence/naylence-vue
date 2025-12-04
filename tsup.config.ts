import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['vue', '@naylence/core', '@naylence/agent-sdk'],
  treeshake: true,
  splitting: false,
});
