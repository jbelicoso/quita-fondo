import React, { useCallback, useRef, useState } from 'react';
import { IconUpload } from './Icons.jsx';

/**
 * Zona de arrastrar y soltar + selección de archivos.
 * Admite múltiples imágenes (procesamiento por lotes).
 *
 * @param {(files: File[]) => void} props.onFiles
 */
export default function Dropzone({ onFiles }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const handleFiles = useCallback(
    (list) => {
      const files = Array.from(list || []);
      if (files.length) onFiles(files);
    },
    [onFiles]
  );

  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      className={
        'group cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition ' +
        (dragging
          ? 'border-brand-400 bg-brand-500/10'
          : 'border-slate-700 bg-slate-900/40 hover:border-brand-500 hover:bg-slate-900/70')
      }
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = ''; // permite volver a subir el mismo archivo
        }}
      />
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-500/15 text-brand-400 group-hover:scale-105 transition">
        <IconUpload width={28} height={28} />
      </div>
      <p className="mt-4 text-lg font-semibold text-slate-100">
        Arrastra tus imágenes aquí
      </p>
      <p className="mt-1 text-sm text-slate-400">
        o haz clic para seleccionar · JPG, PNG o WEBP · hasta 20 MB · varias a la vez
      </p>
    </div>
  );
}
