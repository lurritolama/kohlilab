-- Golf-Tees (Konfigurator aus TeeLab uebernommen, 19.08.2026): Anker-Produkt
-- fuer den KohliLab-Checkout. teelab.ch laeuft parallel mit eigenem Anker
-- (7ee1ab00-...-ff); hier ein eigener fuer shop='kohlilab', damit die
-- Bestellungen im Munsby-Admin unter KohliLab erscheinen.
-- Preis je Bestellung serverseitig (src/lib/preis.ts teeStueckRappen);
-- price_rappen ist ein Nominalwert. Manolo spielt die Datei im SQL-Editor ein.
insert into products (id, slug, title, category_id, price_rappen, status, shop, track_stock, is_unique, stock) values
  ('c0111ab0-0000-4000-8000-000000000006', 'konfigurator-golf-tee', 'Golf-Tee (Konfigurator)', 'c0111ab0-0000-4000-8000-0000000000c0', 140, 'active', 'kohlilab', false, false, 0)
on conflict (id) do nothing;
