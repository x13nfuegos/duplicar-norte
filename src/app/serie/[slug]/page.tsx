import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import SeriePlayer from "@/components/serie/SeriePlayer";
import { getEspeciales, getSimples } from "@/lib/content/repository";

export async function generateMetadata(props: PageProps<"/serie/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const simples = await getSimples();
  const actual = simples.find((s) => s.slug === slug);
  if (!actual) return { title: "Serie" };

  return {
    title: actual.title,
    description: actual.summary ?? undefined,
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
  return (await getSimples()).map((s) => ({ slug: s.slug }));
}

export default async function SerieItemPage(props: PageProps<"/serie/[slug]">) {
  const { slug } = await props.params;
  const [simples, especiales] = await Promise.all([getSimples(), getEspeciales()]);

  if (!simples.some((s) => s.slug === slug)) notFound();

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-abyss">
      <SiteHeader activo="serie" variante="solido" />
      <SeriePlayer simples={simples} especiales={especiales} slugInicial={slug} />
    </div>
  );
}
