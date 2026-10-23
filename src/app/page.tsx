import SiteHeader from "@/components/SiteHeader";
import MapaCliente from "@/components/map/MapaCliente";
import ContentDrawer from "@/components/rail/ContentDrawer";
import IntroGate from "@/components/intro/IntroGate";
import { getEspeciales, getSimples } from "@/lib/content/repository";
import { isMapped, type Rail } from "@/lib/types";
import { getTraza } from "@/lib/traza-server";

// Página cacheada: se sirve estática y se regenera como máximo una vez por
// minuto. Un cambio hecho en el backoffice se ve en el sitio en ese margen
// (y al instante en el deploy donde corre el propio backoffice, que además
// revalida a mano). Sin esto cada visita renderizaba y consultaba la base.
export const revalidate = 60;

export default async function Home() {
  const [especiales, simples] = await Promise.all([getEspeciales(), getSimples()]);
  const traza = getTraza();

  // Al mapa van solo los especiales: los simples se consumen en la serie, y
  // mezclarlos sobre la traza confundía qué era qué.
  const enMapa = especiales.filter(isMapped);

  // El carrusel se arma solo con lo publicado: primero TODOS los especiales y
  // después los simples, cada grupo según su campo "Orden" del backoffice.
  // Publicar alcanza para aparecer — no hay que sumar nada a mano a una fila.
  const items = [...especiales].sort((a, b) => a.orderIndex - b.orderIndex).concat(simples);
  const rails: Rail[] =
    items.length > 0
      ? [{ id: "catalogo", slug: "catalogo", title: "Novedades del proyecto", orderIndex: 0, items }]
      : [];

  return (
    <div className="relative h-dvh overflow-hidden">
      <MapaCliente contenidos={enMapa} traza={traza.lineas} />
      <SiteHeader activo="traza" conFicha />
      <ContentDrawer rails={rails} />
      {/* La intro se reproduce por encima; el mapa carga mientras tanto y al
          salir ya está listo: la transición final es inmediata. */}
      <IntroGate />
    </div>
  );
}
