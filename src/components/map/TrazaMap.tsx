"use client";

import { useCallback, useEffect, useRef, useState } from "react";
// maplibre-gl 6 ya no expone un default export: todo se importa con nombre.
import { MapLibreMap, Marker, type GeoJSONSource, type LngLatBoundsLike } from "maplibre-gl";
import "./setup";
import { useRouter } from "next/navigation";
import { ARGENTINA_BOUNDS, ESTACIONES, ZOOM_MAX, ZOOM_MIN } from "@/data/traza";
import type { MappedContent } from "@/lib/types";
import { track } from "@/lib/analytics/client";
import { ALTO_CAJON_MAX, ALTO_CAJON_RELATIVO } from "@/components/rail/medidas";
import { hrefDeContenido } from "@/components/rail/ContentCard";
import { ATRIBUCION, NOMBRE_CAPA, RASTER, VELO, buildStyle, type Basemap } from "./mapStyle";
import MapHoverCard from "./MapHoverCard";
import GrillaSatelital from "./GrillaSatelital";

interface Props {
  contenidos: MappedContent[];
  /** Tramos de la traza, cada uno como secuencia de vértices [lng, lat]. */
  traza: [number, number][][];
  /** Alto en px que ocupa el carrusel. Por defecto, el del cajón contraído. */
  paddingInferior?: number;
}

/** Zoom a partir del cual se muestran los rótulos de las estaciones. */
const ZOOM_ROTULOS = 6;

/**
 * Zoom a partir del cual cada contenido muestra su cartel sobre el radar. Más
 * arriba que el de las estaciones: recién acá hay distancia en pantalla como
 * para que los carteles no se pisen entre vecinos.
 */
const ZOOM_TITULOS = 7.8;

/** Celeste del programa. Espejo de `--color-cyan`, para usar donde MapLibre
 *  necesita un valor literal y no puede leer una variable CSS. */
const CELESTE = "#3e9dc7";

