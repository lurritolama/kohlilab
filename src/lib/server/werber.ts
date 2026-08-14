/**
 * Werber-Liste (Empfehlungs-Kuerzel) aus dem PRIVATEN Storage-Bucket `intern`.
 *
 * Gepflegt mit werkzeug/werber.py — neuer Werber, Satzaenderung oder neuer
 * Zugangsschluessel gehen ohne Deploy live. Der Bucket ist privat, weil die
 * Tokens der Werber-Ansicht (/werber?k=...) drinstehen; lesen kann ihn nur
 * der Service-Key.
 *
 * Provisionsmodell (Manolo 13.08.2026): Gewinn = gewinnAnteil vom Warenwert
 * ohne Versand, Provision = satz vom Gewinn. Standard 10 % von 10 % = 1 %
 * vom Warenwert. Verguetet werden nur bezahlte Bestellungen.
 */
import { supabaseAdmin } from './supabase-admin';

export interface Werber {
  kuerzel: string;
  name: string;
  /** Satz je Positionstyp, Anteil am Gewinn. 'standard' greift fuer alles,
   *  was nicht eigens genannt ist. Seit 14.08.2026 haengt der Satz am
   *  PRODUKT (Manolo): Ventilkappen 30 %, alles andere 15 %. */
  saetze: Record<string, number>;
  token: string;
  aktiv: boolean;
  seit?: string;
}

export interface WerberDaten {
  gewinnAnteil: number;  // Gewinn als Anteil am Warenwert, z. B. 0.10
  werber: Werber[];
}

/** Positionstyp -> Satz. Faellt auf 'standard' zurueck. */
export function satzFuer(w: Werber, typ: string | undefined): number {
  return w.saetze[typ ?? ''] ?? w.saetze.standard ?? 0.15;
}

/**
 * Provision einer Bestellung. Gerechnet wird je POSITION, weil ein
 * Warenkorb gemischt sein kann (Ventilkappen 30 %, Organizer 15 %).
 * Ohne Positionsdaten (z. B. Bestellungen der anderen Shops) zaehlt der
 * ganze Warenwert zum Standardsatz.
 */
export function provisionRappen(
  w: Werber, gewinnAnteil: number,
  subtotalRappen: number, konfiguration: unknown,
): number {
  const pos = (konfiguration as { positionen?: { typ?: string; preisRappen?: number }[] } | null)?.positionen;
  if (!Array.isArray(pos) || pos.length === 0) {
    return Math.round(subtotalRappen * gewinnAnteil * satzFuer(w, undefined));
  }
  return pos.reduce(
    (s, p) => s + Math.round((Number(p.preisRappen) || 0) * gewinnAnteil * satzFuer(w, p.typ)),
    0,
  );
}

export async function ladeWerber(): Promise<WerberDaten | null> {
  try {
    const db = supabaseAdmin();
    const { data, error } = await db.storage.from('intern').download('werber.json');
    if (error || !data) return null;
    const roh = JSON.parse(await data.text());
    return {
      gewinnAnteil: Number(roh.gewinn_anteil) || 0.1,
      werber: (roh.werber ?? []).map((w: Record<string, unknown>) => ({
        kuerzel: String(w.kuerzel),
        name: String(w.name ?? w.kuerzel),
        // Altbestand kannte einen einzigen `satz` — der gilt dann fuer alles.
        saetze: (w.saetze as Record<string, number>) ?? { standard: Number(w.satz) || 0.15 },
        token: String(w.token),
        aktiv: w.aktiv !== false,
        seit: w.seit ? String(w.seit) : undefined,
      })),
    };
  } catch (e) {
    console.error('[werber] Liste nicht lesbar:', e);
    return null;
  }
}

/** Bezahlt heisst: Geld ist da oder die Ware ist schon unterwegs/abgeholt. */
export const BEZAHLT_STATUS = ['paid', 'packed', 'shipped'];
