"use client";

import { useRef, useState } from "react";
import Cover from "@/components/Cover";
import BotonPantallaCompleta from "@/components/BotonPantallaCompleta";
import { track } from "@/lib/analytics/client";
import { vimeoEmbedUrl } from "@/lib/vimeo";

interface Props {
  vimeoId: string;
  posterUrl?: string | null;
  /** Para el degradado de respaldo cuando no hay póster. */
  slug: string;
  titulo?: string;
}

/**
 * Reproductor con carga diferida.
 *
 * El iframe de Vimeo pesa y trae su propio JS; montarlo de entrada en una
 * publicación con varios videos hace lenta la página. Hasta que el usuario
 * aprieta play mostramos solo el póster.
 */
export default function VimeoEmbed({ vimeoId, posterUrl, slug, titulo }: Props) {
  const [activo, setActivo] = useState(false);
  const marco = useRef<HTMLDivElement>(null);

  if (activo) {
    return (
      <div
        ref={marco}
        className="relative aspect-video w-full overflow-hidden rounded-xl border border-line bg-black"
      >
        <BotonPantallaCompleta objetivo={marco} />
        <iframe
          src={vimeoEmbedUrl(vimeoId, { autoplay: true })}
          title={titulo ?? "Video"}
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 h-full w-full"
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        track("video_play", { slug, origen: "ficha" });
        setActivo(true);
      }}
      aria-label={titulo ? `Reproducir ${titulo}` : "Reproducir video"}
      className="group relative block aspect-video w-full overflow-hidden rounded-xl border border-line bg-deep outline-none focus-visible:border-cyan"
    >
      <Cover slug={slug} url={posterUrl} alt="" className="opacity-90" />
      <span className="absolute inset-0 bg-gradient-to-t from-abyss/70 via-transparent to-abyss/20" />
      <span className="absolute inset-0 grid place-items-center">
        <span className="grid h-16 w-16 place-items-center rounded-full border border-white/30 bg-white/15 backdrop-blur-sm transition-transform duration-300 group-hover:scale-110">
          <svg viewBox="0 0 16 16" className="ml-1 h-6 w-6 fill-white">
            <path d="M4 2.5v11l9.5-5.5z" />
          </svg>
        </span>
      </span>
    </button>
  );
}
