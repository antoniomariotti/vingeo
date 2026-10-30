-- Vingeo: schema multi-azienda
-- Ogni utente può avere più aziende; ogni azienda ha membri con un ruolo.
-- I dati dell'azienda (appezzamenti, trattamenti, …) stanno nella tabella "documenti"
-- come JSON per collezione, così il front-end resta semplice e i campi possono evolvere.

-- ---------------------------------------------------------------- aziende
create table if not exists public.aziende (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null check (length(nome) between 1 and 120),
  regione     text,                       -- es. 'abruzzo' (per bollettini e disciplinari)
  comune      text,
  lat         double precision,           -- punto meteo dell'azienda
  lon         double precision,
  creata_da   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  creata      timestamptz not null default now()
);

-- ---------------------------------------------------------------- membri
create table if not exists public.membri (
  azienda_id  uuid not null references public.aziende(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  ruolo       text not null check (ruolo in ('titolare','collaboratore','lettore')),
  aggiunto    timestamptz not null default now(),
  primary key (azienda_id, user_id)
);
create index if not exists membri_user_idx on public.membri(user_id);

-- ---------------------------------------------------------------- documenti
create table if not exists public.documenti (
  azienda_id     uuid not null references public.aziende(id) on delete cascade,
  col            text not null check (col ~ '^[A-Za-z][A-Za-z0-9_]{0,40}$'),
  id             text not null check (id ~ '^[A-Za-z0-9_.:@+~-]{1,200}$'),
  data           jsonb not null default '{}'::jsonb check (pg_column_size(data) < 900000),
  aggiornato     timestamptz not null default now(),
  aggiornato_da  uuid default auth.uid(),
  primary key (azienda_id, col, id)
);
create index if not exists documenti_agg_idx on public.documenti(azienda_id, aggiornato);

-- ---------------------------------------------------------------- inviti
create table if not exists public.inviti (
  codice      text primary key default replace(gen_random_uuid()::text, '-', ''),
  azienda_id  uuid not null references public.aziende(id) on delete cascade,
  ruolo       text not null default 'collaboratore' check (ruolo in ('collaboratore','lettore')),
  creato_da   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  creato      timestamptz not null default now(),
  scade       timestamptz not null default now() + interval '14 days',
  usato_da    uuid references auth.users(id) on delete set null,
  usato       timestamptz
);

-- ---------------------------------------------------------------- funzioni di supporto
-- livello del ruolo: lettore 1, collaboratore 2, titolare 3
create or replace function public.ruolo_in(az uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select case ruolo when 'titolare' then 3 when 'collaboratore' then 2 else 1 end
                   from public.membri where azienda_id = az and user_id = auth.uid()), 0)
$$;

-- chi crea un'azienda ne diventa titolare
create or replace function public.tg_azienda_titolare() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.membri(azienda_id, user_id, ruolo) values (new.id, new.creata_da, 'titolare')
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists azienda_titolare on public.aziende;
create trigger azienda_titolare after insert on public.aziende
  for each row execute function public.tg_azienda_titolare();

-- timestamp di aggiornamento
create or replace function public.tg_documenti_agg() returns trigger
language plpgsql as $$
begin
  new.aggiornato := now();
  new.aggiornato_da := auth.uid();
  return new;
end $$;
drop trigger if exists documenti_agg on public.documenti;
create trigger documenti_agg before insert or update on public.documenti
  for each row execute function public.tg_documenti_agg();

-- non si può togliere l'ultimo titolare
create or replace function public.tg_membri_ultimo_titolare() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'DELETE' and old.ruolo = 'titolare') or (tg_op = 'UPDATE' and old.ruolo = 'titolare' and new.ruolo <> 'titolare') then
    if not exists (select 1 from public.membri where azienda_id = old.azienda_id and ruolo = 'titolare' and user_id <> old.user_id)
       and exists (select 1 from public.aziende where id = old.azienda_id) then
      raise exception 'L''azienda deve avere almeno un titolare';
    end if;
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists membri_ultimo_titolare on public.membri;
create trigger membri_ultimo_titolare before update or delete on public.membri
  for each row execute function public.tg_membri_ultimo_titolare();

