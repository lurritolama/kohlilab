-- Ventilkappen-Sujets aus der Datenbank statt aus dem Repo (2026-08-07).
--
-- Bisher war jedes neue Sujet ein Git-Push + Netlify-Build (sujets.json im
-- Repo). Neu liest kohlilab.ch/ventilkappen diese Tabelle serverseitig;
-- fabrik.py push schreibt Zeile + Bild (Storage-Bucket 'sujets', public).
-- Ein neues Sujet ist damit in Sekunden live — ohne Build.
--
-- Shop-generisch nach Multi-Shop-Muster (shop-Spalte), idempotent.

create table if not exists public.sujets (
  id            uuid primary key default gen_random_uuid(),
  shop          text not null default 'kohlilab' references public.shops(shop),
  slug          text not null,
  name          text not null,
  beschreibung  text not null default '',
  preis_rappen  integer not null default 1200,
  neu           boolean not null default true,
  aktiv         boolean not null default true,
  bild_url      text not null,
  bild_typ      text not null default 'render',   -- 'foto' | 'render'
  sort          integer not null default 0,        -- hoch = weiter vorne
  created_at    timestamptz not null default now(),
  unique (shop, slug)
);

alter table public.sujets enable row level security;

-- Oeffentlich lesbar sind nur aktive Sujets; schreiben darf nur der
-- Service-Key (fabrik.py push / Admin) — keine Insert/Update-Policies.
drop policy if exists sujets_oeffentlich_lesbar on public.sujets;
create policy sujets_oeffentlich_lesbar
  on public.sujets for select
  to anon, authenticated
  using (aktiv);
