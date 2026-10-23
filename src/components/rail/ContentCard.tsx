import Link from "next/link";
import Cover from "@/components/Cover";
import type { Content } from "@/lib/types";

interface Props {
  contenido: Content;
  /** Destaca la primera tarjeta de la fila de novedades. */
  destacado?: boolean;
}

/** Ruta de consumo según el tipo: playlist de la serie o ficha del especial. */
export function hrefDeContenido(c: Content): string {
  return c.type === "simple" ? `/serie/${c.slug}` : `/contenido/${c.slug}`;
}

/**
 * Tarjeta del carrusel.
 *
 * Solo miniatura y una sinopsis de dos renglones: la portada ya lleva el título
 * quemado en el primer frame, y la ficha técnica se lee en el reproductor.
 *
 * Un contenido bloqueado se muestra en blanco y negro con la leyenda
 * "Próximamente" y no navega a ningún lado: existe para anticipar lo que viene.
 */
export default function ContentCard({ contenido, destacado = false }: Props) {
  const bloqueado = contenido.locked;

  const cuerpo = (
    <>
      <div className="relative aspect-video overflow-hidden">
        <Cover
          slug={contenido.slug}
          url={contenido.coverUrl}
          alt={contenido.title}
          className={`transition-transform duration-500 ${
            bloqueado ? "grayscale" : "group-hover:scale-[1.04]"
          }`}
          etiqueta={contenido.locationName}
          tamanoVimeo="640"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-abyss/85 via-transparent to-transparent" />

        {bloqueado ? (
          <span className="label-tech absolute top-2.5 left-2.5 rounded bg-abyss/85 px-2 py-1 text-[9px] text-ink-faint">
            Próximamente
          </span>
        ) : destacado ? (
          <span className="label-tech absolute top-2.5 left-2.5 flex items-center gap-1.5 rounded bg-abyss/85 px-2 py-1 text-[9px] text-mint">
            <span className="h-1.5 w-1.5 rounded-full bg-mint" />
            Nuevo
          </span>
        ) : (
          contenido.kp && (
            <span className="label-tech absolute top-2.5 left-2.5 rounded bg-abyss/80 px-2 py-1 text-[9px] text-cyan">
              {contenido.kp}
            </span>
          )
        )}

        {!bloqueado && contenido.vimeoId && (
          <span className="absolute right-2.5 bottom-2.5 grid h-8 w-8 place-items-center rounded-full bg-abyss/70 opacity-0 backdrop-blur transition-opacity duration-300 group-hover:opacity-100">
            <svg viewBox="0 0 16 16" className="ml-0.5 h-3.5 w-3.5 fill-ink">
              <path d="M4 2.5v11l9.5-5.5z" />
            </svg>
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col px-3.5 py-3">
        <p
          className={`line-clamp-2 min-h-[2.6em] text-[13px] leading-relaxed ${
            bloqueado ? "text-ink-faint" : "text-ink"
          }`}
        >
          {contenido.summary ?? contenido.title}
        </p>
      </div>
    </>
  );

  // Negro al 35% con blur en vez del panel azulado: sobre el satélite las
  // tarjetas se empastaban con el fondo.
  const base =
    "group relative flex shrink-0 flex-col overflow-hidden rounded-[14px] border border-white/15 bg-black/35 backdrop-blur-xl transition-[transform,border-color] duration-300 outline-none";

  if (bloqueado) {
    return (
      <div
        aria-label={`${contenido.title} — próximamente`}
        className={`${base} cursor-default opacity-70`}
        style={{ width: "min(66vw, 244px)" }}
      >
        {cuerpo}
      </div>
    );
  }

  return (
    <Link
      href={hrefDeContenido(contenido)}
      className={`${base} hover:-translate-y-1 hover:border-cyan/45 focus-visible:border-cyan focus-visible:ring-2 focus-visible:ring-cyan/40`}
      // Todas del mismo tamaño: lo que distingue a la primera es la chapa
      // "Nuevo", no el ancho.
      style={{ width: "min(66vw, 244px)" }}
    >
      {cuerpo}
    </Link>
  );
}
