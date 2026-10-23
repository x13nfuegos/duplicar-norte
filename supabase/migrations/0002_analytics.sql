/* ------------------------------------------------------------------ */
/* Analítica propia                                                    */
/* ------------------------------------------------------------------ */

-- Una fila por cosa que pasa en el sitio: una vista de página, un tramo de
-- tiempo activo o una acción puntual (play, compartir, abrir un punto del
-- mapa). El tracker del sitio escribe acá a través de /api/track, que usa la
-- clave pública: no hay service-role en la app.
--
-- No se guarda la IP ni se usan cookies. `visitor_id` y `session_id` son
-- códigos aleatorios que genera el navegador; sirven para contar personas y
-- visitas, no para identificarlas. El país y la ciudad los resuelve el
-- servidor a partir de los headers de la plataforma (Vercel); donde esos
-- headers no existan, quedan en null.
create table analytics_events (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  visitor_id  text not null check (char_length(visitor_id) between 8 and 64),
  session_id  text not null check (char_length(session_id) between 8 and 64),
  type        text not null check (type in ('pageview', 'engagement', 'event')),
  name        text check (char_length(name) <= 60),
  path        text not null check (char_length(path) <= 300),
  referrer    text check (char_length(referrer) <= 120),
  device      text check (device in ('mobile', 'tablet', 'desktop')),
  browser     text check (char_length(browser) <= 40),
  country     text check (char_length(country) <= 8),
  city        text check (char_length(city) <= 80),
  -- Solo en `engagement`: ms de tiempo activo desde el envío anterior.
  duration_ms integer check (duration_ms between 0 and 3600000),
  props       jsonb not null default '{}'::jsonb check (pg_column_size(props) <= 2048)
);

create index analytics_events_created_idx on analytics_events (created_at desc);
create index analytics_events_session_idx on analytics_events (session_id);
create index analytics_events_type_created_idx on analytics_events (type, created_at desc);

alter table analytics_events enable row level security;

-- Cualquiera puede registrar un evento (es lo que hace el tracker), pero nadie
-- puede leer: solo los administradores habilitados.
grant insert on analytics_events to anon, authenticated;
grant select on analytics_events to authenticated;

create policy "el sitio registra eventos"
  on analytics_events for insert
  to anon, authenticated
  with check (true);

create policy "solo administradores leen la analítica"
  on analytics_events for select
  to authenticated
  using ((select private.es_admin()));

/* ------------------------------------------------------------------ */
/* Resumen para el dashboard                                           */
/* ------------------------------------------------------------------ */

