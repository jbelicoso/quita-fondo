import React, { useRef, useState, useCallback, useEffect } from 'react';

/**
 * Comparador antes/después con un divisor arrastrable.
 * - `before`: URL de la imagen original.
 * - `after` : URL del resultado (con transparencia -> se muestra sobre tablero).
 *
 * @param {string} props.before
 * @param {string} props.after
 */
export default function CompareSlider({ before, after }) {
  const containerRef = useRef(null);
  const [pos, setPos] = useState(50); // porcentaje 0..100
  const dragging = useRef(false);

  const move = useCallback((clientX) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = Math.min(Math.max(clientX - rect.left, 0), rect.width);
    setPos((x / rect.width) * 100);
  }, []);

  useEffect(() => {
    const onMove = (e) => {
      if (!dragging.current) return;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      move(clientX);
    };
    const onUp = () => (dragging.current = false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchend', onUp);
    };
  }, [move]);

  return (
    <div
      ref={containerRef}
      className="relative w-full select-none overflow-hidden rounded-xl border border-slate-800"
      style={{ touchAction: 'none' }}
    >
      {/* Después (debajo, ocupa todo) sobre tablero de transparencia */}
      <div className="checkerboard">
        <img src={after} alt="Después" className="block w-full" draggable={false} />
      </div>

      {/* Antes (encima, recortado con clip-path según el divisor) */}
      <div
        className="absolute inset-0"
        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
      >
        <img
          src={before}
          alt="Antes"
          className="block w-full h-full object-cover"
          draggable={false}
        />
      </div>

      {/* Etiquetas */}
      <span className="pointer-events-none absolute left-3 top-3 rounded bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
        Antes
      </span>
      <span className="pointer-events-none absolute right-3 top-3 rounded bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
        Después
      </span>

      {/* Divisor arrastrable */}
      <div
        className="absolute top-0 bottom-0 z-10 w-0.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.3)]"
        style={{ left: `${pos}%` }}
      >
        <button
          type="button"
          onMouseDown={() => (dragging.current = true)}
          onTouchStart={() => (dragging.current = true)}
          className="absolute top-1/2 left-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full bg-white text-slate-800 shadow-soft"
          aria-label="Mover comparador"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" transform="translate(-3 0)" />
            <polyline points="9 6 15 12 9 18" transform="translate(3 0)" />
          </svg>
        </button>
      </div>
    </div>
  );
}
