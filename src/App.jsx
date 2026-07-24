import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Dropzone from './components/Dropzone.jsx';
import CompareSlider from './components/CompareSlider.jsx';
import {
  IconMagic,
  IconDownload,
  IconTrash,
  IconImage,
  IconSpinner,
  IconCheck,
  IconAlert,
  IconUpload,
} from './components/Icons.jsx';
import { removeImageBackground, MODEL_SIZES } from './lib/removeBg.js';
import {
  validateFile,
  loadImage,
  imageToCanvas,
  refineEdges,
  compositeBackground,
  resizeCanvas,
  canvasToBlob,
  downloadBlob,
  outputName,
} from './lib/imageUtils.js';

let ID = 0;
const nextId = () => `img-${++ID}`;

/** Ancho máximo del canvas de PREVISUALIZACIÓN (el export siempre es a resolución real). */
const PREVIEW_MAX_W = 1400;

export default function App() {
  // ------------------------------------------------------------------ estado
  const [items, setItems] = useState([]); // lista de imágenes
  const [selectedId, setSelectedId] = useState(null);
  const [view, setView] = useState('result'); // 'result' | 'compare'
  const [busy, setBusy] = useState(false); // procesando lote
  const [toast, setToast] = useState(null); // {type, msg}

  // Ajustes globales
  const [modelSize, setModelSize] = useState('medium');
  const [useGPU, setUseGPU] = useState(false);
  const [bgType, setBgType] = useState('transparent'); // transparent | color | image
  const [bgColor, setBgColor] = useState('#ffffff');
  const [bgImage, setBgImage] = useState(null); // {url, el}
  const [refine, setRefine] = useState(0); // 0..3
  const [resizePct, setResizePct] = useState(100); // 10..100
  const [jpgQuality, setJpgQuality] = useState(0.95);

  const selected = useMemo(
    () => items.find((it) => it.id === selectedId) || null,
    [items, selectedId]
  );

  // ----------------------------------------------------------- notificaciones
  const notify = useCallback((type, msg) => {
    setToast({ type, msg });
    window.clearTimeout(notify._t);
    notify._t = window.setTimeout(() => setToast(null), 4000);
  }, []);

  // ----------------------------------------------------------- carga archivos
  const addFiles = useCallback(
    (files) => {
      const valid = [];
      for (const file of files) {
        const check = validateFile(file);
        if (!check.ok) {
          notify('error', check.error);
          continue;
        }
        valid.push({
          id: nextId(),
          file,
          name: file.name,
          originalUrl: URL.createObjectURL(file),
          status: 'pending', // pending | processing | done | error
          progress: { stage: '', ratio: 0 },
          error: null,
          cutoutCanvas: null, // canvas full-res con alfa (resultado IA)
          previewUrl: null, // dataURL/objectURL de la composición actual
        });
      }
      if (valid.length) {
        setItems((prev) => [...prev, ...valid]);
        setSelectedId((cur) => cur || valid[0].id);
      }
    },
    [notify]
  );

  // ------------------------------------------------------- quitar fondo (uno)
  const processItem = useCallback(
    async (item) => {
      setItems((prev) =>
        prev.map((it) =>
          it.id === item.id
            ? { ...it, status: 'processing', error: null, progress: { stage: 'Iniciando…', ratio: 0 } }
            : it
        )
      );
      try {
        const blob = await removeImageBackground(item.file, {
          size: modelSize,
          useGPU,
          onProgress: (info) => {
            setItems((prev) =>
              prev.map((it) => (it.id === item.id ? { ...it, progress: info } : it))
            );
          },
        });
        const img = await loadImage(blob);
        const canvas = imageToCanvas(img); // full-res, con alfa
        setItems((prev) =>
          prev.map((it) =>
            it.id === item.id
              ? { ...it, status: 'done', cutoutCanvas: canvas, progress: { stage: 'Listo', ratio: 1 } }
              : it
          )
        );
      } catch (err) {
        console.error(err);
        setItems((prev) =>
          prev.map((it) =>
            it.id === item.id
              ? {
                  ...it,
                  status: 'error',
                  error:
                    'No se pudo eliminar el fondo. Revisa tu conexión (para la descarga inicial del modelo) o prueba otra imagen.',
                }
              : it
          )
        );
      }
    },
    [modelSize, useGPU]
  );

  // ------------------------------------------------- quitar fondo (lote/todos)
  const processAll = useCallback(async () => {
    const pending = items.filter((it) => it.status === 'pending' || it.status === 'error');
    if (!pending.length) {
      notify('error', 'No hay imágenes pendientes por procesar.');
      return;
    }
    setBusy(true);
    // Secuencial: el modelo se carga una sola vez (memoizado por la librería).
    for (const it of pending) {
      // eslint-disable-next-line no-await-in-loop
      await processItem(it);
    }
    setBusy(false);
    notify('success', 'Fondo eliminado en todas las imágenes.');
  }, [items, processItem, notify]);

  // ------------------------------------------------------- fondo personalizado
  const onBgImageFile = useCallback(
    async (files) => {
      const file = files[0];
      const check = validateFile(file);
      if (!check.ok) return notify('error', check.error);
      const url = URL.createObjectURL(file);
      const el = await loadImage(url);
      setBgImage({ url, el });
      setBgType('image');
    },
    [notify]
  );

  // ------------------------------------------- construir composición (canvas)
  // scaleForPreview: si true, reduce el tamaño para una previsualización fluida.
  const buildComposite = useCallback(
    (cutoutCanvas, { forPreview }) => {
      let canvas = cutoutCanvas;

      // 1) Escalar a resolución de previsualización si procede (solo pantalla).
      if (forPreview && canvas.width > PREVIEW_MAX_W) {
        canvas = resizeCanvas(canvas, PREVIEW_MAX_W);
      }

      // 2) Refinar bordes (opcional).
      if (refine > 0) canvas = refineEdges(canvas, refine);

      // 3) Redimensionado del usuario (solo en export; en preview mostramos tal cual).
      if (!forPreview && resizePct !== 100) {
        canvas = resizeCanvas(canvas, Math.round((cutoutCanvas.width * resizePct) / 100));
      }

      // 4) Componer fondo.
      const bg =
        bgType === 'color'
          ? { type: 'color', color: bgColor }
          : bgType === 'image'
          ? { type: 'image', image: bgImage?.el }
          : { type: 'transparent' };
      canvas = compositeBackground(canvas, bg);
      return canvas;
    },
    [refine, resizePct, bgType, bgColor, bgImage]
  );

  // ----------------------------------- regenerar previsualización del elemento
  useEffect(() => {
    if (!selected || selected.status !== 'done' || !selected.cutoutCanvas) return;
    let cancelled = false;
    const t = window.setTimeout(async () => {
      try {
        const canvas = buildComposite(selected.cutoutCanvas, { forPreview: true });
        const blob = await canvasToBlob(canvas, 'image/png', 1);
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        setItems((prev) =>
          prev.map((it) => {
            if (it.id !== selected.id) return it;
            if (it.previewUrl) URL.revokeObjectURL(it.previewUrl);
            return { ...it, previewUrl: url };
          })
        );
      } catch (e) {
        console.error(e);
      }
    }, 120); // pequeño debounce
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, selected?.status, selected?.cutoutCanvas, buildComposite]);

  // ----------------------------------------------------------------- exportar
  const exportOne = useCallback(
    async (item, format) => {
      if (!item?.cutoutCanvas) return;
      try {
        // Para JPG forzamos fondo blanco si el usuario dejó 'transparent'
        // (JPG no admite alfa), respetando color/imagen si los eligió.
        let effectiveBgApplied = false;
        const canvas = (() => {
          if (format === 'image/jpeg' && bgType === 'transparent') {
            // Componer sobre blanco temporalmente.
            let c = item.cutoutCanvas;
            if (refine > 0) c = refineEdges(c, refine);
            if (resizePct !== 100)
              c = resizeCanvas(c, Math.round((item.cutoutCanvas.width * resizePct) / 100));
            effectiveBgApplied = true;
            return compositeBackground(c, { type: 'color', color: '#ffffff' });
          }
          return buildComposite(item.cutoutCanvas, { forPreview: false });
        })();

        const isPng = format === 'image/png';
        const blob = await canvasToBlob(canvas, format, isPng ? 1 : jpgQuality);
        const ext = isPng ? 'png' : 'jpg';
        const suffix = isPng ? '-sin-fondo' : '-fondo';
        downloadBlob(blob, outputName(item.name, suffix, ext));
        void effectiveBgApplied;
      } catch (e) {
        console.error(e);
        notify('error', 'No se pudo exportar la imagen.');
      }
    },
    [buildComposite, bgType, refine, resizePct, jpgQuality, notify]
  );

  const exportAll = useCallback(
    async (format) => {
      const done = items.filter((it) => it.status === 'done');
      if (!done.length) return notify('error', 'No hay imágenes procesadas para exportar.');
      for (const it of done) {
        // eslint-disable-next-line no-await-in-loop
        await exportOne(it, format);
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 250)); // separar descargas
      }
    },
    [items, exportOne, notify]
  );

  // ------------------------------------------------------------------ borrar
  const removeItem = useCallback((id) => {
    setItems((prev) => {
      const it = prev.find((x) => x.id === id);
      if (it) {
        URL.revokeObjectURL(it.originalUrl);
        if (it.previewUrl) URL.revokeObjectURL(it.previewUrl);
      }
      const rest = prev.filter((x) => x.id !== id);
      return rest;
    });
    setSelectedId((cur) => (cur === id ? null : cur));
  }, []);

  useEffect(() => {
    // Si se borró el seleccionado, elegir otro.
    if (!selectedId && items.length) setSelectedId(items[0].id);
  }, [items, selectedId]);

  const anyDone = items.some((it) => it.status === 'done');
  const anyPending = items.some((it) => it.status === 'pending' || it.status === 'error');

  // ================================================================ RENDER ===
  return (
    <div className="min-h-screen">
      {/* Cabecera */}
      <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-white">
              <IconMagic width={20} height={20} />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">Quita Fondo</h1>
              <p className="text-xs text-slate-400">Editor local · privacidad total</p>
            </div>
          </div>
          <div className="hidden items-center gap-2 text-xs text-slate-400 sm:flex">
            <span className="rounded-full bg-green-500/10 px-2 py-1 text-green-400">
              100% en tu navegador
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-[1fr_320px]">
        {/* -------------------------------------------------- Columna principal */}
        <section className="space-y-6">
          {items.length === 0 ? (
            <Dropzone onFiles={addFiles} />
          ) : (
            <>
              {/* Barra de herramientas */}
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/50 p-2">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium hover:bg-slate-700">
                  <IconUpload width={16} height={16} />
                  Cargar
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      addFiles(Array.from(e.target.files));
                      e.target.value = '';
                    }}
                  />
                </label>

                <button
                  onClick={processAll}
                  disabled={busy || !anyPending}
                  className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busy ? <IconSpinner width={16} height={16} /> : <IconMagic width={16} height={16} />}
                  {busy ? 'Procesando…' : 'Eliminar fondo'}
                </button>

                <div className="mx-1 h-6 w-px bg-slate-700" />

                <button
                  onClick={() => selected && exportOne(selected, 'image/png')}
                  disabled={!selected || selected.status !== 'done'}
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium hover:bg-slate-700 disabled:opacity-40"
                >
                  <IconDownload width={16} height={16} /> PNG
                </button>
                <button
                  onClick={() => selected && exportOne(selected, 'image/jpeg')}
                  disabled={!selected || selected.status !== 'done'}
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium hover:bg-slate-700 disabled:opacity-40"
                >
                  <IconDownload width={16} height={16} /> JPG
                </button>

                {/* Cambiar vista */}
                <div className="ml-auto inline-flex rounded-lg border border-slate-700 p-0.5 text-sm">
                  <button
                    onClick={() => setView('result')}
                    className={
                      'rounded-md px-3 py-1.5 ' +
                      (view === 'result' ? 'bg-slate-700 text-white' : 'text-slate-400')
                    }
                  >
                    Resultado
                  </button>
                  <button
                    onClick={() => setView('compare')}
                    className={
                      'rounded-md px-3 py-1.5 ' +
                      (view === 'compare' ? 'bg-slate-700 text-white' : 'text-slate-400')
                    }
                  >
                    Comparar
                  </button>
                </div>
              </div>

              {/* Lienzo principal */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-3">
                {!selected ? (
                  <div className="flex h-80 items-center justify-center text-slate-500">
                    Selecciona una imagen de la galería.
                  </div>
                ) : selected.status === 'processing' ? (
                  <ProgressView item={selected} />
                ) : selected.status === 'error' ? (
                  <div className="flex h-80 flex-col items-center justify-center gap-3 text-center">
                    <IconAlert className="text-red-400" width={32} height={32} />
                    <p className="max-w-md text-sm text-slate-300">{selected.error}</p>
                    <button
                      onClick={() => processItem(selected)}
                      className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500"
                    >
                      Reintentar
                    </button>
                  </div>
                ) : selected.status === 'done' ? (
                  view === 'compare' ? (
                    <CompareSlider
                      before={selected.originalUrl}
                      after={selected.previewUrl || selected.originalUrl}
                    />
                  ) : (
                    <div className="checkerboard flex items-center justify-center overflow-hidden rounded-xl">
                      {selected.previewUrl ? (
                        <img
                          src={selected.previewUrl}
                          alt="Resultado"
                          className="max-h-[70vh] w-auto"
                        />
                      ) : (
                        <div className="flex h-80 items-center justify-center text-slate-500">
                          <IconSpinner /> Generando vista…
                        </div>
                      )}
                    </div>
                  )
                ) : (
                  // pending
                  <div className="checkerboard flex items-center justify-center overflow-hidden rounded-xl">
                    <img
                      src={selected.originalUrl}
                      alt="Original"
                      className="max-h-[70vh] w-auto opacity-90"
                    />
                  </div>
                )}
              </div>

              {/* Galería / lote */}
              <div className="flex gap-3 overflow-x-auto pb-2">
                {items.map((it) => (
                  <Thumb
                    key={it.id}
                    item={it}
                    active={it.id === selectedId}
                    onSelect={() => setSelectedId(it.id)}
                    onRemove={() => removeItem(it.id)}
                  />
                ))}
              </div>

              {anyDone && items.length > 1 && (
                <div className="flex flex-wrap gap-2 text-sm">
                  <span className="self-center text-slate-400">Exportar todas:</span>
                  <button
                    onClick={() => exportAll('image/png')}
                    className="rounded-lg bg-slate-800 px-3 py-1.5 font-medium hover:bg-slate-700"
                  >
                    Todas en PNG
                  </button>
                  <button
                    onClick={() => exportAll('image/jpeg')}
                    className="rounded-lg bg-slate-800 px-3 py-1.5 font-medium hover:bg-slate-700"
                  >
                    Todas en JPG
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        {/* ------------------------------------------------------ Panel lateral */}
        <aside className="space-y-5">
          <SettingsPanel
            modelSize={modelSize}
            setModelSize={setModelSize}
            useGPU={useGPU}
            setUseGPU={setUseGPU}
            bgType={bgType}
            setBgType={setBgType}
            bgColor={bgColor}
            setBgColor={setBgColor}
            bgImage={bgImage}
            onBgImageFile={onBgImageFile}
            clearBgImage={() => {
              if (bgImage) URL.revokeObjectURL(bgImage.url);
              setBgImage(null);
              setBgType('transparent');
            }}
            refine={refine}
            setRefine={setRefine}
            resizePct={resizePct}
            setResizePct={setResizePct}
            jpgQuality={jpgQuality}
            setJpgQuality={setJpgQuality}
            selected={selected}
          />
        </aside>
      </main>

      {/* Toast */}
      {toast && (
        <div
          className={
            'fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium shadow-soft ' +
            (toast.type === 'error'
              ? 'bg-red-600 text-white'
              : 'bg-green-600 text-white')
          }
        >
          {toast.type === 'error' ? <IconAlert width={18} height={18} /> : <IconCheck width={18} height={18} />}
          {toast.msg}
        </div>
      )}

      <footer className="mx-auto max-w-7xl px-4 py-6 text-center text-xs text-slate-500">
        Procesamiento local con IA (ISNet · ONNX Runtime WASM). Tus imágenes nunca salen de tu equipo.
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ Subvistas */

function ProgressView({ item }) {
  const pct = Math.round((item.progress?.ratio || 0) * 100);
  return (
    <div className="flex h-80 flex-col items-center justify-center gap-4 text-center">
      <IconSpinner width={36} height={36} className="text-brand-400" />
      <div className="w-72">
        <p className="mb-2 text-sm text-slate-300">{item.progress?.stage || 'Procesando…'}</p>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full rounded-full bg-brand-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-1 text-xs text-slate-500">{pct}%</p>
      </div>
    </div>
  );
}

function Thumb({ item, active, onSelect, onRemove }) {
  return (
    <div
      onClick={onSelect}
      className={
        'group relative h-20 w-20 flex-shrink-0 cursor-pointer overflow-hidden rounded-lg border-2 ' +
        (active ? 'border-brand-500' : 'border-slate-700 hover:border-slate-500')
      }
    >
      <div className="checkerboard absolute inset-0" />
      <img
        src={item.previewUrl || item.originalUrl}
        alt={item.name}
        className="relative h-full w-full object-cover"
      />
      {/* Estado */}
      <div className="absolute left-1 top-1">
        {item.status === 'processing' && (
          <span className="rounded bg-black/70 p-0.5 text-brand-400">
            <IconSpinner width={12} height={12} />
          </span>
        )}
        {item.status === 'done' && (
          <span className="rounded bg-green-600 p-0.5 text-white">
            <IconCheck width={12} height={12} />
          </span>
        )}
        {item.status === 'error' && (
          <span className="rounded bg-red-600 p-0.5 text-white">
            <IconAlert width={12} height={12} />
          </span>
        )}
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="absolute right-1 top-1 hidden rounded bg-black/70 p-0.5 text-white group-hover:block"
        aria-label="Quitar"
      >
        <IconTrash width={12} height={12} />
      </button>
    </div>
  );
}

function SettingsPanel(props) {
  const {
    modelSize, setModelSize, useGPU, setUseGPU,
    bgType, setBgType, bgColor, setBgColor, bgImage, onBgImageFile, clearBgImage,
    refine, setRefine, resizePct, setResizePct, jpgQuality, setJpgQuality, selected,
  } = props;

  const dims = selected?.cutoutCanvas
    ? `${selected.cutoutCanvas.width} × ${selected.cutoutCanvas.height} px`
    : selected
    ? 'Sin procesar'
    : '—';

  return (
    <div className="space-y-5 rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-200">
        <IconImage width={16} height={16} /> Ajustes
      </h2>

      {/* Modelo / calidad */}
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-400">Modelo de IA</label>
        <select
          value={modelSize}
          onChange={(e) => setModelSize(e.target.value)}
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm"
        >
          {Object.entries(MODEL_SIZES).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <label className="mt-2 flex items-center gap-2 text-xs text-slate-400">
          <input type="checkbox" checked={useGPU} onChange={(e) => setUseGPU(e.target.checked)} />
          Usar WebGPU si está disponible (más rápido)
        </label>
      </div>

      {/* Fondo */}
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-400">Fondo del resultado</label>
        <div className="grid grid-cols-3 gap-2">
          {[
            ['transparent', 'Transparente'],
            ['color', 'Color'],
            ['image', 'Imagen'],
          ].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setBgType(val)}
              className={
                'rounded-lg border px-2 py-2 text-xs font-medium ' +
                (bgType === val
                  ? 'border-brand-500 bg-brand-500/10 text-brand-300'
                  : 'border-slate-700 text-slate-300 hover:border-slate-500')
              }
            >
              {label}
            </button>
          ))}
        </div>

        {bgType === 'color' && (
          <div className="mt-3 flex items-center gap-3">
            <input
              type="color"
              value={bgColor}
              onChange={(e) => setBgColor(e.target.value)}
              className="h-9 w-12 cursor-pointer rounded border border-slate-700 bg-transparent"
            />
            <div className="flex flex-wrap gap-1">
              {['#ffffff', '#000000', '#f1f5f9', '#2b7fff', '#22c55e', '#ef4444'].map((c) => (
                <button
                  key={c}
                  onClick={() => setBgColor(c)}
                  style={{ background: c }}
                  className="h-6 w-6 rounded border border-slate-600"
                  aria-label={c}
                />
              ))}
            </div>
          </div>
        )}

        {bgType === 'image' && (
          <div className="mt-3 space-y-2">
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-600 px-3 py-3 text-xs text-slate-400 hover:border-brand-500">
              <IconUpload width={14} height={14} />
              {bgImage ? 'Cambiar imagen de fondo' : 'Subir imagen de fondo'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files[0]) onBgImageFile(Array.from(e.target.files));
                  e.target.value = '';
                }}
              />
            </label>
            {bgImage && (
              <div className="flex items-center gap-2">
                <img src={bgImage.url} alt="fondo" className="h-10 w-16 rounded object-cover" />
                <button onClick={clearBgImage} className="text-xs text-red-400 hover:underline">
                  Quitar
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Refinar bordes */}
      <div>
        <label className="mb-1 flex items-center justify-between text-xs font-medium text-slate-400">
          <span>Refinar bordes (anti-halo)</span>
          <span className="text-slate-500">{refine === 0 ? 'Off' : `Nivel ${refine}`}</span>
        </label>
        <input
          type="range"
          min="0"
          max="3"
          step="1"
          value={refine}
          onChange={(e) => setRefine(Number(e.target.value))}
          className="w-full accent-brand-500"
        />
      </div>

      {/* Redimensionar */}
      <div>
        <label className="mb-1 flex items-center justify-between text-xs font-medium text-slate-400">
          <span>Tamaño de salida</span>
          <span className="text-slate-500">{resizePct}%</span>
        </label>
        <input
          type="range"
          min="10"
          max="100"
          step="5"
          value={resizePct}
          onChange={(e) => setResizePct(Number(e.target.value))}
          className="w-full accent-brand-500"
        />
      </div>

      {/* Calidad JPG */}
      <div>
        <label className="mb-1 flex items-center justify-between text-xs font-medium text-slate-400">
          <span>Calidad JPG</span>
          <span className="text-slate-500">{Math.round(jpgQuality * 100)}%</span>
        </label>
        <input
          type="range"
          min="0.6"
          max="1"
          step="0.01"
          value={jpgQuality}
          onChange={(e) => setJpgQuality(Number(e.target.value))}
          className="w-full accent-brand-500"
        />
      </div>

      {/* Info */}
      <div className="rounded-lg bg-slate-800/60 p-3 text-xs text-slate-400">
        <div className="flex justify-between">
          <span>Resolución</span>
          <span className="text-slate-200">{dims}</span>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
          El PNG conserva la transparencia y la resolución original sin pérdida. El JPG usa fondo
          blanco (o el que elijas) a la calidad seleccionada.
        </p>
      </div>
    </div>
  );
}
