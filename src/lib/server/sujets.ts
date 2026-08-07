/**
 * Ventilkappen-Sujets aus der gemeinsamen Supabase (Tabelle `sujets`,
 * shop='kohlilab') — damit ein neues Sujet OHNE Git-Push und Netlify-Build
 * live geht. `fabrik.py push` schreibt Zeile + Bild (Storage-Bucket 'sujets').
 *
 * Fallback: das eingebettete sujets.json (Stand des letzten Deploys). Greift,
 * wenn die DB nicht erreichbar ist oder die Tabelle noch fehlt — die Seite
 * bleibt so in jedem Fall lieferbar.
 */
import { supabaseAdmin } from './supabase-admin';
import sujetsStatisch from '../../data/sujets.json';

export interface Sujet {
  slug: string;
  name: string;
  beschreibung: string;
  preisRappen: number;
  neu?: boolean;
  bild: string;
  bildTyp?: string;
}

export async function ladeSujets(): Promise<Sujet[]> {
  try {
    const db = supabaseAdmin();
    const { data, error } = await db
      .from('sujets')
      .select('slug,name,beschreibung,preis_rappen,neu,bild_url,bild_typ,sort,created_at')
      .eq('shop', 'kohlilab')
      .eq('aktiv', true)
      .order('sort', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    if (data && data.length > 0) {
      return data.map((r) => ({
        slug: r.slug,
        name: r.name,
        beschreibung: r.beschreibung,
        preisRappen: r.preis_rappen,
        neu: !!r.neu,
        bild: r.bild_url,
        bildTyp: r.bild_typ,
      }));
    }
  } catch (e) {
    console.error('[sujets] DB nicht erreichbar — Fallback auf eingebettetes sujets.json:', e);
  }
  return sujetsStatisch as Sujet[];
}
