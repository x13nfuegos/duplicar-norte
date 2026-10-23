import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import SeriePlayer from "@/components/serie/SeriePlayer";
import { getEspeciales, getSimples } from "@/lib/content/repository";
import SerieVacia from "./SerieVacia";

export const metadata: Metadata = {
  title: "Serie",
  description:
    "Videos cortos sobre cómo se construye el Programa Duplicar Norte, uno atrás del otro.",
};

// Página cacheada: se sirve estática y se regenera como máximo una vez por
// minuto. Un cambio hecho en el backoffice se ve en el sitio en ese margen
// (y al instante en el deploy donde corre el propio backoffice, que además
// revalida a mano). Sin esto cada visita renderizaba y consultaba la base.
export const revalidate = 60;

export default async function SeriePage() {
  const [simples, especiales] = await Promise.all([getSimples(), getEspeciales()]);
  if (simples.length === 0) return <SerieVacia />;

  const primerLibre = simples.find((s) => !s.locked) ?? simples[0];

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-abyss">
      <SiteHeader activo="serie" variante="solido" />
      <SeriePlayer simples={simples} especiales={especiales} slugInicial={primerLibre.slug} />
    </div>
  );
}
