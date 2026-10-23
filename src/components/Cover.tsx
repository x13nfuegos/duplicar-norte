import { gradienteDeSlug } from "@/lib/format";

interface Props {
  slug: string;
  url?: string | null;
  alt?: string;
  className?: string;
  /** Texto corto sobre el fondo generado, cuando no hay imagen. */
  etiqueta?: string | null;
  /**
   * Tamaño a pedirle a Vimeo ("640", "295x166"...) cuando la portada sale de su
   * CDN. Sin esto una tarjeta de 244 px baja la miniatura de 1280 px (140 KB)
   * en vez de la de 640 px (40 KB).
   */
  tamanoVimeo?: string;
}

/** Cambia el tamaño de una miniatura de Vimeo; cualquier otra URL queda igual. */
function conTamano(url: string, tamano?: string): string {
  if (!tamano) return url;
  return url.replace(/(i\.vimeocdn\.com\/video\/[^?]*?)-d_\d+(?:x\d+)?/, `$1-d_${tamano}`);
}

/**
 * Portada de un contenido.
 *
 * Cuando todavía no se cargó imagen —el caso normal mientras se está armando
 * una publicación— dibuja un fondo generado a partir del slug con una trama de
 * curvas de nivel. Se prefiere eso a un rectángulo vacío: la grilla del
 * carrusel mantiene su ritmo visual y nada parece roto.
 *
 * Se usa `<img>` y no `next/image` a propósito: las portadas vienen de
 * Supabase Storage o de URLs externas que el backoffice define en runtime, y
 * `next/image` exigiría declarar cada host en `next.config`.
 */
export default function Cover({
  slug,
  url,
  alt = "",
  className = "",
  etiqueta,
  tamanoVimeo,
}: Props) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={conTamano(url, tamanoVimeo)}
        alt={alt}
        loading="lazy"
        decoding="async"
        className={`h-full w-full object-cover ${className}`}
      />
    );
  }

  return (
    <div
      className={`relative h-full w-full overflow-hidden ${className}`}
      style={{ background: gradienteDeSlug(slug) }}
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
    >
      <TramaTopografica />
      {etiqueta && (
        <span className="label-tech absolute bottom-3 left-3 text-[9px] text-ink-faint">
          {etiqueta}
        </span>
      )}
    </div>
  );
}

function TramaTopografica() {
  return (
    <svg
      className="absolute inset-0 h-full w-full opacity-[0.18]"
      viewBox="0 0 240 135"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <g fill="none" stroke="#4ecdf5" strokeWidth="0.6">
        <path d="M-10 96c40-26 70 12 108-8s62-40 152-22" />
        <path d="M-10 78c44-24 74 10 112-10s58-36 148-18" />
        <path d="M-10 60c48-22 78 8 116-12s54-32 144-14" />
        <path d="M-10 42c52-20 82 6 120-14s50-28 140-10" />
        <path d="M-10 114c36-28 66 14 104-6s66-44 156-26" />
      </g>
    </svg>
  );
}
