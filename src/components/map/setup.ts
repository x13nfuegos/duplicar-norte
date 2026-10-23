import { setWorkerUrl } from "maplibre-gl";
// Los estilos del mapa (70 KB) viajan con el mapa y no con el layout raíz: así
// /serie y las fichas, que no dibujan ningún mapa, no los descargan.
import "maplibre-gl/dist/maplibre-gl.css";

/**
 * MapLibre arma la URL de su worker a partir de `import.meta.url` del bundle
 * principal. Con Turbopack ese bundle vive en `/_next/static/chunks/`, donde el
 * worker nunca se emite: la URL derivada da 404, el worker muere sin emitir
 * ningún evento de error y las fuentes GeoJSON quedan cargando para siempre
 * (las capas raster siguen andando, lo que vuelve el síntoma muy confuso).
 *
 * Lo servimos desde `public/maplibre/`, que llena
 * `scripts/copy-maplibre-worker.mjs` en el `postinstall`.
 *
 * Importar este módulo antes de instanciar cualquier mapa.
 */
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

export {};