export default function TrazaMap({ contenidos, traza, paddingInferior }: Props) {
  const router = useRouter();
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapLibreMap | null>(null);
  const marcadores = useRef<Marker[]>([]);

  const [listo, setListo] = useState(false);
  const [basemap, setBasemap] = useState<Basemap>("satelite");
  const [activo, setActivo] = useState<MappedContent | null>(null);
  const [posicion, setPosicion] = useState<{ x: number; y: number } | null>(null);
  /** Se vuelve `true` al primer gesto sobre el mapa: apaga la invitación. */
  const [huboInteraccion, setHuboInteraccion] = useState(false);

  // El hover no debe cerrarse al cruzar el hueco entre el punto y la tarjeta.
  const cierreDiferido = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelarCierre = useCallback(() => {
    if (cierreDiferido.current) {
      clearTimeout(cierreDiferido.current);
      cierreDiferido.current = null;
    }
  }, []);

  const cerrarTarjeta = useCallback(() => {
    cancelarCierre();
    cierreDiferido.current = setTimeout(() => {
      setActivo(null);
      setPosicion(null);
    }, 140);
  }, [cancelarCierre]);

  const proyectar = useCallback((c: MappedContent) => {
    const m = mapa.current;
    if (!m) return null;
    const p = m.project([c.lng, c.lat]);
    return { x: p.x, y: p.y };
  }, []);

  const abrirTarjeta = useCallback(
    (c: MappedContent) => {
      cancelarCierre();
      setActivo(c);
      setPosicion(proyectar(c));
    },
    [cancelarCierre, proyectar],
  );

  /* ---------------- Creación del mapa ---------------- */

  useEffect(() => {
    if (!contenedor.current || mapa.current) return;

    const m = new MapLibreMap({
      container: contenedor.current,
      style: buildStyle("satelite"),
      bounds: boundsDeTraza(traza),
      fitBoundsOptions: { padding: encuadrePadding(paddingInferior) },
      minZoom: ZOOM_MIN,
      maxZoom: ZOOM_MAX,
      maxBounds: [
        [ARGENTINA_BOUNDS[0], ARGENTINA_BOUNDS[1]],
        [ARGENTINA_BOUNDS[2], ARGENTINA_BOUNDS[3]],
      ] as LngLatBoundsLike,
      // La atribución la rendereamos nosotros dentro del panel de referencias:
      // el control propio de MapLibre vive abajo, donde el cajón de contenidos
      // lo taparía por completo.
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchZoomRotate: true,
      // El scroll del carrusel no debe secuestrar el zoom del mapa y viceversa.
      cooperativeGestures: false,
    });

    m.touchZoomRotate.disableRotation();
    mapa.current = m;
    if (process.env.NODE_ENV === "development") {
      (window as unknown as { __mapa?: unknown }).__mapa = m;
    }

    m.on("load", () => setListo(true));

    // Solo cuentan los gestos del usuario: `fitBounds` inicial también dispara
    // `movestart`, y no debería apagar la invitación antes de que la vea.
    const alInteractuar = (ev: { originalEvent?: unknown }) => {
      if (ev.originalEvent) setHuboInteraccion(true);
    };
    m.on("dragstart", alInteractuar);
    m.on("zoomstart", alInteractuar);
    // Handle de depuración: en la consola, `__mapa.getStyle().layers` o
    // `__mapa.isSourceLoaded('traza')` resuelven la mayoría de los problemas
    // del mapa, que suelen ser silenciosos.
    if (process.env.NODE_ENV === "development") {
      (window as unknown as { __mapa?: MapLibreMap }).__mapa = m;
    }

    return () => {
      m.remove();
      mapa.current = null;
      setListo(false);
    };
    // Se monta una sola vez: la traza y el padding se aplican en efectos aparte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------- Traza ---------------- */

  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo) return;

    // MultiLineString: el trazado oficial viene en tramos, y dibujarlos por
    // separado evita costuras rectas inventadas entre uno y otro.
    const geojson: GeoJSON.Feature<GeoJSON.MultiLineString> = {
      type: "Feature",
      properties: {},
      geometry: { type: "MultiLineString", coordinates: traza },
    };

    if (m.getSource("traza")) {
      (m.getSource("traza") as GeoJSONSource).setData(geojson);
      return;
    }

    m.addSource("traza", { type: "geojson", data: geojson });

    // Línea sólida, del celeste del programa: sin animación y sin contorno.
    m.addLayer({
      id: "traza-linea",
      type: "line",
      source: "traza",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": CELESTE,
        "line-width": ["interpolate", ["linear"], ["zoom"], 4, 2, 10, 4, 14, 6],
      },
    });
  }, [listo, traza]);

  /* ---------------- Marcadores ---------------- */

  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo) return;

    for (const mk of marcadores.current) mk.remove();
    marcadores.current = [];

    // Estaciones de bombeo: un círculo celeste centrado sobre la línea —la
    // traza las atraviesa— con el nombre debajo. Cabecera y fin de traza, en
    // negrita. El envoltorio mide 0×0 para que `anchor: center` clave el
    // círculo exactamente sobre la coordenada.
    for (const e of ESTACIONES) {
      const nombre = e.nombre.replace(/^EB /, "");
      const destacada = e.id === "auca-mahuida" || e.id === "allen";

      const el = document.createElement("div");
      el.className = "pointer-events-none relative block h-0 w-0 select-none";
      el.innerHTML = `
        <span class="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan"></span>
        <span class="js-rotulo absolute top-2 left-0 -translate-x-1/2 text-[12px] whitespace-nowrap md:text-[14px] ${destacada ? "font-bold" : "font-normal"} text-white transition-opacity duration-200" style="text-shadow: 0 1px 4px rgba(0,0,0,0.9)">${nombre}</span>`;

      const marcador = new Marker({ element: el, anchor: "center" })
        .setLngLat([e.lng, e.lat])
        .addTo(m);

      // MapLibre rotula todo marcador como "Map marker" y lo hace enfocable.
      // Las estaciones son decorativas —su nombre ya está en el DOM como
      // texto—, así que se sacan del recorrido con teclado.
      el.setAttribute("aria-hidden", "true");
      el.removeAttribute("role");
      el.tabIndex = -1;

      marcadores.current.push(marcador);
    }

    // Contenidos: ícono de PLAY con aros de radar. El triángulo dice de un
    // vistazo que ahí hay un video para ver.
    for (const c of contenidos) {
      const apagado = c.locked ? "opacity(0.6) grayscale(1)" : "none";

      // El botón mide 48×48 con el ícono centrado: con `anchor: center` el
      // punto queda clavado en la coordenada. El cartel del título va ARRIBA
      // del punto, porque las estaciones rotulan abajo: cada familia tiene su
      // franja y dejan de pisarse entre vecinos.
      const el = document.createElement("button");
      el.type = "button";
      el.setAttribute("aria-label", `Ver ${c.title}`);
      el.className =
        "group relative grid h-12 w-12 cursor-pointer place-items-center border-0 bg-transparent p-0";
      el.innerHTML = `
        <span class="absolute inset-0 grid place-items-center" style="filter: ${apagado}">
          <span class="absolute h-5 w-5 rounded-full border-2 border-white/25" style="animation: radar 3.2s cubic-bezier(0.22,1,0.36,1) infinite"></span>
          <span class="absolute h-5 w-5 rounded-full border-2 border-white/25" style="animation: radar 3.2s cubic-bezier(0.22,1,0.36,1) 1.6s infinite"></span>
          <svg viewBox="0 0 20 20" class="h-5 w-5 transition-transform duration-200 group-hover:scale-125" style="filter: drop-shadow(0 0 8px rgba(62,157,199,0.9))">
            <path d="M5 2.5v15l12-7.5z" fill="#ffffff" stroke="rgba(255,255,255,0.95)" stroke-width="1" stroke-linejoin="round" />
          </svg>
        </span>
        <span class="js-titulo absolute bottom-full left-1/2 mb-0.5 w-max max-w-[128px] -translate-x-1/2 rounded border ${c.locked ? "border-white/30" : "border-white/70"} px-1.5 py-0.5 text-center opacity-0 transition-opacity duration-200" style="text-shadow: 0 1px 4px rgba(0,0,0,0.9)">
          <span class="block text-[9.5px] leading-snug font-normal tracking-wide ${c.locked ? "text-white/50" : "text-white"}">${c.title}</span>
        </span>`;

      el.addEventListener("mouseenter", () => abrirTarjeta(c));
      el.addEventListener("mouseleave", cerrarTarjeta);
      el.addEventListener("focus", () => abrirTarjeta(c));
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        // Bloqueado: solo la ficha, que ya avisa que viene pronto.
        if (c.locked) return abrirTarjeta(c);
        track("map_point_open", { slug: c.slug });
        // En touch el primer toque abre la ficha flotante; la navegación se
        // hace desde el botón de la tarjeta.
        if (window.matchMedia("(hover: hover)").matches) router.push(hrefDeContenido(c));
        else abrirTarjeta(c);
      });

      marcadores.current.push(
        // Corrido 16px hacia arriba: varios contenidos viven pegados a una
        // estación de bombeo, y sin el offset el PLAY tapaba su círculo.
        new Marker({ element: el, anchor: "center", offset: [0, -16] })
          .setLngLat([c.lng, c.lat])
          .addTo(m),
      );
    }

    return () => {
      for (const mk of marcadores.current) mk.remove();
      marcadores.current = [];
    };
  }, [listo, contenidos, abrirTarjeta, cerrarTarjeta, router]);

  /* ---------------- Reproyección de la tarjeta y rótulos ---------------- */

  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo) return;

    const alMover = () => {
      if (activo) setPosicion(proyectar(activo));
    };

    const alZoom = () => {
      const zoom = m.getZoom();
      for (const el of document.querySelectorAll<HTMLElement>(".js-rotulo")) {
        el.style.opacity = zoom >= ZOOM_ROTULOS ? "1" : "0";
      }
      for (const el of document.querySelectorAll<HTMLElement>(".js-titulo")) {
        el.style.opacity = zoom >= ZOOM_TITULOS ? "1" : "0";
      }
    };

    m.on("move", alMover);
    m.on("zoom", alZoom);
    alZoom();

    return () => {
      m.off("move", alMover);
      m.off("zoom", alZoom);
    };
  }, [listo, activo, proyectar]);

  /* ---------------- Capa base ---------------- */

  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo) return;

    const ajustes = RASTER[basemap];
    for (const propiedad of Object.keys(ajustes) as (keyof typeof ajustes)[]) {
      m.setPaintProperty("base-satelite", propiedad, ajustes[propiedad]);
    }
    m.setPaintProperty("velo-azul", "background-color", VELO[basemap].color);
    m.setPaintProperty("velo-azul", "background-opacity", VELO[basemap].opacidad);
  }, [basemap, listo]);

  /* ---------------- Controles ---------------- */

  const encuadrar = useCallback(() => {
    mapa.current?.fitBounds(boundsDeTraza(traza), {
      padding: encuadrePadding(paddingInferior),
      duration: 900,
    });
  }, [traza, paddingInferior]);

  /* ---------------- Coreografía de bienvenida ---------------- */

  // Al aterrizar en la traza —recién salido de la intro o directo— la cámara
  // hace un zoom con deriva hasta el encuadre elegido por el cliente: el tramo
  // NORTE, de Auca Mahuida a La Escondida, centrado, con la línea siguiendo
  // de cuadro hacia Allen. El botón de encuadre devuelve la vista completa.
  const coreografia = useCallback(() => {
    const m = mapa.current;
    if (!m) return;

    // Puntos de la traza al norte de La Escondida (lat -38.21).
    const norte = traza.flat().filter((p) => p[1] >= -38.28);
    const objetivo = norte.length > 1 ? boundsDeTraza([norte]) : boundsDeTraza(traza);

    const cam = m.cameraForBounds(objetivo, {
      padding: encuadrePadding(paddingInferior),
    });
    if (!cam || cam.zoom == null || !cam.center) return;

    // Centro geométrico del tramo (no el de cameraForBounds, que el padding
    // inferior corre hacia el sur y deja a Auca Mahuida contra el borde).
    let oeste = 180, este = -180, sur = 90, norteLat = -90;
    for (const [lng, lat] of norte.length > 1 ? norte : traza.flat()) {
      oeste = Math.min(oeste, lng); este = Math.max(este, lng);
      sur = Math.min(sur, lat); norteLat = Math.max(norteLat, lat);
    }
    // El +0.05 de latitud baja un pelo todo el cuadro: el cartel del contenido
    // de Auca Mahuida queda debajo del encabezado con aire.
    const c = { lng: (oeste + este) / 2, lat: (sur + norteLat) / 2 + 0.05 };

    // Medio punto más cerca que el encaje justo: cómodamente por encima de
    // ZOOM_TITULOS, así los carteles de los contenidos llegan desplegados.
    const zoomDestino = cam.zoom + 0.5;

    m.jumpTo({ center: [c.lng + 0.45, c.lat + 0.35], zoom: zoomDestino - 1.1 });
    m.easeTo({
      center: [c.lng, c.lat],
      zoom: zoomDestino,
      duration: 3200,
      easing: (t) => 1 - Math.pow(1 - t, 3),
    });
  }, [traza, paddingInferior]);

  useEffect(() => {
    if (!listo) return;

    const alTerminarIntro = () => coreografia();
    window.addEventListener("dn:intro-fin", alTerminarIntro);

    // Sin intro pendiente en esta sesión, la coreografía corre al llegar.
    let vista = false;
    try {
      vista = Boolean(sessionStorage.getItem("dn-intro-vista"));
    } catch {}
    const timer = vista ? window.setTimeout(coreografia, 400) : undefined;

    return () => {
      window.removeEventListener("dn:intro-fin", alTerminarIntro);
      if (timer) clearTimeout(timer);
    };
  }, [listo, coreografia]);

  return (
    <div className="absolute inset-0">
      <div ref={contenedor} className="h-full w-full" />

      {/* La retícula es parte del modo táctico, no del mapa: sobre la imagen
          limpia estorbaría más de lo que aporta. */}
      {basemap === "tactico" && <GrillaSatelital />}

      {activo && posicion && (
        <MapHoverCard
          contenido={activo}
          x={posicion.x}
          y={posicion.y}
          onMouseEnter={cancelarCierre}
          onMouseLeave={cerrarTarjeta}
        />
      )}

      {/* La ficha de obra ahora cuelga del nombre en el header: acá solo queda
          el control de capa y las referencias. */}
      <div className="absolute top-18 right-3 z-20 flex flex-col items-end gap-2 md:top-24 md:right-6">
        {/* Satélite / Táctico: dos íconos, para robarle el mínimo lugar al mapa. */}
        <div className="glass flex overflow-hidden">
          {(["satelite", "tactico"] as const).map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setBasemap(b)}
              aria-pressed={basemap === b}
              aria-label={`Vista ${NOMBRE_CAPA[b].toLowerCase()}`}
              title={NOMBRE_CAPA[b]}
              className={`grid h-10 w-10 place-items-center transition-colors ${
                basemap === b ? "bg-cyan/30 text-white" : "text-white/60 hover:bg-white/10 hover:text-white"
              }`}
            >
              {b === "satelite" ? (
                <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.2">
                  <circle cx="8" cy="8" r="5.5" />
                  <path d="M2.5 8h11M8 2.5c2 2 2 9 0 11M8 2.5c-2 2-2 9 0 11" />
                </svg>
              ) : (
                <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.2">
                  <path d="M2 5.5h12M2 10.5h12M5.5 2v12M10.5 2v12" strokeLinecap="round" />
                </svg>
              )}
            </button>
          ))}
        </div>

        <Referencias basemap={basemap} />
      </div>

      {/* Encuadre de la traza, abajo a la izquierda, por encima del cajón. */}
      <button
        type="button"
        onClick={encuadrar}
        title="Centrar la traza"
        aria-label="Centrar la traza"
        className="glass absolute left-4 z-20 grid h-10 w-10 place-items-center text-white/80 hover:text-white md:left-8"
        style={{
          bottom: `calc(var(--alto-cajon, min(${ALTO_CAJON_RELATIVO * 100}dvh, ${ALTO_CAJON_MAX}px)) + 18px)`,
          transition: "bottom 0.3s ease, color 0.15s ease",
        }}
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4">
          <path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" strokeLinecap="round" />
        </svg>
      </button>

      <LlamadaAlMapa contenidos={contenidos.length} visible={!huboInteraccion && !activo} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Invitación a explorar el mapa.
 *
 * Sin esto los radares se leen como decoración: hay que decir explícitamente
 * que son contenido y que se abren. Desaparece en cuanto el usuario mueve el
 * mapa o toca un punto —ya entendió— para no dejar un cartel permanente.
 */
