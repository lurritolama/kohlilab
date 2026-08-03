-- =========================================================================
-- Ventilkappen als bestellbares Katalog-Produkt (shop='kohlilab').
--
-- Anker-Produkt für den Ventilkappen-Bestellweg (typ='ventilkappe' in
-- /api/konfig-checkout). Fester 4er-Set-Preis (CHF 12.—); der Kunde wählt
-- Sujet + Gewinde (Schrader/Presta), gedruckt wird aus unserem freigegebenen
-- Sujet-Bestand — daher KEINE Kundendatei, track_stock=false (on demand).
--
-- Voraussetzung: 20260801_kohlilab.sql (shops-Zeile KL + Kategorie
-- 'konfiguratoren'). create_order etc. sind shop-generisch — nichts Neues.
-- Idempotent. Im SQL-Editor der gemeinsamen DB ausführen.
-- (Wurde am 2026-08-03 zusätzlich direkt per Service-Key eingespielt.)
-- =========================================================================

insert into products
  (id, slug, title, category_id, price_rappen, status, shop, track_stock, is_unique, stock)
values
  ('c0111ab0-0000-4000-8000-000000000003', 'ventilkappe-set', 'Ventilkappe 4er-Set',
   'c0111ab0-0000-4000-8000-0000000000c0', 1200, 'active', 'kohlilab', false, false, 0)
on conflict (id) do nothing;
