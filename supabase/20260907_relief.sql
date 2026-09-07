-- Relief-Konfigurator (07.09.2026): Anker-Produkt fuer den KohliLab-
-- Checkout (shop='kohlilab'), damit die Bestellungen im Munsby-Admin unter
-- KohliLab erscheinen. Preis je Bestellung serverseitig
-- (src/lib/preis.ts reliefPreisRappen); price_rappen ist ein Nominalwert.
-- Manolo spielt die Datei im SQL-Editor ein.
insert into products (id, slug, title, category_id, price_rappen, status, shop, track_stock, is_unique, stock) values
  ('c0111ab0-0000-4000-8000-000000000009', 'konfigurator-relief', 'Relief (Konfigurator)', 'c0111ab0-0000-4000-8000-0000000000c0', 3900, 'active', 'kohlilab', false, false, 0)
on conflict (id) do nothing;