-- SECURITY INVOKER a propósito: la función corre con los permisos de quien la
-- llama, así que RLS decide. Un usuario no habilitado recibe todo en cero.
-- Los días se cortan en hora de Buenos Aires.
create or replace function public.analytics_resumen(dias int default 30)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with p as (
    select greatest(1, least(coalesce(dias, 30), 365)) as d,
           'America/Argentina/Buenos_Aires'::text as tz
  ),
  inicio as (
    select (date_trunc('day', now() at time zone p.tz) - make_interval(days => p.d - 1))
             at time zone p.tz as ts
    from p
  ),
  ev as (
    select e.* from public.analytics_events e, inicio i where e.created_at >= i.ts
  ),
  vistas as (select * from ev where type = 'pageview'),
  sesiones as (
    select
      session_id,
      count(*) filter (where type = 'pageview') as paginas,
      count(*) filter (where type = 'event') as acciones,
      coalesce(sum(duration_ms) filter (where type = 'engagement'), 0) as activo_ms,
      (array_agg(device) filter (where device is not null))[1] as device,
      (array_agg(country) filter (where country is not null))[1] as country,
      (array_agg(city) filter (where city is not null))[1] as city,
      (array_agg(referrer order by created_at) filter (where type = 'pageview'))[1] as referrer,
      (array_agg(path order by created_at) filter (where type = 'pageview'))[1] as entrada,
      -- Reproducir un video también es haber abierto un contenido (en /serie se
      -- reproduce sin cambiar de página), así el paso 3 nunca supera al 2.
      coalesce(bool_or(type = 'pageview' and (path like '/contenido/%' or path like '/serie/%'))
               or bool_or(type = 'event' and name = 'video_play'), false) as vio_contenido,
      coalesce(bool_or(type = 'event' and name = 'video_play'), false) as vio_video,
      coalesce(bool_or(type = 'event' and name = 'share'), false) as compartio
    from ev
    group by session_id
  )
  select jsonb_build_object(
    'dias', (select d from p),
    'kpis', jsonb_build_object(
      'visitas',       (select count(*) from vistas),
      'sesiones',      (select count(*) from sesiones),
      'visitantes',    (select count(distinct visitor_id) from ev),
      'acciones',      (select count(*) from ev where type = 'event'),
      'tiempo_activo_s', (select coalesce(round(avg(activo_ms) / 1000.0), 0) from sesiones where activo_ms > 0),
      'paginas_por_sesion', (select coalesce(round(avg(paginas)::numeric, 1), 0) from sesiones where paginas > 0),
      'rebote_pct',    (select coalesce(round(100.0 * count(*) filter (where paginas = 1 and acciones = 0) / nullif(count(*) filter (where paginas > 0), 0)), 0) from sesiones)
    ),
    'por_dia', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'dia', to_char(g.dia, 'YYYY-MM-DD'),
          'visitas', coalesce(v.visitas, 0),
          'visitantes', coalesce(v.visitantes, 0)
        ) order by g.dia), '[]'::jsonb)
      from (
        select generate_series(
          date_trunc('day', now() at time zone p.tz) - make_interval(days => p.d - 1),
          date_trunc('day', now() at time zone p.tz),
          interval '1 day'
        ) as dia
        from p
      ) g
      left join (
        select date_trunc('day', vi.created_at at time zone p.tz) as dia,
               count(*) as visitas,
               count(distinct vi.visitor_id) as visitantes
        from vistas vi, p
        group by 1
      ) v on v.dia = g.dia
    ),
    'dispositivos', (
      select coalesce(jsonb_agg(jsonb_build_object('k', k, 'n', n) order by n desc), '[]'::jsonb)
      from (select device as k, count(*) as n from sesiones where device is not null group by device) q
    ),
    'paises', (
      select coalesce(jsonb_agg(jsonb_build_object('k', k, 'n', n) order by n desc), '[]'::jsonb)
      from (select country as k, count(*) as n from sesiones where country is not null
            group by country order by n desc limit 10) q
    ),
    'ciudades', (
      select coalesce(jsonb_agg(jsonb_build_object('k', k, 'pais', pais, 'n', n) order by n desc), '[]'::jsonb)
      from (select city as k, max(country) as pais, count(*) as n from sesiones where city is not null
            group by city order by n desc limit 10) q
    ),
    'entradas', (
      select coalesce(jsonb_agg(jsonb_build_object('k', k, 'n', n) order by n desc), '[]'::jsonb)
      from (select entrada as k, count(*) as n from sesiones where entrada is not null
            group by entrada order by n desc limit 8) q
    ),
    'origenes', (
      select coalesce(jsonb_agg(jsonb_build_object('k', k, 'n', n) order by n desc), '[]'::jsonb)
      from (select coalesce(nullif(referrer, ''), 'Directo') as k, count(*) as n from sesiones
            where paginas > 0 group by 1 order by n desc limit 8) q
    ),
    'paginas', (
      select coalesce(jsonb_agg(jsonb_build_object('k', k, 'n', n, 'u', u) order by n desc), '[]'::jsonb)
      from (select path as k, count(*) as n, count(distinct visitor_id) as u from vistas
            group by path order by n desc limit 10) q
    ),
    'acciones', (
      select coalesce(jsonb_agg(jsonb_build_object('k', k, 'n', n, 's', s) order by n desc), '[]'::jsonb)
      from (select name as k, count(*) as n, count(distinct session_id) as s from ev
            where type = 'event' and name is not null group by name order by n desc limit 12) q
    ),
    'contenidos', (
      select coalesce(jsonb_agg(jsonb_build_object('k', k, 'n', n) order by n desc), '[]'::jsonb)
      from (select props ->> 'slug' as k, count(*) as n from ev
            where type = 'event' and name = 'video_play' and props ->> 'slug' is not null
            group by 1 order by n desc limit 8) q
    ),
    'embudo', jsonb_build_array(
      jsonb_build_object('k', 'Ingresaron al sitio',     'n', (select count(*) from sesiones)),
      jsonb_build_object('k', 'Abrieron un contenido',   'n', (select count(*) from sesiones where vio_contenido)),
      jsonb_build_object('k', 'Reprodujeron un video',   'n', (select count(*) from sesiones where vio_video)),
      jsonb_build_object('k', 'Compartieron',            'n', (select count(*) from sesiones where compartio))
    )
  );
$$;

revoke execute on function public.analytics_resumen(int) from public, anon;
grant execute on function public.analytics_resumen(int) to authenticated;
