import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  // Only VITE_* variables are exposed to the client bundle. Never inject server
  // secrets (GEMINI_API_KEY, SESSION_SECRET, MERCADOPAGO_ACCESS_TOKEN, ...) via `define`.
  const env = loadEnv(mode, '.', 'VITE_');
  if (env.VITE_GEMINI_API_KEY || env.VITE_GOOGLE_API_KEY) {
    console.warn(
      '\n[security] VITE_GEMINI_API_KEY / VITE_GOOGLE_API_KEY ya no se usa: la IA pasa por el servidor (GEMINI_API_KEY).\n' +
      '[security] Eliminala de tu .env: cualquier variable VITE_* queda pública.\n'
    );
  }
  return {
    plugins: [react(), tailwindcss()],
    base: '',
    build: {
      chunkSizeWarningLimit: 2000,
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor': ['react', 'react-dom', 'lucide-react', 'framer-motion', 'axios', 'firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage'],
            'ui': ['sonner', 'canvas-confetti', 'jspdf', 'xlsx', 'mammoth', 'html2canvas']
          }
        }
      }
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
      dedupe: ['react', 'react-dom'],
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
