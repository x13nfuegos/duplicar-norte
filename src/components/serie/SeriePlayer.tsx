"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Player from "@vimeo/player";
import Cover from "@/components/Cover";
import Compartir from "@/components/Compartir";
import BotonPantallaCompleta from "@/components/BotonPantallaCompleta";
import { track } from "@/lib/analytics/client";
import { vimeoEmbedUrl } from "@/lib/vimeo";
import { especialRelacionado } from "@/lib/content/sugerencias";
import type { Content } from "@/lib/types";

interface Props {
  simples: Content[];
  especiales: Content[];
  slugInicial: string;
}

/**
 * Reproductor de la serie: un visualizador grande y, al costado, la lista de
 * contenidos.
 *
 * La lista es finita —los diez contenidos, una vez— pero la reproducción sí
 * encadena: al terminar un video sigue el próximo liberado, salteando los que
 * están bloqueados, y al llegar al último vuelve al primero.
 */
export default function SeriePlayer({ simples, especiales, slugInicial }: Props) {
  const disponibles = useMemo(() => simples.filter((s) => !s.locked), [simples]);

  const [actual, setActual] = useState<Content>(() => {
    const pedido = simples.find((s) => s.slug === slugInicial && !s.locked);
    return pedido ?? disponibles[0] ?? simples[0];
  });

  const [reproduciendo, setReproduciendo] = useState(false);
  const [progreso, setProgreso] = useState(0);

  const iframe = useRef<HTMLIFrameElement>(null);
  const marco = useRef<HTMLDivElement>(null);
  const lista = useRef<HTMLDivElement>(null);

  const especial = especialRelacionado(actual, especiales);

  /* ---------------- Cambio de video ---------------- */

  const irA = useCallback((c: Content) => {
    if (c.locked) return;
    setActual(c);
    setProgreso(0);
    window.history.replaceState(null, "", `/serie/${c.slug}`);
  }, []);

  const siguiente = useCallback(() => {
    const i = disponibles.findIndex((s) => s.id === actual.id);
    const proximo = disponibles[(i + 1) % disponibles.length];
    if (proximo) irA(proximo);
  }, [disponibles, actual, irA]);

  const anterior = useCallback(() => {
    const i = disponibles.findIndex((s) => s.id === actual.id);
    const previo = disponibles[(i - 1 + disponibles.length) % disponibles.length];
    if (previo) irA(previo);
  }, [disponibles, actual, irA]);

  /* ---------------- Reproductor ---------------- */

  useEffect(() => {
    setProgreso(0);
    if (!reproduciendo || !iframe.current) return;

    const p = new Player(iframe.current);
    p.on("timeupdate", ({ percent }) => setProgreso(percent));
    p.on("ended", () => siguiente());

    return () => {
      p.off("timeupdate");
      p.off("ended");
      p.unload().catch(() => {});
    };
  }, [actual.id, reproduciendo, siguiente]);

  // Un play por cada video que arranca, incluidos los que encadena solo.
  useEffect(() => {
    if (reproduciendo) track("video_play", { slug: actual.slug, origen: "serie" });
  }, [reproduciendo, actual.slug]);

  /* ---------------- Teclado ---------------- */

  useEffect(() => {
    const alTecla = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowDown" || e.key === "ArrowRight") siguiente();
      if (e.key === "ArrowUp" || e.key === "ArrowLeft") anterior();
    };
    window.addEventListener("keydown", alTecla);
    return () => window.removeEventListener("keydown", alTecla);
  }, [siguiente, anterior]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 py-4 md:px-8 lg:flex-row lg:gap-8 lg:overflow-hidden">
      {/* Visualizador */}
      <div className="flex min-w-0 flex-col lg:flex-1 lg:justify-center">
        {/* Pantalla completa: botón propio sobre el marco — el de Vimeo, ante
            cualquier rechazo del navegador, cae a un modo interno que no se
            nota y parece roto. */}
        <div
          ref={marco}
          className="relative aspect-video w-full overflow-hidden rounded-xl border border-line bg-black"
        >
          {reproduciendo && <BotonPantallaCompleta objetivo={marco} />}
          {reproduciendo && actual.vimeoId ? (
            <iframe
              ref={iframe}
              key={actual.slug}
              src={vimeoEmbedUrl(actual.vimeoId, { autoplay: true })}
              title={actual.title}
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 h-full w-full"
            />
          ) : (
            <button
              type="button"
              onClick={() => setReproduciendo(true)}
              className="group absolute inset-0"
              aria-label={`Reproducir ${actual.title}`}
            >
              <Cover slug={actual.slug} url={actual.coverUrl} alt="" />
              <span className="absolute inset-0 bg-abyss/30" />
              <span className="absolute inset-0 grid place-items-center">
                <span className="grid h-16 w-16 place-items-center rounded-full border border-white/30 bg-white/15 backdrop-blur transition-transform group-hover:scale-110">
                  <svg viewBox="0 0 16 16" className="ml-1 h-6 w-6 fill-white">
                    <path d="M4 2.5v11l9.5-5.5z" />
                  </svg>
                </span>
              </span>
            </button>
          )}

        </div>

        <div className="mt-3 h-0.5 w-full overflow-hidden rounded-full bg-line">
          <div
            className="h-full bg-cyan transition-[width] duration-300"
            style={{ width: `${Math.round(progreso * 100)}%` }}
          />
        </div>

        <div className="mt-4 flex items-start justify-between gap-6">
          <div className="min-w-0">
            <p className="label-tech mb-1.5 text-cyan">
              Serie{actual.locationName ? ` · ${actual.locationName}` : ""}
            </p>
            <h1 className="text-2xl leading-tight font-bold tracking-tight text-balance text-ink md:text-3xl">
              {actual.title}
            </h1>
            {actual.summary && (
              <p className="mt-2 max-w-xl text-[14px] leading-relaxed font-normal text-ink-soft">
                {actual.summary}
              </p>
            )}
          </div>

          <div className="flex shrink-0 flex-col items-end gap-3">
            <div className="flex gap-2">
              <BotonNav etiqueta="Anterior" onClick={anterior} direccion="arriba" />
              <BotonNav etiqueta="Siguiente" onClick={siguiente} direccion="abajo" />
            </div>
            {/* Comparte el video que se está viendo: el link entra directo a
                la playlist parada en este capítulo. */}
            <Compartir ruta={`/serie/${actual.slug}`} titulo={actual.title} />
          </div>
        </div>

        {/* Puente a los especiales: debajo del video, siempre visible. */}
        {especial && (
          <Link
            href={`/contenido/${especial.slug}`}
            className="group mt-5 flex items-center gap-4 rounded-xl border border-cyan/30 bg-cyan/10 px-4 py-3.5 transition-colors hover:border-cyan/60 hover:bg-cyan/15"
          >
            <span className="relative grid h-9 w-9 shrink-0 place-items-center">
              <span
                className="absolute h-4 w-4 rounded-full border border-cyan/80"
                style={{ animation: "radar 3.2s cubic-bezier(0.22,1,0.36,1) infinite" }}
              />
              <span className="relative h-4 w-4 rounded-full border border-cyan bg-cyan/60" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="label-tech block text-[9px] text-cyan">
                Seguí explorando · contenido especial
              </span>
              <span className="mt-0.5 block truncate text-[14px] font-bold text-ink">
                {especial.title}
                {especial.locationName ? (
                  <span className="font-normal text-ink-soft"> · {especial.locationName}</span>
                ) : null}
              </span>
            </span>
            <span className="label-tech shrink-0 text-cyan transition-transform duration-200 group-hover:translate-x-0.5">
              Ver →
            </span>
          </Link>
        )}
      </div>

      {/* Barra de contenidos, corriendo sin fin */}
      <aside className="flex min-h-0 flex-col lg:w-[336px]">
        <p className="label-tech mb-2.5 shrink-0 text-ink-faint">A continuación</p>

        <div ref={lista} className="no-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
          {simples.map((c, i) => (
            <ItemLista
              key={c.id}
              contenido={c}
              numero={i + 1}
              esActual={c.id === actual.id}
              onElegir={() => irA(c)}
            />
          ))}
        </div>

      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ItemLista({
  contenido,
  numero,
  esActual,
  onElegir,
}: {
  contenido: Content;
  numero: number;
  esActual: boolean;
  onElegir: () => void;
}) {
  const bloqueado = contenido.locked;

  return (
    <button
      type="button"
      onClick={onElegir}
      disabled={bloqueado}
      aria-current={esActual ? "true" : undefined}
      className={`flex w-full items-center gap-2.5 rounded-lg border p-1.5 text-left transition-colors ${
        esActual
          ? "border-cyan/40 bg-cyan/10"
          : bloqueado
            ? "cursor-default border-transparent opacity-55"
            : "border-transparent hover:border-line hover:bg-white/[0.03]"
      }`}
    >
      <span
        className={`label-tech w-4 shrink-0 text-center text-[9px] ${
          esActual ? "text-cyan" : "text-ink-faint"
        }`}
      >
        {String(numero).padStart(2, "0")}
      </span>

      <span className="relative h-10 w-[68px] shrink-0 overflow-hidden rounded border border-line">
        <Cover
          slug={contenido.slug}
          url={contenido.coverUrl}
          alt=""
          className={bloqueado ? "grayscale" : ""}
          tamanoVimeo="295x166"
        />
      </span>

      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-[12.5px] ${
            esActual ? "font-bold text-cyan" : bloqueado ? "text-ink-faint" : "text-ink"
          }`}
        >
          {contenido.title}
        </span>
        <span className="label-tech mt-0.5 block text-[9px] text-ink-faint">
          {bloqueado ? "Próximamente" : (contenido.locationName ?? "Serie")}
        </span>
      </span>
    </button>
  );
}

function BotonNav({
  etiqueta,
  onClick,
  direccion,
}: {
  etiqueta: string;
  onClick: () => void;
  direccion: "arriba" | "abajo";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={etiqueta}
      title={etiqueta}
      className="grid h-10 w-10 place-items-center rounded-full border border-line text-ink-soft transition-colors hover:border-cyan/50 hover:text-cyan"
    >
      <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path
          d={direccion === "arriba" ? "M3 10l5-5 5 5" : "M3 6l5 5 5-5"}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
