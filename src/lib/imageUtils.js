/* ---------------------------------------------------------------------------
   imageUtils.js
   Utilidades de manipulación de imágenes basadas en Canvas (100% locales).
   Aquí se hace todo el trabajo de: componer fondos, refinar bordes, redimensionar
   y exportar en PNG/JPG conservando la máxima calidad y la resolución original.
   ------------------------------------------------------------------------- */

/** Formatos de imagen aceptados en la carga. */
export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Tamaño máximo de archivo (20 MB) para evitar bloqueos del navegador. */
export const MAX_FILE_SIZE = 20 * 1024 * 1024;

/**
 * Valida un archivo antes de procesarlo.
 * @param {File} file
 * @returns {{ok: boolean, error?: string}}
 */
export function validateFile(file) {
  if (!file) return { ok: false, error: 'No se recibió ningún archivo.' };
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return {
      ok: false,
      error: `Formato no soportado (${file.type || 'desconocido'}). Usa JPG, PNG o WEBP.`,
    };
  }
  if (file.size > MAX_FILE_SIZE) {
    return {
      ok: false,
      error: `La imagen pesa ${(file.size / 1024 / 1024).toFixed(1)} MB. El máximo es 20 MB.`,
    };
  }
  return { ok: true };
}

/**
 * Carga un Blob/URL como HTMLImageElement ya decodificado.
 * @param {Blob|string} src
 * @returns {Promise<HTMLImageElement>}
 */
export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const url = typeof src === 'string' ? src : URL.createObjectURL(src);
    const img = new Image();
    img.onload = () => {
      resolve(img);
      // Si creamos un ObjectURL temporal, no lo revocamos aquí porque el llamador
      // puede seguir usándolo; la gestión de URLs se hace en el componente.
    };
    img.onerror = () => reject(new Error('No se pudo decodificar la imagen.'));
    img.src = url;
  });
}

/**
 * Crea un canvas del tamaño indicado.
 */
export function createCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/**
 * Dibuja una imagen (con alfa) en un canvas nuevo a su resolución nativa.
 * @param {HTMLImageElement} img
 * @returns {HTMLCanvasElement}
 */
export function imageToCanvas(img) {
  const canvas = createCanvas(img.naturalWidth, img.naturalHeight);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  return canvas;
}

/**
 * Refina los bordes de una imagen recortada para eliminar "halos" y suavizar
 * el canal alfa. Trabaja sobre los píxeles (ImageData):
 *   1. Contrae ligeramente la máscara alfa (erosión) para comer halos claros.
 *   2. Aplica un pequeño desenfoque al canal alfa (feather) para bordes suaves.
 *
 * @param {HTMLCanvasElement} canvas  Canvas de origen (se lee, no se muta).
 * @param {number} amount             Intensidad 0..3 (0 = sin refinar).
 * @returns {HTMLCanvasElement}       Nuevo canvas refinado.
 */
export function refineEdges(canvas, amount = 1) {
  if (amount <= 0) return canvas;

  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d');
  const src = ctx.getImageData(0, 0, w, h);
  const data = src.data;

  // --- 1. Extraemos el canal alfa a un buffer independiente ---
  const alpha = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) alpha[i] = data[i * 4 + 3];

  // --- 2. Erosión: reducimos alfa según el vecino mínimo (radio = amount px) ---
  const radius = Math.max(1, Math.round(amount));
  const eroded = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let min = 255;
      for (let dy = -radius; dy <= radius; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const a = alpha[yy * w + xx];
          if (a < min) min = a;
        }
      }
      eroded[y * w + x] = min;
    }
  }

  // --- 3. Feather: desenfoque de caja 3x3 sobre el alfa erosionado ---
  const blurred = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          sum += eroded[yy * w + xx];
          count++;
        }
      }
      blurred[y * w + x] = sum / count;
    }
  }

  // --- 4. Volcamos el alfa refinado en un canvas nuevo ---
  const out = createCanvas(w, h);
  const outCtx = out.getContext('2d');
  const dst = outCtx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    dst.data[i * 4] = data[i * 4];
    dst.data[i * 4 + 1] = data[i * 4 + 1];
    dst.data[i * 4 + 2] = data[i * 4 + 2];
    dst.data[i * 4 + 3] = Math.round(blurred[i]);
  }
  outCtx.putImageData(dst, 0, 0);
  return out;
}

/**
 * Compone la imagen recortada sobre un fondo determinado.
 * @param {HTMLCanvasElement} fgCanvas  Imagen recortada (con alfa).
 * @param {Object} bg
 *   - type: 'transparent' | 'color' | 'image'
 *   - color: string (para 'color', p.ej. '#ffffff')
 *   - image: HTMLImageElement (para 'image')
 * @returns {HTMLCanvasElement}
 */
export function compositeBackground(fgCanvas, bg) {
  const w = fgCanvas.width;
  const h = fgCanvas.height;
  const out = createCanvas(w, h);
  const ctx = out.getContext('2d');

  if (bg.type === 'color') {
    ctx.fillStyle = bg.color || '#ffffff';
    ctx.fillRect(0, 0, w, h);
  } else if (bg.type === 'image' && bg.image) {
    // Cubrir (cover) manteniendo proporción del fondo.
    const iw = bg.image.naturalWidth;
    const ih = bg.image.naturalHeight;
    const scale = Math.max(w / iw, h / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    ctx.drawImage(bg.image, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }
  // Para 'transparent' no se dibuja fondo alguno.

  ctx.drawImage(fgCanvas, 0, 0);
  return out;
}

/**
 * Redimensiona un canvas manteniendo la proporción según un ancho objetivo.
 * Si targetWidth es null/igual, devuelve el mismo canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {number|null} targetWidth
 * @returns {HTMLCanvasElement}
 */
export function resizeCanvas(canvas, targetWidth) {
  if (!targetWidth || targetWidth === canvas.width) return canvas;
  const ratio = canvas.height / canvas.width;
  const w = Math.round(targetWidth);
  const h = Math.round(targetWidth * ratio);
  const out = createCanvas(w, h);
  const ctx = out.getContext('2d');
  // Interpolación de alta calidad para reescalados suaves.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, w, h);
  return out;
}

/**
 * Exporta un canvas a Blob en el formato pedido.
 * PNG => sin pérdida (transparencia intacta). JPG => calidad configurable.
 * @param {HTMLCanvasElement} canvas
 * @param {'image/png'|'image/jpeg'} type
 * @param {number} quality  0..1 (solo aplica a JPG)
 * @returns {Promise<Blob>}
 */
export function canvasToBlob(canvas, type = 'image/png', quality = 1) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Fallo al codificar la imagen.'))),
      type,
      quality
    );
  });
}

/**
 * Dispara la descarga de un Blob en el navegador.
 * @param {Blob} blob
 * @param {string} filename
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Liberamos el ObjectURL tras un breve margen.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Deriva un nombre de archivo de salida a partir del original.
 * @param {string} originalName
 * @param {string} suffix     p.ej. '-sin-fondo'
 * @param {string} ext        'png' | 'jpg'
 */
export function outputName(originalName, suffix, ext) {
  const base = (originalName || 'imagen').replace(/\.[^.]+$/, '');
  return `${base}${suffix}.${ext}`;
}
