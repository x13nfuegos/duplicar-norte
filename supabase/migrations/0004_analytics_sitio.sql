/* ------------------------------------------------------------------ */
/* Analítica: de qué sitio viene cada evento                           */
/* ------------------------------------------------------------------ */

-- El mismo código corre en más de un sitio (el oficial, nuestro Vercel, un
-- servidor propio) y todos escriben en esta misma tabla. `host` guarda el
-- dominio en el que ocurrió el evento, para poder separarlos en el dashboard.
-- Los eventos anteriores a esta migración quedan con host nulo ("Sin dato").
alter table analytics_events
  add column if not exists host text check (char_length(host) <= 100);

create index if not exists analytics_events_host_idx on analytics_events (host, created_at desc);

-- La función gana un parámetro opcional `sitio`: sin él cuenta todo, con él solo
-- ese dominio. Se reemplaza la versión anterior en vez de sobrecargarla, porque
-- dos firmas con el mismo nombre vuelven ambigua la llamada desde PostgREST.
drop function if exists public.analytics_resumen(int);

create or replace function public.analytics_resumen(dias int default 30, sitio text default null)
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
  -- Todo el período, sin filtrar por sitio: de acá sale el desglose por sitio,
  -- que tiene que seguir mostrando todos aunque se esté mirando uno.
  ev_todo as (
    select e.* from public.analytics_events e, inicio i where e.created_at >= i.ts
  ),
  ev as (
    select * from ev_todo where sitio is null or host = sitio
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
      coalesce(bool_or(type = 'pageview' and (path like '/contenido/%' or path like '/serie/%'))
               or bool_or(type = 'event' and name = 'video_play'), false) as vio_contenido,
      coalesce(bool_or(type = 'event' and name = 'video_play'), false) as vio_video,
      coalesce(bool_or(type = 'event' and name = 'share'), false) as compartio
    from ev
    group by session_id
  )
  select jsonb_build_object(
    'dias', (select d from p),
    'sitio', sitio,
    'sitios', (
      select coalesce(jsonb_agg(jsonb_build_object('k', k, 'n', n) order by n desc), '[]'::jsonb)
      from (select coalesce(host, '') as k, count(distinct session_id) as n
            from ev_todo group by host) q
    ),
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

revoke execute on function public.analytics_resumen(int, text) from public, anon;
grant execute on function public.analytics_resumen(int, text) to authenticated;
