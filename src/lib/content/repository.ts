import "server-only";

import { cache } from "react";
import { createPublicClient } from "@/lib/supabase/public";
import type { Block, Content, ContentStatus, ContentType, Rail } from "@/lib/types";
import { isMapped, type MappedContent } from "@/lib/types";
import { completarDesdeVimeo } from "@/lib/vimeo-server";
import { SEED_CONTENIDOS, SEED_RAILS } from "./seed";

/**
 * Única puerta de acceso a los contenidos.
 *
 * Si Supabase está configurado y responde, manda la base. Si no está
 * configurado, o si la consulta falla (típicamente porque todavía no se
 * corrieron las migraciones), cae al seed y lo avisa por consola. El sitio
 * nunca queda en blanco por un problema de datos.
 */

interface ContentRow {
  id: string;
  slug: string;
  type: ContentType;
  status: ContentStatus;
  locked: boolean | null;
  title: string;
  subtitle: string | null;
  summary: string | null;
  cover_url: string | null;
  vimeo_id: string | null;
  duration_seconds: number | null;
  location_name: string | null;
  kp: string | null;
  lat: number | null;
  lng: number | null;
  tags: string[] | null;
  order_index: number | null;
  published_at: string | null;
  content_blocks?: BlockRow[] | null;
}

interface BlockRow {
  id: string;
  type: Block["type"];
  position: number;
  data: Record<string, unknown> | null;
}

const CONTENT_SELECT =
  "id, slug, type, status, locked, title, subtitle, summary, cover_url, vimeo_id, duration_seconds, location_name, kp, lat, lng, tags, order_index, published_at, content_blocks (id, type, position, data)";

/**
 * Una URL de vimeo.com pegada en "Portada" no es una imagen — pasó de verdad
 * en el backoffice y la ficha quedaba sin miniatura. Se descarta acá para que
 * la miniatura real la resuelva el oEmbed de Vimeo, como cuando no hay portada.
 */
function portadaUsable(url: string | null): string | null {
  if (!url) return null;
  return /^https?:\/\/(www\.)?(player\.)?vimeo\.com\//i.test(url) ? null : url;
}

function toContent(row: ContentRow): Content {
  const blocks = (row.content_blocks ?? [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map(
      (b) =>
        ({
          id: b.id,
          type: b.type,
          position: b.position,
          data: b.data ?? {},
        }) as Block,
    );

  return {
    id: row.id,
    slug: row.slug,
    type: row.type,
    status: row.status,
    locked: row.locked ?? false,
    title: row.title,
    subtitle: row.subtitle,
    summary: row.summary,
    coverUrl: portadaUsable(row.cover_url),
    vimeoId: row.vimeo_id,
    durationSeconds: row.duration_seconds,
    locationName: row.location_name,
    kp: row.kp,
    lat: row.lat,
    lng: row.lng,
    tags: row.tags ?? [],
    orderIndex: row.order_index ?? 0,
    publishedAt: row.published_at,
    blocks,
  };
}

let avisoEmitido = false;
function avisarFallback(motivo: string) {
  if (avisoEmitido) return;
  avisoEmitido = true;
  console.warn(`[contenido] Usando datos de demostración — ${motivo}`);
}

/** Todos los contenidos publicados, ya ordenados y con los datos de Vimeo. */
export const getPublishedContents = cache(async (): Promise<Content[]> => {
  const supabase = createPublicClient();
  if (!supabase) {
    avisarFallback("Supabase no está configurado");
    return completarDesdeVimeo(publicados(SEED_CONTENIDOS));
  }

  const { data, error } = await supabase
    .from("contents")
    .select(CONTENT_SELECT)
    .eq("status", "published")
    .order("order_index", { ascending: true });

  if (error || !data) {
    avisarFallback(error?.message ?? "la consulta no devolvió filas");
    return completarDesdeVimeo(publicados(SEED_CONTENIDOS));
  }

  return completarDesdeVimeo((data as unknown as ContentRow[]).map(toContent));
});

function publicados(items: Content[]): Content[] {
  return items
    .filter((c) => c.status === "published")
    .sort((a, b) => a.orderIndex - b.orderIndex);
}

/** Especiales publicados, tengan o no punto en el mapa. */
export async function getEspeciales(): Promise<Content[]> {
  const todos = await getPublishedContents();
  return todos.filter((c) => c.type === "especial");
}

/**
 * Todo lo que el mapa puede dibujar: especiales y simples con coordenadas.
 * El color de cada marca lo decide el tipo, no esta consulta.
 */
export async function getGeorreferenciados(): Promise<MappedContent[]> {
  const todos = await getPublishedContents();
  return todos.filter(isMapped);
}

/** Los simples, en orden de reproducción. */
export async function getSimples(): Promise<Content[]> {
  const todos = await getPublishedContents();
  return todos
    .filter((c) => c.type === "simple")
    .sort((a, b) => a.orderIndex - b.orderIndex);
}

export const getContentBySlug = cache(async (slug: string): Promise<Content | null> => {
  const supabase = createPublicClient();

  const delSeed = () =>
    SEED_CONTENIDOS.find((c) => c.slug === slug && c.status === "published") ?? null;

  const crudo = await (async () => {
    if (!supabase) return delSeed();

    const { data, error } = await supabase
      .from("contents")
      .select(CONTENT_SELECT)
      .eq("slug", slug)
      .eq("status", "published")
      .maybeSingle();

    if (error || !data) {
      if (error) avisarFallback(error.message);
      return delSeed();
    }

    return toContent(data as unknown as ContentRow);
  })();

  if (!crudo) return null;
  const [completo] = await completarDesdeVimeo([crudo]);
  return completo;
});

/** Slugs publicados, para `generateStaticParams`. */
export async function getPublishedSlugs(): Promise<string[]> {
  const todos = await getPublishedContents();
  return todos.map((c) => c.slug);
}

/** Filas del carrusel, con sus contenidos ya resueltos. */
export async function getRails(): Promise<Rail[]> {
  const supabase = createPublicClient();
  const desdeSeed = () => completarFilas(SEED_RAILS.filter((r) => r.items.length > 0));

  if (!supabase) return desdeSeed();

  const { data, error } = await supabase
    .from("rails")
    .select(
      `id, slug, title, order_index, rail_items (position, contents (${CONTENT_SELECT}))`,
    )
    .eq("visible", true)
    .order("order_index", { ascending: true });

  if (error || !data) {
    avisarFallback(error?.message ?? "no se pudieron leer las filas del carrusel");
    return desdeSeed();
  }

  type RailRow = {
    id: string;
    slug: string;
    title: string;
    order_index: number | null;
    rail_items: { position: number; contents: ContentRow | null }[] | null;
  };

  const filas = (data as unknown as RailRow[])
    .map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      orderIndex: r.order_index ?? 0,
      items: (r.rail_items ?? [])
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((it) => it.contents)
        .filter((c): c is ContentRow => Boolean(c) && c!.status === "published")
        .map(toContent),
    }))
    .filter((r) => r.items.length > 0);

  return completarFilas(filas);
}

/**
 * Completa los contenidos de todas las filas en una sola pasada: un mismo video
 * puede estar en varias filas, y así se resuelve una vez sola.
 */
async function completarFilas(filas: Rail[]): Promise<Rail[]> {
  const completos = await completarDesdeVimeo(filas.flatMap((f) => f.items));
  const porId = new Map(completos.map((c) => [c.id, c]));

  return filas.map((f) => ({ ...f, items: f.items.map((c) => porId.get(c.id) ?? c) }));
}

