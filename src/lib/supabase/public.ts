import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "./env";

/**
 * Cliente para leer el contenido público: rol `anon`, sin sesión y sin cookies.
 *
 * Importa que no lea `cookies()`: en cuanto una página toca esa API, Next la
 * trata como dinámica y la renderiza —con su consulta a la base— en cada
 * visita. Sin cookies, la página puede cachearse y regenerarse cada tanto
 * (ISR), y la mayoría de las visitas se sirven sin tocar Supabase.
 *
 * La lectura pública no necesita sesión: las políticas de RLS ya dejan ver a
 * `anon` solo lo publicado. El backoffice sigue usando `server.ts`, que sí
 * lleva la sesión de quien administra.
 */
export function createPublicClient() {
  if (!isSupabaseConfigured()) return null;

  return createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
