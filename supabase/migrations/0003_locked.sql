/* ------------------------------------------------------------------ */
/* "Próximamente"                                                      */
/* ------------------------------------------------------------------ */

-- Un contenido bloqueado se muestra en blanco y negro con la leyenda
-- "Próximamente" y no se puede abrir: sirve para anticipar lo que viene.
--
-- Esta columna se había agregado a mano en el primer proyecto de Supabase y
-- nunca llegó a una migración. Sin ella, cualquier proyecto nuevo rechaza con
-- un 400 la consulta de contenidos —el código pide `locked`— y el sitio cae al
-- contenido de demostración sin que se note.
alter table contents add column if not exists locked boolean not null default false;
