import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  base: '/ocupados/',
  plugins: [react()],
  build: {
    target: 'es2022', sourcemap: false,
    rolldownOptions: { input: { es: fileURLToPath(new URL('./index.html', import.meta.url)), en: fileURLToPath(new URL('./en/index.html', import.meta.url)) } },
  },
});
