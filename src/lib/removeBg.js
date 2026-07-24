/* ---------------------------------------------------------------------------
   removeBg.js
   Envoltorio sobre @imgly/background-removal.
   Toda la inferencia (IA de segmentación ISNet vía ONNX Runtime + WASM) corre
   DENTRO del navegador. La imagen del usuario NUNCA se sube a ningún servidor.
   Lo único que se descarga desde Internet (CDN de img.ly) es el modelo y los
   binarios WASM, y solo la primera vez (luego quedan en la caché del navegador).
   ------------------------------------------------------------------------- */

import { removeBackground, preload } from '@imgly/background-removal';

/**
 * Mapa de calidad -> modelo ISNet.
 *   - 'small'  (isnet_quint8, ~44 MB)  rápido, buena calidad.
 *   - 'medium' (isnet_fp16,  ~88 MB)   equilibrio (por defecto).
 *   - 'large'  (isnet,      ~176 MB)   máxima precisión de bordes.
 */
export const MODEL_SIZES = {
  small: { label: 'Rápido (44 MB)', model: 'small' },
  medium: { label: 'Equilibrado (88 MB)', model: 'medium' },
  large: { label: 'Máxima calidad (176 MB)', model: 'large' },
};

/**
 * Traduce las claves internas de progreso de la librería a texto legible.
 */
function humanizeStage(key) {
  if (key.startsWith('fetch:/models/')) return 'Descargando modelo de IA…';
  if (key.startsWith('fetch:/onnxruntime')) return 'Descargando motor de inferencia…';
  if (key.startsWith('fetch:')) return 'Descargando recursos…';
  switch (key) {
    case 'compute:decode':
      return 'Decodificando imagen…';
    case 'compute:inference':
      return 'Analizando sujeto con IA…';
    case 'compute:mask':
      return 'Generando máscara…';
    case 'compute:encode':
      return 'Componiendo resultado…';
    default:
      return 'Procesando…';
  }
}

/**
 * Precarga el modelo (opcional) para que el primer recorte sea instantáneo.
 * @param {'small'|'medium'|'large'} size
 */
export async function preloadModel(size = 'medium') {
  await preload({ model: MODEL_SIZES[size]?.model || 'medium', device: 'cpu' });
}

/**
 * Elimina el fondo de una imagen.
 *
 * @param {Blob|File} file            Imagen de origen.
 * @param {Object} opts
 *   - size: 'small'|'medium'|'large'  (modelo)
 *   - useGPU: boolean                 (WebGPU si está disponible)
 *   - onProgress: (info) => void      ({ stage, ratio } 0..1)
 * @returns {Promise<Blob>}           PNG con transparencia, a resolución original.
 */
export async function removeImageBackground(file, opts = {}) {
  const { size = 'medium', useGPU = false, onProgress } = opts;

  const config = {
    model: MODEL_SIZES[size]?.model || 'medium',
    device: useGPU ? 'gpu' : 'cpu',
    // rescale:true (valor por defecto de la librería) => la máscara se reescala a
    // la resolución ORIGINAL de la imagen. Así el recorte conserva su tamaño real.
    rescale: true,
    output: {
      // PNG conserva el canal alfa sin pérdida. La composición a JPG/color se hace
      // después, en canvas, para tener control total sobre el fondo.
      format: 'image/png',
      quality: 1,
    },
    progress: (key, current, total) => {
      if (!onProgress) return;
      const ratio = total > 0 ? Math.min(1, current / total) : 0;
      onProgress({ stage: humanizeStage(key), ratio, key });
    },
  };

  return removeBackground(file, config);
}
