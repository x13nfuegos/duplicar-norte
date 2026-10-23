"use client";

import Link from "next/link";
import Cover from "@/components/Cover";
import { hrefDeContenido } from "@/components/rail/ContentCard";
import type { MappedContent } from "@/lib/types";

interface Props {
  contenido: MappedContent;
  /** Posición del punto en píxeles de pantalla, ya proyectada por el mapa. */
  x: number;
  y: number;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

const ANCHO = 284;

/**
 * Ficha que asoma al posar el mouse sobre un punto de la traza.
 *
 * Sin botones: la tarjeta entera es el enlace. Se ancla al punto y se voltea
 * sola cuando quedaría fuera del viewport.
 */
export default function MapHoverCard({ contenido, x, y, onMouseEnter, onMouseLeave }: Props) {
  const ancho = typeof window !== "undefined" ? window.innerWidth : 1280;
  const alto = typeof window !== "undefined" ? window.innerHeight : 800;

  // Si el punto está muy a la derecha o muy abajo, la tarjeta cambia de lado.
  const haciaIzquierda = x + ANCHO / 2 + 24 > ancho;
  const haciaDerecha = x - ANCHO / 2 - 24 < 0;
  const debajo = y < 300;

  const left = haciaIzquierda ? x - ANCHO - 18 : haciaDerecha ? x + 18 : x - ANCHO / 2;
  const top = debajo ? y + 22 : undefined;
  const bottom = debajo ? undefined : alto - y + 22;

  const esEspecial = contenido.type === "especial";
  const bloqueado = contenido.locked;

  const cuerpo = (
    <>
      <div className="relative aspect-video">
        <Cover
          slug={contenido.slug}
          url={contenido.coverUrl}
          alt={contenido.title}
          className={bloqueado ? "grayscale" : ""}
          etiqueta={contenido.locationName}
          tamanoVimeo="640"
        />
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-abyss/95 to-transparent" />
        {contenido.kp && !bloqueado && (
          <span className="label-tech absolute top-2.5 left-2.5 rounded bg-abyss/80 px-2 py-1 text-[9px] text-cyan">
            {contenido.kp}
          </span>
        )}
      </div>

      <div className="space-y-1.5 p-3.5">
        <p className={`label-tech ${bloqueado ? "text-ink-faint" : esEspecial ? "text-cyan" : "text-gris"}`}>
          {bloqueado ? "Próximamente" : esEspecial ? "Especial" : "Serie"}
        </p>
        <h3 className="text-[15px] leading-snug font-bold text-ink">{contenido.title}</h3>
        {contenido.summary && (
          <p className="line-clamp-3 text-[12.5px] leading-relaxed font-normal text-ink-soft">
            {contenido.summary}
          </p>
        )}
      </div>
    </>
  );

  return (
    <div
      className="aparece pointer-events-auto absolute z-30"
      style={{ left, top, bottom, width: ANCHO }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="glass overflow-hidden">
        {bloqueado ? (
          <div className="opacity-80">{cuerpo}</div>
        ) : (
          <Link href={hrefDeContenido(contenido)} className="block">
            {cuerpo}
          </Link>
        )}
      </div>
    </div>
  );
}
