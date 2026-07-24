import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Configuración de Vite.
 *
 * Puntos clave:
 * 1. Cabeceras COOP/COEP: habilitan `SharedArrayBuffer` en el navegador, lo que
 *    permite que onnxruntime-web use múltiples hilos (multithreading WASM).
 *    Esto acelera MUCHO la inferencia. El CDN del modelo envía la cabecera
 *    `Cross-Origin-Resource-Policy: cross-origin`, por lo que la descarga del
 *    modelo sigue funcionando aun con COEP activado.
 * 2. `optimizeDeps.exclude`: onnxruntime-web y la librería de imgly cargan sus
 *    propios artefactos (WASM/mjs) de forma dinámica; excluirlas del
 *    pre-bundling de Vite evita errores de resolución.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    port: 3000,
    host: true,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  optimizeDeps: {
    exclude: ['@imgly/background-removal', 'onnxruntime-web'],
  },
  build: {
    target: 'esnext',
  },
});
