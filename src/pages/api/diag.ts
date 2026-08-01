export const prerender = false;
import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../lib/server/supabase-admin';

// TEMPORÄR: testet die echte Supabase-Verbindung und gibt den Fehlertext zurück.
export const GET: APIRoute = async () => {
  const out: Record<string, any> = {};
  try {
    const db = supabaseAdmin();
    out.client = 'ok';
    const { data, error } = await db.from('shops').select('shop, order_prefix').eq('shop', 'kohlilab').maybeSingle();
    out.query = error ? { fehler: error.message, code: (error as any).code } : { data };
  } catch (e) {
    out.client = 'THROW';
    out.fehler = (e as Error).message;
    out.stack = String((e as Error).stack || '').split('\n').slice(0, 3);
  }
  return new Response(JSON.stringify(out, null, 1), { headers: { 'Content-Type': 'application/json' } });
};
