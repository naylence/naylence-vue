import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@naylence/core': resolve(__dirname, '../../node_modules/@naylence/core'),
      '@naylence/runtime': resolve(__dirname, '../../node_modules/@naylence/runtime'),
      '@naylence/agent-sdk': resolve(__dirname, '../../node_modules/@naylence/agent-sdk'),
    },
  },
  optimizeDeps: {
    include: ['@naylence/core', '@naylence/runtime', '@naylence/agent-sdk'],
    exclude: [],
  },
});
