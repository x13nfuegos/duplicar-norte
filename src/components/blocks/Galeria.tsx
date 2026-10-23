"use client";

import { useCallback, useEffect, useState } from "react";
import { track } from "@/lib/analytics/client";

interface Props {
  imagenes: { url: string; alt?: string }[];
}

/** Galería con visor a pantalla completa y navegación por teclado. */
export default function Galeria({ imagenes }: Props) {
  const [abierta, setAbierta] = useState<number | null>(null);

  const mover = useCallback(
    (delta: number) => {
      setAbierta((i) => (i === null ? null : (i + delta + imagenes.length) % imagenes.length));
    },
    [imagenes.length],
  );

  useEffect(() => {
    if (abierta === null) return;
    const alTecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierta(null);
      if (e.key === "ArrowRight") mover(1);
      if (e.key === "ArrowLeft") mover(-1);
    };
    window.addEventListener("keydown", alTecla);
    return () => window.removeEventListener("keydown", alTecla);
  }, [abierta, mover]);

  return (
    <>
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3">
        {imagenes.map((img, i) => (
          <button
            key={img.url + i}
            type="button"
            onClick={() => {
              track("gallery_open");
              setAbierta(i);
            }}
            className="group relative aspect-[4/3] overflow-hidden rounded-lg border border-line outline-none focus-visible:border-cyan"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={img.url}
              alt={img.alt ?? ""}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          </button>
        ))}
      </div>

      {abierta !== null && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-abyss/95 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={() => setAbierta(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imagenes[abierta].url}
            alt={imagenes[abierta].alt ?? ""}
            className="max-h-[85vh] max-w-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />

          <button
            type="button"
            onClick={() => setAbierta(null)}
            aria-label="Cerrar"
            className="label-tech absolute top-5 right-5 rounded-full border border-line bg-abyss/80 px-3.5 py-2 text-ink-soft hover:text-ink"
          >
            Cerrar ✕
          </button>

          <div className="absolute inset-x-0 bottom-6 flex items-center justify-center gap-3">
            <BotonVisor etiqueta="Anterior" onClick={(e) => { e.stopPropagation(); mover(-1); }}>‹</BotonVisor>
            <span className="label-tech text-ink-faint">
              {abierta + 1} / {imagenes.length}
            </span>
            <BotonVisor etiqueta="Siguiente" onClick={(e) => { e.stopPropagation(); mover(1); }}>›</BotonVisor>
          </div>
        </div>
      )}
    </>
  );
}

function BotonVisor({
  children,
  onClick,
  etiqueta,
}: {
  children: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
  etiqueta: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={etiqueta}
      className="grid h-9 w-9 place-items-center rounded-full border border-line bg-abyss/80 text-lg text-ink-soft hover:border-cyan/50 hover:text-cyan"
    >
      {children}
    </button>
  );
}
