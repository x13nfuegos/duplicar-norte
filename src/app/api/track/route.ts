import { createClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "@/lib/supabase/env";

/**
 * Recibe los eventos del tracker (`src/lib/analytics/client.ts`) y los guarda
 * en `analytics_events`.
 *
 * Usa la clave pública, igual que el resto de la app: la política de RLS de esa
 * tabla permite insertar a cualquiera y leer solo a los administradores. Esto
 * no valida identidad —no puede—, así que se defiende con topes de longitud,
 * una lista cerrada de tipos y descartando bots. Responde siempre 204: al
 * navegador no le sirve saber si falló, y no queremos ruido en su consola.
 */

const vacio = () => new Response(null, { status: 204 });

/** Un evento legítimo pesa unos cientos de bytes: más que esto es basura. */
const MAX_CUERPO_BYTES = 4096;

const TIPOS = new Set(["pageview", "engagement", "event"]);
const NOMBRE_EVENTO = /^[a-z][a-z0-9_]{0,39}$/;
const BOTS = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|facebookexternalhit|preview|monitor|uptime|curl|wget|python-requests/i;

function texto(valor: unknown, max: number): string | null {
  return typeof valor === "string" && valor.length > 0 ? valor.slice(0, max) : null;
}

function dispositivo(ua: string): "mobile" | "tablet" | "desktop" {
  if (/ipad|tablet|(android(?!.*mobile))/i.test(ua)) return "tablet";
  if (/mobi|iphone|ipod|android/i.test(ua)) return "mobile";
  return "desktop";
}

function navegador(ua: string): string {
  if (/edg\//i.test(ua)) return "Edge";
  if (/opr\/|opera/i.test(ua)) return "Opera";
  if (/samsungbrowser/i.test(ua)) return "Samsung Internet";
  if (/firefox|fxios/i.test(ua)) return "Firefox";
  if (/chrome|crios/i.test(ua)) return "Chrome";
  if (/safari/i.test(ua)) return "Safari";
  return "Otro";
}

/** Vercel y Cloudflare mandan el país en un header; otros servidores no. */
function pais(headers: Headers): string | null {
  const codigo = headers.get("x-vercel-ip-country") ?? headers.get("cf-ipcountry");
  return codigo && /^[A-Z]{2}$/.test(codigo) && codigo !== "XX" ? codigo : null;
}

function ciudad(headers: Headers): string | null {
  const crudo = headers.get("x-vercel-ip-city");
  if (!crudo) return null;
  try {
    return decodeURIComponent(crudo).slice(0, 80) || null;
  } catch {
    return null;
  }
}

/** Solo valores simples y pocos: es un cajón de detalles, no un volcado. */
function propiedades(valor: unknown): Record<string, string | number | boolean> {
  const limpio: Record<string, string | number | boolean> = {};
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return limpio;

  for (const [clave, v] of Object.entries(valor).slice(0, 8)) {
    if (typeof v === "string") limpio[clave.slice(0, 30)] = v.slice(0, 100);
    else if (typeof v === "number" && Number.isFinite(v)) limpio[clave.slice(0, 30)] = v;
    else if (typeof v === "boolean") limpio[clave.slice(0, 30)] = v;
  }
  return limpio;
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return vacio();

  const ua = request.headers.get("user-agent") ?? "";
  if (!ua || BOTS.test(ua)) return vacio();

  const declarado = Number(request.headers.get("content-length") ?? 0);
  if (declarado > MAX_CUERPO_BYTES) return vacio();

  let cuerpo: Record<string, unknown>;
  try {
    const crudo = await request.text();
    if (crudo.length > MAX_CUERPO_BYTES) return vacio();
    const parseado: unknown = JSON.parse(crudo);
    // `null`, un número o un array son JSON válido pero no un evento.
    if (!parseado || typeof parseado !== "object" || Array.isArray(parseado)) return vacio();
    cuerpo = parseado as Record<string, unknown>;
  } catch {
    return vacio();
  }

  const type = texto(cuerpo.type, 20);
  const visitorId = texto(cuerpo.visitor_id, 64);
  const sessionId = texto(cuerpo.session_id, 64);
  const path = texto(cuerpo.path, 300);
  if (!type || !TIPOS.has(type) || !visitorId || !sessionId || !path?.startsWith("/")) {
    return vacio();
  }
  // El panel no se mide: lo usa el equipo, no el público.
  if (path.startsWith("/admin")) return vacio();

  const nombre = texto(cuerpo.name, 40);
  if (type === "event" && (!nombre || !NOMBRE_EVENTO.test(nombre))) return vacio();

  const duracion = typeof cuerpo.duration_ms === "number" ? Math.round(cuerpo.duration_ms) : null;
  if (type === "engagement" && (duracion === null || duracion < 0 || duracion > 3_600_000)) {
    return vacio();
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await supabase.from("analytics_events").insert({
    visitor_id: visitorId,
    session_id: sessionId,
    type,
    name: type === "event" ? nombre : null,
    path: path.split("?")[0],
    referrer: type === "pageview" ? texto(cuerpo.referrer, 120) : null,
    device: dispositivo(ua),
    browser: navegador(ua),
    country: pais(request.headers),
    city: ciudad(request.headers),
    duration_ms: type === "engagement" ? duracion : null,
    props: type === "event" ? propiedades(cuerpo.props) : {},
  });

  // Sin esto, una tabla que falta o una clave de otro proyecto pasarían
  // inadvertidas: el navegador siempre recibe 204.
  if (error) console.error("[analytics] no se pudo guardar el evento:", error.message);

  return vacio();
}