function LlamadaAlMapa({ contenidos, visible }: { contenidos: number; visible: boolean }) {
  if (contenidos === 0) return null;

  return (
    <div
      aria-hidden={!visible}
      className={`pointer-events-none absolute inset-x-0 z-20 flex justify-center transition-all duration-500 ${
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"
      }`}
      style={{
        bottom: `calc(var(--alto-cajon, min(${ALTO_CAJON_RELATIVO * 100}dvh, ${ALTO_CAJON_MAX}px)) + 18px)`,
        // Reemplaza al transition-all de la clase: sin opacity/transform acá,
        // el fundido de salida del cartel dejaría de andar.
        transition: "bottom 0.3s ease, opacity 0.5s ease, transform 0.5s ease",
      }}
    >
      <p className="glass flex items-center gap-3 px-4 py-2.5">
        <span className="text-[13px] leading-snug text-white">
          Navegá el mapa y descubrí Duplicar Norte
        </span>
        <span className="label-tech hidden text-white/70 sm:block">{contenidos} videos</span>
      </p>
    </div>
  );
}

/**
 * Referencias del mapa y atribución de las teselas.
 *
 * La atribución está detrás de un botón en vez de impresa sobre el mapa: no
 * puede sacarse del todo —Esri y OpenStreetMap la exigen para usar las teselas
 * sin API key— pero sí puede dejar de ocupar la pantalla.
 */
