"use client";

import { useEffect, useRef, useState } from "react";
import { track } from "@/lib/analytics/client";

interface Props {
  /** Ruta interna a compartir (ej. `/contenido/catriel`). */
  ruta: string;
  /** Título del contenido, para el texto del mensaje. */
  titulo: string;
}

/**
 * Botonera de compartir: WhatsApp, correo y copiar link. La URL absoluta se
 * arma recién al hacer clic, con el origen real de la página — así el mismo
 * componente sirve en producción y en cualquier preview.
 */
export default function Compartir({ ruta, titulo }: Props) {
  const [copiado, setCopiado] = useState(false);
  const [menuCorreo, setMenuCorreo] = useState(false);
  const zonaCorreo = useRef<HTMLDivElement>(null);

  const urlAbsoluta = () => new URL(ruta, window.location.origin).toString();

  const porWhatsApp = () => {
    track("share", { via: "whatsapp", ruta });
    const texto = `${titulo} — Programa Duplicar Norte\n${urlAbsoluta()}`;
    // Primero la app instalada (WhatsApp de escritorio o del teléfono, vía su
    // protocolo). Si en un ratito seguimos viendo la página —no hay app que
    // haya tomado el foco—, recién ahí cae a WhatsApp Web en el navegador.
    const fallback = window.setTimeout(() => {
      window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
    }, 1500);
    const cancelar = () => {
      if (document.hidden) window.clearTimeout(fallback);
    };
    document.addEventListener("visibilitychange", cancelar, { once: true });
    window.location.href = `whatsapp://send?text=${encodeURIComponent(texto)}`;
  };

  // El correo pregunta antes: cada quien usa un servicio distinto, y el
  // mailto: a secas se lleva la sorpresa de que se abra Outlook.
  const porCorreo = (via: "gmail" | "outlook" | "app") => {
    setMenuCorreo(false);
    track("share", { via: `correo_${via}`, ruta });
    const asunto = `${titulo} — Programa Duplicar Norte`;
    const cuerpo = `Mirá este contenido del Programa Duplicar Norte:\n\n${titulo}\n${urlAbsoluta()}`;
    const s = encodeURIComponent(asunto);
    const b = encodeURIComponent(cuerpo);

    if (via === "gmail") {
      window.open(`https://mail.google.com/mail/?view=cm&fs=1&su=${s}&body=${b}`, "_blank", "noopener");
    } else if (via === "outlook") {
      window.open(`https://outlook.live.com/mail/0/deeplink/compose?subject=${s}&body=${b}`, "_blank", "noopener");
    } else {
      window.location.href = `mailto:?subject=${s}&body=${b}`;
    }
  };

  // El menú de correo se cierra al clickear afuera o con Escape.
  useEffect(() => {
    if (!menuCorreo) return;
    const alClic = (e: MouseEvent) => {
      if (!zonaCorreo.current?.contains(e.target as Node)) setMenuCorreo(false);
    };
    const alTecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuCorreo(false);
    };
    document.addEventListener("mousedown", alClic);
    document.addEventListener("keydown", alTecla);
    return () => {
      document.removeEventListener("mousedown", alClic);
      document.removeEventListener("keydown", alTecla);
    };
  }, [menuCorreo]);

  const copiarLink = async () => {
    track("share", { via: "link", ruta });
    const url = urlAbsoluta();
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Sin permiso de portapapeles (http, iframes): el <input> de siempre.
      const campo = document.createElement("input");
      campo.value = url;
      document.body.appendChild(campo);
      campo.select();
      document.execCommand("copy");
      campo.remove();
    }
    setCopiado(true);
    window.setTimeout(() => setCopiado(false), 2000);
  };

  const boton =
    "grid h-9 w-9 cursor-pointer place-items-center rounded-full border border-white/20 bg-white/5 text-ink-soft backdrop-blur-sm transition-colors hover:border-cyan/60 hover:text-cyan";

  return (
    <div className="flex items-center gap-2">
      <span className="label-tech mr-1 hidden text-[9px] text-ink-faint sm:block">Compartir</span>

      <button type="button" onClick={porWhatsApp} aria-label="Compartir por WhatsApp" title="WhatsApp" className={boton}>
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
          <path d="M12 2a9.9 9.9 0 0 0-8.5 15.1L2 22l5.1-1.4A10 10 0 1 0 12 2Zm0 1.8a8.2 8.2 0 1 1-4.2 15.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 0 1 12 3.8Zm-3.1 4c-.2 0-.5 0-.7.3-.2.3-.9.9-.9 2.1s.9 2.4 1 2.6c.1.2 1.8 2.9 4.5 3.9 2.2.9 2.7.7 3.2.7.5-.1 1.6-.7 1.8-1.3.2-.6.2-1.2.2-1.3-.1-.1-.2-.2-.5-.3l-1.8-.9c-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.1-.2 0-.4.1-.5l.5-.6c.2-.2.2-.3.3-.5.1-.2 0-.4 0-.5L10 8.2c-.2-.4-.4-.4-.6-.4h-.5Z" />
        </svg>
      </button>

      <div ref={zonaCorreo} className="relative">
        <button
          type="button"
          onClick={() => setMenuCorreo((v) => !v)}
          aria-label="Compartir por correo"
          aria-expanded={menuCorreo}
          title="Correo"
          className={boton}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
            <rect x="3" y="5.5" width="18" height="13" rx="2" />
            <path d="m4 7 8 6 8-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {menuCorreo && (
          <div className="glass absolute bottom-full left-1/2 z-30 mb-2 w-44 -translate-x-1/2 overflow-hidden p-1">
            {(
              [
                { via: "gmail", texto: "Gmail" },
                { via: "outlook", texto: "Outlook" },
                { via: "app", texto: "App de correo" },
              ] as const
            ).map((o) => (
              <button
                key={o.via}
                type="button"
                onClick={() => porCorreo(o.via)}
                className="block w-full cursor-pointer rounded-lg px-3 py-2 text-left text-[12.5px] text-white transition-colors hover:bg-white/10"
              >
                {o.texto}
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={copiarLink}
        aria-label="Copiar link"
        title="Copiar link"
        className={`${boton} relative ${copiado ? "border-mint/70 text-mint" : ""}`}
      >
        {copiado ? (
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="m5 12.5 4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
            <path d="M10.5 13.5a4 4 0 0 0 5.7 0l3-3a4 4 0 1 0-5.7-5.6l-1.2 1.2" strokeLinecap="round" />
            <path d="M13.5 10.5a4 4 0 0 0-5.7 0l-3 3a4 4 0 1 0 5.7 5.6l1.2-1.2" strokeLinecap="round" />
          </svg>
        )}
        {copiado && (
          <span className="label-tech absolute -top-7 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-2.5 py-1 text-[8px] whitespace-nowrap text-mint">
            ¡Link copiado!
          </span>
        )}
      </button>
    </div>
  );
}
