# Quita Fondo — Editor local de imágenes

Aplicación web para **eliminar el fondo de imágenes con IA**, 100 % en tu navegador.
Tus imágenes **nunca se suben a ningún servidor**: toda la inferencia (modelo
ISNet sobre ONNX Runtime + WebAssembly) corre localmente. Exporta en **PNG con
transparencia** o **JPG de máxima calidad**, conservando la resolución original.

![Stack](https://img.shields.io/badge/React-18-61dafb) ![Vite](https://img.shields.io/badge/Vite-5-646cff) ![Tailwind](https://img.shields.io/badge/Tailwind-3-38bdf8)

---

## ✨ Características

- **Privacidad total.** El procesamiento es 100 % local. Lo único que se descarga
  de Internet es el modelo de IA y los binarios WASM, y **solo la primera vez**
  (después quedan en la caché del navegador).
- **Carga flexible.** Arrastrar y soltar o seleccionar archivos. Formatos JPG, PNG
  y WEBP, hasta 20 MB. **Procesamiento por lotes** (varias imágenes a la vez).
- **Eliminación de fondo precisa** con modelos ISNet (3 niveles de calidad).
- **Previsualización** con vista *Resultado* y comparador *Antes/Después*
  arrastrable.
- **Exportación:**
  - **PNG** con canal alfa intacto, resolución original, sin pérdida.
  - **JPG** con fondo blanco (o color/imagen que elijas), calidad configurable
    (60–100 %).
- **Ajustes extra:**
  - Cambiar el fondo por **color sólido** o una **imagen**.
  - **Refinar bordes** (anti-halo) para eliminar orlas y suavizar.
  - **Redimensionar** manteniendo la proporción.
  - Aceleración por **WebGPU** (si el navegador la soporta).
- **UI moderna y responsive** (Tailwind CSS).

---

## 🧱 Arquitectura

Aplicación **totalmente cliente** (sin backend). No hay base de datos ni API: no
hace falta porque todo ocurre en memoria dentro del navegador.

```
bg-remover/
├── index.html                 # Punto de entrada HTML
├── package.json               # Dependencias y scripts
├── vite.config.js             # Config de Vite (+ cabeceras COOP/COEP para hilos WASM)
├── tailwind.config.js         # Tema de Tailwind
├── postcss.config.js
├── README.md
└── src/
    ├── main.jsx               # Bootstrap de React
    ├── index.css              # Tailwind + estilos base (tablero de transparencia, etc.)
    ├── App.jsx                # Orquestación: estado, barra de herramientas, panel, exportación
    ├── components/
    │   ├── Dropzone.jsx       # Zona de arrastrar y soltar
    │   ├── CompareSlider.jsx  # Comparador antes/después
    │   └── Icons.jsx          # Iconos SVG en línea
    └── lib/
        ├── removeBg.js        # Envoltorio de @imgly/background-removal (IA)
        └── imageUtils.js      # Canvas: componer fondo, refinar bordes, redimensionar, exportar
```

### Tecnologías

| Rol                       | Librería                                   | Versión |
|---------------------------|--------------------------------------------|---------|
| UI                        | React / ReactDOM                           | 18.3.1  |
| Bundler / dev server      | Vite                                       | 5.4.11  |
| Estilos                   | Tailwind CSS / PostCSS / Autoprefixer      | 3.4.17  |
| Eliminación de fondo (IA) | @imgly/background-removal                  | 1.6.0   |
| Motor de inferencia       | onnxruntime-web (peer de la anterior)      | 1.21.0-dev.20250206 |
| Manipulación de imágenes  | Canvas API (nativa del navegador)          | —       |

---

## 🚀 Puesta en marcha

Requisitos: **Node.js 18+** (probado con Node 24) y npm.

### 1. Instalar dependencias

```bash
cd bg-remover
npm install
```

### 2. Ejecutar en desarrollo

```bash
npm run dev
```

Abre **http://localhost:3000** en tu navegador.

> No hay variables de entorno que configurar. La app funciona sin ninguna clave.

### 3. Compilar para producción (opcional)

```bash
npm run build      # genera la carpeta dist/
npm run preview    # sirve dist/ en http://localhost:3000
```

Para desplegarlo, sube el contenido de `dist/` a cualquier hosting estático
(Netlify, Vercel, GitHub Pages, Nginx, Apache…).

> **Nota de rendimiento:** para habilitar el multihilo de WASM (más velocidad) la
> app envía las cabeceras `Cross-Origin-Opener-Policy: same-origin` y
> `Cross-Origin-Embedder-Policy: require-corp`. En dev/preview ya están
> configuradas en `vite.config.js`. En producción, configura estas mismas
> cabeceras en tu servidor. Si no las pones, la app **igualmente funciona**, solo
> que la inferencia irá algo más lenta.

---

## 📖 Cómo se usa

1. **Carga** una o varias imágenes (arrastrando o con el botón *Cargar*).
2. Elige el **modelo de IA** en el panel derecho:
   - *Rápido (44 MB)* — buen resultado, descarga y proceso más veloces.
   - *Equilibrado (88 MB)* — recomendado (por defecto).
   - *Máxima calidad (176 MB)* — bordes más finos, ideal para pelo/detalles.
3. Pulsa **Eliminar fondo**. Verás una barra de progreso (la primera vez incluye
   la descarga del modelo).
4. Ajusta a tu gusto: **fondo** (transparente / color / imagen), **refinar
   bordes**, **tamaño de salida**.
5. **Exporta**:
   - **PNG** → conserva la transparencia y la resolución original, sin pérdida.
   - **JPG** → fondo blanco por defecto (o el color/imagen elegido), a la calidad
     indicada.
   - Con varias imágenes, usa *Exportar todas en PNG/JPG*.

---

## 🔍 Detalles de calidad

- **Resolución original preservada:** la librería reescala la máscara alfa al
  tamaño real de tu imagen (`rescale: true`), así el recorte mantiene el ancho ×
  alto originales.
- **PNG sin pérdida:** se exporta con `canvas.toBlob('image/png', 1)`; el canal
  alfa queda intacto.
- **JPG de máxima calidad:** `canvas.toBlob('image/jpeg', calidad)` con calidad
  configurable (0.60–1.00, por defecto 0.95). Como JPG no admite transparencia, si
  el fondo estaba en *Transparente* se compone automáticamente sobre **blanco**.
- **Refinar bordes:** erosión ligera del alfa (come el halo del fondo) + suavizado
  de caja (bordes naturales, sin dientes de sierra).

---

## ❓ Solución de problemas

| Problema | Causa / solución |
|----------|------------------|
| «No se pudo eliminar el fondo» | La **primera** ejecución necesita Internet para descargar el modelo desde el CDN de img.ly. Comprueba tu conexión y reintenta. |
| Va lento | Usa el modelo *Rápido*, activa **WebGPU** si tu navegador lo soporta, o sirve la app con cabeceras COOP/COEP para habilitar multihilo. |
| Bordes con halo | Sube el nivel de **Refinar bordes** o usa el modelo *Máxima calidad*. |
| No detecta bien el sujeto | Los modelos ISNet funcionan mejor con un sujeto principal claro (personas, productos, objetos). Prueba el modelo grande. |

---

## 🔒 Privacidad

Ninguna imagen que cargues sale de tu equipo. No hay servidor propio, ni analítica,
ni subida de archivos. El único tráfico de red es la **descarga inicial del modelo
de IA** (archivos estáticos del CDN público de img.ly), que tu navegador cachea.

---

## 📄 Licencia

Código de ejemplo bajo licencia MIT. El modelo y la librería de eliminación de
fondo se distribuyen bajo la licencia de [IMG.LY](https://img.ly) — revisa sus
términos para uso comercial.
