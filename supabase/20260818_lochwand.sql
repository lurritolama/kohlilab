-- Lochwand-Planer (Skådis-Module): Anker-Produkt für den Checkout.
-- Wie bei QR-Schild/Organizer wird der Preis je Bestellung SERVERSEITIG aus
-- dem gemessenen 3MF-Gewicht gerechnet (src/lib/preis.ts lochwandPreisRappen);
-- price_rappen ist ein Nominalwert. track_stock=false -> on demand.
-- Manolo spielt diese Datei im Supabase-SQL-Editor ein (wie 20260814 offerten).
insert into products (id, slug, title, category_id, price_rappen, status, shop, track_stock, is_unique, stock) values
  ('c0111ab0-0000-4000-8000-000000000005', 'konfigurator-lochwand', 'Lochwand-Module für Skådis (Konfigurator)', 'c0111ab0-0000-4000-8000-0000000000c0', 1200, 'active', 'kohlilab', false, false, 0)
on conflict (id) do nothing;
