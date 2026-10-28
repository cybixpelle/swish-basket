-- Swish Basket – gemensam topplista
-- Kör hela filen en gång i Supabase: SQL Editor → New query → klistra in → Run.
-- Går att köra igen utan att något försvinner.

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

-- Alla får läsa topplistan. Ingen får skriva direkt i tabellen, bara via funktionen nedan.
alter table public.scores enable row level security;
drop policy if exists "alla kan läsa topplistan" on public.scores;
create policy "alla kan läsa topplistan" on public.scores for select to anon, authenticated using (true);
revoke insert, update, delete on public.scores from anon, authenticated;

-- Spelet sparar resultat genom den här funktionen. Den tar emot högst 20 resultat per minut totalt,
-- så att ingen kan översvämma listan, och svarar med resultatets id och placering.
create or replace function public.submit_score(
  p_name text, p_score int, p_level int, p_makes int, p_opp int, p_coop boolean
) returns table (id bigint, rank bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id bigint;
begin
  if (select count(*) from scores s where s.created_at > now() - interval '1 minute') >= 20 then
    raise exception 'För många resultat just nu, försök igen om en stund';
  end if;
  insert into scores (name, score, level, makes, opp, coop)
  values (btrim(p_name), p_score, p_level, p_makes, p_opp, p_coop)
  returning scores.id into new_id;
  return query
    select new_id, (select count(*) + 1 from scores s where s.score > p_score);
end;
$$;

revoke all on function public.submit_score(text, int, int, int, int, boolean) from public;
grant execute on function public.submit_score(text, int, int, int, int, boolean) to anon, authenticated;
