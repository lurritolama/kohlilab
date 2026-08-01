-- =========================================================================
-- KohliLab in die gemeinsame Multi-Shop-Supabase aufnehmen (shop='kohlilab').
--
-- Voraussetzung: 20260728_multishop.sql (Tabelle `shops`, shop-Spalten,
-- shop-aware create_order/next_order_number) und der Storage-Bucket
-- `konfigurator` (privat) existieren bereits (von TeeLab).
--
-- create_order / next_order_number / reserve_stock / release_stock sind
-- shop-generisch — NICHT neu anlegen. Nötig ist nur: shops-Zeile (Präfix KL),
-- eigene Kategorie + Anker-Produkte für die zwei Konfiguratoren.
--
-- Idempotent (on conflict do nothing). Im Supabase-SQL-Editor der
-- gemeinsamen DB ausführen.
-- =========================================================================

-- 1) Shop registrieren — eindeutiger Präfix KL (Bestellnummern KL-2026-0001).
insert into shops (shop, name, order_prefix) values
  ('kohlilab', 'KohliLab', 'KL')
on conflict (shop) do nothing;

-- 2) Kategorie für die Konfiguratoren.
insert into categories (id, slug, name, sort_order, shop) values
  ('c0111ab0-0000-4000-8000-0000000000c0', 'konfiguratoren', 'Konfiguratoren', 1, 'kohlilab')
on conflict (id) do nothing;

-- 3) Anker-Produkte je Konfigurator. Preis wird pro Bestellung SERVERSEITIG
--    berechnet (aus dem 3MF-Gewicht); price_rappen hier ist nur ein Nominalwert.
--    track_stock=false -> on demand, nie "ausverkauft".
insert into products (id, slug, title, category_id, price_rappen, status, shop, track_stock, is_unique, stock) values
  ('c0111ab0-0000-4000-8000-000000000001', 'konfigurator-qr-schild',  'QR-Schild (Konfigurator)',            'c0111ab0-0000-4000-8000-0000000000c0', 1200, 'active', 'kohlilab', false, false, 0),
  ('c0111ab0-0000-4000-8000-000000000002', 'konfigurator-organizer',  'Schubladen-Organizer (Konfigurator)', 'c0111ab0-0000-4000-8000-0000000000c0', 1500, 'active', 'kohlilab', false, false, 0)
on conflict (id) do nothing;

-- orders.konfiguration (jsonb) und der Bucket `konfigurator` existieren bereits
-- (gemeinsam mit TeeLab) — hier bewusst nichts anzulegen.
