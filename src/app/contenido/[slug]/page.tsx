import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import Cover from "@/components/Cover";
import Compartir from "@/components/Compartir";
import BlockRenderer, { bloqueCompleto } from "@/components/blocks/BlockRenderer";
import { getContentBySlug, getEspeciales } from "@/lib/content/repository";
import { formatDuracion } from "@/lib/format";
import type { Block, Content } from "@/lib/types";

export async function generateMetadata(props: PageProps<"/contenido/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const contenido = await getContentBySlug(slug);
  if (!contenido) return { title: "Contenido no encontrado" };

  return {
    title: contenido.title,
    description: contenido.summary ?? contenido.subtitle ?? undefined,
    openGraph: {
      title: contenido.title,
      description: contenido.summary ?? undefined,
      images: contenido.coverUrl ? [contenido.coverUrl] : undefined,
    },
  };
}

// Página cacheada: se sirve estática y se regenera como máximo una vez por
// minuto. Un cambio hecho en el backoffice se ve en el sitio en ese margen
// (y al instante en el deploy donde corre el propio backoffice, que además
// revalida a mano). Sin esto cada visita renderizaba y consultaba la base.
export const revalidate = 60;

// Se pregeneran al compilar; las que se publiquen después se generan en la
// primera visita y quedan cacheadas igual (dynamicParams por defecto).
export async function generateStaticParams() {
  return (await getEspeciales()).map((c) => ({ slug: c.slug }));
}

