-- Swish Basket – gemensam topplista
-- Kör hela filen i Supabase: SQL Editor → New query → klistra in → Run.
-- Går att köra igen när filen uppdateras – inga resultat försvinner.

-- ---------- tabellen ----------
create table if not exists public.scores (
  id         bigint generated always as identity primary key,
  name       text        not null,
  score      int         not null,
  level      int         not null,
  makes      int         not null,
  opp        int         not null,
  coop       boolean     not null default false,
  created_at timestamptz not null default now(),
  -- rimlighetskontroller: max 16 poäng per korg (5p + swish + luftskott, gånger två),
  -- bollens nivå går upp ett steg per korg, 1–5 motståndare
  constraint name_ok  check (name ~ '^[A-Za-z0-9ÅÄÖåäöÉéÜüØøÆæ _.!-]{1,16}$'),
  constraint makes_ok check (makes between 0 and 60),
  constraint score_ok check (score between 0 and makes * 16),
  constraint level_ok check (level between 0 and least(makes, 10)),
  constraint opp_ok   check (opp between 1 and 5)
);

create index if not exists scores_top_idx on public.scores (score desc, level desc, id);

-- Alla får läsa topplistan – inget annat. Supabase ger som standard anonyma besökare fler
-- rättigheter på nya tabeller (bl.a. TRUNCATE som radreglerna inte styr), så vi tar bort allt
-- och ger bara tillbaka läsning. Nya resultat kommer bara in via submit_score nedan.
alter table public.scores enable row level security;
revoke all on table public.scores from anon, authenticated;
grant select on table public.scores to anon, authenticated;
drop policy if exists "alla kan läsa topplistan" on public.scores;
create policy "alla kan läsa topplistan" on public.scores for select to anon, authenticated using (true);

-- ---------- privat schema för spärrar (syns inte i webb-API:t) ----------
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- slumpat salt så att IP-adresser aldrig sparas i klartext
create table if not exists private.settings (
  id   int primary key default 1 check (id = 1),
  salt text not null default md5(random()::text || clock_timestamp()::text)
);
insert into private.settings (id) values (1) on conflict (id) do nothing;

-- senaste inskicken, för att kunna spärra spam (rensas efter en timme)
create table if not exists private.submit_log (
  bucket text        not null,
  at     timestamptz not null default now()
);
create index if not exists submit_log_idx on private.submit_log (bucket, at);
revoke all on all tables in schema private from public, anon, authenticated;

-- ---------- spara ett resultat ----------
-- Spelet sparar bara via den här funktionen. Den kontrollerar namnet, och begränsar till
-- 5 resultat per minut och 30 per timme per avsändare, samt 60 per minut totalt.
-- Svarar med resultatets id och placering.
create or replace function public.submit_score(
  p_name text, p_score int, p_level int, p_makes int, p_opp int, p_coop boolean
) returns table (id bigint, rank bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id  bigint;
  hdrs    json;
  ip      text;
  bkt     text;
  clean   text := pg_catalog.btrim(p_name);
  letters text := pg_catalog.regexp_replace(pg_catalog.lower(coalesce(p_name, '')), '[^a-zåäö]', '', 'g');
begin
  -- olämpliga namn (samma lista som i spelet, kontrolleras här så den inte går att kringgå)
  if exists (select 1 from pg_catalog.unnest(array['fitta','kuk','hora','jävla','javla','neger','nigger','fuck','shit',
               'bitch','cunt','dick','hitler','nazi','porr','porn']) w where pg_catalog.strpos(letters, w) > 0)
     or letters = 'cp' then
    raise exception 'Välj ett annat namn';
  end if;

  -- avsändare: IP-adressen från Supabase/Cloudflare, sparas bara som saltad hash
  hdrs := coalesce(nullif(pg_catalog.current_setting('request.headers', true), ''), '{}')::json;
  ip := coalesce(hdrs->>'cf-connecting-ip', pg_catalog.split_part(hdrs->>'x-forwarded-for', ',', 1), hdrs->>'x-real-ip', 'okänd');
  select pg_catalog.md5(pg_catalog.btrim(ip) || s.salt) into bkt from private.settings s where s.id = 1;

  delete from private.submit_log l where l.at < pg_catalog.now() - interval '1 hour';
  if (select count(*) from private.submit_log l where l.bucket = bkt and l.at > pg_catalog.now() - interval '1 minute') >= 5
     or (select count(*) from private.submit_log l where l.bucket = bkt) >= 30 then
    raise exception 'Du har sparat många resultat på kort tid – vänta en stund';
  end if;
  if (select count(*) from private.submit_log l where l.at > pg_catalog.now() - interval '1 minute') >= 60 then
    raise exception 'För många resultat just nu, försök igen om en stund';
  end if;
  insert into private.submit_log (bucket) values (bkt);

  insert into public.scores as sc (name, score, level, makes, opp, coop)
  values (clean, p_score, p_level, p_makes, p_opp, p_coop)
  returning sc.id into new_id;

  return query
    select new_id, (select count(*) + 1 from public.scores s where s.score > p_score);
end;
$$;

revoke all on function public.submit_score(text, int, int, int, int, boolean) from public, anon, authenticated;
grant execute on function public.submit_score(text, int, int, int, int, boolean) to anon, authenticated;
