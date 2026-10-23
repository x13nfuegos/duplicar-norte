"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { track } from "@/lib/analytics/client";

interface Props {
  /** Cierra la intro y revela el mapa, que ya está montado debajo. */
  onFin: () => void;
}

const VIDEOS = [
  "/intro-video/video-00.mp4",
  "/intro-video/video-01.mp4",
  "/intro-video/video-02.mp4",
  "/intro-video/video-03.mp4",
  "/intro-video/video-04.mp4",
];

/**
 * La lámina de diseño en la que frena cada capítulo (los PNG 04–08 de
 * DupliNor): misma composición que el último cuadro del video, pero salida
 * directa del arte, para que las placas se lean bien durante la espera. Como
 * la composición coincide con el cuadro congelado, el fundido de entrada y
 * salida es solo un cambio de nitidez — nunca un salto.
 */
const STILLS = [
  "/intro-video/still-00.webp",
  "/intro-video/still-01.webp",
  "/intro-video/still-02.webp",
  "/intro-video/still-03.webp",
  "/intro-video/still-04.webp",
];

type Fase = "reproduciendo" | "esperando" | "fin";

/**
 * Intro cinemática en video, por capítulos.
 *
 * Los cinco videos están montados para encadenarse: el último cuadro de cada
 * uno coincide con el primero del siguiente. El 00 arranca solo; al terminar,
 * el siguiente queda congelado en su primer cuadro esperando al usuario, que
 * avanza con ESPACIO, las flechas o un clic. Al terminar el 04, la intro se
 * funde y debajo ya está la traza cargada.
 *
 * Los cinco elementos <video> viven apilados con crossfade de opacidad: como
 * los cuadros de empalme son idénticos, la transición es invisible. Solo se
 * precargan el actual y el siguiente.
 */
