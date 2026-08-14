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
  satz: number;          // Anteil am Gewinn, z. B. 0.10
  token: string;
  aktiv: boolean;
  seit?: string;
}

export interface WerberDaten {
  gewinnAnteil: number;  // Gewinn als Anteil am Warenwert, z. B. 0.10
  werber: Werber[];
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
        satz: Number(w.satz) || 0.1,
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