-- accettare un invito (l'invitato non è ancora membro, quindi serve security definer)
create or replace function public.accetta_invito(p_codice text) returns uuid
language plpgsql security definer set search_path = public as $$
declare inv public.inviti;
begin
  if auth.uid() is null then raise exception 'Accesso richiesto'; end if;
  select * into inv from public.inviti where codice = p_codice for update;
  if not found then raise exception 'Invito non valido'; end if;
  if inv.usato is not null then raise exception 'Invito già usato'; end if;
  if inv.scade < now() then raise exception 'Invito scaduto'; end if;
  insert into public.membri(azienda_id, user_id, ruolo) values (inv.azienda_id, auth.uid(), inv.ruolo)
  on conflict (azienda_id, user_id) do nothing;
  update public.inviti set usato = now(), usato_da = auth.uid() where codice = p_codice;
  return inv.azienda_id;
end $$;

-- elenco membri con email (solo per i membri dell'azienda)
create or replace function public.membri_azienda(az uuid)
returns table(user_id uuid, email text, ruolo text, aggiunto timestamptz)
language sql stable security definer set search_path = public, auth as $$
  select m.user_id, u.email::text, m.ruolo, m.aggiunto
  from public.membri m join auth.users u on u.id = m.user_id
  where m.azienda_id = az and public.ruolo_in(az) >= 1
  order by m.aggiunto
$$;

-- ---------------------------------------------------------------- sicurezza a livello di riga
alter table public.aziende    enable row level security;
alter table public.membri     enable row level security;
alter table public.documenti  enable row level security;
alter table public.inviti     enable row level security;

drop policy if exists aziende_sel on public.aziende;
create policy aziende_sel on public.aziende for select to authenticated using (public.ruolo_in(id) >= 1 or creata_da = auth.uid());
drop policy if exists aziende_ins on public.aziende;
create policy aziende_ins on public.aziende for insert to authenticated with check (creata_da = auth.uid());
drop policy if exists aziende_upd on public.aziende;
create policy aziende_upd on public.aziende for update to authenticated using (public.ruolo_in(id) = 3) with check (public.ruolo_in(id) = 3);
drop policy if exists aziende_del on public.aziende;
create policy aziende_del on public.aziende for delete to authenticated using (public.ruolo_in(id) = 3);

drop policy if exists membri_sel on public.membri;
create policy membri_sel on public.membri for select to authenticated using (public.ruolo_in(azienda_id) >= 1);
drop policy if exists membri_upd on public.membri;
create policy membri_upd on public.membri for update to authenticated using (public.ruolo_in(azienda_id) = 3) with check (public.ruolo_in(azienda_id) = 3);
drop policy if exists membri_del on public.membri;
create policy membri_del on public.membri for delete to authenticated using (public.ruolo_in(azienda_id) = 3 or user_id = auth.uid());

drop policy if exists documenti_sel on public.documenti;
create policy documenti_sel on public.documenti for select to authenticated using (public.ruolo_in(azienda_id) >= 1);
drop policy if exists documenti_ins on public.documenti;
create policy documenti_ins on public.documenti for insert to authenticated with check (public.ruolo_in(azienda_id) >= 2);
drop policy if exists documenti_upd on public.documenti;
create policy documenti_upd on public.documenti for update to authenticated using (public.ruolo_in(azienda_id) >= 2) with check (public.ruolo_in(azienda_id) >= 2);
drop policy if exists documenti_del on public.documenti;
create policy documenti_del on public.documenti for delete to authenticated using (public.ruolo_in(azienda_id) >= 2);

drop policy if exists inviti_sel on public.inviti;
create policy inviti_sel on public.inviti for select to authenticated using (public.ruolo_in(azienda_id) = 3);
drop policy if exists inviti_ins on public.inviti;
create policy inviti_ins on public.inviti for insert to authenticated with check (public.ruolo_in(azienda_id) = 3 and creato_da = auth.uid());
drop policy if exists inviti_del on public.inviti;
create policy inviti_del on public.inviti for delete to authenticated using (public.ruolo_in(azienda_id) = 3);


grant usage on schema public to authenticated;
grant select, insert, update, delete on public.aziende, public.membri, public.documenti, public.inviti to authenticated;
grant execute on function public.accetta_invito(text), public.membri_azienda(uuid), public.ruolo_in(uuid) to authenticated;
revoke all on function public.accetta_invito(text), public.membri_azienda(uuid) from anon, public;

-- ---------------------------------------------------------------- tempo reale e foto (solo su Supabase)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.documenti;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('foto', 'foto', false, 10485760, array['image/jpeg','image/png','image/webp'])
    on conflict (id) do nothing;

    -- percorso: <azienda_id>/<nome file>
    execute $p$drop policy if exists foto_sel on storage.objects$p$;
    execute $p$create policy foto_sel on storage.objects for select to authenticated
      using (bucket_id = 'foto' and public.ruolo_in(((storage.foldername(name))[1])::uuid) >= 1)$p$;
    execute $p$drop policy if exists foto_ins on storage.objects$p$;
    execute $p$create policy foto_ins on storage.objects for insert to authenticated
      with check (bucket_id = 'foto' and public.ruolo_in(((storage.foldername(name))[1])::uuid) >= 2)$p$;
    execute $p$drop policy if exists foto_del on storage.objects$p$;
    execute $p$create policy foto_del on storage.objects for delete to authenticated
      using (bucket_id = 'foto' and public.ruolo_in(((storage.foldername(name))[1])::uuid) >= 2)$p$;
  end if;
end $$;