export default function IntroVideo({ onFin }: Props) {
  const [actual, setActual] = useState(0);
  const [fase, setFase] = useState<Fase>("reproduciendo");
  const [saliendo, setSaliendo] = useState(false);
  const [pantallaCompleta, setPantallaCompleta] = useState(false);
  const videos = useRef<(HTMLVideoElement | null)[]>([]);
  const contenedor = useRef<HTMLDivElement>(null);

  // Espejo en refs del estado que gobierna la reproducción: los handlers de
  // video y de entrada leen SIEMPRE el valor vigente, sin closures viejos.
  const ref = useRef({ actual: 0, fase: "reproduciendo" as Fase, ultimoGesto: 0 });
  ref.current.actual = actual;
  ref.current.fase = fase;

  if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
    (window as unknown as { __intro?: unknown }).__intro = { actual, fase, saliendo };
  }

  /* ---------------- Salida ---------------- */

  const salir = useCallback(() => {
    setSaliendo(true);
    try {
      sessionStorage.setItem("dn-intro-vista", "1");
    } catch {}
    // Si la intro estaba a pantalla completa, el sitio no debe quedar preso.
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    videos.current.forEach((v) => v?.pause());
    setTimeout(onFin, 700);
  }, [onFin]);

  /* ---------------- Pantalla completa ---------------- */

  useEffect(() => {
    const alCambiar = () => setPantallaCompleta(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", alCambiar);
    return () => document.removeEventListener("fullscreenchange", alCambiar);
  }, []);

  const alternarPantalla = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      // Safari en iPhone no lo permite sobre un div: el botón simplemente no
      // hace nada ahí, y la intro ya ocupa la pantalla igual.
      contenedor.current?.requestFullscreen?.().catch(() => {});
    }
  }, []);

  /* ---------------- Arranque ---------------- */

  useEffect(() => {
    const v = videos.current[0];
    if (!v) return;
    // Va mudo: es la única forma de que el navegador permita el autoplay.
    v.play().catch(() => {
      // Autoplay bloqueado (raro estando mudo): queda congelado en el primer
      // cuadro y el mismo gesto de avanzar lo dispara.
      setFase("esperando");
    });
  }, []);

  /* ---------------- Encadenado ---------------- */

  const alTerminar = useCallback(
    (indice: number) => {
      // Solo el video en escena decide la transición.
      if (indice !== ref.current.actual) return;

      if (indice < VIDEOS.length - 1) {
        // El siguiente queda clavado en su primer cuadro, esperando el gesto.
        // El crossfade es invisible porque ambos cuadros son idénticos.
        const proximo = videos.current[indice + 1];
        if (proximo) {
          proximo.pause();
          try {
            proximo.currentTime = 0;
          } catch {}
        }
        setActual(indice + 1);
        setFase("esperando");
      } else {
        // Último cuadro del 04: queda la lámina de Allen en pantalla y la
        // intro espera el gesto final — al mapa se pasa a pedido, no solo.
        setFase("fin");
      }
    },
    [],
  );

  const avanzar = useCallback(() => {
    const faseActual = ref.current.fase;
    if (faseActual !== "esperando" && faseActual !== "fin") return;
    // Un gesto = un avance: absorbe eventos duplicados (tecla + clic
    // sintetizado, doble disparo del navegador embebido, etc.).
    const ahora = performance.now();
    if (ahora - ref.current.ultimoGesto < 500) return;
    ref.current.ultimoGesto = ahora;

    // En la frenada final el mismo gesto de continuar revela el mapa.
    if (faseActual === "fin") return salir();

    const v = videos.current[ref.current.actual];
    if (!v) return;
    v.play().catch(() => {});
    setFase("reproduciendo");
  }, [salir]);

  /**
   * Retroceder un capítulo. Con la secuencia congelada vuelve al cuadro
   * inicial del capítulo anterior, para poder repetirlo; con un video en
   * marcha —o en la frenada final—, frena/repite el capítulo en escena,
   * devolviéndolo a su propio cuadro inicial.
   */
  const retroceder = useCallback(() => {
    const { actual: indice, fase: faseActual } = ref.current;

    const destino = faseActual === "esperando" ? Math.max(0, indice - 1) : indice;

    for (const i of [indice, destino]) {
      const v = videos.current[i];
      if (!v) continue;
      v.pause();
      try {
        v.currentTime = 0;
      } catch {}
    }

    setActual(destino);
    setFase("esperando");
  }, []);

  /**
   * Cerrojo final: si CUALQUIER cosa pone a reproducir un video que no es el
   * que está en escena —o el que está en escena mientras la secuencia espera
   * un gesto reciente—, se pausa en el acto. Con esto, el encadenado sin
   * intervención del usuario es imposible por construcción.
   */
  const alReproducir = useCallback((indice: number) => {
    const esDeEscena = indice === ref.current.actual;
    const habilitado =
      esDeEscena &&
      (ref.current.fase === "reproduciendo" ||
        performance.now() - ref.current.ultimoGesto < 500);
    if (!habilitado) {
      const v = videos.current[indice];
      if (v) {
        v.pause();
        try {
          v.currentTime = 0;
        } catch {}
      }
    }
  }, []);

  /* ---------------- Entradas ---------------- */

  useEffect(() => {
    const alTecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") return salir();
      if ([" ", "Enter", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        avanzar();
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        retroceder();
      }
    };
    window.addEventListener("keydown", alTecla);
    return () => window.removeEventListener("keydown", alTecla);
  }, [avanzar, retroceder, salir]);

  return (
    <div
      ref={contenedor}
      className={`fixed inset-0 z-[100] overflow-hidden bg-abyss transition-opacity duration-700 ${
        saliendo ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
      role="dialog"
      aria-label="Introducción al Programa Duplicar Norte"
      onClick={avanzar}
    >
      {/* Escenario 16:9 ajustado al viewport: la pieza entra COMPLETA en
          cualquier pantalla (letterbox sobre el fondo oscuro cuando la
          proporción no coincide) en vez de recortarse. Videos y stills viven
          en el mismo marco con el mismo encaje, así el fundido entre ambos no
          puede producir ningún salto de escala. */}
      <div className="flex h-full w-full items-center justify-center">
        <div
          className="relative aspect-video"
          style={{ width: "min(100%, calc(100dvh * 16 / 9))" }}
        >
          {/* Durante la espera queda visible el video TERMINADO (su último
              cuadro es idéntico al still de arriba); el siguiente recién se
              muestra al continuar. Así ambos fundidos son continuos. */}
          {VIDEOS.map((src, i) => (
            <video
              key={src}
              ref={(el) => {
                videos.current[i] = el;
              }}
              src={src}
              muted
              playsInline
              // Solo el actual y el siguiente bajan datos; el resto espera.
              preload={i <= actual + 1 ? "auto" : "none"}
              poster={i === 0 ? "/intro-video/poster-00.jpg" : undefined}
              onEnded={() => alTerminar(i)}
              onPlay={() => alReproducir(i)}
              className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-500 ${
                i === (fase === "esperando" ? Math.max(0, actual - 1) : actual)
                  ? "opacity-100"
                  : "opacity-0"
              }`}
            />
          ))}

          {/* Stills de frenada: aparecen en fundido suave sobre el cuadro
              congelado y se disuelven cuando el capítulo arranca. */}
          {STILLS.map((src, i) => {
            const visible =
              (fase === "esperando" && i === actual - 1) ||
              (fase === "fin" && i === STILLS.length - 1);
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={src}
                src={src}
                alt=""
                className={`pointer-events-none absolute inset-0 h-full w-full object-contain transition-opacity duration-700 ${
                  visible ? "opacity-100" : "opacity-0"
                }`}
              />
            );
          })}
        </div>
      </div>

      {/* ---------------- Cromo ---------------- */}

      {/* Capítulo. En una frenada lo que se ve es el FINAL del capítulo que
          acaba de correr, así que el contador no salta al siguiente hasta que
          el usuario avanza: la lámina de Medanito dice 04 y la de Allen 05. */}
      <span
        className="label-tech absolute top-5 left-5 text-[11px] text-white/60 md:top-7 md:left-8"
        style={{ textShadow: "0 1px 6px rgba(0,0,0,0.9)" }}
      >
        {String(fase === "esperando" ? Math.max(actual, 1) : actual + 1).padStart(2, "0")} /{" "}
        {String(VIDEOS.length).padStart(2, "0")}
      </span>

      {/* Pantalla completa + Omitir */}
      <div className="absolute top-4 right-4 flex items-center gap-2 md:top-7 md:right-8">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            alternarPantalla();
          }}
          aria-label={pantallaCompleta ? "Salir de pantalla completa" : "Pantalla completa"}
          title={pantallaCompleta ? "Salir de pantalla completa" : "Pantalla completa"}
          className="grid h-8 w-8 place-items-center rounded-full bg-black/30 text-white/75 backdrop-blur-sm transition-colors hover:bg-black/50 hover:text-white md:h-9 md:w-9"
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
            {pantallaCompleta ? (
              <path d="M6 2v4H2M10 2v4h4M6 14v-4H2M10 14v-4h4" strokeLinecap="round" />
            ) : (
              <path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" strokeLinecap="round" />
            )}
          </svg>
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            track("intro_skip");
            salir();
          }}
          className="label-tech rounded-full bg-black/30 px-3.5 py-2 text-[9px] text-white/75 backdrop-blur-sm transition-colors hover:bg-black/50 hover:text-white md:px-4 md:text-[10px]"
        >
          Omitir intro →
        </button>
      </div>

      {/* Cómo navegar: aparece recién cuando la secuencia queda congelada —en
          una frenada o en la lámina final—, que es cuando el gesto hace falta.
          Cada mitad de la pastilla también es botón: tocar la flecha ←
          retrocede de verdad, en vez de caer en el clic-avanza del fondo. */}
      <div
        className={`pointer-events-none absolute inset-x-3 bottom-5 flex justify-center transition-opacity duration-500 md:bottom-7 ${
          fase === "reproduciendo" ? "opacity-0" : "opacity-100"
        }`}
      >
        <div
          className={`intro-late flex items-center gap-2 rounded-full bg-black/35 px-4 py-2 backdrop-blur-sm md:gap-2.5 md:px-5 md:py-2.5 ${
            fase === "reproduciendo" ? "" : "pointer-events-auto"
          }`}
        >
          <button
            type="button"
            aria-label="Retroceder un capítulo"
            onClick={(e) => {
              e.stopPropagation();
              retroceder();
            }}
            className="flex cursor-pointer items-center gap-2 outline-none md:gap-2.5"
          >
            <span className="text-[11px] font-normal text-white/80 md:text-[12px]">Retroceder</span>
            <Tecla>←</Tecla>
          </button>
          <button
            type="button"
            aria-label={fase === "fin" ? "Explorar el mapa" : "Continuar"}
            onClick={(e) => {
              e.stopPropagation();
              avanzar();
            }}
            className="flex cursor-pointer items-center gap-2 outline-none md:gap-2.5"
          >
            <Tecla ancha>Espacio</Tecla>
            <Tecla>→</Tecla>
            <span className="text-[11px] font-normal text-white md:text-[12px]">
              {fase === "fin" ? "Explorar el mapa" : "Continuar"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** Una tecla dibujada, como en los tutoriales de los juegos. */
function Tecla({ children, ancha = false }: { children: React.ReactNode; ancha?: boolean }) {
  return (
    <span
      className={`grid h-6 place-items-center rounded-md border border-white/40 bg-white/10 text-[9px] font-bold tracking-widest text-white uppercase md:h-7 md:text-[10px] ${
        ancha ? "px-2.5 md:px-3" : "w-6 md:w-7"
      }`}
      style={{ boxShadow: "inset 0 -2px 0 rgba(255,255,255,0.15)" }}
    >
      {children}
    </span>
  );
}
