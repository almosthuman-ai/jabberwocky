import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // CRITICAL: Matches your repo name so GitHub Pages can find the assets
  base: '/jabberwocky/', 

  plugins: [react()],
  
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    }
  },

  // These settings only affect 'npm run dev' on your local machine
  server: {
    port: 3000,
    host: '0.0.0.0',
  }
});