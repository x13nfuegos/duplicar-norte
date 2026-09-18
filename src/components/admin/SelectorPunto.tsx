"use client";

import { useEffect, useRef, useState } from "react";
import { MapLibreMap, Marker } from "maplibre-gl";
import "@/components/map/setup";
import { buildStyle } from "@/components/map/mapStyle";
import {
  ARGENTINA_BOUNDS,
  ESTACIONES,
  TRAZA_COORDS,
  ZOOM_MAX,
  ZOOM_MIN,
  formatearProgresiva,
} from "@/data/traza";
import { Etiqueta } from "./campos";

interface Props {
  lat: number | null;
  lng: number | null;
  onChange: (punto: { lat: number; lng: number }) => void;
  error?: string;
}

/**
 * Elige el punto de la traza donde se ancla una publicación.
 *
 * Tres caminos, porque en la práctica se usan los tres: elegir una estación de
 * bombeo (lo más común), hacer clic en el mapa, o pegar coordenadas exactas
 * cuando vienen de un GPS de campo.
 */
export default function SelectorPunto({ lat, lng, onChange, error }: Props) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapLibreMap | null>(null);
  const marcador = useRef<Marker | null>(null);
  const alElegir = useRef(onChange);
  alElegir.current = onChange;

  const [listo, setListo] = useState(false);

  useEffect(() => {
    if (!contenedor.current || mapa.current) return;

    const m = new MapLibreMap({
      container: contenedor.current,
      style: buildStyle("tactico"),
      center: [-68.3, -38.35],
      zoom: 6.1,
      minZoom: ZOOM_MIN,
      maxZoom: ZOOM_MAX,
      maxBounds: [
        [ARGENTINA_BOUNDS[0], ARGENTINA_BOUNDS[1]],
        [ARGENTINA_BOUNDS[2], ARGENTINA_BOUNDS[3]],
      ],
      attributionControl: false,
      dragRotate: false,
    });

    m.on("load", () => {
      m.addSource("traza", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: TRAZA_COORDS },
        },
      });
      m.addLayer({
        id: "traza",
        type: "line",
        source: "traza",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#4ecdf5", "line-width": 2, "line-opacity": 0.75 },
      });
      setListo(true);
    });

    m.on("click", (e) => {
      alElegir.current({ lat: +e.lngLat.lat.toFixed(5), lng: +e.lngLat.lng.toFixed(5) });
    });

    mapa.current = m;

    return () => {
      m.remove();
      mapa.current = null;
      setListo(false);
    };
  }, []);

  // Marcador del punto elegido, sincronizado con el formulario.
  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo) return;

    if (lat === null || lng === null) {
      marcador.current?.remove();
      marcador.current = null;
      return;
    }

    if (!marcador.current) {
      const el = document.createElement("span");
      el.className =
        "block h-3.5 w-3.5 rounded-full border-2 border-abyss bg-cyan shadow-[0_0_12px_rgba(78,205,245,0.9)]";
      marcador.current = new Marker({ element: el }).setLngLat([lng, lat]).addTo(m);
    } else {
      marcador.current.setLngLat([lng, lat]);
    }
  }, [lat, lng, listo]);

  return (
    <div className="space-y-3">
      {/* Proactivo, no solo reactivo al error: sin esto, alguien puede
          completar toda la ficha y enterarse recién al guardar —y sin
          entender por qué— de que a un especial le falta este paso. */}
      {lat === null && (
        <p className="rounded-lg border border-amber/40 bg-amber/10 px-3.5 py-2.5 text-[13px] text-amber">
          Para poder guardar, primero elegí un punto acá abajo: tocá una estación de la lista o
          hacé clic en el mapa.
        </p>
      )}

      <Etiqueta
        error={error}
        ayuda="Elegí una estación, hacé clic en el mapa o pegá las coordenadas."
      >
        Punto en la traza
      </Etiqueta>

      <div className="flex flex-wrap gap-1.5">
        {ESTACIONES.map((e) => {
          const elegida = lat === e.lat && lng === e.lng;
          return (
            <button
              key={e.id}
              type="button"
              onClick={() => onChange({ lat: e.lat, lng: e.lng })}
              className={`label-tech rounded-full border px-2.5 py-1.5 text-[9px] transition-colors ${
                elegida
                  ? "border-cyan bg-cyan/15 text-cyan"
                  : "border-line text-ink-faint hover:border-cyan/40 hover:text-ink-soft"
              }`}
            >
              {e.nombre.replace(/^EB /, "")}
            </button>
          );
        })}
      </div>

      <div
        ref={contenedor}
        className={`h-56 overflow-hidden rounded-lg border ${error ? "border-amber/60" : "border-line"}`}
      />

      <div className="grid grid-cols-2 gap-2.5">
        <CampoCoordenada
          etiqueta="Latitud"
          value={lat}
          onChange={(v) => onChange({ lat: v, lng: lng ?? -68.3 })}
        />
        <CampoCoordenada
          etiqueta="Longitud"
          value={lng}
          onChange={(v) => onChange({ lat: lat ?? -38.3, lng: v })}
        />
      </div>

      {lat !== null && lng !== null && (
        <p className="label-tech text-[9px] text-ink-faint">
          Progresiva estimada sobre la traza: {formatearProgresiva([lng, lat])}
        </p>
      )}
    </div>
  );
}

function CampoCoordenada({
  etiqueta,
  value,
  onChange,
}: {
  etiqueta: string;
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="label-tech mb-1 block text-[9px] text-ink-faint">{etiqueta}</span>
      <input
        type="number"
        step="0.00001"
        value={value ?? ""}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (!Number.isNaN(v)) onChange(v);
        }}
        className="w-full rounded-lg border border-line bg-surface px-3 py-2 font-mono text-[13px] text-ink outline-none focus:border-cyan"
      />
    </label>
  );
}
