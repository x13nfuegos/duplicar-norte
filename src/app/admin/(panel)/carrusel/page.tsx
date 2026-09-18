import { listarContenidos, listarFilas } from "@/lib/content/admin";
import EditorCarrusel from "./EditorCarrusel";

export default async function CarruselPage() {
  const [filas, contenidos] = await Promise.all([listarFilas(), listarContenidos()]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 md:px-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-ink">Carrusel</h1>
        <p className="mt-3 max-w-2xl rounded-lg border border-amber/40 bg-amber/10 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-amber">
          Esta pantalla ya no tiene efecto en el sitio: el carrusel de la home ahora se arma solo,
          con todo lo publicado (especiales y simples), ordenado por el campo{" "}
          <strong>&quot;Orden&quot;</strong> de cada contenido. Para cambiar qué aparece o en qué
          orden, editá ese campo desde &quot;Contenidos&quot; — organizar filas acá no cambia nada
          en el sitio.
        </p>
      </header>

      <EditorCarrusel filas={filas} contenidos={contenidos} />
    </main>
  );
}
