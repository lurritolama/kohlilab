-- Küchenschrank-Einsätze nach Mass (Grundkonfigurator, 14.09.2026):
-- Anker-Produkt für den KohliLab-Checkout (shop='kohlilab'). Preis je
-- Bestellung serverseitig aus dem gemessenen 3MF-Gewicht (src/lib/preis.ts
-- schrankPreisRappen); price_rappen ist ein Nominalwert. Manolo spielt die
-- Datei im Supabase-SQL-Editor ein.
insert into products (id, slug, title, category_id, price_rappen, status, shop, track_stock, is_unique, stock) values
  ('c0111ab0-0000-4000-8000-00000000000a', 'konfigurator-schrank', 'Küchenschrank-Einsatz nach Mass (Konfigurator)', 'c0111ab0-0000-4000-8000-0000000000c0', 1600, 'active', 'kohlilab', false, false, 0)
on conflict (id) do nothing;