export default async function PublicacionPage(props: PageProps<"/contenido/[slug]">) {
  const { slug } = await props.params;
  const contenido = await getContentBySlug(slug);
  if (!contenido) notFound();

  const especiales = await getEspeciales();
  const indice = especiales.findIndex((c) => c.slug === slug);
  const siguiente = indice >= 0 ? especiales[(indice + 1) % especiales.length] : null;

  // Un bloque al que le falta el dato principal (fotos, URL, modelo 3D)
  // todavía no está listo para mostrarse: se omite en vez de dejar un aviso
  // de "falta cargar" a la vista de cualquier visitante.
  const { destacado, resto: restoCrudo } = separarDestacado(conVideoPrincipal(contenido));
  const resto = restoCrudo.filter(bloqueCompleto);

  return (
    <div className="min-h-dvh bg-abyss">
      {/* La ficha de un especial es parte del modo Serie: el conmutador queda
          en SERIE y deja TRAZA a un clic para volver al mapa. */}
      <SiteHeader variante="solido" activo="serie" />

      <Hero contenido={contenido} />

      <main className="mx-auto max-w-6xl space-y-14 px-4 py-12 md:px-8 md:py-16">
        {/* El primer video junto al texto de apertura: la lectura arranca con
            imagen y explicación a la vez, como en una ficha de obra. */}
        {destacado && (
          <section className="grid gap-8 lg:grid-cols-[1.15fr_1fr] lg:items-start lg:gap-12">
            <BlockRenderer bloque={destacado.video} contenido={contenido} />
            <div className="lg:pt-2">
              <p className="label-tech mb-3 text-cyan">Resumen operativo</p>
              <BlockRenderer bloque={destacado.texto} contenido={contenido} />
            </div>
          </section>
        )}

        {resto.map((bloque) => (
          <section key={bloque.id}>
            <BlockRenderer bloque={bloque} contenido={contenido} />
          </section>
        ))}
      </main>

      <PieDePublicacion siguiente={siguiente} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Hero({ contenido }: { contenido: Content }) {
  const chips = [
    contenido.locationName,
    contenido.kp,
    contenido.durationSeconds ? `Video · ${formatDuracion(contenido.durationSeconds)}` : null,
  ].filter(Boolean) as string[];

  return (
    <header className="relative isolate flex min-h-[62svh] flex-col justify-end overflow-hidden md:min-h-[74svh]">
      <div className="absolute inset-0 -z-10">
        <Cover slug={contenido.slug} url={contenido.coverUrl} alt="" />
        {/* Velo generoso: cuando la portada sale de la miniatura de Vimeo suele
            traer la placa de título del video, y sin esto compite con el H1. */}
        <div className="absolute inset-0 bg-gradient-to-t from-abyss via-abyss/82 to-abyss/55" />
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 pb-12 md:px-8 md:pb-16">
        <div className="mb-4 flex items-center gap-3">
          <span className="h-px w-8 bg-cyan" />
          <span className="label-tech text-cyan">
            {contenido.locationName ?? "Traza"} · Especial
          </span>
        </div>

        <h1 className="max-w-3xl text-4xl leading-[1.05] font-bold tracking-tight text-balance text-ink md:text-6xl">
          {contenido.title}
        </h1>

        {contenido.subtitle && (
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-soft md:text-xl">
            {contenido.subtitle}
          </p>
        )}

        {chips.length > 0 && (
          <ul className="mt-7 flex flex-wrap gap-2">
            {chips.map((chip) => (
              <li
                key={chip}
                className="label-tech rounded-full border border-line bg-abyss/60 px-3 py-1.5 text-ink-soft backdrop-blur"
              >
                {chip}
              </li>
            ))}
          </ul>
        )}

        {/* Acciones: la serie a un toque y el contenido listo para compartir. */}
        <div className="mt-7 flex flex-wrap items-center gap-x-8 gap-y-4">
          <Link
            href="/serie"
            className="group flex items-center gap-2.5 rounded-full border border-cyan/40 bg-cyan/10 px-4 py-2 transition-colors hover:border-cyan/70 hover:bg-cyan/15"
          >
            <svg viewBox="0 0 14 14" className="h-3 w-3 shrink-0" aria-hidden="true">
              <path d="M3.5 2v10l8.5-5z" fill="#3e9dc7" />
            </svg>
            <span className="label-tech text-[9px] text-white">Mirá la serie</span>
            <span className="label-tech text-[9px] text-cyan transition-transform duration-200 group-hover:translate-x-0.5">
              →
            </span>
          </Link>

          <Compartir ruta={`/contenido/${contenido.slug}`} titulo={contenido.title} />
        </div>
      </div>
    </header>
  );
}

function PieDePublicacion({ siguiente }: { siguiente: Content | null }) {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 md:flex-row md:items-center md:justify-between md:px-8">
        <Link
          href="/"
          className="label-tech flex items-center gap-2 text-ink-faint transition-colors hover:text-cyan"
        >
          ← Volver a la traza
        </Link>

        {siguiente && (
          <Link href={`/contenido/${siguiente.slug}`} className="group text-right">
            <span className="label-tech block text-ink-faint">Próximo especial</span>
            <span className="mt-1 block text-lg font-bold tracking-tight text-ink transition-colors group-hover:text-cyan">
              {siguiente.title} →
            </span>
          </Link>
        )}
      </div>
    </footer>
  );
}

/**
 * Si la ficha no tiene ningún bloque de video pero el contenido sí tiene un
 * video principal cargado, ese video abre la publicación. Sin esto, el campo
 * "Video principal" del backoffice parece no hacer nada en los especiales —
 * pasó de verdad: se cargó el ID y la ficha salió sin video.
 */
function conVideoPrincipal(c: Content): Block[] {
  if (!c.vimeoId || c.blocks.some((b) => b.type === "video")) return c.blocks;
  return [
    {
      id: "video-principal",
      position: -1,
      type: "video",
      data: { vimeoId: c.vimeoId, posterUrl: c.coverUrl ?? "", caption: "" },
    },
    ...c.blocks,
  ];
}

/**
 * Si la publicación empieza con video + texto, se muestran apareados. Devuelve
 * ese par y el resto de los bloques en orden.
 */
function separarDestacado(bloques: Block[]): {
  destacado: { video: Block; texto: Block } | null;
  resto: Block[];
} {
  const [primero, segundo, ...cola] = bloques;
  if (primero?.type === "video" && segundo?.type === "text") {
    return { destacado: { video: primero, texto: segundo }, resto: cola };
  }
  return { destacado: null, resto: bloques };
}
