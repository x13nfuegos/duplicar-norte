/**
 * Analítica propia, lado navegador.
 *
 * Sin cookies y sin IP: el navegador genera un código aleatorio por visitante
 * (localStorage) y otro por sesión (sessionStorage, que vence a los 30 min de
 * inactividad). Todo viaja a `/api/track`, que le suma dispositivo y ubicación
 * a partir de los headers del servidor.
 */

const CLAVE_VISITANTE = "dn_vid";
const CLAVE_SESION = "dn_sid";
const VENCE_SESION_MS = 30 * 60 * 1000;

type Props = Record<string, string | number | boolean>;

type Envio =
  | { type: "pageview"; path: string; referrer?: string }
  | { type: "engagement"; path: string; duration_ms: number }
  | { type: "event"; name: string; path: string; props?: Props };

function aleatorio(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

function visitante(): string {
  try {
    let id = localStorage.getItem(CLAVE_VISITANTE);
    if (!id) {
      id = aleatorio();
      localStorage.setItem(CLAVE_VISITANTE, id);
    }
    return id;
  } catch {
    // Modo privado o almacenamiento bloqueado: un código por carga de página.
    return (memoria.visitante ??= aleatorio());
  }
}

function sesion(): string {
  const ahora = Date.now();
  try {
    const guardada = sessionStorage.getItem(CLAVE_SESION);
    if (guardada) {
      const { id, ts } = JSON.parse(guardada) as { id: string; ts: number };
      if (ahora - ts < VENCE_SESION_MS) {
        sessionStorage.setItem(CLAVE_SESION, JSON.stringify({ id, ts: ahora }));
        return id;
      }
    }
    const id = aleatorio();
    sessionStorage.setItem(CLAVE_SESION, JSON.stringify({ id, ts: ahora }));
    return id;
  } catch {
    return (memoria.sesion ??= aleatorio());
  }
}

const memoria: { visitante?: string; sesion?: string } = {};

/** ¿El visitante pidió no ser medido, o es un navegador automatizado? */
function desactivado(): boolean {
  if (typeof navigator === "undefined") return true;
  if (navigator.webdriver) return true;
  return navigator.doNotTrack === "1";
}

function enviar(datos: Envio) {
  if (desactivado()) return;

  const cuerpo = JSON.stringify({ ...datos, visitor_id: visitante(), session_id: sesion() });

  // text/plain evita el preflight de CORS; el servidor parsea el JSON igual.
  if (navigator.sendBeacon?.("/api/track", new Blob([cuerpo], { type: "text/plain" }))) return;
  void fetch("/api/track", { method: "POST", body: cuerpo, keepalive: true }).catch(() => {});
}

/** Host del sitio de origen, solo si es externo. */
function origenExterno(): string | undefined {
  try {
    if (!document.referrer) return undefined;
    const host = new URL(document.referrer).host;
    return host && host !== window.location.host ? host : undefined;
  } catch {
    return undefined;
  }
}

let primeraVista = true;

export function registrarVista(path: string) {
  enviar({ type: "pageview", path, referrer: primeraVista ? origenExterno() : undefined });
  primeraVista = false;
}

export function registrarTiempo(path: string, ms: number) {
  if (ms >= 1000) enviar({ type: "engagement", path, duration_ms: Math.round(ms) });
}

/**
 * Registra una acción puntual dentro del sitio (`video_play`, `share`...).
 * Seguro de llamar desde cualquier handler: si el tracking está apagado o
 * falla, no pasa nada.
 */
export function track(name: string, props?: Props) {
  if (typeof window === "undefined") return;
  if (window.location.pathname.startsWith("/admin")) return;
  enviar({ type: "event", name, path: window.location.pathname, props });
}
