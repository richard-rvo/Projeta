-- Garante que instalações antigas também tenham onde persistir as fotos.
-- A coluna é JSONB porque as imagens são comprimidas no navegador antes do
-- salvamento e chegam como data URLs no registro da anomalia.

alter table public.anomalies
  add column if not exists photos jsonb;

update public.anomalies
   set photos = '[]'::jsonb
 where photos is null;

alter table public.anomalies
  alter column photos set default '[]'::jsonb,
  alter column photos set not null;
