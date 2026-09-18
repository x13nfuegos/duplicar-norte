import type { Block, Content } from "@/lib/types";
import VimeoEmbed from "./VimeoEmbed";
import Galeria from "./Galeria";

/**
 * Si un bloque le falta el dato principal (fotos, URL, modelo 3D), todavía no
 * está listo para mostrarse a un visitante. Sirve tanto para que la página no
 * arme una `<section>` vacía como para que `BlockRenderer` no dibuje nada.
 */
export function bloqueCompleto(bloque: Block): boolean {
  switch (bloque.type) {
    case "gallery":
      return bloque.data.images.length > 0;
    case "infographic":
      return Boolean(bloque.data.url);
    case "sketchfab":
      return Boolean(bloque.data.modelId);
    default:
      return true;
  }
}

/**
 * Renderiza un bloque de una publicación.
 *
 * Cada tipo de bloque es una pieza autónoma: el backoffice los ordena y esta
 * función los dibuja. Agregar un tipo nuevo es agregar un `case` acá, una
 * entrada en `BlockType` y un formulario en el editor.
 */
export default function BlockRenderer({
  bloque,
  contenido,
}: {
  bloque: Block;
  contenido: Content;
}) {
  switch (bloque.type) {
    case "text":
      return <BloqueTexto data={bloque.data} />;

    case "video":
      return (
        <figure className="space-y-3">
          <VimeoEmbed
            vimeoId={bloque.data.vimeoId}
            posterUrl={bloque.data.posterUrl ?? contenido.coverUrl}
            slug={contenido.slug}
            titulo={contenido.title}
          />
          {bloque.data.caption && <Epigrafe>{bloque.data.caption}</Epigrafe>}
        </figure>
      );

    case "stats":
      return <BloqueCifras items={bloque.data.items} />;

    case "steps":
      return <BloquePasos heading={bloque.data.heading} items={bloque.data.items} />;

    case "gallery":
      if (!bloqueCompleto(bloque)) return null;
      return (
        <figure className="space-y-3">
          <Galeria imagenes={bloque.data.images} />
          {bloque.data.caption && <Epigrafe>{bloque.data.caption}</Epigrafe>}
        </figure>
      );

    case "infographic":
      if (!bloqueCompleto(bloque)) return null;
      // Modo "embed": la URL es una infografía interactiva que corre en un
      // iframe a todo el ancho, con el mismo marco que el modelo de Sketchfab.
      // Sin `modo` (contenido viejo) o en "imagen", la <img> de siempre.
      if (bloque.data.modo === "embed") {
        return (
          <figure className="space-y-3">
            <div className="relative aspect-[16/10] overflow-hidden rounded-xl border border-line bg-deep">
              <iframe
                title={bloque.data.alt ?? "Infografía interactiva"}
                src={bloque.data.url}
                allow="fullscreen"
                allowFullScreen
                loading="lazy"
                className="absolute inset-0 h-full w-full"
              />
            </div>
            {bloque.data.caption && <Epigrafe>{bloque.data.caption}</Epigrafe>}
          </figure>
        );
      }
      return (
        <figure className="space-y-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={bloque.data.url}
            alt={bloque.data.alt ?? ""}
            loading="lazy"
            decoding="async"
            className="w-full rounded-xl border border-line bg-deep"
          />
          {bloque.data.caption && <Epigrafe>{bloque.data.caption}</Epigrafe>}
        </figure>
      );

    case "sketchfab":
      if (!bloqueCompleto(bloque)) return null;
      return (
        <figure className="space-y-3">
          <div className="relative aspect-[16/10] overflow-hidden rounded-xl border border-line bg-deep">
            <iframe
              title={bloque.data.title ?? "Modelo 3D"}
              src={`https://sketchfab.com/models/${bloque.data.modelId}/embed?autospin=0.3&ui_theme=dark&dnt=1`}
              allow="autoplay; fullscreen; xr-spatial-tracking"
              allowFullScreen
              loading="lazy"
              className="absolute inset-0 h-full w-full"
            />
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            {bloque.data.caption && <Epigrafe>{bloque.data.caption}</Epigrafe>}
            <span className="label-tech text-[9px] text-ink-faint">Modelo 3D · Sketchfab</span>
          </div>
        </figure>
      );

    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */

function BloqueTexto({ data }: { data: { heading?: string; body: string } }) {
  return (
    <div className="space-y-4">
      {data.heading && (
        <h2 className="text-2xl leading-tight font-bold tracking-tight text-balance text-ink md:text-3xl">
          {data.heading}
        </h2>
      )}
      {data.body
        .split(/\n{2,}/)
        .filter(Boolean)
        .map((parrafo, i) => (
          <p key={i} className="text-[15px] leading-relaxed text-ink-soft">
            {resaltarNegritas(parrafo)}
          </p>
        ))}
    </div>
  );
}

/**
 * Convierte `**texto**` en negrita. Un markdown completo sería excesivo para
 * lo que necesitan estas publicaciones: párrafos con algún énfasis.
 */
function resaltarNegritas(texto: string): React.ReactNode[] {
  return texto.split(/(\*\*[^*]+\*\*)/g).map((parte, i) =>
    parte.startsWith("**") && parte.endsWith("**") ? (
      <strong key={i} className="font-bold text-ink">
        {parte.slice(2, -2)}
      </strong>
    ) : (
      <span key={i}>{parte}</span>
    ),
  );
}

function BloqueCifras({ items }: { items: { label: string; value: string; unit?: string }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3">
      {items.map((item) => (
        <div key={item.label} className="bg-surface px-5 py-5">
          <dt className="label-tech mb-2 text-ink-faint">{item.label}</dt>
          <dd className="flex items-baseline gap-1">
            <span className="text-3xl leading-none font-bold tracking-tight text-cyan md:text-4xl">
              {item.value}
            </span>
            {item.unit && <span className="label-tech text-ink-soft">{item.unit}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function BloquePasos({
  heading,
  items,
}: {
  heading?: string;
  items: { title: string; body: string }[];
}) {
  return (
    <div className="space-y-4">
      {heading && (
        <h2 className="text-xl font-bold tracking-tight text-ink md:text-2xl">{heading}</h2>
      )}
      <ol className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
        {items.map((paso, i) => (
          <li key={paso.title} className="panel flex flex-col gap-1.5 p-4">
            <span className="label-tech text-cyan">{String(i + 1).padStart(2, "0")}</span>
            <h3 className="text-sm font-bold text-ink">{paso.title}</h3>
            <p className="text-[12.5px] leading-relaxed text-ink-soft">{paso.body}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Epigrafe({ children }: { children: React.ReactNode }) {
  return <figcaption className="text-[12.5px] text-ink-faint">{children}</figcaption>;
}
