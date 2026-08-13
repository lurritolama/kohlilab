/**
 * Foto-Galerie der Konfigurator-Seiten — Fotos gedruckter Teile, die ohne
 * Deploy dazukommen (werkzeug/galerie.py laedt hoch, die Seite liest hier).
 *
 * Bewusst KEINE Tabelle wie bei den Sujets: fuer neue Tabellen braucht es den
 * SQL-Editor (Manolo, von Hand). Die Galerie kommt mit dem Storage allein
 * aus — ein oeffentlicher Bucket `galerie` mit einer Manifest-Datei je
 * Bereich (galerie/<bereich>/liste.json). Schreiben kann nur der Service-Key.
 *
 * Fehlerfall (Manifest fehlt, Supabase nicht erreichbar): leere Liste — die
 * Seite laesst den Galerie-Knopf dann einfach weg, statt zu brechen.
 */

export interface GalerieFoto {
  url: string;
  text: string;
}

export async function ladeGalerie(bereich: string): Promise<GalerieFoto[]> {
  const basis = import.meta.env.PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
  if (!basis) return [];
  const wurzel = `${basis}/storage/v1/object/public/galerie/${bereich}`;
  try {
    // no-store: das Manifest aendert sich, wenn Manolo ein Foto hochlaedt —
    // genau dann soll der naechste Seitenaufruf es sehen.
    const antwort = await fetch(`${wurzel}/liste.json`, { cache: 'no-store' });
    if (!antwort.ok) return [];
    const liste = (await antwort.json()) as { datei: string; text?: string; sort?: number }[];
    return liste
      .sort((a, b) => (b.sort ?? 0) - (a.sort ?? 0))
      .map((e) => ({ url: `${wurzel}/${e.datei}`, text: e.text ?? '' }));
  } catch (e) {
    console.error('[galerie]', bereich, e);
    return [];
  }
}
