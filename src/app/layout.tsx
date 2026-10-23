import type { Metadata, Viewport } from "next";
import { Montserrat } from "next/font/google";
import Tracker from "@/components/analytics/Tracker";
import "./globals.css";

/**
 * Montserrat en toda la página, en tres pesos: Light para los titulares
 * grandes, Regular para el texto corrido y Bold para lo que tiene que pesar.
 * Las versalitas técnicas también son Montserrat: lo que les da el aire de
 * instrumento es el tracking amplio, no el monoespaciado.
 */
const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["300", "400", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Programa Duplicar Norte — Auca Mahuida · Allen",
    template: "%s — Programa Duplicar Norte",
  },
  description:
    "Archivo audiovisual del Programa Duplicar Norte, la ampliación del oleoducto de Oldelval entre Auca Mahuida y Allen.",
};

export const viewport: Viewport = {
  themeColor: "#03060d",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-AR" className={`${montserrat.variable} h-full`}>
      <body className="min-h-full antialiased">
        {children}
        <Tracker />
      </body>
    </html>
  );
}