function Referencias({ basemap }: { basemap: Basemap }) {
  const [creditos, setCreditos] = useState(false);

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="glass hidden px-4 py-3 lg:block">
        <p className="label-tech mb-2.5 text-ink-faint">Referencias</p>
        <ul className="space-y-1.5">
          <li className="flex items-center gap-2.5">
            <span className="ml-2 block h-2.5 w-2.5 rounded-full bg-cyan" />
            <span className="label-tech text-[10px] text-ink-soft">
              Estación de Bombeo Oldelval
            </span>
          </li>
          <li className="flex items-center gap-2.5">
            <svg viewBox="0 0 12 12" className="ml-1.5 h-3 w-3">
              <path d="M2.5 1.5v9l8-4.5z" fill="#ffffff" />
            </svg>
            <span className="label-tech text-[10px] text-ink-soft">Contenido en video</span>
          </li>
        </ul>
      </div>

      {creditos && (
        <p className="panel label-tech max-w-[210px] px-3 py-2 text-[9px] leading-relaxed text-ink-soft">
          {ATRIBUCION[basemap]}
        </p>
      )}

      <button
        type="button"
        onClick={() => setCreditos((v) => !v)}
        aria-expanded={creditos}
        aria-label="Créditos de la cartografía"
        title="Créditos de la cartografía"
        className={`grid h-7 w-7 place-items-center rounded-full border border-line bg-abyss/70 text-[11px] backdrop-blur transition-colors hover:border-cyan/50 hover:text-cyan ${
          creditos ? "text-cyan" : "text-ink-faint"
        }`}
      >
        i
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function boundsDeTraza(lineas: [number, number][][]): LngLatBoundsLike {
  let oeste = 180;
  let este = -180;
  let sur = 90;
  let norte = -90;
  for (const [lng, lat] of lineas.flat()) {
    oeste = Math.min(oeste, lng);
    este = Math.max(este, lng);
    sur = Math.min(sur, lat);
    norte = Math.max(norte, lat);
  }
  const margen = 0.25;
  return [
    [oeste - margen, sur - margen],
    [este + margen, norte + margen],
  ];
}

/**
 * Márgenes del encuadre. Cada uno descuenta lo que hay encima del mapa en ese
 * lado: si no, la traza queda debajo de un panel y el usuario no la ve entera.
 */
function encuadrePadding(inferior?: number) {
  const angosto = typeof window !== "undefined" && window.innerWidth < 768;
  const alto = typeof window !== "undefined" ? window.innerHeight : 800;

  // Alto del cajón contraído, con la misma fórmula que usa ContentDrawer, más
  // el espacio de la invitación que flota justo encima.
  const cajon = Math.min(alto * ALTO_CAJON_RELATIVO, ALTO_CAJON_MAX) + 24;
  // Alto real de la invitación más su separación del cajón. En pantallas
  // angostas el texto ocupa toda la línea y la píldora crece, así que sin este
  // margen el último rótulo de la traza queda detrás.
  const invitacion = angosto ? 68 : 48;

  return {
    // La ficha de obra ya no flota sobre el mapa: los márgenes laterales solo
    // tienen que dejar aire a los rótulos de las estaciones. Si se pasan de
    // grandes se comen el viewport y el encuadre inicial termina mostrando el
    // país entero en vez de la traza.
    top: angosto ? 104 : 110,
    bottom: inferior ?? cajon + invitacion,
    left: angosto ? 72 : 110,
    right: angosto ? 72 : 110,
  };
}
