"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { registrarTiempo, registrarVista } from "@/lib/analytics/client";

/** Sin tocar nada durante este tiempo, la persona deja de contar como activa. */
const INACTIVIDAD_MS = 30_000;
/** Cada cuánto se manda el tiempo acumulado aunque la página siga abierta. */
const ENVIO_CADA_MS = 30_000;

/**
 * Mide vistas de página y tiempo activo. No dibuja nada.
 *
 * El tiempo "activo" cuenta solo mientras la pestaña está visible y hubo algún
 * gesto (mouse, teclado, scroll, toque) en los últimos 30 segundos: una
 * pestaña olvidada abierta no infla el promedio.
 */
export default function Tracker() {
  const pathname = usePathname();
  const rutaActual = useRef<string | null>(null);
  const acumulado = useRef(0);
  const ultimoGesto = useRef(Date.now());

  const volcar = useRef(() => {
    const ruta = rutaActual.current;
    if (ruta && acumulado.current > 0) registrarTiempo(ruta, acumulado.current);
    acumulado.current = 0;
  });

  // Reloj de actividad y vaciado del acumulado. Se monta una sola vez.
  useEffect(() => {
    const gesto = () => {
      ultimoGesto.current = Date.now();
    };
    const eventos = ["pointerdown", "pointermove", "keydown", "scroll", "touchstart", "wheel"] as const;
    for (const e of eventos) window.addEventListener(e, gesto, { passive: true });

    let sinEnviar = 0;
    const reloj = window.setInterval(() => {
      if (document.visibilityState === "visible" && Date.now() - ultimoGesto.current < INACTIVIDAD_MS) {
        acumulado.current += 1000;
      }
      sinEnviar += 1000;
      if (sinEnviar >= ENVIO_CADA_MS) {
        sinEnviar = 0;
        volcar.current();
      }
    }, 1000);

    const alOcultar = () => {
      if (document.visibilityState === "hidden") volcar.current();
    };
    document.addEventListener("visibilitychange", alOcultar);
    window.addEventListener("pagehide", volcar.current);

    return () => {
      for (const e of eventos) window.removeEventListener(e, gesto);
      window.clearInterval(reloj);
      document.removeEventListener("visibilitychange", alOcultar);
      window.removeEventListener("pagehide", volcar.current);
    };
  }, []);

  // Una vista por cambio de ruta; antes se cierra el tiempo de la anterior.
  useEffect(() => {
    if (pathname === rutaActual.current) return;

    // El reproductor de la serie cambia la URL con history.replaceState cada
    // vez que pasa de video, y Next lo refleja en usePathname. Seguir en
    // /serie/* no es una página nueva: cada play ya se cuenta como evento.
    const actual = rutaActual.current;
    if (actual?.startsWith("/serie") && pathname.startsWith("/serie")) return;

    volcar.current();
    const medible = !pathname.startsWith("/admin");
    rutaActual.current = medible ? pathname : null;
    if (medible) registrarVista(pathname);
  }, [pathname]);

  return null;
}
